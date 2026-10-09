// Small SVG charts in the Space Data Network style: one axis, thin marks,
// hairline grid, amber for the series the story is about, cyan for a second,
// muted ink for the rest; a legend for two or more series, direct labels at
// line ends, and a crosshair tooltip.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
};

export const COLORS = { primary: 'var(--accent)', second: 'var(--cyan)', muted: 'var(--series-muted)' };

// Metres with a unit that suits them.
export function formatMeters(m, digits = 2) {
  if (!Number.isFinite(m)) return '—';
  const a = Math.abs(m);
  const fix = (x) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(digits > 1 ? 1 : 0) : x.toFixed(digits));
  if (a >= 1000) return `${fix(m / 1000)} km`;
  if (a >= 1) return `${fix(m)} m`;
  if (a >= 0.01) return `${fix(m * 100)} cm`;
  return `${fix(m * 1000)} mm`;
}
// A power of ten of metres, in the unit that keeps it a plain number.
const decadeLabel = (v) => {
  const n = (x) => String(Number(x.toPrecision(1)));
  if (v >= 1000) return `${n(v / 1000)} km`;
  if (v >= 1) return `${n(v)} m`;
  if (v >= 0.01) return `${n(v * 100)} cm`;
  return `${n(v * 1000)} mm`;
};

function frame(container, margin) {
  container.querySelectorAll('svg, .tooltip, .empty').forEach((n) => n.remove());
  const width = Math.max(240, container.clientWidth), height = Math.max(160, container.clientHeight);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' }, container);
  return { svg, width, height, x0: margin.left, x1: width - margin.right, y0: height - margin.bottom, y1: margin.top };
}
function logScale(min, max, a, b) {
  const l0 = Math.log10(min), l1 = Math.log10(max);
  return (v) => a + ((Math.log10(Math.max(v, min)) - l0) / (l1 - l0)) * (b - a);
}
const linScale = (min, max, a, b) => (v) => a + ((v - min) / (max - min)) * (b - a);
function decades(min, max) {
  const out = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); ++e) out.push(Number(`1e${e}`));
  return out.filter((v) => v >= min * 0.999 && v <= max * 1.001);
}
function legend(container, series) {
  container.querySelectorAll('.legend').forEach((n) => n.remove());
  if (series.length < 2) return null;
  const box = document.createElement('div');
  box.className = 'legend';
  for (const s of series) {
    const item = document.createElement('span');
    const key = document.createElement('i');
    key.className = 'key';
    key.style.background = s.color;
    item.append(key, document.createTextNode(s.name));
    box.appendChild(item);
  }
  container.appendChild(box);
  return box;
}

// series: [{name, color, points: [[x, y]], markers, label}] with y > 0 on a
// log axis. x: {min, max, ticks, format, title}. Returns nothing; re-renders
// on resize.
export function lineChart(container, { series, x, y = {}, empty = 'No data yet.' }) {
  const draw = () => {
    const live = series.filter((s) => s.points.length);
    // The legend sits above the plot; the plot starts below however many
    // lines it wraps to.
    const key = legend(container, live);
    const f = frame(container, { left: 56, right: 92, top: key ? key.offsetHeight + 14 : 16, bottom: 34 });
    if (!live.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = empty; container.appendChild(e); return; }
    const ys = live.flatMap((s) => s.points.map((p) => p[1])).filter((v) => v > 0 && Number.isFinite(v));
    const yMin = y.min ?? 10 ** Math.floor(Math.log10(Math.min(...ys))), yMax = y.max ?? 10 ** Math.ceil(Math.log10(Math.max(...ys)));
    const sx = linScale(x.min, x.max, f.x0, f.x1), sy = logScale(yMin, yMax, f.y0, f.y1);
    const axis = el('g', { class: 'axis' }, f.svg);
    for (const v of decades(yMin, yMax)) {
      el('line', { class: 'gridline', x1: f.x0, x2: f.x1, y1: sy(v), y2: sy(v) }, axis);
      el('text', { x: f.x0 - 8, y: sy(v) + 4, 'text-anchor': 'end' }, axis).textContent = decadeLabel(v);
    }
    // Ticks that would collide are dropped, the last one kept.
    let lastTick = -Infinity;
    const lastPx = sx(x.ticks.at(-1));
    x.ticks.forEach((t, i) => {
      const px = sx(t), isLast = i === x.ticks.length - 1;
      if (!isLast && (px - lastTick < 34 || lastPx - px < 34)) return;
      el('text', { x: px, y: f.y0 + 22, 'text-anchor': 'middle' }, axis).textContent = x.format ? x.format(t) : t;
      lastTick = px;
    });
    el('line', { class: 'gridline', x1: f.x0, x2: f.x1, y1: f.y0, y2: f.y0 }, axis);
    // Muted series first, the story on top.
    const order = [...live].sort((a, b) => (a.color === COLORS.muted ? -1 : 0) - (b.color === COLORS.muted ? -1 : 0));
    const labels = [];
    for (const s of order) {
      const d = s.points.filter((p) => p[1] > 0).map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width ?? 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, f.svg);
      if (s.markers) for (const p of s.points) el('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, f.svg);
      if (s.label) {
        const last = s.points.at(-1);
        labels.push({ y: sy(last[1]), x: sx(last[0]) + 8, text: s.labelText ?? s.name });
      }
    }
    // Direct labels, nudged apart.
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; ++i) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
    for (const l of labels) el('text', { class: 'direct', x: l.x, y: l.y + 4 }, f.svg).textContent = l.text;
    // Crosshair and tooltip at the nearest x.
    const xs = [...new Set(live.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
    const cross = el('line', { x1: 0, x2: 0, y1: f.y1, y2: f.y0, stroke: 'var(--border-strong)', 'stroke-width': 1, visibility: 'hidden' }, f.svg);
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.hidden = true;
    container.appendChild(tip);
    const hit = el('rect', { x: f.x0, y: f.y1, width: f.x1 - f.x0, height: f.y0 - f.y1, fill: 'transparent' }, f.svg);
    const move = (event) => {
      const box = f.svg.getBoundingClientRect();
      const px = ((event.clientX - box.left) / box.width) * f.width;
      const t = xs.reduce((best, v) => (Math.abs(sx(v) - px) < Math.abs(sx(best) - px) ? v : best), xs[0]);
      cross.setAttribute('x1', sx(t)); cross.setAttribute('x2', sx(t)); cross.setAttribute('visibility', 'visible');
      const rows = live.map((s) => { const p = s.points.find((q) => q[0] === t); return p ? `<span class="key" style="background:${s.color}"></span>${s.name} <b>${formatMeters(p[1])}</b>` : null; }).filter(Boolean);
      tip.innerHTML = `<div>${x.format ? x.format(t) : t}</div>${rows.join('<br>')}`;
      tip.style.left = `${(sx(t) / f.width) * 100}%`;
      tip.style.top = `${(f.y1 / f.height) * 100 + 8}%`;
      tip.hidden = false;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  };
  draw();
  if (!container._observer) {
    container._observer = new ResizeObserver(() => container._redraw?.());
    container._observer.observe(container);
  }
  container._redraw = draw;
}

// groups: [{name, items: [{label, value, limit}]}]: one strip per group, a dot
// per item on a log axis, a hairline at each item's limit.
export function stripChart(container, { groups, min, max }) {
  const draw = () => {
    const f = frame(container, { left: 84, right: 16, top: 12, bottom: 30 });
    const sx = logScale(min, max, f.x0, f.x1);
    const band = (f.y0 - f.y1) / groups.length;
    const axis = el('g', { class: 'axis' }, f.svg);
    let lastLabel = -Infinity;
    for (const v of decades(min, max)) {
      el('line', { class: 'gridline', x1: sx(v), x2: sx(v), y1: f.y1, y2: f.y0 }, axis);
      if (sx(v) - lastLabel < 46) continue;
      el('text', { x: sx(v), y: f.y0 + 20, 'text-anchor': 'middle' }, axis).textContent = decadeLabel(v);
      lastLabel = sx(v);
    }
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.hidden = true;
    container.appendChild(tip);
    groups.forEach((g, gi) => {
      const cy = f.y1 + band * (gi + 0.5);
      el('text', { class: 'direct', x: f.x0 - 10, y: cy + 4, 'text-anchor': 'end' }, f.svg).textContent = g.name;
      g.items.forEach((item, k) => {
        const jitter = ((k % 5) - 2) * Math.min(5, band / 8);
        if (item.limit) el('line', { x1: sx(item.limit), x2: sx(item.limit), y1: cy - band * 0.35, y2: cy + band * 0.35, stroke: 'var(--border-strong)', 'stroke-width': 1 }, f.svg);
        const dot = el('circle', { cx: sx(item.value), cy: cy + jitter, r: 5, fill: item.highlight ? 'var(--cyan)' : 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2, tabindex: 0 }, f.svg);
        const show = () => {
          tip.innerHTML = `${item.label}<br><b>${formatMeters(item.value)}</b>${item.limit ? ` (limit ${formatMeters(item.limit)})` : ''}`;
          tip.style.left = `${(sx(item.value) / f.width) * 100}%`;
          tip.style.top = `${((cy + jitter) / f.height) * 100}%`;
          tip.hidden = false;
        };
        dot.addEventListener('pointerenter', show);
        dot.addEventListener('focus', show);
        dot.addEventListener('pointerleave', () => { tip.hidden = true; });
        dot.addEventListener('blur', () => { tip.hidden = true; });
        if (item.onSelect) dot.addEventListener('click', item.onSelect);
      });
    });
  };
  draw();
  if (!container._observer) {
    container._observer = new ResizeObserver(() => container._redraw?.());
    container._observer.observe(container);
  }
  container._redraw = draw;
}
