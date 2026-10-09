// The orbit-determination scenario shared by the "03 // Orbit Determination"
// pages: GPS on 2026-08-02. The site build wrote the inputs (site/build-od.mjs);
// here the modules run on them. Moves records between modules; computes
// nothing physical.
//
//   analysis/observation-simulator  radar, optical and RF observations of the
//                                   IGS orbits from three IGS sites
//   analysis/association            those observations against the catalog
//   foundation/frames               the sites' GCRF positions at each observation
//   propagator/hpop                 the nominal trajectory and its STM; covariance
//   analysis/estimation             batch least squares, EKF and UKF
import {
  RDO, EOO, RFO, decodeExecution, decodeOem, decodeRecord, eopFrames, executionFrame, frame, isoMicro, jsonFrame, observationFrames, out, readJson,
  transformState, utcMs,
} from './codec.js';
import { decodeEstimation, estimationInputs } from './estimation.js';

export const DAY_MS = Date.parse('2026-08-02T00:00:00Z');
export const FIT_EPOCH = '2026-08-02T05:59:42.000000';
export const FORCES = { degree: 20, order: 20, thirdBodies: [10, 301], srp: true, massKg: 1500, areaM2: 20, cr: 1.3 };

export async function loadScenario(ctx) {
  const [scenario, eopRows, eopPrw, kernel, catalogBytes, truthBytes, dense, simulate] = await Promise.all([
    ctx.fetchJson('./data/od/scenario.json'), ctx.fetchJson('./data/od/eop.json'), ctx.fetchBytes('./data/od/eop.prw'), ctx.fetchBytes('./data/kernel/de440-2026.prw'),
    ctx.fetchBytes('./data/od/catalog.oem'), ctx.fetchBytes('./data/od/truth.oem'), ctx.fetchJson('./data/od/truth-dense.json'), ctx.fetchBytes('./data/od/simulate.acw'),
  ]);
  return { scenario, eop: eopFrames(eopRows), eopPrw, kernel, catalogBytes, catalog: decodeOem(catalogBytes), truth: decodeOem(truthBytes), dense, simulate };
}

// analysis/observation-simulator on the request the build wrote.
export async function simulate(ctx, sc) {
  const simulator = await ctx.module('analysis/observation-simulator');
  const response = await simulator.invoke('simulate_observations', [frame('request', 'ACW', sc.simulate)]);
  const frames = observationFrames(response);
  const records = frames.map((f) => {
    const code = f.typeRef.fileIdentifier.slice(1);
    const record = decodeRecord(code, f.payload);
    return { code, record, truth: record.UCT ? 0 : (record.SAT_NO ?? record.NORAD_CAT_ID ?? 0) };
  });
  return { frames, records };
}

export async function associate(ctx, sc, sim, options = {}) {
  const association = await ctx.module('analysis/association');
  const response = await association.invoke('associate_observations', [...sim.frames, frame('predictions', 'OEM', sc.catalogBytes), ...sc.eop,
    jsonFrame('options', { light_time: false, max_candidates: 2, ...options })]);
  return readJson(out(response, 'report'));
}

export function hpopRun(ctx, sc, request) {
  return ctx.module('propagator/hpop').then(async (hpop) => decodeExecution(await hpop.invoke('invoke',
    [executionFrame({ ...request, kernel: true, forces: request.forces ?? FORCES }), frame('earth_orientation', 'PRW', sc.eopPrw), frame('kernel', 'PRW', sc.kernel)]), request.samples));
}

// The satellite with the most simulated observations that the catalog holds.
export function busiest(sc, sim) {
  const count = new Map();
  for (const r of sim.records) if (r.truth && sc.catalog.some((b) => b.norad === r.truth)) count.set(r.truth, (count.get(r.truth) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
}

// Estimation inputs for one satellite: its observations with the sites'
// GCRF positions (foundation/frames), and the catalog state at FIT_EPOCH
// propagated by HPOP with its STM to every observation time.
export async function fitInputs(ctx, sc, sim, norad) {
  const frames = await ctx.module('foundation/frames');
  const site = Object.fromEntries(sc.scenario.sites.map((s) => [s.id, s]));
  const sensors = Object.fromEntries(sc.scenario.sensors.map((s) => [s.id, s]));
  const mine = sim.records.filter((r) => r.truth === norad);
  const observations = [];
  const stationCache = new Map();
  for (const { code, record } of mine) {
    const ms = utcMs(record.OB_TIME);
    const sensorId = code === 'EOO' ? record.SENSOR_ID : record.ID_SENSOR;
    const host = site[sensors[sensorId].host];
    const key = `${host.id}|${ms}`;
    if (!stationCache.has(key)) stationCache.set(key, await transformState(frames, sc.eop, { from: 'ITRF', to: 'GCRF', epoch: isoMicro(ms), position: host.itrfKm, velocity: [0, 0, 0] }));
    const st = stationCache.get(key);
    const station = { stationPosition: st.position.map((x) => x * 1000), stationVelocity: st.velocity.map((x) => x * 1000) };
    const add = (kind, values, sigmas, label) => observations.push({ ms, kind, values, sigmas, ...station, sensor: sensorId, code, label, id: record.ID });
    if (code === 'RDO') {
      if (record.RANGE_UNC > 0) add('RANGE', [record.RANGE * 1000], [record.RANGE_UNC * 1000], 'range');
      if (record.RANGE_RATE_UNC > 0) add('RANGE_RATE', [record.RANGE_RATE * 1000], [record.RANGE_RATE_UNC * 1000], 'range rate');
    } else if (code === 'EOO') {
      const d = Math.PI / 180;
      if (record.RA_UNC > 0) add('RIGHT_ASCENSION_DECLINATION', [record.RA * d, record.DECLINATION * d], [record.RA_UNC * d, record.DECLINATION_UNC * d], 'RA/Dec');
    } else if (record.RANGE_RATE_UNC > 0) add('RANGE_RATE', [record.RANGE_RATE * 1000], [record.RANGE_RATE_UNC * 1000], 'range rate');
  }
  observations.sort((a, b) => a.ms - b.ms);
  const block = sc.catalog.find((b) => b.norad === norad);
  const k = block.states.findIndex((s) => utcMs(s.epoch) === utcMs(FIT_EPOCH));
  const nominal = block.states[k].state, covariance = block.covariances[k].matrix;
  const samples = observations.map((o) => isoMicro(o.ms));
  const run = await hpopRun(ctx, sc, { epoch: FIT_EPOCH, position: nominal.slice(0, 3), velocity: nominal.slice(3), samples, stm: true });
  return {
    norad, block, nominal, covariance, observations,
    samples: run.map((s, i) => ({ ms: observations[i].ms, state: [...s.position, ...s.velocity].map((x) => x * 1000), stm: s.stm })),
  };
}

// run_estimation with one estimator. covarianceScale inflates the catalog
// covariance used as the a priori.
export async function estimate(ctx, inputs, estimator, { covarianceScale = 1, processNoise } = {}) {
  const est = await ctx.module('analysis/estimation');
  const si = (q) => (q < 3 ? 1e3 : 1e3);
  const P0 = inputs.covariance.map((v, q) => v * si(Math.floor(q / 6)) * si(q % 6) * covarianceScale);
  const response = await est.invoke('run_estimation', estimationInputs({
    estimator, epochMs: utcMs(FIT_EPOCH), dayMs: DAY_MS, state: inputs.nominal.map((x) => x * 1000), covariance: P0,
    observations: inputs.observations, samples: inputs.samples, processNoise,
  }));
  return decodeEstimation(response);
}

export { RDO, EOO, RFO };
