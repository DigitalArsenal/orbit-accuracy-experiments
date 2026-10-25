// Laws of d² and their fits (PLAN section 5). d² is the squared Mahalanobis distance that analysis/gp-error-model computes under the calibrated
// covariance; here only the one-dimensional distribution functions, maximum likelihood and quantiles of that number. No orbit physics.
import { quantile } from '../../harness/stats.mjs';
import { chi2cdf3 } from '../e2b-correlated-covariance/stats.mjs';

export { chi2cdf3 };

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const y = x - 1, t = y + 7.5;
  let a = LANCZOS[0];
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (y + i);
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized incomplete beta I_x(a, b) (continued fraction, modified Lentz).
function betaFraction(a, b, x) {
  const tiny = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}
export function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2) ? front * betaFraction(a, b, x) / a : 1 - front * betaFraction(b, a, 1 - x) / b;
}

// ---- Gaussian: d² ~ chi-square, 3 degrees of freedom ----
export const gaussianCdf = d2 => chi2cdf3(d2);
export const gaussianLogPdf = d2 => 0.5 * Math.log(d2 / (2 * Math.PI)) - d2 / 2;
export function gaussianQuantile(p) {
  let lo = 0, hi = 1;
  while (chi2cdf3(hi) < p) hi *= 2;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (chi2cdf3(mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// ---- Student-t scale mixture on the covariance: d²/c = 3·F(3, nu) ----
export const tCdf = (d2, nu, c) => incompleteBeta(d2 / (d2 + c * nu), 1.5, nu / 2);
export function tLogPdf(d2, nu, c) {
  const logBeta = lgamma(1.5) + lgamma(nu / 2) - lgamma(1.5 + nu / 2);
  return -logBeta + 1.5 * Math.log(3 / nu) + 0.5 * Math.log(d2 / (3 * c)) - (3 + nu) / 2 * Math.log1p(d2 / (c * nu)) - Math.log(3 * c);
}
export function tQuantile(p, nu, c) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (incompleteBeta(mid, 1.5, nu / 2) < p) lo = mid; else hi = mid; }
  const z = (lo + hi) / 2;
  return c * nu * z / (1 - z);
}

// Maximizes f over ln c by golden section.
function maximizeLogScale(f, [lo, hi], tolerance) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, x1 = b - phi * (b - a), x2 = a + phi * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < 400 && b - a > tolerance; i++) {
    if (f1 < f2) { a = x1; x1 = x2; f1 = f2; x2 = a + phi * (b - a); f2 = f(x2); }
    else { b = x2; x2 = x1; f2 = f1; x1 = b - phi * (b - a); f1 = f(x1); }
  }
  return (a + b) / 2;
}
// Maximum likelihood of c at a fixed nu for a list of d² values.
export function fitScale(d2s, nu, spec) {
  const total = lnC => d2s.reduce((s, x) => s + tLogPdf(x, nu, Math.exp(lnC)), 0);
  const lnC = maximizeLogScale(total, spec.logScaleRange.map(Math.log), spec.logScaleTolerance);
  return { c: Math.exp(lnC), logLikelihood: total(lnC) };
}

// T (PLAN section 5): nu per class, c per class x horizon, from the samples [{group, hours, object, d2}] of the training out-of-fold population.
export function fitT(samples, spec, horizons) {
  const out = {}, objectsOf = xs => new Set(xs.map(s => s.object)).size;
  for (const group of [...new Set(samples.map(s => s.group))].sort()) {
    const data = samples.filter(s => s.group === group);
    if (data.length < spec.minimum.classSamples || objectsOf(data) < spec.minimum.classObjects) { out[group] = { fitted: false, samples: data.length, objects: objectsOf(data) }; continue; }
    const cells = horizons.map(hours => { const xs = data.filter(s => s.hours === hours); return { hours, xs: xs.map(s => s.d2), n: xs.length, objects: objectsOf(xs), own: xs.length >= spec.minimum.cellSamples && objectsOf(xs) >= spec.minimum.cellObjects }; });
    const trial = spec.nuGrid.map(nu => {
      const pooled = fitScale(data.map(s => s.d2), nu, spec);
      let ll = 0;
      const perCell = cells.map(cell => {
        if (!cell.n) return { hours: cell.hours, c: pooled.c, source: 'class', n: 0, objects: 0 };
        const fit = cell.own ? fitScale(cell.xs, nu, spec) : { c: pooled.c, logLikelihood: cell.xs.reduce((s, x) => s + tLogPdf(x, nu, pooled.c), 0) };
        ll += fit.logLikelihood;
        return { hours: cell.hours, c: fit.c, source: cell.own ? 'cell' : 'class', n: cell.n, objects: cell.objects };
      });
      return { nu, pooledC: pooled.c, logLikelihood: ll, cells: perCell };
    });
    // maximum likelihood; a tie goes to the larger nu
    const best = trial.reduce((b, t) => t.logLikelihood > b.logLikelihood || (t.logLikelihood === b.logLikelihood && t.nu > b.nu) ? t : b);
    const gaussianLogLikelihood = data.reduce((s, x) => s + gaussianLogPdf(x.d2), 0);
    out[group] = { fitted: true, samples: data.length, objects: objectsOf(data), nu: best.nu, pooledC: best.pooledC, logLikelihood: best.logLikelihood, gaussianLogLikelihood,
      profile: trial.map(t => ({ nu: t.nu, logLikelihood: t.logLikelihood })), cells: best.cells };
  }
  return out;
}

// Q (PLAN section 5): per class, k_p = empirical quantile of d² / chi-square quantile, for each level.
export function fitQ(samples, spec, levels) {
  const out = {};
  for (const group of [...new Set(samples.map(s => s.group))].sort()) {
    const data = samples.filter(s => s.group === group), objects = new Set(data.map(s => s.object)).size;
    if (data.length < spec.minimum.classSamples || objects < spec.minimum.classObjects) { out[group] = { fitted: false, samples: data.length, objects }; continue; }
    out[group] = { fitted: true, samples: data.length, objects, multipliers: Object.fromEntries(levels.map(p => [p, quantile(data.map(s => s.d2), p) / gaussianQuantile(p)])) };
  }
  return out;
}
