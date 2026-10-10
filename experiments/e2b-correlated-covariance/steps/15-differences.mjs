#!/usr/bin/env node
// E2b step 15: consecutive element-set differences, no precise orbit needed
// (PLAN.md sections 5 and 7). For every pair of consecutive sets (i, j) of a
// regime object whose later set has its epoch in [window start - 30 d,
// window end + 1 d) and gap <= 7 d: set i propagated by SGP4 to set j's epoch,
// minus set j's state there, in j's RTN axes (analysis/gp-error-model
// common_epoch, origin the set j). Rows: runs/<id>/differences.jsonl.gz
// {regime, norad, older, newer, newerCreated, gapDays, d: [R, T, N, dR, dT, dN]}.
//
// With --c2: E2's C2a input as well: accumulate without reference states over
// each object's sets with epochs in the window, age bins tau +- 0.5 d (tau = 0:
// 0-0.5 d), the regime as one stratum; finalize. Output: c2.json.
//
//   node experiments/e2b-correlated-covariance/steps/15-differences.mjs --window train --c2
import path from 'node:path';
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { cli, config, configPath, regimeObjects, windowSets, loadGp, jsonlWriter, trim, DAY_MS, SET_LEAD_DAYS } from '../common.mjs';

const { values, regimes, window, modules, archive, reference: referenceDir, objects: only } = cli({ c2: { type: 'boolean', default: false } });
const run = startRun({ experiment: config.experiment, step: `15-differences-${window.name}-${regimes.join('+')}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await loadGp(modules, run);
const out = jsonlWriter(path.join(run.dir, 'differences.jsonl.gz'));
const MAX_GAP_DAYS = 7, BATCH = 500;
const counts = {}, c2 = { window: { name: window.name, from: window.from, to: window.to }, regimes: {} };
for (const name of regimes) {
  const objects = regimeObjects(referenceDir, name).filter((n) => !only || only.has(n));
  const { byObject, files } = windowSets(archive, referenceDir, window, objects);
  run.addInputs('gpHistory', files);
  const c = counts[name] = { objects: objects.length, pairs: 0, failed: 0 };
  for (const norad of objects) {
    const sets = byObject.get(norad) ?? [];
    const pairs = [];
    for (let k = 1; k < sets.length; ++k) {
      const i = sets[k - 1], j = sets[k];
      if (j.ms < window.lo - SET_LEAD_DAYS * DAY_MS || j.ms >= window.hi + DAY_MS) continue;
      if (j.ms - i.ms > MAX_GAP_DAYS * DAY_MS) continue;
      pairs.push([i, j]);
    }
    for (let b = 0; b < pairs.length; b += BATCH) {
      const batch = pairs.slice(b, b + BATCH);
      const members = [...new Map(batch.flat().map((s) => [s.epoch, s])).values()];
      const targets = batch.map(([i, j]) => ({ norad, epoch: j.epoch, sets: [i.epoch], origin: 'set', originSet: j.epoch }));
      const result = await gp.invokeJson('common_epoch', [ommFrame(members), json('options', { targets })], 'differences');
      result.targets.forEach((r, k) => {
        const [i, j] = batch[k];
        if (r.missing || !r.sets?.length) { ++c.failed; return; }
        out.write({ regime: name, norad, older: i.epoch, newer: j.epoch, newerCreated: j.creationDate,
          gapDays: (j.ms - i.ms) / DAY_MS, d: trim(r.sets[0].rtn) });
        ++c.pairs;
      });
    }
  }
  log(`${name}: ${JSON.stringify(c)}`);

  if (values.c2) {
    // E2's C2a: the regime as one stratum, tau bins, first later set per bin.
    const options = {
      regimes: [{ id: name, altitudeKm: [-1e4, 1e9], eccentricity: [0, 1] }],
      ageBinsDays: config.measurement.tausDays.map((t) => [Math.max(0, t - config.products.c2.binHalfWidthDays), t + config.products.c2.binHalfWidthDays]),
    };
    let acc = null;
    for (const norad of objects) {
      const inWindow = (byObject.get(norad) ?? []).filter((s) => s.ms >= window.lo && s.ms < window.hi);
      if (inWindow.length < 2) continue;
      const inputs = [ommFrame(inWindow), json('options', options)];
      if (acc) inputs.push(json('prior', acc));
      acc = await gp.invokeJson('accumulate', inputs, 'accumulator');
    }
    const model = await gp.invokeJson('finalize', [json('accumulator', acc)], 'model');
    c2.regimes[name] = { options, strata: model.strata, counts: model.counts ?? acc.counts };
    log(`${name}: C2a strata ${model.strata.map((s) => `${s.ageIndex}:${s.n}`).join(' ')}`);
  }
}
const rows = await out.close();
if (values.c2) run.write('c2.json', c2);
run.write('counts.json', counts);
run.finish({ counts, rows });
await gp.destroy();
log(`done: ${rows} rows`);
