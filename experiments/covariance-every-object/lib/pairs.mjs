// Pair enumeration (PLAN.md reading 1, 3). Pure: no module call.
export const BINS = [[0, 0.25], [0.25, 0.75], [0.75, 1.5], [1.5, 2.5], [2.5, 4], [4, 6], [6, 8]];
export const binOf = (days) => BINS.findIndex(([lo, hi], i) => days >= lo && (days < hi || (i === BINS.length - 1 && days <= hi)));
const MU = 398600.4418, RE = 6378.137;
/** Regime of a set from its mean motion (rev/day) and eccentricity: Part 1 section 0 edges (altitude from the semimajor axis). */
export function regime(meanMotion, ecc) {
  const a = Math.cbrt(MU / (meanMotion * 2 * Math.PI / 86400) ** 2), alt = a - RE;
  if (ecc >= 0.25) return 'HEO';
  if (alt < 500) return 'LEO-L'; if (alt < 800) return 'LEO-M'; if (alt < 2000) return 'LEO-H';
  if (a >= 40000 && a <= 44500) return 'GEO';
  return a < 40000 ? 'MEO' : 'OTHER';
}
/** sets: [{epoch, created, gpId, el}] of one object; returns { sets (deduplicated, by epoch), pairs: [{k, j, bin}] } with indices into sets.
 *  from/to: ms bounds on both epochs. j = earliest-created set with creation >= k's creation and t_j - t_k in the bin. */
export function enumerate(raw, fromMs, toMs, epochMs) {
  const seen = new Map();
  for (const s of [...raw].sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.gpId < b.gpId ? -1 : 1))) {
    const t = epochMs(s.epoch); if (t < fromMs || t > toMs) continue;
    if (!seen.has(s.epoch)) seen.set(s.epoch, { ...s, t, c: epochMs(s.created) });
  }
  const sets = [...seen.values()].sort((a, b) => a.t - b.t), pairs = [];
  for (let k = 0; k < sets.length; k++) {
    const best = new Array(BINS.length).fill(-1);
    for (let j = k + 1; j < sets.length; j++) {
      const d = (sets[j].t - sets[k].t) / 86400e3; if (d > 8) break;
      const b = binOf(d); if (b < 0 || sets[j].c < sets[k].c) continue;
      if (best[b] < 0 || sets[j].c < sets[best[b]].c || (sets[j].c === sets[best[b]].c && sets[j].gpId < sets[best[b]].gpId)) best[b] = j;
    }
    best.forEach((j, b) => { if (j >= 0) pairs.push({ k, j, bin: b }); });
  }
  return { sets, pairs };
}
