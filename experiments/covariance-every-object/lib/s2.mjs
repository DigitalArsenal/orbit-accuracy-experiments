// S2.1-S2.3 evaluators (PLAN.md section 3 and readings 6, 9). Input rows from Part 1's fresh/dev coverage files:
//   { regime, cluster, block, flagged, d2Base, d2O, half (0|1), z: [zR, zT, zN] | undefined }
// d2Base = e' P_strat^-1 e, d2O = e' P_o^-1 e for the same error e. Coverage 95 %: d2 <= 7.815; 99 %: d2 <= 11.345.
import { rng } from './synth.mjs';
export const C95 = 7.815, C99 = 11.345;
const cov = (rows, f, c = C95) => (rows.length ? rows.filter((r) => f(r) <= c).length / rows.length : NaN);
/** Stratified (by regime) mean of g over regimes where both groups exist; groups: (rows) => number or NaN. */
function stratified(rows, g) {
  const by = new Map(); for (const r of rows) (by.get(r.regime) ?? by.set(r.regime, []).get(r.regime)).push(r);
  const v = [...by.values()].map(g).filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}
/** Cluster x block bootstrap: resample clusters with replacement, then blocks within each drawn cluster; returns rows. */
function resample(units, r) {
  const cl = [...units.keys()], out = [];
  for (let i = 0; i < cl.length; i++) {
    const blocks = units.get(cl[Math.floor(r() * cl.length)]), keys = [...blocks.keys()];
    for (let j = 0; j < keys.length; j++) out.push(...blocks.get(keys[Math.floor(r() * keys.length)]));
  }
  return out;
}
export function group(rows) {
  const u = new Map(); for (const x of rows) { const c = u.get(x.cluster) ?? u.set(x.cluster, new Map()).get(x.cluster); (c.get(x.block) ?? c.set(x.block, []).get(x.block)).push(x); } return u;
}
export function interval(rows, stat, B, seed) {
  const r = rng(seed), u = group(rows), v = [];
  for (let b = 0; b < B; b++) { const s = stat(resample(u, r)); if (Number.isFinite(s)) v.push(s); }
  v.sort((a, b) => a - b); return v.length < 0.9 * B ? null : [v[Math.floor(0.025 * v.length)], v[Math.min(v.length - 1, Math.floor(0.975 * v.length))]];
}
const s21 = (rows) => stratified(rows, (g) => { const a = g.filter((r) => !r.flagged), b = g.filter((r) => r.flagged); return a.length && b.length ? cov(a, (r) => r.d2Base) - cov(b, (r) => r.d2Base) : NaN; });
const clusters = (rows) => new Set(rows.map((r) => r.cluster)).size;

/** S2.1 on real rows: PASS when the interval of unflagged minus flagged P_strat coverage is wholly above 0 (and the frozen null/power rows allow it). */
export function evalS21(rows, { B = 10000, seed = 1, nullPower = { falsePositive: 0, power: 1 } } = {}) {
  const flaggedClusters = clusters(rows.filter((r) => r.flagged));
  if (nullPower.falsePositive > 0.05 || nullPower.power < 0.8 || flaggedClusters < 3) return { state: 'REPORT-ONLY', flaggedClusters, nullPower };
  const ci = interval(rows, s21, B, seed); if (!ci) return { state: 'NOT EVALUABLE', flaggedClusters };
  return { state: ci[0] > 0 ? 'PASS' : 'FAIL', interval: ci, estimate: s21(rows), flaggedClusters };
}
/** S2.1 pre-freeze null: flag labels permuted over object-days within regime (counts held); share of permutations with the interval wholly above 0. */
export function s21Null(rows, { perms = 1000, inner = 200, seed = 7 } = {}) {
  const r = rng(seed); let hit = 0;
  for (let p = 0; p < perms; p++) {
    const by = new Map(); for (const x of rows) (by.get(x.regime) ?? by.set(x.regime, []).get(x.regime)).push(x);
    const perm = []; for (const g of by.values()) { const lab = g.map((x) => x.flagged); for (let i = lab.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lab[i], lab[j]] = [lab[j], lab[i]]; } g.forEach((x, i) => perm.push({ ...x, flagged: lab[i] })); }
    const ci = interval(perm, s21, inner, seed + p + 1); if (ci && ci[0] > 0) hit++;
  }
  return hit / perms;
}
/** S2.1 power: bootstrap the clusters; a random 20 % of object-days become erratic (error x2, so d2 x4) and flagged; share with the interval wholly above 0. */
export function s21Power(rows, { reps = 2000, inner = 200, seed = 11, share = 0.2 } = {}) {
  const r = rng(seed), u = group(rows); let hit = 0;
  for (let p = 0; p < reps; p++) {
    const boot = resample(u, r).map((x) => (r() < share ? { ...x, flagged: true, d2Base: x.d2Base * 4 } : { ...x, flagged: false }));
    const ci = interval(boot, s21, inner, seed + p + 1); if (ci && ci[0] > 0) hit++;
  }
  return hit / reps;
}
/** S2.2: on flagged days, interval of |cov_o - 0.95| - |cov_base - 0.95| wholly below 0 and cov_o <= 0.97. */
export function evalS22(rows, { B = 10000, seed = 2 } = {}) {
  const f = rows.filter((r) => r.flagged); if (!f.length) return { state: 'NOT EVALUABLE', reason: 'no flagged object-days' };
  const stat = (g) => stratified(g.filter((r) => r.flagged), (h) => (h.length ? Math.abs(cov(h, (r) => r.d2O) - 0.95) - Math.abs(cov(h, (r) => r.d2Base) - 0.95) : NaN));
  const ci = interval(f, stat, B, seed); if (!ci) return { state: 'NOT EVALUABLE' };
  const covO = stratified(f, (h) => cov(h, (r) => r.d2O));
  return { state: ci[1] < 0 && covO <= 0.97 ? 'PASS' : 'FAIL', interval: ci, covO, covBase: stratified(f, (h) => cov(h, (r) => r.d2Base)) };
}
/** S2.3: every labeled stratum still meets L1 (whole bin and each half), L2, and L3 when o1b, under P_o. strata: [{ name, rows, o1b }]. */
export function evalS23(strata) {
  if (!strata.length) return { state: 'NOT EVALUABLE', reason: 'no stratum is labeled' };
  const fails = [];
  for (const s of strata) {
    const l1 = (g) => { const c = cov(g, (r) => r.d2O); return c >= 0.93 && c <= 0.97; };
    if (!l1(s.rows) || !l1(s.rows.filter((r) => r.half === 0)) || !l1(s.rows.filter((r) => r.half === 1))) fails.push(`${s.name}: L1`);
    if (!(cov(s.rows, (r) => r.d2O, C99) >= 0.975)) fails.push(`${s.name}: L2`);
    if (s.o1b) for (let k = 0; k < 3; k++) {
      const z = s.rows.map((r) => r.z[k]), share = z.filter((x) => Math.abs(x) <= 1.96).length / z.length, m = z.reduce((a, b) => a + b, 0) / z.length;
      if (!(share >= 0.93 && share <= 0.97 && Math.abs(m) <= 0.5)) fails.push(`${s.name}: L3 axis ${k}`);
    }
  }
  return { state: fails.length ? 'FAIL' : 'PASS', fails };
}
