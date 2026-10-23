// Statistical tables import the frozen V1c2 implementation; all calibration is WASM.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { summarize } from '../v1c2-console-covariance-realism/report.mjs';
import { apply, pair, fit, select, stratum, sgpCandidates, methods } from './calibration.mjs';

export function tables(arcs, mode, configs) {
  const converted = arcs.map(a => ({ ...a, samples: (a.samples ?? []).map(s => ({ ...s,
    SGP4: { status: s.status, d2: s.score?.d2Predicted ?? null },
    'FFM-1': { status: s.status, d2: s.score?.d2Predicted ?? null },
  })) }));
  return summarize(converted, configs.v1c2, configs.v1, configs.e3).tables.filter(t => t.mode === mode);
}
export async function evaluate({ arcs, mode, split, gp, codec, config, configs, run, models }) {
  const order = mode === 'SGP4' ? sgpCandidates : methods;
  const result = { tables: {}, models: models ?? {} };
  for (const candidate of order) {
    const base = mode === 'SGP4' ? candidate[0] : null;
    const method = mode === 'SGP4' ? candidate.slice(2) : candidate;
    const rows = arcs.flatMap(a => (a.samples ?? []).flatMap(s => {
      const b = base ? s.bases[base] : s;
      return b.fit ? [{ stratum: stratum(a.group, s.hours), object: a.norad, error: b.fit.errorRtn, covariance: b.fit.predictedRtn }] : [];
    }));
    if (split === 'train') result.models[candidate] = await fit(gp, codec, rows, method, config, `v1c3-${mode}-${candidate}`);
    assert(Object.hasOwn(result.models, candidate), 'test cannot fit');
    const model = result.models[candidate].model;
    const scored = [];
    for (const a of arcs) {
      const samples = [];
      for (const s of a.samples ?? []) {
        const b = base ? s.bases[base] : s;
        const terms = await apply(gp, codec, model, a.group, s.hours, s.state, b.terms);
        const score = terms.length ? model ? await pair(gp, codec, s.state, terms, s.truth) : b.score : null;
        samples.push({ hours: s.hours, ms: s.ms, status: base === 'P' ? terms.length ? 'POPULATION' : 'UNAVAILABLE' : s.status, score });
      }
      scored.push({ key: a.key, norad: a.norad, group: a.group, ms: a.ms, missingHorizons: a.missingHorizons, ...(a.skipped ? { skipped: a.skipped } : {}), samples });
    }
    const name = `${split}-${mode}-${candidate}-scores.jsonl`;
    run.write(name, scored.map(a => JSON.stringify(a)).join('\n') + '\n');
    result.tables[candidate] = tables(scored, mode, configs);
    console.log(`${split} ${mode} ${candidate}: ${result.tables[candidate].filter(c => c.decision === 'REALISTIC').length}/24`);
  }
  if (split === 'train') result.selection = select(result.tables, order);
  return result;
}
export function recordedTables(runDir, mode, split, configs) {
  return Object.fromEntries((mode === 'SGP4' ? sgpCandidates : methods).map(candidate => {
    const arcs = fs.readFileSync(path.join(runDir, `${split}-${mode}-${candidate}-scores.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
    return [candidate, tables(arcs, mode, configs)];
  }));
}
export const readArcs = file => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
