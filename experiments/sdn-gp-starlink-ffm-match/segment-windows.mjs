// Amendment A9h: the cislunar and heliocentric truth packs through the SDN-GP module's methods only (fit_sdngp, then propagate on a grid that names the set's own center), rows per build.
// Packs and windows are those of A8 and A9 (regime-windows.mjs RULES): Artemis II and Artemis I (Earth-centered, 24 h fits, days 1 to 3), Artemis I and CAPSTONE (Moon-centered, 336 h fits, days 1 to 7),
// the heliocentric cruises of Psyche, Lucy and Juno (Sun-centered, 720 h fits, days 1 to 15) and Juno's Jupiter orbits (Jupiter-centered, 1,584 h fits, days 1 to 33: the module documents no
// Jupiter-centered path, so every window is attempted and the refusal is recorded by name). Every held-out pack state is requested, returned and scored (lib/pack-window.mjs).
// Rows: rows/sdngp/<build>/segment.s<k>.jsonl.
//   SDNGP_SNAPSHOT=<build> node experiments/sdn-gp-starlink-ffm-match/segment-windows.mjs [--pack capstone-nrho,psyche-cruise] [--shard k/n] [--limit N]
import { frozen, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { readPack } from './lib/packs.mjs';
import { RULES, windowsOf } from './regime-windows.mjs';
import { packWindow } from './lib/pack-window.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';
import { iso } from './lib/windows.mjs';

export const SEGMENT_PACKS = ['artemis2-cislunar', 'artemis1-cislunar', 'artemis1-lunar', 'capstone-nrho', 'psyche-cruise', 'lucy-cruise-rec', 'lucy-cruise-ref', 'juno-cruise', 'juno-jupiter'];

if (process.argv[1] === new URL(import.meta.url).pathname) {
  frozen();
  const b = await openBaselines(modulesRoot(), { sdngp: true });
  const sink = sdngpSink(b, 'segment', args.shard);
  const limit = args.limit ? Number(args.limit) : Infinity;
  let n = 0;
  for (const pack of (args.pack ?? SEGMENT_PACKS.join(',')).split(',')) {
    const loaded = readPack(pack);
    for (const fitHours of RULES[pack].fitHours) {
      for (const { startMs } of windowsOf(loaded.object, RULES[pack], fitHours).starts) {
        if (!sink.mine() || sink.has(rowKey({ source: pack, id: pack, startUtc: iso(startMs), fitSeconds: fitHours * 3600 }))) continue;
        if (n >= limit) break;
        sink.append(await packWindow(b, loaded, pack, startMs, fitHours, { thin: 1 }));
        n += 1;
        if (n % 10 === 0) console.error(`segment: ${n} windows`);
      }
    }
  }
  console.error(`segment: ${n} new windows (build ${sink.build}, shard ${args.shard ?? '0/1'})`);
  await b.close();
  process.exit(0);
}
