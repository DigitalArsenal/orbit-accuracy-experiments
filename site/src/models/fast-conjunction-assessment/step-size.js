// Section 6, step size: the paper's windowed screen (load once,
// search_candidates, refine_candidates; the module's own host code) at four
// coarse steps over one synthetic catalog. Candidates change with the step;
// the conjunctions do not.
import { formatMeters } from '../../chart.js';
import { msOf, syntheticShell } from '../codec/cqr.js';
import { coarseGrid, destroyIndex, prepareIndex } from '../codec/index.js';
import { START_MS, screenWindowed } from '../codec/screen.js';
import { rtn, scene3d, v3 } from '../scene.js';
import { chart, inputs, num, panel, table, note } from '../ui.js';

const STEPS = [10, 30, 60, 120];
const key = (e) => [e.PRIMARY_ID, e.SECONDARY_ID].sort().join(' ');

// Largest differences of matched events (same pair, TCA within 1 s).
export function compareEvents(reference, events) {
  const byPair = new Map();
  for (const e of reference) byPair.set(key(e), [...(byPair.get(key(e)) ?? []), e]);
  let tca = 0, miss = 0, matched = 0;
  for (const e of events) {
    const m = (byPair.get(key(e)) ?? []).find((r) => Math.abs(r.TCA.JULIAN_DATE - e.TCA.JULIAN_DATE) * 86400 < 1);
    if (!m) continue;
    matched++;
    tca = Math.max(tca, Math.abs(m.TCA.JULIAN_DATE - e.TCA.JULIAN_DATE) * 86400);
    miss = Math.max(miss, Math.abs(m.MISS_DISTANCE_M - e.MISS_DISTANCE_M));
  }
  return { matched, tca, miss };
}

export default async function run(ctx) {
  const p = panel(ctx.root, 'Catalog');
  const form = inputs(p, [
    { id: 'n', label: 'Objects', type: 'select', value: 800, options: [[400, '400'], [800, '800'], [1600, '1,600']] },
    { id: 'hours', label: 'Span (h)', type: 'select', value: 24, options: [[6, '6'], [24, '24'], [72, '72']] },
  ], () => sweep());
  const out = panel(ctx.root, 'One screen per step');
  const view = scene3d(ctx, { title: 'One encounter, sampled four ways', caption: 'TEME, true scale; the module’s samples of both objects at each step' });
  const figure = chart(ctx.root, 'Candidates against step', 'Pair-steps the module proposes for refinement');
  note(ctx.root, 'Synthetic low-orbit catalog, 5 km threshold, SGP4 in the module, pair search on the CPU in the module. Δmiss is the largest miss-distance difference from the 10 s screen over the same events.');
  const ca = await ctx.module('analysis/conjunction-assessment');

  // The closest pair of the 10 s screen: both objects' samples on each
  // step's grid for ±150 s around the encounter, and their 2 s paths.
  const TONES = { 10: 'muted', 30: 'cyan', 60: 'accent', 120: 'text' };
  async function drawEncounter(objects, events) {
    if (!events.length) return;
    const e = events.reduce((a, b) => (b.MISS_DISTANCE_M < a.MISS_DISTANCE_M ? b : a));
    const pair = [objects.find((o) => o.id === e.PRIMARY_ID), objects.find((o) => o.id === e.SECONDARY_ID)];
    const tcaMs = msOf(e.TCA.JULIAN_DATE);
    const handle = await prepareIndex(ca, pair);
    const grids = {};
    let fine;
    try {
      for (const step of STEPS) {
        const m = Math.ceil(150 / step), k0 = Math.floor((tcaMs - START_MS) / (step * 1000));
        grids[step] = await coarseGrid(ca, handle, { startMs: START_MS + (k0 - m + 1) * step * 1000, coarseStepSec: step, steps: 2 * m });
      }
      fine = await coarseGrid(ca, handle, { startMs: tcaMs - 150e3, coarseStepSec: 2, steps: 151 });
    } finally { await destroyIndex(ca, handle); }
    const p = (q) => [q.x, q.y, q.z];
    const mid = v3.scale(v3.add(p(fine[75][0]), p(fine[75][1])), 0.5);
    const [R, T, N] = rtn(p(fine[75][0]), [fine[75][0].vx, fine[75][0].vy, fine[75][0].vz]);
    await view.draw((g) => {
      [0, 1].forEach((i) => g.line(fine.map((step) => p(step[i])), { color: i ? 'cyan' : 'accent', width: 1.5, alpha: 0.55 }));
      [...STEPS].reverse().forEach((step) => grids[step].forEach((row) => row.forEach((q) => g.point(p(q), { color: TONES[step], size: 4 + step / 24, outline: 1, frame: false }))));
      g.point(mid, { color: 'text', size: 5, outline: 1, label: `${formatMeters(e.MISS_DISTANCE_M)} at closest`, labelOptions: { above: true } });
      g.view({ center: mid, radius: 1100, direction: v3.unit(v3.add(v3.scale(R, 0.9), v3.scale(N, 0.35))) });
    }, { frame: 'TEME', epochMs: tcaMs, caption: `TEME, true scale, ±150 s around the closest conjunction of the 10 s screen`,
      legend: [...STEPS.map((step) => [TONES[step], `${step} s samples`, 'dot']), ['accent', pair[0].name], ['cyan', pair[1].name]] });
  }

  async function sweep() {
    const { n, hours } = form.values();
    await ctx.run(`Screening ${n} objects at four step sizes`, async () => {
      const objects = syntheticShell(n);
      const runs = [];
      for (const step of STEPS) {
        ctx.status(`analysis/conjunction-assessment: ${n} objects, ${hours} h at ${step} s steps…`);
        runs.push({ step, ...(await screenWindowed(ca, objects, { days: hours / 24, windowHours: Math.min(6, hours), coarseStepSec: step })) });
      }
      const ref = runs[0];
      const rows = runs.map((r) => {
        const d = compareEvents(ref.events, r.events);
        return [`${r.step} s`, num(r.candidates), r === ref ? num(r.events.length) : `${num(r.events.length)} (${num(d.matched)} same)`, r === ref ? '—' : formatMeters(d.miss), `${(r.ms / 1000).toFixed(1)} s`];
      });
      table(out, ['Step', 'Candidates', 'Conjunctions', 'Δmiss', 'Time'], rows, { existing: out.querySelector('table') ?? undefined });
      figure.draw({ series: [{ name: 'Candidates', color: 'var(--accent)', points: runs.map((r) => [r.step, r.candidates]), markers: true }],
        x: { min: 10, max: 120, scale: 'log', ticks: STEPS, format: (s) => `${s} s` }, y: { format: (v) => num(v), value: (v) => num(Math.round(v)) } });
      await drawEncounter(objects, ref.events);
      const same = runs.every((r) => r.events.length === ref.events.length);
      return same ? `Every step reports the same ${num(ref.events.length)} conjunctions; only the candidates and the time change.`
        : `Conjunctions by step: ${runs.map((r) => `${r.step} s ${r.events.length}`).join(', ')}.`;
    });
  }
  await sweep();
}
