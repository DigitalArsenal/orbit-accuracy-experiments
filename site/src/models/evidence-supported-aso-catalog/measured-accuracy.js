// Section 10, measured accuracy: the median 3D error of each product against
// precise orbits, by object class and age, as the experiments committed it
// (E3's test window, E6's laser-ranged fits), drawn at one real satellite of
// each class on its precise orbit (IGS, ILRS, Copernicus). Every number is a
// committed aggregate and every orbit a published product; the page draws.
import { formatMeters } from '../../chart.js';
import { credits, inputs, num, panel, table } from '../ui.js';
import { scene3d } from '../scene.js';

const AGES = [[0, 'At issue'], [1, '1 day'], [3, '3 days'], [7, '7 days']];
const ORBIT_FILES = ['gps', 'lageos1', 'starlette', 'sentinel-1c'].map((id) => `data/accuracy/orbit-${id}.json`);

export default async function run(ctx) {
  const [data, ...orbits] = await Promise.all([ctx.fetchJson('./data/accuracy/measured.json'), ...ORBIT_FILES.map((f) => ctx.fetchJson(`./${f}`))]);
  const byId = Object.fromEntries(data.orbits.map((o, k) => [o.id, { ...o, ...orbits[k] }]));
  const p = panel(ctx.root, 'Class and age');
  const classes = data.orbits.filter((o) => data.rows.some((r) => r.orbit === o.id));
  const form = inputs(p, [
    { id: 'orbit', label: 'Satellite', type: 'select', value: 'gps', options: classes.map((o) => [o.id, `${o.name} · ${data.rows.find((r) => r.orbit === o.id).cls}`]) },
    { id: 'age', label: 'Prediction age', type: 'select', value: 1, options: AGES.map(([d, t]) => [d, t]) },
  ], () => draw());
  const where = scene3d(ctx, { title: 'One satellite of each class, on its precise orbit', caption: 'GCRF' });
  const view = scene3d(ctx, { title: 'Each product’s median error, at the satellite', caption: 'Radial, in-track and cross-track of the precise state (m)' });
  const results = panel(ctx.root, 'Median 3D error against precise orbits');
  table(results, ['Class (objects)', 'Product', ...AGES.map(([, t]) => t), 'Evidence'], data.rows.map((r) => ({
    class: r.catalog ? 'highlight' : '',
    cells: [r.cls, r.product, ...AGES.map(([d]) => ({ text: formatMeters(r.values[d].medianKm * 1000), title: `95 % interval ${formatMeters(r.values[d].lowerKm * 1000)} to ${formatMeters(r.values[d].upperKm * 1000)}; n = ${num(r.values[d].n)}` })), r.experiment],
  })));
  await credits(ctx, ctx.root, ['data/accuracy/measured.json', ...ORBIT_FILES]);

  // Each product's median error at the satellite, split over the radial,
  // in-track and cross-track axes of its precise state by its share of the
  // squared error (the semi-axes add in quadrature to the median), in metres
  // at true scale, with the satellite at the origin.
  async function draw() {
    const { orbit } = form.values(), age = Number(form.values().age);
    const o = byId[orbit], ageText = AGES.find(([d]) => d === age)[1];
    await ctx.run(`Drawing ${o.name}, ${ageText.toLowerCase()}`, async () => {
      const rows = data.rows.filter((x) => x.orbit === o.id);
      const shapes = rows.map((row) => {
        const e = row.values[age];
        return { row, e, semi: [0, 1, 2].map((i) => e.medianKm * 1000 * Math.sqrt(e.shareRtn[i])) };
      });
      const reach = Math.max(...shapes.flatMap((x) => x.semi));
      const epochMs = Date.parse(data.epoch);
      await where.draw((g) => {
        g.earth();
        for (const each of Object.values(byId)) {
          const samples = each.epochsUnixMs.map((ms, k) => [(ms - epochMs) / 1000, each.position.slice(3 * k, 3 * k + 3)]);
          const chosen = each.id === o.id;
          g.track(samples, { color: chosen ? 'accent' : 'muted', alpha: chosen ? 1 : 0.7, width: chosen ? 2.5 : 1.2, subdivide: each.id === 'gps' ? 8 : 2 });
          g.point(each.position.slice(0, 3), { color: chosen ? 'accent' : 'muted', size: chosen ? 10 : 6, label: each.name, labelColor: chosen ? 'accent' : 'muted' });
        }
        g.view({ preset: '3d' });
      }, { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal',
        caption: `GCRF at ${data.epoch.replace('T', ' ').replace(':00Z', ' UTC')}; one revolution of each precise orbit (IGS, ILRS, Copernicus) from the satellite's state then; the Earth at 6,378 km`,
        legend: [['accent', o.name], ['muted', 'The other classes'], ['earth', 'Earth, 6,378.137 km']] });
      await view.draw((g) => {
        g.line([[0, -reach * 1.15, 0], [0, reach * 1.15, 0]], { color: 'muted', width: 1.5, alpha: 0.8, frame: false });
        g.label([0, reach * 1.15, 0], 'Along the precise orbit', { color: 'muted', size: 11, weight: 500 });
        shapes.forEach(({ row, e, semi }, k) => {
          const color = row.catalog ? 'accent' : 'cyan';
          const name = row.catalog ? row.product : 'Public OMM, SGP4';
          const axes = [[semi[0], 0, 0], [0, semi[1], 0], [0, 0, semi[2]]];
          if (Math.max(...semi) > reach * 0.004) g.ellipsoid([0, 0, 0], axes, { color, alpha: row.catalog ? 0.6 : 0.25, outline: true });
          else g.point([0, 0, 0], { color, size: 9, outline: 1 });
          g.label([0, Math.max(semi[1], reach * 0.02) * (k % 2 ? -1 : 1), 0], `${name} · ${formatMeters(e.medianKm * 1000)}`, { color, size: 12, above: true, align: k % 2 ? 'right' : 'left' });
        });
        g.point([0, 0, 0], { color: 'sat', size: 6, outline: 1, label: o.name, labelOptions: { dy: 16 } });
        g.view({ preset: '3d' });
      }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'equal',
        caption: `${o.name} on its ${o.product}, at ${data.epoch.replace('T', ' ').replace(':00Z', ' UTC')}; each product's median error ${age ? `${ageText} after issue` : 'at issue'}, along radial, in-track and cross-track by its share of the squared error (m, true scale)`,
        legend: [['accent', 'The catalog’s product', 'solid'], ['cyan', 'Public OMM, SGP4', 'solid'], ['muted', 'Along the precise orbit']] });
      return `${o.name}, ${ageText.toLowerCase()}: ${shapes.map(({ row, e }) => `${row.catalog ? row.product.toLowerCase() : 'the public OMM'} ${formatMeters(e.medianKm * 1000)}`).join(' against ')} (median, ${rows[0].experiment}).`;
    });
  }
  await draw();
}
