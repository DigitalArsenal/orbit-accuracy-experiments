// Section 5.1, GNSS and laser-ranged satellites: a GPS satellite's
// analysis-center state carried a week by propagator/ffm, every modeled
// force, against the IGS final orbit; beside it, where the public element
// set's position lies (E3's median error at each age, split over the
// radial, in-track and cross-track axes by its share of the squared error).
// Two plot boxes follow one clock: the orbit (GCRF, km) and FFM − IGS (m).
import { decodeExecution, executionFrame } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import { frameOf, isoMicro } from '../../runs.js';
import { chart, credits, panel, tiles } from '../ui.js';
import { planeNormal, rtn, scene3d, toRtn, v3 } from '../scene.js';

const DAY = 86400e3, HOUR = 3600e3;
const HORIZONS = [0, 1, 3, 7];

export default async function run(ctx) {
  const [igs, e3, seeds] = await Promise.all([ctx.fetchJson('./data/gnss/igs-26407.json'), ctx.fetchJson('./data/gnss/e3-gps.json'), ctx.fetchJson('./data/v1/seeds.json')]);
  const p = panel(ctx.root, `${igs.object}, a week from its IGS state`);
  const orbit = scene3d(ctx, { title: 'The satellite on its IGS orbit', caption: 'GCRF (km)' });
  const apart = scene3d(ctx, { title: 'The catalog’s product − the IGS orbit, beside the public OMM', caption: 'Radial, in-track and cross-track of the IGS state (m)' });
  const figure = chart(ctx.root, 'Distance from the IGS orbit', 'FFM from the analysis-center state, here; E3’s medians over 32 satellites; drag to move the boxes above in time');
  await credits(ctx, ctx.root, ['data/gnss/igs-26407.json', 'data/gnss/e3-gps.json', 'data/kernel/de440-2026.prw', 'data/eop/eop-v1.prw']);
  const ffm = await ctx.module('propagator/ffm');
  const t0 = igs.epochsUnixMs[0];
  const state = (i) => ({ r: igs.position.slice(3 * i, 3 * i + 3), v: igs.velocity.slice(3 * i, 3 * i + 3) });

  const rows = await ctx.run('propagator/ffm: the IGS state a week on, every force', async () => {
    const params = seeds.find((s) => s.norad === igs.norad)?.params ?? { massKg: 1500, areaM2: 20, cr: 1.3 };
    const [kernel, eop] = await Promise.all([ctx.fetchBytes('./data/kernel/de440-2026.prw'), ctx.fetchBytes('./data/eop/eop-v1.prw')]);
    const s0 = state(0), times = igs.epochsUnixMs.slice(1);
    const r = decodeExecution(await ffm.invoke('invoke', [executionFrame({ epoch: isoMicro(t0), timeScale: 'UTC', position: s0.r, velocity: s0.v,
      samples: times.map(isoMicro), target: isoMicro(times.at(-1)), integrator: { algorithm: 'RK78', tolerance: 1e-12, maxStep: 300 },
      forces: { degree: 20, order: 20, thirdBodies: [10, 301], srp: true, massKg: params.massKg, areaM2: params.areaM2, cr: params.cr, solidTides: true, relativity: 'IERS_2010' }, kernel: true }),
    frameOf('kernel', kernel), frameOf('earth_orientation', eop)]));
    return [{ ms: t0, ffm: s0.r, truth: s0, error: [0, 0, 0] }, ...r.samples.map((q, k) => {
      const truth = state(k + 1);
      return { ms: times[k], ffm: q.position, truth, error: toRtn(rtn(truth.r, truth.v), v3.sub(q.position, truth.r)).map((x) => x * 1000) };
    })];
  });
  if (!rows) return;
  const at = (days) => rows.reduce((a, b) => (Math.abs(b.ms - t0 - days * DAY) < Math.abs(a.ms - t0 - days * DAY) ? b : a));
  tiles(p, HORIZONS.slice(1).map((d) => [`${d} ${d === 1 ? 'day' : 'days'}`, `${formatMeters(v3.norm(at(d).error))} · OMM ${formatMeters(e3.omm[d].medianKm * 1000)}`]));

  // The OMM's median error ellipsoid holds from each measured age to the next.
  const ommAxes = (d) => [0, 1, 2].map((i) => { const a = [0, 0, 0]; a[i] = e3.omm[d].medianKm * 1000 * Math.sqrt(e3.omm[d].shareRtn[i]); return a; });
  const steps = HORIZONS.flatMap((d, k) => {
    const next = HORIZONS[k + 1];
    return next === undefined ? [[t0 + d * DAY, [0, 0, 0], ommAxes(d)]] : [[t0 + d * DAY, [0, 0, 0], ommAxes(d)], [t0 + next * DAY - 1, [0, 0, 0], ommAxes(d)]];
  });
  const span = { startMs: t0, stopMs: rows.at(-1).ms, format: (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC · +${((ms - t0) / DAY).toFixed(2)} d` };
  await ctx.run('Drawing', async () => {
    await orbit.draw((g) => {
      g.earth();
      g.track(rows.filter((x) => x.ms <= t0 + 12 * HOUR).map((x) => [(x.ms - t0) / 1000, x.truth.r]), { color: 'cyan', width: 2, subdivide: 8 });
      g.moving(rows.map((x) => [x.ms, x.truth.r]), { color: 'cyan', size: 9, trail: false, label: 'IGS', labelColor: 'cyan' });
      g.moving(rows.map((x) => [x.ms, x.ffm]), { color: 'accent', size: 7, trail: false });
      g.view({ normal: planeNormal(rows.filter((x) => x.ms <= t0 + 12 * HOUR).map((x) => x.truth.r)) });
    }, { axes: ['x, GCRF (km)', 'y, GCRF (km)', 'z, GCRF (km)'], aspect: 'equal', time: span,
      caption: `GCRF (km); ${igs.object} on its IGS final orbit (one revolution drawn), and FFM from its IGS state at ${new Date(t0).toISOString().slice(0, 16).replace('T', ' ')} UTC; the Earth at 6,378 km`,
      legend: [['cyan', 'IGS final orbit'], ['accent', 'FFM from the analysis-center state', 'dot'], ['earth', 'Earth, 6,378.137 km']] });
    await apart.draw((g) => {
      g.movingEllipsoid(steps, { color: 'cyan', alpha: 0.18 });
      g.point([0, 0, 0], { color: 'cyan', size: 8, label: 'IGS', labelColor: 'cyan', labelOptions: { dy: 16 } });
      g.line(rows.map((x) => x.error), { color: 'muted', width: 1, alpha: 0.6 });
      g.moving(rows.map((x) => [x.ms, x.error]), { color: 'accent', size: 9, trail: 2.5, label: 'FFM from the IGS state' });
      g.vector([0, 0, 0], rows.map((x) => [x.ms, x.error]), { color: 'accent', width: 6 });
      g.view({ preset: '3d' });
    }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'equal', time: span,
      caption: `FFM from the analysis-center state less the IGS final orbit (m, true scale); the ellipsoid is the public OMM’s median error at the latest measured age (E3, ${e3.objects} satellites: ${HORIZONS.map((d) => `${d} d ${formatMeters(e3.omm[d].medianKm * 1000)}`).join(', ')})`,
      legend: [['accent', 'FFM − IGS, to the time shown'], ['muted', 'The whole week'], ['cyan', 'Public OMM: median error ellipsoid (E3)', 'solid']] });
    figure.draw({ series: [
      { name: 'Public OMM, SGP4 (E3 median)', color: 'var(--cyan)', points: HORIZONS.map((d) => [d, e3.omm[d].medianKm * 1000]), markers: true, label: true, labelText: 'OMM' },
      { name: 'Analysis-center orbit, propagated (E3 median)', color: 'var(--series-muted)', points: HORIZONS.map((d) => [d, e3.catalog[d].medianKm * 1000]), markers: true },
      { name: 'This satellite, FFM from its IGS state', color: 'var(--accent)', points: rows.slice(1).map((x) => [(x.ms - t0) / DAY, v3.norm(x.error)]), label: true, labelText: 'Here' },
    ], x: { min: 0, max: 7, ticks: [0, 1, 3, 7], format: (d) => `${Number(d.toFixed(2))} d` },
    cursor: { x: 7, set: (d) => ctx.time.set(t0 + d * DAY) } });
    return `A week from its IGS state, FFM is ${formatMeters(v3.norm(at(7).error))} from the IGS orbit (E3’s median for the analysis-center orbit propagated: ${formatMeters(e3.catalog[7].medianKm * 1000)}); the public OMM’s median error is ${formatMeters(e3.omm[7].medianKm * 1000)} at that age.`;
  });
  ctx.time.on((ms) => figure.cursor((ms - t0) / DAY));
}
