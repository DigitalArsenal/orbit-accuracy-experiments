// The 42 strata: E14's regimes by seven age bins, and the five evaluation ages of a bin (PLAN.md 1.1).
export const REGIMES = ['LEO-L', 'LEO-M', 'LEO-H', 'MEO', 'GEO', 'HEO'];
export const BINS = [[0, 0.25], [0.25, 0.75], [0.75, 1.5], [1.5, 2.5], [2.5, 4], [4, 6], [6, 8]];
export const DAY_MS = 86400000;
export const MIN_MS = 60000;
// Index of the bin holding `age` (days); both edges included on the last bin.
export const binOf = (age) => BINS.findIndex(([lo, hi], i) => age >= lo && (age < hi || (i === BINS.length - 1 && age === hi)));
// Desired ages (ms): 0, 1/4, 1/2, 3/4, 1 of the bin width; an open upper edge is taken one minute inside, the closed last edge is 8 d.
export function desiredAgesMs(b) {
  const [lo, hi] = BINS[b];
  const top = b === BINS.length - 1 ? hi * DAY_MS : hi * DAY_MS - MIN_MS;
  return [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(lo * DAY_MS + f * (top - lo * DAY_MS)));
}
// Snap t = setMs + age to the truth grid of a span (start + k*step, within the span), within +-10 min, inside the bin
// (the nearest grid point that keeps the age inside [lo, top]); null when none.
export function snap(setMs, ageMs, b, span) {
  const step = span.stepSeconds * 1000;
  const [lo, hi] = BINS[b];
  const loMs = lo * DAY_MS, topMs = b === BINS.length - 1 ? hi * DAY_MS : hi * DAY_MS - MIN_MS;
  const want = setMs + ageMs;
  let k = Math.round((want - span.start) / step);
  let t = span.start + k * step;
  if (t - setMs < loMs) t += step;
  if (t - setMs > topMs) t -= step;
  const age = t - setMs;
  if (age < loMs || age > topMs) return null;
  if (Math.abs(t - want) > 10 * MIN_MS) return null;
  if (t < span.start || t > span.stop) return null;
  return t;
}
