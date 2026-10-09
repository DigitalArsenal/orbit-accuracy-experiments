// Section 5, levels of measurement: what one encoding increment of each TLE
// field does to the SGP4 state. Each field is bumped by its last printed
// digit and every variant goes through analysis/epoch-state in one call; the
// mean-motion increment, which only shows over time, also goes a day through
// propagator/hpop. The page only takes norms of differences.
import { executionFrame, decodeExecution } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import { HOUR, isoMicro } from '../../runs.js';
import { deriveEpochStates } from '../codec/elements.js';
import { inputs, num, panel, table, note } from '../ui.js';
import { magnification, rtn, scene3d, v3 } from '../scene.js';

const FIELDS = [
  { key: 'MEAN_ANOMALY', symbol: 'M', label: 'Mean anomaly', step: 1e-4, unit: '0.0001°', level: 'Directional', paper: '≈ 12 m along-track' },
  { key: 'INCLINATION', symbol: 'i', label: 'Inclination', step: 1e-4, unit: '0.0001°', level: 'Ratio, bounded', paper: '≈ 12 m cross-track' },
  { key: 'RA_OF_ASC_NODE', symbol: 'Ω', label: 'Node', step: 1e-4, unit: '0.0001°', level: 'Directional', paper: '≈ 12 m × sin i' },
  { key: 'ARG_OF_PERICENTER', symbol: 'ω', label: 'Argument of perigee', step: 1e-4, unit: '0.0001°', level: 'Directional', paper: '≈ 12 m in-plane' },
  { key: 'ECCENTRICITY', symbol: 'e', label: 'Eccentricity', step: 1e-7, unit: '1e-7', level: 'Ratio, bounded', paper: '≈ 0.7 m radial' },
  { key: 'MEAN_MOTION', symbol: 'n', label: 'Mean motion', step: 1e-8, unit: '1e-8 rev/day', level: 'Ratio', paper: '≈ 0.43 m per day' },
];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export default async function run(ctx) {
  const vallado = await ctx.fetchJson('./data/tle/vallado-verification.json');
  const p = panel(ctx.root, 'Element set');
  const form = inputs(p, [{ id: 'case', label: 'Vallado verification case', type: 'select', value: 6251, wide: true,
    options: vallado.cases.map((c) => [c.satnum, `${String(c.satnum).padStart(5, '0')} · ${num(c.MEAN_MOTION, 6)} rev/day · e ${c.ECCENTRICITY}`]) }], () => one());
  const out = panel(ctx.root, 'One increment of each field');
  const view = scene3d(ctx, { title: 'States one printed digit apart', caption: 'Each field’s neighbor, from the satellite, magnified' });
  note(ctx.root, 'Encoding resolution, not total error: a TLE’s physical error is far larger. Directional fields wrap at 360°, so their differences are taken on the state, never on the angle.');
  const [epochState, hpop] = await Promise.all([ctx.module('analysis/epoch-state'), ctx.module('propagator/hpop')]);

  async function one() {
    const c = vallado.cases.find((x) => x.satnum === Number(form.values().case));
    await ctx.run('analysis/epoch-state: seven element sets in one call', async () => {
      const base = { entityId: `NORAD:${c.satnum}`, ...c };
      const variants = [base, ...FIELDS.map((f) => ({ ...base, entityId: `${f.key}`, [f.key]: base[f.key] + f.step }))];
      const { states, report } = await deriveEpochStates(epochState, variants);
      if (states.length !== variants.length) throw new Error(`analysis/epoch-state derived ${states.length} of ${variants.length}: ${JSON.stringify(report.failures ?? [])}`);
      const day = async (s) => {
        const epochMs = c.epochUnix * 1000, target = isoMicro(epochMs + 24 * HOUR);
        return decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: s.r, velocity: s.v, samples: [target], target,
          integrator: { algorithm: 'RK78', tolerance: 1e-13 }, forces: {} })])).final.position;
      };
      const nIndex = 1 + FIELDS.findIndex((f) => f.key === 'MEAN_MOTION');
      const [base24, n24] = await Promise.all([day(states[0]), day(states[nIndex])]);
      table(out, ['Field', 'Level', 'Increment', '|Δr| at epoch', 'Paper'], FIELDS.map((f, k) => {
        const d = dist(states[k + 1].r, states[0].r) * 1000;
        const cell = f.key === 'MEAN_MOTION' ? `${formatMeters(d, 2)}; ${formatMeters(dist(n24, base24) * 1000, 2)} after 24 h` : formatMeters(d, 2);
        return [f.label, f.level, f.unit, cell, f.paper];
      }), { existing: out.querySelector('table') ?? undefined });
      // The orbit for context (HPOP, one revolution) and the cloud of states.
      const period = 86400 / c.MEAN_MOTION, epochMs = c.epochUnix * 1000;
      const samples = Array.from({ length: 96 }, (_, k) => isoMicro(epochMs + ((k + 1) * period * 1000) / 96));
      const orbit = decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: states[0].r, velocity: states[0].v, samples, target: samples.at(-1),
        integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: {} })]));
      const origin = states[0].r, offsets = FIELDS.map((f, k) => v3.sub(states[k + 1].r, origin));
      const largest = Math.max(...offsets.map(v3.norm));
      const radius = v3.norm(origin);
      const mag = magnification(largest, radius * 0.07);
      const [R, T, N] = rtn(origin, states[0].v);
      await view.draw((g) => {
        g.track([[0, origin], ...orbit.samples.map((q, k) => [((k + 1) * period) / 96, q.position])], { color: 'accent', alpha: 0.55, width: 2, frame: false, subdivide: 3 });
        const axis = largest * mag.k * 1.25;
        g.axes(origin, [R, T, N], axis, ['Radial', 'In-track', 'Cross-track'], { color: 'muted' });
        const placed = [];
        FIELDS.forEach((f, k) => {
          const tip = v3.add(origin, v3.scale(offsets[k], mag.k));
          g.line([origin, tip], { color: 'cyan', width: 2 });
          g.point(tip, { color: 'cyan', size: 7 });
          const stacked = placed.filter((q) => v3.norm(v3.sub(q, tip)) < axis * 0.12).length;
          placed.push(tip);
          g.label(tip, f.symbol, { color: 'text', size: 13, weight: 700, dx: 9 + stacked * 13 });
        });
        g.point(origin, { color: 'accent', size: 9 });
        g.view({ center: origin, radius: axis * 1.5, direction: v3.unit(v3.add(v3.add(v3.scale(R, 0.45), v3.scale(N, 0.8)), v3.scale(T, -0.3))) });
      }, { frame: 'GCRF', epochMs, caption: `GCRF at the epoch; offsets ${mag.label}`,
        legend: [['accent', 'The element set’s state and orbit'], ['cyan', `One digit, ${mag.label}`], ['muted', 'RTN axes'],
          ...FIELDS.map((f, k) => ['cyan', `${f.symbol} ${f.label.toLowerCase()} · ${formatMeters(v3.norm(offsets[k]) * 1000, 1)}`, 'dot'])] });
      return `At |r| = ${num(Math.hypot(...states[0].r), 5)} km, i ${c.INCLINATION}°: the angle fields move the state by about ${formatMeters(dist(states[1].r, states[0].r) * 1000, 2)} per printed digit. The paper’s figures are for a ≈ 6,900 km.`;
    });
  }
  await one();
}
