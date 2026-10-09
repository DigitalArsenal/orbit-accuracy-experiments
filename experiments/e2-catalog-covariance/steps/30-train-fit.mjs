#!/usr/bin/env node
// E2 step 30 (train only): the maneuver edit threshold (the train products'
// reduced chi-square quantile) and the C4 white-acceleration density per
// regime and fit span (PLAN.md section 4), from step-20 train runs.
//
//   node experiments/e2-catalog-covariance/steps/30-train-fit.mjs --products RUN_ID[,RUN_ID...]
import { parseArgs } from 'node:util';
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { quantile } from '../../../harness/stats.mjs';
import { config, configPath } from '../common.mjs';
import { fitDensity, readProducts, usable } from '../score.mjs';

const { values } = parseArgs({ options: { products: { type: 'string' }, modules: { type: 'string' }, window: { type: 'string', default: 'train' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const runs = values.products.split(',');
const run = startRun({ experiment: config.experiment, step: `30-train-fit-${values.window}`, configPath, modulesDir: modules, args: values });
const rows = readProducts(runs);
for (const id of new Set(rows.map((r) => r.run))) if (!id.includes(`-20-products-${values.window}`)) throw new Error(`${id} is not a ${values.window} products run`);
const out = { products: runs, regimes: {} };
for (const regime of Object.keys(config.regimes)) {
  const mine = rows.filter((r) => r.regime === regime);
  const fitted = mine.filter((r) => r.horizons && !r.error && r.converged);
  const threshold = quantile(fitted.map((r) => r.reducedChiSquare), config.maneuvers.reducedChiSquareQuantile);
  const spans = {};
  for (const span of config.products.fitSpansDays) {
    const kept = usable(fitted.filter((r) => r.spanDays === span), threshold);
    spans[span] = { products: kept.length, ...fitDensity(kept, config.c4.fitHorizonsDays) };
  }
  out.regimes[regime] = {
    counts: { rows: mine.length, skipped: mine.filter((r) => r.skipped).length, failed: mine.filter((r) => r.error).length, notConverged: mine.filter((r) => r.horizons && !r.converged).length, fitted: fitted.length },
    reducedChiSquareThreshold: threshold, spans,
  };
}
run.write('fit.json', out);
run.finish();
for (const [name, r] of Object.entries(out.regimes))
  console.log(`[${run.id}] ${name}: threshold ${r.reducedChiSquareThreshold.toFixed(3)}; ${Object.entries(r.spans).map(([s, v]) => `${s} d: q ${v.q.toExponential(3)} m^2/s^3 (${v.products} products)`).join('; ')}`);
