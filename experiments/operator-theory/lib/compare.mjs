// The registered statistics (PLAN.md, Rules), used by table.mjs and cheaper.mjs. Statistics only; no physics.
export const REPS = 2000, SEED = 20261101, LEVEL = 0.975;
export const MIN = { pairs: 30, objects: 8, days: 3 };
export const MAX_FAILED = 0.10, QUIET_KM = 5;
export const BINS = [[12, 6], [24, 6], [36, 6], [48, 6], [60, 6], [72, 6], [96, 12], [120, 12], [144, 12], [168, 12]];
export const PRIMARY = new Set([24, 48, 72, 168]);
export const binOf = (h) => { for (const [c, w] of BINS) if (h >= c - w && h < c + w) return c; return null; };
export const rand = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const pct = (sorted, q) => { if (!sorted.length) return null; const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); };
export const asc = (a, b) => a - b;
export const median = (v) => pct([...v].sort(asc), 0.5);
export const round = (x, n = 3) => (x === null || x === undefined ? null : Number(x.toFixed(n)));

/** The median of d (paired differences) with a two-way bootstrap interval: objects and start days drawn independently, a pair weighted by the product of the counts. */
export function compare(pairs, random) {
  const d = [...pairs].sort((a, b) => a.d - b.d);
  const objects = [...new Set(d.map((p) => p.object))], days = [...new Set(d.map((p) => p.day))];
  const estimate = median(d.map((p) => p.d));
  if (d.length < MIN.pairs || objects.length < MIN.objects || days.length < MIN.days) return { n: d.length, objects: objects.length, days: days.length, median: round(estimate), interval: null };
  const iObject = new Map(objects.map((o, i) => [o, i])), iDay = new Map(days.map((o, i) => [o, i]));
  const po = d.map((p) => iObject.get(p.object)), pd = d.map((p) => iDay.get(p.day));
  const out = [];
  for (let r = 0; r < REPS; r += 1) {
    const wo = new Float64Array(objects.length), wd = new Float64Array(days.length);
    for (let i = 0; i < objects.length; i += 1) wo[Math.floor(random() * objects.length)] += 1;
    for (let i = 0; i < days.length; i += 1) wd[Math.floor(random() * days.length)] += 1;
    let total = 0;
    for (let i = 0; i < d.length; i += 1) total += wo[po[i]] * wd[pd[i]];
    if (!total) continue;
    let run = 0;
    for (let i = 0; i < d.length; i += 1) { run += wo[po[i]] * wd[pd[i]]; if (run >= total / 2) { out.push(d[i].d); break; } }
  }
  out.sort(asc);
  return { n: d.length, objects: objects.length, days: days.length, median: round(estimate), interval: [round(pct(out, 1 - LEVEL)), round(pct(out, LEVEL))] };
}
