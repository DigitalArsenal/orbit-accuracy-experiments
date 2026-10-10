// Dev check (seed d1, B1 geometry, 12 h): BLS on noise-free simulated RA/Dec.
// A consistent simulator/estimator measurement chain recovers the truth; a
// systematic shows as a metre-level error with weighted RMS above zero.
// Writes results/e10/dev/model-check.json.
//   node steps/07-model-check.mjs [nolight]
const path = await import('node:path');
const { config, loadModules, modulesDir, msOf } = await import('../common.mjs');
const { environment } = await import('../hpop.mjs');
const { buildScenario, eopRowStream } = await import('../scenario.mjs');
const { runBatch } = await import('../filters.mjs');
const { estimationCodec } = await import('../estimation-codec.mjs');
const lightTime = process.argv[2] !== 'nolight';
const { loaded } = await loadModules(null, ['propagator/hpop', 'foundation/frames', 'foundation/time', 'analysis/access', 'analysis/observation-simulator', 'analysis/estimation', 'data-source/eop-parser']);
const m = { hpop: loaded['propagator/hpop'], frames: loaded['foundation/frames'], time: loaded['foundation/time'], access: loaded['analysis/access'], simulator: loaded['analysis/observation-simulator'], est: loaded['analysis/estimation'], parser: loaded['data-source/eop-parser'] };
const epochMs = msOf(config.partB.devSeeds[0].epoch), endMs = epochMs + 12 * 3600e3;
const env = await environment({ parser: m.parser, kernelPath: path.join(modulesDir(), config.inputs.kernel2026), eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs: epochMs, toMs: endMs });
const sc = await buildScenario(m, env, await eopRowStream(m.parser, config.inputs.eopC04), {
  truth: { epochMs, endMs, stepS: 20, state: config.partB.state }, truthModel: config.forceModels['leo-jb2008'],
  stations: Object.values(config.stations), minElevationDeg: 10, sensor: { intervalS: 60, noiseRad: 0, lightTime }, seed: 101, target: { id: 'target', norad: 99001, objectId: '2026-999A' },
});
for (const o of sc.observations) o.sigmas = [2 * Math.PI / 180 / 3600, 2 * Math.PI / 180 / 3600];
const codec = await estimationCodec(modulesDir());
const ctx = { codec, est: m.est, hpop: m.hpop, env, filterModel: config.forceModels['leo-jb2008'] };
const initial = { ms: epochMs, state: config.partB.state.map((x, i) => x + [50, -40, 30, 0.05, -0.04, 0.03][i]), covariance: Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? (i < 21 ? 1e6 : 1) : 0)) };
const r = await runBatch(ctx, initial, sc.observations, { sigmaEdit: 0, maximumIterations: 20, lightTime });
const errs = r.epochs.map((e, k) => Math.hypot(...e.estimate.slice(0, 3).map((x, i) => x - sc.truthAtObs[k][i])));
const fs = await import('node:fs');
const { repoRoot } = await import('../../../harness/provenance.mjs');
const out = path.join(repoRoot, 'results/e10/dev/model-check.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
const sorted = [...errs].sort((a, b) => a - b);
previous[lightTime ? 'lightTime' : 'noLightTime'] = { seed: 'd1', hours: 12, observations: sc.observations.length, converged: r.fit?.converged, weightedRms: r.fit?.weightedRms, medianErrorM: sorted[sorted.length >> 1], maxErrorM: sorted.at(-1) };
fs.writeFileSync(out, `${JSON.stringify(previous, null, 1)}\n`);
console.log('lightTime', lightTime, 'observations', sc.observations.length, 'converged', r.fit?.converged, 'wrms', r.fit?.weightedRms, 'error m: median', errs.sort((a, b) => a - b)[errs.length >> 1].toFixed(3), 'max', Math.max(...errs).toFixed(3));
