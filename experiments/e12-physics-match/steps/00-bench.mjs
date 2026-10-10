// Step 00: cost of one propagation and one fit under the default hypothesis
// (development only; no data). Decides the fit sizes of PLAN.md section 6.
import fs from 'node:fs';
import path from 'node:path';
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { loadEnvironment, isoOf } from '../environment.mjs';
import { DEFAULT } from '../hypothesis.mjs';
import { propagate, scoreHypothesis } from '../fit.mjs';

const configPath = path.join(repoRoot, 'experiments/e12-physics-match/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const modulesDir = modulesRoot({ configured: config.inputs.modules, repoRoot });
const env = await loadEnvironment({ modulesDir, config });
const epochMs = Date.parse('2026-08-01T00:00:00Z');
const segment = { cutoffMs: epochMs };
const state = [6778137, 0, 0, 0, 4790.0, 5995.0]; // ~400 km, 51.6 deg
const samples = Array.from({ length: 1440 }, (_, k) => isoOf(epochMs + (k + 1) * 60000));
const integrator = config.fit.integrator;
const time = async (name, fn) => { const t = performance.now(); const r = await fn(); console.log(`${name}: ${((performance.now() - t) / 1000).toFixed(2)} s`); return r; };
for (const degree of (process.env.E12_BENCH_PROPAGATE ? [20, 36, 70] : [])) {
  const h = { ...DEFAULT, spaceWeather: 'OBSERVED', degree };
  await time(`propagate 1 d LEO, degree ${degree}, 1440 samples`, () => propagate(env, h, segment, { epoch: isoOf(epochMs), state }, { b: 0.01, agom: 0.01 }, samples, { integrator }));
  await time(`  + STM (2 parameters)`, () => propagate(env, h, segment, { epoch: isoOf(epochMs), state }, { b: 0.01, agom: 0.01 }, samples.filter((_, k) => k % 6 === 5),
    { integrator, stm: true, parameters: [{ kind: 'DRAG_AREA_OVER_MASS' }, { kind: 'SRP_AREA_OVER_MASS' }] }));
}
const h = { ...DEFAULT, spaceWeather: 'OBSERVED', degree: 36 };
const truth = await propagate(env, h, segment, { epoch: isoOf(epochMs), state }, { b: 0.012, agom: 0.008 }, samples, { integrator });
const points = [{ epoch: isoOf(epochMs), ms: epochMs, position: state.slice(0, 3), velocity: state.slice(3) }, ...truth.map((s, k) => ({ epoch: samples[k], ms: Date.parse(samples[k]), position: s.state.slice(0, 3) }))];
const perturbed = { state: state.map((v, i) => v + (i < 3 ? 50 : 0.05)), b: 0.01, agom: 0.01 };
const r = await time('fit + score (degree 36, same hypothesis)', () => scoreHypothesis(env, h, segment, points, config.fit, { start: perturbed }));
console.log(JSON.stringify({ ...r, start: undefined }, null, 1));
await env.destroy();
