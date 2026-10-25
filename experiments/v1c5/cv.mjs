// V1c5 candidates, tiers, purged rolling-origin folds, tiered fits and scores, and the registered selection (candidates.json, PLAN-B.md).
// Covariance arithmetic and calibration are V1c3's WASM calls (imported); this file counts, tiers and ranks.
import assert from 'node:assert/strict';
import { apply, pair, call, stratum, horizons, groups as classes } from '../v1c3-console-covariance-calibration/calibration.mjs';
import { tables } from '../v1c3-console-covariance-calibration/evaluate.mjs';

export const SGP4 = 'SGP4';
export const boundaries = [0, 3.5, 9, 18, 36, 60, 96];
const altitudeKm = { GPS: [19000, 30000], 'LEO 400-800 km': [400, 800], 'SLR LEO 800-1500 km': [800, 1500], 'SLR MEO': [1500, 19000] };

// candidates.json: [{ name, base, method, tiering, claim }] in registered order.
export const candidatesOf = spec => spec.candidates.map((c, order) => ({ ...c, order }));
export const dayOf = key => key.split(':').at(-1);
export const foldOf = (config, key) => config.windows.folds.find(f => dayOf(key) >= f.from && dayOf(key) <= f.to)?.id;
export const foldStartMs = (config, e3, id) => Date.parse(`${config.windows.folds.find(f => f.id === id).from}T${e3.issueTimeUtc}Z`) + e3.issueOffsetSeconds * 1000;

// ---- tiers: the calibration group of an arc (a class, or a pooled tier) from its causal flag record ----
// tiering 'single': the class. 'flag': flagged arcs share the pooled tier FLAGGED, the others their class. 'risk': as 'flag' with the unflagged arcs split by
// the registered causal risk rule into the class and the class's HIGH tier (spec.risk), the tier being pooled over classes where `pooled` names it.
export function groupOf(arc, tiering, flagRecord, spec) {
  if (tiering === 'single' || !flagRecord) return arc.group;
  if (flagRecord.flagged) return 'FLAGGED';
  if (tiering === 'risk' && riskHigh(flagRecord, spec.risk)) return spec.risk.pooled ? 'HIGH' : `${arc.group}|HIGH`;
  return arc.group;
}
// Risk of an unflagged arc: custody longest gap over its threshold, or the age of the newest set, from the object's own stream at the issue time.
export function riskHigh(r, rule) {
  const c = r.custody ?? {};
  if (!Number.isFinite(c.longestGapDays) || !Number.isFinite(c.thresholdDays)) return false;
  return c.longestGapDays / c.thresholdDays >= rule.minimumGapRatio || (Number.isFinite(rule.minimumAgeDays) && c.ageDays >= rule.minimumAgeDays);
}
export const tierGroups = (candidate, spec) => candidate.tiering === 'single' ? [...classes] : candidate.tiering === 'flag' ? [...classes, 'FLAGGED']
  : [...classes, 'FLAGGED', ...(spec.risk.pooled ? ['HIGH'] : classes.map(g => `${g}|HIGH`))];

// The claimed population of a candidate: every arc (ALL) or the unflagged ones.
export const claimed = (arcs, claim, flags) => claim === 'UNFLAGGED' ? arcs.filter(a => !flags.get(a.key)) : arcs;

// Fit rows: samples of the arcs whose target precedes `cutoffMs`, stratified by the arc's calibration group.
export function fitRows(arcs, { base, tiering, flagRecords, spec, cutoffMs = Infinity }) {
  return arcs.flatMap(a => (a.samples ?? []).flatMap(s => {
    const b = s.bases[base];
    return s.ms < cutoffMs && b.fit ? [{ stratum: stratum(groupOf(a, tiering, flagRecords.get(a.key), spec), s.hours), object: a.norad, error: b.fit.errorRtn, covariance: b.fit.predictedRtn }] : [];
  }));
}

// Calibration -> an `e14-factors` model over the candidate's groups (V1c3's fit with the group list of the tiering).
export async function fitTiered(gp, codec, rows, method, config, version, groupList) {
  if (method === 'none') return { model: null, calibration: null };
  const calibration = await call(gp, codec, 'fit_calibration', [codec.frame('samples', 'calibration', { samples: rows }),
    codec.frame('options', 'calibration', { method, coverage: config.coverage, minimumSamples: config.minimumSamples, minimumObjects: config.minimumObjects })]);
  const regimes = groupList.map(id => ({ id, altitudeKm: altitudeKm[id] ?? [0, 1e9], eccentricity: [0, 1] }));
  const model = { kind: 'e14-factors', version, regimes, strata: groupList.flatMap(group => horizons.map((hours, i) => {
    const r = calibration.strata.find(x => x.stratum === stratum(group, hours));
    return { regime: group, horizonDays: [boundaries[i] / 24, boundaries[i + 1] / 24], status: r?.status ?? 'INSUFFICIENT',
      ...(r?.status === 'FITTED' ? r.axesFactors ? { axesFactors: r.axesFactors } : { factor: r.factor } : { factor: 1 }) };
  })) };
  return { model, calibration };
}

// Scores arcs under a model (null: the uncalibrated recorded scores).
export async function scoreArcs({ gp, codec, model, arcs, base, tiering, flagRecords, spec }) {
  const out = [];
  for (const a of arcs) {
    const group = groupOf(a, tiering, flagRecords.get(a.key), spec), samples = [];
    for (const s of a.samples ?? []) {
      const b = s.bases[base];
      const terms = await apply(gp, codec, model, group, s.hours, s.state, b.terms);
      const full = terms.length ? model ? await pair(gp, codec, s.state, terms, s.truth) : b.score : null;
      const score = full && { d2Predicted: full.d2Predicted, logDetCombined: full.logDetCombined, errorRtn: full.errorRtn, predictedRtn: full.predictedRtn };
      samples.push({ hours: s.hours, ms: s.ms, status: base === 'P' ? terms.length ? 'POPULATION' : 'UNAVAILABLE' : s.status, score });
    }
    out.push({ key: a.key, norad: a.norad, group: a.group, tier: group, ms: a.ms, missingHorizons: a.missingHorizons, ...(a.skipped ? { skipped: a.skipped } : {}), samples });
  }
  return out;
}
export const cellsOf = (scored, configs) => tables(scored, SGP4, configs);
export const countRealistic = cells => cells.filter(c => c.decision === 'REALISTIC').length;
export const countInsufficient = cells => cells.filter(c => c.decision === 'INSUFFICIENT').length;
export function violation(cells) {
  let v = 0;
  for (const c of cells) {
    const m = c.meanD2Over3?.estimate, cover = c.coverage95?.estimate;
    v += c.decision === 'INSUFFICIENT' || !Number.isFinite(m) || !Number.isFinite(cover) ? 1e12 : (Math.max(0, .8 - m, m - 1.25) / .45) ** 2 + (Math.max(0, .93 - cover, cover - .97) / .04) ** 2;
  }
  return v;
}

// foldCells: {candidateName: {foldId: cells[24]}}. Keys in the registered order (spec.selection.keys); ineligible candidates are ranked out.
export function selectCv(foldCells, candidates, spec, eligible = () => true) {
  const ranked = candidates.filter(eligible).map(c => {
    const folds = Object.entries(foldCells[c.name]).map(([id, cells]) => ({ id, cells }));
    assert(folds.length > 0 && folds.every(f => f.cells.length === 24));
    const realistic = folds.map(f => countRealistic(f.cells)), mean = x => x.reduce((a, b) => a + b, 0) / x.length;
    return { name: c.name, order: c.order, realisticByFold: Object.fromEntries(folds.map((f, i) => [f.id, realistic[i]])), meanRealistic: mean(realistic), minRealistic: Math.min(...realistic),
      meanInsufficient: mean(folds.map(f => countInsufficient(f.cells))), meanViolation: mean(folds.map(f => violation(f.cells))) };
  });
  const sign = { minRealistic: -1, meanRealistic: -1, meanInsufficient: 1, meanViolation: 1, order: 1 };
  ranked.sort((a, b) => { for (const k of spec.selection.keys) if (a[k] !== b[k]) return sign[k] * (a[k] - b[k]); return 0; });
  return { selected: ranked[0].name, ranked };
}
