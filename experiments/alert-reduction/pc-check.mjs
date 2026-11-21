// The Pc path's end-to-end check: the conjunction-assessment module's Foster 2-D Pc against the closed form of a
// centered isotropic case, Pc = 1 - exp(-R^2 / (2 sigma^2)), and its speed per call.
//   MODULES=<modules checkout> SPACE_DATA_STANDARDS_ROOT=<SDS package root> node experiments/alert-reduction/pc-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openPc } from '../gp-covariance-strata/lib/capc.mjs';

const MODULES = process.env.MODULES;
if (!MODULES || !process.env.SPACE_DATA_STANDARDS_ROOT) throw new Error('set MODULES and SPACE_DATA_STANDARDS_ROOT');
const wasm = fs.readFileSync(path.join(MODULES, 'analysis/conjunction-assessment/dist/isomorphic/module.wasm'));
const sha = createHash('sha256').update(wasm).digest('hex');
const pc = await openPc(MODULES, sha);
let worst = 0;
for (const [sigma, R] of [[100, 10], [1000, 20], [50, 30], [10, 20]]) {
  const want = 1 - Math.exp(-(R * R) / (2 * sigma * sigma));
  const got = await pc.pc([sigma * sigma, 0, sigma * sigma], R, [0, 0]);
  const rel = Math.abs(got - want) / want;
  worst = Math.max(worst, rel);
  console.log(`sigma ${sigma} m, R ${R} m: module ${got.toExponential(6)}, closed form ${want.toExponential(6)}, relative ${rel.toExponential(2)}`);
}
const n = 20000, t0 = process.hrtime.bigint();
for (let i = 0; i < n; i++) await pc.pc([4e5 + i, 1e4, 9e4], 15, [300 + (i % 700), -200]);
const us = Number(process.hrtime.bigint() - t0) / 1e3 / n;
console.log(`module ${sha}; ${us.toFixed(1)} microseconds per call over ${n} calls`);
await pc.close();
if (worst > 1e-3) { console.error(`FAIL: worst relative difference ${worst}`); process.exit(1); }
console.log('PC CHECK PASS');
