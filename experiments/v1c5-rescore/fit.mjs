// Stage B (PLAN section 8): T and Q from the training out-of-fold population. Reads V1c5's training fold scores and training flags only (copied into the run
// directory with their registered hashes); no test element set, flag, arc or truth.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config, base, HOURS, output, hashOf, jsonl, registration } from './common.mjs';
import { fitT, fitQ, tQuantile, gaussianQuantile } from './laws.mjs';
import { CLASSES, levelsAll } from './criterion.mjs';

export const OOF_FILE = 'train-oof-scores.jsonl', EVENTS_FILE = 'events-train.jsonl';
// Constants of the fit that PLAN section 5 states in prose (config.json registers the rest).
export const T_SPEC = { ...config.variants.T, logScaleRange: [1e-4, 1e4], logScaleTolerance: 1e-10 };

export function copyInputs(run) {
  for (const [name, pin] of [[OOF_FILE, config.training.outOfFold], [EVENTS_FILE, config.training.events]]) {
    assert.equal(hashOf(pin.file), pin.sha256, `V1c5 training file changed: ${pin.file}`);
    if (!fs.existsSync(path.join(run.dir, name))) run.write(name, fs.readFileSync(pin.file));
    assert.equal(run.files[name] ?? hashOf(path.join(run.dir, name)), pin.sha256);
  }
}
// Unflagged arcs (training event flags), POPULATION samples with a finite d², folds F3 to F8 of the selected candidate's fold scores.
export function trainingPopulation(runDir) {
  const flags = new Map(jsonl(path.join(runDir, EVENTS_FILE)).map(r => [r.key, r.flagged]));
  const folds = new Set(config.training.outOfFold.folds);
  return jsonl(path.join(runDir, OOF_FILE)).filter(a => folds.has(a.fold) && !flags.get(a.key))
    .flatMap(a => a.samples.filter(s => s.status === 'POPULATION' && Number.isFinite(s.score?.d2Predicted)).map(s => ({ group: a.group, hours: s.hours, object: a.norad, d2: s.score.d2Predicted })));
}
export function fitsOf(samples) {
  const T = fitT(samples, T_SPEC, HOURS), Q = fitQ(samples, config.variants.Q, config.criterion.levels);
  // Level multipliers of the Gaussian covariance (PLAN section 5): the scale that makes the p-level ellipsoid cover p.
  const levelMultipliers = { T: {}, Q: {} };
  for (const group of CLASSES) {
    levelMultipliers.T[group] = Object.fromEntries(HOURS.map(hours => [hours, Object.fromEntries(levelsAll.map(p => {
      const f = T[group]; const c = f?.fitted ? f.cells.find(x => x.hours === hours).c : null;
      return [p, c === null ? 1 : tQuantile(p, f.nu, c) / gaussianQuantile(p)];
    }))]));
    levelMultipliers.Q[group] = Q[group]?.fitted ? Q[group].multipliers : null;
  }
  const population = Object.fromEntries(CLASSES.map(group => [group, Object.fromEntries(HOURS.map(hours => { const xs = samples.filter(s => s.group === group && s.hours === hours); return [hours, { n: xs.length, objects: new Set(xs.map(s => s.object)).size }]; }))]));
  return { T, Q, levelMultipliers, population };
}
export function fitStage({ run, runDir }) {
  copyInputs(run);
  const samples = trainingPopulation(runDir), fits = fitsOf(samples);
  const record = { registration, inputs: { outOfFoldSha256: config.training.outOfFold.sha256, eventsSha256: config.training.events.sha256, folds: config.training.outOfFold.folds }, samples: samples.length, ...fits };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'fits.json'), JSON.stringify(record, null, 2) + '\n');
  for (const g of CLASSES) {
    const t = fits.T[g];
    console.log(`fit ${g}: n ${t.samples}, ${t.fitted ? `nu ${t.nu}, pooled c ${t.pooledC.toFixed(4)}, log-lik ${t.logLikelihood.toFixed(1)} vs Gaussian ${t.gaussianLogLikelihood.toFixed(1)}` : 'T not fitted'}; Q ${fits.Q[g].fitted ? Object.entries(fits.Q[g].multipliers).map(([p, k]) => `k${p}=${k.toFixed(3)}`).join(' ') : 'not fitted'}`);
  }
  return record;
}
export { base };
