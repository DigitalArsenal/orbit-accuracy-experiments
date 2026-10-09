// Section 17.1: any of the 63 HPOP-against-Orekit 13.1 cases, re-run here
// from its exact PRW request against the stored Orekit trajectory.
import { formatMeters } from '../../chart.js';
import { runOrekitCase } from '../../runs.js';
import { chart, inputs, num, panel, table, tiles } from '../ui.js';

export default async function run(ctx) {
  const [cases, results] = await Promise.all([ctx.fetchJson('./data/orekit/cases.json'), ctx.fetchJson('./data/orekit/results.json')]);
  const p = panel(ctx.root, 'Case');
  const first = cases.find((c) => /drag/i.test(c.forces)) ?? cases[0];
  const form = inputs(p, [{ id: 'case', label: 'Orbit and force set', type: 'select', value: first.id, wide: true, options: cases.map((c) => [c.id, `${c.orbit} · ${c.forces}`]) }], () => one());
  const figure = chart(ctx.root, 'Difference from Orekit over the day', 'Hourly 3D position difference');
  const all = panel(ctx.root, 'All 63, as recorded');
  const groups = new Map();
  for (const c of cases) {
    const r = results.cases.find((x) => x.id === c.id);
    const g = groups.get(c.orbit) ?? { n: 0, worst: 0, pass: 0 };
    g.n++; g.worst = Math.max(g.worst, r.worstM); g.pass += r.pass ? 1 : 0;
    groups.set(c.orbit, g);
  }
  table(all, ['Orbit', 'Cases', 'Largest difference', 'Within tolerance'], [...groups].map(([orbit, g]) => [orbit, num(g.n), formatMeters(g.worst, 3), `${g.pass} of ${g.n}`]));
  const hpop = await ctx.module('propagator/hpop');
  async function one() {
    const c = cases[Number(form.values().case)];
    await ctx.run(`propagator/hpop: ${c.orbit} ${c.forces}`, async () => {
      const r = await runOrekitCase(hpop, c);
      const recorded = results.cases.find((x) => x.id === c.id).worstM;
      tiles(p, [['Largest difference', formatMeters(r.worst, 3)], ['At', `${r.worstAt} h`], ['Tolerance', formatMeters(c.toleranceM)], ['Recorded run', formatMeters(recorded, 3)], ['In this browser', `${r.seconds.toFixed(2)} s`]]);
      figure.draw({ series: [{ name: 'HPOP − Orekit', color: 'var(--accent)', points: r.differences.filter((d) => d[1] > 0), markers: true }],
        x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (h) => `${h} h` } });
      return `${c.orbit}, ${c.forces}: ${formatMeters(r.worst, 3)} from Orekit at worst, ${r.worst <= c.toleranceM ? 'within' : 'outside'} its ${formatMeters(c.toleranceM)} tolerance; the recorded run had ${formatMeters(recorded, 3)}.`;
    });
  }
  await one();
}
