// Section 17.2: a V1 seed through HPOP for 72 h in any configuration,
// against the precise orbit, and against the committed V1 result.
import { formatMeters } from '../../chart.js';
import { runV1Seed } from '../../runs.js';
import { chart, inputs, panel, table, tiles } from '../ui.js';
import { magnification, rtn, scene3d, toRtn, v3 } from '../scene.js';

const NAMES = { lageos1: 'LAGEOS-1', lageos2: 'LAGEOS-2', etalon1: 'ETALON-1', etalon2: 'ETALON-2' };
const objectName = (o) => NAMES[o] ?? (o.startsWith('gps-') ? `GPS · NORAD ${o.slice(4)}` : o);

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
  const view = scene3d(ctx, { title: 'Propagated against the precise orbit', caption: 'GCRF, 72 h; the error at each truth sample, magnified' });
  const figure = chart(ctx.root, '3D error against the precise orbit', 'This run, and the V1 median of its group');
  const summary = panel(ctx.root, 'V1 medians, every seed');
  table(summary, ['Configuration', 'SLR 24 h', 'SLR 72 h', 'GPS 24 h'], [...Object.keys(config.configurations), 'R-20'].map((c) => {
    const m = (g, h) => formatMeters(metrics.summary.find((r) => r.group === g && r.configuration === c)?.[`${h}h`]?.medianM);
    return { class: c === 'E-f' ? 'highlight' : '', cells: [c, m('SLR', 24), m('SLR', 72), m('GPS', 24)] };
  }));
  const [hpop, time] = await Promise.all([ctx.module('propagator/hpop'), ctx.module('foundation/time')]);
  async function one() {
    const v = form.values();
    const seed = seeds[Number(v.seed)];
    await ctx.run(`propagator/hpop: ${objectName(seed.object)}, ${v.cfg}, 72 h`, async () => {
      const r = await runV1Seed({ hpop, time, seed, config, metrics, cfgName: v.cfg, onStatus: ctx.status });
      const at = (h) => r.rows.find((x) => Math.abs(x.hours - h) < 1e-9)?.errorM;
      tiles(p, [['1 h', formatMeters(at(1))], ['24 h', formatMeters(at(24))], ['72 h', formatMeters(at(72))], ['In this browser', `${r.seconds.toFixed(1)} s`]]);
      const medians = metrics.summary.find((x) => x.group === seed.group && x.configuration === v.cfg);
      figure.draw({ series: [
        { name: `V1 median, ${seed.group}`, color: 'var(--series-muted)', markers: true, points: config.horizonsHours.map((h) => [h, medians[`${h}h`].medianM]) },
        { name: 'This run', color: 'var(--accent)', points: r.rows.map((x) => [Number(x.hours.toFixed(4)), x.errorM]), label: true },
      ], x: { min: 0, max: 72, ticks: [0, 24, 48, 72], format: (h) => `${Number(h.toFixed(2))} h` } });
      const t0 = seed.seedUnixMs;
      const truth = [[0, r.s0.position], ...r.rows.map((x) => [(x.ms - t0) / 1000, x.truth])];
      const run = [[0, r.s0.position], ...r.rows.map((x) => [(x.ms - t0) / 1000, x.hpop])];
      // HPOP − truth at every truth sample, in the radial, in-track and
      // cross-track axes of the moment, drawn at the last sample.
      const basisAt = (k) => rtn(r.run.samples[k].position, r.run.samples[k].velocity);
      const items = r.rows.map((x, k) => ({ c: toRtn(basisAt(k), v3.sub(x.hpop, x.truth)),
        label: [24, 48, 72].some((h) => Math.abs(x.hours - h) < 1e-6) ? `${Math.round(x.hours)} h · ${formatMeters(x.errorM)}` : null }));
      const last = r.rows.at(-1);
      const mag = magnification(Math.max(...r.rows.map((x) => x.errorM)) / 1000, v3.norm(r.s0.position) * 0.45);
      await view.draw((g) => {
        g.track(truth, { color: 'cyan', width: 2, alpha: 0.75, subdivide: 4 });
        g.track(run, { color: 'accent', width: 1.5, alpha: 0.75, subdivide: 4, frame: false });
        g.trail(last.truth, basisAt(r.rows.length - 1), items, mag.k, { color: 'text', width: 2 });
        g.point(r.s0.position, { color: 'sat', size: 9, label: 'Seed', labelOptions: { above: true } });
        const [Re, , Ne] = basisAt(r.rows.length - 1);
        g.view({ direction: v3.unit(v3.add(v3.scale(Re, 0.6), v3.scale(Ne, 0.8))) });
      }, { frame: 'GCRF', epochMs: t0, caption: `GCRF, ${objectName(seed.object)}, 72 h; HPOP − truth at each sample, drawn at the last, ${mag.label}`,
        legend: [['cyan', seed.group === 'SLR' ? 'ILRS precise orbit' : 'IGS precise orbit'], ['accent', `HPOP, ${v.cfg}`], ['text', `HPOP − truth, ${mag.label}`]] });
      const verdict = r.reproduced === null ? '' : r.reproduced === 0 ? ` It reproduces results/v1 exactly at all ${r.compared} horizons.` : ` It reproduces results/v1 to ${formatMeters(r.reproduced, 3)}.`;
      return `${objectName(seed.object)}, ${v.cfg}: ${formatMeters(at(24))} after a day, ${formatMeters(at(72))} after three.${verdict}`;
    });
  }
  await one();
}
