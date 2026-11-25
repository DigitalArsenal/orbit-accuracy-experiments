#!/usr/bin/env node
// Amendment 4 Option 2 + Option 3 (#1126): Fresh Forward Week Conjunction Notification Reduction,
// Pre-T0 Class-Conditioned Robust/Mixture RTN Covariance, 90%/95% Operator Recall, Pc ROC & Tier Precision.
//
// Evaluates ALL 6 ARMS over the fresh unseen forward week (2026-11-17 to 2026-11-24, 32,923 objects,
// tiers t0 + t1 + t2 + t3 up to 1,000 km) with 100% genuine signed RTN error vectors across all 8 regimes
// (unified sdn-ap 0.7.2 + catalog-builder 0.2.4), strict temporal pre-T0 covariance training (zero leakage),
// exact Foster 2-D mixture Pc via analysis/conjunction-assessment 0.19.1 WASM, and paired cluster bootstrap
// (NORAD + day + pair clusters).
//
// Outputs AGGREGATES ONLY to results/ca-rollup-072/amendment4-alerts-3arm.json.
//
// Usage:
//   node amendment4-alerts-eval.mjs --workers 14 --miss-reps 200 --pc-reps 40 [--smoke]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256, sha256File, nowUtc, utcMs } from './amendment4-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const CA_DIR = path.join(MODULES, 'analysis/conjunction-assessment');
const CFG_PATH = path.join(path.dirname(SELF), 'amendment4-config.json');
const CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const RUNS_ROOT = path.join(OAE, 'runs/ca-rollup-072/amendment4');
const SCREEN_DIR = path.join(RUNS_ROOT, 'screen-20261117');
const SCRATCH = path.join(RUNS_ROOT, 'eval-scratch');
const OUT_PATH = path.join(OAE, 'results/ca-rollup-072/amendment4-alerts-3arm.json');

const REGIMES = ['SD', 'S1', 'DO', 'GD', 'GN', 'GE', 'IG', 'SL'];
const REGIME_LABEL = {
  SD: 'perigee under 600 km',
  S1: 'perigee 600 to 750 km',
  DO: 'perigee 750 to 2000 km',
  GD: 'perigee 2000 to 15000 km',
  GN: 'perigee 15000 to 30000 km',
  GE: 'geostationary',
  IG: 'inclined geosynchronous',
  SL: 'Starlink',
};
const GROUP_TO_REGIME = { P: 'SD', S1: 'S1', DO: 'DO', GD: 'GD', GN: 'GN', GE: 'GE', IG: 'IG' };
const SL = REGIMES.indexOf('SL');
const DO_IDX = REGIMES.indexOf('DO');
const ARMS = CFG.evaluation.arms; // ['S', 'SupGP', 'Xp', 'Op', 'X', 'O']
const LEADS = CFG.evaluation.leadsDays; // [1, 3]
const VIEWS = CFG.evaluation.views; // ['allButStarlinkPairs', 'noStarlink', 'starlinkWithOthers', 'all', 'starlinkPairs']
const PC_LIMITS = CFG.evaluation.pcLimits; // [1e-4, 1e-5, 3e-7]
const TARGET_RECALLS = CFG.evaluation.targetRecalls;
const RECORD = 14;
const CHI3 = [3.527, 8.025, 14.156];
const NOMINAL = [0.683, 0.954, 0.997];
const CHI3_MEDIAN = CFG.covariance.chi3Median; // 2.365973884
const CHI3_Q90 = 6.251388631; // chi2_3(0.90) for post-diagnostic sensitivity ONLY
const CHI3_TAIL = CFG.covariance.tailThresholdChi3; // 17.730
const EXACT_PC_BOUND_MIN = 2e-8; // 15x below 3e-7 so all published limits are 100% exact WASM Foster 2-D

const sig = (x, n = 4) => (Number.isFinite(x) ? Number(x.toPrecision(n)) : null);
const quantile = (sorted, q) => {
  if (!sorted.length) return NaN;
  const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
};
function rngOf(text) {
  const h = crypto.createHash('sha256').update(text).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12) | 1;
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function checkFrozenAndPins() {
  if (!CFG.frozen) throw new Error('amendment4-config.json is not frozen');
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'experiments/ca-rollup-072/AMENDMENT-4.md', 'experiments/ca-rollup-072/amendment4-config.json'], { cwd: OAE, encoding: 'utf8' }).trim();
  if (dirty) throw new Error(`Amendment 4 registration dirty/uncommitted: ${dirty}`);
  const caSha = sha256File(path.join(CA_DIR, 'dist/isomorphic/module.wasm'));
  if (caSha !== CFG.modules.conjunctionAssessment.wasmSha256) throw new Error(`CA wasm mismatch: ${caSha}`);
}

function orbitOf(g) {
  const n = Number(g.MEAN_MOTION), e = Number(g.ECCENTRICITY), inc = Number(g.INCLINATION);
  const a = Math.cbrt(398600.4418 / (n * 2 * Math.PI / 86400) ** 2);
  return {
    e, inc, hp: a * (1 - e) - 6378.137,
    name: String(g.OBJECT_NAME ?? ''),
    objectType: String(g.OBJECT_TYPE ?? 'UNKNOWN').toUpperCase(),
  };
}
function regimeOf(o) {
  if (/^STARLINK/i.test(o.name)) return SL;
  if (o.e >= 0.1) return -1;
  const r = o.hp < 600 ? 'SD' : o.hp < 750 ? 'S1' : o.hp < 2000 ? 'DO' : o.hp < 15000 ? 'GD' : o.hp < 30000 ? 'GN' : o.inc < 5 ? 'GE' : 'IG';
  return REGIMES.indexOf(r);
}

function loadObjectsAndDisCos() {
  const snapPath = path.join(ARCHIVE, CFG.forwardWeek.gpSnapshot);
  if (sha256File(snapPath) !== CFG.forwardWeek.gpSnapshotSha256) throw new Error('GP snapshot SHA mismatch');
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(snapPath)));
  const maxC = Date.parse(CFG.forwardWeek.maxCreationUtc);
  const newest = new Map();
  for (const g of raw) {
    if (utcMs(g.CREATION_DATE) > maxC) continue;
    const id = Number(g.NORAD_CAT_ID), p = newest.get(id);
    if (!p || utcMs(g.EPOCH) > utcMs(p.EPOCH)) newest.set(id, g);
  }
  const objects = new Map([...newest].map(([id, g]) => [id, orbitOf(g)]));

  // ESA DISCOS radii + objectClass/active (known strictly before T0)
  const radii = new Map();
  const discosClass = new Map();
  const discosDir = path.join(ARCHIVE, CFG.radii.discosDir);
  for (const f of fs.readdirSync(discosDir).filter((x) => /^objects-\d+\.json$/.test(x))) {
    let doc; try { doc = JSON.parse(fs.readFileSync(path.join(discosDir, f), 'utf8')); } catch { continue; }
    for (const it of doc.data ?? []) {
      const a = it.attributes ?? {}, id = Number(a.satno);
      if (!Number.isInteger(id)) continue;
      discosClass.set(id, { objectClass: a.objectClass ?? null, active: a.active ?? null });
      const dims = [a.span, a.height, a.width, a.depth, a.diameter].map(Number).filter((x) => Number.isFinite(x) && x > 0);
      if (dims.length) radii.set(id, { r: Math.max(...dims) / 2, how: 'discosDimension' });
      else if (Number(a.xSectMax) > 0) radii.set(id, { r: Math.sqrt(Number(a.xSectMax) / Math.PI), how: 'discosSection' });
    }
  }
  const satcatPath = path.join(ARCHIVE, CFG.radii.satcatFile);
  if (sha256File(satcatPath) !== CFG.radii.satcatSha256) throw new Error('SATCAT SHA mismatch');
  const RCS = { SMALL: 0.1, MEDIUM: 0.5, LARGE: 1.5 };
  for (const row of JSON.parse(zlib.gunzipSync(fs.readFileSync(satcatPath)))) {
    const id = Number(row.NORAD_CAT_ID);
    if (!radii.has(id) && RCS[row.RCS_SIZE]) radii.set(id, { r: RCS[row.RCS_SIZE], how: 'rcs' });
  }
  const isManeuverablePayload = (id, o) => {
    const d = discosClass.get(id);
    if (d?.objectClass) {
      if (d.objectClass !== 'Payload') return 0;
      if (d.active === false) return 0;
      return 1;
    }
    return o.objectType === 'PAYLOAD' ? 1 : 0;
  };
  return { objects, radii, isManeuverablePayload };
}

// 3x3 symmetric matrix helpers [xx, xy, xz, yy, yz, zz]
function inv3([a, b, c, d, e, f]) {
  const A = d * f - e * e, B = c * e - b * f, C = b * e - c * d;
  const det = a * A + b * B + c * C;
  if (!(det > 0) || !Number.isFinite(det)) return null;
  return [A / det, B / det, C / det, (a * f - c * c) / det, (b * c - a * e) / det, (a * d - b * b) / det];
}
const quad = (P, u0, u1, u2) => P[0] * u0 * u0 + 2 * P[1] * u0 * u1 + 2 * P[2] * u0 * u2 + P[3] * u1 * u1 + 2 * P[4] * u1 * u2 + P[5] * u2 * u2;
const proj = (G, o, e) => [G[o] * e[0] + G[o + 1] * e[1] + G[o + 2] * e[2], G[o + 3] * e[0] + G[o + 4] * e[1] + G[o + 5] * e[2]];
function inPlane(G, o, S) {
  const p = [G[o], G[o + 1], G[o + 2]], q = [G[o + 3], G[o + 4], G[o + 5]];
  const Sv = (v) => [S[0] * v[0] + S[1] * v[1] + S[2] * v[2], S[1] * v[0] + S[3] * v[1] + S[4] * v[2], S[2] * v[0] + S[4] * v[1] + S[5] * v[2]];
  const Sp = Sv(p), Sq = Sv(q);
  return [p[0] * Sp[0] + p[1] * Sp[1] + p[2] * Sp[2], p[0] * Sq[0] + p[1] * Sq[1] + p[2] * Sq[2], q[0] * Sq[0] + q[1] * Sq[1] + q[2] * Sq[2]];
}

// Pre-registered Amendment 4 robust core + heavy-tail/maneuver mixture estimator (STRICTLY on train rows!)
function fitRobustMixtureCov(trainVecs, scaleMode = 'a4_med50') {
  const n = trainVecs.length;
  if (n < 4) return null;
  const madScale = (c) => {
    const abs = trainVecs.map((v) => Math.abs(v[c])).sort((a, b) => a - b);
    return Math.max(1.4826 * quantile(abs, 0.5), 1e-4);
  };
  const sR = madScale(0), sT = madScale(1), sN = madScale(2);
  const ranked = trainVecs.map((v, i) => ({
    i, v, u: Math.hypot(v[0] / sR, v[1] / sT, v[2] / sN),
  })).sort((a, b) => a.u - b.u);

  const keepN = n >= 20 ? Math.max(6, Math.floor(n * CFG.covariance.coreTrimFraction)) : n;
  const core = ranked.slice(0, keepN);
  const M = [0, 0, 0, 0, 0, 0];
  for (const { v } of core) {
    M[0] += v[0] * v[0]; M[1] += v[0] * v[1]; M[2] += v[0] * v[2];
    M[3] += v[1] * v[1]; M[4] += v[1] * v[2]; M[5] += v[2] * v[2];
  }
  const Mn = M.map((x) => x / keepN);
  const tr = Mn[0] + Mn[3] + Mn[5];
  const reg = Math.max(1e-12 * tr, 1e-12);
  Mn[0] += reg; Mn[3] += reg; Mn[5] += reg;
  const Mi = inv3(Mn);
  if (!Mi) return null;
  let s2;
  if (scaleMode === 'q90_all') {
    const d2All = trainVecs.map((v) => quad(Mi, v[0], v[1], v[2])).sort((a, b) => a - b);
    s2 = Math.max(quantile(d2All, 0.90) / CHI3_Q90, 1e-12);
  } else {
    const d2Core = core.map(({ v }) => quad(Mi, v[0], v[1], v[2])).sort((a, b) => a - b);
    s2 = Math.max(quantile(d2Core, CFG.covariance.coreScaleQuantile) / CHI3_MEDIAN, 1e-12);
  }
  const C_core = Mn.map((x) => x * s2);
  const C_core_inv = inv3(C_core);
  if (!C_core_inv) return null;

  // Tail / maneuver mixture component: train rows outside 3.5-sigma of C_core (d^2 > 17.730)
  const tail = trainVecs.filter((v) => quad(C_core_inv, v[0], v[1], v[2]) > CHI3_TAIL);
  const wm = tail.length / n;
  let C_tail = C_core.slice();
  if (tail.length >= 2) {
    const T = [0, 0, 0, 0, 0, 0];
    for (const v of tail) {
      T[0] += v[0] * v[0]; T[1] += v[0] * v[1]; T[2] += v[0] * v[2];
      T[3] += v[1] * v[1]; T[4] += v[1] * v[2]; T[5] += v[2] * v[2];
    }
    C_tail = T.map((x, k) => x / tail.length + 0.05 * C_core[k]);
  } else if (tail.length === 1) {
    const v = tail[0];
    C_tail = [
      C_core[0] + v[0] * v[0], C_core[1] + v[0] * v[1], C_core[2] + v[0] * v[2],
      C_core[3] + v[1] * v[1], C_core[4] + v[1] * v[2], C_core[5] + v[2] * v[2],
    ];
  }
  return { C_core, C_core_inv, wm, C_tail, C_tail_inv: inv3(C_tail), nTrain: n, nCore: keepN, nTail: tail.length };
}

// Load ALL 8 regimes' genuine signed RTN vectors (strictly split into temporal pre-T0 train vs disjoint eval)
function loadAllSignedPools() {
  const pubPath = path.join(RUNS_ROOT, 'public-vectors-072.jsonl');
  const slTrainPath = path.join(RUNS_ROOT, 'starlink-train-rows.jsonl');
  const slEvalPath = path.join(RUNS_ROOT, 'starlink-eval-rows.jsonl');

  const rawByGroup = Object.fromEntries(LEADS.map((L) => [L, {}]));
  for (const line of fs.readFileSync(pubPath, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    for (const L of LEADS) {
      const d = r.days?.[String(L)];
      if (!d?.vKm?.S || !d?.vKm?.O || !d?.vKm?.X) continue;
      (rawByGroup[L][r.group] ||= []).push({
        norad: r.norad,
        startUtc: r.startUtc,
        v: { S: d.vKm.S, SupGP: d.vKm.S, Xp: d.vKm.X, Op: d.vKm.O, X: d.vKm.X, O: d.vKm.O },
      });
    }
  }

  const trainPools = Object.fromEntries(LEADS.map((L) => [L, REGIMES.map(() => [])]));
  const evalPools = Object.fromEntries(LEADS.map((L) => [L, REGIMES.map(() => [])]));
  const lsSplit = Object.fromEntries(LEADS.map((L) => [L, { train: [], eval: [] }]));

  // Strict temporal 50/50 split for all precise-orbit groups (earlier timestamps = train, later = eval)
  for (const L of LEADS) {
    for (const [grp, rows] of Object.entries(rawByGroup[L])) {
      rows.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.norad - b.norad);
      const mid = Math.floor(rows.length / 2);
      const tr = rows.slice(0, mid);
      const ev = rows.slice(mid);
      if (grp === 'LS') {
        lsSplit[L] = { train: tr, eval: ev };
      } else if (GROUP_TO_REGIME[grp]) {
        const reg = REGIMES.indexOf(GROUP_TO_REGIME[grp]);
        trainPools[L][reg] = tr;
        evalPools[L][reg] = ev;
      }
    }
  }

  // Starlink: strictly earlier cycle (2026-11-22 -> 2026-11-23) = train, disjoint eval cycle (2026-11-24 -> 2026-11-25) = eval
  const readSl = (p) => {
    const out = [];
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      const b = r.bins?.['18-24']?.vecKm;
      if (!b || !ARMS.every((k) => Array.isArray(b[k]))) continue;
      out.push({ norad: r.norad, startUtc: p.includes('train') ? '2026-11-22' : '2026-11-24', v: b });
    }
    return out;
  };
  trainPools[1][SL] = readSl(slTrainPath);
  evalPools[1][SL] = readSl(slEvalPath);

  return { trainPools, evalPools, lsSplit };
}

function fitAndAuditCovariances(trainPools, evalPools, lsSplit, scaleMode = 'a4_med50') {
  const models = {};
  const lsModels = {};
  const audit = [];
  for (const K of ARMS) {
    models[K] = {};
    lsModels[K] = {};
    for (const L of LEADS) {
      models[K][L] = REGIMES.map(() => null);
      lsModels[K][L] = fitRobustMixtureCov(lsSplit[L].train.map((r) => r.v[K]), scaleMode);
      REGIMES.forEach((g, reg) => {
        const tr = trainPools[L][reg], ev = evalPools[L][reg];
        if (!tr.length || !ev.length) return;
        const m = fitRobustMixtureCov(tr.map((r) => r.v[K]), scaleMode);
        if (!m) return;
        models[K][L][reg] = m;
        // Held-out evaluation audit strictly on disjoint eval rows!
        const d2Ev = ev.map((r) => quad(m.C_core_inv, ...r.v[K]));
        const fCore = CHI3.map((c) => d2Ev.filter((x) => x <= c).length / ev.length);
        // 2-component mixture predictive containment via analytic Gaussian mixture CDF at 1/2/3 sigma of core
        const d2TailEv = ev.map((r) => quad(m.C_tail_inv, ...r.v[K]));
        const fMix = CHI3.map((c, idx) => {
          const corePass = d2Ev.filter((x) => x <= c).length / ev.length;
          // Under mixture, an event lies inside the effective 95% HDR if core d^2<=c or tail d^2<=c when drawn from tail
          const tailPass = d2TailEv.filter((x) => x <= c).length / ev.length;
          return (1 - m.wm) * corePass + m.wm * Math.max(corePass, tailPass);
        });
        const coreOk = Math.abs(fCore[0] - NOMINAL[0]) <= 0.05 && Math.abs(fCore[1] - NOMINAL[1]) <= 0.05 && (1 - fCore[2]) <= 0.01;
        audit.push({
          side: K, lead: L, regime: g, label: REGIME_LABEL[g],
          trainRows: tr.length, evalRows: ev.length,
          trainTimeSpan: [tr[0].startUtc.slice(0, 10), tr.at(-1).startUtc.slice(0, 10)],
          evalTimeSpan: [ev[0].startUtc.slice(0, 10), ev.at(-1).startUtc.slice(0, 10)],
          coreSigmaRtnKm: [0, 3, 5].map((k) => sig(Math.sqrt(m.C_core[k]))),
          tailWeight: sig(m.wm, 3),
          tailSigmaRtnKm: [0, 3, 5].map((k) => sig(Math.sqrt(m.C_tail[k]))),
          heldOutCoreInside123Sigma: fCore.map((x) => sig(x, 3)),
          heldOutMixtureInside123Sigma: fMix.map((x) => sig(x, 3)),
          gaussianCoreStatus: coreOk ? 'REALISTIC' : 'HEAVY_TAILED',
        });
      });
    }
  }
  return { models, lsModels, audit };
}

function prepareWeekScratch(objects, radii, isManeuverablePayload) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const indexPath = path.join(SCRATCH, 'index.json');
  const index = { tiers: {}, excluded: {}, inputs: {}, radiusHow: { discosDimension: 0, discosSection: 0, rcs: 0, default: 0 }, doClassCounts: { payload: 0, passive: 0 } };
  for (const t of CFG.forwardWeek.tiers) {
    const id = t.id;
    const meta = JSON.parse(fs.readFileSync(path.join(SCREEN_DIR, 'events', `${id}.json`), 'utf8'));
    const evFile = path.join(SCREEN_DIR, 'events', `${id}.f64`);
    const gFile = path.join(SCREEN_DIR, 'geom', `${id}.f32`);
    const dFile = path.join(SCREEN_DIR, 'geom', `${id}.day.u8`);
    index.inputs[id] = { events: sha256File(evFile), geometry: sha256File(gFile), digest: meta.digest, kept: meta.kept };
    const evb = fs.readFileSync(evFile), gb = fs.readFileSync(gFile), db = fs.readFileSync(dFile);
    const ev = new Float64Array(evb.buffer, evb.byteOffset, evb.byteLength / 8);
    const g = new Float32Array(gb.buffer, gb.byteOffset, gb.byteLength / 4);
    const days = new Uint8Array(db.buffer, db.byteOffset, db.byteLength);
    const n = ev.length / 17;
    const keepG = [], keepM = [], keepR = [], keepP = [];
    const ex = { highlyEllipticalOrNoRegime: 0, notInSnapshot: 0 };
    for (let i = 0; i < n; i++) {
      const A = ev[i * 17], B = ev[i * 17 + 1], oA = objects.get(A), oB = objects.get(B);
      if (!oA || !oB) { ex.notInSnapshot++; continue; }
      const rA = regimeOf(oA), rB = regimeOf(oB);
      if (rA < 0 || rB < 0) { ex.highlyEllipticalOrNoRegime++; continue; }
      const pA = isManeuverablePayload(A, oA), pB = isManeuverablePayload(B, oB);
      if (id === 't0') {
        if (rA === DO_IDX) index.doClassCounts[pA ? 'payload' : 'passive']++;
        if (rB === DO_IDX) index.doClassCounts[pB ? 'payload' : 'passive']++;
      }
      const rad = (id2) => { const x = radii.get(id2); if (x) { index.radiusHow[x.how]++; return x.r; } index.radiusHow.default++; return 0.5; };
      keepG.push(g.subarray(i * RECORD, (i + 1) * RECORD));
      // M stride 6: [rA, rB, pA, pB, limKm, dayIdx]
      keepM.push(rA, rB, pA, pB, oA.hp < 2000 && oB.hp < 2000 ? 1 : 5, days[i]);
      keepR.push(rad(A) + rad(B));
      // Compact pair hash (0..65535) for O(1) pair-cluster bootstrap
      const lo = Math.min(A, B) >>> 0, hi = Math.max(A, B) >>> 0;
      keepP.push(((lo * 2654435761) ^ (hi * 2246822519)) & 65535);
    }
    const m = keepR.length;
    const G = new Float32Array(m * RECORD), M = Uint8Array.from(keepM), R = Float32Array.from(keepR), P = Uint16Array.from(keepP);
    keepG.forEach((x, j) => G.set(x, j * RECORD));
    fs.writeFileSync(path.join(SCRATCH, `${id}.g.f32`), Buffer.from(G.buffer));
    fs.writeFileSync(path.join(SCRATCH, `${id}.m.u8`), Buffer.from(M.buffer));
    fs.writeFileSync(path.join(SCRATCH, `${id}.r.f32`), Buffer.from(R.buffer));
    fs.writeFileSync(path.join(SCRATCH, `${id}.p.u16`), Buffer.from(P.buffer));
    const weight = meta.fraction === 1 ? 1 : (meta.catalog * (meta.catalog - 1)) / (meta.objects * (meta.objects - 1));
    index.tiers[id] = { n: m, read: n, weight, thresholdKm: meta.thresholdKm };
    index.excluded[id] = ex;
  }
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return index;
}

function loadTier(id, index) {
  const rd = (ext, T) => { const b = fs.readFileSync(path.join(SCRATCH, `${id}.${ext}`)); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
  return { id, G: rd('g.f32', Float32Array), M: rd('m.u8', Uint8Array), R: rd('r.f32', Float32Array), P: rd('p.u16', Uint16Array), ...index.tiers[id] };
}

async function openPcHarness() {
  const req = createRequire(path.join(CA_DIR, 'package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const { createBrowserModuleHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/host/browser-module')).href);
  const CQR_MOD = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/CQR/main.js')).href);
  const wasmPath = path.join(CA_DIR, 'dist/isomorphic/module.wasm');
  const h = await createBrowserModuleHarness({
    wasmSource: fs.readFileSync(wasmPath),
    manifest: JSON.parse(fs.readFileSync(path.join(CA_DIR, 'plugin-manifest.json'), 'utf8')),
    surface: 'direct',
    enableBrowserWasiThreads: false,
  });
  const typeRef = { schemaName: 'CQR.fbs', fileIdentifier: '$CQR', rootTypeName: 'CQR', wireFormat: 'flatbuffer' };
  async function pc2d(c11, c12, c22, hbrM, xm, zm, weight = 1) {
    const det = c11 * c22 - c12 * c12;
    if (!(det > 0) || !Number.isFinite(det)) return { p: 0, exact: false };
    const tr = c11 + c22;
    const lmin = (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2;
    if (!(lmin > 0)) return { p: 0, exact: false };
    const d2 = Math.max(0, (c22 * xm * xm - 2 * c12 * xm * zm + c11 * zm * zm) / det);
    const d = Math.sqrt(d2), hRad = hbrM / Math.sqrt(lmin);
    const bound = (hbrM * hbrM) / (2 * Math.sqrt(det)) * Math.exp(-(Math.max(0, d - hRad) ** 2) / 2);
    if (weight * bound < EXACT_PC_BOUND_MIN) {
      // Smooth continuous Gaussian point-mass tail score ONLY for < 2e-8 ROC ordering (never triggers >= 3e-7!)
      const approx = (hbrM * hbrM) / (2 * Math.sqrt(det)) * Math.exp(-0.5 * d2);
      return { p: weight * approx < 2.5e-7 ? approx : 0, exact: false };
    }
    const b = new fb.Builder(512);
    const rec = new CQR_MOD.CQRT();
    rec.PROBABILITY_REQUEST = new CQR_MOD.CQRProbabilityRequestT(
      new CQR_MOD.CQRPlaneGeometryT(xm, zm, c11, c12, c22, hbrM),
      CQR_MOD.cqrProbabilityAlgorithm.FOSTER,
    );
    CQR_MOD.CQR.finishCQRBuffer(b, rec.pack(b));
    const r = await h.invoke({ methodId: 'compute_pc', inputs: [{ portId: 'request', typeRef, payload: b.asUint8Array() }] });
    if (r.statusCode !== 0) return { p: 0, exact: false };
    const res = CQR_MOD.CQR.getRootAsCQR(new fb.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack().PROBABILITY_RESULT;
    return { p: res?.CONVERGED && Number.isFinite(res.PROBABILITY) ? res.PROBABILITY : 0, exact: true };
  }
  return { pc2d, destroy: () => h.destroy?.() };
}

// Compute swept recall curve + ROC for a list of (score, weight, isReal) arrays
function computeMissRecallCurve(realByArm, allByArm, allW, sgp4At1kmMissed, totalRealW) {
  const sgp4Recall = totalRealW > 0 ? 1 - sgp4At1kmMissed / totalRealW : 0;
  // Build sorted real scores per arm (ascending miss distance -> smaller = stronger alert)
  const out = { sgp4_1km_recall: sig(sgp4Recall, 4), totalRealLeo1km: sig(totalRealW, 5), byTarget: {} };
  const sgp4Fixed1kmNotif = (() => {
    let s = 0;
    const arr = allByArm.S;
    for (let i = 0; i < arr.length; i++) if (arr[i] < 1.0) s += allW[i];
    return s;
  })();
  out.sgp4Fixed1kmNotif = sig(sgp4Fixed1kmNotif, 5);

  const targets = [['sgp4_1km', sgp4Recall], ...TARGET_RECALLS.map((q) => [`r${Math.round(q * 100)}`, q])];
  const sortedReal = {};
  for (const K of ARMS) {
    // Each entry: [pm, w] sorted ascending by pm
    sortedReal[K] = realByArm[K].slice().sort((a, b) => a[0] - b[0]);
  }
  for (const [label, targetQ] of targets) {
    const needW = targetQ * totalRealW;
    const row = { targetRecall: sig(targetQ, 4), arms: {} };
    for (const K of ARMS) {
      const sr = sortedReal[K];
      let acc = 0, R = 0;
      if (label === 'sgp4_1km' && K === 'S') {
        R = 1.0;
      } else {
        for (let i = 0; i < sr.length; i++) {
          acc += sr[i][1];
          if (acc >= needW - 1e-9) { R = sr[i][0] * (1 + 1e-7); break; }
        }
        if (acc < needW - 1e-9 && sr.length) R = sr.at(-1)[0] * (1 + 1e-7);
      }
      let notif = 0;
      const arr = allByArm[K];
      for (let i = 0; i < arr.length; i++) if (arr[i] < R) notif += allW[i];
      let caught = 0;
      for (let i = 0; i < sr.length; i++) if (sr[i][0] < R) caught += sr[i][1];
      row.arms[K] = {
        radiusKm: sig(R, 4),
        truncatedAt1000Km: R > 1000,
        notif: sig(notif, 5),
        caughtReal: sig(caught, 5),
        realizedRecall: totalRealW > 0 ? sig(caught / totalRealW, 4) : null,
      };
    }
    const baseS = row.arms.S.notif;
    row.reductionVsSgp4Pct = Object.fromEntries(ARMS.map((K) => [K, baseS > 0 ? sig(100 * (1 - row.arms[K].notif / baseS), 4) : null]));
    out.byTarget[label] = row;
  }
  return out;
}

// Compute Matched-Recall Pc ROC + PR-AUC (larger Pc = stronger alert!)
function computePcRoc(realPcByArm, allPcByArm, allW, totalRealW) {
  const sgp4RecAt = (lim) => {
    let c = 0;
    for (const [p, w] of realPcByArm.S) if (p >= lim) c += w;
    return totalRealW > 0 ? c / totalRealW : 0;
  };
  const r1e5 = sgp4RecAt(1e-5), r3e7 = sgp4RecAt(3e-7);
  const targets = [
    ['sgp4_pc1e-5', r1e5],
    ['sgp4_pc3e-7', r3e7],
    ['r90', 0.90],
    ['r95', 0.95],
  ];
  const sortedReal = {};
  for (const K of ARMS) {
    // Descending Pc
    sortedReal[K] = realPcByArm[K].slice().sort((a, b) => b[0] - a[0]);
  }
  const byTarget = {};
  for (const [label, targetQ] of targets) {
    const needW = targetQ * totalRealW;
    const row = { targetRecall: sig(targetQ, 4), arms: {} };
    for (const K of ARMS) {
      const sr = sortedReal[K];
      let acc = 0, thresh = 0;
      if (label === 'sgp4_pc1e-5' && K === 'S') thresh = 1e-5;
      else if (label === 'sgp4_pc3e-7' && K === 'S') thresh = 3e-7;
      else {
        for (let i = 0; i < sr.length; i++) {
          acc += sr[i][1];
          if (acc >= needW - 1e-9) { thresh = sr[i][0] * (1 - 1e-7); break; }
        }
      }
      let notif = 0, caught = 0;
      const arr = allPcByArm[K];
      for (let i = 0; i < arr.length; i++) if (arr[i] >= thresh && thresh > 0) notif += allW[i];
      for (let i = 0; i < sr.length; i++) if (sr[i][0] >= thresh && thresh > 0) caught += sr[i][1];
      row.arms[K] = {
        pcThreshold: thresh > 0 ? Number(thresh.toExponential(3)) : 0,
        notif: sig(notif, 5),
        caughtReal: sig(caught, 5),
        realizedRecall: totalRealW > 0 ? sig(caught / totalRealW, 4) : null,
      };
    }
    const baseS = row.arms.S.notif;
    row.reductionVsSgp4Pct = Object.fromEntries(ARMS.map((K) => [K, baseS > 0 ? sig(100 * (1 - row.arms[K].notif / baseS), 4) : null]));
    byTarget[label] = row;
  }

  // PR-AUC (average precision over top-ranked events down to Pc >= 1e-40) using 157 log-spaced Pc thresholds
  const prAuc = {};
  const grid = Array.from({ length: 157 }, (_, i) => Math.pow(10, -1 - i * 0.25)); // 1e-1 .. 1e-40
  for (const K of ARMS) {
    const arr = allPcByArm[K], sr = realPcByArm[K];
    let prevR = 0, auc = 0;
    for (const th of grid) {
      let tp = 0, tot = 0;
      for (let i = 0; i < sr.length; i++) if (sr[i][0] >= th) tp += sr[i][1];
      for (let i = 0; i < arr.length; i++) if (arr[i] >= th) tot += allW[i];
      const rec = totalRealW > 0 ? tp / totalRealW : 0;
      const prec = tot > 0 ? tp / tot : 1;
      if (rec > prevR) { auc += (rec - prevR) * prec; prevR = rec; }
    }
    prAuc[K] = sig(auc, 4);
  }
  return { sgp4RecallAt1e5: sig(r1e5, 4), sgp4RecallAt3e7: sig(r3e7, 4), byTarget, prAuc };
}

async function runReplicate(rep, ctx, mode = 'primary') {
  const { evalPools, lsSplit, models, lsModels, tiers, pc, doPc } = ctx;
  const out = {};
  for (const L of LEADS) {
    const rng = rngOf(`${CFG.evaluation.rngSeed}:${mode}:${rep}:${L}`);
    // Cluster bootstrap 1: resample error pools by satellite (NORAD) cluster
    const resamplePool = (rows) => {
      if (rep === 0 || !rows.length) return rows;
      const byObj = new Map();
      for (const r of rows) { (byObj.get(r.norad) ?? byObj.set(r.norad, []).get(r.norad)).push(r); }
      const clusters = [...byObj.values()], pick = [];
      for (let k = 0; k < clusters.length; k++) pick.push(...clusters[Math.floor(rng() * clusters.length)]);
      return pick;
    };
    const use = evalPools[L].map(resamplePool);
    const useLs = resamplePool(lsSplit[L].eval);

    // Cluster bootstrap 2: day-of-week block weights (7 daily blocks, sum = 7)
    const dayMult = new Float64Array(7).fill(1);
    if (rep > 0) {
      dayMult.fill(0);
      for (let d = 0; d < 7; d++) dayMult[Math.floor(rng() * 7)] += 1;
    }
    // Cluster bootstrap 3: Rubin Bayesian pair-cluster weights (Exp(1), mean 1, across 65536 pair buckets)
    const pairMult = new Float32Array(65536).fill(1);
    if (rep > 0) {
      let sumP = 0;
      for (let p = 0; p < 65536; p++) { const v = -Math.log(Math.max(1e-12, 1 - rng())); pairMult[p] = v; sumP += v; }
      const scaleP = 65536 / sumP;
      for (let p = 0; p < 65536; p++) pairMult[p] *= scaleP;
    }

    const tierUse = rep === 0
      ? [
        ['t0', 1],
        ['t1-s1', 1 / 3], ['t1-s2', 1 / 3], ['t1-s3', 1 / 3],
        ['t2-s1', 1 / 3], ['t2-s2', 1 / 3], ['t2-s3', 1 / 3],
        ['t3-s1', 1 / 3], ['t3-s2', 1 / 3], ['t3-s3', 1 / 3],
      ]
      : [
        ['t0', 1],
        [`t1-s${1 + (rep % 3)}`, 1],
        [`t2-s${1 + (Math.floor(rep / 3) % 3)}`, 1],
        [`t3-s${1 + (Math.floor(rep / 9) % 3)}`, 1],
      ];

    const emptyView = () => ({
      fixed1kmNotif: Object.fromEntries(ARMS.map((K) => [K, 0])),
      fixed1kmMissed: Object.fromEntries(ARMS.map((K) => [K, 0])),
      realTotal: 0,
      realLeo1km: 0,
      weightTotal: 0,
      pcTiers: Object.fromEntries(ARMS.map((K) => [K, {
        redNotif: 0, redReal: 0, // >= 1e-4
        yellowNotif: 0, yellowReal: 0, // 1e-5 .. 1e-4
        cum1e5Notif: 0, cum1e5Real: 0, // >= 1e-5
        cum3e7Notif: 0, cum3e7Real: 0, // >= 3e-7
      }])),
      pcExactCalls: 0,
    });
    const views = Object.fromEntries(VIEWS.map((v) => [v, emptyView()]));

    // Tracking arrays for recall curves & Pc ROC on the two headline views: allButStarlinkPairs & noStarlink
    const curveViews = ['allButStarlinkPairs', 'noStarlink'];
    const realMiss = Object.fromEntries(curveViews.map((v) => [v, Object.fromEntries(ARMS.map((K) => [K, []]))]));
    const allMiss = Object.fromEntries(curveViews.map((v) => [v, Object.fromEntries(ARMS.map((K) => [K, []]))]));
    const allW = Object.fromEntries(curveViews.map((v) => [v, []]));
    const realPc = Object.fromEntries(curveViews.map((v) => [v, Object.fromEntries(ARMS.map((K) => [K, []]))]));
    const allPc = Object.fromEntries(curveViews.map((v) => [v, Object.fromEntries(ARMS.map((K) => [K, []]))]));

    let leftOutSl3d = 0, leftOutNoRows = 0;

    for (const [id, share] of tierUse) {
      const t = tiers[id];
      const baseW = t.weight * share;
      const isT0 = id === 't0';
      const G = t.G, M = t.M, R = t.R, P = t.P;

      for (let i = 0; i < t.n; i++) {
        const mOff = i * 6;
        const rA = M[mOff], rB = M[mOff + 1], pA = M[mOff + 2], pB = M[mOff + 3], lim = M[mOff + 4], dayIdx = M[mOff + 5];
        const dm = dayMult[dayIdx];
        if (dm === 0) continue;
        const w = baseW * dm * pairMult[P[i]];
        if (L === 3 && (rA === SL || rB === SL)) { leftOutSl3d += w; continue; }

        const useLsA = mode === 'do_passive_as_ls' && rA === DO_IDX && pA === 0;
        const useLsB = mode === 'do_passive_as_ls' && rB === DO_IDX && pB === 0;
        const poolA = useLsA ? useLs : use[rA];
        const poolB = useLsB ? useLs : use[rB];
        if (!poolA.length || !poolB.length) { leftOutNoRows += w; continue; }

        const rowA = poolA[Math.floor(rng() * poolA.length)];
        const rowB = poolB[Math.floor(rng() * poolB.length)];
        const o = i * RECORD, miss = G[o];
        const isReal = isT0 && miss < lim;
        const isRealLeo1 = isT0 && lim === 1 && miss < 1;
        const nSL = (rA === SL) + (rB === SL);

        const targetNames = ['all', nSL === 2 ? 'starlinkPairs' : 'allButStarlinkPairs'];
        if (nSL === 1) targetNames.push('starlinkWithOthers');
        if (nSL === 0) targetNames.push('noStarlink');

        for (const vn of targetNames) {
          const v = views[vn];
          v.weightTotal += w;
          if (isReal) v.realTotal += w;
          if (isRealLeo1) v.realLeo1km += w;
        }
        const inAllButSl = nSL < 2 && lim === 1;
        const inNoSl = nSL === 0 && lim === 1;
        if (inAllButSl) allW.allButStarlinkPairs.push(w);
        if (inNoSl) allW.noStarlink.push(w);

        const hbr = R[i];
        for (const K of ARMS) {
          const eA = proj(G, o + 2, rowA.v[K]);
          const eB = proj(G, o + 8, rowB.v[K]);
          const x = miss + eA[0] - eB[0], z = eA[1] - eB[1];
          const pm = Math.hypot(x, z);
          const alert = pm < lim;
          for (const vn of targetNames) {
            const v = views[vn];
            if (alert) v.fixed1kmNotif[K] += w;
            else if (isReal) v.fixed1kmMissed[K] += w;
          }
          if (inAllButSl) {
            allMiss.allButStarlinkPairs[K].push(pm);
            if (isRealLeo1) realMiss.allButStarlinkPairs[K].push([pm, w]);
          }
          if (inNoSl) {
            allMiss.noStarlink[K].push(pm);
            if (isRealLeo1) realMiss.noStarlink[K].push([pm, w]);
          }

          if (!doPc) continue;
          // Exact WASM Foster 2-D Pc on starlinkPairs (nSL === 2, uncoordinated GP noise excluded from headline & Pc ROC)
          // runs on the central primary estimate (rep === 0); bootstrap replicates and sensitivities evaluate exact WASM Pc on all nSL < 2 views.
          if (nSL === 2 && (rep > 0 || mode !== 'primary')) continue;
          const mA = useLsA ? lsModels[K][L] : models[K][L][rA];
          const mB = useLsB ? lsModels[K][L] : models[K][L][rB];
          if (!mA || !mB) continue;

          // Pre-T0 class-conditioned mixture weights (DO passive debris has wm_eff = 0; robust_core_only has wm = 0)
          const wmA = mode === 'robust_core_only' ? 0 : (rA === DO_IDX && pA === 0 ? CFG.covariance.doPassiveManeuverWeight : mA.wm);
          const wmB = mode === 'robust_core_only' ? 0 : (rB === DO_IDX && pB === 0 ? CFG.covariance.doPassiveManeuverWeight : mB.wm);
          const xm = x * 1000, zm = z * 1000;

          const cA0 = inPlane(G, o + 2, mA.C_core);
          const cB0 = inPlane(G, o + 8, mB.C_core);
          let pMix = 0;
          let exactCalls = 0;

          const evalComp = async (cA, cB, weight) => {
            if (weight <= 0) return;
            const res = await pc.pc2d((cA[0] + cB[0]) * 1e6, (cA[1] + cB[1]) * 1e6, (cA[2] + cB[2]) * 1e6, hbr, xm, zm, weight);
            pMix += weight * res.p;
            if (res.exact) exactCalls++;
          };

          await evalComp(cA0, cB0, (1 - wmA) * (1 - wmB));
          if (wmA > 0) {
            const cA1 = inPlane(G, o + 2, mA.C_tail);
            await evalComp(cA1, cB0, wmA * (1 - wmB));
            if (wmB > 0) {
              const cB1 = inPlane(G, o + 8, mB.C_tail);
              await evalComp(cA0, cB1, (1 - wmA) * wmB);
              await evalComp(cA1, cB1, wmA * wmB);
            }
          } else if (wmB > 0) {
            const cB1 = inPlane(G, o + 8, mB.C_tail);
            await evalComp(cA0, cB1, (1 - wmA) * wmB);
          }

          for (const vn of targetNames) {
            const v = views[vn];
            v.pcExactCalls += exactCalls;
            const pt = v.pcTiers[K];
            if (pMix >= 1e-4) { pt.redNotif += w; if (isReal) pt.redReal += w; }
            else if (pMix >= 1e-5) { pt.yellowNotif += w; if (isReal) pt.yellowReal += w; }
            if (pMix >= 1e-5) { pt.cum1e5Notif += w; if (isReal) pt.cum1e5Real += w; }
            if (pMix >= 3e-7) { pt.cum3e7Notif += w; if (isReal) pt.cum3e7Real += w; }
          }
          if (inAllButSl) {
            allPc.allButStarlinkPairs[K].push(pMix);
            if (isRealLeo1) realPc.allButStarlinkPairs[K].push([pMix, w]);
          }
          if (inNoSl) {
            allPc.noStarlink[K].push(pMix);
            if (isRealLeo1) realPc.noStarlink[K].push([pMix, w]);
          }
        }
      }
    }

    const recallCurves = {};
    const pcRoc = {};
    for (const vn of curveViews) {
      const v = views[vn];
      const sgp4MissedLeo1 = realMiss[vn].S.reduce((s, [pm, w]) => s + (pm >= 1.0 ? w : 0), 0);
      recallCurves[vn] = computeMissRecallCurve(realMiss[vn], allMiss[vn], allW[vn], sgp4MissedLeo1, v.realLeo1km);
      if (doPc) pcRoc[vn] = computePcRoc(realPc[vn], allPc[vn], allW[vn], v.realLeo1km);
    }

    out[L] = { views, recallCurves, pcRoc: doPc ? pcRoc : null, leftOut: { starlinkAt3Days: sig(leftOutSl3d, 5), noRows: sig(leftOutNoRows, 5) } };
  }
  return out;
}

async function childWorker() {
  const mode = arg('--mode', 'primary');
  const reps = arg('--reps', '').split(',').filter(Boolean).map(Number);
  const pcReps = Number(arg('--pc-reps', '0'));
  const { evalPools, trainPools, lsSplit } = loadAllSignedPools();
  const scaleMode = mode === 'post_diagnostic_q90_core' ? 'q90_all' : 'a4_med50';
  const { models, lsModels } = fitAndAuditCovariances(trainPools, evalPools, lsSplit, scaleMode);
  const index = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'index.json'), 'utf8'));
  const tiers = Object.fromEntries(CFG.forwardWeek.tiers.map((t) => [t.id, loadTier(t.id, index)]));
  const needPc = reps.some((r) => r <= pcReps);
  const pc = needPc ? await openPcHarness() : null;
  const ctx = { evalPools, lsSplit, models, lsModels, tiers, pc };
  const dir = path.join(SCRATCH, `reps-${mode}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const rep of reps) {
    const outFile = path.join(dir, `${rep}.json`);
    if (fs.existsSync(outFile)) continue;
    const t0 = Date.now();
    const doPc = rep <= pcReps;
    const res = await runReplicate(rep, { ...ctx, doPc }, mode);
    fs.writeFileSync(`${outFile}.tmp`, JSON.stringify({ rep, doPc, mode, sec: +((Date.now() - t0) / 1000).toFixed(1), res }));
    fs.renameSync(`${outFile}.tmp`, outFile);
    console.log(`${nowUtc()} [${mode}] rep=${rep} pc=${doPc} (${((Date.now() - t0) / 1000).toFixed(1)}s, pcCalls1d=${res[1].views.all.pcExactCalls})`);
  }
  await pc?.destroy?.();
}

function interval95(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length >= 10 ? [sig(quantile(s, 0.025), 4), sig(quantile(s, 0.975), 4)] : null;
}

function aggregateReps(reps, L) {
  const c0 = reps[0].res[L];
  const bsMiss = reps.slice(1).map((r) => r.res[L]);
  const bsPc = reps.slice(1).filter((r) => r.doPc).map((r) => r.res[L]);

  // Summarize recall curves with paired cluster bootstrap 95% CIs
  const recallCurves = {};
  for (const vn of ['allButStarlinkPairs', 'noStarlink']) {
    const rc0 = c0.recallCurves[vn];
    const byTarget = {};
    for (const [label, row0] of Object.entries(rc0.byTarget)) {
      const arms = {};
      const redVsS = {};
      const redVsX = {};
      for (const K of ARMS) {
        arms[K] = {
          ...row0.arms[K],
          notifInterval95: interval95(bsMiss.map((b) => b.recallCurves[vn].byTarget[label].arms[K].notif)),
          radiusInterval95: interval95(bsMiss.map((b) => b.recallCurves[vn].byTarget[label].arms[K].radiusKm)),
        };
        const baseS = row0.arms.S.notif;
        const baseX = row0.arms.X.notif;
        redVsS[K] = {
          pct: baseS > 0 ? sig(100 * (1 - row0.arms[K].notif / baseS), 4) : null,
          ci95: interval95(bsMiss.map((b) => {
            const s = b.recallCurves[vn].byTarget[label].arms.S.notif;
            const k = b.recallCurves[vn].byTarget[label].arms[K].notif;
            return s > 0 ? 100 * (1 - k / s) : NaN;
          })),
        };
        redVsX[K] = {
          pct: baseX > 0 ? sig(100 * (1 - row0.arms[K].notif / baseX), 4) : null,
          ci95: interval95(bsMiss.map((b) => {
            const x = b.recallCurves[vn].byTarget[label].arms.X.notif;
            const k = b.recallCurves[vn].byTarget[label].arms[K].notif;
            return x > 0 ? 100 * (1 - k / x) : NaN;
          })),
        };
      }
      byTarget[label] = { targetRecall: row0.targetRecall, arms, reductionVsSgp4: redVsS, reductionVsSgp4Xp: redVsX };
    }
    recallCurves[vn] = { sgp4_1km_recall: rc0.sgp4_1km_recall, totalRealLeo1km: rc0.totalRealLeo1km, sgp4Fixed1kmNotif: rc0.sgp4Fixed1kmNotif, byTarget };
  }

  // Summarize fixed-1km & Pc tiers with tier precision & bootstrap CIs
  const viewsOut = {};
  for (const vn of VIEWS) {
    const v0 = c0.views[vn];
    const fixed1km = {
      realTotal: sig(v0.realTotal, 5),
      realLeo1km: sig(v0.realLeo1km, 5),
      notif: Object.fromEntries(ARMS.map((K) => [K, sig(v0.fixed1kmNotif[K], 5)])),
      missed: Object.fromEntries(ARMS.map((K) => [K, sig(v0.fixed1kmMissed[K], 5)])),
      missedReductionVsSgp4Pct: Object.fromEntries(ARMS.map((K) => [K, v0.fixed1kmMissed.S > 0 ? sig(100 * (1 - v0.fixed1kmMissed[K] / v0.fixed1kmMissed.S), 4) : null])),
    };
    const pcTiers = {};
    for (const [tKey, nField, rField] of [
      ['pc1e-4_red', 'redNotif', 'redReal'],
      ['pc1e-5_to_1e-4_yellow', 'yellowNotif', 'yellowReal'],
      ['pc1e-5_cum', 'cum1e5Notif', 'cum1e5Real'],
      ['pc3e-7_cum', 'cum3e7Notif', 'cum3e7Real'],
    ]) {
      const notif = {}, realCaught = {}, precisionPct = {}, redVsS = {}, redVsX = {};
      for (const K of ARMS) {
        const nVal = v0.pcTiers[K][nField], rVal = v0.pcTiers[K][rField];
        notif[K] = sig(nVal, 5);
        realCaught[K] = sig(rVal, 5);
        precisionPct[K] = nVal > 0 ? sig(100 * rVal / nVal, 4) : null;
        const nS = v0.pcTiers.S[nField], nX = v0.pcTiers.X[nField];
        const hasPcCi = vn !== 'starlinkPairs' && vn !== 'all';
        redVsS[K] = {
          pct: nS > 0 ? sig(100 * (1 - nVal / nS), 4) : null,
          ci95: hasPcCi ? interval95(bsPc.map((b) => {
            const s = b.views[vn].pcTiers.S[nField], k = b.views[vn].pcTiers[K][nField];
            return s > 0 ? 100 * (1 - k / s) : NaN;
          })) : null,
        };
        redVsX[K] = {
          pct: nX > 0 ? sig(100 * (1 - nVal / nX), 4) : null,
          ci95: hasPcCi ? interval95(bsPc.map((b) => {
            const x = b.views[vn].pcTiers.X[nField], k = b.views[vn].pcTiers[K][nField];
            return x > 0 ? 100 * (1 - k / x) : NaN;
          })) : null,
        };
      }
      pcTiers[tKey] = { notif, realCaught, tierPrecisionPct: precisionPct, reductionVsSgp4: redVsS, reductionVsSgp4Xp: redVsX };
    }
    viewsOut[vn] = { weightTotal: sig(v0.weightTotal, 5), pcExactCalls: v0.pcExactCalls, fixed1km, pcTiers };
  }

  // Summarize Matched-Recall Pc ROC with bootstrap CIs
  const pcRoc = {};
  if (c0.pcRoc) {
    for (const vn of ['allButStarlinkPairs', 'noStarlink']) {
      const pr0 = c0.pcRoc[vn];
      const byTarget = {};
      for (const [label, row0] of Object.entries(pr0.byTarget)) {
        const arms = {}, redVsS = {}, redVsX = {};
        for (const K of ARMS) {
          arms[K] = {
            ...row0.arms[K],
            notifInterval95: interval95(bsPc.map((b) => b.pcRoc[vn].byTarget[label].arms[K].notif)),
          };
          const s0 = row0.arms.S.notif, x0 = row0.arms.X.notif;
          redVsS[K] = {
            pct: s0 > 0 ? sig(100 * (1 - row0.arms[K].notif / s0), 4) : null,
            ci95: interval95(bsPc.map((b) => {
              const s = b.pcRoc[vn].byTarget[label].arms.S.notif, k = b.pcRoc[vn].byTarget[label].arms[K].notif;
              return s > 0 ? 100 * (1 - k / s) : NaN;
            })),
          };
          redVsX[K] = {
            pct: x0 > 0 ? sig(100 * (1 - row0.arms[K].notif / x0), 4) : null,
            ci95: interval95(bsPc.map((b) => {
              const x = b.pcRoc[vn].byTarget[label].arms.X.notif, k = b.pcRoc[vn].byTarget[label].arms[K].notif;
              return x > 0 ? 100 * (1 - k / x) : NaN;
            })),
          };
        }
        byTarget[label] = { targetRecall: row0.targetRecall, arms, reductionVsSgp4: redVsS, reductionVsSgp4Xp: redVsX };
      }
      pcRoc[vn] = {
        sgp4RecallAt1e5: pr0.sgp4RecallAt1e5,
        sgp4RecallAt3e7: pr0.sgp4RecallAt3e7,
        prAuc: pr0.prAuc,
        prAucInterval95: Object.fromEntries(ARMS.map((K) => [K, interval95(bsPc.map((b) => b.pcRoc[vn].prAuc[K]))])),
        byTarget,
      };
    }
  }

  // Attribution waterfall on allButStarlinkPairs
  const waterfall = {};
  for (const label of ['sgp4_1km', 'r90', 'r95']) {
    const a = recallCurves.allButStarlinkPairs.byTarget[label].arms;
    const base = a.S.notif;
    waterfall[label] = {
      S_sgp4: a.S.notif,
      SupGP: a.SupGP.notif,
      Xp_propagatorOnly: a.Xp.notif,
      Op_sdnApPublicOnly: a.Op.notif,
      X_xpWithOperatorStarlink: a.X.notif,
      O_sdnApWithOperatorStarlink: a.O.notif,
      stepDeltaPctOfSgp4: base > 0 ? {
        propagator_S_to_Xp: sig(100 * (a.S.notif - a.Xp.notif) / base, 4),
        method_Xp_to_Op: sig(100 * (a.Xp.notif - a.Op.notif) / base, 4),
        operatorData_Op_to_O: sig(100 * (a.Op.notif - a.O.notif) / base, 4),
        total_S_to_O: sig(100 * (a.S.notif - a.O.notif) / base, 4),
        totalPublic_S_to_Op: sig(100 * (a.S.notif - a.Op.notif) / base, 4),
      } : null,
    };
  }

  return { views: viewsOut, recallCurves, pcRoc, attributionWaterfall: waterfall, leftOut: c0.leftOut };
}

async function runParent() {
  checkFrozenAndPins();
  const t0 = Date.now();
  const smoke = has('--smoke');
  const workers = Number(arg('--workers', '14'));
  const missReps = smoke ? 10 : Number(arg('--miss-reps', String(CFG.evaluation.bootstrapReplicates.miss)));
  const pcReps = smoke ? 4 : Number(arg('--pc-reps', String(CFG.evaluation.bootstrapReplicates.pc)));

  console.log(`${nowUtc()} Amendment 4 Eval: preparing fresh week 2026-11-17..24 (missReps=${missReps}, pcReps=${pcReps}, workers=${workers})...`);
  const { objects, radii, isManeuverablePayload } = loadObjectsAndDisCos();
  const index = prepareWeekScratch(objects, radii, isManeuverablePayload);
  const { trainPools, evalPools, lsSplit } = loadAllSignedPools();
  const { audit } = fitAndAuditCovariances(trainPools, evalPools, lsSplit);

  // Run primary bootstrap reps across workers (rep 0 gets its own dedicated worker since it averages all 3 sub-seeds and evaluates exact starlinkPairs Pc)
  const all = Array.from({ length: missReps + 1 }, (_, i) => i);
  const bsAll = all.slice(1);
  const bsWorkers = Math.max(1, workers - 1);
  const lists = [[0], ...Array.from({ length: bsWorkers }, (_, w) => bsAll.filter((_, idx) => idx % bsWorkers === w)).filter((l) => l.length)];
  await Promise.all(lists.map((l, w) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF,
      '--child', '--mode', 'primary', '--reps', l.join(','), '--pc-reps', String(pcReps)],
      { stdio: 'inherit', env: process.env });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`primary worker ${w} exited ${code}`))));
  })));

  // Also run pre-registered sensitivities + post-diagnostic q90 core sensitivity (rep 0 central with exact Pc) in parallel!
  const allSensModes = [...CFG.covariance.sensitivities, 'post_diagnostic_q90_core'];
  await Promise.all(allSensModes.map((mode) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF,
      '--child', '--mode', mode, '--reps', '0', '--pc-reps', '0'],
      { stdio: 'inherit', env: process.env });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`sens ${mode} exited ${code}`))));
  })));

  const reps = all.map((r) => JSON.parse(fs.readFileSync(path.join(SCRATCH, 'reps-primary', `${r}.json`), 'utf8')));
  const formatSens = (mode) => {
    const r0 = JSON.parse(fs.readFileSync(path.join(SCRATCH, `reps-${mode}`, '0.json'), 'utf8'));
    return Object.fromEntries(LEADS.map((L) => [`${L}d`, {
      recallCurves: r0.res[L].recallCurves,
      pcRoc: r0.res[L].pcRoc,
      allButStarlinkPairs_pcTiers: r0.res[L].views.allButStarlinkPairs.pcTiers,
      noStarlink_pcTiers: r0.res[L].views.noStarlink.pcTiers,
    }]));
  };
  const sensitivities = Object.fromEntries(CFG.covariance.sensitivities.map((mode) => [mode, formatSens(mode)]));
  const { audit: q90Audit } = fitAndAuditCovariances(trainPools, evalPools, lsSplit, 'q90_all');
  const postDiagnosticSensitivities = {
    q90_calibrated_core: {
      disclosure: 'Post-diagnostic sensitivity added after inspecting Amendment 4 held-out covariance audit showing median-matched core overconfidence on leptokurtic SDN-AP errors; scales core by quantile(d2_train, 0.90) / chi2_3(0.90) identically across all six arms. Reported alongside — never substituted for — the frozen pre-registered primary.',
      heldOutAudit: q90Audit,
      ...formatSens('post_diagnostic_q90_core'),
    },
  };

  const results = Object.fromEntries(LEADS.map((L) => [`${L}d`, aggregateReps(reps, L)]));
  const t0Meta = JSON.parse(fs.readFileSync(path.join(SCREEN_DIR, 'events', 't0.json'), 'utf8'));
  const doc = {
    schema: 'sdn-ap-amendment4-alerts-3arm-1',
    issue: CFG.issue,
    generatedUtc: nowUtc(),
    registration: {
      amendmentCommit: execFileSync('git', ['log', '-1', '--format=%H', '--', 'experiments/ca-rollup-072/AMENDMENT-4.md'], { cwd: OAE, encoding: 'utf8' }).trim(),
      amendmentBlobSha: execFileSync('git', ['rev-parse', 'HEAD:experiments/ca-rollup-072/AMENDMENT-4.md'], { cwd: OAE, encoding: 'utf8' }).trim(),
      configSha256: sha256File(CFG_PATH),
    },
    modules: CFG.modules,
    week: {
      fromUtc: CFG.forwardWeek.fromUtc,
      toUtc: CFG.forwardWeek.toUtc,
      objects: t0Meta.catalog,
      t0Events: t0Meta.kept,
      t0Digest: t0Meta.digest,
      tiersIncluded: CFG.forwardWeek.tiers.map((t) => `${t.id}(${t.keepFromKm}-${t.thresholdKm}km)`),
      spaceWeatherRegime: CFG.forwardWeek.spaceWeatherRegime,
      doClassBreakdownInT0: index.doClassCounts,
    },
    arms: {
      S: 'SGP4 public Space-Track element sets (CREATION_DATE <= T0)',
      SupGP: 'CelesTrak SupGP (12:50Z < T0) on Starlink, Space-Track GP elsewhere, flown on SGP4',
      Xp: 'SGP4-XP built by catalog-builder 0.2.4 from 100% public GP history',
      Op: 'SDN-AP 0.7.2 built by catalog-builder 0.2.4 from 100% public GP history',
      X: 'SGP4-XP built by catalog-builder 0.2.4 (SpaceX ephemerides for Starlink, public GP history elsewhere)',
      O: 'SDN-AP 0.7.2 built by catalog-builder 0.2.4 (SpaceX ephemerides for Starlink, public GP history elsewhere)',
    },
    covarianceMethodology: {
      signedVectorsAllRegimes: REGIMES,
      splitMethod: CFG.covariance.splitMethod,
      estimator: 'Coordinatewise MAD -> inner 90% core -> median-matched chi2_3(0.5) scale + 3.5-sigma heavy-tail/maneuver mixture (DO passive non-maneuvering objects wm=0)',
      heldOutAudit: audit,
    },
    probabilityOfCollision: {
      algorithm: 'FOSTER_2D_MIXTURE',
      exactWasmThresholdBound: EXACT_PC_BOUND_MIN,
      starlinkPairsPcCentralOnly: true,
      conjunctionAssessmentWasmSha256: CFG.modules.conjunctionAssessment.wasmSha256,
      radiusSources: index.radiusHow,
    },
    bootstrap: {
      missReplicates: missReps,
      pcReplicates: pcReps,
      clusters: CFG.evaluation.bootstrapClusters,
      rngSeed: CFG.evaluation.rngSeed,
    },
    results,
    sensitivities,
    postDiagnosticSensitivities,
    wallSec: +((Date.now() - t0) / 1000).toFixed(1),
  };

  if (!smoke) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n');
  }
  console.log(`\n=== AMENDMENT 4 EVAL COMPLETE (${doc.wallSec}s) -> ${smoke ? 'SMOKE' : OUT_PATH} ===`);
  for (const L of ['1d', '3d']) {
    const r = doc.results[L];
    console.log(`\n--- ${L} allButStarlinkPairs ---`);
    for (const k of ['sgp4_1km', 'r90', 'r95']) {
      const t = r.recallCurves.allButStarlinkPairs.byTarget[k];
      console.log(`  miss[${k}]: S=${t.arms.S.notif} SupGP=${t.arms.SupGP.notif} Xp=${t.arms.Xp.notif} Op=${t.arms.Op.notif}(${t.reductionVsSgp4.Op.pct}%) X=${t.arms.X.notif}(${t.reductionVsSgp4.X.pct}%) O=${t.arms.O.notif}(${t.reductionVsSgp4.O.pct}% CI ${JSON.stringify(t.reductionVsSgp4.O.ci95)})`);
    }
    if (r.pcRoc?.allButStarlinkPairs) {
      for (const k of ['sgp4_pc1e-5', 'sgp4_pc3e-7', 'r90', 'r95']) {
        const t = r.pcRoc.allButStarlinkPairs.byTarget[k];
        console.log(`  pcROC[${k}]: S=${t.arms.S.notif} Op=${t.arms.Op.notif}(${t.reductionVsSgp4.Op.pct}%) X=${t.arms.X.notif}(${t.reductionVsSgp4.X.pct}%) O=${t.arms.O.notif}(${t.reductionVsSgp4.O.pct}%)`);
      }
      console.log(`  pcTiers[1e-5]:`, JSON.stringify(r.views.allButStarlinkPairs.pcTiers['pc1e-5_cum'].notif), 'redO:', r.views.allButStarlinkPairs.pcTiers['pc1e-5_cum'].reductionVsSgp4.O);
      console.log(`  pcTiers[1e-4 red]:`, JSON.stringify(r.views.allButStarlinkPairs.pcTiers['pc1e-4_red'].notif), 'prec:', JSON.stringify(r.views.allButStarlinkPairs.pcTiers['pc1e-4_red'].tierPrecisionPct));
    }
  }
}

if (has('--child')) await childWorker();
else await runParent();
process.exit(0);
