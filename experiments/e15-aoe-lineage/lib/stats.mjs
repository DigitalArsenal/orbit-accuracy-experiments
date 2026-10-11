// Statistics of PLAN.md section 6 on residual rows (E3's step 20, the same estimators): median and 95th percentile of
// the 3D error with two-way (object x day) pigeonhole bootstrap intervals; RMS per RTN axis and each axis's share after a
// 5-robust-sigma clip on the 3D error; paired ratios of medians; per-object Pearson correlations for L2. No orbit
// computation: the errors are the module's.
import { median, pigeonholeBootstrap, quantile } from '../../../harness/stats.mjs';
import { config } from './windows.mjs';

const S = config.statistics;
export const norm = (e) => Math.hypot(e[0], e[1], e[2]);
const boot = (cells, statistic, seed, resamples) => pigeonholeBootstrap(cells, statistic, { resamples, seed, confidence: S.confidence });

// The q-quantile of values weighted by their cell's draw count (E3's weightedQuantile).
function weightedQuantile(pairs, q) {
  const total = pairs.reduce((t, p) => t + p[1], 0);
  let acc = 0;
  for (const [v, w] of pairs) { acc += w; if (acc >= q * total) return v; }
  return pairs.at(-1)?.[0] ?? NaN;
}
const quantileStat = (q) => (cells) => weightedQuantile(cells.flatMap((c) => c.values.map((v) => [v, c.weight])).sort((a, b) => a[0] - b[0]), q);

// Cells of the bootstrap: object (row) x issue day (column).
function cellsOf(list, value) {
  const m = new Map();
  for (const s of list) {
    const k = `${s.norad}|${s.issue}`;
    if (!m.has(k)) m.set(k, { row: s.norad, col: s.issue, values: [] });
    m.get(k).values.push(value(s));
  }
  return [...m.values()];
}

// 5-robust-sigma clip on the 3D error (median and MAD scaled to sigma).
export function clipMask(errs) {
  const d = errs.map(norm);
  const med = median(d), mad = median(d.map((x) => Math.abs(x - med))) * S.madScale;
  return d.map((x) => !(mad > 0) || Math.abs(x - med) <= S.clipRobustSigma * mad);
}

export function meanSquareRtn(errs) {
  const keep = clipMask(errs);
  const kept = errs.filter((_, i) => keep[i]);
  return [0, 1, 2].map((a) => kept.reduce((t, e) => t + e[a] * e[a], 0) / kept.length);
}

export function summarize(list, seed, resamples) {
  const errs = list.map((s) => s.rtnKm);
  const keep = clipMask(errs);
  const kept = errs.filter((_, i) => keep[i]);
  const sq = [0, 1, 2].map((a) => kept.reduce((t, e) => t + e[a] * e[a], 0));
  const total = sq[0] + sq[1] + sq[2];
  const cells = cellsOf(list, (s) => norm(s.rtnKm));
  return {
    n: list.length, objects: new Set(list.map((s) => s.norad)).size, days: new Set(list.map((s) => s.issue)).size,
    median3dKm: boot(cells, quantileStat(0.5), seed, resamples),
    p95_3dKm: boot(cells, quantileStat(0.95), seed + 1, resamples),
    max3dKm: Math.max(...errs.map(norm)),
    clippedRmsRtnKm: sq.map((x) => Math.sqrt(x / kept.length)), clipped: list.length - kept.length,
    squaredErrorShareRtn: sq.map((x) => x / total),
  };
}

// Ratio of medians a / b on the (object, issue, horizon) cells where both exist.
export function pairedRatio(byMethod, a, b, seed, resamples) {
  const key = (s) => `${s.norad}|${s.issue}|${s.h}`;
  const B = new Map(byMethod[b]?.map((s) => [key(s), s]) ?? []);
  const pairs = (byMethod[a] ?? []).filter((s) => B.has(key(s))).map((s) => [s, B.get(key(s))]);
  if (pairs.length < 10) return { n: pairs.length };
  const m = new Map();
  for (const [x, y] of pairs) {
    const k = `${x.norad}|${x.issue}`;
    if (!m.has(k)) m.set(k, { row: x.norad, col: x.issue, a: [], b: [] });
    m.get(k).a.push(norm(x.rtnKm));
    m.get(k).b.push(norm(y.rtnKm));
  }
  const stat = (cells) => {
    const qa = weightedQuantile(cells.flatMap((c) => c.a.map((v) => [v, c.weight])).sort((x, y) => x[0] - y[0]), 0.5);
    const qb = weightedQuantile(cells.flatMap((c) => c.b.map((v) => [v, c.weight])).sort((x, y) => x[0] - y[0]), 0.5);
    return qa / qb;
  };
  return { n: pairs.length, objects: new Set(pairs.map(([x]) => x.norad)).size, ...boot([...m.values()], stat, seed, resamples) };
}

const pearson = (x, y) => {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; ++i) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
};

// L2 (PLAN.md section 6, amendment A2): per object, the Pearson correlation of AOE-latest's and ST-latest's along-track
// errors at h = 0 over the issue days where both exist (at least minimumPairsPerObject); the regime's median.
export function lineageCorrelation(byMethod) {
  const L2 = config.decisions.L2;
  const axis = { R: 0, T: 1, N: 2 }[L2.axis];
  const pick = (m) => (byMethod[m] ?? []).filter((s) => s.h === L2.horizonDays);
  const st = new Map(pick('ST-latest').map((s) => [`${s.norad}|${s.issue}`, s]));
  const byObject = new Map();
  for (const a of pick('AOE-latest')) {
    const b = st.get(`${a.norad}|${a.issue}`);
    if (!b) continue;
    if (!byObject.has(a.norad)) byObject.set(a.norad, { x: [], y: [] });
    const o = byObject.get(a.norad);
    o.x.push(a.rtnKm[axis]);
    o.y.push(b.rtnKm[axis]);
  }
  const r = [];
  for (const [norad, o] of byObject) if (o.x.length >= L2.minimumPairsPerObject) { const v = pearson(o.x, o.y); if (Number.isFinite(v)) r.push({ norad, r: v, n: o.x.length }); }
  const values = r.map((x) => x.r);
  const med = values.length ? median(values) : NaN;
  return {
    objectsWithPairs: byObject.size, objects: r.length, median: med, quartiles: values.length ? [quantile(values, 0.25), quantile(values, 0.75)] : null,
    holds: values.length ? med < L2.medianCorrelationBelow : null, threshold: L2.medianCorrelationBelow,
  };
}
