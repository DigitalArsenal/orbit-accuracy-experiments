// The claimant's payoffs in the verifier–claimant game of section 3.2: an
// honest claimant earns the trusted interactions a funded bond buys; a
// dishonest one gains from deception but loses the bond when detected.
// The paper's game, evaluated in this page: no module implements it.
import { h, inputs, num, panel, note } from '../ui.js';

const usd = (x) => `${x < 0 ? '−' : ''}$${num(Math.abs(x), 3)}`;

export default async function run(ctx) {
  const p = panel(ctx.root, 'Stakes');
  const form = inputs(p, [
    { id: 'R', label: 'Value of being trusted R ($)', value: 120000, min: 0 },
    { id: 'K', label: 'Cost of funding M of N K ($)', value: 30000, min: 0 },
    { id: 'G', label: 'Gain from deception G ($)', value: 50000, min: 0 },
    { id: 'B', label: 'Bond at stake B ($)', value: 200000, min: 0 },
    { id: 'pd', label: 'P(detection)', value: 0.5, min: 0, max: 1, step: 0.01 },
  ], () => draw());
  const grid = h('div', { class: 'payoff', role: 'table', 'aria-label': 'Claimant payoff matrix' });
  panel(ctx.root, 'Claimant payoff', grid);
  note(ctx.root, 'The paper’s game, evaluated in this page; no module implements it. Not funding earns nothing: the verifier does not trust an unbonded key.');
  function draw() {
    ctx.run('Evaluating', async () => {
      const { R, K, G, B, pd } = form.values();
      const honest = { fund: R - K, none: 0 };
      const dishonest = { fund: G - K - pd * B, none: 0 };
      const best = (row) => (row.fund > row.none ? 'fund' : 'none');
      const cell = (row, key) => h('div', { class: best(row) === key ? 'best' : '' }, usd(row[key]));
      grid.replaceChildren(
        h('div', { class: 'head' }, ''), h('div', { class: 'head' }, 'Fund the bond'), h('div', { class: 'head' }, 'Do not fund'),
        h('div', { class: 'head' }, 'Honest'), cell(honest, 'fund'), cell(honest, 'none'),
        h('div', { class: 'head' }, 'Dishonest'), cell(dishonest, 'fund'), cell(dishonest, 'none'),
      );
      const separating = best(honest) === 'fund' && best(dishonest) === 'none';
      return separating ? 'Separating: honest claimants fund and dishonest ones do not, so an unfunded key marks itself.'
        : best(dishonest) === 'fund' ? `Not separating: deception pays ${usd(dishonest.fund)} even after the expected bond loss; raise B or detection.`
          : 'Not separating: the bond costs an honest claimant more than trust returns.';
    });
  }
  draw();
}
