// C3-A5 point 3, before the freeze: can the independent-truth stratum run on GFZ0OPSRAP, the GFZ rapid product GFZ's own server gives without credentials? On seven calibration dates, never a scored date: which of R3's 39 GNSS
// satellites the files carry, and how far GFZ0OPSRAP lies from GFZ0MGXRAP (E14's conversions, the product C3-A2's check read), beside ESA against each. Conversion by the modules at the pin, on the path of analysis/reference-states
// scripts/fetch-reference-products.mjs (product mgex), with the C04 file C2 converted with. One request every 3 s, anonymous; a manifest records url, SHA-256, bytes and retrieval time. Records and statistics only.
//   node experiments/ffm-covariance-adaptive/check-gfz-ops.mjs
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import * as flatbuffers from 'flatbuffers';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import * as NCD from 'spacedatastandards.org/lib/js/NCD/main.js';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/EOP.js';
import { config, store, root, registered, Opened, writeReceipt, sha256, DAY } from './common.mjs';
import { materialize, openPairs } from './lib/modules.mjs';
import { arcsOf, arcLines } from './lib/chain.mjs';

registered();
const opened = new Opened();
const SRC = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs'));
const DATES = ['2025-10-12', '2025-11-16', '2025-12-21', '2026-01-04', '2026-01-25', '2026-03-01', '2026-03-22'];
if (DATES.some((d) => d >= '2026-09-24')) throw new Error('a scored date');
const P = config.population.judged, GLO = [...P.glonass.c2, ...P.glonass.new], GAL = [...P.galileo.new, ...P.galileo.c2Six], ALL = [...GLO, ...GAL];
const base = path.join(store, 'gfz-ops'), products = path.join(base, 'products'), refDir = path.join(base, 'reference'), manifest = path.join(base, 'manifest.jsonl');
fs.mkdirSync(products, { recursive: true });
const SERVER = 'https://isdc-data.gfz.de/gnss/products/rapid', SNX = '/opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx';
const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
const dir = materialize('pin');
const harness = async (rel, cfg) => createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, rel, 'dist/isomorphic/module.wasm')), manifest: JSON.parse(fs.readFileSync(path.join(dir, rel, 'plugin-manifest.json'))), surface: 'direct', ...(cfg ? { hostOptions: { config: cfg } } : {}) });

// identities: as the modules' converter, PRN to NORAD by the SINEX validity at mid-day
const text = opened.read(SNX, 'IGS SINEX').toString();
const block = (name) => text.split(`+${name}`)[1].split(`-${name}`)[0].split('\n').filter((l) => l.startsWith(' '));
const ids = new Map(block('SATELLITE/IDENTIFIER').map((l) => [l.slice(1, 5), { cospar: l.slice(6, 15).trim(), satcat: Number(l.slice(16, 22)), block: l.slice(23, 38).trim() }]));
const sinexTime = (t) => (t.startsWith('0000') ? Infinity : Date.UTC(Number(t.slice(0, 4)), 0, 1) + (Number(t.slice(5, 8)) - 1) * DAY + Number(t.slice(9, 14)) * 1000);
const identities = (mid) => { const out = {}; for (const l of block('SATELLITE/PRN')) { const svn = l.slice(1, 5), prn = l.slice(36, 39); if (sinexTime(l.slice(6, 20)) <= mid && mid < sinexTime(l.slice(21, 35)) && ids.get(svn)?.satcat) out[prn] = { norad: ids.get(svn).satcat, objectId: ids.get(svn).cospar, name: `${svn} ${ids.get(svn).block}` }; } return out; };

// the C04 rows C2 converted with
const c04 = opened.read(path.join(store, 'nsgf/products/eopc04.1962-now'), 'C04');
const fil = (bytes) => { const b = new flatbuffers.Builder(bytes.length + 64), c = b.createByteVector(bytes); b.startObject(13); b.addFieldOffset(9, c, 0); b.finish(b.endObject(), '$FIL'); return b.asUint8Array().slice(); };
const parser = await harness('data-source/eop-parser');
const parsed = await parser.invoke({ methodId: 'parse_c04', inputs: [{ portId: 'body', typeRef: typeRef('FIL'), payload: fil(c04) }] });
await parser.destroy();
if (parsed.statusCode !== 0) throw new Error(`parse_c04: ${parsed.errorMessage}`);
const stream = Buffer.from(parsed.outputs.find((o) => o.portId === 'records').payload), eopRows = [];
for (let at = 0; at < stream.length;) { const m = stream.readUInt32LE(at), bytes = stream.subarray(at, at + 4 + m); eopRows.push({ mjd: EOP.getRootAsEOP(new flatbuffers.ByteBuffer(new Uint8Array(bytes.subarray(4)))).MJD(), bytes }); at += 4 + m; }
const earthOrientation = (a, b) => { const lo = Math.floor(a / DAY) + 40587 - 1, hi = Math.ceil(b / DAY) + 40587 + 1, rows = eopRows.filter((r) => r.mjd >= lo && r.mjd <= hi); if (!rows.length || rows[0].mjd > lo + 1 || rows.at(-1).mjd < hi - 1) return null; return { portId: 'earth_orientation', payload: Buffer.concat(rows.map((r) => r.bytes)), typeRef: typeRef('EOP') }; };
const frameOf = (bytes) => { const b = new flatbuffers.Builder(1024), s = b.createString(sha256(bytes)); NCD.NCD.startNCD(b); NCD.NCD.addSourceByteLength(b, BigInt(bytes.length)); NCD.NCD.addSourceSha256(b, s); NCD.NCD.finishSizePrefixedNCDBuffer(b, NCD.NCD.endNCD(b)); return Buffer.concat([Buffer.from(b.asUint8Array()), bytes]); };
const reader = await harness('files/orbit-products');
const pairs = await openPairs('pin');
const PLACEHOLDER = [1, 0, 1, 0, 0, 1];
const coverage = [], diffs = { GLONASS: { opsMgx: [[], [], []], esaMgx: [[], [], []], esaOps: [[], [], []] }, Galileo: { opsMgx: [[], [], []], esaMgx: [[], [], []], esaOps: [[], [], []] } };
const statsOf = async (a, b) => (a.length ? pairs.stats(a.map((x, i) => ({ predicted: { position: x.r.map((q) => q * 1000), velocity: x.v.map((q) => q * 1000), covariance: PLACEHOLDER, covarianceAxes: 'RTN' }, truth: { position: b[i].r.map((q) => q * 1000), velocity: b[i].v.map((q) => q * 1000) } })), 'predicted') : []);
const msOf = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);
const yearDoy = (t) => { const d = new Date(t), y = d.getUTCFullYear(); return `${y}${String(Math.round((t - Date.UTC(y, 0, 1)) / DAY) + 1).padStart(3, '0')}`; };
for (const date of DATES) {
  const t = Date.parse(`${date}T00:00:00Z`), week = Math.floor((t - Date.UTC(1980, 0, 6)) / (7 * DAY)), key = `GFZ0OPSRAP_${yearDoy(t)}0000_01D_05M_ORB`, name = `${key}.SP3.gz`, file = path.join(products, name), url = `${SERVER}/w${week}/${name}`;
  if (!fs.existsSync(file)) {
    await sleep(3000);
    const r = await fetch(url, { headers: { 'user-agent': 'orbit-accuracy-experiments (research; one request every 3 s)' }, signal: AbortSignal.timeout(120e3) }), bytes = Buffer.from(await r.arrayBuffer());
    if (r.status !== 200 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) { fs.appendFileSync(manifest, `${JSON.stringify({ url, retrieved: new Date().toISOString(), status: r.status, failed: `${bytes.length} bytes` })}\n`); coverage.push({ date, name, missing: `HTTP ${r.status}` }); continue; }
    fs.writeFileSync(file, bytes); fs.appendFileSync(manifest, `${JSON.stringify({ url, path: `products/${name}`, retrieved: new Date().toISOString(), status: 200, sha256: sha256(bytes), bytes: bytes.length, lastModified: r.headers.get('last-modified') })}\n`);
  }
  const gz = opened.read(file, 'GFZ0OPSRAP'), sp3 = gunzipSync(gz), body = sp3.toString('latin1');
  // the file's own satellite list and, per satellite, its epochs with a position
  const listed = [...body.matchAll(/^\+ {0,5}(?:\d+)? +(.*)$/gm)].flatMap((m) => m[1].match(/[A-Z]\d\d/g) ?? []);
  const lines = body.split('\n'), epochs = new Map(); for (const l of lines) if (l.startsWith('P')) { const prn = l.slice(1, 4), v = [l.slice(4, 18), l.slice(18, 32), l.slice(32, 46)].map(Number); if (v.some((x) => x !== 0)) epochs.set(prn, (epochs.get(prn) ?? 0) + 1); }
  const id = identities(t + DAY / 2), byNorad = new Map(Object.entries(id).map(([prn, v]) => [v.norad, { prn, ...v }]));
  const carried = ALL.map((norad) => { const s = byNorad.get(norad); return { norad, prn: s?.prn ?? null, epochs: s ? (epochs.get(s.prn) ?? 0) : 0, listed: s ? listed.includes(s.prn) : false, constellation: GLO.includes(norad) ? 'GLONASS' : 'Galileo' }; });
  const header = { GPS: listed.filter((p) => p[0] === 'G').length, GLONASS: listed.filter((p) => p[0] === 'R').length, Galileo: listed.filter((p) => p[0] === 'E').length, other: listed.filter((p) => !'GRE'.includes(p[0])).length };
  coverage.push({ date, name, url, header, missing: carried.filter((c) => !c.epochs).map((c) => c.norad), minEpochs: Math.min(...carried.filter((c) => c.epochs).map((c) => c.epochs)), carried });
  // conversion
  const target = path.join(refDir, key);
  if (!fs.existsSync(path.join(target, 'index.json'))) {
    const chosen = Object.fromEntries(Object.entries(id).filter(([, v]) => ALL.includes(v.norad)));
    const read = await reader.invoke({ methodId: 'read_container', inputs: [{ portId: 'container', payload: frameOf(sp3), typeRef: typeRef('NCD') }] });
    if (read.statusCode !== 0) throw new Error(`read_container: ${read.errorMessage}`);
    const port = (idp, code) => ({ portId: idp, payload: Buffer.from(read.outputs.find((o) => o.portId === idp).payload), typeRef: typeRef(code) });
    const ncd = NCD.NCD.getSizePrefixedRootAsNCD(new flatbuffers.ByteBuffer(new Uint8Array(port('descriptor', 'NCD').payload)));
    const eop = earthOrientation(Date.parse(`${ncd.START_TIME()?.slice(0, 19)}Z`), Date.parse(`${ncd.STOP_TIME()?.slice(0, 19)}Z`));
    if (!eop) throw new Error(`no C04 rows bracket ${name}`);
    const ref = await harness('analysis/reference-states', { product: name, source: url, statedSigmaM: 1.024, statedSigmaBasis: 'a placeholder: this comparison reads states only', satellites: chosen });
    const r = await ref.invoke({ methodId: 'reference_states', inputs: [port('ephemeris', 'OEM'), port('descriptor', 'NCD'), eop] });
    await ref.destroy();
    if (r.statusCode !== 0) throw new Error(`reference_states: ${r.errorMessage}`);
    fs.mkdirSync(target, { recursive: true });
    const index = [];
    for (const o of r.outputs.filter((x) => x.portId === 'reference')) { const bytes = Buffer.from(o.payload), b = OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).EPHEMERIS_DATA_BLOCK(0), norad = b.OBJECT().NORAD_CAT_ID(); fs.writeFileSync(path.join(target, `${norad}.oem`), bytes); index.push({ norad, file: `${norad}.oem` }); }
    fs.writeFileSync(path.join(target, 'index.json'), `${JSON.stringify({ product: name, url, sha256: sha256(gz), objects: index }, null, 1)}\n`);
  }
  // the three differences at common epochs
  const mgxDir = path.join(config.p1b.gfz.root, `${config.p1b.gfz.prefix}${yearDoy(t)}0000_01D_05M_ORB`);
  for (const norad of ALL) {
    const o = path.join(target, `${norad}.oem`), m = path.join(mgxDir, `${norad}.oem`);
    if (!fs.existsSync(o) || !fs.existsSync(m)) continue;
    opened.add(o, 'GFZ0OPSRAP conversion'); opened.add(m, 'GFZ0MGXRAP');
    const a = SRC.readReference(o).lines, b = new Map(SRC.readReference(m).lines.map((l) => [msOf(l.epoch), l]));
    const arcs = arcsOf(norad, { fromMs: t, toMs: t, allowedToMs: Date.parse('2026-06-15T00:00:00Z'), opened }), esa = new Map(arcs.flatMap((c) => arcLines(c)).map((l) => [msOf(l.epoch), l]));
    const common = a.filter((l) => b.has(msOf(l.epoch)));
    const cls = GLO.includes(norad) ? 'GLONASS' : 'Galileo';
    (await statsOf(common, common.map((l) => b.get(msOf(l.epoch))))).forEach((s) => s.errorRtn.forEach((x, k) => diffs[cls].opsMgx[k].push(x)));
    const three = common.filter((l) => esa.has(msOf(l.epoch)));
    (await statsOf(three.map((l) => esa.get(msOf(l.epoch))), three.map((l) => b.get(msOf(l.epoch))))).forEach((s) => s.errorRtn.forEach((x, k) => diffs[cls].esaMgx[k].push(x)));
    (await statsOf(three.map((l) => esa.get(msOf(l.epoch))), three)).forEach((s) => s.errorRtn.forEach((x, k) => diffs[cls].esaOps[k].push(x)));
  }
}
await reader.destroy();
const rms = (v) => (v.length ? Math.sqrt(v.reduce((p, x) => p + x * x, 0) / v.length) : null), mean = (v) => (v.length ? v.reduce((p, x) => p + x, 0) / v.length : null);
const table = Object.fromEntries(Object.entries(diffs).map(([cls, d]) => [cls, Object.fromEntries(Object.entries(d).map(([pair, axes]) => [pair, { n: axes[0].length, rmsRtnM: axes.map(rms), meanRtnM: axes.map(mean) }]))]));
const missing = coverage.flatMap((c) => c.missing ?? []);
const out = { plan: 'C3-A5 point 3', dates: DATES, server: SERVER, coverage: coverage.map(({ carried, ...rest }) => rest), perSatellite: coverage[0]?.carried ?? [], allCarried: !missing.length, differences: table };
console.log(writeReceipt('gfz-ops', out, opened));
for (const c of coverage) console.log(c.date, JSON.stringify(c.header), 'of the 39, missing:', JSON.stringify(c.missing), 'min epochs', c.minEpochs);
console.log(JSON.stringify(table));
process.exit(0);
