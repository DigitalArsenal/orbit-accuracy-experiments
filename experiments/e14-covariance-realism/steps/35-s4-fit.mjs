#!/usr/bin/env node
// E14 step 35: the open DCP's lead covariance (PLAN.md section 4, S4 step 3): per altitude and forecast class (the
// issue's maximum predicted Ap over days 1-3: below 15, 15-29, 30 and above) the 7 x 7 second moment about zero of
// the daily ln-density forecast errors of step 30, over the issues whose lead days end by dev-fit's end (2024-01-01
// to 2026-02-07). A forecast error's mean is kept in the term (zero-mean consider: its bias is part of the error).
// Writes results/e14/dev/s4-dcp.json (the shrinkage toward the diagonal is chosen on dev-select).
//
//   node experiments/e14-covariance-realism/steps/35-s4-fit.mjs --run <step-30 run>
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config, readRuns, resultsDir, writeJson, DAY_MS, windowOf } from '../common.mjs';

const { values } = parseArgs({ options: { run: { type: 'string' }, through: { type: 'string', default: 'devFit' }, out: { type: 'string' } } });
const S4 = config.s4;
const lastIssue = windowOf(values.through).hi - 8 * DAY_MS;  // lead days end inside the window
const rows = (await readRuns(values.run.split(','), 'forecast-errors')).filter((r) => Date.parse(`${r.day}T00:00:00Z`) < lastIssue);
const classOf = (ap) => (ap < S4.forecastClassesAp[0] ? 0 : ap < S4.forecastClassesAp[1] ? 1 : 2);
const altitudes = rows[0].altitudesKm;
const out = { experiment: config.experiment, fittedOn: [rows[0].day, rows.at(-1).day], issues: rows.length, leadDays: S4.leadDays, altitudesKm: altitudes,
  classes: [`predicted Ap max < ${S4.forecastClassesAp[0]}`, `${S4.forecastClassesAp[0]}-${S4.forecastClassesAp[1] - 1}`, `>= ${S4.forecastClassesAp[1]}`],
  basis: 'second moment about zero of the grid-mean ln rho(forecast drivers) - ln rho(observed drivers), NRLMSISE-00, by lead day 1..7', strata: [] };
for (let a = 0; a < altitudes.length; ++a) for (let c = 0; c < 3; ++c) {
  const list = rows.filter((r) => classOf(r.predictedApMax) === c && r.delta[a].every((x) => x !== null)).map((r) => r.delta[a]);
  const K = S4.leadDays, C = Array.from({ length: K }, () => Array(K).fill(0));
  for (const d of list) for (let i = 0; i < K; ++i) for (let j = 0; j < K; ++j) C[i][j] += d[i] * d[j];
  for (let i = 0; i < K; ++i) for (let j = 0; j < K; ++j) C[i][j] /= Math.max(1, list.length);
  const mean = Array.from({ length: K }, (_, i) => list.reduce((s, d) => s + d[i], 0) / Math.max(1, list.length));
  out.strata.push({ altitudeKm: altitudes[a], class: c, n: list.length, mean, secondMoment: C });
}
const file = values.out ? path.resolve(values.out) : path.join(resultsDir('dev'), 's4-dcp.json');
writeJson(file, out);
console.log(`wrote ${path.relative(repoRoot, file)}: ${rows.length} issues ${out.fittedOn.join('..')}`);
for (const s of out.strata.filter((x) => [420, 550, 850].includes(x.altitudeKm))) console.log(`${s.altitudeKm} km class ${s.class}: n ${s.n}, rms ${s.secondMoment.map((r, i) => Math.sqrt(r[i]).toFixed(3)).join(' ')}`);
