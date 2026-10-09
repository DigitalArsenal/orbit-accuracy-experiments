#!/usr/bin/env node
// E5 step 40: the validation-window choices of PLAN.md section 5, by rule.
//   degree: the smallest sigma of D2a (pooled held-out satellites);
//   decay:  the smallest median 3-day error of D2 over the validation arcs.
// Writes results/e5/selection.json.
//
//   node .../40-select.mjs --density RUN_ID --propagation RUN_ID[,RUN_ID...]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { config } from '../common.mjs';

const { values } = parseArgs({ options: { density: { type: 'string' }, propagation: { type: 'string' } } });
const read = (id, file) => JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', id, file), 'utf8'));
const density = read(values.density, 'density-rows.json');
if (density.window !== 'validation') throw new Error('selection reads the validation window only');
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length); };
const degrees = density.degrees.map((L) => {
  const xs = density.rows.filter((r) => r.variant === `D2a-L${L}`).map((r) => r.lnRatio);
  return { degree: L, n: xs.length, sigma: sd(xs) };
});
const d0 = sd(density.rows.filter((r) => r.variant === 'D0').map((r) => r.lnRatio));
const degree = degrees.reduce((a, b) => (b.sigma < a.sigma ? b : a)).degree;

const rows = values.propagation.split(',').flatMap((id) => read(id, 'propagation-rows.json').rows);
const props = values.propagation.split(',').map((id) => read(id, 'propagation-rows.json'));
if (props.some((p) => p.window !== 'validation' || p.degree !== degree)) throw new Error(`propagation runs must be validation runs at the selected degree ${degree}`);
const decays = config.calibration.candidates.decayHours.map((tau) => {
  const variant = `D2-L${degree}-T${tau ?? 'inf'}`;
  const xs = rows.filter((r) => r.variant === variant && r.errors && Number.isFinite(r.errors[3])).map((r) => r.errors[3]);
  return { decayHours: tau, variant, arcs: xs.length, median3dM: median(xs) };
});
const decay = decays.reduce((a, b) => (b.median3dM < a.median3dM ? b : a)).decayHours;
const d0Prop = median(rows.filter((r) => r.variant === 'D0' && r.errors && Number.isFinite(r.errors[3])).map((r) => r.errors[3]));
const out = { experiment: config.experiment, rule: config.selection, densityRun: values.density, propagationRuns: values.propagation.split(','),
  degrees, d0Sigma: d0, degree, decays, d0Median3dM: d0Prop, decayHours: decay, decided: new Date().toISOString() };
fs.mkdirSync(path.join(repoRoot, 'results', 'e5'), { recursive: true });
fs.writeFileSync(path.join(repoRoot, 'results', 'e5', 'selection.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
