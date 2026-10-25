// The screening criterion (PLAN section 4), the predictors G, T, Q (section 5), the log score and the recommendation (section 6), on the d² of scored arcs.
// d² comes from analysis/gp-error-model; here only counts, distribution functions and the object-cluster bootstrap of V1c2/E14 (clusterBootstrapSums).
import { clusterBootstrapSums } from '../e2b-correlated-covariance/stats.mjs';
import { gaussianCdf, gaussianLogPdf, gaussianQuantile, tCdf, tLogPdf } from './laws.mjs';
import { config, base, HOURS } from './common.mjs';

export const POOLED = 'ALL CLASSES';
export const CLASSES = ['GPS', 'LEO 400-800 km', 'SLR LEO 800-1500 km', 'SLR MEO'];
const opts = { resamples: base.bootstrap.resamples, seed: base.bootstrap.seed, confidence: base.bootstrap.confidence };
const C = config.criterion;
export const levelsAll = [...C.levels, C.deepLevel];

// Samples of scored arcs (V1c5's scoreArcs output): the POPULATION samples with a finite d².
export function samplesOf(scored, flags) {
  return scored.flatMap(a => (a.samples ?? []).filter(s => s.status === 'POPULATION' && Number.isFinite(s.score?.d2Predicted))
    .map(s => ({ group: a.group, hours: s.hours, object: a.norad, d2: s.score.d2Predicted, flagged: Boolean(flags.get(a.key)) })));
}

// ---- predictors: covered(sample, p) and, where a density exists, logPdf(sample) ----
export function predictors(fits) {
  const tCell = s => { const f = fits.T[s.group]; return f?.fitted ? { nu: f.nu, c: f.cells.find(c => c.hours === s.hours).c } : null; };
  const cache = new Map();
  const tU = s => { if (!cache.has(s)) { const t = tCell(s); cache.set(s, t ? tCdf(s.d2, t.nu, t.c) : gaussianCdf(s.d2)); } return cache.get(s); };
  const quantiles = Object.fromEntries(levelsAll.map(p => [p, gaussianQuantile(p)]));
  return {
    G: { name: 'G', levels: levelsAll, covered: (s, p) => gaussianCdf(s.d2) <= p, logPdf: s => gaussianLogPdf(s.d2) },
    T: { name: 'T', levels: levelsAll, covered: (s, p) => tU(s) <= p, logPdf: s => { const t = tCell(s); return t ? tLogPdf(s.d2, t.nu, t.c) : gaussianLogPdf(s.d2); } },
    // Q has multipliers at the criterion levels only (the deep level is not fitted)
    Q: { name: 'Q', levels: C.levels, covered: (s, p) => { const f = fits.Q[s.group]; return f?.fitted ? s.d2 <= f.multipliers[p] * quantiles[p] : gaussianCdf(s.d2) <= p; }, logPdf: null },
  };
}

// ---- one population: level statuses, reach, verdict, tail ratios ----
export function evaluate(pop, predictor) {
  const n = pop.length, objects = new Set(pop.map(s => s.object)).size, E = C.evaluableAt;
  const levels = {};
  for (const p of levelsAll) {
    const evaluable = predictor.levels.includes(p) && n >= E.minimumSamples && objects >= E.minimumObjects && n * Math.min(p, 1 - p) >= E.minimumExpectedOnThinSide;
    if (!evaluable) { levels[p] = { status: 'INSUFFICIENT' }; continue; }
    const r = clusterBootstrapSums(pop.map(s => ({ object: s.object, v: [1, predictor.covered(s, p) ? 1 : 0] })), a => a[1] / a[0], opts);
    levels[p] = { covered: r.estimate, lower: r.lower, upper: r.upper, status: r.upper < p ? 'OVERCONFIDENT' : r.lower > p ? 'PESSIMISTIC' : 'CALIBRATED' };
  }
  const evaluated = C.levels.filter(p => levels[p].status !== 'INSUFFICIENT'), reach = evaluated.length ? Math.max(...evaluated) : null;
  const status = p => levels[p].status;
  const verdict = reach === null || reach < C.verdict.insufficientWhenHighestEvaluableLevelBelow ? 'INSUFFICIENT'
    : evaluated.some(p => p >= C.verdict.overconfidentWhenAnyEvaluableLevelAtOrAbove && status(p) === 'OVERCONFIDENT') ? 'OVERCONFIDENT'
      : evaluated.some(p => status(p) === 'PESSIMISTIC') ? 'PESSIMISTIC' : 'CALIBRATED';
  const tail = Object.fromEntries(C.tail.alphas.flatMap(alpha => { const x = levels[+(1 - alpha).toFixed(6)]; return x?.covered === undefined ? [] : [[alpha, { ratio: (1 - x.covered) / alpha, lower: (1 - x.upper) / alpha, upper: (1 - x.lower) / alpha }]]; }));
  return { n, objects, levels, reach, verdict, tail };
}

// ---- the scopes of a view: class x horizon cells, classes over all horizons, all classes ----
export function scopesOf(samples) {
  const cells = [], classes = [];
  for (const group of CLASSES) {
    const own = samples.filter(s => s.group === group);
    classes.push({ group, pop: own });
    for (const hours of HOURS) cells.push({ group, hours, pop: own.filter(s => s.hours === hours) });
  }
  return { cells, classes, all: { group: POOLED, pop: samples } };
}
export function evaluateView(samples, predictor) {
  const scopes = scopesOf(samples), withResult = x => ({ group: x.group, ...(x.hours === undefined ? {} : { hours: x.hours }), ...evaluate(x.pop, predictor) });
  return { cells: scopes.cells.map(withResult), classes: scopes.classes.map(withResult), all: withResult(scopes.all) };
}

// ---- log score: mean log density of d² under G and T, and T - G with the cluster bootstrap ----
export function logScore(samples, predictors_) {
  const one = pop => {
    if (!pop.length) return { n: 0 };
    const items = pop.map(s => { const g = predictors_.G.logPdf(s), t = predictors_.T.logPdf(s); return { object: s.object, v: [1, g, t, t - g] }; });
    const diff = clusterBootstrapSums(items, a => a[3] / a[0], opts);
    const total = items.reduce((a, it) => it.v.map((x, k) => a[k] + x), [0, 0, 0, 0]);
    return { n: pop.length, objects: new Set(pop.map(s => s.object)).size, gaussian: total[1] / total[0], studentT: total[2] / total[0], difference: diff.estimate, lower: diff.lower, upper: diff.upper };
  };
  return { classes: Object.fromEntries(CLASSES.map(g => [g, one(samples.filter(s => s.group === g))])), all: one(samples) };
}

// ---- recommendation (PLAN section 6) from the unflagged class scope ----
export const overconfidentLevels = result => C.levels.filter(p => result.levels[p].status === 'OVERCONFIDENT').length;
export function recommendation(classesG, classesT, scores) {
  return Object.fromEntries(CLASSES.map(group => {
    const g = classesG.find(x => x.group === group), t = classesT.find(x => x.group === group), s = scores.classes[group];
    const better = s.n > 0 && s.lower > 0, noWorse = overconfidentLevels(t) <= overconfidentLevels(g);
    return [group, { choice: better && noWorse ? 'T' : 'G', logScoreDifference: s.n ? [s.difference, s.lower, s.upper] : null, overconfidentLevels: { G: overconfidentLevels(g), T: overconfidentLevels(t) }, verdict: { G: g.verdict, T: t.verdict } }];
  }));
}

// The full criterion on the three views of PLAN section 4. `scoredSamples` are all POPULATION samples with their flag.
export function criterion(scoredSamples, fits) {
  const p = predictors(fits), unflagged = scoredSamples.filter(s => !s.flagged), flagged = scoredSamples.filter(s => s.flagged);
  const view = (samples, names) => Object.fromEntries(names.map(name => [name, evaluateView(samples, p[name])]));
  const out = { unflagged: view(unflagged, ['G', 'T', 'Q']), all: view(scoredSamples, ['G', 'T', 'Q']), flaggedPooled: view(flagged, ['G']) };
  out.logScore = { unflagged: logScore(unflagged, p), all: logScore(scoredSamples, p) };
  out.recommendation = recommendation(out.unflagged.G.classes, out.unflagged.T.classes, out.logScore.unflagged);
  return out;
}
