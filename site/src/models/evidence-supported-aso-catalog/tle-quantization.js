// Section 5, levels of measurement: what one encoding increment of each OMM
// field does to the SGP4 state. Each field is bumped by its last printed
// digit and every variant goes through analysis/epoch-state in one call; the
// mean-motion increment, which only shows over time, also goes a day through
// propagator/ffm. The page only takes norms of differences.
import { executionFrame, decodeExecution } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import { HOUR, isoMicro } from '../../runs.js';
import { deriveEpochStates } from '../codec/elements.js';
import { inputs, num, panel, table, note } from '../ui.js';
import { rtn, scene3d, toRtn, v3 } from '../scene.js';

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
  const view = scene3d(ctx, { title: 'States one printed digit apart', caption: 'Radial, in-track and cross-track of the element set’s state (m)' });
  note(ctx.root, 'Encoding resolution, not total error: an OMM’s physical error is far larger. Directional fields wrap at 360°, so their differences are taken on the state, never on the angle.');
  const [epochState, ffm] = await Promise.all([ctx.module('analysis/epoch-state'), ctx.module('propagator/ffm')]);

  async function one() {
    const c = vallado.cases.find((x) => x.satnum === Number(form.values().case));
    await ctx.run('analysis/epoch-state: seven element sets in one call', async () => {
      const base = { entityId: `NORAD:${c.satnum}`, ...c };
      const variants = [base, ...FIELDS.map((f) => ({ ...base, entityId: `${f.key}`, [f.key]: base[f.key] + f.step }))];
      const { states, report } = await deriveEpochStates(epochState, variants);
      if (states.length !== variants.length) throw new Error(`analysis/epoch-state derived ${states.length} of ${variants.length}: ${JSON.stringify(report.failures ?? [])}`);
      const day = async (s) => {
        const epochMs = c.epochUnix * 1000, target = isoMicro(epochMs + 24 * HOUR);
        return decodeExecution(await ffm.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: s.r, velocity: s.v, samples: [target], target,
          integrator: { algorithm: 'RK78', tolerance: 1e-13 }, forces: {} })])).final.position;
      };
      const nIndex = 1 + FIELDS.findIndex((f) => f.key === 'MEAN_MOTION');
      const [base24, n24] = await Promise.all([day(states[0]), day(states[nIndex])]);
      table(out, ['Field', 'Level', 'Increment', '|Δr| at epoch', 'Paper'], FIELDS.map((f, k) => {
        const d = dist(states[k + 1].r, states[0].r) * 1000;
        const cell = f.key === 'MEAN_MOTION' ? `${formatMeters(d, 2)}; ${formatMeters(dist(n24, base24) * 1000, 2)} after 24 h` : formatMeters(d, 2);
        return [f.label, f.level, f.unit, cell, f.paper];
      }), { existing: out.querySelector('table') ?? undefined });
      // Each field's neighbor from the element set's state, in the radial,
      // in-track and cross-track axes of that state (m, true scale).
      const origin = states[0].r, basis = rtn(origin, states[0].v);
      const offsets = FIELDS.map((f, k) => toRtn(basis, v3.sub(states[k + 1].r, origin)).map((x) => x * 1000));
      await view.draw((g) => {
        const placed = [];
        FIELDS.forEach((f, k) => {
          const tip = offsets[k];
          g.arrow([0, 0, 0], tip, { color: 'cyan', width: 8 });
          g.point(tip, { color: 'cyan', size: 6 });
          const stacked = placed.filter((q) => v3.norm(v3.sub(q, tip)) < 1).length;
          placed.push(tip);
          g.label(tip, f.symbol, { color: 'text', size: 13, weight: 700, dx: 9 + stacked * 13 });
        });
        g.point([0, 0, 0], { color: 'accent', size: 9, label: 'The element set’s state', labelColor: 'accent', labelOptions: { dy: 16 } });
        g.view({ preset: '3d' });
      }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'equal',
        caption: 'The state of each one-digit neighbor less the element set’s own, at the epoch, in the radial, in-track and cross-track axes of that state (m, true scale)',
        legend: [['accent', 'The element set’s state', 'dot'], ['cyan', 'One printed digit'],
          ...FIELDS.map((f, k) => ['cyan', `${f.symbol} ${f.label.toLowerCase()} · ${formatMeters(v3.norm(offsets[k]), 1)}`, 'dot'])] });
      return `At |r| = ${num(Math.hypot(...states[0].r), 5)} km, i ${c.INCLINATION}°: the angle fields move the state by about ${formatMeters(dist(states[1].r, states[0].r) * 1000, 2)} per printed digit. The paper’s figures are for a ≈ 6,900 km.`;
    });
  }
  await one();
}
