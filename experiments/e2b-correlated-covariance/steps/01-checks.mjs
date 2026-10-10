#!/usr/bin/env node
// E2b A0 checks (PLAN.md section 8), on the dev window: common_epoch's error
// of an anchor at a precise epoch equals accumulate's reference-mode error of
// the same set at the same epoch (age bin of +-1e-6 d around the exact age),
// for up to 60 anchor targets of a step-10 dev run; and every target of that
// run is accounted for. Writes results/e2b/dev/checks.json.
//
//   node experiments/e2b-correlated-covariance/steps/01-checks.mjs --window dev --errors <step-10 dev run id>
import fs from 'node:fs';
import path from 'node:path';
import { json, sha256 } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { epochMs } from '../../../harness/gp-archive.mjs';
import { cli, config, configPath, readRuns, regimeReference, windowSets, loadGp, DAY_MS } from '../common.mjs';

const { values, window, modules, archive, reference: referenceDir } = cli({ errors: { type: 'string' } });
if (window.name !== 'dev') throw new Error('A0 runs on the dev window');
const run = startRun({ experiment: config.experiment, step: '01-checks-dev', configPath, modulesDir: modules, args: values });
run.addInputs('run:errors', { [values.errors]: sha256(fs.readFileSync(path.join(repoRoot, 'runs', values.errors, 'manifest.json'))) });
const gp = await loadGp(modules, run);
const rows = await readRuns([values.errors], 'errors');
const reference = regimeReference(referenceDir, 'GPS');
const objects = [...new Set(rows.map((r) => r.norad))];
const { byObject } = windowSets(archive, referenceDir, window, objects);
const picked = rows.filter((r) => !r.missing).filter((_, k) => k % Math.max(1, Math.floor(rows.length / 60)) === 0).slice(0, 60);
let worst = 0, compared = 0;
for (const r of picked) {
  const set = byObject.get(r.norad).find((s) => s.epoch === r.anchor);
  const [, age, rtn] = r.sets.find((s) => s[0] === r.anchor);
  const frames = reference.frames(r.norad, epochMs(r.epoch) - DAY_MS / 24, epochMs(r.epoch) + DAY_MS / 24);
  const acc = await gp.invokeJson('accumulate', [ommFrame([set]), ...frames,
    json('options', { ageBinsDays: [[age - 1e-6, age + 1e-6]], referenceStepSeconds: 0 })], 'accumulator');
  const stratum = acc.strata.find((s) => s.n === 1);
  if (!stratum) continue;
  ++compared;
  for (let k = 0; k < 6; ++k) worst = Math.max(worst, Math.abs(stratum.sum[k] - rtn[k]) / Math.max(1e-3, Math.abs(rtn[k])));
}
const counts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', values.errors, 'counts.json'), 'utf8'));
const checks = {
  window: { name: window.name, from: window.from, to: window.to },
  a0_1: { what: 'common_epoch error = accumulate reference-mode error at the same set and precise epoch', compared, worstRelativeDifference: worst, pass: compared > 0 && worst < 1e-8 },
  a0_2: { what: 'every target accounted for (rows = targets; missing counted)', rows: rows.length, counts, pass: rows.length === Object.values(counts).reduce((a, c) => a + c.targets, 0) },
};
const dir = path.join(repoRoot, 'results', 'e2b', 'dev');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'checks.json'), `${JSON.stringify(checks, null, 1)}\n`);
const manifest = run.finish({ checks });
fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(JSON.stringify(checks, null, 1));
await gp.destroy();
