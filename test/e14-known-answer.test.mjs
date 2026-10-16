// E14's known-answer test (experiments/e14-covariance-realism PLAN.md section 9a): synthetic errors with a known
// covariance, run through the real modules (analysis/gp-error-model pair_statistics, fit_calibration,
// calibrate_covariance, ffm_coverage, dcp_covariance) and E14's statistics; the known answers are set here.
// Needs a modules checkout with gp-error-model 0.3.0 (SDN_MODULES_ROOT); skipped, visibly, without one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadModule } from '../harness/modules.mjs';
import { repoRoot } from '../harness/provenance.mjs';
import { rng } from '../harness/stats.mjs';
import { cell } from '../experiments/e14-covariance-realism/realism.mjs';
import { config } from '../experiments/e14-covariance-realism/windows.mjs';

const modulesDir = path.resolve(process.env.SDN_MODULES_ROOT ?? path.join(repoRoot, config.inputs.modules));
const gpDir = path.join(modulesDir, 'analysis/gp-error-model');
const manifest = fs.existsSync(path.join(gpDir, 'plugin-manifest.json')) ? JSON.parse(fs.readFileSync(path.join(gpDir, 'plugin-manifest.json'), 'utf8')) : null;
const ready = manifest && ['pair_statistics', 'fit_calibration', 'calibrate_covariance', 'dcp_covariance'].every((m) => manifest.methods.some((x) => x.methodId === m));
const skip = ready ? false : `no gp-error-model with E14's methods under ${modulesDir} (set SDN_MODULES_ROOT)`;
const json = (portId, value) => ({ portId, payload: Buffer.from(JSON.stringify(value)), typeRef: { schemaName: 'application/json' } });
const call = async (m, method, inputs) => JSON.parse(Buffer.from((await m.invoke(method, inputs)).outputs[0].payload).toString('utf8'));

// Normal draws (Box-Muller on SplitMix32) and correlated vectors through a Cholesky factor of a 3x3 covariance.
function normals(seed) {
  const u = rng(seed);
  let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    const a = Math.max(u(), 1e-300), b = u();
    const r = Math.sqrt(-2 * Math.log(a));
    spare = r * Math.sin(2 * Math.PI * b);
    return r * Math.cos(2 * Math.PI * b);
  };
}
const chol3 = (m) => {  // m full row-major 3x3
  const l00 = Math.sqrt(m[0]), l10 = m[3] / l00, l11 = Math.sqrt(m[4] - l10 * l10), l20 = m[6] / l00, l21 = (m[7] - l20 * l10) / l11, l22 = Math.sqrt(m[8] - l20 * l20 - l21 * l21);
  return [l00, 0, 0, l10, l11, 0, l20, l21, l22];
};
const draw3 = (L, g) => { const x = [g(), g(), g()]; return [L[0] * x[0], L[3] * x[0] + L[4] * x[1], L[6] * x[0] + L[7] * x[1] + L[8] * x[2]]; };
const lower3 = (m) => [m[0], m[3], m[4], m[6], m[7], m[8]];
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
// A correlated, anisotropic RTN position covariance (m^2): sigma 30, 400, 15 m; rho_RT -0.6, rho_RN 0.1, rho_TN -0.2.
const S = [30, 400, 15], RHO = [[1, -0.6, 0.1], [-0.6, 1, -0.2], [0.1, -0.2, 1]];
const C = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => RHO[i][j] * S[i] * S[j]));

test('known answer: realism statistics, factors, the applied model, process noise and the DCP recover what was put in', { skip }, async (ctx) => {
  const gp = await loadModule(modulesDir, 'analysis/gp-error-model');
  const g = normals(20261010), L = chol3(C), N = 20000;
  const r = [7000e3, 0, 0], v = [0, 7546, 0];  // RTN = x, y, z
  const errors = Array.from({ length: N }, () => draw3(L, g));
  // 1. d^2 from the module (pair_statistics), statistics here: C itself is realistic; 4C is pessimistic at 1/4.
  const stats = async (cov) => {
    const out = [];
    for (let i = 0; i < N; i += 5000) {
      const pairs = errors.slice(i, i + 5000).map((e, k) => ({ id: i + k, predicted: { position: r.map((x, j) => x + e[j]), velocity: v, covariance: lower3(cov), covarianceAxes: 'RTN' },
        truth: { position: r, velocity: v } }));
      out.push(...(await call(gp, 'pair_statistics', [json('pairs', { pairs })])).pairs);
    }
    return out.map((p, k) => ({ object: k % 50, d2: p.d2Predicted, z: p.zPredicted }));
  };
  const c1 = cell(await stats(C));
  assert.ok(rel(c1.meanD2Over3.estimate, 1) < 0.02, `mean d2/3 of C: ${c1.meanD2Over3.estimate}`);
  assert.ok(Math.abs(c1.coverage95.estimate - 0.95) < 0.01, `coverage of C: ${c1.coverage95.estimate}`);
  assert.equal(c1.decision, 'REALISTIC');
  const c4 = cell(await stats(C.map((x) => 4 * x)));
  assert.ok(rel(c4.meanD2Over3.estimate, 0.25) < 0.02, `mean d2/3 of 4C: ${c4.meanD2Over3.estimate}`);
  assert.equal(c4.decision, 'NOT REALISTIC (pessimistic)');
  ctx.diagnostic(`C: mean d2/3 ${c1.meanD2Over3.estimate.toFixed(4)}, coverage ${c1.coverage95.estimate.toFixed(4)}; 4C: mean d2/3 ${c4.meanD2Over3.estimate.toFixed(4)}`);

  // 2. Factors: errors from C, product covariance C / 9 (scalar 9) and diag-scaled C (axes 4, 0.25, 2.25 in variance).
  const samples = (cov) => errors.map((e, k) => ({ stratum: 's', object: k % 50, error: e, covariance: lower3(cov) }));
  const scalar = (await call(gp, 'fit_calibration', [json('samples', { samples: samples(C.map((x) => x / 9)) }), json('options', { method: 'scalar-mle' })])).strata[0];
  assert.ok(rel(scalar.factor, 9) < 0.02, `scalar factor ${scalar.factor}`);
  const coverage = (await call(gp, 'fit_calibration', [json('samples', { samples: samples(C.map((x) => x / 9)) }), json('options', { method: 'coverage' })])).strata[0];
  assert.ok(rel(coverage.factor, 9) < 0.03, `coverage factor ${coverage.factor}`);
  const s = [2, 0.5, 1.5];  // product sigma = true sigma / s  ->  variance factors s^2 = 4, 0.25, 2.25
  const scaled = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => C[3 * i + j] / (s[i] * s[j])));
  const axes = (await call(gp, 'fit_calibration', [json('samples', { samples: samples(scaled) }), json('options', { method: 'axes-mle' })])).strata[0];
  axes.axesFactors.forEach((f, k) => assert.ok(rel(f, s[k] ** 2) < 0.02, `axis ${k} factor ${f}`));
  ctx.diagnostic(`factors: scalar ${scalar.factor.toFixed(4)} (9), coverage ${coverage.factor.toFixed(4)} (9), axes ${axes.axesFactors.map((f) => f.toFixed(4)).join('/')} (4/0.25/2.25)`);

  // 3. The applied model: a factor model on the native covariance and the element-set model, RTN -> inertial -> RTN.
  const q = 30 * Math.PI / 180, ri = [7000e3 * Math.cos(q), 7000e3 * Math.sin(q), 0], vi = [-7546 * Math.sin(q), 7546 * Math.cos(q), 0];
  const model = { kind: 'e14-factors', version: 'kat', regimes: config.regimes, strata: [{ regime: '*', horizonDays: [0, 10], factor: 9, status: 'CALIBRATED' }] };
  const native = [C[0], C[3], C[4], C[6], C[7], C[8], ...Array(15).fill(0)];
  const applied = (await call(gp, 'calibrate_covariance', [json('model', model), json('objects', { objects: [{ id: 1, state: { position: ri, velocity: vi }, horizonDays: 1, covariance: native.map((x) => x / 9) }] })])).objects[0];
  assert.equal(applied.status, 'CALIBRATED');
  [0, 1, 2, 3, 4, 5].forEach((k) => assert.ok(Math.abs(applied.covarianceRtn[k] - native[k]) <= 1e-12 * Math.max(1, Math.abs(native[k])) * 1e3, `rtn ${k}`));
  // Rotate the inertial result back by the state's RTN axes: R = (cos q, sin q, 0), T = (-sin q, cos q, 0), N = z.
  const A = [[Math.cos(q), Math.sin(q), 0], [-Math.sin(q), Math.cos(q), 0], [0, 0, 1]];
  const I = applied.covarianceInertial;
  const back = (i, j) => [0, 1, 2].reduce((a, m) => a + A[i][m] * [0, 1, 2].reduce((b, n) => b + I[6 * m + n] * A[j][n], 0), 0);
  [[0, 0, C[0]], [1, 0, C[3]], [1, 1, C[4]], [2, 1, C[7]], [2, 2, C[8]]].forEach(([i, j, x]) => assert.ok(rel(back(i, j), x) < 1e-12, `back ${i}${j}: ${back(i, j)} vs ${x}`));

  // 4. Process noise: errors simulated as A + q U (A and U known, q = 2e-9 m^2/s^3 on T only); ffm_coverage's MLE.
  const qTrue = [0, 2e-9, 0];
  // Position blocks in ffm_coverage's order (xx, xy, xz, yy, yz, zz), m^2; U per unit q (m^2/s^3).
  const Ablk = [100, 0, 0, 400, 0, 64], U = [[1e9, 0, 0, 2e9, 0, 1e8], [5e9, 0, 0, 9e11, 0, 1e8], [1e8, 0, 0, 1e8, 0, 2e10]];
  const full = (p) => [p[0], p[1], p[2], p[1], p[3], p[4], p[2], p[4], p[5]];
  const total = Ablk.map((x, k) => x + qTrue[0] * U[0][k] + qTrue[1] * U[1][k] + qTrue[2] * U[2][k]);
  const Lq = chol3(full(total));
  const gq = normals(7);
  const arcs = [], predictions = [];
  for (let k = 0; k < 2000; ++k) {
    const e = draw3(Lq, gq), truth = [7000 + k * 1e-3, 0, 0, 0, 7.5, 0];
    arcs.push({ arc: k, norad: 1 + (k % 20), regimeIndex: 0, targets: [{ epoch: '2026-01-02T00:00:00.000', nominalDays: 1, ageDays: 1, truth }] });
    predictions.push({ arc: k, samples: [{ state: [truth[0] * 1e3 + e[0], e[1], e[2], 0, 7500, 0], a: Ablk, u: U }] });
  }
  const regimes = [{ id: 'R', altitudeKm: [0, 2000], eccentricity: [0, 0.25] }];
  const fit = await call(gp, 'ffm_coverage', [json('plan', { kind: 'ffm-arc-plan', version: 1, arcs }), json('predictions', { arcs: predictions }),
    json('model', { kind: 'ffm-covariance-model', version: 1, regimes: [{ regimeIndex: 0, regime: 'R', p0: Array(21).fill(0).map((_, i) => ([0, 2, 5, 9, 14, 20].includes(i) ? 1e-6 : 0)) }] }),
    json('options', { mode: 'fit', window: ['2026-01-01T00:00:00', '2026-01-03T00:00:00'], regimes })]);
  const ml = fit.regimes[0].processNoise.fit.maximumLikelihoodM2S3;
  assert.ok(rel(ml[1], qTrue[1]) < 0.10, `q_T ${ml[1]} vs ${qTrue[1]}`);
  assert.ok(ml[0] < 0.1 * qTrue[1] && ml[2] < 0.1 * qTrue[1], `q_R ${ml[0]}, q_N ${ml[2]} near 0`);
  ctx.diagnostic(`process noise MLE: q = ${ml.map((x) => x.toExponential(3)).join(', ')} (0, 2e-9, 0)`);

  // 5. The DCP: Hejduk's weights at three whole days, and the along-track variance of a double-integrated
  // piecewise-constant density error (quadrature here) against sigma_eff^2 g^2 from the module.
  const day = (d) => new Date(Date.UTC(2026, 0, 10 + d)).toISOString().replace('Z', '');
  const lead = [[0.04, 0.012, 0.004], [0.012, 0.09, 0.03], [0.004, 0.03, 0.16]];
  const segments = [1, 2, 3].map((k) => ({ from: day(k - 1), to: day(k), lead: k }));
  const kTrack = -1.5e-3;  // m per (unit ln-density error) per s^2: the along-track response u = kTrack * integral (t - s) delta(s) ds
  const t = 3 * 86400, gT = kTrack * t * t / 2;  // a constant delta: u = kTrack * delta * t^2 / 2
  const dcp = (await call(gp, 'dcp_covariance', [json('request', { leadCovariance: lead, start: day(0), segments, epochs: [{ epoch: day(3), sensitivity: [0, gT, 0, 0, 0, 0] }] })])).epochs[0];
  [5 / 9, 3 / 9, 1 / 9].forEach((w, k) => assert.ok(Math.abs(dcp.weights[k] - w) < 1e-12, `weight ${k}`));
  const Ll = chol3(lead.flat()), gd = normals(11);
  let sum2 = 0;
  const M = 20000, steps = 72;  // 72 quadrature steps of 1 h over three days
  for (let m = 0; m < M; ++m) {
    const delta = draw3(Ll, gd);
    let u = 0;
    for (let k = 0; k < steps; ++k) { const s0 = (k + 0.5) * 3600; u += kTrack * (t - s0) * delta[Math.floor(s0 / 86400)] * 3600; }
    sum2 += u * u;
  }
  const realised = sum2 / M, predicted = dcp.covariance[7];
  assert.ok(rel(realised, predicted) < 0.03, `along-track variance ${realised} vs ${predicted}`);
  ctx.diagnostic(`DCP: weights ${dcp.weights.map((w) => w.toFixed(6)).join('/')}, sigma_eff ${dcp.sigmaEff.toFixed(5)}, along-track variance realised/predicted ${(realised / predicted).toFixed(4)}`);
});

// noise_responses against propagator/ffm's own white-acceleration process noise (PLAN.md, changes before the freeze):
// one full-force Swarm A arc of 1.3 days, the module's unit responses from the run's STM against three FFM runs with
// unit noise on R, T and N. Needs the archive (an element set, the DE440s kernel, EOP, GFZ and SWPC files).
import { s2Context, propagate, bOf, KERNEL } from '../experiments/e14-covariance-realism/s2.mjs';
import { elementSets, DAY_MS } from '../experiments/e14-covariance-realism/common.mjs';
import { epochStates } from '../experiments/e2-catalog-covariance/product.mjs';
import { startRun } from '../harness/provenance.mjs';
import { configPath } from '../experiments/e14-covariance-realism/windows.mjs';
const archiveReady = fs.existsSync(KERNEL.path) && fs.existsSync(config.inputs.gfzKp) && fs.existsSync(config.inputs.gpHistory);
test('noise_responses agrees with propagator/ffm process noise on a full-force LEO arc', { skip: skip || (!archiveReady && 'archive inputs absent') }, async (ctx2) => {
  const run = startRun({ experiment: config.experiment, step: 'test-noise-responses', configPath, modulesDir: modulesDir, args: {} });
  const ctx = await s2Context(modulesDir, run);
  const forces = { ...config.s2.forces, degree: 20, order: 20 };
  const { byObject } = elementSets(config.inputs.gpHistory, '2025-11-01', '2025-11-05', [39452]);
  const set = byObject.get(39452).find((s) => s.ms >= Date.parse('2025-11-02T00:00:00Z'));
  const [seed] = await epochStates(ctx['epoch-state'], [set]);
  const t0 = Date.parse(`${seed.epoch}Z`), T = 1.3 * DAY_MS, n = Math.ceil(T / 600000 - 1e-9), h = T / n;
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
  const grid = Array.from({ length: n }, (_, j) => iso(t0 + Math.round((j + 1) * h)));
  const a = await propagate(ctx, { epoch: seed.epoch, state: seed.state, samples: grid, b: bOf(set), cutoffMs: set.createdMs, stm: true, covariance: Array(36).fill(0), forces });
  const resp = await call(ctx['gp-error-model'], 'noise_responses', [json('request', { start: seed.epoch, discretizationSeconds: 600, targets: [grid.at(-1)],
    samples: a.map((s, i) => ({ epoch: grid[i], state: s.state, stm: s.stm })) })]);
  const worst = [];
  for (const axis of [0, 1, 2]) {
    const q = [0, 0, 0];
    q[axis] = 1;
    const u = await propagate(ctx, { epoch: seed.epoch, state: seed.state, samples: [grid.at(-1)], b: bOf(set), cutoffMs: set.createdMs, covariance: Array(36).fill(0), noise: { q, intervalSeconds: 600 }, forces });
    const hp = u[0].covariance, mine = resp.targets[0].u[axis];
    const rel = Math.max(...[0, 7, 14].map((k) => Math.abs(mine[k] - hp[k]) / hp[k]));
    worst.push(rel);
    assert.ok(rel < 1e-2, `axis ${axis}: relative ${rel}`);
  }
  ctx2.diagnostic(`noise_responses vs FFM, position variances: largest relative difference R ${worst[0].toExponential(2)}, T ${worst[1].toExponential(2)}, N ${worst[2].toExponential(2)}`);
});
