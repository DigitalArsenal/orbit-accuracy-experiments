// The OMM-only regimes (PLAN.md section 3): each object's class from its
// newest OMM created in the days before a selection date, by the OMM's own
// OBJECT_TYPE, mean motion, eccentricity, inclination, period and Space-Track's
// PERIAPSIS / APOAPSIS heights; retired GNSS payloads by IGS's satellite
// metadata. And the seeded draw of objects and product times. Reading and
// selecting only; populations and draws stay in runs/ (they derive from the
// catalog), counts are reported.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { sha256 } from '../../harness/modules.mjs';
import { rng } from '../../harness/stats.mjs';
import { dayList, epochMs, shiftDay } from '../../harness/gp-archive.mjs';
import { config, DAY_MS } from './common.mjs';

const GEO_N = (r) => r.driftingPayloads.meanMotion;

// The newest OMM of every object among the creation days [date - days + 1,
// date] (whole-day files): {byObject: Map(norad -> record), files}.
export function newestOmms(archive, date, days) {
  const files = {};
  const byObject = new Map();
  for (const day of dayList(shiftDay(date, 1 - days), date)) {
    const file = path.join(archive, day.slice(0, 4), `${day}.json.gz`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file);
    files[path.relative(archive, file)] = sha256(raw);
    for (const g of JSON.parse(gunzipSync(raw))) {
      if (g.MEAN_ELEMENT_THEORY !== config.elementSets.meanElementTheory || String(g.EPHEMERIS_TYPE) !== config.elementSets.ephemerisType) continue;
      const norad = Number(g.NORAD_CAT_ID);
      const prev = byObject.get(norad);
      if (!prev || epochMs(g.EPOCH) > epochMs(prev.EPOCH)) byObject.set(norad, g);
    }
  }
  return { byObject, files };
}

// The regime and subclass of one OMM record at dateMs, or null.
export function classify(g, gnss, dateMs) {
  const rules = config.populationRules;
  const type = g.OBJECT_TYPE;
  if (rules.excludeObjectTypes.includes(type)) return null;
  if (rules.excludeDecayed && g.DECAY_DATE) return null;
  const n = Number(g.MEAN_MOTION), e = Number(g.ECCENTRICITY), inc = Number(g.INCLINATION);
  const hp = Number(g.PERIAPSIS), ha = Number(g.APOAPSIS), period = Number(g.PERIOD);
  if (!(hp >= rules.minimumPerigeeKm)) return null;
  const c = config.classes;
  const leo = (name) => {
    const r = c[name].rule;
    return r.objectTypes.includes(type) && n > r.meanMotionAbove && hp >= r.perigeeKm[0] && hp < r.perigeeKm[1];
  };
  if (leo('LEO-drag')) return { regime: 'LEO-drag', subclass: type };
  if (leo('LEO-upper')) return { regime: 'LEO-upper', subclass: type };
  if (n > c['LEO-drag'].rule.meanMotionAbove) return null;
  const heo = c.HEO.rule;
  if (e >= heo.eccentricityAtLeast && hp < heo.perigeeKmBelow) {
    if (!heo.objectTypes.includes(type)) return null;
    const s = c.HEO.subclasses;
    const sub = ha >= s.GTO.apogeeKmAtLeast && inc < s.GTO.inclinationBelow ? 'GTO'
      : period >= s.Molniya.periodMinutes[0] && period <= s.Molniya.periodMinutes[1] && inc >= s.Molniya.inclination[0] && inc <= s.Molniya.inclination[1] ? 'Molniya' : 'HEO-other';
    return { regime: 'HEO', subclass: sub, objectType: type };
  }
  const geo = c['GEO+'].rule;
  if (n >= geo.meanMotion[0] && n <= geo.meanMotion[1] && e < geo.eccentricityBelow) {
    if (geo.objectTypes.includes(type)) return { regime: 'GEO+', subclass: type };
    if (type === 'PAYLOAD' && Math.abs(n - GEO_N(geo)) > geo.driftingPayloads.driftAbove) return { regime: 'GEO+', subclass: 'DEAD PAYLOAD' };
    return null;
  }
  const meo = c.MEO.rule;
  if (hp > meo.perigeeKmAbove && ha < meo.apogeeKmBelow && e < meo.eccentricityBelow) {
    if (meo.objectTypes.includes(type)) return { regime: 'MEO', subclass: type };
    if (type === 'PAYLOAD' && meo.retiredGnssPayloads && retiredGnss(g, gnss, dateMs)) return { regime: 'MEO', subclass: 'RETIRED GNSS' };
  }
  return null;
}

// A GNSS payload no longer in service: listed by IGS without a PRN valid at
// dateMs, or named as a GNSS programme and not listed at all.
function retiredGnss(g, gnss, dateMs) {
  const meta = gnss.at(Number(g.NORAD_CAT_ID), dateMs);
  if (meta) return meta.prn === null;
  const name = String(g.OBJECT_NAME ?? '').toUpperCase();
  return config.populationRules.retiredGnssNames.some((p) => name.startsWith(p));
}

// Every OMM-only regime's population at a selection date:
// {regime: [{norad, subclass}]}, plus the archive files read.
export function populations(archive, date, gnss) {
  const { byObject, files } = newestOmms(archive, date, config.populationRules.newestWithinDays);
  const dateMs = Date.parse(`${date}T00:00:00Z`) + DAY_MS;
  const out = Object.fromEntries(Object.entries(config.classes).filter(([, c]) => c.kind === 'omm').map(([k]) => [k, []]));
  for (const [norad, g] of [...byObject].sort((a, b) => a[0] - b[0])) {
    const k = classify(g, gnss, dateMs);
    if (k && out[k.regime]) out[k.regime].push({ norad, subclass: k.subclass, objectType: k.objectType ?? g.OBJECT_TYPE });
  }
  return { populations: out, files };
}

// A seeded draw: K objects of a population, each with `perObject` product
// times uniform in [from, to + 1 d), at least minimumGapDays apart (one time
// when the window is shorter than twice the gap).
export function draw(population, K, { from, to }, { perObject, minimumGapDays }, seed) {
  const random = rng(seed);
  const pool = [...population];
  for (let i = pool.length - 1; i > 0; --i) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const lo = Date.parse(`${from}T00:00:00Z`), hi = Date.parse(`${to}T00:00:00Z`) + DAY_MS;
  const n = (hi - lo) >= 2 * minimumGapDays * DAY_MS ? perObject : 1;
  return pool.slice(0, K).map((o) => {
    const times = [];
    for (let guard = 0; times.length < n && guard < 1000; ++guard) {
      const t = lo + Math.floor(random() * (hi - lo));
      if (times.every((u) => Math.abs(u - t) >= minimumGapDays * DAY_MS)) times.push(t);
    }
    return { ...o, times: times.sort((a, b) => a - b) };
  });
}

// A stable seed per (window, regime).
export const seedOf = (window, regime) => {
  let h = config.statistics.bootstrapSeed;
  for (const ch of `${window}/${regime}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};
