// Dev check (no test seed or outcome is read): visibility windows and
// observation counts of a scenario, with the time each stage takes.
//   node steps/06-visibility.mjs <scenario: partB | leo | geo> [hours]
import path from 'node:path';
import { config, loadModules, modulesDir, msOf, repoPath } from '../common.mjs';
import { environment } from '../hpop.mjs';
import { buildScenario, eopRowStream } from '../scenario.mjs';

const which = process.argv[2] ?? 'partB';
const root = modulesDir();
const { loaded } = await loadModules(null, ['propagator/hpop', 'foundation/frames', 'foundation/time', 'analysis/access', 'analysis/observation-simulator', 'data-source/eop-parser']);
const m = { hpop: loaded['propagator/hpop'], frames: loaded['foundation/frames'], time: loaded['foundation/time'], access: loaded['analysis/access'], simulator: loaded['analysis/observation-simulator'], parser: loaded['data-source/eop-parser'] };
const arcsec = Math.PI / 180 / 3600;
const scenarios = {
  partB: () => ({ epoch: config.partB.devSeeds[0].epoch, state: config.partB.state, model: config.forceModels['leo-jb2008'], kernel: path.join(root, config.inputs.kernel2026), cadence: config.partB.sensor.intervalS, hours: 24 }),
  leo: () => ({ epoch: config.partA.leo.epoch, state: config.partA.leo.state, model: config.forceModels['paper-leo'], kernel: repoPath(config.inputs.kernel2018), cadence: config.partA.leo.cadenceS, hours: 24 }),
  geo: () => ({ epoch: config.partA.geo.epoch, state: config.partA.geo.state, model: config.forceModels['paper-geo'], kernel: repoPath(config.inputs.kernel2018), cadence: config.partA.geo.cadenceS, hours: 3 }),
};
const s = scenarios[which]();
const hours = Number(process.argv[3] ?? s.hours);
const epochMs = msOf(s.epoch), endMs = epochMs + hours * 3600e3;
let t = Date.now();
const env = await environment({ parser: m.parser, kernelPath: s.kernel, eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs: epochMs, toMs: endMs });
const eopStream = await eopRowStream(m.parser, config.inputs.eopC04);
console.log(which, 'environment', Date.now() - t, 'ms');
t = Date.now();
const sc = await buildScenario(m, env, eopStream, {
  truth: { epochMs, endMs, stepS: config.partB.truthStepS, state: s.state }, truthModel: s.model,
  stations: Object.values(config.stations), minElevationDeg: config.partB.minElevationDeg,
  sensor: { intervalS: s.cadence, noiseRad: config.partB.sensor.noiseArcsec * arcsec, lightTime: true }, seed: 1,
  target: { id: 'target', norad: 99001, objectId: '2026-999A' },
});
console.log(which, 'scenario', Date.now() - t, 'ms; grid', sc.grid.length, 'windows', sc.windows.length, 'observations', sc.observations.length);
const per = {};
for (const w of sc.windows) (per[w.station] ??= []).push(((w.end - w.start) * 1440).toFixed(1));
for (const [k, v] of Object.entries(per)) console.log('  ', k, v.length, 'windows (min):', v.join(' '));
console.log('   observations per station', JSON.stringify(sc.observations.reduce((a, o) => ({ ...a, [o.station]: (a[o.station] ?? 0) + 1 }), {})));
const gaps = sc.observations.slice(1).map((o, k) => (o.ms - sc.observations[k].ms) / 60000).filter((g) => g > 5);
console.log('   gaps > 5 min (min):', gaps.map((g) => g.toFixed(0)).join(' '));
