// Stage B (training only): purged rolling-origin cross-validation of every registered candidate, the registered selection, and each
// candidate's final fit on all training weeks. Reads no test state.
import fs from 'node:fs';
import path from 'node:path';
import { candidatesOf, fitRows, fitTiered, scoreArcs, cellsOf, claimed, foldOf, foldStartMs, selectCv, tierGroups, countRealistic } from './cv.mjs';
import { groupBy } from './universe.mjs';

export const compactCell = c => ({ group: c.group, hours: c.hours, n: c.n, objects: c.objects, available: c.available, notPositiveDefinite: c.notPositiveDefinite,
  mean: c.meanD2Over3 ? [c.meanD2Over3.estimate, c.meanD2Over3.lower, c.meanD2Over3.upper] : null,
  coverage: c.coverage95 ? [c.coverage95.estimate, c.coverage95.lower, c.coverage95.upper] : null, medianD2: c.medianD2 ?? null, decision: c.decision });
export const scoresJsonl = scored => scored.map(a => JSON.stringify(a)).join('\n') + '\n';

export async function crossValidate({ arcs, flagRecords, spec, config, e3, configs, gp, codec, run, log = console.log }) {
  const candidates = candidatesOf(spec), evaluation = config.windows.evaluationFolds.SGP4;
  const flags = new Map([...flagRecords].map(([k, r]) => [k, r.flagged]));
  const ids = config.windows.folds.map(f => f.id), index = id => ids.indexOf(id);
  const byFold = groupBy(arcs, a => foldOf(config, a.key));
  const flagged = arcs.filter(a => flags.get(a.key)).length, share = flagged / arcs.length;
  const eligible = c => c.claim === 'ALL' || share <= spec.selection.flagShareCap;
  const foldCells = {}, fitted = {};
  for (const c of candidates) {
    foldCells[c.name] = {};
    const scoredFolds = [];
    for (const id of evaluation) {
      const prior = arcs.filter(a => index(foldOf(config, a.key)) < index(id));
      let model = null;
      if (c.method !== 'none') {
        const rows = fitRows(prior, { base: c.base, tiering: c.tiering, claim: c.claim, flagRecords, spec, cutoffMs: foldStartMs(config, e3, id) });
        const fitResult = await fitTiered(gp, codec, rows, c.method, config, `v1c5-${c.name}-cv-${id}`, tierGroups(c, spec));
        model = fitResult.model;
        fitted[`${c.name}|${id}`] = { rows: rows.length, strata: fitResult.calibration.strata.map(s => ({ stratum: s.stratum, status: s.status, n: s.n, objects: s.objects })) };
      }
      const scored = await scoreArcs({ gp, codec, model, arcs: byFold.get(id) ?? [], base: c.base, tiering: c.tiering, claim: c.claim, flagRecords, spec });
      foldCells[c.name][id] = cellsOf(claimed(scored, c.claim, flags), configs);
      scoredFolds.push(...scored.map(a => ({ fold: id, ...a })));
    }
    run.write(`cv-${c.name.replace(/[/|]/g, '_')}-scores.jsonl`, scoresJsonl(scoredFolds));
    log(`cv ${c.name}: ${evaluation.map(id => `${id} ${countRealistic(foldCells[c.name][id])}`).join(' ')}`);
  }
  const selection = selectCv(foldCells, candidates, spec, eligible);
  const models = {};
  for (const c of candidates) {
    if (c.method === 'none') { models[c.name] = { model: null, calibration: null, rows: 0 }; continue; }
    const rows = fitRows(arcs, { base: c.base, tiering: c.tiering, claim: c.claim, flagRecords, spec });
    models[c.name] = await fitTiered(gp, codec, rows, c.method, config, `v1c5-${c.name}`, tierGroups(c, spec));
    models[c.name].rows = rows.length;
  }
  return { candidates, evaluation, foldCells, fitted, selection, models, flagShare: share, flaggedArcs: flagged, arcs: arcs.length, eligible: Object.fromEntries(['ALL', 'UNFLAGGED'].map(claim => [claim, claim === 'ALL' || share <= spec.selection.flagShareCap])) };
}

// What is committed before the test is read: tables (compact), ranking, every final model and its typed record.
export function writeSelection({ output, result, codec, extra }) {
  const file = path.join(output, 'selection.json');
  const cv = Object.fromEntries(Object.entries(result.foldCells).map(([name, folds]) => [name, Object.fromEntries(Object.entries(folds).map(([id, cells]) => [id, cells.map(compactCell)]))]));
  const record = { ...extra, evaluationFolds: result.evaluation, flagShare: result.flagShare, flaggedArcs: result.flaggedArcs, arcs: result.arcs, eligible: result.eligible,
    ranking: result.selection.ranked, selected: result.selection.selected, cv, fitted: result.fitted,
    models: Object.fromEntries(Object.entries(result.models).map(([name, m]) => [name, { rows: m.rows ?? 0, model: m.model, strata: m.calibration?.strata?.map(s => ({ stratum: s.stratum, status: s.status, n: s.n, objects: s.objects })) ?? null }])) };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
  for (const [name, m] of Object.entries(result.models)) if (m.model) fs.writeFileSync(path.join(output, `${name.replace(/[/|]/g, '_')}.erm`), codec.frame('model', 'model', m.model).payload);
  return { file, record };
}
