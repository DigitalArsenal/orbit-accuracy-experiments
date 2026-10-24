// Amendment A9f: the Moon-centered SDN-GP on the LRO and Danuri windows of A8 (fits of 24 h and 72 h every 48 h, held-out days 1 to 3), rows per build of the module.
// Per window: the pack's states of the fit span and the three days after it as a $OEM block (CENTER_NAME MOON, the pack's axes declared, UTC), the fit span as the useable interval,
// `fit_sdngp` (no environment, no prior); the set is propagated by `propagate` on a grid block (CENTER_NAME MOON, ICRF axes, explicit EPOCHs: every fifth pack epoch of the held-out
// days; the template names MOON, the set's own center) and scored by score-pack.mjs (gp-error-model pair_statistics in the pack's Moon-centered axes). Rows: rows/sdngp/<build>/lunar.s<k>.jsonl.
//   SDNGP_SNAPSHOT=<build> node experiments/sdn-gp-starlink-ffm-match/lunar-windows.mjs [--pack lro-lunar,danuri-lunar] [--shard k/n] [--limit N]
import { frozen, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { readPack } from './lib/packs.mjs';
import { RULES, windowsOf } from './regime-windows.mjs';
import { packWindow } from './lib/pack-window.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';
import { iso } from './lib/windows.mjs';

const THIN = 5; // held-out epochs: every fifth pack epoch (5 min at 60 s)

/** One lunar window through the module (the shared pack-window path, every fifth held-out pack epoch as A9f registered it): the row as the sink stores it. */
export const lunarWindow = (b, loaded, pack, startMs, fitHours) => packWindow(b, loaded, pack, startMs, fitHours, { thin: THIN });

if (process.argv[1] === new URL(import.meta.url).pathname) {
  frozen();
  const b = await openBaselines(modulesRoot(), { sdngp: true });
  const sink = sdngpSink(b, 'lunar', args.shard);
  const limit = args.limit ? Number(args.limit) : Infinity;
  let n = 0;
  for (const pack of (args.pack ?? 'lro-lunar,danuri-lunar').split(',')) {
    const loaded = readPack(pack);
    for (const fitHours of RULES[pack].fitHours) {
      for (const { startMs } of windowsOf(loaded.object, RULES[pack], fitHours).starts) {
        if (!sink.mine() || sink.has(rowKey({ source: pack, id: pack, startUtc: iso(startMs), fitSeconds: fitHours * 3600 }))) continue;
        if (n >= limit) break;
        const row = await lunarWindow(b, loaded, pack, startMs, fitHours);
        sink.append(row);
        n += 1;
        if (n % 10 === 0) console.error(`lunar: ${n} windows`);
      }
    }
  }
  console.error(`lunar: ${n} new windows (build ${sink.build}, shard ${args.shard ?? '0/1'})`);
  await b.close();
  process.exit(0);
}
