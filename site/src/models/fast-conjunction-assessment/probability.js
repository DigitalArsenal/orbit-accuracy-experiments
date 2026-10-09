// Foster's probability on supplied covariance (compute_pc) as the
// covariance grows, against Alfano's maximum for the same miss distance
// (alfano_max_probability): probability dilution. Both from
// analysis/conjunction-assessment; the page only sweeps σ.
import { formatMeters } from '../../chart.js';
import { alfanoRequest, decodeCqr, output, probabilityRequest } from '../codec/cqr.js';
import { chart, inputs, num, panel, tiles } from '../ui.js';
import { drawPlane } from '../encounter-plane.js';
import { scene3d } from '../scene.js';

const SIGMAS = Array.from({ length: 41 }, (_, k) => 10 ** (0 + k * 0.1));  // 1 m to 10 km

export default async function run(ctx) {
  const p = panel(ctx.root, 'Encounter plane');
  const form = inputs(p, [
    { id: 'miss', label: 'Miss distance (m)', value: 500, min: 0 },
    { id: 'radius', label: 'Combined radius (m)', value: 10, min: 0.1 },
    { id: 'sigma', label: 'σ in-plane (m)', value: 300, min: 0.1 },
    { id: 'ratio', label: 'Aspect σξ : σζ', value: 3, min: 1 },
  ], () => compute());
  const view = scene3d(ctx, { title: 'This covariance, and the one that peaks', earth: false });
  const figure = chart(ctx.root, 'Probability against covariance size', 'Foster, in the module, for the miss distance above; the line is Alfano’s maximum');
  const ca = await ctx.module('analysis/conjunction-assessment');
  const foster = async (miss, sigma, ratio, radius) => decodeCqr(output(await ca.invoke('compute_pc', [probabilityRequest({
    xi: miss, zeta: 0, varXi: (sigma * ratio) ** 2, varZeta: sigma ** 2, radius }, 'FOSTER')]), 'result')).PROBABILITY_RESULT;
  const alfano = async (miss, radius) => decodeCqr(output(await ca.invoke('alfano_max_probability', [alfanoRequest(miss, radius)]), 'result')).ALFANO_RESULT;

  async function compute() {
    const { miss, radius, sigma, ratio } = form.values();
    await ctx.run('analysis/conjunction-assessment compute_pc', async () => {
      const [one, max] = await Promise.all([foster(miss, sigma, ratio, radius), alfano(miss, radius)]);
      tiles(p, [['Foster probability', num(one.PROBABILITY, 3)], ['Mahalanobis²', one.HAS_MAHALANOBIS_SQUARED ? num(one.MAHALANOBIS_SQUARED, 3) : '—'],
        ['Alfano maximum', num(max.MAXIMUM_PROBABILITY, 3)], ['Dilution threshold', formatMeters(max.DILUTION_THRESHOLD_M)]]);
      const points = [];
      for (const s of SIGMAS) points.push([s, (await foster(miss, s, ratio, radius)).PROBABILITY]);
      const peak = points.reduce((a, b) => (b[1] > a[1] ? b : a));
      figure.draw({
        series: [
          { name: 'Alfano maximum', color: 'var(--series-muted)', points: [[SIGMAS[0], max.MAXIMUM_PROBABILITY], [SIGMAS.at(-1), max.MAXIMUM_PROBABILITY]], dash: true },
          { name: 'Foster', color: 'var(--accent)', points: points.filter((q) => q[1] > 1e-14), label: true },
        ],
        x: { min: 1, max: 1e4, scale: 'log', ticks: [1, 10, 100, 1000, 10000], format: (m) => `σ ${formatMeters(m)}` },
        y: { min: 1e-12, format: (v) => (v === 1 ? '1' : `1e${Math.round(Math.log10(v))}`), value: (v) => num(v, 3) },
      });
      const side = sigma < peak[0] ? 'below' : 'above';
      await view.draw((g) => drawPlane(g, { miss, radius, sigmaXi: sigma * ratio, sigmaZeta: sigma, extra: [{ sigmaXi: peak[0] * ratio, sigmaZeta: peak[0], color: 'text' }] }),
        { caption: `Foster ${num(one.PROBABILITY, 3)} at σ ${formatMeters(sigma)}; the dashed ellipse is the 1σ at the module’s peak, ${num(peak[1], 3)}`,
          legend: [['accent', 'Hard body and miss'], ['cyan', 'This covariance, 1σ, 2σ, 3σ'], ['text', 'Peak probability, 1σ', 'dash']] });
      return `Foster gives ${num(one.PROBABILITY, 3)} at σ ${formatMeters(sigma)}; it peaks at ${num(peak[1], 3)} near σ ${formatMeters(peak[0])}, and this σ is ${side} it. Past the peak a larger covariance lowers the probability: dilution.`;
    });
  }
  await compute();
}
