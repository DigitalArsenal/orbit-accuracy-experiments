// Section 3, the spatial grid: at one coarse step every object's
// straight-line segment over ±h, widened by d/2 + D, is an axis-aligned box;
// only overlapping boxes can pass the straight-line test, so a uniform grid of
// those boxes proposes the candidate pairs. analysis/conjunction-assessment
// samples the step (coarse_grid: each object's state and bound D) and runs
// the search (search_candidates: the CPU grid and the f64 test); the page
// draws the boxes from the module's states and bounds, the cells that hold
// each candidate pair's overlap, and the pairs.
import { formatMeters } from '../../chart.js';
import { msOf, syntheticShell } from '../codec/cqr.js';
import { coarseGrid, destroyIndex, prepareIndex, searchCandidates } from '../codec/index.js';
import { START_MS, screenOnce } from '../codec/screen.js';
import { inputs, note, num, panel, tiles } from '../ui.js';
import { scene3d, v3 } from '../scene.js';

const STEP = 60, THRESHOLD_KM = 5;

export default async function run(ctx) {
  const p = panel(ctx.root, 'One coarse step');
  const form = inputs(p, [{ id: 'n', label: 'Objects', type: 'select', value: 1200, options: [[300, '300'], [600, '600'], [1200, '1,200'], [2400, '2,400']] }], () => one());
  const view = scene3d(ctx, { title: 'The boxes, the grid cells and the candidate pairs', caption: 'TEME (km)' });
  const close = scene3d(ctx, { title: 'One candidate pair in its cell', caption: 'TEME (km), the cells about it' });
  note(ctx.root, 'Synthetic low-orbit catalog: deterministic mean elements, no element set from any provider. 5 km threshold, 60 s steps, SGP4 in the module. The step shown is the one with the most candidates in the two hours about the screen’s closest approach.');
  const ca = await ctx.module('analysis/conjunction-assessment');

  async function one() {
    const n = Number(form.values().n);
    await ctx.run(`analysis/conjunction-assessment: coarse_grid and search_candidates, ${n} objects`, async () => {
      const objects = syntheticShell(n);
      const screen = await screenOnce(ca, objects, { durationSeconds: 6 * 3600 });
      const e = screen.events.length ? screen.events.reduce((a, b) => (b.MISS_DISTANCE_M < a.MISS_DISTANCE_M ? b : a)) : null;
      // Two hours of steps about the closest approach; the step with the most
      // candidates is drawn.
      const BLOCK = 120;
      const kc = e ? Math.round((msOf(e.TCA.JULIAN_DATE) - START_MS) / (STEP * 1000)) : 180;
      const first = Math.max(0, kc - BLOCK / 2), firstMs = START_MS + first * STEP * 1000;
      const handle = await prepareIndex(ca, objects);
      let grids, found;
      try {
        grids = await coarseGrid(ca, handle, { startMs: firstMs, coarseStepSec: STEP, steps: BLOCK });
        found = await searchCandidates(ca, handle, { startMs: firstMs, coarseStepSec: STEP, steps: BLOCK, thresholdM: THRESHOLD_KM * 1000 });
      } finally { await destroyIndex(ca, handle); }
      const counts = new Map();
      for (const x of found) counts.set(x.step, (counts.get(x.step) ?? 0) + 1);
      const busiest = [...counts].reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && Math.abs(first + b[0] - kc) < Math.abs(first + a[0] - kc)) ? b : a), [kc - first, 0])[0];
      const grid = grids[busiest], pairs = found.filter((x) => x.step === busiest);
      const stepMs = firstMs + busiest * STEP * 1000;
      // Each object's box: its segment over ±h about the module's sample,
      // widened by d/2 + D (the module's bound).
      const h = STEP / 2;
      const boxes = grid.map((q) => {
        const r = [q.x, q.y, q.z], v = [q.vx, q.vy, q.vz], a = v3.sub(r, v3.scale(v, h)), b = v3.add(r, v3.scale(v, h)), w = THRESHOLD_KM / 2 + q.boundKm;
        return { r, a, b, lo: [0, 1, 2].map((i) => Math.min(a[i], b[i]) - w), hi: [0, 1, 2].map((i) => Math.max(a[i], b[i]) + w) };
      });
      // The grid's cell: the 99th-percentile box edge, as the module sizes it.
      const edges = boxes.map((x) => Math.max(...[0, 1, 2].map((i) => x.hi[i] - x.lo[i]))).sort((x, y) => x - y);
      const cell = edges[Math.min(edges.length - 1, Math.floor((edges.length * 99) / 100))];
      const lowCorner = ({ a, b }) => [0, 1, 2].map((i) => Math.floor(Math.max(boxes[a].lo[i], boxes[b].lo[i]) / cell));
      const cells = new Map(pairs.map((pair) => { const c = lowCorner(pair); return [c.join(','), c]; }));
      const inPairs = new Set(pairs.flatMap((x) => [x.a, x.b]));
      tiles(p, [['Pairs, n(n − 1)/2', num((n * (n - 1)) / 2)], ['Candidates at this step', num(pairs.length)], ['In the two hours', num(found.length)], ['Cell edge', formatMeters(cell * 1000)],
        ['Step', new Date(stepMs).toISOString().slice(11, 19)]]);
      await view.draw((g) => {
        g.earth();
        boxes.forEach((x, i) => { if (!inPairs.has(i)) g.line([x.a, x.b], { color: 'muted', width: 1, alpha: 0.5 }); });
        for (const c of cells.values()) g.box(c.map((x) => (x + 0.5) * cell), [cell, cell, cell], { color: 'cyan', alpha: 0.04, outline: true, outlineAlpha: 0.6 });
        for (const i of inPairs) {
          const x = boxes[i];
          g.box(v3.scale(v3.add(x.lo, x.hi), 0.5), v3.sub(x.hi, x.lo), { color: 'accent', alpha: 0.18, outline: true, outlineAlpha: 0.8 });
          g.line([x.a, x.b], { color: 'accent', width: 2 });
        }
        for (const { a, b } of pairs) g.line([boxes[a].r, boxes[b].r], { color: 'text', width: 2 });
        if (e) g.label(boxes[objects.findIndex((o) => o.id === e.PRIMARY_ID)].r, `closest approach of the screen, ${formatMeters(e.MISS_DISTANCE_M)}`, { color: 'text', size: 11, above: true });
        g.view({ preset: '3d' });
      }, { axes: ['x, TEME (km)', 'y, TEME (km)', 'z, TEME (km)'], aspect: 'equal',
        caption: `TEME (km) at ${new Date(stepMs).toISOString().slice(11, 19)} UTC; each object’s segment over ±${h} s from the module’s sample; for the ${num(pairs.length)} candidate pairs the module found, their boxes (widened by d/2 + D) and the grid cell (edge ${formatMeters(cell * 1000)}) holding the low corner of their overlap; the Earth at 6,378 km`,
        legend: [['muted', `${num(n)} objects’ segments`], ['accent', 'Boxes of candidate pairs', 'solid'], ['text', 'Candidate pair'], ['cyan', 'Grid cell of the pair', 'solid'], ['earth', 'Earth, 6,378.137 km']] });
      // One pair close up: the grid about its cell, every segment and box
      // there, and the pair's overlap.
      if (pairs.length) {
        const pair = e ? pairs.find((x) => [x.a, x.b].includes(objects.findIndex((o) => o.id === e.PRIMARY_ID))) ?? pairs[0] : pairs[0];
        const c = lowCorner(pair), center = c.map((x) => (x + 0.5) * cell), reach = 1.5 * cell;
        const limits = center.map((x) => [x - reach, x + reach]);
        const near = (x) => [0, 1, 2].every((i) => x.hi[i] >= limits[i][0] && x.lo[i] <= limits[i][1]);
        await close.draw((g) => {
          // The cell boundaries about it, along each axis.
          for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) {
            const x = (c[0] + i) * cell, y = (c[1] + j) * cell, y2 = (c[1] + i) * cell, z = (c[2] + j) * cell;
            g.line([[x, y, center[2] - reach], [x, y, center[2] + reach]], { color: 'cyan', width: 1, alpha: 0.3 });
            g.line([[x, center[1] - reach, z], [x, center[1] + reach, z]], { color: 'cyan', width: 1, alpha: 0.3 });
            g.line([[center[0] - reach, y2, z], [center[0] + reach, y2, z]], { color: 'cyan', width: 1, alpha: 0.3 });
          }
          g.box(center, [cell, cell, cell], { color: 'cyan', alpha: 0.06, outline: true, outlineAlpha: 0.8 });
          boxes.forEach((x, i) => {
            if (!near(x)) return;
            const mine = i === pair.a || i === pair.b;
            g.line([x.a, x.b], { color: mine ? 'accent' : 'muted', width: mine ? 2.5 : 1.5 });
            g.box(v3.scale(v3.add(x.lo, x.hi), 0.5), v3.sub(x.hi, x.lo), { color: mine ? 'accent' : 'muted', alpha: mine ? 0.15 : 0.04, outline: true, outlineAlpha: mine ? 0.9 : 0.4 });
          });
          g.line([boxes[pair.a].r, boxes[pair.b].r], { color: 'text', width: 2 });
          g.label(boxes[pair.a].r, objects[pair.a].name, { color: 'accent', size: 11 });
          g.label(boxes[pair.b].r, objects[pair.b].name, { color: 'accent', size: 11 });
          g.view({ preset: '3d' });
        }, { axes: ['x, TEME (km)', 'y, TEME (km)', 'z, TEME (km)'], aspect: 'equal', limits,
          caption: `The cell (edge ${formatMeters(cell * 1000)}) holding the low corner of ${objects[pair.a].name} and ${objects[pair.b].name}’s overlap, with the grid about it: every segment and box there; only overlapping boxes pair`,
          legend: [['accent', 'The pair: segments and boxes', 'solid'], ['muted', 'Other objects there', 'solid'], ['cyan', 'Grid cells', 'line']] });
      }
      return `At this step ${num(n)} objects make ${num((n * (n - 1)) / 2)} pairs; the grid and the straight-line test leave ${num(pairs.length)} candidates for refinement.`;
    });
  }
  await one();
}
