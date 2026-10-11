// Section 5.5, maneuver detection: the ISS reboost of 25 September 2026.
//  1. The detector's event on the public element sets (site/run-maneuver.mjs,
//     analysis/maneuver-detection's default C over SGP4): a result; the
//     element sets are not reproduced.
//  2. NASA's plan against its next trajectory, in this browser:
//     analysis/maneuver-detection compare_ephemerides gives the executed
//     change, as the study takes its truth.
//  3. Where the burn put the station: propagator/hpop from NASA's state
//     before the burn and from its first state after it (EME2000 to GCRF by
//     foundation/frames), one force model, a day on.
// Two plot boxes follow one clock: the orbit (GCRF, km) with the station
// with and without the burn, and the difference in the radial, in-track and
// cross-track axes of the station without it (km); the chart's cursor and the
// slider set the time.
import { formatMeters } from '../../chart.js';
import { decodeExecution, executionFrame } from '../../../../harness/prw.mjs';
import { frameOf, isoMicro } from '../../runs.js';
import { transformState } from '../codec/frames.js';
import { TYPES, jsonFrame, jsonOf, maneuverStatus, outputsOf, plannedMnv, unpackMnv, versionOem } from '../codec/mnv.js';
import { chart, credits, num, panel, table, tiles } from '../ui.js';
import { rtn, scene3d, toRtn, v3 } from '../scene.js';

const MIN = 60e3, HOUR = 3600e3, STEP = 4 * MIN;
const FORCES = { degree: 20, order: 20, thirdBodies: [10, 301] };
const utc = (ms) => `${new Date(ms).toISOString().slice(11, 19)} UTC`;

export default async function run(ctx) {
  const [iss, detection] = await Promise.all([ctx.fetchJson('./data/maneuver/iss-versions.json'), ctx.fetchJson('./data/maneuver/iss-detection.json')]);
  const tigMs = Date.parse(iss.burn.tig), dayMs = tigMs + 24 * HOUR;
  const [plan, post] = iss.versions;
  const found = detection.events.reduce((a, e) => (!a || Math.abs(Date.parse(e.EVENT_START_TIME) - tigMs) < Math.abs(Date.parse(a.EVENT_START_TIME) - tigMs) ? e : a), null);
  const foundMs = Date.parse(found.EVENT_START_TIME);

  const p = panel(ctx.root, `${iss.burn.name}, ${new Date(tigMs).toISOString().slice(0, 10)}`);
  const orbit = scene3d(ctx, { title: 'The station with and without the burn', caption: 'GCRF; NASA’s trajectories, and HPOP with and without the burn' });
  const apart = scene3d(ctx, { title: 'With the burn − without it', caption: 'Radial, in-track and cross-track of the station without the burn' });
  const figure = chart(ctx.root, 'Distance between the two', 'With the burn against without it; drag to move the boxes above in time');
  const checks = panel(ctx.root, 'Planned, executed, found');
  await credits(ctx, ctx.root, ['data/maneuver/iss-versions.json', 'data/maneuver/iss-detection.json', 'data/eop/eop-2026-09.prw', 'data/kernel/de440-2026.prw']);
  const [detector, hpop, frames] = await Promise.all([ctx.module('analysis/maneuver-detection'), ctx.module('propagator/hpop'), ctx.module('foundation/frames')]);

  // NASA's plan against its next trajectory.
  const executed = await ctx.run('analysis/maneuver-detection compare_ephemerides: the plan against NASA’s next trajectory', async () => {
    const r = await detector.invoke('compare_ephemerides', [
      ...iss.versions.map((v) => ({ portId: 'versions', payload: versionOem(v, iss.object), typeRef: TYPES.OEM })),
      { portId: 'planned', payload: plannedMnv(iss.burn, iss.object), typeRef: TYPES.MNV },
      jsonFrame('options', { margin_s: 1800, post_start_after_s: 3600 }),
    ]);
    const check = jsonOf(r, 'report').objects[0].planned[0];
    const m = outputsOf(r, 'maneuvers').map(unpackMnv)[0];
    return { status: Object.keys(maneuverStatus).find((k) => maneuverStatus[k] === m.STATUS), inTrackMps: check.executed_in_track_mps, crossTrackMps: check.executed_cross_track_mps, dSmaKm: check.executed_delta_sma_km };
  });
  if (!executed) return;

  // HPOP from NASA's state before the burn and from its first state after it.
  const states = await ctx.run('foundation/frames and propagator/hpop: a day with and without the burn', async () => {
    const at = (v, i) => ({ ms: v.epochsUnixMs[i], r: v.position.slice(3 * i, 3 * i + 3), v: v.velocity.slice(3 * i, 3 * i + 3) });
    const before = at(plan, plan.epochsUnixMs.findLastIndex((t) => t <= tigMs - 45 * MIN));
    const after = at(post, 0);
    const toGcrf = (s) => transformState(frames, { from: 'EME2000', to: 'GCRF', epochIso: isoMicro(s.ms), r: s.r, v: s.v });
    const [kernel, eop] = await Promise.all([ctx.fetchBytes('./data/kernel/de440-2026.prw'), ctx.fetchBytes('./data/eop/eop-2026-09.prw')]);
    const common = [];
    for (let t = after.ms + STEP; t <= dayMs + HOUR; t += STEP) common.push(t);
    const propagate = async (seed, extra) => {
      const s = await toGcrf(seed);
      const times = [...new Set([...extra, ...common])].filter((t) => t > seed.ms).sort((a, b) => a - b);
      const r = decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: isoMicro(seed.ms), timeScale: 'UTC', position: s.r, velocity: s.v,
        samples: times.map(isoMicro), target: isoMicro(times.at(-1)), integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: FORCES, kernel: true }),
      frameOf('kernel', kernel), frameOf('earth_orientation', eop)]));
      return new Map([[seed.ms, s], ...r.samples.map((q, k) => [times[k], { r: q.position, v: q.velocity }])]);
    };
    const leadIn = [];
    for (let t = before.ms + STEP; t < after.ms; t += STEP) leadIn.push(t);
    const without = await propagate(before, [...leadIn, foundMs, tigMs, dayMs]);
    const withBurn = await propagate(after, [dayMs]);
    // NASA's own trajectory across the burn (its plan models it), for the gap
    // between the burn and NASA's first state after it.
    const across = [];
    for (let i = 0; i < plan.epochsUnixMs.length; i++) {
      const t = plan.epochsUnixMs[i];
      if (t > tigMs && t < after.ms + STEP) across.push([t, await toGcrf(at(plan, i))]);
    }
    return { without, withBurn, across, before, after };
  });
  if (!states) return;
  const { without, withBurn, across, after } = states;
  const a = withBurn.get(dayMs), b = without.get(dayMs);
  const basis = rtn(a.r, a.v), gap = toRtn(basis, v3.sub(a.r, b.r));
  const gapKm = v3.norm(v3.sub(a.r, b.r));

  tiles(p, [['Planned (NASA)', `${utc(tigMs)} · ${num(iss.burn.dvMps, 3)} m/s`], ['Executed (compare_ephemerides)', `${executed.status === 'EXECUTED' ? 'executed' : executed.status.toLowerCase()} · ${num(executed.inTrackMps, 4)} m/s in-track`],
    ['Found by the detector', `${utc(foundMs)} · ${num(found.DELTA_VEL * 1000, 4)} m/s`], ['A day later', `${formatMeters(gapKm * 1000)} apart`]]);
  table(checks, ['', 'Time (UTC)', 'ΔV', 'Source'], [
    ['Planned', new Date(tigMs).toISOString().slice(0, 19).replace('T', ' '), `${num(iss.burn.dvMps, 3)} m/s`, `NASA’s trajectory issued ${iss.burn.planIssued.slice(0, 16).replace('T', ' ')}`],
    ['Executed', new Date(tigMs).toISOString().slice(0, 19).replace('T', ' '), `${num(executed.inTrackMps, 4)} m/s in-track, ${num(executed.crossTrackMps, 3)} cross-track; a +${formatMeters(executed.dSmaKm * 1000)} semi-major axis`,
      'compare_ephemerides, here: NASA’s plan against its next trajectory'],
    ['Found', new Date(foundMs).toISOString().slice(0, 19).replace('T', ' '), `${num(found.DELTA_VEL * 1000, 4)} m/s in-track`,
      `Detector C on ${num(detection.elementSets.count)} public element sets, ${detection.modules[0].path} ${detection.modules[0].version} over ${detection.modules[1].path}`],
    ['A day later', new Date(dayMs).toISOString().slice(0, 19).replace('T', ' '), `${formatMeters(gapKm * 1000)} apart: ${formatMeters(Math.abs(gap[1]) * 1000)} ${gap[1] < 0 ? 'behind' : 'ahead'}, ${formatMeters(Math.abs(gap[0]) * 1000)} ${gap[0] > 0 ? 'higher' : 'lower'}`,
      'propagator/hpop from NASA’s states either side of the burn'],
  ]);

  async function draw() {
    await ctx.run('Drawing', async () => {
      const series = (map, from, to) => [...map].filter(([t]) => t >= from && t <= to).sort((x, y) => x[0] - y[0]);
      const burnAt = without.get(tigMs), foundAt = without.get(foundMs);
      // The station with the burn: as without it to the TIG, NASA across the
      // burn, then HPOP from NASA's first state after it.
      const withPath = [...series(without, states.before.ms, tigMs), ...across.filter(([t]) => t < after.ms), ...series(withBurn, after.ms, dayMs + HOUR)];
      const withoutPath = series(without, states.before.ms, dayMs + HOUR);
      const positionAt = (path) => new Map(path.map(([t, q]) => [t, q.r]));
      const without_ = positionAt(withoutPath);
      // Their difference in the RTN axes of the station without the burn (km).
      const diff = withPath.filter(([t]) => t >= tigMs && without.has(t)).map(([t, q]) => {
        const o = without.get(t);
        return [t, toRtn(rtn(o.r, o.v), v3.sub(q.r, o.r))];
      });
      const startMs = states.before.ms, stopMs = dayMs + HOUR;
      const span = { startMs, stopMs, format: (ms) => `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')} UTC · ${ms < tigMs ? '−' : '+'}${(Math.abs(ms - tigMs) / HOUR).toFixed(2)} h` };
      const along = v3.unit(burnAt.v);
      await orbit.draw((g) => {
        g.earth();
        g.track(series(without, startMs, tigMs).map(([t, q]) => [(t - tigMs) / 1000, q.r]), { color: 'cyan', width: 2.5 });
        g.arrow(burnAt.r, v3.add(burnAt.r, v3.scale(along, 1200)), { color: 'accent', width: 12, frame: false });
        g.point(burnAt.r, { color: 'accent', size: 9, label: `Burn ${utc(tigMs)} · ${num(executed.inTrackMps, 3)} m/s`, labelOptions: { above: true } });
        g.point(foundAt.r, { color: 'text', size: 7, outline: 1, label: `Found from public OMMs: ${utc(foundMs)}`, labelOptions: { align: 'right', dy: 14 } });
        g.moving(withoutPath.map(([t, q]) => [t, q.r]), { color: 'muted', size: 8, trail: 2, dash: true, trailTime: 95 * 60, label: 'Without the burn', labelOptions: { dy: 14 } });
        g.moving(withPath.map(([t, q]) => [t, q.r]), { color: 'accent', size: 10, trail: 2.5, trailTime: 95 * 60, label: 'ISS', labelOptions: { above: true } });
        g.view({ preset: '3d' });
      }, { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal', time: span,
        caption: `GCRF; the ISS from NASA’s trajectories, then propagator/hpop (EGM2008 20×20, Sun and Moon) from NASA’s states before and after the burn; the last revolution trails each; the Earth at 6,378 km`,
        legend: [['cyan', 'Before the burn'], ['accent', 'With the burn'], ['muted', 'Without it', 'dash'], ['text', 'Detector’s event', 'dot'], ['earth', 'Earth, 6,378.137 km']] });
      await apart.draw((g) => {
        g.point([0, 0, 0], { color: 'muted', size: 8, label: 'Without the burn', labelColor: 'muted' });
        g.line(diff.map((q) => q[1]), { color: 'muted', width: 1, alpha: 0.5 });
        g.moving(diff, { color: 'accent', size: 10, trail: 2.5, label: 'With it' });
        g.vector([0, 0, 0], diff, { color: 'accent', width: 6 });
        g.view({ preset: '3d' });
      }, { axes: ['Radial (km)', 'In-track (km)', 'Cross-track (km)'], aspect: 'normal', time: span,
        caption: `The station with the burn less the station without it, in the radial, in-track and cross-track axes of the latter (km): ${formatMeters(Math.abs(gap[1]) * 1000)} behind and ${formatMeters(Math.abs(gap[0]) * 1000)} ${gap[0] > 0 ? 'higher' : 'lower'} a day after the burn`,
        legend: [['accent', 'With − without, to the time shown'], ['muted', 'The whole day']] });
      const hours = (t) => (t - tigMs) / HOUR;
      figure.draw({ series: [{ name: 'Distance, with − without', color: 'var(--accent)', points: diff.map(([t, c]) => [hours(t), Math.max(v3.norm(c) * 1000, 1e-3)]) }],
        x: { min: hours(startMs), max: hours(stopMs), ticks: [0, 6, 12, 18, 24], format: (h) => `${h >= 0 ? '+' : '−'}${Math.abs(Number(h.toFixed(1)))} h` },
        cursor: { x: hours(stopMs), set: (h) => ctx.time.set(tigMs + h * HOUR) } });
      return `The ${iss.burn.name.toLowerCase()} of ${new Date(tigMs).toISOString().slice(0, 10)}: planned ${num(iss.burn.dvMps, 3)} m/s, executed ${num(executed.inTrackMps, 3)} m/s, found from public element sets ${Math.round(Math.abs(foundMs - tigMs) / MIN)} min ${foundMs < tigMs ? 'before' : 'after'} the planned time; a day later the station is ${formatMeters(gapKm * 1000)} from where it would have been.`;
    });
  }
  ctx.time.on((ms) => figure.cursor((ms - tigMs) / HOUR));
  await draw();
}
