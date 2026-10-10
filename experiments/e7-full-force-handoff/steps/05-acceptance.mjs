#!/usr/bin/env node
// E7 step 05 (PLAN.md section 8): acceptance of the harness on the dev
// window, before the freeze.
//  A0.1 foundation/frames' RTN rotation against R = r/|r|, N = r x v / |r x v|,
//       T = N x R (accumulate's convention), every dev target, to 1e-12.
//  A0.2 every SGP4 target of a dev batch fell in a single-sample bin.
//  A0.3 H-truth is zero at its seed; SGP4 and H-epoch at the 0 h target
//       (both SGP4 at zero elapsed time, then minutes of SGP4 or HPOP): reported.
//  A0.4 the carrier construction of maneuvers.mjs: the SGP4 GCRF state it
//       recovers at its first grid epoch (the millisecond after the OMM's
//       epoch, a fraction of a millisecond later) equals analysis/epoch-state's
//       epoch state moved by its velocity over that fraction, within 1 m and
//       1 cm/s (the velocity changes by the acceleration over the fraction,
//       under 1 cm/s).
//  A0.5 the released Earth orientation (rows held after the cutoff) against
//       the observed rows: H-epoch for GPS at 7 d moves by less than 1 m.
//
//   node experiments/e7-full-force-handoff/steps/05-acceptance.mjs --window dev --batch ID
import fs from 'node:fs';
import path from 'node:path';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { decodeOemStream } from '../../../harness/records.mjs';
import { cli, config, configPath, context, coefficients, forcesOf, regimeTruth, schedule, setsByObjectOf, windowSets } from '../common.mjs';
import { epochStates, hpopErrors, targetAxes } from '../methods.mjs';
import { ManeuverHistory } from '../maneuvers.mjs';
import { readGpsMetadata } from '../gnss.mjs';
import { loadBatch, norm } from '../analysis.mjs';

const { values, window, modules, archive, reference: referenceDir, regimes } = cli({ batch: { type: 'string' } });
if (window.name !== 'dev') throw new Error('acceptance runs on the dev window');
const run = startRun({ experiment: config.experiment, step: '05-acceptance', configPath, modulesDir: modules, args: values });
const ctx = await context(modules, run);
const truth = regimeTruth(referenceDir, regimes);
const objects = new Set(Object.values(truth).flatMap((t) => t.objects));
const { sets, files } = windowSets(archive, window, objects, 2);
run.addInputs('gpHistory', files);
const byObject = setsByObjectOf(sets);
const samples = schedule(window, truth, byObject);

// A0.1
const unit = (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
let worst = 0, targets = 0;
for (const s of samples) {
  await targetAxes(ctx, s.targets);
  for (const t of s.targets.filter((x) => !x.missing)) {
    const R = unit(t.r), N = unit(cross(t.r, t.v)), T = cross(N, R);
    [R, T, N].forEach((row, i) => row.forEach((x, j) => { worst = Math.max(worst, Math.abs(t.axes[3 * i + j] - x)); }));
    ++targets;
  }
}
const a01 = { targets, maxDifference: worst, pass: targets > 0 && worst <= 1e-12 };

// A0.2, A0.3 from the dev batch
const { rows } = loadBatch('dev', values.batch);
const counts = rows.map((r) => r.info?.S?.sCounts).filter(Boolean);
const multi = counts.reduce((a, c) => a + c.multi, 0), missing = counts.reduce((a, c) => a + c.missing, 0);
const a02 = { rows: rows.length, multiSampleBins: multi, targetsWithoutBin: missing, pass: counts.length > 0 && multi === 0 && missing === 0 };
const truth0 = rows.filter((r) => r.errors['H-truth']?.[0]).map((r) => norm(r.errors['H-truth'][0]));
const both0 = rows.filter((r) => r.errors.S?.[0] && r.errors['H-epoch']?.[0]);
const diff0 = both0.map((r) => norm([0, 1, 2].map((k) => r.errors.S[0][k] - r.errors['H-epoch'][0][k])));
const a03 = { hTruthAtSeed: { n: truth0.length, max: Math.max(...truth0), pass: truth0.length > 0 && Math.max(...truth0) === 0 },
  sgp4MinusHEpochAt0h: { n: diff0.length, medianM: median(diff0), maxM: Math.max(...diff0), medianSgp4ErrorM: median(both0.map((r) => norm(r.errors.S[0]))) } };

// A0.4 on the first sample of each regime
const a04 = { checked: [], pass: true };
for (const [name, t] of Object.entries(truth)) {
  const s = samples.find((x) => x.regime === name);
  if (!s) continue;
  const list = byObject.get(s.norad);
  const template = decodeOemStream(new Uint8Array(t.products.load(t.products.entries(s.norad)[0]).bytes))[0];
  const m = new ManeuverHistory(ctx, name, list, template);
  const traj = await m.trajectory(s.index);
  const [state] = await epochStates(ctx['epoch-state'], [list[s.index]]);
  const v = state.state.slice(3, 6);
  // Seconds from the epoch (microseconds in its text) to the grid's first epoch.
  const micros = Number((/\.(\d+)/.exec(list[s.index].epoch)?.[1] ?? '0').padEnd(6, '0').slice(0, 6));
  const dt = (traj.startMs - list[s.index].epochMs) / 1000 - (micros % 1000) / 1e6;
  const dr = [0, 1, 2].map((i) => traj.data[i] * 1000 - (state.state[i] + v[i] * dt));
  const dv = [0, 1, 2].map((i) => traj.data[3 + i] * 1000 - v[i]);
  const ok = Math.hypot(...dr) < 1 && Math.hypot(...dv) < 1e-2;
  a04.checked.push({ regime: name, norad: s.norad, elapsedSeconds: dt, positionM: Math.hypot(...dr), velocityMs: Math.hypot(...dv), pass: ok });
  a04.pass &&= ok;
}

// A0.5 on up to five GPS samples
const gnss = readGpsMetadata(config.inputs.gnssMetadata);
const a05 = { samples: [], pass: true };
for (const s of samples.filter((x) => x.regime === 'GPS' && !x.targets.at(-1).missing).slice(0, 5)) {
  const set = byObject.get(s.norad)[s.index];
  const [state] = await epochStates(ctx['epoch-state'], [set]);
  const request = { forces: forcesOf('GPS', {}), coefficients: coefficients('GPS', s.norad, set, 'bstar', gnss), cutoffMs: s.cutoffMs };
  const a = await hpopErrors(ctx, state, s.epochMs, s.targets, { ...request, drivers: 'released' });
  const b = await hpopErrors(ctx, state, s.epochMs, s.targets, { ...request, drivers: 'observed' });
  const d = norm([0, 1, 2].map((k) => a.errors.at(-1)[k] - b.errors.at(-1)[k]));
  a05.samples.push({ norad: s.norad, epoch: s.epoch, differenceAt7dM: d });
  a05.pass &&= d < 1;
}
const result = { window: window.name, batch: values.batch, a01, a02, a03, a04, a05 };
run.write('acceptance.json', result);
run.finish(result);
const out = path.join(repoRoot, 'results/e7/dev');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'acceptance.json'), `${JSON.stringify({ run: run.id, ...result }, null, 1)}\n`);
console.log(JSON.stringify(result, null, 1));
await ctx.destroy();
