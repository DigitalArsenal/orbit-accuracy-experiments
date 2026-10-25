// Step 1: the Starlink population. Reads operator-capture's derived products of one complete cycle (mean elements and
// drag work over the first 8 h; no ephemerides) and selects the stratified sample by the registered rule.
// Output: <store>/population-queue.json (every member in draw order, local) and
// results/sdn-gp-starlink-ffm-match/population.json (the seats: NORAD, stratum, tercile; no element data).
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, frozen, store, results, write, sha256 } from './common.mjs';

const EARTH_RADIUS_KM = 6378.137; // the capture's own altitude convention (a - R_earth), used only to name shells
const P = config.population;

export function features(cycleDir) {
  const rows = [];
  for (const name of fs.readdirSync(cycleDir)) {
    if (!/^\d+\.json\.gz$/.test(name)) continue;
    const product = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(cycleDir, name))));
    const s = product.samples;
    if (!s || s.length < P.minimumSamples) continue;
    const altitudeKm = s.reduce((sum, x) => sum + x.meanElements[0], 0) / s.length - EARTH_RADIUS_KM;
    if (altitudeKm < P.minimumAltitudeKm) continue;
    rows.push({ norad: product.source.norad, altitudeKm, inclinationDeg: s[0].meanElements[2], dragExposureJkg: -s[s.length - 1].cumulativeDragWorkB1Jkg, startUtc: product.source.startUtc, createdUtc: product.source.createdUtc });
  }
  return rows.sort((a, b) => a.norad - b.norad);
}

const band = (value, edges) => edges.findIndex((e) => value < e) === -1 ? edges.length : edges.findIndex((e) => value < e);
export const stratumKey = (r) => `alt${band(r.altitudeKm, P.altitudeBandsKm)}-inc${band(r.inclinationDeg, P.inclinationGroupsDeg)}`;
const drawKey = (norad) => crypto.createHash('sha256').update(`${config.salt}:${norad}`).digest('hex');

/** Seats by square-root population weight divided by (seats+1), capped at population, lexical ties. */
export function allocate(populations, total) {
  const seats = Object.fromEntries(Object.keys(populations).map((k) => [k, 0]));
  for (let n = 0; n < total; n += 1) {
    let best = null;
    for (const key of Object.keys(populations).sort()) {
      if (seats[key] >= populations[key]) continue;
      const score = Math.sqrt(populations[key]) / (seats[key] + 1);
      if (best === null || score > best.score) best = { key, score };
    }
    if (!best) break;
    seats[best.key] += 1;
  }
  return seats;
}

/** Terciles by drag exposure inside a stratum; seats shared equally, the remainder to the highest terciles, capped at population. */
export function split(members, seats) {
  const sorted = members.slice().sort((a, b) => a.dragExposureJkg - b.dragExposureJkg || a.norad - b.norad);
  const k = P.dragTerciles;
  const groups = Array.from({ length: k }, (_, g) => sorted.filter((_, i) => Math.floor((i * k) / sorted.length) === g));
  const give = groups.map(() => Math.floor(seats / k));
  for (let r = 0; r < seats - give.reduce((a, b) => a + b, 0); r += 1) give[k - 1 - r] += 1;
  for (let pass = 0; pass < k; pass += 1) { // overflow from a small tercile to the others
    for (let g = k - 1; g >= 0; g -= 1) {
      const over = give[g] - groups[g].length;
      if (over > 0) { give[g] -= over; const to = (g === k - 1 ? k - 2 : k - 1); if (to >= 0) give[to] += over; }
    }
  }
  return groups.map((g, i) => ({ tercile: i, seats: Math.min(give[i], g.length), members: g.sort((a, b) => (drawKey(a.norad) < drawKey(b.norad) ? -1 : 1)) }));
}

export function select(rows, total = P.sampleSize) {
  const byStratum = {};
  for (const r of rows) (byStratum[stratumKey(r)] ??= []).push(r);
  const seats = allocate(Object.fromEntries(Object.entries(byStratum).map(([k, v]) => [k, v.length])), total);
  const queue = [];
  for (const key of Object.keys(byStratum).sort()) {
    for (const t of split(byStratum[key], seats[key])) {
      t.members.forEach((m, index) => queue.push({ norad: m.norad, stratum: key, tercile: t.tercile, rank: index, seat: index < t.seats, altitudeKm: m.altitudeKm, inclinationDeg: m.inclinationDeg, dragExposureJkg: m.dragExposureJkg }));
    }
  }
  return { seats, queue };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  frozen();
  const cycleDir = path.join(config.archive, 'operator-capture/cycles', config.cycle);
  const summary = JSON.parse(fs.readFileSync(path.join(cycleDir, 'summary.json')));
  if (summary.status !== 'complete') throw new Error(`cycle ${config.cycle} is not complete`);
  const rows = features(cycleDir);
  const { seats, queue } = select(rows);
  const chosen = queue.filter((q) => q.seat);
  write(path.join(store, 'population-queue.json'), { cycle: config.cycle, queue });
  write(path.join(results, 'population.json'), {
    cycle: config.cycle, cycleSubsetSha256: summary.subsetSha256, candidates: rows.length, salt: config.salt, seatsTotal: chosen.length,
    seatsByStratum: seats, edges: { altitudeBandsKm: P.altitudeBandsKm, inclinationGroupsDeg: P.inclinationGroupsDeg },
    seats: chosen.map(({ norad, stratum, tercile }) => ({ norad, stratum, tercile })),
    queueSha256: sha256(JSON.stringify(queue.map((q) => [q.norad, q.stratum, q.tercile, q.rank]))),
  });
  console.log(`candidates ${rows.length}; strata ${Object.keys(seats).length}; seats ${chosen.length}`);
  console.log(JSON.stringify(seats));
}
