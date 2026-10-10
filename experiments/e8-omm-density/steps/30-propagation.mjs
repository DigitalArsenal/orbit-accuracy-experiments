#!/usr/bin/env node
// E8 step 30: propagation endpoint (PLAN.md section 4b; E5's protocol with
// every force HPOP carries in LEO). For each issue day t0 and target: fit the
// state and Cd*A/m (B) to the precise orbit every 180 s over the 24 h before
// t0 (analysis/estimation fit_batch answered by propagator/hpop with the
// variant's density), propagate the fit to t0 + 1, 3 and 7 days with the same
// model, and take the 3D distance to the precise orbit there.
//   definitive arm  SET's indices as published:
//     D0   JB2008
//     D2   E5's stand-in: every hourly DTC raised by E5's a00(t) (its bins
//          before t0, its forecast from t0 on; degree 0, tau 12 h), from the
//          target's E5 calibration set
//     D5-* every hourly DTC raised by D5's dT(t, h_s): the forecast fit of t0
//          (sets created before t0) before t0, its relaxation after; h_s the
//          target's mean geodetic altitude over a day from its latest element
//          set before t0 (analysis/density-calibration `decay`)
//   operational arm  the drivers as known at t0 (drivers.mjs): D0 and D5-*.
// The modules fit and propagate; this file selects states and routes records.
//
//   node .../30-propagation.mjs --window W --forecast RUN[,RUN] [--decays 12,48,null] [--arms definitive,operational]
//        [--variants D0,D2,D5] [--days ...] [--objects ...] [--shard k/n] [--resume RUN]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { kernelFrame } from '../../../harness/prw.mjs';
import { c04Records, eopFrame } from '../../../harness/eop.mjs';
import { EST_TYPE, estimationCodec, decodeResult, positionObservation, seedStruct } from '../../e5-density-calibration/estimation-wire.mjs';
import { a00Series } from '../../e5-density-calibration/forecast.mjs';
import { callJson, config, configPath, DAY_MS, gfzDays, inRepo, isoDay, isoUtc, issueDays, jb2008Rows, loadModules, maxKp, modulesDir, readRun, regimeOf,
  runConfigHash, setIndices, windowSpans, dayMs } from '../common.mjs';
import { decodeSamples, executionFrame, jb2008Frame } from '../hpop.mjs';
import { forecastCorrection, hourlyOffsets } from '../correction.mjs';
import { operationalJb2008Rows, rsga } from '../drivers.mjs';
import { asModuleSet, asOf, readCache } from '../omm.mjs';
import { Truth } from '../truth.mjs';

const { values } = parseArgs({ options: {
  window: { type: 'string' }, forecast: { type: 'string' }, decays: { type: 'string' }, arms: { type: 'string', default: 'definitive,operational' },
  variants: { type: 'string', default: 'D0,D2,D5' }, days: { type: 'string' }, objects: { type: 'string' },
  shard: { type: 'string', default: '0/1' }, resume: { type: 'string' }, modules: { type: 'string' },
} });
const spans = windowSpans(values.window);
const p = config.propagation;
const decays = (values.decays ?? config.decay.forecast.candidates.decayHours.map(String).join(',')).split(',').map((x) => (x === 'null' ? null : Number(x)));
const arms = values.arms.split(','), wanted = values.variants.split(',');
const [shard, shards] = values.shard.split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `30-propagation-${values.window}-${shard}of${shards}`, configPath, modulesDir: modulesDir(values.modules), args: values, resume: values.resume });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const { root, loaded } = await loadModules(run, ['analysis/estimation', 'propagator/hpop', 'data-source/eop-parser', 'analysis/density-calibration'], values);
const { 'analysis/estimation': estimation, 'propagator/hpop': hpop, 'data-source/eop-parser': parser, 'analysis/density-calibration': dc } = loaded;
const kernelBytes = fs.readFileSync(inRepo(config.inputs.kernel.path));
if (sha256(kernelBytes) !== config.inputs.kernel.sha256) throw new Error('the planetary kernel is not the configured one');
run.addInputs('kernel', { [path.basename(config.inputs.kernel.path)]: config.inputs.kernel.sha256 });
const kernel = kernelFrame(kernelBytes);
const eop = await c04Records(parser, config.inputs.eopC04);
run.addInputs('eop', { [path.basename(config.inputs.eopC04)]: eop.sha256 });
run.addInputs('set', setIndices().sha256);
run.addInputs('gfz', { kp: gfzDays().sha256 });
if (arms.includes('operational')) run.addInputs('rsga', rsga().files);
const codec = await estimationCodec(root, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro'));
const truth = new Truth();

// E5's bins (degree 0) and selected decay; D5 forecast fits by tag and issue day.
const e5Raw = fs.readFileSync(path.join(repoRoot, config.inputs.e5.calibration[values.window]));
run.addInputs('e5', { [config.inputs.e5.calibration[values.window]]: sha256(e5Raw) });
const e5 = JSON.parse(zlib.gunzipSync(e5Raw));
const e5Tau = JSON.parse(fs.readFileSync(path.join(repoRoot, config.inputs.e5.selection), 'utf8')).decayHours;
const tagOf = (r) => `K${r.perBin}-${r.structure}`;
const fits = new Map();
const tags = [];
for (const id of (values.forecast ?? '').split(',').filter(Boolean)) {
  const r = readRun(id, 'estimates.json');
  if (r.window !== values.window || r.mode !== 'forecast') throw new Error(`${id} is not a ${values.window} forecast run`);
  run.addInputs('estimates', { [id]: runConfigHash(id) });
  // Shards of one forecast configuration (step 10 --shard) share a tag: one variant each.
  if (!tags.includes(tagOf(r))) tags.push(tagOf(r));
  for (const s of r.spans) for (const f of s.fits) {
    if (fits.has(`${tagOf(r)}|${f.issue}`)) throw new Error(`two forecast fits for ${tagOf(r)} on ${f.issue}`);
    fits.set(`${tagOf(r)}|${f.issue}`, f);
  }
}

const iso = (ms) => isoUtc(ms);
const stateM = (s) => [...s.r, ...s.v].map((x) => x * 1000);
const mjd = (ms) => Math.floor(ms / DAY_MS) + 40587;
const forces = (atmosphere) => ({ ...p.forces, atmosphere });

// One fit and prediction: {b, iterations, wrms, errors: {h: m}} or {error}.
async function arc(target, t0s, obs, horizons, env, seed = null) {
  const reference = { epoch: iso(t0s.ms), state: seed?.state ?? stateM(t0s) };
  const isoByLabel = new Map();
  const estEpoch = (ms) => {
    const day = Math.floor(ms / DAY_MS);
    const label = { jd_day: day + 2440587.5, seconds: (ms - day * DAY_MS) / 1000 };
    isoByLabel.set(JSON.stringify(label), iso(ms));
    return label;
  };
  const sig = p.observationSigma;
  const cov = [0, 1, 2, 3, 4, 5].flatMap((i) => [0, 1, 2, 3, 4, 5].map((j) => (i !== j ? 0 : i < 3 ? sig.positionM ** 2 : sig.velocityMS ** 2)));
  const request = {
    config: {
      initial_epoch: estEpoch(t0s.ms), initial_state: reference.state, initial_covariance: Array(36).fill(0),
      process_noise_spectral_density: Array(6).fill(0), state_convergence_tolerance: 0, rms_convergence_tolerance: 0, sigma_edit_threshold: 0,
      dynamic_model_correlation_time_seconds: 0, maximum_iterations: 0, reference_frame: 'ICRF', estimator: 'BATCH_WEIGHTED_LEAST_SQUARES', process_noise: 'NONE', flags: 0,
    },
    extended_observations: obs.map((o) => ({ observation: { ...positionObservation(estEpoch(o.ms), [0, 0, 0]), kind: 'POSITION_VELOCITY', value_count: 6 }, values: stateM(o), sigmas: [1, 1, 1, 1, 1, 1] })),
    propagator_port_id: 'propagator/hpop', propagator_capability: 'plugin_propagate plugin_compute_stm',
    batch_options: { parameter_kinds: [1], parameter_values: [seed?.b ?? target.b], observation_covariances: obs.flatMap(() => cov), covariance_axes: 0,
      maximum_iterations: p.fit.maximumIterations, correction_tolerance: p.fit.correctionTolerance, sigma_edit_threshold: p.fit.sigmaEditThreshold },
  };
  const answers = [];
  let fit = null;
  for (let round = 0; ; ++round) {
    const response = await estimation.invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: codec.encode({ request, propagation_answers: answers }) }]);
    const out = decodeResult(response.outputs.find((o) => o.portId === 'result').payload);
    if (out.status !== 1) { fit = out.fit; break; }
    const q0 = out.queries[0];
    const samples = decodeSamples(await hpop.invoke('invoke', [
      executionFrame({ epoch: reference.epoch, state: q0.seed.state, samples: out.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))),
        forces: forces('JB2008'), parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: q0.parameter_values[0] }], fixed: { agom: target.agom }, stm: true, integrator: p.integrator }),
      kernel, ...env,
    ]));
    out.queries.forEach((q, k) => {
      const s = samples[k], n = s.n, stm = [], sensitivity = [];
      for (let i = 0; i < 6; ++i) { for (let j = 0; j < 6; ++j) stm.push(s.stm[i * n + j]); for (let j = 6; j < n; ++j) sensitivity.push(s.stm[i * n + j]); }
      answers.push({ query: { sequence: q.sequence, seed: seedStruct(q), target_epoch: q.target_epoch, parameter_values: q.parameter_values }, sample: { epoch: q.target_epoch, state: s.state, stm }, sensitivity });
    });
    if (round > p.fit.maximumIterations + 2) throw new Error('fit_batch kept asking for propagation');
  }
  if (!fit || !fit.converged) return { error: `fit did not converge (${fit?.iterations ?? 0} iterations)`, b: fit?.estimate?.[6] ?? null };
  const predicted = decodeSamples(await hpop.invoke('invoke', [
    executionFrame({ epoch: reference.epoch, state: fit.estimate.slice(0, 6), samples: horizons.map((h) => iso(h.truth.ms)), forces: forces('JB2008'),
      parameters: [], fixed: { b: fit.estimate[6], agom: target.agom }, stm: false, integrator: p.integrator }),
    kernel, ...env,
  ]));
  const errors = {};
  horizons.forEach((h, k) => {
    const r = predicted[k].state, t = stateM(h.truth);
    errors[h.days] = Math.hypot(r[0] - t[0], r[1] - t[1], r[2] - t[2]);
  });
  return { b: fit.estimate[6], iterations: fit.iterations, wrms: fit.weightedRms, errors, seed: { state: fit.estimate.slice(0, 6), b: fit.estimate[6] } };
}

// The target's mean geodetic altitude over a day from its latest set before t0.
const caches = new Map();
async function targetAltitude(norad, t0, k) {
  if (!caches.has(k)) { const c = readCache(`${values.window}-${k}`); caches.set(k, c); run.addInputs('elementSetCache', { [`${values.window}-${k}`]: c.sha256 }); }
  const rows = caches.get(k).objects.get(norad)?.rows ?? [];
  const last = asOf(rows, t0 - 3 * DAY_MS, t0, t0).at(-1);
  if (!last) return null;
  const r = await callJson(dc, 'decay', 'request', { jb2008: { rows: jb2008Rows(isoDay(t0 - 10 * DAY_MS), isoDay(t0 + 3 * DAY_MS)) },
    objects: [{ id: String(norad), spanDays: 1, sets: [asModuleSet(last)] }] });
  return r.objects[0].meanAltitudeKm;
}

// Arcs: every (issue day, target) of this shard.
const jobs = [];
for (const [k, span] of spans.entries())
  for (const t0 of issueDays([span]).filter((d) => !values.days || values.days.split(',').includes(isoDay(d))))
    for (const [norad, target] of Object.entries(p.targets).filter(([n]) => !values.objects || values.objects.split(',').includes(n)))
      if (values.window === 'validation' ? p.validationIssueDays.includes(isoDay(t0)) : Math.round((t0 - dayMs(span.from)) / DAY_MS) % p.testEveryDays === 0)
        jobs.push({ t0, k, norad: Number(norad), target });
const mine = jobs.filter((_, i) => i % shards === shard);
const partialFile = path.join(run.dir, 'partial.jsonl');
const done = new Set(fs.existsSync(partialFile) ? fs.readFileSync(partialFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.issue}/${r.norad}/${r.arm}/${r.variant}`; }) : []);
const keep = (row) => fs.appendFileSync(partialFile, `${JSON.stringify(row)}\n`);
const started = performance.now();
for (const [i, job] of mine.entries()) {
  const t0s = truth.nearest(job.norad, job.t0);
  const base = { issue: isoDay(job.t0), norad: job.norad, name: job.target.name, band: job.target.band };
  if (!t0s) { if (!done.has(`${base.issue}/${base.norad}/none/none`)) keep({ ...base, arm: 'none', variant: 'none', error: 'no precise orbit at t0' }); continue; }
  const obs = [];
  for (let t = job.t0 - p.fitSpanHours * 3600000; t < job.t0; t += p.observationEverySeconds * 1000) { const s = truth.nearest(job.norad, t); if (s && s.ms < t0s.ms) obs.push(s); }
  obs.push(t0s);
  const horizons = p.horizonsDays.map((d) => ({ days: d, truth: truth.nearest(job.norad, job.t0 + d * DAY_MS) })).filter((h) => h.truth);
  if (obs.length < 0.8 * (p.fitSpanHours * 3600 / p.observationEverySeconds) || !horizons.length) {
    if (!done.has(`${base.issue}/${base.norad}/none/none`)) keep({ ...base, arm: 'none', variant: 'none', error: `coverage: ${obs.length} fit states, ${horizons.length} horizons` });
    truth.dropCache();
    continue;
  }
  const fromDay = isoDay(job.t0 - 8 * DAY_MS), toDay = isoDay(job.t0 + 9 * DAY_MS);
  const eopInput = eopFrame(eop.records, mjd(job.t0) - 3, mjd(job.t0) + 10);
  const kp = Object.fromEntries(horizons.map((h) => [h.days, maxKp(job.t0, job.t0 + h.days * DAY_MS)]));
  const altKm = await targetAltitude(job.norad, job.t0, job.k);
  const runs = [];
  const rowsOf = (arm, add) => (arm === 'definitive' ? jb2008Rows(fromDay, toDay, add) : operationalJb2008Rows(job.t0, fromDay, toDay, add));
  for (const arm of arms) {
    if (wanted.includes('D0')) runs.push([arm, 'D0', () => rowsOf(arm, null)]);
    if (wanted.includes('D2') && arm === 'definitive') {
      const bins = e5.sets[[...job.target.d2Calibrators].sort().join('+')]?.degrees[0]?.filter((b) => b.coefficients) ?? [];
      runs.push([arm, 'D2', () => rowsOf(arm, a00Series(bins, job.t0, e5Tau, 0))]);
    }
    if (wanted.includes('D5') && altKm !== null) for (const tag of tags) {
      const f = fits.get(`${tag}|${isoDay(job.t0)}`);
      if (!f) continue;
      for (const tau of decays) {
        runs.push([arm, `D5-${tag}-T${tau ?? 'inf'}`, async () => {
          const add = await hourlyOffsets(dc, forecastCorrection(f, tau), altKm, dayMs(fromDay), dayMs(toDay) + DAY_MS - 1, jb2008Rows(isoDay(dayMs(fromDay) - 7 * DAY_MS), isoDay(dayMs(toDay) + 2 * DAY_MS)));
          return rowsOf(arm, add);
        }]);
      }
    }
  }
  let seed = null;
  for (const [arm, variant, rows] of runs) {
    if (done.has(`${base.issue}/${base.norad}/${arm}/${variant}`)) continue;
    let r;
    const seeded = !!seed;
    try { r = await arc(job.target, t0s, obs, horizons, [eopInput, jb2008Frame(await rows())], seed); } catch (error) { r = { error: String(error.message).slice(0, 300) }; }
    if (r.seed) { seed ??= r.seed; delete r.seed; }
    keep({ ...base, arm, variant, altKm, fitStates: obs.length, kp, regimes: Object.fromEntries(Object.entries(kp).map(([h, v]) => [h, regimeOf(v)])), seeded, ...r });
  }
  truth.dropCache();
  log(`${i + 1}/${mine.length} ${base.issue} ${base.name}: ${runs.length} runs, ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
const rows = fs.readFileSync(partialFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
run.addInputs('reference', truth.read());
run.write('propagation-rows.json', { window: values.window, forecast: values.forecast ?? null, decays, arms, e5Tau, rows });
run.finish({ rows: rows.length });
log(`done: ${rows.length} rows`);
