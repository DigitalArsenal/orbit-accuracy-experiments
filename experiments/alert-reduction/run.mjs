#!/usr/bin/env node
// alert-reduction: conjunction notifications per week at the published alert limits, the public catalog (S) against
// ours (O), on one real week of close approaches. The registration is PLAN.md beside this file.
//
//   ALERTS_SCREEN=<two-exponentials scratch with events/ and geom/> ALERT_REDUCTION_SCRATCH=<dir> HOLD_FILE=<file>
//   MODULES=<modules checkout with analysis/conjunction-assessment> SPACE_DATA_STANDARDS_ROOT=<SDS package root>
//   node experiments/alert-reduction/run.mjs --run [--workers 8] [--miss-reps 200] [--pc-reps 40]
//   node experiments/alert-reduction/run.mjs --check      the end-to-end check: real inputs, a sample, nothing published
//
// Statistics only: the encounter geometry comes from the module's screen, Pc from the module's compute_pc; the
// arithmetic here draws errors, projects them on each encounter's plane and counts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PLAN_REL = 'experiments/alert-reduction/PLAN.md';
const ARCHIVE = process.env.ARCHIVE_ROOT ?? '/opt/data/sdn-archive';
const SCREEN = process.env.ALERTS_SCREEN;
const SCRATCH = process.env.ALERT_REDUCTION_SCRATCH;
const HOLD = process.env.HOLD_FILE;
const MODULES = process.env.MODULES;
const OUT_DIR = path.join(ARCHIVE, 'derived/alerts');
const SNAPSHOT = `${ARCHIVE}/spacetrack/gp/2026/2026-11-05.json.gz`;
const SNAPSHOT_SHA = 'b63176497acc503080a5243980319e577f3387de6b318426a1766ff6359aa1c1';
const SATCAT = `${ARCHIVE}/spacetrack/satcat/2026/2026-11-07.json.gz`;
const DISCOS = `${ARCHIVE}/hac/esa-discos/2026/2026-11`;
const FIFTH = `${ARCHIVE}/derived/site-measure/public-only-20261121T195726Z.jsonl`;
const STARLINK_ROWS = `${ARCHIVE}/derived/builder-measure/rows-20261121T170238Z.jsonl`;
const DEV = `${ARCHIVE}/gp-covariance-strata/dev-rows`;
const T0_DIGEST = 'ef114fe59487d57ffc7c92be81fe22d01f443c564e3fce362897837ebb8f4eb7', T0_EVENTS = 1069553;
const TIERS = ['t0', 't1-s1', 't1-s2', 't1-s3'];
const RECORD = 14; // missKm, speedKmS, the plane's two axes in A's radial, in-track, cross-track, then in B's
const REGIMES = ['SD', 'S1', 'DO', 'GD', 'GN', 'GE', 'IG', 'SL'];
const REGIME_LABEL = { SD: 'perigee under 600 km', S1: 'perigee 600 to 750 km', DO: 'perigee 750 to 2000 km', GD: 'perigee 2000 to 15000 km', GN: 'perigee 15000 to 30000 km', GE: 'geostationary', IG: 'inclined geosynchronous', SL: 'Starlink' };
const GROUP_TO_REGIME = { P: 'SD', S1: 'S1', DO: 'DO', GD: 'GD', GN: 'GN', GE: 'GE', IG: 'IG' };
const BANDS = ['LEO-L', 'LEO-M', 'LEO-H', 'MEO', 'GEO'];
const DEFAULT_BAND = { SD: 1, S1: 1, DO: 2, GD: 3, GN: 3, GE: 4, IG: 4, SL: 1 };
const LEADS = [1, 3];
const AGE_BIN = { 1: 2, 3: 4 };
const PC_LIMITS = [1e-4, 1e-5, 3e-7];
const PC_MIN = 3e-7;
const CHI3 = [3.527, 8.025, 14.156], NOMINAL = [0.683, 0.954, 0.997], TOL = 0.05, TAIL = 0.01;
const DIRS_PER_ROW = 50;
const SIDES = ['S', 'O'];
const VIEWS = ['allButStarlinkPairs', 'all', 'starlinkWithOthers', 'starlinkPairs', 'noStarlink']; // amendment 2
const LIMITS = ['miss', 'pc1e-4', 'pc1e-5', 'pc3e-7'];
const SL = REGIMES.indexOf('SL');

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sha256File = (f) => { const h = createHash('sha256'); const fd = fs.openSync(f, 'r'); const buf = Buffer.alloc(1 << 24); let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); fs.closeSync(fd); return h.digest('hex'); };
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const nowUtc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sig = (x, n = 4) => (Number.isFinite(x) ? Number(x.toPrecision(n)) : null);
const quantile = (sorted, q) => { if (!sorted.length) return NaN; const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); };
const half = (norad) => createHash('sha256').update(String(norad)).digest()[0] & 1; // 0 fit, 1 test
function rngOf(text) {
  const h = createHash('sha256').update(text).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12);
  return () => { a |= 0; b |= 0; c |= 0; d |= 0; const t = (((a + b) | 0) + d) | 0; d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0; return (t >>> 0) / 4294967296; };
}
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };

function registration() {
  const dirty = git(['status', '--porcelain', '--', PLAN_REL]);
  if (dirty) throw new Error(`plan dirty or uncommitted: ${dirty}`);
  const adds = git(['log', '--diff-filter=A', '--format=%H', '--', PLAN_REL]).split('\n').filter(Boolean);
  if (!adds.length) throw new Error('plan not committed');
  return { commit: adds.at(-1), sha256: sha256File(path.join(ROOT, PLAN_REL)), amendments: git(['log', '--format=%H %cI', `${adds.at(-1)}..HEAD`, '--', PLAN_REL]).split('\n').filter(Boolean) };
}

// ---------- objects: regime, band, size ----------
function orbitOf(g) {
  const n = Number(g.MEAN_MOTION), e = Number(g.ECCENTRICITY), inc = Number(g.INCLINATION);
  const a = Math.cbrt(398600.4418 / (n * 2 * Math.PI / 86400) ** 2);
  return { e, inc, hp: a * (1 - e) - 6378.137, name: String(g.OBJECT_NAME ?? '') };
}
function regimeOf(o) {
  if (/^STARLINK/i.test(o.name)) return SL;
  if (o.e >= 0.1) return -1;
  const r = o.hp < 600 ? 'SD' : o.hp < 750 ? 'S1' : o.hp < 2000 ? 'DO' : o.hp < 15000 ? 'GD' : o.hp < 30000 ? 'GN' : o.inc < 5 ? 'GE' : 'IG';
  return REGIMES.indexOf(r);
}
const bandOf = (o) => (o.e >= 0.25 ? -1 : o.hp < 500 ? 0 : o.hp < 800 ? 1 : o.hp < 2000 ? 2 : o.hp < 30000 ? 3 : 4);
function loadObjects() {
  const raw = fs.readFileSync(SNAPSHOT);
  if (sha256(raw) !== SNAPSHOT_SHA) throw new Error('GP snapshot differs from the registered one');
  const newest = new Map();
  for (const g of JSON.parse(zlib.gunzipSync(raw))) { const id = Number(g.NORAD_CAT_ID), p = newest.get(id); if (!p || g.EPOCH >= p.EPOCH) newest.set(id, g); }
  return new Map([...newest].map(([id, g]) => [id, orbitOf(g)]));
}
function loadRadii() {
  const radius = new Map(), how = { discosDimension: 0, discosSection: 0, rcs: 0 };
  for (const f of fs.readdirSync(DISCOS).filter((x) => /^objects-\d+\.json$/.test(x))) {
    let doc; try { doc = JSON.parse(fs.readFileSync(path.join(DISCOS, f), 'utf8')); } catch { continue; }
    for (const it of doc.data ?? []) {
      const a = it.attributes ?? {}, id = Number(a.satno);
      if (!Number.isInteger(id)) continue;
      const dims = [a.span, a.height, a.width, a.depth, a.diameter].map(Number).filter((x) => Number.isFinite(x) && x > 0);
      if (dims.length) radius.set(id, { r: Math.max(...dims) / 2, how: 'discosDimension' });
      else if (Number(a.xSectMax) > 0) radius.set(id, { r: Math.sqrt(Number(a.xSectMax) / Math.PI), how: 'discosSection' });
    }
  }
  const RCS = { SMALL: 0.1, MEDIUM: 0.5, LARGE: 1.5 };
  for (const row of JSON.parse(zlib.gunzipSync(fs.readFileSync(SATCAT)))) {
    const id = Number(row.NORAD_CAT_ID);
    if (!radius.has(id) && RCS[row.RCS_SIZE]) radius.set(id, { r: RCS[row.RCS_SIZE], how: 'rcs' });
  }
  return radius;
}

// ---------- error rows ----------
// Amendment 3: the vector re-run of the same tests (lane fifthday's rig, each side's signed radial, in-track, cross-track
// error at each day's middle scored epoch). When given, the regimes it covers use those vectors, both catalogs from the same test.
const VECTORS = process.env.ALERT_VECTORS;
const VECTOR_REGIMES = ['S1', 'DO', 'GD', 'GN', 'GE', 'IG'];
function loadVectors() {
  if (!VECTORS) return null;
  const by = new Map();
  for (const f of fs.readdirSync(VECTORS).filter((x) => /^rows-\d+\.jsonl$/.test(x)).sort()) {
    for (const line of fs.readFileSync(path.join(VECTORS, f), 'utf8').split('\n')) { if (line) { const r = JSON.parse(line); by.set(`${r.norad}|${r.startUtc}`, r); } }
  }
  return by;
}
function loadRows(objects) {
  const pools = Object.fromEntries(LEADS.map((L) => [L, REGIMES.map(() => [])]));
  const vec = loadVectors();
  for (const line of fs.readFileSync(FIFTH, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line), g = GROUP_TO_REGIME[r.groupKey];
    if (!r.inAggregates || g === undefined) continue;
    const reg = REGIMES.indexOf(g), o = objects.get(r.noradId), band = o && bandOf(o) >= 0 ? bandOf(o) : DEFAULT_BAND[g];
    const useVec = vec && VECTOR_REGIMES.includes(g), vr = useVec ? vec.get(`${r.noradId}|${r.startUtc}`) : null;
    for (const L of LEADS) {
      const d = r.days?.[String(L)];
      if (!d || !Number.isFinite(d.sgp4PublicSetM) || !Number.isFinite(d.sdnApFromPublicSetsM)) continue;
      const row = { norad: r.noradId, key: `${r.groupKey}|${r.noradId}|${r.startUtc}`, S: d.sgp4PublicSetM / 1000, O: d.sdnApFromPublicSetsM / 1000, band, half: half(r.noradId) };
      if (useVec) {
        const vS = vr?.sgp4?.v?.[String(L)], vO = vr?.sdnAp?.v?.[String(L)];
        if (!vS || !vO) continue;
        row.v = { S: vS.map((x) => x / 1000), O: vO.map((x) => x / 1000) };
        row.S = Math.hypot(...row.v.S); row.O = Math.hypot(...row.v.O);
      }
      pools[L][reg].push(row);
    }
  }
  for (const line of fs.readFileSync(STARLINK_ROWS, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.leadHours?.[0] !== 18 || r.leadHours?.[1] !== 24) continue;
    const S = r.errorKm?.['SGP4 public set'], O = r.errorKm?.['SDN-AP production record'];
    if (!Number.isFinite(S) || !Number.isFinite(O)) continue;
    const o = objects.get(r.norad), band = o && bandOf(o) >= 0 ? bandOf(o) : DEFAULT_BAND.SL;
    pools[1][SL].push({ norad: r.norad, key: `SL|${r.norad}`, S, O, band, half: half(r.norad) });
  }
  return rankRows(pools);
}
function loadDirections() {
  const bucket = Object.fromEntries(LEADS.map((L) => [L, BANDS.map(() => [])]));
  for (const f of fs.readdirSync(DEV).filter((x) => x.endsWith('.jsonl.gz')).sort()) {
    for (const line of zlib.gunzipSync(fs.readFileSync(path.join(DEV, f))).toString('utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line), b = BANDS.indexOf(r.regime);
      if (b < 0) continue;
      for (const L of LEADS) if (r.bin === AGE_BIN[L]) { const m = Math.hypot(...r.e); if (m > 0) bucket[L][b].push(r.e[0] / m, r.e[1] / m, r.e[2] / m, m); }
    }
  }
  // Amendment 1: each band's directions sorted by the size of the error they came from, so a row draws its direction
  // at its own size's rank (large errors lie along track, as measured); the shape is the second moment of the error
  // vectors, trace 1.
  const dirs = {}, shapes = {}, inverse = {};
  for (const L of LEADS) {
    dirs[L] = []; shapes[L] = [];
    for (const raw of bucket[L]) {
      const n = raw.length / 4, order = Array.from({ length: n }, (_, i) => i).sort((a, b) => raw[4 * a + 3] - raw[4 * b + 3]);
      const u = new Float64Array(3 * n), S = [0, 0, 0, 0, 0, 0];
      let tr = 0;
      order.forEach((i, k) => {
        const m = raw[4 * i + 3], x = raw[4 * i] * m, y = raw[4 * i + 1] * m, z = raw[4 * i + 2] * m;
        u[3 * k] = raw[4 * i]; u[3 * k + 1] = raw[4 * i + 1]; u[3 * k + 2] = raw[4 * i + 2];
        S[0] += x * x; S[1] += x * y; S[2] += x * z; S[3] += y * y; S[4] += y * z; S[5] += z * z; tr += m * m;
      });
      dirs[L].push(u); shapes[L].push(n ? S.map((v) => v / tr) : null);
    }
    inverse[L] = shapes[L].map((S) => (S ? inv3(S) : null));
  }
  return { dirs, shapes, inverse };
}
// A direction at the row's size rank q (0..1), within a window of 5 % of the band's rows.
const rankIndex = (q, rng, n) => 3 * Math.min(n - 1, Math.max(0, Math.floor((q + (rng() - 0.5) * 0.05) * n)));
function rankRows(pools) {
  for (const L of LEADS) for (const rows of pools[L]) {
    const order = rows.map((r, i) => [r.S, i]).sort((a, b) => a[0] - b[0]);
    order.forEach(([, i], k) => { rows[i].q = (k + 0.5) / rows.length; });
  }
  return pools;
}
function inv3([a, b, c, d, e, f]) { // packed symmetric xx, xy, xz, yy, yz, zz
  const A = d * f - e * e, B = c * e - b * f, C = b * e - c * d, det = a * A + b * B + c * C;
  return [A / det, B / det, C / det, (a * f - c * c) / det, (b * c - a * e) / det, (a * d - b * b) / det];
}
const quad = (P, u0, u1, u2) => P[0] * u0 * u0 + 2 * P[1] * u0 * u1 + 2 * P[2] * u0 * u2 + P[3] * u1 * u1 + 2 * P[4] * u1 * u2 + P[5] * u2 * u2;

// ---------- covariance realism per side, regime and lead ----------
function realism(pools, D) {
  const out = [], scale = {}, cov = {};
  for (const K of SIDES) {
    scale[K] = {}; cov[K] = {};
    for (const L of LEADS) {
      scale[K][L] = REGIMES.map(() => NaN); cov[K][L] = REGIMES.map(() => null);
      REGIMES.forEach((g, reg) => {
        const rows = pools[L][reg];
        if (!rows.length) return;
        const d2 = [[], []], objs = [new Set(), new Set()];
        if (rows[0].v) { // amendment 3: the rows' own signed vectors; covariance = the fit half's second moment, scaled
          const M = [0, 0, 0, 0, 0, 0];
          let nf = 0;
          for (const r of rows) if (r.half === 0) { const [x, y, z] = r.v[K]; M[0] += x * x; M[1] += x * y; M[2] += x * z; M[3] += y * y; M[4] += y * z; M[5] += z * z; nf++; }
          const row = { side: K, lead: L, regime: g, label: REGIME_LABEL[g], errors: 'signed vectors', fitObjects: new Set(rows.filter((r) => r.half === 0).map((r) => r.norad)).size, testObjects: new Set(rows.filter((r) => r.half === 1).map((r) => r.norad)).size, fitRows: nf, testRows: rows.length - nf };
          if (!nf || nf === rows.length) { out.push({ ...row, status: 'INSUFFICIENT', why: 'a half has no rows' }); return; }
          const Mn = M.map((x) => x / nf), Mi = inv3(Mn);
          for (const r of rows) d2[r.half].push(quad(Mi, ...r.v[K]));
          const fit = d2[0].sort((a, b) => a - b), test = d2[1], s2 = quantile(fit, 0.954) / CHI3[1];
          const f = CHI3.map((c) => test.filter((x) => x / s2 <= c).length / test.length);
          const ok = Math.abs(f[0] - NOMINAL[0]) <= TOL && Math.abs(f[1] - NOMINAL[1]) <= TOL && 1 - f[2] <= TAIL;
          cov[K][L][reg] = Mn.map((x) => x * s2);
          out.push({ ...row, status: ok ? 'REALISTIC' : 'FAILED', sigmaRtnKm: [0, 3, 5].map((k) => sig(Math.sqrt(Mn[k] * s2))), insideOneTwoThreeSigma: f.map((x) => sig(x, 3)) });
          return;
        }
        for (const r of rows) {
          const u = D.dirs[L][r.band], Si = D.inverse[L][r.band], n = u.length / 3, rng = rngOf(`realism:${r.key}:${L}`);
          if (!n) continue;
          objs[r.half].add(r.norad);
          for (let k = 0; k < DIRS_PER_ROW; k++) { const j = rankIndex(r.q, rng, n); d2[r.half].push(r[K] * r[K] * quad(Si, u[j], u[j + 1], u[j + 2])); }
        }
        const fit = d2[0].sort((a, b) => a - b), test = d2[1];
        const row = { side: K, lead: L, regime: g, label: REGIME_LABEL[g], fitObjects: objs[0].size, testObjects: objs[1].size, fitRows: fit.length / DIRS_PER_ROW, testRows: test.length / DIRS_PER_ROW };
        if (!fit.length || !test.length) { out.push({ ...row, status: 'INSUFFICIENT', why: 'a half has no rows' }); return; }
        const s2 = quantile(fit, 0.954) / CHI3[1];
        const f = CHI3.map((c) => test.filter((x) => x / s2 <= c).length / test.length);
        const ok = Math.abs(f[0] - NOMINAL[0]) <= TOL && Math.abs(f[1] - NOMINAL[1]) <= TOL && 1 - f[2] <= TAIL;
        scale[K][L][reg] = s2;
        out.push({ ...row, status: ok ? 'REALISTIC' : 'FAILED', rmsKm: sig(Math.sqrt(s2)), insideOneTwoThreeSigma: f.map((x) => sig(x, 3)) });
      });
    }
  }
  return { strata: out, scale, cov, realistic: Object.fromEntries(LEADS.map((L) => [L, REGIMES.map((g) => SIDES.every((K) => out.some((r) => r.side === K && r.lead === L && r.regime === g && r.status === 'REALISTIC')))])) };
}

// ---------- the encounters ----------
function prepare(objects, radii, sample) {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const index = { tiers: {}, excluded: {}, inputs: {}, radiusHow: { discosDimension: 0, discosSection: 0, rcs: 0, default: 0 } };
  const t0meta = JSON.parse(fs.readFileSync(path.join(SCREEN, 'events', 't0.json'), 'utf8'));
  if (t0meta.digest !== T0_DIGEST || t0meta.events !== T0_EVENTS) throw new Error('t0 is not the registered screen');
  for (const id of TIERS) {
    const meta = JSON.parse(fs.readFileSync(path.join(SCREEN, 'events', `${id}.json`), 'utf8'));
    const evFile = path.join(SCREEN, 'events', `${id}.f64`), gFile = path.join(SCREEN, 'geom', `${id}.f32`);
    index.inputs[id] = { events: sha256File(evFile), geometry: sha256File(gFile), digest: meta.digest };
    const evb = fs.readFileSync(evFile), gb = fs.readFileSync(gFile);
    const ev = new Float64Array(evb.buffer, evb.byteOffset, evb.byteLength / 8), g = new Float32Array(gb.buffer, gb.byteOffset, gb.byteLength / 4);
    const n = ev.length / 17;
    if (g.length / RECORD !== n) throw new Error(`${id}: geometry and events differ in count`);
    const step = sample ? Math.max(1, Math.floor(n / sample)) : 1;
    const keepG = [], keepM = [], keepR = [];
    const ex = { highlyEllipticalOrNoRegime: 0, notInSnapshot: 0 };
    for (let i = 0; i < n; i += step) {
      const A = ev[i * 17], B = ev[i * 17 + 1], oA = objects.get(A), oB = objects.get(B);
      if (!oA || !oB) { ex.notInSnapshot++; continue; }
      const rA = regimeOf(oA), rB = regimeOf(oB), bA = bandOf(oA), bB = bandOf(oB);
      if (rA < 0 || rB < 0 || bA < 0 || bB < 0) { ex.highlyEllipticalOrNoRegime++; continue; }
      const radius = (id2) => { const x = radii.get(id2); if (x) { index.radiusHow[x.how]++; return x.r; } index.radiusHow.default++; return 0.5; };
      keepG.push(g.subarray(i * RECORD, (i + 1) * RECORD));
      keepM.push(rA, rB, bA, bB, oA.hp < 2000 && oB.hp < 2000 ? 1 : 5);
      keepR.push(radius(A) + radius(B));
    }
    const m = keepR.length, G = new Float32Array(m * RECORD), M = Uint8Array.from(keepM), R = Float32Array.from(keepR);
    keepG.forEach((x, j) => G.set(x, j * RECORD));
    fs.writeFileSync(path.join(SCRATCH, `${id}.g.f32`), Buffer.from(G.buffer));
    fs.writeFileSync(path.join(SCRATCH, `${id}.m.u8`), Buffer.from(M.buffer));
    fs.writeFileSync(path.join(SCRATCH, `${id}.r.f32`), Buffer.from(R.buffer));
    const weight = meta.fraction === 1 ? 1 : (meta.catalog * (meta.catalog - 1)) / (meta.objects * (meta.objects - 1));
    index.tiers[id] = { n: m, read: n, step, weight: weight * step };
    index.excluded[id] = ex;
  }
  fs.writeFileSync(path.join(SCRATCH, 'index.json'), JSON.stringify(index));
  return index;
}
function loadTier(id, index) {
  const r = (f, T) => { const b = fs.readFileSync(path.join(SCRATCH, `${id}.${f}`)); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
  return { id, G: r('g.f32', Float32Array), M: r('m.u8', Uint8Array), R: r('r.f32', Float32Array), ...index.tiers[id] };
}

// ---------- one replicate ----------
function emptyCounts() {
  const c = () => Object.fromEntries(LIMITS.map((l) => [l, 0]));
  return { notif: { S: c(), O: c() }, missed: { S: c(), O: c() }, real: 0, realPc: 0, pcWeight: 0, weight: 0, pcCalls: 0 };
}
async function replicate(rep, ctx) {
  const { pools, D, real, tiers, pc, doPc } = ctx;
  const out = {};
  for (const L of LEADS) {
    const rng = rngOf(`alert-reduction:${rep}:${L}`);
    // The rows in use: all of them, or a resample of each regime's objects.
    const use = pools[L].map((rows) => {
      if (rep === 0 || !rows.length) return rows;
      const byObj = new Map(); for (const r of rows) { if (!byObj.has(r.norad)) byObj.set(r.norad, []); byObj.get(r.norad).push(r); }
      const objs = [...byObj.values()], pick = [];
      for (let k = 0; k < objs.length; k++) pick.push(...objs[Math.floor(rng() * objs.length)]);
      return pick;
    });
    const tierUse = rep === 0 ? [['t0', 1], ['t1-s1', 1 / 3], ['t1-s2', 1 / 3], ['t1-s3', 1 / 3]] : [['t0', 1], [`t1-s${1 + (rep % 3)}`, 1]];
    const res = { views: Object.fromEntries(VIEWS.map((v) => [v, emptyCounts()])), byClass: {}, leftOut: { starlinkAt3Days: 0, noRows: 0 } };
    const classes = new Array(64).fill(null), realL = real[L];
    const real1 = { S: [], O: [] }, all = { S: [], O: [], w: [], lim: [] };
    const sc = ctx.scale, Dd = D.dirs[L], Dn = Dd.map((u) => u.length / 3), Sh = D.shapes[L];
    // Each object's covariance (km^2, radial, in-track, cross-track): the regime's own fitted matrix (amendment 3), else the
    // regime's fitted size on its band's shape.
    const covCache = new Map();
    const covOf = (K, LL, reg, band) => {
      const key = `${K}${reg}|${band}`;
      let c = covCache.get(key);
      if (!c) { c = ctx.R.cov[K][LL][reg] ?? Sh[band].map((x) => x * sc[K][LL][reg]); covCache.set(key, c); }
      return c;
    };
    for (const [id, share] of tierUse) {
      const t = tiers[id], w = t.weight * share, isT0 = id === 't0';
      for (let i = 0; i < t.n; i++) {
        const rA = t.M[i * 5], rB = t.M[i * 5 + 1], bA = t.M[i * 5 + 2], bB = t.M[i * 5 + 3], lim = t.M[i * 5 + 4];
        if (L === 3 && (rA === SL || rB === SL)) { res.leftOut.starlinkAt3Days += w; continue; }
        const pA = use[rA], pB = use[rB];
        if (!pA.length || !pB.length || !Dn[bA] || !Dn[bB]) { res.leftOut.noRows += w; continue; }
        const o = i * RECORD, G = t.G, miss = G[o];
        const rowA = pA[Math.floor(rng() * pA.length)], rowB = pB[Math.floor(rng() * pB.length)];
        const jA = rankIndex(rowA.q, rng, Dn[bA]), jB = rankIndex(rowB.q, rng, Dn[bB]);
        const uA = Dd[bA], uB = Dd[bB];
        const a1 = G[o + 2] * uA[jA] + G[o + 3] * uA[jA + 1] + G[o + 4] * uA[jA + 2], a2 = G[o + 5] * uA[jA] + G[o + 6] * uA[jA + 1] + G[o + 7] * uA[jA + 2];
        const b1 = G[o + 8] * uB[jB] + G[o + 9] * uB[jB + 1] + G[o + 10] * uB[jB + 2], b2 = G[o + 11] * uB[jB] + G[o + 12] * uB[jB + 1] + G[o + 13] * uB[jB + 2];
        const isReal = isT0 && miss < lim;
        const nSL = (rA === SL) + (rB === SL);
        const ci = Math.min(rA, rB) * 8 + Math.max(rA, rB);
        const V = res.views, targets = [V.all, nSL === 2 ? V.starlinkPairs : V.allButStarlinkPairs, nSL === 1 ? V.starlinkWithOthers : nSL === 0 ? V.noStarlink : null, (classes[ci] ??= emptyCounts())].filter(Boolean);
        const eligible = doPc && realL[rA] && realL[rB];
        for (const v of targets) { v.weight += w; if (isReal) v.real += w; if (eligible) { v.pcWeight += w; if (isReal) v.realPc += w; } }
        for (const K of SIDES) {
          // An object's error: its row's own signed vector (amendment 3), else the row's size along the drawn direction.
          const eA = rowA.v ? proj(G, o + 2, rowA.v[K]) : [rowA[K] * a1, rowA[K] * a2];
          const eB = rowB.v ? proj(G, o + 8, rowB.v[K]) : [rowB[K] * b1, rowB[K] * b2];
          const x = miss + eA[0] - eB[0], z = eA[1] - eB[1], pm = Math.hypot(x, z);
          const alert = pm < lim;
          for (const v of targets) { if (alert) v.notif[K].miss += w; else if (isReal) v.missed[K].miss += w; }
          if (nSL < 2 && isT0 && lim === 1 && miss < 1) real1[K].push(pm);
          if (nSL < 2 && (rep === 0 || ctx.matched)) { all[K].push(pm); if (K === 'S') { all.w.push(w); all.lim.push(lim); } }
          if (!eligible) continue;
          const mA = inPlane(G, o + 2, covOf(K, L, rA, bA)), mB = inPlane(G, o + 8, covOf(K, L, rB, bB));
          const c11 = (mA[0] + mB[0]) * 1e6, c12 = (mA[1] + mB[1]) * 1e6, c22 = (mA[2] + mB[2]) * 1e6;
          const hbr = t.R[i], xm = x * 1000, zm = z * 1000;
          const det = c11 * c22 - c12 * c12, tr = c11 + c22, lmin = (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2;
          const d = Math.sqrt(Math.max(0, (c22 * xm * xm - 2 * c12 * xm * zm + c11 * zm * zm) / det)), h = hbr / Math.sqrt(lmin);
          const bound = (hbr * hbr) / (2 * Math.sqrt(det)) * Math.exp(-(Math.max(0, d - h) ** 2) / 2);
          let p = 0;
          if (bound >= PC_MIN) { p = await pc.pc([c11, c12, c22], hbr, [xm, zm]); for (const v of targets) v.pcCalls++; }
          for (let k = 0; k < PC_LIMITS.length; k++) {
            const key = LIMITS[k + 1], lp = PC_LIMITS[k];
            for (const v of targets) { if (p >= lp) v.notif[K][key] += w; else if (isReal) v.missed[K][key] += w; }
          }
        }
      }
    }
    classes.forEach((c, ci) => { if (c) res.byClass[`${REGIMES[Math.floor(ci / 8)]}-${REGIMES[ci % 8]}`] = c; });
    // The radius our catalog needs to miss no more real close approaches (true miss under 1 km, both objects below
    // 2000 km) than the public catalog misses at 1 km, and its notifications.
    if (rep === 0 || ctx.matched) {
      const missedS = real1.S.filter((x) => x >= 1).length, sortedO = real1.O.slice().sort((a, b) => b - a);
      const R = missedS < sortedO.length ? sortedO[missedS] * (1 + 1e-9) : 0;
      let nO = 0, nS = 0;
      for (let k = 0; k < all.w.length; k++) if (all.lim[k] === 1) { if (all.O[k] < R) nO += all.w[k]; if (all.S[k] < 1) nS += all.w[k]; }
      res.matchedRadius = { realCloseApproaches: real1.S.length, missedByPublicAt1Km: missedS, radiusKm: sig(R, 4), missedByOursAtRadius: real1.O.filter((x) => x >= R).length, notificationsPublicAt1Km: nS, notificationsOursAtRadius: nO };
    }
    out[L] = res;
  }
  return out;
}
const proj = (G, o, e) => [G[o] * e[0] + G[o + 1] * e[1] + G[o + 2] * e[2], G[o + 3] * e[0] + G[o + 4] * e[1] + G[o + 5] * e[2]];
function inPlane(G, o, S) { // rows p, q of the plane axes in the object's frame; S packed symmetric
  const p = [G[o], G[o + 1], G[o + 2]], q = [G[o + 3], G[o + 4], G[o + 5]];
  const Sv = (v) => [S[0] * v[0] + S[1] * v[1] + S[2] * v[2], S[1] * v[0] + S[3] * v[1] + S[4] * v[2], S[2] * v[0] + S[4] * v[1] + S[5] * v[2]];
  const Sp = Sv(p), Sq = Sv(q);
  return [p[0] * Sp[0] + p[1] * Sp[1] + p[2] * Sp[2], p[0] * Sq[0] + p[1] * Sq[1] + p[2] * Sq[2], q[0] * Sq[0] + q[1] * Sq[1] + q[2] * Sq[2]];
}

// ---------- the context a worker needs ----------
async function context(withPc) {
  const objects = loadObjects();
  const pools = loadRows(objects);
  const D = loadDirections();
  const R = realism(pools, D);
  const index = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'index.json'), 'utf8'));
  const tiers = Object.fromEntries(TIERS.map((id) => [id, loadTier(id, index)]));
  let pc = null, wasmSha = null;
  if (withPc) {
    const { openPc } = await import('../gp-covariance-strata/lib/capc.mjs');
    wasmSha = sha256File(path.join(MODULES, 'analysis/conjunction-assessment/dist/isomorphic/module.wasm'));
    pc = await openPc(MODULES, wasmSha);
  }
  return { objects, pools, D, R, index, tiers, pc, wasmSha, scale: R.scale };
}
function waitForRoom() {
  for (;;) {
    const held = HOLD && fs.existsSync(HOLD), load5 = os.loadavg()[1];
    if (!held && load5 < 30) return;
    console.log(`${nowUtc()} waiting: ${held ? 'HOLD present' : `5-minute load ${load5.toFixed(1)}`}`);
    execFileSync('sleep', ['30']);
  }
}

async function child() {
  const reps = arg('--reps', '').split(',').filter(Boolean).map(Number), pcReps = Number(arg('--pc-reps', '0'));
  const anyRealistic = (R) => LEADS.some((L) => R.realistic[L].some(Boolean));
  const ctx = await context(reps.some((r) => r <= pcReps));
  for (const rep of reps) {
    const doPc = rep <= pcReps && anyRealistic(ctx.R);
    const t = Date.now();
    const res = await replicate(rep, { ...ctx, doPc, real: ctx.R.realistic, matched: true });
    fs.writeFileSync(path.join(SCRATCH, 'reps', `${rep}.json`), JSON.stringify({ rep, pc: doPc, seconds: (Date.now() - t) / 1000, res }));
    console.log(`${nowUtc()} replicate ${rep} done in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  }
  await ctx.pc?.close();
}

function headlineOf(results) {
  const out = {};
  for (const L of LEADS) {
    const v = results[`${L}d`].views.allButStarlinkPairs, m = results[`${L}d`].matchedRadius, mi = results[`${L}d`].matchedRadiusInterval95;
    if (!v) continue;
    out[`${L}d`] = {
      view: 'allButStarlinkPairs',
      atPublishedMissLimits: typeof v.miss === 'object' ? { notificationsPerWeekPublic: v.miss.notificationsPerWeek.S, notificationsPerWeekOurs: v.miss.notificationsPerWeek.O, reductionPercent: v.miss.reductionPercent, reductionInterval95: v.miss.reductionInterval95, missedPublic: v.miss.missedRealCloseApproaches.S, missedOurs: v.miss.missedRealCloseApproaches.O, realCloseApproaches: v.miss.realCloseApproaches, claim: v.miss.claim } : v.miss,
      atNoMoreMissedThanPublic1Km: m ? { radiusKm: m.radiusKm, radiusInterval95: mi.radiusKm, notificationsPerWeekPublicAt1Km: sig(m.notificationsPublicAt1Km), notificationsPerWeekOursAtRadius: sig(m.notificationsOursAtRadius), reductionPercent: sig(100 * (1 - m.notificationsOursAtRadius / m.notificationsPublicAt1Km), 3), missedPublicAt1Km: m.missedByPublicAt1Km, missedOursAtRadius: m.missedByOursAtRadius, realCloseApproaches: m.realCloseApproaches, scope: 'both objects below 2000 km perigee, true miss under 1 km' } : null,
      pc: Object.fromEntries(['pc1e-4', 'pc1e-5', 'pc3e-7'].map((k) => [k, typeof v[k] === 'object' ? { notificationsPerWeekPublic: v[k].notificationsPerWeek.S, notificationsPerWeekOurs: v[k].notificationsPerWeek.O, reductionPercent: v[k].reductionPercent, reductionInterval95: v[k].reductionInterval95, claim: v[k].claim } : v[k]])),
    };
  }
  return out;
}
function interval(xs) { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length >= 10 ? [sig(quantile(s, 0.025)), sig(quantile(s, 0.975))] : null; }
function summarize(reps, L, pick) {
  const central = pick(reps[0].res[L]);
  if (!central) return null;
  const line = {};
  for (const lim of LIMITS) {
    const isPc = lim !== 'miss';
    if (isPc && (!reps[0].pc || !central.pcWeight)) { line[lim] = 'not measured: no encounter in this view has a realistic covariance on both sides for both objects'; continue; }
    const bs = reps.slice(1).filter((r) => !isPc || r.pc).map((r) => pick(r.res[L])).filter((b) => b && (!isPc || b.pcWeight));
    const N = (v, K) => v.notif[K][lim], Mi = (v, K) => v.missed[K][lim];
    const red = (v) => (N(v, 'S') > 0 ? 1 - N(v, 'O') / N(v, 'S') : NaN);
    line[lim] = {
      notificationsPerWeek: { S: sig(N(central, 'S')), O: sig(N(central, 'O')), intervalS: interval(bs.map((b) => N(b, 'S'))), intervalO: interval(bs.map((b) => N(b, 'O'))) },
      reductionPercent: sig(100 * red(central), 3), reductionInterval95: interval(bs.map((b) => 100 * red(b))),
      realCloseApproaches: sig(isPc ? central.realPc : central.real),
      missedRealCloseApproaches: { S: sig(Mi(central, 'S')), O: sig(Mi(central, 'O')), intervalS: interval(bs.map((b) => Mi(b, 'S'))), intervalO: interval(bs.map((b) => Mi(b, 'O'))) },
      encountersCounted: sig(isPc ? central.pcWeight : central.weight), encountersInView: sig(central.weight),
      replicates: bs.length,
    };
    const ri = line[lim].reductionInterval95;
    line[lim].claim = ri && ri[0] > 0 && Mi(central, 'O') <= Mi(central, 'S') ? `${line[lim].reductionPercent} % fewer notifications at no more missed real close approaches` : 'no claim: the reduction interval is not above 0 or ours misses more';
  }
  return line;
}

async function run(check) {
  const reg = check ? { commit: 'check', sha256: sha256File(path.join(ROOT, PLAN_REL)) } : registration();
  for (const v of ['ALERTS_SCREEN', 'ALERT_REDUCTION_SCRATCH', 'MODULES', 'SPACE_DATA_STANDARDS_ROOT']) if (!process.env[v]) throw new Error(`set ${v}`);
  const workers = Number(arg('--workers', check ? '2' : '8')), missReps = Number(arg('--miss-reps', check ? '2' : '200')), pcReps = Number(arg('--pc-reps', check ? '1' : '40'));
  waitForRoom();
  console.log(`${nowUtc()} preparing encounters (sample ${check ? 'yes' : 'no'})`);
  const objects = loadObjects(), radii = loadRadii();
  const index = prepare(objects, radii, check ? 20000 : 0);
  fs.mkdirSync(path.join(SCRATCH, 'reps'), { recursive: true });
  for (const f of fs.readdirSync(path.join(SCRATCH, 'reps'))) fs.rmSync(path.join(SCRATCH, 'reps', f));
  const all = Array.from({ length: missReps + 1 }, (_, i) => i);
  const lists = Array.from({ length: workers }, (_, k) => all.filter((r) => r % workers === k)).filter((l) => l.length);
  console.log(`${nowUtc()} ${lists.length} workers, ${missReps} miss replicates, ${pcReps} Pc replicates; about 1 GiB each, ${lists.length} GiB in all`);
  waitForRoom();
  await Promise.all(lists.map((l, k) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, SELF, '--child', '--reps', l.join(','), '--pc-reps', String(pcReps)], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
    console.log(`${nowUtc()} worker ${k} pid ${c.pid}: replicates ${l.length}`);
    c.on('exit', (code) => (code ? reject(new Error(`worker ${k} exited ${code}`)) : resolve()));
  })));
  const reps = all.map((r) => JSON.parse(fs.readFileSync(path.join(SCRATCH, 'reps', `${r}.json`), 'utf8')));
  const ctxR = realism(loadRows(objects), loadDirections());
  const results = {};
  for (const L of LEADS) {
    results[`${L}d`] = {
      views: Object.fromEntries(VIEWS.map((v) => [v, summarize(reps, L, (r) => r.views[v])])),
      leftOut: reps[0].res[L].leftOut,
      matchedRadius: reps[0].res[L].matchedRadius,
      matchedRadiusInterval95: { radiusKm: interval(reps.slice(1).map((r) => r.res[L].matchedRadius?.radiusKm)), notificationsOursAtRadius: interval(reps.slice(1).map((r) => r.res[L].matchedRadius?.notificationsOursAtRadius)), notificationsPublicAt1Km: interval(reps.slice(1).map((r) => r.res[L].matchedRadius?.notificationsPublicAt1Km)) },
      pcModuleCalls: reps[0].res[L].views.all.pcCalls,
    };
  }
  const byClass = LEADS.flatMap((L) => Object.keys(reps[0].res[L].byClass).map((cls) => ({ lead: L, class: cls, ...summarize(reps, L, (r) => r.byClass[cls]) })));
  const wasmSha = sha256File(path.join(MODULES, 'analysis/conjunction-assessment/dist/isomorphic/module.wasm'));
  const doc = {
    analysis: 'alert-reduction: conjunction notifications per week at the published alert limits, the public catalog against ours (orbit-accuracy-experiments experiments/alert-reduction/PLAN.md)',
    generated: nowUtc(), check: !!check,
    plan: { path: PLAN_REL, commit: reg.commit, sha256: reg.sha256, amendments: reg.amendments ?? [] },
    code: { commit: git(['rev-parse', 'HEAD']), runnerSha256: sha256File(SELF), uncommitted: git(['status', '--porcelain', '--', 'experiments/alert-reduction']) || null },
    startedFrom: {
      S: "the public catalog: each object's newest Space-Track element set flown by SGP4 (public element sets)",
      O: "our catalog: for Starlink satellites, the catalog builder's record made from SpaceX's own ephemerides (owner/operator data); for every other object, SDN-AP made from the object's public element-set history (public element sets)",
    },
    week: { from: '2026-11-06T00:00:00Z', to: '2026-11-13T00:00:00Z', encounters: "the public catalog's whole-catalog screen (32,863 objects, Space-Track GP snapshot 2026-11-05, SGP4 in the conjunction-assessment module 0.18.4); its miss vectors stand for the true misses (a realistic population of encounters, not a record of what happened in orbit)" },
    errors: {
      sizes: "measured, paired: the same test rows give both catalogs' errors (non-Starlink: lane fifthday's public-only comparison against precise orbits, days 1 and 3; Starlink: the builder measurement against SpaceX's next ephemeris cycle, 18 to 24 h)",
      directions: "the public sets' measured radial, in-track, cross-track error directions against precise orbits (gp-covariance-strata rows), the same for both catalogs",
    },
    leads: { '1d': 'notification decided 1 day before closest approach (headline)', '3d': '3 days before; encounters with a Starlink satellite left out (its rows end at 24 h)' },
    limits: {
      miss: 'US Space Force: predicted miss under 1 km when both objects are below 2000 km perigee, else under 5 km',
      'pc1e-4': 'NASA: Pc at or above 1e-4', 'pc1e-5': 'NASA, more conservative: Pc at or above 1e-5', 'pc3e-7': 'SpaceX Starlink maneuver trigger: Pc at or above 3e-7 (FCC report 2026-07-01)',
    },
    realCloseApproach: "true miss under the encounter's miss limit (1 km or 5 km as above); missed = a real close approach without a notification at that limit",
    views: {
      allButStarlinkPairs: 'headline: every encounter except those between two Starlink satellites (plan amendment 2)',
      all: 'every encounter', starlinkWithOthers: "a Starlink satellite with any other object: the Starlink operator's view of other objects",
      starlinkPairs: 'two Starlink satellites: the public screen does not hold the phasing SpaceX keeps between its own satellites; shown, no claim', noStarlink: 'no Starlink satellite',
    },
    headline: headlineOf(results),
    covarianceRealism: {
      rule: 'fitted on the even half of objects (SHA-256 of the NORAD number), tested on the odd half: fractions inside 1, 2, 3 sigma against 0.683, 0.954, 0.997; REALISTIC when the first two are within 0.05 and at most 1 % fall outside 3 sigma; sizes measured, directions and shape from the public sets\' measured error vectors (plan amendment 1)',
      verdict: ctxR.strata.some((s) => s.status === 'REALISTIC') ? `REALISTIC in ${ctxR.strata.filter((s) => s.status === 'REALISTIC').map((s) => `${s.side} ${s.lead}d ${s.regime}`).join(', ')}; not measured elsewhere` : 'NOT REALISTIC in any stratum on either side: every Pc count reads "not measured"',
      strata: ctxR.strata,
    },
    probabilityOfCollision: { module: `conjunction-assessment compute_pc, Foster 2-D (module file SHA-256 ${wasmSha}); closed-form check: experiments/alert-reduction/pc-check.mjs`, hardBodyRadius: "NASA's definition: the sum of the two objects' circumscribing radii, half the largest ESA DISCOS dimension, else from DISCOS' largest cross-section, else the SATCAT radar size (small 0.1 m, medium 0.5 m, large 1.5 m), else 0.5 m", radiusSources: index.radiusHow, countedOnlyWhere: 'both objects\' strata pass the realism test for both catalogs' },
    results, replicates: { miss: missReps, pc: pcReps },
    excludedEncounters: index.excluded,
    inputs: { snapshot: { path: SNAPSHOT, sha256: SNAPSHOT_SHA }, screen: index.inputs, fifthDay: { path: FIFTH, sha256: sha256File(FIFTH) }, starlinkRows: { path: STARLINK_ROWS, sha256: sha256File(STARLINK_ROWS) }, vectorRows: VECTORS ? { dir: VECTORS, regimes: VECTOR_REGIMES, what: 'amendment 3: the same tests re-run by lane fifthday rig (modules 33f769a80), each side signed radial, in-track, cross-track error at each day middle scored epoch' } : null },
    notMeasured: [
      "a screen flown with our catalog's own products: our catalog's measured errors are applied to the public screen's encounters",
      'Pc counts where either object\'s stratum fails the realism test on either side (see covarianceRealism; the share counted is encountersCounted against encountersInView). Our rows hold error sizes only; a realism test of our covariance on our own signed radial, in-track, cross-track errors needs the public-only comparison re-run keeping each error\'s components',
      'notifications from encounters whose screen miss is over 50 km (the stored tiers end there): counts low on the side with the larger errors, so the reduction reads low',
      'highly elliptical objects (no rows); objects not in the snapshot; other operators\' own orbits (counted as public-history objects); Starlink at 3 days',
    ],
    spaceTrackMessages: 'none read; no Space-Track request',
    credit: 'Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). Precise orbits: IGS, ILRS, ESA. Starlink ephemerides: SpaceX. Object sizes: ESA DISCOS.',
  };
  return { doc, byClass };
}
const SELF = fileURLToPath(import.meta.url);

if (process.argv.includes('--child')) await child();
else if (process.argv.includes('--realism')) {
  const objects = loadObjects();
  for (const s of realism(loadRows(objects), loadDirections()).strata) console.log(JSON.stringify(s));
}
else if (process.argv.includes('--run') || process.argv.includes('--check')) {
  const check = process.argv.includes('--check');
  const { doc, byClass } = await run(check);
  const stamp = doc.generated.replace(/[-:]/g, '');
  if (check) {
    const a = doc.results['1d'].views.all;
    const ok = a.miss.notificationsPerWeek.S > 0 && a.miss.notificationsPerWeek.O > 0 && doc.covarianceRealism.strata.length > 0;
    console.log(JSON.stringify({ headline: doc.headline, realism: doc.covarianceRealism.verdict }, null, 1));
    console.log(ok ? 'ALERT-REDUCTION CHECK PASS' : 'ALERT-REDUCTION CHECK FAIL');
    process.exit(ok ? 0 : 1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `rows-${stamp}.jsonl`), byClass.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify(doc, null, 1) + '\n');
  fs.copyFileSync(path.join(OUT_DIR, `${stamp}.json`), path.join(OUT_DIR, 'latest.json'));
  console.log(`${nowUtc()} wrote ${path.join(OUT_DIR, `${stamp}.json`)}`);
} else {
  console.error('usage: see the top of run.mjs');
  process.exit(2);
}
