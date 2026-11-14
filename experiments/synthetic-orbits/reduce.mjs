#!/usr/bin/env node
// The synthetic set's counts from standard records only.
//
//   node experiments/synthetic-orbits/reduce.mjs --truth <truth $OCM stream> --seeds <seed $OCM stream> --records <fitted $OCM stream>[,<stream> ...] --wasm <module.wasm> [--sha256 <hex>] [--out <file>] [--compare <aggregate json>]
//
// Reduction inputs are the three standard record streams and the unsigned module (SDM_MODULE_UNSIGNED_BUILD=1).
// --compare reads a JSON table solely as a check; every count, class and case row must match.
// Identity matching checks METADATA.CATALOG_NAME (SYNTHETIC-ORBITS), OBJECT_NAME and OBJECT_DESIGNATOR (case id),
// NORAD_CAT_ID (0), HEADER.MESSAGE_STATUS (EXERCISE), and PROVENANCE.SOURCE_ID, SOURCE_SHA256 and SOURCE_BYTES.
// Both links (fit to truth, truth to seed) must agree on case identity and frame hash/length.
// Repeated MESSAGE_ID or case/MEAN_ELEMENTS.MEAN_ELEMENT_THEORY is an error. --newest selects by CREATION_DATE;
// missing dates or ties are refused. Superseded frames are counted separately; one row remains per case and technique.
// Each selected record has exactly one class. --fail-on <class>[,<class>...] exits nonzero for any named nonempty class.
// A truth shorter than 120 hours is never within a bar. Scoring stops before the first state below 100 km.
// Bars are 100, 200 and 500 meters; group boundaries are eccentricity 0.1/0.8 and perigee 500 km.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { putUnique } from './duplicates.mjs';
import { frames, readFrame } from './records.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args[i + 1]; };
const require = createRequire(import.meta.url);
const imp = (p) => import(pathToFileURL(require.resolve(p)).href);
const fb = require('flatbuffers');
const { OEM } = await imp('spacedatastandards.org/lib/js/OEM/OEM.js');
const { OCM } = await imp('spacedatastandards.org/lib/js/OCM/OCM.js');
const { PCFT, PCF } = await imp('spacedatastandards.org/lib/js/PCF/PCF.js');
const { PCFOutputT } = await imp('spacedatastandards.org/lib/js/PCF/PCFOutput.js');
const { pcfOutputFrame } = await imp('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js');
const { createStandaloneHarness } = await imp('space-data-module-sdk/testing/isomorphic');

const RE_KM = 6378.137, MU = 398600.4418, DECAY_ALT_KM = 100, BARS = [100, 200, 500], GROUP_E = [0.1, 0.8], GROUP_HP_KM = 500;
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const r1 = (x) => Math.round(x * 10) / 10;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const TYPE = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
const ocmOf = (bytes) => OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(bytes)));

// ---- the inputs
const truthFile = opt('truth'), seedFile = opt('seeds'), recordFiles = (opt('records') ?? '').split(',').filter(Boolean), wasmFile = opt('wasm');
if (!truthFile || !seedFile || !recordFiles.length || !wasmFile) { console.error('usage: reduce.mjs --truth <stream> --seeds <stream> --records <stream>[,...] --wasm <module.wasm> [--sha256 <hex>] [--out <file>] [--compare <json>]'); process.exit(2); }
const wasmBytes = fs.readFileSync(wasmFile), wasmSha = sha(wasmBytes);
if (opt('sha256') && wasmSha !== opt('sha256')) throw new Error(`the module is ${wasmSha}, not ${opt('sha256')}`);

const t0 = Date.now(), newest = args.includes('--newest');
const identity = (o) => {
  const m = o.METADATA, h = o.HEADER;
  if (!h?.MESSAGE_ID || h.MESSAGE_STATUS !== 3 || m?.CATALOG_NAME !== 'SYNTHETIC-ORBITS' || m.NORAD_CAT_ID !== 0 || !m.OBJECT_NAME || m.OBJECT_DESIGNATOR !== m.OBJECT_NAME)
    throw new Error(`record lacks study identity: ${h?.MESSAGE_ID ?? '(unnamed)'}`);
  return m.OBJECT_NAME;
};
const index = (files) => {
  const map = new Map(); let count = 0;
  for (const file of files) for (const fr of frames(file)) {
    const o = ocmOf(fr.bytes).unpack(), caseId = identity(o);
    putUnique(map, o.HEADER.MESSAGE_ID, { file, offset: fr.offset, size: fr.size, sha256: sha(fr.bytes), caseId,
      technique: o.MEAN_ELEMENTS?.MEAN_ELEMENT_THEORY }, o.HEADER.CREATION_DATE, newest);
    count += 1;
  }
  return { map, count };
};
const { map: seeds } = index([seedFile]), { map: truthFrames } = index([truthFile]);
const { map: byId, count: framesRead } = index(recordFiles), records = new Map();
for (const [id, ref] of byId) putUnique(records, `${ref.caseId}:${ref.technique}`, { ...ref, id }, ref.creation, newest);
const bytesOf = (f) => readFrame(f.file, f);
const truthOf = (f) => {
  const o = ocmOf(bytesOf(f)).unpack(), data = Float64Array.from(o.STATE_DATA);
  if (o.STATE_VECTOR_SIZE !== 6 || o.STATE_STEP_SIZE !== 300 || data.length % 6) throw new Error('invalid-truth-grid');
  let lowK = -1;
  for (let k = 0; k < data.length / 6; k += 1) if (Math.hypot(data[6*k], data[6*k+1], data[6*k+2]) - RE_KM < DECAY_ALT_KM) { lowK = k; break; }
  return { o, data, lowK, count: data.length / 6, startMs: Date.parse(`${o.METADATA.START_TIME}Z`), stepMs: o.STATE_STEP_SIZE * 1000 };
};
const linked = (pv, ref) => ref && pv?.SOURCE_SHA256 === ref.sha256 && BigInt(ref.size) === pv.SOURCE_BYTES;

// ---- the module's flight of a record on epochs: GCRF km
const h = await createStandaloneHarness('browser', wasmFile, { surface: 'direct' });
const flightPcf = (epochs) => { const t = new PCFT(); t.OUTPUT = Object.assign(new PCFOutputT(), { FRAME: pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new fb.Builder(1 << 14); PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
async function fly(ocm, epochMs) {
  const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: flightPcf(epochMs.map(iso)) }] });
  if (r.statusCode !== 0) throw Object.assign(new Error(String(r.errorMessage ?? 'propagation refused')), { status: r.errorCode || r.statusName || `status-${r.statusCode}` });
  const blk = OEM.getRootAsOEM(new fb.ByteBuffer(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload))).unpack().EPHEMERIS_DATA_BLOCK[0];
  if (blk.EPHEMERIS_DATA_LINES?.length) return blk.EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z]);
  const d = blk.EPHEMERIS_DATA, size = blk.STATE_VECTOR_SIZE || 6; return Array.from({ length: d.length / size }, (_, k) => [d[k * size], d[k * size + 1], d[k * size + 2]]);
}

// ---- one outcome per selected case and technique
const classes = Object.fromEntries(['within-bar', 'outside-bar', 'failed-flight', 'no-truth', 'short-truth', 'at-or-after-decay'].map((k) => [k, 0]));
const failOn = (opt('fail-on') ?? '').split(',').filter(Boolean);
for (const c of failOn) if (!(c in classes)) throw new Error(`unknown --fail-on class: ${c}`);
if (opt('limit')) throw new Error('--limit cannot account for every input record');
const rows = [];
for (const ref of records.values()) {
  const row = { record: ref.sha256.slice(0, 12), caseId: ref.caseId, technique: ref.technique, class: null };
  const finish = (kind, detail = {}) => { Object.assign(row, detail, { class: kind }); classes[kind] += 1; rows.push(row); };
  try {
    const bytes = bytesOf(ref), o = ocmOf(bytes).unpack(), pv = o.PROVENANCE;
    if (!pv?.SOURCE_ID) throw Object.assign(new Error('missing PROVENANCE.SOURCE_ID'), { status: 'missing-provenance' });
    const tf = truthFrames.get(pv.SOURCE_ID);
    if (!linked(pv, tf)) { finish('no-truth', { reason: tf ? 'source-frame-mismatch' : 'source-not-found' }); continue; }
    if (tf.caseId !== ref.caseId) throw Object.assign(new Error('fit and truth case identities differ'), { status: 'case-identity-mismatch' });
    const t = truthOf(tf), sf = seeds.get(t.o.PROVENANCE?.SOURCE_ID);
    if (!linked(t.o.PROVENANCE, sf) || sf.caseId !== ref.caseId) throw Object.assign(new Error('truth and seed identities differ: mismatched seed/truth pair; conversion publishes seeds then truths in separate renames'), { status: 'seed-identity-mismatch' });
    const me = ocmOf(bytesOf(sf)).unpack().MEAN_ELEMENTS;
    const a = (MU / (((me.MEAN_MOTION * 2 * Math.PI) / 86400) ** 2)) ** (1 / 3);
    row.e = me.ECCENTRICITY; row.perigeeKm = Math.round(a * (1 - me.ECCENTRICITY) - RE_KM);
    const od = o.ORBIT_DETERMINATION?.FIT_STATISTICS ?? {}, fitStart = od.FIT_START ?? o.MEAN_ELEMENTS?.EPOCH;
    const d0 = Date.parse(`${fitStart}Z`), endMs = od.FIT_STOP ? Date.parse(`${od.FIT_STOP}Z`) : d0 + 120 * 3600e3;
    if (!Number.isFinite(d0) || !Number.isFinite(endMs) || endMs < d0) throw Object.assign(new Error('invalid fit span'), { status: 'invalid-fit-span' });
    const k0 = (d0 - t.startMs) / t.stepMs;
    if (t.lowK >= 0 && k0 >= t.lowK) { finish('at-or-after-decay'); continue; }
    if (!t.count || k0 >= t.count) { finish('short-truth', { spanH: 0, states: 0 }); continue; }
    if (!Number.isInteger(k0) || k0 < 0) throw Object.assign(new Error('truth grid does not hold cutoff'), { status: 'cutoff-off-grid' });
    const n = Math.min(Math.floor((endMs - d0) / t.stepMs) + 1, (t.lowK < 0 ? t.count : t.lowK) - k0);
    const grid = Array.from({ length: n }, (_, k) => d0 + k * t.stepMs);
    const flown = await fly(new Uint8Array(bytes), grid);
    if (flown.length !== n || flown.some((p) => p.length !== 3 || p.some((x) => !Number.isFinite(x)))) throw Object.assign(new Error('incomplete or nonfinite ephemeris'), { status: 'invalid-module-ephemeris' });
    let D = 0;
    for (let i = 0; i < n; i += 1) { const k = (k0 + i) * 6; D = Math.max(D, Math.hypot(...flown[i].map((x, j) => x - t.data[k+j])) * 1000); }
    row.D = r1(D); row.spanH = r1((n - 1) * t.stepMs / 3600e3); row.states = n;
    finish((n - 1) * t.stepMs < Math.max(120 * 3600e3, endMs - d0) ? 'short-truth' : row.D <= 100 ? 'within-bar' : 'outside-bar');
  } catch (e) { finish('failed-flight', { status: e.status ?? 'invalid-record', reason: String(e.message).slice(0, 200) }); }
}
const accounted = Object.values(classes).reduce((a, b) => a + b, 0), superseded = framesRead - records.size;
if (accounted !== records.size || accounted + superseded !== framesRead) throw new Error('input accounting mismatch');
const scored = rows.filter((r) => Number.isFinite(r.D));
const within = (bar) => rows.filter((r) => ['within-bar', 'outside-bar'].includes(r.class) && r.D <= bar).length;
const group = (o) => o.e < GROUP_E[0] ? o.perigeeKm <= GROUP_HP_KM ? 'circLow' : 'circHigh' : o.e < GROUP_E[1] ? o.perigeeKm <= GROUP_HP_KM ? 'eccLow' : 'eccHigh' : 'e08';
const outsideByGroup = Object.fromEntries(['circLow', 'circHigh', 'eccLow', 'eccHigh', 'e08'].map((g) => [g, 0]));
for (const r of rows) if (r.class === 'outside-bar') outsideByGroup[group(r)] += 1;
const counts = { recordsRead: framesRead, selectedRecords: records.size, supersededRecords: superseded, accountedRecords: accounted,
  classes, withApResult: scored.length, within100m: within(100), within200m: within(200), within500m: within(500), outsideByGroup,
  outsideByGroupSum: classes['outside-bar'], resultsWhoseTruthEndsBeforeSpan: classes['short-truth'],
  recordsWithNoTruthFlight: classes['no-truth'], seedsInStream: seeds.size, truthFlightsInStream: truthFrames.size };
const missing = ['A fit refused before a fitted record exists is not an input record. A truth without a fitted record does not establish why the fit is absent.'];
const table = { counts, cases: rows, missing };
const out = { module: { wasmSha256: wasmSha }, inputs: { truthFlights: truthFrames.size, seeds: seeds.size, records: framesRead }, seconds: r1((Date.now() - t0) / 1000), ...table };
let failed = failOn.some((c) => classes[c] > 0);
if (opt('compare')) {
  const expected = JSON.parse(fs.readFileSync(opt('compare'), 'utf8'));
  out.comparison = { equal: isDeepStrictEqual(table, { counts: expected.counts, cases: expected.cases, missing: expected.missing }) };
  failed ||= !out.comparison.equal;
}
if (opt('out')) fs.writeFileSync(opt('out'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
process.exit(failed ? 1 : 0);
