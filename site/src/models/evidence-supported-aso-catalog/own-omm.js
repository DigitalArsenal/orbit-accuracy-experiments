// Section 4, SDN's own OMMs: an SGP4 element set fitted to an operator's
// ephemeris over a declared interval, then scored on the stretch after it.
// analysis/od fits NASA's ISS trajectory (as an SDS $OEM, EME2000) over its
// first two orbital periods and returns the $OMM with an SDS $OCM recording
// the fit; propagator/sgp4 carries the $OMM over the file's 72 hours (GCRF);
// foundation/frames turns NASA's states from EME2000 to GCRF. The difference
// is taken in the radial, in-track and cross-track axes of NASA's state.
// Two plot boxes and a chart follow one clock.
import * as flatbuffers from 'flatbuffers';
import { OMM } from 'spacedatastandards.org/lib/js/OMM/main.js';
import { OCM } from 'spacedatastandards.org/lib/js/OCM/main.js';
import { formatMeters } from '../../chart.js';
import { transformState } from '../codec/frames.js';
import { TYPES, outputsOf, versionOem } from '../codec/mnv.js';
import { OMM_TYPE, PROP, ephemerisLines, ephemerisRequest } from '../codec/sgp4.js';
import { chart, credits, fixed, note, num, panel, table, tiles } from '../ui.js';
import { planeNormal, rtn, scene3d, toRtn, v3 } from '../scene.js';

const HOUR = 3600e3;
const FIT_SECONDS = 11520;   // analysis/od's near-term window: two orbital periods
const ISS = { norad: 25544, objectId: '1998-067A', name: 'ISS' };

export default async function run(ctx) {
  const oem = await ctx.fetchJson('./data/operator/iss-oem.json');
  const p = panel(ctx.root, 'An OMM fitted to NASA’s ISS trajectory');
  const record = panel(ctx.root, 'What the fit returns');
  const orbit = scene3d(ctx, { title: 'NASA’s trajectory and SGP4 on the fitted OMM', caption: 'GCRF (km)' });
  const apart = scene3d(ctx, { title: 'SGP4 on the fitted OMM − NASA’s trajectory', caption: 'Radial, in-track and cross-track of NASA’s state (km)' });
  const figure = chart(ctx.root, 'Distance from NASA’s trajectory', 'Inside the fit window, then after it; drag to move the boxes above in time');
  await credits(ctx, ctx.root, ['data/operator/iss-oem.json']);
  const [od, sgp4, frames] = await Promise.all([ctx.module('analysis/od'), ctx.module('propagator/sgp4'), ctx.module('foundation/frames')]);

  const result = await ctx.run('analysis/od fit, propagator/sgp4 72 h, foundation/frames EME2000 to GCRF', async () => {
    const t0 = oem.epochsUnixMs[0];
    const fit = await od.invoke('fit', [{ portId: 'oem', payload: versionOem({ ...oem, url: oem.file }, ISS), typeRef: TYPES.OEM },
      { portId: 'options', payload: new TextEncoder().encode(JSON.stringify({ dataSource: 'NASA ISS OEM', noradCatId: ISS.norad })) }]);
    const ommBytes = outputsOf(fit, 'omm')[0];
    const omm = OMM.getSizePrefixedRootAsOMM(new flatbuffers.ByteBuffer(ommBytes)).unpack();
    const ocm = OCM.getSizePrefixedRootAsOCM(new flatbuffers.ByteBuffer(outputsOf(fit, 'ocm')[0])).unpack();
    // SGP4 at NASA's own epochs: one call per run of its regular 240 s grid
    // (the file adds a point at each event, which shifts the grid).
    const runs = [];
    for (const ms of oem.epochsUnixMs) {
      if (runs.length && ms - runs.at(-1).at(-1) === 240e3) runs.at(-1).push(ms); else runs.push([ms]);
    }
    const sgp = new Map();
    for (const span of runs) {
      const run = await sgp4.invoke('propagate_ephemeris', [{ portId: 'request', payload: ephemerisRequest({ catalogNumbers: [ISS.norad], startMs: span[0], stopMs: span.at(-1), stepSeconds: 240 }), typeRef: PROP },
        { portId: 'omm', payload: ommBytes, typeRef: OMM_TYPE }]);
      for (const l of ephemerisLines(outputsOf(run, 'ephemeris')[0])) sgp.set(Math.round(l.ms / 1000), l);
    }
    const rows = [];
    for (const [i, ms] of oem.epochsUnixMs.entries()) {
      const s = sgp.get(Math.round(ms / 1000));
      if (!s) continue;
      const nasa = await transformState(frames, { from: 'EME2000', to: 'GCRF', epochIso: new Date(ms).toISOString().replace('Z', ''), r: oem.position.slice(3 * i, 3 * i + 3), v: oem.velocity.slice(3 * i, 3 * i + 3) });
      rows.push({ ms, nasa: nasa.r, sgp4: s.r, error: toRtn(rtn(nasa.r, nasa.v), v3.sub(s.r, nasa.r)) });
    }
    return { t0, omm, ocm, rows };
  });
  if (!result) return;
  const { t0, omm, ocm, rows } = result;
  const fitEnd = t0 + FIT_SECONDS * 1000;
  const inside = rows.filter((x) => x.ms <= fitEnd), after = rows.filter((x) => x.ms >= fitEnd);
  const rms = Math.sqrt(inside.reduce((a, x) => a + v3.norm(x.error) ** 2, 0) / inside.length);
  const at = (h) => rows.reduce((a, b) => (Math.abs(b.ms - t0 - h * HOUR) < Math.abs(a.ms - t0 - h * HOUR) ? b : a));
  const det = ocm.ORBIT_DETERMINATION ?? {};
  const wrmsKm = Number(/WRMS=([\d.eE+-]+)\s*km/.exec(det.OD_RESIDUALS ?? '')?.[1]);
  const wrms = Number.isFinite(wrmsKm) ? formatMeters(wrmsKm * 1000) : '—';
  tiles(p, [['Fit window', `${fixed(FIT_SECONDS / 3600, 1)} h`], ['Fit residual, WRMS (OCM)', wrms],
    ...[6, 24, 72].map((h) => [`At ${h} h`, formatMeters(v3.norm(at(h).error) * 1000)])]);
  table(record, ['$OMM field', 'Value'], [
    ['EPOCH', omm.EPOCH], ['MEAN_MOTION (rev/day)', num(omm.MEAN_MOTION, 10)], ['ECCENTRICITY', num(omm.ECCENTRICITY, 7)],
    ['INCLINATION (°)', num(omm.INCLINATION, 8)], ['RA_OF_ASC_NODE (°)', num(omm.RA_OF_ASC_NODE, 8)], ['ARG_OF_PERICENTER (°)', num(omm.ARG_OF_PERICENTER, 8)],
    ['MEAN_ANOMALY (°)', num(omm.MEAN_ANOMALY, 8)], ['BSTAR (1/earth radii)', num(omm.BSTAR, 5)], ['ORIGINATOR', omm.ORIGINATOR ?? '—'],
  ].map(([k, v]) => [{ text: k, class: 'left mono' }, { text: String(v), class: 'mono' }]));
  table(record, ['$OCM orbit determination', 'Value'], [
    ['OD_ALGORITHM', det.OD_ALGORITHM], ['OD_METHOD', det.OD_METHOD], ['OD_EPOCH', det.OD_EPOCH], ['OD_RESIDUALS', det.OD_RESIDUALS], ['OD_CONVERGENCE_CRITERIA', det.OD_CONVERGENCE_CRITERIA],
    ...(ocm.USER_DEFINED_PARAMETERS ?? []).filter((u) => /COVARIANCE_INTERPRETATION|STATE_REFERENCE_FRAME/.test(u.PARAM_NAME)).map((u) => [u.PARAM_NAME, u.PARAM_VALUE]),
  ].filter(([, v]) => v).map(([k, v]) => [{ text: k, class: 'left mono' }, { text: String(v), class: 'mono wrap' }]));
  note(record, `Here, inside the window: ${formatMeters(rms * 1000)} RMS of the 3-D distance over ${inside.length} of NASA’s states, in GCRF.`);

  const span = { startMs: t0, stopMs: rows.at(-1).ms, ms: fitEnd, format: (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC · +${((ms - t0) / HOUR).toFixed(1)} h` };
  await ctx.run('Drawing', async () => {
    await orbit.draw((g) => {
      g.earth();
      const rev = rows.filter((x) => x.ms <= t0 + 93 * 60e3);
      g.track(rev.map((x) => [(x.ms - t0) / 1000, x.nasa]), { color: 'cyan', width: 2, alpha: 0.8 });
      g.moving(rows.map((x) => [x.ms, x.nasa]), { color: 'cyan', size: 9, trail: false, label: 'NASA', labelColor: 'cyan' });
      g.moving(rows.map((x) => [x.ms, x.sgp4]), { color: 'accent', size: 7, trail: false, label: 'SGP4, own OMM' });
      g.view({ normal: planeNormal(rev.map((x) => x.nasa)) });
    }, { axes: ['x, GCRF (km)', 'y, GCRF (km)', 'z, GCRF (km)'], aspect: 'equal', time: span,
      caption: `GCRF (km); NASA’s ISS trajectory issued ${oem.created.slice(0, 16).replace('T', ' ')} UTC (one revolution drawn), and SGP4 on the OMM fitted to its first ${fixed(FIT_SECONDS / 3600, 1)} h; the Earth at 6,378 km`,
      legend: [['cyan', 'NASA’s trajectory'], ['accent', 'SGP4 on the fitted OMM', 'dot'], ['earth', 'Earth, 6,378.137 km']] });
    await apart.draw((g) => {
      g.point([0, 0, 0], { color: 'cyan', size: 8, label: 'NASA', labelColor: 'cyan', labelOptions: { dy: 16 } });
      g.line(inside.map((x) => x.error), { color: 'accent', width: 2 });
      g.line(after.map((x) => x.error), { color: 'muted', width: 1, alpha: 0.6 });
      g.moving(rows.map((x) => [x.ms, x.error]), { color: 'accent', size: 9, trail: 2.5, label: 'SGP4, own OMM' });
      g.vector([0, 0, 0], rows.map((x) => [x.ms, x.error]), { color: 'accent', width: 6 });
      g.view({ preset: '3d' });
    }, { axes: ['Radial (km)', 'In-track (km)', 'Cross-track (km)'], aspect: 'normal', time: span,
      caption: `SGP4 on the fitted OMM less NASA’s state, in the radial, in-track and cross-track axes of NASA’s state (km; each axis to its own scale): the fit window drawn bold, the stretch after it thin`,
      legend: [['accent', 'Inside the fit window'], ['muted', 'After it, 72 h'], ['cyan', 'NASA (origin)', 'dot']] });
    const hours = (ms) => (ms - t0) / HOUR;
    figure.draw({ series: [
      { name: 'Inside the fit window', color: 'var(--accent)', points: inside.map((x) => [hours(x.ms), v3.norm(x.error) * 1000]), label: true, labelText: 'Fit' },
      { name: 'After it', color: 'var(--cyan)', points: after.map((x) => [hours(x.ms), v3.norm(x.error) * 1000]), label: true, labelText: 'Held out' },
    ], x: { min: 0, max: 72, ticks: [0, 12, 24, 36, 48, 60, 72], format: (h) => `${Number(h.toFixed(1))} h` },
    cursor: { x: hours(fitEnd), set: (h) => ctx.time.set(t0 + h * HOUR) } });
    return `Fitted to NASA’s first ${fixed(FIT_SECONDS / 3600, 1)} hours, the OMM stays within ${formatMeters(Math.max(...inside.map((x) => v3.norm(x.error))) * 1000)} of the trajectory there (weighted RMS ${wrms} in the module’s fit); after it, ${formatMeters(v3.norm(at(24).error) * 1000)} at 24 h and ${formatMeters(v3.norm(at(72).error) * 1000)} at 72 h: the stretch a release is scored on.`;
  });
  ctx.time.on((ms) => figure.cursor((ms - t0) / HOUR));
}
