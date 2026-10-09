// Section 4: osculating elements (a, e, i, Ω, ω, and u = ω + ν) to a J2000
// Cartesian state at the same epoch, by foundation/orbits
// opm_keplerian_to_oem. First Basilisk's published case, then any elements.
import { formatMeters } from '../../chart.js';
import { OPM_TYPE, decodeOemLine, opmBytes } from '../codec/elements.js';
import { h, inputs, num, panel, table, tiles } from '../ui.js';

const MU = 398600.4418;
// Basilisk test_orbitalMotion.cpp TwoDimensionElliptical (μ = 398600.436).
const BASILISK = { a: 7500, e: 0.5, i: 40, raan: 133, argp: 113, nu: 123, gm: 398600.436,
  r: [6538.3506963942027, 186.7227227879431, -4119.3008399778619], v: [1.4414106130924005, 5.588901415902356, -4.0828931566657038] };

export default async function run(ctx) {
  const check = panel(ctx.root, 'A published case');
  const p = panel(ctx.root, 'Elements at the epoch');
  const form = inputs(p, [
    { id: 'a', label: 'a (km)', value: 7000 }, { id: 'e', label: 'e', value: 0.01, min: 0, max: 0.99, step: 0.001 },
    { id: 'i', label: 'i (deg)', value: 51.6 }, { id: 'raan', label: 'Ω (deg)', value: 30 },
    { id: 'argp', label: 'ω (deg)', value: 90 }, { id: 'u', label: 'u, argument of latitude (deg)', value: 120 },
  ], () => convert());
  const orbits = await ctx.module('foundation/orbits');
  const toState = async (o) => decodeOemLine((await orbits.invoke('opm_keplerian_to_oem', [{ portId: 'orbit_parameters', typeRef: OPM_TYPE,
    payload: opmBytes({ name: 'MODEL', id: 'MODEL', epoch: '2026-10-01T00:00:00.000Z', ...o }) }])).outputs[0].payload);

  await ctx.run('foundation/orbits: Basilisk’s published case', async () => {
    const s = await toState(BASILISK);
    const dr = Math.hypot(...s.r.map((x, k) => x - BASILISK.r[k])) * 1000, dv = Math.hypot(...s.v.map((x, k) => x - BASILISK.v[k])) * 1e6;
    table(check, ['', 'Module', 'Basilisk'], [
      ...['X', 'Y', 'Z'].map((c, k) => [`${c} (km)`, num(s.r[k], 12), num(BASILISK.r[k], 12)]),
      ...['Ẋ', 'Ẏ', 'Ż'].map((c, k) => [`${c} (km/s)`, num(s.v[k], 12), num(BASILISK.v[k], 12)]),
    ]);
    check.append(h('p', { class: 'fine' }, `a 7,500 km, e 0.5, i 40°, Ω 133°, ω 113°, ν 123°. Differences ${formatMeters(dr, 2)} in position and ${num(dv, 3)} mm/s in velocity.`));
  });

  async function convert() {
    const { a, e, i, raan, argp, u } = form.values();
    await ctx.run('foundation/orbits opm_keplerian_to_oem', async () => {
      const nu = ((u - argp) % 360 + 360) % 360;  // ν = u − ω, as the paper states
      const s = await toState({ a, e, i, raan, argp, nu, gm: MU });
      tiles(p, [['ν = u − ω', `${num(nu, 6)}°`], ['|r|', `${num(Math.hypot(...s.r), 8)} km`], ['|v|', `${num(Math.hypot(...s.v), 8)} km/s`]]);
      const box = p.querySelector('table') ?? undefined;
      table(p, ['', 'X', 'Y', 'Z'], [['r (km)', ...s.r.map((x) => num(x, 10))], ['v (km/s)', ...s.v.map((x) => num(x, 10))]], { existing: box });
      return 'An instantaneous conversion at the epoch: J2000 axes, μ = 398600.4418 km³/s², no propagation.';
    });
  }
  await convert();
}
