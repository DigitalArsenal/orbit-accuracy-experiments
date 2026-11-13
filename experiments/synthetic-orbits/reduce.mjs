#!/usr/bin/env node
// The synthetic set's counts from standard records only.
//
//   node experiments/synthetic-orbits/reduce.mjs --truth <truth $OCM stream> --seeds <seed $OCM stream> --records <fitted $OCM stream>[,<stream> ...] --wasm <module.wasm> [--sha256 <hex>] [--out <file>] [--compare <aggregate json>]
//
// Reads, and reads nothing else:
//   the truth flights, one $OCM each (STATE_DATA from METADATA.START_TIME at STATE_STEP_SIZE), in a [4-byte little-endian size][FlatBuffer] stream (truth-to-ocm.mjs writes it),
//   the seeds, one $OCM each (a case's mean elements at the epoch its truth starts), in such a stream (the same script),
//   the fitted records, one $OCM each, in such streams (records.mjs; reissue-records.mjs / identity.mjs completeFit fill their identity),
//   a named sdn-ap module build (its SHA-256 is checked against --sha256 when given; the unsigned build only).
// It does not open a rows file, the case generator or any list of cases.
//
// The links are in the records (identity.mjs): a fitted record's PROVENANCE.SOURCE_ID is the MESSAGE_ID of the truth flight it was fitted to (its SOURCE_SHA256 and SOURCE_BYTES must be that
// flight's frame, else the record has no truth flight here); a truth flight's PROVENANCE.SOURCE_ID is the MESSAGE_ID of the seed it started from, and the seed's mean elements give the
// case's group. For each fitted record: its cutoff D0 and the span it was fitted over come from the record (OD FIT_START, FIT_STOP). The module flies the record on every truth epoch
// from D0 to the end of the span that lies before the truth's first state under 100 km altitude (the Earth radius 6378.137 km is a constant here), and D is the largest 3D distance in
// metres, rounded to 0.1 m. A record is within a bar when D is at most the bar (100, 200, 500 m). The outside-by-group counts group a record by the seed's eccentricity and perigee
// altitude (from its mean motion and eccentricity, rounded to a whole km; the eccentricity 0.1 and 0.8 and the perigee 500 km are constants of the claim here).
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
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const TYPE = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
const ocmOf = (bytes) => OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(bytes)));

// ---- the inputs
const truthFile = opt('truth'), seedFile = opt('seeds'), recordFiles = (opt('records') ?? '').split(',').filter(Boolean), wasmFile = opt('wasm');
if (!truthFile || !seedFile || !recordFiles.length || !wasmFile) { console.error('usage: reduce.mjs --truth <stream> --seeds <stream> --records <stream>[,...] --wasm <module.wasm> [--sha256 <hex>] [--out <file>] [--compare <json>]'); process.exit(2); }
const wasmBytes = fs.readFileSync(wasmFile), wasmSha = sha(wasmBytes);
if (opt('sha256') && wasmSha !== opt('sha256')) throw new Error(`the module is ${wasmSha}, not ${opt('sha256')}`);

const t0 = Date.now();
// the seeds: MESSAGE_ID -> the case's group measures, read from the seed's mean elements
const seeds = new Map();
for (const fr of frames(seedFile)) {
  const o = ocmOf(fr.bytes).unpack(), me = o.MEAN_ELEMENTS, a = (MU / (((me.MEAN_MOTION * 2 * Math.PI) / 86400) ** 2)) ** (1 / 3);
  seeds.set(o.HEADER.MESSAGE_ID, { e: me.ECCENTRICITY, hpKm: Math.round(a * (1 - me.ECCENTRICITY) - RE_KM) });
}
// the truth flights: MESSAGE_ID -> where its frame is (read when a record names it)
const truthFrames = new Map();
for (const fr of frames(truthFile)) truthFrames.set(ocmOf(fr.bytes).HEADER().MESSAGE_ID(), { bytes: fr.bytes, sha: sha(fr.bytes) });
const truthCache = new Map();
const truthOf = (id) => {
  if (truthCache.has(id)) return truthCache.get(id);
  const f = truthFrames.get(id); if (!f) return null;
  const o = ocmOf(f.bytes).unpack(), data = Float64Array.from(o.STATE_DATA);
  if (o.STATE_VECTOR_SIZE !== 6 || !(o.STATE_STEP_SIZE > 0)) throw new Error('a truth flight that is not a uniform six-component ephemeris');
  // the first state under 100 km altitude ends the scored span (-1: none)
  let lowK = -1; for (let k = 0; k < data.length / 6; k += 1) if (Math.hypot(data[6 * k], data[6 * k + 1], data[6 * k + 2]) - RE_KM < DECAY_ALT_KM) { lowK = k; break; }
  const t = { id, startMs: Date.parse(`${o.METADATA.START_TIME}Z`), stepMs: o.STATE_STEP_SIZE * 1000, count: data.length / 6, data, lowK, seedId: o.PROVENANCE?.SOURCE_ID, sha: f.sha, bytes: f.bytes.length };
  truthCache.set(id, t); return t;
};
const records = new Map();
for (const f of recordFiles) for (const fr of frames(f)) { const s = sha(fr.bytes); if (!records.has(s)) records.set(s, Buffer.from(fr.bytes)); }

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
const rows = [], unpaired = [], noSeed = [], other = { spanNot120h: 0, noCutoff: 0, truthDoesNotHoldCutoff: 0 };
const limit = Number(opt('limit') ?? Infinity);
let seen = 0;
for (const [s, bytes] of records) {
  if (seen >= limit) break;
  seen += 1;
  if (seen % 100 === 0) console.error(`reduce: ${seen} of ${records.size} records, ${r1((Date.now() - t0) / 1000)} s`);
  const ocm = ocmOf(bytes).unpack(), od = ocm.ORBIT_DETERMINATION?.FIT_STATISTICS ?? {}, pv = ocm.PROVENANCE;
  const fitStart = od.FIT_START ?? ocm.MEAN_ELEMENTS?.EPOCH, fitStop = od.FIT_STOP;
  if (!fitStart) { other.noCutoff += 1; continue; }
  // the truth flight the record names, whose frame must be the one the record's SOURCE_SHA256 and SOURCE_BYTES say
  const t = pv?.SOURCE_ID ? truthOf(pv.SOURCE_ID) : null;
  if (!t || t.sha !== pv.SOURCE_SHA256 || BigInt(t.bytes) !== pv.SOURCE_BYTES) { unpaired.push(s.slice(0, 12)); continue; }
  const seed = seeds.get(t.seedId); if (!seed) { noSeed.push(s.slice(0, 12)); continue; }
  const d0 = Date.parse(`${fitStart}Z`), endMs = fitStop ? Date.parse(`${fitStop}Z`) : d0 + 120 * 3600e3;
  if (Math.round((endMs - d0) / 3600e3) !== 120) other.spanNot120h += 1;
  if (d0 < t.startMs || (d0 - t.startMs) % t.stepMs !== 0 || (d0 - t.startMs) / t.stepMs >= t.count) { other.truthDoesNotHoldCutoff += 1; continue; }
  // the record flown once on the span's grid from D0 (the grid the flight shares), against the flight's states from D0 to the end of the span or the flight's decay
  const grid = Array.from({ length: Math.floor((endMs - d0) / 300e3) + 1 }, (_, k) => d0 + k * 300e3), flown = await fly(new Uint8Array(bytes), grid);
  const k0 = (d0 - t.startMs) / t.stepMs, ks = [];
  for (let i = 0; i < grid.length; i += 1) { const k = k0 + i; if (k >= t.count || (t.lowK >= 0 && k >= t.lowK)) break; ks.push(k); }
  let D = 0; ks.forEach((k, i) => { const p = flown[i], o = k * 6, m = Math.hypot(p[0] - t.data[o], p[1] - t.data[o + 1], p[2] - t.data[o + 2]) * 1000; if (m > D) D = m; });
  if (!ks.length) { unpaired.push(s.slice(0, 12)); continue; }
  rows.push({ sha: s, D: r1(D), spanH: r1((t.startMs + ks.at(-1) * t.stepMs - d0) / 3600e3), e: seed.e, hpKm: seed.hpKm, states: ks.length });
}

// ---- the counts, as the aggregate prints them
const within = (x) => rows.filter((o) => o.D <= x).length;
const group = (o) => (o.e < GROUP_E[0] ? (o.hpKm <= GROUP_HP_KM ? 'circLow' : 'circHigh') : o.e < GROUP_E[1] ? (o.hpKm <= GROUP_HP_KM ? 'eccLow' : 'eccHigh') : 'e08');
const outsideByGroup = {}; for (const o of rows) if (o.D > 100) outsideByGroup[group(o)] = (outsideByGroup[group(o)] ?? 0) + 1;
const counts = {
  recordsRead: records.size, withApResult: rows.length, within100m: within(100), within200m: within(200), within500m: within(500),
  outsideByGroup, outsideByGroupSum: rows.filter((o) => o.D > 100).length, resultsWhoseTruthEndsBeforeSpan: rows.filter((o) => o.spanH < 120).length,
  recordsWithNoTruthFlight: unpaired.length, recordsWithNoSeed: noSeed.length, spansNot120h: other.spanNot120h, truthsNotHoldingCutoff: other.truthDoesNotHoldCutoff,
  seedsInStream: seeds.size, truthFlightsInStream: truthFrames.size,
};
const missing = [
  'withoutNumericalForecast (23) and its three reasons (a decay before the cutoff, no truth, a truth that ends before the span): a case whose flight has no states has no truth record, by decision; the reason is not in a standard record and stays in the aggregate. A truth that ends early is a record (its states stop).',
  'refusedByAp (0 here): a case whose fit was refused has a truth and no fitted record; the seed and the truth are in the streams, so such a case is a truth no record names.',
  'the bar (100, 200, 500 m) and the group boundaries (e 0.1 and 0.8, perigee 500 km): constants of the claim; no standard record carries a threshold or a class definition.',
  'the listed set of 874 cases: the ids that had a stored result before a date; a list of ids made by history, in no record.',
  'the rule degrees (zonal 70 for e at or under 0.3 with perigee under 2,500 km, else 20): the module needs them only to fit; the fitted record states what it was fitted with (PERTURBATIONS).',
  'the truth flight\'s tolerance and force terms beyond the degree and order, the builds of the numerical propagator and the cache key: the truth $OCM states the degree, order, tolerance and its two numbers; the rest stays in the rows.',
  'the decay cut: a state under 100 km altitude ends the scored span; the Earth radius it is computed with is a constant, not a field.',
];
const out = { module: { wasmSha256: wasmSha }, inputs: { truthFlights: truthFrames.size, seeds: seeds.size, records: records.size }, seconds: r1((Date.now() - t0) / 1000), counts, cases: rows.map((o) => ({ record: o.sha.slice(0, 12), D: o.D, spanH: o.spanH, e: o.e, perigeeKm: o.hpKm, states: o.states })), missing };
const cmp = opt('compare');
if (cmp) {
  const t = JSON.parse(fs.readFileSync(cmp, 'utf8')).counts, mine = { withApResult: counts.withApResult, within100m: counts.within100m, within200m: counts.within200m, within500m: counts.within500m, outsideByGroupSum: counts.outsideByGroupSum, 'resultsWhoseTruthEndsBeforeSpan.count': counts.resultsWhoseTruthEndsBeforeSpan };
  const g = t.outsideByGroup ?? {}; for (const k of ['circLow', 'eccLow', 'eccHigh', 'e08']) mine[`outsideByGroup.${k}`] = outsideByGroup[k] ?? 0;
  const want = { withApResult: t.withApResult, within100m: t.within100m, within200m: t.within200m, within500m: t.within500m, outsideByGroupSum: t.outsideByGroupSum, 'resultsWhoseTruthEndsBeforeSpan.count': t.resultsWhoseTruthEndsBeforeSpan?.count };
  for (const k of ['circLow', 'eccLow', 'eccHigh', 'e08']) want[`outsideByGroup.${k}`] = g[k]?.count;
  out.comparedWith = cmp; out.comparison = Object.fromEntries(Object.keys(want).map((k) => [k, { aggregate: want[k], reduced: mine[k], equal: want[k] === mine[k] }]));
}
if (opt('out')) fs.writeFileSync(opt('out'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
