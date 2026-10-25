// Training stage for one mode: purged rolling-origin cross-validation of every candidate, the registered selection, and each
// candidate's final fit on all training weeks (PLAN section 5). Reads no test state.
import fs from 'node:fs';
import path from 'node:path';
import { candidatesOf, fitRows, scoreArcs, cellsOf, claimed, foldOf, foldStartMs, selectCv, fit, SGP4 } from './cv.mjs';
import { groupBy } from './universe.mjs';

export const compactCell = c => ({ group: c.group, hours: c.hours, n: c.n, objects: c.objects, available: c.available, notPositiveDefinite: c.notPositiveDefinite,
  mean: c.meanD2Over3 ? [c.meanD2Over3.estimate, c.meanD2Over3.lower, c.meanD2Over3.upper] : null,
  coverage: c.coverage95 ? [c.coverage95.estimate, c.coverage95.lower, c.coverage95.upper] : null, medianD2: c.medianD2 ?? null, decision: c.decision });
export const scoresJsonl = scored => scored.map(a => JSON.stringify(a)).join('\n') + '\n';

export async function crossValidate({ mode, arcs, flags, config, e3, configs, gp, codec, run, log = console.log }) {
  const candidates = candidatesOf(mode, config), evaluation = config.windows.evaluationFolds[mode];
  const ids = config.windows.folds.map(f => f.id), index = id => ids.indexOf(id);
  const byFold = groupBy(arcs, a => foldOf(config, a.key));
  const flagged = arcs.filter(a => flags.get(a.key)).length;
  const share = flagged / arcs.length, eligibleArm = arm => arm === 'ALL' || share <= config.selection.flagShareCap;
  const foldCells = {}, fitted = {};
  for (const c of candidates) {
    foldCells[c.name] = {};
    const scoredFolds = [];
    for (const id of evaluation) {
      const prior = arcs.filter(a => index(foldOf(config, a.key)) < index(id));
      let model = null, calibration = null;
      if (c.method !== 'none') {
        const rows = fitRows(prior, { mode, base: c.base, arm: c.arm, flags, cutoffMs: foldStartMs(config, e3, id) });
        ({ model, calibration } = await fit(gp, codec, rows, c.method, config, `v1c4-${mode}-${c.name}-cv-${id}`));
        fitted[`${c.name}|${id}`] = { rows: rows.length, strata: calibration.strata.map(s => ({ stratum: s.stratum, status: s.status, n: s.n, objects: s.objects })) };
      }
      const scored = await scoreArcs({ gp, codec, model, arcs: byFold.get(id) ?? [], mode, base: c.base });
      foldCells[c.name][id] = cellsOf(claimed(scored, c.arm, flags), mode, configs);
      scoredFolds.push(...scored.map(a => ({ fold: id, ...a })));
    }
    run.write(`cv-${mode}-${c.name.replace('/', '_')}-scores.jsonl`, scoresJsonl(scoredFolds));
    log(`cv ${mode} ${c.name}: ${evaluation.map(id => `${id} ${foldCells[c.name][id].filter(x => x.decision === 'REALISTIC').length}`).join(' ')}`);
  }
  const selection = selectCv(foldCells, candidates, c => eligibleArm(c.arm));
  // Final fits on every training week, one per candidate (the ones the test applies).
  const models = {};
  for (const c of candidates) {
    if (c.method === 'none') { models[c.name] = { model: null, calibration: null }; continue; }
    const rows = fitRows(arcs, { mode, base: c.base, arm: c.arm, flags });
    models[c.name] = await fit(gp, codec, rows, c.method, config, `v1c4-${mode}-${c.name}`);
    models[c.name].rows = rows.length;
  }
  return { candidates, evaluation, foldCells, fitted, selection, models, flagShare: share, flaggedArcs: flagged, arcs: arcs.length, eligible: Object.fromEntries(['ALL', 'UNFLAGGED'].map(arm => [arm, eligibleArm(arm)])) };
}

// What is committed before the next stage reads anything: tables (compact), ranking, every final model and its typed record.
export function writeSelection({ output, mode, result, codec, config, extra }) {
  const prefix = mode === SGP4 ? 'sgp' : 'ffm';
  const file = path.join(output, `${prefix}-selection.json`);
  const cv = Object.fromEntries(Object.entries(result.foldCells).map(([name, folds]) => [name, Object.fromEntries(Object.entries(folds).map(([id, cells]) => [id, cells.map(compactCell)]))]));
  const record = { mode, ...extra, evaluationFolds: result.evaluation, flagShare: result.flagShare, flaggedArcs: result.flaggedArcs, arcs: result.arcs, eligible: result.eligible,
    ranking: result.selection.ranked, selected: result.selection.selected, cv, fitted: result.fitted,
    models: Object.fromEntries(Object.entries(result.models).map(([name, m]) => [name, { rows: m.rows ?? 0, model: m.model, strata: m.calibration?.strata?.map(s => ({ stratum: s.stratum, status: s.status, n: s.n, objects: s.objects })) ?? null }])) };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  for (const [name, m] of Object.entries(result.models)) if (m.model) fs.writeFileSync(path.join(output, `${prefix}-${name.replace('/', '_')}.erm`), codec.frame('model', 'model', m.model).payload);
  return { file, record };
}
