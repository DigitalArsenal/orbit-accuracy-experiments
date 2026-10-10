// Debiasing of OMMs (PLAN.md section 5). Every model predicts an OMM's
// along-track error at epoch in seconds of flight and is applied as E1
// applies a correction (mean anomaly + n dt; the epoch state is then the
// module's).
//
// - history: E7's per-object model (constant + Moon-anomaly pair from the
//   object's OMMs whose precise orbit was released by the cutoff) — E7's
//   ObjectHistory, unchanged.
// - class (truth-rich): E1's form refitted per class on the train window: the
//   Moon and Sun solid harmonics in the orbit plane and both anomaly pairs
//   (M3c, K = 2) plus the mean argument of latitude pairs, a random intercept
//   per object (REML), ridge on the features; target from truth.
// - class (OMM-only): the mean argument of latitude pairs alone, ridge, with
//   the along-track difference to the object's next OMM as the target; only
//   the pairs' term is applied (the pooled intercept is the drift between
//   OMMs, not an error at epoch).
// - e1 (GPS): E1's published model (E7's correctSets).
//
// The mean argument of latitude is ω + M from the OMM's own fields: a
// covariate, as E1's anomaly pairs are, not an orbit computation. Statistics
// and element-set field edits only.
import { json } from '../../harness/modules.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { geometry } from '../e1-gps-epoch/geometry.mjs';
import { designs, scalesOf } from '../e1-gps-epoch/features.mjs';
import { shiftAlongTrack } from '../e1-gps-epoch/methods.mjs';
import { fitReml, fitRidge, predict, standardize, standardizer } from '../e1-gps-epoch/models.mjs';
import { correctSets } from '../e7-full-force-handoff/e1.mjs';
import { config, DAY_MS } from './common.mjs';

const RAD = Math.PI / 180;
export function latitudePairs(set) {
  const u = (set.elements.ARG_OF_PERICENTER + set.elements.MEAN_ANOMALY) * RAD;
  return [Math.sin(u), Math.cos(u), Math.sin(2 * u), Math.cos(2 * u)];
}

// The along-track difference, in seconds of flight, between a set's SGP4
// state and a reference state (a truth or a later OMM's epoch state) at the
// reference epoch: analysis/gp-error-model `accumulate` with one +-1 s bin.
export async function alongTrackSeconds(ctx, products, set, target) {
  const half = config.binHalfWidthSeconds / 86400;
  const age = (target.ms - set.epochMs) / DAY_MS;
  const acc = await ctx['gp-error-model'].invokeJson('accumulate', [ommFrame([set]), products.frame(target.entry),
    json('options', { ageBinsDays: [[Math.max(0, age - half), age + half]], referenceStepSeconds: 0 })], 'accumulator');
  const one = acc.strata.filter((x) => x.n === 1);
  return one.length === 1 ? one[0].sum[1] / Math.hypot(...target.v) : null;
}

// Truth-rich class model from [{set, dtSeconds}] (dtSeconds: the at-epoch
// along-track error against truth).
export async function trainTruthClassModel(ctx, rows) {
  const sets = rows.map((r) => r.set);
  const g = await geometry(ctx.frames, ctx['epoch-state'], sets);
  const scales = scalesOf(g);
  const order = config.debias.classModel.harmonicsDegree;
  const X = g.map((gi, i) => [...designs.M3c(gi, scales, order), ...latitudePairs(sets[i])]);
  const std = standardizer(X);
  const fit = fitReml(X.map((r) => standardize(std, r)), rows.map((r) => r.dtSeconds), sets.map((s) => s.norad), { lambda: config.debias.classModel.ridge });
  return { kind: 'class-truth', order, scales, standardizer: std, fit, n: rows.length, objects: new Set(sets.map((s) => s.norad)).size };
}

// OMM-only class model from [{set, dtSeconds}] (dtSeconds: the along-track
// difference to the object's next OMM).
export function trainOmmClassModel(rows) {
  const X = rows.map((r) => latitudePairs(r.set));
  const std = standardizer(X);
  const fit = fitRidge(X.map((r) => standardize(std, r)), rows.map((r) => r.dtSeconds), { lambda: config.debias.classModel.ridge });
  return { kind: 'class-omm', standardizer: std, fit, n: rows.length, objects: new Set(rows.map((r) => r.set.norad)).size };
}

// Corrected copies of sets under a class model (correction = - predicted
// error). Truth-rich models need the sets' geometry (module).
export async function applyClassModel(ctx, model, sets) {
  if (model.kind === 'class-omm') {
    return sets.map((s) => {
      const row = standardize(model.standardizer, latitudePairs(s));
      return { ...shiftAlongTrack(s, -row.reduce((a, x, k) => a + x * model.fit.beta[k], 0)), epochMs: s.epochMs };
    });
  }
  const g = await geometry(ctx.frames, ctx['epoch-state'], sets);
  return sets.map((s, i) => {
    const row = standardize(model.standardizer, [...designs.M3c(g[i], model.scales, model.order), ...latitudePairs(s)]);
    return { ...shiftAlongTrack(s, -predict(model.fit, row, s.norad)), epochMs: s.epochMs };
  });
}

// The debiasing a product names, as a function of a sample: (sets) ->
// corrected sets. kind: history | class | e1; o: the engine's object record.
export async function debiaser(ctx, kind, o, sample, { windowDays, classModels, e1 }) {
  if (kind === 'history') {
    const model = await o.history.fit(sample.cutoffMs, windowDays);
    return { info: { kind: model.kind, n: model.n }, apply: (sets) => o.history.apply(model, sets) };
  }
  if (kind === 'class') {
    const model = classModels[sample.cls];
    if (!model) throw new Error(`no class debiasing model for ${sample.cls}`);
    return { info: { kind: model.kind, n: model.n }, apply: (sets) => applyClassModel(ctx, model, sets) };
  }
  if (kind === 'e1') return { info: { kind: 'e1' }, apply: (sets) => correctSets(ctx, e1, sets) };
  throw new Error(`unknown debiasing ${kind}`);
}
