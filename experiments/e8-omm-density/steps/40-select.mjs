#!/usr/bin/env node
// E8 step 40: the validation-window choices of PLAN.md section 5, by rule.
//   1  perBin: the smallest sigma of D5a (global structure) pooled over the
//      held-out satellites (a step 20 validation run with the analysis fits);
//   2  decayHours: with that perBin and the global structure, the smallest
//      pooled sigma of D5f at leads 0-3 d (definitive drivers) from the
//      validation issue days (the same step 20 run with the forecast fits);
//   3  structure: with those, the smallest median 3-day error of D5
//      (definitive arm) over the validation arcs, both structures on the
//      arcs where both have one (step 30 validation runs).
// Ties go to the global structure, the smaller perBin, the shorter decay.
// Writes results/e8/selection.json (each stage can be run when its runs exist).
//
//   node .../40-select.mjs --density RUN [--propagation RUN[,RUN]]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { config, readRun } from '../common.mjs';

const { values } = parseArgs({ options: { density: { type: 'string' }, propagation: { type: 'string' } } });
const density = readRun(values.density, 'density-rows.json');
if (density.window !== 'validation') throw new Error('selection reads the validation window only');
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); };
const sigmaOf = (rows) => (rows.length ? sd(rows.map((r) => r.lnRatio)) : null);
const pick = (cands, key, tie) => cands.reduce((a, b) => (b[key] < a[key] || (b[key] === a[key] && tie(b, a)) ? b : a));

// 1. perBin
const perBin = config.pool.candidates.perBin.map((K) => { const rows = density.rows.filter((r) => r.variant === `D5a-K${K}-global`); return { perBin: K, n: rows.length, sigma: sigmaOf(rows) }; });
if (perBin.some((c) => !c.n)) throw new Error(`the density run lacks a perBin candidate: ${JSON.stringify(perBin)}`);
const K = pick(perBin, 'sigma', (b, a) => b.perBin < a.perBin).perBin;
const out = { experiment: config.experiment, rule: config.selection, densityRun: values.density, perBinCandidates: perBin,
  d0Sigma: sigmaOf(density.rows.filter((r) => r.variant === 'D0')), d2aSigma: sigmaOf(density.rows.filter((r) => r.variant === 'D2a')), perBin: K };

// 2. decayHours
const days = new Set(config.propagation.validationIssueDays);
const leads = (r) => r.arm === 'definitive' && r.leadDays >= 0 && r.leadDays < 3 && days.has(r.issue);
const decays = config.decay.forecast.candidates.decayHours.map((tau) => {
  const rows = density.forecastRows.filter((r) => leads(r) && r.variant === `D5f-K${K}-global-T${tau ?? 'inf'}`);
  return { decayHours: tau, n: rows.length, sigma: sigmaOf(rows) };
});
if (decays.some((c) => !c.n)) out.decayCandidates = decays;
else {
  const tau = pick(decays, 'sigma', (b, a) => (b.decayHours ?? Infinity) < (a.decayHours ?? Infinity)).decayHours;
  Object.assign(out, { decayCandidates: decays, d0ForecastSigma: sigmaOf(density.forecastRows.filter((r) => leads(r) && r.variant === 'D0')),
    decayHours: tau });
  // 3. structure
  if (values.propagation) {
    const runs = values.propagation.split(',').map((id) => ({ id, ...readRun(id, 'propagation-rows.json') }));
    if (runs.some((r) => r.window !== 'validation')) throw new Error('propagation runs must be validation runs');
    const rows = runs.flatMap((r) => r.rows).filter((r) => r.arm === 'definitive');
    const structures = Object.keys(config.decay.structures).map((structure) => ({ structure, variant: `D5-K${K}-${structure}-T${tau ?? 'inf'}` }));
    const key = (r) => `${r.issue}/${r.norad}`;
    const has = (r, v) => r.variant === v && Number.isFinite(r.errors?.[3]);
    const arcs = [...new Set(rows.map(key))].filter((k) => structures.every((s) => rows.some((r) => key(r) === k && has(r, s.variant))));
    const both = new Set(arcs);
    for (const s of structures) {
      const xs = rows.filter((r) => both.has(key(r)) && has(r, s.variant)).map((r) => r.errors[3]);
      Object.assign(s, { arcs: xs.length, median3dM: xs.length ? median(xs) : null });
    }
    if (structures.some((s) => !s.arcs)) throw new Error(`a structure has no arcs: ${JSON.stringify(structures)}`);
    const order = Object.keys(config.decay.structures);
    const best = pick(structures, 'median3dM', (b, a) => order.indexOf(b.structure) < order.indexOf(a.structure));
    const d0 = rows.filter((r) => both.has(key(r)) && has(r, 'D0')).map((r) => r.errors[3]);
    Object.assign(out, { propagationRuns: runs.map((r) => r.id), pairedArcs: both.size, structureCandidates: structures, d0Median3dM: d0.length ? median(d0) : null,
      structure: best.structure });
  }
}
out.decided = new Date().toISOString();
fs.mkdirSync(path.join(repoRoot, 'results', 'e8'), { recursive: true });
fs.writeFileSync(path.join(repoRoot, 'results', 'e8', 'selection.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
