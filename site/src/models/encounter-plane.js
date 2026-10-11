// The encounter plane of a probability model, drawn in metres: ξ along the
// miss, ζ across it, the relative velocity out of the plane. The geometry is
// the request's and the module's numbers; the box's ticks are metres.
export const PLANE_AXES = ['ξ, along the miss (m)', 'ζ, across it (m)', 'Along the relative velocity (m)'];

// g: the scene; {miss, radius, sigmaXi, sigmaZeta, extra: [{sigmaXi, sigmaZeta, color}]} (m).
export function drawPlane(g, { miss, radius, sigmaXi, sigmaZeta, extra = [] }) {
  const reach = Math.max(miss + 3 * sigmaXi, 3 * sigmaZeta, radius * 4, ...extra.map((r) => miss + 3 * r.sigmaXi)) || 1;
  const depth = reach * 0.6;
  const at = [miss, 0, 0];
  g.disc([miss / 2, 0, 0], [reach, 0, 0], [0, reach, 0], { color: 'muted', alpha: 0.05, frame: false });
  for (const k of [1, 2, 3]) {
    g.disc(at, [sigmaXi * k, 0, 0], [0, sigmaZeta * k, 0], { color: 'cyan', alpha: 0.1 });
    g.ring(at, [sigmaXi * k, 0, 0], [0, sigmaZeta * k, 0], { color: 'cyan', width: k === 1 ? 2 : 1, alpha: 1 - 0.25 * k });
  }
  g.label([miss + sigmaXi, 0, 0], '1σ', { color: 'cyan', size: 11 });
  for (const r of extra) g.ring(at, [r.sigmaXi, 0, 0], [0, r.sigmaZeta, 0], { color: r.color ?? 'text', width: 1.5, dash: true });
  g.cylinder([0, 0, -depth], [0, 0, depth], radius, { color: 'accent', alpha: 0.3 });
  g.disc([0, 0, 0], [radius, 0, 0], [0, radius, 0], { color: 'accent', alpha: 0.9, frame: false });
  g.arrow([0, 0, 0], at, { color: 'accent', width: 10, frame: false });
  g.point(at, { color: 'cyan', size: 6, outline: 1 });
  g.arrow([0, 0, depth * 0.55], [0, 0, depth], { color: 'muted', width: 8, frame: false });
  g.label([0, 0, depth], 'Relative velocity', { color: 'muted', size: 11 });
  g.label([0, 0, 0], `Hard body ${radius} m`, { color: 'accent', size: 11, align: 'right', dy: 12 });
  g.label([miss / 2, 0, 0], `miss ${miss} m`, { color: 'accent', size: 11, above: true });
  g.view({ preset: '3d' });
}
