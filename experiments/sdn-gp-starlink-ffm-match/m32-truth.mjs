// Amendment A12b: the FFM-1 truths of the synthetic batches of M31 and M32 (independent of the build of the module under test).
//   node experiments/sdn-gp-starlink-ffm-match/m32-truth.mjs [--batch b11,b12]
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { loadEnvironment } from './lib/ffm.mjs';
import { openOrbits } from './lib/orbits.mjs';
import { BATCHES, batchSpec, generateBatchTruth } from './lib/m32-truth.mjs';

frozen();
const modules = modulesRoot();
const context = await loadEnvironment(modules, { archive: config.archive, store });
const orbits = await openOrbits(modules);
const dir = path.join(store, 'm31/truth');
const metas = fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).sort().map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')));
const capturedB = metas.map((m) => m.fit.bEffM2Kg), crAm = metas[0].fit.crAm;
const wanted = args.batch ? args.batch.split(',') : BATCHES.map((b) => b.id);
for (const batch of BATCHES.filter((b) => wanted.includes(b.id))) {
  const t = performance.now();
  const index = await generateBatchTruth(modules, context, orbits, batchSpec(batch, capturedB), crAm);
  console.error(`${batch.id}: ${index.objects.length} objects, ${((performance.now() - t) / 1000).toFixed(0)} s; parent node ${index.parent.raanDeg} deg, argument of latitude ${index.parent.argLatitudeDeg} deg`);
}
await orbits.destroy();
process.exit(0);
