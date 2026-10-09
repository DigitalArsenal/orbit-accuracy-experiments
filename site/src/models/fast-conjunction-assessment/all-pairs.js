// Section 1: all-vs-all is n(n − 1)/2 pairs. The module screens synthetic
// catalogs of growing size in one screen_catalog call each and reports the
// pairs it planned; the page compares them with n(n − 1)/2 and scales the
// count to the full catalog.
import { formatMeters } from '../../chart.js';
import { msOf, syntheticShell } from '../codec/cqr.js';
import { coarseGrid, destroyIndex, prepareIndex } from '../codec/index.js';
import { START_MS, screenOnce } from '../codec/screen.js';
import { scene3d, v3 } from '../scene.js';
import { chart, inputs, num, panel, table, tiles, note } from '../ui.js';

const SIZES = [25, 50, 100, 200, 400];
const pairs = (n) => (n * (n - 1)) / 2;

export default async function run(ctx) {
  const p = panel(ctx.root, 'One screen');
  const form = inputs(p, [
    { id: 'n', label: 'Objects', type: 'range', value: 200, min: 10, max: 600, step: 10 },
    { id: 'hours', label: 'Window (h)', type: 'select', value: 24, options: [[6, '6'], [24, '24'], [72, '72']] },
  ], () => one());
  const view = scene3d(ctx, { title: 'Every object, and one pair', caption: 'TEME; each orbit is the module’s SGP4 samples for one revolution' });
  const figure = chart(ctx.root, 'Pairs the module plans, against catalog size', 'Points from the module; the line is n(n − 1)/2');
  const scale = panel(ctx.root, 'The full catalog');
  note(ctx.root, 'Synthetic low-orbit catalog: deterministic mean elements, no element set from any provider. 5 km threshold, 60 s steps, SGP4 in the module.');
  const ca = await ctx.module('analysis/conjunction-assessment');
  const planned = (s) => Number(s.PAIRS_SCREENED) + Number(s.PAIRS_PREFILTERED);

  // The catalog around its closest conjunction: every object's SGP4 path for
  // ±48 min from the module's coarse grid, the pair highlighted, and the
  // n − 1 pairs one of them makes at that instant.
  async function drawCatalog(objects, events) {
    const e = events.length ? events.reduce((a, b) => (b.MISS_DISTANCE_M < a.MISS_DISTANCE_M ? b : a)) : null;
    const tcaMs = e ? msOf(e.TCA.JULIAN_DATE) : START_MS + 48 * 60e3;
    const ia = e ? objects.findIndex((o) => o.id === e.PRIMARY_ID) : 0, ib = e ? objects.findIndex((o) => o.id === e.SECONDARY_ID) : 1;
    const handle = await prepareIndex(ca, objects);
    let grid;
    try { grid = await coarseGrid(ca, handle, { startMs: tcaMs - 48 * 60e3, coarseStepSec: 60, steps: 97 }); } finally { await destroyIndex(ca, handle); }
    const path = (i) => grid.map((step) => [step[i].x, step[i].y, step[i].z]);
    const at = (i) => path(i)[48];
    await view.draw((g) => {
      objects.forEach((o, i) => { if (i !== ia && i !== ib) g.line(path(i), { color: 'muted', alpha: objects.length > 300 ? 0.16 : 0.24, width: 1 }); });
      objects.forEach((o, i) => { if (i !== ia) g.line([at(ia), at(i)], { color: 'cyan', alpha: 0.12, width: 1, frame: false }); });
      g.line(path(ia), { color: 'accent', width: 3 });
      g.line(path(ib), { color: 'cyan', width: 3 });
      g.point(at(ia), { color: 'accent', size: 9 });
      g.point(at(ib), { color: 'cyan', size: 7, label: e ? formatMeters(e.MISS_DISTANCE_M) : null, labelColor: 'text', labelOptions: { above: true } });
      g.view({ direction: v3.unit(v3.add(v3.unit(at(ia)), [0, 0, 0.6])) });
    }, { frame: 'TEME', epochMs: tcaMs, caption: e ? `TEME at the closest conjunction, ${new Date(tcaMs).toISOString().slice(11, 19)} UTC` : 'TEME; no conjunction under 5 km in this window',
      legend: [['muted', `${num(objects.length)} objects`], ['accent', e ? `Closest pair, ${objects[ia].name} · ${objects[ib].name}` : 'One pair'], ['cyan', `One object’s ${num(objects.length - 1)} pairs`]] });
  }

  async function one() {
    const { n, hours } = form.values();
    await ctx.run(`analysis/conjunction-assessment screen_catalog, ${n} objects`, async () => {
      const t0 = performance.now();
      const r = await screenOnce(ca, syntheticShell(n), { durationSeconds: hours * 3600 });
      const ms = performance.now() - t0;
      const steps = hours * 60 + 1;
      tiles(p, [['Pairs planned', num(planned(r.statistics))], ['n(n − 1)/2', num(pairs(n))], ['After the altitude prefilter', num(Number(r.statistics.PAIRS_SCREENED))],
        ['Conjunctions < 5 km', num(r.events.length)], ['Closest', r.events.length ? formatMeters(Math.min(...r.events.map((e) => e.MISS_DISTANCE_M))) : '—'], ['In this browser', `${(ms / 1000).toFixed(2)} s`]]);
      await drawCatalog(syntheticShell(n), r.events);
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
