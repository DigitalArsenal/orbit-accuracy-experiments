// Section 7, agreement with Orekit: any of HPOP's Orekit 13.1 cases, re-run
// here from its exact PRW request against the stored Orekit trajectory.
import { formatMeters } from '../../chart.js';
import { resampled, runOrekitCase } from '../../runs.js';
import { rtn, scene3d, toRtn, v3 } from '../scene.js';
import { chart, credits, inputs, note, num, panel, table, tiles } from '../ui.js';

export default async function run(ctx) {
  const [cases, results] = await Promise.all([ctx.fetchJson('./data/orekit/cases.json'), ctx.fetchJson('./data/orekit/results.json')]);
  const p = panel(ctx.root, 'Case');
  const first = cases.find((c) => /drag/i.test(c.forces) && !c.unavailable) ?? cases.find((c) => !c.unavailable);
  const form = inputs(p, [{ id: 'case', label: 'Orbit and force set', type: 'select', value: first.id, wide: true, options: cases.map((c) => [c.id, `${c.orbit} · ${c.forces}${c.unavailable ? ' · recorded only' : ''}`]) }], () => one());
  const orbit = scene3d(ctx, { title: 'HPOP and Orekit, one day', caption: 'GCRF; HPOP and Orekit’s hourly states' });
  const apart = scene3d(ctx, { title: 'HPOP − Orekit', caption: 'Radial, in-track and cross-track of HPOP’s state' });
  const figure = chart(ctx.root, 'Difference from Orekit over the day', 'Hourly 3D position difference; drag to move the boxes above in time');
  const all = panel(ctx.root, `All ${cases.length}, as recorded`);
  const groups = new Map();
  for (const c of cases) {
    const r = results.cases.find((x) => x.id === c.id);
    const g = groups.get(c.orbit) ?? { n: 0, worst: 0, pass: 0 };
    g.n++; g.worst = Math.max(g.worst, r.worstM); g.pass += r.pass ? 1 : 0;
    groups.set(c.orbit, g);
  }
  table(all, ['Orbit', 'Cases', 'Largest difference', 'Within tolerance'], [...groups].map(([orbit, g]) => [orbit, num(g.n), formatMeters(g.worst, 3), `${g.pass} of ${g.n}`]));
  await credits(ctx, ctx.root, ['data/orekit/cases.json', 'data/orekit/orekit-reference.json', 'data/orekit/results.json']);
  const hpop = await ctx.module('propagator/hpop');
  let t0 = null;
  ctx.time.on((ms) => { if (t0 !== null) figure.cursor((ms - t0) / 3600e3); });
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
      const epochMs = Date.parse(`${r.samples[0].epoch.replace(/Z$/, '')}Z`) - 3600e3;
      t0 = epochMs;
      figure.draw({ series: [{ name: 'HPOP − Orekit', color: 'var(--accent)', points: r.differences.filter((d) => d[1] > 0), markers: true }],
        x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (h) => `${h} h` },
        cursor: { x: 24, set: (h) => ctx.time.set(t0 + h * 3600e3) } });
      // HPOP's path between its hourly samples (the same request, every 2 min),
      // Orekit's hourly states, and HPOP − Orekit at each hour in the radial,
      // in-track and cross-track axes of HPOP's state (mm).
      const track = await resampled(hpop, r.inputs, Array.from({ length: 720 }, (_, k) => (k + 1) * 120));
      const orekit = c.samples.map(([, x, y, z]) => [x / 1000, y / 1000, z / 1000]);
      const hpopHourly = [orekit[0], ...r.samples.map((q) => q.position)];
      const basis = (k) => { const q = r.samples[Math.max(0, k - 1)]; return rtn(q.position, q.velocity); };
      const gaps = hpopHourly.map((p, k) => [epochMs + k * 3600e3, toRtn(basis(k), v3.sub(p, orekit[k])).map((x) => x * 1e6)]);
      const span = { startMs: epochMs, stopMs: epochMs + 24 * 3600e3, format: (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC · +${((ms - epochMs) / 3600e3).toFixed(1)} h` };
      await orbit.draw((g) => {
        g.earth();
        g.track(track, { color: 'accent', width: 1.5, alpha: 0.85, subdivide: 2 });
        orekit.forEach((p) => g.point(p, { color: 'cyan', size: 5, outline: 1 }));
        g.moving(track.map(([t, p]) => [epochMs + t * 1000, p]), { color: 'accent', size: 10, trail: false, label: 'HPOP' });
        g.view({ preset: '3d' });
      }, { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal', time: span,
        caption: `GCRF; ${c.orbit}, ${c.forces}, 24 h; HPOP every 2 min and Orekit 13.1 every hour; the Earth at 6,378 km`,
        legend: [['accent', 'HPOP'], ['cyan', 'Orekit 13.1, hourly', 'dot'], ['earth', 'Earth, 6,378.137 km']] });
      await apart.draw((g) => {
        g.point([0, 0, 0], { color: 'cyan', size: 8, label: 'Orekit', labelColor: 'cyan' });
        g.line(gaps.map((q) => q[1]), { color: 'muted', width: 1, alpha: 0.6 });
        gaps.forEach(([, d]) => g.point(d, { color: 'muted', size: 4, outline: 0 }));
        g.moving(gaps, { color: 'accent', size: 9, trail: 2.5, degree: 1, label: 'HPOP' });
        g.vector([0, 0, 0], gaps, { color: 'accent', width: 6 });
        g.view({ preset: '3d' });
      }, { axes: ['Radial (mm)', 'In-track (mm)', 'Cross-track (mm)'], aspect: 'normal', time: span,
        caption: `HPOP − Orekit at each hour, in the radial, in-track and cross-track axes of HPOP’s state (mm); the trail up to the time shown`,
        legend: [['accent', 'HPOP − Orekit, to the time shown'], ['muted', 'Each hour']] });
      return `${c.orbit}, ${c.forces}: ${formatMeters(r.worst, 3)} from Orekit at worst, ${r.worst <= c.toleranceM ? 'within' : 'outside'} its ${formatMeters(c.toleranceM)} tolerance; the recorded run had ${formatMeters(recorded, 3)}.`;
    });
  }
  await one();
}
