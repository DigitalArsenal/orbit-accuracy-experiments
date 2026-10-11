// Corrected OMMs scored by the modules (PLAN.md 5.1): each correction is E1's edit of the OMM (mean anomaly + n·Δt),
// and the edited OMM goes through analysis/gp-error-model `accumulate` at the sample's own truth targets (E7
// sgp4Errors), exactly as C0 did. Runs in worker threads, one class shard each. Routing only.
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { shiftAlongTrack } from '../e1-gps-epoch/methods.mjs';
import { sgp4Errors } from '../e7-full-force-handoff/methods.mjs';
import { DAY_MS, config, loadPinned, windowSpan } from './common.mjs';
import { oneStateSource, stateAt, truthFor } from './truth.mjs';

const self = new URL(import.meta.url);

// items: [{gpId, norad, targets: [{age, ms, file}], dt: {candidateId: seconds}}]; sets: the items' element sets.
// -> {candidateId: {gpId: {age: e6 | null}}}
async function rescoreShard({ window, cls, sets, items }) {
  const [from, to] = windowSpan(window, cls);
  const hi = Date.parse(`${to}T00:00:00Z`) + DAY_MS;
  const byId = new Map(sets.map((s) => [s.gpId, s]));
  const ctx = {
    'gp-error-model': await loadPinned('analysis/gp-error-model'),
    frames: await loadPinned('foundation/frames'),
    time: await loadPinned('foundation/time'),
  };
  const truth = await truthFor(cls, { readers: { time: ctx.time, frames: ctx.frames }, fromDay: from, toDay: new Date(hi + 4 * DAY_MS).toISOString().slice(0, 10) });
  const out = {};
  const sorted = [...items].sort((a, b) => a.norad - b.norad);
  let last = null;
  for (const item of sorted) {
    if (item.norad !== last) { truth.dropCache(); last = item.norad; }
    const set = byId.get(item.gpId);
    if (!set) throw new Error(`no element set ${item.gpId}`);
    const targets = item.targets.map((t) => { const state = stateAt(truth, item.norad, t.file, t.ms); return state ? { ...t, state } : { ...t, missing: true }; });
    const one = oneStateSource(truth, targets);
    for (const [cand, dt] of Object.entries(item.dt)) {
      const { errors } = await sgp4Errors(ctx, one.source, shiftAlongTrack(set, dt), one.targets, { full: true });
      (out[cand] ??= {})[item.gpId] = Object.fromEntries(targets.map((t, j) => [t.age, t.missing ? null : errors[j]]));
    }
  }
  for (const m of Object.values(ctx)) await m.destroy();
  return out;
}

// byClass: {cls: items}; setsById: the window's element sets. Shards each class by object over at most `workers`
// threads (config.compute.maxWorkers).
export async function rescoreAll({ window, byClass, setsById, workers = config.compute.maxWorkers, log = () => {} }) {
  const jobs = [];
  for (const [cls, items] of Object.entries(byClass)) {
    const objects = [...new Set(items.map((i) => i.norad))].sort((a, b) => a - b);
    const n = Math.max(1, Math.min(Math.ceil(items.length / 1500), objects.length, workers));
    for (let s = 0; s < n; ++s) {
      const mine = new Set(objects.filter((_, i) => i % n === s));
      const its = items.filter((i) => mine.has(i.norad));
      jobs.push({ window, cls, items: its, sets: its.map((i) => setsById.get(i.gpId)) });
    }
  }
  const results = [];
  let next = 0, done = 0;
  const limit = Math.max(1, Math.min(workers, jobs.length, os.cpus().length));
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await new Promise((r) => setTimeout(r, 30000));
      results.push(await new Promise((resolve, reject) => {
        const w = new Worker(self, { workerData: job, resourceLimits: { maxOldGenerationSizeMb: 8192 } });
        w.once('message', resolve);
        w.once('error', reject);
        w.once('exit', (code) => { if (code) reject(new Error(`rescore worker ${job.cls} exited ${code}`)); });
      }));
      log(`rescored ${++done}/${jobs.length} shards (${job.cls}, ${job.items.length} samples)`);
    }
  }));
  const out = {};
  for (const r of results) for (const [cand, m] of Object.entries(r)) Object.assign(out[cand] ??= {}, m);
  return out;
}

if (!isMainThread && workerData?.items) parentPort.postMessage(await rescoreShard(workerData));
