// ca-screen-recall: matching the screen's events to the reference's, and the counts (PLAN.md section 6).
// Counting and order statistics only; every orbit quantity arrives from a module.
import { config, DAY_S } from './common.mjs';

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const screenPair = (e) => pairKey(e.primary, e.secondary);

// Nearest-rank percentile of a sorted array.
export const nearestRank = (sorted, p) => (sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : null);
export function distribution(values) {
  const s = [...values].sort((a, b) => a - b);
  return { count: s.length, median: nearestRank(s, 0.5), p95: nearestRank(s, 0.95), p99: nearestRank(s, 0.99), max: s.length ? s.at(-1) : null };
}

// P(X >= k) for X ~ Binomial(n, p), summed in logs.
function binomialUpperTail(n, k, p) {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const logChoose = (m, r) => { let s = 0; for (let t = 1; t <= r; t++) s += Math.log((m - r + t) / t); return s; };
  let sum = 0;
  for (let x = k; x <= n; x++) sum += Math.exp(logChoose(n, x) + x * Math.log(p) + (n - x) * Math.log1p(-p));
  return Math.min(1, sum);
}
// One-sided exact (Clopper-Pearson) lower confidence bound for a proportion k / n.
export function lowerBound(k, n, confidence) {
  if (n === 0 || k === 0) return n === 0 ? null : 0;
  if (k === n) return (1 - confidence) ** (1 / n);
  let lo = 0, hi = 1;
  for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (binomialUpperTail(n, k, mid) < 1 - confidence) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// Greedy one-to-one matching by increasing |TCA difference|, within one NORAD pair, inside the tolerance.
export function matchEvents(reference, screen, toleranceSeconds) {
  const byPair = new Map();
  const bucket = (key) => { if (!byPair.has(key)) byPair.set(key, { r: [], s: [] }); return byPair.get(key); };
  reference.forEach((e, n) => bucket(pairKey(e.a, e.b)).r.push(n));
  screen.forEach((e, n) => bucket(screenPair(e)).s.push(n));
  const refTo = new Array(reference.length).fill(-1), screenTo = new Array(screen.length).fill(-1);
  for (const { r, s } of byPair.values()) {
    const candidates = [];
    for (const i of r) for (const j of s) {
      const dt = Math.abs(screen[j].tcaJd - reference[i].tcaJd) * DAY_S;
      if (dt <= toleranceSeconds) candidates.push([dt, i, j]);
    }
    candidates.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    for (const [, i, j] of candidates) if (refTo[i] < 0 && screenTo[j] < 0) { refTo[i] = j; screenTo[j] = i; }
  }
  return { refTo, screenTo };
}

export const bandOf = (missM) => {
  const [, split, top] = config.comparison.bandsM;
  return missM < split ? 'below 1 km' : missM < top ? '1 to 5 km' : null;
};

// Where an event's TCA sits against the window: 'in', 'edge' (within edgeSeconds of an end, either side) or 'out'.
export function placeInWindow(tcaJd, window) {
  const edge = config.comparison.edgeSeconds, t = (tcaJd - window.startJd) * DAY_S;
  if (Math.abs(t) <= edge || Math.abs(t - window.durationSeconds) <= edge) return 'edge';
  return t > 0 && t < window.durationSeconds ? 'in' : 'out';
}
