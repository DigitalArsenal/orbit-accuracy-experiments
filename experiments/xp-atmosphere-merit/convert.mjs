// XM step 1 (PLAN.md, Groups; ruling 9): the GFZ rapid science orbits of group P (GRACE-FO 1 L64, GRACE-FO 2 L65,
// TerraSAR-X L13) converted to reference states in the store, every arc that meets the days the period's arcs and
// horizons need (2025-12-28 to 2026-08-04), with each consecutive pair's overlap (pre-check P1). Re-running skips arcs
// already converted.
//   node experiments/xp-atmosphere-merit/convert.mjs
import path from 'node:path';
import { config, store, write, DAY } from './common.mjs';
import { convertCode } from './lib/rso.mjs';

const lo = Date.parse(`${config.period.from}T00:00:00Z`) - 4 * DAY, hi = Date.parse(`${config.period.to}T00:00:00Z`) + 4 * DAY;
const summary = {};
for (const o of config.groups.P.objects.filter((x) => x.truth === 'gfz-rso')) {
  const identity = { norad: o.norad, objectId: o.objectId, name: o.name };
  const t0 = Date.now();
  const r = await convertCode(o.code, identity, lo, hi, (m) => console.error(m));
  summary[o.code] = { norad: o.norad, name: o.name, converted: r.converted, skipped: r.skipped, overlaps: r.overlaps, seconds: Math.round((Date.now() - t0) / 1000) };
  console.error(`${o.code} ${o.name}: ${r.converted} arcs converted, ${r.skipped.length} skipped, ${r.overlaps.length} overlaps (${summary[o.code].seconds} s)`);
}
write(path.join(store, 'inputs/rso-conversion.json'), { from: new Date(lo).toISOString(), to: new Date(hi).toISOString(), codes: summary });
