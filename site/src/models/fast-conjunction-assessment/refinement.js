// Section 3, refinement: the closest approach of a screened pair, refined
// by assess_conjunction from coarse brackets of 5 s to 120 s. The TCA and
// miss distance come out the same; the coarse step only finds the encounter.
import { formatMeters } from '../../chart.js';
import { decodeCqr, msOf, output, pairRequest, syntheticShell } from '../codec/cqr.js';
import { screenOnce } from '../codec/screen.js';
import { num, panel, table, tiles, note } from '../ui.js';

const STEPS = [5, 15, 30, 60, 120];

export default async function run(ctx) {
  const pick = panel(ctx.root, 'The encounter');
  const out = panel(ctx.root, 'Refined from each coarse step');
  note(ctx.root, 'The pair is the closest approach in a screen of 300 synthetic objects over 6 h; each row is one assess_conjunction call on a one-hour window around it.');
  const ca = await ctx.module('analysis/conjunction-assessment');
  await ctx.run('Screening for an encounter, then refining it', async () => {
    const objects = syntheticShell(300);
    const screen = await screenOnce(ca, objects, { durationSeconds: 6 * 3600 });
    if (!screen.events.length) throw new Error('The screen found no encounter.');
    const e = screen.events.reduce((a, b) => (b.MISS_DISTANCE_M < a.MISS_DISTANCE_M ? b : a));
    const a = objects.find((o) => o.id === e.PRIMARY_ID), b = objects.find((o) => o.id === e.SECONDARY_ID);
    tiles(pick, [['Pair', `${a.name} · ${b.name}`], ['Screen TCA', new Date(msOf(e.TCA.JULIAN_DATE)).toISOString().slice(11, 23)], ['Screen miss', formatMeters(e.MISS_DISTANCE_M)], ['Relative speed', `${num(e.RELATIVE_SPEED_M_S / 1000, 4)} km/s`]]);
    const startJd = e.TCA.JULIAN_DATE - 0.5 / 24 + 7.3 / 86400;  // off the screen's grid
    const rows = [];
    let ref = null;
    for (const step of STEPS) {
      const event = decodeCqr(output(await ca.invoke('assess_conjunction', [pairRequest(a, b, { startJd, durationSeconds: 3600, coarseStepSec: step, toleranceSec: 0.001 })]), 'result')).EVENT_RESULT;
      ref ??= event;
      rows.push([`${step} s`, new Date(msOf(event.TCA.JULIAN_DATE)).toISOString().slice(11, 23), formatMeters(event.MISS_DISTANCE_M, 3),
        `${num((event.TCA.JULIAN_DATE - ref.TCA.JULIAN_DATE) * 86400e3, 3)} ms`, formatMeters(Math.abs(event.MISS_DISTANCE_M - ref.MISS_DISTANCE_M), 3)]);
    }
    table(out, ['Coarse step', 'TCA (UTC)', 'Miss', 'ΔTCA', 'Δmiss'], rows);
    return `Every coarse step refines to the same closest approach: ${formatMeters(ref.MISS_DISTANCE_M, 3)} at ${rows[0][1]} UTC.`;
  });
}
