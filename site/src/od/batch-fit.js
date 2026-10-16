// A batch weighted-least-squares fit with its covariance. The simulated
// observations of one GPS satellite (radar range and range rate, optical
// RA/Dec, RF range rate) are fitted by analysis/estimation around the
// catalog's prediction, with propagator/ffm's state-transition matrix; the
// fitted state and covariance are then carried along the arc by FFM and
// compared with the IGS orbit the observations were simulated from.
import { formatMeters } from '../chart.js';
import { chart, num, panel, table, tiles, note } from '../models/ui.js';
import { covarianceAxes, planeNormal, rtn, rtnCovariance, scene3d, toRtn, v3 } from '../models/scene.js';
import { FIT_EPOCH, busiest, estimate, fitInputs, ffmRun, loadScenario, simulate } from './scenario.js';
import { isoMicro, utcMs } from './codec.js';

const SENSOR_COLORS = { 'WTZR-RADAR': 'accent', 'GOLD-OPTICAL': 'cyan', 'YAR2-RF': 'muted' };
const COMPONENTS = { RANGE: ['Range', 1], RANGE_RATE: ['Range rate', 1], RIGHT_ASCENSION_DECLINATION: ['RA, Dec', 2] };
const pos3 = (P) => [P[0], P[1], P[2], P[6], P[7], P[8], P[12], P[13], P[14]];

export default async function run(ctx) {
  const intro = panel(ctx.root, 'Observations and a priori');
  const view = scene3d(ctx, { title: 'The fitted orbit and the observations', caption: '' });
  const errView = scene3d(ctx, { title: 'The fit − the IGS orbit, with its covariance', caption: '' });
  const errChart = chart(ctx.root, 'The fit against the IGS orbit', 'Position error of the fit carried by FFM, and its 3σ from the fitted covariance; drag to move the boxes above in time');
  const resChart = chart(ctx.root, 'Residuals', 'Observed minus fitted, in units of each measurement’s σ');
  const result = panel(ctx.root, 'At the fit epoch');

  let sc, sim, inputs, fit, arc;
  await ctx.run('analysis/observation-simulator: observations of the IGS orbits', async () => { sc = await loadScenario(ctx); sim = await simulate(ctx, sc); });
  await ctx.run('foundation/frames: site positions; propagator/ffm: the nominal and its STM', async () => { inputs = await fitInputs(ctx, sc, sim, busiest(sc, sim)); });
  await ctx.run('analysis/estimation: batch weighted least squares', async () => { fit = await estimate(ctx, inputs, 'BATCH_WEIGHTED_LEAST_SQUARES', { covarianceScale: 100 }); });
  if (!fit) return;
  const truthBlock = sc.truth.find((b) => b.norad === inputs.norad);
  const nodes = truthBlock.states.filter((s) => utcMs(s.epoch) >= utcMs(FIT_EPOCH) && utcMs(s.epoch) <= utcMs(FIT_EPOCH) + 4 * 3600e3);
  const x = fit.estimate.state.map((v) => v / 1000), P = fit.estimate.covariance.map((v) => v / 1e6);
  await ctx.run('propagator/ffm: the fitted state and covariance along the arc', async () => {
    arc = await ffmRun(ctx, sc, { epoch: FIT_EPOCH, position: x.slice(0, 3), velocity: x.slice(3), samples: nodes.slice(1).map((s) => isoMicro(utcMs(s.epoch))), covariance: P });
    arc.unshift({ epoch: FIT_EPOCH, position: x.slice(0, 3), velocity: x.slice(3), covariance: P });
  });
  if (!arc) return;

  const counts = {};
  for (const o of inputs.observations) counts[o.label] = (counts[o.label] ?? 0) + 1;
  const name = `${inputs.block.name} (NORAD ${inputs.norad})`;
  tiles(intro, [['Satellite', name], ...Object.entries(counts).map(([k, v]) => [k, num(v)]), ['Iterations', num(fit.estimate.iterationCount)],
    ['Rejected', num(fit.estimate.rejectedCount)]]);
  note(intro, `Simulated by analysis/observation-simulator from the IGS final orbit (${sc.scenario.truthProduct}), ${sc.scenario.simulation.from.slice(11, 16)}–${sc.scenario.simulation.to.slice(11, 16)} UTC, with the noise each sensor states. `
    + `The fit starts from the catalog’s prediction at ${FIT_EPOCH.slice(11, 19)} UTC (FFM from the IGS state six hours earlier) with its covariance, inflated ×10 in σ as a weak prior, and linearizes about it with FFM’s STM to every observation. Light time is off in the simulation and in the fit.`);

  // Error and covariance at the IGS epochs.
  const rows = arc.map((s, k) => {
    const t = nodes[k].state;
    const basis = rtn(t.slice(0, 3), t.slice(3));
    const e = toRtn(basis, v3.sub(s.position, t.slice(0, 3))).map((c) => c * 1000);
    const sig = (() => { const C = rtnCovariance(basis, pos3(s.covariance)); return [C[0], C[4], C[8]].map((c) => Math.sqrt(c) * 1000); })();
    return { hours: (utcMs(nodes[k].epoch) - utcMs(FIT_EPOCH)) / 3600e3, e, sig, err: Math.hypot(...e), sigma3: 3 * Math.hypot(...sig), basis, s, t };
  });
  // Normalized residuals by measurement type.
  const res = { Range: [], 'Range rate': [], RA: [], Dec: [] };
  let q = 0;
  for (const o of inputs.observations) {
    const hours = (o.ms - utcMs(FIT_EPOCH)) / 3600e3;
    if (o.kind === 'RIGHT_ASCENSION_DECLINATION') {
      res.RA.push([hours, fit.residuals[q] / o.sigmas[0]]);
      res.Dec.push([hours, fit.residuals[q + 1] / o.sigmas[1]]);
    } else res[COMPONENTS[o.kind][0]].push([hours, fit.residuals[q] / o.sigmas[0]]);
    q += COMPONENTS[o.kind][1];
  }
  const all = Object.values(res).flat().map((p) => p[1]);
  const reach = Math.max(3, Math.ceil(Math.max(...all.map(Math.abs))));
  resChart.draw({
    series: Object.entries(res).map(([k, pts], i) => ({ name: k, color: ['var(--accent)', 'var(--cyan)', 'var(--text)', 'var(--series-muted)'][i], points: pts, markers: true, width: 0 })),
    x: { min: 0, max: 4, ticks: [0, 1, 2, 3, 4], format: (h) => `${h} h` },
    y: { scale: 'linear', min: -reach, max: reach, ticks: [-reach, -3, 0, 3, reach].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b), format: (v) => `${v}σ`, value: (v) => `${num(v, 3)}σ` },
  });

  const first = rows[0];
  const prior = toRtn(first.basis, v3.sub(inputs.nominal.slice(0, 3), first.t.slice(0, 3))).map((c) => c * 1000);
  const priorSig = (() => { const C = rtnCovariance(first.basis, pos3(inputs.covariance)); return [C[0], C[4], C[8]].map((c) => Math.sqrt(c) * 1000); })();
  const rms = Math.sqrt(all.reduce((a, b) => a + b * b, 0) / all.length);
  table(result, ['', 'Radial', 'In-track', 'Cross-track', '|error| / 3-D σ'], [
    ['Catalog prediction − IGS', ...prior.map((m) => formatMeters(m)), num(Math.hypot(...prior) / Math.hypot(...priorSig), 3)],
    ['Catalog σ', ...priorSig.map((m) => formatMeters(m)), ''],
    { class: 'highlight', cells: ['Fit − IGS', ...first.e.map((m) => formatMeters(m)), num(first.err / Math.hypot(...first.sig), 3)] },
    { class: 'highlight', cells: ['Fit σ', ...first.sig.map((m) => formatMeters(m)), ''] },
  ]);
  tiles(result, [['Normalized residual RMS', num(rms, 3)], ['|fit − IGS| at epoch', formatMeters(first.err)], ['3-D σ at epoch', formatMeters(Math.hypot(...first.sig))],
    ['Worst |error| / 3σ on the arc', num(Math.max(...rows.map((r) => r.err / r.sigma3)), 3)]]);
  note(result, 'RTN axes of the IGS state. The covariance is the fit’s formal covariance under the stated noise; the catalog prediction’s own error is small here (six hours from a precise state), and the observations, not the prior, set the fit.');

  // 3D: the IGS orbit, the fitted arc and the observation geometry (GCRF,
  // km); and the fit's error against the IGS orbit with its 3σ covariance in
  // the radial, in-track and cross-track axes of the IGS state (m). One clock.
  const t0 = utcMs(FIT_EPOCH);
  const dense = sc.dense.find((d) => d.norad === inputs.norad);
  const truthTrack = dense.epochs.map((e, i) => [(utcMs(e) - t0) / 1000, dense.position.slice(3 * i, 3 * i + 3)])
    .filter(([t]) => t >= -60 && t <= 4 * 3600 + 60);
  const fitTrack = arc.map((s) => [(utcMs(s.epoch) - t0) / 1000, s.position]);
  const span = { startMs: t0, stopMs: t0 + 4 * 3600e3, format: (ms) => `${new Date(ms).toISOString().slice(11, 19)} UTC · +${((ms - t0) / 3600e3).toFixed(2)} h` };
  const sites = new Map();
  for (const o of inputs.observations) if (!sites.has(o.sensor)) sites.set(o.sensor, o.stationPosition.map((m) => m / 1000));
  await view.draw((g) => {
    g.earth();
    g.track(truthTrack, { color: 'cyan', width: 2, alpha: 0.8, subdivide: 2 });
    g.track(fitTrack, { color: 'accent', width: 1.5, subdivide: 8 });
    for (const [i, o] of inputs.observations.entries()) {
      if (i % 2) continue;
      g.line([o.stationPosition.map((m) => m / 1000), inputs.samples[i].state.slice(0, 3).map((m) => m / 1000)], { color: SENSOR_COLORS[o.sensor], alpha: 0.25, width: 1, frame: false });
    }
    for (const [sensor, at] of sites) g.point(at, { color: 'text', size: 7, label: sensor.split('-')[0] });
    g.point(arc[0].position, { color: 'accent', size: 9, label: 'Fit epoch', labelOptions: { above: true } });
    g.moving(fitTrack.map(([t, p]) => [t0 + t * 1000, p]), { color: 'accent', size: 10, trail: false, label: inputs.block.name });
    g.view({ normal: planeNormal(truthTrack.map(([, p]) => p)) });
  }, { axes: ['x, GCRF (km)', 'y, GCRF (km)', 'z, GCRF (km)'], aspect: 'equal', time: span,
    caption: `GCRF (km), ${FIT_EPOCH.slice(11, 16)}–${new Date(t0 + 4 * 3600e3).toISOString().slice(11, 16)} UTC; the IGS orbit, the fit carried by FFM, and every other line of sight from the sensors (at their first observation); the Earth at 6,378 km`,
    legend: [['cyan', 'IGS orbit'], ['accent', 'Fit, carried by FFM'], ['accent', 'Radar look'], ['cyan', 'Optical look'], ['muted', 'RF look'], ['earth', 'Earth, 6,378.137 km']] });
  await errView.draw((g) => {
    g.point([0, 0, 0], { color: 'cyan', size: 8, label: 'IGS orbit', labelColor: 'cyan' });
    g.ellipsoid(rows[0].e, covarianceAxes(rtnCovariance(rows[0].basis, pos3(rows[0].s.covariance))).map((a) => v3.scale(a, 3000)), { color: 'accent', alpha: 0.05, outline: true, outlineAlpha: 0.3 });
    g.movingEllipsoid(rows.map((r) => [t0 + r.hours * 3600e3, r.e, covarianceAxes(rtnCovariance(r.basis, pos3(r.s.covariance))).map((a) => v3.scale(a, 3000))]), { color: 'accent', alpha: 0.3 });
    g.line(rows.map((r) => r.e), { color: 'muted', width: 1, alpha: 0.6 });
    g.moving(rows.map((r) => [t0 + r.hours * 3600e3, r.e]), { color: 'accent', size: 9, trail: 2.5, degree: 3, label: 'Fit' });
    g.view({ preset: '3d' });
  }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'equal', time: span,
    caption: 'The fit carried by FFM less the IGS orbit, with the fit’s 3σ position covariance about it, in the radial, in-track and cross-track axes of the IGS state (m, true scale); the outline is 3σ at the fit epoch',
    legend: [['accent', 'Fit − IGS, and its 3σ covariance'], ['muted', 'The whole arc'], ['cyan', 'IGS orbit (origin)', 'dot']] });
  errChart.draw({
    series: [
      { name: '3σ (3-D)', color: 'var(--cyan)', points: rows.map((r) => [r.hours, r.sigma3]), label: true },
      { name: '|fit − IGS|', color: 'var(--accent)', points: rows.map((r) => [r.hours, r.err]), markers: true, label: true },
    ],
    x: { min: 0, max: 4, ticks: [0, 1, 2, 3, 4], format: (h) => `${h} h` },
    cursor: { x: 0, set: (h) => ctx.time.set(t0 + h * 3600e3) },
  });
  ctx.time.on((ms) => errChart.cursor((ms - t0) / 3600e3));
  ctx.status(`The fit is ${formatMeters(first.err)} from the IGS orbit at its epoch, ${num(first.err / Math.hypot(...first.sig), 2)} of its formal 3-D σ; along the arc the error stays within ${num(Math.max(...rows.map((r) => r.err / r.sigma3)), 2)} × 3σ.`);
}
