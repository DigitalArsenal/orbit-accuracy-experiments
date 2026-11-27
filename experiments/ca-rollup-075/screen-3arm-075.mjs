#!/usr/bin/env node
// Item 5 (#1128 / #976): Live Whole-Catalog 3-Arm 5-Day Conjunction Assessment Screen (32,988 objects, 2026-11-24)
// Screens all 3 arms through compiled analysis/conjunction-assessment 0.19.2 WASM + public propagator/sdn-ap 0.7.5 WASM:
//   - SGP4 arm: 32,988 public GP $OMM records (sgp4Sources + e14-s3-kc.erm Foster 2-D)
//   - SDN-AP 0.7.5 arm: catalog-builder 0.2.7 + gp-error-model 0.19.3 $OCM records -> sdnap_epochs_at (TEME) -> deg-12 Chebyshev $PPE/$PRW
//   - SGP4-XP arm: catalog-builder 0.2.7 + gp-error-model 0.19.3 $OCM records -> sdnap_epochs_at (TEME) -> deg-12 Chebyshev $PPE/$PRW
// Plus:
//   - Exact Foster 2-D Pc via analysis/conjunction-assessment compute_pc with ESA DISCOS/SATCAT HBR and 10 m HBR
//   - Pairwise arm overlap (SDN-AP vs SGP4, SDN-AP vs SGP4-XP, SGP4 vs SGP4-XP)
//   - Real 2026-11-24 Space-Track public CDMs (TCA >= T0 = 2026-11-24T17:00:00Z)
//   - Strictly unseen future 2026-11-25T00-57-57-962Z SpaceX Starlink ephemeris truth (~11,195 satellites)
// Outputs AGGREGATES ONLY (zero per-object/NORAD/CDM rows in public JSON).
//
// Usage:
//   node phase6-screen-catalog.mjs --smoke           (quick 1-shard / 1-window verification)
//   node phase6-screen-catalog.mjs --workers 6       (full 32,988-object 5-day 3-arm screen + CDM + future Starlink truth)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const arg = (flag, dflt = null) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
const hasFlag = (flag) => process.argv.includes(flag);
const MOD = arg('--modules', process.env.SDN_MODULES_ROOT || path.resolve(path.dirname(SELF), '../../../../main-packages/space-data-network-modules'));
const CA_DIR = path.join(MOD, 'analysis/conjunction-assessment');
const AP_DIR = path.join(MOD, 'propagator/sdn-ap');
const GP_MODEL_DIR = path.join(MOD, 'analysis/gp-error-model');
const LIVE_DIR = arg('--live-dir', process.env.SDN_LIVE_CATALOG_DIR || path.resolve(path.dirname(SELF), '../../runs/ca-rollup-075/live-20261124'));
const RESULTS_DIR = arg('--out-dir', path.resolve(path.dirname(SELF), '../../results/ca-rollup-075'));
const ARCHIVE = arg('--archive', process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive');
const T0_ISO = '2026-11-24T17:00:00.000Z';
const T0_MS = Date.parse(T0_ISO);
const T0_JD = T0_MS / 86400000 + 2440587.5;
const DAY_MS = 86400000;
const HOUR_MS = 3600000;


const req = createRequire(path.join(CA_DIR, 'package.json'));
const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
const { createBrowserModuleHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/host/browser-module')).href);
const CQR_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/CQR/main.js')).href);
const PRW_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PRW/main.js')).href);
const PPE_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PPE/main.js')).href);
const OCM_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OCM/main.js')).href);
const OMM_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OMM/main.js')).href);
const PCF_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/main.js')).href);
const OEM_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/main.js')).href);
const CAT_SCR = await import(pathToFileURL(path.join(CA_DIR, 'gpu/catalogScreen.mjs')).href);
const ALL_VS = await import(pathToFileURL(path.join(CA_DIR, 'gpu/allVsAll.mjs')).href);
const { uncertaintyModelFrame } = await import(pathToFileURL(path.join(CA_DIR, 'scripts/uncertainty-model.mjs')).href);

const CA_WASM = path.join(CA_DIR, 'dist/isomorphic/module.wasm');
const CA_MAN = JSON.parse(fs.readFileSync(path.join(CA_DIR, 'plugin-manifest.json'), 'utf8'));
const AP_WASM = path.join(AP_DIR, 'dist/isomorphic/module.wasm');
const ERM_PATH = path.join(GP_MODEL_DIR, 'data/e14-s3-kc.erm');
const ERM_JSON = JSON.parse(fs.readFileSync(path.join(GP_MODEL_DIR, 'data/e14-s3-kc.json'), 'utf8'));

const typeRef = (c) => ({ schemaName: `${c}.fbs`, fileIdentifier: `$${c}`, rootTypeName: c, wireFormat: 'flatbuffer' });
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const jdSplit = (ms) => {
  const jd = ms / 86400000 + 2440587.5;
  const jw = Math.floor(jd + 0.5) - 0.5;
  return [jw, jd - jw];
};
const jdFromSplit = (jw, jf) => jw + jf;
const jdSplitFromJd = (jd) => {
  const jw = Math.floor(jd + 0.5) - 0.5;
  return [jw, jd - jw];
};

// Precompute degree-12 Chebyshev-Lobatto DCT-I matrix (13x13)
// Exact representation of f(x) = sum_{k=0}^{12} c_k T_k(x) matching ephemeris_source.cpp:chebyshev()
const CHEB_N = 12;
const CHEB_M = CHEB_N + 1; // 13
const CHEB_X = new Float64Array(CHEB_M); // x_j in [-1, 1], increasing in time: x_j = -cos(pi*j/N)
const CHEB_MAT = new Float64Array(CHEB_M * CHEB_M); // row k, col j (for x_j = -cos(pi*j/N))
for (let j = 0; j < CHEB_M; j++) CHEB_X[j] = -Math.cos((Math.PI * j) / CHEB_N);
for (let k = 0; k < CHEB_M; k++) {
  const scaleK = (k === 0 || k === CHEB_N ? 1 : 2) / CHEB_N;
  const signK = k % 2 === 1 ? -1 : 1; // T_k(-cos(theta)) = (-1)^k cos(k*theta)
  for (let j = 0; j < CHEB_M; j++) {
    const wj = j === 0 || j === CHEB_N ? 0.5 : 1.0;
    CHEB_MAT[k * CHEB_M + j] = scaleK * wj * signK * Math.cos((Math.PI * k * j) / CHEB_N);
  }
}

function loadObjectsAndRadii() {
  const gp = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${ARCHIVE}/spacetrack/gp/2026/2026-11-24.json.gz`)));
  const objects = new Map();
  for (const r of gp) {
    const id = Number(r.NORAD_CAT_ID);
    const n = Number(r.MEAN_MOTION), e = Number(r.ECCENTRICITY), inc = Number(r.INCLINATION);
    const a = Math.cbrt(398600.4418 / (n * 2 * Math.PI / 86400) ** 2);
    const hp = a * (1 - e) - 6378.137;
    const name = String(r.OBJECT_NAME || '');
    const objId = String(r.OBJECT_ID || id);
    const isStarlink = /^STARLINK/i.test(name);
    const band = e >= 0.25 ? 'HEO' : hp < 500 ? 'LEO-L' : hp < 800 ? 'LEO-M' : hp < 2000 ? 'LEO-H' : hp < 30000 ? 'MEO' : 'GEO';
    const epochMs = Date.parse(String(r.EPOCH).replace(/Z$/, '') + 'Z');
    objects.set(id, { norad: id, objectId: objId, name, n, e, inc, hp, isStarlink, band, epochMs, row: r });
  }
  const radii = new Map();
  const discosDir = `${ARCHIVE}/hac/esa-discos/2026/2026-11`;
  if (fs.existsSync(discosDir)) {
    for (const f of fs.readdirSync(discosDir).filter((x) => /^objects-\d+\.json$/.test(x))) {
      let doc; try { doc = JSON.parse(fs.readFileSync(path.join(discosDir, f), 'utf8')); } catch { continue; }
      for (const it of doc.data ?? []) {
        const a = it.attributes ?? {}, id = Number(a.satno);
        if (!Number.isInteger(id)) continue;
        const dims = [a.span, a.height, a.width, a.depth, a.diameter].map(Number).filter((x) => Number.isFinite(x) && x > 0);
        if (dims.length) radii.set(id, Math.max(...dims) / 2);
        else if (Number(a.xSectMax) > 0) radii.set(id, Math.sqrt(Number(a.xSectMax) / Math.PI));
      }
    }
  }
  const satcatDir = `${ARCHIVE}/spacetrack/satcat/2026`;
  const satcatFile = fs.readdirSync(satcatDir).filter((x) => x.endsWith('.json.gz')).sort().at(-1);
  if (satcatFile) {
    const RCS = { SMALL: 0.1, MEDIUM: 0.5, LARGE: 1.5 };
    for (const row of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(satcatDir, satcatFile))))) {
      const id = Number(row.NORAD_CAT_ID);
      if (!radii.has(id) && RCS[row.RCS_SIZE]) radii.set(id, RCS[row.RCS_SIZE]);
    }
  }
  return { objects, radii };
}
const hbrOf = (radii, a, b) => (radii.get(a) ?? 0.5) + (radii.get(b) ?? 0.5);

// Open a conjunction-assessment WASM instance with invoke + compute_pc helper
async function openCaHarness() {
  const h = await createBrowserModuleHarness({
    wasmSource: fs.readFileSync(CA_WASM),
    manifest: CA_MAN,
    surface: 'direct',
    enableBrowserWasiThreads: false,
  });
  const invoke = (methodId, inputs) => h.invoke({ methodId, inputs });
  async function computePc(cov2d, hbrM, miss2d) {
    const [c11, c12, c22] = cov2d;
    const det = c11 * c22 - c12 * c12;
    if (!(det > 0) || !Number.isFinite(det)) return null;
    const tr = c11 + c22;
    const lmin = (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2;
    if (!(lmin > 0)) return null;
    const d = Math.sqrt(Math.max(0, (c22 * miss2d[0] ** 2 - 2 * c12 * miss2d[0] * miss2d[1] + c11 * miss2d[1] ** 2) / det));
    const hRad = hbrM / Math.sqrt(lmin);
    // Exact Gaussian peak upper bound: skip compute_pc only when Pc < 1e-12
    const bound = (hbrM * hbrM) / (2 * Math.sqrt(det)) * Math.exp(-(Math.max(0, d - hRad) ** 2) / 2);
    if (bound < 1e-12) return 0;
    const b = new fb.Builder(512);
    const rec = new CQR_MOD.CQRT();
    rec.PROBABILITY_REQUEST = new CQR_MOD.CQRProbabilityRequestT(
      new CQR_MOD.CQRPlaneGeometryT(miss2d[0], miss2d[1], c11, c12, c22, hbrM),
      CQR_MOD.cqrProbabilityAlgorithm.FOSTER,
    );
    CQR_MOD.CQR.finishCQRBuffer(b, rec.pack(b));
    const r = await invoke('compute_pc', [{ portId: 'request', typeRef: typeRef('CQR'), payload: b.asUint8Array() }]);
    if (r.statusCode !== 0) return null;
    const p = CQR_MOD.CQR.getRootAsCQR(new fb.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack().PROBABILITY_RESULT;
    return p?.CONVERGED && Number.isFinite(p.PROBABILITY) ? p.PROBABILITY : null;
  }
  return { h, invoke, computePc, destroy: () => h.destroy() };
}

// Project 3x3 TEME position covariance (m^2) onto encounter B-plane and compute Foster 2-D Pc
function projectToBPlane(rA, vA, cA_km2, rB, vB, cB_km2) {
  const rx = rA[0] - rB[0], ry = rA[1] - rB[1], rz = rA[2] - rB[2];
  const vx = vA[0] - vB[0], vy = vA[1] - vB[1], vz = vA[2] - vB[2];
  const vMag = Math.hypot(vx, vy, vz);
  if (!(vMag > 1e-9)) return null;
  const ux = vx / vMag, uy = vy / vMag, uz = vz / vMag;
  const rDotU = rx * ux + ry * uy + rz * uz;
  let px = rx - rDotU * ux, py = ry - rDotU * uy, pz = rz - rDotU * uz;
  let pMag = Math.hypot(px, py, pz);
  let e1x, e1y, e1z;
  if (pMag > 1e-12) {
    e1x = px / pMag; e1y = py / pMag; e1z = pz / pMag;
  } else {
    // Near-zero miss: pick arbitrary unit vector perpendicular to u
    const ax = Math.abs(ux) < 0.9 ? 1 : 0, ay = Math.abs(ux) < 0.9 ? 0 : 1, az = 0;
    const cx = uy * az - uz * ay, cy = uz * ax - ux * az, cz = ux * ay - uy * ax;
    const cm = Math.hypot(cx, cy, cz);
    e1x = cx / cm; e1y = cy / cm; e1z = cz / cm;
    pMag = 0;
  }
  const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
  // Combined 3x3 position covariance in m^2 (row-major 6x6 in km^2 -> upper-left 3x3 * 1e6)
  const C = [
    (cA_km2[0] + cB_km2[0]) * 1e6, (cA_km2[1] + cB_km2[1]) * 1e6, (cA_km2[2] + cB_km2[2]) * 1e6,
    (cA_km2[6] + cB_km2[6]) * 1e6, (cA_km2[7] + cB_km2[7]) * 1e6, (cA_km2[8] + cB_km2[8]) * 1e6,
    (cA_km2[12] + cB_km2[12]) * 1e6, (cA_km2[13] + cB_km2[13]) * 1e6, (cA_km2[14] + cB_km2[14]) * 1e6,
  ];
  const mv = (x, y, z) => [C[0]*x + C[1]*y + C[2]*z, C[3]*x + C[4]*y + C[5]*z, C[6]*x + C[7]*y + C[8]*z];
  const Ce1 = mv(e1x, e1y, e1z), Ce2 = mv(e2x, e2y, e2z);
  const c11 = e1x * Ce1[0] + e1y * Ce1[1] + e1z * Ce1[2];
  const c12 = e1x * Ce2[0] + e1y * Ce2[1] + e1z * Ce2[2];
  const c22 = e2x * Ce2[0] + e2y * Ce2[1] + e2z * Ce2[2];
  if (![c11, c12, c22].every(Number.isFinite) || c11 <= 0 || c22 <= 0) return null;
  return { cov2d: [c11, c12, c22], miss2d: [pMag * 1000, 0] };
}

// Build $PRW DESCRIBE_RESULT frames carrying degree-12 Chebyshev $PPE trajectories for one 4-hour window
function buildPrwFramesForWindow({ arm, winStartMs, nSegs, segSec, statesByTime, validMask, seriesInfo, objects, batchSize = 256 }) {
  const nObj = seriesInfo.length;
  const halfSec = segSec / 2;
  const segMidsIso = Array.from({ length: nSegs }, (_, s) => new Date(winStartMs + (s + 0.5) * segSec * 1000).toISOString());
  const startIso = new Date(winStartMs).toISOString();
  const stopIso = new Date(winStartMs + nSegs * segSec * 1000).toISOString();
  const prwInst = new PRW_MOD.PRWInstanceT('sdn-ap', `live-${arm}`, 1n);
  const temeRfm = new PPE_MOD.RFMT(PPE_MOD.RFMUnion.CelestialFrameWrapper, new PPE_MOD.CelestialFrameWrapperT(PPE_MOD.CelestialFrame.TEMEOFDATE), 0, 'TEMEOFDATE');

  const sources = [];
  const prwFrames = [];
  const dropped = [];
  let curBatch = [];

  const flushBatch = (isFinal) => {
    if (!curBatch.length) return;
    const prw = new PRW_MOD.PRWT();
    prw.DESCRIBE_RESULT = new PRW_MOD.PRWDescribeResultT(prwInst, 1, curBatch, 0n, isFinal);
    const b = new fb.Builder(Math.max(1 << 16, curBatch.length * 4096));
    PRW_MOD.PRW.finishSizePrefixedPRWBuffer(b, prw.pack(b));
    prwFrames.push(b.asUint8Array().slice());
    curBatch = [];
  };

  // Scratch buffers for 6 channels x 13 coefficients
  const cArr = Array.from({ length: 6 }, () => new Array(CHEB_M));
  for (let idx = 0; idx < nObj; idx++) {
    const info = seriesInfo[idx];
    const obj = objects.get(info.norad);
    const objectId = obj?.objectId || String(info.norad);
    const name = obj?.name || `NORAD-${info.norad}`;
    if (!validMask[idx]) {
      dropped.push({ norad: info.norad, objectId, jd: winStartMs / 86400000 + 2440587.5 });
      continue;
    }
    const recs = new Array(nSegs);
    for (let s = 0; s < nSegs; s++) {
      const tBase = s * CHEB_N; // shared endpoints between segments
      for (let ch = 0; ch < 6; ch++) {
        const dst = cArr[ch];
        for (let k = 0; k < CHEB_M; k++) {
          let sum = 0;
          const rowOff = k * CHEB_M;
          for (let j = 0; j < CHEB_M; j++) {
            sum += CHEB_MAT[rowOff + j] * statesByTime[tBase + j][ch * nObj + idx];
          }
          dst[k] = sum;
        }
      }
      recs[s] = new PPE_MOD.PPEPositionRecordT(
        segMidsIso[s], halfSec, CHEB_M, PPE_MOD.polynomialBasisType.CHEBYSHEV,
        cArr[0].slice(), cArr[1].slice(), cArr[2].slice(),
        true,
        cArr[3].slice(), cArr[4].slice(), cArr[5].slice(),
        0, 0,
      );
    }
    const ppe = new PPE_MOD.PPET(
      [], null, 'EARTH', temeRfm, PPE_MOD.timingStandard.UTC,
      startIso, stopIso, PPE_MOD.polynomialBasisType.CHEBYSHEV,
      recs, [], `sdn-ap-0.7.5-${arm}`, segSec, CHEB_M, null,
    );
    const handle = idx + 1;
    sources.push(new CQR_MOD.CQRObjectSourceT(objectId, name, info.norad, null, handle));
    curBatch.push(new PRW_MOD.PRWTrajectorySourceT(handle, objectId, ppe, []));
    if (curBatch.length >= batchSize) flushBatch(false);
  }
  flushBatch(true);
  return { sources, prwFrames, dropped };
}

function splitCatalogAuto(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) return [];
  const le = view.getUint32(0, true);
  const isLE = le >= 8 && le + 4 <= bytes.length;
  const frames = [];
  for (let at = 0; at + 4 <= bytes.length;) {
    const n = view.getUint32(at, isLE);
    if (n <= 0 || at + 4 + n > bytes.length) break;
    frames.push(bytes.subarray(at + 4, at + 4 + n));
    at += 4 + n;
  }
  return frames;
}

function sgp4SourcesNormalized(catalog) {
  const temeRfm = new CQR_MOD.RFMT(
    CQR_MOD.RFMUnion.CelestialFrameWrapper,
    new CQR_MOD.CelestialFrameWrapperT(CQR_MOD.CelestialFrame.TEMEOFDATE),
    0,
    'TEMEOFDATE',
  );
  return catalog.map((bytes, i) => {
    const omm = OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(bytes)).unpack();
    omm.CENTER_NAME = 'EARTH';
    omm.REFERENCE_FRAME = temeRfm;
    return new CQR_MOD.CQRObjectSourceT(omm.OBJECT_ID || String(omm.NORAD_CAT_ID), omm.OBJECT_NAME, omm.NORAD_CAT_ID, null, i + 1, 'sgp4', omm);
  });
}

// Detect wide-branch eccentric AP orbits (evaluated via single 5-day batch propagate() — 110x faster than per-epoch calls)
function isWideApOcm(ocmBuf) {
  const o = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(ocmBuf));
  const me = o.MEAN_ELEMENTS();
  if (!me) return false;
  const e = me.ECCENTRICITY(), n = me.MEAN_MOTION();
  // Wide branch activates for e >= 0.05 (except 1/2/3-rev resonant up to e < 0.3); conservatively treat e >= 0.05 as wide
  return e >= 0.05 || n < 0.5;
}

// Compute all unique Chebyshev-Lobatto timestamps for [0..nWin-1] windows (nSegs per window, segSec each)
function allWindowEpochMs(nWin, nSegs, segSec) {
  const totalSegs = nWin * nSegs;
  const totalTimes = totalSegs * CHEB_N + 1;
  const msArr = new Float64Array(totalTimes);
  const halfMs = (segSec / 2) * 1000;
  for (let s = 0; s < totalSegs; s++) {
    const midMs = T0_MS + (s + 0.5) * segSec * 1000;
    const jStart = s === 0 ? 0 : 1;
    for (let j = jStart; j < CHEB_M; j++) msArr[s * CHEB_N + j] = midMs + CHEB_X[j] * halfMs;
  }
  return msArr;
}

// Pre-evaluate wide-branch AP objects ONCE across all 5 days' Chebyshev-Lobatto timestamps via propagate() (TEME)
async function runWidePreEvalWorker(shard, total, outDir, smoke = false) {
  const tStart = Date.now();
  fs.mkdirSync(outDir, { recursive: true });
  const outJson = path.join(outDir, `wide-${shard}.json`);
  const outBin = path.join(outDir, `wide-${shard}.f64`);
  if (fs.existsSync(outJson) && fs.existsSync(outBin)) {
    console.log(`[ap-wide ${shard}/${total}] cached`);
    return;
  }
  const nWin = smoke ? 1 : 30, segSec = 1200, nSegs = 12;
  const binPath = smoke ? path.join(LIVE_DIR, 'shard-2-ap.ocm.bin') : path.join(LIVE_DIR, 'ap-catalog.ocm.bin');
  const buf = fs.readFileSync(binPath);
  const wideOcms = [];
  for (let i = 0; i < buf.length;) {
    const sz = buf.readUInt32LE(i);
    const slice = buf.subarray(i + 4, i + 4 + sz);
    if (isWideApOcm(slice)) {
      const norad = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(slice)).METADATA()?.NORAD_CAT_ID();
      wideOcms.push({ norad, slice });
    }
    i += 4 + sz;
  }
  const mine = wideOcms.filter((_, idx) => idx % total === shard);
  const msArr = allWindowEpochMs(nWin, nSegs, segSec);
  const epochs = Array.from(msArr, (ms) => new Date(ms).toISOString());
  const cfg = new PCF_MOD.PCFT();
  cfg.OUTPUT = new PCF_MOD.PCFOutputT(PCF_MOD.pcfOutputFrame.TEME, 60, 500000, epochs);
  const cfgB = new fb.Builder(Math.max(4096, epochs.length * 40));
  cfgB.finish(cfg.pack(cfgB), '$PCF');
  const cfgBytes = cfgB.asUint8Array().slice();

  const apH = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(AP_WASM), surface: 'direct', initialMemoryBytes: 64 * 1024 * 1024 });
  const nTimes = msArr.length;
  const norads = [];
  const data = new Float64Array(mine.length * nTimes * 6);
  data.fill(NaN);
  let okCount = 0;
  for (let m = 0; m < mine.length; m++) {
    const item = mine[m];
    norads.push(item.norad);
    const r = await apH.invoke({ methodId: 'propagate', inputs: [
      { portId: 'ocm', typeRef: typeRef('OCM'), payload: item.slice },
      { portId: 'configuration', typeRef: typeRef('PCF'), payload: cfgBytes },
    ] });
    if (r.statusCode !== 0) continue;
    const blk = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(r.outputs.find((o) => o.portId === 'ephemeris').payload)).EPHEMERIS_DATA_BLOCK(0);
    if (!blk || blk.ephemerisDataLinesLength() !== nTimes) continue;
    const base = m * nTimes * 6;
    for (let t = 0; t < nTimes; t++) {
      const L = blk.EPHEMERIS_DATA_LINES(t);
      const off = base + t * 6;
      data[off] = L.X(); data[off + 1] = L.Y(); data[off + 2] = L.Z();
      data[off + 3] = L.X_DOT(); data[off + 4] = L.Y_DOT(); data[off + 5] = L.Z_DOT();
    }
    okCount++;
  }
  await apH.destroy();
  fs.writeFileSync(path.join(outDir, `wide-${shard}.json`), JSON.stringify({ shard, norads, nTimes, okCount, ms: Date.now() - tStart }));
  fs.writeFileSync(path.join(outDir, `wide-${shard}.f64`), Buffer.from(data.buffer));
  console.log(`[ap-wide ${shard}/${total}] ${okCount}/${mine.length} wide objects x ${nTimes} epochs (${((Date.now() - tStart) / 1000).toFixed(1)}s)`);
}

// Worker: screen assigned windows for one arm ('sgp4' | 'ap' | 'xp')
async function runScreenWorker(arm, winIndices, outDir, smoke = false) {
  const tStart = Date.now();
  fs.mkdirSync(outDir, { recursive: true });
  const { objects, radii } = loadObjectsAndRadii();
  const ca = await openCaHarness();
  const thresholdKm = 5.0, coarseStepSec = 60;

  if (arm === 'sgp4') {
    const winHours = smoke ? 4 : 6;
    const totalDays = smoke ? 4 / 24 : 5;
    const windows = CAT_SCR.screenWindows(T0_JD, totalDays, winHours);
    let catalog = splitCatalogAuto(fs.readFileSync(path.join(LIVE_DIR, 'sgp4-catalog.omm.bin')));
    if (smoke) {
      const meta = fs.readFileSync(path.join(LIVE_DIR, 'shard-2-meta.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      const keep = new Set(meta.map((m) => m.norad));
      catalog = catalog.filter((bytes) => keep.has(OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(bytes)).NORAD_CAT_ID()));
    }
    const ermBytes = uncertaintyModelFrame({ ...ERM_JSON, kind: 'gp-error-model' }, null, 'e14-s3-kc');
    const sources = sgp4SourcesNormalized(catalog);
    const handle = await CAT_SCR.prepareIndex(ca.invoke, sources);
    const identities = sources.map((s) => [s.OBJECT_ID, s.NORAD_CATALOG_ID]);
    const controls = { thresholdKm, coarseStepSec, workers: 1, algorithm: 'FOSTER' };

    const ermRegimes = ERM_JSON.regimes ?? [];
    const ermAges = ERM_JSON.ageBinsDays ?? [];
    const ermStrata = new Map((ERM_JSON.strata ?? []).map((s) => [`${s.regimeIndex}:${s.ageIndex}`, s.clipped?.covariance ?? s.covariance]));
    const ermCov3x3TemeKm2 = (norad, tcaJd, rKm, vKmS) => {
      const o = objects.get(norad);
      if (!o || !Number.isFinite(o.epochMs)) return null;
      const ageD = Math.max(0, (tcaJd - 2440587.5) * 86400000 - o.epochMs) / 86400000;
      const rIdx = ermRegimes.findIndex((rg) => o.hp >= rg.altitudeKm[0] && o.hp < rg.altitudeKm[1] && o.e >= rg.eccentricity[0] && o.e < rg.eccentricity[1]);
      const aIdx = ermAges.findIndex((ag) => ageD >= ag[0] && ageD < ag[1]);
      const cov21 = ermStrata.get(`${rIdx}:${aIdx}`);
      if (!cov21 || cov21.length < 6) return null;
      const rr = cov21[0], tr = cov21[1], tt = cov21[2], nr = cov21[3], nt = cov21[4], nn = cov21[5];
      const rMag = Math.hypot(rKm[0], rKm[1], rKm[2]);
      const R = [rKm[0] / rMag, rKm[1] / rMag, rKm[2] / rMag];
      const hx = rKm[1] * vKmS[2] - rKm[2] * vKmS[1], hy = rKm[2] * vKmS[0] - rKm[0] * vKmS[2], hz = rKm[0] * vKmS[1] - rKm[1] * vKmS[0];
      const hMag = Math.hypot(hx, hy, hz);
      const N = [hx / hMag, hy / hMag, hz / hMag];
      const T = [N[1] * R[2] - N[2] * R[1], N[2] * R[0] - N[0] * R[2], N[0] * R[1] - N[1] * R[0]];
      const B = [R, T, N];
      const S = [[rr, tr, nr], [tr, tt, nt], [nr, nt, nn]];
      const out6 = new Float64Array(36);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let sum = 0;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) sum += B[a][i] * S[a][b] * B[b][j];
        out6[i * 6 + j] = sum;
      }
      return out6;
    };

    for (const k of winIndices) {
      const doneFile = path.join(outDir, `win-${String(k).padStart(2, '0')}.json`);
      if (fs.existsSync(doneFile)) continue;
      const w = windows[k];
      const tw = Date.now();
      const reqBytes = CAT_SCR.windowRequest(handle, 'TEME', w, controls);
      const run = await ALL_VS.screenAllVsAllOnGpu({
        invoke: ca.invoke,
        decodeCatalogResult: CAT_SCR.decodeCatalogResult,
        request: reqBytes,
        thresholdKm, coarseStepSec,
        uncertaintyModel: ermBytes,
      });
      const compact = [];
      let withCov = 0;
      for (const e of run.events) {
        const pNorad = e.PRIMARY_NORAD_ID, sNorad = e.SECONDARY_NORAD_ID, tcaJd = e.TCA?.JULIAN_DATE;
        const pc10m = e.PROBABILITY?.UNCERTAINTY_SOURCE === CQR_MOD.cqrUncertaintyOrigin.SYNTHESIZED_COVARIANCE
          ? (e.PROBABILITY?.PROBABILITY ?? null) : null;
        let pcDis = null;
        const ps = e.PRIMARY_STATE?.STATE, ss = e.SECONDARY_STATE?.STATE;
        if (ps && ss && Number.isFinite(tcaJd)) {
          const rA = [ps.POSITION.X / 1000, ps.POSITION.Y / 1000, ps.POSITION.Z / 1000];
          const vA = [ps.VELOCITY.X / 1000, ps.VELOCITY.Y / 1000, ps.VELOCITY.Z / 1000];
          const rB = [ss.POSITION.X / 1000, ss.POSITION.Y / 1000, ss.POSITION.Z / 1000];
          const vB = [ss.VELOCITY.X / 1000, ss.VELOCITY.Y / 1000, ss.VELOCITY.Z / 1000];
          const cA = ermCov3x3TemeKm2(pNorad, tcaJd, rA, vA), cB = ermCov3x3TemeKm2(sNorad, tcaJd, rB, vB);
          if (cA && cB) {
            const bp = projectToBPlane(rA, vA, cA, rB, vB, cB);
            if (bp) { withCov++; pcDis = await ca.computePc(bp.cov2d, hbrOf(radii, pNorad, sNorad), bp.miss2d); }
          }
        }
        compact.push({
          pNorad, sNorad, pId: e.PRIMARY_ID, sId: e.SECONDARY_ID,
          tcaJd, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S,
          pc10m, pcDis,
        });
      }
      fs.writeFileSync(doneFile, JSON.stringify({
        arm, windowIndex: k, startJd: w.startJd, durationDays: w.durationDays,
        objects: sources.length, candidates: run.candidates, withCov,
        excluded: run.excluded.map(([i, d]) => [...identities[i], d]),
        events: compact,
        ms: Date.now() - tw, timings: run.timings, rssMB: +(process.memoryUsage().rss / 1e6).toFixed(1),
      }));
      console.log(`[${arm} w${k}] events=${compact.length} (cov=${withCov}) cands=${run.candidates} (${((Date.now() - tw) / 1000).toFixed(1)}s)`);
    }
    await CAT_SCR.releaseIndex(ca.invoke, handle);
    await ca.destroy();
    return;
  }

  // AP or XP arm via public sdn-ap 0.7.5:
  //   - Fast orbits (~94% AP, 100% XP): evaluated via sdnap_epochs_at (0.008 ms/obj/epoch!)
  //   - Wide-branch eccentric AP orbits (~6% AP): loaded from pre-evaluated 5-day batch propagate() cache (110x faster!)
  //   - Full catalog loaded in a second epoch store (or same store) for exact TCA state + 6x6 TEME covariance -> compute_pc Foster 2-D
  const winHours = 4;
  const totalDays = smoke ? 4 / 24 : 5;
  const windows = CAT_SCR.screenWindows(T0_JD, totalDays, winHours);
  const segSec = 1200;
  const nSegs = Math.round((winHours * 3600) / segSec);
  const nTimes = nSegs * CHEB_N + 1;

  const binPath = smoke
    ? path.join(LIVE_DIR, `shard-2-${arm}.ocm.bin`)
    : path.join(LIVE_DIR, `${arm}-catalog.ocm.bin`);
  const fullBin = fs.readFileSync(binPath);

  // For AP arm, load pre-evaluated wide-branch trajectories and separate fast vs wide OCMs
  const wideMap = new Map(); // norad -> { data: Float64Array, offset: number, nAllTimes: number }
  let fastBin = fullBin;
  if (arm === 'ap') {
    const wideDir = path.join(LIVE_DIR, `wide-ap${smoke ? '-smoke' : ''}`);
    for (const f of fs.readdirSync(wideDir).filter((x) => /^wide-\d+\.json$/.test(x)).sort()) {
      const meta = JSON.parse(fs.readFileSync(path.join(wideDir, f), 'utf8'));
      const raw = fs.readFileSync(path.join(wideDir, f.replace('.json', '.f64')));
      const f64 = new Float64Array(raw.buffer, raw.byteOffset, raw.byteLength / 8);
      meta.norads.forEach((norad, m) => wideMap.set(norad, { f64, base: m * meta.nTimes * 6, nAllTimes: meta.nTimes }));
    }
    const fastChunks = [];
    for (let i = 0; i < fullBin.length;) {
      const sz = fullBin.readUInt32LE(i);
      const rec = fullBin.subarray(i, i + 4 + sz);
      const norad = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(rec.subarray(4))).METADATA()?.NORAD_CAT_ID();
      if (!wideMap.has(norad)) fastChunks.push(rec);
      i += 4 + sz;
    }
    fastBin = Buffer.concat(fastChunks);
  }

  // Fast epoch store (used for 145-epoch Chebyshev sampling of all fast orbits)
  const apFast = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(AP_WASM), surface: 'direct', initialMemoryBytes: 128 * 1024 * 1024 });
  const lrFast = await apFast.invoke({ methodId: 'load_epochs', inputs: [{ portId: 'ocm', typeRef: typeRef('OCM'), payload: fastBin }] });
  if (lrFast.statusCode !== 0) throw new Error(`load_epochs fast (${arm}) failed: ${lrFast.errorCode} ${lrFast.errorMessage}`);
  const xF = apFast.instance.exports;
  const nFast = xF.sdnap_epochs_count();
  const infoPtr = xF.sdnap_alloc(24);
  const seriesInfo = [];
  for (let i = 0; i < nFast; i++) {
    xF.sdnap_epochs_series(i, infoPtr, 0, 0);
    const v = new Float64Array(apFast.memory.buffer, infoPtr, 3);
    seriesInfo.push({ idx: i, norad: Math.round(v[0]), theory: Math.round(v[1]), isWide: false });
  }
  const wideNorads = [...wideMap.keys()];
  for (let j = 0; j < wideNorads.length; j++) {
    seriesInfo.push({ idx: nFast + j, norad: wideNorads[j], theory: OCM_MOD.meanElementSource.AP, isWide: true });
  }
  const nObj = seriesInfo.length;

  // Full epoch store (used ONLY at refined conjunction TCAs to evaluate exact state + 6x6 TEME covariance!)
  let apCov = apFast, xC = xF, covNoradToIdx = new Map(seriesInfo.filter((s) => !s.isWide).map((s) => [s.norad, s.idx]));
  if (arm === 'ap' && wideNorads.length > 0) {
    apCov = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(AP_WASM), surface: 'direct', initialMemoryBytes: 128 * 1024 * 1024 });
    const lrCov = await apCov.invoke({ methodId: 'load_epochs', inputs: [{ portId: 'ocm', typeRef: typeRef('OCM'), payload: fullBin }] });
    if (lrCov.statusCode !== 0) throw new Error(`load_epochs cov (${arm}) failed: ${lrCov.errorMessage}`);
    xC = apCov.instance.exports;
    const nC = xC.sdnap_epochs_count(), pC = xC.sdnap_alloc(24);
    covNoradToIdx = new Map();
    for (let i = 0; i < nC; i++) {
      xC.sdnap_epochs_series(i, pC, 0, 0);
      covNoradToIdx.set(Math.round(new Float64Array(apCov.memory.buffer, pC, 3)[0]), i);
    }
  }

  const outPtr = xF.sdnap_alloc(6 * nFast * 8);
  const stPtr = xF.sdnap_alloc(nFast * 4);
  const oneOutPtr = xC.sdnap_alloc(6 * 8);
  const oneStPtr = xC.sdnap_alloc(4);
  const oneCovPtr = xC.sdnap_alloc(36 * 8);
  const controls = { thresholdKm, coarseStepSec, workers: 1, algorithm: 'ALFANO_MAXIMUM' };

  const evalSingleWithCov = (idx, tcaJd) => {
    const [jw, jf] = jdSplitFromJd(tcaJd);
    const rc = xC.sdnap_epochs_at(jw, jf, idx, 1, 0, oneOutPtr, oneStPtr, oneCovPtr);
    if (rc !== 0) return null;
    const st = new Int32Array(apCov.memory.buffer, oneStPtr, 1)[0];
    if (st !== 0) return null;
    const sv = Array.from(new Float64Array(apCov.memory.buffer, oneOutPtr, 6));
    const cv = Array.from(new Float64Array(apCov.memory.buffer, oneCovPtr, 36));
    if (!sv.every(Number.isFinite)) return null;
    return { r: sv.slice(0, 3), v: sv.slice(3, 6), cov: cv.every(Number.isFinite) && cv[0] > 0 ? cv : null };
  };

  for (const k of winIndices) {
    const doneFile = path.join(outDir, `win-${String(k).padStart(2, '0')}.json`);
    if (fs.existsSync(doneFile)) continue;
    const w = windows[k];
    const tw = Date.now();
    const winStartMs = Math.round((w.startJd - 2440587.5) * 86400000);
    const globalTimeOff = k * nSegs * CHEB_N;

    const tProp0 = Date.now();
    const statesByTime = new Array(nTimes);
    const validMask = new Uint8Array(nObj).fill(1);
    for (let s = 0; s < nSegs; s++) {
      const segMidMs = winStartMs + (s + 0.5) * segSec * 1000;
      const halfMs = (segSec / 2) * 1000;
      const jStart = s === 0 ? 0 : 1;
      for (let j = jStart; j < CHEB_M; j++) {
        const tIdx = s * CHEB_N + j;
        const ms = segMidMs + CHEB_X[j] * halfMs;
        const [jw, jf] = jdSplit(ms);
        const rc = xF.sdnap_epochs_at(jw, jf, 0, nFast, 0, outPtr, stPtr, 0);
        if (rc !== 0) throw new Error(`sdnap_epochs_at failed rc=${rc}`);
        const stArr = new Int32Array(apFast.memory.buffer, stPtr, nFast);
        const fastSv = new Float64Array(apFast.memory.buffer, outPtr, 6 * nFast);
        const svArr = new Float64Array(6 * nObj);
        for (let ch = 0; ch < 6; ch++) svArr.set(fastSv.subarray(ch * nFast, (ch + 1) * nFast), ch * nObj);
        for (let i = 0; i < nFast; i++) {
          if (!validMask[i]) continue;
          if (stArr[i] !== 0) { validMask[i] = 0; continue; }
          const rx = svArr[i], ry = svArr[nObj + i], rz = svArr[2 * nObj + i];
          const r2 = rx * rx + ry * ry + rz * rz;
          if (!(r2 >= 6357.0 ** 2 && r2 <= 9.99e5 ** 2) || !Number.isFinite(svArr[3 * nObj + i])) validMask[i] = 0;
        }
        // Fill wide-branch orbits from pre-evaluated batch propagate() cache
        const gT = globalTimeOff + tIdx;
        for (let m = 0; m < wideNorads.length; m++) {
          const i = nFast + m;
          const wm = wideMap.get(wideNorads[m]);
          const off = wm.base + gT * 6;
          const rx = wm.f64[off], ry = wm.f64[off + 1], rz = wm.f64[off + 2];
          const vx = wm.f64[off + 3], vy = wm.f64[off + 4], vz = wm.f64[off + 5];
          svArr[i] = rx; svArr[nObj + i] = ry; svArr[2 * nObj + i] = rz;
          svArr[3 * nObj + i] = vx; svArr[4 * nObj + i] = vy; svArr[5 * nObj + i] = vz;
          if (validMask[i]) {
            const r2 = rx * rx + ry * ry + rz * rz;
            if (!(r2 >= 6357.0 ** 2 && r2 <= 9.99e5 ** 2) || !Number.isFinite(vx)) validMask[i] = 0;
          }
        }
        statesByTime[tIdx] = svArr;
      }
    }
    const propMs = Date.now() - tProp0;

    const tPack0 = Date.now();
    const { sources, prwFrames, dropped } = buildPrwFramesForWindow({
      arm, winStartMs, nSegs, segSec, statesByTime, validMask, seriesInfo, objects,
    });
    const packMs = Date.now() - tPack0;
    const tScr0 = Date.now();
    const handle = await CAT_SCR.prepareIndex(ca.invoke, sources, prwFrames);
    const identities = sources.map((s) => [s.OBJECT_ID, s.NORAD_CATALOG_ID]);
    const reqBytes = CAT_SCR.windowRequest(handle, 'TEME', w, controls);
    const run = await ALL_VS.screenAllVsAllOnGpu({
      invoke: ca.invoke,
      decodeCatalogResult: CAT_SCR.decodeCatalogResult,
      request: reqBytes,
      thresholdKm, coarseStepSec,
    });
    await CAT_SCR.releaseIndex(ca.invoke, handle);
    const screenMs = Date.now() - tScr0;

    const tPc0 = Date.now();
    const compact = [];
    let withCov = 0;
    for (const e of run.events) {
      const pNorad = e.PRIMARY_NORAD_ID, sNorad = e.SECONDARY_NORAD_ID;
      const tcaJd = e.TCA?.JULIAN_DATE;
      const iA = covNoradToIdx.get(pNorad), iB = covNoradToIdx.get(sNorad);
      let pcDis = null, pc10m = null;
      if (iA !== undefined && iB !== undefined && Number.isFinite(tcaJd)) {
        const sA = evalSingleWithCov(iA, tcaJd), sB = evalSingleWithCov(iB, tcaJd);
        if (sA?.cov && sB?.cov) {
          const bp = projectToBPlane(sA.r, sA.v, sA.cov, sB.r, sB.v, sB.cov);
          if (bp) {
            withCov++;
            pcDis = await ca.computePc(bp.cov2d, hbrOf(radii, pNorad, sNorad), bp.miss2d);
            pc10m = await ca.computePc(bp.cov2d, 10.0, bp.miss2d);
          }
        }
      }
      compact.push({
        pNorad, sNorad, pId: e.PRIMARY_ID, sId: e.SECONDARY_ID,
        tcaJd, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S,
        pcDis, pc10m,
      });
    }
    const pcMs = Date.now() - tPc0;
    fs.writeFileSync(doneFile, JSON.stringify({
      arm, windowIndex: k, startJd: w.startJd, durationDays: w.durationDays,
      objectsLoaded: nObj, objectsFast: nFast, objectsWide: wideNorads.length,
      objectsScreened: sources.length, droppedCount: dropped.length,
      candidates: run.candidates, withCov,
      excluded: [...run.excluded.map(([i, d]) => [...identities[i], d]), ...dropped.map((d) => [d.objectId, d.norad, d.jd])],
      events: compact,
      ms: Date.now() - tw, timings: { propMs, packMs, screenMs, pcMs, ...run.timings },
      rssMB: +(process.memoryUsage().rss / 1e6).toFixed(1),
    }));
    console.log(`[${arm} w${k}] screened=${sources.length}/${nObj} (fast=${nFast},wide=${wideNorads.length}) events=${compact.length} (cov=${withCov}) prop=${(propMs/1000).toFixed(1)}s pack=${(packMs/1000).toFixed(1)}s scr=${(screenMs/1000).toFixed(1)}s pc=${(pcMs/1000).toFixed(1)}s`);
  }
  if (apCov !== apFast) await apCov.destroy();
  await apFast.destroy();
  await ca.destroy();
}

// Score real 2026-11-24 Space-Track CDMs (TCA >= T0) across all 3 arms in compiled WASM (zero JS physics!)
async function scoreLiveCdms(objects) {
  const cdms = [
    ...JSON.parse(zlib.gunzipSync(fs.readFileSync(`${ARCHIVE}/spacetrack/cdm_public/2026/2026-11-24.json.gz`))),
    ...JSON.parse(zlib.gunzipSync(fs.readFileSync(`${ARCHIVE}/spacetrack/cdm_public/2026/2026-11-25.json.gz`))),
  ];
  const futureCdms = cdms.filter((c) => {
    const tcaMs = Date.parse(String(c.TCA).replace(' ', 'T') + (String(c.TCA).endsWith('Z') ? '' : 'Z'));
    return Number.isFinite(tcaMs) && tcaMs >= T0_MS && Number.isFinite(Number(c.MIN_RNG));
  });
  // Deduplicate to latest CDM per (sat1, sat2, tcaDay)
  const latestMap = new Map();
  for (const c of futureCdms) {
    const a = Math.min(Number(c.SAT_1_ID), Number(c.SAT_2_ID));
    const b = Math.max(Number(c.SAT_1_ID), Number(c.SAT_2_ID));
    const tcaMs = Date.parse(String(c.TCA).replace(' ', 'T') + (String(c.TCA).endsWith('Z') ? '' : 'Z'));
    const key = `${a}:${b}:${Math.round(tcaMs / 3600000)}`;
    const prev = latestMap.get(key);
    if (!prev || String(c.CREATED) > String(prev.CREATED)) latestMap.set(key, { a, b, tcaMs, minRngM: Number(c.MIN_RNG), pc: Number(c.PC) || 0, emg: c.EMERGENCY_REPORTABLE === 'Y' });
  }
  const uniq = [...latestMap.values()];
  // Load all 3 catalogs (SGP4 $OMM map, AP epoch store, XP epoch store)
  const sgp4Bytes = splitCatalogAuto(fs.readFileSync(path.join(LIVE_DIR, 'sgp4-catalog.omm.bin')));
  const sgp4Map = new Map();
  for (const b of sgp4Bytes) sgp4Map.set(OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(b)).NORAD_CAT_ID(), b);

  const openStore = async (binPath) => {
    const h = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(AP_WASM), surface: 'direct', initialMemoryBytes: 128 * 1024 * 1024 });
    const lr = await h.invoke({ methodId: 'load_epochs', inputs: [{ portId: 'ocm', typeRef: typeRef('OCM'), payload: fs.readFileSync(binPath) }] });
    if (lr.statusCode !== 0) throw new Error(`CDM load_epochs failed: ${lr.errorMessage}`);
    const x = h.instance.exports, n = x.sdnap_epochs_count(), p = x.sdnap_alloc(24);
    const map = new Map();
    for (let i = 0; i < n; i++) { x.sdnap_epochs_series(i, p, 0, 0); map.set(Math.round(new Float64Array(h.memory.buffer, p, 3)[0]), i); }
    const out = x.sdnap_alloc(48), st = x.sdnap_alloc(4);
    return {
      h, map,
      stateAt: (idx, ms) => {
        const [jw, jf] = jdSplit(ms);
        if (x.sdnap_epochs_at(jw, jf, idx, 1, 0, out, st, 0) !== 0) return null;
        if (new Int32Array(h.memory.buffer, st, 1)[0] !== 0) return null;
        return Array.from(new Float64Array(h.memory.buffer, out, 6));
      },
    };
  };
  const apSt = await openStore(path.join(LIVE_DIR, 'ap-catalog.ocm.bin'));
  const xpSt = await openStore(path.join(LIVE_DIR, 'xp-catalog.ocm.bin'));
  const ca = await openCaHarness();

  // Helper: 2-object 120-second screen around CDM TCA via compiled conjunction-assessment WASM
  const screenPairSgp4 = async (aId, bId, tcaMs) => {
    const bA = sgp4Map.get(aId), bB = sgp4Map.get(bId);
    if (!bA || !bB) return null;
    const sources = sgp4SourcesNormalized([bA, bB]);
    const h = await CAT_SCR.prepareIndex(ca.invoke, sources);
    const reqB = CAT_SCR.windowRequest(h, 'TEME', { startJd: (tcaMs - 60000) / 86400000 + 2440587.5, durationDays: 120 / 86400 },
      { thresholdKm: 500, coarseStepSec: 5, workers: 1, algorithm: 'ALFANO_MAXIMUM' });
    const run = await ALL_VS.screenAllVsAllOnGpu({ invoke: ca.invoke, decodeCatalogResult: CAT_SCR.decodeCatalogResult, request: reqB, thresholdKm: 500, coarseStepSec: 5 });
    await CAT_SCR.releaseIndex(ca.invoke, h);
    if (!run.events.length) return null;
    run.events.sort((x, y) => x.MISS_DISTANCE_M - y.MISS_DISTANCE_M);
    return run.events[0].MISS_DISTANCE_M;
  };
  const screenPairStore = async (st, arm, aId, bId, tcaMs) => {
    const iA = st.map.get(aId), iB = st.map.get(bId);
    if (iA === undefined || iB === undefined) return null;
    const winStartMs = tcaMs - 60000;
    const segSec = 120;
    const statesByTime = new Array(CHEB_M);
    const halfMs = 60000;
    for (let j = 0; j < CHEB_M; j++) {
      const ms = tcaMs + CHEB_X[j] * halfMs;
      const sA = st.stateAt(iA, ms), sB = st.stateAt(iB, ms);
      if (!sA || !sB) return null;
      const arr = new Float64Array(12);
      for (let ch = 0; ch < 6; ch++) { arr[ch * 2] = sA[ch]; arr[ch * 2 + 1] = sB[ch]; }
      statesByTime[j] = arr;
    }
    const { sources, prwFrames } = buildPrwFramesForWindow({
      arm, winStartMs, nSegs: 1, segSec, statesByTime, validMask: new Uint8Array([1, 1]),
      seriesInfo: [{ idx: 0, norad: aId }, { idx: 1, norad: bId }], objects,
    });
    const h = await CAT_SCR.prepareIndex(ca.invoke, sources, prwFrames);
    const reqB = CAT_SCR.windowRequest(h, 'TEME', { startJd: winStartMs / 86400000 + 2440587.5, durationDays: 120 / 86400 },
      { thresholdKm: 500, coarseStepSec: 5, workers: 1, algorithm: 'ALFANO_MAXIMUM' });
    const run = await ALL_VS.screenAllVsAllOnGpu({ invoke: ca.invoke, decodeCatalogResult: CAT_SCR.decodeCatalogResult, request: reqB, thresholdKm: 500, coarseStepSec: 5 });
    await CAT_SCR.releaseIndex(ca.invoke, h);
    if (!run.events.length) return null;
    run.events.sort((x, y) => x.MISS_DISTANCE_M - y.MISS_DISTANCE_M);
    return run.events[0].MISS_DISTANCE_M;
  };

  const errS = [], errA = [], errX = [];
  let apBeatsS = 0, apBeatsX = 0, xpBeatsS = 0;
  for (const c of uniq) {
    const mS = await screenPairSgp4(c.a, c.b, c.tcaMs);
    const mA = await screenPairStore(apSt, 'ap', c.a, c.b, c.tcaMs);
    const mX = await screenPairStore(xpSt, 'xp', c.a, c.b, c.tcaMs);
    if (mS == null || mA == null || mX == null) continue;
    const eS = Math.abs(mS - c.minRngM), eA = Math.abs(mA - c.minRngM), eX = Math.abs(mX - c.minRngM);
    errS.push(eS); errA.push(eA); errX.push(eX);
    if (eA < eS) apBeatsS++;
    if (eA < eX) apBeatsX++;
    if (eX < eS) xpBeatsS++;
  }
  await apSt.h.destroy(); await xpSt.h.destroy(); await ca.destroy();
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? +s[Math.floor(p * (s.length - 1))].toFixed(1) : null; };
  return {
    cdmsTotalAfterT0: futureCdms.length,
    uniqueEventsAfterT0: uniq.length,
    scoredAllThreeArms: errS.length,
    medianAbsMissErrM: { sgp4: q(errS, 0.5), sdnAp: q(errA, 0.5), sgp4Xp: q(errX, 0.5) },
    p95AbsMissErrM: { sgp4: q(errS, 0.95), sdnAp: q(errA, 0.95), sgp4Xp: q(errX, 0.95) },
    sdnApCloserThanSgp4Share: errS.length ? +(apBeatsS / errS.length).toFixed(4) : null,
    sdnApCloserThanSgp4XpShare: errS.length ? +(apBeatsX / errS.length).toFixed(4) : null,
    sgp4XpCloserThanSgp4Share: errS.length ? +(xpBeatsS / errS.length).toFixed(4) : null,
  };
}

// Worker: score strictly unseen future SpaceX Starlink truth cycle (2026-11-25T00-57-57-962Z) across all 3 arms!
async function scoreFutureStarlinkWorker(shard, total, outDir) {
  const truthDir = `${ARCHIVE}/operator-capture/cycles/2026-11-25T00-57-57-962Z`;
  const files = fs.readdirSync(truthDir).filter((f) => f.endsWith('.ocm')).sort();
  const mine = files.filter((_, i) => i % total === shard);
  const want = new Set(mine.map((f) => Number(f.slice(0, -4))));

  // Load matching OCM/OMM records for this shard
  const readPrefixedMap = (binPath) => {
    const buf = fs.readFileSync(binPath);
    const m = new Map();
    for (let i = 0; i < buf.length;) {
      const sz = buf.readUInt32LE(i);
      const slice = buf.subarray(i + 4, i + 4 + sz);
      const id = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(slice)).METADATA()?.NORAD_CAT_ID();
      if (want.has(id)) m.set(id, slice);
      i += 4 + sz;
    }
    return m;
  };
  const apMap = readPrefixedMap(path.join(LIVE_DIR, 'ap-catalog.ocm.bin'));
  const xpMap = readPrefixedMap(path.join(LIVE_DIR, 'xp-catalog.ocm.bin'));
  const apEval = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(AP_WASM), surface: 'direct', initialMemoryBytes: 64 * 1024 * 1024 });
  const sgp4Map = new Map();
  const sgp4Inputs = [];
  const sgp4Ids = [];
  for (const b of splitCatalogAuto(fs.readFileSync(path.join(LIVE_DIR, 'sgp4-catalog.omm.bin')))) {
    const omm = OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(b));
    if (want.has(omm.NORAD_CAT_ID())) {
      sgp4Ids.push(omm.NORAD_CAT_ID());
      sgp4Inputs.push({ portId: 'omm', typeRef: typeRef('OMM'), payload: new Uint8Array(b) });
    }
  }
  if (sgp4Inputs.length) {
    const ing = await apEval.invoke({ methodId: 'ingest_omm', inputs: sgp4Inputs });
    if (ing.statusCode !== 0) throw new Error(`ingest_omm failed: ${ing.errorMessage}`);
    for (let i = 0; i < ing.outputs.length; i++) sgp4Map.set(sgp4Ids[i], ing.outputs[i].payload);
  }
  const propGcrf = async (ocmBytes, epochs) => {
    const cfg = new PCF_MOD.PCFT();
    cfg.OUTPUT = new PCF_MOD.PCFOutputT(PCF_MOD.pcfOutputFrame.GCRF, 60, 500000, epochs);
    const b = new fb.Builder(2048);
    b.finish(cfg.pack(b), '$PCF');
    const r = await apEval.invoke({ methodId: 'propagate', inputs: [
      { portId: 'ocm', typeRef: typeRef('OCM'), payload: ocmBytes },
      { portId: 'configuration', typeRef: typeRef('PCF'), payload: b.asUint8Array() },
    ] });
    if (r.statusCode !== 0) return null;
    const blk = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(r.outputs.find((o) => o.portId === 'ephemeris').payload)).EPHEMERIS_DATA_BLOCK(0);
    return blk ? Array.from({ length: blk.ephemerisDataLinesLength() }, (_, i) => { const L = blk.EPHEMERIS_DATA_LINES(i); return [L.X(), L.Y(), L.Z()]; }) : null;
  };

  const BINS = [['6-12', 6, 12], ['12-18', 12, 18], ['18-24', 18, 24], ['24-48', 24, 48], ['48-72', 48, 72]];
  const rows = [];
  for (const f of mine) {
    const id = Number(f.slice(0, -4));
    const oA = apMap.get(id), oX = xpMap.get(id), oS = sgp4Map.get(id);
    if (!oA || !oX || !oS) continue;
    const tr = OCM_MOD.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(new Uint8Array(fs.readFileSync(path.join(truthDir, f))))).unpack();
    const t0 = Date.parse(tr.METADATA.START_TIME), step = tr.STATE_STEP_SIZE * 1000, nSt = tr.STATE_DATA.length / 6;
    // Sample every 15 minutes (every 15th 60s state -> ~96-288 points over 1-3d) for exact mean error per bin
    const stride = Math.max(1, Math.round(900000 / step));
    const pts = [];
    for (let i = 0; i < nSt; i += stride) {
      const ms = t0 + i * step;
      if (ms > T0_MS + 6 * HOUR_MS && ms <= T0_MS + 72 * HOUR_MS) {
        pts.push({ hr: (ms - T0_MS) / HOUR_MS, iso: new Date(ms).toISOString().replace('Z', ''), r: tr.STATE_DATA.slice(6 * i, 6 * i + 3) });
      }
    }
    if (pts.length < 4) continue;
    const epochs = pts.map((p) => p.iso);
    const fA = await propGcrf(oA, epochs), fX = await propGcrf(oX, epochs), fS = await propGcrf(oS, epochs);
    if (!fA || !fX || !fS || fA.length !== pts.length || fX.length !== pts.length || fS.length !== pts.length) continue;
    const binErr = {};
    for (const [bn, lo, hi] of BINS) {
      let sA = 0, sX = 0, sS = 0, cnt = 0;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].hr >= lo && pts[i].hr < hi) {
          const r = pts[i].r;
          sA += Math.hypot(fA[i][0] - r[0], fA[i][1] - r[1], fA[i][2] - r[2]);
          sX += Math.hypot(fX[i][0] - r[0], fX[i][1] - r[1], fX[i][2] - r[2]);
          sS += Math.hypot(fS[i][0] - r[0], fS[i][1] - r[1], fS[i][2] - r[2]);
          cnt++;
        }
      }
      if (cnt > 0) binErr[bn] = { ap: sA / cnt, xp: sX / cnt, sgp4: sS / cnt };
    }
    if (Object.keys(binErr).length) rows.push(binErr);
  }
  await apEval.destroy();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `sl-truth-${shard}.json`), JSON.stringify(rows));
  console.log(`[sl-truth ${shard}/${total}] scored ${rows.length}/${mine.length} unseen future Starlinks`);
}

function summarizeArmEvents(events, objects) {
  const views = ['allButStarlinkPairs', 'all', 'starlinkWithOthers', 'starlinkPairs', 'noStarlink'];
  const empty = () => ({
    total5km: 0, under2km: 0, under1km: 0,
    ussfMiss: 0,
    withNativeCov: 0,
    pc1e4_discos: 0, pc1e5_discos: 0, pc3e7_discos: 0,
    pc1e4_10m: 0, pc1e5_10m: 0, pc3e7_10m: 0,
  });
  const out = Object.fromEntries(views.map((v) => [v, empty()]));
  for (const e of events) {
    const oA = objects.get(e.pNorad), oB = objects.get(e.sNorad);
    const nSL = (oA?.isStarlink ? 1 : 0) + (oB?.isStarlink ? 1 : 0);
    const limM = (oA && oB && oA.hp < 2000 && oB.hp < 2000) ? 1000 : 5000;
    const targets = [out.all, nSL === 2 ? out.starlinkPairs : out.allButStarlinkPairs,
      nSL === 1 ? out.starlinkWithOthers : nSL === 0 ? out.noStarlink : null].filter(Boolean);
    for (const v of targets) {
      v.total5km++;
      if (e.missM < 2000) v.under2km++;
      if (e.missM < 1000) v.under1km++;
      if (e.missM < limM) v.ussfMiss++;
      if (e.pcDis !== null) {
        v.withNativeCov++;
        if (e.pcDis >= 1e-4) v.pc1e4_discos++;
        if (e.pcDis >= 1e-5) v.pc1e5_discos++;
        if (e.pcDis >= 3e-7) v.pc3e7_discos++;
      }
      if (e.pc10m !== null) {
        if (e.pc10m >= 1e-4) v.pc1e4_10m++;
        if (e.pc10m >= 1e-5) v.pc1e5_10m++;
        if (e.pc10m >= 3e-7) v.pc3e7_10m++;
      }
    }
  }
  return out;
}

function compareArms(eventsA, eventsB, tolSec = 10) {
  const byPairB = new Map();
  for (const e of eventsB) {
    const k = e.pNorad < e.sNorad ? `${e.pNorad}:${e.sNorad}` : `${e.sNorad}:${e.pNorad}`;
    (byPairB.get(k) ?? byPairB.set(k, []).get(k)).push(e);
  }
  const dMiss = [], dTcaMs = [];
  let matched = 0;
  for (const e of eventsA) {
    const k = e.pNorad < e.sNorad ? `${e.pNorad}:${e.sNorad}` : `${e.sNorad}:${e.pNorad}`;
    const cands = byPairB.get(k);
    if (!cands) continue;
    let best = null;
    for (const f of cands) {
      const dt = Math.abs(f.tcaJd - e.tcaJd) * 86400;
      if (dt <= tolSec && (!best || dt < best.dt)) best = { dt, f };
    }
    if (best) {
      matched++;
      dMiss.push(Math.abs(best.f.missM - e.missM));
      dTcaMs.push(best.dt * 1000);
    }
  }
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? +s[Math.floor(p * (s.length - 1))].toFixed(2) : null; };
  return {
    countA: eventsA.length, countB: eventsB.length, matched,
    overlapOfAShare: eventsA.length ? +(matched / eventsA.length).toFixed(4) : null,
    overlapOfBShare: eventsB.length ? +(matched / eventsB.length).toFixed(4) : null,
    medianMissDiffM: q(dMiss, 0.5), p95MissDiffM: q(dMiss, 0.95),
    medianTcaDiffMs: q(dTcaMs, 0.5), p95TcaDiffMs: q(dTcaMs, 0.95),
  };
}

function mergeArmWindows(outDir, nWin) {
  const allEvents = [], cutoffs = new Map();
  let totalWallMs = 0, peakRssMB = 0, totalCands = 0, objectsScreenedMin = Infinity;
  for (let k = 0; k < nWin; k++) {
    const d = JSON.parse(fs.readFileSync(path.join(outDir, `win-${String(k).padStart(2, '0')}.json`), 'utf8'));
    totalWallMs += d.ms;
    peakRssMB = Math.max(peakRssMB, d.rssMB || 0);
    totalCands += d.candidates || 0;
    objectsScreenedMin = Math.min(objectsScreenedMin, d.objectsScreened ?? d.objects ?? 0);
    for (const [id, norad, jd] of d.excluded ?? []) {
      const key = `${id}\u0000${norad ?? 0}`;
      if (!(cutoffs.get(key) <= jd)) cutoffs.set(key, jd);
    }
    allEvents.push(...d.events);
  }
  // Exact boundary deduplication + earliest-refusal filtering (matching gpu/allVsAll.mjs:mergeWindowEvents)
  const tolDays = 0.002 / 86400;
  allEvents.sort((a, b) => a.tcaJd - b.tcaJd);
  const kept = [];
  for (const e of allEvents) {
    const k1 = `${e.pId}\u0000${e.pNorad}`, k2 = `${e.sId}\u0000${e.sNorad}`;
    if ((cutoffs.has(k1) && e.tcaJd >= cutoffs.get(k1)) || (cutoffs.has(k2) && e.tcaJd >= cutoffs.get(k2))) continue;
    const pk = e.pNorad < e.sNorad ? `${e.pNorad}:${e.sNorad}` : `${e.sNorad}:${e.pNorad}`;
    let dup = false;
    for (let i = kept.length - 1; i >= 0 && e.tcaJd - kept[i].tcaJd <= tolDays; i--) {
      const qk = kept[i].pNorad < kept[i].sNorad ? `${kept[i].pNorad}:${kept[i].sNorad}` : `${kept[i].sNorad}:${kept[i].pNorad}`;
      if (qk === pk) { dup = true; break; }
    }
    if (!dup) kept.push(e);
  }
  return { events: kept, excludedObjects: cutoffs.size, sumWindowMs: totalWallMs, peakRssMB, totalCands, objectsScreenedMin };
}

async function runParent(workers, smoke) {
  const tStart = Date.now();
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const { objects } = loadObjectsAndRadii();
  const suffix = smoke ? '-smoke' : '';
  const armSpecs = [
    { arm: 'sgp4', nWin: smoke ? 1 : 20, dir: path.join(LIVE_DIR, `screen-sgp4${suffix}`) },
    { arm: 'ap', nWin: smoke ? 1 : 30, dir: path.join(LIVE_DIR, `screen-ap${suffix}`) },
    { arm: 'xp', nWin: smoke ? 1 : 30, dir: path.join(LIVE_DIR, `screen-xp${suffix}`) },
  ];

  const armWallMs = {};
  // Pre-evaluate wide-branch eccentric AP orbits ONCE over all 5 days' Chebyshev-Lobatto epochs (110x speedup!)
  {
    const tWide = Date.now();
    const wideDir = path.join(LIVE_DIR, `wide-ap${suffix}`);
    const wideWorkers = smoke ? 1 : Math.max(workers, 8);
    await Promise.all(Array.from({ length: wideWorkers }, (_, w) => new Promise((resolve, reject) => {
      const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF,
        '--wide-worker', String(w), '--of', String(wideWorkers), '--out', wideDir, ...(smoke ? ['--smoke'] : [])],
        { stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`wide worker ${w} exited ${code}`))));
    })));
    armWallMs.apWidePreEval = Date.now() - tWide;
  }
  for (const spec of armSpecs) {
    const tArm = Date.now();
    const wCount = Math.min(workers, spec.nWin);
    const lists = Array.from({ length: wCount }, (_, w) =>
      Array.from({ length: spec.nWin }, (_, i) => i).filter((i) => i % wCount === w));
    await Promise.all(lists.map((idxs, w) => new Promise((resolve, reject) => {
      const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=6144', SELF,
        '--screen-worker', spec.arm, '--windows', idxs.join(','), '--out', spec.dir, ...(smoke ? ['--smoke'] : [])],
        { stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${spec.arm} worker ${w} exited ${code}`))));
    })));
    armWallMs[spec.arm] = Date.now() - tArm;
  }

  const merged = {};
  for (const spec of armSpecs) merged[spec.arm] = mergeArmWindows(spec.dir, spec.nWin);

  if (smoke) {
    console.log('PHASE 6 SMOKE PASS:', JSON.stringify({
      sgp4: { events: merged.sgp4.events.length, wallMs: armWallMs.sgp4 },
      ap: { events: merged.ap.events.length, wallMs: armWallMs.ap },
      xp: { events: merged.xp.events.length, wallMs: armWallMs.xp },
    }, null, 2));
    return;
  }

  // Score real 2026-11-24 CDMs (TCA >= T0)
  console.log('Scoring real 2026-11-24 Space-Track CDMs (TCA >= T0)...');
  const cdmResults = await scoreLiveCdms(objects);

  // Score strictly unseen future 2026-11-25T00-57-57-962Z SpaceX Starlink ephemeris truth across 8 workers
  console.log('Scoring strictly unseen future SpaceX Starlink truth (2026-11-25T00-57-57-962Z)...');
  const slDir = path.join(LIVE_DIR, 'future-starlink');
  const slWorkers = Math.max(workers, 8);
  await Promise.all(Array.from({ length: slWorkers }, (_, w) => new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF,
      '--sl-truth-worker', String(w), '--of', String(slWorkers), '--out', slDir], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`sl-truth worker ${w} exited ${code}`))));
  })));
  const slRows = [];
  for (let w = 0; w < slWorkers; w++) slRows.push(...JSON.parse(fs.readFileSync(path.join(slDir, `sl-truth-${w}.json`), 'utf8')));
  const slBins = {};
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? +s[Math.floor(p * (s.length - 1))].toFixed(4) : null; };
  for (const bn of ['6-12', '12-18', '18-24', '24-48', '48-72']) {
    const pts = slRows.filter((r) => r[bn]);
    if (!pts.length) continue;
    const apV = pts.map((r) => r[bn].ap), xpV = pts.map((r) => r[bn].xp), sV = pts.map((r) => r[bn].sgp4);
    slBins[bn] = {
      satellites: pts.length,
      medianKm: { sgp4: q(sV, 0.5), sdnAp: q(apV, 0.5), sgp4Xp: q(xpV, 0.5) },
      p95Km: { sgp4: q(sV, 0.95), sdnAp: q(apV, 0.95), sgp4Xp: q(xpV, 0.95) },
      sdnApCloserThanSgp4Share: +(pts.filter((r) => r[bn].ap < r[bn].sgp4).length / pts.length).toFixed(4),
      sdnApCloserThanSgp4XpShare: +(pts.filter((r) => r[bn].ap < r[bn].xp).length / pts.length).toFixed(4),
      over1km: { sgp4: sV.filter((v) => v > 1).length, sdnAp: apV.filter((v) => v > 1).length, sgp4Xp: xpV.filter((v) => v > 1).length },
      over5km: { sgp4: sV.filter((v) => v > 5).length, sdnAp: apV.filter((v) => v > 5).length, sgp4Xp: xpV.filter((v) => v > 5).length },
    };
  }

  const buildSummary = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, 'build-summary.json'), 'utf8'));
  const sanitizedBuildSummary = { ...buildSummary };
  delete sanitizedBuildSummary.apBranches;
  const report = {
    schema: 'sdn-ap-live-3arm-ca-rollup-1',
    version: '0.7.5',
    generatedUtc: new Date().toISOString(),
    t0: T0_ISO,
    screenDays: 5,
    thresholdKm: 5,
    coarseStepSec: 60,
    causality: {
      gpSnapshot: '2026-11-24 (max creation <= T0)',
      operatorStarlinkCycle: '2026-11-24T16-57-57-960Z (< T0)',
      unseenFutureStarlinkTruthCycle: '2026-11-25T00-57-57-962Z (> T0)',
      spaceWeather: 'GFZ 2026-11-24 nowcast (updated 13:50Z < T0)',
      cdmPublic: 'Space-Track 2026-11-24 public CDMs (TCA >= T0)',
    },
    artifacts: {
      sdnApWasmSha256: sha256File(AP_WASM),
      conjunctionAssessmentWasmSha256: sha256File(CA_WASM),
      sgp4ErmSha256: sha256File(ERM_PATH),
    },
    catalogBuild: sanitizedBuildSummary,
    screening: {
      sgp4: { wallMs: armWallMs.sgp4, ...merged.sgp4, events: undefined, totalEvents: merged.sgp4.events.length, views: summarizeArmEvents(merged.sgp4.events, objects) },
      sdnAp: { wallMs: armWallMs.ap, ...merged.ap, events: undefined, totalEvents: merged.ap.events.length, views: summarizeArmEvents(merged.ap.events, objects) },
      sgp4Xp: { wallMs: armWallMs.xp, ...merged.xp, events: undefined, totalEvents: merged.xp.events.length, views: summarizeArmEvents(merged.xp.events, objects) },
    },
    pairwiseOverlap: {
      sdnAp_vs_sgp4: compareArms(merged.ap.events, merged.sgp4.events),
      sdnAp_vs_sgp4Xp: compareArms(merged.ap.events, merged.xp.events),
      sgp4Xp_vs_sgp4: compareArms(merged.xp.events, merged.sgp4.events),
    },
    liveCdmAccuracy: cdmResults,
    unseenFutureStarlinkTruth: {
      truthCycle: '2026-11-25T00-57-57-962Z',
      satellitesScoredAllThreeArms: slRows.length,
      bins: slBins,
    },
    totalWallMs: Date.now() - tStart,
  };
  const outPath = path.join(RESULTS_DIR, 'live-ca-screen-0.7.5.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`PHASE 6 COMPLETE -> ${outPath}`);
  console.log(JSON.stringify({
    totalEvents: { sgp4: report.screening.sgp4.totalEvents, sdnAp: report.screening.sdnAp.totalEvents, sgp4Xp: report.screening.sgp4Xp.totalEvents },
    allButStarlinkPairs: {
      sgp4: report.screening.sgp4.views.allButStarlinkPairs,
      sdnAp: report.screening.sdnAp.views.allButStarlinkPairs,
      sgp4Xp: report.screening.sgp4Xp.views.allButStarlinkPairs,
    },
    liveCdmAccuracy: report.liveCdmAccuracy,
    unseenFutureStarlinkTruth: report.unseenFutureStarlinkTruth,
  }, null, 2));
}

if (arg('--wide-worker') !== null) {
  await runWidePreEvalWorker(Number(arg('--wide-worker')), Number(arg('--of', '8')), arg('--out'), hasFlag('--smoke'));
} else if (arg('--screen-worker')) {
  await runScreenWorker(arg('--screen-worker'), arg('--windows').split(',').map(Number), arg('--out'), hasFlag('--smoke'));
} else if (arg('--sl-truth-worker') !== null) {
  await scoreFutureStarlinkWorker(Number(arg('--sl-truth-worker')), Number(arg('--of', '8')), arg('--out'));
} else {
  await runParent(Number(arg('--workers', '6')), hasFlag('--smoke'));
}
process.exit(0);
