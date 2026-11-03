// Runs the n0 simulation on the dev pairs (AR) and writes results/covariance-every-object/n0-rows.json.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs'; import { loadPairs, blockDays, simulate, chooseN0 } from './lib/n0sim.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), res = path.join(repo, 'results/covariance-every-object');
const den = JSON.parse(fs.readFileSync(path.join(res, 'denominators.json'))).strata, a = Object.fromEntries(Object.entries(den).map(([k, v]) => [k, v.a_RTN_m2]));
const p1 = JSON.parse(fs.readFileSync(process.argv[2])), adm = new Set(Object.entries(JSON.parse(fs.readFileSync(path.join(res, 'admission.json'))).cells).flatMap(([c, v]) => v.filter((x) => x.admittedBySD).map((x) => `${c}|${x.axis}`)));
const bl = [...new Set([...adm].map((x) => x.split('|').slice(0, 2).join('|')))].map((k) => p1.strata[k]?.blockDays).filter(Boolean).sort((x, y) => x - y);
const objs = loadPairs(path.join(OUT, 'dev-pairs'), TRUTH), L = bl[Math.floor(bl.length / 2)], seed = 20261109;
const rows = simulate(objs, a, { seed, histories: 2000, L, adm });
fs.writeFileSync(path.join(res, 'n0-rows.json'), JSON.stringify({ status: 'Part 1 block lengths (median over strata with an admitted bin) and SD-admitted bins; the S2.1 null condition is applied in the freeze', admittedAxisCells: adm.size, seed, blockDays: L, histories: 2000, rows, n0: chooseN0(rows) }, null, 1) + '\n');
console.log(L, rows, chooseN0(rows));
