#!/usr/bin/env node
// E7v2 step 50 (PLAN.md section 13): the index of a batch's product records
// for E9. Each step-20 shard keeps its records in runs/<run>/products.jsonl.gz
// (they derive from element sets and stay on this machine); this step writes
// their schema, counts per class and product, and SHA-256s to
// products-index.json, which is committed so E9 can find and check them.
//
//   node experiments/e7v2-omm-history-handoff/steps/50-products.mjs --window W --batch ID
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { assertWindowReadable, config, configPath } from '../common.mjs';
import { loadBatch } from '../analysis.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, batch: { type: 'string' }, modules: { type: 'string' } } });
const freezeCommit = assertWindowReadable(values.window);
const run = startRun({ experiment: config.experiment, step: `50-products-${values.window}-${values.batch}`, configPath, modulesDir: values.modules ?? repoRoot, args: values });
const { runs } = loadBatch(values.window, values.batch);
const files = [], counts = {};
for (const id of runs) {
  const file = path.join(repoRoot, 'runs', id, 'products.jsonl.gz');
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  let n = 0;
  for (const line of zlib.gunzipSync(bytes).toString('utf8').split('\n')) {
    if (!line) continue;
    const p = JSON.parse(line);
    counts[p.cls] ??= {};
    counts[p.cls][p.variant] = (counts[p.cls][p.variant] ?? 0) + 1;
    ++n;
  }
  files.push({ path: path.relative(repoRoot, file), sha256: sha256(bytes), records: n });
}
const index = {
  experiment: config.experiment, window: values.window, batch: values.batch, freezeCommit,
  schema: {
    record: 'one JSON object per line: {cls, norad, gpId (the newest OMM), cutoff (ISO UTC), variant, epoch (UTC, the newest OMM\'s epoch), state [x, y, z, vx, vy, vz] (GCRF, m, m/s), parameters [the class\'s arcParameters in config.json order], covariance ((6+p)^2, GCRF), covarianceRtn (6x6, RTN of the state), reducedChiSquare}',
    parameters: Object.fromEntries(Object.entries(config.classes).map(([k, c]) => [k, c.arcParameters.map((p) => p.kind)])),
    note: 'Fitted states derive from Space-Track element sets: the records stay on the machine that ran E7v2 (runs/), not in this repository.',
  },
  files, counts,
};
run.write('products-index.json', index);
run.finish({ files: files.length });
console.log(`[${run.id}] ${files.length} product files, ${files.reduce((a, f) => a + f.records, 0)} records`);
