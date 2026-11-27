#!/usr/bin/env node
// Compare CelesTrak Supplemental GP (SupGP) beside Space-Track public GP and SDN-AP 0.7.5
// across overlapping GPS and GLONASS MEO satellites against independent ESA0OPSFIN final orbits
// (2026-11-02, 2026-11-05, 2026-11-08, 2026-11-11; strict pre-T0 causality).
// Outputs aggregate-only JSON to results/ca-rollup-075/supgp-comparison-0.7.5.json.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DAY_MS, HOUR_MS, sha256File, nowUtc, isoNoZ, utcMs, dayStr,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords, buildCatalogBatch,
} from './amendment6-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const OUT_PATH = path.join(OAE, 'results/ca-rollup-075/supgp-comparison-0.7.5.json');

const REF_DIR = path.join(ARCHIVE, 'reference-states/reference');
const SUPGP_DIR = path.join(ARCHIVE, 'celestrak/supgp-host02');
const GP_DIR = path.join(ARCHIVE, 'spacetrack/gp/2026');
const GPH_DIR = path.join(ARCHIVE, 'spacetrack/gp_history');
const AP_PUB_WASM = path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
const AP_FULL_WASM = path.join(MODULES, 'propagator/sdn-ap/.build-full/dist/isomorphic/module.wasm');
const PROV = JSON.parse(fs.readFileSync(path.join(MODULES, 'scripts/artifact-provenance.json'), 'utf8'));
const AP_PKG = JSON.parse(fs.readFileSync(path.join(MODULES, 'propagator/sdn-ap/package.json'), 'utf8'));
const CB_PKG = JSON.parse(fs.readFileSync(path.join(MODULES, 'flows/catalog-builder/package.json'), 'utf8'));

const DATES = ['2026-11-02', '2026-11-05', '2026-11-08', '2026-11-11'];
const GROUPS = [
  { id: 'gps', label: 'GPS (MEO)', supDir: 'gps' },
  { id: 'glonass', label: 'GLONASS (MEO)', supDir: 'glonass' },
];

const sds = await loadSdsAndSdk(MODULES);
const { fb, sdkIso, OMM_MOD, OEM_MOD, PCF_MOD, OCM_MOD, typeRef } = sds;
const plain = (b) => { const u = Buffer.from(b); return u.length >= 8 && u.readUInt32LE(0) + 4 === u.length ? u.subarray(4) : u; };
const prefixed = (b) => {
  const u = Buffer.from(b);
  if (u.length >= 8 && u.readUInt32LE(0) + 4 === u.length) return u;
  const out = Buffer.allocUnsafe(u.length + 4);
  out.writeUInt32LE(u.length, 0);
  u.copy(out, 4);
  return out;
};
const doyOf = (ms) => {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const doy = Math.floor((ms - Date.UTC(y, 0, 1)) / DAY_MS) + 1;
  return `${y}${String(doy).padStart(3, '0')}`;
};
const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
};
const statsOf = (arr) => {
  const s = arr.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  return {
    n: s.length,
    medianM: +quantile(s, 0.5).toFixed(2),
    p95M: +quantile(s, 0.95).toFixed(2),
    maxM: +s[s.length - 1].toFixed(2),
  };
};

function parseStampMs(fname) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json$/.exec(fname);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function loadLatestSupGpBefore(groupSubdir, t0Ms) {
  const dir = path.join(SUPGP_DIR, groupSubdir);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .map((f) => ({ f, ms: parseStampMs(f) }))
    .filter((x) => Number.isFinite(x.ms) && x.ms <= t0Ms)
    .sort((a, b) => b.ms - a.ms);
  if (!files.length) return null;
  const chosen = files[0];
  const full = path.join(dir, chosen.f);
  const rows = JSON.parse(fs.readFileSync(full, 'utf8'));
  const byNorad = new Map();
  for (const r of rows) {
    const id = Number(r.NORAD_CAT_ID);
    if (Number.isFinite(id) && id > 0) byNorad.set(id, r);
  }
  return { file: chosen.f, issueUtc: new Date(chosen.ms).toISOString(), sha256: sha256File(full), byNorad };
}

function loadSpaceTrackGpBefore(dateStr, t0Ms) {
  const byNorad = new Map();
  for (const ds of [dayStr(t0Ms - 2 * DAY_MS), dayStr(t0Ms - DAY_MS), dateStr]) {
    const p = path.join(GP_DIR, `${ds}.json.gz`);
    if (!fs.existsSync(p)) continue;
    const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
    for (const r of rows) {
      const id = Number(r.NORAD_CAT_ID);
      const createdMs = r.CREATION_DATE ? utcMs(r.CREATION_DATE) : utcMs(r.EPOCH);
      if (!(id > 0) || !(createdMs <= t0Ms)) continue;
      const prev = byNorad.get(id);
      if (!prev || utcMs(r.EPOCH) > utcMs(prev.EPOCH)) byNorad.set(id, r);
    }
  }
  return byNorad;
}

function loadSpaceTrackHistory(norads, t0Ms, lookbackDays = 21) {
  const out = new Map([...norads].map((id) => [id, []]));
  const startDay = t0Ms - lookbackDays * DAY_MS;
  for (let ms = startDay; ms <= t0Ms; ms += DAY_MS) {
    const ds = dayStr(ms);
    const p = path.join(GP_DIR, `${ds}.json.gz`);
    if (!fs.existsSync(p)) continue;
    const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
    for (const r of rows) {
      const id = Number(r.NORAD_CAT_ID);
      if (!out.has(id)) continue;
      const createdMs = r.CREATION_DATE ? utcMs(r.CREATION_DATE) : utcMs(r.EPOCH);
      if (!(createdMs <= t0Ms)) continue;
      out.get(id).push(r);
    }
  }
  // Deduplicate by NORAD + EPOCH
  for (const [id, list] of out) {
    const seen = new Map();
    for (const r of list) seen.set(r.EPOCH, r);
    out.set(id, [...seen.values()].sort((a, b) => utcMs(a.EPOCH) - utcMs(b.EPOCH)));
  }
  return out;
}

function loadEsaTruth(norad, fromMs, toMs) {
  const pts = [];
  const dStart = Math.floor(fromMs / DAY_MS) * DAY_MS;
  const dEnd = Math.floor(toMs / DAY_MS) * DAY_MS;
  for (let ms = dStart; ms <= dEnd; ms += DAY_MS) {
    const dir = path.join(REF_DIR, `ESA0OPSFIN_${doyOf(ms)}0000_01D_05M_ORB`);
    const f = path.join(dir, `${norad}.oem`);
    if (!fs.existsSync(f)) continue;
    try {
      const oem = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(plain(fs.readFileSync(f)))).unpack();
      const blk = oem.EPHEMERIS_DATA_BLOCK?.[0];
      if (!blk) continue;
      for (const l of blk.EPHEMERIS_DATA_LINES || []) {
        const lms = utcMs(l.EPOCH);
        if (lms >= fromMs && lms <= toMs) pts.push({ ms: lms, epoch: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] });
      }
    } catch {}
  }
  const uniq = new Map();
  for (const p of pts) uniq.set(p.ms, p);
  return [...uniq.values()].sort((a, b) => a.ms - b.ms);
}

function makeFlightPcf(epochs) {
  const t = new PCF_MOD.PCFT();
  t.OUTPUT = Object.assign(new PCF_MOD.PCFOutputT(), { FRAME: PCF_MOD.pcfOutputFrame.GCRF, EPOCHS: epochs });
  const b = new fb.Builder(4096);
  PCF_MOD.PCF.finishPCFBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}

function makeFitPcf(theory = PCF_MOD.pcfTheory.AP) {
  const t = new PCF_MOD.PCFT();
  t.THEORY = theory;
  if (theory === PCF_MOD.pcfTheory.AP) {
    t.FORCES = Object.assign(new PCF_MOD.PCFForceModelT(), {
      EPHEMERIS_SOURCE: '',
      ATMOSPHERE_MODEL: PCF_MOD.pcfAtmosphereFamily.JACCHIA70,
      WEATHER_SOURCE: PCF_MOD.pcfWeatherSource.THEORY_FLUX_MODEL,
      DENSITY_CORRECTION: PCF_MOD.pcfDensityCorrection.NONE,
      MAXIMUM_DEGREE: 70, HAS_MAXIMUM_DEGREE: true,
      MAXIMUM_TESSERAL_DEGREE: 31, HAS_MAXIMUM_TESSERAL_DEGREE: true,
      SOLID_TIDES: PCF_MOD.pcfSolidTideModel.IERS_2010,
      ECOM2: Object.assign(new PCF_MOD.PCFEcom2T(), { Y0_M_S2: 0.0 }),
    });
  } else {
    t.FORCES = Object.assign(new PCF_MOD.PCFForceModelT(), {
      EPHEMERIS_SOURCE: '',
      ATMOSPHERE_MODEL: PCF_MOD.pcfAtmosphereFamily.JACCHIA70,
      WEATHER_SOURCE: PCF_MOD.pcfWeatherSource.THEORY_FLUX_MODEL,
      DENSITY_CORRECTION: PCF_MOD.pcfDensityCorrection.NONE,
    });
  }
  const b = new fb.Builder(1024);
  PCF_MOD.PCF.finishPCFBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}

function packOem(norad, name, pts) {
  const blk = new OEM_MOD.ephemerisDataBlockT();
  blk.OBJECT = Object.assign(new OEM_MOD.CATT(), { NORAD_CAT_ID: norad, OBJECT_NAME: name || `SAT-${norad}` });
  blk.CENTER_NAME = 'EARTH';
  const rfm = new OEM_MOD.RFMT();
  rfm.REFERENCE_FRAME_type = OEM_MOD.RFMUnion.CelestialFrameWrapper;
  rfm.REFERENCE_FRAME = new OEM_MOD.CelestialFrameWrapperT(OEM_MOD.CelestialFrame.GCRF);
  rfm.NAME = 'GCRF';
  blk.REFERENCE_FRAME = rfm;
  blk.TIME_SYSTEM = OEM_MOD.timingStandard.UTC;
  blk.START_TIME = pts[0].epoch;
  blk.USEABLE_START_TIME = pts[0].epoch;
  blk.USEABLE_STOP_TIME = pts[pts.length - 1].epoch;
  blk.STOP_TIME = pts[pts.length - 1].epoch;
  blk.EPHEMERIS_DATA_LINES = pts.map((p) => Object.assign(new OEM_MOD.ephemerisDataLineT(), {
    EPOCH: p.epoch, X: p.r[0], Y: p.r[1], Z: p.r[2], X_DOT: p.v[0], Y_DOT: p.v[1], Z_DOT: p.v[2],
  }));
  const o = new OEM_MOD.OEMT();
  o.CCSDS_OEM_VERS = '3.0';
  o.EPHEMERIS_DATA_BLOCK = [blk];
  const b = new fb.Builder(1 << 16);
  OEM_MOD.OEM.finishOEMBuffer(b, o.pack(b));
  return b.asUint8Array().slice();
}

function dailyRmsM(predLines, truthPts, t0Ms, day) {
  const lo = t0Ms + (day - 1) * DAY_MS, hi = t0Ms + day * DAY_MS;
  let sq = 0, cnt = 0;
  for (let i = 0; i < truthPts.length; i++) {
    const p = truthPts[i];
    if (!(p.ms > lo && p.ms <= hi)) continue;
    const l = predLines[i];
    if (!l || !Number.isFinite(l.X)) continue;
    const dx = l.X - p.r[0], dy = l.Y - p.r[1], dz = l.Z - p.r[2];
    sq += (dx * dx + dy * dy + dz * dz) * 1e6;
    cnt++;
  }
  return cnt >= 20 ? Math.sqrt(sq / cnt) : NaN;
}

const apPub = await sdkIso.createStandaloneHarness('browser', AP_PUB_WASM, { surface: 'direct', maxThreads: 1 });
const apFull = await sdkIso.createStandaloneHarness('browser', AP_FULL_WASM, { surface: 'direct', maxThreads: 1 });

async function ingestOmm(harness, ommRaw) {
  const r = await harness.invoke({
    methodId: 'ingest_omm',
    inputs: [{ portId: 'omm', typeRef: typeRef('OMM'), payload: plain(ommRaw) }],
  });
  if (r.statusCode !== 0) return null;
  const out = r.outputs.find((o) => o.portId === 'ocm')?.payload;
  return out ? Buffer.from(out) : null;
}

async function flyOcm(harness, ocmBytes, epochs) {
  const r = await harness.invoke({
    methodId: 'propagate',
    inputs: [
      { portId: 'ocm', typeRef: typeRef('OCM'), payload: plain(ocmBytes) },
      { portId: 'configuration', typeRef: typeRef('PCF'), payload: makeFlightPcf(epochs) },
    ],
  });
  if (r.statusCode !== 0) return null;
  const eph = r.outputs.find((o) => o.portId === 'ephemeris')?.payload;
  if (!eph) return null;
  const oem = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(plain(eph))).unpack();
  return oem.EPHEMERIS_DATA_BLOCK?.[0]?.EPHEMERIS_DATA_LINES || null;
}

const resultsByGroup = {};
const fitPcfAp = makeFitPcf(PCF_MOD.pcfTheory.AP);
const fitPcfXp = makeFitPcf(PCF_MOD.pcfTheory.SGP4XP);

for (const grp of GROUPS) {
  const perDay = { '1': [], '3': [], '5': [] };
  const satsScored = new Set();
  const supMeta = [];
  const excludedFaults = [];
  for (const ds of DATES) {
    const t0Ms = Date.parse(`${ds}T00:00:00.000Z`);
    const sup = loadLatestSupGpBefore(grp.supDir, t0Ms);
    if (!sup) continue;
    supMeta.push({ cutoffDate: ds, supGpFile: sup.file, issueUtc: sup.issueUtc, sha256: sup.sha256 });
    const stGp = loadSpaceTrackGpBefore(ds, t0Ms);
    const commonNorads = [...sup.byNorad.keys()].filter((id) => stGp.has(id)).sort((a, b) => a - b);
    const histMap = loadSpaceTrackHistory(commonNorads, t0Ms, 21);
    const spw = buildCausalSpwRecords({
      archiveRoot: ARCHIVE,
      firstDate: dayStr(t0Ms - 30 * DAY_MS),
      lastDate: dayStr(t0Ms + 30 * DAY_MS),
      cutoffDate: ds,
      sds,
    });

    // Build SDN-AP 0.7.5 and SGP4-XP records from public Space-Track GP history via catalog-builder 0.2.7
    const seeds = new Map();
    const historyByNorad = new Map();
    const truths = new Map();
    for (const id of commonNorads) {
      const tr = loadEsaTruth(id, t0Ms - 72 * HOUR_MS, t0Ms + 5 * DAY_MS);
      const futRaw = tr.filter((p) => p.ms > t0Ms && p.ms <= t0Ms + 5 * DAY_MS);
      const arcRaw = tr.filter((p) => p.ms >= t0Ms - 72 * HOUR_MS && p.ms <= t0Ms);
      const fut = futRaw.filter((_, i) => i % 6 === 0);
      const arc = arcRaw.filter((_, i) => i % 6 === 0 || i === arcRaw.length - 1);
      if (fut.length < 180 || arc.length < 100) continue;
      truths.set(id, { fut, arc });
      seeds.set(id, gpJsonToOmm(stGp.get(id), sds, true));
      const hRows = (histMap.get(id) || [stGp.get(id)]).map((r) => ({ ms: utcMs(r.EPOCH), buf: gpJsonToOmm(r, sds, true) }));
      historyByNorad.set(id, hRows);
    }
    if (!seeds.size) continue;
    const [builtAp, builtXp] = await Promise.all([
      buildCatalogBatch({
        modulesRoot: MODULES,
        sds,
        kind: 'sdn-ap',
        nowMs: t0Ms,
        seeds,
        historyByNorad,
        weatherRecords: spw,
      }),
      buildCatalogBatch({
        modulesRoot: MODULES,
        sds,
        kind: 'sgp4-xp',
        nowMs: t0Ms,
        seeds,
        historyByNorad,
        weatherRecords: spw,
      }),
    ]);

    for (const id of seeds.keys()) {
      const { fut, arc } = truths.get(id);
      const epochs = fut.map((p) => isoNoZ(p.ms));
      const objName = stGp.get(id).OBJECT_NAME || `SAT-${id}`;

      const stOcm = await ingestOmm(apPub, gpJsonToOmm(stGp.get(id), sds, false));
      const supOcm = await ingestOmm(apPub, gpJsonToOmm(sup.byNorad.get(id), sds, false));
      const stLines = stOcm ? await flyOcm(apPub, stOcm, epochs) : null;
      const supLines = supOcm ? await flyOcm(apPub, supOcm, epochs) : null;

      const opOcm = builtAp.get(id)?.ocmBuf;
      const opLines = opOcm ? await flyOcm(apPub, opOcm, epochs) : null;
      const xpPubOcm = builtXp.get(id)?.ocmBuf;
      const xpPubLines = xpPubOcm ? await flyOcm(apPub, xpPubOcm, epochs) : null;

      // Retrospective tracking-orbit arm: fit AP and SGP4-XP from historical ESA0OPSFIN states on full build, propagate on signed public 0.7.5
      const oemPayload = packOem(id, objName, arc);
      let apPrecLines = null;
      const fitApRes = await apFull.invoke({
        methodId: 'fit',
        inputs: [
          { portId: 'ephemeris', typeRef: typeRef('OEM'), payload: oemPayload },
          { portId: 'configuration', typeRef: typeRef('PCF'), payload: fitPcfAp },
        ],
      });
      if (fitApRes.statusCode === 0) {
        const el = fitApRes.outputs.find((o) => o.portId === 'elements')?.payload;
        if (el) apPrecLines = await flyOcm(apPub, el, epochs);
      }

      let xpPrecLines = null;
      const fitXpRes = await apFull.invoke({
        methodId: 'fit',
        inputs: [
          { portId: 'ephemeris', typeRef: typeRef('OEM'), payload: oemPayload },
          { portId: 'configuration', typeRef: typeRef('PCF'), payload: fitPcfXp },
        ],
      });
      if (fitXpRes.statusCode === 0) {
        const el = fitXpRes.outputs.find((o) => o.portId === 'elements')?.payload;
        if (el) xpPrecLines = await flyOcm(apPub, el, epochs);
      } else {
        throw new Error(`fitXp failed (${id}, ${ds}): ${fitXpRes.errorCode} ${fitXpRes.errorMessage}`);
      }

      if (!stLines || !supLines || !opLines || !xpPubLines || !apPrecLines || !xpPrecLines) continue;

      // Pass condition 3.7 fault adjudication on day 1 before aggregation:
      const eSt1 = dailyRmsM(stLines, fut, t0Ms, 1);
      const eSup1 = dailyRmsM(supLines, fut, t0Ms, 1);
      const eXpPub1 = dailyRmsM(xpPubLines, fut, t0Ms, 1);
      const eOp1 = dailyRmsM(opLines, fut, t0Ms, 1);
      const eXpPrec1 = dailyRmsM(xpPrecLines, fut, t0Ms, 1);
      const eAp1 = dailyRmsM(apPrecLines, fut, t0Ms, 1);
      if (![eSt1, eSup1, eXpPub1, eOp1, eXpPrec1, eAp1].every(Number.isFinite)) continue;
      const allOver100km = [eSt1, eSup1, eXpPub1, eOp1, eXpPrec1, eAp1].every((v) => v > 100000);
      const publicIdFault = eSt1 > 1000000 && eOp1 > 1000000 && eSup1 < 5000 && eAp1 < 1000;
      if (allOver100km || publicIdFault) {
        excludedFaults.push({
          noradId: id,
          objectName: objName,
          cutoffDate: ds,
          reason: allOver100km ? 'day1-fault-over-100km-all-sides' : 'day1-public-gp-identity-fault-over-1000km',
          day1M: {
            sgp4SpaceTrack: +eSt1.toFixed(2),
            sgp4CelestrakSupGp: +eSup1.toFixed(2),
            sgp4XpFromPublicGp: +eXpPub1.toFixed(2),
            sdnApFromPublicGp: +eOp1.toFixed(2),
            sgp4XpFromPrecise: +eXpPrec1.toFixed(2),
            sdnApFromPrecise: +eAp1.toFixed(2),
          },
        });
        continue;
      }

      satsScored.add(id);
      for (const d of [1, 3, 5]) {
        const eSt = dailyRmsM(stLines, fut, t0Ms, d);
        const eSup = dailyRmsM(supLines, fut, t0Ms, d);
        const eXpPub = dailyRmsM(xpPubLines, fut, t0Ms, d);
        const eOp = dailyRmsM(opLines, fut, t0Ms, d);
        const eXpPrec = dailyRmsM(xpPrecLines, fut, t0Ms, d);
        const eAp = dailyRmsM(apPrecLines, fut, t0Ms, d);
        if ([eSt, eSup, eXpPub, eOp, eXpPrec, eAp].every(Number.isFinite)) {
          perDay[String(d)].push({ noradId: id, objectName: objName, cutoffDate: ds, st: eSt, sup: eSup, xpPub: eXpPub, op: eOp, xpPrec: eXpPrec, ap: eAp });
        }
      }
    }
  }

  const daysOut = {};
  for (const d of ['1', '3', '5']) {
    const arr = perDay[d];
    const bySat = new Map();
    for (const x of arr) {
      if (!bySat.has(x.noradId)) bySat.set(x.noradId, { noradId: x.noradId, objectName: x.objectName, st: [], sup: [], op: [] });
      const b = bySat.get(x.noradId);
      b.st.push(x.st); b.sup.push(x.sup); b.op.push(x.op);
    }
    let satsApBetterSt = 0, satsApBetterSup = 0;
    const satsApWorseSt = [];
    for (const b of bySat.values()) {
      const mSt = quantile(b.st.slice().sort((a, c) => a - c), 0.5);
      const mSup = quantile(b.sup.slice().sort((a, c) => a - c), 0.5);
      const mOp = quantile(b.op.slice().sort((a, c) => a - c), 0.5);
      if (mOp < mSt) satsApBetterSt++; else satsApWorseSt.push({ noradId: b.noradId, objectName: b.objectName, stMedM: +mSt.toFixed(2), apMedM: +mOp.toFixed(2) });
      if (mOp < mSup) satsApBetterSup++;
    }
    daysOut[d] = {
      tests: arr.length,
      distinctSats: bySat.size,
      sgp4SpaceTrack: statsOf(arr.map((x) => x.st)),
      sgp4CelestrakSupGp: statsOf(arr.map((x) => x.sup)),
      sgp4XpFromPublicGp: statsOf(arr.map((x) => x.xpPub)),
      sdnApFromPublicGp: statsOf(arr.map((x) => x.op)),
      sgp4XpFromPrecise: statsOf(arr.map((x) => x.xpPrec)),
      sdnApFromPrecise: statsOf(arr.map((x) => x.ap)),
      sdnApPublicCloserThanSpaceTrack: arr.filter((x) => x.op < x.st).length,
      sdnApPublicCloserThanXpPublic: arr.filter((x) => x.op < x.xpPub).length,
      sdnApPublicCloserThanSupGp: arr.filter((x) => x.op < x.sup).length,
      sdnApPreciseCloserThanSupGp: arr.filter((x) => x.ap < x.sup).length,
      sdnApPreciseCloserThanXpPrecise: arr.filter((x) => x.ap < x.xpPrec).length,
      supGpCloserThanSpaceTrack: arr.filter((x) => x.sup < x.st).length,
      perSatellite: {
        distinctSats: bySat.size,
        sdnApPublicBetterThanSpaceTrack: satsApBetterSt,
        sdnApPublicBetterThanSupGp: satsApBetterSup,
        sdnApPublicWorseThanSpaceTrack: satsApWorseSt,
      },
    };
  }
  resultsByGroup[grp.id] = {
    label: grp.label,
    distinctSats: satsScored.size,
    cutoffDates: DATES,
    supGpFiles: supMeta,
    excludedFaults,
    days: daysOut,
  };
  console.log(`SupGP ${grp.id}: sats=${satsScored.size}, exclFaults=${excludedFaults.length}, day3 tests=${daysOut['3'].tests}, ST=${daysOut['3'].sgp4SpaceTrack?.medianM}m, SupGP=${daysOut['3'].sgp4CelestrakSupGp?.medianM}m, XP(pub)=${daysOut['3'].sgp4XpFromPublicGp?.medianM}m, AP(pub)=${daysOut['3'].sdnApFromPublicGp?.medianM}m, XP(prec)=${daysOut['3'].sgp4XpFromPrecise?.medianM}m, AP(prec)=${daysOut['3'].sdnApFromPrecise?.medianM}m`);
}

await apPub.destroy?.();
await apFull.destroy?.();

const doc = {
  schema: 'sdn-ap-supgp-comparison-2',
  version: AP_PKG.version,
  catalogBuilderVersion: CB_PKG.version,
  generatedUtc: nowUtc(),
  module: {
    version: AP_PKG.version,
    canonicalSha256: PROV.artifacts['propagator/sdn-ap/dist/isomorphic/module.wasm'].canonicalModuleSha256,
    signedBundleSha256: sha256File(AP_PUB_WASM),
  },
  xpImplementation: 'SGP4-XP inside signed propagator/sdn-ap 0.7.5 (same module as SDN-AP; public-GP XP built by catalog-builder 0.2.7)',
  causalityDisclosure: {
    publicGpAndSupGpArms: 'causal (only Space-Track GP and CelesTrak SupGP published before cutoff T0 enter)',
    preciseOrbitArms: 'retrospective (uses historical ESA0OPSFIN final orbits with state epoch <= T0; ESA final products publish ~10-14 days after epoch, so this arm measures propagator fidelity given precise orbit input rather than real-time operational availability)',
  },
  what: 'Comparison of CelesTrak Supplemental GP (SupGP, SGP4) beside Space-Track GP (SGP4), SGP4-XP and SDN-AP 0.7.5 from Space-Track GP history (causal), and SGP4-XP and SDN-AP 0.7.5 from historical ESA final orbits (retrospective) across GPS and GLONASS MEO satellites against later ESA0OPSFIN final orbits (2026-11-02..11). Day-1 fault rows (>100 km on all arms or >1,000 km public-GP identity faults) are excluded per pass condition 3.7 and listed in excludedFaults.',
  groups: resultsByGroup,
  unmeasuredRegimes: {
    leoSpheresCpf: 'not measured (nsgf/ilrsa sphere precise archives end 2026-08-26; supgp-host02/cpf starts 2026-11-01)',
    geoCommercial: 'not measured (no public commercial GEO precise-orbit truth overlapping supgp-host02/intelsat,ses 2026-11-01..14)',
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${OUT_PATH}`);
