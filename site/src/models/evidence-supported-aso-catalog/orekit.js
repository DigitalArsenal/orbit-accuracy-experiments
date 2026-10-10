// Section 17.1: any of the 63 HPOP-against-Orekit 13.1 cases, re-run here
// from its exact PRW request against the stored Orekit trajectory.
import { formatMeters } from '../../chart.js';
import { resampled, runOrekitCase } from '../../runs.js';
import { magnification, rtn, scene3d, toRtn, v3 } from '../scene.js';
import { chart, inputs, note, num, panel, table, tiles } from '../ui.js';

export default async function run(ctx) {
  const [cases, results] = await Promise.all([ctx.fetchJson('./data/orekit/cases.json'), ctx.fetchJson('./data/orekit/results.json')]);
  const p = panel(ctx.root, 'Case');
  const first = cases.find((c) => /drag/i.test(c.forces) && !c.unavailable) ?? cases.find((c) => !c.unavailable);
  const form = inputs(p, [{ id: 'case', label: 'Orbit and force set', type: 'select', value: first.id, wide: true, options: cases.map((c) => [c.id, `${c.orbit} · ${c.forces}${c.unavailable ? ' · recorded only' : ''}`]) }], () => one());
  const view = scene3d(ctx, { title: 'HPOP and Orekit, one day', caption: 'GCRF; the hourly difference magnified' });
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
    p.querySelectorAll(':scope > p.fine.withheld').forEach((n) => n.remove());
    if (c.unavailable) {
      tiles(p, [['Recorded run', formatMeters(results.cases.find((x) => x.id === c.id).worstM, 3)], ['Tolerance', formatMeters(c.toleranceM)], ['In this browser', 'Not re-run']]);
      note(p, c.unavailable).classList.add('withheld');
      return;
    }
    await ctx.run(`propagator/hpop: ${c.orbit} ${c.forces}`, async () => {
      const r = await runOrekitCase(hpop, c);
      const recorded = results.cases.find((x) => x.id === c.id).worstM;
      tiles(p, [['Largest difference', formatMeters(r.worst, 3)], ['At', `${r.worstAt} h`], ['Tolerance', formatMeters(c.toleranceM)], ['Recorded run', formatMeters(recorded, 3)], ['In this browser', `${r.seconds.toFixed(2)} s`]]);
      figure.draw({ series: [{ name: 'HPOP − Orekit', color: 'var(--accent)', points: r.differences.filter((d) => d[1] > 0), markers: true }],
        x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (h) => `${h} h` } });
      // HPOP's path between its hourly samples (the same request, every 2 min),
      // Orekit's hourly states, and HPOP − Orekit at each hour, magnified.
      const track = await resampled(hpop, r.inputs, Array.from({ length: 720 }, (_, k) => (k + 1) * 120));
      const orekit = c.samples.map(([, x, y, z]) => [x / 1000, y / 1000, z / 1000]);
      const hpopHourly = [orekit[0], ...r.samples.map((q) => q.position)];
      const gaps = hpopHourly.map((p, k) => v3.sub(p, orekit[k]));
      const mag = magnification(Math.max(...gaps.map(v3.norm)), Math.max(...orekit.map(v3.norm)) * 0.6);
      const epochMs = Date.parse(`${r.samples[0].epoch.replace(/Z$/, '')}Z`) - 3600e3;
      const basis = (k) => { const q = r.samples[Math.max(0, k - 1)]; return rtn(q.position, q.velocity); };
      const items = gaps.map((d, k) => ({ c: toRtn(basis(k), d), label: k && k % 12 === 0 ? `${k} h · ${formatMeters(v3.norm(d) * 1000, 2)}` : null }));
      await view.draw((g) => {
        g.track(track, { color: 'accent', width: 2, alpha: 0.85, subdivide: 2 });
        orekit.forEach((p) => g.point(p, { color: 'cyan', size: 5, outline: 1 }));
        g.trail(orekit[24], basis(24), items, mag.k, { color: 'text' });
        const [Re, , Ne] = basis(24);
        g.view({ direction: v3.unit(v3.add(v3.scale(Re, 0.75), v3.scale(Ne, 0.65))) });
      }, { frame: 'GCRF', epochMs, caption: `GCRF; HPOP − Orekit hour by hour, drawn at the 24 h state, ${mag.label}`,
        legend: [['accent', 'HPOP'], ['cyan', 'Orekit 13.1, hourly', 'dot'], ['text', `HPOP − Orekit, ${mag.label}`]] });
      return `${c.orbit}, ${c.forces}: ${formatMeters(r.worst, 3)} from Orekit at worst, ${r.worst <= c.toleranceM ? 'within' : 'outside'} its ${formatMeters(c.toleranceM)} tolerance; the recorded run had ${formatMeters(recorded, 3)}.`;
    });
  }
  await one();
}
