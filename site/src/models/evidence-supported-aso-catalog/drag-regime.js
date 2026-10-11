// Section 5.4, the drag regime: CHAMP through the storms of 28 October to
// 1 November 2003, one of HASDM's windows. Along its orbit, the density its
// accelerometer measured and HASDM's (Licata et al. 2021), and JB2008 with
// SET's indices, alone and with E5's temperature correction calibrated on
// GRACE-A only (CHAMP held out); analysis/density-calibration computed both
// JB2008 densities and foundation/frames turned CHAMP's geodetic samples into
// GCRF positions when the site was built (site/run-drag.mjs). In the plot box
// each density stands off CHAMP's orbit radially by its log ratio to JB2008;
// the charts score each model as E5 does, by orbit means, and give the
// correction itself. One clock drives the box and both charts.
import { chart, credits, fixed, note, num, panel, table, tiles } from '../ui.js';
import { planeNormal, scene3d, v3 } from '../scene.js';

const HOUR = 3600e3;
const K = 2500;   // km of radial offset per unit of ln(ρ / ρ_JB2008)
const MODELS = [['jb2008', 'JB2008 (SET’s indices)'], ['corrected', 'JB2008 + the correction (calibrated on GRACE-A)'], ['hasdm', 'HASDM']];

// Axis limits on multiples of `unit` about zero, with at most eight ticks.
function niceAxis(values, unit) {
  const lo = Math.min(0, Math.floor(Math.min(...values) / unit) * unit), hi = Math.max(0, Math.ceil(Math.max(...values) / unit) * unit);
  let step = unit;
  while ((hi - lo) / step > 8) step *= 2;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return { min: lo, max: hi, ticks };
}

export default async function run(ctx) {
  const d = await ctx.fetchJson('./data/drag/champ-2003-storm.json');
  const p = panel(ctx.root, 'CHAMP, 28 October to 1 November 2003');
  const view = scene3d(ctx, { title: 'The densities along CHAMP’s orbit', caption: 'GCRF (km)' });
  const left = chart(ctx.root, 'What each model leaves: ln(measured / model), orbit means', 'One orbital period centred every 10 min, as E5 scores; drag to move the box above in time');
  const fix = chart(ctx.root, 'The correction: a temperature offset every 3 hours', 'Calibrated on GRACE-A’s densities alone, applied to JB2008 at CHAMP');
  const scores = panel(ctx.root, 'σ of ln(measured / model)');
  await credits(ctx, ctx.root, ['data/drag/champ-2003-storm.json']);

  const s = d.samples, t0 = s.t[0], n = s.t.length;
  const at = (k) => s.gcrfKm.slice(3 * k, 3 * k + 3);
  const lift = (k, ratio) => { const r = at(k), m = v3.norm(r); return v3.scale(r, (m + K * Math.log(ratio)) / m); };
  const valid = (k) => s.obs[k] > 0 && s.jb2008[k] > 0 && s.corrected[k] > 0 && s.hasdm[k] > 0;
  const series = (f) => s.t.map((t, k) => (valid(k) ? [t, f(k)] : null)).filter(Boolean);

  // σ over these days, from the orbit means.
  const om = d.orbitMeans;
  const resid = (m) => om.t.map((t, i) => [t, Math.log(om.obs[i] / om[m][i])]);
  const sd = (xs) => { const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1)); };
  const sigma = Object.fromEntries(MODELS.map(([m]) => [m, sd(resid(m).map(([, y]) => y))]));
  tiles(p, [['Orbit means', num(om.t.length)], ...MODELS.map(([m, name]) => [`σ, ${name.split(' (')[0]}`, fixed(sigma[m], 3)])]);
  const ci = (x) => `${fixed(x[0], 3)} [${fixed(x[1], 3)}, ${fixed(x[2], 3)}]`;
  table(scores, ['', 'These 4 days', `CHAMP, ${d.e5.champ.days} days`, `Both, ${d.e5.pooled.days} days`],
    MODELS.map(([m, name]) => [name, fixed(sigma[m], 3), ci(d.e5.champ[m].sigma), ci(d.e5.pooled[m].sigma)]));
  note(scores, `E5 on HASDM’s windows (October to December 2003, January to March 2008): CHAMP held out, scored against the correction calibrated on GRACE-A, and both satellites, each held out in turn; 95 % intervals in brackets.`);

  // The time the box opens at: the orbit mean JB2008 misses most.
  const worst = om.t[resid('jb2008').reduce((a, b, i, all) => (Math.abs(b[1]) > Math.abs(all[a][1]) ? i : a), 0)];
  const span = { startMs: t0, stopMs: s.t[n - 1], ms: worst, format: (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC · +${((ms - t0) / HOUR).toFixed(1)} h` };
  const rev = d.orbitMeans.periodSeconds;
  await ctx.run('Drawing', async () => {
    await view.draw((g) => {
      g.earth();
      const champ = series((k) => at(k));
      const measured = series((k) => lift(k, s.obs[k] / s.jb2008[k]));
      const corrected = series((k) => lift(k, s.corrected[k] / s.jb2008[k]));
      const hasdm = series((k) => lift(k, s.hasdm[k] / s.jb2008[k]));
      g.moving(champ, { color: 'text', size: 9, trail: 1.5, trailTime: rev, resolution: 60, trailAlpha: 0.55, label: 'CHAMP', labelColor: 'text' });
      g.moving(hasdm, { color: 'muted', size: 6, trail: 1.5, trailTime: rev, resolution: 60, dash: true });
      g.moving(measured, { color: 'cyan', size: 7, trail: 2.5, trailTime: rev, resolution: 60 });
      g.moving(corrected, { color: 'accent', size: 7, trail: 2.5, trailTime: rev, resolution: 60 });
      g.vector(champ, measured, { color: 'cyan', width: 2, arrow: false });
      g.vector(champ, corrected, { color: 'accent', width: 2, arrow: false });
      const first = s.t.findIndex((t) => t >= t0 + rev * 1000);
      g.view({ normal: planeNormal(champ.slice(0, first).map(([, r]) => r)) });
    }, { axes: ['x, GCRF (km)', 'y, GCRF (km)', 'z, GCRF (km)'], aspect: 'equal', time: span,
      caption: `GCRF (km); CHAMP’s last revolution to the time shown (about ${Math.round(s.altKm[0])} km up), and each density standing off it radially by ${num(K, 4)} km per unit of ln(ρ / ρ JB2008): outside where it is above JB2008, inside where below (10 % ≈ ${Math.round(K * Math.log(1.1))} km); the Earth at 6,378 km`,
      legend: [['text', 'CHAMP’s orbit: JB2008 itself'], ['cyan', 'Measured (accelerometer)'], ['accent', 'JB2008 + the correction'], ['muted', 'HASDM', 'dash'], ['earth', 'Earth, 6,378.137 km']] });

    const hours = (ms) => (ms - t0) / HOUR;
    const ticks = [0, 24, 48, 72, 96];
    left.draw({ series: [
      { name: 'JB2008', color: 'var(--cyan)', points: resid('jb2008').map(([t, y]) => [hours(t), y]), label: true, labelText: `JB2008 ${fixed(sigma.jb2008, 3)}` },
      { name: 'JB2008 + correction', color: 'var(--accent)', points: resid('corrected').map(([t, y]) => [hours(t), y]), label: true, labelText: `Corrected ${fixed(sigma.corrected, 3)}` },
      { name: 'HASDM', color: 'var(--series-muted)', points: resid('hasdm').map(([t, y]) => [hours(t), y]), dash: true, label: true, labelText: `HASDM ${fixed(sigma.hasdm, 3)}` },
    ], x: { min: 0, max: 96, ticks, format: (h) => `${new Date(t0 + h * HOUR).toISOString().slice(5, 10)} ${new Date(t0 + h * HOUR).toISOString().slice(11, 13)}h` },
    y: { scale: 'linear', ...niceAxis(MODELS.flatMap(([m]) => resid(m).map(([, y]) => y)), 0.1), format: (v) => (v > 0 ? `+${num(v, 2)}` : num(v, 2)), value: (v) => num(v, 3) },
    cursor: { x: hours(worst), set: (h) => ctx.time.set(t0 + h * HOUR) } });
    const bins = d.correction.bins.map((b) => [hours((b.fromMjd + b.toMjd) / 2 * 86400e3 - 40587 * 86400e3), b.deltaTK]).filter(([h]) => h >= 0 && h <= 96);
    fix.draw({ series: [{ name: 'ΔT', color: 'var(--accent)', points: bins, markers: true }],
      x: { min: 0, max: 96, ticks, format: (h) => `${new Date(t0 + h * HOUR).toISOString().slice(5, 10)} ${new Date(t0 + h * HOUR).toISOString().slice(11, 13)}h` },
      y: { scale: 'linear', ...niceAxis(bins.map(([, y]) => y), 50), format: (v) => `${Math.round(v)} K`, value: (v) => `${num(v, 3)} K` },
      cursor: { x: hours(worst), set: (h) => ctx.time.set(t0 + h * HOUR) } });
    return `Over these four days JB2008 leaves σ ${fixed(sigma.jb2008, 3)} on CHAMP; the correction calibrated on GRACE-A alone, ${fixed(sigma.corrected, 3)}; HASDM, ${fixed(sigma.hasdm, 3)}. Over HASDM’s windows (E5, ${d.e5.pooled.days} days, both satellites): ${fixed(d.e5.pooled.jb2008.sigma[0], 3)}, ${fixed(d.e5.pooled.corrected.sigma[0], 3)} and ${fixed(d.e5.pooled.hasdm.sigma[0], 3)}.`;
  });
  ctx.time.on((ms) => { left.cursor((ms - t0) / HOUR); fix.cursor((ms - t0) / HOUR); });
}
