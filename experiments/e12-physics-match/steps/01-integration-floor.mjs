// Step 01 (development): the integration floor. The same initial state and
// coefficients propagated with different sample sets, with and without the
// STM, and at three tolerances; the differences bound what a fit can resolve.
import fs from 'node:fs';
import path from 'node:path';
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { loadEnvironment, isoOf } from '../environment.mjs';
import { DEFAULT } from '../hypothesis.mjs';
import { propagate } from '../fit.mjs';

const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'experiments/e12-physics-match/config.json'), 'utf8'));
const env = await loadEnvironment({ modulesDir: modulesRoot({ configured: config.inputs.modules, repoRoot }), config });
const epochMs = Date.parse(process.env.E12_EPOCH ?? '2026-08-01T00:00:00Z');
const segment = { cutoffMs: epochMs };
const state = [6778137, 0, 0, 0, 4790.0, 5995.0];
const all = Array.from({ length: 1440 }, (_, k) => isoOf(epochMs + (k + 1) * 60000));
const sub = all.filter((_, k) => k % 6 === 5);
const h = { ...DEFAULT, spaceWeather: 'OBSERVED', degree: 36, ...JSON.parse(process.env.E12_H ?? '{}') };
const c = { b: 0.012, agom: 0.008 };
const parameters = [{ kind: 'DRAG_AREA_OVER_MASS' }, { kind: 'SRP_AREA_OVER_MASS' }];
const diff = (a, b) => Math.max(...a.map((s, k) => Math.hypot(s.state[0] - b[k].state[0], s.state[1] - b[k].state[1], s.state[2] - b[k].state[2])));
let previous = null;
for (const [tolerance, maxStep] of (process.env.E12_TOLERANCES ? JSON.parse(process.env.E12_TOLERANCES) : [[1e-12, 120], [1e-13, 60]])) {
  const integrator = { tolerance, maxStep };
  const t = performance.now();
  const A = (await propagate(env, h, segment, { epoch: isoOf(epochMs), state }, c, all, { integrator })).filter((_, k) => k % 6 === 5);
  const B = await propagate(env, h, segment, { epoch: isoOf(epochMs), state }, c, sub, { integrator });
  const C = await propagate(env, h, segment, { epoch: isoOf(epochMs), state }, c, sub, { integrator, stm: true, parameters });
  console.log(`tol ${tolerance} max ${maxStep}: all-vs-sub ${diff(A, B).toExponential(2)} m, stm-vs-plain ${diff(B, C).toExponential(2)} m${previous ? `, vs previous tolerance ${diff(B, previous).toExponential(2)} m` : ''} (${((performance.now() - t) / 1000).toFixed(1)} s)`);
  previous = B;
}
await env.destroy();
