// trust_decay(t, T) = max(0, 1 − (t/T)²), section 5.3. The paper's formula,
// evaluated in this page: no module implements it.
import { chart, inputs, num, panel, tiles, note } from '../ui.js';
import { scene3d } from '../scene.js';

const decay = (t, T) => Math.max(0, 1 - (t / T) ** 2);

export default async function run(ctx) {
  const p = panel(ctx.root, 'Key age');
  const form = inputs(p, [
    { id: 'T', label: 'Rotation period T (days)', value: 365, min: 1 },
    { id: 't', label: 'Key age t (days)', value: 180, min: 0 },
  ], () => draw());
  const view = scene3d(ctx, { title: 'Trust over key age and rotation period' });
  const figure = chart(ctx.root, 'Trust remaining against key age', 'Quadratic decay; linear for comparison');
  note(ctx.root, 'The paper’s formula, evaluated in this page; no module implements it.');
  function draw() {
    return ctx.run('Evaluating', async () => {
      const { T, t } = form.values();
      const ages = Array.from({ length: 61 }, (_, k) => (k / 50) * T);
      tiles(p, [['Trust remaining', num(decay(t, T), 3)], ['Linear decay', num(Math.max(0, 1 - t / T), 3)], ['Half trust at', `${num(T / Math.SQRT2, 3)} d`]]);
      figure.draw({
        series: [
          { name: 'Linear', color: 'var(--series-muted)', points: ages.map((a) => [a, Math.max(0, 1 - a / T)]), dash: true },
          { name: 'Quadratic', color: 'var(--accent)', points: ages.map((a) => [a, decay(a, T)]), label: true },
          { name: 'This key', color: 'var(--cyan)', points: [[t, decay(t, T)]], markers: true },
        ],
        x: { min: 0, max: 1.2 * T, ticks: [0, 0.25, 0.5, 0.75, 1, 1.2].map((f) => f * T), format: (d) => `${Math.round(d)} d` },
        y: { scale: 'linear', min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => String(v), value: (v) => num(v, 3) },
      });
      // The surface trust_decay(age, period) for periods 0.5 T to 1.5 T, as a
      // wireframe; this period's curve, the linear one, and this key.
      const at = (age, period) => [age, period, decay(age, period)];
      const periods = Array.from({ length: 9 }, (_, k) => T * (0.5 + k / 8)), agesFine = Array.from({ length: 61 }, (_, k) => (k / 60) * 1.2 * T);
      await view.draw((g) => {
        for (const period of periods) g.line(agesFine.map((age) => at(age, period)), { color: 'accent', alpha: 0.3, width: 1 });
        for (let k = 0; k <= 12; k++) { const age = (k / 10) * T; g.line(periods.map((period) => at(age, period)), { color: 'muted', alpha: 0.45, width: 1 }); }
        g.line(agesFine.map((age) => [age, T, Math.max(0, 1 - age / T)]), { color: 'text', alpha: 0.75, width: 1.5, dash: true });
        g.line(agesFine.map((age) => at(age, T)), { color: 'accent', width: 3.5 });
        g.line([[t, T, 0], at(t, T)], { color: 'cyan', width: 1.5, dash: true });
        g.point(at(t, T), { color: 'cyan', size: 11, label: `${num(100 * decay(t, T), 3)} % at ${num(t)} d`, labelColor: 'cyan', labelOptions: { above: true } });
        g.view({ preset: '3d' });
      }, { axes: ['Key age t (days)', 'Rotation period T (days)', 'Trust remaining'], aspect: 'normal',
        caption: `trust_decay(t, T) = max(0, 1 − (t / T)²) over key age and rotation period; this key on the ${num(T)}-day curve`,
        legend: [['accent', `Quadratic, T = ${num(T)} d`], ['muted', 'The surface, T from 0.5 to 1.5 of it'], ['text', 'Linear', 'dash'], ['cyan', 'This key', 'dot']] });
      return `At ${num(t)} days of a ${num(T)}-day period the key keeps ${num(100 * decay(t, T), 3)} % of its trust: a fresh key loses little, a key near T loses fast.`;
    });
  }
  await draw();
}
