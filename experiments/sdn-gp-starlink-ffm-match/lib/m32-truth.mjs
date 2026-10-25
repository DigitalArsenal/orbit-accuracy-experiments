// Amendment A12b, M31 and M32: synthetic batches with a known parent state, truth by FFM-1. A batch is N objects released from one circular parent orbit at t_r, each with its own separation
// delta-v (UVW at t_r, planted as FFM-1 impulses in the RTN axes) and its own ballistic coefficient; FFM-1 integrates every object from the parent state (the full force of the registered
// truths, the saved environment). JavaScript here draws the separations from a seeded generator, builds typed requests and keeps the samples.
import fs from 'node:fs';
import path from 'node:path';
import { store, sha256, config } from '../common.mjs';
import { propagateEvents } from './ffm-events.mjs';
import { iso } from './windows.mjs';

export const M32_DIR = path.join(store, 'm32');
export const EPOCH0 = '2026-10-24T00:00:00.000Z';          // the parent state's epoch (the $LAM / $BOV epoch)
export const RELEASE_S = 60;                               // FFM-1 ignores an impulse at the start epoch of its arc: the separations are planted 60 s after it
export const FIRST_FILE_H = 1;                             // the first file's states start 1 h after the parent epoch
export const TRUTH_HOURS = 98;                             // from the parent epoch: 1 h + 24 h of fit + 3 days held out, plus a margin
export const PARENT = { aKm: 6630, e: 0, iDeg: 70 };      // circular, about 250 km altitude, 70 degrees (the captured batch's regime)
export const BATCHES = [{ id: 'b11', seed: 11, sigmaMS: 1.0 }, { id: 'b12', seed: 12, sigmaMS: 1.0 }, { id: 'b21', seed: 21, sigmaMS: 0.25 }, { id: 'b22', seed: 22, sigmaMS: 0.25 }];
export const N_OBJECTS = 27;

/** mulberry32 and Box-Muller: a seeded sampler (statistics only). */
export function sampler(seed) {
  let a = seed >>> 0;
  const uniform = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  return { uniform, normal };
}

/** The specification of a batch: the parent's node and argument of latitude from the seed, the separations from N(0, sigma) per axis, the ballistic coefficients the shuffled fitted B_eff of the captured batch. */
export function batchSpec(batch, capturedB) {
  const { uniform, normal } = sampler(batch.seed);
  const raanDeg = Math.floor(uniform() * 3600) / 10, argLatitudeDeg = Math.floor(uniform() * 3600) / 10;
  const order = capturedB.map((b, i) => [uniform(), b]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const objects = Array.from({ length: N_OBJECTS }, (_, k) => ({ k: k + 1, dvMS: [normal() * batch.sigmaMS, normal() * batch.sigmaMS, normal() * batch.sigmaMS], cdAm: order[k % order.length] }));
  return { ...batch, parent: { ...PARENT, raanDeg, argLatitudeDeg, epochUtc: EPOCH0 }, objects };
}

const truthPath = (batchId, k) => path.join(M32_DIR, batchId, `${k}.f64`);

/** FFM-1 truth of every object of a batch, 60 s samples from FIRST_FILE_H to TRUTH_HOURS (GCRF km, km/s), cached; returns the index record. */
export async function generateBatchTruth(modules, context, orbits, spec, crAm) {
  const dir = path.join(M32_DIR, spec.id);
  const indexFile = path.join(dir, 'index.json');
  if (fs.existsSync(indexFile)) return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  fs.mkdirSync(dir, { recursive: true });
  const cart = await orbits.toCartesian({ epoch: EPOCH0, a: spec.parent.aKm, e: spec.parent.e, i: spec.parent.iDeg, raan: spec.parent.raanDeg, argp: 0, meanAnomaly: spec.parent.argLatitudeDeg });
  const state = [...cart.r, ...cart.v].map((x) => x * 1000);
  const t0 = Date.parse(EPOCH0), first = t0 + FIRST_FILE_H * 3600e3, last = t0 + TRUTH_HOURS * 3600e3;
  const epochs = []; for (let t = first; t <= last; t += 60000) epochs.push(t);
  const records = [];
  for (const o of spec.objects) {
    const r = await propagateEvents(modules, context, { epoch: EPOCH0, state, cdAm: o.cdAm, crAm, epochs, integrator: config.truth.integrator, impulses: [{ ms: t0 + RELEASE_S * 1000, dv: o.dvMS, basis: 'RTN' }] });
    if (!r.ok) throw new Error(`${spec.id} object ${o.k}: ${r.error}`);
    const flat = new Float64Array(epochs.length * 6);
    r.samples.forEach((s, i) => s.state.forEach((x, c) => { flat[i * 6 + c] = x / 1000; }));
    fs.writeFileSync(truthPath(spec.id, o.k), Buffer.from(flat.buffer));
    records.push({ k: o.k, dvMS: o.dvMS, cdAm: o.cdAm, sha256: sha256(Buffer.from(flat.buffer)), ffmWasmSha256: r.wasmSha256 });
  }
  const index = { id: spec.id, seed: spec.seed, sigmaMS: spec.sigmaMS, parent: spec.parent, crAm, releaseSeconds: RELEASE_S, firstUtc: iso(first), lastUtc: iso(last), cadenceSeconds: 60, objects: records, createdUtc: new Date().toISOString() };
  fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);
  return index;
}

/** The objects of a generated batch as the G1 scorers read them: [{ k, object, t0, spec }]. */
export async function batchObjectsOf(index) {
  const { withT } = await import('./windows.mjs');
  const first = Date.parse(index.firstUtc);
  return index.objects.map((o) => {
    const flat = new Float64Array(new Uint8Array(fs.readFileSync(truthPath(index.id, o.k))).buffer);
    const object = withT({ source: 'm32-ffm', id: `${index.id}-${o.k}`, norad: 990000 + Number(index.id.slice(1)) * 100 + o.k, name: `BATCH-${index.id}-${o.k}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
      lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: iso(first + i * 60000), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
    return { k: o.k, object, t0: first, record: o };
  });
}
