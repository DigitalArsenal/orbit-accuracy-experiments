// The D2 time series: from the calibration bins (step 10), the correction in
// analysis mode (the bin that holds the instant), the nowcast at an issue
// time (the mean coefficients of the bins that ended in the preceding
// window, after the configured latency) and its forecast (relaxing from
// the nowcast to the mean of the bins available in the preceding 27 days
// with the chosen time constant, or held). A
// statistical model of the coefficients, in the same spirit as E1's along-
// track corrections; the densities themselves are always the module's.
import { config, mjdOfMs } from './common.mjs';

const HOUR_MS = 3600000;
const size = (degree) => (degree + 1) ** 2;

// Mean coefficients of the bins ending in [end - hours, end].
function meanOf(bins, endMjd, hours, degree) {
  const used = bins.filter((b) => b.coefficients && b.toMjd <= endMjd + 1e-9 && b.fromMjd >= endMjd - hours / 24 - 1e-9);
  const mean = Array(size(degree)).fill(0);
  for (const b of used) b.coefficients.forEach((x, k) => { mean[k] += x / used.length; });
  return { coefficients: mean, bins: used.length };
}
// At an issue time: the nowcast (bins of the preceding nowcastWindowHours)
// and the level it relaxes to (the bins available in the preceding
// meanWindowDays), both after the configured latency.
export function nowcast(bins, t0Ms, degree) {
  const c = config.calibration;
  const end = mjdOfMs(t0Ms - c.latencyHours * HOUR_MS);
  const now = meanOf(bins, end, c.nowcastWindowHours, degree), level = meanOf(bins, end, c.meanWindowDays * 24, degree);
  return { coefficients: now.coefficients, bins: now.bins, level: level.coefficients, levelBins: level.bins };
}
// The forecast at t >= t0: level + (nowcast - level) exp(-(t - t0)/tau); tau
// null holds the nowcast.
const forecastAt = (now, k, dtMs, tauHours) => (tauHours === null ? now.coefficients[k]
  : now.level[k] + (now.coefficients[k] - now.level[k]) * Math.exp(-dtMs / (tauHours * HOUR_MS)));

// Hourly correction segments from t0 for spanMs, the forecast at each hour's midpoint.
export function decayed(now, t0Ms, tauHours, spanMs, degree) {
  const segments = [];
  for (let t = t0Ms; t < t0Ms + spanMs; t += HOUR_MS) {
    segments.push({ fromMjd: mjdOfMs(t), toMjd: mjdOfMs(t + HOUR_MS), coefficients: Array.from({ length: size(degree) }, (_, k) => forecastAt(now, k, t + HOUR_MS / 2 - t0Ms, tauHours)) });
  }
  return segments;
}

// The global term a00 at an instant: the analysis bin for t < t0, the
// forecast from t0 on (D2 in the propagation endpoint).
export function a00Series(bins, t0Ms, tauHours, degree) {
  const now = nowcast(bins, t0Ms, degree);
  const byStart = bins.filter((b) => b.coefficients);
  return (tMs) => {
    if (tMs < t0Ms) {
      const mjd = mjdOfMs(tMs);
      const b = byStart.find((x) => x.fromMjd <= mjd && mjd < x.toMjd);
      return b ? b.coefficients[0] : 0;
    }
    return forecastAt(now, 0, tMs - t0Ms, tauHours);
  };
}
