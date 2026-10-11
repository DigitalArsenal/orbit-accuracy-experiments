#!/usr/bin/env node
// E14 step 65: H6 (PLAN.md section 9). sigma_m per satellite: the root mean square about zero of the daily
// ln(rho_obs / rho_NRLMSISE(observed drivers)) over dev-fit (step 60 rows). On the asked window, per lead day k = 1..3:
// z = ln(rho_obs / rho_NRLMSISE(released drivers)) / sqrt(sigma_m^2 + C_delta[k][k]) with C_delta the frozen lead
// covariance (S4, the chosen shrinkage does not touch the diagonal) at the satellite's altitude and the issue's class;
// the share with |z| <= 1.96 against [0.93, 0.97]. Writes results/e14/<window>/s4-density.json.
//
//   node experiments/e14-covariance-realism/steps/65-s4-density-score.mjs --dev <step-60 dev-fit run> --runs <step-60 runs> --window devSelect
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config, readRuns, resultsDir, writeJson, windowOf } from '../common.mjs';
import { assertWindowReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { dev: { type: 'string' }, runs: { type: 'string' }, window: { type: 'string' }, dcp: { type: 'string' } } });
assertWindowReadable('devFit');
assertWindowReadable(values.window);
const fit = windowOf('devFit'), w = windowOf(values.window);
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const devRows = (await readRuns(values.dev.split(','), 'density-errors')).filter((r) => dayMs(r.day) >= fit.lo && dayMs(r.day) < fit.hi && Number.isFinite(r.observed));
const sigma = {};
for (const sat of [...new Set(devRows.map((r) => r.satellite))]) {
  const list = devRows.filter((r) => r.satellite === sat && r.lead === 1);  // each (satellite, day) once
  sigma[sat] = { n: list.length, rms: Math.sqrt(list.reduce((a, r) => a + r.observed ** 2, 0) / list.length), mean: list.reduce((a, r) => a + r.observed, 0) / list.length };
}
const dcp = JSON.parse(fs.readFileSync(values.dcp ?? path.join(repoRoot, 'results/e14/dev/s4-dcp.json'), 'utf8'));
const leadVar = (altKm, cls, k) => {
  const alt = dcp.altitudesKm.reduce((best, a) => (Math.abs(a - altKm) < Math.abs(best - altKm) ? a : best), dcp.altitudesKm[0]);
  return dcp.strata.find((s) => s.altitudeKm === alt && s.class === cls).secondMoment[k - 1][k - 1];
};
const rows = (await readRuns(values.runs.split(','), 'density-errors')).filter((r) => dayMs(r.day) >= w.lo && dayMs(r.day) < w.hi && Number.isFinite(r.forecast) && sigma[r.satellite]);
const out = { window: values.window, sigmaModel: sigma, leads: {} };
for (const k of [1, 2, 3]) {
  const list = rows.filter((r) => r.lead === k).map((r) => {
    const v = sigma[r.satellite].rms ** 2 + leadVar(r.altitudeKm, r.class, k);
    return { z: r.forecast / Math.sqrt(v), zModelOnly: r.forecast / sigma[r.satellite].rms, satellite: r.satellite, cls: r.class };
  });
  const share = (xs, f) => xs.filter(f).length / Math.max(1, xs.length);
  out.leads[k] = { n: list.length, satellites: [...new Set(list.map((x) => x.satellite))].length,
    coverage95: share(list, (x) => Math.abs(x.z) <= 1.96), coverage95ModelOnly: share(list, (x) => Math.abs(x.zModelOnly) <= 1.96),
    meanZ2: list.reduce((a, x) => a + x.z * x.z, 0) / Math.max(1, list.length),
    byClass: [0, 1, 2].map((c) => { const xs = list.filter((x) => x.cls === c); return { class: c, n: xs.length, coverage95: share(xs, (x) => Math.abs(x.z) <= 1.96) }; }),
    supported: list.length >= 30 ? share(list, (x) => Math.abs(x.z) <= 1.96) >= 0.93 && share(list, (x) => Math.abs(x.z) <= 1.96) <= 0.97 : null };
}
writeJson(path.join(resultsDir(values.window), 's4-density.json'), out);
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
