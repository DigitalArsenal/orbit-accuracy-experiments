// Synthetic ephemerides with known configurations (PLAN.md section 7): a seed
// fixes the regime, the orbit, the epoch, the generating hypothesis (every
// axis drawn from config.synthetic.prior), the coefficients, and how the file
// is published (its frame and time labels, which may misname the truth, and
// the digits it keeps). The truth is propagated by propagator/hpop (or, for
// the reference cases, by Orekit through reference/orekit-truth.mjs) and only
// the generator config and seed are kept: the states are rebuilt on demand.
import { rng } from '../../harness/stats.mjs';
import { AXES, WEATHER_MODELS, validate } from './hypothesis.mjs';
import { integratorFor, propagate } from './fit.mjs';
import { isoOf, DAY_MS } from './environment.mjs';

const GM = 3.986004415e14;
const pick = (random, weights) => {
  const entries = Object.entries(weights), total = entries.reduce((s, [, w]) => s + w, 0);
  let x = random() * total;
  for (const [k, w] of entries) { if ((x -= w) <= 0) return k; }
  return entries.at(-1)[0];
};
const parse = (v) => (v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v);

// Circular-ish orbit state (GCRF) from a, e, i, RAAN, argp, true anomaly.
function stateOf(a, e, i, raan, argp, nu) {
  const p = a * (1 - e * e), r = p / (1 + e * Math.cos(nu));
  const pq = [r * Math.cos(nu), r * Math.sin(nu), 0], vq = [-Math.sqrt(GM / p) * Math.sin(nu), Math.sqrt(GM / p) * (e + Math.cos(nu)), 0];
  const [cO, sO, ci, si, cw, sw] = [Math.cos(raan), Math.sin(raan), Math.cos(i), Math.sin(i), Math.cos(argp), Math.sin(argp)];
  const m = [[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci], [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci], [sw * si, cw * si]];
  const rot = (v) => m.map((row) => row[0] * v[0] + row[1] * v[1]);
  return [...rot(pq), ...rot(vq)];
}

// The case of a seed: {seed, regime, epoch, state, truth (hypothesis),
// coefficients, publish {frame, timeScale, quantumM}, spanDays, stepSeconds}.
export function syntheticCase(config, seed, regimeName = null) {
  const s = config.synthetic, random = rng(seed);
  const regime = regimeName ?? pick(random, s.regimeWeights);
  const R = s.regimes[regime];
  const u = (lo, hi) => lo + (hi - lo) * random();
  const truth = {};
  for (const [axis, weights] of Object.entries(s.prior)) truth[axis] = parse(pick(random, weights));
  truth.frame = 'EME2000'; truth.timeScale = 'UTC';
  if (!R.drag) { truth.atmosphere = 'NONE'; truth.spaceWeather = 'OBSERVED'; }
  if (truth.atmosphere === 'JB2008' && truth.spaceWeather === 'CONSTANT') truth.spaceWeather = 'OBSERVED';
  if (!WEATHER_MODELS.has(truth.atmosphere)) truth.spaceWeather = 'OBSERVED';
  if (truth.srp === 'NONE') truth.earthRadiation = false;
  if (truth.degree <= 2) truth.gravityModel = 'EGM2008';
  const publish = { frame: parse(pick(random, s.publish.frame)), timeScale: parse(pick(random, s.publish.timeScale)), quantumM: Number(pick(random, s.publish.quantumM)) };
  const a = 6378137 + 1000 * u(...R.altitudeKm);
  const state = stateOf(a, u(...R.eccentricity), u(...R.inclinationDeg) * Math.PI / 180, u(0, 2 * Math.PI), u(0, 2 * Math.PI), u(0, 2 * Math.PI));
  const from = Date.parse(s.epochs[0]), to = Date.parse(s.epochs[1]);
  const epochMs = Math.round((from + (to - from) * random()) / 60000) * 60000;
  const coefficients = { b: R.drag ? u(...R.bM2Kg) : 0, agom: u(...R.agomM2Kg) };
  // The file says EME2000/UTC; the truth's own frame and scale are publish.*.
  return { seed, regime, epoch: isoOf(epochMs), state, truth: validate({ ...truth, frame: publish.frame, timeScale: publish.timeScale }), coefficients, publish, spanDays: R.spanDays, stepSeconds: R.stepSeconds, label: { frame: 'EME2000', timeScale: 'UTC' } };
}

// The published points of a case: HPOP under the truth from the epoch state,
// written in the truth's frame and time scale, rounded to the file's digits.
// Returns a segment {id, label, points, cutoffMs, regime}.
export async function publishCase(env, c, settings) {
  const epochMs = Date.parse(c.epoch);
  const n = Math.round((c.spanDays * DAY_MS) / (c.stepSeconds * 1000));
  const samples = Array.from({ length: n }, (_, k) => isoOf(epochMs + (k + 1) * c.stepSeconds * 1000));
  const model = { ...c.truth, frame: 'GCRF', timeScale: 'UTC' };
  const radius = Math.hypot(...c.state.slice(0, 3));
  const out = await propagate(env, model, { cutoffMs: epochMs }, { epoch: c.epoch, state: c.state }, c.coefficients, samples, { integrator: integratorFor({ integrator: settings.truthIntegrator }, radius) });
  const gcrf = [{ epoch: c.epoch, position: c.state.slice(0, 3), velocity: c.state.slice(3) }, ...out.map((s, k) => ({ epoch: samples[k], position: s.state.slice(0, 3), velocity: s.state.slice(3) }))];
  const written = await env.fromGcrf(gcrf, c.truth.frame, c.truth.timeScale, c.truth.eop);
  const q = c.publish.quantumM;
  const round = (x, quantum) => Math.round(x / quantum) * quantum;
  return {
    id: `syn-${c.seed}`, regime: c.regime, label: c.label, cutoffMs: epochMs,
    points: written.map((p) => ({ epoch: p.epoch, position: p.position.map((x) => round(x, q)), velocity: p.velocity.map((x) => round(x, q / 1000)) })),
  };
}

export { AXES };
