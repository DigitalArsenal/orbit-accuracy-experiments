#!/usr/bin/env node
// E14 step 25: S3's candidates scored on a window (PLAN.md sections 3 and 8): each sample's covariance from
// gp-error-model calibrate_covariance (S3-KO with its object factor), d^2 and the cell statistics here.
// Primary: manoeuvre-screened samples; also all samples (descriptive). Writes results/e14/<window>/s3-realism.json.
//
//   node experiments/e14-covariance-realism/steps/25-s3-score.mjs --window devSelect --errors <step-10 run> --differences <step-12 run>
//     [--pc S3-KC,S3-T]   (the probability-of-collision effect of those candidates, descriptive)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
import { full3, mahalanobis } from '../../e2b-correlated-covariance/linalg.mjs';
import { config, configPath, moduleOf, resultsDir, writeJson, windowOf } from '../common.mjs';
import { assertWindowReadable } from '../windows.mjs';
import { errorRows, differenceRows, covariancesOf, objectFactors } from '../s3.mjs';
import { table, tally, pcEffect } from '../realism.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, errors: { type: 'string' }, differences: { type: 'string' }, models: { type: 'string' }, modules: { type: 'string' }, energy: { type: 'boolean', default: true }, pc: { type: 'string' } } });
assertWindowReadable(values.window);
const w = windowOf(values.window);
const modelsFile = values.models ?? path.join(repoRoot, 'results/e14/dev/s3-models.json');
const models = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const run = startRun({ experiment: config.experiment, step: `25-s3-score-${w.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await moduleOf(modules, 'analysis/gp-error-model', run);
const ms = (t) => Date.parse(/Z$/.test(t) ? t : `${t}Z`);
const all = (await errorRows(values.errors.split(','), { includeScreened: true })).filter((r) => ms(r.anchor) >= w.lo && ms(r.target) < w.hi);
log(`${all.length} samples in ${w.name} (${all.filter((r) => r.screened).length} screened out)`);
const kappa = objectFactors(await differenceRows(values.differences.split(',')), models.candidates['S3-KO'].S);

const out = { window: w.name, span: config.windows[w.name], models: { file: path.relative(repoRoot, modelsFile), sha256: sha256(fs.readFileSync(modelsFile)) }, candidates: {} };
for (const name of config.candidates.S3) {
  const spec = models.candidates[name];
  const model = spec.base ? models.candidates[spec.base] : spec;
  const objects = all.map((r, i) => ({ id: i, regime: r.regime, ageDays: r.ageDays, ...(spec.base ? { objectFactor: kappa(r.norad, ms(r.created)).factor } : {}) }));
  const covs = await covariancesOf(gp, model, objects);
  const samples = { screened: [], all: [] };
  all.forEach((r, i) => {
    const c = covs.get(i);
    const e = r.rtn.slice(0, 3).map((x) => x * 1e3);
    const truthVar = (r.truthSigmaM ?? 0) ** 2;
    const cov = c?.cov ? c.cov.map((x, k) => x + ([0, 2, 5].includes(k) ? truthVar : 0)) : null;
    const d2 = cov ? mahalanobis(e, full3(cov)) : NaN;
    const s = { object: r.norad, regime: r.regime, horizon: String(r.tau), d2, z: cov ? [0, 2, 5].map((k, a) => e[a] / Math.sqrt(cov[k])) : null, errorM: e, covarianceM2: cov };
    samples.all.push(s);
    if (!r.screened) samples.screened.push(s);
  });
  const primary = table(samples.screened, { energy: values.energy });
  const descriptive = table(samples.all);
  out.candidates[name] = { model: model.version, primary, allSamples: descriptive, tally: tally(primary), tallyAllSamples: tally(descriptive) };
  if (values.pc?.split(',').includes(name)) out.candidates[name].pcEffect = await pcEffect(gp, samples.screened);
  log(`${name}: ${JSON.stringify(tally(primary))}`);
}
const file = path.join(resultsDir(w.name), 's3-realism.json');
writeJson(file, out);
run.finish({ file: path.relative(repoRoot, file) });
log(`wrote ${path.relative(repoRoot, file)}`);
