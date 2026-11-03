// Runs the n0 simulation on the dev pairs (AR) and writes results/covariance-every-object/n0-rows.json.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs'; import { loadPairs, blockDays, simulate, chooseN0 } from './lib/n0sim.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), res = path.join(repo, 'results/covariance-every-object');
const den = JSON.parse(fs.readFileSync(path.join(res, 'denominators.json'))).strata, a = Object.fromEntries(Object.entries(den).map(([k, v]) => [k, v.a_RTN_m2]));
const objs = loadPairs(path.join(OUT, 'dev-pairs'), TRUTH), L = blockDays(objs, a), seed = 20261109;
const rows = simulate(objs, a, { seed, histories: 2000, L });
fs.writeFileSync(path.join(res, 'n0-rows.json'), JSON.stringify({ status: 'PROVISIONAL: block length and admitted bins await Part 1', seed, blockDays: L, histories: 2000, rows, n0: chooseN0(rows) }, null, 1) + '\n');
console.log(L, rows, chooseN0(rows));
