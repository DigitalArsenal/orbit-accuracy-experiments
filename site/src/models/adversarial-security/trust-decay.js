// trust_decay(t, T) = max(0, 1 − (t/T)²), section 5.3. The paper's formula,
// evaluated in this page: no module implements it.
import { chart, inputs, num, panel, tiles, note } from '../ui.js';

const decay = (t, T) => Math.max(0, 1 - (t / T) ** 2);

export default async function run(ctx) {
  const p = panel(ctx.root, 'Key age');
  const form = inputs(p, [
    { id: 'T', label: 'Rotation period T (days)', value: 365, min: 1 },
    { id: 't', label: 'Key age t (days)', value: 180, min: 0 },
  ], () => draw());
  const figure = chart(ctx.root, 'Trust remaining against key age', 'Quadratic decay; linear for comparison');
  note(ctx.root, 'The paper’s formula, evaluated in this page; no module implements it.');
  function draw() {
    ctx.run('Evaluating', async () => {
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
      return `At ${num(t)} days of a ${num(T)}-day period the key keeps ${num(100 * decay(t, T), 3)} % of its trust: a fresh key loses little, a key near T loses fast.`;
    });
  }
  draw();
}
