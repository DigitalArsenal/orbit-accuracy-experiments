#!/usr/bin/env node
// Phase 7C (#1110 + #1059): 3-Arm Weekly Conjunction Alert-Reduction & Foster 2-D Pc Rollup
// Evaluates ALL 3 ARMS over the registered 1-week whole-catalog encounter set (SDN_WEEK_SCREEN_DIR,
// 32,863 objects, 1,069,553 t0 events + t1-s1..s3, Amendments 1-3, Foster 2-D Pc via analysis/conjunction-assessment compute_pc):
//   - S: Public Space-Track GP catalog flown on SGP4
//   - O: SDN-AP 0.7.2 catalog (catalog-builder 0.2.2: operator Starlink + public-history all others)
//   - X: SGP4-XP catalog (catalog-builder 0.2.2: operator Starlink + public-history all others)
//   - Plus public-only sensitivity (Op: SDN-AP 0.7.2 from public history even for Starlink, Xp: SGP4-XP from public history)
// Outputs AGGREGATES ONLY to results/ca-rollup-072/phase7-alerts-3arm.json (or --out).
//
// Usage:
//   node phase7-alerts-3arm.mjs --workers 8 --miss-reps 200 --pc-reps 40
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(path.dirname(SELF), '../../../../main-packages/space-data-network-modules');
const OAE = path.resolve(path.dirname(SELF), '../..');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const SCREEN = process.env.SDN_WEEK_SCREEN_DIR || path.join(OAE, 'runs/alert-reduction/screen');
const P7_DIR = process.env.SDN_PHASE7_DIR || path.join(OAE, 'runs/ca-rollup-072/phase7');
const SCRATCH = path.join(P7_DIR, 'alerts-scratch');
const OUT_PATH = path.join(OAE, 'results/ca-rollup-072/phase7-alerts-3arm.json');

process.env.SPACE_DATA_STANDARDS_ROOT = path.join(MODULES, 'analysis/conjunction-assessment/node_modules/spacedatastandards.org');

const SNAPSHOT = `${ARCHIVE}/spacetrack/gp/2026/2026-11-05.json.gz`;
const SNAPSHOT_SHA = 'b63176497acc503080a5243980319e577f3387de6b318426a1766ff6359aa1c1';
const SATCAT = `${ARCHIVE}/spacetrack/satcat/2026/2026-11-07.json.gz`;
const DISCOS = `${ARCHIVE}/hac/esa-discos/2026/2026-11`;
const KINDS_ROWS = `${ARCHIVE}/derived/builder-measure/kinds-rows-20261121T170238Z.jsonl`;
const DEV = `${ARCHIVE}/gp-covariance-strata/dev-rows`;
const T0_DIGEST = 'ef114fe59487d57ffc7c92be81fe22d01f443c564e3fce362897837ebb8f4eb7', T0_EVENTS = 1069553;

const TIERS = ['t0', 't1-s1', 't1-s2', 't1-s3'];
const RECORD = 14;
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
// 5 arms: S (SGP4), O (SDN-AP 0.7.2 operator SL + public history others), X (SGP4-XP operator SL + public history others),
// Op (SDN-AP 0.7.2 public history even for SL), Xp (SGP4-XP public history even for SL)
const SIDES = ['S', 'O', 'X', 'Op', 'Xp'];
const CORE_SIDES = ['S', 'O', 'X'];
const VIEWS = ['allButStarlinkPairs', 'all', 'starlinkWithOthers', 'starlinkPairs', 'noStarlink'];
const LIMITS = ['miss', 'pc1e-4', 'pc1e-5', 'pc3e-7'];
const SL = REGIMES.indexOf('SL');
const VECTOR_REGIMES = ['S1', 'DO', 'GD', 'GN', 'GE', 'IG'];

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sha256File = (f) => { const h = createHash('sha256'); const fd = fs.openSync(f, 'r'); const buf = Buffer.alloc(1 << 24); let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); fs.closeSync(fd); return h.digest('hex'); };
const nowUtc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sig = (x, n = 4) => (Number.isFinite(x) ? Number(x.toPrecision(n)) : null);
const quantile = (sorted, q) => { if (!sorted.length) return NaN; const x = (sorted.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo); };
const half = (norad) => createHash('sha256').update(String(norad)).digest()[0] & 1;
function rngOf(text) {
  const h = createHash('sha256').update(text).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12);
  return () => { a |= 0; b |= 0; c |= 0; d |= 0; const t = (((a + b) | 0) + d) | 0; d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0; return (t >>> 0) / 4294967296; };
}
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };

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
  if (sha256(raw) !== SNAPSHOT_SHA) throw new Error('GP snapshot differs from registered SHA');
  const newest = new Map();
  for (const g of JSON.parse(zlib.gunzipSync(raw))) { const id = Number(g.NORAD_CAT_ID), p = newest.get(id); if (!p || g.EPOCH >= p.EPOCH) newest.set(id, g); }
  return new Map([...newest].map(([id, g]) => [id, orbitOf(g)]));
}
function loadRadii() {
  const radius = new Map();
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

function loadRows(objects) {
  const meta = JSON.parse(fs.readFileSync(path.join(P7_DIR, 'latest-fifth.json'), 'utf8'));
  const vec = new Map();
  for (const f of fs.readdirSync(meta.vecDir).filter((x) => /^rows-\d+\.jsonl$/.test(x)).sort()) {
    for (const line of fs.readFileSync(path.join(meta.vecDir, f), 'utf8').split('\n')) {
      if (line) { const r = JSON.parse(line); vec.set(`${r.norad}|${r.startUtc}`, r); }
    }
  }
  const pools = Object.fromEntries(LEADS.map((L) => [L, REGIMES.map(() => [])]));
  for (const line of fs.readFileSync(meta.eJsonlPath, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line), g = GROUP_TO_REGIME[r.groupKey];
    if (!r.inAggregates || g === undefined) continue;
    const reg = REGIMES.indexOf(g), o = objects.get(r.noradId), band = o && bandOf(o) >= 0 ? bandOf(o) : DEFAULT_BAND[g];
    const useVec = VECTOR_REGIMES.includes(g), vr = useVec ? vec.get(`${r.noradId}|${r.startUtc}`) : null;
    for (const L of LEADS) {
      const d = r.days?.[String(L)];
      if (!d || !Number.isFinite(d.sgp4PublicSetM) || !Number.isFinite(d.sdnApFromPublicSetsM) || !Number.isFinite(d.sgp4XpFromPublicSetsM)) continue;
      const sKm = d.sgp4PublicSetM / 1000, oKm = d.sdnApFromPublicSetsM / 1000, xKm = d.sgp4XpFromPublicSetsM / 1000;
      const row = { norad: r.noradId, key: `${r.groupKey}|${r.noradId}|${r.startUtc}`, S: sKm, O: oKm, X: xKm, Op: oKm, Xp: xKm, band, half: half(r.noradId) };
      if (useVec && vr) {
        const vS = vr.sgp4?.v?.[String(L)], vO = vr.sdnAp?.v?.[String(L)], vX = vr.sgp4Xp?.v?.[String(L)];
        if (vS && vO && vX) {
          const vs = vS.map((z) => z / 1000), vo = vO.map((z) => z / 1000), vx = vX.map((z) => z / 1000);
          row.v = { S: vs, O: vo, X: vx, Op: vo, Xp: vx };
          row.S = Math.hypot(...vs); row.O = Math.hypot(...vo); row.X = Math.hypot(...vx);
          row.Op = row.O; row.Xp = row.X;
        }
      }
      pools[L][reg].push(row);
    }
  }
  // Starlink 18-24 h rows: operator records (from kinds-rows-20261121T170238Z.jsonl) AND public-history records (from Phase 7B)
  const slPubByNorad = new Map();
  for (const line of fs.readFileSync(path.join(P7_DIR, 'starlink-public-history-rows-20261121T170238Z.jsonl'), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.bins?.['18-24']) slPubByNorad.set(r.norad, r.bins['18-24']);
  }
  for (const line of fs.readFileSync(KINDS_ROWS, 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.leadHours?.[0] !== 18 || r.leadHours?.[1] !== 24) continue;
    const S = r.errorKm?.['SGP4 public set'], O = r.errorKm?.['SDN-AP production record'], X = r.errorKm?.['SGP4-XP production record'];
    const ph = slPubByNorad.get(r.norad);
    if (!Number.isFinite(S) || !Number.isFinite(O) || !Number.isFinite(X) || !ph) continue;
    const o = objects.get(r.norad), band = o && bandOf(o) >= 0 ? bandOf(o) : DEFAULT_BAND.SL;
    pools[1][SL].push({ norad: r.norad, key: `SL|${r.norad}`, S, O, X, Op: ph.apKm, Xp: ph.xpKm, band, half: half(r.norad) });
  }
  for (const L of LEADS) for (const rows of pools[L]) {
    const order = rows.map((r, i) => [r.S, i]).sort((a, b) => a[0] - b[0]);
    order.forEach(([, i], k) => { rows[i].q = (k + 0.5) / rows.length; });
  }
  return pools;
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
const rankIndex = (q, rng, n) => 3 * Math.min(n - 1, Math.max(0, Math.floor((q + (rng() - 0.5) * 0.05) * n)));
function inv3([a, b, c, d, e, f]) {
  const A = d * f - e * e, B = c * e - b * f, C = b * e - c * d, det = a * A + b * B + c * C;
  return [A / det, B / det, C / det, (a * f - c * c) / det, (b * c - a * e) / det, (a * d - b * b) / det];
}
const quad = (P, u0, u1, u2) => P[0] * u0 * u0 + 2 * P[1] * u0 * u1 + 2 * P[2] * u0 * u2 + P[3] * u1 * u1 + 2 * P[4] * u1 * u2 + P[5] * u2 * u2;

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
        if (rows[0].v) {
          const M = [0, 0, 0, 0, 0, 0];
          let nf = 0;
          for (const r of rows) if (r.half === 0) { const [x, y, z] = r.v[K]; M[0] += x * x; M[1] += x * y; M[2] += x * z; M[3] += y * y; M[4] += y * z; M[5] += z * z; nf++; }
          const row = { side: K, lead: L, regime: g, label: REGIME_LABEL[g], errors: 'signed vectors', fitObjects: new Set(rows.filter((r) => r.half === 0).map((r) => r.norad)).size, testObjects: new Set(rows.filter((r) => r.half === 1).map((r) => r.norad)).size, fitRows: nf, testRows: rows.length - nf };
          if (!nf || nf === rows.length) { out.push({ ...row, status: 'INSUFFICIENT' }); return; }
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
        if (!fit.length || !test.length) { out.push({ ...row, status: 'INSUFFICIENT' }); return; }
        const s2 = quantile(fit, 0.954) / CHI3[1];
        const f = CHI3.map((c) => test.filter((x) => x / s2 <= c).length / test.length);
        const ok = Math.abs(f[0] - NOMINAL[0]) <= TOL && Math.abs(f[1] - NOMINAL[1]) <= TOL && 1 - f[2] <= TAIL;
        scale[K][L][reg] = s2;
        out.push({ ...row, status: ok ? 'REALISTIC' : 'FAILED', rmsKm: sig(Math.sqrt(s2)), insideOneTwoThreeSigma: f.map((x) => sig(x, 3)) });
      });
    }
  }
  const realisticCore = Object.fromEntries(LEADS.map((L) => [L, REGIMES.map((g) => CORE_SIDES.every((K) => out.some((r) => r.side === K && r.lead === L && r.regime === g && r.status === 'REALISTIC')))]));
  const realisticAll = Object.fromEntries(LEADS.map((L) => [L, REGIMES.map((g) => SIDES.every((K) => out.some((r) => r.side === K && r.lead === L && r.regime === g && r.status === 'REALISTIC')))]));
  return { strata: out, scale, cov, realistic: realisticCore, realisticAll };
}

function prepare(objects, radii) {
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
    const keepG = [], keepM = [], keepR = [];
    const ex = { highlyEllipticalOrNoRegime: 0, notInSnapshot: 0 };
    for (let i = 0; i < n; i++) {
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
    index.tiers[id] = { n: m, read: n, step: 1, weight };
    index.excluded[id] = ex;
  }
  fs.writeFileSync(path.join(SCRATCH, 'index.json'), JSON.stringify(index));
  return index;
}
function loadTier(id, index) {
  const r = (f, T) => { const b = fs.readFileSync(path.join(SCRATCH, `${id}.${f}`)); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
  return { id, G: r('g.f32', Float32Array), M: r('m.u8', Uint8Array), R: r('r.f32', Float32Array), ...index.tiers[id] };
}

function emptyCounts() {
  const c = () => Object.fromEntries(LIMITS.map((l) => [l, 0]));
  return { notif: Object.fromEntries(SIDES.map((K) => [K, c()])), missed: Object.fromEntries(SIDES.map((K) => [K, c()])), real: 0, realPc: 0, pcWeight: 0, weight: 0, pcCalls: 0 };
}
const proj = (G, o, e) => [G[o] * e[0] + G[o + 1] * e[1] + G[o + 2] * e[2], G[o + 3] * e[0] + G[o + 4] * e[1] + G[o + 5] * e[2]];
function inPlane(G, o, S) {
  const p = [G[o], G[o + 1], G[o + 2]], q = [G[o + 3], G[o + 4], G[o + 5]];
  const Sv = (v) => [S[0] * v[0] + S[1] * v[1] + S[2] * v[2], S[1] * v[0] + S[3] * v[1] + S[4] * v[2], S[2] * v[0] + S[4] * v[1] + S[5] * v[2]];
  const Sp = Sv(p), Sq = Sv(q);
  return [p[0] * Sp[0] + p[1] * Sp[1] + p[2] * Sp[2], p[0] * Sq[0] + p[1] * Sq[1] + p[2] * Sq[2], q[0] * Sq[0] + q[1] * Sq[1] + q[2] * Sq[2]];
}

async function replicate(rep, ctx) {
  const { pools, D, real, tiers, pc, doPc } = ctx;
  const out = {};
  for (const L of LEADS) {
    const rng = rngOf(`alert-reduction:${rep}:${L}`);
    const use = pools[L].map((rows) => {
      if (rep === 0 || !rows.length) return rows;
      const byObj = new Map(); for (const r of rows) { if (!byObj.has(r.norad)) byObj.set(r.norad, []); byObj.get(r.norad).push(r); }
      const objs = [...byObj.values()], pick = [];
      for (let k = 0; k < objs.length; k++) pick.push(...objs[Math.floor(rng() * objs.length)]);
      return pick;
    });
    const tierUse = rep === 0 ? [['t0', 1], ['t1-s1', 1 / 3], ['t1-s2', 1 / 3], ['t1-s3', 1 / 3]] : [['t0', 1], [`t1-s${1 + (rep % 3)}`, 1]];
    const res = { views: Object.fromEntries(VIEWS.map((v) => [v, emptyCounts()])), leftOut: { starlinkAt3Days: 0, noRows: 0 } };
    const realL = real[L];
    const real1 = Object.fromEntries(SIDES.map((K) => [K, []]));
    const all = { ...Object.fromEntries(SIDES.map((K) => [K, []])), w: [], lim: [] };
    const sc = ctx.scale, Dd = D.dirs[L], Dn = Dd.map((u) => u.length / 3), Sh = D.shapes[L];
    const covCache = new Map();
    const covOf = (K, LL, reg, band) => {
      const key = `${K}|${reg}|${band}`;
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
        const V = res.views, targets = [V.all, nSL === 2 ? V.starlinkPairs : V.allButStarlinkPairs, nSL === 1 ? V.starlinkWithOthers : nSL === 0 ? V.noStarlink : null].filter(Boolean);
        const eligible = doPc && realL[rA] && realL[rB];
        for (const v of targets) { v.weight += w; if (isReal) v.real += w; if (eligible) { v.pcWeight += w; if (isReal) v.realPc += w; } }
        for (const K of SIDES) {
          const eA = rowA.v ? proj(G, o + 2, rowA.v[K]) : [rowA[K] * a1, rowA[K] * a2];
          const eB = rowB.v ? proj(G, o + 8, rowB.v[K]) : [rowB[K] * b1, rowB[K] * b2];
          const x = miss + eA[0] - eB[0], z = eA[1] - eB[1], pm = Math.hypot(x, z);
          const alert = pm < lim;
          for (const v of targets) { if (alert) v.notif[K].miss += w; else if (isReal) v.missed[K].miss += w; }
          if (nSL < 2 && isT0 && lim === 1 && miss < 1) real1[K].push(pm);
          if (nSL < 2) { all[K].push(pm); if (K === 'S') { all.w.push(w); all.lim.push(lim); } }
          if (!eligible || (!ctx.allSidesPc && !CORE_SIDES.includes(K))) continue;
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
    const missedS = real1.S.filter((x) => x >= 1).length;
    const matched = {};
    for (const K of ['O', 'X', 'Op', 'Xp']) {
      const sortedK = real1[K].slice().sort((a, b) => b - a);
      const R = missedS < sortedK.length ? sortedK[missedS] * (1 + 1e-9) : 0;
      let nK = 0, nS = 0;
      for (let k = 0; k < all.w.length; k++) if (all.lim[k] === 1) { if (all[K][k] < R) nK += all.w[k]; if (all.S[k] < 1) nS += all.w[k]; }
      matched[K] = { radiusKm: sig(R, 4), notificationsAtRadius: nK, notificationsPublicAt1Km: nS, missedAtRadius: real1[K].filter((x) => x >= R).length, missedPublicAt1Km: missedS, realCloseApproaches: real1.S.length };
    }
    res.matchedRadius = matched;
    out[L] = res;
  }
  return out;
}

async function context(withPc) {
  const objects = loadObjects();
  const pools = loadRows(objects);
  const D = loadDirections();
  const R = realism(pools, D);
  const index = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'index.json'), 'utf8'));
  const tiers = Object.fromEntries(TIERS.map((id) => [id, loadTier(id, index)]));
  let pc = null, wasmSha = null;
  if (withPc) {
    const { openPc } = await import(pathToFileURL(path.join(OAE, 'experiments/gp-covariance-strata/lib/capc.mjs')).href);
    wasmSha = sha256File(path.join(MODULES, 'analysis/conjunction-assessment/dist/isomorphic/module.wasm'));
    pc = await openPc(MODULES, wasmSha);
  }
  return { objects, pools, D, R, index, tiers, pc, wasmSha, scale: R.scale };
}

async function child() {
  const empiricalPc = process.argv.includes('--empirical-pc');
  const reps = arg('--reps', '').split(',').filter(Boolean).map(Number), pcReps = Number(arg('--pc-reps', '0'));
  const ctx = await context(empiricalPc || reps.some((r) => r <= pcReps));
  const allTrueReal = Object.fromEntries(LEADS.map((L) => [L, REGIMES.map(() => true)]));
  const anyRealistic = empiricalPc || LEADS.some((L) => ctx.R.realistic[L].some(Boolean));
  const repsDir = empiricalPc ? 'reps-pc' : 'reps';
  for (const rep of reps) {
    const doPc = empiricalPc ? true : (rep <= pcReps && anyRealistic);
    const t = Date.now();
    const res = await replicate(rep, { ...ctx, doPc, allSidesPc: empiricalPc, real: empiricalPc ? allTrueReal : ctx.R.realistic });
    fs.writeFileSync(path.join(SCRATCH, repsDir, `${rep}.json`), JSON.stringify({ rep, pc: doPc, seconds: (Date.now() - t) / 1000, res }));
    console.log(`${nowUtc()} ${empiricalPc ? '[emp-pc] ' : ''}rep ${rep} done (${((Date.now() - t) / 1000).toFixed(1)}s, pc=${doPc}, pcCalls1d=${res[1].views.all.pcCalls})`);
  }
  await ctx.pc?.close();
}

function interval(xs) { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length >= 10 ? [sig(quantile(s, 0.025)), sig(quantile(s, 0.975))] : null; }
function summarize(reps, L, pick, allSidesPc = false) {
  const central = pick(reps[0].res[L]);
  if (!central) return null;
  const line = {};
  for (const lim of LIMITS) {
    const isPc = lim !== 'miss';
    if (isPc && (!reps[0].pc || !central.pcWeight)) { line[lim] = 'not measured: no encounter in this view has realistic covariance across all three core arms'; continue; }
    const bs = reps.slice(1).filter((r) => !isPc || r.pc).map((r) => pick(r.res[L])).filter((b) => b && (!isPc || b.pcWeight));
    const useSides = (isPc && !allSidesPc) ? CORE_SIDES : SIDES;
    const notif = {}, missed = {};
    for (const K of useSides) {
      notif[K] = sig(central.notif[K][lim]);
      notif[`interval_${K}`] = interval(bs.map((b) => b.notif[K][lim]));
      missed[K] = sig(central.missed[K][lim]);
    }
    const redPct = (a, b) => (b > 0 ? 100 * (1 - a / b) : NaN);
    line[lim] = {
      notificationsPerWeek: notif,
      missedRealCloseApproaches: missed,
      realCloseApproaches: sig(isPc ? central.realPc : central.real),
      reductionSdnApVsSgp4Pct: sig(redPct(central.notif.O[lim], central.notif.S[lim]), 3),
      reductionSdnApVsSgp4Interval95: interval(bs.map((b) => redPct(b.notif.O[lim], b.notif.S[lim]))),
      reductionSdnApVsSgp4XpPct: sig(redPct(central.notif.O[lim], central.notif.X[lim]), 3),
      reductionSdnApVsSgp4XpInterval95: interval(bs.map((b) => redPct(b.notif.O[lim], b.notif.X[lim]))),
      reductionSgp4XpVsSgp4Pct: sig(redPct(central.notif.X[lim], central.notif.S[lim]), 3),
      ...((!isPc || allSidesPc) ? {
        reductionSdnApPublicOnlyVsSgp4Pct: sig(redPct(central.notif.Op[lim], central.notif.S[lim]), 3),
        reductionSdnApPublicOnlyVsSgp4Interval95: interval(bs.map((b) => redPct(b.notif.Op[lim], b.notif.S[lim]))),
        reductionSdnApPublicOnlyVsSgp4XpPublicOnlyPct: sig(redPct(central.notif.Op[lim], central.notif.Xp[lim]), 3),
        reductionSdnApPublicOnlyVsSgp4XpPublicOnlyInterval95: interval(bs.map((b) => redPct(b.notif.Op[lim], b.notif.Xp[lim]))),
      } : {}),
      encountersCounted: sig(isPc ? central.pcWeight : central.weight),
      encountersInView: sig(central.weight),
      replicates: bs.length,
    };
  }
  return line;
}

async function runEmpiricalPc() {
  const workers = Number(arg('--workers', '8')), pcReps = Number(arg('--pc-reps', '40'));
  console.log(`${nowUtc()} Phase 7C (Empirical Foster 2-D Pc CDM Notification Reduction): running ${pcReps + 1} reps across ${workers} workers (all 5 arms, all 8 regimes)...`);
  fs.mkdirSync(path.join(SCRATCH, 'reps-pc'), { recursive: true });
  for (const f of fs.readdirSync(path.join(SCRATCH, 'reps-pc'))) fs.rmSync(path.join(SCRATCH, 'reps-pc', f));
  const all = Array.from({ length: pcReps + 1 }, (_, i) => i);
  const lists = Array.from({ length: workers }, (_, k) => all.filter((r) => r % workers === k)).filter((l) => l.length);
  await Promise.all(lists.map((l, k) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF, '--child', '--empirical-pc', '--reps', l.join(','), '--pc-reps', String(pcReps)], { stdio: 'inherit', env: process.env });
    c.on('exit', (code) => (code ? reject(new Error(`emp-pc worker ${k} exited ${code}`)) : resolve()));
  })));
  const reps = all.map((r) => JSON.parse(fs.readFileSync(path.join(SCRATCH, 'reps-pc', `${r}.json`), 'utf8')));
  const emp = {
    note: 'Supplementary empirical Foster 2-D Pc CDM notification counts using each arm own empirically measured 95.4%-2sigma covariance across all 8 regimes (registered Amendment 3 strict realism-gated results above remain unchanged).',
    replicates: pcReps,
  };
  for (const L of LEADS) {
    emp[`${L}d`] = {
      views: Object.fromEntries(VIEWS.map((v) => [v, summarize(reps, L, (r) => r.views[v], true)])),
      pcModuleCalls: reps[0].res[L].views.all.pcCalls,
    };
  }
  const doc = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  doc.empiricalCalibratedPc = emp;
  fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n');
  console.log('\nEMPIRICAL FOSTER 2-D Pc CDM REDUCTION COMPLETE ->', OUT_PATH);
  for (const L of ['1d', '3d']) {
    const v = emp[L].views.allButStarlinkPairs;
    console.log(`\n=== ${L} allButStarlinkPairs (pcCalls=${emp[L].pcModuleCalls}) ===`);
    for (const lim of ['pc1e-4', 'pc1e-5', 'pc3e-7']) {
      console.log(lim, JSON.stringify({
        notif: { S: v[lim].notificationsPerWeek.S, O: v[lim].notificationsPerWeek.O, X: v[lim].notificationsPerWeek.X, Op: v[lim].notificationsPerWeek.Op, Xp: v[lim].notificationsPerWeek.Xp },
        missed: v[lim].missedRealCloseApproaches,
        redOvsS: v[lim].reductionSdnApVsSgp4Pct, ciOvsS: v[lim].reductionSdnApVsSgp4Interval95,
        redOpvsS: v[lim].reductionSdnApPublicOnlyVsSgp4Pct, ciOpvsS: v[lim].reductionSdnApPublicOnlyVsSgp4Interval95,
        redXvsS: v[lim].reductionSgp4XpVsSgp4Pct,
      }));
    }
  }
}

async function run() {
  const workers = Number(arg('--workers', '8')), missReps = Number(arg('--miss-reps', '200')), pcReps = Number(arg('--pc-reps', '40'));
  console.log(`${nowUtc()} Phase 7C: Preparing 32,863-object 1-week encounters (3 arms + public-only sensitivity)...`);
  const objects = loadObjects(), radii = loadRadii();
  const index = prepare(objects, radii);
  fs.mkdirSync(path.join(SCRATCH, 'reps'), { recursive: true });
  for (const f of fs.readdirSync(path.join(SCRATCH, 'reps'))) fs.rmSync(path.join(SCRATCH, 'reps', f));
  const all = Array.from({ length: missReps + 1 }, (_, i) => i);
  const lists = Array.from({ length: workers }, (_, k) => all.filter((r) => r % workers === k)).filter((l) => l.length);
  await Promise.all(lists.map((l, k) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF, '--child', '--reps', l.join(','), '--pc-reps', String(pcReps)], { stdio: 'inherit', env: process.env });
    c.on('exit', (code) => (code ? reject(new Error(`worker ${k} exited ${code}`)) : resolve()));
  })));
  const reps = all.map((r) => JSON.parse(fs.readFileSync(path.join(SCRATCH, 'reps', `${r}.json`), 'utf8')));
  const ctxR = realism(loadRows(objects), loadDirections());
  const results = {};
  for (const L of LEADS) {
    const mr0 = reps[0].res[L].matchedRadius;
    const matchedSummary = {};
    for (const K of ['O', 'X', 'Op', 'Xp']) {
      const red = (m) => 100 * (1 - m.notificationsAtRadius / m.notificationsPublicAt1Km);
      matchedSummary[K] = {
        ...mr0[K],
        reductionPercent: sig(red(mr0[K]), 3),
        reductionInterval95: interval(reps.slice(1).map((r) => red(r.res[L].matchedRadius[K]))),
        radiusInterval95: interval(reps.slice(1).map((r) => r.res[L].matchedRadius[K].radiusKm)),
      };
    }
    results[`${L}d`] = {
      views: Object.fromEntries(VIEWS.map((v) => [v, summarize(reps, L, (r) => r.views[v])])),
      leftOut: reps[0].res[L].leftOut,
      matchedRadius: matchedSummary,
      pcModuleCalls: reps[0].res[L].views.all.pcCalls,
    };
  }
  const wasmSha = sha256File(path.join(MODULES, 'analysis/conjunction-assessment/dist/isomorphic/module.wasm'));
  const doc = {
    schema: 'sdn-ap-alert-reduction-3arm-1',
    generatedUtc: nowUtc(),
    week: { from: '2026-11-06T00:00:00Z', to: '2026-11-13T00:00:00Z', objects: 32863, t0Events: T0_EVENTS, t0Digest: T0_DIGEST },
    arms: {
      S: 'SGP4 public Space-Track element sets',
      O: 'SDN-AP 0.7.2 (catalog-builder 0.2.2: operator ephemerides for Starlink, public element-set history for all others)',
      X: 'SGP4-XP (catalog-builder 0.2.2: operator ephemerides for Starlink, public element-set history for all others)',
      Op: 'SDN-AP 0.7.2 (catalog-builder 0.2.2: 100% public element-set history for every regime including Starlink)',
      Xp: 'SGP4-XP (catalog-builder 0.2.2: 100% public element-set history for every regime including Starlink)',
    },
    covarianceRealism: {
      amendment3SignedVectors: VECTOR_REGIMES,
      realisticCoreRegimes: Object.fromEntries(LEADS.map((L) => [L, REGIMES.filter((_, i) => ctxR.realistic[L][i])])),
      strata: ctxR.strata,
    },
    probabilityOfCollision: { algorithm: 'FOSTER', conjunctionAssessmentWasmSha256: wasmSha, radiusSources: index.radiusHow },
    results,
    replicates: { miss: missReps, pc: pcReps },
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n');
  console.log(`\nPHASE 7C COMPLETE -> ${OUT_PATH}`);
  console.log(JSON.stringify({
    realisticCore: doc.covarianceRealism.realisticCoreRegimes,
    '1d_allButStarlinkPairs': doc.results['1d'].views.allButStarlinkPairs,
    '1d_matchedRadius': doc.results['1d'].matchedRadius,
    '3d_allButStarlinkPairs': doc.results['3d'].views.allButStarlinkPairs,
  }, null, 2));
}

if (process.argv.includes('--child')) await child();
else if (process.argv.includes('--empirical-pc')) await runEmpiricalPc();
else await run();
process.exit(0);
