// Request scheduling and result copying only; every propagated value comes
// from the selected module. The caller's query order is the output order.
import { cpu } from './lib.mjs';

export function queryBatch(engine, epochs, objects, temporal) {
  const startedCpu = cpu(), startedWall = performance.now();
  const indices = Array.from({ length: epochs.length }, (_, i) => i);
  if (temporal) indices.sort((a, b) => {
    const x = epochs[a], y = epochs[b];
    if ((x < 0) !== (y < 0)) return x < 0 ? -1 : 1;
    return x < 0 ? y - x : x - y;
  });
  const values = new Float64Array(6 * objects * epochs.length);
  const statuses = new Int32Array(objects * epochs.length);
  const planningCpuUs = cpu() - startedCpu;
  for (const i of indices) {
    const state = engine.at(epochs[i]);
    values.set(state.values, i * objects * 6);
    statuses.set(state.status, i * objects);
  }
  return { values, statuses, planningCpuUs, cpuUs: cpu() - startedCpu, wallMs: performance.now() - startedWall };
}

export function compare(a, b, objects) {
  if (a.values.length !== b.values.length || a.statuses.length !== b.statuses.length) throw new Error('Output dimensions differ');
  let differingValues = 0, differingStatuses = 0, nonzeroStatuses = 0;
  const nonfiniteStates = { caller: 0, temporal: 0 };
  let finiteStatePairs = 0, maxFinitePositionDifferenceM = 0, maxFiniteVelocityDifferenceMS = 0;
  for (let i = 0; i < a.values.length; i++) if (!Object.is(a.values[i], b.values[i])) differingValues++;
  for (let i = 0; i < a.statuses.length; i++) {
    if (a.statuses[i] !== b.statuses[i]) differingStatuses++;
    if (a.statuses[i] !== 0 || b.statuses[i] !== 0) nonzeroStatuses++;
    const query = Math.floor(i / objects), object = i % objects;
    const values = [a, b].map((o) => Array.from({ length: 6 }, (_, k) => o.values[query * objects * 6 + k * objects + object]));
    const finite = values.map((v) => v.every(Number.isFinite));
    if (!finite[0]) nonfiniteStates.caller++;
    if (!finite[1]) nonfiniteStates.temporal++;
    if (finite.every(Boolean)) {
      finiteStatePairs++;
      const d = values[0].map((v, k) => v - values[1][k]);
      maxFinitePositionDifferenceM = Math.max(maxFinitePositionDifferenceM, Math.hypot(...d.slice(0, 3)) * 1000);
      maxFiniteVelocityDifferenceMS = Math.max(maxFiniteVelocityDifferenceMS, Math.hypot(...d.slice(3)) * 1000);
    }
  }
  return { states: a.statuses.length, components: a.values.length, differingValues, differingStatuses, nonzeroStatuses,
    nonfiniteStates, finiteStatePairs, maxFinitePositionDifferenceM, maxFiniteVelocityDifferenceMS,
    pass: differingValues === 0 && differingStatuses === 0 && nonzeroStatuses === 0 && Object.values(nonfiniteStates).every((v) => v === 0) };
}
