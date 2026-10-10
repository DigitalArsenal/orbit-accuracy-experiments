// E13 step 50: H4 (Swarm) and H5 (held-out Doves) from the rows of step 35: for each horizon the median over paired (object, issue) of the 3D error
// of D13 divided by that of D0, with a two-way cluster bootstrap over objects and issue days. Supported at a horizon when the median ratio is at
// most the threshold (0.90) and its upper bound is below 1. D13-def (the non-causal upper bound) is reported next to it.
//
//   node steps/50-propagation-score.mjs --split dev|testA|testB --rows FILE[,FILE...] [--out FILE]      (default out: results/e13/<split>/propagation-score.json)
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { holm, medianRatio, propagationCells } from '../score.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, rows: { type: 'string' }, out: { type: 'string' } } });
const files = values.rows.split(',');
const rows = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const runs = files.map((f) => (fs.existsSync(`${f}.meta.json`) ? JSON.parse(fs.readFileSync(`${f}.meta.json`, 'utf8')) : { file: f }));
const HY = config.analysis.hypotheses;
const out = { split: values.split, runs, rowsFiles: files.map((f) => path.basename(f)), rows: rows.length, errors: rows.filter((r) => r.error).length, targets: {} };
const tests = [];
for (const target of ['swarm', 'doves']) {
  const mine = rows.filter((r) => r.target === target);
  if (!mine.length) continue;
  const hyp = target === 'swarm' ? HY.H4 : HY.H5, name = target === 'swarm' ? 'H4' : 'H5';
  out.targets[target] = { hypothesis: name, objects: [...new Set(mine.map((r) => r.id))], errorRows: mine.filter((r) => r.error).map((r) => ({ id: r.id, issue: r.issue, variant: r.variant, error: r.error })), horizons: {} };
  for (const h of hyp.horizonsDays) {
    const res = {};
    for (const variant of ['D13', 'D13-def']) {
      const cells = propagationCells(mine, [variant, 'D0'], h);
      if (cells.length < 5) { res[variant] = { pairs: cells.length }; continue; }
      const r = medianRatio(cells, variant);
      res[variant] = { ...r, supported: r.estimate <= hyp.threshold && r.upper < 1 };
      console.log(`${name} ${target} +${h} d ${variant}: median ratio ${r.estimate.toFixed(3)} [${r.lower.toFixed(3)}, ${r.upper.toFixed(3)}] p ${r.p.toFixed(4)} over ${r.pairs} pairs; median error ${Object.entries(r.medianErrorM).map(([k, v]) => `${k} ${v.toFixed(0)} m`).join(', ')}; improved in ${(100 * r.shareImproved).toFixed(0)} %`);
    }
    out.targets[target].horizons[h] = res;
    if (h === 1 && res.D13?.p !== undefined) tests.push({ id: name, p: res.D13.p });
  }
}
out.holmPartial = holm(tests);
if (tests.length) console.log(`Holm over ${tests.map((t) => t.id).join(', ')} (H3 enters from step 30): ${out.holmPartial.map((t) => `${t.id} p ${t.p.toFixed(4)} ${t.reject ? 'rejects' : 'does not'}`).join('; ')}`);
const outFile = values.out ?? path.join(repoRoot, 'results', 'e13', values.split, 'propagation-score.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${outFile}`);
