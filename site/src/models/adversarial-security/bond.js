// The bond's credibility condition, section 3.1:
//   B > P(detection) × C(fraud) + P(¬detection) × G(fraud).
// The paper's inequality, evaluated in this page: no module implements it.
import { chart, h, inputs, num, panel, tiles, note } from '../ui.js';
import { scene3d } from '../scene.js';

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
  const view = scene3d(ctx, { title: 'The bond against what cheating is worth', earth: false });
  const figure = chart(ctx.root, 'Bond needed against detection probability', 'The bond is credible above the line');
  note(ctx.root, 'The paper’s inequality, evaluated in this page; no module implements it.');
  function draw() {
    return ctx.run('Evaluating', async () => {
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
      const top = Math.max(B, need, 1), H = 7 / top, lost = pd * C, kept = (1 - pd) * G;
      await view.draw((g) => {
        g.grid([0, 0, 0], [1, 0, 0], [0, 1, 0], 6, 1);
        if (B > 0) g.box([-2, 0, (B * H) / 2], [2.2, 2.2, B * H], { color: ok ? 'accent' : 'muted', alpha: ok ? 0.7 : 0.35, outline: true });
        if (lost > 0) g.box([2, 0, (lost * H) / 2], [2.2, 2.2, lost * H], { color: 'cyan', alpha: 0.55, outline: true });
        if (kept > 0) g.box([2, 0, lost * H + (kept * H) / 2], [2.2, 2.2, kept * H], { color: 'alert', alpha: 0.45, outline: true });
        g.box([0, 0, need * H], [8, 3.4, 0.02], { color: 'text', alpha: 0.12, frame: false });
        g.line([[-4, -1.7], [4, -1.7], [4, 1.7], [-4, 1.7]].map(([x, y]) => [x, y, need * H]), { color: 'text', alpha: 0.6, width: 1, dash: true, close: true, frame: false });
        g.label([-2, 0, B * H], `Bond ${usd(B)}`, { color: ok ? 'accent' : 'text', align: 'center', above: true, dy: -10 });
        g.label([2, 0, need * H], `Cheating is worth ${usd(need)}`, { color: 'text', align: 'center', above: true, dy: -10 });
        if (lost > 0) g.label([3.1, 0, (lost * H) / 2], `P × C ${usd(lost)}`, { color: 'cyan', size: 11 });
        if (kept > 0) g.label([3.1, 0, lost * H + (kept * H) / 2], `(1 − P) × G ${usd(kept)}`, { color: 'alert', size: 11 });
        g.sphere([0, -3.2, 0.5], 0.5, { color: 'accent', alpha: 0.9 });
        g.line([[0, -3.2, 0.5], [-2, -1.1, 0.5]], { color: 'accent', width: 2 });
        g.label([0, -3.2, 0.5], 'The bonded key', { color: 'accent', size: 11, align: 'center', dy: 22 });
        g.view({ center: [0, 0, 3.6], radius: 6.8, direction: [0.45, -1, 0.5] });
      }, { caption: ok ? 'Credible: the bond stands above what a rational cheater expects' : 'Not credible: what cheating is worth stands above the bond',
        legend: [['accent', 'Bond', 'solid'], ['cyan', 'Expected loss if detected', 'solid'], ['alert', 'Expected gain if not', 'solid']] });
      return ok ? `A ${usd(B)} bond exceeds the ${usd(need)} a rational cheater expects, so the commitment holds.`
        : `A ${usd(B)} bond is below the ${usd(need)} a rational cheater expects; it would need ${usd(need - B)} more.`;
    });
  }
  await draw();
}
