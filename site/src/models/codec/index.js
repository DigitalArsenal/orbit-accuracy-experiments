// A resident screening index in analysis/conjunction-assessment, and its
// coarse_grid samples: per object and step, the sampled position and
// velocity and the bound D the source computed for its motion.
import {
  CQRDestroyRequestT, CQRIndexRequestT, CQRObjectSourceT, CQRWindowRequestT, PRWInstanceT, cqrIndexRepresentation, cqrRefinementStrategy,
} from 'spacedatastandards.org/lib/js/CQR/main.js';
import { controls, decodeCqr, jdOf, ommT, output, request, teme } from './cqr.js';

const INSTANCE = () => new PRWInstanceT('conjunction-assessment', 'paper-models', 1n);

export async function prepareIndex(ca, objects) {
  const sources = objects.map((e, i) => new CQRObjectSourceT(e.id, e.name, e.norad, null, i + 1, 'sgp4', ommT(e)));
  const r = await ca.invoke('prepare_screening_index', [request('INDEX_REQUEST', new CQRIndexRequestT(INSTANCE(), 0, [], 0, [],
    cqrIndexRepresentation.SOURCE_DESCRIPTIONS, cqrRefinementStrategy.EXACT_ONLY, sources))]);
  return decodeCqr(output(r, 'result')).INDEX_RESULT.SCREENING_INDEX_HANDLE;
}

export const destroyIndex = (ca, handle) => ca.invoke('destroy_screening_index', [request('DESTROY_REQUEST', new CQRDestroyRequestT(INSTANCE(), handle))]);

function blockFrame(firstStep, stepCount) {
  const bytes = new Uint8Array(12);
  bytes.set([0x43, 0x41, 0x42, 0x31]);  // 'CAB1'
  const view = new DataView(bytes.buffer);
  view.setUint32(4, firstStep, true);
  view.setUint32(8, stepCount, true);
  return { portId: 'block', payload: bytes, typeRef: { wireFormat: 'flatbuffer', mediaType: 'application/vnd.sdn.ca-grid-block' } };
}

// The coarse_grid samples of the first `steps` steps: per object
// [{x, y, z, boundKm, vx, vy, vz}] (km, km/s), as the module stores them (f32).
export async function coarseGrid(ca, handle, { startMs, coarseStepSec, steps = 1, thresholdM = 5000 }) {
  const window = request('WINDOW_REQUEST', new CQRWindowRequestT(INSTANCE(), handle,
    controls({ startJd: jdOf(startMs), durationSeconds: Math.max(steps, 2) * coarseStepSec, thresholdM, coarseStepSec }), teme()));
  const r = await ca.invoke('coarse_grid', [window, blockFrame(0, steps)]);
  const g = output(r, 'grid');
  const view = new DataView(g.buffer, g.byteOffset, g.byteLength);
  const stepCount = view.getUint32(8, true), objects = view.getUint32(12, true);
  const f = new Float32Array(g.slice(16, 16 + stepCount * objects * 32).buffer);
  return Array.from({ length: stepCount }, (_, s) => Array.from({ length: objects }, (_, i) => {
    const q = (s * objects + i) * 8;
    return { x: f[q], y: f[q + 1], z: f[q + 2], boundKm: f[q + 3], vx: f[q + 4], vy: f[q + 5], vz: f[q + 6] };
  }));
}
