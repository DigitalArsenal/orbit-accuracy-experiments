// A compute worker (one worker thread = one compute process of the budget). It opens the fitter once, with the
// environment inputs of its cycle, and answers jobs. Every result is a derived record, never a raw state series.
import { parentPort, workerData } from 'node:worker_threads';
import { openFitter } from './head-fit.mjs';

const fitter = await openFitter(workerData.envConfig);
const handlers = {
  head: (job) => fitter.fitHead(job),
  pair: (job) => fitter.pairMismatch(job),
  synthetic: (job) => fitter.synthetic(job),
};
parentPort.postMessage({ ready: true, harness: fitter.harness, provenance: fitter.env.provenance });
parentPort.on('message', async (job) => {
  const t0 = performance.now();
  try {
    const result = await handlers[job.kind](job);
    parentPort.postMessage({ id: job.id, ok: true, result, sec: (performance.now() - t0) / 1000 });
  } catch (error) {
    parentPort.postMessage({ id: job.id, ok: false, error: String(error?.stack ?? error).split('\n').slice(0, 6).join(' | '), sec: (performance.now() - t0) / 1000 });
  }
});
