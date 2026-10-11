// One-day HPOP arcs between consecutive operator orbit-determination states: the drag of one
// satellite-day. State a is propagated to the epoch of state b by propagator/hpop (JB2008 drag with
// SET's indices, Cr*A/m locked), and the mismatch at b fixes Cd*A/m.
//
// `energyArc` (the method, PLAN.md section 4) reads the mismatch through the orbital energy alone:
// m = C(x_b) - C(x_b(B)) with C the Jacobi integral of the EGM2008 geopotential to degree 36 that
// analysis/density-calibration's `energy` computes (a module; no energy is computed here), and
// dB = m / S_E with S_E = (dC/dx . S) the sensitivity of the predicted energy to Cd*A/m (the module's
// gradient dotted with propagator/hpop's state-transition output S). The along-track phase of the arc
// does not enter, and an initial velocity error moves C of a and of its prediction alike.
//
// `sixDimensionalArc` fits the whole 6-D mismatch by weighted least squares over the two states' stated
// uncertainties,
//   y = x_b - x_b(B0) = S dB + Phi dx_a + e_b,  dx_a ~ N(0, C_a),  e_b ~ N(0, C_b),
//   dB = (S' W S)^-1 S' W y,  W = (C_b + Phi C_a Phi')^-1,
// and is kept as the evidence for that choice: its W is ill-conditioned (1.7e11 on Dove 0505) because an
// initial along-track velocity error and drag give nearly the same end state.
//
// Phi (6x6) and S (6x1) are propagator/hpop's state-transition output for the arc. The propagation,
// frames, time scales and energies are the modules'; this file frames requests and does least squares.
import fs from 'node:fs';
import path from 'node:path';
import { json, loadModule, sha256 } from '../../harness/modules.mjs';
import { kernelFrame } from '../../harness/prw.mjs';
import { c04Records, eopFrame, finalsRecords } from '../../harness/eop.mjs';
import { convertIso } from '../../harness/time.mjs';
import { rtnAxes, toGcrf } from './vendor/frames.mjs';
import { decodeSamples, executionFrame, jb2008Frame, jb2008Rows, readSetIndices, spaceWeatherFrame } from './vendor/full-force.mjs';
import { DAY, config, energyModulesDir, modulesDir } from './common.mjs';

const MU = 3.986004418e14;
const ENERGY_DEGREE = 36;
const noZ = (t) => t.replace(/Z$/, '');
const isoUs = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const mjdOf = (ms) => Math.floor(ms / DAY) + 40587;

// Force-model profiles. `full` is the E4 A6 / E11 set; the others drop terms and degrees (their cost and their
// effect on the fitted drag are measured against `full` on development arcs, PLAN.md). maxStepSeconds is the integration
// step cap, 1800 / degree: three steps per shortest wavelength of the degree-n field for a 5400 s LEO orbit (the OD lane's
// rule, with the orbit period fixed instead of read from the state, so that no orbit geometry is computed here).
export const PROFILES = {
  full: { forces: { degree: 70, order: 70, thirdBodies: [10, 301, 2, 4, 5], srp: true, solidTides: true, oceanTidesDegree: 30, earthRadiation: true, earthRadiationResolutionDeg: 15, relativity: 'IERS_2010' }, tolerance: 1e-13, maxStepSeconds: 25 },
  g36: { forces: { degree: 36, order: 36, thirdBodies: [10, 301, 2, 4, 5], srp: true, solidTides: true, oceanTidesDegree: 30, earthRadiation: true, earthRadiationResolutionDeg: 15, relativity: 'IERS_2010' }, tolerance: 1e-12, maxStepSeconds: 50 },
  g36lean: { forces: { degree: 36, order: 36, thirdBodies: [10, 301], srp: true, solidTides: true }, tolerance: 1e-11, maxStepSeconds: 50 },
  g24lean: { forces: { degree: 24, order: 24, thirdBodies: [10, 301], srp: true, solidTides: true }, tolerance: 1e-11, maxStepSeconds: 75 },
  g16lean: { forces: { degree: 16, order: 16, thirdBodies: [10, 301], srp: true, solidTides: true }, tolerance: 1e-10, maxStepSeconds: 110 },
  g12lean: { forces: { degree: 12, order: 12, thirdBodies: [10, 301], srp: true, solidTides: false }, tolerance: 1e-9, maxStepSeconds: 150 },
};

// ── small dense linear algebra (statistics only) ──
const zeros = (n, m) => Array.from({ length: n }, () => Array(m).fill(0));
const mul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
const T = (A) => A[0].map((_, j) => A.map((row) => row[j]));
function inverse(M) {
  const n = M.length, A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; ++c) {
    let p = c;
    for (let r = c + 1; r < n; ++r) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) throw new Error('singular matrix');
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; ++j) A[c][j] /= d;
    for (let r = 0; r < n; ++r) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; ++j) A[r][j] -= f * A[c][j]; }
  }
  return A.map((row) => row.slice(n));
}
const blockRot = (R) => { const B = zeros(6, 6); for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) { B[i][j] = R[3 * i + j]; B[3 + i][3 + j] = R[3 * i + j]; } return B; };

// atmosphere: 'JB2008' (the production arcs: SET's indices) or 'NRLMSISE00' (the common reference of PLAN.md Amendment S3: HPOP's NRLMSISE-00 drag on daily
// space weather). spaceWeather(fromMs, toMs) gives the SPW rows (CSSI layout, vendor/full-force.mjs spwRows or the released rows) of the days; it is
// required for NRLMSISE00 and unused for JB2008, whose arcs are unchanged.
export async function openArcEnv({ profile = 'full', atmosphere = 'JB2008', spaceWeather = null, eopFinals = null } = {}) {
  if (!['JB2008', 'NRLMSISE00'].includes(atmosphere)) throw new Error(`unknown atmosphere ${atmosphere}`);
  if (atmosphere === 'NRLMSISE00' && typeof spaceWeather !== 'function') throw new Error('atmosphere NRLMSISE00 needs spaceWeather(fromMs, toMs)');
  const root = modulesDir();
  const modules = {};
  for (const name of ['propagator/hpop', 'foundation/frames', 'foundation/time', 'data-source/eop-parser']) modules[name] = await loadModule(root, name);
  modules['analysis/density-calibration'] = await loadModule(energyModulesDir(), 'analysis/density-calibration');
  const kernelBytes = fs.readFileSync(config.inputs.kernel.path);
  const kernel = kernelFrame(kernelBytes);
  // Earth orientation: IERS C04 (the splits; it ends 2026-09-01) or, for the live period, a finals2000A file (`eopFinals`)
  const eop = eopFinals ? await finalsRecords(modules['data-source/eop-parser'], eopFinals) : await c04Records(modules['data-source/eop-parser'], config.inputs.eopC04);
  const set = readSetIndices(config.inputs.solfsmy, config.inputs.dtcfile);
  // the inputs by SHA-256, for a run manifest
  const inputs = { set: set.sha256, eop: { [path.basename(eopFinals ?? config.inputs.eopC04)]: eop.sha256 }, kernel: { [path.basename(config.inputs.kernel.path)]: sha256(kernelBytes) } };
  const prof = PROFILES[profile];
  if (!prof) throw new Error(`unknown profile ${profile}`);

  // A Planet sample {epochTt, state (J2000, m, m/s)} -> {ms (UTC), state GCRF}.
  async function toUtcGcrf(sample) {
    const utc = noZ(await convertIso(modules['foundation/time'], noZ(sample.epochTt), 'TT', 'UTC'));
    const ms = Date.parse(`${utc.slice(0, 19)}Z`) + Number(`0.${(utc.split('.')[1] ?? '0')}`) * 1000;
    const state = await toGcrf(modules['foundation/frames'], 'MEAN_EQUATOR_EQUINOX_J2000', isoUs(ms), sample.state);
    return { ms, state };
  }

  // JB2008 rows of the days [fromMs, toMs] as SET published them, with a00(t) [K] (when given) added to the hourly DTC values: the temperature
  // offset of the DCA form, entering the density exactly as JB2008's own geomagnetic term (analysis/density-calibration, 'Correction = DTC
  // offset'). Hour h of a day takes a00 at that hour's start.
  function rowsFor(fromMs, toMs, a00) {
    const rows = jb2008Rows(set, fromMs, toMs);
    if (a00) for (const row of rows) { const day0 = Date.parse(`${row.DATE}T00:00:00Z`); row.DTC_HOURLY_K = row.DTC_HOURLY_K.map((v, h) => v + a00(day0 + h * 3600e3)); }
    return rows;
  }

  // The drivers of the days [fromMs, toMs] as the atmosphere's PRW frame: JB2008's rows (with a00(t) [K] added to the hourly DTC when given) or NRLMSISE-00's space weather.
  function atmosphereFrame(fromMs, toMs, a00) {
    if (atmosphere === 'JB2008') return jb2008Frame(rowsFor(fromMs, toMs, a00));
    if (a00) throw new Error('a temperature offset is JB2008\'s; NRLMSISE-00 has none');
    return spaceWeatherFrame(spaceWeather(fromMs, toMs));
  }

  // Propagate x_a to t_b with Cd*A/m = b0 and Cr*A/m = cr: {state, phi (6x6), sens (6)}. a00: optional temperature offset function (rowsFor).
  async function propagate(a, tbMs, b0, cr, { a00 = null } = {}) {
    const forces = { ...prof.forces, drag: true, atmosphere };
    const driver = atmosphereFrame(a.ms - 8 * DAY, tbMs + 2 * DAY, a00);
    const response = await modules['propagator/hpop'].invoke('invoke', [
      executionFrame({ epoch: noZ(isoUs(a.ms)), state: a.state, samples: [noZ(isoUs(tbMs))], forces, coefficients: { b: b0, agom: cr, inTrack: 0 },
        parameters: [{ kind: 'DRAG_AREA_OVER_MASS' }], stm: true, integrator: { tolerance: prof.tolerance, maxStep: prof.maxStepSeconds } }),
      kernel, eopFrame(eop.records, mjdOf(a.ms) - 3, mjdOf(tbMs) + 3), driver,
    ]);
    const s = decodeSamples(response)[0], n = s.n;
    const phi = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => s.stm[i * n + j]));
    return { state: s.state, phi, sens: Array.from({ length: 6 }, (_, i) => s.stm[i * n + 6]), steps: s.steps };
  }

  // The states (GCRF, m and m/s) of x_a at the epochs `epochsMs` with Cd*A/m = B and Cr*A/m = cr, no state-transition output.
  async function trajectory(a, epochsMs, B, cr, { a00 = null } = {}) {
    const forces = { ...prof.forces, drag: true, atmosphere };
    const last = Math.max(...epochsMs);
    const driver = atmosphereFrame(a.ms - 8 * DAY, last + 2 * DAY, a00);
    const response = await modules['propagator/hpop'].invoke('invoke', [
      executionFrame({ epoch: noZ(isoUs(a.ms)), state: a.state, samples: epochsMs.map((t) => noZ(isoUs(t))), forces, coefficients: { b: B, agom: cr, inTrack: 0 },
        parameters: [], stm: false, integrator: { tolerance: prof.tolerance, maxStep: prof.maxStepSeconds } }),
      kernel, eopFrame(eop.records, mjdOf(a.ms) - 3, mjdOf(last) + 3), driver,
    ]);
    return decodeSamples(response).map((x) => x.state);
  }

  // The orbital energy (J/kg) and its GCRF gradient of states [{ms, state}] from analysis/density-calibration `energy`
  // (EGM2008 to `degree`, UT1 = UTC and no polar motion; the energy is a difference of two such values, so the Earth-orientation
  // error cancels). Gradient order: dC/dr (3), dC/dv (3).
  async function energyOf(list, degree = ENERGY_DEGREE) {
    const out = await modules['analysis/density-calibration'].invokeJson('energy', [json('request', {
      states: list.map((s) => ({ mjd: s.ms / DAY + 40587, r: s.state.slice(0, 3), v: s.state.slice(3, 6) })), degree, gm: MU, gradient: true })], 'result');
    if (out.refused.length) throw new Error(`analysis/density-calibration energy refused ${out.refused.length} states`);
    return list.map((_, i) => ({ energy: out.energy[i], gradient: out.gradient[i], geodetic: { latDeg: out.geodetic.latDeg[i], lonDeg: out.geodetic.lonDeg[i], altKm: out.geodetic.altKm[i] } }));
  }

  // GCRF covariance (6x6) of a state with the given RTN sigmas (position m [R,T,N], velocity mm/s [R,T,N]), scaled by `inflate`.
  async function stateCovariance(s, sigma, inflate) {
    const R = blockRot(await rtnAxes(modules['foundation/frames'], isoUs(s.ms), s.state));
    const C = zeros(6, 6);
    [0, 1, 2].forEach((i) => { C[i][i] = (inflate * sigma.posRtnM[i]) ** 2; C[3 + i][3 + i] = (inflate * sigma.velRtnMmS[i] * 1e-3) ** 2; });
    return { rtn: C, gcrf: mul(T(R), mul(C, R)), R };
  }
  const quad = (v, M) => v.reduce((s2, x, i) => s2 + x * M[i].reduce((q, c, k) => q + c * v[k], 0), 0);

  // The drag of one arc through the orbital energy alone (see the header): iterate B <- B + m / S_E, m = C(x_b) - C(x_b(B)), until the
  // change is below `tolerance` (relative); each iteration is one propagator/hpop call with the state-transition output and one `energy`
  // call. a, b: {ms, state GCRF} (UTC); b0: starting Cd*A/m; cr: locked Cr*A/m; sigma: {posRtnM [R,T,N], velRtnMmS [R,T,N]} of each state.
  // Returns the converged B with its stated 1-sigma (the two states' covariances through the energy), and the energy mismatch left (J/kg).
  async function energyArc(a, b, { b0, cr, sigma, inflate = 1, tolerance = 0.01, maxIterations = 5, a00 = null }) {
    const [Ca, Cb] = await Promise.all([stateCovariance(a, sigma, inflate), stateCovariance(b, sigma, inflate)]);
    const [obs] = await energyOf([b]);
    let B = b0, out = null, calls = 0;
    const t0 = performance.now();
    for (let it = 0; it < maxIterations; ++it) {
      const p = await propagate(a, b.ms, B, cr, { a00 });
      ++calls;
      const [pred] = await energyOf([{ ms: b.ms, state: p.state }]);
      const m = obs.energy - pred.energy;
      const SE = pred.gradient.reduce((s2, g, i) => s2 + g * p.sens[i], 0);
      // var(m) = dC_obs' C_b dC_obs + dC_pred' (Phi C_a Phi') dC_pred: the observed end state's error and the start state's carried through the arc
      const PhiCa = mul(mul(p.phi, Ca.gcrf), T(p.phi));
      const varM = quad(obs.gradient, Cb.gcrf) + quad(pred.gradient, PhiCa);
      const Bnew = B + m / SE;
      out = { B: Bnew, sigmaB: Math.sqrt(varM) / Math.abs(SE), energyMismatchJkg: m, energySensitivity: SE, B0: B, iterations: it + 1, hpopCalls: calls,
        seconds: (performance.now() - t0) / 1000, steps: p.steps, altitudeKm: obs.geodetic.altKm };
      if (!(Bnew > 0)) { out.nonPositive = true; break; }
      if (Math.abs(Bnew - B) / B < tolerance) break;
      B = Bnew;
    }
    return out;
  }

  // The 6-D least squares (header): returns B, its formal sigma, chi-square, the condition number of W's inverse (Cy) and the mismatch in RTN of b.
  async function sixDimensionalArc(a, b, { b0, cr, sigma, maxIterations = 3, inflate = 1 }) {
    const [Ca, Cb] = await Promise.all([stateCovariance(a, sigma, inflate), stateCovariance(b, sigma, inflate)]);
    const Ra = Ca.R, Rb = Cb.R, C = Ca.rtn;
    let B = b0, last = null, calls = 0;
    for (let it = 0; it < maxIterations; ++it) {
      const t0 = performance.now();
      const p = await propagate(a, b.ms, B, cr);
      ++calls;
      const y = b.state.map((v, i) => v - p.state[i]);                       // x_b - x_b(B)
      // everything in RTN of b: y' = Rb y, S' = Rb S, Phi' = Rb Phi Ra'
      const yr = Rb.map((row) => row.reduce((s, r, k) => s + r * y[k], 0));
      const Sr = Rb.map((row) => row.reduce((s, r, k) => s + r * p.sens[k], 0));
      const Phir = mul(mul(Rb, p.phi), T(Ra));
      const Cy = mul(mul(Phir, C), T(Phir)).map((row, i) => row.map((v, j) => v + C[i][j]));
      const W = inverse(Cy);
      const norm1 = (M) => Math.max(...M[0].map((_, j) => M.reduce((s, row) => s + Math.abs(row[j]), 0)));
      const SW = Sr.map((_, j) => Sr.reduce((s, sv, k) => s + sv * W[k][j], 0));            // S' W (row vector)
      const info = SW.reduce((s, v, k) => s + v * Sr[k], 0);
      const dB = SW.reduce((s, v, k) => s + v * yr[k], 0) / info;
      const resid = yr.map((v, i) => v - Sr[i] * dB);
      const chi2 = resid.reduce((s, r, i) => s + r * W[i].reduce((q, w, k) => q + w * resid[k], 0), 0);
      const Bnew = B + dB;
      last = { B: Bnew, sigmaB: Math.sqrt(1 / info), dB, chi2, dof: 5, B0: B, iterations: it + 1, hpopCalls: calls, seconds: (performance.now() - t0) / 1000,
        conditionCy: norm1(Cy) * norm1(W), mismatchRtnM: yr.slice(0, 3), mismatchVelRtnMmS: yr.slice(3).map((v) => v * 1e3), sensitivityTM: Sr[1], steps: p.steps };
      if (!(Bnew > 0)) break;
      if (Math.abs(dB) / B < 0.05) break;                                   // the linearisation is good to a few per cent of dB
      B = Bnew;
    }
    return last;
  }

  return { energyArc, sixDimensionalArc, energyOf, propagate, trajectory, toUtcGcrf, modules, profile, atmosphere, rowsFor, spaceWeather, inputs, destroy: async () => { for (const m of Object.values(modules)) await m.destroy(); } };
}
