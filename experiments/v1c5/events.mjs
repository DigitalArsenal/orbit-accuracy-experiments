// The causal event rule (PLAN section 3): custody gap in the object's own element-set stream, or a maneuver the detector
// finds in it. Computed from sets created and dated at or before the issue time; truth is never read.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { epochMs } from '../../harness/gp-archive.mjs';
import { sha256 } from '../../harness/modules.mjs';
import { DAY, issueMs } from './universe.mjs';

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN; };

// The sets of one object available at `ms` within the lookback, ascending by epoch.
export const availableSets = (list, ms, lookbackDays) => list.filter(s => epochMs(s.creationDate) <= ms && epochMs(s.epoch) <= ms && epochMs(s.epoch) >= ms - lookbackDays * DAY)
  .sort((a, b) => epochMs(a.epoch) - epochMs(b.epoch));

export function custodyOf(available, ms, events) {
  const epochs = available.map(s => epochMs(s.epoch));
  if (!epochs.length) return { sets: 0, flag: false, reason: 'no sets' };
  const gaps = epochs.slice(1).map((e, i) => ({ gap: (e - epochs[i]) / DAY, at: e }));
  const age = (ms - epochs.at(-1)) / DAY;
  const longest = Math.max(age, ...gaps.filter(g => g.at >= ms - events.windowDays * DAY).map(g => g.gap));
  const typical = gaps.length >= events.minimumGapsForMedian ? median(gaps.map(g => g.gap)) : 1;
  const threshold = Math.max(events.staleFloorDays, events.staleFactor * typical);
  return { sets: epochs.length, ageDays: age, longestGapDays: longest, medianGapDays: typical, thresholdDays: threshold, flag: longest >= threshold };
}

export const detectorInput = available => available.map(s => ({ norad: s.norad, objectId: s.objectId, gpId: s.gpId, epoch: s.epoch, elements: s.elements }));

// Flags for a list of pairs. `setsByObject` maps norad to all loaded sets of the object.
export async function eventFlags({ run, runtime, config, e3, name, pairs, setsByObject, workers = 4 }) {
  const events = config.events, file = path.join(run.dir, `${name}.jsonl`);
  const done = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const completed = new Set(done.map(r => r.key));
  const pool = [];
  const make = () => {
    const w = new Worker(new URL('./event-worker.mjs', import.meta.url), { workerData: { runtime } });
    let resolve, reject;
    const ready = new Promise((a, b) => { resolve = a; reject = b; });
    w.on('error', e => reject(e));
    w.on('message', m => { if (m.error) return reject(new Error(m.error)); if (m.ready) { for (const p of m.provenance) run.modules[p.path] = p; resolve(); } else resolve(m.result); });
    return { ready, worker: w, request: sets => new Promise((a, b) => { resolve = a; reject = b; w.postMessage(sets); }) };
  };
  let next = 0, count = done.length;
  try {
    for (let i = 0; i < workers; i++) { const w = make(); pool.push(w); await w.ready; }
    const lane = async (w, index) => {
      const below = (Number(process.env.V1C5_DISPATCH_LOAD_BELOW) || config.dispatchLoadBelow) - index;
      while (next < pairs.length) {
        while (next < pairs.length && os.loadavg()[0] >= below) await sleep(15000);
        assert(fs.statfsSync(run.root).bavail * fs.statfsSync(run.root).bsize >= config.diskFloorGiB * 1024 ** 3, 'disk guard');
        if (next >= pairs.length) break;
        const pair = pairs[next++]; if (completed.has(pair.key)) continue;
        const ms = issueMs(e3, pair.day), available = availableSets(setsByObject.get(pair.norad) ?? [], ms, events.lookbackDays);
        const custody = custodyOf(available, ms, events);
        let detector = { sets: available.length, events: [], recent: [], error: null };
        if (available.length >= events.detector.minimumSets) {
          const r = await w.request(detectorInput(available));
          detector = { sets: available.length, events: r.events ?? [], recent: (r.events ?? []).filter(t => t > ms - events.windowDays * DAY && t <= ms), error: r.error ?? null };
        } else detector.skipped = 'fewer than the minimum sets';
        const record = { key: pair.key, norad: pair.norad, group: pair.group, ms, custody, detector, flagged: Boolean(custody.flag || detector.recent.length) };
        fs.appendFileSync(file, JSON.stringify(record) + '\n'); done.push(record);
        if (++count % 100 === 0) console.log(`${name}: ${count}/${pairs.length}`);
      }
    };
    await Promise.all(pool.map(lane));
  } finally { await Promise.all(pool.map(w => w.worker.terminate())); }
  assert.equal(done.length, pairs.length);
  const order = new Map(pairs.map((p, i) => [p.key, i])); done.sort((a, b) => order.get(a.key) - order.get(b.key));
  fs.writeFileSync(file, done.map(r => JSON.stringify(r)).join('\n') + '\n');
  run.files[path.basename(file)] = sha256(fs.readFileSync(file)); run.checkpoint();
  return done;
}
