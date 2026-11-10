// The operator-grade inputs of experiments/ap-catalog-construction (PLAN.md, config.json "inputs"): ILRS CPF predictions, ESA
// ultra-rapid and GFZ rapid GNSS orbits, read from the archive only, each under its issue rule. Every file is read and carried to
// GCRF by the modules that made the truth: data-source/cpf-source (CPF), files/orbit-products (SP3), data-source/eop-parser (IERS
// rows) and analysis/reference-states (ITRS to GCRS, time scales). Host side: finding files, reading header dates, framing.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { CONFIG, REPO, MODULES, DAY, isoNoZ, dayOf } from './engine.mjs';

const HOUR = 3600e3;
const imp = (p) => import(pathToFileURL(p).href);
const req = createRequire(path.join(REPO, 'package.json'));
const flatbuffers = await imp(req.resolve('flatbuffers'));
const { createBrowserModuleHarness } = await imp(req.resolve('space-data-module-sdk/host/browser-module'));
const { encodeHttpResponse } = await imp(req.resolve('space-data-module-sdk/runtime-contracts'));
const SDS = path.resolve(REPO, '../../main-packages/spacedatastandards.org/lib/js');
const [NCD, EOP, OEM] = await Promise.all(['NCD', 'EOP', 'OEM'].map((c) => imp(path.join(SDS, `${c}/main.js`))));
const { asLines, sp3Descriptor } = await imp(path.join(REPO, 'experiments/supgp-omm/lib/readers/ecef.mjs'));
const { unpackOem } = await imp(path.join(REPO, 'experiments/supgp-omm/lib/records.mjs'));
const { gnssIdentities } = await imp(path.join(REPO, 'experiments/e4-operator-ephemeris-parity/sp3.mjs'));
const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
const A = (rel) => path.join(CONFIG.archive, rel);
const I = CONFIG.inputs;

async function harness(dir, config) {
  return createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, dir, 'dist/isomorphic/module.wasm')),
    manifest: JSON.parse(fs.readFileSync(path.join(MODULES, dir, 'plugin-manifest.json'))), surface: 'direct', ...(config ? { hostOptions: { config } } : {}) });
}
const mustOk = (what, r) => { if (r.statusCode !== 0) throw new Error(`${what}: ${r.errorCode ?? r.statusCode}: ${String(r.errorMessage ?? '').slice(0, 120)}`); return r; };

/** GCRF lines of a size-prefixed or plain $OEM's first block: { norad, states [{ ms, epoch, r, v }] }. */
function oemStates(bytes) {
  const u = new Uint8Array(bytes);
  const o = String.fromCharCode(...u.slice(8, 12)) === '$OEM' ? OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(u)) : OEM.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(u));
  const blk = o.EPHEMERIS_DATA_BLOCK(0), states = [];
  for (let i = 0; i < blk.ephemerisDataLinesLength(); i += 1) {
    const l = blk.EPHEMERIS_DATA_LINES(i), ms = Date.parse(/[zZ]$/.test(l.EPOCH()) ? l.EPOCH() : `${l.EPOCH()}Z`);
    if (l.X() === 0 && l.Y() === 0 && l.Z() === 0) continue; // an SP3 record without a position
    states.push({ ms, epoch: isoNoZ(ms), r: [l.X(), l.Y(), l.Z()], v: [l.X_DOT(), l.Y_DOT(), l.Z_DOT()] });
  }
  return { norad: blk.OBJECT()?.NORAD_CAT_ID(), states };
}

// ---- Earth orientation and satellite identities, each as known on the day of t0 (config "inputs.eop", "inputs.identities") ----
/** The newest file of `list` ([{ day, file }]) on or before `ms`'s day, else the oldest (an earlier day has none kept). */
const asOf = (list, ms) => { const d = dayOf(ms); return [...list].reverse().find((x) => x.day <= d) ?? list[0]; };
const eopFiles = () => {
  const out = [{ day: I.eop.snapshotDay, file: A(I.eop.snapshot) }];
  const daily = A(I.eop.dailyRoot);
  if (fs.existsSync(daily)) for (const d of fs.readdirSync(daily).sort()) { const f = path.join(daily, d, I.eop.fileName); if (/^\d{4}-\d\d-\d\d$/.test(d) && fs.existsSync(f)) out.push({ day: d, file: f }); }
  return out.sort((a, b) => a.day.localeCompare(b.day));
};
const identityFiles = () => {
  const out = [{ day: I.identities.snapshotDay, file: A(I.identities.snapshot) }];
  const dir = A(I.identities.stampedRoot);
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const m = /^igs_satellite_metadata\.snx\.(\d{4})(\d\d)(\d\d)T\d{4}Z$/.exec(f); if (m) out.push({ day: `${m[1]}-${m[2]}-${m[3]}`, file: path.join(dir, f) }); }
  return out.sort((a, b) => a.day.localeCompare(b.day));
};
export const inputFiles = new Map(); // every input file read -> its SHA-256 (the manifest lists them)
const note = (file, bytes) => { if (!inputFiles.has(file)) inputFiles.set(file, crypto.createHash('sha256').update(bytes).digest('hex')); return bytes; };
const eopRows = new Map();
async function earthOrientation(eopFile, firstMs, lastMs) {
  if (!eopRows.has(eopFile)) {
    const { body } = await imp(path.join(MODULES, 'data-source/eop-parser/tests/frames.mjs')); // the module's own $FIL framing
    const parser = await harness('data-source/eop-parser');
    const r = mustOk('parse_finals2000a', await parser.invoke({ methodId: 'parse_finals2000a', inputs: [body(note(eopFile, fs.readFileSync(eopFile)))] }));
    await parser.destroy();
    const stream = Buffer.from(r.outputs.find((o) => o.portId === 'records').payload), rows = [];
    for (let at = 0; at < stream.length;) { const n = stream.readUInt32LE(at), bytes = stream.subarray(at, at + 4 + n); rows.push({ mjd: EOP.EOP.getRootAsEOP(new flatbuffers.ByteBuffer(new Uint8Array(bytes.subarray(4)))).MJD(), bytes }); at += 4 + n; }
    eopRows.set(eopFile, rows);
  }
  const lo = Math.floor(firstMs / DAY) + 40587 - 1, hi = Math.ceil(lastMs / DAY) + 40587 + 1;
  const sel = eopRows.get(eopFile).filter((x) => x.mjd >= lo && x.mjd <= hi);
  if (!sel.length || sel[0].mjd > lo + 1 || sel.at(-1).mjd < hi - 1) throw new Error(`no IERS rows in ${eopFile} bracket ${new Date(firstMs).toISOString()} .. ${new Date(lastMs).toISOString()}`);
  return { portId: 'earth_orientation', payload: Buffer.concat(sel.map((x) => x.bytes)), typeRef: typeRef('EOP') };
}

/** An SP3 product -> per satellite GCRF states, by files/orbit-products and analysis/reference-states. */
async function convertSp3(sp3, { product, source, midMs, t0 }) {
  const reader = await harness('files/orbit-products');
  const ncdB = new flatbuffers.Builder(1024), shaS = ncdB.createString(crypto.createHash('sha256').update(sp3).digest('hex'));
  NCD.NCD.startNCD(ncdB); NCD.NCD.addSourceByteLength(ncdB, BigInt(sp3.length)); NCD.NCD.addSourceSha256(ncdB, shaS);
  NCD.NCD.finishSizePrefixedNCDBuffer(ncdB, NCD.NCD.endNCD(ncdB));
  const read = mustOk('read_container', await reader.invoke({ methodId: 'read_container', inputs: [{ portId: 'container', payload: Buffer.concat([Buffer.from(ncdB.asUint8Array()), sp3]), typeRef: typeRef('NCD') }] }));
  await reader.destroy();
  const port = (id, code) => ({ portId: id, payload: Buffer.from(read.outputs.find((o) => o.portId === id).payload), typeRef: typeRef(code) });
  const ncd = NCD.NCD.getSizePrefixedRootAsNCD(new flatbuffers.ByteBuffer(new Uint8Array(port('descriptor', 'NCD').payload)));
  const idFile = asOf(identityFiles(), t0).file;
  const satellites = gnssIdentities(note(idFile, fs.readFileSync(idFile)).toString('latin1'), midMs);
  const reference = await harness('analysis/reference-states', { product, source, statedSigmaM: 0.1, statedSigmaBasis: 'placeholder: the covariance is not used here', satellites });
  const eop = await earthOrientation(asOf(eopFiles(), t0).file, Date.parse(`${ncd.START_TIME().slice(0, 19)}Z`), Date.parse(`${ncd.STOP_TIME().slice(0, 19)}Z`));
  const out = mustOk('reference_states', await reference.invoke({ methodId: 'reference_states', inputs: [port('ephemeris', 'OEM'), port('descriptor', 'NCD'), eop] }));
  await reference.destroy();
  const bySat = new Map();
  for (const o of out.outputs.filter((x) => x.portId === 'reference')) { const s = oemStates(o.payload); bySat.set(s.norad, s.states); }
  return bySat;
}
const converted = new Map(); // product file (and t0 day, which picks the EOP and identity files) -> Map(norad -> states)
async function productStates(file, args) {
  const key = `${file}|${dayOf(args.t0)}`;
  if (!converted.has(key)) {
    if (converted.size > 24) converted.delete(converted.keys().next().value);
    converted.set(key, await convertSp3(zlib.gunzipSync(note(file, fs.readFileSync(file))), args));
  }
  return converted.get(key);
}

// ---- ESA ultra-rapid (U2): issue rule start + 26 h <= t0 (and t0 - start <= 32 h) ----
let ultList = null;
const ultFiles = () => {
  ultList ??= (fs.existsSync(A(I.ultraRapid.root)) ? fs.readdirSync(A(I.ultraRapid.root)) : []).map((f) => ({ f, m: new RegExp(I.ultraRapid.pattern).exec(f) })).filter((x) => x.m)
    .map(({ f, m }) => ({ file: path.join(A(I.ultraRapid.root), f), startMs: Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * DAY + +m[3] * HOUR + +m[4] * 60000 })).sort((a, b) => a.startMs - b.startMs);
  return ultList;
};
export async function ultraRapid(norad, t0, guard) {
  const usable = ultFiles().filter((f) => f.startMs + I.ultraRapid.issueAfterStartHours * HOUR <= t0);
  const newest = usable.at(-1);
  if (!newest || t0 - newest.startMs > I.ultraRapid.maximumAgeHours * HOUR) return null;
  const arm = CONFIG.arms.U2;
  guard(newest.startMs - arm.earlierDays * DAY, newest.startMs + 2 * DAY, 'ultra-rapid');
  let states = (await productStates(newest.file, { product: 'ESA0OPSULT', source: path.basename(newest.file), midMs: newest.startMs + DAY, t0 })).get(norad);
  if (!states?.length) return null;
  for (let d = 1; d <= arm.earlierDays; d += 1) { // the solved first 24 h of the file started d days earlier
    const f = usable.find((x) => x.startMs === newest.startMs - d * DAY);
    const s = f && (await productStates(f.file, { product: 'ESA0OPSULT', source: path.basename(f.file), midMs: f.startMs + DAY, t0 })).get(norad);
    if (s) states = s.filter((x) => x.ms < f.startMs + DAY && x.ms < states[0].ms).concat(states);
  }
  return states.length >= arm.minimumStates ? states.sort((a, b) => a.ms - b.ms) : null;
}

// ---- GFZ rapid multi-GNSS (R3): issue rule = the file's CDDIS Last-Modified (its provenance) <= t0 ----
let rapList = null;
const rapFiles = () => {
  if (!rapList) {
    rapList = [];
    const root = A(I.rapid.root);
    for (const w of fs.existsSync(root) ? fs.readdirSync(root) : []) for (const f of fs.readdirSync(path.join(root, w))) {
      const m = new RegExp(I.rapid.pattern).exec(f), prov = path.join(root, w, `${f}.provenance.json`);
      if (!m || !fs.existsSync(prov)) continue;
      rapList.push({ file: path.join(root, w, f), startMs: Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * DAY, issuedMs: Date.parse(JSON.parse(fs.readFileSync(prov, 'utf8')).lastModified) });
    }
    rapList.sort((a, b) => a.startMs - b.startMs);
  }
  return rapList;
};
export async function rapid(norad, t0, guard) {
  const arm = CONFIG.arms.R3;
  const take = []; // newest first: the files out by t0 that hold the satellite, within arm.days of the newest such file
  for (const f of rapFiles().filter((x) => x.issuedMs <= t0).reverse()) {
    if (take.length && f.startMs <= take[0].startMs - arm.days * DAY) break;
    const s = (await productStates(f.file, { product: 'GFZ0MGXRAP', source: path.basename(f.file), midMs: f.startMs + DAY / 2, t0 })).get(norad);
    if (s?.length) take.push({ ...f, s });
  }
  if (!take.length || t0 - (take[0].startMs + DAY) > arm.maximumAgeDays * DAY) return null;
  take.reverse();
  guard(take[0].startMs, take.at(-1).startMs + DAY, 'rapid');
  const states = [];
  for (const f of take) for (const s of f.s) if (!states.length || s.ms > states.at(-1).ms) states.push(s);
  return states.length >= arm.minimumStates ? states : null;
}

// ---- ILRS CPF (P13): issue rule = H1 production date and hour <= t0, and the archive's retrieval time when the file name has one ----
let cpfList = null;
function cpfFiles() {
  if (cpfList) return cpfList;
  cpfList = [];
  const headOf = (file) => { const fd = fs.openSync(file, 'r'), b = Buffer.alloc(512); const n = fs.readSync(fd, b, 0, 512, 0); fs.closeSync(fd); return b.subarray(0, n); };
  const add = (file, name, retrievedMs, gz) => { // the H1 and H2 header records only
    const head = (gz ? zlib.gunzipSync(fs.readFileSync(file)) : headOf(file)).toString('latin1').split('\n', 4);
    const h1 = head.find((l) => l.startsWith('H1'))?.trim().split(/\s+/), h2 = head.find((l) => l.startsWith('H2'))?.trim().split(/\s+/);
    if (!h1 || !h2) return;
    cpfList.push({ file, name, target: name.split('_cpf_')[0], gz, retrievedMs, producedMs: Date.UTC(+h1[4], +h1[5] - 1, +h1[6], +h1[7]), norad: Number(h2[3]),
      dayMs: (() => { const m = /_cpf_(\d\d)(\d\d)(\d\d)_/.exec(name); return Date.UTC(2000 + +m[1], +m[2] - 1, +m[3]); })() });
  };
  for (const root of I.cpf.targetRoots) for (const t of fs.existsSync(A(root)) ? fs.readdirSync(A(root)) : []) for (const f of fs.readdirSync(A(path.join(root, t)))) if (/_cpf_\d{6}_\d+\.\w+$/.test(f)) add(A(path.join(root, t, f)), f, null, false);
  for (const root of I.cpf.retrievedRoots) for (const f of fs.existsSync(A(root)) ? fs.readdirSync(A(root)) : []) {
    const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z--([a-z0-9]+_cpf_\d{6}_\d+\.\w+)\.gz$/.exec(f);
    if (m) add(A(path.join(root, f)), m[7], Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), true);
  }
  return cpfList;
}
async function cpfGcrf(c, t0) {
  const body = note(c.file, c.gz ? zlib.gunzipSync(fs.readFileSync(c.file)) : fs.readFileSync(c.file));
  const listing = `memory://cpf/${c.target}/`;
  const module = await harness('data-source/cpf-source', { listingUrl: listing, target: c.target });
  const r = await module.invoke({ methodId: 'emit', inputs: [{ portId: 'response', typeRef: { schemaName: 'HttpResponse.fbs', fileIdentifier: 'HRSP', rootTypeName: 'HttpResponse', wireFormat: 'flatbuffer' },
    payload: encodeHttpResponse({ url: `${listing}${c.name}`, status: 200, error: '', headers: {}, body: new Uint8Array(body), retrievedMs: c.producedMs }) }] });
  await module.destroy();
  const frame = r.statusCode === 0 && r.outputs.find((o) => o.portId === 'oem');
  if (!frame) return null;
  const oem = Buffer.from(frame.payload), key = c.target.toUpperCase().slice(0, 12);
  if (oemStates(oem).norad !== c.norad) return null;
  const lines = asLines(oem, key, 0);
  const count = unpackOem(lines.bytes).EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.length;
  const eop = await earthOrientation(asOf(eopFiles(), t0).file, lines.firstMs, lines.lastMs);
  const reference = await harness('analysis/reference-states', { product: 'ILRS', source: 'operator ephemeris, Earth-fixed', statedSigmaM: 1, statedSigmaBasis: 'placeholder: the covariance is not used here', satellites: { [key]: { norad: c.norad, objectId: '', name: c.target } } });
  const out = await reference.invoke({ methodId: 'reference_states', inputs: [{ portId: 'ephemeris', payload: lines.bytes, typeRef: typeRef('OEM') },
    { portId: 'descriptor', payload: sp3Descriptor({ key, stepSeconds: lines.stepSeconds, count, agency: 'ILRS', frameLabel: 'ITRF' }), typeRef: typeRef('NCD') }, eop] });
  await reference.destroy();
  const f = out.statusCode === 0 && out.outputs.find((o) => o.portId === 'reference');
  return f ? oemStates(f.payload).states : null;
}
export async function cpf(norad, t0, guard) {
  const arm = CONFIG.arms.P13;
  const cands = cpfFiles().filter((c) => c.norad === norad && c.dayMs <= t0 && c.dayMs >= t0 - arm.nameDateWithinDays * DAY && c.producedMs <= t0 && (c.retrievedMs == null || c.retrievedMs <= t0))
    .sort((a, b) => b.dayMs - a.dayMs || b.name.localeCompare(a.name));
  for (const c of cands) {
    const states = await cpfGcrf(c, t0);
    if (!states?.length) continue;
    try { guard(states[0].ms, states.at(-1).ms, 'cpf'); } catch { continue; } // a file reaching outside the run's window is not read
    const lo = t0 - arm.daysBefore * DAY, hi = t0 + arm.daysAfter * DAY, step = arm.stepSeconds * 1000;
    let last = -Infinity;
    const out = states.filter((s) => s.ms >= lo && s.ms <= hi).filter((s) => (s.ms - last >= step - 1000 ? ((last = s.ms), true) : false));
    if (out.length >= arm.minimumStates) return out;
  }
  return null;
}

export const INPUTS = { P13: cpf, U2: ultraRapid, R3: rapid };
