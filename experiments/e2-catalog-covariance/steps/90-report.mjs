#!/usr/bin/env node
// E2 step 90: metrics and report for one window from its step-10 and
// step-20 runs and the train fit (step 30). On validation it makes the
// method choice (PLAN.md section 5); on test it evaluates the hypotheses
// for the frozen choice. Writes runs/<id>/{metrics.json, README.md} and,
// with --publish, copies them with the manifest to results/e2/<window>/.
//
//   node experiments/e2-catalog-covariance/steps/90-report.mjs --window validation --history RUN \
//     --products RUN[,RUN] --fit results/e2/train/fit.json [--publish]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { rng } from '../../../harness/stats.mjs';
import { assertWindowReadable, config, configPath } from '../common.mjs';
import { clusterBootstrap, energyScore, readProducts, realism, samples, usable } from '../score.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, history: { type: 'string' }, tle: { type: 'string' }, products: { type: 'string' }, fit: { type: 'string' }, publish: { type: 'boolean' }, modules: { type: 'string' } } });
assertWindowReadable(values.window);
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const run = startRun({ experiment: config.experiment, step: `90-report-${values.window}`, configPath, modulesDir: modules, args: values });
const fitBytes = fs.readFileSync(path.resolve(values.fit));
const fit = JSON.parse(fitBytes);
run.addInputs('trainFit', { [path.relative(repoRoot, path.resolve(values.fit))]: sha256(fitBytes) });
const tle = values.tle ? JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', values.tle, 'metrics.json'), 'utf8')) : null;
const history = values.history ? JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', values.history, 'metrics.json'), 'utf8')) : null;
const productRuns = values.products.split(',');
const rows = readProducts(productRuns);
for (const id of new Set(rows.map((r) => r.run))) if (!id.includes(`-20-products-${values.window}`)) throw new Error(`${id} is not a ${values.window} products run`);
for (const id of [...productRuns, ...(values.history ? [values.history] : []), ...(values.tle ? [values.tle] : [])]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', id, 'manifest.json'), 'utf8'));
  if (!manifest.finished) throw new Error(`${id} is not finished`);
  run.addInputs('runs', { [id]: sha256(fs.readFileSync(path.join(repoRoot, 'runs', id, 'manifest.json'))) });
}
const { acceptance, statistics } = config;
const metrics = { window: values.window, productRuns, historyRun: values.history ?? null, trainFit: path.relative(repoRoot, path.resolve(values.fit)), regimes: {} };

for (const [regime] of Object.entries(config.regimes)) {
  const train = fit.regimes[regime];
  if (!train) continue;
  const mine = rows.filter((r) => r.regime === regime);
  const kept = usable(mine, train.reducedChiSquareThreshold);
  const regimeOut = {
    counts: { rows: mine.length, skipped: mine.filter((r) => r.skipped).length, failed: mine.filter((r) => r.error).length,
      notConverged: mine.filter((r) => r.horizons && !r.converged).length, editedAsManeuver: mine.filter((r) => r.converged && r.reducedChiSquare > train.reducedChiSquareThreshold).length, usable: kept.length },
    failures: [...new Set(mine.filter((r) => r.error).map((r) => r.error))].slice(0, 10),
    methods: {},
  };
  const spans = [...new Set(kept.map((r) => r.spanDays))].sort((a, b) => a - b);
  for (const span of spans) {
    const bySpan = kept.filter((r) => r.spanDays === span);
    for (const [method, q] of [['F2', 0], ['F4', train.spans[span]?.q ?? 0]]) {
      const key = `${method}-${span}d`;
      const horizons = {};
      for (const days of config.products.horizonsDays) horizons[days] = realism(samples(bySpan, days, q), acceptance.h1, statistics);
      // Energy score at 1 day (method choice), per sample, cluster-bootstrapped.
      const random = rng(statistics.bootstrapSeed);
      const es = samples(bySpan, 1, q).map((s) => ({ object: s.object, es: energyScore(s, statistics.energySamples, random) }));
      const esBoot = clusterBootstrap(es, (xs) => xs.reduce((a, x) => a + x.es, 0) / xs.length, { resamples: statistics.bootstrapResamples, seed: statistics.bootstrapSeed, confidence: statistics.confidence });
      regimeOut.methods[key] = { method, spanDays: span, qM2S3: q, products: bySpan.length, energyScore1dM: { estimate: esBoot.estimate, lower: esBoot.lower, upper: esBoot.upper, n: es.length }, horizons };
    }
  }
  if (history?.regimes?.[regime]) regimeOut.history = history.regimes[regime];
  if (tle?.regimes?.[regime]) regimeOut.tleVariants = tle.regimes[regime];
  metrics.regimes[regime] = regimeOut;
}

// Method choice (validation): the lowest pooled 1-day energy score; methods
// whose bootstrap interval overlaps the best one's are ties, and a tie goes
// to the simpler method (F2 before F4, then the shorter span).
const keys = [...new Set(Object.values(metrics.regimes).flatMap((r) => Object.keys(r.methods)))];
const pooled = keys.map((key) => {
  const parts = Object.values(metrics.regimes).map((r) => r.methods[key]).filter(Boolean);
  const n = parts.reduce((a, p) => a + p.energyScore1dM.n, 0);
  const avg = (f) => parts.reduce((a, p) => a + f(p) * p.energyScore1dM.n, 0) / n;
  return { key, method: parts[0].method, spanDays: parts[0].spanDays, n, estimate: avg((p) => p.energyScore1dM.estimate), lower: avg((p) => p.energyScore1dM.lower), upper: avg((p) => p.energyScore1dM.upper) };
});
const best = pooled.reduce((a, b) => (b.estimate < a.estimate ? b : a), pooled[0]);
const tied = pooled.filter((p) => p.lower <= best.upper);
const simplest = tied.sort((a, b) => (a.method === b.method ? a.spanDays - b.spanDays : a.method === 'F2' ? -1 : 1))[0];
metrics.choice = { pooledEnergyScore1dM: pooled, best: best?.key, chosen: simplest?.key, rule: 'lowest pooled 1-day energy score; overlapping bootstrap intervals are ties, resolved to F2 before F4, then the shorter span' };
if (config.chosen) metrics.frozenChoice = config.chosen;

// Hypotheses.
const chosenKey = config.chosen ? `${config.chosen.method}-${config.chosen.spanDays}d` : simplest?.key;
metrics.hypotheses = {};
const h1 = {};
for (const [regime, r] of Object.entries(metrics.regimes)) {
  const m = r.methods[chosenKey];
  if (!m) continue;
  h1[regime] = Object.fromEntries(Object.entries(m.horizons).map(([d, s]) => [d, { consistent: s.consistent, pass: s.pass, meanD2Over3: s.meanD2Over3?.estimate, coverage95: s.coverage95?.estimate, w2: s.cvm?.w2, critical: s.cvm?.critical, n: s.n, objects: s.objects }]));
}
const required = acceptance.h1.horizonsDays.map(String);
metrics.hypotheses.H1 = { method: chosenKey, byRegime: h1, supported: Object.keys(h1).length > 0 && Object.values(h1).every((byDay) => required.every((d) => byDay[d]?.consistent)),
  regimesTested: Object.keys(h1), regimesNotTested: Object.keys(config.regimes).filter((x) => !h1[x]).concat(['LEO 400-550 km', 'LEO 650-800 km', 'SLR MEO']).filter((x, i, a) => a.indexOf(x) === i && !h1[x]) };
metrics.hypotheses.H2 = { tested: false, reason: 'F3 (the fit to E1-corrected element sets) needs E1-corrected element sets (E1 M3*/M4); E1 has not produced them' };
metrics.hypotheses.H3 = { tested: false, reason: 'H3 is a LEO hypothesis; no LEO precise orbits exist for the train window, so no LEO density was fitted' };
const h4 = {};
for (const [regime, r] of Object.entries(metrics.regimes)) {
  const h = r.history?.h4;
  if (!h) continue;
  const raw = h.raw?.[acceptance.h4.ageIndex]?.coverage, corrected = h.corrected?.[acceptance.h4.ageIndex]?.coverage;
  const rawRatio = raw ? raw.meanD2 / 3 : null, correctedRatio = corrected ? corrected.meanD2 / 3 : null;
  h4[regime] = { rawMeanD2Over3: rawRatio, correctedPsd: h.correctedPsd, correctedMeanD2Over3: correctedRatio,
    rawTooLarge: rawRatio !== null && rawRatio < acceptance.h4.tooLargeBelow,
    correctedConsistent: correctedRatio !== null && correctedRatio >= acceptance.h4.consistent[0] && correctedRatio <= acceptance.h4.consistent[1] };
}
metrics.hypotheses.H4 = { byRegime: h4, supported: Object.keys(h4).length > 0 && Object.values(h4).every((x) => x.rawTooLarge && x.correctedConsistent) };

run.write('metrics.json', metrics);

// README from the metrics.
const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(d));
const lines = [`# E2 ${values.window} window: \`${run.id}\``, '', 'Generated by `experiments/e2-catalog-covariance/steps/90-report.mjs` from the runs listed in `metrics.json`. Do not edit by hand.', ''];
lines.push('## Hypotheses', '', '| ID | Result | Detail |', '| --- | --- | --- |');
lines.push(`| H1 | ${metrics.hypotheses.H1.supported ? 'SUPPORTED' : 'NOT SUPPORTED'} | ${chosenKey} in ${metrics.hypotheses.H1.regimesTested.join(', ') || 'no regime'}; not tested: ${metrics.hypotheses.H1.regimesNotTested.join(', ')} |`);
lines.push(`| H2 | NOT TESTED | ${metrics.hypotheses.H2.reason} |`);
lines.push(`| H3 | NOT TESTED | ${metrics.hypotheses.H3.reason} |`);
lines.push(`| H4 | ${Object.keys(h4).length ? (metrics.hypotheses.H4.supported ? 'SUPPORTED' : 'NOT SUPPORTED') : 'NOT TESTED'} | ${Object.entries(h4).map(([k, v]) => `${k}: C1 raw mean d²/3 ${f(v.rawMeanD2Over3)} at 0–0.5 d; corrected ${v.correctedPsd ? f(v.correctedMeanD2Over3) : 'not positive definite (consecutive differences are smaller than the at-epoch error)'}`).join('; ')} |`, '');
for (const [regime, r] of Object.entries(metrics.regimes)) {
  lines.push(`## ${regime}`, '', `Products: ${r.counts.rows} rows, ${r.counts.usable} usable (${r.counts.skipped} skipped, ${r.counts.failed} failed, ${r.counts.notConverged} not converged, ${r.counts.editedAsManeuver} edited as maneuvers).`, '');
  lines.push('| Method | Horizon | n (objects) | RMS 3D, m | median 3D, m | mean d²/3 [95 % CI] | 95 % coverage | CvM W² (limit) | Consistent |', '| --- | ---: | ---: | ---: | ---: | --- | ---: | --- | --- |');
  for (const [key, m] of Object.entries(r.methods)) for (const [d, s] of Object.entries(m.horizons)) {
    if (!s.n) continue;
    lines.push(`| ${key}${m.qM2S3 ? ` (q ${m.qM2S3.toExponential(2)})` : ''} | ${d} d | ${s.n} (${s.objects}) | ${f(s.rms3dM, 0)} | ${f(s.median3dM, 0)} | ${f(s.meanD2Over3.estimate)} [${f(s.meanD2Over3.lower)}, ${f(s.meanD2Over3.upper)}] | ${f(s.coverage95.estimate, 3)} | ${f(s.cvm.w2, 3)} (${f(s.cvm.critical, 3)}) | ${s.consistent ? 'yes' : 'no'} |`);
  }
  lines.push('');
  if (r.history) {
    lines.push(`SGP4 as published against precise orbits, RMS 3D by age: ${r.history.c0Accuracy.map((a) => `${a.ageDays[0]}–${a.ageDays[1]} d ${f(a.rms3dKm * 1000, 0)} m`).join('; ')}.`, '');
    lines.push(`B0, the existing GP error model's covariance (mean d²/3; inside 2σ): ${r.history.c0Coverage.map((a) => `${a.ageDays[0]}–${a.ageDays[1]} d ${f(a.coverage?.meanD2 / 3)}; ${f(a.coverage?.inside?.[1], 3)}`).join(' / ')}.`, '');
  }
  if (r.tleVariants) {
    lines.push('### Catalog-history covariance variants (SGP4 as published, every element set)', '', '| Variant | τ | n (objects) | mean d²/3 [95 % CI] | 95 % coverage | KS | normalized σ R/T/N | log score |', '| --- | ---: | ---: | --- | ---: | ---: | --- | ---: |');
    for (const [id, byTau] of Object.entries(r.tleVariants.variants)) for (const [t, m] of Object.entries(byTau)) {
      if (m.notPositiveDefinite) { lines.push(`| ${id} | ${t} d | — | not positive definite | | | | |`); continue; }
      lines.push(`| ${id} | ${t} d | ${m.n} (${m.objects}) | ${f(m.meanD2 / 3)} [${f(m.meanD2Ci?.[0] / 3)}, ${f(m.meanD2Ci?.[1] / 3)}] | ${f(m.coverage95, 3)} | ${f(m.ks, 3)} | ${m.axisNormStd.map((x) => f(x)).join(' / ')} | ${f(m.logScore, 1)} |`);
    }
    lines.push('');
  }
  if (r.failures.length) lines.push('Failures:', '', ...r.failures.map((x) => `- ${x}`), '');
}
lines.push('## Method choice (1-day energy score, pooled)', '', '| Method | n | Energy score, m [95 % CI] |', '| --- | ---: | --- |');
for (const p of pooled) lines.push(`| ${p.key} | ${p.n} | ${f(p.estimate, 1)} [${f(p.lower, 1)}, ${f(p.upper, 1)}] |`);
lines.push('', `Best: ${best?.key}; chosen by the rule: ${simplest?.key}.${config.chosen ? ` Frozen choice: ${config.chosen.method}-${config.chosen.spanDays}d.` : ''}`, '');
run.write('README.md', `${lines.join('\n')}\n`);
const manifest = run.finish();
if (values.publish) {
  const dir = path.join(repoRoot, 'results', 'e2', values.window);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['metrics.json', 'README.md']) fs.copyFileSync(path.join(run.dir, name), path.join(dir, name));
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
}
console.log(`[${run.id}] H1 ${metrics.hypotheses.H1.supported ? 'SUPPORTED' : 'NOT SUPPORTED'} (${chosenKey}); H4 ${metrics.hypotheses.H4.supported ? 'SUPPORTED' : 'NOT SUPPORTED'}; choice ${simplest?.key}`);
