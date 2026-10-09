// Section 1: all-vs-all is n(n − 1)/2 pairs. The module screens synthetic
// catalogs of growing size in one screen_catalog call each and reports the
// pairs it planned; the page compares them with n(n − 1)/2 and scales the
// count to the full catalog.
import { formatMeters } from '../../chart.js';
import { syntheticShell } from '../codec/cqr.js';
import { screenOnce } from '../codec/screen.js';
import { chart, inputs, num, panel, table, tiles, note } from '../ui.js';

const SIZES = [25, 50, 100, 200, 400];
const pairs = (n) => (n * (n - 1)) / 2;

export default async function run(ctx) {
  const p = panel(ctx.root, 'One screen');
  const form = inputs(p, [
    { id: 'n', label: 'Objects', type: 'range', value: 200, min: 10, max: 600, step: 10 },
    { id: 'hours', label: 'Window (h)', type: 'select', value: 24, options: [[6, '6'], [24, '24'], [72, '72']] },
  ], () => one());
  const figure = chart(ctx.root, 'Pairs the module plans, against catalog size', 'Points from the module; the line is n(n − 1)/2');
  const scale = panel(ctx.root, 'The full catalog');
  note(ctx.root, 'Synthetic low-orbit catalog: deterministic mean elements, no element set from any provider. 5 km threshold, 60 s steps, SGP4 in the module.');
  const ca = await ctx.module('analysis/conjunction-assessment');
  const planned = (s) => Number(s.PAIRS_SCREENED) + Number(s.PAIRS_PREFILTERED);

  async function one() {
    const { n, hours } = form.values();
    await ctx.run(`analysis/conjunction-assessment screen_catalog, ${n} objects`, async () => {
      const t0 = performance.now();
      const r = await screenOnce(ca, syntheticShell(n), { durationSeconds: hours * 3600 });
      const ms = performance.now() - t0;
      const steps = hours * 60 + 1;
      tiles(p, [['Pairs planned', num(planned(r.statistics))], ['n(n − 1)/2', num(pairs(n))], ['After the altitude prefilter', num(Number(r.statistics.PAIRS_SCREENED))],
        ['Conjunctions < 5 km', num(r.events.length)], ['Closest', r.events.length ? formatMeters(Math.min(...r.events.map((e) => e.MISS_DISTANCE_M))) : '—'], ['In this browser', `${(ms / 1000).toFixed(2)} s`]]);
      return `${num(n)} objects make ${num(pairs(n))} pairs and ${num(pairs(n) * steps)} pair-steps over ${hours} h at 60 s; the module planned ${num(planned(r.statistics))}.`;
    });
  }

  await ctx.run('Screening five catalog sizes in the module', async () => {
    const points = [];
    for (const n of SIZES) points.push([n, planned((await screenOnce(ca, syntheticShell(n), { durationSeconds: 6 * 3600 })).statistics)]);
    figure.draw({
      series: [
        { name: 'n(n − 1)/2', color: 'var(--series-muted)', points: Array.from({ length: 40 }, (_, k) => { const n = 20 * 1.1 ** k; return [n, pairs(n)]; }).filter(([n]) => n <= 500), dash: true },
        { name: 'Module', color: 'var(--accent)', points, markers: true },
      ],
      x: { min: 20, max: 500, scale: 'log', ticks: [25, 50, 100, 200, 400], format: (n) => String(Math.round(n)) },
      y: { format: (v) => num(v), value: (v) => num(Math.round(v)) },
    });
    const full = 32514;
    table(scale, ['Quantity', 'Value'], [
      ['Objects', num(full)], ['Pairs, n(n − 1)/2', num(pairs(full))], ['Steps in 3 days at 60 s', num(4321)], ['Pair-steps', num(pairs(full) * 4321)],
    ]);
  });
  await one();
}
