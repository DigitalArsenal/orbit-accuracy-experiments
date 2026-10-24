// SP3 -> GCRF reference states by the modules, the path of analysis/reference-states/scripts/fetch-reference-products.mjs
// (`referenceStates`): files/orbit-products `read_container`, IERS rows through data-source/eop-parser `parse_finals2000a`,
// analysis/reference-states `reference_states` with the satellite identities and the uncertainty basis as its node config. Here the
// provenance of each product (the URL it was really fetched from) is the caller's, which the converter's EDC-only SLR paths cannot give.
// Host side only: encoding, decoding, and the epoch bracket of the Earth-orientation rows; every frame and orbit computation is a module's.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as flatbuffers from 'flatbuffers';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';

const require = createRequire(import.meta.url);
const sdsRoot = path.dirname(require.resolve('spacedatastandards.org/package.json'));
process.env.SPACE_DATA_STANDARDS_ROOT ??= sdsRoot;
const load = (code) => import(pathToFileURL(path.join(sdsRoot, `lib/js/${code}/main.js`)));
const [NCD, EOP, OEM] = await Promise.all(['NCD', 'EOP', 'OEM'].map(load));
const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
const DAY = 86400000;
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function harness(modules, dir, config) {
  const wasmSource = fs.readFileSync(path.join(modules, dir, 'dist/isomorphic/module.wasm'));
  const manifest = JSON.parse(fs.readFileSync(path.join(modules, dir, 'plugin-manifest.json')));
  return createBrowserModuleHarness({ wasmSource, manifest, surface: 'direct', ...(config ? { hostOptions: { config } } : {}) });
}

const ncdFrame = (bytes) => { // [size-prefixed $NCD][container], as read_container takes it
  const b = new flatbuffers.Builder(1024);
  const sha = b.createString(sha256(bytes));
  NCD.NCD.startNCD(b);
  NCD.NCD.addSourceByteLength(b, BigInt(bytes.length));
  NCD.NCD.addSourceSha256(b, sha);
  NCD.NCD.finishSizePrefixedNCDBuffer(b, NCD.NCD.endNCD(b));
  return Buffer.concat([Buffer.from(b.asUint8Array()), bytes]);
};

/** The converter: EOP rows from a finals2000A file (observed rows as flagged in it), and the module harnesses. */
export async function openConverter(modules, { finalsFile }) {
  const { body } = await import(pathToFileURL(path.join(modules, 'data-source/eop-parser/tests/harness.mjs')).href);
  const parser = await harness(modules, 'data-source/eop-parser');
  const r = await parser.invoke({ methodId: 'parse_finals2000a', inputs: [body(fs.readFileSync(finalsFile))] });
  await parser.destroy();
  if (r.statusCode !== 0) throw new Error(`parse_finals2000a: ${r.errorMessage}`);
  const stream = Buffer.from(r.outputs.find((o) => o.portId === 'records').payload);
  const rows = [];
  for (let at = 0; at < stream.length;) {
    const n = stream.readUInt32LE(at);
    const bytes = stream.subarray(at, at + 4 + n);
    rows.push({ mjd: EOP.EOP.getRootAsEOP(new flatbuffers.ByteBuffer(new Uint8Array(bytes.subarray(4)))).MJD(), bytes });
    at += 4 + n;
  }
  const reader = await harness(modules, 'files/orbit-products');
  const earthOrientation = (startMs, stopMs) => {
    const lo = Math.floor(startMs / DAY) + 40587 - 1, hi = Math.ceil(stopMs / DAY) + 40587 + 1;
    const sel = rows.filter((row) => row.mjd >= lo && row.mjd <= hi);
    if (!sel.length || sel[0].mjd > lo + 1 || sel.at(-1).mjd < hi - 1) return null;
    return { portId: 'earth_orientation', payload: Buffer.concat(sel.map((row) => row.bytes)), typeRef: typeRef('EOP') };
  };
  return {
    lastEopMjd: rows.at(-1)?.mjd,
    /** sp3: Buffer of SP3 text; config: { product, source, statedSigmaM, statedSigmaBasis, satellites: { <SP3 id>: {norad, objectId, name} } }. Returns [{norad, bytes, start, stop, epochs}] or { error }. */
    async convert(sp3, config) {
      const read = await reader.invoke({ methodId: 'read_container', inputs: [{ portId: 'container', payload: ncdFrame(sp3), typeRef: typeRef('NCD') }] });
      if (read.statusCode !== 0) return { error: `read_container: ${read.errorMessage}` };
      const port = (id, code) => ({ portId: id, payload: Buffer.from(read.outputs.find((o) => o.portId === id).payload), typeRef: typeRef(code) });
      const ncd = NCD.NCD.getSizePrefixedRootAsNCD(new flatbuffers.ByteBuffer(new Uint8Array(port('descriptor', 'NCD').payload)));
      const eop = earthOrientation(Date.parse(`${ncd.START_TIME()?.slice(0, 19)}Z`), Date.parse(`${ncd.STOP_TIME()?.slice(0, 19)}Z`));
      if (!eop) return { error: `no observed EOP rows bracket ${ncd.START_TIME()} .. ${ncd.STOP_TIME()}` };
      const reference = await harness(modules, 'analysis/reference-states', config);
      const out = await reference.invoke({ methodId: 'reference_states', inputs: [port('ephemeris', 'OEM'), port('descriptor', 'NCD'), eop] });
      await reference.destroy();
      if (out.statusCode !== 0) return { error: `reference_states: ${out.errorMessage}` };
      return out.outputs.filter((o) => o.portId === 'reference').map((o) => {
        const bytes = Buffer.from(o.payload);
        const block = OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).EPHEMERIS_DATA_BLOCK(0);
        return { norad: block.OBJECT().NORAD_CAT_ID(), objectId: block.OBJECT().OBJECT_ID(), bytes, start: block.START_TIME(), stop: block.STOP_TIME(), epochs: block.ephemerisDataLinesLength(), comment: block.COMMENT() };
      });
    },
    async destroy() { await reader.destroy(); },
  };
}

/** Write the objects of one converted product like the converter does: <dir>/<key>/<norad>.oem and index.json. */
export function writeReference(dir, key, objects, provenance) {
  const out = path.join(dir, key);
  fs.mkdirSync(out, { recursive: true });
  for (const o of objects) fs.writeFileSync(path.join(out, `${o.norad}.oem`), o.bytes);
  fs.writeFileSync(path.join(out, 'index.json'), `${JSON.stringify({ ...provenance, objects: objects.map((o) => ({ norad: o.norad, objectId: o.objectId, start: o.start, stop: o.stop, epochs: o.epochs, file: `${o.norad}.oem`, comment: o.comment })) }, null, 1)}\n`);
}

/** SP3 epoch -> [x, y, z] km of the file's (first) satellite; zero positions (bad records) are skipped. */
export function sp3Positions(text) {
  const rows = new Map();
  let epoch = null;
  for (const l of text.split('\n')) {
    if (l.startsWith('* ')) epoch = l.slice(3, 31).trim();
    else if (l.startsWith('P') && epoch) {
      const r = [l.slice(4, 18), l.slice(18, 32), l.slice(32, 46)].map(Number);
      if (r.some((x) => x !== 0)) rows.set(epoch, r);
    }
  }
  return rows;
}

/** Per-axis RMS (m) of b about a over the epochs both hold (sp3Positions maps) and the number of common epochs. */
export function overlapRms(a, b) {
  let sum = 0, count = 0;
  for (const [epoch, r] of b) {
    const c = a.get(epoch);
    if (c) { sum += r.reduce((s, x, i) => s + (x - c[i]) ** 2, 0); count += 3; }
  }
  return { sigma: count ? Math.sqrt(sum / count) * 1000 : 0, epochs: count / 3 };
}
