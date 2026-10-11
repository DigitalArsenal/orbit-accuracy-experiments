#!/usr/bin/env node
// E14 step 40: S2 samples (PLAN.md sections 4 S2, 4 S4, 8). For every truth object, one element set every
// `anchorEveryDays` (the first created on or after 00:00 UTC of each such day, its epoch in the window): the HPOP
// screen's product - analysis/epoch-state's GCRF state at the set's epoch, propagator/hpop's execution path with the
// full force model (config.s2.forces) on the drivers released at the set's creation - with one propagation per anchor:
//   - P0: S3-T's age-0 stratum of the anchor's regime (dev-fit, results/e14/dev/s3-models-s2p0.json), rotated to GCRF by gp-error-model hpop_arcs, which
//     also gives the targets (the truth epoch nearest epoch + tau) and their truth states;
//   - the propagation carries P0 and one dynamic parameter (Cd*A/m in LEO, Cr*A/m above), with its STM sampled at every
//     step end of HPOP's process-noise discretization of every target: A0 = Phi P0 Phi' at the targets, and
//     gp-error-model noise_responses gives the unit white-acceleration responses U_R, U_T, U_N from that STM;
//   - the consider term of the parameter (variance of its logarithm: Cd*A/m from the object's B* over the 30 days
//     before the set; Cr*A/m 0.2^2) and, in LEO, the open DCP (S4: the lead covariance of the anchor's altitude and
//     forecast class, shrinkage 0, 0.5 and 1) by gp-error-model dcp_covariance, added to A0 in the module.
// Rows: runs/<id>/s2-samples.jsonl.gz, one per target, position blocks as row-major 3x3 (m^2).
//
//   node experiments/e14-covariance-realism/steps/40-s2-samples.mjs --window devFit [--shard 0/2] [--objects ...]
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { epochStates } from '../../e2-catalog-covariance/product.mjs';
import { cli, config, configPath, DAY_MS, Truth, truthObjects, mgexObjects, elementSets, callJson, json, jsonlWriter, waitForLoad, moduleOf } from '../common.mjs';
import { s2Context, propagate, bOf, AGOM, stateBlock, sensitivity } from '../s2.mjs';

const { values, window, objects: only, modules, archive } = cli({ shard: { type: 'string', default: '0/1' }, 's3-models': { type: 'string' }, dcp: { type: 'string' },
  // Only these anchors (norad@set epoch, comma-separated): a rerun of anchors an earlier run lost (amendments.json).
  'only-anchors': { type: 'string' } });
const onlyAnchors = values['only-anchors'] ? new Set(values['only-anchors'].split(',')) : null;
if (!window.lo) throw new Error('step 40 runs on a long window');
const [shard, shards] = values.shard.split('/').map(Number);
await waitForLoad();
const run = startRun({ experiment: config.experiment, step: `40-s2-samples-${window.name}-s${shard}of${shards}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const ctx = await s2Context(modules, run);
const gp = ctx['gp-error-model'];
const mnv = await moduleOf(modules, 'analysis/maneuver-detection', run);
// S2's P0 (step 22): S3-T's age-0 strata as fitted before the GRACE-FO and MGEX truth (the file the first dev-fit runs
// read), GEO and HEO from the refit (PLAN.md, changes before the freeze): every S2 window uses the same P0.
const s3File = values['s3-models'] ?? path.join(repoRoot, 'results/e14/dev/s2-p0.json');
const dcpFile = values.dcp ?? path.join(repoRoot, 'results/e14/dev/s4-dcp.json');
const s3 = JSON.parse(fs.readFileSync(s3File, 'utf8')).candidates['S3-T'];
const dcp = JSON.parse(fs.readFileSync(dcpFile, 'utf8'));
run.addInputs('models', Object.fromEntries([s3File, dcpFile].map((f) => [path.relative(repoRoot, f), createHash('sha256').update(fs.readFileSync(f)).digest('hex')])));
// P0 per regime: S3-T's age-0 stratum (6x6 RTN second moment, km), as an hpop-covariance-model for hpop_arcs.
const p0Model = { kind: 'hpop-covariance-model', version: 1, regimes: s3.strata.filter((s) => s.ageIndex === 0).map((s) => ({ regimeIndex: s.regimeIndex, regime: s.regime, p0: s.covariance })) };
const truth = new Truth();
const objects = truthObjects(truth).filter((n) => !only || only.has(n)).filter((_, i) => i % shards === shard);
const { byObject, files } = elementSets(archive, window.from, window.to, objects);
run.addInputs('gpHistory', files);
const out = jsonlWriter(path.join(run.dir, 's2-samples.jsonl.gz'));
const step = config.s2.processNoise.discretizationSeconds;
const isoMs = (ms) => new Date(ms).toISOString().replace('Z', '');
const msOf = (text) => Date.parse(/Z$/.test(text) ? text : `${text}Z`);
// Microseconds since 1970 from ISO text with up to six decimals, and back (ISO without a zone).
const usOf = (text) => { const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?/.exec(text); return Date.parse(`${m[1]}Z`) * 1000 + Number((m[2] ?? '0').padEnd(6, '0')); };
const isoUs = (us) => `${new Date(Math.floor(us / 1e6) * 1000).toISOString().slice(0, 19)}.${String(Math.round(us % 1e6)).padStart(6, '0')}`;
const pos9 = (m36) => [m36[0], m36[1], m36[2], m36[6], m36[7], m36[8], m36[12], m36[13], m36[14]];
const counts = { objects: objects.length, anchors: 0, targets: 0, failed: 0, screened: 0, mgexSkipped: 0 };
const mgex = mgexObjects(truth);
const started = performance.now();

// The lead covariance (shrinkage s toward the diagonal) of an altitude (nearest at or below 1000 km) and class.
const leadCovariance = (altKm, cls, s) => {
  const alt = dcp.altitudesKm.reduce((best, a) => (Math.abs(a - altKm) < Math.abs(best - altKm) ? a : best), dcp.altitudesKm[0]);
  const C = dcp.strata.find((x) => x.altitudeKm === alt && x.class === cls).secondMoment;
  return { alt, C: C.map((row, i) => row.map((v, j) => (i === j ? v : (1 - s) * v))) };
};
const classOf = (ap) => (ap < config.s4.forecastClassesAp[0] ? 0 : ap < config.s4.forecastClassesAp[1] ? 1 : 2);

for (const norad of objects) {
  const sets = byObject.get(norad) ?? [];
  if (!sets.length || !truth.spans(norad, window.lo, window.hi - 1).length) continue;
  // Anchors: the first set created on or after 00:00 UTC of every anchorEveryDays-th day, epoch in the window.
  const anchors = [];
  for (let d = window.lo; d < window.hi; d += config.s2.anchorEveryDays * DAY_MS) {
    const s = sets.find((x) => x.createdMs >= d && x.ms >= window.lo && x.ms < window.hi);
    if (s && !anchors.includes(s)) anchors.push(s);
  }
  if (!anchors.length) continue;
  // Manoeuvre screen, as step 10.
  const history = sets.filter((s) => s.ms >= window.lo - 30 * DAY_MS && s.ms < window.hi + 2 * DAY_MS);
  const mrep = await callJson(mnv, 'detect_maneuvers', [
    { portId: 'elements', payload: Buffer.from(JSON.stringify({ objects: [{ norad, sets: history.map((s) => ({ mjd: s.ms / DAY_MS + 40587, ...s.elements })) }] })), typeRef: { schemaName: 'application/json' } },
    json('options', {})], 'report');
  const events = (mrep.objects?.[0]?.events ?? []).filter((e) => e.characterization !== 'ORBIT_LOWERING').map((e) => msOf(e.time));
  // Targets and P0 (hpop_arcs), truth read inside the window only.
  const frames = truth.frames(norad, window.lo, window.hi - 1);
  const plan = await callJson(gp, 'hpop_arcs', [ommFrame(anchors), ...frames, json('model', p0Model),
    json('options', { regimes: config.regimes, targetAgesDays: config.horizonsDays, targetToleranceSeconds: 900 })], 'plan');
  const seeds = await epochStates(ctx['epoch-state'], anchors);
  for (const arc of plan.arcs) {
    const k = anchors.findIndex((s) => Math.abs(msOf(s.epoch) - msOf(arc.epoch)) <= 1000);
    const set = anchors[k], seed = seeds[k];
    if (!set || !seed || !arc.covariance) continue;
    if (onlyAnchors && !onlyAnchors.has(`${norad}@${set.epoch}`)) continue;
    const t0 = msOf(seed.epoch);
    const targets = arc.targets.filter((t) => msOf(t.epoch) < window.hi && msOf(t.epoch) >= t0);
    if (!targets.length) continue;
    // MGEX satellites enter S2 only in config.truth.mgex.s2Regimes (PLAN.md, changes before the freeze).
    if (mgex.has(norad) && !config.truth.mgex.s2Regimes.includes(arc.regime)) { ++counts.mgexSkipped; continue; }
    ++counts.anchors;
    const leo = arc.regime.startsWith('LEO');
    const b = bOf(set);
    const parameter = leo ? { kind: 'DRAG_AREA_OVER_MASS', value: b } : { kind: 'SRP_AREA_OVER_MASS', value: AGOM };
    // Consider variance of the parameter's logarithm.
    let varLn = 0.04;
    if (leo) {
      const prior = sets.filter((s) => s.ms <= set.ms && s.ms >= set.ms - 30 * DAY_MS && s.elements.BSTAR > 0).map((s) => Math.log(s.elements.BSTAR));
      const mean = prior.reduce((a, x) => a + x, 0) / Math.max(1, prior.length);
      varLn = prior.length >= 3 ? Math.min(1, Math.max(0.0025, prior.reduce((a, x) => a + (x - mean) ** 2, 0) / (prior.length - 1))) : 0.04;
    }
    // Sample epochs (microseconds, as the module reads them): every step end of every target's noise grid, the
    // targets, and the creation time (the DCP's start).
    const t0us = usOf(seed.epoch);
    const epochs = new Map();
    for (const t of targets) {
      const tt = (usOf(t.epoch) - t0us) / 1e6;
      if (tt <= 0) continue;
      const n = Math.ceil(tt / step - 1e-9), h = tt / n;
      for (let j = 1; j < n; ++j) { const us = Math.round(t0us + j * h * 1e6); epochs.set(us, isoUs(us)); }
    }
    for (const t of targets) epochs.set(usOf(t.epoch), isoUs(usOf(t.epoch)));
    const cutoffUs = Math.max(set.createdMs * 1000, t0us + 1e6);
    const cutoff = Math.round(cutoffUs / 1000);
    epochs.set(cutoffUs, isoUs(cutoffUs));
    const sampleList = [...epochs.entries()].sort((a, b2) => a[0] - b2[0]);
    const P0 = Array(49).fill(0);
    for (let r = 0; r < 6; ++r) for (let c = 0; c < 6; ++c) P0[7 * r + c] = arc.covariance[6 * r + c];
    let samples;
    try {
      samples = await propagate(ctx, { epoch: seed.epoch, state: seed.state, samples: sampleList.map((e) => e[1]), b, cutoffMs: set.createdMs,
        parameters: [parameter], covariance: P0, stm: true, forces: { ...config.s2.forces, drag: leo } });
    } catch (error) { ++counts.failed; log(`${norad} ${set.epoch}: HPOP ${error.message}`); continue; }
    const at = new Map(sampleList.map((e, i) => [e[0], samples[i]]));  // keyed by microseconds
    const n7 = 7;
    // Unit noise responses from the STM.
    const nr = await callJson(gp, 'noise_responses', [json('request', { start: seed.epoch, discretizationSeconds: step,
      samples: sampleList.map((e, i) => ({ epoch: e[1], state: samples[i].state, stm: samples[i].stm })), targets: targets.filter((t) => usOf(t.epoch) > t0us).map((t) => isoUs(usOf(t.epoch))) })]);
    const U = new Map(nr.targets.map((r) => [usOf(r.epoch), r.u]));
    // The parameter's consider term on A0.
    const tsamp = targets.map((t) => at.get(usOf(t.epoch)));
    const consider = await callJson(gp, 'dcp_covariance', [json('request', { leadCovariance: [[varLn]], start: seed.epoch,
      segments: [{ from: seed.epoch, to: isoMs(msOf(targets.at(-1).epoch) + DAY_MS), lead: 1 }],
      epochs: targets.map((t, i) => ({ epoch: t.epoch.replace(/Z$/, ''), sensitivity: sensitivity(tsamp[i].stm, n7, 0).map((x) => x * parameter.value), base: stateBlock(tsamp[i].covariance, n7) })) })]);
    // The DCP (LEO): lead days of the RSGA issue in force at the creation.
    let dcpRows = null, dcpMeta = null;
    if (leo) {
      const issue = ctx.rsga.reports.filter((r) => r.issuedMs <= set.createdMs).at(-1);
      const d = Math.floor(issue.issuedMs / DAY_MS) * DAY_MS;
      const cls = classOf(Math.max(...issue.ap.filter((x) => x.kind === 'predicted').map((x) => x.value)));
      const segments = [{ from: isoMs(cutoff), to: isoMs(Math.max(cutoff + 1000, d + DAY_MS)), lead: 1 }];
      for (let kk = 1; kk <= 7; ++kk) segments.push({ from: isoMs(Math.max(cutoff, d + kk * DAY_MS)), to: isoMs(d + (kk + 1) * DAY_MS + (kk === 7 ? 30 * DAY_MS : 0)), lead: kk });
      const altKm = Math.hypot(...seed.state.slice(0, 3)) / 1000 - 6378.137;
      const cs = at.get(cutoffUs);
      dcpRows = {};
      for (const shrink of config.s4.shrinkageCandidates) {
        const { alt, C } = leadCovariance(altKm, cls, shrink);
        dcpMeta = { issued: new Date(issue.issuedMs).toISOString(), class: cls, altitudeKm: alt };
        const r = await callJson(gp, 'dcp_covariance', [json('request', { leadCovariance: C, start: isoMs(cutoff), segments: segments.filter((s) => msOf(s.to) > msOf(s.from)),
          ballisticCoefficient: b, startSample: { stm: stateBlock(cs.stm, n7), s: sensitivity(cs.stm, n7, 0) },
          epochs: targets.map((t, i) => ({ epoch: t.epoch.replace(/Z$/, ''), stm: stateBlock(tsamp[i].stm, n7), s: sensitivity(tsamp[i].stm, n7, 0), base: consider.epochs[i].total })) })]);
        dcpRows[shrink] = r.epochs;
      }
    }
    targets.forEach((t, i) => {
      const s = tsamp[i];
      const u = U.get(usOf(t.epoch)) ?? [Array(36).fill(0), Array(36).fill(0), Array(36).fill(0)];
      const row = { norad, regime: arc.regime, anchor: set.epoch, created: set.creationDate, tau: t.nominalDays, ageDays: t.ageDays, epoch: t.epoch,
        truth: t.truth.map((x) => x * 1000), state: s.state, parameter: parameter.kind, varLn,
        A0: pos9(stateBlock(s.covariance, n7)), QC: pos9(consider.epochs[i].total), U: u.map(pos9),
        screened: events.some((e) => e >= set.ms - DAY_MS && e <= msOf(t.epoch)) };
      if (dcpRows) { row.QCD = Object.fromEntries(Object.entries(dcpRows).map(([k2, v]) => [k2, pos9(v[i].total)])); row.dcp = { ...dcpMeta, sigmaEff: dcpRows[config.s4.shrinkageCandidates[0]][i].sigmaEff }; }
      if (row.screened) ++counts.screened;
      out.write(row);
      ++counts.targets;
    });
    if (counts.anchors % 20 === 0) log(`${counts.anchors} anchors, ${counts.targets} targets, ${((performance.now() - started) / 1000).toFixed(0)} s`);
  }
  run.addInputs('reference', truth.read);
  log(`${norad}: ${anchors.length} anchors`);
  run.checkpoint();
  await out.flush();
  await new Promise((resolve) => setImmediate(resolve));  // the module calls resolve at once: let the output file open and write
}
const rows = await out.close();
run.finish({ counts, rows, seconds: (performance.now() - started) / 1000 });
log(`done: ${JSON.stringify(counts)} in ${((performance.now() - started) / 1000).toFixed(0)} s`);

