// GFZ ISDC rapid science orbits (GRACE-FO 1 L64, GRACE-FO 2 L65, TerraSAR-X L13: 14 h SP3 arcs every 12 h, 30 s, GPS
// time) to reference states, per ruling 9: each SP3 file through files/orbit-products `read_container` and
// analysis/reference-states `reference_states` (IAU 2006/2000A with IERS EOP 20 C04), exactly as the modules script
// analysis/reference-states/scripts/fetch-reference-products.mjs converts L64 and L65 (its gfz-rso product), with this
// experiment's identities, into the experiment's store. The coordinate system "CTS" (the conventional terrestrial
// system) is read as ITRF, as the script reads it. The stated sigma is the script's: the per-axis RMS of the arc's
// overlap with the adjacent arc it overlaps longest (at least 100 epochs). Selection and record moving only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { modulesRoot, sha256, store, write, DAY } from '../common.mjs';

const modules = modulesRoot();
const rsRequire = createRequire(path.join(modules, 'analysis/reference-states/package.json'));
const { createBrowserModuleHarness } = await import(pathToFileURL(rsRequire.resolve('space-data-module-sdk/host/browser-module')).href);
const sdsRoot = path.dirname(createRequire(path.join(modules, 'propagator/sdn-ap/package.json')).resolve('spacedatastandards.org/package.json'));
const fb = await import(pathToFileURL(createRequire(path.join(sdsRoot, 'package.json')).resolve('flatbuffers')).href);
const loadSds = (code) => import(pathToFileURL(path.join(sdsRoot, `lib/js/${code}/main.js`)).href);
const [OEM, NCD, EOP] = await Promise.all(['OEM', 'NCD', 'EOP'].map(loadSds));
const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });

export const ARCHIVE = '/opt/data/sdn-archive/hac/gfz-isdc-rso/RSO';
export const EOP_FILE = '/opt/data/sdn-archive/reference-states/products/eopc04.1962-now';
export const EOP_URL = 'https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now';
export const outRoot = () => path.join(store, 'reference');

async function harness(dir, config) {
  const wasmSource = fs.readFileSync(path.join(modules, dir, 'dist/isomorphic/module.wasm'));
  const manifest = JSON.parse(fs.readFileSync(path.join(modules, dir, 'plugin-manifest.json')));
  return createBrowserModuleHarness({ wasmSource, manifest, surface: 'direct', ...(config ? { hostOptions: { config } } : {}) });
}

// ---- the arcs of one code: the latest version per start ----------------------------------------------------------------
const stamp = (s) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);
export function arcsOf(code) {
  const dir = path.join(ARCHIVE, code);
  const names = fs.readdirSync(dir).filter((n) => /^GFZOP_RSO_L\d\d_G_\d{8}_\d{6}_\d{8}_\d{6}_v\d\d\.sp3\.gz$/.test(n)).sort();
  const byStart = new Map(names.map((n) => [n.slice(16, 31), n]));
  return [...byStart].sort().map(([start, file]) => ({ code, name: file.replace('.sp3.gz', ''), file: path.join(dir, file), start: stamp(start), stop: stamp(file.slice(32, 47)) }));
}
/** A local copy checked against its provenance record: { bytes, url, sha256 } or null. */
function localCopy(file) {
  const bytes = fs.readFileSync(file);
  const { url, sha256: recorded } = JSON.parse(fs.readFileSync(`${file}.provenance.json`));
  return sha256(bytes) === recorded ? { bytes, url, sha256: recorded } : null;
}
/** The arc's SP3 text with its header frame "CTS" read as ITRF (the script's one change), its SHA-256 and positions. */
export function readArc(arc) {
  const copy = localCopy(arc.file);
  if (!copy) return null;
  const text = zlib.gunzipSync(copy.bytes);
  const sp3 = Buffer.from(text.toString().replace(/^(#[cd][PV].{43})CTS  /, '$1ITRF '));
  return { ...copy, sp3, sp3Sha256: sha256(text), rows: sp3Positions(text.toString()) };
}
/** epoch -> km position of the file's one satellite (Earth-fixed). */
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
/** Per-axis RMS (m) of b about a over the epochs both hold, the 3D RMS (m) and the count. */
export function overlapRms(a, b) {
  let sum = 0, count = 0;
  for (const [epoch, r] of b) {
    const c = a.get(epoch);
    if (c) { sum += r.reduce((s, x, i) => s + (x - c[i]) ** 2, 0); count += 1; }
  }
  return { sigma: count ? Math.sqrt(sum / (3 * count)) * 1000 : 0, rms3d: count ? Math.sqrt(sum / count) * 1000 : 0, epochs: count };
}

// ---- Earth orientation (C04, parsed by data-source/eop-parser) ---------------------------------------------------------------
let eopRows = null;
function encodeFil(content) { // one $FIL (schema/FIL/main.fbs, written by slot as the eop-parser tests do): CONTENT, slot 9
  const b = new fb.Builder(content.length + 64);
  const c = b.createByteVector(content);
  b.startObject(13);
  b.addFieldOffset(9, c, 0);
  b.finish(b.endObject(), '$FIL');
  return b.asUint8Array().slice();
}
async function earthOrientation(startMs, stopMs) {
  if (!eopRows) {
    const h = await harness('data-source/eop-parser');
    const r = await h.invoke({ methodId: 'parse_c04', inputs: [{ portId: 'body', typeRef: { schemaName: 'FIL.fbs', fileIdentifier: '$FIL', rootTypeName: 'FIL', wireFormat: 'flatbuffer' }, payload: encodeFil(fs.readFileSync(EOP_FILE)) }] });
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

// ---- one arc to reference states -------------------------------------------------------------------------------------
let reader = null;
function frameOf(bytes) { // [u32 n][$NCD][container], as read_container takes it
  const b = new fb.Builder(1024);
  const sha = b.createString(sha256(bytes));
  NCD.NCD.startNCD(b);
  NCD.NCD.addSourceByteLength(b, BigInt(bytes.length));
  NCD.NCD.addSourceSha256(b, sha);
  NCD.NCD.finishSizePrefixedNCDBuffer(b, NCD.NCD.endNCD(b));
  return Buffer.concat([Buffer.from(b.asUint8Array()), bytes]);
}
/** One arc converted into <store>/reference/<arc name>/<norad>.oem with its index.json: the index, or { error }. */
export async function convert(arc, own, best, identity) {
  const dir = path.join(outRoot(), arc.name);
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
  rs.destroy?.();
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
  const index = { product: path.basename(arc.file), url: own.url, sha256: own.sha256, statedSigmaM: best.sigma, statedSigmaBasis: basis, eop: EOP_URL, eopFile: EOP_FILE, objects };
  write(path.join(dir, 'index.json'), index);
  return index;
}

/** Every arc of `code` meeting [loMs, hiMs) converted (skipping those done), with each consecutive pair's overlap for P1:
 *  { converted, skipped: [{arc, why}], overlaps: [{a, b, epochs, rms3dM}] }. */
export async function convertCode(code, identity, loMs, hiMs, log = () => {}) {
  const arcs = arcsOf(code);
  const cache = new Map();
  const load = (i) => { if (!cache.has(i)) cache.set(i, readArc(arcs[i])); return cache.get(i); };
  const out = { converted: 0, skipped: [], overlaps: [] };
  for (let i = 0; i < arcs.length; i += 1) {
    if (arcs[i].stop <= loMs || arcs[i].start >= hiMs) continue;
    for (const k of cache.keys()) if (k < i - 1) cache.delete(k);
    const own = load(i);
    if (!own) { out.skipped.push({ arc: arcs[i].name, why: 'SHA-256 differs from its provenance record' }); continue; }
    let best = null;
    for (const j of [i - 1, i + 1]) {
      const other = arcs[j] && load(j);
      const o = other && overlapRms(own.rows, other.rows);
      if (j === i + 1 && o && o.epochs > 0 && arcs[j].start < hiMs) out.overlaps.push({ a: arcs[i].name, b: arcs[j].name, epochs: o.epochs, rms3dM: o.rms3d });
      if (o && o.sigma > 0 && o.epochs >= 100 && o.epochs > (best?.epochs ?? 0)) best = { ...o, arc: arcs[j].name };
    }
    if (!best) { out.skipped.push({ arc: arcs[i].name, why: 'no adjacent arc overlaps it by 100 epochs; no sigma can be stated' }); continue; }
    const index = await convert(arcs[i], own, best, identity);
    if (index.error) out.skipped.push({ arc: arcs[i].name, why: index.error });
    else { out.converted += 1; if (out.converted % 50 === 0) log(`${code}: ${out.converted} arcs`); }
  }
  return out;
}
