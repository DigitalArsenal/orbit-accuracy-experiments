// Section 5, the handoff contract: an OMM through analysis/epoch-state (SGP4
// at zero elapsed time, TEME to GCRF, round trip checked), compared with
// Vallado's verification state and an independent pyerfa rotation; then
// propagator/ffm from that GCRF state.
import { executionFrame, decodeExecution } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import { HOUR, isoMicro } from '../../runs.js';
import { deriveEpochStates } from '../codec/elements.js';
import { transformState } from '../codec/frames.js';
import { coarseGrid, destroyIndex, prepareIndex } from '../codec/index.js';
import { rtn, scene3d, toRtn, v3 } from '../scene.js';
import { chart, inputs, num, panel, pre, table, tiles } from '../ui.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export default async function run(ctx) {
  const vallado = await ctx.fetchJson('./data/tle/vallado-verification.json');
  const p = panel(ctx.root, 'The OMM');
  const form = inputs(p, [{ id: 'case', label: 'Vallado verification case', type: 'select', value: 6251, wide: true,
    options: vallado.cases.map((c) => [c.satnum, `${String(c.satnum).padStart(5, '0')} · ${c.epochIso.slice(0, 10)} · ${num(c.MEAN_MOTION, 6)} rev/day`]) }], () => one());
  const tle = pre(p, '');
  const epoch = panel(ctx.root, 'Epoch state, GCRF');
  const view = scene3d(ctx, { title: 'SGP4 and FFM, one state apart in time', caption: 'GCRF (km)' });
  const apart = scene3d(ctx, { title: 'SGP4 − FFM', caption: 'Radial, in-track and cross-track of FFM’s state (km)' });
  const figure = chart(ctx.root, 'FFM from the handed-off state', 'Radius over a day; EGM2008 zonals to degree 20, no drag; drag to move the boxes above in time');
  const [epochState, ffm] = await Promise.all([ctx.module('analysis/epoch-state'), ctx.module('propagator/ffm')]);
  const [ca, frames] = await Promise.all([ctx.module('analysis/conjunction-assessment'), ctx.module('foundation/frames')]);

  // SGP4 from the element set, hourly for a day (the screening module's
  // sampler, TEME, single precision), each sample rotated to GCRF by
  // foundation/frames; FFM from the handed-off state at the same instants.
  async function sceneOf(c, s, epochMs) {
    const element = { id: `NORAD:${c.satnum}`, name: String(c.satnum), norad: c.satnum, epoch: c.epochIso.replace('Z', ''), n: c.MEAN_MOTION, ecc: c.ECCENTRICITY,
      inc: c.INCLINATION, raan: c.RA_OF_ASC_NODE, argp: c.ARG_OF_PERICENTER, ma: c.MEAN_ANOMALY, bstar: c.BSTAR };
    const handle = await prepareIndex(ca, [element, { ...element, id: 'INDEX-PAIR', norad: 0 }]);  // the index takes two sources
    let grid;
    // Every 6 min (the grid takes at most 256 steps a call): every third of
    // FFM's 2 min samples below.
    const STEP = 360;
    try { grid = await coarseGrid(ca, handle, { startMs: epochMs, coarseStepSec: STEP, steps: 241 }); } finally { await destroyIndex(ca, handle); }
    const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
    const sgp4 = [];
    for (const [k, step] of grid.entries()) sgp4.push((await transformState(frames, { from: 'TEME', to: 'GCRF', epochIso: iso(epochMs + k * STEP * 1000), r: [step[0].x, step[0].y, step[0].z] })).r);
    const temeAxes = [];
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) temeAxes.push((await transformState(frames, { from: 'TEME', to: 'GCRF', epochIso: iso(epochMs), r: v3.scale(axis, 1e4) })).r);
    const samples = Array.from({ length: 720 }, (_, k) => isoMicro(epochMs + (k + 1) * 120e3));
    const dense = decodeExecution(await ffm.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: s.r, velocity: s.v, samples, target: samples.at(-1),
      integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: { degree: 20, order: 0 } })]));
    const track = [[0, s.r], ...dense.samples.map((q, k) => [(k + 1) * 120, q.position])];
    const states = [{ position: s.r, velocity: s.v }, ...dense.samples];
    // SGP4 − FFM every 6 min, in FFM's radial, in-track and cross-track axes (km).
    const gaps = sgp4.map((p, k) => {
      const q = states[k * 3];
      return [epochMs + k * STEP * 1000, toRtn(rtn(q.position, q.velocity), v3.sub(p, q.position))];
    });
    const worst = Math.max(...gaps.map(([, c]) => v3.norm(c)));
    const span = { startMs: epochMs, stopMs: epochMs + 24 * HOUR, format: (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC · +${((ms - epochMs) / HOUR).toFixed(1)} h` };
    await view.draw((g) => {
      g.earth();
      const R = g.earthRadiusKm * 1.35;
      temeAxes.forEach((a, k) => { const tip = v3.scale(v3.unit(a), R); g.line([[0, 0, 0], tip], { color: 'cyan', width: 1.5, alpha: 0.8, frame: false }); g.label(tip, `TEME ${'xyz'[k]}`, { color: 'cyan', size: 11, weight: 500 }); });
      g.track(track, { color: 'accent', alpha: 0.4, width: 1.2, subdivide: 2 });
      sgp4.filter((p, k) => k % 10 === 0).forEach((p) => g.point(p, { color: 'cyan', size: 4, outline: 0 }));
      g.point(s.r, { color: 'sat', size: 9, label: 'Epoch state', labelOptions: { above: true } });
      g.moving(track.map(([t, p]) => [epochMs + t * 1000, p]), { color: 'accent', size: 10, trail: false, label: 'FFM' });
      g.moving(sgp4.map((p, k) => [epochMs + k * STEP * 1000, p]), { color: 'cyan', size: 7, trail: false });
      g.view({ preset: '3d' });
    }, { axes: ['x, GCRF (km)', 'y, GCRF (km)', 'z, GCRF (km)'], aspect: 'equal', time: span,
      caption: 'GCRF (km); FFM from the handed-off state every 2 min, SGP4 every 6 min rotated from TEME by foundation/frames (a dot each hour), and TEME’s axes at the epoch; the Earth at 6,378 km',
      legend: [['accent', 'FFM, 24 h'], ['cyan', 'SGP4, hourly; TEME axes'], ['sat', 'Epoch state', 'dot'], ['earth', 'Earth, 6,378.137 km']] });
    await apart.draw((g) => {
      g.point([0, 0, 0], { color: 'accent', size: 8, label: 'FFM', labelColor: 'accent' });
      g.line(gaps.map(([, c]) => c), { color: 'muted', width: 1, alpha: 0.6 });
      g.moving(gaps, { color: 'cyan', size: 9, trail: 2.5, label: 'SGP4' });
      g.vector([0, 0, 0], gaps, { color: 'cyan', width: 6 });
      g.view({ preset: '3d' });
    }, { axes: ['Radial (km)', 'In-track (km)', 'Cross-track (km)'], aspect: 'normal', time: span,
      caption: 'SGP4 − FFM every 6 min, in FFM’s radial, in-track and cross-track axes (km); the trail up to the time shown',
      legend: [['cyan', 'SGP4 − FFM, to the time shown'], ['muted', 'The whole day']] });
    return worst;
  }

  let t0 = null;
  ctx.time.on((ms) => { if (t0 !== null) figure.cursor((ms - t0) / HOUR); });
  async function one() {
    const c = vallado.cases.find((x) => x.satnum === Number(form.values().case));
    tle.textContent = c.tle.join('\n');
    await ctx.run('analysis/epoch-state derive, then propagator/ffm 24 h', async () => {
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
      const run = decodeExecution(await ffm.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: s.r, velocity: s.v, samples, target: samples.at(-1),
        integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: { degree: 20, order: 0 } })]));
      t0 = epochMs;
      figure.draw({ series: [{ name: '|r|', color: 'var(--accent)', points: [[0, Math.hypot(...s.r) * 1000], ...run.samples.map((q, k) => [(k + 1) / 2, Math.hypot(...q.position) * 1000])] }],
        x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (x) => `${x} h` }, y: { scale: 'linear', format: (m) => `${num(m / 1000, 5)} km`, value: (m) => `${num(m / 1000, 7)} km` },
        cursor: { x: 24, set: (h) => ctx.time.set(t0 + h * HOUR) } });
      const gap = await sceneOf(c, s, epochMs).catch((error) => { console.warn(error); return null; });
      return `SGP4 at t = 0, rotated to GCRF, matches pyerfa within ${formatMeters(dist(s.r, c.gcrfR) * 1000, 3)}; FFM then integrates ${num(run.final.steps)} steps from it${gap === null ? '' : `, and SGP4’s own path drifts up to ${formatMeters(gap * 1000)} from it in the day`}. The state carries no covariance: its uncertainty is marked unknown.`;
    });
  }
  await one();
}
