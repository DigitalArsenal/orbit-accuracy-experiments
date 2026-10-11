// Step 20, epoch samples (PLAN.md 4, 5.2): for every OMM of a regime class with epoch in the window, SGP4's error at
// the first truth state after the epoch (within the class's tolerance) and at ages 1 and 3 days, the speed of its
// epoch state, and the covariates G (E1's geometry), O and W. Every error is analysis/gp-error-model's `accumulate`
// (E7 sgp4Errors), every state and frame a module's. Writes runs/<run>/samples.jsonl.gz (never committed).
//
//   node experiments/e16-cross-regime-epoch/steps/20-epoch-samples.mjs --window train|validation|test --class LEO-PL [--shard 0/4]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startRun } from '../../../harness/provenance.mjs';
import { readGfzKp } from '../../../harness/full-force.mjs';
import { readRsga } from '../../../harness/cutoff-environment.mjs';
import { geometry } from '../../e1-gps-epoch/geometry.mjs';
import { sgp4Errors } from '../../e7-full-force-handoff/methods.mjs';
import { epochStates } from '../../e2-catalog-covariance/product.mjs';
import { DAY_MS, HOUR_MS, cli, config, configPath, loadPinned, modulesRoot, readJson, repoRoot, resultsDir, sha256, throttle, windowSpan } from '../common.mjs';
import { oneStateSource, releaseMs, truthFor } from '../truth.mjs';
import { windowSets } from '../sets.mjs';
import { orbitCovariates, weatherCovariates } from '../covariates.mjs';

const { values, window, locks, objects: only } = cli({ class: { type: 'string' }, shard: { type: 'string', default: '0/1' } });
const cls = values.class;
const regime = config.regimes[cls];
if (!regime) throw new Error(`unknown class ${cls}`);
const [shard, shards] = values.shard.split('/').map(Number);
// The step name carries window, class and shard: shards started in the same second need distinct run ids.
const run = startRun({ experiment: config.experiment, step: `20-epoch-samples-${window}-${cls.replace('/', '_')}-s${shard}of${shards}${values.objects ? '-objects' : ''}`, configPath, modulesDir: modulesRoot(), args: { window, class: cls, shard: values.shard, objects: values.objects ?? null } });
if (locks) run.manifest.locks = locks;
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} [${cls} ${window} ${values.shard}] ${m}`);

// Objects: the inventory's (fixed before any error); a shard takes every shards-th object.
const inventory = readJson(path.join(resultsDir, 'inventory.json'));
run.addInputs('inventory', { 'inventory.json': sha256(fs.readFileSync(path.join(resultsDir, 'inventory.json'))) });
const objects = inventory.objects.filter((o) => o.regimeClass === cls && !o.excluded && (!only || only.has(o.norad))).map((o) => o.norad).sort((a, b) => a - b).filter((_, i) => i % shards === shard);
const [from, to] = windowSpan(window, cls);
const lo = Date.parse(`${from}T00:00:00Z`), hi = Date.parse(`${to}T00:00:00Z`) + DAY_MS;

const read = windowSets(window, inventory.objects.map((o) => o.norad), { log });
run.addInputs('gpHistory', read.files);
const mine = new Set(objects);
const setsBy = new Map();
for (const s of read.sets) { if (!mine.has(s.norad)) continue; if (!setsBy.has(s.norad)) setsBy.set(s.norad, []); setsBy.get(s.norad).push(s); }
for (const list of setsBy.values()) list.sort((a, b) => a.epochMs - b.epochMs);

const ctx = {
  'gp-error-model': await loadPinned('analysis/gp-error-model', run),
  'epoch-state': await loadPinned('analysis/epoch-state', run),
  frames: await loadPinned('foundation/frames', run),
  time: await loadPinned('foundation/time', run),
};
const dayIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const truth = await truthFor(cls, { readers: { time: ctx.time, frames: ctx.frames }, fromDay: from, toDay: dayIso(hi + 4 * DAY_MS), log });
const leo = regime.group === 'LEO';
const spw = leo ? { gfz: readGfzKp(config.inputs.gfzKp), rsga: readRsga(config.inputs.swpcRsga, path.join(repoRoot, 'runs', 'cache', 'rsga')) } : null;
if (spw) { run.addInputs('spaceWeather', { [path.basename(config.inputs.gfzKp)]: spw.gfz.sha256 }); run.addInputs('swpcRsga', spw.rsga.files); }
const weatherCache = new Map();

const tol0 = regime.toleranceSeconds * 1000;
const half = config.scoring.planetDayBinHalfWidthHours * HOUR_MS;
const planet = regime.truth === 'planet';
function targetsOf(set) {
  const out = [];
  for (const a of [0, ...config.scoring.descriptiveAgesDays]) {
    const t = set.epochMs + a * DAY_MS;
    const s = a === 0 ? truth.firstAtOrAfter(set.norad, t, tol0)
      : planet ? truth.nearestIn(set.norad, t, t - half, t + half) : truth.firstAtOrAfter(set.norad, t, 900e3);
    out.push(s ? { age: a, ms: s.ms, epoch: s.epoch, r: s.r, v: s.v, file: s.entry.file, releaseMs: releaseMs(s), state: s } : { age: a, missing: true });
  }
  return out;
}

const rows = [];
const counts = { objects: 0, sets: 0, withEpochTarget: 0, refusedEpochState: 0, refusedGeometry: 0, noWeather: 0, sgp4Missing: 0, multiSampleBins: 0 };
for (const norad of objects) {
  await throttle(log);
  const all = setsBy.get(norad) ?? [];
  const idx = all.map((s, i) => i).filter((i) => all[i].epochMs >= lo && all[i].epochMs < hi);
  if (!idx.length) continue;
  ++counts.objects;
  counts.sets += idx.length;
  // Targets first: only the OMMs with a truth state after their epoch are computed further.
  const withTarget = idx.map((i) => ({ i, targets: targetsOf(all[i]) })).filter((x) => !x.targets[0].missing);
  if (!withTarget.length) continue;
  const inWindow = withTarget.map((x) => all[x.i]);
  const states = await epochStates(ctx['epoch-state'], inWindow);
  // E1's geometry for the object's sets in one call; a refused node point refuses the call, so then set by set.
  let geo;
  try { geo = await geometry(ctx.frames, ctx['epoch-state'], inWindow); } catch {
    geo = [];
    for (const s of inWindow) { try { geo.push((await geometry(ctx.frames, ctx['epoch-state'], [s]))[0]); } catch { geo.push(null); ++counts.refusedGeometry; } }
  }
  for (let k = 0; k < withTarget.length; ++k) {
    const set = inWindow[k], targets = withTarget[k].targets;
    if (!states[k]) { ++counts.refusedEpochState; continue; }
    if (!geo[k]) continue;
    ++counts.withEpochTarget;
    const one = oneStateSource(truth, targets);
    const { errors, counts: c } = await sgp4Errors(ctx, one.source, set, one.targets, { full: true });
    counts.sgp4Missing += c.missing; counts.multiSampleBins += c.multi;
    if (!errors[0]) continue;
    const v = states[k].state.slice(3);
    const W = leo ? weatherCovariates(set, spw, weatherCache) : null;
    if (leo && !W) ++counts.noWeather;
    rows.push({
      norad, gpId: set.gpId, cls, epoch: set.epoch, epochMs: set.epochMs, createdMs: set.createdMs,
      meanMotion: set.elements.MEAN_MOTION, speedKmS: Math.hypot(v[0], v[1], v[2]) / 1000,
      errors: Object.fromEntries(targets.map((t, j) => [t.age, t.missing || !errors[j] ? null : { e: errors[j], targetMs: t.ms, ageHours: (t.ms - set.epochMs) / HOUR_MS, file: t.file, releaseMs: t.releaseMs }])),
      G: geo[k], O: orbitCovariates(all, withTarget[k].i), W,
    });
  }
  truth.dropCache();
  log(`${norad}: ${rows.length} samples so far`);
}

run.addInputs('truth', truth.read);
const file = run.write('samples.jsonl.gz', zlib.gzipSync(rows.map((r) => JSON.stringify(r)).join('\n')));
const m = run.finish({ class: cls, window, shard: values.shard, counts, samples: rows.length, setsCache: path.relative(repoRoot, read.cacheFile) });
log(`done: ${rows.length} samples (${JSON.stringify(counts)}) -> ${path.relative(repoRoot, file)}; run ${m.run}`);
for (const mod of Object.values(ctx)) await mod.destroy();
