#!/usr/bin/env node
// E14 step 55: S1, operator covariance (PLAN.md sections 4 S1, 6, 7, 8). Pairs: E13's Starlink pairs (read only;
// stated sigma per axis, so d^2 against the diagonal covariance) and this experiment's collector (Starlink outside
// E13's sample, Planet; full 3x3). Per operator, regime and horizon bin: S1-0 (the stated covariance), S1-K (a scalar
// factor) and S1-A (per-axis factors), the factors fitted on s1:devFit by gp-error-model fit_calibration and applied
// by calibrate_covariance; cell statistics on the asked window. --fit writes results/e14/dev/s1-models.json;
// --window <s1:devFit|s1:devSelect|s1:test> writes results/e14/<window>/s1-realism.json.
//
//   node experiments/e14-covariance-realism/steps/55-s1-score.mjs --fit
//   node experiments/e14-covariance-realism/steps/55-s1-score.mjs --window s1:devSelect
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
import { full3, mahalanobis } from '../../e2b-correlated-covariance/linalg.mjs';
import { config, json, callJson, resultsDir, writeJson, moduleOf } from '../common.mjs';
import { assertWindowReadable, s1WindowOfPair, assertPairReadable } from '../windows.mjs';
import { table, tally } from '../realism.mjs';

const { values } = parseArgs({ options: { fit: { type: 'boolean', default: false }, window: { type: 'string' }, modules: { type: 'string' } } });
const target = values.fit ? 's1:devFit' : values.window;
assertWindowReadable(target);
const gp = await moduleOf(modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }), 'analysis/gp-error-model');  // pinned at the freeze
const bins = Object.entries(config.s1HorizonBinsDays).map(([name, [lo, hi]]) => ({ name, lo, hi }));
const binOf = (days) => bins.find((b) => days >= b.lo && (days < b.hi || (b.name === '2' && days <= b.hi)) )?.name ?? null;
const regimeOfAltitude = (km) => (km < 500 ? 'LEO-L' : km < 800 ? 'LEO-M' : 'LEO-H');

// ── pairs, each only after the guard admits its window ──
function* e13Pairs() {
  const dir = path.join(config.inputs.e13Store, 'pairs');
  if (!fs.existsSync(dir)) return;
  for (const norad of fs.readdirSync(dir)) for (const f of fs.readdirSync(path.join(dir, norad))) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, norad, f), 'utf8'));
    const t0 = Date.parse(r.t0), t1 = Date.parse(r.t1);
    if (s1WindowOfPair(t0, t1) !== target) continue;
    assertPairReadable(t0, t1);
    const o = r.statedSigma.oldAtT1, n = r.statedSigma.newAtT1;
    yield { provider: 'starlink-e13', object: `starlink:${r.norad}`, regime: regimeOfAltitude(r.geodeticAltitudeKm.newT1), hours: r.hoursBetween,
      e: r.mismatch.positionRtnM, predicted: [o[0] ** 2, 0, o[1] ** 2, 0, 0, o[2] ** 2], truth: [n[0] ** 2, 0, n[1] ** 2, 0, 0, n[2] ** 2] };
  }
}
function* e14Pairs() {
  const file = path.join(config.inputs.store, 'pairs.jsonl');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.missing || !r.errorRtn) continue;
    const t0 = Date.parse(r.t0), t1 = Date.parse(r.t1);
    if (s1WindowOfPair(t0, t1) !== target) continue;
    assertPairReadable(t0, t1);
    yield { provider: r.provider, object: `${r.provider}:${r.id}`, regime: r.regime, hours: r.hoursBetween, e: r.errorRtn, predicted: r.predictedRtn, truth: r.truthRtn };
  }
}
const pairs = [...e13Pairs(), ...e14Pairs()].map((p) => ({ ...p, horizon: binOf(p.hours / 24) })).filter((p) => p.horizon && p.regime);
console.log(`${target}: ${pairs.length} pairs (${['starlink-e13', 'starlink', 'planet'].map((k) => `${k} ${pairs.filter((p) => p.provider === k).length}`).join(', ')})`);
const operatorOf = (p) => (p.provider === 'planet' ? 'planet' : 'starlink');
const stratum = (p) => `${operatorOf(p)}|${p.regime}|${p.horizon}`;

if (values.fit) {
  const models = {};
  for (const method of ['scalar-mle', 'axes-mle']) {
    const samples = pairs.map((p) => ({ stratum: stratum(p), object: p.object, error: p.e, covariance: p.predicted.map((x, k) => x + (p.truth?.[k] ?? 0)) }));
    const fit = await callJson(gp, 'fit_calibration', [json('samples', { samples }), json('options', { method, minimumSamples: config.realism.minimumSamples, minimumObjects: config.realism.minimumObjects })]);
    for (const s of fit.strata) {
      const [operator, regime, horizon] = s.stratum.split('|');
      const b = bins.find((x) => x.name === horizon);
      const key = method === 'scalar-mle' ? 'S1-K' : 'S1-A';
      (models[`${key}:${operator}`] ??= { kind: 'e14-factors', version: `e14-${key}-${operator}-devfit`, regimes: config.regimes, strata: [] }).strata.push({
        regime, horizonDays: [b.lo, b.hi + (horizon === '2' ? 1e-9 : 0)], ...(s.axesFactors ? { axesFactors: s.axesFactors } : { factor: s.factor }), n: s.n, objects: s.objects, status: s.status, before: s.before, after: s.after });
    }
  }
  // A horizon bin without dev-fit factors takes the nearest shorter bin's (PLAN.md section 4, S1).
  for (const m of Object.values(models)) m.strata = m.strata.filter((s) => s.status === 'FITTED');
  const file = path.join(resultsDir('dev'), 's1-models.json');
  writeJson(file, { experiment: config.experiment, fittedOn: 's1:devFit', pairs: pairs.length, models });
  console.log(`wrote results/e14/dev/s1-models.json (${Object.keys(models).join(', ')})`);
  for (const [k, m] of Object.entries(models)) for (const s of m.strata) console.log(`${k} ${s.regime} ${s.horizonDays.map((x) => x.toFixed(3)).join('-')} d: ${JSON.stringify(s.factor ?? s.axesFactors)} (n ${s.n}, objects ${s.objects}; mean d2/3 ${s.before.meanD2Over3.toFixed(3)} -> ${s.after.meanD2Over3.toFixed(3)})`);
} else {
  const modelsFile = path.join(repoRoot, 'results/e14/dev/s1-models.json');
  const { models } = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  const out = { window: target, models: { file: path.relative(repoRoot, modelsFile), sha256: sha256(fs.readFileSync(modelsFile)) }, candidates: {} };
  for (const name of config.candidates.S1) {
    const rows = [];
    for (const operator of ['starlink', 'planet']) {
      const list = pairs.filter((p) => operatorOf(p) === operator);
      if (!list.length) continue;
      let covs = list.map((p) => p.predicted);
      if (name !== 'S1-0') {
        const model = models[`${name}:${operator}`];
        if (!model?.strata.length) { list.forEach((p) => rows.push({ ...p, operator, d2: NaN })); continue; }
        // The nearest shorter fitted bin stands in for a bin without dev-fit factors.
        const fitted = model.strata;
        const stand = (p) => { const b = bins.find((x) => x.name === p.horizon); const c = fitted.filter((s) => s.regime === p.regime && s.horizonDays[0] <= b.lo).sort((a, z) => z.horizonDays[0] - a.horizonDays[0])[0]; return c ? (c.horizonDays[0] + c.horizonDays[1]) / 2 : null; };
        const objects = list.map((p, i) => ({ id: i, regime: p.regime, horizonDays: stand(p) ?? -1, covariance: p.predicted, covarianceAxes: 'RTN' }));
        const r = await callJson(gp, 'calibrate_covariance', [json('model', model), json('objects', { objects: objects.filter((o) => o.horizonDays >= 0) })]);
        const byId = new Map(r.objects.map((o) => [o.id, o.covarianceRtn ? o.covarianceRtn.slice(0, 6) : null]));
        covs = list.map((_, i) => byId.get(i) ?? null);
      }
      list.forEach((p, i) => {
        const c = covs[i] ? covs[i].map((x, k) => x + (p.truth?.[k] ?? 0)) : null;
        rows.push({ ...p, operator, d2: c ? mahalanobis(p.e, full3(c)) : NaN, z: c ? [0, 2, 5].map((k, a) => p.e[a] / Math.sqrt(c[k])) : null, errorM: p.e, covarianceM2: c });
      });
    }
    const byOperator = {};
    for (const operator of ['starlink', 'planet']) {
      const t = table(rows.filter((r) => r.operator === operator).map((r) => ({ ...r, object: r.object })), { energy: true });
      byOperator[operator] = { table: t, tally: tally(t) };
    }
    out.candidates[name] = byOperator;
    console.log(`${name}: ${Object.entries(byOperator).map(([k, v]) => `${k} ${JSON.stringify(v.tally)}`).join('; ')}`);
  }
  const file = path.join(resultsDir(target.replace(':', '-')), 's1-realism.json');
  writeJson(file, out);
  console.log(`wrote ${path.relative(repoRoot, file)}`);
}
