// A conjunction assessed from fitted covariance. The batch fit's state and
// covariance (analysis/estimation) are carried by propagator/ffm to a close
// approach with a second object; analysis/conjunction-assessment finds the
// time of closest approach and the probability of collision from the two
// covariances. The second object is hypothetical: the fitted orbit turned
// about its radius by the crossing angle and lifted by the miss distance at
// the chosen instant, with the fitted covariance turned with it, so both
// objects are known as well as the fit knows the first.
import { formatMeters } from '../chart.js';
import { inputs, num, panel, table, tiles, note } from '../models/ui.js';
import { covarianceAxes, rtn, rtnCovariance, scene3d, v3 } from '../models/scene.js';
import { FIT_EPOCH, busiest, estimate, fitInputs, ffmRun, loadScenario, simulate } from './scenario.js';
import { S, cqrFrame, decodeCqr, encodeOem, gcrfSystem, isoMicro, out, t, utcMs } from './codec.js';
import * as flatbuffers from 'flatbuffers';

const TCA = '2026-08-02T08:00:00.000000';
const pos3 = (P) => [P[0], P[1], P[2], P[6], P[7], P[8], P[12], P[13], P[14]];

// Rotation by angle a about unit axis k (Rodrigues), row-major 3×3.
function rotation(k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? c : 0) + s * K[i][j] + (1 - c) * k[i] * k[j]));
}
const apply = (R, a) => R.map((row) => v3.dot(row, a));
// R P Rᵀ for a 6×6 covariance and a rotation acting on position and velocity alike.
function rotateCovariance(R, P) {
  const R6 = Array.from({ length: 36 }, (_, q) => { const i = Math.floor(q / 6), j = q % 6; return (i < 3) === (j < 3) ? R[i % 3][j % 3] : 0; });
  const mul = (A, B, bt) => Array.from({ length: 36 }, (_, q) => { const i = Math.floor(q / 6), j = q % 6; let z = 0; for (let m = 0; m < 6; m++) z += A[i * 6 + m] * (bt ? B[j * 6 + m] : B[m * 6 + j]); return z; });
  return mul(mul(R6, P), R6, true);
}

export default async function run(ctx) {
  const setup = panel(ctx.root, 'Encounter');
  const form = inputs(setup, [
    { id: 'miss', label: 'Miss distance at the chosen instant (m)', value: 25, min: 0, step: 1 },
    { id: 'angle', label: 'Crossing angle (degrees)', value: 40, min: 1, max: 179, step: 1 },
    { id: 'radius', label: 'Combined hard-body radius (m)', value: 10, min: 0.1, step: 0.5 },
  ], () => assess());
  const view = scene3d(ctx, { title: 'At closest approach', caption: '' });
  const result = panel(ctx.root, 'analysis/conjunction-assessment');

  let sc, primary, fitted;
  await ctx.run('analysis/observation-simulator, foundation/frames, propagator/ffm: the observations and the nominal', async () => {
    sc = await loadScenario(ctx);
    const sim = await simulate(ctx, sc);
    const od = await fitInputs(ctx, sc, sim, busiest(sc, sim));
    fitted = { od, fit: await estimate(ctx, od, 'BATCH_WEIGHTED_LEAST_SQUARES', { covarianceScale: 100 }) };
  });
  if (!fitted) return;
  const x = fitted.fit.estimate.state.map((v) => v / 1000), P = fitted.fit.estimate.covariance.map((v) => v / 1e6);
  const tca = utcMs(TCA);
  const window = Array.from({ length: 41 }, (_, k) => isoMicro(tca + (k - 20) * 60e3));
  await ctx.run('propagator/ffm: the fit and its covariance to the encounter', async () => {
    primary = await ffmRun(ctx, sc, { epoch: FIT_EPOCH, position: x.slice(0, 3), velocity: x.slice(3), samples: window, covariance: P });
  });
  if (!primary) return;

  async function assess() {
    const { miss, angle, radius } = form.values();
    await ctx.run('analysis/conjunction-assessment: assess_conjunction', async () => {
      // The hypothetical second object at the chosen instant.
      const at = primary[20];
      const up = v3.unit(at.position), R = rotation(up, (angle * Math.PI) / 180);
      const r2 = v3.add(at.position, v3.scale(up, miss / 1000)), v2 = apply(R, at.velocity), P2 = rotateCovariance(R, at.covariance);
      const before = window.filter((_, k) => k !== 20);
      const run2 = await ffmRun(ctx, sc, { epoch: window[20], position: r2, velocity: v2, samples: before, covariance: P2 });
      const second = [...run2.slice(0, 20), { epoch: window[20], position: r2, velocity: v2, covariance: P2 }, ...run2.slice(20)];
      const ephemeris = (name, samples) => S.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(encodeOem([{ objectId: name, name, states: samples.map((s) => ({ epoch: s.epoch, state: [...s.position, ...s.velocity] })),
        covariances: samples.map((s) => ({ epoch: s.epoch, matrix: s.covariance })) }], { interpolation: 'HERMITE', degree: 3 }))).unpack();
      const source = (name, samples) => t('CQRObjectSource', { OBJECT_ID: name, OBJECT_NAME: name, EPHEMERIS: ephemeris(name, samples), HARD_BODY_RADIUS_M: radius / 2, HAS_HARD_BODY_RADIUS_M: true });
      const controls = t('CQRScreeningControls', { START_EPOCH: t('TIMInstant', { TIME_SYSTEM: S.timingStandard.UTC, EPOCH_FORMAT: S.timEpochRepresentation.ISO8601, ISO8601: window[0] }),
        DURATION_SECONDS: 2400, THRESHOLD_M: 5000, COARSE_STEP_SECONDS: 60, COMBINED_RADIUS_M: radius, ALGORITHM: S.cqrProbabilityAlgorithm.FOSTER });
      const ca = await ctx.module('analysis/conjunction-assessment');
      const response = await ca.invoke('assess_conjunction', [cqrFrame('PAIR_REQUEST', t('CQRPairRequest', {
        PRIMARY: source(`${fitted.od.block.name} (fit)`, primary), SECONDARY: source('Hypothetical crossing object', second), CONTROLS: controls,
        PRIMARY_RADIUS_M: radius / 2, SECONDARY_RADIUS_M: radius / 2, EVALUATION_FRAME: gcrfSystem() }))]);
      const event = decodeCqr(out(response, 'result')).EVENT_RESULT;
      const p = event.PROBABILITY;
      const tcaMs = (event.TCA.JULIAN_DATE - 2440587.5) * 86400e3;
      tiles(result, [
        ['TCA (UTC)', new Date(tcaMs).toISOString().slice(11, 23)], ['Miss distance', formatMeters(event.MISS_DISTANCE_M)], ['Relative speed', `${num(event.RELATIVE_SPEED_M_S / 1000, 4)} km/s`],
        ['Probability (Foster)', num(p.PROBABILITY, 3)], ['Mahalanobis²', p.HAS_MAHALANOBIS_SQUARED ? num(p.MAHALANOBIS_SQUARED, 4) : '—'],
        ['Alfano maximum (spherical)', p.HAS_MAXIMUM_PROBABILITY ? num(p.MAXIMUM_PROBABILITY, 3) : '—'],
      ]);
      const sig = (v) => ['X', 'Y', 'Z'].map((k) => formatMeters(v[k]));
      table(result, ['', 'Radial', 'In-track', 'Cross-track'], [
        ['Relative position (primary RTN)', ...sig(event.RELATIVE_POSITION_RTN)],
        ['Relative velocity (m/s)', ...['X', 'Y', 'Z'].map((k) => num(Math.abs(event.RELATIVE_VELOCITY_RTN[k]) < 1e-6 ? 0 : event.RELATIVE_VELOCITY_RTN[k], 4))],
        ['Primary σ', ...sig(event.PRIMARY_SIGMA_RTN_M)], ['Secondary σ', ...sig(event.SECONDARY_SIGMA_RTN_M)],
      ], { existing: result.querySelector('table') ?? undefined });
      note(result, `The primary is the batch fit of ${fitted.od.block.name}, its covariance carried ${num((tcaMs - utcMs(FIT_EPOCH)) / 3600e3, 3)} h by FFM. `
        + 'Both covariances come with the ephemerides (SOURCE_EPHEMERIS); the module assumes the two errors independent and reports the covariance as uncalibrated, conditional on the fit’s noise model. '
        + 'The second object is hypothetical; only its geometry is chosen here.');

      // The encounter in the primary's radial, in-track and cross-track axes
      // at TCA (m, true scale): both objects, their 1σ covariances, the
      // combined one (their sum, independent errors), the hard body, the miss
      // vector and the relative velocity's direction.
      const near = (list) => list.reduce((a, b) => (Math.abs(utcMs(b.epoch) - tcaMs) < Math.abs(utcMs(a.epoch) - tcaMs) ? b : a));
      const a = near(primary), b = near(second);
      const basis = rtn(a.position, a.velocity);
      const inRtn = (P) => rtnCovariance(basis, pos3(P)).map((v) => v * 1e6);
      const Pa = inRtn(a.covariance), Pb = inRtn(b.covariance), Pc = Pa.map((v, i) => v + Pb[i]);
      const rel = ['X', 'Y', 'Z'].map((k) => event.RELATIVE_POSITION_RTN[k]);
      const vRel = v3.unit(['X', 'Y', 'Z'].map((k) => event.RELATIVE_VELOCITY_RTN[k]));
      const reach = Math.max(v3.norm(rel), ...covarianceAxes(Pc).map(v3.norm)) * 1.6;
      await view.draw((g) => {
        g.covariance([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], Pa, 1, { color: 'accent', alpha: 0.25, outline: true });
        g.covariance(rel, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], Pb, 1, { color: 'cyan', alpha: 0.22, outline: true });
        g.covariance([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], Pc, 1, { color: 'text', alpha: 0.06, outline: true, outlineAlpha: 0.45 });
        g.sphere([0, 0, 0], radius, { color: 'alert', alpha: 0.45 });
        g.line([v3.sub(rel, v3.scale(vRel, reach)), v3.add(rel, v3.scale(vRel, reach))], { color: 'cyan', width: 1.5, dash: true, frame: false });
        g.arrow([0, 0, 0], rel, { color: 'text', width: 8 });
        g.point([0, 0, 0], { color: 'accent', size: 8, label: 'Primary (fit)', labelColor: 'accent' });
        g.point(rel, { color: 'cyan', size: 8, label: `Secondary · miss ${formatMeters(event.MISS_DISTANCE_M)}`, labelColor: 'cyan' });
        g.view({ preset: '3d' });
      }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'equal',
        caption: `At TCA ${new Date(tcaMs).toISOString().slice(11, 23)} UTC, in the primary’s radial, in-track and cross-track axes (m, true scale): 1σ covariances, the combined 1σ (their sum), the ${formatMeters(radius)} hard body, the miss vector and the relative velocity’s direction`,
        legend: [['accent', 'Primary 1σ', 'solid'], ['cyan', 'Secondary 1σ', 'solid'], ['text', 'Combined 1σ (sum)', 'solid'], ['alert', 'Hard body', 'solid'], ['text', 'Miss vector'], ['cyan', 'Relative velocity', 'dash']] });
      return `Probability ${num(p.PROBABILITY, 3)} at a miss of ${formatMeters(event.MISS_DISTANCE_M)}, ${num(Math.sqrt(p.MAHALANOBIS_SQUARED ?? 0), 3)} combined σ in the encounter plane.`;
    });
  }
  await assess();
}
