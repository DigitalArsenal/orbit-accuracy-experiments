#!/usr/bin/env node
// E14 step 35: the open DCP's lead covariance (PLAN.md section 4, S4 step 3): per altitude and forecast class (the
// issue's maximum predicted Ap over days 1-3: below 15, 15-29, 30 and above) the 7 x 7 second moment about zero of
// the daily ln-density forecast errors of step 30, over the issues whose lead days end by dev-fit's end (2024-01-01
// to 2026-02-07). A forecast error's mean is kept in the term (zero-mean consider: its bias is part of the error).
// Writes results/e14/dev/s4-dcp.json (the shrinkage toward the diagonal is chosen on dev-select).
//
//   node experiments/e14-covariance-realism/steps/35-s4-fit.mjs --run <step-30 run>
// With --score <window> (descriptive): the issues whose lead days 1..7 lie in the window, per altitude and class and
// lead day k, the share with |delta_k| <= 1.96 sqrt(C[k][k]) and the mean of delta_k^2 / C[k][k] under the frozen
// lead covariance (--dcp, default results/e14/dev/s4-dcp.json). Writes results/e14/<window>/s4-dcp-summary.json.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import fs from 'node:fs';
import { config, readRuns, resultsDir, writeJson, DAY_MS, windowOf } from '../common.mjs';
import { assertWindowReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { run: { type: 'string' }, through: { type: 'string', default: 'devFit' }, out: { type: 'string' }, score: { type: 'string' }, dcp: { type: 'string' } } });
const S4 = config.s4;
if (values.score) {
  assertWindowReadable(values.score);
  const w = windowOf(values.score);
  const dcp = JSON.parse(fs.readFileSync(values.dcp ?? path.join(repoRoot, 'results/e14/dev/s4-dcp.json'), 'utf8'));
  const list = (await readRuns(values.run.split(','), 'forecast-errors')).filter((r) => { const d = Date.parse(`${r.day}T00:00:00Z`); return d + DAY_MS >= w.lo && d + 8 * DAY_MS <= w.hi; });
  const cls = (ap) => (ap < S4.forecastClassesAp[0] ? 0 : ap < S4.forecastClassesAp[1] ? 1 : 2);
  const out = { window: values.score, issues: list.length, span: list.length ? [list[0].day, list.at(-1).day] : null, strata: [] };
  for (const st of dcp.strata) {
    const a = dcp.altitudesKm.indexOf(st.altitudeKm);
    const rows = list.filter((r) => cls(r.predictedApMax) === st.class && r.delta[a].every((x) => x !== null)).map((r) => r.delta[a]);
    out.strata.push({ altitudeKm: st.altitudeKm, class: st.class, n: rows.length, leads: Array.from({ length: S4.leadDays }, (_, k) => {
      const v = st.secondMoment[k][k];
      return { lead: k + 1, sigma: Math.sqrt(v), rms: rows.length ? Math.sqrt(rows.reduce((x, d) => x + d[k] ** 2, 0) / rows.length) : null,
        coverage95: rows.length ? rows.filter((d) => Math.abs(d[k]) <= 1.96 * Math.sqrt(v)).length / rows.length : null,
        meanZ2: rows.length ? rows.reduce((x, d) => x + d[k] ** 2 / v, 0) / rows.length : null };
    }) });
  }
  writeJson(path.join(resultsDir(values.score), 's4-dcp-summary.json'), out);
  console.log(`wrote results/e14/${values.score}/s4-dcp-summary.json: ${list.length} issues`);
  process.exit(0);
}
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
