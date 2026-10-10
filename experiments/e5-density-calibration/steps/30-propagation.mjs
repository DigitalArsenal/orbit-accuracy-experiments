#!/usr/bin/env node
// E5 step 30: propagation endpoint. For each issue day t0 and held-out LEO
// precise-orbit satellite: fit the state and Cd*A/m (B) to the precise orbit
// over the day before t0 (analysis/estimation fit_batch, answered by
// propagator/hpop with the variant's atmosphere), propagate the fit to t0 +
// 1, 3 and 7 days with the same atmosphere, and take the 3D distance to the
// precise orbit there. Variants:
//   D0  JB2008, SET indices as published
//   D1  NRLMSISE-00, GFZ daily drivers ($SPW)
//   D2  JB2008, SET indices with every hourly DTC raised by the calibrated
//       global correction a00(t) (analysis bins before t0, the forecast from
//       t0 on), for each decay given; the target's own densities never
//       calibrate it (config.propagation.targets.*.calibrators)
// The modules fit and propagate; this file selects states and routes records.
//
//   node .../30-propagation.mjs --window validation|test --calibration RUN_ID --degree L [--decays 12,48,null]
//        [--shard k/n] [--resume RUN_ID] [--variants D0,D1,D2]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { kernelFrame } from '../../../harness/prw.mjs';
import { c04Records, eopFrame } from '../../../harness/eop.mjs';
import { Products } from '../../e3-combined-catalog/truth.mjs';
import { config, configPath, DAY_MS, gfzDays, isoDay, issueDays, jb2008Rows, loadModules, maxKp, modulesDir, regimeOf, setIndices, spwRows, windowSpans } from '../common.mjs';
import { decodeSamples, executionFrame, jb2008Frame, spaceWeatherFrame } from '../hpop.mjs';
import { EST_TYPE, estimationCodec, decodeResult, positionObservation, seedStruct } from '../estimation-wire.mjs';
import { a00Series } from '../forecast.mjs';

const { values } = parseArgs({ options: {
  window: { type: 'string' }, calibration: { type: 'string' }, degree: { type: 'string' }, decays: { type: 'string' },
  shard: { type: 'string', default: '0/1' }, resume: { type: 'string' }, variants: { type: 'string', default: 'D0,D1,D2' }, modules: { type: 'string' },
  days: { type: 'string' }, objects: { type: 'string' },
} });
const spans = windowSpans(values.window);
const p = config.propagation;
const calibration = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', values.calibration, 'calibration.json'), 'utf8'));
if (calibration.window !== values.window) throw new Error(`calibration ${values.calibration} is for ${calibration.window}`);
const degree = Number(values.degree);
const decays = (values.decays ?? config.calibration.candidates.decayHours.map(String).join(',')).split(',').map((x) => (x === 'null' ? null : Number(x)));
const variants = values.variants.split(',');
const [shard, shards] = values.shard.split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `30-propagation-${values.window}-${shard}of${shards}`, configPath, modulesDir: modulesDir(values.modules), args: values, resume: values.resume });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const { root, estimationRoot, loaded } = await loadModules(run, ['analysis/estimation', 'propagator/hpop', 'data-source/eop-parser'], values);
const { 'analysis/estimation': estimation, 'propagator/hpop': hpop, 'data-source/eop-parser': parser } = loaded;
const kernelBytes = fs.readFileSync(path.join(root, config.inputs.kernel));
run.addInputs('kernel', { [config.inputs.kernel]: sha256(kernelBytes) });
const kernel = kernelFrame(kernelBytes);
const eop = await c04Records(parser, config.inputs.eopC04);
run.addInputs('eop', { [path.basename(config.inputs.eopC04)]: eop.sha256 });
run.addInputs('set', setIndices().sha256);
run.addInputs('gfz', { kp: gfzDays().sha256 });
run.addInputs('calibration', { [values.calibration]: JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', values.calibration, 'manifest.json'), 'utf8')).config.sha256 });
const codec = await estimationCodec(estimationRoot, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro'));
const products = new Products(config.inputs.reference, p.truthPrefixes);

const tolMs = p.truthToleranceSeconds * 1000;
const nearest = (norad, tMs) => {
  const s = products.firstAtOrAfter(norad, tMs - tolMs, 2 * tolMs);
  return s && Math.abs(s.ms - tMs) <= tolMs ? s : null;
};
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const stateM = (s) => [...s.r, ...s.v].map((x) => x * 1000);
const mjd = (ms) => Math.floor(ms / DAY_MS) + 40587;

// One fit and prediction: {b, iterations, wrms, errors: {h: m}} or {error}.
async function arc(target, t0s, obs, horizons, atmosphere, envInputs) {
  const reference = { epoch: iso(t0s.ms), state: stateM(t0s) };
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
    batch_options: { parameter_kinds: [1], parameter_values: [target.b], observation_covariances: obs.flatMap(() => cov), covariance_axes: 0,
      maximum_iterations: p.fit.maximumIterations, correction_tolerance: p.fit.correctionTolerance, sigma_edit_threshold: p.fit.sigmaEditThreshold },
  };
  const forces = { ...p.forces, atmosphere };
  const answers = [];
  let fit = null;
  for (let round = 0; ; ++round) {
    const response = await estimation.invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: codec.encode({ request, propagation_answers: answers }) }]);
    const out = decodeResult(response.outputs.find((o) => o.portId === 'result').payload);
    if (out.status !== 1) { fit = out.fit; break; }
    const q0 = out.queries[0];
    const samples = decodeSamples(await hpop.invoke('invoke', [
      executionFrame({ epoch: reference.epoch, state: q0.seed.state, samples: out.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))),
        forces, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: q0.parameter_values[0] }], fixed: { agom: target.agom }, stm: true, integrator: p.integrator }),
      kernel, ...envInputs,
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
    executionFrame({ epoch: reference.epoch, state: fit.estimate.slice(0, 6), samples: horizons.map((h) => iso(h.truth.ms)), forces,
      parameters: [], fixed: { b: fit.estimate[6], agom: target.agom }, stm: false, integrator: p.integrator }),
    kernel, ...envInputs,
  ]));
  const errors = {};
  horizons.forEach((h, k) => {
    const r = predicted[k].state, t = stateM(h.truth);
    errors[h.days] = Math.hypot(r[0] - t[0], r[1] - t[1], r[2] - t[2]);
  });
  return { b: fit.estimate[6], iterations: fit.iterations, wrms: fit.weightedRms, errors };
}

// Arcs: every (issue day, target) of this shard.
const days = issueDays(spans).filter((d) => !values.days || values.days.split(',').includes(isoDay(d)));
const targets = Object.entries(p.targets).filter(([norad]) => !values.objects || values.objects.split(',').includes(norad));
const jobs = [];
for (const t0 of days) for (const [norad, target] of targets) jobs.push({ t0, norad: Number(norad), target });
const mine = jobs.filter((_, i) => i % shards === shard);
const partialFile = path.join(run.dir, 'partial.jsonl');
const done = new Set(fs.existsSync(partialFile) ? fs.readFileSync(partialFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.issue}/${r.norad}/${r.variant}`; }) : []);
const keep = (row) => fs.appendFileSync(partialFile, `${JSON.stringify(row)}\n`);
const started = performance.now();
for (const [k, job] of mine.entries()) {
  const t0s = nearest(job.norad, job.t0);
  const base = { issue: isoDay(job.t0), norad: job.norad, name: job.target.name };
  if (!t0s) { if (!done.has(`${base.issue}/${base.norad}/none`)) keep({ ...base, variant: 'none', error: 'no precise orbit at t0' }); continue; }
  const obs = [];
  for (let t = job.t0 - p.fitSpanHours * 3600000; t < job.t0; t += p.observationEverySeconds * 1000) { const s = nearest(job.norad, t); if (s) obs.push(s); }
  obs.push(t0s);
  const horizons = p.horizonsDays.map((d) => ({ days: d, truth: nearest(job.norad, job.t0 + d * DAY_MS) })).filter((h) => h.truth);
  if (obs.length < 0.8 * (p.fitSpanHours * 3600 / p.observationEverySeconds) || !horizons.length) {
    if (!done.has(`${base.issue}/${base.norad}/none`)) keep({ ...base, variant: 'none', error: `coverage: ${obs.length} fit states, ${horizons.length} horizons` });
    continue;
  }
  const fromDay = isoDay(job.t0 - 8 * DAY_MS), toDay = isoDay(job.t0 + 9 * DAY_MS);
  const eopInput = eopFrame(eop.records, mjd(job.t0) - 3, mjd(job.t0) + 10);
  const kp = Object.fromEntries(horizons.map((h) => [h.days, maxKp(job.t0, job.t0 + h.days * DAY_MS)]));
  const setKey = [...job.target.calibrators].sort().join('+');
  const bins = calibration.sets[setKey]?.degrees[degree]?.filter((b) => b.coefficients) ?? [];
  const runs = [];
  if (variants.includes('D0')) runs.push(['D0', 'JB2008', [eopInput, jb2008Frame(jb2008Rows(fromDay, toDay))]]);
  if (variants.includes('D1')) runs.push(['D1', 'NRLMSISE00', [eopInput, spaceWeatherFrame(spwRows(fromDay, toDay))]]);
  if (variants.includes('D2')) for (const tau of decays) {
    const a00 = a00Series(bins, job.t0, tau, degree);
    runs.push([`D2-L${degree}-T${tau ?? 'inf'}`, 'JB2008', [eopInput, jb2008Frame(jb2008Rows(fromDay, toDay, a00))]]);
  }
  for (const [variant, atmosphere, env] of runs) {
    if (done.has(`${base.issue}/${base.norad}/${variant}`)) continue;
    let r;
    try { r = await arc(job.target, t0s, obs, horizons, atmosphere, env); } catch (error) { r = { error: String(error.message).slice(0, 300) }; }
    keep({ ...base, variant, fitStates: obs.length, kp, regimes: Object.fromEntries(Object.entries(kp).map(([h, v]) => [h, regimeOf(v)])), ...r });
  }
  log(`${k + 1}/${mine.length} ${base.issue} ${base.name}: ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
const rows = fs.readFileSync(partialFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
run.addInputs('reference', products.read);
run.write('propagation-rows.json', { window: values.window, calibration: values.calibration, degree, decays, rows });
run.finish({ arcs: rows.length, truthFiles: Object.keys(products.read).length });
log(`done: ${rows.length} rows`);
