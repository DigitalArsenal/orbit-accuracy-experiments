// E1's frozen model (results/e1/fit/.../model.json, M3*) applied to element
// sets, as E1's step 30 applies it: the chosen candidate's along-track time
// offset, from Sun and Moon geometry computed by modules (E1 geometry.mjs),
// edited into the mean anomaly (E1 methods.mjs). Bookkeeping on element-set
// fields only.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { geometry } from '../e1-gps-epoch/geometry.mjs';
import { correctionSeconds, shiftAlongTrack } from '../e1-gps-epoch/methods.mjs';
import { config } from './common.mjs';

export function loadE1Model(run) {
  const file = path.join(repoRoot, config.inputs.e1Model.path);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== config.inputs.e1Model.sha256) throw new Error(`${config.inputs.e1Model.path} differs from the pinned SHA-256`);
  run.addInputs('e1Model', { [config.inputs.e1Model.path]: config.inputs.e1Model.sha256 });
  const model = JSON.parse(bytes);
  const method = Object.keys(model.g1).find((m) => model.g1[m].id === model.chosen);
  return { model, candidate: model.g1[method], id: model.chosen };
}

// Corrected copies of `sets` (same order), each with correctionSeconds.
export async function correctSets(ctx, e1, sets) {
  const g = await geometry(ctx.frames, ctx['epoch-state'], sets);
  return sets.map((s, i) => ({ ...shiftAlongTrack(s, correctionSeconds(e1.candidate, g[i], s.norad)), epochMs: s.epochMs }));
}
