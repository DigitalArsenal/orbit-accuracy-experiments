#!/usr/bin/env node
// E14 step 45: S2's candidates (PLAN.md section 4): S2-P0 (A0 only), S2-Q (A0 + Q), S2-QC (A0 + the parameter's
// consider term + Q), S2-QCD (S2-QC + the DCP in LEO, shrinkage 0, 0.5 or 1). Q per regime and candidate by maximum
// likelihood on dev-fit (gp-error-model hpop_coverage mode fit: P = base + sum q_k U_k). Scoring: gp-error-model
// pair_statistics with the covariance as weighted terms; the cell statistics here.
//   --fit --runs <step-40 dev-fit runs>          writes results/e14/dev/s2-models.json
//   --window <name> --runs <step-40 runs>        writes results/e14/<window>/s2-realism.json
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot, loadModule, sha256 } from '../../../harness/modules.mjs';
import { config, json, callJson, readRuns, resultsDir, writeJson, windowOf } from '../common.mjs';
import { assertWindowReadable } from '../windows.mjs';
import { table, tally } from '../realism.mjs';

const { values } = parseArgs({ options: { fit: { type: 'boolean', default: false }, window: { type: 'string' }, runs: { type: 'string' }, modules: { type: 'string' }, out: { type: 'string' } } });
const windowName = values.fit ? (values.window ?? 'devFit') : values.window;
const names = windowName.split(',');
for (const n of names) assertWindowReadable(n);
const spans = names.map(windowOf);
const w = { lo: Math.min(...spans.map((x) => x.lo)), hi: Math.max(...spans.map((x) => x.hi)) };
const inWindow = (a, b) => spans.some((x) => a >= x.lo && b < x.hi);
const gp = await loadModule(modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }), 'analysis/gp-error-model');
const msOf = (t) => Date.parse(/Z$/.test(t) ? t : `${t}Z`);
const rows = (await readRuns(values.runs.split(','), 's2-samples')).filter((r) => inWindow(msOf(r.anchor), msOf(r.epoch)));
console.log(`${windowName}: ${rows.length} S2 samples (${rows.filter((r) => r.screened).length} screened out)`);
const SHRINK = config.s4.shrinkageCandidates.map(String);
// The base covariance (row-major 3x3, m^2) of a candidate.
const baseOf = (r, cand) => (cand === 'S2-P0' || cand === 'S2-Q' ? r.A0 : cand === 'S2-QC' ? r.QC : cand.startsWith('S2-QCD') ? (r.QCD ? r.QCD[cand.split(':')[1]] : r.QC) : null);
const candidates = ['S2-P0', 'S2-Q', 'S2-QC', ...SHRINK.map((s) => `S2-QCD:${s}`)];
const gauss = (m9) => [m9[0], m9[1], m9[2], m9[4], m9[5], m9[8]];  // xx, xy, xz, yy, yz, zz

if (values.fit) {
  const fitRows = rows.filter((r) => !r.screened);
  // One arc per anchor.
  const arcs = new Map();
  for (const r of fitRows) {
    const key = `${r.norad}|${r.anchor}`;
    if (!arcs.has(key)) arcs.set(key, { norad: r.norad, regime: r.regime, rows: [] });
    arcs.get(key).rows.push(r);
  }
  const list = [...arcs.values()];
  const regimeIndex = new Map(config.regimes.map((x, i) => [x.id, i]));
  const plan = { kind: 'hpop-arc-plan', version: 1, arcs: list.map((a, i) => ({ arc: i, norad: a.norad, regimeIndex: regimeIndex.get(a.regime), regime: a.regime,
    targets: a.rows.map((r) => ({ epoch: r.epoch, nominalDays: r.tau, ageDays: r.ageDays, truth: r.truth.map((x) => x / 1000) })) })) };
  const model0 = { kind: 'hpop-covariance-model', version: 1, regimes: config.regimes.map((x, i) => ({ regimeIndex: i, regime: x.id, p0: Array(21).fill(0).map((_, k) => ([0, 2, 5, 9, 14, 20].includes(k) ? 1e-6 : 0)) })) };
  const models = { experiment: config.experiment, fittedOn: windowName, samples: fitRows.length, anchors: list.length, candidates: {} };
  for (const cand of candidates) {
    if (cand === 'S2-P0') { models.candidates[cand] = { q: Object.fromEntries(config.regimes.map((x) => [x.id, [0, 0, 0]])) }; continue; }
    const predictions = { arcs: list.map((a, i) => ({ arc: i, samples: a.rows.map((r) => ({ state: r.state, a: gauss(baseOf(r, cand)), u: r.U.map(gauss) })) })) };
    const fit = await callJson(gp, 'hpop_coverage', [json('plan', plan), json('predictions', predictions), json('model', model0),
      json('options', { mode: 'fit', window: [`${new Date(w.lo).toISOString().slice(0, 19)}`, `${new Date(w.hi).toISOString().slice(0, 19)}`], regimes: config.regimes,
        ageBinsDays: config.s3AgeBinsDays, discretizationSeconds: config.s2.processNoise.discretizationSeconds })]);
    const q = {};
    for (const r of fit.regimes) if (r.processNoise) q[r.regime] = r.processNoise.fit.maximumLikelihoodM2S3;
    models.candidates[cand] = { q, fit: fit.regimes.filter((r) => r.processNoise).map((r) => ({ regime: r.regime, ...r.processNoise.fit })) };
    console.log(`${cand}: ${Object.entries(q).map(([k, v]) => `${k} ${v.map((x) => x.toExponential(2)).join('/')}`).join('; ')}`);
  }
  const file = values.out ? path.resolve(values.out) : path.join(resultsDir('dev'), 's2-models.json');
  writeJson(file, models);
  console.log(`wrote ${path.relative(repoRoot, file)}`);
} else {
  const modelsFile = values.out ? path.resolve(values.out) : path.join(repoRoot, 'results/e14/dev/s2-models.json');
  const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
  const out = { window: windowName, models: { file: path.relative(repoRoot, modelsFile), sha256: sha256(fs.readFileSync(modelsFile)) }, candidates: {} };
  for (const cand of candidates) {
    const q = models.candidates[cand]?.q ?? {};
    const scored = [];
    for (let i = 0; i < rows.length; i += 3000) {
      const chunk = rows.slice(i, i + 3000);
      const pairs = chunk.map((r, k) => {
        const qq = q[r.regime] ?? [0, 0, 0];
        return { id: i + k, predicted: { position: r.state.slice(0, 3), velocity: r.state.slice(3, 6), covarianceAxes: 'INERTIAL',
          covarianceTerms: [{ weight: 1, covariance: baseOf(r, cand) }, ...[0, 1, 2].map((a) => ({ weight: qq[a], covariance: r.U[a] }))] },
          truth: { position: r.truth.slice(0, 3), velocity: r.truth.slice(3, 6) } };
      });
      const res = await callJson(gp, 'pair_statistics', [json('pairs', { pairs })]);
      res.pairs.forEach((p, k) => {
        const r = chunk[k];
        scored.push({ object: r.norad, regime: r.regime, horizon: String(r.tau), screened: r.screened, d2: p.d2Predicted ?? NaN, z: p.zPredicted, errorM: p.errorRtn, covarianceM2: p.predictedRtn });
      });
    }
    const primary = table(scored.filter((s) => !s.screened), { energy: true });
    const all = table(scored);
    out.candidates[cand] = { primary, allSamples: all, tally: tally(primary), tallyAllSamples: tally(all) };
    console.log(`${cand}: ${JSON.stringify(tally(primary))}`);
  }
  writeJson(path.join(resultsDir(windowName), 's2-realism.json'), out);
  console.log(`wrote results/e14/${windowName}/s2-realism.json`);
}
