// Pair enumeration (PLAN.md reading 1, 3). Pure: no module call.
export const BINS = [[0, 0.25], [0.25, 0.75], [0.75, 1.5], [1.5, 2.5], [2.5, 4], [4, 6], [6, 8]];
export const binOf = (days) => BINS.findIndex(([lo, hi], i) => days >= lo && (days < hi || (i === BINS.length - 1 && days <= hi)));
// WGS-72, as the module's SGP4 (initl): un-Kozai the mean motion, then the mean altitude of the semimajor axis.
const XKE = 0.0743669161331734, RE = 6378.135, CK2 = 0.5 * 0.001082616;
/** Regime per Part 1's frozen definition (regimeDefinition): altitude LEO-L [0,500) LEO-M [500,800) LEO-H [800,2000) MEO [2000,30000) GEO [30000,40000), e < 0.25; HEO e >= 0.25. meanMotion in rev/day, inclination in degrees. */
export function regime(meanMotion, ecc, incDeg) {
  if (ecc >= 0.25) return 'HEO';
  const no = meanMotion * 2 * Math.PI / 1440, a1 = (XKE / no) ** (2 / 3), ci = Math.cos(incDeg * Math.PI / 180), x3thm1 = 3 * ci * ci - 1, bo2 = 1 - ecc * ecc, bo = Math.sqrt(bo2);
  const d1 = 1.5 * CK2 * x3thm1 / (a1 * a1 * bo * bo2), ao = a1 * (1 - d1 * (1 / 3 + d1 * (1 + 134 / 81 * d1))), dlo = 1.5 * CK2 * x3thm1 / (ao * ao * bo * bo2);
  const alt = ((XKE / (no / (1 + dlo))) ** (2 / 3) - 1) * RE;
  if (alt < 500) return 'LEO-L'; if (alt < 800) return 'LEO-M'; if (alt < 2000) return 'LEO-H'; if (alt < 30000) return 'MEO'; if (alt < 40000) return 'GEO';
  return 'OTHER';
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
