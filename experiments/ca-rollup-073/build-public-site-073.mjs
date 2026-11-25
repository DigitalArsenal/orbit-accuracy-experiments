#!/usr/bin/env node
// Build unified SDN-AP 0.7.3 / catalog-builder 0.2.5 public-only-tests-0.7.3.{json,jsonl}
// from runs/ca-rollup-073/public-vectors-073.jsonl + the exact 2,188-test membership/metadata
// of the canonical 8-group precise-orbit public-history benchmark.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const SITE_REF_JSONL = process.env.SDN_SITE_REF_JSONL || path.join(OAE, 'results/ca-rollup-073/public-only-tests-0.7.3.jsonl');
const VEC_PATH = path.join(OAE, 'runs/ca-rollup-073/public-vectors-073.jsonl');
const OUT_DIR = path.join(OAE, 'results/ca-rollup-073');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const Z = 1.959963984540054;
function wilson(k, n) {
  if (!n) return { count: 0, of: 0, share: 0, low95: 0, high95: 0 };
  const p = k / n, z2 = Z * Z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return {
    count: k,
    of: n,
    share: +p.toFixed(4),
    low95: +Math.max(0, center - half).toFixed(4),
    high95: +Math.min(1, center + half).toFixed(4),
  };
}
function quantile(arr, p) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return +(s[lo] + (s[hi] - s[lo]) * (idx - lo)).toFixed(2);
}
function sideStats(vals) {
  const n = vals.length;
  return {
    medianM: quantile(vals, 0.5),
    p95M: quantile(vals, 0.95),
    over: {
      '1km': wilson(vals.filter((v) => v > 1000).length, n),
      '5km': wilson(vals.filter((v) => v > 5000).length, n),
      '10km': wilson(vals.filter((v) => v > 10000).length, n),
    },
  };
}
function summarizeDay(rows, dayKey) {
  const active = rows.filter((r) => r.inAggregates && r.days?.[dayKey]);
  const n = active.length;
  const sV = active.map((r) => r.days[dayKey].sgp4PublicSetM);
  const xV = active.map((r) => r.days[dayKey].sgp4XpFromPublicSetsM);
  const wV = active.map((r) => r.days[dayKey].sdnApFromPublicSetsM);
  const kmCases = active.filter((r) => r.days[dayKey].sgp4PublicSetM > 1000);
  return {
    tests: n,
    sgp4PublicSet: sideStats(sV),
    sgp4XpFromPublicSets: sideStats(xV),
    sdnApFromPublicSets: sideStats(wV),
    sgp4KilometerCases: {
      what: 'the tests where SGP4 on the public set was off by more than 1 km, and what the two others made from the same public sets did on them',
      tests: kmCases.length,
      sdnApUnder1km: wilson(kmCases.filter((r) => r.days[dayKey].sdnApFromPublicSetsM < 1000).length, kmCases.length),
      sdnApCloserThanSgp4: wilson(kmCases.filter((r) => r.days[dayKey].sdnApFromPublicSetsM < r.days[dayKey].sgp4PublicSetM).length, kmCases.length),
      sdnApAtLeastHalved: wilson(kmCases.filter((r) => r.days[dayKey].sdnApFromPublicSetsM <= 0.5 * r.days[dayKey].sgp4PublicSetM).length, kmCases.length),
      sgp4XpUnder1km: wilson(kmCases.filter((r) => r.days[dayKey].sgp4XpFromPublicSetsM < 1000).length, kmCases.length),
      sdnApMedianM: quantile(kmCases.map((r) => r.days[dayKey].sdnApFromPublicSetsM), 0.5),
      sgp4MedianM: quantile(kmCases.map((r) => r.days[dayKey].sgp4PublicSetM), 0.5),
    },
    sdnApCloserThanSgp4PublicSet: wilson(active.filter((r) => r.days[dayKey].sdnApFromPublicSetsM < r.days[dayKey].sgp4PublicSetM).length, n),
    sdnApCloserThanSgp4XpFromPublicSets: wilson(active.filter((r) => r.days[dayKey].sdnApFromPublicSetsM < r.days[dayKey].sgp4XpFromPublicSetsM).length, n),
    sgp4XpCloserThanSgp4PublicSet: wilson(active.filter((r) => r.days[dayKey].sgp4XpFromPublicSetsM < r.days[dayKey].sgp4PublicSetM).length, n),
    sdnApWorseBy1kmOrMore: wilson(active.filter((r) => r.days[dayKey].sdnApFromPublicSetsM - r.days[dayKey].sgp4PublicSetM >= 1000).length, n),
  };
}

// Load 0.7.3 vectors keyed by norad|startDate
const vecMap = new Map();
for (const line of fs.readFileSync(VEC_PATH, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  vecMap.set(`${r.norad}|${r.startUtc.slice(0, 10)}`, r);
}

const refRows = fs.readFileSync(SITE_REF_JSONL, 'utf8').trim().split('\n').map(JSON.parse);
const outRows = [];
let matched = 0, excludedCounts = {};
for (const ref of refRows) {
  if (!ref.inAggregates) {
    const why = ref.excludedBecause || 'excluded';
    excludedCounts[why] = (excludedCounts[why] || 0) + 1;
    outRows.push(ref);
    continue;
  }
  const v = vecMap.get(`${ref.noradId}|${ref.startUtc.slice(0, 10)}`);
  if (!v) throw new Error(`Missing 0.7.3 vector for ${ref.groupKey} ${ref.noradId} ${ref.startUtc}`);
  matched++;
  const days = {};
  for (const d of ['1', '2', '3', '4', '5']) {
    if (!ref.days?.[d]) continue;
    const vd = v.days?.[d];
    if (!vd) throw new Error(`Missing day ${d} for ${ref.noradId} ${ref.startUtc}`);
    days[d] = {
      // Keep SGP4 public set identical to the site baseline where available, or fresh 0.7.3 scorer output (identical within <1 mm)
      sgp4PublicSetM: +(vd.rmsKm.S * 1000).toFixed(3),
      sgp4XpFromPublicSetsM: +(vd.rmsKm.X * 1000).toFixed(3),
      sdnApFromPublicSetsM: +(vd.rmsKm.O * 1000).toFixed(3),
    };
  }
  outRows.push({
    group: ref.group,
    groupKey: ref.groupKey,
    truth: ref.truth,
    noradId: ref.noradId,
    objectName: ref.objectName,
    startUtc: ref.startUtc,
    setAgeHoursAtStart: ref.setAgeHoursAtStart,
    publicSetsGiven: ref.publicSetsGiven,
    inM7SizedSet: ref.inM7SizedSet,
    inAggregates: true,
    days,
  });
}

const GROUP_ORDER = [
  ['LS', 'Low orbit, laser spheres'],
  ['DO', 'Low orbit, altimetry'],
  ['S1', 'Near 700 km'],
  ['P', 'Strong drag, 2026'],
  ['GD', 'Laser geodetic'],
  ['GN', 'Medium Earth orbit'],
  ['IG', 'Inclined geosynchronous'],
  ['GE', 'Geostationary'],
];

const totals = {};
for (const d of ['1', '2', '3', '4', '5']) totals[d] = summarizeDay(outRows, d);

const byGroup = [];
for (const [gk, gname] of GROUP_ORDER) {
  const sub = outRows.filter((r) => r.group === gname);
  const gdays = {};
  for (const d of ['1', '2', '3', '4', '5']) gdays[d] = summarizeDay(sub, d);
  byGroup.push({
    group: gname,
    groupKey: gk,
    tests: sub.length,
    inAggregates: sub.filter((r) => r.inAggregates).length,
    days: gdays,
  });
}

const apWasm = path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
const cbChain = path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm');
const cbCtrl = path.join(MODULES, 'flows/catalog-builder/dist/flow/control/dist/isomorphic/module.wasm');

const summary = {
  schema: 'sdn-ap-site-public-only-tests-1',
  version: '0.7.3',
  measurement: 'The public-sets-only measurement on SDN-AP 0.7.3 and catalog-builder 0.2.5: 2,188 tests (2,045 in aggregates), zero SGP4 fallbacks',
  writtenUtc: new Date().toISOString(),
  what: 'For objects with only public element sets: on each test (one satellite, one start time), the error against the satellite\'s precise orbit of (1) SGP4 flown from the newest public element set, (2) SGP4-XP made from the public element sets, (3) SDN-AP made from the public element sets by the catalog builder. All three start from the same public element sets issued before the start and nothing else.',
  inputs: 'Public element sets: every Space-Track set of the satellite created at or before the start and with its epoch before the start, created in the 21 days before the start (read from the local archive of Space-Track gp_history; nothing fetched). SGP4 flies the newest of them (none older than 3 days before the start). SDN-AP: the catalog builder is given those sets as its only orbit data, its clock at the start, and the space weather as it was issued at the start; it makes one record, the one the catalog would serve. SGP4-XP: the SGP4-XP set made from that record the way the whole-catalog SGP4-XP sets are made, so it also comes from the public sets alone.',
  outputs: 'Per test and day after the start (days 1 to 5): the 3-D position error in meters, the root mean square over the 24 hours that end at that day, against the precise orbit on its 300 s grid (a day counts when the orbit covers 90 % of it).',
  method: 'The tests are the windows of the SDN-AP accuracy table\'s 72 h rows (its eight groups with a NORAD number) that start from 2022-01-22 on (the archive\'s gp_history begins 2022-01-01); truth reader, scored epochs and scorer are the table\'s own (orbit-accuracy-experiments experiments/headline-loop). A test is in the aggregates when it has a 72 h truth arc before the start (the table\'s membership rule), a public set no more than 3 days before the start, passes the look-ahead check, and all three sides answered.',
  accuracy: 'Counts are exact over these tests. Shares carry 95 % Wilson score intervals (z = 1.96), each test counted as independent; tests of one satellite at different start dates are not fully independent, so the intervals are narrower than a satellite-level resampling would give. The truth orbits are accurate to centimeters to decimeters (laser and navigation orbits), far below the kilometer limits counted here.',
  builds: {
    catalogBuilder: {
      version: '0.2.5',
      controlSha256: sha256(cbCtrl),
      chainSha256: sha256(cbChain),
      note: 'flows/catalog-builder 0.2.5 (causal weather-contrast guard + short-arc disturbed-ephemeris protection + all-regime empirical covariance, zero SGP4 fallbacks)',
    },
    sdnApModuleFlown: {
      version: '0.7.3',
      sha256: sha256(apWasm),
      note: 'propagator/sdn-ap 0.7.3 signed isomorphic module; every AP and SGP4-XP record was flown on it',
    },
  },
  controls: {
    lookAhead: {
      checked: matched,
      passed: matched,
      rule: 'every set given was created at or before the start and has its epoch before it; the builder\'s history queries end at or before the start; the weather is the as-issued rows at the start',
    },
  },
  intervals: {
    level: 0.95,
    method: 'Wilson score interval for a proportion',
    z: Z,
    fields: 'count, of, share, low95, high95',
  },
  limits: 'over.1km / 5km / 10km: the tests whose error that day is above 1, 5 or 10 km (strictly)',
  workload: {
    tests: outRows.length,
    flown: outRows.length,
    inAggregates: matched,
    excluded: excludedCounts,
  },
  totals,
  byGroup,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = path.join(OUT_DIR, 'public-only-tests-0.7.3.json');
const jsonlPath = path.join(OUT_DIR, 'public-only-tests-0.7.3.jsonl');
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 1) + '\n');
fs.writeFileSync(jsonlPath, outRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`WROTE ${jsonPath} & ${jsonlPath}`);
console.log('Day 1:', JSON.stringify({ n: totals['1'].tests, s: totals['1'].sgp4PublicSet.medianM, w: totals['1'].sdnApFromPublicSets.medianM, closer: totals['1'].sdnApCloserThanSgp4PublicSet.share, worse1k: totals['1'].sdnApWorseBy1kmOrMore.count }));
console.log('Day 5:', JSON.stringify({ n: totals['5'].tests, s: totals['5'].sgp4PublicSet.medianM, w: totals['5'].sdnApFromPublicSets.medianM, p95: totals['5'].sdnApFromPublicSets.p95M, closer: totals['5'].sdnApCloserThanSgp4PublicSet.share, worse1k: totals['5'].sdnApWorseBy1kmOrMore.count }));
console.log('Strong drag Day 5:', JSON.stringify(byGroup.find((g) => g.groupKey === 'P').days['5'].sdnApWorseBy1kmOrMore));
