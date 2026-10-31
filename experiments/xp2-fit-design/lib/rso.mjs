// XP2F data preparation: the GRACE-FO arcs of the primary span to reference states in this store. XM's lib/rso.mjs arcs, copies and overlaps, unchanged; its convert() with one change, the
// host: space-data-module-sdk 0.9.12 (build.json hosts), because its own install of analysis/reference-states in the canonical checkout now answers plugin.getConfig without a $PIV response. Wasm
// by git show at the registered commit, SHA-256 checked. prepare.mjs --rso-compare checks spent arcs byte for byte against XM's store. Selection and record moving only.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config, root, build, sha256, write, DAY, XM } from '../common.mjs';

const R = await import(path.join(root, config.xm.dir, 'lib/rso.mjs'));
const modules = XM.modulesRoot();
const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modules, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
const sdsRoot = path.dirname(createRequire(path.join(modules, 'propagator/sdn-ap/package.json')).resolve('spacedatastandards.org/package.json'));
const fb = await import(pathToFileURL(createRequire(path.join(sdsRoot, 'package.json')).resolve('flatbuffers')).href);
const loadSds = (code) => import(pathToFileURL(path.join(sdsRoot, `lib/js/${code}/main.js`)).href);
const [OEM, NCD, EOP] = await Promise.all(['OEM', 'NCD', 'EOP'].map(loadSds));
const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
import { execFileSync } from 'node:child_process';
const gitShow = (spec) => execFileSync('git', ['-C', modules, 'show', spec], { maxBuffer: 1 << 28 });
async function harness(rel, cfg) {
  const wasmSource = gitShow(`${build.modulesCommit}:${rel}/dist/isomorphic/module.wasm`);
  if (sha256(wasmSource) !== build.wasmSha256[rel]) throw new Error(`${rel} is not the registered wasm`);
  const manifest = JSON.parse(gitShow(`${build.modulesCommit}:${rel}/plugin-manifest.json`));
  return createBrowserModuleHarness({ wasmSource, manifest, surface: 'direct', ...(cfg ? { hostOptions: { config: cfg } } : {}) });
}
function encodeFil(content) {
  const b = new fb.Builder(content.length + 64);
  const c = b.createByteVector(content);
  b.startObject(13);
  b.addFieldOffset(9, c, 0);
  b.finish(b.endObject(), '$FIL');
  return b.asUint8Array().slice();
}
let eopRows = null;
async function earthOrientation(startMs, stopMs) {
  if (!eopRows) {
    const h = await harness('data-source/eop-parser');
    const r = await h.invoke({ methodId: 'parse_c04', inputs: [{ portId: 'body', typeRef: { schemaName: 'FIL.fbs', fileIdentifier: '$FIL', rootTypeName: 'FIL', wireFormat: 'flatbuffer' }, payload: encodeFil(fs.readFileSync(R.EOP_FILE)) }] });
    await h.destroy?.();
    if (r.statusCode !== 0) throw new Error(`parse_c04: ${r.errorMessage}`);
    const stream = Buffer.from(r.outputs.find((o) => o.portId === 'records').payload);
    eopRows = [];
    for (let at = 0; at < stream.length;) {
      const n = stream.readUInt32LE(at);
      const bytes = stream.subarray(at, at + 4 + n);
      eopRows.push({ mjd: EOP.EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(bytes.subarray(4)))).MJD(), bytes });
      at += 4 + n;
    }
  }
  const lo = Math.floor(startMs / DAY) + 40587 - 1, hi = Math.ceil(stopMs / DAY) + 40587 + 1;
  const rows = eopRows.filter((row) => row.mjd >= lo && row.mjd <= hi);
  if (!rows.length || rows[0].mjd > lo + 1 || rows.at(-1).mjd < hi - 1) return null;
  return { portId: 'earth_orientation', payload: Buffer.concat(rows.map((row) => row.bytes)), typeRef: typeRef('EOP') };
}
let reader = null;
function frameOf(bytes) {
  const b = new fb.Builder(1024);
  const sha = b.createString(sha256(bytes));
  NCD.NCD.startNCD(b);
  NCD.NCD.addSourceByteLength(b, BigInt(bytes.length));
  NCD.NCD.addSourceSha256(b, sha);
  NCD.NCD.finishSizePrefixedNCDBuffer(b, NCD.NCD.endNCD(b));
  return Buffer.concat([Buffer.from(b.asUint8Array()), bytes]);
}
async function convert(arc, own, best, identity, outRoot) {
  const dir = path.join(outRoot, arc.name);
  if (fs.existsSync(path.join(dir, 'index.json'))) return JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  reader ??= await harness('files/orbit-products');
  const read = await reader.invoke({ methodId: 'read_container', inputs: [{ portId: 'container', payload: frameOf(own.sp3), typeRef: typeRef('NCD') }] });
  if (read.statusCode !== 0) return { error: `read_container: ${read.errorMessage}` };
  const port = (id, code) => ({ portId: id, payload: Buffer.from(read.outputs.find((o) => o.portId === id).payload), typeRef: typeRef(code) });
  const ncd = NCD.NCD.getSizePrefixedRootAsNCD(new fb.ByteBuffer(new Uint8Array(port('descriptor', 'NCD').payload)));
  const start = Date.parse(`${ncd.START_TIME()?.slice(0, 19)}Z`), stop = Date.parse(`${ncd.STOP_TIME()?.slice(0, 19)}Z`);
  const eop = await earthOrientation(start, stop);
  if (!eop) return { error: `no C04 rows bracket ${ncd.START_TIME()} .. ${ncd.STOP_TIME()}` };
  const id = own.sp3.toString().match(/^\+\s+1\s+(\S{3})/m)?.[1];
  const basis = `the per-axis RMS (${best.sigma.toFixed(4)} m) of this arc's overlap with the adjacent arc ${best.arc} (${best.epochs} epochs), ` +
    'the precision of consecutive fits: the file states no accuracy and no published figure for the product is in the local archive';
  const product = `${path.basename(arc.file)} (SP3 SHA-256 ${own.sp3Sha256}, coordinate system "CTS" read as ITRF)`;
  const rs = await harness('analysis/reference-states', { product, source: own.url, statedSigmaM: best.sigma, statedSigmaBasis: basis, satellites: { [id]: identity } });
  const r = await rs.invoke({ methodId: 'reference_states', inputs: [port('ephemeris', 'OEM'), port('descriptor', 'NCD'), eop] });
  await rs.destroy?.();
  if (r.statusCode !== 0) return { error: `reference_states: ${r.errorMessage}` };
  fs.mkdirSync(dir, { recursive: true });
  const objects = [];
  for (const o of r.outputs.filter((x) => x.portId === 'reference')) {
    const bytes = Buffer.from(o.payload);
    const block = OEM.OEM.getSizePrefixedRootAsOEM(new fb.ByteBuffer(new Uint8Array(bytes))).EPHEMERIS_DATA_BLOCK(0);
    const norad = block.OBJECT().NORAD_CAT_ID();
    fs.writeFileSync(path.join(dir, `${norad}.oem`), bytes);
    objects.push({ norad, objectId: block.OBJECT().OBJECT_ID(), start: block.START_TIME(), stop: block.STOP_TIME(), epochs: block.ephemerisDataLinesLength(), file: `${norad}.oem`, comment: block.COMMENT() });
  }
  write(path.join(dir, 'index.json'), { product: path.basename(arc.file), url: own.url, sha256: own.sha256, statedSigmaM: best.sigma, statedSigmaBasis: basis, eop: R.EOP_URL, eopFile: R.EOP_FILE, objects });
  return { ok: true };
}
/** Every arc of a code meeting [loMs, hiMs) converted (skipping those done): { converted, skipped: [{ arc, why }] }; outRoot is <store>/reference. */
export async function convertCode(code, identity, loMs, hiMs, outRoot) {
  const arcs = R.arcsOf(code), cache = new Map();
  const load = (i) => { if (!cache.has(i)) cache.set(i, R.readArc(arcs[i])); return cache.get(i); };
  const out = { converted: 0, skipped: [] };
  for (let i = 0; i < arcs.length; i += 1) {
    if (arcs[i].stop <= loMs || arcs[i].start >= hiMs) continue;
    for (const k of cache.keys()) if (k < i - 1) cache.delete(k);
    const own = load(i);
    if (!own) { out.skipped.push({ arc: arcs[i].name, why: 'SHA-256 differs from its provenance record' }); continue; }
    let best = null;
    for (const j of [i - 1, i + 1]) {
      const other = arcs[j] && load(j), o = other && R.overlapRms(own.rows, other.rows);
      if (o && o.sigma > 0 && o.epochs >= 100 && o.epochs > (best?.epochs ?? 0)) best = { ...o, arc: arcs[j].name };
    }
    if (!best) { out.skipped.push({ arc: arcs[i].name, why: 'no adjacent arc overlaps it by 100 epochs; no sigma can be stated' }); continue; }
    const index = await convert(arcs[i], own, best, identity, outRoot);
    if (index.error) out.skipped.push({ arc: arcs[i].name, why: index.error }); else out.converted += 1;
  }
  return out;
}
