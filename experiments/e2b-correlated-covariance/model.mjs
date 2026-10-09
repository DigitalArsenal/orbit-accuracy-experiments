// E2b's covariance products (PLAN.md section 5) from the train fit
// (results/e2b/train/products.json) and a window's module outputs. Statistics
// only: the errors, differences and mapped covariances are the module's.
import { epochMs } from '../../harness/gp-archive.mjs';
import { add, full3, inv3, isPD, lerp, lower3, mul3, scale, sub, t3, mv3 } from './linalg.mjs';
import { config, DAY_MS } from './common.mjs';

export const binOf = (bins, x) => bins.findIndex(([lo, hi]) => x >= lo && x < hi);
// The gap bin, with the last bin closed above.
export const gapBin = (g) => { const k = binOf(config.bins.gapBinsDays, g); return k >= 0 ? k : (g === config.bins.gapBinsDays.at(-1)[1] ? config.bins.gapBinsDays.length - 1 : -1); };

// A regime's measured covariance T0(age): linear in age between the centres of
// bins with enough samples, constant beyond the first and last.
export function t0Function(t0) {
  const nodes = t0.bins.map((b, k) => ({ c: (b[0] + b[1]) / 2, l: t0.lower[k], n: t0.n[k] })).filter((x) => x.l && x.n >= t0.minimumSamples);
  return (age) => {
    if (age <= nodes[0].c) return nodes[0].l;
    if (age >= nodes.at(-1).c) return nodes.at(-1).l;
    let k = 1;
    while (nodes[k].c < age) ++k;
    return lerp(nodes[k - 1].l, nodes[k].l, (age - nodes[k - 1].c) / (nodes[k].c - nodes[k - 1].c));
  };
}

// The correlation model: C(old at age a_old, new at age a_new) =
// D(a_old) R(g, a_new) D(a_new), R by gap bin, linear in the newer set's age
// between the tau nodes; D the square roots of the diagonal of `cov(age)`.
export function crossFunction(R, cov) {
  const taus = R.tausDays;
  const at = (g, aNew) => {
    const b = gapBin(g);
    if (b < 0) return null;
    const node = (k) => R.R[k]?.[b];
    if (aNew <= taus[0]) return node(0);
    if (aNew >= taus.at(-1)) return node(taus.length - 1);
    let k = 1;
    while (taus[k] < aNew) ++k;
    const a = node(k - 1), c = node(k);
    if (!a || !c) return a ?? c ?? null;
    return lerp(a, c, (aNew - taus[k - 1]) / (taus[k] - taus[k - 1]));
  };
  return (aOld, aNew) => {
    const r = at(aOld - aNew, aNew);
    if (!r) return null;
    const dOld = full3(cov(aOld)), dNew = full3(cov(aNew));
    const so = [0, 4, 8].map((k) => Math.sqrt(dOld[k])), sn = [0, 4, 8].map((k) => Math.sqrt(dNew[k]));
    return r.map((v, k) => v * so[Math.floor(k / 3)] * sn[k % 3]);  // row-major 3x3, E[e_old e_new']
  };
}

// Trailing mean of q = d' S(g)^-1 d / 3 over consecutive pairs whose later set
// was created in (t - trailing, t], from a window's step-15 rows.
export function kappaFunction(rows, S, { trailingDays, maxGapDays, minimumObjectPairs }) {
  const inverse = S.lower.map((l) => (l && isPD(l) ? inv3(full3(l)) : null));
  const items = [];
  for (const r of rows) {
    if (r.gapDays > maxGapDays) continue;
    const b = gapBin(r.gapDays);
    if (b < 0 || !inverse[b]) continue;
    const d = r.d.slice(0, 3), w = mv3(inverse[b], d);
    const q = (d[0] * w[0] + d[1] * w[1] + d[2] * w[2]) / 3;
    items.push({ t: epochMs(r.newerCreated), norad: r.norad, q });
  }
  const series = (list) => {
    list.sort((a, b) => a.t - b.t);
    const t = list.map((x) => x.t), sum = [0];
    for (const x of list) sum.push(sum.at(-1) + x.q);
    const upper = (v) => { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] <= v) lo = m + 1; else hi = m; } return lo; };
    return (at) => { const j = upper(at), i = upper(at - trailingDays * DAY_MS); return { n: j - i, mean: j > i ? (sum[j] - sum[i]) / (j - i) : NaN }; };
  };
  const regime = series([...items]);
  const byObject = new Map();
  for (const x of items) { if (!byObject.has(x.norad)) byObject.set(x.norad, []); byObject.get(x.norad).push(x); }
  const objects = new Map([...byObject].map(([k, v]) => [k, series(v)]));
  return {
    regime: (at) => regime(at),
    object: (norad, at) => {
      const o = objects.get(norad)?.(at);
      return o && o.n >= minimumObjectPairs ? { ...o, fallback: false } : { ...regime(at), fallback: true };
    },
  };
}

// The product covariances of one scoring sample {norad, created (ms), tau,
// age, literature?}: lower 3x3 (km^2) or null.
export function productCovariances(products, kappa, sample) {
  const T0 = products.t0(sample.age);
  const k = products.c2.taus.indexOf(sample.tau);
  const out = {
    C2a: products.c2.C2a[k], C2b: products.c2.C2b[k], C5: products.c2.C5[k], T0,
    K1: null, K1o: null,
  };
  const kr = kappa.regime(sample.created), ko = kappa.object(sample.norad, sample.created);
  if (Number.isFinite(kr.mean) && kr.n > 0) out.K1 = scale(T0, kr.mean);
  if (Number.isFinite(ko.mean) && ko.n > 0) out.K1o = scale(T0, ko.mean);
  const lit = sample.literature;
  if (lit) {
    out.C1a = lit.C1a ?? null;
    out.C1b = lit.C1b ?? null;
    out.C3a = lit.C3a ?? null;
    out.C3b = lit.C3a ? scale(lit.C3a, config.products.c3.factors.C3b / config.products.c3.factors.C3a) : null;
  }
  for (const key of Object.keys(out)) if (out[key] && !isPD(out[key])) out[key] = { notPositiveDefinite: true };
  return out;
}

// Predicted covariance of a consecutive difference d = e_old - e_new at the
// newer set's epoch (H4): correlated and independent.
export function differenceCovariances(products, gap) {
  const P0 = full3(products.t0(0)), Pg = full3(products.t0(gap));
  const C = products.crossConsecutive(gap, 0);
  const independent = lower3(Pg.map((v, i) => v + P0[i]));
  if (!C) return { independent, correlated: null };
  const correlated = lower3(Pg.map((v, i) => v + P0[i] - C[i] - t3(C)[i]));
  return { independent, correlated };
}

// The train products of one regime as functions.
export function regimeProducts(fitted) {
  const t0 = t0Function(fitted.T0);
  return {
    t0,
    c2: fitted.C2,
    S: fitted.S,
    crossConsecutive: crossFunction(fitted.R.consecutive, t0),
    crossNear: (cov) => crossFunction(fitted.R.near, cov),
    selection: fitted.selection,
  };
}
export { add, sub, mul3 };
