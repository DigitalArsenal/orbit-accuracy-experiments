// The claimant's payoffs in the verifier–claimant game of section 3.2: an
// honest claimant earns the trusted interactions a funded bond buys; a
// dishonest one gains from deception but loses the bond when detected.
// The paper's game, evaluated in this page: no module implements it.
import { h, inputs, num, panel, note, tiles } from '../ui.js';
import { scene3d } from '../scene.js';

// Section 7's six networks: the N a bond can span.

const usd = (x) => `${x < 0 ? '−' : ''}$${num(Math.abs(x), 3)}`;

export default async function run(ctx) {
  const p = panel(ctx.root, 'Stakes');
  const form = inputs(p, [
    { id: 'R', label: 'Value of being trusted R ($)', value: 120000, min: 0 },
    { id: 'K', label: 'Cost of funding M of N K ($)', value: 30000, min: 0 },
    { id: 'G', label: 'Gain from deception G ($)', value: 50000, min: 0 },
    { id: 'B', label: 'Bond at stake B ($)', value: 200000, min: 0 },
    { id: 'pd', label: 'P(detection)', value: 0.5, min: 0, max: 1, step: 0.01 },
    { id: 'N', label: 'Networks N', type: 'select', value: 6, options: [2, 3, 4, 5, 6].map((n) => [n, String(n)]) },
    { id: 'M', label: 'Required M', type: 'select', value: 3, options: [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]) },
  ], () => draw());
  const view = scene3d(ctx, { title: 'The bond’s payoff matrix' });
  const grid = h('div', { class: 'payoff', role: 'table', 'aria-label': 'Claimant payoff matrix' });
  panel(ctx.root, 'Claimant payoff', grid);
  note(ctx.root, 'The paper’s game, evaluated in this page; no module implements it. Not funding earns nothing: the verifier does not trust an unbonded key.');
  function draw() {
    return ctx.run('Evaluating', async () => {
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
      const { N } = form.values(), M = Math.min(form.values().M, N);
      tiles(p, [['Funded', `${M} of ${N} networks`], ['Survives', `${N - M} network ${N - M === 1 ? 'failure' : 'failures'}`]]);
      // The payoff matrix as bars (US$): claimant against action.
      const w = 0.3;
      await view.draw((g) => {
        [[honest, 1], [dishonest, 2]].forEach(([row, x]) => [['fund', 1], ['none', 2]].forEach(([key, y]) => {
          const v = row[key], chosen = best(row) === key;
          if (Math.abs(v) > 0) g.box([x, y, v / 2], [2 * w, 2 * w, Math.abs(v)], { color: chosen ? 'accent' : 'muted', alpha: chosen ? 0.7 : 0.3, outline: true });
          else g.disc([x, y, 0], [w, 0, 0], [0, w, 0], { color: chosen ? 'accent' : 'muted', alpha: 0.5 });
          g.label([x, y, Math.max(v, 0)], usd(v), { color: chosen ? 'accent' : 'text', size: 11, align: 'center', above: true, dy: -8 });
        }));
        g.line([[0.5, 0.5, 0], [2.5, 0.5, 0], [2.5, 2.5, 0], [0.5, 2.5, 0]], { color: 'text', alpha: 0.5, width: 1, close: true, frame: false });
        g.view({ preset: '3d' });
      }, { axes: ['Claimant', 'Action', 'Payoff (US$)'], aspect: 'normal', ticks: [[[1, 'Honest'], [2, 'Dishonest']], [[1, 'Fund the bond'], [2, 'Do not fund']], null],
        caption: `${separating ? 'Separating' : 'Not separating'}: each claimant’s payoff for funding the bond (${M} of ${N} networks) or not; the better choice of each is highlighted`,
        legend: [['accent', 'The better choice', 'solid'], ['muted', 'The other', 'solid']] });
      return separating ? 'Separating: honest claimants fund and dishonest ones do not, so an unfunded key marks itself.'
        : best(dishonest) === 'fund' ? `Not separating: deception pays ${usd(dishonest.fund)} even after the expected bond loss; raise B or detection.`
          : 'Not separating: the bond costs an honest claimant more than trust returns.';
    });
  }
  await draw();
}
