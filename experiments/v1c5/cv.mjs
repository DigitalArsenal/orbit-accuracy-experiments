// Candidates, purged rolling-origin folds, fits, scores and the registered selection (PLAN sections 4 and 5).
// Covariance arithmetic and calibration are V1c3's WASM calls (imported); this file counts and ranks.
import assert from 'node:assert/strict';
import { apply, pair, fit, stratum } from '../v1c3-console-covariance-calibration/calibration.mjs';
import { tables } from '../v1c3-console-covariance-calibration/evaluate.mjs';

export const SGP4 = 'SGP4', FFM = 'FFM-1';
// Registered order: bases N, F, P; methods none, scalar-mle, coverage, axes-mle; arm ALL first (selection key 5).
export function candidatesOf(mode, config) {
  const bases = mode === SGP4 ? config.bases : [null];
  return bases.flatMap(base => config.methods.flatMap(method => config.arms.map(arm => ({ mode, base, method, arm, name: `${base ? `${base}-` : ''}${method}/${arm}` })))).map((c, order) => ({ ...c, order }));
}
// A sample's covariance source: SGP4 keeps one per base, FFM-1 one per sample.
export const sourceOf = (mode, base) => mode === SGP4 ? s => s.bases[base] : s => s;
export const dayOf = key => key.split(':').at(-1);
export const foldOf = (config, key) => config.windows.folds.find(f => dayOf(key) >= f.from && dayOf(key) <= f.to)?.id;
export const foldStartMs = (config, e3, id) => Date.parse(`${config.windows.folds.find(f => f.id === id).from}T${e3.issueTimeUtc}Z`) + e3.issueOffsetSeconds * 1000;

// The claimed population of an arm: every arc (ALL) or the unflagged ones (UNFLAGGED).
export const claimed = (arcs, arm, flags) => arm === 'UNFLAGGED' ? arcs.filter(a => !flags.get(a.key)) : arcs;

// Fit rows: samples of the given arcs whose target precedes `cutoffMs`; the arm's claimed arcs only.
export function fitRows(arcs, { mode, base, arm, flags, cutoffMs = Infinity }) {
  const source = sourceOf(mode, base);
  return claimed(arcs, arm, flags).flatMap(a => (a.samples ?? []).flatMap(s => {
    const b = source(s);
    return s.ms < cutoffMs && b.fit ? [{ stratum: stratum(a.group, s.hours), object: a.norad, error: b.fit.errorRtn, covariance: b.fit.predictedRtn }] : [];
  }));
}

// Scores arcs under a model (null: the uncalibrated recorded scores). Result arcs carry what the tables and diagnostics read.
export async function scoreArcs({ gp, codec, model, arcs, mode, base }) {
  const source = sourceOf(mode, base), out = [];
  for (const a of arcs) {
    const samples = [];
    for (const s of a.samples ?? []) {
      const b = source(s);
      const terms = await apply(gp, codec, model, a.group, s.hours, s.state, b.terms);
      const full = terms.length ? model ? await pair(gp, codec, s.state, terms, s.truth) : b.score : null;
      const score = full && { d2Predicted: full.d2Predicted, logDetCombined: full.logDetCombined, errorRtn: full.errorRtn, predictedRtn: full.predictedRtn };
      samples.push({ hours: s.hours, ms: s.ms, status: base === 'P' ? terms.length ? 'POPULATION' : 'UNAVAILABLE' : s.status, score });
    }
    out.push({ key: a.key, norad: a.norad, group: a.group, ms: a.ms, missingHorizons: a.missingHorizons, ...(a.skipped ? { skipped: a.skipped } : {}), samples });
  }
  return out;
}
export const cellsOf = (scored, mode, configs) => tables(scored, mode, configs);
export const countRealistic = cells => cells.filter(c => c.decision === 'REALISTIC').length;
export const countInsufficient = cells => cells.filter(c => c.decision === 'INSUFFICIENT').length;
// V1c3's squared normalized violation of the two point-estimate bounds; nonfinite or insufficient cells contribute 1e12.
export function violation(cells) {
  let v = 0;
  for (const c of cells) {
    const m = c.meanD2Over3?.estimate, cover = c.coverage95?.estimate;
    v += c.decision === 'INSUFFICIENT' || !Number.isFinite(m) || !Number.isFinite(cover) ? 1e12 : (Math.max(0, .8 - m, m - 1.25) / .45) ** 2 + (Math.max(0, .93 - cover, cover - .97) / .04) ** 2;
  }
  return v;
}

// foldCells: {candidateName: {foldId: cells[24]}}. Keys in registered order (PLAN section 5); ineligible candidates are ranked out.
export function selectCv(foldCells, candidates, eligible) {
  const ranked = candidates.filter(c => eligible(c)).map(c => {
    const folds = Object.entries(foldCells[c.name]).map(([id, cells]) => ({ id, cells }));
    assert(folds.length > 0 && folds.every(f => f.cells.length === 24));
    const realistic = folds.map(f => countRealistic(f.cells)), mean = x => x.reduce((a, b) => a + b, 0) / x.length;
    return { name: c.name, order: c.order, realisticByFold: Object.fromEntries(folds.map((f, i) => [f.id, realistic[i]])), meanRealistic: mean(realistic), minRealistic: Math.min(...realistic),
      meanInsufficient: mean(folds.map(f => countInsufficient(f.cells))), meanViolation: mean(folds.map(f => violation(f.cells))) };
  });
  ranked.sort((a, b) => b.meanRealistic - a.meanRealistic || b.minRealistic - a.minRealistic || a.meanInsufficient - b.meanInsufficient || a.meanViolation - b.meanViolation || a.order - b.order);
  return { selected: ranked[0].name, ranked };
}
export { fit };
