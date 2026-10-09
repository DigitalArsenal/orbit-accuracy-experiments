// Section 5, the handoff contract: a TLE through analysis/epoch-state (SGP4
// at zero elapsed time, TEME to GCRF, round trip checked), compared with
// Vallado's verification state and an independent pyerfa rotation; then
// propagator/hpop from that GCRF state.
import { executionFrame, decodeExecution } from '../../../../harness/prw.mjs';
import { formatMeters } from '../../chart.js';
import { HOUR, isoMicro } from '../../runs.js';
import { deriveEpochStates } from '../codec/elements.js';
import { chart, inputs, num, panel, pre, table, tiles } from '../ui.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export default async function run(ctx) {
  const vallado = await ctx.fetchJson('./data/tle/vallado-verification.json');
  const p = panel(ctx.root, 'The TLE');
  const form = inputs(p, [{ id: 'case', label: 'Vallado verification case', type: 'select', value: 6251, wide: true,
    options: vallado.cases.map((c) => [c.satnum, `${String(c.satnum).padStart(5, '0')} · ${c.epochIso.slice(0, 10)} · ${num(c.MEAN_MOTION, 6)} rev/day`]) }], () => one());
  const tle = pre(p, '');
  const epoch = panel(ctx.root, 'Epoch state, GCRF');
  const figure = chart(ctx.root, 'HPOP from the handed-off state', 'Radius over a day; EGM2008 zonals to degree 20, no drag');
  const [epochState, hpop] = await Promise.all([ctx.module('analysis/epoch-state'), ctx.module('propagator/hpop')]);

  async function one() {
    const c = vallado.cases.find((x) => x.satnum === Number(form.values().case));
    tle.textContent = c.tle.join('\n');
    await ctx.run('analysis/epoch-state derive, then propagator/hpop 24 h', async () => {
      const { states, report } = await deriveEpochStates(epochState, [{ entityId: `NORAD:${c.satnum}`, ...c }]);
      if (!states.length) throw new Error(`analysis/epoch-state refused the element set: ${JSON.stringify(report.failures ?? report)}`);
      const s = states[0];
      table(epoch, ['', 'X', 'Y', 'Z'], [
        ['r (km)', ...s.r.map((x) => num(x, 12))], ['v (km/s)', ...s.v.map((x) => num(x, 10))],
        ['pyerfa r (km)', ...c.gcrfR.map((x) => num(x, 12))],
      ], { existing: epoch.querySelector('table') ?? undefined });
      const temeRadius = Math.hypot(...c.temeR);
      tiles(epoch, [['vs pyerfa GCRF', formatMeters(dist(s.r, c.gcrfR) * 1000, 3)], ['|r| vs Vallado TEME', formatMeters(Math.abs(Math.hypot(...s.r) - temeRadius) * 1000, 3)],
        ['Round trip to TEME', formatMeters(report.maxRoundTripPositionKm * 1000, 3)], ['Initial uncertainty', 'unknown']]);
      const epochMs = Date.parse(c.epochIso);
      const samples = Array.from({ length: 48 }, (_, k) => isoMicro(epochMs + (k + 1) * HOUR / 2));
      const run = decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: isoMicro(epochMs), timeScale: 'UTC', position: s.r, velocity: s.v, samples, target: samples.at(-1),
        integrator: { algorithm: 'RK78', tolerance: 1e-12 }, forces: { degree: 20, order: 0 } })]));
      figure.draw({ series: [{ name: '|r|', color: 'var(--accent)', points: [[0, Math.hypot(...s.r) * 1000], ...run.samples.map((q, k) => [(k + 1) / 2, Math.hypot(...q.position) * 1000])] }],
        x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (x) => `${x} h` }, y: { scale: 'linear', format: (m) => `${num(m / 1000, 5)} km`, value: (m) => `${num(m / 1000, 7)} km` } });
      return `SGP4 at t = 0, rotated to GCRF, matches pyerfa within ${formatMeters(dist(s.r, c.gcrfR) * 1000, 3)}; HPOP then integrates ${num(run.final.steps)} steps from it. The state carries no covariance: its uncertainty is marked unknown.`;
    });
  }
  await one();
}
