// The dense re-fly (stack #547): for each case given, the theory's record (AP's, or SGP4-XP's with --theory xp) made as run.mjs makes
// it, with the same fit way, rung, force mode and truth start, then flown at 10 s spacing for 30 minutes either side of an hour (by
// default the hour of the case's D on the build flown) on run.mjs's worker instance, the one every case of this run goes through in
// the order given (pooled), twice, and twice more, each time on a new instance of the same build (fresh). Reported for each run: the
// largest step between neighboring states, the largest second difference, and the largest distance of a state from the 8-point
// (degree-7) curve through its four neighbors on each side (a state off its neighbors' curve); then whether the four runs agree bit
// for bit (a run that fails is "failed", and runs that all fail with one error say so). No truth is compared; the truth (from the
// shared cache, or flown once) is read only to make the record. Every orbit is made up, and the truth is a model's flight, not any
// satellite's data.
// --perigees (stack #550): instead of an hour, the record's perigee scan (fits.mjs SCAN, as run.mjs --perigee-scan flies it): every
// perigee passage over the scored span at 1 s for 120 s either side, and both of its measures (each state within 80 s of the passage
// from the 8-point curve through the states 90 to 120 s from it; each state from the curve through its own neighbors); on the pooled
// instance and on a new one, compared bit for bit.
// The force mode (--no-drag, --no-drag --no-radiation) and the truth's start (--truth-start-h, at least the way's own) are run.mjs's.
//
//   node experiments/synthetic-orbits/dense.mjs --modules-commit <sha> --modules-root <modules checkout> --cases <id,id,...>
//     [--fit arc72] [--rung <name>] [--seed 498] [--hour <h> | --hours <h,h,...>] [--half-min 30] [--step-s 10] [--theory ap|xp] [--states]
//     [--perigees] [--no-drag [--no-radiation]] [--truth-start-h <h>] [--out <file>] [--scratch]
//   --states: the first run's states and each state's distance off its neighbors' curve (with --perigees, each passage's 1 s states),
//   in the result file
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
if (theory !== 'ap' && theory !== 'xp') throw new Error(`--theory ${theory}: ap or xp`);
if (FITS[fit]?.apOnly && (theory === 'xp' || rung === 'xp')) throw new Error(`--fit ${fit} holds AP's drag and radiation terms at the truth's values; it is not flown for SGP4-XP`);
const mode = args['no-radiation'] ? (args['no-drag'] ? 'no-drag-no-radiation' : null) : args['no-drag'] ? 'no-drag' : 'full';
if (!mode) throw new Error('--no-radiation goes with --no-drag');
const truthStartH = Math.max(Number(args['truth-start-h'] ?? 72), FITS[fit]?.truthStartH ?? 72);
// SGP4-XP's record on a way other than arc72 is made only with run.mjs's --xp
const withXp = theory === 'xp' && fit !== 'arc72';
const list = String(args.cases).split(',').map((id) => caseOf(id, seed));
const opts = { hourH: args.hour != null ? Number(args.hour) : null, halfMin: Number(args['half-min'] ?? 30), stepS: Number(args['step-s'] ?? 10), runs: 2, theory, keepStates: !!args.states, perigees: !!args.perigees };
// --hours h1,h2,...: an hour for each case, in the order of --cases (in place of --hour)
const hours = args.hours ? String(args.hours).split(',').map(Number) : null;
if (hours && hours.length !== list.length) throw new Error(`--hours: ${hours.length} hours for ${list.length} cases`);
console.error(`dense: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${theory === 'xp' ? 'SGP4-XP' : 'AP'}'s record, fit ${fit}${rung ? `, rung ${rung}` : ''}, ${mode}, truth from ${truthStartH} h before the cutoff; ${list.length} cases, ${opts.perigees ? 'each perigee passage over the scored span at 1 s for 120 s either side, on the pooled instance and a new one' : `each at ${opts.stepS} s for ${opts.halfMin} min either side of ${opts.hourH ?? 'its D hour'}, twice on the pooled instance and twice on new ones`}`);

const child = fork(RUN, ['--worker', '--wasm', file, '--ap-version', version, '--fit', fit, '--truth-start-h', String(truthStartH), ...(rung ? ['--rung', rung] : []), ...(withXp ? ['--xp'] : []),
  ...(mode === 'full' ? [] : mode === 'no-drag' ? ['--no-drag'] : ['--no-drag', '--no-radiation'])], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
const results = [];
await new Promise((resolve, reject) => {
  let k = 0;
  const next = () => { if (k < list.length) { const j = k++; child.send({ dense: { c: list[j], ...opts, ...(hours ? { hourH: hours[j] } : {}) } }); } else child.send({ stop: true }); };
  child.on('message', (m) => {
    if (m.ready) return next();
    if (m.dense) { results.push(m.dense); next(); }
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
});

const f = (x) => (x == null ? '-' : x >= 1000 ? `${(x / 1000).toFixed(2)} km` : x >= 1 ? `${x.toFixed(1)} m` : `${(x * 1000).toFixed(3)} mm`);
for (const r of results) {
  const c = list.find((x) => x.id === r.id);
  if (r.scan) {
    const s = r.scan;
    console.log(`${r.id}${c?.name ? ` (${labelOf(c)})` : ''}: D ${f(r.D)} at ${r.atH} h (span ${r.spanH} h); ${s.error ? `scan could not run: ${s.error}` : s.noPassage ? 'no perigee passage in the span' : `${s.passages} perigee passages${s.clipped ? ` (${s.clipped} clipped at the cutoff, no passage curve)` : ''}; off the record's own curve (not a distance to the truth): ${s.curve ? `the passage curve's largest ${f(s.curve.largestM)} at ${s.curve.atH} h (${s.curve.offsetS} s from the passage)` : 'no passage curve'}, the neighbors' curve's largest ${f(s.neighbors.largestM)} at ${s.neighbors.atH} h (${s.neighbors.offsetS} s from the passage); passages above 100 m ${s.over}; pooled and new instance bit for bit: ${s.bitForBit ? 'yes' : 'no'}`}`);
    if (!s.error && !s.noPassage) console.log(`  passage curve / neighbors' curve: ${s.perPassage.map((p) => `${p.atH.toFixed(2)} h ${f(p.curveM)} / ${f(p.neighborsM)}`).join(', ')}`);
    continue;
  }
  const agree = r.failedAlike ? `no: every run failed alike (${r.failedAlike})` : r.bitForBit ? 'yes' : `no (${r.agreeing.map((x) => (x === 'failed' ? 'failed' : x ? 'same' : 'differs')).join(', ')})`;
  console.log(`${r.id}${c?.name ? ` (${labelOf(c)})` : ''}: ${r.error ? `no record: ${r.error}` : `D ${f(r.D)} at ${r.atH} h (span ${r.spanH} h); flown ${r.from} to ${r.to} at ${r.stepS} s; four runs bit for bit: ${agree}`}`);
  for (const x of r.runs ?? []) console.log(`  ${x.instance} ${x.run}: ${x.error ? `error ${x.error}` : `largest step ${f(x.largestStep.meters)} at ${x.largestStep.atH} h; largest second difference ${f(x.largestSecondDifference.meters)} at ${x.largestSecondDifference.atH} h; largest off its neighbors ${f(x.largestOffNeighbors.meters)} at ${x.largestOffNeighbors.atH} h`}`);
}
const out = args.out ?? path.join(dir, 'dense', `${fit}${mode === 'full' ? '' : `-${mode}`}-ts${truthStartH}${rung ? `-rung-${rung}` : ''}-${theory}${opts.perigees ? '-perigees' : ''}-${sha256(list.map((c) => c.id).join(',')).slice(0, 12)}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ measured: new Date().toISOString(), version, modulesCommit: commit, wasmSha256: wasmSha, harness, fit, rung, theory, mode, truthStartH, seed, ...opts, order: list.map((c) => c.id),
  pooled: 'run.mjs\'s worker instance, through which every case of this run went in the order given', fresh: 'a new module instance of the same build for each run', results }, null, 1)}\n`);
console.error(`dense: ${out}`);
