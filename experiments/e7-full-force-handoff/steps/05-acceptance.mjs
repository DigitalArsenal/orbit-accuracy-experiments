#!/usr/bin/env node
// E7 step 05 (PLAN.md section 7): acceptance of the harness on the dev
// window, before the freeze.
//  A0.1 foundation/frames' RTN rotation against R = r/|r|, N = r x v / |r x v|,
//       T = N x R (accumulate's convention), every dev target, to 1e-12.
//  A0.2 every S target of a dev batch fell in a single-sample bin.
//  A0.3 H-truth is zero at its seed; S and H-epoch at the 0 h target (both
//       SGP4 at zero elapsed time, then minutes of SGP4 or HPOP): reported.
//
//   node experiments/e7-full-force-handoff/steps/05-acceptance.mjs --window dev --batch ID
import fs from 'node:fs';
import path from 'node:path';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { cli, config, configPath, context, regimeTruth, schedule, setsByObjectOf, windowSets } from '../common.mjs';
import { targetAxes } from '../methods.mjs';
import { loadBatch, norm } from '../analysis.mjs';

const { values, window, modules, archive, reference: referenceDir, regimes } = cli({ batch: { type: 'string' } });
if (window.name !== 'dev') throw new Error('acceptance runs on the dev window');
const run = startRun({ experiment: config.experiment, step: '05-acceptance', configPath, modulesDir: modules, args: values });
const ctx = await context(modules, run);
const truth = regimeTruth(referenceDir, regimes);
const objects = new Set(Object.values(truth).flatMap((t) => t.objects));
const { sets, files } = windowSets(archive, window, objects, Math.max(...config.arcSpansDays) + 2);
run.addInputs('gpHistory', files);
const samples = schedule(window, truth, setsByObjectOf(sets));

// A0.1
const unit = (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
let worst = 0, targets = 0;
for (const s of samples) {
  await targetAxes(ctx, s.targets);
  for (const t of s.targets.filter((x) => !x.missing)) {
    const R = unit(t.r), N = unit(cross(t.r, t.v)), T = cross(N, R);
    const rows = [R, T, N];
    for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) worst = Math.max(worst, Math.abs(t.axes[3 * i + j] - rows[i][j]));
    ++targets;
  }
}
const a01 = { targets, maxDifference: worst, pass: targets > 0 && worst <= 1e-12 };

// A0.2, A0.3 from the dev batch
const { rows } = loadBatch('dev', values.batch);
const multi = rows.reduce((a, r) => a + (r.sCounts?.multi ?? 0), 0), missing = rows.reduce((a, r) => a + (r.sCounts?.missing ?? 0), 0);
const a02 = { rows: rows.length, multiSampleBins: multi, targetsWithoutBin: missing, pass: rows.length > 0 && multi === 0 && missing === 0 };
const truth0 = rows.filter((r) => r.errors['H-truth']?.[0]).map((r) => norm(r.errors['H-truth'][0]));
const both0 = rows.filter((r) => r.errors.S?.[0] && (r.errors['H-epoch'] ?? r.errors['H-epoch:bstar'])?.[0]);
const diff0 = both0.map((r) => norm([0, 1, 2].map((k) => r.errors.S[0][k] - (r.errors['H-epoch'] ?? r.errors['H-epoch:bstar'])[0][k])));
const a03 = { hTruthAtSeed: { n: truth0.length, max: Math.max(...truth0), pass: truth0.length > 0 && Math.max(...truth0) === 0 },
  sMinusHEpochAt0h: { n: diff0.length, medianM: median(diff0), maxM: Math.max(...diff0), medianSErrorM: median(both0.map((r) => norm(r.errors.S[0]))) } };
const result = { window: window.name, batch: values.batch, a01, a02, a03 };
run.write('acceptance.json', result);
run.finish(result);
const out = path.join(repoRoot, 'results/e7/dev');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'acceptance.json'), `${JSON.stringify({ run: run.id, ...result }, null, 1)}\n`);
console.log(JSON.stringify(result, null, 1));
await ctx.destroy();
