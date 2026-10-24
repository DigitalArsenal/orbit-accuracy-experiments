// Amendment A9e: the fit span against COMSPOC (local scoring only). For every COMSPOC XP set of a laser-ranged object (6 LEO spheres, LARES-2) or a GNSS satellite
// that comspoc-precise.mjs scored, SGP4, SGP4-XP (default) or SDN-AP (--arm sdngp) are fitted to the precise-orbit truth over F = 24, 48, 72 and 120 h ending at the epoch of that
// set and scored on the three 24 h days after it. Only the set's epoch places the window; nothing of the set enters a fit. A window needs 90 % of its fit span in the truth
// (and, as scoreWindow requires, 90 % of each held-out day it reports). Rows: <store>/rows/span-slr.jsonl and span-gnss.jsonl (SGP4, XP), rows/sdngp/<build>/span-*.s<k>.jsonl (SDN-AP).
//   node experiments/sdn-gp-starlink-ffm-match/span-windows.mjs [--arm sdngp] [--shard k/n] [--source span-slr,span-gnss]
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { gnssRapidSeries, slrSeriesObject } from './lib/sources.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';
import { ms, iso, slice } from './lib/windows.mjs';

export const SPANS_H = [24, 48, 72, 120];
const ARM = args.arm ?? 'both';
const DEFAULT_SPAN = args.span === 'default'; // amendment A9f: the fit ends at the set's epoch, the truth is given from 120 h before it, the module's span rule chooses; SDN-AP only
if (DEFAULT_SPAN && ARM !== 'sdngp') throw new Error('--span default needs --arm sdngp');
const wanted = new Set((args.source ?? 'span-slr,span-gnss').split(','));

/** The scored COMSPOC precise-orbit rows (epoch, kind, class), as comspoc-precise.mjs recorded them. */
export function comspocSets() {
  const file = path.join(store, 'rows/comspoc-precise.jsonl');
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter((r) => r.days && Object.keys(r.days).length)
    .map((r) => ({ norad: r.norad, epochMs: ms(r.setEpochUtc), kind: r.kind, group: r.kind === 'gnss' ? `gnss-${r.gnssClass}` : (r.slrClass === 'meo' ? 'meo-slr' : 'leo-sphere') }));
}
export const spanObject = (set) => (set.kind === 'gnss' ? gnssRapidSeries({ norad: set.norad, source: 'span-gnss' }) : slrSeriesObject({ norad: set.norad, source: 'span-slr' }));

/** The fit span has 90 % of the states a regular series would hold (the median spacing of the truth). */
export function spanCovered(object, startMs, stopMs) {
  const gaps = object.t.slice(1, 400).map((t, i) => t - object.t[i]).sort((a, c) => a - c);
  const step = gaps[Math.floor(gaps.length / 2)];
  return slice(object, startMs, stopMs).length >= 0.9 * ((stopMs - startMs) / step);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  frozen();
  const b = await openBaselines(modulesRoot(), { sdngp: ARM === 'sdngp' });
  fs.mkdirSync(path.join(store, 'rows'), { recursive: true });
  for (const source of wanted) {
    const kind = source === 'span-gnss' ? 'gnss' : 'laser-ranged';
    const sink = ARM === 'sdngp' ? sdngpSink(b, DEFAULT_SPAN ? `${source}+default` : source, args.shard) : null;
    const file = path.join(store, 'rows', `${source}.jsonl`);
    const done = new Set(!sink && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.id}|${r.startUtc}|${r.fitSeconds}`; }) : []);
    let n = 0, skipped = 0;
    for (const set of comspocSets().filter((s) => s.kind === kind).sort((a, c) => a.norad - c.norad)) {
      const object = spanObject(set);
      if (!object) continue;
      for (const hours of DEFAULT_SPAN ? ['default'] : SPANS_H) {
        const geometry = hours === 'default' ? 24 : hours; // a default window ends at the epoch like the others; 24 h is the least the truth must supply
        const startMs = set.epochMs - geometry * 3600e3, fitSeconds = geometry * 3600;
        if (startMs < object.t[0] || !spanCovered(object, startMs, set.epochMs)) { skipped += 1; continue; }
        if (sink) { if (!sink.mine() || sink.has(rowKey({ source: object.source + (DEFAULT_SPAN ? '+default' : ''), id: object.id, startUtc: iso(startMs), fitSeconds }))) continue; } else if (done.has(`${object.id}|${iso(startMs)}|${fitSeconds}`)) continue;
        const row = await scoreWindow(b, object, startMs, { fitSeconds, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage, arms: ARM === 'sdngp' ? 'sdngp' : 'both', defaultSpan: DEFAULT_SPAN });
        if (!row) continue;
        const tagged = { ...row, group: set.group, norad: set.norad, spanHours: hours };
        if (sink) { const { xp, sgp4, ...rest } = tagged; sink.append(rest); } else fs.appendFileSync(file, `${JSON.stringify(tagged)}\n`);
        n += 1;
      }
    }
    console.error(`${source}: ${n} new windows, ${skipped} spans without truth${sink ? ` (build ${sink.build}, shard ${args.shard ?? '0/1'})` : ''}`);
  }
  await b.close();
  process.exit(0);
}
