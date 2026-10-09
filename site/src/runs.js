// The site's three live computations, shared by the main page and the paper
// models: a V1 seed through HPOP, an Orekit case re-run, and the VCM round
// trip. The modules compute; this file frames their records and takes norms
// of differences.
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { PRW_TYPE, decodeExecution, executionFrame } from '../../harness/prw.mjs';
import { convertIso } from '../../harness/time.mjs';
import { fetchBytes, fetchJson } from './modules.js';

export const HOUR = 3600e3;
export const isoMicro = (ms) => new Date(ms).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000');
export const errorM = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
export const frameOf = (portId, payload) => ({ portId, typeRef: PRW_TYPE, payload });
export const encodePrw = (root) => { const b = new flatbuffers.Builder(65536); P.PRW.finishSizePrefixedPRWBuffer(b, root.pack(b)); return b.asUint8Array().slice(); };
export const decodePrw = (bytes) => P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).unpack();
export const out = (response, port) => response.outputs.find((o) => o.portId === port).payload;
const truthCache = new Map();
export const truthFor = (object) => { if (!truthCache.has(object)) truthCache.set(object, fetchJson(`./data/truth/${object}.json`)); return truthCache.get(object); };

// A V1 seed propagated 72 h with configuration cfgName, every truth sample
// compared; then the six V1 horizons alone, compared with results/v1.
export async function runV1Seed({ hpop, time, seed, config, metrics, cfgName, onStatus = () => {} }) {
  const forces = config.configurations[cfgName];
  const truth = await truthFor(seed.object);
  const withKernel = (forces.thirdBodies ?? []).length > 0 || forces.srp;
  const extra = [];
  if (withKernel) extra.push(frameOf('kernel', await fetchBytes('./data/kernel/de440-2026.prw')));
  if (forces.eop) extra.push(frameOf('earth_orientation', await fetchBytes('./data/eop/eop-v1.prw')));
  const index = new Map(truth.epochsUnixMs.map((t, i) => [t, i]));
  const at = (i) => ({ position: truth.position.slice(3 * i, 3 * i + 3), velocity: truth.velocity.slice(3 * i, 3 * i + 3) });
  const s0 = at(index.get(seed.seedUnixMs));
  const sampleMs = truth.epochsUnixMs.filter((t) => t > seed.seedUnixMs && t <= seed.seedUnixMs + 72 * HOUR);
  const horizonMs = config.horizonsHours.map((h) => seed.seedUnixMs + h * HOUR);
  onStatus(`foundation/time: UTC → TDB for ${sampleMs.length + 1} epochs…`);
  const tdb = new Map();
  for (const ms of [seed.seedUnixMs, ...new Set([...sampleMs, ...horizonMs])]) tdb.set(ms, await convertIso(time, isoMicro(ms), 'UTC', 'TDB'));
  const request = (samples) => executionFrame({
    epoch: tdb.get(seed.seedUnixMs), timeScale: 'TDB', position: s0.position, velocity: s0.velocity,
    samples: samples.map((ms) => tdb.get(ms)), target: tdb.get(samples.at(-1)),
    integrator: config.integrator, forces: { ...forces, ...(forces.srp ? seed.params : {}) }, kernel: withKernel,
  });
  onStatus(`propagator/hpop: ${cfgName}, 72 h, ${sampleMs.length} samples…`);
  const dense = request(sampleMs);
  const started = performance.now();
  const response = await hpop.invoke('invoke', [dense, ...extra]);
  const seconds = (performance.now() - started) / 1000;
  const run = decodeExecution(response);
  const rows = run.samples.map((p, k) => {
    const truthAt = at(index.get(sampleMs[k]));
    return { ms: sampleMs[k], hours: (sampleMs[k] - seed.seedUnixMs) / HOUR, truth: truthAt.position, hpop: p.position, errorM: errorM(p.position, truthAt.position) };
  });
  const v1 = decodeExecution(await hpop.invoke('invoke', [request(horizonMs), ...extra]));
  const committed = metrics.results.filter((r) => r.object === seed.object && r.seedEpoch === seed.seedUtc && r.configuration === cfgName);
  const compared = v1.samples.map((p, k) => {
    const c = committed.find((r) => r.hours === config.horizonsHours[k]);
    return c ? Math.abs(errorM(p.position, at(index.get(horizonMs[k])).position) - c.errorM) : null;
  }).filter((d) => d !== null);
  return { forces, withKernel, s0, rows, run, dense, response, seconds, reproduced: compared.length ? Math.max(...compared) : null, compared: compared.length };
}

// One HPOP-against-Orekit case from its exact request: the largest position
// difference over the reference samples (m) and where it falls (h).
export async function runOrekitCase(hpop, c) {
  const inputs = await Promise.all(c.inputs.map(async (i) => frameOf(i.portId, await fetchBytes(`./${i.file}`))));
  const started = performance.now();
  const run = decodeExecution(await hpop.invoke('invoke', inputs));
  let worst = 0, worstAt = 0;
  const differences = run.samples.map((p, k) => {
    const [t, x, y, z] = c.samples[k + 1];
    const d = Math.hypot(p.position[0] * 1000 - x, p.position[1] * 1000 - y, p.position[2] * 1000 - z);
    if (d > worst) { worst = d; worstAt = t / 3600; }
    return [t / 3600, d];
  });
  return { worst, worstAt, differences, seconds: (performance.now() - started) / 1000 };
}

// RTN position sigmas (m) from a propagated covariance sample.
function rtnSigmas(sample) {
  const st = sample.STATE.STATE, n = sample.COVARIANCE.DIMENSION, v = sample.COVARIANCE.VALUES;
  const r = [st.POSITION.X, st.POSITION.Y, st.POSITION.Z], vel = [st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z];
  const u = r.map((x) => x / Math.hypot(...r));
  const h = [r[1] * vel[2] - r[2] * vel[1], r[2] * vel[0] - r[0] * vel[2], r[0] * vel[1] - r[1] * vel[0]];
  const w = h.map((x) => x / Math.hypot(...h));
  const t = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const sigma = (a) => Math.sqrt(a.reduce((acc, ai, i) => acc + a.reduce((s, aj, j) => s + ai * v[i * n + j] * aj, 0), 0));
  return [sigma(u), sigma(t), sigma(w)];
}

// The VCM round trip: analysis/vcm-adapter reads the message into a PRW
// request (under both readings of the B row), propagator/hpop propagates 24 h
// with the 7×7 covariance, and the adapter writes the result back.
export async function runVcm(adapter, hpop, text, { onStatus = () => {}, hours = 24 } = {}) {
  const json = (portId, value) => ({ portId, payload: new TextEncoder().encode(JSON.stringify(value)) });
  // The sample's epoch is 2023; the DE440 excerpt here covers 2026, so the
  // Sun and Moon come from HPOP's analytical ephemeris. The format leaves the
  // units of the B row unstated, so both readings run.
  const runs = {};
  for (const rows of ['fractional', 'absolute']) {
    onStatus(`analysis/vcm-adapter read, then propagator/hpop ${hours} h with the 7×7 covariance (B row ${rows === 'fractional' ? 'as a fraction' : 'as printed'})…`);
    const read = await adapter.invoke('read', [{ portId: 'message', payload: new TextEncoder().encode(text) }, json('options', { ephemerisSource: 'Analytical', arcSeconds: hours * 3600, parameterRows: rows })]);
    const report = JSON.parse(new TextDecoder().decode(out(read, 'report')));
    const prw = decodePrw(out(read, 'request'));
    const epochMs = Date.parse(`${report.epochUtc}Z`);
    prw.EXECUTION_REQUEST.SAMPLE_EPOCHS = Array.from({ length: hours }, (_, k) => Object.assign(new P.TIMInstantT(), {
      TIME_SYSTEM: P.timingStandard.UTC, EPOCH_FORMAT: P.timEpochRepresentation.ISO8601, ISO8601: isoMicro(epochMs + (k + 1) * HOUR),
    }));
    const request = encodePrw(prw);
    const run = await hpop.invoke('invoke', [frameOf('request', request), frameOf('earth_orientation', out(read, 'earth_orientation'))]);
    const result = decodePrw(out(run, 'response')).EXECUTION_RESULT;
    const sigmas = [{ hours: 0, s: report.recomputedUvwSigmasKm.slice(0, 3).map((x) => x * 1000) }, ...result.SAMPLES.map((sample, k) => ({ hours: k + 1, s: rtnSigmas(sample) }))];
    runs[rows] = { report, read, prw, request, run, result, sigmas };
  }
  const { report } = runs.fractional;
  const header = {
    satelliteNumber: 0, internationalDesignator: report.internationalDesignator, commonName: 'SDN ROUND TRIP', center: 'SDN',
    geopotential: report.geopotential, zonals: report.zonals, tesserals: report.tesserals, drag: report.drag,
    lunarSolar: report.lunarSolar ? 'ON' : 'OFF', solarRadiationPressure: report.solarRadiationPressure ? 'ON' : 'OFF',
    solidEarthTides: report.solidEarthTides ? 'ON' : 'OFF', inTrackThrust: report.inTrackThrust ? 'ON' : 'OFF',
    ballisticCoefficient: report.ballisticCoefficientM2Kg, f10: report.f10, averageF10: report.averageF10, averageAp: report.averageAp,
    taiMinusUtcS: report.taiMinusUtcS, ut1MinusUtcS: report.ut1MinusUtcS, ut1RateMsPerDay: report.ut1RateMsPerDay,
    polarX: report.polarMotionArcsec[0], polarY: report.polarMotionArcsec[1], weightedRms: report.weightedRms, parameterRows: 'fractional',
  };
  const written = await adapter.invoke('write', [frameOf('result', out(runs.fractional.run, 'response')), json('header', header)]);
  return { runs, written: new TextDecoder().decode(out(written, 'message')) };
}
