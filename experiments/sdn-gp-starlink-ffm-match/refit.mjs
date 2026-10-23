// Amendment A6 (second box): the Starlink fits that stopped at the registered 12-iteration limit, refitted with a higher cap on
// the same SpaceX file (checked by SHA-256), to measure how much the FFM truth moves. Local outputs under <store>/refit<cap>/.
//   node experiments/sdn-gp-starlink-ffm-match/refit.mjs [--cap 30] [--workers 8]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, frozen, store, args, read, write } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { loadEnvironment } from './lib/ffm.mjs';
import { satellite } from './truth.mjs';

const CAP = Number(args.cap ?? 30);
const PAIR = args.pair === 'true'; // seats whose file changed: the registered cap (12) and the higher cap, both on the file served now
const out = path.join(store, PAIR ? 'refitpair' : `refit${CAP}`);
const items = () => fs.readdirSync(path.join(store, 'truth')).filter((n) => /^\d+\.json$/.test(n)).map((n) => read(path.join(store, 'truth', n))).filter((m) => m.fit.convergence !== 'converged' && (!PAIR || m.population === 'seat')).sort((a, b) => a.norad - b.norad);

if (args.worker !== undefined) {
  frozen();
  const modules = modulesRoot();
  const context = await loadEnvironment(modules, { archive: config.archive, store });
  const baselines = await openBaselines(modules);
  const k = Number(args.worker), n = Number(args.of);
  for (const [i, meta] of items().entries()) {
    if (i % n !== k) continue;
    if (fs.existsSync(path.join(out, PAIR ? `cap${CAP}` : '', 'rows/starlink', `${meta.norad}.json`))) continue;
    const started = Date.now();
    const task = { norad: meta.norad, population: meta.population, stratum: meta.stratum, tercile: meta.tercile, replacements: [] };
    try {
      if (PAIR) {
        const low = path.join(out, 'cap12'), high = path.join(out, `cap${CAP}`);
        await satellite(task, context, baselines, modules, { fit: { ...config.fit, maxIterations: 12 }, rowsDir: path.join(low, 'rows/starlink'), truthDir: path.join(low, 'truth') });
        const sha = read(path.join(low, 'truth', `${meta.norad}.json`)).memeSha256;
        await satellite(task, context, baselines, modules, { fit: { ...config.fit, maxIterations: CAP }, rowsDir: path.join(high, 'rows/starlink'), truthDir: path.join(high, 'truth'), expectSha: sha });
      } else {
        await satellite(task, context, baselines, modules, { fit: { ...config.fit, maxIterations: CAP }, rowsDir: path.join(out, 'rows/starlink'), truthDir: path.join(out, 'truth'), expectSha: meta.memeSha256 });
      }
      console.error(`refit ${meta.norad} ok in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    } catch (error) {
      console.error(`refit ${meta.norad} skipped: ${String(error.message).slice(0, 160)}`);
      fs.mkdirSync(out, { recursive: true });
      fs.appendFileSync(path.join(out, 'skipped.jsonl'), `${JSON.stringify({ norad: meta.norad, reason: String(error.message).slice(0, 200) })}\n`);
    }
  }
  await baselines.close();
  process.exit(0);
}

frozen();
const workers = Number(args.workers ?? 8);
fs.mkdirSync(out, { recursive: true });
const children = Array.from({ length: workers }, (_, k) => new Promise((resolve) => {
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, '--cap', String(CAP), '--worker', String(k), '--of', String(workers), ...(PAIR ? ['--pair'] : [])], { stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('exit', resolve);
}));
console.error(`refitting ${items().length} fits with cap ${CAP} on ${workers} workers`);
await Promise.all(children);
