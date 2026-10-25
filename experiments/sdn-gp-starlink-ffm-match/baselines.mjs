// Step 4 (precise orbits): SGP4 and SGP4-XP fitted to windows of GNSS, laser-ranged and ISS ephemerides, scored on
// held-out days 1-3 with the radial / in-track / cross-track split. One JSON line per window under
// <store>/rows/<source>.jsonl (statistics only). Re-running skips windows already present.
//   node experiments/sdn-gp-starlink-ffm-match/baselines.mjs [--source gnss,iss,slr-high,slr-low]
//   node experiments/sdn-gp-starlink-ffm-match/baselines.mjs --arm sdngp [--span default] [--shard k/n] --source ...   (amendment A9b: the SDN-AP fitter on the same windows; rows per build of the module)
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import * as sources from './lib/sources.mjs';
import { windowStarts, iso } from './lib/windows.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';

const ARM = args.arm ?? 'both';
const DEFAULT_SPAN = args.span === 'default'; // amendment A9f: only the end of the fit is declared (truth from 120 h before it); the module's span rule chooses; SDN-AP only
if (DEFAULT_SPAN && ARM !== 'sdngp') throw new Error('--span default needs --arm sdngp'); // 'both': SGP4 and SGP4-XP; 'sdngp': the SDN-AP fitter alone, rows under rows/sdngp/<build>/
const wanted = new Set((args.source ?? 'iss,iss-daily,gnss,slr-high,slr-low,mgex-geo,mgex-igso').split(','));
const P = config.precise;
const A4 = sources.MGEX_A4; // amendment A4: GFZ MGEX GEO and IGSO windows
const FIT = config.windows.fitHours * 3600;

const plans = {
  iss: () => [{ objects: sources.iss(), stride: P.iss.stride_s }],
  'iss-daily': () => [{ objects: sources.iss({ file: path.join(config.archive, 'operator-ephemerides/daily/2026-10-23/iss-oem.txt.gz') }), stride: 10 * 365 * 86400 }],
  gnss: () => [{ objects: sources.gnss(P.gnss), stride: P.gnss.strideSeconds }],
  'mgex-geo': () => [{ objects: sources.mgex({ klass: 'geo', ...A4 }), stride: A4.strideSeconds }],
  'mgex-igso': () => [{ objects: sources.mgex({ klass: 'igso', ...A4 }), stride: A4.strideSeconds }],
  'gnss-rapid': () => [{ objects: sources.gnssRapid(), stride: sources.GNSS_RAPID.strideSeconds }], // amendment A8b: GFZ rapid orbits, current truth
  'mgex-geo-rapid': () => [{ objects: sources.mgexRapid({ klass: 'geo' }), stride: sources.GNSS_RAPID.strideSeconds }],
  'mgex-igso-rapid': () => [{ objects: sources.mgexRapid({ klass: 'igso' }), stride: sources.GNSS_RAPID.strideSeconds }],
  'slr-high': () => P.slrHigh.targets.map((target) => ({ objects: sources.slrHigh({ target, weeks: P.slrHigh.weeks }), stride: P.slrHigh.strideSeconds })),
  'slr-low': () => P.slrLow.targets.map((target) => ({ objects: sources.slrLow({ target, arcs: P.slrLow.arcs }), stride: P.slrLow.strideSeconds })),
  // amendment A9b: the ILRS orbits fetched from CDDIS (slr-convert.mjs), the arcs and weeks of 2026-09 and 2026-10
  'slr-low-current': () => P.slrLow.targets.map((target) => ({ objects: sources.slrLowCurrent({ target }), stride: P.slrLow.strideSeconds })),
  'slr-high-current': () => P.slrHigh.targets.map((target) => ({ objects: sources.slrHighCurrent({ target }), stride: P.slrHigh.strideSeconds })),
};

frozen();
const modules = modulesRoot();
const b = await openBaselines(modules, { sdngp: ARM === 'sdngp' });
fs.mkdirSync(path.join(store, 'rows'), { recursive: true });
for (const source of wanted) {
  const sink = ARM === 'sdngp' ? sdngpSink(b, DEFAULT_SPAN ? `${source}+default` : source, args.shard) : null;
  const file = path.join(store, 'rows', `${source}.jsonl`);
  const done = new Set(!sink && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.id}|${r.startUtc}`; }) : []);
  let n = 0;
  for (const { objects, stride } of plans[source]()) {
    for (const object of objects) {
      for (const start of windowStarts(object, { fitSeconds: FIT, strideSeconds: stride, minLeadDays: 1 })) {
        if (sink) {
          if (!sink.mine() || sink.has(rowKey({ source: object.source + (DEFAULT_SPAN ? '+default' : ''), id: object.id, startUtc: iso(start), fitSeconds: FIT }))) continue;
        } else if (done.has(`${object.id}|${new Date(start).toISOString()}`)) continue;
        const row = await scoreWindow(b, object, start, { fitSeconds: FIT, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage, arms: ARM === 'sdngp' ? 'sdngp' : 'both', defaultSpan: DEFAULT_SPAN });
        if (!row) continue;
        if (sink) { const { xp, sgp4, ...rest } = row; sink.append(rest); } else fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
        n += 1;
        if (n % 10 === 0) console.error(`${source}: ${n} windows`);
      }
    }
  }
  console.error(`${source}: ${n} new windows${sink ? ` (build ${sink.build}, shard ${args.shard ?? '0/1'})` : ''}`);
}
await b.close();
process.exit(0);
