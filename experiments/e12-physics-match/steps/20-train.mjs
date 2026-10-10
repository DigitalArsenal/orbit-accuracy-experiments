// Step 20: per-axis classifiers on the synthetic fingerprints (PLAN.md
// section 6). For each hypothesis axis, gradient-boosted trees learn the
// generating level from the default fit's residual fingerprint; 5-fold
// cross-validation gives the confusion matrix and accuracy; the model fitted on
// every case is kept for the gauntlet's proposals.
//   node steps/20-train.mjs --runs <run-id>,<run-id>,...
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { train, predict, importance } from '../../../harness/boosting.mjs';
import { FEATURES } from '../fingerprint.mjs';
import { config } from '../common.mjs';

export const ML_AXES = ['frame', 'timeScale', 'eop', 'gravityModel', 'degree', 'thirdBodies', 'solidTides', 'oceanTides', 'relativity', 'srp', 'earthRadiation', 'atmosphere', 'spaceWeather'];
// Which cases an axis is learned on (an axis that does not act is not labelled).
export const applies = (axis, c) => {
  if (axis === 'atmosphere') return config.synthetic.regimes[c.regime].drag;
  if (axis === 'spaceWeather') return ['NRLMSISE00', 'JB2008', 'JACCHIA_ROBERTS'].includes(c.truth.atmosphere);
  if (axis === 'earthRadiation') return c.truth.srp === 'CANNONBALL';
  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { runs: { type: 'string' }, out: { type: 'string' }, rounds: { type: 'string', default: '120' } } });
  const cases = values.runs.split(',').flatMap((id) => fs.readFileSync(path.join(repoRoot, 'runs', id, 'cases.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((c) => !c.error);
  cases.sort((a, b) => a.seed - b.seed);
  const options = { rounds: Number(values.rounds), rate: 0.1, maxDepth: 3, minLeaf: 4, lambda: 1 };
  const folds = 5, out = { cases: cases.length, features: FEATURES, options, axes: {} };
  for (const axis of ML_AXES) {
    const rows = cases.filter((c) => applies(axis, c));
    const classes = [...new Set(rows.map((c) => JSON.stringify(c.truth[axis])))].sort();
    if (classes.length < 2) { out.axes[axis] = { classes, note: 'one level only' }; continue; }
    const y = rows.map((c) => classes.indexOf(JSON.stringify(c.truth[axis])));
    const X = rows.map((c) => c.fingerprint);
    const confusion = classes.map(() => classes.map(() => 0));
    let correct = 0;
    for (let f = 0; f < folds; ++f) {
      const tr = rows.map((_, i) => i).filter((i) => i % folds !== f), te = rows.map((_, i) => i).filter((i) => i % folds === f);
      const model = train(tr.map((i) => X[i]), tr.map((i) => y[i]), classes.length, options);
      for (const i of te) { const p = predict(model, X[i]); const k = p.indexOf(Math.max(...p)); ++confusion[y[i]][k]; if (k === y[i]) ++correct; }
    }
    const model = train(X, y, classes.length, options);
    const imp = importance(model, FEATURES.length);
    const majority = Math.max(...classes.map((_, k) => y.filter((v) => v === k).length)) / y.length;
    out.axes[axis] = {
      classes: classes.map((c) => JSON.parse(c)), n: rows.length, cvAccuracy: correct / rows.length, majorityRate: majority, confusion,
      topFeatures: imp.map((v, i) => [FEATURES[i], v]).sort((a, b) => b[1] - a[1]).slice(0, 6), model,
    };
    console.log(`${axis}: n ${rows.length}, ${classes.length} levels, CV accuracy ${(correct / rows.length).toFixed(3)} (majority ${majority.toFixed(3)})`);
  }
  const file = values.out ?? path.join(repoRoot, 'runs', `e12-physics-match-20-train-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(file);
}
