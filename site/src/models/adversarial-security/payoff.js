// The claimant's payoffs in the verifier–claimant game of section 3.2: an
// honest claimant earns the trusted interactions a funded bond buys; a
// dishonest one gains from deception but loses the bond when detected.
// The paper's game, evaluated in this page: no module implements it.
import { h, inputs, num, panel, note, tiles } from '../ui.js';
import { scene3d } from '../scene.js';

// Section 7's six networks: the N a bond can span.
const NETWORKS = ['Bitcoin', 'Ethereum', 'Solana', 'SUI', 'Cosmos', 'Cardano'];

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
  const view = scene3d(ctx, { title: 'M of N networks around one key', earth: false });
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
      await view.draw((g) => {
        g.grid([0, 0, 0], [1, 0, 0], [0, 1, 0], 7, 1.4);
        const key = [0, 0, 1];
        g.sphere(key, 0.8, { color: 'accent', alpha: 0.85 });
        g.label([0, 0, 0], 'Claimant’s key', { color: 'accent', size: 11, align: 'center', dy: 14 });
        NETWORKS.slice(0, N).forEach((name, k) => {
          const a = (2 * Math.PI * k) / N + Math.PI / 2, at = [5.6 * Math.cos(a), 5.6 * Math.sin(a), 0.6];
          const funded = k < M;
          g.line([key, at], { color: funded ? 'accent' : 'muted', width: funded ? 2.5 : 1.2, dash: !funded, alpha: funded ? 0.95 : 0.6 });
          g.sphere(at, 0.5, { color: funded ? 'accent' : 'muted', alpha: funded ? 0.8 : 0.2, outline: !funded });
          if (funded) g.box([at[0], at[1], 1.1 + 0.9], [0.5, 0.5, 1.8], { color: 'accent', alpha: 0.45 });
          g.label(at, name, { color: funded ? 'text' : 'muted', size: 11, align: 'center', dy: 24 });
        });
        g.view({ center: [0, 0, 1], radius: 7, direction: [0.3, -1, 0.85] });
      }, { caption: separating ? 'Separating: only an honest claimant funds the bond across these networks' : 'Not separating at these stakes',
        legend: [['accent', 'Funded network'], ['muted', 'Unfunded', 'dash']] });
      return separating ? 'Separating: honest claimants fund and dishonest ones do not, so an unfunded key marks itself.'
        : best(dishonest) === 'fund' ? `Not separating: deception pays ${usd(dishonest.fund)} even after the expected bond loss; raise B or detection.`
          : 'Not separating: the bond costs an honest claimant more than trust returns.';
    });
  }
  await draw();
}
