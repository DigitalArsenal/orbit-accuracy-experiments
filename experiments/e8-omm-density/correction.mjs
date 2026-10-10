// D5's correction as the modules take it: time nodes {nodesMjd, altitudeKm,
// values} (analysis/density-calibration). From an analysis fit, its nodes;
// from a forecast fit at t0, its nodes up to t0 and then, every hour, the
// relaxation from the value at t0 to the mean of the preceding levelDays with
// time constant tau (E5's form, PLAN.md section 2), per altitude node. A
// statistical model of the fitted values; the densities are the module's.
import { callJson, config, DAY_MS, HOUR_MS, mjdOfMs, msOfMjd } from './common.mjs';

export const analysisCorrection = (fit) => ({ nodesMjd: fit.correction.nodesMjd, altitudeKm: fit.correction.altitudeKm, values: fit.correction.values });

// tauHours null holds the value at t0.
export function forecastCorrection(fit, tauHours, spanDays = 8) {
  const c = fit.correction, P = c.values[0].length;
  const t0 = c.nodesMjd.at(-1), now = c.values.at(-1);
  const levelFrom = t0 - config.decay.forecast.levelDays;
  const used = c.values.filter((_, j) => c.nodesMjd[j] >= levelFrom - 1e-9);
  const level = Array.from({ length: P }, (_, a) => used.reduce((s, v) => s + v[a], 0) / used.length);
  const nodesMjd = [...c.nodesMjd], values = [...c.values];
  for (let h = 1; h <= spanDays * 24; ++h) {
    nodesMjd.push(t0 + h / 24);
    values.push(now.map((x, a) => (tauHours === null ? x : level[a] + (x - level[a]) * Math.exp(-h / tauHours))));
  }
  return { nodesMjd, altitudeKm: c.altitudeKm, values, nowcast: now, level };
}

// dT (K) on the hour from fromMs to toMs at one altitude, by the module
// (evaluate's deltaT), as a lookup add(tMs) for the hourly DTC rows of hpop.
export async function hourlyOffsets(dc, correction, altKm, fromMs, toMs, jb2008Rows) {
  const hours = [];
  for (let t = Math.floor(fromMs / HOUR_MS) * HOUR_MS; t <= toMs; t += HOUR_MS) hours.push(t);
  const r = await callJson(dc, 'evaluate', 'request', {
    points: { mjd: hours.map(mjdOfMs), latDeg: hours.map(() => 0), lonDeg: hours.map(() => 0), altKm: hours.map(() => altKm) },
    jb2008: { rows: jb2008Rows }, correction: { nodesMjd: correction.nodesMjd, altitudeKm: correction.altitudeKm, values: correction.values },
  });
  const byHour = new Map(hours.map((t, i) => [t, r.deltaT[i]]));
  return (tMs) => {
    const v = byHour.get(Math.round(tMs / HOUR_MS) * HOUR_MS);
    if (v === undefined || v === null) throw new Error(`no correction for ${new Date(tMs).toISOString()}`);
    return v;
  };
}
export const correctionSpanMs = (correction) => [msOfMjd(correction.nodesMjd[0]), msOfMjd(correction.nodesMjd.at(-1))];
export { DAY_MS };
