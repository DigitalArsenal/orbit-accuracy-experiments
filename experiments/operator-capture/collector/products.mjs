// The stored products of one captured file. Pure: records in, records out.

/** The registered E13b record (amendments A1-A3): energy, drag work and Brouwer mean elements every ten minutes over the first
 *  eight hours, the registered truth states, and the source's range and hashes. */
export function registeredRecord({ head, derived, truth, reg, weatherSha256 }) {
  const samples = derived.samples.map((p, i) => ({ ms: p.ms, energyJkg: p.energyJkg, altitudeKm: p.altitudeKm, meanElements: p.meanElements,
    cumulativeDragWorkB1Jkg: derived.work.CUMULATIVE_DRAG_WORK_J_KG[i * 10] }));
  if (samples.length !== 49 || samples.some(p => !Number.isFinite(p.cumulativeDragWorkB1Jkg))) throw new Error('invalid derived head');
  return { version: 1, source: head.source, frame: 'GCRF', units: { energy: 'J/kg', state: 'm,m/s', meanElements: 'a km,e,i/RAAN/argp/true anomaly deg' },
    meanTheory: 'Brouwer first-order J2', energyEarthOrientation: 'UT1=UTC; xp=yp=0 (E13 diagnostic convention)', subsetSha256: reg.sha256, weatherSha256, samples, truth };
}
