// E11 step 20: choose the OMM-fit product from the candidate grid (PLAN.md section 5).
//   node experiments/e11-omm-fit/steps/20-select.mjs --dev <step-30 dev run id> --validation <step-30 validation run id>
// Criterion: the lowest median over objects (each object's mean over its
// pairs) of the 1-day prediction RMS (3D) against operator-OCM truth, on dev.
// The dev choice stands unless another candidate's validation median is lower
// by more than 5 %; medians within 1 % tie and go to grid order. Writes
// results/e11/selection.json, which is committed before step 40 reads the test window.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config } from '../common.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';

const { values } = parseArgs({ options: { dev: { type: 'string' }, validation: { type: 'string' } } });
const horizon = `${config.horizons.primaryHours}h`;
const ids = config.grid.map((g) => g.id);
function medians(runId) {
  const rows = fs.readFileSync(path.join(repoRoot, 'runs', runId, 'scores.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.horizon === horizon);
  const out = {};
  for (const id of ids) {
    const byObject = new Map();
    for (const r of rows.filter((x) => x.product === id)) {
      if (!byObject.has(r.norad)) byObject.set(r.norad, []);
      byObject.get(r.norad).push(r.rms3dKm);
    }
    const per = [...byObject.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
    out[id] = { objects: per.length, median: per.length ? median(per) : null };
  }
  return out;
}
const dev = medians(values.dev);
const val = medians(values.validation);
const rank = (m) => ids.filter((id) => m[id].median !== null).sort((a, b) => m[a].median - m[b].median || ids.indexOf(a) - ids.indexOf(b));
const tieBreak = (m, best) => ids.find((id) => m[id].median !== null && m[id].median <= m[best].median * (1 + config.selection.tieRelative)) ?? best;
let chosen = tieBreak(dev, rank(dev)[0]);
const valBest = tieBreak(val, rank(val)[0]);
const override = val[valBest]?.median !== null && val[chosen]?.median !== null && val[valBest].median < val[chosen].median * (1 - config.selection.validationOverrideRelative);
if (override) chosen = valBest;
const selection = { chosen, criterion: config.selection.criterion, horizon, devRun: values.dev, validationRun: values.validation, dev, validation: val,
  devChoice: tieBreak(dev, rank(dev)[0]), validationBest: valBest, overriddenByValidation: override, grid: config.grid.find((g) => g.id === chosen), at: new Date().toISOString() };
const out = path.join(repoRoot, 'results/e11/selection.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(selection, null, 1)}\n`);
console.log(`chosen ${chosen} (dev ${selection.devChoice}, validation best ${valBest}${override ? ', validation override' : ''}) -> ${path.relative(repoRoot, out)}`);
