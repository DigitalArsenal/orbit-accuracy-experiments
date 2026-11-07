// AP covariance tails (PLAN.md): report only. Reads stored rows; flies nothing; selects no covariance form.
//   node experiments/ap-covariance-tails/run.mjs --run [--out <dir>]   table.json and README.md, from the rows alone
//   node experiments/ap-covariance-tails/run.mjs --check               the end to end
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ARCHIVE = '/opt/data/sdn-archive/operator-theory', PLAN = 'experiments/ap-covariance-tails/PLAN.md', RESULTS = path.join(repo, 'results/ap-covariance-tails');
const REFIT = path.join(repo, 'results/ap-truth/covariance-refit/table.json');
const DIRS = { A1: { T: 'covariance-model/trT', S1: 'covariance-model/trS1' }, A0: { T: 'covariance-coverage/truth', S1: 'covariance-coverage/truth2' } };
const BUILD = { A1: 'propagator/sdn-ap 0.6.1, wasm 05dd4a6600fb4c65d5841e1f49dc26df64fca7c14f1084644cafcfa875fe0a87', A0: 'propagator/sdn-ap 0.6.0, wasm 0b5280f05176fc755dbfb859fd8028fc495759d7537024c53043f498c91faa63, re-weighted to the refit\'s row' };
const BLOCKS = { T: { training: ['2025-04-01', '2025-08-10'], heldOut: ['2025-08-21', '2025-12-21'], arms: ['AP24', 'APRa12'] }, S1: { training: ['2026-01-01', '2026-03-15'], heldOut: ['2026-03-26', '2026-05-31'], arms: ['AP72', 'AP24'] } };
const REGIME = { T: 'Strong drag, 2025', S1: 'Near 700 km, 2026' };
const LEADS = [1, 6, 12, 24, 48, 72, 120, 167], VERDICT = [24, 72, 167], AXES = ['R', 'I', 'C'], BAND = [0.603, 0.754], HALF_NORMAL_MEDIAN = 0.6744897501960817;
const GAUSS2 = 0.0455002638963584, GAUSS3 = 0.0026997960632602, SE_CAL = 0.787, DAY = 86400000, HOUR = 3600000;
const NAMES = { 39451: 'Swarm B', 39452: 'Swarm A', 39453: 'Swarm C', 43476: 'GRACE-FO 1', 43477: 'GRACE-FO 2', 39634: 'Sentinel-1A', 62261: 'Sentinel-1C' };
const GROUP = { 39452: 'Swarm A+C', 39453: 'Swarm A+C', 39451: 'Swarm B', 43476: 'GRACE-FO', 43477: 'GRACE-FO', 39634: 'Sentinel-1', 62261: 'Sentinel-1' };
const SWARM = new Set([39451, 39452, 39453]), GRACE = new Set([43476, 43477]);
const GALILEO_HELD = [43567, 37847, 41862, 41174, 43055, 41175], SWARM_GRACE_LAST = '2025-12-28T00:00:00.000Z', COMMON_FROM = Date.parse('2025-10-04T00:00:00Z');
const DRAWS = 4000, SEED = 20261107, MIN_N = 30, ARC_HOURS = { AP24: 24, APRa12: 17, AP72: 72 }, STEP_SHIFT_MS = 2 * HOUR, GAP_MS = 2 * HOUR;
const REFUSED_PATH = /\/(p26|s1q4|dols)\/|udl|\.secrets/i;

const sig = (x, n = 6) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toPrecision(n)));
const pct = (x) => (x === null || x === undefined ? 'n/a' : `${(100 * x).toFixed(2)} %`);
const pr = (iv) => (iv ? `[${pct(iv[0]).replace(' %', '')}, ${pct(iv[1])}]` : 'n/a');
const num = (x, n = 3) => (x === null || x === undefined ? 'n/a' : Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(n));
const nr = (iv) => (iv ? `[${num(iv[0])}, ${num(iv[1])}]` : 'n/a');
const ni = (x) => (x === null || x === undefined ? 'undefined' : Math.round(x).toLocaleString('en-US'));
const leadLabel = (h) => (h === 167 ? 'day 7 (167 h)' : h % 24 ? `${h} h` : `day ${h / 24}`);

// ---- distribution functions (statistics only; no orbit computation here).
function erf(x) {
  if (x < 0) return -erf(-x);
  if (x > 6) return 1;
  let term = x, s = x;
  for (let n = 1; n < 400; n += 1) { term *= 2 * x * x / (2 * n + 1); s += term; if (term < 1e-17 * s) break; }
  return 2 / Math.sqrt(Math.PI) * Math.exp(-x * x) * s;
}
const chi3Cdf = (x) => (x <= 0 ? 0 : erf(Math.sqrt(x / 2)) - Math.sqrt(2 * x / Math.PI) * Math.exp(-x / 2));
const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function chi3Quantile(p) { let a = 0, b = 200; for (let i = 0; i < 200; i += 1) { const m = (a + b) / 2; if (chi3Cdf(m) < p) a = m; else b = m; } return (a + b) / 2; }
const CHI = [{ tail: 0.05 }, { tail: 0.01 }, { tail: GAUSS3 }].map((c) => ({ ...c, q: chi3Quantile(1 - c.tail) }));
const CHI3_MEDIAN = chi3Quantile(0.5);
const quantile = (sorted, n, p) => { // type 7; p = 0.5 is the refit's median
  if (!n) return null;
  const at = (n - 1) * p, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
};
const mulberry32 = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const rng = mulberry32(SEED);

// ---- rows.
const opened = new Set();
function linesOf(dir) {
  const full = path.join(ARCHIVE, dir);
  if (REFUSED_PATH.test(full)) throw new Error(`refused: ${full}`);
  const files = fs.readdirSync(full).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const out = [];
  for (const f of files) { opened.add(`${dir}/${f}`); for (const l of fs.readFileSync(path.join(full, f), 'utf8').split('\n')) if (l) out.push(l); }
  return out;
}
const blockOf = (b, date) => (date >= b.training[0] && date <= b.training[1] ? 'training' : date >= b.heldOut[0] && date <= b.heldOut[1] ? 'heldOut' : 'guard');
function d2Of(b, e) { // b: RR, TR, TT, NR, NT, NN
  const [a, x, c, d, f, g] = b, m00 = c * g - f * f, m01 = d * f - x * g, m02 = x * f - c * d, det = a * m00 + x * m01 + d * m02;
  if (!(a > 0 && a * c - x * x > 0 && det > 0)) return { pd: false, inv: null, d2: null };
  const inv = [m00 / det, m01 / det, (a * g - d * d) / det, m02 / det, (x * d - a * f) / det, (a * c - x * x) / det]; // RR, TR, TT, NR, NT, NN of the inverse
  return { pd: true, inv, d2: quad(inv, e) };
}
const quad = (i, e) => i[0] * e[0] * e[0] + i[2] * e[1] * e[1] + i[5] * e[2] * e[2] + 2 * (i[1] * e[0] * e[1] + i[3] * e[0] * e[2] + i[4] * e[1] * e[2]);
/** A0's variance on axis a at the refit's row: the refit's re-weighting identity (COVARIANCE-REFIT.md Terms). */
function reweighted(L, cp, t) {
  const sizes = [cp.NOISE_ECCENTRICITY_PER_DAY, cp.NOISE_INCLINATION_PER_DAY, cp.NOISE_MEAN_MOTION_RELATIVE, cp.NON_GRAVITATIONAL_SHARE], floor = [cp.FLOOR_UU_KM2, cp.FLOOR_VV_KM2, cp.FLOOR_WW_KM2];
  const rho = [(t.s_e / sizes[0]) ** 2, (t.s_i / sizes[1]) ** 2, (t.s_l / sizes[2]) ** 2, (t.c / sizes[3]) ** 2], keys = ['e', 'i', 'l', 'd'];
  return [0, 1, 2].map((a) => { let s = L.v.off[a] + (t.k_F - 1) * floor[a]; keys.forEach((k, j) => { s += rho[j] * (L.v.full[a] - L.v[k][a]); }); return s; });
}
function load(kind, table) {
  const samples = [], checks = { rows: 0, held: 0, guard: 0, notPd: 0, maxD2Diff: 0, d2Compared: 0 };
  for (const [regime, b] of Object.entries(BLOCKS)) {
    for (const line of linesOf(DIRS[kind][regime])) {
      const r = JSON.parse(line);
      checks.rows += 1;
      const cutMs = Date.parse(r.cutoff);
      if (GALILEO_HELD.includes(r.norad) || /starlink/i.test(r.name ?? '') || !NAMES[r.norad] || ((SWARM.has(r.norad) || GRACE.has(r.norad)) && cutMs + 7 * DAY > Date.parse(SWARM_GRACE_LAST))) { checks.held += 1; continue; }
      const block = blockOf(b, r.cutoff.slice(0, 10));
      if (block === 'guard') { checks.guard += 1; continue; }
      if (block === 'training' && (kind === 'A0' || regime === 'S1')) continue;
      const start = Date.parse(`${b[block][0]}T00:00:00Z`), week = Math.floor((cutMs - start) / (7 * DAY));
      for (const arm of b.arms) {
        const a = r.arms?.[arm];
        if (!a?.ok || !a.leads?.length || !a.covPropagation) continue;
        for (const L of a.leads) {
          if (!LEADS.includes(L.h)) continue;
          const s = { regime, block, norad: r.norad, group: GROUP[r.norad], arm, cutMs, week, h: L.h, offsetS: L.offsetS ?? 0, key: `${r.norad}|${r.cutoff}`, e: L.e };
          if (kind === 'A1') {
            const p = L.p.full, q = d2Of(p, L.e);
            s.z = [Math.abs(L.e[0]) / Math.sqrt(p[0]), Math.abs(L.e[1]) / Math.sqrt(p[2]), Math.abs(L.e[2]) / Math.sqrt(p[5])];
            s.d2 = q.d2; s.inv = q.inv; s.p = p;
            s.d2rc = (p[5] * L.e[0] * L.e[0] - 2 * p[3] * L.e[0] * L.e[2] + p[0] * L.e[2] * L.e[2]) / (p[0] * p[5] - p[3] * p[3]);
            if (!q.pd) checks.notPd += 1;
            else if (Number.isFinite(L.d2)) { checks.d2Compared += 1; checks.maxD2Diff = Math.max(checks.maxD2Diff, Math.abs(L.d2 - q.d2) / q.d2); }
          } else {
            const v = reweighted(L, a.covPropagation, table);
            s.z = v.map((w, i) => Math.abs(L.e[i]) / Math.sqrt(w));
            s.d2 = s.z.reduce((t, z) => t + z * z, 0);
          }
          samples.push(s);
        }
      }
    }
  }
  return { samples, checks };
}

// ---- a cell: the values of one statistic over a list of samples.
const CHI2_RC = [{ thr: -2 * Math.log(0.05), ref: 0.05 }, { thr: -2 * Math.log(GAUSS3), ref: GAUSS3 }];
const valueOf = (s, stat) => (stat === 'D' ? s.d2 : stat === 'RC' ? s.d2rc : s.z[AXES.indexOf(stat)]);
const tailsOf = (stat) => (stat === 'D' ? CHI.map((c) => ({ thr: c.q, ref: c.tail })) : stat === 'RC' ? CHI2_RC : [{ thr: 2, ref: GAUSS2 }, { thr: 3, ref: GAUSS3 }]);
const usable = (list, stat) => list.filter((s) => Number.isFinite(valueOf(s, stat)));
/** Weighted median and weighted nearest-rank quantile; with equal weights the median is the refit's. */
function weightedQuantile(pairs, p) {
  const s = pairs.slice().sort((a, b) => a[0] - b[0]), W = s.reduce((t, q) => t + q[1], 0), target = p * W;
  let c = 0;
  for (let i = 0; i < s.length; i += 1) { c += s[i][1]; if (c > target * (1 + 1e-12)) return s[i][0]; if (Math.abs(c - target) <= target * 1e-12) return (s[i][0] + (s[i + 1]?.[0] ?? s[i][0])) / 2; }
  return s.at(-1)?.[0] ?? null;
}
/** Cluster-robust effective n of an indicator's weighted share: PLAN.md Effective sample size. */
function effectiveN(list, indicator, clusterOf, weightOf = () => 1) {
  let W = 0, hit = 0;
  for (const s of list) { const w = weightOf(s); W += w; if (indicator(s)) hit += w; }
  if (!W) return { p: null, neff: null, clusters: 0 };
  const p = hit / W, by = new Map();
  for (const s of list) { const k = clusterOf(s), w = weightOf(s); by.set(k, (by.get(k) ?? 0) + w * ((indicator(s) ? 1 : 0) - p)); }
  const g = by.size;
  if (p === 0 || p === 1 || g < 2) return { p, neff: null, clusters: g };
  let sum = 0;
  for (const v of by.values()) sum += v * v;
  const variance = (g / (g - 1)) * sum / (W * W);
  return { p, neff: variance > 0 ? p * (1 - p) / variance : null, clusters: g };
}
const clusterGroupWeek = (s) => `${s.group}|${s.week}`;
const buffer = new Float64Array(1 << 18);
/** Intervals over draws of units. keys: unit names; keyOf: a sample's unit; draws: arrays of unit indices. */
function intervals(list, stat, keys, keyOf, draws, wantQuantiles) {
  const at = new Map(keys.map((k, i) => [k, i])), tails = tailsOf(stat), vals = keys.map(() => []);
  for (const s of list) { const i = at.get(keyOf(s)); if (i !== undefined) vals[i].push(valueOf(s, stat)); }
  const unit = vals.map((v) => ({ v: Float64Array.from(v), n: v.length, c: tails.map((t) => v.filter((x) => x > t.thr).length) }));
  const shares = tails.map(() => new Float64Array(draws.length)), Q = [0.5, stat === 'D' ? 0.95 : 1 - GAUSS2, 1 - GAUSS3], qs = Q.map(() => new Float64Array(draws.length));
  let used = 0;
  for (const d of draws) {
    let n = 0;
    const c = new Array(tails.length).fill(0);
    for (const u of d) { n += unit[u].n; for (let t = 0; t < tails.length; t += 1) c[t] += unit[u].c[t]; }
    if (!n) continue;
    for (let t = 0; t < tails.length; t += 1) shares[t][used] = c[t] / n;
    if (wantQuantiles) {
      let o = 0;
      for (const u of d) { buffer.set(unit[u].v, o); o += unit[u].n; }
      const b = buffer.subarray(0, o).sort();
      Q.forEach((p, j) => { qs[j][used] = quantile(b, o, p); });
    }
    used += 1;
  }
  const bounds = (a) => { const x = a.subarray(0, used).sort(); return [quantile(x, used, 0.025), quantile(x, used, 0.975)]; };
  return { draws: used, shares: shares.map(bounds), quantiles: wantQuantiles ? qs.map(bounds) : null };
}
const roundN = (iv, n = 6) => (iv ? iv.map((x) => sig(x, n)) : null);
const allSequences = (units) => { // every sequence of length units with replacement
  const out = [], n = units, seq = new Array(n).fill(0);
  for (;;) { out.push(seq.slice()); let i = n - 1; while (i >= 0 && ++seq[i] === n) { seq[i] = 0; i -= 1; } if (i < 0) return out; }
};
/** B-hier: PLAN.md. Groups with replacement, then each drawn group's 7-day blocks with replacement. */
function hierarchy(list) {
  const groups = [...new Set(list.map((s) => s.group))].sort(), weeks = new Map(groups.map((g) => [g, [...new Set(list.filter((s) => s.group === g).map((s) => s.week))].sort((a, b) => a - b)]));
  const keys = groups.flatMap((g) => weeks.get(g).map((w) => `${g}|${w}`)), at = new Map(keys.map((k, i) => [k, i]));
  const draws = [];
  for (let d = 0; d < DRAWS; d += 1) {
    const u = [];
    for (let i = 0; i < groups.length; i += 1) { const g = groups[Math.floor(rng() * groups.length)], w = weeks.get(g); for (let j = 0; j < w.length; j += 1) u.push(at.get(`${g}|${w[Math.floor(rng() * w.length)]}`)); }
    draws.push(u);
  }
  return { keys, draws };
}
const decide = (iv, ref) => (!iv ? 'not decidable' : iv[0] > ref ? 'heavier' : iv[1] < ref ? 'lighter' : 'not decidable');
/** Amendment 1, item 1: "lighter" needs a calibrated expected count of at least 5 at n_eff; a zero-hit cell is not decidable. */
const guarded = (raw, expected) => (raw === 'lighter' && !(expected >= 5) ? 'not decidable' : raw);
const inBand = (m) => m !== null && m >= BAND[0] && m <= BAND[1];

/** One cell's full figures. */
function cell(list, stat, opts) {
  const v = usable(list, stat), n = v.length, tails = tailsOf(stat), sorted = Float64Array.from(v.map((s) => valueOf(s, stat))).sort();
  const median = quantile(sorted, n, 0.5), windows = new Set(v.map((s) => s.key)).size;
  const out = { n, windows, satellites: new Set(v.map((s) => s.norad)).size, groups: new Set(v.map((s) => s.group)).size, clusters: new Set(v.map(clusterGroupWeek)).size, median: sig(median),
    tails: tails.map((t) => { const hits = v.filter((s) => valueOf(s, stat) > t.thr), by = new Map(); for (const s of hits) by.set(clusterGroupWeek(s), (by.get(clusterGroupWeek(s)) ?? 0) + 1);
      const top = [...by.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0], e = effectiveN(v, (s) => valueOf(s, stat) > t.thr, opts.cluster ?? clusterGroupWeek);
      return { threshold: sig(t.thr, 5), reference: sig(t.ref, 4), count: hits.length, share: sig(hits.length / n), neff: sig(e.neff, 4), expectedAtNeff: e.neff === null ? null : sig(e.neff * t.ref, 3), concentration: hits.length ? { cluster: top[0], share: sig(top[1] / hits.length, 3) } : null, upperBoundIfZero: hits.length ? null : sig(3 / e.clusters, 3) }; }) };
  if (stat !== 'D') {
    out.k0 = sig(median / HALF_NORMAL_MEDIAN, 4); out.k2 = sig(quantile(sorted, n, 1 - GAUSS2) / 2, 4); out.k3 = sig(quantile(sorted, n, 1 - GAUSS3) / 3, 4);
    out.inBand = inBand(median);
    out.neffMedian = sig(effectiveN(v, (s) => valueOf(s, stat) <= median, opts.cluster ?? clusterGroupWeek).neff, 4);
  } else {
    let sum = 0, ks = 0;
    for (let i = 0; i < n; i += 1) { sum += sorted[i]; const F = chi3Cdf(sorted[i]); ks = Math.max(ks, Math.abs((i + 1) / n - F), Math.abs(i / n - F)); }
    out.meanOver3 = sig(sum / n / 3, 4); out.ks = sig(ks, 3);
    out.k2 = sig(Math.sqrt(quantile(sorted, n, 0.95) / CHI[0].q), 4); out.k3 = sig(Math.sqrt(quantile(sorted, n, 1 - GAUSS3) / CHI[2].q), 4);
  }
  const want = opts.quantiles;
  for (const [name, b] of Object.entries(opts.boots ?? {})) {
    if (!b) { out[name] = null; continue; }
    const iv = intervals(v, stat, b.keys, b.keyOf, b.draws, want);
    out[name] = { draws: iv.draws, shares: iv.shares.map((x) => roundN(x)), median: want ? roundN(iv.quantiles[0]) : null,
      k2: want ? roundN(iv.quantiles[1].map((x) => (stat === 'D' ? Math.sqrt(x / CHI[0].q) : x / 2)), 4) : null, k3: want ? roundN(iv.quantiles[2].map((x) => (stat === 'D' ? Math.sqrt(x / CHI[2].q) : x / 3)), 4) : null };
  }
  if (out.bHier) out.tails.forEach((t, i) => { t.rawDecision = decide(out.bHier.shares[i], t.reference); t.decision = guarded(t.rawDecision, t.expectedAtNeff); });
  return out;
}
const leadsOf = (list, h) => list.filter((s) => s.h === h);
const bootsOf = (list, regime, hier) => {
  const sats = [...new Set(list.map((s) => s.norad))].sort((a, b) => a - b), groups = [...new Set(list.map((s) => s.group))].sort();
  return { bSat: { keys: sats, keyOf: (s) => s.norad, draws: allSequences(sats.length) },
    bGrp: groups.length > 1 ? { keys: groups, keyOf: (s) => s.group, draws: allSequences(groups.length) } : null,
    bHier: { keys: hier.keys, keyOf: clusterGroupWeek, draws: hier.draws } };
};

// ---- the study.
function grid(samples) {
  const out = [];
  for (const regime of Object.keys(BLOCKS)) {
    const list = samples.filter((s) => s.regime === regime && s.block === 'heldOut'), hier = hierarchy(list), boots = bootsOf(list, regime, hier);
    for (const h of LEADS) for (const stat of [...AXES, 'D']) out.push({ regime, h, stat, ...cell(leadsOf(list, h), stat, { boots, quantiles: VERDICT.includes(h) }) });
  }
  return out;
}
function perSatellite(samples) {
  const out = [];
  for (const norad of Object.keys(NAMES).map(Number)) {
    const list = samples.filter((s) => s.norad === norad && s.block === 'heldOut');
    const hier = hierarchy(list);
    for (const h of VERDICT) for (const stat of [...AXES, 'D']) {
      const c = cell(leadsOf(list, h), stat, { boots: { bHier: { keys: hier.keys, keyOf: clusterGroupWeek, draws: hier.draws } }, quantiles: stat !== 'D', cluster: (s) => s.week });
      out.push({ norad, name: NAMES[norad], group: GROUP[norad], regime: list[0]?.regime ?? null, h, stat, ...c });
    }
  }
  return out;
}
function perArm(samples) {
  const out = [];
  for (const [regime, b] of Object.entries(BLOCKS)) for (const arm of b.arms) for (const h of VERDICT) for (const stat of [...AXES, 'D']) {
    const list = samples.filter((s) => s.regime === regime && s.block === 'heldOut' && s.arm === arm && s.h === h);
    out.push({ regime, arm, h, stat, ...cell(list, stat, { quantiles: false }) });
  }
  return out;
}
/** A reading of T: the samples kept and each one's weight (equal totals per named group at each lead). */
function reading(list, keep, groupOf) {
  const v = list.filter(keep);
  if (!groupOf) return { v, weightOf: () => 1, clusterOf: clusterGroupWeek };
  const totals = new Map(); for (const s of v) totals.set(groupOf(s), (totals.get(groupOf(s)) ?? 0) + 1);
  return { v, weightOf: (s) => 1 / totals.get(groupOf(s)), clusterOf: (s) => `${groupOf(s)}|${s.week}` };
}
function readingCells(samples, keep, groupOf) {
  const out = [];
  for (const h of VERDICT) for (const stat of [...AXES, 'D']) {
    const list = samples.filter((s) => s.regime === 'T' && s.block === 'heldOut' && s.h === h), r = reading(usable(list, stat), keep, groupOf);
    if (!r.v.length) { out.push({ h, stat, n: 0 }); continue; }
    const pairs = r.v.map((s) => [valueOf(s, stat), r.weightOf(s)]), median = weightedQuantile(pairs, 0.5), W = pairs.reduce((t, q) => t + q[1], 0);
    const tails = tailsOf(stat).map((t) => { const e = effectiveN(r.v, (s) => valueOf(s, stat) > t.thr, r.clusterOf, r.weightOf); return { threshold: sig(t.thr, 5), reference: sig(t.ref, 4), share: sig(pairs.reduce((s, q) => s + (q[0] > t.thr ? q[1] : 0), 0) / W), neff: sig(e.neff, 4) }; });
    const c = { h, stat, n: r.v.length, windows: new Set(r.v.map((s) => s.key)).size, median: sig(median), tails, neffMedian: sig(effectiveN(r.v, (s) => valueOf(s, stat) <= median, r.clusterOf, r.weightOf).neff, 4) };
    if (stat !== 'D') { c.inBand = inBand(median); c.k0 = sig(median / HALF_NORMAL_MEDIAN, 4); c.k2 = sig(weightedQuantile(pairs, 1 - GAUSS2) / 2, 4); c.k3 = sig(weightedQuantile(pairs, 1 - GAUSS3) / 3, 4); }
    out.push(c);
  }
  return out;
}
/** V-one's interval: week blocks within fixed groups, the groups' shares averaged. */
function vOneIntervals(samples) {
  const out = [], list = samples.filter((s) => s.regime === 'T' && s.block === 'heldOut'), names = ['Swarm', 'GRACE-FO'], of = (s) => (SWARM.has(s.norad) ? 'Swarm' : 'GRACE-FO');
  const weeks = names.map((g) => [...new Set(list.filter((s) => of(s) === g).map((s) => s.week))].sort((a, b) => a - b));
  const draws = [];
  for (let d = 0; d < DRAWS; d += 1) draws.push(weeks.map((w) => w.map(() => w[Math.floor(rng() * w.length)])));
  for (const h of VERDICT) for (const stat of [...AXES, 'D']) {
    const v = usable(leadsOf(list, h), stat), tails = tailsOf(stat);
    const unit = names.map((g, i) => new Map(weeks[i].map((w) => { const x = v.filter((s) => of(s) === g && s.week === w); return [w, { n: x.length, c: tails.map((t) => x.filter((s) => valueOf(s, stat) > t.thr).length) }]; })));
    const shares = tails.map((_, t) => {
      const a = new Float64Array(DRAWS);
      draws.forEach((d, q) => { let s = 0; d.forEach((ws, g) => { let n = 0, c = 0; for (const w of ws) { n += unit[g].get(w).n; c += unit[g].get(w).c[t]; } s += n ? c / n : 0; }); a[q] = s / names.length; });
      a.sort();
      return [sig(quantile(a, DRAWS, 0.025)), sig(quantile(a, DRAWS, 0.975))];
    });
    out.push({ h, stat, shares, decisions: shares.map((iv, t) => decide(iv, tails[t].ref)) });
  }
  return out;
}
function swarmStudy(samples, s1BandCount, grid18) {
  const held = samples.filter((s) => s.regime === 'T' && s.block === 'heldOut'), train = samples.filter((s) => s.regime === 'T' && s.block === 'training');
  const countWindows = (list) => new Set(list.map((s) => s.key)).size;
  const shareRow = (list, test) => ({ windows: countWindows(list.filter(test)), of: countWindows(list), share: sig(countWindows(list.filter(test)) / countWindows(list), 4) });
  const isSwarm = (s) => SWARM.has(s.norad), isGrace = (s) => GRACE.has(s.norad), common = (s) => s.cutMs >= COMMON_FROM;
  const swarmOne = (s) => (isSwarm(s) ? 'Swarm' : 'GRACE-FO'), three = (s) => s.group;
  const R = { 'V-all': readingCells(samples, () => true), 'V-swarm': readingCells(samples, isSwarm), 'V-grace': readingCells(samples, isGrace), 'V-common': readingCells(samples, common),
    'V-common-swarm': readingCells(samples, (s) => common(s) && isSwarm(s)), 'V-common-grace': readingCells(samples, (s) => common(s) && isGrace(s)), 'V-one': readingCells(samples, () => true, swarmOne), 'V-three': readingCells(samples, () => true, three) };
  const bandCount = (cells) => cells.filter((c) => c.stat !== 'D' && c.inBand).length;
  const counts = Object.fromEntries(Object.entries(R).map(([k, c]) => [k, { strongDragInside: bandCount(c), of18: bandCount(c) + s1BandCount }]));
  const flips = R['V-all'].filter((c) => c.stat !== 'D').map((c) => { const o = R['V-one'].find((q) => q.h === c.h && q.stat === c.stat); return { h: c.h, axis: c.stat, all: c.median, one: o.median, allInside: c.inBand, oneInside: o.inBand }; }).filter((f) => f.allInside !== f.oneInside);
  const samplesShare = held.filter(isSwarm).length / held.length;
  for (const f of flips) { const m = (name) => R[name].find((c) => c.h === f.h && c.stat === f.axis).median; f.swarm = m('V-swarm'); f.grace = m('V-grace'); f.opposite = (f.swarm > BAND[1] && f.grace < BAND[0]) || (f.swarm < BAND[0] && f.grace > BAND[1]); }
  const vOne = vOneIntervals(samples);
  for (const iv of vOne) { const c = R['V-one'].find((q) => q.h === iv.h && q.stat === iv.stat); iv.rawDecisions = iv.decisions; iv.decisions = iv.rawDecisions.map((d, t) => guarded(d, c.tails[t].neff === null ? null : c.tails[t].neff * c.tails[t].reference)); }
  return { heldWindows: shareRow(held, isSwarm), pairAC: shareRow(held, (s) => s.group === 'Swarm A+C'), training: shareRow(train, isSwarm), sampleShare: sig(samplesShare, 4), readings: R, counts, flips, vOneIntervals: vOne,
    regimeCells: { strongDrag: 9, nearSeven: 9 } };
}
/** Amendment 1, items 3 and 4: post-read, explanation only. */
const NOMINAL_RADIUS = { T: 6878, S1: 7071 };
function jointDiagnostics(samples) {
  const out = [];
  for (const regime of Object.keys(BLOCKS)) {
    const list = samples.filter((s) => s.regime === regime && s.block === 'heldOut'), hier = hierarchy(list), r = NOMINAL_RADIUS[regime];
    for (const h of LEADS) {
      const v = leadsOf(list, h), n = v.length, med = (a, p = 0.5) => quantile(Float64Array.from(a).sort(), a.length, p), share = (a, t) => a.filter((x) => x > t).length / n;
      const diag = v.map((s) => s.z.reduce((t, z) => t + z * z, 0)), full = v.map((s) => s.d2);
      const rho = v.map((s) => s.p[1] / Math.sqrt(s.p[0] * s.p[2])), one = rho.map((q) => 1 - q * q), cond = v.map((s, i) => Math.sqrt(s.p[0] * one[i])), resid = v.map((s) => Math.abs(s.e[0] - (s.p[1] / s.p[2]) * s.e[1]));
      const curv = v.map((s) => s.e[1] * s.e[1] / (2 * r)), noCurv = v.map((s, i) => quad(s.inv, [s.e[0] + curv[i], s.e[1], s.e[2]]));
      // least squares of e_R on 1, e_I, e_I^2
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
      for (const s of v) { const q = [1, s.e[1], s.e[1] * s.e[1]]; for (let a = 0; a < 3; a += 1) { B[a] += q[a] * s.e[0]; for (let b = 0; b < 3; b += 1) A[a][b] += q[a] * q[b]; } }
      for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) { const f = A[j][i] / A[i][i]; for (let k = i; k < 3; k += 1) A[j][k] -= f * A[i][k]; B[j] -= f * B[i]; }
      const c = [0, 0, 0];
      for (let i = 2; i >= 0; i -= 1) { let t = B[i]; for (let k = i + 1; k < 3; k += 1) t -= A[i][k] * c[k]; c[i] = t / A[i][i]; }
      const iv = intervals(v, 'RC', hier.keys, clusterGroupWeek, hier.draws, false);
      const rc = CHI2_RC.map((t, i) => { const e = effectiveN(v, (s) => s.d2rc > t.thr, clusterGroupWeek), x = share(v.map((s) => s.d2rc), t.thr), raw = decide(iv.shares[i], t.ref); return { threshold: sig(t.thr, 5), reference: sig(t.ref, 4), share: sig(x), interval: roundN(iv.shares[i]), neff: sig(e.neff, 4), rawDecision: raw, decision: guarded(raw, e.neff === null ? null : e.neff * t.ref) }; });
      out.push({ regime, h, n, fullBeyond5: sig(share(full, CHI[0].q), 4), diagBeyond5: sig(share(diag, CHI[0].q), 4), fullBeyond027: sig(share(full, CHI[2].q), 4), diagBeyond027: sig(share(diag, CHI[2].q), 4), noCurvBeyond5: sig(share(noCurv, CHI[0].q), 4),
        rhoRI: sig(med(rho), 3), oneMinusRho2: { p10: sig(med(one, 0.1), 3), median: sig(med(one), 3) }, sigmaRkm: sig(med(v.map((s) => Math.sqrt(s.p[0]))), 3), sigmaIkm: sig(med(v.map((s) => Math.sqrt(s.p[2]))), 3), sigmaRgivenIkm: sig(med(cond), 3), radialResidualKm: sig(med(resid), 3), residualOverSigma: sig(med(resid.map((x, i) => x / cond[i])), 3),
        curvatureKm: { median: sig(med(curv), 3), p90: sig(med(curv, 0.9), 3) }, quadraticTerm: sig(c[2], 3), curvatureExpected: sig(-1 / (2 * r), 3), rc });
    }
  }
  return out;
}
/** Burn-censored near 700 km: PLAN.md, the model study's amendments 3 and 4. */
function burnCensored(samples) {
  const cat = new Map();
  for (const norad of [39634, 62261]) {
    const file = path.join(ARCHIVE, 'covariance-model/steps', `trS1-${norad}.json`); opened.add(`covariance-model/steps/trS1-${norad}.json`);
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    cat.set(norad, { steps: c.steps.map((x) => Date.parse(x.t.endsWith('Z') ? x.t : `${x.t}Z`) - STEP_SHIFT_MS).sort((a, b) => a - b), checked: c.checked.map(([a, b]) => [Date.parse(a.endsWith('Z') ? a : `${a}Z`), Date.parse(b.endsWith('Z') ? b : `${b}Z`)]).sort((a, b) => a[0] - b[0]) });
  }
  const clean = (norad, a, b) => {
    const e = cat.get(norad);
    if (e.steps.some((t) => t >= a && t <= b)) return false;
    let at = a;
    for (const [x, y] of e.checked) { if (y < at) continue; if (x > at + GAP_MS) return false; at = Math.max(at, y); if (at >= b - GAP_MS) return true; }
    return at >= b - GAP_MS;
  };
  const list = samples.filter((s) => s.regime === 'S1' && s.block === 'heldOut' && clean(s.norad, s.cutMs - ARC_HOURS[s.arm] * HOUR, s.cutMs) && clean(s.norad, s.cutMs, s.cutMs + s.h * HOUR + s.offsetS * 1000));
  const hier = hierarchy(list), out = [];
  for (const h of VERDICT) for (const stat of [...AXES, 'D']) {
    const v = leadsOf(list, h);
    if (v.length < MIN_N) { out.push({ h, stat, n: v.length, decidable: false }); continue; }
    out.push({ h, stat, decidable: true, ...cell(v, stat, { boots: { bHier: { keys: hier.keys, keyOf: clusterGroupWeek, draws: hier.draws } }, quantiles: stat !== 'D' }) });
  }
  return out;
}
/** Post-hoc, not a calibration: PLAN.md. */
function postHoc(samples) {
  const train = samples.filter((s) => s.regime === 'T' && s.block === 'training' && VERDICT.includes(s.h)), C = Float64Array.from(train.map((s) => s.z[2])).sort();
  const factors = { k_tail: quantile(C, C.length, 1 - GAUSS2) / 2, k_median: quantile(C, C.length, 0.5) / HALF_NORMAL_MEDIAN };
  const held = samples.filter((s) => s.regime === 'T' && s.block === 'heldOut' && VERDICT.includes(s.h));
  const parts = { all: () => true, Swarm: (s) => SWARM.has(s.norad), 'GRACE-FO': (s) => GRACE.has(s.norad) };
  const out = { measuredOn: { windows: new Set(train.map((s) => s.key)).size, samples: train.length, satellites: [...new Set(train.map((s) => NAMES[s.norad]))] }, factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, sig(v, 5)])), cells: [] };
  for (const [name, k] of [['none', 1], ...Object.entries(factors)]) for (const [part, test] of Object.entries(parts)) {
    const list = held.filter(test).map((s) => { const e = [s.e[0], s.e[1], s.e[2] / k]; return { ...s, z: [s.z[0], s.z[1], s.z[2] / k], d2: s.inv ? quad(s.inv, e) : null }; }), hier = hierarchy(list);
    for (const h of VERDICT) for (const stat of ['C', 'D']) {
      const c = cell(leadsOf(list, h), stat, { boots: { bHier: { keys: hier.keys, keyOf: clusterGroupWeek, draws: hier.draws } }, quantiles: false });
      out.cells.push({ factor: name, k: sig(k, 5), part, h, stat, n: c.n, median: c.median, tails: c.tails.map((t, i) => ({ ...t, interval: c.bHier.shares[i] })) });
    }
  }
  return out;
}
function controlA0(a0, a1) {
  const out = [];
  for (const regime of Object.keys(BLOCKS)) for (const h of LEADS) for (const stat of AXES) {
    const f = (S) => { const v = S.filter((s) => s.regime === regime && s.block === 'heldOut' && s.h === h), n = v.length, x = Float64Array.from(v.map((s) => valueOf(s, stat))).sort(); return { n, median: quantile(x, n, 0.5), s2: v.filter((s) => valueOf(s, stat) > 2).length / n, s3: v.filter((s) => valueOf(s, stat) > 3).length / n }; };
    const p = f(a0), q = f(a1);
    out.push({ regime, h, axis: stat, nA0: p.n, nA1: q.n, medianA0: sig(p.median), medianA1: sig(q.median), share2A0: sig(p.s2), share2A1: sig(q.s2), share3A0: sig(p.s3), share3A1: sig(q.s3), insideA0: inBand(p.median), insideA1: inBand(q.median) });
  }
  const dia = [];
  for (const regime of Object.keys(BLOCKS)) for (const h of VERDICT) {
    const v = a0.filter((s) => s.regime === regime && s.h === h);
    dia.push({ regime, h, n: v.length, meanSumZ2Over3: sig(v.reduce((t, s) => t + s.d2, 0) / v.length / 3, 4), shareBeyond7815: sig(v.filter((s) => s.d2 > CHI[0].q).length / v.length, 4) });
  }
  return { cells: out, diagonal: dia };
}
function sizeOfTest(cells) {
  const axes = cells.filter((c) => VERDICT.includes(c.h) && c.stat !== 'D');
  const list = axes.map((c) => { const se = c.neffMedian ? SE_CAL / Math.sqrt(c.neffMedian) : null, chance = se ? phi((BAND[1] - HALF_NORMAL_MEDIAN) / se) - phi((BAND[0] - HALF_NORMAL_MEDIAN) / se) : null; return { regime: c.regime, h: c.h, axis: c.stat, n: c.n, neffMedian: c.neffMedian, se: sig(se, 3), chanceInsideIfCalibrated: sig(chance, 3), observedInside: c.inBand }; });
  return { cells: list, expectedInside: sig(list.reduce((s, c) => s + (c.chanceInsideIfCalibrated ?? 0), 0), 3), observedInside: list.filter((c) => c.observedInside).length };
}

function study() {
  const refit = JSON.parse(fs.readFileSync(REFIT, 'utf8'));
  const A1 = load('A1'), A0 = load('A0', refit.fitted);
  const cells = grid(A1.samples), satellites = perSatellite(A1.samples), arms = perArm(A1.samples), control = controlA0(A0.samples, A1.samples), size = sizeOfTest(cells);
  const s1Band = cells.filter((c) => c.regime === 'S1' && VERDICT.includes(c.h) && c.stat !== 'D' && c.inBand).length;
  const swarm = swarmStudy(A1.samples, s1Band);
  const burns = burnCensored(A1.samples), post = postHoc(A1.samples), joint = jointDiagnostics(A1.samples);
  // the control against the refit's own table
  const refitCells = refit.heldOutVerdict.cells, mismatch = refitCells.filter((v) => { const c = control.cells.find((q) => q.regime === v.regime && q.h === v.h && q.axis === v.axis); return !c || c.medianA0 !== v.medianAbsZ || c.nA0 !== v.n; }).map((v) => `${v.regime} ${v.h} ${v.axis}`);
  const a0Inside = refitCells.filter((v) => control.cells.find((q) => q.regime === v.regime && q.h === v.h && q.axis === v.axis)?.insideA0).length;
  const armKeys = new Set(A0.samples.filter((s) => s.block === 'heldOut').map((s) => `${s.key}|${s.arm}|${s.h}`)), armKeys1 = new Set(A1.samples.filter((s) => s.block === 'heldOut').map((s) => `${s.key}|${s.arm}|${s.h}`));
  const onlyA0 = [...armKeys].filter((k) => !armKeys1.has(k)).length, onlyA1 = [...armKeys1].filter((k) => !armKeys.has(k)).length;
  const refused = [...opened].filter((f) => REFUSED_PATH.test(`/${f}`));
  return { study: PLAN, task: 'experiments-ap-covariance-tails-20261107', builds: BUILD, draws: DRAWS, seed: SEED,
    chiSquare3: { quantiles: CHI.map((c) => ({ tail: sig(c.tail, 4), q: sig(c.q, 6) })), median: sig(CHI3_MEDIAN, 5) }, reference: { two: sig(GAUSS2, 4), three: sig(GAUSS3, 4) },
    checks: { a1: A1.checks, a0: A0.checks, refitMismatch: mismatch, a0Inside, onlyA0, onlyA1, refused, opened: [...opened].sort() },
    cells, satellites, arms, swarm, burns, postHoc: post, joint, control, size };
}

// ---- the report.
function writeOut(outDir, t) {
  const V = t.cells.filter((c) => VERDICT.includes(c.h)), axisV = V.filter((c) => c.stat !== 'D'), D = V.filter((c) => c.stat === 'D');
  const range = (a) => [Math.min(...a), Math.max(...a)];
  const tailDecisions = (i) => { const q = axisV.map((c) => c.tails[i].decision); return { heavier: q.filter((d) => d === 'heavier').length, lighter: q.filter((d) => d === 'lighter').length, none: q.filter((d) => d === 'not decidable').length }; };
  const d2 = tailDecisions(0), d3 = tailDecisions(1), s2r = range(axisV.map((c) => c.tails[0].share)), s3r = range(axisV.map((c) => c.tails[1].share));
  const within = (key) => axisV.filter((c) => c[key] >= 0.5 && c[key] <= 2).length;
  const kr = (key) => range(axisV.map((c) => c[key]));
  const mahal = D.map((c) => c.tails[0].share), mahal3 = D.map((c) => c.tails[2].share), one = t.swarm.counts['V-one'], all = t.swarm.counts['V-all'];
  const summary = {
    twoSigma: { range: s2r, ...d2 }, threeSigma: { range: s3r, ...d3 },
    mahalanobis: { beyond95: range(mahal), beyond9973: range(mahal3) },
    factorOfTwo: { k0: kr('k0'), k2: kr('k2'), k3: kr('k3'), k0Inside: within('k0'), k2Inside: within('k2'), k3Inside: within('k3') }, swarm: { all, one },
  };
  const ks = (regime, h) => D.find((c) => c.regime === regime && c.h === h);
  summary.wholeCovariance = D.map((c) => ({ regime: c.regime, h: c.h, k95: c.k2, k9973: c.k3 }));
  const moved = (list) => list.filter((x) => x.rawDecision !== x.decision).length;
  summary.decisionsMoved = moved(t.cells.flatMap((c) => c.tails));
  const opposite = t.swarm.flips.filter((f) => f.opposite).length;
  const result = { ...t, summary };
  const L = [`Report only. On the refit's held-out windows, flown on 0.6.1: beyond 2 sigma ${pct(s2r[0])} to ${pct(s2r[1])} per axis at days 1, 3 and 7 against 4.55 % (heavier ${d2.heavier}, lighter ${d2.lighter}, not decidable ${d2.none} of 18); beyond 3 sigma ${pct(s3r[0])} to ${pct(s3r[1])} against 0.27 % (heavier ${d3.heavier}, lighter ${d3.lighter}, not decidable ${d3.none}). Per axis the factor on sigma that would make each share nominal is: median ${num(summary.factorOfTwo.k0[0])} to ${num(summary.factorOfTwo.k0[1])}, 2 sigma ${num(summary.factorOfTwo.k2[0])} to ${num(summary.factorOfTwo.k2[1])}, 3 sigma ${num(summary.factorOfTwo.k3[0])} to ${num(summary.factorOfTwo.k3[1])} (cells within a factor of two: ${summary.factorOfTwo.k0Inside}, ${summary.factorOfTwo.k2Inside}, ${summary.factorOfTwo.k3Inside} of 18). The joint figure is worse: Mahalanobis beyond the 5 % chi-square 3 quantile ${pct(summary.mahalanobis.beyond95[0])} to ${pct(summary.mahalanobis.beyond95[1])} and beyond the 0.27 % quantile ${pct(summary.mahalanobis.beyond9973[0])} to ${pct(summary.mahalanobis.beyond9973[1])}, the whole covariance needing a factor of ${num(ks('T', 24).k3)}, ${num(ks('T', 72).k3)} and ${num(ks('T', 167).k3)} at days 1, 3 and 7 in strong drag for the 0.27 % share. Median band: ${all.of18} of 18 pooled; ${t.swarm.counts['V-swarm'].of18} on Swarm alone, ${t.swarm.counts['V-grace'].of18} on GRACE-FO alone; ${one.of18} with Swarm reduced to one independent group, ${opposite} of the ${t.swarm.flips.length} cells it changes being cross-track cells where the two groups lie on opposite sides of the band: that is averaging, not calibration.`, '',
    '# AP covariance tails (PLAN.md)', '',
    `Rows: ${BUILD.A1} (primary, the coverage study's windows re-flown with the full RIC block); ${BUILD.A0} (control). Nothing flown here. That 0.6.3 and 0.6.4 have the same covariance is the site's statement, not tested here. z = forward error component / propagated 1-sigma. Both arms pooled, as the refit. n counts arm-samples: two arms of each daily window, so n far overstates the information; n_eff is the cluster-robust effective n (independent group x 7-day cutoff block), and the groups are Swarm A+C, Swarm B and GRACE-FO in strong drag, Sentinel-1 near 700 km. Intervals are 95 %: B-sat over satellites (exact), B-hier over groups then weeks (decision interval). Few clusters make all of them coarse; a percentile interval over 3 groups does not have its nominal coverage.`, '',
    '## Tail shares per axis and lead (0.6.1, held-out)', '',
    '| Regime | Lead | Axis | n | Median \\|z\\| | >2 sigma | B-sat | B-hier | n_eff | Reading | >3 sigma | B-sat | B-hier | n_eff | Calibrated count at n_eff | Reading |', '|---|---|---|---:|---:|---:|---|---|---:|---|---:|---|---|---:|---:|---|'];
  for (const c of t.cells.filter((q) => q.stat !== 'D')) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${c.stat} | ${c.n} | ${num(c.median)} | ${pct(c.tails[0].share)} | ${pr(c.bSat.shares[0])} | ${pr(c.bHier.shares[0])} | ${ni(c.tails[0].neff)} | ${c.tails[0].decision} | ${pct(c.tails[1].share)} | ${pr(c.bSat.shares[1])} | ${pr(c.bHier.shares[1])} | ${ni(c.tails[1].neff)} | ${c.tails[1].expectedAtNeff === null ? 'undefined' : c.tails[1].expectedAtNeff < 5 ? `${num(c.tails[1].expectedAtNeff)} (too few to resolve)` : num(c.tails[1].expectedAtNeff)} | ${c.tails[1].decision} |`);
  L.push('', `Gaussian: 4.55 % and 0.27 %. Reading: "heavier" if B-hier's lower bound exceeds the reference; "lighter" if its upper bound is below it and a calibrated covariance would expect at least 5 hits at n_eff (amendment 1; ${summary.decisionsMoved} registered "lighter" readings in this study's main grid moved to "not decidable"); otherwise "not decidable". "Too few to resolve": a calibrated covariance would expect under 5 hits at n_eff, so a share at or below 0.27 % cannot be confirmed, while a large excess can still be seen. n_eff is an estimate and is unstable for rare events; above n means no cluster effect could be detected.`, '',
    '## Mahalanobis against chi-square 3 (full RIC position block)', '',
    '| Regime | Lead | n | Mean d2/3 | Median d2 | KS | >7.815 (5 %) | B-hier | Reading | >11.345 (1 %) | B-hier | Reading | >14.156 (0.27 %) | B-hier | Reading | n_eff (5 %) | Whole-covariance factor, 5 % | 0.27 % |', '|---|---|---:|---:|---:|---:|---:|---|---|---:|---|---|---:|---|---|---:|---:|---:|');
  for (const c of t.cells.filter((q) => q.stat === 'D')) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${c.n} | ${num(c.meanOver3)} | ${num(c.median)} | ${num(c.ks)} | ${c.tails.map((x, i) => `${pct(x.share)} | ${pr(c.bHier.shares[i])} | ${x.decision}`).join(' | ')} | ${ni(c.tails[0].neff)} | ${num(c.k2)} ${VERDICT.includes(c.h) ? nr(c.bHier.k2) : ''} | ${num(c.k3)} ${VERDICT.includes(c.h) ? nr(c.bHier.k3) : ''} |`);
  L.push('', `Chi-square 3 median ${t.chiSquare3.median}, mean d2/3 = 1. Blocks not positive definite: ${t.checks.a1.notPd}. The module's own d2 in the row against this 3 x 3 d2: max relative difference ${num(t.checks.a1.maxD2Diff)} over ${t.checks.a1.d2Compared} samples. Whole-covariance factor: post-read, amendment 1.`, '',
    '## Why the joint and the axes disagree (post-read, amendment 1; explanation only)', '',
    'Each axis can sit near nominal while d2 fails, because d2 also tests the correlation. In strong drag the block\'s R-I correlation grows with lead, so given the in-track error the block allows little radial error; the sigma_R given I column is what it allows and the residual column is what occurs. The quadratic term is the fit of e_R on e_I^2. At days 5 and 7 in strong drag, where the in-track errors are large enough to measure it, it matches -1 / (2r): the orbit\'s curvature is in e_R, as straight axes require. At short leads the term is noise. Removing that curvature from e_R makes d2 worse, not better, so curvature does not explain the miss; the cause is not settled here. r is a nominal radius, a size estimate only.', '',
    '| Regime | Lead | d2 >7.815 | Sum z^2 >7.815 | d2 >14.156 | Sum z^2 >14.156 | d2 >7.815, curvature removed | rho(R, I) | 1 - rho^2, p10, median | sigma_R, km | sigma_I, km | sigma_R given I, km | Radial residual, km | Residual / sigma | e_I^2 / 2r, median, p90, km | Quadratic term, 1/km (expected) |', '|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|---|');
  for (const c of t.joint) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${pct(c.fullBeyond5)} | ${pct(c.diagBeyond5)} | ${pct(c.fullBeyond027)} | ${pct(c.diagBeyond027)} | ${pct(c.noCurvBeyond5)} | ${num(c.rhoRI)} | ${num(c.oneMinusRho2.p10)}, ${num(c.oneMinusRho2.median)} | ${num(c.sigmaRkm)} | ${num(c.sigmaIkm)} | ${num(c.sigmaRgivenIkm)} | ${num(c.radialResidualKm)} | ${num(c.residualOverSigma)} | ${num(c.curvatureKm.median)}, ${num(c.curvatureKm.p90)} | ${num(c.quadraticTerm)} (${num(c.curvatureExpected)}) |`);
  L.push('', 'The R-C plane alone, against chi-square 2. Whether the joint miss is confined to the R-I plane; no statement about collision probability follows from it.', '',
    '| Regime | Lead | >5.991 (5 %) | B-hier | Reading | >11.83 (0.27 %) | B-hier | Reading |', '|---|---|---:|---|---|---:|---|---|');
  for (const c of t.joint) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${pct(c.rc[0].share)} | ${pr(c.rc[0].interval)} | ${c.rc[0].decision} | ${pct(c.rc[1].share)} | ${pr(c.rc[1].interval)} | ${c.rc[1].decision} |`);
  L.push('', '## "Within about a factor of two": the factor on sigma per cell', '',
    'k0 = median |z| / 0.6745; k2 = 95.45th percentile / 2; k3 = 99.73rd percentile / 3. k > 1: the covariance is too narrow by that factor at that level; k < 1: too wide. The claim holds in the tails on a cell if k lies in [0.5, 2].', '',
    '| Regime | Lead | Axis | k0 | B-hier | k2 | B-hier | k3 | B-hier |', '|---|---|---|---:|---|---:|---|---:|---|');
  for (const c of axisV) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${c.stat} | ${num(c.k0)} | ${nr(c.bHier.median?.map((x) => x / HALF_NORMAL_MEDIAN))} | ${num(c.k2)} | ${nr(c.bHier.k2)} | ${num(c.k3)} | ${nr(c.bHier.k3)} |`);
  const S = t.swarm;
  L.push('', '## How much of the verdict is Swarm', '',
    `Strong-drag held-out windows: Swarm ${S.heldWindows.windows} of ${S.heldWindows.of} (${pct(S.heldWindows.share)}), of which the dependent pair A and C ${S.pairAC.windows}. Strong-drag training: Swarm ${S.training.windows} of ${S.training.of}: the refit's strong-drag half of the loss saw no GRACE-FO. Strong drag is 9 of the 18 band cells; near 700 km, 2 satellites in 1 group, is the other 9.`, '',
    '| Reading of strong drag | Strong-drag cells inside the band (of 9) | Of 18 with near 700 km |', '|---|---:|---:|');
  const LABEL = { 'V-all': 'All, as the refit pooled', 'V-swarm': 'Swarm only', 'V-grace': 'GRACE-FO only', 'V-common': 'All, cutoffs from 2025-10-04', 'V-common-swarm': 'Swarm, cutoffs from 2025-10-04', 'V-common-grace': 'GRACE-FO, cutoffs from 2025-10-04', 'V-one': 'Swarm as one independent group (the reduced verdict)', 'V-three': 'Groups A+C, B, GRACE-FO equal' };
  for (const [k, c] of Object.entries(S.counts)) L.push(`| ${LABEL[k]} | ${c.strongDragInside} | ${c.of18} |`);
  L.push('', S.flips.length ? `Cells that flip between pooled and reduced: ${S.flips.map((f) => `${leadLabel(f.h)} ${f.axis}, ${num(f.all)} to ${num(f.one)} (Swarm ${num(f.swarm)}, GRACE-FO ${num(f.grace)})`).join('; ')}. ${opposite} of ${S.flips.length} lie where the two groups are on opposite sides of the band: a weighted median between them lands inside without either group being calibrated.` : 'No cell flips between pooled and reduced.', '',
    '| Lead | Axis | All >2 | Swarm >2 | GRACE-FO >2 | Reduced >2 | Reduced interval | Reading | All >3 | Swarm >3 | GRACE-FO >3 | Reduced >3 | Reduced interval | Reading |', '|---|---|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---|---|');
  const pick = (name, q) => S.readings[name].find((c) => c.h === q.h && c.stat === q.stat);
  for (const q of S.readings['V-all'].filter((c) => c.stat !== 'D')) { const iv = S.vOneIntervals.find((x) => x.h === q.h && x.stat === q.stat), row = (i) => `${pct(q.tails[i].share)} | ${pct(pick('V-swarm', q).tails[i].share)} | ${pct(pick('V-grace', q).tails[i].share)} | ${pct(pick('V-one', q).tails[i].share)} | ${pr(iv.shares[i])} | ${iv.decisions[i]}`; L.push(`| ${leadLabel(q.h)} | ${q.stat} | ${row(0)} | ${row(1)} |`); }
  L.push('', '| Lead | Mahalanobis >5 % quantile: all | Swarm | GRACE-FO | Reduced | >0.27 % quantile: all | Swarm | GRACE-FO | Reduced |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const q of S.readings['V-all'].filter((c) => c.stat === 'D')) L.push(`| ${leadLabel(q.h)} | ${pct(q.tails[0].share)} | ${pct(pick('V-swarm', q).tails[0].share)} | ${pct(pick('V-grace', q).tails[0].share)} | ${pct(pick('V-one', q).tails[0].share)} | ${pct(q.tails[2].share)} | ${pct(pick('V-swarm', q).tails[2].share)} | ${pct(pick('V-grace', q).tails[2].share)} | ${pct(pick('V-one', q).tails[2].share)} |`);
  L.push('', 'GRACE-FO\'s held-out windows start 2025-10-04, Swarm\'s 2025-08-21: the common-span rows above separate season from satellite. The same storm reaches all five satellites, so groups are less independent than their count suggests.', '',
    '### Concentration of the >3 sigma samples in one group-week', '',
    '| Regime | Lead | Axis | Hits | Largest share from one group-week | Group, week starting |', '|---|---|---|---:|---:|---|');
  const weekOf = (regime, key) => { const [g, w] = key.split('|'); return `${g}, ${new Date(Date.parse(`${BLOCKS[regime].heldOut[0]}T00:00:00Z`) + Number(w) * 7 * DAY).toISOString().slice(0, 10)}`; };
  for (const c of axisV.filter((q) => q.tails[1].count)) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${c.stat} | ${c.tails[1].count} | ${pct(c.tails[1].concentration.share)} | ${weekOf(c.regime, c.tails[1].concentration.cluster)} |`);
  L.push('', '## Per satellite', '',
    '| Satellite | Lead | Axis | n | n_eff | Median \\|z\\| | Inside band | >2 sigma | B-hier | >3 sigma | B-hier | k2 | k3 |', '|---|---|---|---:|---:|---:|---|---:|---|---:|---|---:|---:|');
  for (const c of t.satellites.filter((q) => q.stat !== 'D')) L.push(`| ${c.name} | ${leadLabel(c.h)} | ${c.stat} | ${c.n} | ${ni(c.neffMedian)} | ${num(c.median)} | ${c.inBand ? 'yes' : 'no'} | ${pct(c.tails[0].share)} | ${pr(c.bHier.shares[0])} | ${pct(c.tails[1].share)} | ${pr(c.bHier.shares[1])} | ${num(c.k2)} | ${num(c.k3)} |`);
  L.push('', 'One satellite\'s interval is over its own weeks only.', '', '| Satellite | Lead | n | Mean d2/3 | >7.815 | >14.156 |', '|---|---|---:|---:|---:|---:|');
  for (const c of t.satellites.filter((q) => q.stat === 'D')) L.push(`| ${c.name} | ${leadLabel(c.h)} | ${c.n} | ${num(c.meanOver3)} | ${pct(c.tails[0].share)} | ${pct(c.tails[2].share)} |`);
  L.push('', '## The size of the 18-cell test', '',
    `A calibrated covariance at each cell's effective n would land inside [0.603, 0.754] in about ${num(t.size.expectedInside)} of 18 cells; observed ${t.size.observedInside} of 18 (0.6.1). SE = 0.787 / sqrt(n_eff).`, '',
    '| Regime | Lead | Axis | n | n_eff of the median | SE | Chance inside if calibrated | Inside |', '|---|---|---|---:|---:|---:|---:|---|');
  for (const c of t.size.cells) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${c.axis} | ${c.n} | ${ni(c.neffMedian)} | ${num(c.se)} | ${num(c.chanceInsideIfCalibrated)} | ${c.observedInside ? 'yes' : 'no'} |`);
  L.push('', '## Near 700 km, burn-censored (second reading)', '',
    'Primary figures above are uncensored, as the refit reported. Here by the model study\'s amendments 3 and 4 (a window-arm dropped if a step or unchecked stretch lies in its arc; a lead scored only if none lies in (cutoff, lead]); under 30 samples "not decidable". Strong drag cannot be censored: no maneuver record is held, so any Swarm or GRACE-FO maneuver is inside its shares.', '',
    '| Lead | Axis | n | Median \\|z\\| | >2 sigma | B-hier | Reading | >3 sigma | B-hier | Reading |', '|---|---|---:|---:|---:|---|---|---:|---|---|');
  for (const c of t.burns) { if (!c.decidable) { L.push(`| ${leadLabel(c.h)} | ${c.stat === 'D' ? 'd2' : c.stat} | ${c.n} | not decidable | | | | | | |`); continue; } const [a, b] = c.stat === 'D' ? [0, 2] : [0, 1]; L.push(`| ${leadLabel(c.h)} | ${c.stat === 'D' ? 'd2' : c.stat} | ${c.n} | ${num(c.median)} | ${pct(c.tails[a].share)} | ${pr(c.bHier.shares[a])} | ${c.tails[a].decision} | ${pct(c.tails[b].share)} | ${pr(c.bHier.shares[b])} | ${c.tails[b].decision} |`); }
  const P = t.postHoc;
  L.push('', 'For d2 the two columns are the 5 % and 0.27 % quantiles.', '',
    '## Post-hoc arm, exploratory, not a calibration', '',
    `Cross-track sigma of strong drag scaled by one constant at every lead. Measured on the refit's training block (${P.measuredOn.windows} windows, ${P.measuredOn.satellites.join(', ')}, days 1, 3 and 7 pooled): k_tail ${P.factors.k_tail}, k_median ${P.factors.k_median}. Tested on the held-out block, which neither measurement read; GRACE-FO is also a set of satellites they never saw. Designed after the held-out 2-sigma shares were public, so it is not a registered test. No form selected, nothing proposed for a module.`, '',
    '| Factor | Part | Lead | n | Median \\|z_C\\| | >2 sigma | B-hier | Reading | >3 sigma | B-hier | Reading |', '|---|---|---|---:|---:|---:|---|---|---:|---|---|');
  for (const c of P.cells.filter((q) => q.stat === 'C')) L.push(`| ${c.factor}${c.factor === 'none' ? '' : ` ${c.k}`} | ${c.part} | ${leadLabel(c.h)} | ${c.n} | ${num(c.median)} | ${pct(c.tails[0].share)} | ${pr(c.tails[0].interval)} | ${c.tails[0].decision} | ${pct(c.tails[1].share)} | ${pr(c.tails[1].interval)} | ${c.tails[1].decision} |`);
  L.push('', '| Factor | Part | Lead | n | d2 >7.815 | B-hier | Reading | d2 >11.345 | Reading | d2 >14.156 | B-hier | Reading |', '|---|---|---|---:|---:|---|---|---:|---|---:|---|---|');
  for (const c of P.cells.filter((q) => q.stat === 'D')) L.push(`| ${c.factor}${c.factor === 'none' ? '' : ` ${c.k}`} | ${c.part} | ${leadLabel(c.h)} | ${c.n} | ${pct(c.tails[0].share)} | ${pr(c.tails[0].interval)} | ${c.tails[0].decision} | ${pct(c.tails[1].share)} | ${c.tails[1].decision} | ${pct(c.tails[2].share)} | ${pr(c.tails[2].interval)} | ${c.tails[2].decision} |`);
  const maxd = (key1, key2) => Math.max(...t.control.cells.map((c) => Math.abs(c[key1] - c[key2])));
  L.push('', '## Control: the refit\'s literal rows (0.6.0 re-weighted, diagonal only)', '',
    `A0's 18 medians equal the refit's table: ${t.checks.refitMismatch.length ? `NO (${t.checks.refitMismatch.join(', ')})` : 'yes'}; inside the band ${t.checks.a0Inside} of 18. Between A0 and the 0.6.1 flights over all 48 axis-lead cells: largest difference in median ${num(maxd('medianA0', 'medianA1'))}, in the 2-sigma share ${pct(maxd('share2A0', 'share2A1'))}, in the 3-sigma share ${pct(maxd('share3A0', 'share3A1'))}. Window-arm-lead keys only in A0: ${t.checks.onlyA0}; only in A1: ${t.checks.onlyA1}.`, '',
    '| Regime | Lead | Axis | n A0 | n A1 | Median A0 | Median A1 | >2 A0 | >2 A1 | >3 A0 | >3 A1 |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of t.control.cells.filter((q) => VERDICT.includes(q.h))) L.push(`| ${REGIME[c.regime]} | ${leadLabel(c.h)} | ${c.axis} | ${c.nA0} | ${c.nA1} | ${num(c.medianA0)} | ${num(c.medianA1)} | ${pct(c.share2A0)} | ${pct(c.share2A1)} | ${pct(c.share3A0)} | ${pct(c.share3A1)} |`);
  L.push('', 'A0\'s Sum z^2 (diagonal, not Mahalanobis): ' + t.control.diagonal.map((c) => `${REGIME[c.regime]} ${leadLabel(c.h)}: mean / 3 ${num(c.meanSumZ2Over3)}, beyond 7.815 ${pct(c.shareBeyond7815)}`).join('; ') + '.');
  L.push('', `Rows read: A1 ${t.checks.a1.rows}, A0 ${t.checks.a0.rows}; hold-outs ${t.checks.a1.held + t.checks.a0.held}; in the guard ${t.checks.a1.guard + t.checks.a0.guard}. Not opened: \`covariance-model/{p26,s1q4,dols}\`.`, '',
    '## What these rows cannot support', '',
    '- A burn-censored strong-drag reading: no maneuver record is held.', '- More than a coarse between-group interval: 3 groups strong drag, 1 near 700 km.', '- Any claim beyond these two regimes, or about a shape of the covariance in another.', '- A statement that 0.6.3 or 0.6.4 behave the same: only 0.6.1 was flown on these windows.', '');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(result, null, 1)}\n`);
  fs.writeFileSync(path.join(outDir, 'README.md'), `${L.join('\n')}\n`);
  return result;
}

// ---- the end to end.
function check() {
  const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
  const git = (...a) => execFileSync('git', ['-C', repo, ...a]).toString().trim();
  const first = (p) => git('log', '--diff-filter=A', '--format=%H', '--', p).split('\n').at(-1);
  const reg = first(PLAN), res = first('results/ap-covariance-tails/table.json');
  const ancestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  ok(reg && res && reg !== res && ancestor(reg, res), `the registration ${reg?.slice(0, 10)} does not precede the results ${res?.slice(0, 10)}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-covariance-tails-'));
  const r = writeOut(dir, study());
  for (const f of ['table.json', 'README.md']) ok(fs.existsSync(path.join(RESULTS, f)) && fs.readFileSync(path.join(dir, f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/ap-covariance-tails/${f} does not reproduce from the rows`);
  fs.rmSync(dir, { recursive: true, force: true });
  ok(r.checks.a1.held + r.checks.a0.held === 0, 'hold-out rows in the store');
  ok(r.checks.refused.length === 0, `refused files opened: ${r.checks.refused.join(', ')}`);
  ok(r.checks.refitMismatch.length === 0, `A0's medians or counts differ from the refit's table: ${r.checks.refitMismatch.join(', ')}`);
  ok(r.checks.a0Inside === 8, `A0 inside the band: ${r.checks.a0Inside} of 18, the refit's is 8`);
  const a1Inside = r.cells.filter((c) => VERDICT.includes(c.h) && c.stat !== 'D' && c.inBand).length;
  const line = `ap-covariance-tails: band A0 ${r.checks.a0Inside}/18, A1 ${a1Inside}/18, reduced ${r.summary.swarm.one.of18}/18; beyond 2 sigma ${r.summary.twoSigma.range.map(pct).join(' to ')}, beyond 3 sigma ${r.summary.threeSigma.range.map(pct).join(' to ')}; k3 ${r.summary.factorOfTwo.k3.join(' to ')}`;
  if (fails.length) { console.log(`FAIL ${line}`); for (const f of fails) console.log(`  ${f}`); process.exit(1); }
  console.log(`PASS ${line}`);
}

if (process.argv.includes('--run')) { const r = writeOut(argOf('--out') ?? RESULTS, study()); console.log(JSON.stringify(r.summary)); }
else if (process.argv.includes('--check')) check();
else { console.error('usage: --run [--out dir] | --check'); process.exit(2); }
