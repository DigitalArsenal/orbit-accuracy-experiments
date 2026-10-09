// Section 3, self-bounded motion: each SGP4 sample carries D = ½ A h², the
// farthest the object can stray from its straight line over ±h. The module's
// coarse_grid returns D with every sample; the page reads it for orbits from
// low Earth orbit to geostationary at several step sizes.
import { formatMeters } from '../../chart.js';
import { START_MS } from '../codec/screen.js';
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

export default async function run(ctx) {
  const figure = chart(ctx.root, 'D against half-step h', 'From the module’s coarse_grid; D grows as h²');
  const box = panel(ctx.root, 'At 60 s steps (h = 30 s)');
  note(ctx.root, 'A·|r|²/μ is the module’s D/(½h²) scaled by gravity at the sample: 1.05 at the floor, above it when the radius at −h is smaller than |r|.');
  const ca = await ctx.module('analysis/conjunction-assessment');
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
    return `At 60 s steps a 400 km orbit’s sample carries D = ${formatMeters(leo.boundKm * 1000)}; doubling the step multiplies D by ${num(byStep[STEPS.indexOf(120)][0].boundKm / leo.boundKm, 3)}.`;
  });
}
