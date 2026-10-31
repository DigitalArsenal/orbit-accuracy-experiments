// XP2F data preparation (PLAN.md, Dates): the Swarm reference states of the extension, the path of the modules script
// analysis/reference-states/scripts/fetch-reference-products.mjs (swarm), whose own import of data-source/eop-parser/tests/harness.mjs does not resolve
// in the canonical checkout (space-data-module-sdk/runtime-contracts). Same server, same file choice (newest baseline), same sigma, same wasm (git show at
// the registered modules commit, SHA-256 checked), same output: <out>/products/<zip>, <out>/reference/<name>/<norad>.oem and index.json. --compare checks an
// already converted day byte for byte. One stream, a pause between downloads, no credentials. Selection and record moving only.
//   node experiments/xp2-fit-design/fetch-swarm.mjs --from 2024-12-27 --to 2025-09-29        (file start days)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const COMMIT = '9a05d899b95242b358939ab1d68a776170a6b167';
const WASM = { 'analysis/reference-states': '77e16becd0167651219e11f1caaceacf352be535b8de56640ebe108cd7c3492f', 'files/orbit-products': '688f22ee2dba278d19e4029e8aedf1aa46fffd9910428f7d7ed40c9eeb583ad3', 'data-source/eop-parser': '03afedc590707a1d592edd0841f367b835498c97e5508526553e01b0d89997c1' };
const modules = path.resolve(process.env.SDN_MODULES_ROOT ?? path.join(root, '../../main-packages/space-data-network-modules'));
const OUT = path.resolve(args.out ?? '/opt/data/sdn-archive/reference-states');
const PRODUCTS = path.resolve(args.products ?? '/opt/data/sdn-archive/reference-states/products');
const DAY = 86400000, PAUSE_MS = Number(args.pause ?? 300);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['-C', modules, ...a], { maxBuffer: 1 << 28 });

const rsRequire = createRequire(path.join(modules, 'analysis/reference-states/package.json'));
// the declared host, space-data-module-sdk 0.9.12: this module's own install in the canonical checkout is 0.8.26, which answers plugin.getConfig without a $PIV response; analysis/gp-error-model's install is 0.9.12 (XM's build.json hosts analysis/density-calibration the same way)
const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modules, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
const sdsRoot = path.dirname(rsRequire.resolve('spacedatastandards.org/package.json'));
const fb = createRequire(path.join(sdsRoot, 'package.json'))('flatbuffers');
const loadSds = (code) => import(pathToFileURL(path.join(sdsRoot, `lib/js/${code}/main.js`)).href);
const [OEM, NCD, EOP] = await Promise.all(['OEM', 'NCD', 'EOP'].map(loadSds));
const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
async function harness(rel, config) {
  const wasmSource = git('show', `${COMMIT}:${rel}/dist/isomorphic/module.wasm`);
  if (sha256(wasmSource) !== WASM[rel]) throw new Error(`${rel} at ${COMMIT} is ${sha256(wasmSource)}, registered ${WASM[rel]}`);
  const manifest = JSON.parse(git('show', `${COMMIT}:${rel}/plugin-manifest.json`));
  return createBrowserModuleHarness({ wasmSource, manifest, surface: 'direct', ...(config ? { hostOptions: { config } } : {}) });
}

// ---- downloads --------------------------------------------------------------------------------------------------------
const SERVER = 'https://swarm-diss.eo.esa.int/';
const SATS = { A: { norad: 39452, objectId: '2013-067B', name: 'SWARM A' }, B: { norad: 39451, objectId: '2013-067A', name: 'SWARM B' }, C: { norad: 39453, objectId: '2013-067C', name: 'SWARM C' } };
const listings = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function list(dir) {
  if (!listings.has(dir)) {
    const res = await fetch(`${SERVER}?do=list&maxfiles=10000&pos=0&file=${encodeURIComponent(dir)}`);
    if (!res.ok) throw new Error(`listing ${dir}: ${res.status}`);
    listings.set(dir, (await res.json()).results.map((r) => r.name));
    await sleep(PAUSE_MS);
  }
  return listings.get(dir);
}
let fetched = 0, cached = 0;
async function zipOf(url, name) {
  const file = path.join(PRODUCTS, name);
  if (fs.existsSync(file)) { cached += 1; return fs.readFileSync(file); }
  if (args.compare) throw new Error(`${name} is not cached`);
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url).catch((e) => ({ ok: false, status: e.message }));
    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error(`${name}: not a zip`);
      const temp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temp, bytes); fs.renameSync(temp, file);
      fetched += 1;
      await sleep(PAUSE_MS);
      return bytes;
    }
    if (res.status === 404 || attempt === 3) throw new Error(`${name}: ${res.status}`);
    await sleep(5000 * attempt);
  }
}
function unzipEntry(zip, suffix) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) return null;
  for (let at = zip.readUInt32LE(end + 16), k = zip.readUInt16LE(end + 10); k > 0; k -= 1) {
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20), n = zip.readUInt16LE(at + 28);
    const name = zip.toString('latin1', at + 46, at + 46 + n), local = zip.readUInt32LE(at + 42);
    at += 46 + n + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    if (!name.toLowerCase().endsWith(suffix)) continue;
    const data = zip.subarray(local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)).subarray(0, size);
    return method === 8 ? inflateRawSync(data) : Buffer.from(data);
  }
  return null;
}
async function product(dir, pattern) {
  const name = (await list(dir)).filter((n) => pattern.test(n)).sort().at(-1);
  if (!name) return null;
  const url = `${SERVER}?do=download&file=${encodeURIComponent(`${dir}/${name}`)}`;
  const zip = await zipOf(url, name);
  return { name, url, zip, sp3: unzipEntry(zip, '.sp3') };
}
function sp3Positions(text) {
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

// ---- Earth orientation: the cached EOP 20 C04 rows bracketing each file ----------------------------------------------------
const EOP_URL = 'https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now';
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
    const r = await h.invoke({ methodId: 'parse_c04', inputs: [{ portId: 'body', typeRef: { ...typeRef('FIL') }, payload: encodeFil(fs.readFileSync(path.join(PRODUCTS, 'eopc04.1962-now'))) }] });
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

// ---- product to reference states ------------------------------------------------------------------------------------------
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
async function referenceStates(key, sp3, identities, provenance) {
  reader ??= await harness('files/orbit-products');
  const read = await reader.invoke({ methodId: 'read_container', inputs: [{ portId: 'container', payload: frameOf(sp3), typeRef: typeRef('NCD') }] });
  if (read.statusCode !== 0) throw new Error(`${key}: read_container: ${read.errorMessage}`);
  const port = (id, code) => ({ portId: id, payload: Buffer.from(read.outputs.find((o) => o.portId === id).payload), typeRef: typeRef(code) });
  const ncd = NCD.NCD.getSizePrefixedRootAsNCD(new fb.ByteBuffer(new Uint8Array(port('descriptor', 'NCD').payload)));
  const start = Date.parse(`${ncd.START_TIME()?.slice(0, 19)}Z`), stop = Date.parse(`${ncd.STOP_TIME()?.slice(0, 19)}Z`);
  const eop = await earthOrientation(start, stop);
  if (!eop) throw new Error(`${key}: no C04 rows bracket ${ncd.START_TIME()} .. ${ncd.STOP_TIME()}`);
  const rs = await harness('analysis/reference-states', identities);
  const r = await rs.invoke({ methodId: 'reference_states', inputs: [port('ephemeris', 'OEM'), port('descriptor', 'NCD'), eop] });
  await rs.destroy?.();
  if (r.statusCode !== 0) throw new Error(`${key}: reference_states: ${r.errorMessage}`);
  const dir = path.join(OUT, 'reference', key), temp = `${dir}.${process.pid}.tmp`;
  fs.mkdirSync(temp, { recursive: true });
  const objects = [];
  for (const o of r.outputs.filter((x) => x.portId === 'reference')) {
    const bytes = Buffer.from(o.payload);
    const block = OEM.OEM.getSizePrefixedRootAsOEM(new fb.ByteBuffer(new Uint8Array(bytes))).EPHEMERIS_DATA_BLOCK(0);
    const norad = block.OBJECT().NORAD_CAT_ID();
    fs.writeFileSync(path.join(temp, `${norad}.oem`), bytes);
    objects.push({ norad, objectId: block.OBJECT().OBJECT_ID(), start: block.START_TIME(), stop: block.STOP_TIME(), epochs: block.ephemerisDataLinesLength(), file: `${norad}.oem`, comment: block.COMMENT() });
  }
  fs.writeFileSync(path.join(temp, 'index.json'), `${JSON.stringify({ ...provenance, eop: EOP_URL, objects }, null, 1)}\n`);
  fs.renameSync(temp, dir);          // whole or absent: another lane reads these as they land
}

async function day(d) {
  const report = [];
  for (const [sat, identity] of Object.entries(SATS)) {
    const span = new RegExp(`^SW_OPER_SP3${sat}(COM|RD_)_2__${d}T235942_`);
    const done = (await list(`swarm/Level2daily/Latest_baselines/POD/RD/Sat_${sat}`)).filter((n) => span.test(n)).sort().at(-1);
    if (!done) { report.push({ sat, d, error: 'no reduced-dynamic file' }); continue; }
    if (!args.compare && fs.existsSync(path.join(OUT, 'reference', done.replace('.ZIP', ''), 'index.json'))) { report.push({ sat, d, name: done, skipped: true }); continue; }
    const rd = await product(`swarm/Level2daily/Latest_baselines/POD/RD/Sat_${sat}`, span);
    const kin = await product(`swarm/Level2daily/Latest_baselines/POD/KIN/Sat_${sat}`, new RegExp(`^SW_OPER_SP3${sat}KIN_2__${d}T235942_`));
    if (!rd?.sp3 || !kin?.sp3) { report.push({ sat, d, error: 'reduced-dynamic and kinematic both needed' }); continue; }
    const truth = sp3Positions(rd.sp3.toString());
    let sum = 0, count = 0, excluded = 0;
    for (const [epoch, r] of sp3Positions(kin.sp3.toString())) {
      const c = truth.get(epoch);
      if (!c) continue;
      const d2 = r.reduce((a, x, i) => a + (x - c[i]) ** 2, 0);
      if (d2 > 1e-6) { excluded += 1; continue; }
      sum += d2; count += 3;
    }
    if (count < 300) { report.push({ sat, d, error: 'too few kinematic epochs to state a sigma' }); continue; }
    const sigma = Math.sqrt(sum / count) * 1000;
    const id = rd.sp3.toString().match(/^\+\s+1\s+(\S{3})/m)?.[1];
    const basis = `the per-axis RMS (${sigma.toFixed(4)} m) of the kinematic minus reduced-dynamic Swarm ${sat} orbit over the day (${count / 3} epochs, ${excluded} beyond 1 m excluded); kinematic noise dominates it`;
    await referenceStates(rd.name.replace('.ZIP', ''), rd.sp3, { product: `${rd.name} (SP3 SHA-256 ${sha256(rd.sp3)})`, source: rd.url, statedSigmaM: sigma, statedSigmaBasis: basis, satellites: { [id]: identity } },
      { product: rd.name, url: rd.url, sha256: sha256(rd.zip), kinematic: kin.name, statedSigmaM: sigma, statedSigmaBasis: basis });
    report.push({ sat, d, name: rd.name, kinematic: kin.name, sha256: sha256(rd.zip), sigmaM: sigma });
  }
  return report;
}

if (!args.from || !args.to) throw new Error('--from and --to (file start days, YYYY-MM-DD) are required');
const all = [];
for (let t = Date.parse(`${args.from}T00:00:00Z`); t <= Date.parse(`${args.to}T00:00:00Z`); t += DAY) {
  const free = fs.statfsSync(OUT); if (free.bavail * free.bsize < 8 * 2 ** 30) throw new Error('under 8 GiB free: stopped');
  const d = new Date(t).toISOString().slice(0, 10).replaceAll('-', '');
  const rep = await day(d);
  all.push(...rep);
  console.log(`${d}: ${rep.map((r) => (r.error ? `${r.sat} ERROR ${r.error}` : r.skipped ? `${r.sat} present` : `${r.sat} ok`)).join(', ')} (fetched ${fetched}, cached ${cached})`);
}
if (args.report) { fs.mkdirSync(path.dirname(args.report), { recursive: true }); fs.writeFileSync(args.report, `${JSON.stringify({ from: args.from, to: args.to, modulesCommit: COMMIT, fetched, cached, files: all }, null, 1)}\n`); }
await reader?.destroy?.();
console.log(`finished: ${all.filter((r) => r.error).length} errors, ${all.length} sat-days, fetched ${fetched}, cached ${cached}`);
process.exit(0);
