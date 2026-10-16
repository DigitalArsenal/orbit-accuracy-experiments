// Section 5.2, operator- and provider-ephemeris objects: the ISS's operator
// ephemeris (NASA's trajectory, as served) against the public-data products
// E4 scored on it: SGP4 on the latest public OMM (S) and the FFM product from
// the OMM's epoch state (H), each one's median offset from NASA's trajectory
// over E4's four files, by horizon, in the radial, in-track and cross-track
// axes of the trajectory. Two plot boxes follow one clock: the trajectory
// (EME2000, km) and the offsets (km).
import { formatMeters } from '../../chart.js';
import { chart, credits, panel, table } from '../ui.js';
import { scene3d } from '../scene.js';

const HOUR = 3600e3;

export default async function run(ctx) {
  const [oem, e4] = await Promise.all([ctx.fetchJson('./data/operator/iss-oem.json'), ctx.fetchJson('./data/operator/e4-iss.json')]);
  const p = panel(ctx.root, 'The operator’s ephemeris against the public products');
  const orbit = scene3d(ctx, { title: 'The operator’s ephemeris', caption: 'EME2000 (km)' });
  const apart = scene3d(ctx, { title: 'The public products − the operator’s ephemeris', caption: 'Radial, in-track and cross-track (km)' });
  const figure = chart(ctx.root, 'Median distance from the operator’s ephemeris', `E4, ${e4.files} NASA files; drag to move the boxes above in time`);
  await credits(ctx, ctx.root, ['data/operator/iss-oem.json', 'data/operator/e4-iss.json']);
  const t0 = oem.epochsUnixMs[0];
  const at = (s) => [t0 + s.hours * HOUR, s.signedMedianRtnKm];
  table(p, ['Horizon', 'SGP4 on the public OMM (S)', 'FFM from its epoch state (H)'], e4.S.map((s, k) => [`${s.hours} h`, formatMeters(s.medianKm * 1000), formatMeters(e4.H[k].medianKm * 1000)]));
  const span = { startMs: t0, stopMs: t0 + 72 * HOUR, format: (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC · +${((ms - t0) / HOUR).toFixed(1)} h` };
  await ctx.run('Drawing', async () => {
    await orbit.draw((g) => {
      g.earth();
      const rev = oem.epochsUnixMs.findIndex((ms) => ms > t0 + 93 * 60e3);
      g.track(oem.epochsUnixMs.slice(0, rev + 1).map((ms, i) => [(ms - t0) / 1000, oem.position.slice(3 * i, 3 * i + 3)]), { color: 'text', width: 2, alpha: 0.8 });
      g.moving(oem.epochsUnixMs.map((ms, i) => [ms, oem.position.slice(3 * i, 3 * i + 3)]), { color: 'text', size: 9, trail: 2, trailTime: 93 * 60, label: 'ISS (NASA)' });
      g.view({ preset: '3d' });
    }, { axes: ['x, EME2000 (km)', 'y, EME2000 (km)', 'z, EME2000 (km)'], aspect: 'equal', time: span,
      caption: `EME2000 (km); NASA’s ISS trajectory issued ${oem.created.slice(0, 16).replace('T', ' ')} UTC, 72 h from its start (one revolution drawn); the Earth at 6,378 km`,
      legend: [['text', 'The operator’s ephemeris (NASA)'], ['earth', 'Earth, 6,378.137 km']] });
    await apart.draw((g) => {
      g.point([0, 0, 0], { color: 'text', size: 9, label: 'NASA', labelColor: 'text', labelOptions: { dy: 16 } });
      for (const [name, list, color] of [['S', e4.S, 'cyan'], ['H', e4.H, 'accent']]) {
        g.line(list.map((s) => s.signedMedianRtnKm), { color, width: 1, alpha: 0.45 });
        list.forEach((s) => g.point(s.signedMedianRtnKm, { color, size: 5, outline: 0 }));
        g.moving(list.map(at), { color, size: 10, trail: 2.5, degree: 1, label: name === 'S' ? 'SGP4 on the OMM' : 'FFM from the OMM’s state' });
        g.vector([0, 0, 0], list.map(at), { color, width: 5 });
      }
      g.view({ preset: '3d' });
    }, { axes: ['Radial (km)', 'In-track (km)', 'Cross-track (km)'], aspect: 'normal', time: span,
      caption: `Each product’s median offset from NASA’s trajectory over E4’s ${e4.files} files, component by component, in the radial, in-track and cross-track axes of the trajectory (km; each axis to its own scale), at each horizon (dots); between horizons the marker moves straight`,
      legend: [['cyan', 'SGP4 on the latest public OMM (S)'], ['accent', 'FFM from the OMM’s epoch state (H)'], ['text', 'The operator’s ephemeris (origin)', 'dot']] });
    figure.draw({ series: [
      { name: 'SGP4 on the public OMM (S)', color: 'var(--cyan)', points: e4.S.map((s) => [s.hours, s.medianKm * 1000]), markers: true, label: true, labelText: 'S' },
      { name: 'FFM from its epoch state (H)', color: 'var(--accent)', points: e4.H.map((s) => [s.hours, s.medianKm * 1000]), markers: true, label: true, labelText: 'H' },
    ], x: { min: 0, max: 72, ticks: [0, 12, 24, 36, 48, 60, 72], format: (h) => `${Number(h.toFixed(1))} h` },
    cursor: { x: 72, set: (h) => ctx.time.set(t0 + h * HOUR) } });
    const last = (list) => list.at(-1);
    return `Against NASA’s own trajectory, SGP4 on the latest public OMM starts ${formatMeters(e4.S[0].medianKm * 1000)} off and is ${formatMeters(last(e4.S).medianKm * 1000)} off at ${last(e4.S).hours} h; the FFM product from the OMM’s epoch state, ${formatMeters(e4.H[0].medianKm * 1000)} and ${formatMeters(last(e4.H).medianKm * 1000)} (medians, E4).`;
  });
  ctx.time.on((ms) => figure.cursor((ms - t0) / HOUR));
}
