// Section 3, self-bounded motion: each SGP4 sample carries D = ½ A h², the
// farthest the object can stray from its straight line over ±h. The module's
// coarse_grid returns D with every sample; the page reads it for orbits from
// low Earth orbit to geostationary at several step sizes.
import { formatMeters } from '../../chart.js';
import { msOf, syntheticShell } from '../codec/cqr.js';
import { START_MS, screenOnce } from '../codec/screen.js';
import { rtn, scene3d, v3 } from '../scene.js';
import { coarseGrid, destroyIndex, prepareIndex } from '../codec/index.js';
import { chart, num, panel, table, note } from '../ui.js';

const MU = 398600.4418;  // km³/s², for the ratio column only
const STEPS = [10, 20, 30, 60, 120, 180];
const ORBITS = [
  { name: 'LEO 400 km', n: 15.54, ecc: 0.0005, inc: 51.6 },
  { name: 'LEO 800 km', n: 14.28, ecc: 0.001, inc: 98.6 },
  { name: 'MEO, GPS', n: 2.0056, ecc: 0.01, inc: 55 },
  { name: 'Molniya', n: 2.006, ecc: 0.74, inc: 63.4, argp: 270, ma: 0 },
  { name: 'Geostationary', n: 1.0027, ecc: 0.0002, inc: 0.05 },
].map((o, i) => ({ id: `ORBIT-${i + 1}`, norad: 800001 + i, epoch: '2026-10-01T00:00:00.000000', raan: 40 * i, argp: o.argp ?? 0, ma: o.ma ?? 30, bstar: 0, ...o }));
const COLORS = ['var(--accent)', 'var(--cyan)', 'var(--series-muted)', 'var(--series-muted)', 'var(--series-muted)'];

// The closest pair of a 300-object screen, on the screen's own 60 s grid:
// each sample's segment over ±h with its bound D (true scale), and the
// objects' paths on a 2 s grid passing inside.
async function encounter(ca) {
  const objects = syntheticShell(300);
  const screen = await screenOnce(ca, objects, { durationSeconds: 6 * 3600 });
  if (!screen.events.length) return null;
  const e = screen.events.reduce((a, b) => (b.MISS_DISTANCE_M < a.MISS_DISTANCE_M ? b : a));
  const pair = [objects.find((o) => o.id === e.PRIMARY_ID), objects.find((o) => o.id === e.SECONDARY_ID)];
  const tcaMs = msOf(e.TCA.JULIAN_DATE), k0 = Math.floor((tcaMs - START_MS) / 60e3);
  const handle = await prepareIndex(ca, pair);
  try {
    const coarse = await coarseGrid(ca, handle, { startMs: START_MS + (k0 - 2) * 60e3, coarseStepSec: 60, steps: 6 });
    const fine = await coarseGrid(ca, handle, { startMs: START_MS + (k0 - 2) * 60e3, coarseStepSec: 2, steps: 151 });
    return { e, pair, tcaMs, coarse, fine, fineAt: Math.round((tcaMs - (START_MS + (k0 - 2) * 60e3)) / 2e3) };
  } finally { await destroyIndex(ca, handle); }
}

export default async function run(ctx) {
  const figure = chart(ctx.root, 'D against half-step h', 'From the module’s coarse_grid; D grows as h²');
  const box = panel(ctx.root, 'At 60 s steps (h = 30 s)');
  const view = scene3d(ctx, { title: 'Two objects’ bounds at an encounter', caption: 'Each 60 s sample’s tube: its straight line over ±h, radius D' });
  note(ctx.root, 'A·|r|²/μ is the module’s D/(½h²) scaled by gravity at the sample: 1.05 at the floor, above it when the radius at −h is smaller than |r|.');
  const ca = await ctx.module('analysis/conjunction-assessment');
  async function drawEncounter() {
    const enc = await encounter(ca);
    if (!enc) return;
    const p = (q) => [q.x, q.y, q.z], vel = (q) => [q.vx, q.vy, q.vz];
    const tca = enc.fine[Math.min(enc.fine.length - 1, enc.fineAt)];
    const mid = v3.scale(v3.add(p(tca[0]), p(tca[1])), 0.5);
    const D = Math.max(...enc.coarse.flatMap((step) => step.map((q) => q.boundKm)));
    const [R, T] = rtn(p(tca[0]), vel(tca[0]));
    await view.draw((g) => {
      [0, 1].forEach((i) => {
        const tone = i ? 'cyan' : 'accent';
        g.line(enc.fine.map((step) => p(step[i])), { color: tone, width: 2, frame: false });
        enc.coarse.forEach((step) => {
          const q = step[i];
          g.cylinder(v3.sub(p(q), v3.scale(vel(q), 30)), v3.add(p(q), v3.scale(vel(q), 30)), q.boundKm, { color: tone, alpha: 0.18, outline: false, frame: false });
          g.point(p(q), { color: tone, size: 6, outline: 1, frame: false });
        });
      });
      g.label(p(tca[1]), `${formatMeters(enc.e.MISS_DISTANCE_M)} at closest`, { color: 'text', dy: -16 });
      g.label(p(enc.coarse[3][0]), `D ${formatMeters(enc.coarse[3][0].boundKm * 1000)}`, { color: 'accent', size: 11 });
      g.view({ center: mid, radius: Math.max(D * 9, 40), direction: v3.unit(v3.add(v3.scale(R, 0.8), v3.scale(T, 0.45))) });
    }, { frame: 'TEME', epochMs: enc.tcaMs, caption: `TEME, true scale; the closest pair of a 300-object screen at ${new Date(enc.tcaMs).toISOString().slice(11, 19)} UTC`,
      legend: [['accent', `${enc.pair[0].name}: path and 60 s tubes`], ['cyan', `${enc.pair[1].name}`]] });
  }
  await ctx.run('analysis/conjunction-assessment coarse_grid at six step sizes', async () => {
    const handle = await prepareIndex(ca, ORBITS);
    const byStep = [];
    try {
      for (const step of STEPS) byStep.push((await coarseGrid(ca, handle, { startMs: START_MS, coarseStepSec: step }))[0]);
    } finally { await destroyIndex(ca, handle); }
    figure.draw({
      series: ORBITS.map((o, i) => ({ name: o.name, color: COLORS[i], points: STEPS.map((s, k) => [s / 2, byStep[k][i].boundKm * 1000]), label: i < 2 || i === 4, labelText: o.name.split(',')[0], markers: i < 2 })),
      x: { min: 5, max: 90, scale: 'log', ticks: [5, 10, 30, 90], format: (h) => `${h} s` },
    });
    const at60 = byStep[STEPS.indexOf(60)];
    table(box, ['Orbit', '|r|', 'D', 'A·|r|²/μ'], ORBITS.map((o, i) => {
      const s = at60[i], r = Math.hypot(s.x, s.y, s.z);
      const a = (s.boundKm) / (0.5 * 30 * 30);
      return [o.name, `${num(r, 5)} km`, formatMeters(s.boundKm * 1000), num((a * r * r) / MU, 4)];
    }));
    const leo = at60[0];
    await drawEncounter();
    return `At 60 s steps a 400 km orbit’s sample carries D = ${formatMeters(leo.boundKm * 1000)}; doubling the step multiplies D by ${num(byStep[STEPS.indexOf(120)][0].boundKm / leo.boundKm, 3)}.`;
  });
}
