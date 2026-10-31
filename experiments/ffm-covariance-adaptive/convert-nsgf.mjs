// C3-A2: the daily NSGF arcs in <store>/nsgf/products/ to GCRF reference states under <store>/nsgf/reference/, by the modules, on the path of analysis/reference-states scripts/fetch-reference-products.mjs (product slr-daily),
// every arc rather than one in four: files/orbit-products read_container, data-source/eop-parser parse_c04 on the C04 file C2's conversions read, analysis/reference-states reference_states with the sphere's identity and the stated
// sigma (the per-axis RMS of the arc's overlap with the next day's arc). The wasm is the pin's (build.json). No network. Hosted by the experiments' SDK; --compare checks the result against C2's conversions of the same products,
// the seven 260829 products excepted (C2-A11: not compared). Records and encoding only; every frame and orbit computation is a module's.
//   node experiments/ffm-covariance-adaptive/convert-nsgf.mjs --shard k/n [--to 2026-06-20]
//   node experiments/ffm-covariance-adaptive/convert-nsgf.mjs --compare
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import * as flatbuffers from 'flatbuffers';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import * as NCD from 'spacedatastandards.org/lib/js/NCD/main.js';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/EOP.js';
import { config, store, args, registered, sha256, writeReceipt, readJsonl, DAY } from './common.mjs';
import { materialize } from './lib/modules.mjs';

registered();
const C = config.nsgfArcs, base = path.join(store, 'nsgf'), products = path.join(base, 'products'), refDir = path.join(base, 'reference');
const EOP_URL = 'https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now', C04_SHA = 'a14854ff3fa974a6783b31ed0d6642c9d477647547949e2794308cb46dfeb2b3';
const IDENTITY = { ajisai: { norad: 16908, objectId: '1986-061A', name: 'AJISAI' }, starlette: { norad: 7646, objectId: '1975-010A', name: 'STARLETTE' }, stella: { norad: 22824, objectId: '1993-061B', name: 'STELLA' }, larets: { norad: 27944, objectId: '2003-042F', name: 'LARETS' }, westpac: { norad: 25398, objectId: '1998-043E', name: 'WESTPAC' }, lares: { norad: 38077, objectId: '2012-006A', name: 'LARES' }, lares2: { norad: 53105, objectId: '2022-080A', name: 'LARES-2' } };
const yymmdd = (t) => new Date(t).toISOString().slice(2, 10).replaceAll('-', '');
const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
const days = []; for (let t = Date.parse(`${C.from}T00:00:00Z`); t <= Date.parse(`${args.to ?? C.to}T00:00:00Z`); t += DAY) days.push(t);

if (args.compare) {
  const C2_REF = '/opt/data/sdn-archive/reference-states/reference';
  const out = { compared: 0, identical: 0, different: [], sigmaDifferent: [], notCompared260829: 0 };
  for (const name of fs.readdirSync(refDir).sort()) {
    if (name.includes('.260829.')) { out.notCompared260829 += 1; continue; }
    const a = path.join(refDir, name), b = path.join(C2_REF, name);
    if (!fs.existsSync(path.join(b, 'index.json')) || !fs.existsSync(path.join(a, 'index.json'))) continue;
    const ia = JSON.parse(fs.readFileSync(path.join(a, 'index.json'))), ib = JSON.parse(fs.readFileSync(path.join(b, 'index.json')));
    out.compared += 1;
    if (ia.statedSigmaM !== ib.statedSigmaM) out.sigmaDifferent.push(name);
    const f = ia.objects[0].file;
    if (fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))) out.identical += 1; else out.different.push(name);
  }
  const manifest = readJsonl(path.join(base, 'manifest.jsonl'));
  const done = manifest.filter((r) => r.sha256), absent = manifest.filter((r) => r.absent), failed = manifest.filter((r) => r.failed);
  const receipt = { plan: 'C3-A2 point 2', comparison: { ...out, different: out.different.slice(0, 20), differentCount: out.different.length, sigmaDifferent: out.sigmaDifferent.slice(0, 20), sigmaDifferentCount: out.sigmaDifferent.length },
    fetch: { files: done.length, bytes: done.reduce((s, r) => s + r.bytes, 0), absent: absent.map((r) => r.url), failures: failed.map((r) => ({ url: r.url, failed: r.failed, attempt: r.attempt })), first: done[0]?.retrieved, last: done.at(-1)?.retrieved }, converted: fs.readdirSync(refDir).length, skipped: fs.existsSync(path.join(base, 'skipped.jsonl')) ? readJsonl(path.join(base, 'skipped.jsonl')) : [] };
  console.log(writeReceipt('nsgf-arcs', receipt));
  console.log(JSON.stringify({ ...receipt.comparison, fetch: { ...receipt.fetch, absent: receipt.fetch.absent.length, failures: receipt.fetch.failures.length }, converted: receipt.converted, skipped: receipt.skipped.length }));
  process.exit(0);
}

const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const dir = materialize('pin');
const harness = async (rel, cfg) => createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, rel, 'dist/isomorphic/module.wasm')), manifest: JSON.parse(fs.readFileSync(path.join(dir, rel, 'plugin-manifest.json'))), surface: 'direct', ...(cfg ? { hostOptions: { config: cfg } } : {}) });
const c04 = fs.readFileSync(path.join(products, 'eopc04.1962-now'));
if (sha256(c04) !== C04_SHA) throw new Error('the C04 file is not the one C2 converted with');
// one $FIL on "body": CONTENT in slot 9, as the parser's own tests write it
const fil = (bytes) => { const b = new flatbuffers.Builder(bytes.length + 64), c = b.createByteVector(bytes); b.startObject(13); b.addFieldOffset(9, c, 0); b.finish(b.endObject(), '$FIL'); return b.asUint8Array().slice(); };
const parser = await harness('data-source/eop-parser');
const parsed = await parser.invoke({ methodId: 'parse_c04', inputs: [{ portId: 'body', typeRef: { schemaName: 'FIL.fbs', fileIdentifier: '$FIL', rootTypeName: 'FIL', wireFormat: 'flatbuffer' }, payload: fil(c04) }] });
await parser.destroy();
if (parsed.statusCode !== 0) throw new Error(`parse_c04: ${parsed.errorMessage}`);
const stream = Buffer.from(parsed.outputs.find((o) => o.portId === 'records').payload), eopRows = [];
for (let at = 0; at < stream.length;) { const m = stream.readUInt32LE(at), bytes = stream.subarray(at, at + 4 + m); eopRows.push({ mjd: EOP.getRootAsEOP(new flatbuffers.ByteBuffer(new Uint8Array(bytes.subarray(4)))).MJD(), bytes }); at += 4 + m; }
const earthOrientation = (startMs, stopMs) => { const lo = Math.floor(startMs / DAY) + 40587 - 1, hi = Math.ceil(stopMs / DAY) + 40587 + 1, rows = eopRows.filter((r) => r.mjd >= lo && r.mjd <= hi); if (!rows.length || rows[0].mjd > lo + 1 || rows.at(-1).mjd < hi - 1) return null; return { portId: 'earth_orientation', payload: Buffer.concat(rows.map((r) => r.bytes)), typeRef: typeRef('EOP') }; };
const frameOf = (bytes) => { const b = new flatbuffers.Builder(1024), sha = b.createString(sha256(bytes)); NCD.NCD.startNCD(b); NCD.NCD.addSourceByteLength(b, BigInt(bytes.length)); NCD.NCD.addSourceSha256(b, sha); NCD.NCD.finishSizePrefixedNCDBuffer(b, NCD.NCD.endNCD(b)); return Buffer.concat([Buffer.from(b.asUint8Array()), bytes]); };
const sp3Positions = (text) => { const rows = new Map(); let epoch = null; for (const l of text.split('\n')) { if (l.startsWith('* ')) epoch = l.slice(3, 31).trim(); else if (l.startsWith('P') && epoch) { const r = [l.slice(4, 18), l.slice(18, 32), l.slice(32, 46)].map(Number); if (r.some((x) => x !== 0)) rows.set(epoch, r); } } return rows; };
const overlapRms = (a, b) => { let sum = 0, count = 0; for (const [epoch, r] of b) { const c = a.get(epoch); if (c) { sum += r.reduce((s, x, i) => s + (x - c[i]) ** 2, 0); count += 3; } } return { sigma: count ? Math.sqrt(sum / count) * 1000 : 0, epochs: count / 3 }; };
const reader = await harness('files/orbit-products');
const skip = (name, why) => { fs.appendFileSync(path.join(base, 'skipped.jsonl'), `${JSON.stringify({ name, why })}\n`); console.error(name, why); };
let doneCount = 0; const t0 = Date.now();
for (let i = 0; i < days.length; i += 1) {
  if (i % n !== k) continue;
  const t = days[i], d = yymmdd(t);
  for (const [sat, identity] of Object.entries(IDENTITY)) {
    const key = `nsgf.orb.${sat}.${d}.v000`, name = `${key}.sp3.gz`, file = path.join(products, name), nextFile = path.join(products, `nsgf.orb.${sat}.${yymmdd(t + DAY)}.v000.sp3.gz`), target = path.join(refDir, key);
    if (fs.existsSync(path.join(target, 'index.json'))) continue;
    if (!fs.existsSync(file)) { skip(name, 'not published'); continue; }
    if (!fs.existsSync(nextFile)) { skip(name, 'its successor is not published: no sigma'); continue; }
    const gz = fs.readFileSync(file), raw = gunzipSync(gz), text = raw.toString();
    if (!/^#cV\d{4}/.test(text)) { skip(name, 'not SP3-c'); continue; }
    const { sigma, epochs } = overlapRms(sp3Positions(text), sp3Positions(gunzipSync(fs.readFileSync(nextFile)).toString()));
    if (epochs < 100) { skip(name, 'overlap too short to state a sigma'); continue; }
    const id = text.match(/^\+\s+1\s+(\S{3})/m)?.[1];
    const url = `${C.source}${sat}/${new Date(t).getUTCFullYear()}/${d}/${name}`;
    const sp3 = Buffer.from(text.replace(/^(#cV.{43})  ECF/, '$1ITRF '));
    const basis = `the per-axis RMS (${sigma.toFixed(4)} m) of this arc's overlap with the next day's arc (${epochs} epochs)`;
    const product = `${name} (SHA-256 ${sha256(raw)}, coordinate system "ECF" read as ITRF per the file's comment)`;
    const read = await reader.invoke({ methodId: 'read_container', inputs: [{ portId: 'container', payload: frameOf(sp3), typeRef: typeRef('NCD') }] });
    if (read.statusCode !== 0) { skip(name, `read_container: ${read.errorMessage}`); continue; }
    const port = (idp, code) => ({ portId: idp, payload: Buffer.from(read.outputs.find((o) => o.portId === idp).payload), typeRef: typeRef(code) });
    const ncd = NCD.NCD.getSizePrefixedRootAsNCD(new flatbuffers.ByteBuffer(new Uint8Array(port('descriptor', 'NCD').payload)));
    const eop = earthOrientation(Date.parse(`${ncd.START_TIME()?.slice(0, 19)}Z`), Date.parse(`${ncd.STOP_TIME()?.slice(0, 19)}Z`));
    if (!eop) { skip(name, `no C04 rows bracket ${ncd.START_TIME()} .. ${ncd.STOP_TIME()}`); continue; }
    const ref = await harness('analysis/reference-states', { product, source: url, statedSigmaM: sigma, statedSigmaBasis: basis, satellites: { [id]: identity } });
    const r = await ref.invoke({ methodId: 'reference_states', inputs: [port('ephemeris', 'OEM'), port('descriptor', 'NCD'), eop] });
    await ref.destroy();
    if (r.statusCode !== 0) { skip(name, `reference_states: ${r.errorMessage}`); continue; }
    const tmp = `${target}.${process.pid}.part`;
    fs.mkdirSync(tmp, { recursive: true });
    const index = [];
    for (const o of r.outputs.filter((x) => x.portId === 'reference')) {
      const bytes = Buffer.from(o.payload), block = OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).EPHEMERIS_DATA_BLOCK(0), norad = block.OBJECT().NORAD_CAT_ID();
      fs.writeFileSync(path.join(tmp, `${norad}.oem`), bytes);
      index.push({ norad, objectId: block.OBJECT().OBJECT_ID(), start: block.START_TIME(), stop: block.STOP_TIME(), epochs: block.ephemerisDataLinesLength(), file: `${norad}.oem`, comment: block.COMMENT() });
    }
    fs.writeFileSync(path.join(tmp, 'index.json'), `${JSON.stringify({ product: name, url, sha256: sha256(gz), statedSigmaM: sigma, statedSigmaBasis: basis, eop: EOP_URL, objects: index }, null, 1)}\n`);
    fs.renameSync(tmp, target);
    doneCount += 1;
    if (doneCount % 50 === 0) console.error(`shard ${k}/${n}: ${doneCount} arcs, ${((Date.now() - t0) / 1000).toFixed(0)} s, at ${d}`);
  }
}
await reader.destroy();
console.log(JSON.stringify({ shard: `${k}/${n}`, arcs: doneCount, seconds: (Date.now() - t0) / 1000 }));
process.exit(0);
