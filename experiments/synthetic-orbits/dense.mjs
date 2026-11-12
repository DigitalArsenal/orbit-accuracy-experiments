// The dense re-fly (stack #547): for each case given, AP's record made as run.mjs makes it (the fit way, and the rung if one is given),
// then flown at 10 s spacing for 30 minutes either side of an hour (by default the hour of the case's D on the build flown) on run.mjs's
// worker instance, the one every case of this run goes through in the order given (pooled), twice, and on a fresh instance of the same
// build, twice. Reported for each run: the largest step between neighboring states, the largest second difference, and the largest
// distance of a state from the 8th-order interpolation through its four neighbors on each side (a state off its neighbors' curve);
// then whether the four runs agree bit for bit. No truth is compared; the truth (from the shared cache, or flown once) is read only to
// make the record. Every orbit is made up, and the truth is a model's flight, not any satellite's data.
//
//   node experiments/synthetic-orbits/dense.mjs --modules-commit <sha> --modules-root <modules checkout> --cases <id,id,...>
//     [--fit arc72] [--rung <name>] [--seed 498] [--hour <h>] [--half-min 30] [--step-s 10] [--theory ap|xp] [--out <file>] [--scratch]
//   <id>: a case of cases.mjs (seed --seed), or of the claim set (claim-<seed>-b<band>-<k>)
// Without --scratch this repository's working tree (experiments/synthetic-orbits, experiments/headline-loop) must be clean, since the
// result names its commit.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cases as makeCases, labelOf } from './cases.mjs';
import { draw } from './claim.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(fileURLToPath(import.meta.url)), RUN = path.join(HERE, 'run.mjs'), REPO = path.resolve(HERE, '../..');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function caseOf(id, seed) {
  const m = /^claim-(\d+)-b(\d+)-(\d+)$/.exec(id);
  if (m) return draw(Number(m[1]), Number(m[2]), Number(m[3]) + 1)[Number(m[3])];
  const c = makeCases(seed).cases.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id} (seed ${seed})`);
  return c;
}

const root = args['modules-root'], want = args['modules-commit'];
if (!root || !want || !args.cases) throw new Error('usage: dense.mjs --modules-commit <sha> --modules-root <modules checkout> --cases <id,id,...> [...]');
process.env.SDN_MODULES_ROOT ??= root;
const { usePackages } = await import('../headline-loop/lib/env.mjs');
usePackages();
const A = await import('../headline-loop/lib/arms.mjs');
const { FITS, RUNGS } = await import('./fits.mjs');
const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', 'experiments/synthetic-orbits', 'experiments/headline-loop'], { encoding: 'utf8' }).trim();
if (dirty && !args.scratch) throw new Error(`refused: this repository's working tree differs from its commit (the result names the commit):\n${dirty}`);
const harness = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() + (dirty ? '+scratch' : '');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28 });
const commit = git('rev-parse', '--verify', `${want}^{commit}`).toString().trim();
const wasm = git('show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`), version = JSON.parse(git('show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
const wasmSha = sha256(wasm), dir = path.join(A.STORE_ROOT, 'synthetic', wasmSha.slice(0, 12));
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'module.wasm');
if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
const fit = args.fit ?? 'arc72', rung = args.rung ?? null, seed = Number(args.seed ?? 498), theory = args.theory ?? 'ap';
if (fit !== 'arc72' && !FITS[fit]) throw new Error(`--fit ${fit}: not a way fits.mjs names`);
if (rung && !RUNGS[rung]) throw new Error(`--rung ${rung}: not a rung fits.mjs names`);
const truthStartH = Math.max(72, FITS[fit]?.truthStartH ?? 72);
const list = String(args.cases).split(',').map((id) => caseOf(id, seed));
const opts = { hourH: args.hour != null ? Number(args.hour) : null, halfMin: Number(args['half-min'] ?? 30), stepS: Number(args['step-s'] ?? 10), runs: 2, theory };
console.error(`dense: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; fit ${fit}${rung ? `, rung ${rung}` : ''}; ${list.length} cases, each at ${opts.stepS} s for ${opts.halfMin} min either side of ${opts.hourH ?? 'its D hour'}, on the pooled instance and a fresh one, twice each`);

const child = fork(RUN, ['--worker', '--wasm', file, '--fit', fit, '--truth-start-h', String(truthStartH), ...(rung ? ['--rung', rung] : [])], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
const results = [];
await new Promise((resolve, reject) => {
  let k = 0;
  const next = () => { if (k < list.length) child.send({ dense: { c: list[k++], ...opts } }); else child.send({ stop: true }); };
  child.on('message', (m) => {
    if (m.ready) return next();
    if (m.dense) { results.push(m.dense); next(); }
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
});

const f = (x) => (x == null ? '-' : x >= 1000 ? `${(x / 1000).toFixed(2)} km` : x >= 1 ? `${x.toFixed(1)} m` : `${(x * 1000).toFixed(3)} mm`);
for (const r of results) {
  const c = list.find((x) => x.id === r.id);
  console.log(`${r.id}${c?.name ? ` (${labelOf(c)})` : ''}: ${r.error ? `no record: ${r.error}` : `D ${f(r.D)} at ${r.atH} h (span ${r.spanH} h); flown ${r.from} to ${r.to} at ${r.stepS} s; four runs bit for bit: ${r.bitForBit ? 'yes' : `no (${r.agreeing.map((x) => (x ? 'same' : 'differs')).join(', ')})`}`}`);
  for (const x of r.runs ?? []) console.log(`  ${x.instance} ${x.run}: ${x.error ? `error ${x.error}` : `largest step ${f(x.largestStep.meters)} at ${x.largestStep.atH} h; largest second difference ${f(x.largestSecondDifference.meters)} at ${x.largestSecondDifference.atH} h; largest off its neighbors ${f(x.largestOffNeighbors.meters)} at ${x.largestOffNeighbors.atH} h`}`);
}
const out = args.out ?? path.join(dir, 'dense', `${fit}${rung ? `-rung-${rung}` : ''}-${theory}-${sha256(list.map((c) => c.id).join(',')).slice(0, 12)}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ measured: new Date().toISOString(), version, modulesCommit: commit, wasmSha256: wasmSha, harness, fit, rung, theory, truthStartH, seed, ...opts, order: list.map((c) => c.id),
  pooled: 'run.mjs\'s worker instance, through which every case of this run went in the order given', fresh: 'a new module instance of the same build for each run', results }, null, 1)}\n`);
console.error(`dense: ${out}`);
