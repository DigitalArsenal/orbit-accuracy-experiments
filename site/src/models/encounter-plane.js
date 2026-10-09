// The encounter plane of a probability model, drawn: ξ along the miss, ζ
// across it, the relative velocity out of the plane. Metres in, scene units
// out; the geometry is the request's and the module's numbers.
import { v3 } from './scene.js';

// g: the scene; {miss, radius, sigmaXi, sigmaZeta, rings: [{sigmaXi, sigmaZeta, color, dash, label}]}.
export function drawPlane(g, { miss, radius, sigmaXi, sigmaZeta, extra = [] }) {
  const reach = Math.max(miss + 3 * sigmaXi, 3 * sigmaZeta, radius * 4, ...extra.map((r) => miss + 3 * r.sigmaXi)) || 1;
  const S = 8 / reach, m = (x) => x * S;
  const at = [m(miss), 0, 0];
  g.disc([m(miss) / 2, 0, 0], [9, 0, 0], [0, 9, 0], { color: 'muted', alpha: 0.06, frame: false });
  g.grid([m(miss) / 2, 0, 0], [1, 0, 0], [0, 1, 0], 9, 1.5);
  g.axes([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 9.5, ['ξ', 'ζ', 'Relative velocity'], { color: 'muted', alpha: 0.8 });
  for (const k of [1, 2, 3]) {
    g.disc(at, [m(sigmaXi * k), 0, 0], [0, m(sigmaZeta * k), 0], { color: 'cyan', alpha: 0.11, frame: false });
    g.ring(at, [m(sigmaXi * k), 0, 0], [0, m(sigmaZeta * k), 0], { color: 'cyan', width: k === 1 ? 2 : 1, alpha: 1 - 0.25 * k });
  }
  g.label([m(miss) + m(sigmaXi), 0, 0], '1σ', { color: 'cyan', size: 11 });
  for (const r of extra) g.ring(at, [m(r.sigmaXi), 0, 0], [0, m(r.sigmaZeta), 0], { color: r.color ?? 'text', width: 1.5, dash: true });
  const hb = Math.max(m(radius), 0.06);
  g.cylinder([0, 0, -6], [0, 0, 6], hb, { color: 'accent', alpha: 0.28, frame: false });
  g.disc([0, 0, 0], [hb, 0, 0], [0, hb, 0], { color: 'accent', alpha: 0.9, frame: false });
  g.arrow([0, 0, 0], at, { color: 'accent', width: 10 });
  g.point(at, { color: 'cyan', size: 6, outline: 1 });
  g.arrow([0, 0, 6], [0, 0, 9], { color: 'muted', width: 8, frame: false });
  g.label([0, 0, 0], `Hard body ${radius} m`, { color: 'accent', size: 11, align: 'right', dy: 12 });
  g.label([m(miss) / 2, 0, 0], `miss ${miss} m`, { color: 'accent', size: 11, above: true });
  g.view({ center: [m(miss) / 2, 0, 0.5], radius: 9.5, direction: v3.unit([0.35, -1, 0.75]) });
}
