// Screens done by analysis/conjunction-assessment: the single call
// (screen_catalog, drained chunk by chunk) and the windowed all-vs-all of the
// paper (the modules repository's own host code, gpu/catalogScreen.mjs,
// with the pair search in the module on the CPU).
import { screenCatalog, screenWindows } from '@sdn-modules/analysis/conjunction-assessment/gpu/catalogScreen.mjs';
import { catalogInputs, decodeCqr, jdOf, ommBytes, output } from './cqr.js';

export const START_MS = Date.parse('2026-10-01T00:00:00Z');

// One screen_catalog call over `objects`; continues the identical request
// until the module marks the final chunk.
export async function screenOnce(ca, objects, controls) {
  const inputs = catalogInputs(objects, { startJd: jdOf(START_MS), ...controls });
  const events = [];
  for (let chunk = 0; chunk < 10000; chunk++) {
    const result = decodeCqr(output(await ca.invoke('screen_catalog', inputs), 'result')).CATALOG_RESULT;
    events.push(...(result.EVENTS ?? []));
    if (result.FINAL_CHUNK) return { events, statistics: result.STATISTICS, objectsParsed: Number(result.OBJECTS_PARSED) };
  }
  throw new Error('screen_catalog did not finish');
}

// The paper's windowed screen: load once, search_candidates per block of
// coarse steps, refine_candidates.
export async function screenWindowed(ca, objects, { days = 1, windowHours = 6, thresholdKm = 5, coarseStepSec = 60 }) {
  const started = performance.now();
  const result = await screenCatalog({
    invoke: (methodId, inputs) => ca.tryInvoke(methodId, inputs),
    propagator: 'sgp4', catalog: objects.map(ommBytes),
    windows: screenWindows(jdOf(START_MS), days, windowHours),
    controls: { thresholdKm, coarseStepSec, workers: 1 },
  });
  return { ...result, ms: performance.now() - started };
}
