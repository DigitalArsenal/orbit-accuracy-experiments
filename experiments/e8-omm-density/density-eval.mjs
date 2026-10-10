// Densities at a satellite's samples and their orbit means, shared by E8's
// density steps (20, and 25 for the DESTOPy cross-check). JB2008 is the
// module's (analysis/density-calibration `evaluate`, one call per UTC day with
// that day's drivers); orbit means follow E5's step 20: one orbital period
// centred on each scoring time, every model over the same valid samples as
// the observation. Averaging only.
import { callJson, config, DAY_MS, isoDay, jb2008Rows, mjdOfMs } from './common.mjs';

export const definitiveRows = (day) => jb2008Rows(isoDay(day - 6 * DAY_MS), isoDay(day + 2 * DAY_MS));

// rowsFor(dayMs) gives that day's drivers (days -6..+2); correction is E5's
// segments ({degree, segments}) or D5's nodes, or null.
export async function jb2008(dc, s, correction, rowsFor) {
  const out = new Array(s.t.length).fill(null);
  for (let i = 0; i < s.t.length;) {
    const day = Math.floor(s.t[i] / DAY_MS) * DAY_MS;
    let j = i;
    while (j < s.t.length && s.t[j] < day + DAY_MS) ++j;
    const idx = [...Array(j - i).keys()].map((k) => i + k);
    let corr = correction;
    if (correction?.segments) corr = { degree: correction.degree, segments: correction.segments.filter((g) => g.toMjd > mjdOfMs(day) && g.fromMjd < mjdOfMs(day + DAY_MS)) };
    const r = await callJson(dc, 'evaluate', 'request', {
      points: { mjd: idx.map((k) => mjdOfMs(s.t[k])), latDeg: idx.map((k) => s.lat[k]), lonDeg: idx.map((k) => s.lon[k]), altKm: idx.map((k) => s.altKm[k]) },
      jb2008: { rows: rowsFor(day) }, ...(corr ? { correction: corr } : {}),
    });
    idx.forEach((k, n) => { out[k] = r.density[n]; });
    i = j;
  }
  return out;
}

export function orbitMeans(s, models, periodS, fromMs, toMs) {
  const scoreMs = config.density.scoreEverySeconds * 1000;
  const half = (periodS * 1000) / 2, expected = Math.round(periodS / config.density.sampleSeconds);
  const out = [];
  let lo = 0, hi = 0;
  for (let t = Math.ceil((fromMs + half) / scoreMs) * scoreMs; t <= toMs - half; t += scoreMs) {
    while (lo < s.t.length && s.t[lo] < t - half) ++lo;
    while (hi < s.t.length && s.t[hi] < t + half) ++hi;
    let n = 0, obs = 0, ok = true;
    const sums = Object.fromEntries(Object.keys(models).map((m) => [m, 0]));
    for (let k = lo; k < hi; ++k) {
      if (!s.valid[k]) continue;
      for (const m of Object.keys(models)) { const v = models[m][k]; if (!(v > 0)) { ok = false; break; } sums[m] += v; }
      if (!ok) break;
      obs += s.rho[k]; ++n;
    }
    if (!ok || n < config.density.orbitAverage.minimumValidFraction * expected) continue;
    out.push({ s: t, n, obs: obs / n, models: Object.fromEntries(Object.entries(sums).map(([m, v]) => [m, v / n])) });
  }
  return out;
}
