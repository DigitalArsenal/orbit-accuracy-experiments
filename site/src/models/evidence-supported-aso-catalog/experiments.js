// Section 17.4: E1, E2 and E3. Each one's results/<id>/metrics.json shows
// here once its run is published; until then its slot says so.
import { h, num, panel, table } from '../ui.js';
import { scene3d } from '../scene.js';

const EXPERIMENTS = [
  { id: 'e1', title: 'E1 · Correcting GPS element sets at epoch', plan: 'experiments/e1-gps-epoch/PLAN.md' },
  { id: 'e2', title: 'E2 · Covariance from catalog history', plan: 'experiments/e2-catalog-covariance/PLAN.md' },
  { id: 'e3', title: 'E3', plan: null },
];
const GITHUB = 'https://github.com/DigitalArsenal/orbit-accuracy-experiments/blob/main/';

// The metrics' scalar leaves, two levels deep, as rows.
function scalars(value, prefix = '', out = []) {
  for (const [k, v] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out.push([path, typeof v === 'number' ? num(v, 4) : String(v)]);
    else if (v && typeof v === 'object' && !Array.isArray(v) && path.split('.').length < 3) scalars(v, path, out);
  }
  return out;
}

export default async function run(ctx) {
  const view = scene3d(ctx, { title: 'Results so far', earth: false });
  await ctx.run('Reading published results', async () => {
    const { published } = await ctx.fetchJson('./data/experiments.json');
    // A slot per experiment: filled once its metrics are published.
    await view.draw((g) => {
      g.grid([0, 0, 0], [1, 0, 0], [0, 1, 0], 6, 1);
      EXPERIMENTS.forEach((e, k) => {
        const x = (k - 1) * 4, done = published.includes(e.id);
        g.box([x, 0, 1.25], [2.4, 2.4, 2.5], done ? { color: 'accent', alpha: 0.55, outline: true } : { color: 'muted', alpha: 0.06, outline: true, outlineAlpha: 0.6 });
        g.label([x, 0, 3.1], e.id.toUpperCase(), { color: done ? 'accent' : 'text', size: 14, align: 'center', above: true });
        g.label([x, 0, -0.5], done ? 'published' : 'no run yet', { color: 'muted', size: 11, align: 'center' });
      });
      g.view({ center: [0, 0, 1.2], radius: 6.6, direction: [0.35, -1, 0.55] });
    }, { caption: published.length ? `Published: ${published.map((x) => x.toUpperCase()).join(', ')}` : 'No experiment has published metrics yet; each slot fills when its run does',
      legend: [['accent', 'Metrics published', 'solid'], ['muted', 'Awaiting a run', 'solid']] });
    for (const e of EXPERIMENTS) {
      const p = panel(ctx.root, e.title);
      p.dataset.slot = `results/${e.id}/metrics.json`;
      if (!published.includes(e.id)) {
        p.classList.add('slot');
        p.append(h('p', { class: 'fine' }, 'No published run yet. ', e.plan ? h('a', { href: GITHUB + e.plan, target: '_blank', rel: 'noopener' }, 'The plan ↗') : ''));
        continue;
      }
      const metrics = await ctx.fetchJson(`./results/${e.id}/metrics.json`);
      table(p, ['Metric', 'Value'], scalars(metrics).slice(0, 40).map(([k, v]) => [{ text: k, class: 'left mono wrap' }, v]));
      p.append(h('p', { class: 'fine' }, h('a', { href: ctx.siteUrl(`./results/${e.id}/metrics.json`), download: '' }, `↓ results/${e.id}/metrics.json`)));
    }
    return published.length ? `Published: ${published.map((x) => x.toUpperCase()).join(', ')}.` : 'No experiment has published a run yet.';
  });
}
