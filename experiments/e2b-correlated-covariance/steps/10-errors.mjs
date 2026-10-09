#!/usr/bin/env node
// E2b step 10: SGP4 errors against precise orbits at common epochs (PLAN.md
// section 4). For every element set j with epoch in the window (an anchor)
// and every tau, the target is the first precise-orbit epoch at or after
// epoch_j + tau within the product's sampling interval; there every set of
// the object with epoch in [epoch_j - 7 d, epoch_j] is propagated by SGP4
// (analysis/gp-error-model common_epoch, origin the precise state) and its
// RTN error recorded with its age. Rows: runs/<id>/errors.jsonl.gz, one per
// target: {regime, norad, anchor, anchorCreated, tau, epoch, missing?,
// sets: [[epoch, ageDays, [R, T, N, dR, dT, dN]]]} (km, km/s).
//
//   node experiments/e2b-correlated-covariance/steps/10-errors.mjs --window train --regime GPS
import path from 'node:path';
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { cli, config, configPath, regimeObjects, regimeReference, windowSets, isoMs, loadGp, jsonlWriter, trim, DAY_MS } from '../common.mjs';

const { values, regimes, window, modules, archive, reference: referenceDir, objects: only } = cli();
const run = startRun({ experiment: config.experiment, step: `10-errors-${window.name}-${regimes.join('+')}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await loadGp(modules, run);
const out = jsonlWriter(path.join(run.dir, 'errors.jsonl.gz'));
const M = config.measurement;
const horizon = (Math.max(...M.tausDays) + 1) * DAY_MS;
const counts = {};
for (const name of regimes) {
  const regime = config.regimes[name];
  const reference = regimeReference(referenceDir, name);
  const objects = regimeObjects(referenceDir, name).filter((n) => !only || only.has(n));
  const { byObject, files } = windowSets(archive, referenceDir, window, objects);
  run.addInputs('gpHistory', files);
  const c = counts[name] = { objects: objects.length, objectsWithAnchors: 0, anchors: 0, targets: 0, missingTargets: 0, missingSets: 0, errors: 0, calls: 0 };
  const started = performance.now();
  for (const norad of objects) {
    const sets = byObject.get(norad) ?? [];
    const anchorsAll = sets.filter((s) => s.ms >= window.lo && s.ms < window.hi);
    if (anchorsAll.length) ++c.objectsWithAnchors;
    for (let chunk = window.lo; chunk < window.hi; chunk += M.chunkDays * DAY_MS) {
      const chunkEnd = Math.min(chunk + M.chunkDays * DAY_MS, window.hi);
      const anchors = anchorsAll.filter((s) => s.ms >= chunk && s.ms < chunkEnd);
      if (!anchors.length) continue;
      c.anchors += anchors.length;
      c.targets += anchors.length * M.tausDays.length;
      const frames = reference.frames(norad, chunk, chunkEnd + horizon);
      if (!frames.length) { c.missingTargets += anchors.length * M.tausDays.length; continue; }
      const members = sets.filter((s) => s.ms >= chunk - (M.groupDays + 1) * DAY_MS && s.ms < chunkEnd);
      const targets = [], meta = [];
      for (const j of anchors) {
        const group = members.filter((s) => s.ms >= j.ms - M.groupDays * DAY_MS && s.ms <= j.ms).map((s) => s.epoch);
        for (const tau of M.tausDays) {
          const t = j.ms + tau * DAY_MS;
          targets.push({ norad, epoch: isoMs(t), afterSeconds: reference.stepAt(norad, t) ?? regime.samplingSeconds, sets: group, origin: 'reference' });
          meta.push({ anchor: j, tau });
        }
      }
      const result = await gp.invokeJson('common_epoch', [ommFrame(members), ...frames, json('options', { targets })], 'differences');
      ++c.calls;
      result.targets.forEach((r, k) => {
        const { anchor, tau } = meta[k];
        const row = { regime: name, norad, anchor: anchor.epoch, anchorCreated: anchor.creationDate, tau, epoch: r.epoch };
        if (r.missing) { row.missing = r.missing; ++c.missingTargets; out.write(row); return; }
        row.sets = r.sets.map((s) => [s.epoch, Number(s.ageDays.toPrecision(12)), trim(s.rtn)]);
        c.errors += row.sets.length;
        c.missingSets += r.missingSets?.length ?? 0;
        out.write(row);
      });
      run.addInputs('reference', reference.read);
      reference.dropCache();
    }
    log(`${name} ${norad}: ${anchorsAll.length} anchors (${((performance.now() - started) / 1000).toFixed(0)} s)`);
  }
  log(`${name}: ${JSON.stringify(c)}`);
}
const rows = await out.close();
run.write('counts.json', counts);
run.finish({ counts, rows });
await gp.destroy();
log(`done: ${rows} rows`);
