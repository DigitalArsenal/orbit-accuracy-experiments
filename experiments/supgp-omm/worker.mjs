// A pool thread: reads one operator file with the module readers, scores CelesTrak's set on it and,
// when the gate passes, fits our OMM (all gp-error-model, WASM). It returns derived records only.
import { parentPort, workerData } from 'node:worker_threads';
import { loadFitter, loadReader } from './lib/modules.mjs';
import { loadMemeReader } from './lib/readers/meme.mjs';
import { labelledEphemeris, summarizeOem } from './lib/records.mjs';
import { evaluate, windowOf } from './lib/score.mjs';
import { sources } from './sources/index.mjs';

const { fitModules, readerModules, sourceIds } = workerData;
const fitter = await loadFitter(fitModules);
const needs = new Set(sourceIds.flatMap((s) => sources[s].readers ?? []));
const readers = {};
if (needs.has('meme')) readers.meme = await loadMemeReader(readerModules);
if (needs.has('orbit-products')) readers.orbitProducts = await loadReader('files/orbit-products', readerModules);
if (needs.has('reference-states')) readers.referenceStates = await loadReader('analysis/reference-states', readerModules);
if (needs.has('eop-parser')) readers.eopParser = await loadReader('data-source/eop-parser', readerModules);
parentPort.postMessage({ ready: true, fitter: fitter.provenance });

parentPort.on('message', async (job) => {
  const t0 = performance.now();
  try {
    const src = sources[job.source];
    const bytes = Buffer.from(job.body);
    job.body = null;
    const read = await src.read({ readers, cand: job.cand, row: job.row, bytes, context: job.context });
    const tRead = performance.now();
    const ephemeris = labelledEphemeris(read.oem, job.row.norad, read.objectName);
    const summary = summarizeOem(ephemeris.payload);
    const hours = job.hours ?? src.hours;
    // A prefix that ends before the window's end: the caller refetches a longer one.
    const window = windowOf({ epoch: job.row.epoch, hours, summary });
    const wantLastMs = Math.min(window.toMs, job.cand.stopMs ?? Infinity);
    if (job.cand.stopMs !== undefined && summary.lastMs < wantLastMs - 1000 * (summary.stepSeconds ?? 60)) {
      parentPort.postMessage({ id: job.id, ok: true, short: { lastMs: summary.lastMs, wantLastMs, states: summary.states }, wallMs: performance.now() - t0 });
      return;
    }
    const result = await evaluate(fitter, { row: job.row, ephemeris, summary, hours, fit: job.fit, closure: job.closure });
    const omm = result.omm ? result.omm.buffer.slice(result.omm.byteOffset, result.omm.byteOffset + result.omm.length) : null;
    result.omm = null;
    result.timing.readMs = tRead - t0;
    parentPort.postMessage({ id: job.id, ok: true, result, omm, wallMs: performance.now() - t0 }, omm ? [omm] : []);
  } catch (e) {
    parentPort.postMessage({ id: job.id, ok: false, error: String(e.message ?? e).slice(0, 600), guard: e.guard ?? null, wallMs: performance.now() - t0 });
  }
});
