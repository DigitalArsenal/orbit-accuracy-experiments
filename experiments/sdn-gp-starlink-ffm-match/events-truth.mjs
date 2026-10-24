// Amendment A10: the FFM-1 truths of M22 (impulses), M23 (finite burns) and M28 (decays), cached under <store>/events/, independent of any build of the module. FFM-1 only; no SDN-GP row is read.
//   node experiments/sdn-gp-starlink-ffm-match/events-truth.mjs [--kind m22,m23,m28] [--shard k/n] [--limit N]
import { config, frozen, store, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { loadEnvironment } from './lib/ffm.mjs';
import { satellites, satelliteTruth } from './lib/events.mjs';

frozen();
const modules = modulesRoot();
const context = await loadEnvironment(modules, { archive: config.archive, store });
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const limit = args.limit ? Number(args.limit) : Infinity;
for (const kind of (args.kind ?? 'm22,m23').split(',')) {
  if (kind === 'm28') { const { decayTruths } = await import('./lib/events-m28.mjs'); await decayTruths(modules, context, { shard: [k, n] }); continue; }
  let done = 0;
  for (const [i, meta] of satellites(kind).entries()) {
    if (i % n !== k || done >= limit) continue;
    const t0 = performance.now();
    const index = await satelliteTruth(modules, context, meta, kind);
    const ctl = index.cases.find((c) => c.kind === 'control');
    console.error(`${kind} ${meta.norad}: ${index.cases.length} cases, ${index.cases.filter((c) => c.error).length} failed, control differs from the registered truth by ${ctl?.maxDifferenceM?.toFixed(4)} m; ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    done += 1;
  }
}
process.exit(0);
