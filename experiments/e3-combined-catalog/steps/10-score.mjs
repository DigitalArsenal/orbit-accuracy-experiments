#!/usr/bin/env node
// E3 step 10: every source's error against the reference states, per sample,
// for one window (PLAN.md sections 4 and 5).
//
// - ST: Space-Track element sets through analysis/gp-error-model `accumulate`
//   (SGP4, TEME -> GCRF, RTN in the reference state's axes), one call per set
//   with +-binHalfWidthSeconds age bins around each wanted reference epoch.
// - URA / URA-IGS: ultra-rapid states (analysis/reference-states output) at
//   the same reference epochs.
// - HPOP-URA: propagator/hpop from the ultra-rapid state at the issue time.
// The harness subtracts GCRF positions and projects the difference on the
// reference state's R, T, N unit vectors (bookkeeping, as V1 takes norms).
//
//   node experiments/e3-combined-catalog/steps/10-score.mjs --window train|test
//        [--modules DIR] [--archive DIR] [--reference DIR] [--days N] [--no-hpop]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { json, loadModule, sha256 } from '../../../harness/modules.mjs';
import { readElementSets, epochMs } from '../../../harness/gp-archive.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { decodeExecution, executionFrame, kernelFrame } from '../../../harness/prw.mjs';
import { eopFrame } from '../../../harness/eop.mjs';
import { convertIso } from '../../../harness/time.mjs';
import { cli, config, configPath } from '../common.mjs';
import { Products } from '../truth.mjs';
import { finalsRecords } from '../eop-finals.mjs';

const DAY = 86400000;
const { values, window, issueTimes, modules, archive, reference: referenceDir } = cli({ 'no-hpop': { type: 'boolean' } });
const run = startRun({ experiment: config.experiment, step: `10-score-${window.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const iso = (ms) => new Date(ms).toISOString();
const tolMs = config.targetToleranceSeconds * 1000;

// ── Reference states and objects by regime ──
const truth = new Products(referenceDir, config.truthPrefixes);
const regimeOf = new Map();
for (const [regime, spec] of Object.entries(config.regimes)) {
  if (spec.objects) for (const n of Object.keys(spec.objects)) regimeOf.set(Number(n), regime);
}
for (const n of truth.objects()) {
  if (regimeOf.has(n)) continue;
  if (truth.entries(n).some((e) => e.product.startsWith(config.regimes.GPS.truthPrefix) && e.comment.includes(`SP3 satellite ${config.regimes.GPS.sp3System}`))) regimeOf.set(n, 'GPS');
}
// GPS objects take their reference only from the GNSS final orbits.
const gpsTruth = new Products(referenceDir, [config.regimes.GPS.truthPrefix]);
const reference = (n) => (regimeOf.get(n) === 'GPS' ? gpsTruth : truth);
const objects = [...regimeOf.keys()].filter((n) => reference(n).entries(n).length).sort((a, b) => a - b);
log(`${objects.length} objects with reference states: ${Object.keys(config.regimes).map((r) => `${r} ${objects.filter((n) => regimeOf.get(n) === r).length}`).join(', ')}`);

// ── Space-Track element sets ──
const from = iso(issueTimes[0] - 10 * DAY).slice(0, 10), to = iso(issueTimes.at(-1)).slice(0, 10);
const wanted = new Set(objects);
const { sets, files, duplicates } = readElementSets(archive, from, to, {
  keep: (n) => wanted.has(n), lagDays: config.elementSets.creationLagDays,
  theory: config.elementSets.meanElementTheory, ephemerisType: config.elementSets.ephemerisType, duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds,
});
run.addInputs('gpHistory', files);
const setsOf = new Map();
const setById = new Map(sets.map((s) => [s.gpId, s]));
for (const s of sets) {
  s.epochMs = epochMs(s.epoch);
  s.createdMs = epochMs(s.creationDate);
  if (!setsOf.has(s.norad)) setsOf.set(s.norad, []);
  setsOf.get(s.norad).push(s);
}
log(`${sets.length} element sets (${duplicates} republished duplicates merged), epochs ${from}..${to}`);

// ── Ultra-rapid products ──
const startOf = (product) => {
  const m = /_(\d{4})(\d{3})(\d{2})(\d{2})_/.exec(product);
  return Date.UTC(Number(m[1]), 0, 1) + (Number(m[2]) - 1) * DAY + Number(m[3]) * 3600000 + Number(m[4]) * 60000;
};
const ultras = Object.fromEntries(['URA', 'URA-IGS'].map((id) => {
  const spec = config.sources[id];
  const p = new Products(referenceDir, [spec.productPrefix]);
  return [id, { spec, products: p, issues: p.products.map((x) => ({ product: x.product, start: startOf(x.product) })).sort((a, b) => a.start - b.start) }];
}));
// The newest issue available at time t, and whether it covers tMs.
const newestIssue = (u, t) => u.issues.filter((x) => x.start + u.spec.availableAfterStartHours * 3600000 <= t).at(-1) ?? null;

// ── Targets: (object, issue time, horizon) -> the reference epoch ──
const offsetMs = config.issueOffsetSeconds * 1000;
const targets = [];
for (const n of objects) {
  for (const day of issueTimes) {
    const T = day + offsetMs;
    for (const h of config.horizonsDays) {
      const state = reference(n).firstAtOrAfter(n, T + h * DAY, tolMs);
      targets.push({ norad: n, regime: regimeOf.get(n), T, h, state });
    }
  }
}
log(`${targets.length} targets, ${targets.filter((t) => !t.state).length} without a reference state`);

// ── ST: which sets each target needs ──
const need = new Map();  // gpId -> {set, epochs: Map(ms -> state)}
const want = (s, state) => {
  if (!need.has(s.gpId)) need.set(s.gpId, { set: s, epochs: new Map() });
  need.get(s.gpId).epochs.set(state.ms, state);
};
for (const t of targets) {
  if (!t.state) continue;
  const available = (setsOf.get(t.norad) ?? []).filter((s) => s.createdMs <= t.T).sort((a, b) => b.epochMs - a.epochMs || b.createdMs - a.createdMs);
  t.st = available.slice(0, 3).map((s) => s.gpId);
  for (const s of available.slice(0, 3)) want(s, t.state);
}
// Per-record ages: each set with its epoch in the window, at the first
// reference epoch at or after epoch + a.
const records = [];
for (const n of objects) {
  for (const s of setsOf.get(n) ?? []) {
    if (s.epochMs < issueTimes[0] + offsetMs || s.epochMs >= issueTimes.at(-1) + offsetMs + DAY) continue;
    for (const a of config.horizonsDays) {
      const state = reference(n).firstAtOrAfter(n, s.epochMs + a * DAY, tolMs);
      records.push({ norad: n, regime: regimeOf.get(n), gpId: s.gpId, epoch: s.epoch, a, state });
      if (state) want(s, state);
    }
  }
}

const gpModel = await loadModule(modules, 'analysis/gp-error-model');
run.addModule(gpModel.provenance);
const stError = new Map();  // `${gpId}|${ms}` -> [R,T,N] km
const counts = { stSets: need.size, stCalls: 0, stMissing: 0, stMulti: 0, propagationFailures: 0, refused: 0 };
let done = 0;
const started = performance.now();
for (const { set, epochs } of need.values()) {
  // One call per reference product file: consecutive files share boundary
  // epochs, and a bin must hold exactly one reference state.
  const byFile = new Map();
  for (const st of epochs.values()) {
    if (!byFile.has(st.entry.file)) byFile.set(st.entry.file, []);
    byFile.get(st.entry.file).push(st);
  }
  const half = config.binHalfWidthSeconds / 86400;
  for (const group of byFile.values()) {
    const wantedEpochs = group.sort((a, b) => a.ms - b.ms);
    const bins = wantedEpochs.map((st) => { const age = (st.ms - set.epochMs) / DAY; return [Math.max(0, age - half), age + half]; });
    const acc = await gpModel.invokeJson('accumulate', [ommFrame([set]), reference(set.norad).frame(wantedEpochs[0].entry), json('options', { ageBinsDays: bins, referenceStepSeconds: 0 })], 'accumulator');
    ++counts.stCalls;
    counts.propagationFailures += acc.counts.propagationFailures;
    counts.refused += acc.counts.refused;
    const byAge = new Map();
    for (const stratum of acc.strata) {
      if (stratum.n !== 1) { ++counts.stMulti; continue; }
      byAge.set(stratum.age, stratum.sum);
    }
    wantedEpochs.forEach((st, k) => {
      if (byAge.has(k)) stError.set(`${set.gpId}|${st.ms}`, byAge.get(k).slice(0, 3));
      else ++counts.stMissing;
    });
  }
  if (++done % 200 === 0) process.stderr.write(`\rST ${done}/${need.size} sets, ${((performance.now() - started) / 1000).toFixed(0)} s`);
  if (done % 500 === 0) { truth.dropCache(); gpsTruth.dropCache(); }
}
process.stderr.write('\n');
log(`ST: ${counts.stCalls} calls; ${counts.stMissing} wanted epochs without a single-sample bin; ${counts.stMulti} multi-sample bins`);

// ── RTN bookkeeping for state differences ──
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(...a); return [a[0] / n, a[1] / n, a[2] / n]; };
const rtn = (predicted, ref) => {
  const R = unit(ref.r), N = unit(cross(ref.r, ref.v)), Tt = cross(N, R);
  const d = sub(predicted, ref.r);
  return [dot(d, R), dot(d, Tt), dot(d, N)];
};

// ── HPOP from the ultra-rapid state ──
let hpop = null, time = null, kernel = null, eop = null;
const hpopNeeded = !values['no-hpop'];
if (hpopNeeded) {
  hpop = await loadModule(modules, 'propagator/hpop');
  time = await loadModule(modules, 'foundation/time');
  run.addModule(hpop.provenance);
  run.addModule(time.provenance);
  const kernelBytes = fs.readFileSync(path.join(modules, config.inputs.kernel));
  run.addInputs('kernel', { [config.inputs.kernel]: sha256(kernelBytes) });
  kernel = kernelFrame(kernelBytes);
  const parser = await loadModule(modules, 'data-source/eop-parser');
  run.addModule(parser.provenance);
  eop = await finalsRecords(parser, config.inputs.eopFinals);
  run.addInputs('eop', { [path.basename(config.inputs.eopFinals)]: eop.sha256, [`${path.basename(config.inputs.eopFinals)} (observed rows)`]: eop.observedSha256 });
  await parser.destroy();
}
const tdbCache = new Map();
const tdb = async (s) => {
  if (!tdbCache.has(s)) tdbCache.set(s, await convertIso(time, s, 'UTC', 'TDB'));
  return tdbCache.get(s);
};
const isoUtc = (ms) => iso(ms).replace('Z', '');

// ── Samples ──
const samples = [];
const push = (t, method, err, extra = {}) => samples.push({ regime: t.regime, norad: t.norad, T: iso(t.T), h: t.h, target: t.state.epoch, method, error: err, ...extra });
const byKey = new Map();  // `${norad}|${T}` -> targets by h
for (const t of targets) {
  if (!t.state) continue;
  const key = `${t.norad}|${t.T}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(t);
  // ST-latest and ST-stack3
  const errs = (t.st ?? []).map((id) => stError.get(`${id}|${t.state.ms}`));
  if (errs.length && errs[0]) {
    const s0 = setById.get(t.st[0]);
    push(t, 'ST-latest', errs[0], { ageDays: (t.state.ms - s0.epochMs) / DAY });
  }
  if (errs.length === 3 && errs.every(Boolean)) push(t, 'ST-stack3', [0, 1, 2].map((k) => (errs[0][k] + errs[1][k] + errs[2][k]) / 3));
  // URA and URA-IGS directly, inside the issue's validity
  if (t.regime === 'GPS') {
    for (const [id, u] of Object.entries(ultras)) {
      const issue = newestIssue(u, t.T);
      if (!issue || t.state.ms > issue.start + u.spec.validHours * 3600000) continue;
      const entry = u.products.entries(t.norad).find((e) => e.product === issue.product);
      const s = entry && u.products.stateAt(entry, t.state.ms);
      if (s) push(t, id, rtn(s.r, t.state), { product: issue.product, predictionHours: (t.state.ms - issue.start) / 3600000 - 24 });
    }
  }
}
log(`direct samples: ${samples.length}`);

const hpopCounts = { seeds: 0, failures: 0, noSeed: 0 };
if (hpopNeeded) {
  const u = ultras.URA;
  const gpsKeys = [...byKey.entries()].filter(([, ts]) => ts[0].regime === 'GPS');
  let k = 0;
  for (const [, ts] of gpsKeys) {
    const t0 = ts[0];
    const issue = newestIssue(u, t0.T);
    const entry = issue && u.products.entries(t0.norad).find((e) => e.product === issue.product);
    const seed = entry && u.products.stateAt(entry, t0.T);
    const later = ts.filter((t) => t.h > 0);
    if (!seed || !later.length) { ++hpopCounts.noSeed; continue; }
    ++hpopCounts.seeds;
    try {
      const epoch = await tdb(isoUtc(seed.ms));
      const sampleEpochs = [];
      for (const t of later) sampleEpochs.push(await tdb(isoUtc(t.state.ms)));
      const mjd = Math.floor(seed.ms / DAY) + 40587;
      const out = decodeExecution(await hpop.invoke('invoke', [executionFrame({
        epoch, timeScale: 'TDB', position: seed.r, velocity: seed.v, samples: sampleEpochs, target: sampleEpochs.at(-1),
        integrator: config.hpop.integrator, forces: { ...config.hpop.forces, ...config.hpop.gps }, kernel: true,
      }), kernel, eopFrame(eop.records, mjd - 1, mjd + Math.max(...config.horizonsDays) + 2)]));
      out.samples.forEach((p, i) => push(later[i], 'HPOP-URA', rtn(p.position, later[i].state), { product: issue.product }));
    } catch (error) {
      ++hpopCounts.failures;
      for (const t of later) samples.push({ regime: t.regime, norad: t.norad, T: iso(t.T), h: t.h, method: 'HPOP-URA', failure: String(error.message).slice(0, 200) });
    }
    if (++k % 50 === 0) process.stderr.write(`\rHPOP ${k}/${gpsKeys.length}`);
  }
  process.stderr.write('\n');
  log(`HPOP-URA: ${hpopCounts.seeds} seeds, ${hpopCounts.failures} failed, ${hpopCounts.noSeed} without a seed`);
}

// Per-record ST errors by age from the set's epoch.
const recordSamples = records.filter((r) => r.state && stError.has(`${r.gpId}|${r.state.ms}`))
  .map((r) => ({ regime: r.regime, norad: r.norad, epoch: r.epoch, ageDays: r.a, target: r.state.epoch, error: stError.get(`${r.gpId}|${r.state.ms}`) }));

run.addInputs('reference', { ...truth.read, ...gpsTruth.read });
for (const u of Object.values(ultras)) run.addInputs('ultraRapid', u.products.read);
run.addInputs('referenceProducts', Object.fromEntries([...truth.products, ...gpsTruth.products, ...ultras.URA.products.products, ...ultras['URA-IGS'].products.products].map((p) => [p.product, p])));
// Per-sample tables stay in runs/ (derived from Space-Track element sets).
run.write('samples.jsonl.gz', zlib.gzipSync(samples.map((s) => JSON.stringify(s)).join('\n')));
run.write('records.jsonl.gz', zlib.gzipSync(recordSamples.map((s) => JSON.stringify(s)).join('\n')));
const objectsByRegime = Object.fromEntries(Object.keys(config.regimes).map((r) => [r, objects.filter((n) => regimeOf.get(n) === r)]));
run.write('metrics.json', {
  window, issueTimes: issueTimes.length, objectsByRegime,
  counts: { ...counts, targets: targets.length, targetsWithoutReference: targets.filter((t) => !t.state).length, elementSets: sets.length, duplicates, samples: samples.length, recordSamples: recordSamples.length, hpop: hpopCounts },
  statedSigmaM: Object.fromEntries([...truth.products, ...gpsTruth.products].filter((p) => p.statedSigmaM !== null).map((p) => [p.product, p.statedSigmaM])),
});
run.finish({ timeConversions: tdbCache.size });
log(`${samples.length} samples, ${recordSamples.length} per-record samples -> ${run.dir}`);
await gpModel.destroy();
if (hpop) { await hpop.destroy(); await time.destroy(); }
