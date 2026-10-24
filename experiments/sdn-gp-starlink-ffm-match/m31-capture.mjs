// Amendment A11c, M31: the first available files of the new batch seen in the capture cycle of 2026-10-24T05:01Z (provisional ids 799501701 to 799501727). Each current file is fetched into
// memory (one request at a time, the paced fetch of lib/spacex.mjs; never written), fitted by analysis/od and propagated by FFM-1 for 96 h exactly as the registered Starlinks are (truth.mjs
// `satellite()`), and only the derived trajectory and the fit are kept, under <store>/m31/. The fits of 6, 12 and 24 h and their scoring on newer files are a later step.
//   node experiments/sdn-gp-starlink-ffm-match/m31-capture.mjs [--only 799501701,799501702] [--workers k/n]
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, write, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { loadEnvironment } from './lib/ffm.mjs';
import { satellite } from './truth.mjs';

frozen();
const modules = modulesRoot();
const context = await loadEnvironment(modules, { archive: config.archive, store });
const baselines = await openBaselines(modules);
const rowsDir = path.join(store, 'm31/rows'), truthDir = path.join(store, 'm31/truth');
fs.mkdirSync(rowsDir, { recursive: true }); fs.mkdirSync(truthDir, { recursive: true });
const ids = args.only ? args.only.split(',').map(Number) : Array.from({ length: 27 }, (_, i) => 799501701 + i);
const [k, n] = (args.workers ?? '0/1').split('/').map(Number);
for (const [i, norad] of ids.entries()) {
  if (i % n !== k) continue;
  if (fs.existsSync(path.join(rowsDir, `${norad}.json`))) continue;
  const t0 = performance.now();
  try {
    await satellite({ norad, population: 'batch', stratum: null, tercile: null, replacements: [] }, context, baselines, modules, { rowsDir, truthDir });
    console.error(`${norad}: ok in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  } catch (error) {
    const reason = String(error.message).slice(0, 300);
    console.error(`${norad}: FAILED ${reason}`);
    write(path.join(rowsDir, `${norad}.failed.json`), { norad, reason, atUtc: new Date().toISOString() });
    if (/HTTP (403|429)/.test(reason)) break;
  }
}
await baselines.close();
process.exit(0);
