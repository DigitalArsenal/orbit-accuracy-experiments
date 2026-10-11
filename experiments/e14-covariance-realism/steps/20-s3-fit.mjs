#!/usr/bin/env node
// E14 step 20: S3's candidate models fitted on dev-fit (PLAN.md section 4): S3-T (clipped second moment by regime and
// age), S3-TU (unclipped), S3-KC (S3-T with the factor that puts dev-fit 95 % coverage at 0.95, by
// gp-error-model fit_calibration on the module's own covariances), S3-KO (S3-KC with each object's factor from its
// consecutive differences; S(g) fitted here). Writes results/e14/dev/s3-models.json.
//
//   node experiments/e14-covariance-realism/steps/20-s3-fit.mjs --errors <step-10 devFit run> --differences <step-12 devFit run>
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
import { config, configPath, moduleOf, callJson, json, resultsDir, writeJson, windowOf } from '../common.mjs';
import { assertWindowReadable } from '../windows.mjs';
import { errorRows, differenceRows, elementSetModel, covariancesOf, differenceModel, ageIndexOf, REGIME_INDEX } from '../s3.mjs';

const { values } = parseArgs({ options: { errors: { type: 'string' }, differences: { type: 'string' }, modules: { type: 'string' } } });
assertWindowReadable('devFit');
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const run = startRun({ experiment: config.experiment, step: '20-s3-fit', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await moduleOf(modules, 'analysis/gp-error-model', run);
const fit = windowOf('devFit');
const rows = (await errorRows([values.errors])).filter((r) => Date.parse(`${r.anchor}Z`) >= fit.lo && Date.parse(`${r.target.replace(/Z$/, '')}Z`) < fit.hi);
log(`${rows.length} dev-fit samples (manoeuvre-screened)`);

const T = elementSetModel(rows, { clip: true, version: 'e14-s3-T-devfit' });
const TU = elementSetModel(rows, { clip: false, version: 'e14-s3-TU-devfit' });
// S3-KC: the coverage factor per regime and age bin, on the module's covariances of S3-T.
const covs = await covariancesOf(gp, T, rows.map((r, i) => ({ id: i, regime: r.regime, ageDays: r.ageDays })));
const samples = [];
rows.forEach((r, i) => {
  const c = covs.get(i);
  if (!c?.cov) return;
  samples.push({ stratum: `${REGIME_INDEX.get(r.regime)}|${ageIndexOf(r.ageDays)}`, object: r.norad, error: r.rtn.slice(0, 3).map((x) => x * 1e3), covariance: c.cov });
});
const kc = await callJson(gp, 'fit_calibration', [json('samples', { samples }), json('options', { method: 'coverage', coverage: 0.95, minimumSamples: config.realism.minimumSamples, minimumObjects: config.realism.minimumObjects })]);
const factors = kc.strata.filter((s) => s.status === 'FITTED').map((s) => { const [g, a] = s.stratum.split('|').map(Number); return { regimeIndex: g, ageIndex: a, factor: s.factor, n: s.n, before: s.before, after: s.after }; });
const KC = { ...T, version: 'e14-s3-KC-devfit', factors, basis: `${T.basis}; times the factor that puts the dev-fit 95 % coverage at 0.95 (gp-error-model fit_calibration, coverage)` };
// S3-KO: S(g) from dev-fit consecutive differences.
const diffs = (await differenceRows([values.differences])).filter((r) => { const t = Date.parse(/Z$/.test(r.created) ? r.created : `${r.created}Z`); return t >= fit.lo && t < fit.hi; });
const S = differenceModel(diffs);
log(`S(g) from ${diffs.length} dev-fit consecutive differences`);
const models = { experiment: config.experiment, fittedOn: 'devFit', window: config.windows.devFit, samples: rows.length,
  candidates: { 'S3-T': T, 'S3-TU': TU, 'S3-KC': KC, 'S3-KO': { base: 'S3-KC', S, rule: 'objectFactor = (n mean(d\' S(g)^-1 d / 3) + 8) / (n + 8) over the object\'s consecutive differences created in the 30 days before the set (at least 2), times S3-KC' } },
  inputs: { errors: values.errors, differences: values.differences } };
const file = path.join(resultsDir('dev'), 's3-models.json');
writeJson(file, models);
run.write('s3-models.sha256', sha256(fs.readFileSync(file)));
run.finish({ samples: rows.length, factors: factors.length });
log(`wrote ${path.relative(repoRoot, file)}: ${T.strata.length} strata, ${factors.length} coverage factors`);
for (const f of factors) log(`KC ${config.regimes[f.regimeIndex].id} age ${f.ageIndex}: k^2 ${f.factor.toFixed(3)} (n ${f.n}; dev-fit mean d2/3 ${f.before.meanD2Over3.toFixed(2)} -> ${f.after.meanD2Over3.toFixed(2)})`);
