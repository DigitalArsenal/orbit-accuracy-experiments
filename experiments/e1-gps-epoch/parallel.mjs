// scoreSets across worker threads. Sets are split by object (a satellite's
// sets stay in one worker, in order), every worker loads the same module
// artifact and reference index, and the results are joined back in the
// input order, so the output equals one scoreSets call over all sets.
//
// A set may carry `covariance: {ageDays: [σR², σT², σN²]}` for the coverage
// test (score.mjs); ages without one get the identity, and their coverage is
// not used.
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadModule } from '../../harness/modules.mjs';
import { ReferenceIndex } from '../../harness/reference.mjs';
import { scoreSets } from './score.mjs';

const self = new URL(import.meta.url);

export async function scoreParallel({ modules, referenceDir, referenceProducts, referenceSystem, sets, scoring, ages, workers }) {
  const count = Math.max(1, Math.min(workers ?? Math.min(8, os.cpus().length), sets.length));
  const byObject = new Map();
  sets.forEach((s, i) => { if (!byObject.has(s.norad)) byObject.set(s.norad, []); byObject.get(s.norad).push(i); });
  const chunks = Array.from({ length: count }, () => []);
  [...byObject.values()].sort((a, b) => b.length - a.length).forEach((idx) => {
    chunks.reduce((m, c) => (c.length < m.length ? c : m), chunks[0]).push(...idx);
  });
  const results = await Promise.all(chunks.filter((c) => c.length).map((idx) => new Promise((resolve, reject) => {
    const w = new Worker(self, { workerData: { modules, referenceDir, referenceProducts, referenceSystem, scoring, ages, sets: idx.map((i) => sets[i]) } });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', (code) => { if (code) reject(new Error(`score worker exited ${code}`)); });
  })));
  // Join in input order (by set index within the original list).
  const order = new Map(sets.map((s, i) => [s.gpId, i]));
  const samples = results.flatMap((r) => r.samples).sort((a, b) => order.get(a.gpId) - order.get(b.gpId) || a.ageDays - b.ageDays);
  const counts = {};
  for (const r of results) for (const [k, v] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + v;
  const read = Object.assign({}, ...results.map((r) => r.read));
  if (new Set(results.map((r) => r.wasmSha256)).size !== 1) throw new Error('workers loaded different module artifacts');
  return { samples, counts, read, provenance: results[0].provenance };
}

if (!isMainThread) {
  const d = workerData;
  const gpModel = await loadModule(d.modules, 'analysis/gp-error-model');
  const reference = new ReferenceIndex(d.referenceDir, d.referenceProducts, { system: d.referenceSystem });
  const covariance = d.sets.some((s) => s.covariance) ? (set, age) => set.covariance?.[age] ?? [1, 1, 1] : undefined;
  const { samples, counts } = await scoreSets(gpModel, reference, d.sets, d.scoring, { ages: d.ages ?? d.scoring.ageBinsDays, covariance });
  await gpModel.destroy();
  parentPort.postMessage({ samples, counts, read: reference.read, provenance: gpModel.provenance, wasmSha256: gpModel.provenance.wasmSha256 });
}
