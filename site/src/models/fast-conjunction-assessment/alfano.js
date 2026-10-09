// Alfano's maximum probability for a miss distance and combined radius,
// from analysis/conjunction-assessment alfano_max_probability, across miss
// distances and radii.
import { formatMeters } from '../../chart.js';
import { alfanoRequest, decodeCqr, output } from '../codec/cqr.js';
import { chart, inputs, num, panel, table, tiles } from '../ui.js';

const MISSES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const RADII = [5, 10, 20, 30];

export default async function run(ctx) {
  const p = panel(ctx.root, 'One event');
  const form = inputs(p, [
    { id: 'miss', label: 'Miss distance (m)', value: 250, min: 0.1 },
    { id: 'radius', label: 'Combined radius (m)', value: 10, min: 0.1 },
  ], () => single());
  const figure = chart(ctx.root, 'Maximum probability against miss distance', 'One line per combined radius; computed by the module');
  const box = panel(ctx.root, 'At 5 km, the screening threshold');
  const ca = await ctx.module('analysis/conjunction-assessment');
  const alfano = async (miss, radius) => decodeCqr(output(await ca.invoke('alfano_max_probability', [alfanoRequest(miss, radius)]), 'result')).ALFANO_RESULT;

  async function single() {
    const { miss, radius } = form.values();
    await ctx.run('analysis/conjunction-assessment alfano_max_probability', async () => {
      const r = await alfano(miss, radius);
      tiles(p, [['Maximum probability', num(r.MAXIMUM_PROBABILITY, 3)], ['Worst-case σ', formatMeters(r.SIGMA_STAR_M)], ['Dilution threshold', formatMeters(r.DILUTION_THRESHOLD_M)]]);
      return `Without a covariance, no σ gives more than ${num(r.MAXIMUM_PROBABILITY, 3)} for a ${formatMeters(miss)} miss and a ${formatMeters(radius)} combined radius.`;
    });
  }

  await ctx.run('Sweeping miss distance and radius in the module', async () => {
    const series = [];
    const rows = [];
    for (const radius of RADII) {
      const points = [];
      for (const miss of MISSES) points.push([miss, (await alfano(miss, radius)).MAXIMUM_PROBABILITY]);
      series.push({ name: `${radius} m`, color: radius === 10 ? 'var(--accent)' : radius === 30 ? 'var(--cyan)' : 'var(--series-muted)', points, label: true, labelText: `${radius} m` });
      rows.push([`${radius} m`, num(points.at(-1)[1], 3)]);
    }
    figure.draw({ series, x: { min: 10, max: 5000, scale: 'log', ticks: [10, 100, 1000, 5000], format: (m) => formatMeters(m) },
      y: { format: (v) => (v === 1 ? "1" : `1e${Math.round(Math.log10(v))}`), value: (v) => num(v, 3) } });
    table(box, ['Combined radius', 'Maximum probability'], rows);
  });
  await single();
}
