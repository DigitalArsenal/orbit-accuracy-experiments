// E11 statistics on the derived products: pairs, windows, the cluster
// bootstrap over objects, Holm's correction. No orbit computation here.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './common.mjs';
import { rng, quantile, median } from '../../harness/stats.mjs';

export const ms = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);

// Persisted versions (derived/index.jsonl) with their stats.json, in a window
// of issue time [from, to).
export function versions(window) {
  const [from, to] = config.windows[window].map(ms);
  const root = path.dirname(config.archives.derived);
  const rows = fs.readFileSync(path.join(config.archives.derived, 'index.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return rows.filter((r) => r.created && ms(r.created) >= from && ms(r.created) < to)
    .map((r) => ({ ...r, stats: JSON.parse(fs.readFileSync(path.join(root, r.dir, 'stats.json'), 'utf8')) }));
}

// Gate-passing SupGP pairs of a window: one row per pair with the three
// fit-window RMS values (per coordinate, km) and the 3D values.
export function pairs(window) {
  const out = [];
  for (const v of versions(window)) {
    for (const g of v.stats.gate ?? []) {
      if (!g.pass) continue;
      out.push({ provider: v.provider, norad: v.norad, version: v.version, supgpEpoch: g.supgpEpoch, window: g.window, n: g.n,
        oursKm: g.oursRmsKm, supgpKm: g.recomputedRmsKm, publishedKm: g.publishedRmsKm, ours3dKm: g.ours3dKm, supgp3dKm: g.supgp3dKm });
    }
  }
  return out;
}

// Mean over objects of each object's mean log ratio, with a one-way cluster
// bootstrap over objects (config.statistics).
export function clusterLogRatio(rows, numerator, denominator, { seed = config.statistics.bootstrapSeed } = {}) {
  const byObject = new Map();
  for (const r of rows) {
    const a = r[numerator], b = r[denominator];
    if (!(a > 0) || !(b > 0)) continue;
    if (!byObject.has(r.norad)) byObject.set(r.norad, []);
    byObject.get(r.norad).push(Math.log(a / b));
  }
  const objects = [...byObject.values()].map((xs) => xs.reduce((s, x) => s + x, 0) / xs.length);
  const stat = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (!objects.length) return { objects: 0, pairs: 0 };
  const random = rng(seed);
  const values = [];
  for (let b = 0; b < config.statistics.bootstrapResamples; ++b) {
    const draw = [];
    for (let i = 0; i < objects.length; ++i) draw.push(objects[Math.floor(random() * objects.length)]);
    values.push(stat(draw));
  }
  const alpha = (1 - config.statistics.confidence) / 2;
  const estimate = stat(objects);
  return { objects: objects.length, pairs: rows.length, estimate, lower: quantile(values, alpha), upper: quantile(values, 1 - alpha),
    ratio: Math.exp(estimate), ratioLower: Math.exp(quantile(values, alpha)), ratioUpper: Math.exp(quantile(values, 1 - alpha)),
    resamples: values.length, seed, confidence: config.statistics.confidence, supported: quantile(values, 1 - alpha) < 0 };
}

// Holm's step-down correction: p-like bootstrap tails are not used; the
// adjusted rule widens each interval to the Holm level instead.
export function holmLevels(m, alpha = 1 - config.statistics.confidence) {
  return Array.from({ length: m }, (_, i) => 1 - alpha / (m - i));
}

export const summary = (xs) => ({ n: xs.length, median: median(xs), p10: quantile(xs, 0.1), p90: quantile(xs, 0.9) });
