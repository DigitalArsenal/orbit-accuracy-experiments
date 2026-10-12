// E16's objects and who is held out (PLAN.md 3.2 and 5.4). Every assignment is a function of identities, names,
// SINEX blocks and train-window element-set fields, fixed before any error is computed. Bookkeeping only.
import crypto from 'node:crypto';
import { assignPlanes, planeOf } from '../e1-gps-epoch/methods.mjs';
import { config } from './common.mjs';

export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const hashOf = (norad) => crypto.createHash('sha256').update(`${config.tiers.seed}:${norad}`).digest('hex');

// The SP3 system letter a converted product's comment names ("SP3 satellite G22"), or null.
export function sp3System(entries) {
  for (const e of entries) { const m = /SP3 satellite ([A-Z])\d+/.exec(e.comment ?? e.inner?.comment ?? ''); if (m) return m[1]; }
  return null;
}

// Median mean motion (rev/day), inclination (deg) and node (deg) of an object's sets.
export function orbitSummary(sets) {
  return { meanMotion: median(sets.map((s) => s.elements.MEAN_MOTION)), inclination: median(sets.map((s) => s.elements.INCLINATION)), sets: sets.length };
}

// config.orbitClass: geosynchronous below 1.1 rev/day (GEO when inclined less than 10 degrees), MEO otherwise.
export function orbitClassOf({ meanMotion, inclination }) {
  const c = config.orbitClass;
  if (meanMotion < c.geosynchronousBelowRevPerDay) return inclination < c.geoInclinationBelowDeg ? 'GEO' : 'IGSO';
  return 'MEO';
}

// LEO mean-motion band (index, 0 = lowest orbits) and inclination class (config.tiers.S.LEO).
export function leoBand(meanMotion) {
  const edges = config.tiers.S.LEO.meanMotionBandsRevPerDay;   // descending
  const i = edges.findIndex((e) => meanMotion >= e);
  return i < 0 ? edges.length : i;
}
export function inclinationClass(inclination) {
  const [a, b] = config.tiers.S.LEO.inclinationClassesDeg;
  return inclination < a ? `<${a}` : inclination <= b ? `${a}-${b}` : `>${b}`;
}

// LEO operator group (config.tiers.P.LEO): by regime class or by NORAD number.
export function leoOperator(norad, regimeClass) {
  for (const [group, members] of Object.entries(config.tiers.P.LEO)) {
    if (members.includes(regimeClass) || members.includes(norad)) return group;
  }
  return null;
}

// GNSS generation from the SINEX block (config.tiers.N['MEO/GEO'].blocks), as "<system>:<generation>", or null.
export function gnssGeneration(system, block) {
  const table = config.tiers.N['MEO/GEO'].blocks[system];
  if (!table || !block) return null;
  for (const [generation, blocks] of Object.entries(table)) if (blocks.includes(block)) return `${system}:${generation}`;
  return null;
}

// Tier O: within each stratum, objects ranked by the salted hash of their NORAD number, fold = rank mod 5.
// Objects first seen later (not in `objects`) take hash mod 5 (foldOLate).
export function foldsO(objects) {
  const strata = new Map();
  for (const o of objects) { if (!strata.has(o.stratum)) strata.set(o.stratum, []); strata.get(o.stratum).push(o); }
  const out = new Map();
  const k = config.tiers.O.folds;
  for (const list of strata.values()) list.sort((a, b) => hashOf(a.norad).localeCompare(hashOf(b.norad))).forEach((o, i) => out.set(o.norad, i % k));
  return out;
}
export const foldOLate = (norad) => parseInt(hashOf(norad).slice(0, 8), 16) % config.tiers.O.folds;
export const stratumOf = (o) => (o.group === 'LEO' ? `${o.regimeClass}|${o.family ?? ''}` : `${o.system ?? o.regimeClass}|${o.orbitClass}`);

// GNSS orbital planes per MEO constellation (E1's node clustering), from the train sets nearest the window start.
export function gnssPlanes(objects, setsByObject, assignAt) {
  const out = new Map();
  for (const [system, count] of Object.entries(config.tiers.S['MEO/GEO'].planesPerConstellation)) {
    const members = objects.filter((o) => o.system === system && o.orbitClass === 'MEO');
    const sets = members.flatMap((o) => setsByObject.get(o.norad) ?? []);
    if (!members.length) continue;
    const planes = assignPlanes(sets, { count, assignAt }, config.tiers.S['MEO/GEO'].assignWithinDays);
    for (const o of members) {
      const p = planeOf(planes, o.norad, sets);
      if (p !== null && p !== undefined) out.set(o.norad, `${system}:${p}`);
    }
  }
  return out;
}

// The folds of one object, every tier (PLAN.md 5.4). null: the object is not scored in that tier.
export function tiersOf(o, { foldO, plane }) {
  if (o.group === 'LEO') {
    return {
      T: 'all',
      O: foldO,
      P: leoOperator(o.norad, o.regimeClass),
      Sband: `band${leoBand(o.meanMotion)}`,
      Sincl: inclinationClass(o.inclination),
      N: o.regimeClass === 'LEO-PL' && o.family && o.family !== 'other' ? o.family : null,
      M: null,
    };
  }
  return {
    T: 'all',
    O: foldO,
    P: o.regimeClass === 'SLR-MEO' ? 'spheres' : o.system,
    Splane: o.regimeClass === 'GNSS' ? plane ?? null : null,
    N: o.generation ?? null,
    M: o.orbitClass === 'MEO' ? 'train' : o.regimeClass === 'IGSO/GEO' ? 'test' : null,
  };
}
