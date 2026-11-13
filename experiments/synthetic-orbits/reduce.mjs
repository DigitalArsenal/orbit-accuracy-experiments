#!/usr/bin/env node
// The synthetic set's counts from standard records only.
//
//   node experiments/synthetic-orbits/reduce.mjs --truth <truth $OEM stream> --records <fitted $OCM stream>[,<stream> ...] --wasm <module.wasm> [--sha256 <hex>] [--out <file>] [--compare <aggregate json>]
//
// Reads, and reads nothing else:
//   the truth flights, one $OEM each, in a [4-byte little-endian size][FlatBuffer] stream (truth-to-oem.mjs writes it),
//   the fitted records, one $OCM each, in such streams (records.mjs; a record named by two rows is one record),
//   a named sdn-ap module build (its SHA-256 is checked against --sha256 when given; the unsigned build only).
// It does not open a rows file, the case generator or any list of cases.
//
// For each fitted record: its cutoff D0 and the span it was fitted over come from the record (OD FIT_START, FIT_STOP). Its truth flight is
// the one $OEM whose state at D0 the record's own state at D0 agrees with: no field of the record names a case, a truth or a flight
// (every record is named the same). The module flies the record on every truth epoch from D0 to the end of the span that lies before the
// truth's first state under 100 km altitude (the Earth radius 6378.137 km is a constant here), and D is the largest 3D distance in metres,
// rounded to 0.1 m. A record is within a bar when D is at most the bar (100, 200, 500 m). The outside-by-group counts group a record
// by its eccentricity and perigee altitude as the record states them (mean elements at D0; the eccentricity 0.1 and 0.8 and the perigee 500 km
// are constants here).
// What the standard records do not carry, and so what this cannot reproduce, is printed under `missing`.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { frames } from './records.mjs';

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
const TYPE = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });

// ---- the inputs
const truthFile = opt('truth'), recordFiles = (opt('records') ?? '').split(',').filter(Boolean), wasmFile = opt('wasm');
if (!truthFile || !recordFiles.length || !wasmFile) { console.error('usage: reduce.mjs --truth <stream> --records <stream>[,...] --wasm <module.wasm> [--sha256 <hex>] [--out <file>] [--compare <json>]'); process.exit(2); }
const wasmBytes = fs.readFileSync(wasmFile), wasmSha = crypto.createHash('sha256').update(wasmBytes).digest('hex');
if (opt('sha256') && wasmSha !== opt('sha256')) throw new Error(`the module is ${wasmSha}, not ${opt('sha256')}`);

const t0 = Date.now();
const truths = [];
for (const fr of frames(truthFile)) {
  const blk = OEM.getRootAsOEM(new fb.ByteBuffer(new Uint8Array(fr.bytes))).unpack().EPHEMERIS_DATA_BLOCK[0];
  const data = Float64Array.from(blk.EPHEMERIS_DATA), startMs = Date.parse(`${blk.START_TIME}Z`), stepMs = blk.STEP_SIZE * 1000;
  if (blk.STATE_VECTOR_SIZE !== 6 || !(stepMs > 0)) throw new Error('a truth flight that is not a uniform six-component ephemeris');
  // the first state under 100 km altitude ends the scored span (-1: none)
  let lowK = -1; for (let k = 0; k < data.length / 6; k += 1) if (Math.hypot(data[6 * k], data[6 * k + 1], data[6 * k + 2]) - RE_KM < DECAY_ALT_KM) { lowK = k; break; }
  truths.push({ startMs, stepMs, count: data.length / 6, data, lowK });
}
const records = new Map();
for (const f of recordFiles) for (const fr of frames(f)) { const sha = crypto.createHash('sha256').update(fr.bytes).digest('hex'); if (!records.has(sha)) records.set(sha, Buffer.from(fr.bytes)); }

// ---- the module's flight of a record on epochs: GCRF km
const h = await createStandaloneHarness('browser', wasmFile, { surface: 'direct' });
const flightPcf = (epochs) => { const t = new PCFT(); t.OUTPUT = Object.assign(new PCFOutputT(), { FRAME: pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new fb.Builder(1 << 14); PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
async function fly(ocm, epochMs) {
  const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: flightPcf(epochMs.map(iso)) }] });
  if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}`);
  const blk = OEM.getRootAsOEM(new fb.ByteBuffer(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload))).unpack().EPHEMERIS_DATA_BLOCK[0];
  if (blk.EPHEMERIS_DATA_LINES?.length) return blk.EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z]);
  const d = blk.EPHEMERIS_DATA, size = blk.STATE_VECTOR_SIZE || 6; return Array.from({ length: d.length / size }, (_, k) => [d[k * size], d[k * size + 1], d[k * size + 2]]);
}

// ---- each record
const rows = [], unpaired = [], ambiguous = [], ambiguousRows = [], other = { spanNot120h: 0, noCutoff: 0 };
const limit = Number(opt('limit') ?? Infinity);
let seen = 0;
for (const [sha, bytes] of records) {
  if (seen >= limit) break;
  seen += 1;
  if (seen % 100 === 0) console.error(`reduce: ${seen} of ${records.size} records, ${r1((Date.now() - t0) / 1000)} s`);
  const ocm = OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(bytes))).unpack(), od = ocm.ORBIT_DETERMINATION?.FIT_STATISTICS ?? {}, me = ocm.MEAN_ELEMENTS ?? {};
  const fitStart = od.FIT_START ?? me.EPOCH, fitStop = od.FIT_STOP;
  if (!fitStart) { other.noCutoff += 1; continue; }
  const d0 = Date.parse(`${fitStart}Z`), endMs = fitStop ? Date.parse(`${fitStop}Z`) : d0 + 120 * 3600e3;
  if (Math.round((endMs - d0) / 3600e3) !== 120) other.spanNot120h += 1;
  // the candidates: truth flights that hold D0 on their grid
  const cands = truths.filter((t) => d0 >= t.startMs && (d0 - t.startMs) % t.stepMs === 0 && (d0 - t.startMs) / t.stepMs < t.count);
  // the record is flown once on the span's grid from D0 (the grid every candidate shares); its truth is the candidate it stays closest to over the span (the largest distance, D), and the pairing is refused
  // when the second closest is not clearly farther (at least three times D): several flights of one case (other settings, other lead) start from nearly one state
  const grid = Array.from({ length: Math.floor((endMs - d0) / 300e3) + 1 }, (_, k) => d0 + k * 300e3), flownAll = await fly(new Uint8Array(bytes), grid);
  const near = cands.filter((t) => { const o = ((d0 - t.startMs) / t.stepMs) * 6; return Math.hypot(flownAll[0][0] - t.data[o], flownAll[0][1] - t.data[o + 1], flownAll[0][2] - t.data[o + 2]) < 50; });   // within 50 km of the record's own state at D0
  const scored = near.map((t) => {
    const k0 = (d0 - t.startMs) / t.stepMs, lowK = t.lowK;
    const ks = []; for (let i = 0; i < grid.length; i += 1) { const k = k0 + i; if (k >= t.count || (lowK >= 0 && k >= lowK)) break; ks.push(k); }
    let D = 0, sq = 0; ks.forEach((k, i) => { const s = flownAll[i], o = k * 6, m = Math.hypot(s[0] - t.data[o], s[1] - t.data[o + 1], s[2] - t.data[o + 2]) * 1000; if (m > D) D = m; sq += m * m; });
    // the root mean square of the 3D distance over the span, and the record's own statement of the fit it came from (OD FIT_RMS_KM): the truth a record was fitted to is the one whose rms matches that statement
    return { t, ks, D: ks.length ? D : Infinity, rms: ks.length ? Math.sqrt(sq / ks.length) : Infinity };
  });
  // the pairing: the candidate whose rms over the span is the fit rms the record states (OD FIT_RMS_KM); without that statement, the candidate it stays closest to
  const statedM = (od.FIT_RMS_KM ?? 0) * 1000;
  for (const s of scored) s.off = statedM > 0 ? Math.abs(s.rms - statedM) : s.D;
  scored.sort((x, y) => x.off - y.off);
  if (opt('debug') && scored.length > 1) console.error(`rms ${sha.slice(0, 8)} stated ${r1((od.FIT_RMS_KM ?? 0) * 1000 * 1e3) / 1e3} m, states ${od.FIT_STATES}: ${scored.slice(0, 4).map((s) => `D ${r1(s.D)} rms3 ${r1(s.rms * 1e3) / 1e3} rmsComp ${r1((s.rms / Math.sqrt(3)) * 1e3) / 1e3} n ${s.ks.length}`).join(' | ')}`);
  if (!scored.length || !Number.isFinite(scored[0].D) || !scored[0].ks.length) { unpaired.push(sha.slice(0, 12)); continue; }
  // refused when no candidate states the record's rms to within 0.01 m, or when a second candidate is not at least five times farther from it (flights that are the same to the rounding of the statement)
  if ((statedM > 0 && scored[0].off > Math.max(0.01, 1e-4 * statedM)) || (scored[1] && scored[1].off < 5 * scored[0].off && !(Buffer.from(scored[1].t.data.buffer).equals(Buffer.from(scored[0].t.data.buffer))))) { if (opt('debug')) console.error(`ambiguous ${sha.slice(0, 8)}: stated ${r1(statedM * 1e3) / 1e3} m, states ${od.FIT_STATES}, near ${near.length}: ${scored.slice(0, 3).map((s) => `off ${s.off.toFixed(4)} D ${r1(s.D)} rms ${r1(s.rms * 1e3) / 1e3} n ${s.ks.length} start ${iso(s.t.startMs)} identical ${Buffer.from(s.t.data.buffer).equals(Buffer.from(scored[0].t.data.buffer))}`).join(' | ')}`); ambiguous.push(sha.slice(0, 12)); {
    // for the sensitivity printed beside the counts only: the candidate this record stays closest to (the largest distance D), as if the pairing were taken
    const c = scored.reduce((m, s) => (s.D < m.D ? s : m), scored[0]), a2 = (MU / (((me.MEAN_MOTION ?? 0) * 2 * Math.PI) / 86400) ** 2) ** (1 / 3);
    ambiguousRows.push({ D: r1(c.D), spanH: r1((c.t.startMs + c.ks.at(-1) * c.t.stepMs - d0) / 3600e3), e: me.ECCENTRICITY, hpKm: a2 * (1 - (me.ECCENTRICITY ?? 0)) - RE_KM });
  } continue; }
  const { t, ks, D } = scored[0];
  const a = (398600.4418 / (((me.MEAN_MOTION ?? 0) * 2 * Math.PI) / 86400) ** 2) ** (1 / 3), hp = a * (1 - (me.ECCENTRICITY ?? 0)) - RE_KM;
  rows.push({ sha, D: r1(D), spanH: r1((t.startMs + ks.at(-1) * t.stepMs - d0) / 3600e3), e: me.ECCENTRICITY, hpKm: hp, states: ks.length });
}

// ---- the counts, as the aggregate prints them
const within = (x, xs = rows) => xs.filter((o) => o.D <= x).length;
const group = (o) => (o.e < GROUP_E[0] ? (o.hpKm <= GROUP_HP_KM ? 'circLow' : 'circHigh') : o.e < GROUP_E[1] ? (o.hpKm <= GROUP_HP_KM ? 'eccLow' : 'eccHigh') : 'e08');
const outsideByGroup = {}; for (const o of rows) if (o.D > 100) outsideByGroup[group(o)] = (outsideByGroup[group(o)] ?? 0) + 1;
const counts = {
  recordsRead: records.size, withApResult: rows.length, within100m: within(100), within200m: within(200), within500m: within(500),
  outsideByGroup, outsideByGroupSum: rows.filter((o) => o.D > 100).length, resultsWhoseTruthEndsBeforeSpan: rows.filter((o) => o.spanH < 120).length,
  recordsWithNoTruthFlight: unpaired.length, recordsWithAmbiguousTruth: ambiguous.length, spansNot120h: other.spanNot120h,
};
// the same counts if each record whose truth flight is not told apart were paired with the flight it stays closest to: a sensitivity, not the reduction
{
  const all = [...rows, ...ambiguousRows], og = {}; for (const o of all) if (o.D > 100) og[group(o)] = (og[group(o)] ?? 0) + 1;
  counts.ifClosestFlightIsTaken = { withApResult: all.length, within100m: within(100, all), within200m: within(200, all), within500m: within(500, all), outsideByGroup: og, outsideByGroupSum: all.filter((o) => o.D > 100).length, resultsWhoseTruthEndsBeforeSpan: all.filter((o) => o.spanH < 120).length };
}
const missing = [
  'seededCases (965): the cases the generator made. No standard record names the universe a set was drawn from.',
  'withoutNumericalForecast (23) and its three reasons (a decay before the cutoff, no truth, a truth that ends before the span): a flight that failed has no states, so it has no $OEM; the reason is text with no field. Only a truth that ends early is a record, and a case with no fit has no $OCM.',
  'refusedByAp (0 here) and withNumericalForecast: a case whose fit was refused has a truth and no $OCM; the truths of the stream include flights of other builds and settings, so which truth belongs to which release is not in a record.',
  'the link from a fitted record to its truth flight: every record is named the same (OBJECT_NAME and NORAD_CAT_ID are one made-up pair), the $OEM names its case in OBJECT_NAME and its flight in MESSAGE_ID; this reduction joins them by agreement of states at the cutoff.',
  'the case\'s group (circular or eccentric, perigee under or over 500 km) as the generator seeded it: here the group is read from the fitted record\'s mean elements, which differ from the seeded ones; a case near a boundary can change group.',
  'the bar (100, 200, 500 m) and the group boundaries (e 0.1 and 0.8, perigee 500 km): constants of the claim; no standard record carries a threshold or a class definition.',
  'the listed set of 874 cases: the ids that had a stored result before a date; a list of ids made by history, in no record.',
  'the rule degrees (zonal 70 for e at or under 0.3 with perigee under 2,500 km, else 20): the module needs them only to fit; the fitted record states what it was fitted with (PERTURBATIONS), but which row of two fits of a case is the one the rule gives is a choice of the aggregate.',
  'the truth flight\'s settings (force terms, tolerance, areas over mass, builds of the numerical propagator, the origin of the starting state, the cache key) and its wall time: no $OEM field.',
  'the decay cut: a state under 100 km altitude ends the scored span; the Earth radius it is computed with is a constant, not a field.',
];
const out = { module: { wasmSha256: wasmSha }, inputs: { truthFlights: truths.length, records: records.size }, seconds: r1((Date.now() - t0) / 1000), counts, cases: rows.map((o) => ({ record: o.sha.slice(0, 12), D: o.D, spanH: o.spanH, e: o.e, perigeeKm: r1(o.hpKm), states: o.states })), missing };
let diffs = null;
const cmp = opt('compare');
if (cmp) {
  const t = JSON.parse(fs.readFileSync(cmp, 'utf8')).counts, mine = { withApResult: counts.withApResult, within100m: counts.within100m, within200m: counts.within200m, within500m: counts.within500m, outsideByGroupSum: counts.outsideByGroupSum, 'resultsWhoseTruthEndsBeforeSpan.count': counts.resultsWhoseTruthEndsBeforeSpan };
  const g = t.outsideByGroup ?? {}; for (const k of ['circLow', 'eccLow', 'eccHigh', 'e08']) mine[`outsideByGroup.${k}`] = outsideByGroup[k] ?? 0;
  const want = { withApResult: t.withApResult, within100m: t.within100m, within200m: t.within200m, within500m: t.within500m, outsideByGroupSum: t.outsideByGroupSum, 'resultsWhoseTruthEndsBeforeSpan.count': t.resultsWhoseTruthEndsBeforeSpan?.count };
  for (const k of ['circLow', 'eccLow', 'eccHigh', 'e08']) want[`outsideByGroup.${k}`] = g[k]?.count;
  diffs = Object.fromEntries(Object.keys(want).map((k) => [k, { aggregate: want[k], reduced: mine[k], equal: want[k] === mine[k] }]));
  out.comparedWith = cmp; out.comparison = diffs;
}
if (opt('out')) fs.writeFileSync(opt('out'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
