// Statistics on per-sample errors. No orbit computation here.

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}
export const median = (xs) => quantile(xs, 0.5);

export const rms = (xs) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
export const norm3 = (e) => Math.hypot(e[0], e[1], e[2]);

// Deterministic PRNG (SplitMix32) so every interval is reproducible from its seed.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return ((z ^ (z >>> 16)) >>> 0) / 4294967296;
  };
}

// Two-way cluster ("pigeonhole") bootstrap, Owen (2007): rows and columns of
// the cluster grid (satellites × days) are resampled independently, and each
// cell is weighted by the product of its row and column draw counts.
// cells: [{row, col, ...sufficient statistics}]; statistic(weightedCells) -> number.
export function pigeonholeBootstrap(cells, statistic, { resamples, seed, confidence }) {
  const rows = [...new Set(cells.map((c) => c.row))];
  const cols = [...new Set(cells.map((c) => c.col))];
  const random = rng(seed);
  const draws = (keys) => {
    const count = new Map(keys.map((k) => [k, 0]));
    for (let i = 0; i < keys.length; ++i) {
      const k = keys[Math.floor(random() * keys.length)];
      count.set(k, count.get(k) + 1);
    }
    return count;
  };
  const values = [];
  for (let b = 0; b < resamples; ++b) {
    const r = draws(rows), c = draws(cols);
    const weighted = [];
    for (const cell of cells) {
      const w = r.get(cell.row) * c.get(cell.col);
      if (w) weighted.push({ ...cell, weight: w });
    }
    const v = statistic(weighted);
    if (Number.isFinite(v)) values.push(v);
  }
  const alpha = (1 - confidence) / 2;
  return {
    estimate: statistic(cells.map((c) => ({ ...c, weight: 1 }))),
    lower: quantile(values, alpha),
    upper: quantile(values, 1 - alpha),
    resamples: values.length,
    seed,
    confidence,
  };
}

// Weighted RMS of a 3-vector from cells carrying {n, sse} (sum of squared norms).
export const weightedRms = (cells) => {
  let n = 0, sse = 0;
  for (const c of cells) { n += c.weight * c.n; sse += c.weight * c.sse; }
  return Math.sqrt(sse / n);
};
