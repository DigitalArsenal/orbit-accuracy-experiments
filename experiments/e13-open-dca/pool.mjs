// A pool of worker threads with a job queue and retries. The size is capped by the experiment's compute budget.
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { config, experimentDir } from './common.mjs';

export class Pool {
  constructor(size, log, envConfig, workerFile = path.join(experimentDir, 'worker.mjs')) {
    if (size > config.compute.workers) throw new Error(`at most ${config.compute.workers} compute workers (config.compute.workers)`);
    this.size = size; this.log = log; this.envConfig = envConfig; this.workerFile = workerFile;
    this.queue = []; this.pending = new Map(); this.nextId = 1; this.workers = []; this.info = null;
  }
  async start() {
    await Promise.all(Array.from({ length: this.size }, (_, i) => new Promise((resolve, reject) => {
      const w = new Worker(this.workerFile, { workerData: { envConfig: this.envConfig } });
      w.index = i; w.busy = null;
      w.on('message', (m) => {
        if (m.ready) { this.info = m; resolve(); this.pump(); return; }
        w.busy = null;
        const p = this.pending.get(m.id);
        if (p) { this.pending.delete(m.id); p.resolve(m); }
        this.pump();
      });
      w.on('error', (e) => {
        this.log(`worker ${i} crashed: ${e.message}`);
        const job = w.busy; w.busy = null;
        if (job) { const p = this.pending.get(job.id); if (p) { this.pending.delete(job.id); p.resolve({ id: job.id, ok: false, error: `worker crashed: ${e.message}` }); } }
        reject(e);
      });
      this.workers.push(w);
    })));
  }
  // Run a job; resolves {ok, result|error, sec}. Retries once on failure.
  run(job, { retries = 1 } = {}) {
    return new Promise((resolve) => {
      const attempt = (left) => {
        const id = this.nextId++;
        this.pending.set(id, { resolve: (m) => { if (!m.ok && left > 0 && !/GUARD FAILED/.test(m.error ?? '')) { this.log(`retry ${job.kind} ${job.norad ?? ''}: ${m.error}`); attempt(left - 1); } else resolve(m); } });
        this.queue.push({ ...job, id });
        this.pump();
      };
      attempt(retries);
    });
  }
  pump() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue;
      const job = this.queue.shift();
      w.busy = job;
      w.postMessage(job);
    }
  }
  get outstanding() { return this.queue.length + this.workers.filter((w) => w.busy).length; }
  async stop() { for (const w of this.workers) await w.terminate(); this.workers = []; }
}
