// Distance from truth against time, one line per propagator, its covariance's
// 1σ and 3σ envelopes as bands in the propagator's own color, and markers for
// the paper's medians. One y axis (log, km), a legend, a crosshair with a
// tooltip, direct labels at the line ends, and a table of the same numbers.
// Drawing only: every value arrives computed.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
};
const div = (cls, text) => Object.assign(document.createElement('div'), { className: cls, textContent: text ?? '' });

export const formatKm = (km) => {
  if (!Number.isFinite(km)) return '—';
  if (km >= 1) return `${km.toFixed(km >= 100 ? 0 : km >= 10 ? 1 : 2)} km`;
  const m = km * 1000;
  return `${m.toFixed(m >= 100 ? 0 : m >= 10 ? 1 : 2)} m`;
};

/**
 * series: [{ id, name, color, points: [[hours, km]], envelope: { sigma1: [[h, km]], sigma3: [[h, km]] } | null }]
 * markers: [{ name, color, points: [[hours, km]], note }]
 * x: { max, ticks }; onCursor(hours) when the reader moves along the chart.
 */
export function envelopeChart(container, { series, markers = [], x, onCursor = () => {} }) {
  let cursorAt = null, redraw = () => {};
  const draw = () => {
    container.replaceChildren();
    const legend = div('env-legend');
    for (const s of series) {
      const item = div('env-key');
      item.append(Object.assign(document.createElement('span'), { className: 'env-swatch', style: `background:${s.color}` }), document.createTextNode(s.name));
      legend.append(item);
    }
    for (const m of markers) {
      const item = div('env-key');
      item.append(Object.assign(document.createElement('span'), { className: 'env-swatch env-dot', style: `background:${m.color}` }), document.createTextNode(m.name));
      legend.append(item);
    }
    if (series.some((s) => s.envelope)) legend.append(div('env-key env-band-key', 'Bands: 1σ and 3σ of each propagator’s covariance'));
    container.append(legend);
    const width = Math.max(320, container.clientWidth || 640), height = 300;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, class: 'env-svg', role: 'img', 'aria-label': 'Distance from truth against hours since the prediction began' }, container);
    const f = { x0: 56, x1: width - 96, y0: height - 34, y1: 12 };
    const values = [...series.flatMap((s) => [...s.points, ...(s.envelope?.sigma3 ?? [])]), ...markers.flatMap((m) => m.points)].map((p) => p[1]).filter((v) => v > 0);
    const lo = 10 ** Math.floor(Math.log10(Math.min(...values))), hi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
    const sx = (h) => f.x0 + (h / x.max) * (f.x1 - f.x0);
    const sy = (km) => f.y0 - ((Math.log10(Math.max(km, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (f.y0 - f.y1);
    const axis = el('g', { class: 'axis' }, svg);
    for (let d = lo; d <= hi * 1.0001; d *= 10) {
      el('line', { class: 'gridline', x1: f.x0, x2: f.x1, y1: sy(d), y2: sy(d) }, axis);
      el('text', { x: f.x0 - 8, y: sy(d) + 4, 'text-anchor': 'end' }, axis).textContent = formatKm(d);
    }
    for (const t of x.ticks) el('text', { x: sx(t), y: f.y0 + 22, 'text-anchor': 'middle' }, axis).textContent = `${t} h`;
    // Bands under the lines: 3σ lighter, 1σ darker, each in its series' color.
    for (const s of series) {
      if (!s.envelope) continue;
      for (const [band, alpha] of [['sigma3', 0.12], ['sigma1', 0.24]]) {
        const pts = s.envelope[band];
        if (!pts?.length) continue;
        const d = `M${sx(pts[0][0])},${sy(lo)}${pts.map((p) => `L${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('')}L${sx(pts.at(-1)[0])},${sy(lo)}Z`;
        el('path', { d, fill: s.color, 'fill-opacity': alpha, stroke: 'none', 'data-band': `${s.id}-${band}` }, svg);
      }
    }
    const labels = [];
    for (const s of series) {
      const d = s.points.filter((p) => p[1] > 0).map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-series': s.id }, svg);
      const last = s.points.at(-1);
      if (last) labels.push({ y: sy(last[1]), x: sx(last[0]) + 8, text: s.name });
    }
    for (const m of markers) for (const p of m.points) el('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 5, fill: m.color, stroke: 'var(--surface, #0b0b0c)', 'stroke-width': 2, 'data-marker': m.name }, svg);
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; ++i) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
    for (const l of labels) el('text', { class: 'direct', x: l.x, y: l.y + 4 }, svg).textContent = l.text;
    // Crosshair and tooltip at the nearest sample.
    const hours = [...new Set(series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
    const cross = el('line', { y1: f.y1, y2: f.y0, stroke: 'var(--border-strong, rgba(255,255,255,.22))', 'stroke-width': 1, visibility: 'hidden' }, svg);
    const tip = div('env-tip');
    tip.hidden = true;
    container.append(tip);
    const nearest = (h) => hours.reduce((best, v) => (Math.abs(v - h) < Math.abs(best - h) ? v : best), hours[0]);
    const show = (h, px) => {
      const at = nearest(h);
      cross.setAttribute('x1', sx(at)); cross.setAttribute('x2', sx(at)); cross.setAttribute('visibility', 'visible');
      const rows = series.map((s) => {
        const p = s.points.find((q) => q[0] === at);
        const sig = s.envelope?.sigma1?.find((q) => q[0] === at);
        return `<div><span class="env-swatch" style="background:${s.color}"></span>${s.name}: ${formatKm(p?.[1])}${sig ? ` (1σ ${formatKm(sig[1])})` : ''}</div>`;
      });
      tip.innerHTML = `<strong>${at.toFixed(at < 10 ? 2 : 1)} h</strong>${rows.join('')}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(px + 12, width - 220)}px`;
      cursorAt = at;
      onCursor(at);
    };
    const hit = el('rect', { x: f.x0, y: f.y1, width: f.x1 - f.x0, height: f.y0 - f.y1, fill: 'transparent', class: 'env-hit' }, svg);
    const toHours = (event) => {
      const box = svg.getBoundingClientRect();
      const px = ((event.clientX - box.left) / box.width) * width;
      return { h: ((px - f.x0) / (f.x1 - f.x0)) * x.max, px };
    };
    hit.addEventListener('pointermove', (event) => { const { h, px } = toHours(event); show(Math.min(Math.max(h, 0), x.max), px); });
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    redraw = (h) => { if (h !== null) { const at = nearest(h); cross.setAttribute('x1', sx(at)); cross.setAttribute('x2', sx(at)); cross.setAttribute('visibility', 'visible'); } };
    if (cursorAt !== null) redraw(cursorAt);
  };
  draw();
  const resize = new ResizeObserver(() => draw());
  resize.observe(container);
  return { cursor: (h) => { cursorAt = h; redraw(h); } };
}
