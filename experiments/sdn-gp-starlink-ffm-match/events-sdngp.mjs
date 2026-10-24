// Amendment A10: the SDN-AP module's maneuver, detection and reentry methods against the FFM-1 truths of events-truth.mjs, on ONE build (SDNGP_SNAPSHOT), rows per build.
//   m22  the impulse map: the G1 fit of a registered Starlink truth (first 24 h), `maneuver` with an impulse at the fit end, days 1 to 3 against FFM-1 with the same impulse
//   m23  finite burns of 1 to 60 min: arm A the module's own finite-burn map (sinc), arm B a centroid impulse (no loss)
//   m28  the hand-off: synthetic decays, SDN-AP fitted at nodes of the decay, `reentry` (lib/events-m28.mjs)
//   m24  the ISS OEM captures through `detect_maneuvers` (lib/events-m24.mjs)
//   node experiments/sdn-gp-starlink-ffm-match/events-sdngp.mjs --source m22 [--shard k/n] [--limit N]
import fs from 'node:fs';
import { frozen, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { sdngpSink } from './lib/sdngp-rows.mjs';
import { satellites, truthPaths } from './lib/events.mjs';
import { scoreSatellite } from './lib/events-score.mjs';

frozen();
const source = args.source;
if (!['m22', 'm23', 'm28', 'm24', 'm24c', 'm24a', 'm29', 'm30', 'm24p'].includes(source)) throw new Error('--source m22|m23|m28|m24|m24c|m24a|m29|m30|m24p');
const b = await openBaselines(modulesRoot(), { sdngp: true });
const sink = sdngpSink(b, source, args.shard);
const limit = args.limit ? Number(args.limit) : Infinity;

if (source === 'm22' || source === 'm23') {
  let done = 0;
  for (const meta of satellites(source)) {
    if (!sink.mine()) continue;
    if (done >= limit) break;
    if (!fs.existsSync(truthPaths(source, meta.norad).json)) { console.error(`${source} ${meta.norad}: no truth file yet`); continue; }
    const t0 = performance.now();
    await scoreSatellite({ b, sink, kind: source, meta });
    done += 1;
    console.error(`${source} ${meta.norad}: done in ${((performance.now() - t0) / 1000).toFixed(0)} s (${done} satellites, build ${sink.build})`);
  }
} else if (source === 'm28') {
  await (await import('./lib/events-m28.mjs')).scoreCells({ b, sink, shard: args.shard, limit });
} else if (source === 'm24p') {
  await (await import('./lib/events-plant.mjs')).scorePlanted({ b, sink });
} else if (source === 'm30') {
  await (await import('./lib/events-m30.mjs')).scoreLowering({ b, sink });
} else if (source === 'm29') {
  await (await import('./lib/events-m29.mjs')).scoreReentries({ b, sink });
} else if (source === 'm24a') {
  await (await import('./lib/events-iss.mjs')).scoreArchive({ b, sink });
} else if (source === 'm24c') {
  await (await import('./lib/events-m24.mjs')).scoreControl({ b, sink });
} else {
  await (await import('./lib/events-m24.mjs')).scoreIss({ b, sink });
}
await b.close();
process.exit(0);
