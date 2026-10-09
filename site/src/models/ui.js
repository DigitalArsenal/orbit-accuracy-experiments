// Building blocks for the model pages: panels, inputs, tiles, tables and
// charts in the site's style. Presentation only.
import { lineChart } from '../chart.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

// Numbers as people read them: significant digits, thin grouping.
export function num(x, digits = 4) {
  if (typeof x === 'bigint') return x.toLocaleString('en-US');
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-4) return x.toExponential(Math.max(0, digits - 1)).replace('e+', 'e');
  if (Number.isInteger(x) && a < 1e15) return x.toLocaleString('en-US');
  return Number(x.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 12 });
}
export const fixed = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : '—');

export function panel(parent, title, ...children) {
  const p = h('section', { class: 'panel' }, title ? h('h3', {}, title) : null, ...children);
  parent.append(p);
  return p;
}

// A row of labelled inputs. fields: [{id, label, type: 'number'|'range'|'select'|'text', value, min, max, step, options: [[value, text]]}]
export function inputs(parent, fields, onChange) {
  const box = h('div', { class: 'model-inputs' });
  const get = {};
  for (const f of fields) {
    let control;
    if (f.type === 'select') {
      control = h('select', { id: f.id }, f.options.map(([v, t]) => h('option', { value: v }, t)));
      control.value = String(f.value);
    } else if (f.type === 'textarea') {
      control = h('textarea', { id: f.id, rows: f.rows ?? 3, spellcheck: 'false' });
      control.value = f.value;
    } else {
      control = h('input', { id: f.id, type: f.type ?? 'number', min: f.min, max: f.max, step: f.step ?? 'any', inputmode: f.type === 'text' ? undefined : 'decimal' });
      control.value = f.value;  // after min and max, or a range clamps it
    }
    const out = f.type === 'range' ? h('output', { for: f.id }, f.format ? f.format(Number(f.value)) : f.value) : null;
    if (out) control.addEventListener('input', () => { out.textContent = f.format ? f.format(Number(control.value)) : control.value; });
    const label = h('label', { class: f.wide ? 'wide' : '' }, h('span', {}, f.label, out ? ' ' : '', out), control);
    if (f.hint) label.append(h('small', {}, f.hint));
    box.append(label);
    get[f.id] = () => (f.type === 'select' || f.type === 'text' || f.type === 'textarea' ? control.value : Number(control.value));
    if (onChange) control.addEventListener(f.type === 'range' || f.type === 'textarea' || f.type === 'text' ? 'change' : 'input', onChange);
  }
  parent.append(box);
  return { box, values: () => Object.fromEntries(Object.entries(get).map(([k, g]) => [k, g()])) };
}

export function button(parent, text, onClick, primary = true) {
  const b = h('button', { type: 'button', class: `button small${primary ? ' primary' : ''}` }, text);
  b.addEventListener('click', onClick);
  parent.append(b);
  return b;
}

// tiles: [[label, value text]]
export function tiles(parent, items) {
  let box = parent.querySelector(':scope > dl.tiles');
  if (!box) { box = h('dl', { class: 'tiles' }); parent.append(box); }
  box.replaceChildren(...items.map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value))));
  return box;
}

// rows: arrays of cells (strings or Nodes); a cell {text, class} for style.
export function table(parent, head, rows, { compact = true, existing } = {}) {
  const t = existing ?? h('table', { class: `data-table${compact ? ' compact' : ''}` });
  const cell = (tag, c) => (c && typeof c === 'object' && !(c instanceof Node) ? h(tag, { class: c.class, title: c.title }, c.text) : h(tag, {}, c));
  t.replaceChildren(h('thead', {}, h('tr', {}, head.map((c) => cell('th', c)))), h('tbody', {}, rows.map((r) => h('tr', { class: r.class }, (r.cells ?? r).map((c) => cell('td', c))))));
  if (!existing) parent.append(h('div', { class: 'table-wrap' }, t));
  return t;
}

export function chart(parent, title, caption) {
  const figure = h('figure', { class: 'chart-card' }, h('figcaption', {}, h('strong', {}, title), caption ? h('span', {}, caption) : null));
  const box = h('div', { class: 'chart' });
  figure.append(box);
  parent.append(figure);
  return { figure, draw: (options) => lineChart(box, options), caption: (text) => { figure.querySelector('figcaption span')?.remove(); figure.querySelector('figcaption').append(h('span', {}, text)); } };
}

export const note = (parent, text) => { const p = h('p', { class: 'fine', html: text }); parent.append(p); return p; };
export const pre = (parent, text, cls = 'message') => { const p = h('pre', { class: cls }, text); parent.append(p); return p; };
