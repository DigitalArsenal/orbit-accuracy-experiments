// Counting only: the statistics and the verdict rule of PLAN.md. No orbit computation here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../..');
export const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
export const DAY = 86400000;

/** A small seeded generator, so a bootstrap interval is the same on every machine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

/**
 * The paired ratio of an arm to the set on SGP4: exp(median of ln(arm error / set error)) over sets, with a percentile
 * interval from resampling satellites with replacement (each drawn satellite brings all its sets).
 * pairs: [{ sat, x }] with x = ln(arm / set).
 */
export function ratioWithInterval(pairs, { bootstrapResamples, seed, interval } = CONFIG.statistics) {
  const bySat = new Map();
  for (const p of pairs) { if (!bySat.has(p.sat)) bySat.set(p.sat, []); bySat.get(p.sat).push(p.x); }
  const sats = [...bySat.keys()].sort((a, b) => a - b);
  const out = { sets: pairs.length, satellites: sats.length, ratio: null, lo: null, hi: null, shareCloser: null, satellitesCloser: null };
  if (!pairs.length) return out;
  out.ratio = Math.exp(median(pairs.map((p) => p.x)));
  out.shareCloser = pairs.filter((p) => p.x < 0).length / pairs.length;
  out.satellitesCloser = sats.filter((s) => median(bySat.get(s)) < 0).length;
  if (sats.length < 2) return out;
  const rnd = mulberry32(seed);
  const medians = [];
  for (let k = 0; k < bootstrapResamples; k += 1) {
    const drawn = [];
    for (let j = 0; j < sats.length; j += 1) drawn.push(...bySat.get(sats[Math.floor(rnd() * sats.length)]));
    medians.push(median(drawn));
  }
  medians.sort((a, b) => a - b);
  const tail = (1 - interval) / 2;
  out.lo = Math.exp(medians[Math.floor(tail * bootstrapResamples)]);
  out.hi = Math.exp(medians[Math.min(bootstrapResamples - 1, Math.floor((1 - tail) * bootstrapResamples))]);
  return out;
}

/** BEATS: the whole interval is below 1. LOSES: the whole interval is above 1. TIE: it spans 1. FEW: too little to say. */
export function verdict(r, { minimumSatellites, minimumSets } = CONFIG.statistics) {
  if (r.satellites < minimumSatellites || r.sets < minimumSets || r.lo == null) return 'FEW';
  if (r.hi < 1) return 'BEATS';
  if (r.lo > 1) return 'LOSES';
  return 'TIE';
}

/** Per-day and 72 h root-mean-square of 3D position differences (km) from sums the runner accumulated. */
export function rmsOf(sumSquares, count) { return count > 0 ? Math.sqrt(sumSquares / count) : null; }
