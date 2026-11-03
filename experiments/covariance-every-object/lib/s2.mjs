// S2.1-S2.3 evaluators (PLAN.md section 3 and readings 6, 9), on weighted cells so millions of object-day rows stay tractable. Cell row:
//   { regime, cluster, block, flagged, half (0|1), n, cb, co, cb4, co99, z: { n, ok: [3], sum: [3] } | undefined }
// n rows; cb / co = rows with d2 <= 7.815 under P_strat / P_o; cb4 = rows with 4 * d2Base <= 7.815 (the erratic-day power case); co99 = rows with d2O <= 11.345.
import { rng } from './synth.mjs';
export const C95 = 7.815, C99 = 11.345;
const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
const cov = (rows, f) => { const n = sum(rows, (r) => r.n); return n > 0 ? sum(rows, f) / n : NaN; };
function stratified(rows, g) {
  const by = new Map(); for (const r of rows) (by.get(r.regime) ?? by.set(r.regime, []).get(r.regime)).push(r);
  const v = [...by.values()].map(g).filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}
export function group(rows) {
  const u = new Map(); for (const x of rows) { const c = u.get(x.cluster) ?? u.set(x.cluster, new Map()).get(x.cluster); (c.get(x.block) ?? c.set(x.block, []).get(x.block)).push(x); } return u;
}
function resample(units, r) { // clusters with replacement, then blocks within each drawn cluster
  const cl = [...units.keys()], out = [];
  for (let i = 0; i < cl.length; i++) { const blocks = units.get(cl[Math.floor(r() * cl.length)]), keys = [...blocks.keys()]; for (let j = 0; j < keys.length; j++) for (const x of blocks.get(keys[Math.floor(r() * keys.length)])) out.push(x); }
  return out;
}
export function interval(rows, stat, B, seed) {
  const r = rng(seed), u = group(rows), v = [];
  for (let b = 0; b < B; b++) { const s = stat(resample(u, r)); if (Number.isFinite(s)) v.push(s); }
  v.sort((a, b) => a - b); return v.length < 0.9 * B ? null : [v[Math.floor(0.025 * v.length)], v[Math.min(v.length - 1, Math.floor(0.975 * v.length))]];
}
const s21 = (rows) => stratified(rows, (g) => { const a = g.filter((r) => !r.flagged), b = g.filter((r) => r.flagged); return a.length && b.length && sum(a, (r) => r.n) > 0 && sum(b, (r) => r.n) > 0 ? cov(a, (r) => r.cb) - cov(b, (r) => r.cb) : NaN; });
const nClusters = (rows) => new Set(rows.filter((r) => r.n > 0).map((r) => r.cluster)).size;

export function evalS21(rows, { B = 10000, seed = 1, nullPower = { falsePositive: 0, power: 1 } } = {}) {
  const flaggedClusters = nClusters(rows.filter((r) => r.flagged));
  if (nullPower.falsePositive > 0.05 || nullPower.power < 0.8 || flaggedClusters < 3) return { state: 'REPORT-ONLY', flaggedClusters, nullPower, estimate: s21(rows) };
  const ci = interval(rows, s21, B, seed); if (!ci) return { state: 'NOT EVALUABLE', flaggedClusters };
  return { state: ci[0] > 0 ? 'PASS' : 'FAIL', interval: ci, estimate: s21(rows), flaggedClusters };
}
/** Pre-freeze null: the flag label of each (cluster, block) unit is permuted over the units of its regime (unit counts held); share of permutations with the interval wholly above 0. */
export function s21Null(rows, { perms = 1000, inner = 200, seed = 7 } = {}) {
  const r = rng(seed), units = new Map(); // (regime|cluster|block) -> rows of both flag values merged by flag label
  for (const x of rows) { const k = `${x.regime}|${x.cluster}|${x.block}`; (units.get(k) ?? units.set(k, []).get(k)).push(x); }
  const byRegime = new Map(); for (const [k, v] of units) (byRegime.get(k.split('|')[0]) ?? byRegime.set(k.split('|')[0], []).get(k.split('|')[0])).push(v);
  let hit = 0;
  for (let p = 0; p < perms; p++) {
    const perm = [];
    for (const list of byRegime.values()) { // permute the flagged/unflagged split among units: swap whole flag profiles
      const profiles = list.map((v) => v.map((x) => x.flagged)); const idx = profiles.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      list.forEach((v, i) => { const fl = profiles[idx[i]]; v.forEach((x, m) => perm.push({ ...x, flagged: fl[m % fl.length] })); });
    }
    const ci = interval(perm, s21, inner, seed + p + 1); if (ci && ci[0] > 0) hit++;
  }
  return hit / perms;
}
/** Power: clusters bootstrapped; a share (default 20 %) of each cell's rows becomes erratic (error x2, d2 x4) and flagged, in expectation; share of replicates with the interval wholly above 0. */
export function s21Power(rows, { reps = 2000, inner = 200, seed = 11, share = 0.2 } = {}) {
  const r = rng(seed), u = group(rows); let hit = 0;
  for (let p = 0; p < reps; p++) {
    const boot = []; for (const x of resample(u, r)) { boot.push({ ...x, flagged: true, n: x.n * share, cb: x.cb4 * share }, { ...x, flagged: false, n: x.n * (1 - share), cb: x.cb * (1 - share) }); }
    const ci = interval(boot, s21, inner, seed + p + 1); if (ci && ci[0] > 0) hit++;
  }
  return hit / reps;
}
export function evalS22(rows, { B = 10000, seed = 2 } = {}) {
  const f = rows.filter((r) => r.flagged && r.n > 0); if (!f.length) return { state: 'NOT EVALUABLE', reason: 'no flagged object-days' };
  const stat = (g) => stratified(g, (h) => (h.length ? Math.abs(cov(h, (r) => r.co) - 0.95) - Math.abs(cov(h, (r) => r.cb) - 0.95) : NaN));
  const ci = interval(f, stat, B, seed); if (!ci) return { state: 'NOT EVALUABLE' };
  const covO = stratified(f, (h) => cov(h, (r) => r.co));
  return { state: ci[1] < 0 && covO <= 0.97 ? 'PASS' : 'FAIL', interval: ci, covO, covBase: stratified(f, (h) => cov(h, (r) => r.cb)) };
}
/** S2.3: strata: [{ name, rows (cells), o1b }]; L1 whole bin and each half, L2, L3 when o1b. */
export function evalS23(strata) {
  if (!strata.length) return { state: 'NOT EVALUABLE', reason: 'no stratum is labeled' };
  const fails = [];
  for (const s of strata) {
    const l1 = (g) => { const c = cov(g, (r) => r.co); return c >= 0.93 && c <= 0.97; };
    if (!l1(s.rows) || !l1(s.rows.filter((r) => r.half === 0)) || !l1(s.rows.filter((r) => r.half === 1))) fails.push(`${s.name}: L1`);
    if (!(cov(s.rows, (r) => r.co99) >= 0.975)) fails.push(`${s.name}: L2`);
    if (s.o1b) for (let k = 0; k < 3; k++) {
      const n = sum(s.rows, (r) => r.z.n), share = sum(s.rows, (r) => r.z.ok[k]) / n, m = sum(s.rows, (r) => r.z.sum[k]) / n;
      if (!(share >= 0.93 && share <= 0.97 && Math.abs(m) <= 0.5)) fails.push(`${s.name}: L3 axis ${k}`);
    }
  }
  return { state: fails.length ? 'FAIL' : 'PASS', fails };
}
