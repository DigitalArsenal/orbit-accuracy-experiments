// Section 6, step size: the paper's windowed screen (load once,
// search_candidates, refine_candidates; the module's own host code) at four
// coarse steps over one synthetic catalog. Candidates change with the step;
// the conjunctions do not.
import { formatMeters } from '../../chart.js';
import { syntheticShell } from '../codec/cqr.js';
import { screenWindowed } from '../codec/screen.js';
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
  const figure = chart(ctx.root, 'Candidates against step', 'Pair-steps the module proposes for refinement');
  note(ctx.root, 'Synthetic low-orbit catalog, 5 km threshold, SGP4 in the module, pair search on the CPU in the module. Δmiss is the largest miss-distance difference from the 10 s screen over the same events.');
  const ca = await ctx.module('analysis/conjunction-assessment');

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
      const same = runs.every((r) => r.events.length === ref.events.length);
      return same ? `Every step reports the same ${num(ref.events.length)} conjunctions; only the candidates and the time change.`
        : `Conjunctions by step: ${runs.map((r) => `${r.step} s ${r.events.length}`).join(', ')}.`;
    });
  }
  await sweep();
}
