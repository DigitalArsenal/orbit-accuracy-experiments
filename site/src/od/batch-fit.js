// A batch weighted-least-squares fit with its covariance. The simulated
// observations of one GPS satellite (radar range and range rate, optical
// RA/Dec, RF range rate) are fitted by analysis/estimation around the
// catalog's prediction, with propagator/hpop's state-transition matrix; the
// fitted state and covariance are then carried along the arc by HPOP and
// compared with the IGS orbit the observations were simulated from.
import { formatMeters } from '../chart.js';
import { chart, num, panel, table, tiles, note } from '../models/ui.js';
import { covarianceAxes, fromRtn, magnification, rtn, rtnCovariance, scene3d, toRtn, v3 } from '../models/scene.js';
import { FIT_EPOCH, busiest, estimate, fitInputs, hpopRun, loadScenario, simulate } from './scenario.js';
import { isoMicro, utcMs } from './codec.js';

const SENSOR_COLORS = { 'WTZR-RADAR': 'accent', 'GOLD-OPTICAL': 'cyan', 'YAR2-RF': 'muted' };
const COMPONENTS = { RANGE: ['Range', 1], RANGE_RATE: ['Range rate', 1], RIGHT_ASCENSION_DECLINATION: ['RA, Dec', 2] };
const pos3 = (P) => [P[0], P[1], P[2], P[6], P[7], P[8], P[12], P[13], P[14]];

export default async function run(ctx) {
  const intro = panel(ctx.root, 'Observations and a priori');
  const view = scene3d(ctx, { title: 'The fitted orbit and its covariance', caption: '' });
  const errChart = chart(ctx.root, 'The fit against the IGS orbit', 'Position error of the fit carried by HPOP, and its 3σ from the fitted covariance');
  const resChart = chart(ctx.root, 'Residuals', 'Observed minus fitted, in units of each measurement’s σ');
  const result = panel(ctx.root, 'At the fit epoch');

  let sc, sim, inputs, fit, arc;
  await ctx.run('analysis/observation-simulator: observations of the IGS orbits', async () => { sc = await loadScenario(ctx); sim = await simulate(ctx, sc); });
  await ctx.run('foundation/frames: site positions; propagator/hpop: the nominal and its STM', async () => { inputs = await fitInputs(ctx, sc, sim, busiest(sc, sim)); });
  await ctx.run('analysis/estimation: batch weighted least squares', async () => { fit = await estimate(ctx, inputs, 'BATCH_WEIGHTED_LEAST_SQUARES', { covarianceScale: 100 }); });
  if (!fit) return;
  const truthBlock = sc.truth.find((b) => b.norad === inputs.norad);
  const nodes = truthBlock.states.filter((s) => utcMs(s.epoch) >= utcMs(FIT_EPOCH) && utcMs(s.epoch) <= utcMs(FIT_EPOCH) + 4 * 3600e3);
  const x = fit.estimate.state.map((v) => v / 1000), P = fit.estimate.covariance.map((v) => v / 1e6);
  await ctx.run('propagator/hpop: the fitted state and covariance along the arc', async () => {
    arc = await hpopRun(ctx, sc, { epoch: FIT_EPOCH, position: x.slice(0, 3), velocity: x.slice(3), samples: nodes.slice(1).map((s) => isoMicro(utcMs(s.epoch))), covariance: P });
    arc.unshift({ epoch: FIT_EPOCH, position: x.slice(0, 3), velocity: x.slice(3), covariance: P });
  });
  if (!arc) return;

  const counts = {};
  for (const o of inputs.observations) counts[o.label] = (counts[o.label] ?? 0) + 1;
  const name = `${inputs.block.name} (NORAD ${inputs.norad})`;
  tiles(intro, [['Satellite', name], ...Object.entries(counts).map(([k, v]) => [k, num(v)]), ['Iterations', num(fit.estimate.iterationCount)],
    ['Rejected', num(fit.estimate.rejectedCount)]]);
  note(intro, `Simulated by analysis/observation-simulator from the IGS final orbit (${sc.scenario.truthProduct}), ${sc.scenario.simulation.from.slice(11, 16)}–${sc.scenario.simulation.to.slice(11, 16)} UTC, with the noise each sensor states. `
    + `The fit starts from the catalog’s prediction at ${FIT_EPOCH.slice(11, 19)} UTC (HPOP from the IGS state six hours earlier) with its covariance, inflated ×10 in σ as a weak prior, and linearizes about it with HPOP’s STM to every observation. Light time is off in the simulation and in the fit.`);

  // Error and covariance at the IGS epochs.
  const rows = arc.map((s, k) => {
    const t = nodes[k].state;
    const basis = rtn(t.slice(0, 3), t.slice(3));
    const e = toRtn(basis, v3.sub(s.position, t.slice(0, 3))).map((c) => c * 1000);
    const sig = (() => { const C = rtnCovariance(basis, pos3(s.covariance)); return [C[0], C[4], C[8]].map((c) => Math.sqrt(c) * 1000); })();
    return { hours: (utcMs(nodes[k].epoch) - utcMs(FIT_EPOCH)) / 3600e3, e, sig, err: Math.hypot(...e), sigma3: 3 * Math.hypot(...sig), basis, s, t };
  });
  errChart.draw({
    series: [
      { name: '3σ (3-D)', color: 'var(--cyan)', points: rows.map((r) => [r.hours, r.sigma3]), label: true },
      { name: '|fit − IGS|', color: 'var(--accent)', points: rows.map((r) => [r.hours, r.err]), markers: true, label: true },
    ],
    x: { min: 0, max: 4, ticks: [0, 1, 2, 3, 4], format: (h) => `${h} h` },
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

  // 3D: the IGS orbit, the fitted arc, the covariance along it, the observation geometry.
  const dense = sc.dense.find((d) => d.norad === inputs.norad);
  const truthTrack = dense.epochs.map((e, i) => [(utcMs(e) - utcMs(FIT_EPOCH)) / 1000, dense.position.slice(3 * i, 3 * i + 3)])
    .filter(([t]) => t >= -60 && t <= 4 * 3600 + 60);
  const fitTrack = arc.map((s) => [(utcMs(s.epoch) - utcMs(FIT_EPOCH)) / 1000, s.position]);
  const biggest = Math.max(...rows.map((r) => Math.max(...r.sig))) / 1000;
  const mag = magnification(biggest, 700);
  await view.draw((g) => {
    g.track(truthTrack, { color: 'cyan', width: 2, alpha: 0.8, subdivide: 2 });
    g.track(fitTrack, { color: 'accent', width: 1.5, subdivide: 8 });
    for (const r of rows) {
      const axes = covarianceAxes(rtnCovariance(r.basis, pos3(r.s.covariance))).map((a) => fromRtn(r.basis, v3.scale(a, 3 * mag.k)));
      g.ellipsoid(r.s.position, axes, { color: 'accent', alpha: 0.3, outline: true, frame: false });
    }
    for (const [i, o] of inputs.observations.entries()) {
      if (i % 2) continue;
      g.line([o.stationPosition.map((m) => m / 1000), inputs.samples[i].state.slice(0, 3).map((m) => m / 1000)], { color: SENSOR_COLORS[o.sensor], alpha: 0.25, width: 1, frame: false });
    }
    for (const s of sc.scenario.sites) g.point(g.fromFixed(s.itrfKm), { color: 'text', size: 7, label: s.id });
    g.point(arc[0].position, { color: 'accent', size: 9, label: 'Fit epoch', labelOptions: { above: true } });
  }, {
    frame: 'GCRF', epochMs: utcMs(FIT_EPOCH) + 2 * 3600e3,
    caption: `GCRF, ${FIT_EPOCH.slice(11, 16)}–${new Date(utcMs(FIT_EPOCH) + 4 * 3600e3).toISOString().slice(11, 16)} UTC; 3σ ellipsoids ${mag.label}`,
    legend: [['cyan', 'IGS orbit'], ['accent', 'Fit, carried by HPOP'], ['accent', '3σ position covariance', 'solid'], ['accent', 'Radar look', 'line'], ['cyan', 'Optical look'], ['muted', 'RF look']],
  });
  ctx.status(`The fit is ${formatMeters(first.err)} from the IGS orbit at its epoch, ${num(first.err / Math.hypot(...first.sig), 2)} of its formal 3-D σ; along the arc the error stays within ${num(Math.max(...rows.map((r) => r.err / r.sigma3)), 2)} × 3σ.`);
}
