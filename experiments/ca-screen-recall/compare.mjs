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

// One record of the screen's `excluded` port, read from its COMMENT, the contract of CA 0.13.0 and later (the module's
// README, "Objects screened in part or excluded"). The port lists an object screened in part as well as one excluded, so
// a listed object is not an excluded object. A COMMENT of no known form stops the run: it is never read as an exclusion.
const ISO = '(\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z)';
const COVERAGE = `COVERAGE_START=${ISO}; COVERAGE_END=${ISO}$`;
const FORMS = [
  ['refused-from-start', new RegExp(`^Excluded from conjunction screening; SGP4 refuses it from the window start\\. LAST_VALID=NONE; FIRST_REFUSAL=${ISO}; REFUSAL=([\\s\\S]+)$`), (m) => ({ firstRefusal: m[1], refusal: m[2] })],
  ['refused-part-way', new RegExp(`^Screened until LAST_VALID; SGP4 refuses it from FIRST_REFUSAL\\. LAST_VALID=${ISO}; FIRST_REFUSAL=${ISO}; REFUSAL=([\\s\\S]+)$`), (m) => ({ lastValid: m[1], firstRefusal: m[2], refusal: m[3] })],
  ['no-coverage', new RegExp(`^Excluded from conjunction screening; its trajectory does not cover the window\\. ${COVERAGE}`), (m) => ({ coverageStart: m[1], coverageEnd: m[2] })],
  ['coverage-ends', new RegExp(`^Screened until COVERAGE_END; its trajectory ends inside the window\\. ${COVERAGE}`), (m) => ({ coverageStart: m[1], coverageEnd: m[2] })],
  ['coverage-starts', new RegExp(`^Screened from COVERAGE_START; its trajectory starts inside the window\\. ${COVERAGE}`), (m) => ({ coverageStart: m[1], coverageEnd: m[2] })],
  ['coverage-part', new RegExp(`^Screened from COVERAGE_START until COVERAGE_END; its trajectory covers part of the window\\. ${COVERAGE}`), (m) => ({ coverageStart: m[1], coverageEnd: m[2] })],
];
export function parseListing(comment) {
  for (const [form, pattern, fields] of FORMS) {
    const m = pattern.exec(comment ?? '');
    if (m) return { form, ...fields(m) };
  }
  throw new Error(`an excluded record of no known form: ${comment}`);
}

// Whether the listing says its object was not screened at this Julian date, inside the listing's own call. Before
// LAST_VALID (or inside its coverage) the object was screened, so its events there stay in every denominator.
export function notScreenedAt(listing, jd) {
  const ms = (jd - 2440587.5) * DAY_S * 1000;
  switch (listing.form) {
    case 'refused-part-way': return ms >= Date.parse(listing.firstRefusal);
    case 'coverage-ends': case 'coverage-starts': case 'coverage-part': return ms < Date.parse(listing.coverageStart) || ms > Date.parse(listing.coverageEnd);
    default: return true;
  }
}

// Where an event's TCA sits against the window: 'in', 'edge' (within edgeSeconds of an end, either side) or 'out'.
export function placeInWindow(tcaJd, window) {
  const edge = config.comparison.edgeSeconds, t = (tcaJd - window.startJd) * DAY_S;
  if (Math.abs(t) <= edge || Math.abs(t - window.durationSeconds) <= edge) return 'edge';
  return t > 0 && t < window.durationSeconds ? 'in' : 'out';
}
