#!/usr/bin/env node
// E14 step 12: consecutive element-set differences of the truth objects (PLAN.md section 4, S3-KO). For every set j
// with a predecessor i at most `maxGapDays` older, d = SGP4_i(t_j) - SGP4_j(t_j) in the RTN axes of set j's state
// (analysis/gp-error-model common_epoch, origin the set j). No truth is read: these are what S3-KO can compute for
// any object, debris included. Rows: runs/<id>/differences.jsonl.gz {norad, regime, set, created, gapDays, d [3] km}.
//
//   node experiments/e14-covariance-realism/steps/12-s3-differences.mjs --window devFit
import path from 'node:path';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { cli, config, configPath, DAY_MS, Truth, truthObjects, elementSets, moduleOf, callJson, json, jsonlWriter, trim, waitForLoad } from '../common.mjs';

const { values, window, objects: only, modules, archive } = cli();
if (!window.lo) throw new Error('step 12 runs on a long window');
await waitForLoad();
const run = startRun({ experiment: config.experiment, step: `12-s3-differences-${window.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await moduleOf(modules, 'analysis/gp-error-model', run);
const truth = new Truth();
const objects = truthObjects(truth).filter((n) => !only || only.has(n));
const { byObject, files } = elementSets(archive, window.from, window.to, objects);
run.addInputs('gpHistory', files);
const out = jsonlWriter(path.join(run.dir, 'differences.jsonl.gz'));
const maxGap = config.s3.objectScale.maxGapDays;
const unit = { kind: 'e14-factors', version: 'regime-only', regimes: config.regimes, strata: [{ regime: '*', horizonDays: [0, 1e9], factor: 1 }] };
const counts = { objects: 0, pairs: 0, missing: 0 };
// Pairs created in [window.lo - lookback, window.hi): S3-KO looks back 30 days from each anchor's creation.
const lookback = config.s3.objectScale.lookbackDays * DAY_MS;
for (const norad of objects) {
  const sets = byObject.get(norad) ?? [];
  const idx = sets.map((s, k) => k).filter((k) => k > 0 && sets[k].createdMs >= window.lo - lookback && sets[k].createdMs < window.hi && (sets[k].ms - sets[k - 1].ms) <= maxGap * DAY_MS && sets[k].ms > sets[k - 1].ms);
  if (!idx.length) continue;
  ++counts.objects;
  for (let c = 0; c < idx.length; c += 500) {
    const chunk = idx.slice(c, c + 500);
    const members = [...new Set(chunk.flatMap((k) => [k - 1, k]))].sort((a, b) => a - b).map((k) => sets[k]);
    const targets = chunk.map((k) => ({ norad, epoch: sets[k].epoch, sets: [sets[k - 1].epoch], origin: 'set', originSet: sets[k].epoch }));
    const r = await callJson(gp, 'common_epoch', [ommFrame(members), json('options', { targets })], 'differences');
    const regimes = await callJson(gp, 'calibrate_covariance', [json('model', unit),
      json('objects', { objects: chunk.map((k) => ({ id: sets[k].gpId, set: { norad, epoch: sets[k].epoch }, horizonDays: 0, covariance: [1, 0, 1, 0, 0, 1] })) }), ommFrame(chunk.map((k) => sets[k]))]);
    r.targets.forEach((t, m) => {
      const k = chunk[m];
      if (t.missing || !t.sets?.[0]) { ++counts.missing; return; }
      out.write({ norad, regime: regimes.objects[m].regime, set: sets[k].epoch, created: sets[k].creationDate, gapDays: (sets[k].ms - sets[k - 1].ms) / DAY_MS, d: trim(t.sets[0].rtn.slice(0, 3)) });
      ++counts.pairs;
    });
  }
  log(`${norad}: ${idx.length} pairs`);
}
const rows = await out.close();
run.finish({ counts, rows });
log(`done: ${JSON.stringify(counts)}`);
