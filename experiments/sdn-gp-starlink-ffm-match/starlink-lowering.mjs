// Amendment A9d: the Starlinks whose FFM fit has B_eff above 0.5 m2/kg (19 of 239: lowering or decaying objects), fitted by SDN-AP in two named variants besides the build's
// default (rows of starlink-sdngp.mjs): "rule" = DESIGN 2c.2 on (a B_eff above 0.5 m2/kg is replaced by tau0 held after the arc) and "free" = B_eff free, each set through the
// build's diagnostic export before the fit, so the result does not depend on the default of the build. Same window as the baselines (24 h fit from the truth start, held-out days 1 to 3).
//   node experiments/sdn-gp-starlink-ffm-match/starlink-lowering.mjs [--shard k/n]
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, read, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';
import { withT, ms, iso } from './lib/windows.mjs';

const truthDir = path.join(store, 'truth');
const FIT = config.windows.fitHours * 3600;
const VARIANTS = [['rule', 0.5], ['free', Infinity]];

frozen();
const b = await openBaselines(modulesRoot(), { sdngp: true });
const sink = sdngpSink(b, 'lowering', args.shard);
const metas = fs.readdirSync(truthDir).filter((n) => /^\d+\.json$/.test(n)).map((n) => read(path.join(truthDir, n))).filter((m) => !m.fit.bEffAtZeroBound && m.fit.bEffM2Kg > 0.5).sort((a, c) => a.norad - c.norad);
let n = 0;
for (const meta of metas) {
  if (!sink.mine()) continue;
  const { norad } = meta;
  const flat = new Float64Array(new Uint8Array(fs.readFileSync(path.join(truthDir, `${norad}.f64`))).buffer);
  const t0 = ms(meta.truth.epochUtc);
  const truth = withT({ source: 'starlink-ffm', id: `STARLINK (${norad})`, norad, name: `STARLINK-${norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
    lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: iso(t0 + i * config.truth.cadenceSeconds * 1000), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
  for (const [variant, limit] of VARIANTS) {
    const source = `starlink-ffm-${variant}`;
    if (sink.has(rowKey({ source, id: truth.id, startUtc: iso(t0), fitSeconds: FIT }))) continue;
    const row = await scoreWindow(b, truth, t0, { fitSeconds: FIT, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage, arms: 'sdngp', loweringLimit: limit });
    if (row) { const { xp, sgp4, ...rest } = row; sink.append({ ...rest, source, variant, loweringLimitM2Kg: limit === Infinity ? null : limit, bEffFfm: meta.fit.bEffM2Kg }); }
  }
  n += 1;
}
console.error(`lowering: ${n} satellites (build ${sink.build}, shard ${args.shard ?? '0/1'})`);
await b.close();
process.exit(0);
