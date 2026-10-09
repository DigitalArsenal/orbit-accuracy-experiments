// The bond's credibility condition, section 3.1:
//   B > P(detection) × C(fraud) + P(¬detection) × G(fraud).
// The paper's inequality, evaluated in this page: no module implements it.
import { chart, h, inputs, num, panel, tiles, note } from '../ui.js';

const threshold = (p, C, G) => p * C + (1 - p) * G;
const usd = (x) => `$${num(x, 3)}`;

export default async function run(ctx) {
  const p = panel(ctx.root, 'The commitment');
  const form = inputs(p, [
    { id: 'B', label: 'Bond B ($)', value: 250000, min: 0 },
    { id: 'pd', label: 'P(detection)', value: 0.6, min: 0, max: 1, step: 0.01 },
    { id: 'C', label: 'Cost if detected C ($)', value: 100000, min: 0 },
    { id: 'G', label: 'Gain if undetected G ($)', value: 400000, min: 0 },
  ], () => draw());
  const verdict = h('p', { class: 'model-actions' });
  p.append(verdict);
  const figure = chart(ctx.root, 'Bond needed against detection probability', 'The bond is credible above the line');
  note(ctx.root, 'The paper’s inequality, evaluated in this page; no module implements it.');
  function draw() {
    ctx.run('Evaluating', async () => {
      const { B, pd, C, G } = form.values();
      const need = threshold(pd, C, G);
      const ok = B > need;
      tiles(p, [['Expected value of cheating', usd(need)], ['Bond B', usd(B)], ['Margin', usd(B - need)]]);
      verdict.replaceChildren(h('span', { class: `verdict ${ok ? 'pass' : 'fail'}` }, ok ? 'Credible' : 'Not credible'));
      const ps = Array.from({ length: 21 }, (_, k) => k / 20);
      figure.draw({
        series: [
          { name: 'Bond needed', color: 'var(--accent)', points: ps.map((q) => [q, Math.max(threshold(q, C, G), 1)]), label: true },
          { name: 'This bond', color: 'var(--cyan)', points: [[pd, Math.max(B, 1)]], markers: true },
        ],
        x: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], format: (q) => `P ${q}` },
        y: { format: (v) => usd(v), value: usd },
      });
      return ok ? `A ${usd(B)} bond exceeds the ${usd(need)} a rational cheater expects, so the commitment holds.`
        : `A ${usd(B)} bond is below the ${usd(need)} a rational cheater expects; it would need ${usd(need - B)} more.`;
    });
  }
  draw();
}
