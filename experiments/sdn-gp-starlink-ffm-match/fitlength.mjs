// Arm 6 (A3): fit-length sensitivity on the FFM truth. Each fitted Starlink is fitted over 24, 48 and 72 h by SGP4 and
// SGP4-XP and scored on the same interval, 72 to 96 h after the truth start, and on the first day after each fit (a fixed lead). Output: <store>/rows/fitlength.jsonl.
// --arm sdngp [--shard k/n] (amendment A9c): the same fits by SDN-GP, on the satellites of the registered fitlength.jsonl; rows in rows/sdngp/<build>/fitlength.s<k>.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { withT, ms } from './lib/windows.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';

frozen();
const ARM = args.arm ?? 'both';
const b = await openBaselines(modulesRoot(), { sdngp: ARM === 'sdngp' });
const dir = path.join(store, 'truth');
const file = path.join(store, 'rows/fitlength.jsonl');
const registered = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).norad) : [];
const sink = ARM === 'sdngp' ? sdngpSink(b, 'fitlength', args.shard) : null;
const done = new Set(sink ? [] : registered);
const only = sink ? new Set(registered) : null;
let n = 0;
const limit = args.limit ? Number(args.limit) : Infinity;
for (const name of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x)).sort()) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, name)));
  if (only && !only.has(meta.norad)) continue;
  if (sink && (!sink.mine() || sink.has(rowKey({ source: 'fitlength', id: String(meta.norad), startUtc: meta.truth.epochUtc, fitSeconds: 0 })))) continue;
  if (done.has(meta.norad)) continue;
  if (!sink && done.size + n >= limit) break;
  const flat = new Float64Array(fs.readFileSync(path.join(dir, `${meta.norad}.f64`)).buffer.slice(0));
  const t0 = ms(meta.truth.epochUtc);
  const object = withT({ source: 'starlink-ffm', id: `STARLINK (${meta.norad})`, norad: meta.norad, name: `STARLINK-${meta.norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
    lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: new Date(t0 + i * config.truth.cadenceSeconds * 1000).toISOString(), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
  const fits = {};
  for (const hours of [24, 48, 72]) {
    const k = (config.truth.hours - hours) / 24;
    const row = await scoreWindow(b, object, t0, { fitSeconds: hours * 3600, leadDays: [...new Set([1, k])], minCoverage: config.windows.minimumCoverage, arms: ARM === 'sdngp' ? 'sdngp' : 'both' });
    const pick = (a) => (a?.ok ? { fitRmsKm: a.fitRmsKm, errorKm: a.days[k]?.rmsKm ?? null, day1Km: a.days[1]?.rmsKm ?? null } : null);
    fits[hours] = sink ? { sdngp: pick(row?.sdngp) } : { xp: pick(row?.xp), sgp4: pick(row?.sgp4) };
  }
  const out = { norad: meta.norad, stratum: meta.stratum, bEffAtZeroBound: meta.fit.bEffAtZeroBound, fits };
  if (sink) sink.append({ source: 'fitlength', id: String(meta.norad), startUtc: meta.truth.epochUtc, fitSeconds: 0, ...out }); else fs.appendFileSync(file, `${JSON.stringify(out)}\n`);
  n += 1;
}
console.log(`${n} satellites`);
await b.close();
process.exit(0);
