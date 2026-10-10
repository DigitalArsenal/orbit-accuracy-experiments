// A bounded pool of worker threads (owner: at most 6). Jobs carry the operator bytes as a transferred
// ArrayBuffer, so a job's raw bytes live in exactly one thread and are dropped when it returns. A worker that dies
// fails the job it was running (the row is recorded as such) and is replaced.
import { Worker } from 'node:worker_threads';
import { MAX_WORKERS } from '../config.mjs';

export class Pool {
  constructor({ size, workerData, log = () => {} }) {
    if (!(size >= 1 && size <= MAX_WORKERS)) throw new Error(`worker count ${size} is outside 1..${MAX_WORKERS}`);
    this.size = size;
    this.workerData = workerData;
    this.log = log;
    this.queue = [];
    this.idle = [];
    this.running = new Map();   // worker -> {id, resolve}
    this.workers = new Set();
    this.nextId = 0;
    this.busyMs = 0;
    this.jobs = 0;
    this.respawns = 0;
    this.ready = Promise.all(Array.from({ length: size }, () => this.spawn()));
  }

  spawn() {
    return new Promise((resolve, reject) => {
      const w = new Worker(new URL('../worker.mjs', import.meta.url), { workerData: this.workerData });
      let up = false;
      this.workers.add(w);
      w.on('message', (m) => {
        if (m.ready) { up = true; this.idle.push(w); resolve(m); this.pump(); return; }
        const job = this.running.get(w);
        this.running.delete(w);
        this.busyMs += m.wallMs ?? 0;
        ++this.jobs;
        this.idle.push(w);
        job?.resolve(m);
        this.pump();
      });
      const died = (why) => {
        if (!this.workers.delete(w)) return;
        this.idle = this.idle.filter((x) => x !== w);
        const job = this.running.get(w);
        this.running.delete(w);
        this.log(`worker died: ${why}`);
        job?.resolve({ id: job.id, ok: false, error: `worker died: ${why}`, wallMs: 0 });
        if (!up) { reject(new Error(`worker failed to start: ${why}`)); return; }
        ++this.respawns;
        this.spawn().catch((e) => this.log(`respawn failed: ${e.message}`));
      };
      w.on('error', (e) => died(String(e.stack ?? e).slice(0, 300)));
      w.on('exit', (code) => died(`exit ${code}`));
    });
  }

  run(job, transfer = []) {
    return new Promise((resolve) => { const id = ++this.nextId; this.queue.push({ job: { ...job, id }, transfer, resolve: (m) => resolve({ ...m, id }) }); this.pump(); });
  }

  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift();
      const { job, transfer, resolve } = this.queue.shift();
      this.running.set(w, { id: job.id, resolve });
      w.postMessage(job, transfer);
    }
  }

  async close() { const all = [...this.workers]; this.workers.clear(); await Promise.all(all.map((w) => w.terminate())); }
}
