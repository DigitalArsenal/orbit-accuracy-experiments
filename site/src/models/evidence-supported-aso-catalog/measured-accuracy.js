// Section 11, measured accuracy: the median 3D error of each product against
// precise orbits, by object class and age, as the experiments committed it
// (E3's test window, E6's laser-ranged fits), drawn at one real satellite of
// each class on its precise orbit (IGS, ILRS, Copernicus). Every number is a
// committed aggregate and every orbit a published product; the page draws.
import { formatMeters } from '../../chart.js';
import { credits, inputs, num, panel, table } from '../ui.js';
import { magnification, rtn, scene3d, v3 } from '../scene.js';

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
  const view = scene3d(ctx, { title: 'Each product’s median error, at the satellite', caption: 'GCRF; the precise orbit; error ellipsoids at true scale' });
  const results = panel(ctx.root, 'Median 3D error against precise orbits');
  table(results, ['Class (objects)', 'Product', ...AGES.map(([, t]) => t), 'Evidence'], data.rows.map((r) => ({
    class: r.catalog ? 'highlight' : '',
    cells: [r.cls, r.product, ...AGES.map(([d]) => ({ text: formatMeters(r.values[d].medianKm * 1000), title: `95 % interval ${formatMeters(r.values[d].lowerKm * 1000)} to ${formatMeters(r.values[d].upperKm * 1000)}; n = ${num(r.values[d].n)}` })), r.experiment],
  })));
  await credits(ctx, ctx.root, ['data/accuracy/measured.json', ...ORBIT_FILES]);

  // The satellite at the epoch on its precise orbit, its radial, in-track and
  // cross-track axes, and each product's median error split over those axes
  // by its share of the squared error (the semi-axes add in quadrature to
  // the median), all at true scale.
  async function draw() {
    const { orbit } = form.values(), age = Number(form.values().age);
    const o = byId[orbit], ageText = AGES.find(([d]) => d === age)[1];
    await ctx.run(`Drawing ${o.name}, ${ageText.toLowerCase()}`, async () => {
      const epochMs = Date.parse(data.epoch);
      const r = o.position.slice(0, 3), v = o.velocity.slice(0, 3), basis = rtn(r, v);
      const rows = data.rows.filter((x) => x.orbit === o.id);
      const shapes = rows.map((row) => {
        const e = row.values[age];
        return { row, e, axes: basis.map((b, i) => v3.scale(b, e.medianKm * Math.sqrt(e.shareRtn[i]))) };
      });
      const reach = Math.max(...shapes.flatMap((x) => x.axes.map(v3.norm)));
      await view.draw((g) => {
        const samples = o.epochsUnixMs.map((ms, k) => [(ms - epochMs) / 1000, o.position.slice(3 * k, 3 * k + 3)]);
        g.track(samples, { color: 'muted', alpha: 0.8, width: 1.5, subdivide: 16, frame: false });
        g.axes(r, basis, reach * 1.3, ['Radial', 'In-track', 'Cross-track'], { color: 'muted', alpha: 0.7, frame: false });
        shapes.forEach(({ row, e, axes }, k) => {
          const color = row.catalog ? 'accent' : 'cyan';
          const name = row.catalog ? row.product : 'Public OMM, SGP4';
          const size = Math.max(...axes.map(v3.norm));
          if (size > reach * 0.004) g.ellipsoid(r, axes, { color, alpha: row.catalog ? 0.6 : 0.25, outline: true, frame: false });
          else g.point(r, { color, size: 9, outline: 1, frame: false });
          const tip = v3.add(r, v3.scale(basis[1], Math.max(size, reach * 0.02) * (k % 2 ? -1 : 1)));
          g.label(tip, `${name} · ${formatMeters(e.medianKm * 1000)}`, { color, size: 12, above: true, align: k % 2 ? 'right' : 'left' });
        });
        g.point(r, { color: 'sat', size: 6, outline: 1, frame: false });
        g.view({ center: r, radius: reach * 1.35, direction: v3.unit(v3.add(v3.scale(basis[0], 0.85), v3.scale(basis[2], 0.5))) });
      }, { frame: 'GCRF', epochMs,
        caption: `GCRF at ${data.epoch.replace('T', ' ').replace(':00Z', ' UTC')}; ${o.name} on its ${o.product}; each product's median error ${age ? `${ageText} after issue` : 'at issue'}, true scale, along radial, in-track and cross-track by its share of the squared error`,
        legend: [['accent', 'The catalog’s product', 'solid'], ['cyan', 'Public OMM, SGP4', 'solid'], ['muted', 'Precise orbit']] });
      return `${o.name}, ${ageText.toLowerCase()}: ${shapes.map(({ row, e }) => `${row.catalog ? row.product.toLowerCase() : 'the public OMM'} ${formatMeters(e.medianKm * 1000)}`).join(' against ')} (median, ${rows[0].experiment}).`;
    });
  }
  await draw();
}
