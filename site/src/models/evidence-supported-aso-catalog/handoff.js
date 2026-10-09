// Section 5, the handoff contract: an OMM through analysis/epoch-state (SGP4
// at zero elapsed time, TEME to GCRF, round trip checked), compared with
// Vallado's verification state and an independent pyerfa rotation; then
// propagator/hpop from that GCRF state.
import { executionFrame, decodeExecution } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import { HOUR, isoMicro } from '../../runs.js';
import { deriveEpochStates } from '../codec/elements.js';
import { transformState } from '../codec/frames.js';
import { coarseGrid, destroyIndex, prepareIndex } from '../codec/index.js';
import { magnification, rtn, scene3d, toRtn, v3 } from '../scene.js';
import { chart, inputs, num, panel, pre, table, tiles } from '../ui.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export default async function run(ctx) {
  const vallado = await ctx.fetchJson('./data/tle/vallado-verification.json');
  const p = panel(ctx.root, 'The OMM');
  const form = inputs(p, [{ id: 'case', label: 'Vallado verification case', type: 'select', value: 6251, wide: true,
    options: vallado.cases.map((c) => [c.satnum, `${String(c.satnum).padStart(5, '0')} · ${c.epochIso.slice(0, 10)} · ${num(c.MEAN_MOTION, 6)} rev/day`]) }], () => one());
  const tle = pre(p, '');
  const epoch = panel(ctx.root, 'Epoch state, GCRF');
  const view = scene3d(ctx, { title: 'SGP4 and HPOP, one state apart in time', caption: 'GCRF; the gap between the two, hour by hour, magnified' });
  const figure = chart(ctx.root, 'HPOP from the handed-off state', 'Radius over a day; EGM2008 zonals to degree 20, no drag');
  const [epochState, hpop] = await Promise.all([ctx.module('analysis/epoch-state'), ctx.module('propagator/hpop')]);
  const [ca, frames] = await Promise.all([ctx.module('analysis/conjunction-assessment'), ctx.module('foundation/frames')]);

  // SGP4 from the element set, hourly for a day (the screening module's
  // sampler, TEME, single precision), each sample rotated to GCRF by
  // foundation/frames; HPOP from the handed-off state at the same instants.
  async function sceneOf(c, s, epochMs) {
    const element = { id: `NORAD:${c.satnum}`, name: String(c.satnum), norad: c.satnum, epoch: c.epochIso.replace('Z', ''), n: c.MEAN_MOTION, ecc: c.ECCENTRICITY,
      inc: c.INCLINATION, raan: c.RA_OF_ASC_NODE, argp: c.ARG_OF_PERICENTER, ma: c.MEAN_ANOMALY, bstar: c.BSTAR };
    const handle = await prepareIndex(ca, [element, { ...element, id: 'INDEX-PAIR', norad: 0 }]);  // the index takes two sources
    let grid;
    try { grid = await coarseGrid(ca, handle, { startMs: epochMs, coarseStepSec: 3600, steps: 25 }); } finally { await destroyIndex(ca, handle); }
    const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
    const sgp4 = [];
    for (const [k, step] of grid.entries()) sgp4.push((await transformState(frames, { from: 'TEME', to: 'GCRF', epochIso: iso(epochMs + k * HOUR), r: [step[0].x, step[0].y, step[0].z] })).r);
    const temeAxes = [];
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) temeAxes.push((await transformState(frames, { from: 'TEME', to: 'GCRF', epochIso: iso(epochMs), r: v3.scale(axis, 1e4) })).r);
    const samples = Array.from({ length: 720 }, (_, k) => isoMicro(epochMs + (k + 1) * 120e3));
    const dense = decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: s.r, velocity: s.v, samples, target: samples.at(-1),
      integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: { degree: 20, order: 0 } })]));
    const track = [[0, s.r], ...dense.samples.map((q, k) => [(k + 1) * 120, q.position])];
    const states = [{ position: s.r, velocity: s.v }, ...dense.samples];
    // SGP4 − HPOP each hour, in HPOP's radial, in-track and cross-track axes.
    const items = Array.from({ length: 25 }, (_, h) => {
      const q = states[h * 30];
      return { c: toRtn(rtn(q.position, q.velocity), v3.sub(sgp4[h], q.position)), label: h && h % 12 === 0 ? `${h} h · ${formatMeters(v3.norm(v3.sub(sgp4[h], q.position)) * 1000)}` : null };
    });
    const worst = Math.max(...items.map((it) => v3.norm(it.c)));
    const end = states[720];
    const mag = magnification(worst, 6378 * 0.9);
    await view.draw((g) => {
      const R = g.earthRadiusKm * 1.45;
      g.axes([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], R, ['GCRF X', '', 'Z'], { color: 'muted', alpha: 0.7 });
      g.axes([0, 0, 0], temeAxes, R * 0.86, ['TEME X', '', ''], { color: 'cyan', alpha: 0.8, labelDy: 15 });
      g.axes([0, 0, 0], [g.fromFixed([1, 0, 0]), g.fromFixed([0, 1, 0])], R * 0.75, ['ITRF X', ''], { color: 'text', alpha: 0.55 });
      g.track(track, { color: 'accent', alpha: 0.35, width: 1.2, subdivide: 2 });
      g.trail(end.position, rtn(end.position, end.velocity), items, mag.k, { color: 'cyan' });
      g.point(s.r, { color: 'sat', size: 9, label: 'Epoch state', labelOptions: { above: true } });
      g.point(end.position, { color: 'accent', size: 8 });
      const [Re, , Ne] = rtn(end.position, end.velocity);
      g.view({ direction: v3.unit(v3.add(v3.scale(Re, 0.75), v3.scale(Ne, 0.65))) });
    }, { frame: 'GCRF', epochMs, caption: `GCRF; SGP4 − HPOP hour by hour, drawn at HPOP’s 24 h state, ${mag.label}`,
      legend: [['accent', 'HPOP, 24 h'], ['cyan', `SGP4 − HPOP, ${mag.label}`], ['muted', 'GCRF axes'], ['text', 'ITRF axes']] });
    return worst;
  }

  async function one() {
    const c = vallado.cases.find((x) => x.satnum === Number(form.values().case));
    tle.textContent = c.tle.join('\n');
    await ctx.run('analysis/epoch-state derive, then propagator/hpop 24 h', async () => {
      const { states, report } = await deriveEpochStates(epochState, [{ entityId: `NORAD:${c.satnum}`, ...c }]);
      if (!states.length) throw new Error(`analysis/epoch-state refused the element set: ${JSON.stringify(report.failures ?? report)}`);
      const s = states[0];
      table(epoch, ['', 'X', 'Y', 'Z'], [
        ['r (km)', ...s.r.map((x) => num(x, 12))], ['v (km/s)', ...s.v.map((x) => num(x, 10))],
        ['pyerfa r (km)', ...c.gcrfR.map((x) => num(x, 12))],
      ], { existing: epoch.querySelector('table') ?? undefined });
      const temeRadius = Math.hypot(...c.temeR);
      tiles(epoch, [['vs pyerfa GCRF', formatMeters(dist(s.r, c.gcrfR) * 1000, 3)], ['|r| vs Vallado TEME', formatMeters(Math.abs(Math.hypot(...s.r) - temeRadius) * 1000, 3)],
        ['Round trip to TEME', formatMeters(report.maxRoundTripPositionKm * 1000, 3)], ['Initial uncertainty', 'unknown']]);
      const epochMs = Date.parse(c.epochIso);
      const samples = Array.from({ length: 48 }, (_, k) => isoMicro(epochMs + (k + 1) * HOUR / 2));
      const run = decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: s.r, velocity: s.v, samples, target: samples.at(-1),
        integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: { degree: 20, order: 0 } })]));
      figure.draw({ series: [{ name: '|r|', color: 'var(--accent)', points: [[0, Math.hypot(...s.r) * 1000], ...run.samples.map((q, k) => [(k + 1) / 2, Math.hypot(...q.position) * 1000])] }],
        x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (x) => `${x} h` }, y: { scale: 'linear', format: (m) => `${num(m / 1000, 5)} km`, value: (m) => `${num(m / 1000, 7)} km` } });
      const gap = await sceneOf(c, s, epochMs).catch((error) => { console.warn(error); return null; });
      return `SGP4 at t = 0, rotated to GCRF, matches pyerfa within ${formatMeters(dist(s.r, c.gcrfR) * 1000, 3)}; HPOP then integrates ${num(run.final.steps)} steps from it${gap === null ? '' : `, and SGP4’s own path drifts up to ${formatMeters(gap * 1000)} from it in the day`}. The state carries no covariance: its uncertainty is marked unknown.`;
    });
  }
  await one();
}
