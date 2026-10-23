// Step 4 (precise orbits): SGP4 and SGP4-XP fitted to windows of GNSS, laser-ranged and ISS ephemerides, scored on
// held-out days 1-3 with the radial / in-track / cross-track split. One JSON line per window under
// <store>/rows/<source>.jsonl (statistics only). Re-running skips windows already present.
//   node experiments/sdn-gp-starlink-ffm-match/baselines.mjs [--source gnss,iss,slr-high,slr-low]
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import * as sources from './lib/sources.mjs';
import { windowStarts } from './lib/windows.mjs';

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
  'slr-high': () => P.slrHigh.targets.map((target) => ({ objects: sources.slrHigh({ target, weeks: P.slrHigh.weeks }), stride: P.slrHigh.strideSeconds })),
  'slr-low': () => P.slrLow.targets.map((target) => ({ objects: sources.slrLow({ target, arcs: P.slrLow.arcs }), stride: P.slrLow.strideSeconds })),
};

frozen();
const modules = modulesRoot();
const b = await openBaselines(modules);
fs.mkdirSync(path.join(store, 'rows'), { recursive: true });
for (const source of wanted) {
  const file = path.join(store, 'rows', `${source}.jsonl`);
  const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.id}|${r.startUtc}`; }) : []);
  let n = 0;
  for (const { objects, stride } of plans[source]()) {
    for (const object of objects) {
      for (const start of windowStarts(object, { fitSeconds: FIT, strideSeconds: stride, minLeadDays: 1 })) {
        if (done.has(`${object.id}|${new Date(start).toISOString()}`)) continue;
        const row = await scoreWindow(b, object, start, { fitSeconds: FIT, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage });
        if (!row) continue;
        fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
        n += 1;
        if (n % 10 === 0) console.error(`${source}: ${n} windows`);
      }
    }
  }
  console.error(`${source}: ${n} new windows`);
}
await b.close();
process.exit(0);
