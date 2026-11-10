// The statistics of experiments/ap-catalog-construction (PLAN.md "Statistic and verdict"). Counting only: no orbit computation.
// The unit is the satellite: each satellite's sets give one median log ratio, and the verdict comes from a distribution-free
// interval for the median of those satellite medians (order statistics of a binomial with p = 1/2). The bootstrap of
// ap-from-public-sets (lib.mjs, imported) is printed beside it as a secondary column, and drives no decision.
import { median, ratioWithInterval, mulberry32 } from '../../ap-from-public-sets/lib.mjs';

/** P(Bin(n, 1/2) <= k), exactly enough for n up to a few thousand (log space). */
function binomCdfHalf(k, n) {
  if (k < 0) return 0;
  let logTerm = -n * Math.LN2, sum = Math.exp(logTerm); // C(n, 0) / 2^n
  for (let i = 1; i <= k; i += 1) { logTerm += Math.log(n - i + 1) - Math.log(i); sum += Math.exp(logTerm); }
  return Math.min(1, sum);
}

/** The order-statistic interval for a median from n values: [x(k), x(n+1-k)] with the largest k whose coverage
 *  1 - 2 P(Bin(n, 1/2) <= k - 1) is at least `level`; null when no k reaches it (n under 6 at 0.95). */
export function exactMedianInterval(values, level = 0.95) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b), n = v.length;
  let best = null;
  for (let k = 1; k <= Math.floor((n + 1) / 2); k += 1) {
    const coverage = 1 - 2 * binomCdfHalf(k - 1, n);
    if (coverage >= level) best = { lo: v[k - 1], hi: v[n - k], coverage, k }; else break;
  }
  return best;
}

/**
 * The registered statistic on pairs [{ sat, x }] with x = ln(numerator / denominator):
 * { satellites, sets, ratio (exp of the median of satellite medians), lo, hi, coverage, verdict, shareCloser, bootstrap }.
 * Verdict: FEW under `minimumSatellites` satellites or `minimumSets` sets (or no interval); BEATS when the whole interval is below 1;
 * LOSES when above; TIE when it spans 1. `margin` (part 2's non-inferiority) is reported, never used here.
 */
export function satelliteStatistic(pairs, stats) {
  const bySat = new Map();
  for (const p of pairs) { if (!bySat.has(p.sat)) bySat.set(p.sat, []); bySat.get(p.sat).push(p.x); }
  const meds = [...bySat.values()].map((xs) => median(xs));
  const out = { satellites: bySat.size, sets: pairs.length, ratio: null, lo: null, hi: null, coverage: null, verdict: 'FEW', shareCloser: null, bootstrap: null };
  if (!pairs.length) return out;
  out.ratio = Math.exp(median(meds));
  out.shareCloser = pairs.filter((p) => p.x < 0).length / pairs.length;
  const iv = exactMedianInterval(meds, stats.interval);
  if (iv) Object.assign(out, { lo: Math.exp(iv.lo), hi: Math.exp(iv.hi), coverage: iv.coverage });
  if (out.satellites >= stats.minimumSatellites && out.sets >= stats.minimumSets && iv) out.verdict = out.hi < 1 ? 'BEATS' : out.lo > 1 ? 'LOSES' : 'TIE';
  const b = ratioWithInterval(pairs, stats); // secondary: the earlier plan's bootstrap of the pooled median
  out.bootstrap = { ratio: b.ratio, lo: b.lo, hi: b.hi };
  return out;
}

/** Amendment A3's tail statistics of a record against the set: T95, Trms, Tmean, the share of sets with b > 2a, the largest b / a,
 *  with percentile intervals from resampling satellites (seed and count of the plan). `rows`: [{ sat, a, b }]. */
export function tailStatistics(rows, stats) {
  const point = (list) => {
    if (!list.length) return null;
    const p95 = (xs) => { const v = xs.slice().sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.ceil(0.95 * v.length) - 1)]; };
    let sa2 = 0, sb2 = 0, sa = 0, sb = 0, beyond = 0, worst = 0;
    for (const r of list) { sa2 += r.a * r.a; sb2 += r.b * r.b; sa += r.a; sb += r.b; if (r.b > 2 * r.a) beyond += 1; worst = Math.max(worst, r.b / r.a); }
    return { T95: p95(list.map((r) => r.b)) / p95(list.map((r) => r.a)), Trms: Math.sqrt(sb2 / sa2), Tmean: sb / sa, shareBeyondTwice: beyond / list.length, largest: worst };
  };
  const out = { ...point(rows) };
  if (!rows.length) return out;
  const bySat = new Map();
  for (const r of rows) { if (!bySat.has(r.sat)) bySat.set(r.sat, []); bySat.get(r.sat).push(r); }
  const sats = [...bySat.keys()].sort((x, y) => x - y);
  if (sats.length < 2) return out;
  const rnd = mulberry32(stats.seed), draws = { T95: [], Trms: [], Tmean: [], shareBeyondTwice: [] };
  for (let k = 0; k < stats.bootstrapResamples; k += 1) {
    const drawn = [];
    for (let j = 0; j < sats.length; j += 1) drawn.push(...bySat.get(sats[Math.floor(rnd() * sats.length)]));
    const p = point(drawn);
    for (const key of Object.keys(draws)) draws[key].push(p[key]);
  }
  const tail = (1 - stats.interval) / 2;
  for (const [key, xs] of Object.entries(draws)) { xs.sort((x, y) => x - y); out[`${key}Interval`] = [xs[Math.floor(tail * xs.length)], xs[Math.min(xs.length - 1, Math.floor((1 - tail) * xs.length))]]; }
  return out;
}

/** Amendment A3's three tail thresholds, on point estimates. */
export const meetsTail = (t, th) => t?.T95 != null && t.T95 <= th.T95 && t.Trms <= th.Trms && t.shareBeyondTwice <= th.shareBeyondTwice;
