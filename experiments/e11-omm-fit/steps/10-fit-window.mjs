// E11 step 10: metric (a), the RMS over CelesTrak's window, per group, for one window
// (dev | validation | test; test only after the freeze).
//   node experiments/e11-omm-fit/steps/10-fit-window.mjs --window dev [--modules <checkout>]
// For each gate-passing pair it compares OMM-fit on CelesTrak's window, SupGP
// recomputed on the same points, and CelesTrak's published RMS (per
// coordinate, km). H1 is the mean over objects of the per-object mean
// log(OMM-fit / SupGP), with a cluster bootstrap over objects (PLAN.md
// section 6). Statistics only: every RMS was computed in the capture by
// analysis/gp-error-model.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, configPath, assertWindowReadable } from '../common.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { pairs, clusterLogRatio, summary } from '../analysis.mjs';

const { values } = parseArgs({ options: { window: { type: 'string', default: 'dev' }, modules: { type: 'string' } } });
const freeze = assertWindowReadable(values.window);
const modulesDir = values.modules ?? process.env.SDN_MODULES_ROOT ?? '/Users/tj/software/worktrees/space-data-network-modules--omm-fit-20261010';
const run = startRun({ experiment: config.experiment, step: `10-fit-window-${values.window}`, configPath, modulesDir, args: values });
const index = path.join(config.archives.derived, 'index.jsonl');
run.addInputs('derived', { 'index.jsonl': crypto.createHash('sha256').update(fs.readFileSync(index)).digest('hex') });

const rows = pairs(values.window);
const groups = [...new Set(rows.map((r) => r.provider))];
const metrics = { window: values.window, freezeCommit: freeze, groups: {} };
for (const g of groups) {
  const rs = rows.filter((r) => r.provider === g);
  const objects = new Set(rs.map((r) => r.norad)).size;
  const analysed = objects >= config.groups.minimumObjects || rs.length >= config.groups.minimumPairs;
  metrics.groups[g] = {
    pairs: rs.length, objects, analysed,
    h1: clusterLogRatio(rs, 'oursKm', 'supgpKm'),
    oursLowerFraction: rs.filter((r) => r.oursKm < r.supgpKm).length / rs.length,
    oursKm: summary(rs.map((r) => r.oursKm)), supgpKm: summary(rs.map((r) => r.supgpKm)), publishedKm: summary(rs.map((r) => r.publishedKm)),
    recomputedMinusPublishedKm: summary(rs.map((r) => r.supgpKm - r.publishedKm)),
    ours3dKm: summary(rs.map((r) => r.ours3dKm)), supgp3dKm: summary(rs.map((r) => r.supgp3dKm)),
  };
}
run.write('pairs.jsonl', `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
run.write('metrics.json', metrics);
run.finish({ pairs: rows.length });
for (const [g, m] of Object.entries(metrics.groups)) {
  const h = m.h1;
  console.log(`${g}: ${m.pairs} pairs, ${m.objects} objects${m.analysed ? '' : ' (descriptive)'}; OMM-fit / SupGP = ${h.ratio?.toFixed(4)} [${h.ratioLower?.toFixed(4)}, ${h.ratioUpper?.toFixed(4)}]; ` +
    `ours lower in ${(100 * m.oursLowerFraction).toFixed(1)}%; median ours ${m.oursKm.median?.toFixed(4)} SupGP ${m.supgpKm.median?.toFixed(4)} published ${m.publishedKm.median?.toFixed(4)} km`);
}
console.log(`run ${run.id}`);
