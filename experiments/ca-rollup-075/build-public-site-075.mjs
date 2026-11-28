#!/usr/bin/env node
// Build unified SDN-AP 0.7.5 / catalog-builder 0.2.7 public-only-tests-0.7.5.{json,jsonl}
// from runs/ca-rollup-075/public-vectors-075.jsonl + the exact 2,188-test membership/metadata
// of the canonical 8-group precise-orbit public-history benchmark.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const SITE_REF_JSONL = process.env.SDN_SITE_REF_JSONL || path.join(OAE, 'runs/ca-rollup-075/public-only-tests-ref.jsonl');
const VEC_PATH = path.join(OAE, 'runs/ca-rollup-075/public-vectors-075.jsonl');
const OUT_DIR = process.env.SDN_OUT_DIR || path.join(OAE, 'results/ca-rollup-075');
const OUT_SUFFIX = process.env.SDN_OUT_SUFFIX || '0.7.5';
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
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function satClusterShareCi95(active, predFn, seed = 20261126, reps = 1000) {
  const bySat = new Map();
  for (const r of active) {
    if (!bySat.has(r.noradId)) bySat.set(r.noradId, []);
    bySat.get(r.noradId).push(predFn(r) ? 1 : 0);
  }
  const clusters = [...bySat.values()];
  const k = clusters.length;
  if (k < 2) return null;
  const rng = makeRng(seed);
  const draws = [];
  for (let b = 0; b < reps; b++) {
    let hit = 0, tot = 0;
    for (let j = 0; j < k; j++) {
      const cl = clusters[Math.floor(rng() * k)];
      for (let i = 0; i < cl.length; i++) hit += cl[i];
      tot += cl.length;
    }
    draws.push(tot ? hit / tot : 0);
  }
  draws.sort((a, b) => a - b);
  return {
    sats: k,
    reps,
    low95: +draws[Math.floor(0.025 * (reps - 1))].toFixed(4),
    high95: +draws[Math.floor(0.975 * (reps - 1))].toFixed(4),
  };
}
function summarizePerSatellite(rows, dayKey) {
  const active = rows.filter((r) => r.inAggregates && r.days?.[dayKey]);
  const bySat = new Map();
  for (const r of active) {
    if (!bySat.has(r.noradId)) bySat.set(r.noradId, { noradId: r.noradId, objectName: r.objectName, groupKey: r.groupKey, s: [], x: [], w: [] });
    const b = bySat.get(r.noradId);
    b.s.push(r.days[dayKey].sgp4PublicSetM);
    b.x.push(r.days[dayKey].sgp4XpFromPublicSetsM);
    b.w.push(r.days[dayKey].sdnApFromPublicSetsM);
  }
  const list = [];
  for (const b of bySat.values()) {
    const sMed = quantile(b.s, 0.5), xMed = quantile(b.x, 0.5), wMed = quantile(b.w, 0.5);
    list.push({
      noradId: b.noradId,
      objectName: b.objectName,
      groupKey: b.groupKey,
      tests: b.s.length,
      sgp4MedianM: sMed,
      xpMedianM: xMed,
      sdnApMedianM: wMed,
      sdnApBetterThanSgp4: wMed < sMed,
      sdnApBetterThanXp: wMed < xMed,
    });
  }
  list.sort((a, b) => a.noradId - b.noradId);
  return {
    distinctSats: list.length,
    sdnApBetterThanSgp4Sats: list.filter((x) => x.sdnApBetterThanSgp4).length,
    sdnApWorseThanSgp4Sats: list.filter((x) => !x.sdnApBetterThanSgp4).map((x) => ({
      noradId: x.noradId, objectName: x.objectName, tests: x.tests, sgp4MedianM: x.sgp4MedianM, sdnApMedianM: x.sdnApMedianM,
    })),
    satellites: list,
  };
}
function summarizeDay(rows, dayKey) {
  const active = rows.filter((r) => r.inAggregates && r.days?.[dayKey]);
  const n = active.length;
  const sV = active.map((r) => r.days[dayKey].sgp4PublicSetM);
  const xV = active.map((r) => r.days[dayKey].sgp4XpFromPublicSetsM);
  const wV = active.map((r) => r.days[dayKey].sdnApFromPublicSetsM);
  const kmCases = active.filter((r) => r.days[dayKey].sgp4PublicSetM > 1000);
  const perSat = summarizePerSatellite(rows, dayKey);
  return {
    tests: n,
    distinctSats: perSat.distinctSats,
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
    sdnApCloserThanSgp4PublicSet: {
      ...wilson(active.filter((r) => r.days[dayKey].sdnApFromPublicSetsM < r.days[dayKey].sgp4PublicSetM).length, n),
      clusterCi95: satClusterShareCi95(active, (r) => r.days[dayKey].sdnApFromPublicSetsM < r.days[dayKey].sgp4PublicSetM, 100 + Number(dayKey)),
    },
    sdnApCloserThanSgp4XpFromPublicSets: {
      ...wilson(active.filter((r) => r.days[dayKey].sdnApFromPublicSetsM < r.days[dayKey].sgp4XpFromPublicSetsM).length, n),
      clusterCi95: satClusterShareCi95(active, (r) => r.days[dayKey].sdnApFromPublicSetsM < r.days[dayKey].sgp4XpFromPublicSetsM, 200 + Number(dayKey)),
    },
    sgp4XpCloserThanSgp4PublicSet: wilson(active.filter((r) => r.days[dayKey].sgp4XpFromPublicSetsM < r.days[dayKey].sgp4PublicSetM).length, n),
    sdnApWorseBy1kmOrMore: wilson(active.filter((r) => r.days[dayKey].sdnApFromPublicSetsM - r.days[dayKey].sgp4PublicSetM >= 1000).length, n),
    perSatellite: perSat,
  };
}

// Load 0.7.5 vectors keyed by norad|startDate
const vecMap = new Map();
for (const line of fs.readFileSync(VEC_PATH, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  vecMap.set(`${r.norad}|${r.startUtc.slice(0, 10)}`, r);
}

const refRows = fs.readFileSync(SITE_REF_JSONL, 'utf8').trim().split('\n').map(JSON.parse);
const outRows = [];
let matched = 0;
const excludedCounts = {};
const excludedFaults = [];
for (const ref of refRows) {
  if (!ref.inAggregates) {
    const why = ref.excludedBecause || 'excluded';
    excludedCounts[why] = (excludedCounts[why] || 0) + 1;
    outRows.push(ref);
    continue;
  }
  const v = vecMap.get(`${ref.noradId}|${ref.startUtc.slice(0, 10)}`);
  if (!v) throw new Error(`Missing 0.7.5 vector for ${ref.groupKey} ${ref.noradId} ${ref.startUtc}`);
  const days = {};
  for (const d of ['1', '2', '3', '4', '5']) {
    if (!ref.days?.[d]) continue;
    const vd = v.days?.[d];
    if (!vd) throw new Error(`Missing day ${d} for ${ref.noradId} ${ref.startUtc}`);
    days[d] = {
      sgp4PublicSetM: +(vd.rmsKm.S * 1000).toFixed(3),
      sgp4XpFromPublicSetsM: +(vd.rmsKm.X * 1000).toFixed(3),
      sdnApFromPublicSetsM: +(vd.rmsKm.O * 1000).toFixed(3),
    };
  }
  // Pass condition 3.7: resolve or exclude any test exceeding 100 km on day 1 on every side before aggregation.
  const d1 = days['1'];
  if (d1 && d1.sgp4PublicSetM > 100000 && d1.sgp4XpFromPublicSetsM > 100000 && d1.sdnApFromPublicSetsM > 100000) {
    const why = 'day1-fault-over-100km-all-sides';
    excludedCounts[why] = (excludedCounts[why] || 0) + 1;
    excludedFaults.push({
      noradId: ref.noradId,
      objectName: ref.objectName,
      groupKey: ref.groupKey,
      group: ref.group,
      startUtc: ref.startUtc,
      reason: why,
      day1M: d1,
    });
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
      inAggregates: false,
      excludedBecause: why,
      days,
    });
    continue;
  }
  matched++;
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

const MIN_SATS_MEASURED = 5;
const byGroup = [];
const measuredGroupKeys = new Set();
for (const [gk, gname] of GROUP_ORDER) {
  const sub = outRows.filter((r) => r.group === gname);
  const distinctSats = new Set(sub.filter((r) => r.inAggregates).map((r) => r.noradId)).size;
  const measured = distinctSats >= MIN_SATS_MEASURED;
  if (measured) measuredGroupKeys.add(gk);
  const gdays = {};
  for (const d of ['1', '2', '3', '4', '5']) gdays[d] = summarizeDay(sub, d);
  byGroup.push({
    group: gname,
    groupKey: gk,
    distinctSats,
    status: measured ? 'measured' : `not measured (fewer than ${MIN_SATS_MEASURED} distinct satellites: ${distinctSats})`,
    tests: sub.length,
    inAggregates: sub.filter((r) => r.inAggregates).length,
    days: gdays,
  });
}

// Totals strictly across groups meeting the >= 5 distinct satellite floor (7 groups; S1 with 2 satellites excluded as not measured).
const measuredRows = outRows.filter((r) => measuredGroupKeys.has(r.groupKey));
const totals = {};
const totalsAllGroupsIncludingUnmeasured = {};
for (const d of ['1', '2', '3', '4', '5']) {
  totals[d] = summarizeDay(measuredRows, d);
  totalsAllGroupsIncludingUnmeasured[d] = summarizeDay(outRows, d);
}

const apWasm = path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
const cbChain = path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm');
const cbCtrl = path.join(MODULES, 'flows/catalog-builder/dist/flow/control/dist/isomorphic/module.wasm');
const apVersion = process.env.SDN_AP_VERSION || JSON.parse(fs.readFileSync(path.join(MODULES, 'propagator/sdn-ap/package.json'), 'utf8')).version;
const cbVersion = process.env.SDN_CB_VERSION || JSON.parse(fs.readFileSync(path.join(MODULES, 'flows/catalog-builder/package.json'), 'utf8')).version;

const summary = {
  schema: 'sdn-ap-site-public-only-tests-1',
  version: apVersion,
  measurement: `The public-sets-only measurement on SDN-AP ${apVersion} and catalog-builder ${cbVersion}: ${outRows.length.toLocaleString('en-US')} tests (${matched.toLocaleString('en-US')} in aggregates), zero SGP4 fallbacks`,
  writtenUtc: new Date().toISOString(),
  what: 'For objects with only public element sets: on each test (one satellite, one start time), the error against the satellite\'s precise orbit of (1) SGP4 flown from the newest public element set, (2) SGP4-XP made from the public element sets, (3) SDN-AP made from the public element sets by the catalog builder. All three start from the same public element sets issued before the start and nothing else.',
  inputs: 'Public element sets: every Space-Track set of the satellite created at or before the start and with its epoch before the start, created in the 21 days before the start (read from the local archive of Space-Track gp_history; nothing fetched). SGP4 flies the newest of them (none older than 3 days before the start). SDN-AP: the catalog builder is given those sets as its only orbit data, its clock at the start, and the space weather as it was issued at the start; it makes one record, the one the catalog would serve. SGP4-XP: the SGP4-XP set made from that record the way the whole-catalog SGP4-XP sets are made, so it also comes from the public sets alone.',
  outputs: 'Per test and day after the start (days 1 to 5): the 3-D position error in meters, the root mean square over the 24 hours that end at that day, against the precise orbit on its 300 s grid (a day counts when the orbit covers 90 % of it).',
  method: 'The tests are the windows of the SDN-AP accuracy table\'s 72 h rows (its eight groups with a NORAD number) that start from 2022-01-22 on (the archive\'s gp_history begins 2022-01-01); truth reader, scored epochs and scorer are the table\'s own (orbit-accuracy-experiments experiments/headline-loop). A test is in the aggregates when it has a 72 h truth arc before the start (the table\'s membership rule), a public set no more than 3 days before the start, passes the look-ahead check, and all three sides answered.',
  accuracy: 'Counts are exact over these tests. Shares carry 95 % Wilson score intervals (z = 1.96), each test counted as independent; tests of one satellite at different start dates are not fully independent, so the intervals are narrower than a satellite-level resampling would give. The truth orbits are accurate to centimeters to decimeters (laser and navigation orbits), far below the kilometer limits counted here.',
  builds: {
    catalogBuilder: {
      version: cbVersion,
      controlSha256: sha256(cbCtrl),
      chainSha256: sha256(cbChain),
      note: `flows/catalog-builder ${cbVersion} (causal weather-contrast guard + short-arc disturbed-ephemeris protection + all-regime empirical covariance, zero SGP4 fallbacks)`,
    },
    sdnApModuleFlown: {
      version: apVersion,
      sha256: sha256(apWasm),
      note: `propagator/sdn-ap ${apVersion} signed isomorphic module; every AP and SGP4-XP record was flown on it`,
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
    inMeasuredGroupAggregates: measuredRows.filter((r) => r.inAggregates).length,
    measuredGroupCount: measuredGroupKeys.size,
    unmeasuredGroups: byGroup.filter((g) => g.distinctSats < MIN_SATS_MEASURED).map((g) => ({ groupKey: g.groupKey, group: g.group, distinctSats: g.distinctSats, status: g.status })),
    excluded: excludedCounts,
    excludedFaults,
  },
  totals,
  totalsAllGroupsIncludingUnmeasured,
  byGroup,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = path.join(OUT_DIR, `public-only-tests-${OUT_SUFFIX}.json`);
const jsonlPath = path.join(OUT_DIR, `public-only-tests-${OUT_SUFFIX}.jsonl`);
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 1) + '\n');
fs.writeFileSync(jsonlPath, outRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`WROTE ${jsonPath} & ${jsonlPath}`);
console.log('Day 1:', JSON.stringify({ n: totals['1'].tests, s: totals['1'].sgp4PublicSet.medianM, w: totals['1'].sdnApFromPublicSets.medianM, closer: totals['1'].sdnApCloserThanSgp4PublicSet.share, worse1k: totals['1'].sdnApWorseBy1kmOrMore.count }));
console.log('Day 5:', JSON.stringify({ n: totals['5'].tests, s: totals['5'].sgp4PublicSet.medianM, w: totals['5'].sdnApFromPublicSets.medianM, p95: totals['5'].sdnApFromPublicSets.p95M, closer: totals['5'].sdnApCloserThanSgp4PublicSet.share, worse1k: totals['5'].sdnApWorseBy1kmOrMore.count }));
console.log('Strong drag Day 5:', JSON.stringify(byGroup.find((g) => g.groupKey === 'P').days['5'].sdnApWorseBy1kmOrMore));
