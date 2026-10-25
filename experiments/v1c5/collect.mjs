// Bounded dispatch of one phase's arcs to V1c3's workers (its worker.mjs is imported unchanged: SGP4 covariance bases N/F/P,
// or the FFM-1 seed + resident STM transport). The raw arcs are appended to a JSONL file as they finish, so a stopped stage resumes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { setTimeout as sleep } from 'node:timers/promises';
import { sha256 } from '../../harness/modules.mjs';

const worker = new URL('../v1c3-console-covariance-calibration/worker.mjs', import.meta.url);

export async function collect({ root, run, runtime, name, phase, pairs, jobFor, config, selection }) {
  const rawFile = path.join(run.dir, `${name}.jsonl`);
  const arcs = fs.existsSync(rawFile) ? fs.readFileSync(rawFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const completed = new Set(arcs.map(a => a.key));
  let next = 0, sinceCheckpoint = 0;
  const save = arc => {
    arcs.push(arc); fs.appendFileSync(rawFile, JSON.stringify(arc) + '\n');
    if (++sinceCheckpoint >= 25) { sinceCheckpoint = 0; run.checkpoint(); }
    console.log(`${name}: ${arcs.length}/${pairs.length} ${arc.key}${arc.skipped ? ` skipped: ${arc.skipped}` : ''}`);
  };
  const pool = [];
  function makeWorker() {
    const w = new Worker(worker, { workerData: { modules: runtime, phase, config: { seedFactorHorizonHours: config.seedFactorHorizonHours }, selection } });
    let resolve, reject;
    const ready = new Promise((a, b) => { resolve = a; reject = b; });
    w.on('error', e => reject(e));
    w.on('message', m => {
      if (m.error) return reject(new Error(m.error));
      if (m.ready) { for (const p of m.provenance) run.modules[p.path] = p; resolve(); } else resolve(m.result);
    });
    return { ready, worker: w, request: job => new Promise((a, b) => { resolve = a; reject = b; w.postMessage(job); }) };
  }
  try {
    for (let i = 0; i < config.workers; i++) { const w = makeWorker(); pool.push(w); await w.ready; }
    // Lane i dispatches only while the 1-minute load is below dispatchLoadBelow - i, so a busy host keeps the first lanes running.
    async function lane(w, index) {
      const below = (Number(process.env.V1C5_DISPATCH_LOAD_BELOW) || config.dispatchLoadBelow) - index;
      while (next < pairs.length) {
        while (next < pairs.length && os.loadavg()[0] >= below) { console.log(`Load ${os.loadavg()[0].toFixed(1)}: lane ${index} waiting below ${below}`); await sleep(15000); }
        assert(fs.statfsSync(root).bavail * fs.statfsSync(root).bsize >= config.diskFloorGiB * 1024 ** 3, 'disk guard');
        run.peakDispatchLoad = Math.max(run.peakDispatchLoad ?? 0, os.loadavg()[0]);
        if (next >= pairs.length) break;
        const pair = pairs[next++]; if (completed.has(pair.key)) continue;
        const job = jobFor(pair); save(job.skipped ? job : await w.request(job));
      }
    }
    await Promise.all(pool.map(lane));
  } finally { await Promise.all(pool.map(w => w.worker.terminate())); }
  assert.equal(arcs.length, pairs.length);
  const order = new Map(pairs.map((p, i) => [p.key, i])); arcs.sort((a, b) => order.get(a.key) - order.get(b.key));
  fs.writeFileSync(rawFile, arcs.map(a => JSON.stringify(a)).join('\n') + '\n');
  run.files[path.basename(rawFile)] = sha256(fs.readFileSync(rawFile));
  run.checkpoint(); return arcs;
}
