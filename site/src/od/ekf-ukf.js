// The same observations through analysis/estimation's extended and unscented
// Kalman filters. Both start from the catalog prediction with a prior as
// loose as chosen; the page draws each filter's covariance as it shrinks
// update by update, and where the two differ: early, while the prior is
// wide enough for the measurement functions to curve inside it.
import { formatMeters } from '../chart.js';
import { chart, inputs, num, panel, table, tiles, note } from '../models/ui.js';
import { covarianceAxes, rtn, rtnCovariance, scene3d, v3 } from '../models/scene.js';
import { FIT_EPOCH, busiest, estimate, fitInputs, hpopRun, loadScenario, simulate } from './scenario.js';
import { isoMicro, utcMs } from './codec.js';

const pos3 = (P) => [P[0], P[1], P[2], P[6], P[7], P[8], P[12], P[13], P[14]];
const PRIORS = [[1e2, 'σ ×10 (about 0.5 km)'], [1e4, 'σ ×100 (about 5 km)'], [1e6, 'σ ×1,000 (about 50 km)'], [1e8, 'σ ×10,000 (about 500 km)']];

export default async function run(ctx) {
  const setup = panel(ctx.root, 'Prior');
  const form = inputs(setup, [
    { id: 'prior', label: 'A priori covariance: the catalog’s, scaled', type: 'select', value: 1e6, options: PRIORS },
  ], () => compute());
  const view = scene3d(ctx, { title: 'EKF and UKF covariance through the pass', caption: '' });
  const sigmaChart = chart(ctx.root, 'Position σ after each update', '3-D, from each filter’s covariance; log scale; drag to move the box above in time');
  const nisChart = chart(ctx.root, 'Normalized innovation squared', 'Per update; chi-square with the measurement’s dimension when the filter is consistent');
  const result = panel(ctx.root, 'At the last update');

  let sc, sim, inputsOd, runs;
  await ctx.run('analysis/observation-simulator: observations of the IGS orbits', async () => { sc = await loadScenario(ctx); sim = await simulate(ctx, sc); });
  await ctx.run('foundation/frames: site positions; propagator/hpop: the nominal and its STM', async () => { inputsOd = await fitInputs(ctx, sc, sim, busiest(sc, sim)); });
  if (!inputsOd) return;
  const hours = (e) => (e.jdDay - 2440587.5) * 24 + e.seconds / 3600 - utcMs(FIT_EPOCH) / 3600e3;
  const sigma3d = (h) => Math.sqrt(h.filteredCovariance[0] + h.filteredCovariance[7] + h.filteredCovariance[14]);
  const t0 = utcMs(FIT_EPOCH);
  ctx.time.on((ms) => sigmaChart.cursor((ms - t0) / 3600e3));

  async function compute() {
    const scale = Number(form.values().prior);
    await ctx.run('analysis/estimation: EXTENDED_KALMAN_FILTER and UNSCENTED_KALMAN_FILTER', async () => {
      const [ekf, ukf] = [await estimate(ctx, inputsOd, 'EXTENDED_KALMAN_FILTER', { covarianceScale: scale }), await estimate(ctx, inputsOd, 'UNSCENTED_KALMAN_FILTER', { covarianceScale: scale })];
      // Each filter's last state, carried by HPOP to the next IGS epoch, against the IGS orbit.
      const truthBlock = sc.truth.find((b) => b.norad === inputsOd.norad);
      const lastMs = utcMs(FIT_EPOCH) + hours(ekf.estimate.epoch) * 3600e3;
      const node = truthBlock.states.find((s) => utcMs(s.epoch) > lastMs);
      const carry = async (r) => {
        const last = r.filterHistory.at(-1);
        const [s] = await hpopRun(ctx, sc, { epoch: isoMicro(lastMs), position: last.filteredState.slice(0, 3).map((v) => v / 1000), velocity: last.filteredState.slice(3).map((v) => v / 1000),
          samples: [isoMicro(utcMs(node.epoch))], covariance: last.filteredCovariance.map((v) => v / 1e6) });
        const basis = rtn(node.state.slice(0, 3), node.state.slice(3));
        const C = rtnCovariance(basis, pos3(s.covariance));
        return { error: v3.norm(v3.sub(s.position, node.state.slice(0, 3))) * 1000, sigma: Math.sqrt(C[0] + C[4] + C[8]) * 1000 };
      };
      runs = { ekf, ukf, at: node.epoch, ekfCheck: await carry(ekf), ukfCheck: await carry(ukf) };
    });
    if (!runs) return;
    const { ekf, ukf } = runs;
    sigmaChart.draw({
      series: [
        { name: 'UKF', color: 'var(--cyan)', points: ukf.filterHistory.map((h) => [hours(h.epoch), sigma3d(h)]), label: true },
        { name: 'EKF', color: 'var(--accent)', points: ekf.filterHistory.map((h) => [hours(h.epoch), sigma3d(h)]), label: true },
      ],
      x: { min: 0, max: 4, ticks: [0, 1, 2, 3, 4], format: (h) => `${h} h` },
      cursor: { x: 0, set: (h) => ctx.time.set(t0 + h * 3600e3) },
    });
    nisChart.draw({
      series: [
        { name: 'UKF', color: 'var(--cyan)', points: ukf.filterHistory.map((h) => [hours(h.epoch), Math.max(h.normalizedInnovationSquared, 1e-4)]), markers: true, width: 0 },
        { name: 'EKF', color: 'var(--accent)', points: ekf.filterHistory.map((h) => [hours(h.epoch), Math.max(h.normalizedInnovationSquared, 1e-4)]), markers: true, width: 0 },
      ],
      x: { min: 0, max: 4, ticks: [0, 1, 2, 3, 4], format: (h) => `${h} h` },
      y: { format: (v) => (v >= 1 ? String(v) : v.toExponential(0)), value: (v) => num(v, 3) },
    });
    let worst = 0, worstAt = 0;
    ekf.filterHistory.forEach((h, k) => { const r = Math.abs(sigma3d(ukf.filterHistory[k]) / sigma3d(h) - 1); if (r > worst) { worst = r; worstAt = k; } });
    table(result, ['', 'EKF', 'UKF'], [
      ['3-D σ after the last update', formatMeters(sigma3d(ekf.filterHistory.at(-1))), formatMeters(sigma3d(ukf.filterHistory.at(-1)))],
      [`|state − IGS| at ${runs.at.slice(11, 19)} UTC (HPOP from the last update)`, formatMeters(runs.ekfCheck.error), formatMeters(runs.ukfCheck.error)],
      ['3-D σ there', formatMeters(runs.ekfCheck.sigma), formatMeters(runs.ukfCheck.sigma)],
      ['Mean NIS', num(mean(ekf.filterHistory.map((h) => h.normalizedInnovationSquared)), 3), num(mean(ukf.filterHistory.map((h) => h.normalizedInnovationSquared)), 3)],
    ], { existing: result.querySelector('table') ?? undefined });
    tiles(result, [['Updates', num(ekf.filterHistory.length)], ['Largest σ difference', `${num(100 * worst, 3)} % at update ${worstAt + 1}`]]);
    note(result, 'Both filters linearize the dynamics about the same nominal with HPOP’s STM; they differ in the measurement update. The unscented one passes sigma points through the range, range-rate and RA/Dec functions, so it differs from the extended one while the covariance is wide enough for those functions to curve inside it; once the data has shrunk it, the two agree.');
    await drawScene(worstAt);
  }

  // Each filter's 1σ position covariance after the update at the page's
  // time, in the radial, in-track and cross-track axes of the EKF's state then
  // (m); the box fits the update shown, so its scale follows the covariance
  // down through the pass.
  let shownK = -1, wantK = null, drawing = false;
  const msOf = (h) => t0 + hours(h.epoch) * 3600e3;
  const updateAt = (ms) => Math.max(0, runs.ekf.filterHistory.findLastIndex((h) => msOf(h) <= ms + 1));
  async function drawUpdate(k) {
    const { ekf, ukf } = runs;
    const he = ekf.filterHistory[k], hu = ukf.filterHistory[k];
    const basis = rtn(he.filteredState.slice(0, 3), he.filteredState.slice(3));
    const axesOf = (h) => covarianceAxes(rtnCovariance(basis, pos3(h.filteredCovariance)));
    const span = { startMs: msOf(ekf.filterHistory[0]), stopMs: msOf(ekf.filterHistory.at(-1)),
      format: (ms) => `${new Date(ms).toISOString().slice(11, 19)} UTC · after update ${updateAt(ms) + 1} of ${ekf.filterHistory.length}` };
    await view.draw((g) => {
      if (k > 0) g.ellipsoid([0, 0, 0], axesOf(ekf.filterHistory[k - 1]), { color: 'muted', alpha: 0.03, outline: true, outlineAlpha: 0.35, frame: false });
      g.ellipsoid([0, 0, 0], axesOf(hu), { color: 'cyan', alpha: 0.22, outline: true });
      g.ellipsoid([0, 0, 0], axesOf(he), { color: 'accent', alpha: 0.4, outline: true });
      g.point([0, 0, 0], { color: 'text', size: 6, outline: 1 });
      g.view({ preset: '3d' });
    }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'normal', time: span,
      caption: `After update ${k + 1} of ${ekf.filterHistory.length} (${new Date(msOf(he)).toISOString().slice(11, 19)} UTC): each filter’s 1σ position covariance in the radial, in-track and cross-track axes of the EKF’s state (m; each axis to its own scale; the box fits this update); the outline is the update before`,
      legend: [['accent', `EKF 1σ · 3-D ${formatMeters(sigma3d(he))}`, 'solid'], ['cyan', `UKF 1σ · ${formatMeters(sigma3d(hu))}`, 'solid'], ['muted', 'The update before, outline']] });
    ctx.status(`Update ${k + 1}: EKF 3-D σ ${formatMeters(sigma3d(he))}, UKF ${formatMeters(sigma3d(hu))}.`);
  }
  // Draws run one at a time; a time that changes meanwhile draws its update next.
  let idle = Promise.resolve();
  function pump() {
    if (drawing) return idle;
    drawing = true;
    idle = (async () => {
      try { while (wantK !== null && wantK !== shownK) { const k = wantK; wantK = null; shownK = k; await drawUpdate(k); } } finally { drawing = false; }
    })();
    return idle;
  }
  ctx.time.on((ms) => { if (!runs) return; wantK = updateAt(ms); pump(); });
  async function drawScene(worstAt) {
    if (!runs) return;
    shownK = -1;
    wantK = Math.max(0, worstAt);
    ctx.time.set(msOf(runs.ekf.filterHistory[Math.max(0, worstAt)]));
    await pump();
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  await compute();
}
