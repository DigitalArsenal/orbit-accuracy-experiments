// Dev smoke test of the E10 pipeline (no test seed is read): a short LEO
// scenario, its observations, and the first few observations through the
// UKF and the ESPF, with timings. Prints only.
import path from 'node:path';
import { config, loadModules, modulesDir, msOf, iso } from '../common.mjs';
import { estimationCodec } from '../estimation-codec.mjs';
import { environment } from '../hpop.mjs';
import { buildScenario, eopRowStream } from '../scenario.mjs';
import { runSequential } from '../filters.mjs';

const hours = Number(process.argv[2] ?? 2), count = Number(process.argv[3] ?? 6);
const root = modulesDir();
const { loaded } = await loadModules(null, ['propagator/hpop', 'foundation/frames', 'foundation/time', 'analysis/access', 'analysis/observation-simulator', 'analysis/estimation', 'data-source/eop-parser']);
const m = { hpop: loaded['propagator/hpop'], frames: loaded['foundation/frames'], time: loaded['foundation/time'], access: loaded['analysis/access'], simulator: loaded['analysis/observation-simulator'], est: loaded['analysis/estimation'], parser: loaded['data-source/eop-parser'] };
const epochMs = msOf(config.partB.devSeeds[0].epoch), endMs = epochMs + hours * 3600e3;
const t0 = Date.now();
const env = await environment({ parser: m.parser, kernelPath: path.join(root, config.inputs.kernel2026), eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs: epochMs, toMs: endMs });
const eopStream = await eopRowStream(m.parser, config.inputs.eopC04);
console.log('environment', Date.now() - t0, 'ms');
const model = config.forceModels['leo-jb2008'];
const arcsec = Math.PI / 180 / 3600;
const spec = {
  truth: { epochMs, endMs, stepS: config.partB.truthStepS, state: config.partB.state }, truthModel: model,
  stations: Object.values(config.stations), minElevationDeg: config.partB.minElevationDeg,
  sensor: { intervalS: config.partB.sensor.intervalS, noiseRad: config.partB.sensor.noiseArcsec * arcsec, lightTime: true }, seed: 1,
  target: { id: 'leo', norad: 99001, objectId: '2026-999A' },
};
const t1 = Date.now();
const sc = await buildScenario(m, env, eopStream, spec);
console.log('scenario', Date.now() - t1, 'ms; grid', sc.grid.length, 'windows', sc.windows.length, 'observations', sc.observations.length);
for (const w of sc.windows) console.log('  window (TT)', w.station, (((w.start - 2440587.5) * 86400000 - epochMs) / 60000).toFixed(1), 'min', ((w.end - w.start) * 1440).toFixed(1), 'min');
console.log('  observations per station', JSON.stringify(sc.observations.reduce((a, o) => ({ ...a, [o.station]: (a[o.station] ?? 0) + 1 }), {})));
const codec = await estimationCodec(root);
const ctx = { codec, est: m.est, hpop: m.hpop, env, filterModel: model };
const obs = sc.observations.slice(0, count);
const P0 = Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? (i < 21 ? 1e4 : 1e-2) : 0));
const initial = { ms: epochMs, state: config.partB.state.map((x, i) => x + [60, -80, 40, 0.05, -0.03, 0.08][i]), covariance: P0 };
for (const variant of [
  { name: 'UKF', estimator: 'UNSCENTED_KALMAN_FILTER', sigmaEdit: 3 },
  { name: 'ESPF-2026', estimator: 'ESPF_2026', espf: {} },
  { name: 'ESPF-2025', estimator: 'ESPF_2025', espf: {} },
  { name: 'SMF', estimator: 'ELLIPSOIDAL_SET_MEMBERSHIP', setMembership: {} },
  { name: 'EKF', estimator: 'EXTENDED_KALMAN_FILTER', sigmaEdit: 3 },
]) {
  const r = await runSequential(ctx, variant, initial, obs);
  const errs = r.epochs.map((e, k) => Math.hypot(...e.estimate.slice(0, 3).map((x, i) => x - sc.truthAtObs[k][i])));
  console.log(variant.name, 'seconds', r.seconds.toFixed(1), 'hpop', r.calls.hpop, 'per call ms', (r.seconds * 1000 / Math.max(1, r.calls.hpop)).toFixed(1), 'errors', errs.map((e) => e.toFixed(1)).join(' '), r.failure ? JSON.stringify(r.failure) : '');
}
