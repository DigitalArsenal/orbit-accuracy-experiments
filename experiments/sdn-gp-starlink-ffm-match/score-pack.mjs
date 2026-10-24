// Amendment A8: score SDN-GP's predicted states for one window of a truth pack (regime-windows.mjs), in the pack's centre and axes.
//   node experiments/sdn-gp-starlink-ffm-match/score-pack.mjs --pack danuri-lunar --start 2026-09-01T00:00:00Z --fit-hours 24 \
//        --predicted <states.oem> [--lead-days 1,2,3] [--out result.json]
// `--predicted` is a size-prefixed $OEM (one or more blocks) with states at the pack's epochs after the fit span. Predicted and truth states are
// paired by epoch (within 5 ms); the radial / in-track / cross-track errors are gp-error-model `pair_statistics` on the truth's own axes (any
// inertial centre), reported per held-out day (day k is (fit end + (k-1) d, fit end + k d]) as the 3D RMS and the three component RMS in km.
// Nothing is computed here but counting and square roots of module outputs.
import fs from 'node:fs';
import { args, frozen } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, rtnSeries } from './lib/baselines.mjs';
import { readOem, blockLines } from './lib/sds.mjs';
import { readPack } from './lib/packs.mjs';
import { RULES } from './regime-windows.mjs';
import { DAY, ms } from './lib/windows.mjs';

const H = 3600000;
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);

/** { byDay, matched, unmatched, centerCheck } for predicted lines against a pack window. */
export async function scorePack(b, { pack, startMs, fitHours, leadDays, predicted, predictedCenter, loaded }) {
  const { meta, object } = loaded ?? readPack(pack); // `loaded`: the pack read once by a caller that scores many windows
  const fitEnd = startMs + fitHours * H;
  const nearest = (t) => { // truth index with |t_i - t| <= 5 ms, else -1
    let lo = 0, hi = object.t.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (object.t[mid] < t) lo = mid + 1; else hi = mid; }
    for (const i of [lo - 1, lo]) if (i >= 0 && Math.abs(object.t[i] - t) <= 5) return i;
    return -1;
  };
  const byDay = {};
  let matched = 0, unmatched = 0;
  for (const k of leadDays) {
    const lo = fitEnd + (k - 1) * DAY, hi = fitEnd + k * DAY;
    const pairs = [];
    for (const p of predicted) {
      const t = ms(p.epoch);
      if (!(t > lo && t <= hi)) continue;
      const i = nearest(t);
      if (i < 0) { unmatched += 1; continue; }
      pairs.push([p, object.lines[i]]);
      matched += 1;
    }
    if (!pairs.length) { byDay[k] = null; continue; }
    const series = await rtnSeries(b, pairs.map(([p]) => p), pairs.map(([, l]) => l));
    const ric = [0, 1, 2].map((c) => rms(series.map((e) => e[c])));
    byDay[k] = { n: pairs.length, rmsKm: Math.hypot(...ric), ric };
  }
  const centerCheck = predictedCenter && meta.center && predictedCenter.toUpperCase() !== meta.center.toUpperCase() ? `predicted centre ${predictedCenter} differs from the pack's ${meta.center}` : 'ok';
  return { pack, centre: meta.center, axes: meta.axes, startUtc: new Date(startMs).toISOString(), fitHours, byDay, matched, unmatched, centerCheck };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  frozen();
  const rule = RULES[args.pack];
  const leadDays = args['lead-days'] ? args['lead-days'].split(',').map(Number) : rule?.leadDays;
  if (!args.pack || !args.start || !args['fit-hours'] || !args.predicted || !leadDays) throw new Error('usage: see the header');
  const oem = readOem(fs.readFileSync(args.predicted));
  const predicted = oem.EPHEMERIS_DATA_BLOCK.flatMap((block) => blockLines(block));
  const b = await openBaselines(modulesRoot());
  const result = await scorePack(b, { pack: args.pack, startMs: ms(args.start), fitHours: Number(args['fit-hours']), leadDays, predicted, predictedCenter: oem.EPHEMERIS_DATA_BLOCK[0]?.CENTER_NAME });
  await b.close();
  const text = JSON.stringify(result, null, 2);
  if (args.out) fs.writeFileSync(args.out, `${text}\n`); else console.log(text);
  process.exit(0);
}
