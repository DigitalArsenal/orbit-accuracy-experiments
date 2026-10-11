// S3 (element-set objects): the statistics that build the candidate models from module outputs (PLAN.md section 4),
// and their application through analysis/gp-error-model calibrate_covariance. Second moments, quantiles and means
// only; every covariance an object is given comes from the module.
import { quantile } from '../../harness/stats.mjs';
import { full3, inv3 } from '../e2b-correlated-covariance/linalg.mjs';
import { config, DAY_MS, callJson, json, readRuns } from './common.mjs';

export const REGIME_INDEX = new Map(config.regimes.map((r, i) => [r.id, i]));
export const AGE_BINS = config.s3AgeBinsDays;
export const ageIndexOf = (age) => AGE_BINS.findIndex(([lo, hi], i) => age >= lo && (age < hi || (i === AGE_BINS.length - 1 && age === hi)));
export const GAP_BINS = [[0, 0.25], [0.25, 0.5], [0.5, 1], [1, 2], [2, 3]];
export const gapIndexOf = (g) => GAP_BINS.findIndex(([lo, hi], i) => g > lo && (g <= hi));

// Step-10 rows usable for S3: present, regime known; `screened` rows are kept only when asked.
export async function errorRows(runIds, { includeScreened = false } = {}) {
  return readRuns(runIds, 'errors', (r) => !r.missing && r.regime && r.rtn && (includeScreened || !r.screened));
}
export async function differenceRows(runIds) { return readRuns(runIds, 'differences', (r) => r.regime && r.d); }

// 6x6 second moment about zero (lower triangle, 21) of a list of 6-vectors.
export function secondMoment(xs) {
  const m = Array(21).fill(0);
  for (const x of xs) for (let a = 0, t = 0; a < 6; ++a) for (let b = 0; b <= a; ++b, ++t) m[t] += x[a] * x[b];
  return m.map((v) => v / Math.max(1, xs.length));
}
// The gp-error-model clip: centre the median, scale (q84.13 - q15.87) / 2 per position component; kept when all three
// position components lie within k scales.
export function clipped(xs, k = config.s3.clipK) {
  const centre = [0, 1, 2].map((c) => quantile(xs.map((x) => x[c]), 0.5));
  const scale = [0, 1, 2].map((c) => (quantile(xs.map((x) => x[c]), 0.841345) - quantile(xs.map((x) => x[c]), 0.158655)) / 2);
  return xs.filter((x) => [0, 1, 2].every((c) => !(scale[c] > 0) || Math.abs(x[c] - centre[c]) <= k * scale[c]));
}

// The element-set model of a list of step-10 rows: per regime and age bin the (clipped or not) second moment.
export function elementSetModel(rows, { clip, version }) {
  const groups = new Map();
  for (const r of rows) {
    const a = ageIndexOf(r.ageDays), g = REGIME_INDEX.get(r.regime);
    if (a < 0 || g === undefined) continue;
    const key = `${g}|${a}`;
    if (!groups.has(key)) groups.set(key, { regimeIndex: g, ageIndex: a, xs: [], objects: new Set() });
    const grp = groups.get(key);
    grp.xs.push(r.rtn);
    grp.objects.add(r.norad);
  }
  const strata = [];
  for (const grp of [...groups.values()].sort((x, y) => x.regimeIndex - y.regimeIndex || x.ageIndex - y.ageIndex)) {
    const kept = clip ? clipped(grp.xs) : grp.xs;
    strata.push({ regimeIndex: grp.regimeIndex, regime: config.regimes[grp.regimeIndex].id, ageIndex: grp.ageIndex, n: grp.xs.length, kept: kept.length, objects: grp.objects.size,
      covariance: secondMoment(kept) });
  }
  return { kind: 'e14-element-set-model', version, regimes: config.regimes, ageBinsDays: AGE_BINS, minimumBinSamples: config.s3.minimumBinSamples,
    basis: `6x6 RTN second moment about zero of SGP4 errors against truth (km, km/s)${clip ? `, clipped at ${config.s3.clipK} robust sigma per position component` : ''}`, strata };
}

// Covariances for samples from the module: [{id, regime, ageDays, objectFactor?}] -> Map id -> {status, cov (lower 3x3 m^2)}.
export async function covariancesOf(gp, model, samples) {
  const out = new Map();
  for (let i = 0; i < samples.length; i += 5000) {
    const r = await callJson(gp, 'calibrate_covariance', [json('model', model), json('objects', { objects: samples.slice(i, i + 5000) })]);
    for (const o of r.objects) out.set(o.id, { status: o.status, cov: o.covarianceRtn ? o.covarianceRtn.slice(0, 6) : null, factor: o.factor });
  }
  return out;
}

// S(g): per regime and gap bin the 3x3 second moment of consecutive differences (km^2), from step-12 rows.
export function differenceModel(rows) {
  const groups = new Map();
  for (const r of rows) {
    const g = gapIndexOf(r.gapDays);
    if (g < 0) continue;
    const key = `${r.regime}|${g}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r.d);
  }
  const out = {};
  for (const [key, ds] of groups) {
    const [regime, g] = key.split('|');
    const m = secondMoment(ds.map((d) => [...d, 0, 0, 0]));
    (out[regime] ??= {})[g] = { n: ds.length, lower: [m[0], m[1], m[2], m[3], m[4], m[5]] };
  }
  return { gapBinsDays: GAP_BINS, strata: out };
}

// S3-KO's object factor for an anchor created at `createdMs`: the shrunk mean of d' S(g)^-1 d / 3 over the object's
// consecutive differences created in the lookback before it (PLAN.md section 4).
export function objectFactors(differences, S) {
  const o = config.s3.objectScale;
  const byObject = new Map();
  for (const r of differences) {
    const g = gapIndexOf(r.gapDays);
    const s = S.strata[r.regime]?.[g];
    if (!s || s.n < 30) continue;
    const inv = inv3(full3(s.lower));
    const d = r.d;
    const q = (d[0] * (inv[0] * d[0] + inv[1] * d[1] + inv[2] * d[2]) + d[1] * (inv[3] * d[0] + inv[4] * d[1] + inv[5] * d[2]) + d[2] * (inv[6] * d[0] + inv[7] * d[1] + inv[8] * d[2])) / 3;
    if (!Number.isFinite(q)) continue;
    if (!byObject.has(r.norad)) byObject.set(r.norad, []);
    byObject.get(r.norad).push({ ms: Date.parse(/Z$/.test(r.created) ? r.created : `${r.created}Z`), q });
  }
  for (const list of byObject.values()) list.sort((a, b) => a.ms - b.ms);
  return (norad, createdMs) => {
    const list = byObject.get(norad) ?? [];
    const inWindow = list.filter((x) => x.ms <= createdMs && x.ms >= createdMs - o.lookbackDays * DAY_MS);
    if (inWindow.length < o.minimumPairs) return { factor: 1, n: inWindow.length };
    const mean = inWindow.reduce((a, x) => a + x.q, 0) / inWindow.length;
    return { factor: (inWindow.length * mean + o.shrinkagePairs) / (inWindow.length + o.shrinkagePairs), n: inWindow.length };
  };
}
