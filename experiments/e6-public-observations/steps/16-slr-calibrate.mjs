// Dev only (PLAN.md §4.5): the range sigma of the laser arm. The dev fits
// (step 40 on the dev window, every range at config.slr.calibration's
// sigma) give one reduced chi-square per fit; the sigma that makes their
// median 1 is sigma x sqrt(median). Writes results/e6/dev/slr-calibration.json.
//   node experiments/e6-public-observations/steps/16-slr-calibrate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../common.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median, quantile } from '../../../harness/stats.mjs';

const runs = fs.readdirSync(path.join(repoRoot, 'runs')).filter((d) => d.startsWith('e6-40-slr-fit-dev-')).sort();
const chi = { S: [], R: [] }, byTarget = {};
for (const id of runs) {
  const f = path.join(repoRoot, 'runs', id, 'samples.jsonl');
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    for (const v of ['S', 'R']) {
      const x = r.variants?.[v];
      if (!x?.reducedChiSquare) continue;
      chi[v].push(x.reducedChiSquare);
      (byTarget[r.target] ??= []).push(x.reducedChiSquare);
    }
  }
}
const sigma0 = config.slr.calibration.rangeSigmaM;
const m = median(chi.S);
const result = {
  window: 'dev', runs, sigmaUsedM: sigma0, fits: { S: chi.S.length, R: chi.R.length },
  reducedChiSquareS: { median: m, q25: quantile(chi.S, 0.25), q75: quantile(chi.S, 0.75) },
  reducedChiSquareR: { median: median(chi.R) },
  byTarget: Object.fromEntries(Object.entries(byTarget).map(([t, xs]) => [t, { fits: xs.length, median: median(xs) }])),
  rangeSigmaM: sigma0 * Math.sqrt(m),
};
const out = path.join(repoRoot, 'results/e6/dev/slr-calibration.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify(result, null, 1));
