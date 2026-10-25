// Synthetic decays for the hand-off measurement (amendment A10, M28): a circular orbit at `h0` km (inclination 53 deg) under constant synthetic space weather,
// integrated by FFM-1 to its own stop at 100 km geodetic altitude. FFM-1 does the physics; this file chunks the arc (a restart from a returned sample state
// is exact) and finds the stop. The cells are B (Cd A / m, m2/kg) x solar level.
import { config } from '../common.mjs';
import { propagateEvents, syntheticWeather, singleRowEop, withInputs } from './ffm-events.mjs';
import { openOrbits } from './orbits.mjs';
import { iso } from './windows.mjs';

/** The three solar levels: F10.7 (its 81-day averages equal it), Ap (Kp from it by the standard table). */
export const LEVELS = { low: { f107: 70, ap: 4, kp: 1.0 }, moderate: { f107: 150, ap: 12, kp: 2.7 }, high: { f107: 230, ap: 27, kp: 4.0 } };
export const BALLISTIC = [0.005, 0.02, 0.05];
export const DECAY_START = '2025-10-24T00:00:00.000Z'; // arbitrary: the weather is synthetic and the Earth orientation one row; a year back keeps the longest cell's epochs before today
export const DECAY_I_DEG = 53;

/** The synthetic environment for a cell: weather for `days` days from DECAY_START minus a day, and one Earth-orientation row. */
export function decayContext(context, level, days) {
  return withInputs(context, syntheticWeather(context, { ...LEVELS[level], startDate: '2025-10-23', days: days + 3 }), singleRowEop(context));
}

/** The initial state at perigee altitude h0 (km above the equatorial radius 6378.137) with eccentricity e, at perigee: [m, m/s] GCRF. */
export async function initialState(modules, h0, e = 0) {
  const orbits = await openOrbits(modules);
  try {
    const s = await orbits.toCartesian({ epoch: DECAY_START, a: (6378.137 + h0) / (1 - e), e, i: DECAY_I_DEG, raan: 0, argp: 0, meanAnomaly: 0 });
    return [...s.r, ...s.v].map((x) => x * 1000);
  } finally { await orbits.destroy(); }
}

/**
 * The decay of one cell as samples every `stepS` seconds from DECAY_START: chunks of `chunkDays`, each restarted from the last sample, up to `capDays`; a chunk that
 * meets 100 km is re-run to one step before the stop (the stop epoch comes from FFM-1's own message). Returns { samples: [{ ms, state }], reentry: { epochUtc, heightKm } | null,
 * capped: boolean, seconds }.
 */
export async function decayTrack(modules, context0, { level, cdAm, h0 = 300, e0 = 0, stepS = 300, chunkDays = 10, capDays = 400, crAm = 0.02 }) {
  const context = decayContext(context0, level, capDays + chunkDays);
  const t0 = Date.parse(DECAY_START), started = performance.now();
  let state = await initialState(modules, h0, e0), tNow = t0;
  const samples = [{ ms: t0, state }];
  const sampleEpochs = (from, to) => { const out = []; for (let t = from + stepS * 1000; t <= to + 1; t += stepS * 1000) out.push(t); return out; };
  while (tNow < t0 + capDays * 86400000) {
    const to = Math.min(tNow + chunkDays * 86400000, t0 + capDays * 86400000);
    const epochs = sampleEpochs(tNow, to);
    let r = await propagateEvents(modules, context, { epoch: iso(tNow), state, cdAm, crAm, epochs, integrator: config.truth.integrator });
    if (!r.ok) {
      if (!r.reentry) throw new Error(`FFM-1: ${r.error}`);
      const stop = Date.parse(r.reentry.epochUtc);
      const last = sampleEpochs(tNow, stop - 2 * stepS * 1000);
      if (last.length) {
        r = await propagateEvents(modules, context, { epoch: iso(tNow), state, cdAm, crAm, epochs: last, integrator: config.truth.integrator });
        if (!r.ok) throw new Error(`FFM-1 (last chunk): ${r.error}`);
        samples.push(...r.samples.slice(0, last.length));
      }
      return { samples, reentry: r.reentry ?? { epochUtc: iso(stop), heightKm: 100 }, stopMs: stop, capped: false, seconds: (performance.now() - started) / 1000 };
    }
    samples.push(...r.samples);
    state = r.samples.at(-1).state; tNow = r.samples.at(-1).ms;
  }
  return { samples, reentry: null, stopMs: null, capped: true, seconds: (performance.now() - started) / 1000 };
}
