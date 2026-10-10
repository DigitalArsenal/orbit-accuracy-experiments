// E11 step 40: the test window, read once after the freeze and the selection
// (PLAN.md sections 5 and 6).
//   node experiments/e11-omm-fit/steps/40-test.mjs --fit <step-10 test run id> --score <step-30 test run id>
// It computes, per group:
// - H1, the RMS over CelesTrak's window;
// - H2, prediction against operator-OCM truth: the 1-day horizon primary, and
//   6 h, 3 d and 7 d secondary under Holm's correction;
// - the Space-Track baselines;
// - the closure measurements and the failure accounting.
// It writes products.jsonl for E9: the chosen OMM-fit of every test version,
// with its statistics and the raw sha256. Statistics only.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, configPath, assertWindowReadable } from '../common.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { versions, clusterLogRatio, holmLevels, summary } from '../analysis.mjs';
import { rng, quantile } from '../../../harness/stats.mjs';

const { values } = parseArgs({ options: { fit: { type: 'string' }, score: { type: 'string' }, modules: { type: 'string' } } });
const freeze = assertWindowReadable('test');
const selectionFile = path.join(repoRoot, 'results/e11/selection.json');
if (!fs.existsSync(selectionFile)) throw new Error('results/e11/selection.json is missing: run step 20 and commit it first');
const selection = JSON.parse(fs.readFileSync(selectionFile, 'utf8'));
const modulesDir = values.modules ?? '/Users/tj/software/worktrees/space-data-network-modules--omm-fit-20261010';
const run = startRun({ experiment: config.experiment, step: '40-test', configPath, modulesDir, args: values });
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const pairs = readJsonl(path.join(repoRoot, 'runs', values.fit, 'pairs.jsonl'));
const scores = readJsonl(path.join(repoRoot, 'runs', values.score, 'scores.jsonl'));
const horizons = config.horizons.hours.map((h) => `${h}h`);
const primary = `${config.horizons.primaryHours}h`;
const secondary = horizons.filter((h) => h !== primary);
const levels = holmLevels(secondary.length);

// A cluster-bootstrap ratio at a given confidence (Holm levels for the secondary horizons).
function ratioAt(rows, a, b, confidence) {
  const r = clusterLogRatio(rows, a, b);
  if (!r.objects) return r;
  const byObject = new Map();
  for (const x of rows) if (x[a] > 0 && x[b] > 0) { if (!byObject.has(x.norad)) byObject.set(x.norad, []); byObject.get(x.norad).push(Math.log(x[a] / x[b])); }
  const objects = [...byObject.values()].map((xs) => xs.reduce((s, v) => s + v, 0) / xs.length);
  const random = rng(config.statistics.bootstrapSeed);
  const draws = [];
  for (let i = 0; i < config.statistics.bootstrapResamples; ++i) {
    let s = 0;
    for (let k = 0; k < objects.length; ++k) s += objects[Math.floor(random() * objects.length)];
    draws.push(s / objects.length);
  }
  const alpha = (1 - confidence) / 2;
  return { ...r, confidence, lower: quantile(draws, alpha), upper: quantile(draws, 1 - alpha), ratioLower: Math.exp(quantile(draws, alpha)),
    ratioUpper: Math.exp(quantile(draws, 1 - alpha)), supported: quantile(draws, 1 - alpha) < 0 };
}
// One row per (pair, horizon) with the products side by side.
function side(group, horizon) {
  const out = new Map();
  for (const s of scores.filter((x) => x.provider === group && x.horizon === horizon)) {
    const k = `${s.norad}|${s.version}|${s.supgpEpoch}`;
    if (!out.has(k)) out.set(k, { norad: s.norad });
    out.get(k)[s.product] = s.rms3dKm;
  }
  return [...out.values()];
}
const metrics = { freezeCommit: freeze, selection: selection.chosen, groups: {} };
for (const g of [...new Set(pairs.map((p) => p.provider))]) {
  const fit = pairs.filter((p) => p.provider === g);
  const m = metrics.groups[g] = { pairs: fit.length, objects: new Set(fit.map((p) => p.norad)).size };
  m.analysed = m.objects >= config.groups.minimumObjects || m.pairs >= config.groups.minimumPairs;
  m.h1 = clusterLogRatio(fit, 'oursKm', 'supgpKm');
  m.h1Fraction = fit.filter((p) => p.oursKm < p.supgpKm).length / fit.length;
  m.fitRms = { oursKm: summary(fit.map((p) => p.oursKm)), supgpKm: summary(fit.map((p) => p.supgpKm)), publishedKm: summary(fit.map((p) => p.publishedKm)) };
  m.h2 = {};
  for (const h of horizons) {
    const rows = side(g, h);
    const conf = h === primary ? config.statistics.confidence : levels[secondary.indexOf(h)];
    m.h2[h] = {
      pairs: rows.length,
      productVsSupgp: ratioAt(rows, selection.chosen, 'supgp', conf),
      celestrakWindowVsSupgp: ratioAt(rows, 'omm-fit-celestrak', 'supgp', conf),
      supgpVsSpacetrack: ratioAt(rows, 'supgp', 'spacetrack', conf),
      productVsSpacetrack: ratioAt(rows, selection.chosen, 'spacetrack', conf),
      rms3dKm: Object.fromEntries(['supgp', 'omm-fit-celestrak', selection.chosen, 'spacetrack'].map((p) => [p, summary(rows.map((r) => r[p]).filter((x) => x > 0))])),
    };
  }
}
// Closure measurements and failures, from the test versions.
const vs = versions('test');
for (const [g, m] of Object.entries(metrics.groups)) {
  const fits = vs.filter((v) => v.provider === g).flatMap((v) => v.stats.omm.filter((o) => o.converged && o.closure?.rms));
  m.closure = { rms3dKm: summary(fits.map((o) => o.closure.rms.rms3dKm)), max3dKm: summary(fits.map((o) => o.closure.rms.max3dKm)) };
}
const failures = fs.existsSync(path.join(config.archives.derived, 'failures.jsonl')) ? readJsonl(path.join(config.archives.derived, 'failures.jsonl')) : [];
metrics.failures = failures.filter((f) => f.at >= config.windows.test[0] && f.at < config.windows.test[1]).reduce((acc, f) => {
  const k = `${f.provider}: ${f.reason.replace(/\[.*$/, '').trim()}`;
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});
// Products for E9: the chosen OMM-fit of every test version.
const products = [];
for (const v of vs) {
  const o = v.stats.omm.find((x) => x.id === selection.chosen);
  if (!o?.converged) continue;
  products.push({ provider: v.provider, norad: v.norad, version: v.version, created: v.created, product: selection.chosen, epoch: o.epoch, elements: o.elements,
    rms: o.rms, closure: o.closure?.rms ?? null, covariance: o.covariance, source: v.stats.source, ommFile: path.join(path.dirname(config.archives.derived), v.dir, 'omm.fbs') });
}
run.write('products.jsonl', `${products.map((p) => JSON.stringify(p)).join('\n')}\n`);
run.write('metrics.json', metrics);
run.finish({ products: products.length });
console.log(JSON.stringify(metrics, null, 1).slice(0, 4000));
console.log(`run ${run.id}: ${products.length} products`);
