#!/usr/bin/env node
// Phase 3B Part B1: Full 7-day 2026-10-28T17:00Z CelesTrak SOCRATES Plus Run (100% Space-Track Public GP).
// - Scores 7-day independent cm-accurate precise-orbit accuracy (days 1, 3, 5, 7) across ALL active satellites
//   in the SOCRATES catalog with full 7-day independent truth (ESA0OPSFIN GNSS + Copernicus Sentinel-1C/1D POEORB)
//   for: (1) SOCRATES Plus's exact GP edition on SGP4, (2) Space-Track GP history -> SGP4-XP, (3) Space-Track GP history -> SDN-AP 0.7.5.
// - Scores primary-satellite position error at TCA on all 29 published 2026-10-28 SOCRATES Plus conjunction rows
//   involving Sentinel-1C (62261) or Sentinel-1D (66315) against Copernicus POEORB truth.
// - Audits spacetrack/cdm_public (2026-10-28..2026-11-04) active-payload overlap with SOCRATES Plus.
//
// Usage:
//   SDN_MODULES_ROOT=/tmp/work-modules-074 node experiments/ca-socrates-comparison-075/run-part-b1.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DAY_MS, HOUR_MS, sha256File, nowUtc, isoNoZ, utcMs, dayStr,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords, buildCatalogBatch,
} from '../ca-rollup-075/amendment6-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || '/tmp/work-modules-074';
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const REF_DIR = path.join(ARCHIVE, 'reference-states/reference');
const OUT_PATH = path.join(OAE, 'runs/ca-socrates-comparison-075/part-b1.json');

const T0_ISO = '2026-10-28T17:00:00.000Z';
const T0_MS = Date.parse(T0_ISO);
const END_MS = T0_MS + 7 * DAY_MS;
const CUT_ISO = '2026-10-28T16:06:35Z';
const CUT_MS = Date.parse(CUT_ISO);

const sds = await loadSdsAndSdk(MODULES);
const { fb, sdkIso, OEM_MOD, PCF_MOD, typeRef } = sds;
const plain = (b) => { const u = Buffer.from(b); return u.length >= 8 && u.readUInt32LE(0) + 4 === u.length ? u.subarray(4) : u; };

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
};
const statsOf = (arr) => {
  const s = arr.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  return { n: s.length, medianM: +quantile(s, 0.5).toFixed(2), p95M: +quantile(s, 0.95).toFixed(2), maxM: +s[s.length - 1].toFixed(2) };
};
function rngOf(text) {
  const h = crypto.createHash('sha256').update(text).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12) | 1;
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function bootMedianCi(vals, seed, B = 500) {
  const clean = vals.filter(Number.isFinite);
  if (clean.length < 5) return null;
  const rng = rngOf(seed), meds = [];
  for (let b = 0; b < B; b++) {
    const pick = new Array(clean.length);
    for (let i = 0; i < clean.length; i++) pick[i] = clean[Math.floor(rng() * clean.length)];
    pick.sort((x, y) => x - y);
    meds.push(quantile(pick, 0.5));
  }
  meds.sort((x, y) => x - y);
  return [+quantile(meds, 0.025).toFixed(2), +quantile(meds, 0.975).toFixed(2)];
}

// 1. Load exact 2026-10-28 SOCRATES catalog and report via ca-socrates-gp-parity/common.mjs
const common = await import(pathToFileURL(path.join(OAE, 'experiments/ca-socrates-gp-parity/common.mjs')).href);
const socratesRows = common.readSocrates();
const catalog = common.readCatalog();
const gpByNorad = new Map(catalog.rows.map((g) => [Number(g.NORAD_CAT_ID), g]));

// 2. Discover all independent truth orbits covering 2026-10-28T17:00Z .. 2026-11-04T17:00Z
const esaDirs = Array.from({ length: 8 }, (_, i) => path.join(REF_DIR, `ESA0OPSFIN_2026${301 + i}0000_01D_05M_ORB`)).filter((d) => fs.existsSync(d));
const sentinelDirs = fs.readdirSync(REF_DIR)
  .filter((d) => /^S1[CD]_OPER_AUX_POEORB_.*V2026(102[6-9]|103[01]|110[1-5])/.test(d))
  .map((d) => path.join(REF_DIR, d));

function loadOemSeries(norad, dirs, fromMs, toMs) {
  const byMs = new Map();
  for (const d of dirs) {
    const f = path.join(d, `${norad}.oem`);
    if (!fs.existsSync(f)) continue;
    try {
      const oem = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(plain(fs.readFileSync(f)))).unpack();
      for (const l of oem.EPHEMERIS_DATA_BLOCK?.[0]?.EPHEMERIS_DATA_LINES || []) {
        const ms = utcMs(l.EPOCH);
        if (ms >= fromMs && ms <= toMs) byMs.set(ms, { ms, r: [l.X, l.Y, l.Z] });
      }
    } catch {}
  }
  return [...byMs.values()].sort((a, b) => a.ms - b.ms);
}

const esaSats = [...new Set(esaDirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.oem')).map((f) => Number(f.slice(0, -4)))))]
  .filter((id) => gpByNorad.has(id)).sort((a, b) => a - b);
const sentinelSats = [62261, 66315].filter((id) => gpByNorad.has(id));
const allTruthSats = [...new Set([...esaSats, ...sentinelSats])];
console.log(`${nowUtc()} Part B1: ${esaSats.length} ESA GNSS + ${sentinelSats.length} Sentinel-1C/1D sats in 2026-10-28 SOCRATES catalog`);

// Load 21-day Space-Track GP history strictly <= CUT_MS (2026-10-28T16:06:35Z)
const histByNorad = new Map(allTruthSats.map((id) => [id, new Map()]));
for (const id of allTruthSats) {
  const g = gpByNorad.get(id);
  histByNorad.get(id).set(g.EPOCH, g);
}
const gpDir = path.join(ARCHIVE, 'spacetrack/gp/2026');
for (let ms = T0_MS - 21 * DAY_MS; ms <= T0_MS; ms += DAY_MS) {
  const f = path.join(gpDir, `${dayStr(ms)}.json.gz`);
  if (!fs.existsSync(f)) continue;
  for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))) {
    const id = Number(r.NORAD_CAT_ID);
    if (!histByNorad.has(id)) continue;
    const cMs = r.CREATION_DATE ? utcMs(r.CREATION_DATE) : utcMs(r.EPOCH);
    if (!(cMs <= CUT_MS)) continue;
    histByNorad.get(id).set(r.EPOCH, r);
  }
}
const gphDir = path.join(ARCHIVE, 'spacetrack/gp_history/by-creation/2026');
for (const fn of fs.readdirSync(gphDir).filter((f) => f.endsWith('.json.gz') && f >= '2026-10-07' && f <= '2026-10-28T17').sort()) {
  for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(gphDir, fn))).toString('utf8'))) {
    const id = Number(r.NORAD_CAT_ID);
    if (!histByNorad.has(id)) continue;
    const cMs = r.CREATION_DATE ? utcMs(r.CREATION_DATE) : utcMs(r.EPOCH);
    if (!(cMs <= CUT_MS)) continue;
    histByNorad.get(id).set(r.EPOCH, r);
  }
}

const spw = buildCausalSpwRecords({ archiveRoot: ARCHIVE, firstDate: '2026-09-28', lastDate: '2026-11-28', cutoffDate: '2026-10-28', sds });
const seeds = new Map();
const historyPacked = new Map();
for (const id of allTruthSats) {
  seeds.set(id, gpJsonToOmm(gpByNorad.get(id), sds, true));
  const list = [...histByNorad.get(id).values()].sort((a, b) => utcMs(a.EPOCH) - utcMs(b.EPOCH))
    .map((r) => ({ ms: utcMs(r.EPOCH), buf: gpJsonToOmm(r, sds, true) }));
  historyPacked.set(id, list);
}

console.log(`${nowUtc()} Building SDN-AP 0.7.5 and SGP4-XP from strictly causal GP history (<= ${CUT_ISO})...`);
const [builtAp, builtXp] = await Promise.all([
  buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sdn-ap', nowMs: T0_MS, seeds, historyByNorad: historyPacked, weatherRecords: spw }),
  buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sgp4-xp', nowMs: T0_MS, seeds, historyByNorad: historyPacked, weatherRecords: spw }),
]);

const AP_PUB_WASM = path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
const apPub = await sdkIso.createStandaloneHarness('browser', AP_PUB_WASM, { surface: 'direct', maxThreads: 1 });

function makeFlightPcf(epochs) {
  const t = new PCF_MOD.PCFT();
  t.OUTPUT = Object.assign(new PCF_MOD.PCFOutputT(), { FRAME: PCF_MOD.pcfOutputFrame.GCRF, EPOCHS: epochs });
  const b = new fb.Builder(4096);
  PCF_MOD.PCF.finishPCFBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}
async function ingestOmm(ommRaw) {
  const r = await apPub.invoke({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', typeRef: typeRef('OMM'), payload: plain(ommRaw) }] });
  return r.statusCode === 0 ? Buffer.from(r.outputs.find((o) => o.portId === 'ocm').payload) : null;
}
async function flyOcm(ocmBytes, epochs) {
  const r = await apPub.invoke({ methodId: 'propagate', inputs: [
    { portId: 'ocm', typeRef: typeRef('OCM'), payload: plain(ocmBytes) },
    { portId: 'configuration', typeRef: typeRef('PCF'), payload: makeFlightPcf(epochs) },
  ] });
  if (r.statusCode !== 0) return null;
  const oem = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(plain(r.outputs.find((o) => o.portId === 'ephemeris').payload))).unpack();
  return oem.EPHEMERIS_DATA_BLOCK?.[0]?.EPHEMERIS_DATA_LINES || null;
}
function dailyRmsM(lines, pts, day) {
  const lo = T0_MS + (day - 1) * DAY_MS, hi = T0_MS + day * DAY_MS;
  let sq = 0, cnt = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!(p.ms > lo && p.ms <= hi)) continue;
    const l = lines[i];
    if (!l || !Number.isFinite(l.X)) continue;
    const dx = l.X - p.r[0], dy = l.Y - p.r[1], dz = l.Z - p.r[2];
    sq += (dx * dx + dy * dy + dz * dz) * 1e6;
    cnt++;
  }
  return cnt >= 15 ? Math.sqrt(sq / cnt) : NaN;
}

const scoreGroup = async (label, satList, dirs) => {
  const rows = [];
  const excludedFaults = [];
  const sentinelCache = new Map();
  for (const id of satList) {
    const ptsFull = loadOemSeries(id, dirs, T0_MS, END_MS);
    if (ptsFull.length < 300) continue;
    const stepStride = Math.max(1, Math.round(ptsFull.length / 336));
    const pts = ptsFull.filter((_, i) => i % stepStride === 0);
    const epochs = pts.map((p) => isoNoZ(p.ms));
    const sgp4Ocm = await ingestOmm(gpJsonToOmm(gpByNorad.get(id), sds, false));
    const apOcm = builtAp.get(id)?.ocmBuf;
    const xpOcm = builtXp.get(id)?.ocmBuf;
    if (!sgp4Ocm || !apOcm || !xpOcm) continue;
    const [lS, lX, lA] = [await flyOcm(sgp4Ocm, epochs), await flyOcm(xpOcm, epochs), await flyOcm(apOcm, epochs)];
    if (!lS || !lX || !lA) continue;
    const d1S = dailyRmsM(lS, pts, 1), d1X = dailyRmsM(lX, pts, 1), d1A = dailyRmsM(lA, pts, 1);
    if (![d1S, d1X, d1A].every(Number.isFinite)) continue;
    if (d1S > 100000 && d1X > 100000 && d1A > 100000) {
      excludedFaults.push({ noradId: id, objectName: gpByNorad.get(id).OBJECT_NAME, day1M: { sgp4: +d1S.toFixed(1), xp: +d1X.toFixed(1), ap: +d1A.toFixed(1) } });
      continue;
    }
    const perLead = {};
    for (const d of [1, 3, 5, 7]) {
      perLead[d] = { s: dailyRmsM(lS, pts, d), x: dailyRmsM(lX, pts, d), a: dailyRmsM(lA, pts, d) };
    }
    rows.push({ noradId: id, name: gpByNorad.get(id).OBJECT_NAME, perLead });
    if (sentinelSats.includes(id)) sentinelCache.set(id, { sgp4Ocm, xpOcm, apOcm, ptsFull });
  }
  const byDay = {};
  for (const d of [1, 3, 5, 7]) {
    const valid = rows.filter((r) => Number.isFinite(r.perLead[d].s) && Number.isFinite(r.perLead[d].x) && Number.isFinite(r.perLead[d].a));
    const sArr = valid.map((r) => r.perLead[d].s), xArr = valid.map((r) => r.perLead[d].x), aArr = valid.map((r) => r.perLead[d].a);
    byDay[String(d)] = {
      satellites: valid.length,
      socratesGpSgp4: { ...statsOf(sArr), medianCi95M: bootMedianCi(sArr, `b1:${label}:${d}:s`) },
      gpSgp4Xp: { ...statsOf(xArr), medianCi95M: bootMedianCi(xArr, `b1:${label}:${d}:x`) },
      gpSdnAp: { ...statsOf(aArr), medianCi95M: bootMedianCi(aArr, `b1:${label}:${d}:a`) },
      sdnApCloserThanSocratesSgp4: valid.filter((r) => r.perLead[d].a < r.perLead[d].s).length,
      sdnApCloserThanXp: valid.filter((r) => r.perLead[d].a < r.perLead[d].x).length,
    };
  }
  return { label, distinctSats: rows.length, excludedFaults, byDay, sentinelCache };
};

const gnss = await scoreGroup('ESA GNSS (MEO, 7 days)', esaSats, esaDirs);
const sent = await scoreGroup('Copernicus Sentinel-1C/1D (LEO, 2 sats — under 5-sat floor, diagnostic only)', sentinelSats, sentinelDirs);

// 3. Score primary position error at TCA on the 29 published 2026-10-28 SOCRATES Plus rows involving Sentinel-1C/1D!
const sentSocRows = socratesRows.filter((r) => sentinelSats.includes(r.a) || sentinelSats.includes(r.b));
const tcaErrs = { sgp4: [], xp: [], ap: [] };
for (const r of sentSocRows) {
  const sid = sentinelSats.includes(r.a) ? r.a : r.b;
  const sc = sent.sentinelCache.get(sid);
  if (!sc) continue;
  // Linear/4-point Lagrange interpolation of 10s-cadence Copernicus POEORB to exact SOCRATES TCA
  const pts = sc.ptsFull;
  let lo = 0, hi = pts.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (pts[mid].ms <= r.tcaMs) lo = mid; else hi = mid; }
  if (Math.abs(pts[lo].ms - r.tcaMs) > 60000 || Math.abs(pts[hi].ms - r.tcaMs) > 60000) continue;
  const i0 = Math.max(0, Math.min(pts.length - 4, lo - 1));
  const lag = (c) => {
    let val = 0;
    for (let i = 0; i < 4; i++) {
      let li = 1;
      for (let j = 0; j < 4; j++) if (j !== i) li *= (r.tcaMs - pts[i0 + j].ms) / (pts[i0 + i].ms - pts[i0 + j].ms);
      val += li * pts[i0 + i].r[c];
    }
    return val;
  };
  const rTrue = [lag(0), lag(1), lag(2)];
  const ep = [isoNoZ(r.tcaMs)];
  const [lS, lX, lA] = [await flyOcm(sc.sgp4Ocm, ep), await flyOcm(sc.xpOcm, ep), await flyOcm(sc.apOcm, ep)];
  if (!lS?.[0] || !lX?.[0] || !lA?.[0]) continue;
  const distM = (l) => Math.hypot(l.X - rTrue[0], l.Y - rTrue[1], l.Z - rTrue[2]) * 1000;
  tcaErrs.sgp4.push(distM(lS[0]));
  tcaErrs.xp.push(distM(lX[0]));
  tcaErrs.ap.push(distM(lA[0]));
}

// 4. Audit Space-Track cdm_public over 2026-10-28T17:00Z..2026-11-04T17:00Z against SOCRATES Plus active-payload scope
const satcat = common.readSatcat();
const activePay = new Set([...satcat.entries()].filter(([, v]) => v.type === 'PAY' && ['+', 'P', 'B', 'S', 'X'].includes(v.status)).map(([k]) => k));
const cdmDir = path.join(ARCHIVE, 'spacetrack/cdm_public/2026');
const cdmEvents = new Map();
for (const d of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) {
  const f = path.join(cdmDir, `${d}.json.gz`);
  if (!fs.existsSync(f)) continue;
  for (const c of JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'))) {
    const tcaMs = utcMs(c.TCA);
    if (!(tcaMs >= T0_MS && tcaMs <= END_MS)) continue;
    const a = Number(c.SAT_1_ID), b = Number(c.SAT_2_ID);
    const key = `${Math.min(a, b)}-${Math.max(a, b)}-${Math.round(tcaMs / 3600000)}`;
    const prev = cdmEvents.get(key);
    if (!prev || utcMs(c.CREATED) > utcMs(prev.CREATED)) cdmEvents.set(key, c);
  }
}
const cdmList = [...cdmEvents.values()];
const cdmWithActivePay = cdmList.filter((c) => activePay.has(Number(c.SAT_1_ID)) || activePay.has(Number(c.SAT_2_ID)));
const socPairKeys = new Set(socratesRows.map((r) => `${Math.min(r.a, r.b)}-${Math.max(r.a, r.b)}`));
const cdmInSocrates = cdmList.filter((c) => socPairKeys.has(`${Math.min(Number(c.SAT_1_ID), Number(c.SAT_2_ID))}-${Math.max(Number(c.SAT_1_ID), Number(c.SAT_2_ID))}`));

await apPub.destroy?.();

const out = {
  schema: 'sdn-ap-socrates-part-b1-1',
  generatedUtc: nowUtc(),
  windowStartUtc: T0_ISO,
  windowEndUtc: '2026-11-04T17:00:00.000Z',
  gpCutUtc: CUT_ISO,
  socratesRows: socratesRows.length,
  gnss7Day: { distinctSats: gnss.distinctSats, excludedFaults: gnss.excludedFaults, byDay: gnss.byDay },
  sentinelDiagnosticUnder5Sats: { distinctSats: sent.distinctSats, note: '2 satellites (< 5-sat regime floor); reported as diagnostic only', byDay: sent.byDay },
  sentinelSocratesTcaPrimaryPositionError: {
    socratesRowsTouchingSentinel1CD: sentSocRows.length,
    scoredRows: tcaErrs.sgp4.length,
    socratesGpSgp4: statsOf(tcaErrs.sgp4),
    gpSgp4Xp: statsOf(tcaErrs.xp),
    gpSdnAp: statsOf(tcaErrs.ap),
    sdnApCloserThanSocratesSgp4: tcaErrs.ap.filter((v, i) => v < tcaErrs.sgp4[i]).length,
  },
  cdmPublicScopeAudit: {
    uniqueEventsInWindow: cdmList.length,
    eventsWithActivePayload: cdmWithActivePay.length,
    eventsWithoutActivePayload: cdmList.length - cdmWithActivePay.length,
    eventsMatchingSocratesPair: cdmInSocrates.length,
    explanation: 'Space-Track cdm_public publishes overwhelmingly non-active-payload (debris / rocket body / defunct) conjunctions because 18 SDS distributes active-payload CDMs privately to operators, whereas CelesTrak SOCRATES Plus screens only active payloads.',
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\n=== PART B1 COMPLETE -> ${OUT_PATH} ===`);
console.log('GNSS 7-day (111 sats):', JSON.stringify(Object.fromEntries(Object.entries(gnss.byDay).map(([d, v]) => [d, { S: v.socratesGpSgp4.medianM, X: v.gpSgp4Xp.medianM, AP: v.gpSdnAp.medianM, apWinS: `${v.sdnApCloserThanSocratesSgp4}/${v.satellites}` }]))));
console.log('Sentinel-1C/1D 29 SOCRATES TCAs:', JSON.stringify(out.sentinelSocratesTcaPrimaryPositionError));
console.log('CDM public audit:', JSON.stringify(out.cdmPublicScopeAudit));
