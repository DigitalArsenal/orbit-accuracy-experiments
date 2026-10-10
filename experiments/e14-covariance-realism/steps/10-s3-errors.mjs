#!/usr/bin/env node
// E14 step 10: element-set (SGP4) errors against truth at the horizons (PLAN.md sections 4 S3, 5, 8).
// For every element set j of every truth object with epoch in the window (an anchor) and every horizon tau whose
// target (the first truth epoch at or after epoch_j + tau, within the truth's sampling interval) is also in the window,
// the error of set j alone: analysis/gp-error-model common_epoch, origin the truth state (SGP4 minus truth, RTN of
// the truth state, km and km/s). The anchor's regime: gp-error-model's rule (un-Kozai'd mean motion and eccentricity),
// through calibrate_covariance with a unit factor model. The manoeuvre screen: analysis/maneuver-detection
// detect_maneuvers on the object's element sets; a sample is screened out when an event other than ORBIT_LOWERING lies
// in [epoch_j - 1 d, target] (ORBIT_LOWERING is kept: drag steps in storms register as it; the module's own limit).
// Rows: runs/<id>/errors.jsonl.gz, one per (anchor, tau): {norad, regime, anchor, created, gpId, tau, target,
// ageDays, rtn [6] km km/s, truthSigmaM, screened, missing?}.
//
//   node experiments/e14-covariance-realism/steps/10-s3-errors.mjs --window devFit [--objects 39452,39451]
import path from 'node:path';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { cli, config, configPath, DAY_MS, Truth, truthObjects, elementSets, moduleOf, callJson, json, jsonlWriter, isoMs, trim, waitForLoad } from '../common.mjs';

const { values, window, objects: only, modules, archive } = cli();
if (!window.lo) throw new Error('step 10 runs on a long window (devFit, devSelect or test)');
await waitForLoad();
const run = startRun({ experiment: config.experiment, step: `10-s3-errors-${window.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await moduleOf(modules, 'analysis/gp-error-model', run);
const mnv = await moduleOf(modules, 'analysis/maneuver-detection', run);
const truth = new Truth();
const objects = truthObjects(truth).filter((n) => !only || only.has(n));
const horizonMs = Math.max(...config.horizonsDays) * DAY_MS;
const { byObject, files } = elementSets(archive, window.from, window.to, objects);
run.addInputs('gpHistory', files);
const out = jsonlWriter(path.join(run.dir, 'errors.jsonl.gz'));
const unit = { kind: 'e14-factors', version: 'regime-only', regimes: config.regimes, strata: [{ regime: '*', horizonDays: [0, 1e9], factor: 1 }] };
const SCREENED = (c) => c !== 'ORBIT_LOWERING';
const counts = { objects: objects.length, withSets: 0, anchors: 0, targets: 0, missing: 0, defects: 0, screened: 0, outside: 0, events: 0 };

for (const norad of objects) {
  const sets = byObject.get(norad) ?? [];
  const anchors = sets.filter((s) => s.ms >= window.lo && s.ms < window.hi);
  if (!anchors.length || !truth.spans(norad, window.lo, window.hi - 1).length) continue;
  ++counts.withSets;
  // Manoeuvres from the element sets (never from truth errors), sets up to two days past the window.
  const history = sets.filter((s) => s.ms >= window.lo - 30 * DAY_MS && s.ms < window.hi + 2 * DAY_MS);
  const report = await callJson(mnv, 'detect_maneuvers', [
    { portId: 'elements', payload: Buffer.from(JSON.stringify({ objects: [{ norad, sets: history.map((s) => ({ mjd: s.ms / DAY_MS + 40587, ...s.elements })) }] })), typeRef: { schemaName: 'application/json' } },
    json('options', {}),
  ], 'report');
  const events = (report.objects?.[0]?.events ?? []).map((e) => ({ ms: Date.parse(/Z$/.test(e.time) ? e.time : `${e.time}Z`), characterization: e.characterization }));
  counts.events += events.length;
  const screenedOut = (fromMs, toMs) => events.some((e) => SCREENED(e.characterization) && e.ms >= fromMs && e.ms <= toMs);
  // Regimes of the anchors (gp-error-model's rule).
  const regimeOf = new Map();
  for (let i = 0; i < anchors.length; i += 2000) {
    const batch = anchors.slice(i, i + 2000);
    const r = await callJson(gp, 'calibrate_covariance', [json('model', unit),
      json('objects', { objects: batch.map((s) => ({ id: s.gpId, set: { norad, epoch: s.epoch }, horizonDays: 0, covariance: [1, 0, 1, 0, 0, 1] })) }), ommFrame(batch)]);
    r.objects.forEach((o) => regimeOf.set(String(o.id), o.regime));
  }
  // Errors, a week of anchors at a time; truth read only inside the window.
  for (let chunk = window.lo; chunk < window.hi; chunk += 7 * DAY_MS) {
    const chunkEnd = Math.min(chunk + 7 * DAY_MS, window.hi);
    const group = anchors.filter((s) => s.ms >= chunk && s.ms < chunkEnd);
    if (!group.length) continue;
    const spanEnd = Math.min(chunkEnd + horizonMs + DAY_MS, window.hi - 1);
    const frames = truth.frames(norad, chunk, spanEnd);
    const defects = truth.defects(norad, chunk, spanEnd);
    const targets = [], meta = [];
    for (const j of group) {
      for (const tau of config.horizonsDays) {
        const t = j.ms + tau * DAY_MS;
        if (t >= window.hi) continue;
        targets.push({ norad, epoch: isoMs(t), afterSeconds: truth.stepAt(norad, t) ?? 60, sets: [j.epoch], origin: 'reference' });
        meta.push({ j, tau, t });
      }
    }
    counts.anchors += group.length;
    counts.targets += targets.length;
    if (!frames.length) { counts.missing += targets.length; for (const m of meta) out.write({ norad, anchor: m.j.epoch, tau: m.tau, missing: 'no truth' }); continue; }
    const result = await callJson(gp, 'common_epoch', [ommFrame(group), ...frames, json('options', { targets })], 'differences');
    result.targets.forEach((r, k) => {
      const { j, tau } = meta[k];
      const regime = regimeOf.get(j.gpId) ?? null;
      const row = { norad, regime, anchor: j.epoch, created: j.creationDate, gpId: j.gpId, tau, target: r.epoch };
      if (!r.missing && defects.has(r.epoch)) { r.missing = 'truth epoch fails the radius screen'; ++counts.defects; }
      const targetMs = r.epoch ? Date.parse(/Z$/.test(r.epoch) ? r.epoch : `${r.epoch}Z`) : null;
      if (!r.missing && targetMs >= window.hi) r.missing = 'target after the window';
      if (r.missing || !r.sets?.[0]) { row.missing = r.missing ?? 'set not propagated'; ++counts.missing; out.write(row); return; }
      if (!regime) ++counts.outside;
      row.ageDays = Number(r.sets[0].ageDays.toPrecision(12));
      row.rtn = trim(r.sets[0].rtn);
      row.truthSigmaM = truth.sigmaAt(norad, targetMs);
      row.screened = screenedOut(j.ms - DAY_MS, targetMs);
      if (row.screened) ++counts.screened;
      out.write(row);
    });
  }
  log(`${norad}: ${anchors.length} anchors, ${events.length} events`);
}
run.addInputs('reference', truth.read);
const rows = await out.close();
run.write('counts.json', counts);
run.finish({ counts, rows });
log(`done: ${rows} rows ${JSON.stringify(counts)}`);
