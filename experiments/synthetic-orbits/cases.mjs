// Synthetic orbits over the whole orbit regime (stack #498): a seeded grid over perigee altitude, eccentricity and inclination, an
// area-to-mass sweep on a subset of it, and the named edge cases, each its own row. Nothing here is any real satellite: every orbit is
// made up from the numbers below and the seed. An orbit is given as mean elements (rev/day, deg) at the epoch D0 - 72 h, the start of
// its fit arc; run.mjs makes its state with the module and flies the truth from it.
//   import { cases } from './cases.mjs'; cases(498) -> { cases: [...], notCovered: [...] }

const MU = 398600.4418, RE = 6378.137, DAY_S = 86400;
// mean motion (rev/day) of the orbit with the given perigee altitude (km) and eccentricity (two-body, for the grid's spacing only)
const revPerDay = (hpKm, e) => { const a = (RE + hpKm) / (1 - e); return (DAY_S / (2 * Math.PI)) * Math.sqrt(MU / a ** 3); };
const perigeeOf = (n, e) => { const a = Math.cbrt(MU / ((n * 2 * Math.PI) / DAY_S) ** 2); return { a, hp: a * (1 - e) - RE, ha: a * (1 + e) - RE }; };
const SIDEREAL = 1.00273790935; // rev/day of an orbit with the sidereal day's period
const MOON_KM = 384400;

/** The three area-to-mass classes (A/m, m2/kg); the truth's drag term is 2.2 A/m and its radiation term 1.2 A/m. */
export const AM = { sphere: 0.001, satellite: 0.01, debris: 0.1 };
export const termsOf = (am) => ({ dragAreaOverMass: 2.2 * AM[am], srpAreaOverMass: 1.2 * AM[am] });

/** A small seeded generator (mulberry32), so a seed gives the same cases everywhere. */
export function random(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const GRID = {
  perigeeKm: [200, 300, 400, 500, 650, 800, 1000, 1400, 2000, 5000, 10000, 20200, 35786],
  eccentricity: [0, 0.001, 0.01, 0.05, 0.1, 0.3, 0.5, 0.7, 0.9],
  // seven inclinations (the named edge cases carry 63.4, 90, 116.6 and 150 to 180)
  inclinationDeg: [0.5, 20, 55, 70, 98, 130, 165],
};
export const BANDS = [[0, 30], [30, 60], [60, 90], [90, 120], [120, 180.01]];
// the cutoffs (D0) lie on whole days in this span, where the as-issued space weather is in the local store
const FIRST = Date.parse('2025-11-15T00:00:00Z'), LAST = Date.parse('2026-09-25T00:00:00Z');

export function cases(seed = 498, { gridStep = 1 } = {}) {
  const rnd = random(seed), out = [], notCovered = [];
  const angle = () => Math.round(rnd() * 3600) / 10;
  const cutoff = () => new Date(FIRST + Math.floor(rnd() * ((LAST - FIRST) / 864e5 + 1)) * 864e5).toISOString().slice(0, 10);
  const orbit = (o) => { const n = o.n ?? revPerDay(o.hpKm, o.e); const g = perigeeOf(n, o.e); return { raan: angle(), argp: angle(), ma: angle(), cutoff: cutoff(), am: 'satellite', ...o, n: Math.round(n * 1e10) / 1e10, hpKm: o.hpKm ?? Math.round(g.hp), haKm: Math.round(g.ha) }; };
  // 1. the grid: every perigee, eccentricity and inclination, a typical satellite, the other angles and the cutoff drawn from the seed
  let k = 0;
  for (const hpKm of GRID.perigeeKm) for (const e of GRID.eccentricity) for (const i of GRID.inclinationDeg) {
    const g = perigeeOf(revPerDay(hpKm, e), e);
    if (g.ha + RE > MOON_KM) { notCovered.push({ hpKm, e, i, why: `apogee ${Math.round(g.ha)} km, beyond the Moon's distance` }); continue; }
    if (k++ % gridStep) { notCovered.push({ hpKm, e, i, why: `left out to fit the run (every ${gridStep}th cell flown)` }); continue; }
    out.push(orbit({ id: `grid-hp${hpKm}-e${e}-i${i}`, kind: 'grid', hpKm, e, i }));
  }
  // 2. the area-to-mass sweep: a dense sphere and light debris on a subset of the grid (the grid itself is a typical satellite)
  for (const am of ['sphere', 'debris']) for (const hpKm of [300, 500, 800, 1400, 20200, 35786]) for (const e of [0.001, 0.3, 0.7]) for (const i of [55, 98]) {
    const g = perigeeOf(revPerDay(hpKm, e), e);
    if (g.ha + RE > MOON_KM) continue;
    out.push(orbit({ id: `am-${am}-hp${hpKm}-e${e}-i${i}`, kind: 'area-to-mass', hpKm, e, i, am }));
  }
  // 3. the named edge cases
  const edge = (id, name, o) => out.push(orbit({ id: `edge-${id}`, kind: 'edge', name, ...o }));
  // the theory's switches, both sides: the eccentricity switches 0.05 (class 0) and 0.3 (resonant classes), the class bands by mean motion
  for (const e of [0.049, 0.051]) edge(`e${e}-leo`, `eccentricity ${e}, class 0 switch at 0.05`, { hpKm: 700, e, i: 98 });
  for (const e of [0.299, 0.301]) edge(`e${e}-halfday`, `eccentricity ${e}, resonant-class switch at 0.3 (half-day class)`, { n: 2.0055, e, i: 55 });
  for (const e of [0.299, 0.301]) edge(`e${e}-oneday`, `eccentricity ${e}, resonant-class switch at 0.3 (one-day class)`, { n: 1.0027, e, i: 30 });
  for (const [b, label] of [[0.8022284153, 'one-day lower'], [1.2033426229, 'one-day upper / 16 h lower'], [1.6044568306, '16 h upper / half-day lower'], [2.4066852459, 'half-day upper / 8 h lower'], [3.6100278459, '8 h upper / class 0']])
    for (const [s, f] of [['below', 0.995], ['above', 1.005]]) edge(`class-${b}-${s}`, `class band edge ${label} (${b} rev/day), just ${s}`, { n: b * f, e: 0.01, i: 45 });
  // the drag prior's altitude table (SPEC 12.8: 0.01 below 600 km, 0.002 at 600-800 km, 0.0005 above; its sigma widens at 800-1400 km)
  for (const h of [600, 800, 1400]) for (const [s, d] of [['below', -1], ['above', 1]]) edge(`dragtable-${h}-${s}`, `drag prior table boundary ${h} km, just ${s}`, { hpKm: h + d, e: 0.0005, i: 98 });
  // repeat-ground-track resonances m:1, exact and 0.5 % off; GPS (2:1) and Galileo (17 revolutions in 10 sidereal days)
  for (let m = 1; m <= 16; m += 1) for (const [s, f] of [['exact', 1], ['off', 1.005]]) edge(`res-${m}to1-${s}`, `${m}:1 repeat-ground-track resonance, ${s === 'exact' ? 'exact' : '0.5 % off'}`, { n: m * SIDEREAL * f, e: m <= 2 ? 0.01 : 0.001, i: m === 2 ? 55 : m === 1 ? 5 : 70 });
  for (const [s, f] of [['exact', 1], ['off', 1.005]]) edge(`res-galileo-${s}`, `Galileo-like 17:10 resonance, ${s === 'exact' ? 'exact' : '0.5 % off'}`, { n: 1.7 * SIDEREAL * f, e: 0.0003, i: 56 });
  edge('gps-like', 'GPS-like (2:1, e 0.01, i 55)', { n: 2 * SIDEREAL, e: 0.01, i: 55 });
  // inclinations: critical, sun-synchronous, frozen, polar, retrograde; near-zero eccentricity and inclination
  for (const i of [63.4349, 116.5651]) edge(`critical-${i}`, `critical inclination ${i} deg (e 0.1)`, { hpKm: 1000, e: 0.1, i, argp: 90 });
  for (const i of [63.4349, 116.5651]) edge(`critical-${i}-heo`, `critical inclination ${i} deg (e 0.6)`, { hpKm: 1000, e: 0.6, i, argp: 270 });
  edge('sso-dawn-dusk', 'sun-synchronous 700 km (dawn-dusk node)', { hpKm: 700, e: 0.0012, i: 98.19, argp: 90, cutoff: '2026-06-21', raan: 0 });
  edge('sso-noon', 'sun-synchronous 700 km (noon node, deepest shadow)', { hpKm: 700, e: 0.0012, i: 98.19, argp: 90, cutoff: '2026-06-21', raan: 270 });
  edge('frozen', 'frozen orbit (800 km, e 0.0011, argp 90)', { hpKm: 788, e: 0.0011, i: 98.6, argp: 90 });
  edge('polar', 'polar (800 km, i 90)', { hpKm: 800, e: 0.001, i: 90 });
  for (const i of [150, 170, 180]) edge(`retro-${i}`, `retrograde i ${i} deg (600 km)`, { hpKm: 600, e: 0.001, i });
  for (const e of [1e-5, 1e-4]) edge(`ecc-${e}`, `eccentricity ${e} (600 km)`, { hpKm: 600, e, i: 51.6 });
  for (const i of [0.01, 0.1]) edge(`inc-${i}-leo`, `inclination ${i} deg (600 km)`, { hpKm: 600, e: 0.001, i });
  for (const i of [0.01, 0.1]) edge(`inc-${i}-geo`, `inclination ${i} deg (geostationary)`, { n: SIDEREAL, e: 0.0002, i });
  // geosynchronous: inclined geosynchronous, the graveyard (no case is placed at the stable or unstable longitudes: see notCovered)
  notCovered.push({ edge: 'geostationary at the stable (75 E, 105 W) and unstable (165 E, 15 W) longitudes', why: 'placing an orbit at a longitude needs Earth orientation on the frames call, which the case builder does not make; the grid\'s geostationary orbits sit at the longitudes their drawn angles give' });
  edge('igso', 'inclined geosynchronous (i 55)', { n: SIDEREAL, e: 0.002, i: 55 });
  edge('graveyard', 'geostationary graveyard (+300 km)', { hpKm: 36086, e: 0.0005, i: 0.5 });
  // eccentric: Molniya, transfer orbits, lunar-resonant, one-day eccentric
  edge('molniya', 'Molniya (12 h, e 0.74, i 63.4, argp 270)', { n: 2.0055, e: 0.74, i: 63.4, argp: 270 });
  edge('gto', 'geostationary transfer (250 x 35,786 km, i 27)', { hpKm: 250, e: 0.7306, i: 27 });
  edge('gto-low-i', 'geostationary transfer (300 x 35,786 km, i 6)', { hpKm: 300, e: 0.7297, i: 6 });
  edge('tess-like', 'lunar-resonant 2:1 (TESS-like: 13.7 d, 108,000 x 375,000 km)', { n: 1 / 13.7, e: 0.55, i: 37 });
  edge('themis-like', 'one-day eccentric (THEMIS-like: 1 d, e 0.82)', { n: 1.0027, e: 0.82, i: 10 });
  // very low perigee, drag dominant; decay inside the forecast
  edge('low-150', 'circular 150 km, dense sphere (decays within the forecast)', { hpKm: 150, e: 0.0005, i: 51.6, am: 'sphere' });
  edge('low-180', 'circular 180 km', { hpKm: 180, e: 0.0005, i: 51.6 });
  edge('low-220-debris', 'circular 220 km, light debris', { hpKm: 220, e: 0.0005, i: 51.6, am: 'debris' });
  edge('heo-perigee-150', 'eccentric with perigee 150 km (e 0.5)', { hpKm: 150, e: 0.5, i: 28 });
  // eclipse seasons: geostationary at an equinox (daily shadow) and a solstice (none), light debris to make the radiation term large
  edge('geo-equinox', 'geostationary at the March equinox (eclipse season), light debris', { n: SIDEREAL, e: 0.0002, i: 0.05, cutoff: '2026-03-21', am: 'debris' });
  edge('geo-solstice', 'geostationary at the June solstice (no eclipses), light debris', { n: SIDEREAL, e: 0.0002, i: 0.05, cutoff: '2026-06-21', am: 'debris' });
  edge('meo-shadow-entry', 'medium Earth orbit entering its eclipse season (light debris)', { n: 2 * SIDEREAL, e: 0.001, i: 55, cutoff: '2026-03-21', am: 'debris' });
  return { seed, gridStep, cases: out, notCovered };
}
/**
 * A case's label as a page prints it. It is the case's own name, except where that name says more than the case is. A case
 * object is never changed for this, because its hash, which covers the name, keys the stored rows.
 * - The m:1 and 17:10 "exact" cases have a mean motion of m (or 1.7) times the sidereal rate, and the node's and the perigee's J2
 *   rates are left out. They lie near the repeat, not on it: the true m:1 repeat is 0.2 to 0.9 % higher at m 8 to 16.
 * - The two transfer orbits' apogees are the ones their eccentricity gives at their perigee, not 35,786 km.
 */
export function labelOf(c) {
  if (!c?.name) return c?.id ?? '';
  let m;
  if ((m = /^edge-res-(\d+)to1-(exact|off)$/.exec(c.id))) return `${m[1] === '1' ? 'the sidereal rate' : `${m[1]} times the sidereal rate`}${m[2] === 'off' ? ', plus 0.5 %' : ''}, near the ${m[1]}:1 repeat-ground-track resonance (the node's and the perigee's J2 rates left out)`;
  if ((m = /^edge-res-galileo-(exact|off)$/.exec(c.id))) return `Galileo-like, 1.7 times the sidereal rate${m[1] === 'off' ? ', plus 0.5 %' : ''}, near the 17:10 resonance (the node's and the perigee's J2 rates left out)`;
  if (c.id === 'edge-gps-like') return 'GPS-like, twice the sidereal rate (e 0.01, i 55)';
  if (c.id === 'edge-gto' || c.id === 'edge-gto-low-i') return `geostationary transfer-like (${c.hpKm.toLocaleString('en-US')} x ${c.haKm.toLocaleString('en-US')} km, i ${c.i})`;
  return c.name;
}
export const bandOf = (i) => BANDS.findIndex(([lo, hi]) => i >= lo && i < hi);
/** The guard subset: every 8th grid and every 8th area-to-mass case in the generator's order, and every named edge case. */
export const guardOf = (list) => { const k = {}; return list.filter((c) => { k[c.kind] = (k[c.kind] ?? -1) + 1; return c.kind === 'edge' || k[c.kind] % 8 === 0; }); };
/** The bar's bands (stack #503): near-circular (e at most 0.01) by perigee, then by eccentricity, then the named edge cases. */
export const BAR_BANDS = ['Near-circular, perigee under 400 km', 'Near-circular, 400 to 600 km', 'Near-circular, 650 to 2,000 km', 'Near-circular, 5,000 to 20,200 km', 'Near-circular, geosynchronous', 'e 0.05 to 0.1', 'e 0.3', 'e 0.5 to 0.9, perigee under 2,500 km', 'e 0.5 to 0.9, perigee 5,000 km and above', 'Named edge cases'];
export function barBandOf(c) {
  if (c.kind === 'edge') return BAR_BANDS[9];
  const { e, hpKm: hp } = c;
  if (e <= 0.01) return BAR_BANDS[hp < 400 ? 0 : hp <= 600 ? 1 : hp <= 2000 ? 2 : hp <= 20200 ? 3 : 4];
  if (e <= 0.1) return BAR_BANDS[5];
  if (e <= 0.3) return BAR_BANDS[6];
  return BAR_BANDS[hp < 2500 ? 7 : 8];
}
