// A bounded pool of worker threads (owner: at most 6). Jobs carry the operator bytes as a transferred
// ArrayBuffer, so a job's raw bytes live in exactly one thread and are dropped when it returns.
import { Worker } from 'node:worker_threads';
import { MAX_WORKERS } from '../config.mjs';

export class Pool {
  constructor({ size, workerData, log = () => {} }) {
    if (!(size >= 1 && size <= MAX_WORKERS)) throw new Error(`worker count ${size} is outside 1..${MAX_WORKERS}`);
    this.size = size;
    this.log = log;
    this.queue = [];
    this.idle = [];
    this.waiting = new Map();
    this.nextId = 0;
    this.busyMs = 0;
    this.jobs = 0;
    this.ready = Promise.all(Array.from({ length: size }, (_, i) => new Promise((resolve, reject) => {
      const w = new Worker(new URL('../worker.mjs', import.meta.url), { workerData });
      w.on('message', (m) => {
        if (m.ready) { this.idle.push(w); resolve(m); this.pump(); return; }
        const done = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        this.busyMs += m.wallMs ?? 0;
        ++this.jobs;
        this.idle.push(w);
        done?.(m);
        this.pump();
      });
      w.on('error', (e) => { this.log(`worker ${i} error: ${e.stack ?? e}`); reject(e); });
      this.workers = [...(this.workers ?? []), w];
    })));
  }

  run(job, transfer = []) {
    return new Promise((resolve) => { this.queue.push({ job: { ...job, id: ++this.nextId }, transfer, resolve }); this.pump(); });
  }

  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift();
      const { job, transfer, resolve } = this.queue.shift();
      this.waiting.set(job.id, resolve);
      w.postMessage(job, transfer);
    }
  }

  async close() { await Promise.all((this.workers ?? []).map((w) => w.terminate())); }
}
