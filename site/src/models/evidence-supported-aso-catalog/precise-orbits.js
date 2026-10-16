// Section 7, accuracy against precise orbits: a V1 seed through the current FFM
// binary for 72 h in any configuration, against the precise orbit, and
// against the committed V1 result. Two plot boxes follow one clock: the
// orbit (GCRF, km), and FFM − truth in the radial, in-track and cross-track
// axes of the truth (m); the chart's cursor and the slider set the time.
import { formatMeters } from '../../chart.js';
import { runV1Seed } from '../../runs.js';
import { chart, credits, inputs, panel, table, tiles } from '../ui.js';
import { rtn, scene3d, toRtn, v3 } from '../scene.js';

const HOUR = 3600e3;
const NAMES = { lageos1: 'LAGEOS-1', lageos2: 'LAGEOS-2', etalon1: 'ETALON-1', etalon2: 'ETALON-2' };
const objectName = (o) => NAMES[o] ?? (o.startsWith('gps-') ? `GPS · NORAD ${o.slice(4)}` : o);
const utc = (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default async function run(ctx) {
  const [seeds, metrics, config] = await Promise.all([ctx.fetchJson('./data/v1/seeds.json'), ctx.fetchJson('./data/v1/metrics.json'), ctx.fetchJson('./data/v1/config.json')]);
  const p = panel(ctx.root, 'Seed and forces');
  const objects = [...new Set(seeds.map((s) => s.object))];
  const form = inputs(p, [
    { id: 'object', label: 'Satellite', type: 'select', value: 'lageos1', options: objects.map((o) => [o, objectName(o)]) },
    { id: 'seed', label: 'Seed', type: 'select', value: seeds.find((s) => s.object === 'lageos1').id, options: seeds.map((s) => [s.id, `${objectName(s.object)} ${s.seedUtc.slice(0, 16).replace('T', ' ')}`]) },
    { id: 'cfg', label: 'Force model', type: 'select', value: 'E-f', options: Object.keys(config.configurations).map((c) => [c, c]) },
  ], (event) => {
    if (event.target.id === 'object') { const s = seeds.find((x) => x.object === event.target.value); p.querySelector('#seed').value = s.id; }
    if (event.target.id === 'seed') p.querySelector('#object').value = seeds[Number(event.target.value)].object;
    one();
  });
  const orbit = scene3d(ctx, { title: 'The orbit', caption: 'GCRF; the precise orbit and FFM' });
  const error = scene3d(ctx, { title: 'FFM − the precise orbit', caption: 'Radial, in-track and cross-track of the precise orbit' });
  const figure = chart(ctx.root, '3D error against the precise orbit', 'This run, and the V1 median of its group; drag to move the boxes above in time');
  const summary = panel(ctx.root, 'V1 medians, every seed');
  table(summary, ['Configuration', 'SLR 24 h', 'SLR 72 h', 'GPS 24 h'], [...Object.keys(config.configurations), 'R-20'].map((c) => {
    const m = (g, h) => formatMeters(metrics.summary.find((r) => r.group === g && r.configuration === c)?.[`${h}h`]?.medianM);
    return { class: c === 'E-f' ? 'highlight' : '', cells: [c, m('SLR', 24), m('SLR', 72), m('GPS', 24)] };
  }));
  await credits(ctx, ctx.root, ['data/v1/seeds.json', 'data/v1/metrics.json', ...new Set(seeds.map((s) => `data/truth/${s.object}.json`))]);
  const [ffm, time] = await Promise.all([ctx.module('propagator/ffm'), ctx.module('foundation/time')]);

  // The chart's cursor and the page's clock, in hours from the seed.
  let seedMs = null;
  ctx.time.on((ms) => { if (seedMs !== null) figure.cursor((ms - seedMs) / HOUR); });

  async function one() {
    const v = form.values();
    const seed = seeds[Number(v.seed)];
    await ctx.run(`propagator/ffm: ${objectName(seed.object)}, ${v.cfg}, 72 h`, async () => {
      const r = await runV1Seed({ ffm, time, seed, config, metrics, cfgName: v.cfg, onStatus: ctx.status });
      const at = (h) => r.rows.find((x) => Math.abs(x.hours - h) < 1e-9)?.errorM;
      tiles(p, [['1 h', formatMeters(at(1))], ['24 h', formatMeters(at(24))], ['72 h', formatMeters(at(72))], ['In this browser', `${r.seconds.toFixed(1)} s`]]);
      seedMs = seed.seedUnixMs;
      const medians = metrics.summary.find((x) => x.group === seed.group && x.configuration === v.cfg);
      figure.draw({ series: [
        { name: `V1 median, ${seed.group}`, color: 'var(--series-muted)', markers: true, points: config.horizonsHours.map((h) => [h, medians[`${h}h`].medianM]) },
        { name: 'This run', color: 'var(--accent)', points: r.rows.map((x) => [Number(x.hours.toFixed(4)), x.errorM]), label: true },
      ], x: { min: 0, max: 72, ticks: [0, 24, 48, 72], format: (h) => `${Number(h.toFixed(2))} h` },
      cursor: { x: 72, set: (h) => ctx.time.set(seedMs + h * HOUR) } });

      // Every truth sample: the precise state, FFM's, and FFM − truth in
      // the truth's radial, in-track and cross-track axes (m).
      const rows = r.rows.map((x, k) => ({ ms: x.ms, truth: x.truth, ffm: x.ffm, basis: rtn(x.truth, r.run.samples[k].velocity) }));
      const ric = rows.map((x) => [x.ms, toRtn(x.basis, v3.sub(x.ffm, x.truth)).map((c) => c * 1000)]);
      const truthTrack = [[0, r.s0.position], ...rows.map((x) => [(x.ms - seedMs) / 1000, x.truth])];
      const ffmTrack = [[0, r.s0.position], ...rows.map((x) => [(x.ms - seedMs) / 1000, x.ffm])];
      const span = { startMs: seedMs, stopMs: rows.at(-1).ms, format: (ms) => `${utc(ms)} · +${((ms - seedMs) / HOUR).toFixed(1)} h` };
      await orbit.draw((g) => {
        g.earth();
        g.track(truthTrack, { color: 'cyan', width: 2, alpha: 0.8, subdivide: 4 });
        g.track(ffmTrack, { color: 'accent', width: 1.2, alpha: 0.7, subdivide: 4 });
        g.point(r.s0.position, { color: 'sat', size: 8, label: 'Seed', labelOptions: { above: true } });
        g.moving(rows.map((x) => [x.ms, x.ffm]), { color: 'accent', size: 10, trail: false, label: objectName(seed.object) });
        g.moving(rows.map((x) => [x.ms, x.truth]), { color: 'cyan', size: 7, trail: false });
        g.view({ preset: '3d' });
      }, { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal', time: span,
        caption: `GCRF; ${objectName(seed.object)} from ${utc(seedMs)}, 72 h; ${seed.group === 'SLR' ? 'the ILRS' : 'the IGS'} precise orbit and FFM (${v.cfg}); the Earth at 6,378 km`,
        legend: [['cyan', seed.group === 'SLR' ? 'ILRS precise orbit' : 'IGS precise orbit'], ['accent', `FFM, ${v.cfg}`], ['earth', 'Earth, 6,378.137 km']] });
      await error.draw((g) => {
        g.point([0, 0, 0], { color: 'cyan', size: 8, label: 'Precise orbit', labelColor: 'cyan' });
        g.line(ric.map((q) => q[1]), { color: 'muted', width: 1, alpha: 0.5 });
        g.moving(ric, { color: 'accent', size: 9, trail: 2.5, label: 'FFM' });
        g.vector([0, 0, 0], ric, { color: 'accent', width: 6 });
        g.view({ preset: '3d' });
      }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'normal', time: span,
        caption: `FFM − the precise orbit at each sample, in the radial, in-track and cross-track axes of the precise orbit (m); the trail up to the time shown`,
        legend: [['accent', 'FFM − truth, to the time shown'], ['muted', 'The whole 72 h'], ['cyan', 'The precise orbit (origin)', 'dot']] });
      const verdict = r.reproduced === null ? '' : r.reproduced === 0 ? ` It matches results/v1 exactly at all ${r.compared} horizons.` : ` It differs from results/v1 by up to ${formatMeters(r.reproduced, 3)}.`;
      return `${objectName(seed.object)}, ${v.cfg}: ${formatMeters(at(24))} after a day, ${formatMeters(at(72))} after three.${verdict}`;
    });
  }
  await one();
}
