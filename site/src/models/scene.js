// The 3D view of a model page: an analytic plot box, as MATLAB's plot3 with
// box on and grid on, in one CesiumJS Viewer with no globe, sky or imagery
// (vendored, no ion). The box bounds the data; the grid sits on the three
// back planes and follows the view; ticks carry numbers in physical units;
// the axes are labelled with their units. Models hand it what the modules
// computed, in those units; this file only draws.
//
//   const view = scene3d(ctx, { title, caption });
//   await view.draw((s) => { s.line(points); s.point(p, { label: 'r' }); },
//     { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal', legend, time });
//
// The camera is CesiumJS's own controller about the box centre
// (lookAtTransform): drag to rotate, wheel or right-drag to zoom, middle-drag
// to tilt; preset views and a reset. Anything that moves is an entity on a
// SampledPositionProperty driven by the viewer's Clock, and the Clock follows
// the page's one time state (ctx.time), which a slider under the box, and any
// chart cursor on the page, set.
import { siteUrl } from '../modules.js';
import { h } from './ui.js';

const BOX = 1.0e6;            // world metres spanned by the box's longest side
const EARTH_KM = 6378.137;

let cesium;
function loadCesium() {
  cesium ??= new Promise((resolve, reject) => {
    if (window.Cesium) { resolve(window.Cesium); return; }
    window.CESIUM_BASE_URL = siteUrl('./vendor/cesium/');
    document.head.append(h('link', { rel: 'stylesheet', href: siteUrl('./vendor/cesium/Widgets/widgets.css') }));
    document.head.append(h('script', { src: siteUrl('./vendor/cesium/Cesium.js'),
      onload: () => resolve(window.Cesium), onerror: () => reject(new Error('CesiumJS did not load.')) }));
  });
  return cesium;
}

const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches;

function palette(C) {
  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => C.Color.fromCssColorString(css.getPropertyValue(name).trim() || fallback);
  const light = isLight();
  const ink = C.Color.fromCssColorString(light ? '#1d1d1f' : '#f5f5f7');
  return {
    light,
    accent: token('--accent', '#f5a524'), cyan: token('--cyan', '#59d9ff'), text: token('--text', '#f5f5f7'),
    muted: token('--muted', '#8e8e93'), alert: token('--alert', '#ff3b30'), sat: light ? C.Color.fromCssColorString('#3a4a5c') : token('--sat', '#b3e0ff'),
    bg: C.Color.fromCssColorString(light ? '#ffffff' : '#05070b'),
    grid: ink.withAlpha(light ? 0.13 : 0.12), box: ink.withAlpha(light ? 0.55 : 0.45), tick: ink.withAlpha(light ? 0.75 : 0.7), earth: ink.withAlpha(light ? 0.28 : 0.3),
  };
}

// Small vector helpers for drawing.
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => Math.hypot(a[0], a[1], a[2]),
  unit: (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; },
};
// Radial, in-track and cross-track unit vectors of a state.
export function rtn(r, v) {
  const R = v3.unit(r), N = v3.unit(v3.cross(r, v));
  return [R, v3.cross(N, R), N];
}
// Components of d along an RTN basis, and back.
export const toRtn = (basis, d) => basis.map((b) => v3.dot(b, d));
export const fromRtn = (basis, c) => v3.add(v3.add(v3.scale(basis[0], c[0]), v3.scale(basis[1], c[1])), v3.scale(basis[2], c[2]));
// A 3×3 position covariance (row-major) rotated into an RTN basis.
export function rtnCovariance(basis, P) {
  const out = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += basis[i][a] * P[a * 3 + b] * basis[j][b];
    out.push(s);
  }
  return out;
}
// Semi-axes of the 1σ ellipsoid of a symmetric 3×3 covariance (row-major,
// any units²): [[axis vector], …], each scaled by its σ. Jacobi rotations.
export function covarianceAxes(P) {
  const a = [[P[0], P[1], P[2]], [P[3], P[4], P[5]], [P[6], P[7], P[8]]];
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] ** 2;
    if (off < 1e-30 * (a[0][0] ** 2 + a[1][1] ** 2 + a[2][2] ** 2)) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  return [0, 1, 2].map((j) => v3.scale([V[0][j], V[1][j], V[2][j]], Math.sqrt(Math.max(0, a[j][j]))));
}
// Tick spacing of about `target` intervals over `range`: 1, 2 or 5 × 10ⁿ.
function niceStep(range, target = 5) {
  const raw = Math.max(range, 1e-300) / target, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function tickFormat(step) {
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return (v) => (Math.abs(v) < step * 1e-6 ? '0' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−'));
}
// Box limits and ticks from a data extent: limits on tick multiples.
function axisLimits(min, max) {
  if (!(max > min)) { const d = Math.abs(min) * 0.05 || 1; min -= d; max += d; }
  const step = niceStep(max - min);
  const lo = Math.floor(min / step - 1e-9) * step, hi = Math.ceil(max / step + 1e-9) * step;
  const ticks = [];
  for (let k = Math.round(lo / step); k <= Math.round(hi / step); k++) ticks.push(k * step);
  return { lo, hi, step, ticks, format: tickFormat(step) };
}

// Preset views: the direction from the box centre toward the camera, in the
// box's axes (MATLAB's view(-37.5, 30), and the three planes).
const PRESETS = {
  '3d': [-Math.sin(37.5 * Math.PI / 180) * Math.cos(Math.PI / 6), -Math.cos(37.5 * Math.PI / 180) * Math.cos(Math.PI / 6), 0.5],
  xy: [0, -1e-4, 1], xz: [0, -1, 0], yz: [1, 0, 0],
};

// The normal of the plane through the origin that a track lies in (the
// largest cross product of its points), for view({normal}).
export function planeNormal(points) {
  let best = [0, 0, 1], size = 0;
  const step = Math.max(1, Math.floor(points.length / 24));
  for (let i = 0; i < points.length; i += step) {
    for (let j = i + step; j < points.length; j += step) {
      const c = v3.cross(points[i], points[j]), n = v3.norm(c);
      if (n > size) { size = n; best = c; }
    }
  }
  return v3.unit(best);
}
// A view of a plane at `tilt` from its normal, turned toward MATLAB's 3-D
// view, so an orbit opens as an ellipse instead of an edge.
function planeView(normal, tilt = 50) {
  const P = PRESETS['3d'];
  let n = v3.unit(normal);
  if (v3.dot(n, P) < 0) n = v3.scale(n, -1);
  let w = v3.sub(P, v3.scale(n, v3.dot(P, n)));
  if (v3.norm(w) < 1e-6) w = Math.abs(n[2]) < 0.9 ? v3.cross(n, [0, 0, 1]) : v3.cross(n, [1, 0, 0]);
  const a = tilt * Math.PI / 180;
  return v3.add(v3.scale(n, Math.cos(a)), v3.scale(v3.unit(w), Math.sin(a)));
}

export function scene3d(ctx, { title, caption, after = null } = {}) {
  const box = h('div', { class: 'scene', role: 'img', 'aria-label': title });
  const legend = h('ul', { class: 'scene-legend' });
  const captionNode = h('span', {}, caption ?? '');
  const views = h('div', { class: 'scene-views', role: 'group', 'aria-label': 'Views' },
    ...[['3d', '3D'], ['xy', 'xy'], ['xz', 'xz'], ['yz', 'yz']].map(([id, text]) => h('button', { type: 'button', class: 'scene-view', 'data-view': id, onclick: () => setView(id) }, text)),
    h('button', { type: 'button', class: 'scene-view reset', title: 'Reset the view', 'aria-label': 'Reset the view', onclick: () => setView(null) }, '⟲'));
  const explore = h('button', { type: 'button', class: 'scene-explore', hidden: true, onclick: () => { setInputs(true); explore.hidden = true; } }, 'Tap to explore in 3D');
  const slider = h('input', { type: 'range', class: 'scene-time-range', min: 0, max: 1, step: 'any', value: 0, 'aria-label': 'Time' });
  const timeText = h('output', { class: 'scene-time-text' });
  const timeRow = h('div', { class: 'scene-time', hidden: true }, slider, timeText);
  const figure = h('figure', { class: 'chart-card scene-card' }, h('figcaption', {}, h('strong', {}, title), captionNode),
    h('div', { class: 'scene-frame' }, box, views, explore), timeRow, legend);
  if (after) after.after(figure); else ctx.root.append(figure);
  loadCesium().catch(() => {});

  let viewer = null, last = null, framing = null, chosen = null, timeSpan = null, pending = Promise.resolve();
  const setInputs = (on) => { if (viewer) viewer.scene.screenSpaceCameraController.enableInputs = on; };
  // Render on demand, for a few frames after a change: entity primitives and
  // label glyphs that a change creates are ready a frame or two later.
  let settling = 0;
  const settle = () => {
    const running = settling > 0;
    settling = 24;
    if (running) return;
    const tick = () => { if (!viewer) { settling = 0; return; } viewer.scene.requestRender(); if (--settling > 0) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };

  async function create(C) {
    viewer = new C.Viewer(box, {
      globe: false, skyBox: false, skyAtmosphere: false, baseLayer: false, scene3DOnly: true,
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, creditContainer: h('div'),
      requestRenderMode: true, maximumRenderTimeChange: Infinity, shouldAnimate: false, useBrowserRecommendedResolution: false, msaaSamples: 4,
      contextOptions: { webgl: { alpha: false, antialias: true, powerPreference: 'low-power' } },
    });
    viewer.resolutionScale = Math.min(1, 2 / (window.devicePixelRatio || 1));
    const scene = viewer.scene;
    scene.fog.enabled = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    const controller = scene.screenSpaceCameraController;
    controller.enableCollisionDetection = false;
    controller.minimumZoomDistance = BOX * 0.02;
    controller.maximumZoomDistance = BOX * 40;
    scene.light = new C.DirectionalLight({ direction: C.Cartesian3.normalize(new C.Cartesian3(-0.3, -0.5, -0.8), new C.Cartesian3()), intensity: 2.2 });
    scene.preRender.addEventListener(() => chosen?.());
    if (coarsePointer()) { setInputs(false); explore.hidden = false; }
  }

  function destroy() {
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    viewer = null;
    box.replaceChildren();
  }
  addEventListener('pagehide', destroy);
  addEventListener('pageshow', (event) => { if (event.persisted && last) draw(last.build, last.options); });
  new MutationObserver(() => { if (viewer && last) draw(last.build, last.options); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // The camera about the box centre, from a preset or the scene's own view.
  function setView(name) {
    if (!viewer || !framing) return;
    const C = window.Cesium, camera = viewer.scene.camera;
    const d = name ? PRESETS[name] : framing.direction;
    figure.querySelectorAll('.scene-view').forEach((b) => b.classList.toggle('active', b.dataset.view === (name ?? framing.preset)));
    const frustum = camera.frustum;
    const aspect = viewer.canvas.clientWidth / Math.max(1, viewer.canvas.clientHeight);
    const fov = frustum.fov ?? Math.PI / 3;
    const half = aspect >= 1 ? Math.atan(Math.tan(fov / 2) / aspect) : fov / 2;
    const range = (framing.radius / Math.sin(half)) * (framing.margin ?? 1.08);
    const unit = C.Cartesian3.normalize(new C.Cartesian3(...d), new C.Cartesian3());
    camera.lookAtTransform(C.Matrix4.fromTranslation(framing.center), C.Cartesian3.multiplyByScalar(unit, range, new C.Cartesian3()));
    settle();
  }

  // The page's time state drives the clock; the slider sets the time state.
  const timeListener = (ms) => {
    if (!timeSpan || !viewer) return;
    const C = window.Cesium;
    const t = Math.min(timeSpan.stopMs, Math.max(timeSpan.startMs, ms));
    viewer.clock.currentTime = C.JulianDate.fromDate(new Date(t));
    slider.value = String(t);
    timeText.textContent = timeSpan.format(t);
    settle();
  };
  ctx.time?.on(timeListener);
  slider.addEventListener('input', () => ctx.time.set(Number(slider.value)));

  // Draw a scene. build(s) adds what to show in data units; options:
  // {axes: [x, y, z labels with units], aspect: 'equal' | 'normal',
  // legend: [[color name, text, style]], caption, time: {startMs, stopMs, ms,
  // format}}.
  function draw(build, options = {}) {
    last = { build, options };
    pending = pending.then(() => render(build, options)).catch((error) => {
      console.warn(error);
      destroy();
      box.append(h('p', { class: 'scene-error' }, 'This browser did not provide the WebGL the 3D view needs.'));
    });
    return pending;
  }

  async function render(build, options) {
    const C = await loadCesium();
    if (!viewer) {
      box.replaceChildren();
      await create(C);
    }
    const scene = viewer.scene, colors = palette(C);
    scene.backgroundColor = colors.bg;
    scene.primitives.removeAll();
    viewer.entities.removeAll();
    if (options.caption !== undefined) captionNode.textContent = options.caption;
    const color = (c, alpha) => {
      const base = typeof c === 'string' ? (colors[c] ?? C.Color.fromCssColorString(c)) : (c ?? colors.accent);
      return alpha === undefined ? base : base.withAlpha(alpha);
    };

    // 1. What to draw, in data units.
    const items = [], extent = [];
    const add = (item, pts, frame) => { items.push(item); if (frame !== false) extent.push(...pts); return item; };
    const s = {
      C, colors, color,
      // A polyline; {color, alpha, width, dash, arrow, glow, close, frame: false}.
      line(pts, o = {}) { return pts.length < 2 ? null : add({ kind: 'line', pts: o.close ? [...pts, pts[0]] : pts, o }, pts, o.frame); },
      arrow(from, to, o = {}) { return s.line([from, to], { width: 9, ...o, arrow: true }); },
      // A smooth curve through time-ordered samples [[t, [x, y, z]]],
      // interpolated for display by CesiumJS.
      track(samples, o = {}) { return samples.length < 2 ? null : add({ kind: 'track', samples, o }, samples.map((q) => q[1]), o.frame); },
      point(p, o = {}) {
        add({ kind: 'point', p, o }, [p], o.frame);
        if (o.label) s.label(p, o.label, { color: o.labelColor ?? o.color, frame: false, ...o.labelOptions });
      },
      // Text at a point: {color, size, dx, dy, align, above, frame}.
      label(p, text, o = {}) { return add({ kind: 'label', p, text, o }, [p], o.frame === true ? true : false); },
      // An ellipsoid from its three semi-axis vectors.
      ellipsoid(center, axes, o = {}) { return add({ kind: 'solid', shape: 'ellipsoid', center, axes, o }, corners(center, axes), o.frame); },
      sphere(center, radius, o = {}) { return s.ellipsoid(center, [[radius, 0, 0], [0, radius, 0], [0, 0, radius]], o); },
      disc(center, u, v, o = {}) {
        const n = v3.scale(v3.unit(v3.cross(u, v)), Math.max(v3.norm(u), v3.norm(v)) * 1e-3);
        return add({ kind: 'solid', shape: 'ellipsoid', center, axes: [u, v, n], o: { flat: true, ...o } }, corners(center, [u, v, n]), o.frame);
      },
      ring(center, u, v, o = {}) {
        const n = o.segments ?? 96;
        return s.line(Array.from({ length: n }, (_, k) => {
          const a = (2 * Math.PI * k) / n;
          return v3.add(center, v3.add(v3.scale(u, Math.cos(a)), v3.scale(v, Math.sin(a))));
        }), { ...o, close: true });
      },
      cylinder(a, b, r, o = {}) {
        const axis = v3.sub(b, a), z = v3.unit(axis);
        const x = v3.unit(Math.abs(z[0]) < 0.9 ? v3.cross(z, [1, 0, 0]) : v3.cross(z, [0, 1, 0])), y = v3.cross(z, x);
        const axes = [v3.scale(x, r), v3.scale(y, r), v3.scale(z, v3.norm(axis) / 2)], center = v3.scale(v3.add(a, b), 0.5);
        return add({ kind: 'solid', shape: 'cylinder', center, axes, o }, corners(center, axes), o.frame);
      },
      box(center, size, o = {}) {
        const axes = [[size[0] / 2, 0, 0], [0, size[1] / 2, 0], [0, 0, size[2] / 2]];
        return add({ kind: 'solid', shape: 'box', center, axes, o }, corners(center, axes), o.frame);
      },
      // A 1σ covariance (RTN, data units²) as an ellipsoid at `anchor`,
      // scaled k; its two shorter axes also ×thin, directions kept.
      covariance(anchor, basis, Prtn, k = 1, o = {}) {
        const axes = covarianceAxes(Prtn).sort((a, b) => v3.norm(b) - v3.norm(a));
        return s.ellipsoid(anchor, axes.map((a, i) => fromRtn(basis, v3.scale(a, k * (i ? o.thin ?? 1 : 1)))), o);
      },
      // Labelled lines from an origin (a local triad).
      axes(origin, basis, length, names, o = {}) {
        basis.forEach((b, k) => {
          const tip = v3.add(origin, v3.scale(v3.unit(b), length));
          s.line([origin, tip], { color: o.color ?? 'muted', width: o.width ?? 1.5, frame: o.frame, alpha: o.alpha });
          if (names?.[k]) s.label(tip, names[k], { color: o.labelColor ?? o.color ?? 'muted', size: 11, weight: 500, dy: o.labelDy });
        });
      },
      // A square grid in a plane through `center` spanned by unit u, v.
      grid(center, u, v, half, step, o = {}) {
        for (let x = -half; x <= half + 1e-9; x += step) {
          s.line([v3.add(center, v3.add(v3.scale(u, x), v3.scale(v, -half))), v3.add(center, v3.add(v3.scale(u, x), v3.scale(v, half)))], { color: colors.grid, width: 1, frame: o.frame ?? false });
          s.line([v3.add(center, v3.add(v3.scale(v, x), v3.scale(u, -half))), v3.add(center, v3.add(v3.scale(u, x), v3.scale(v, half)))], { color: colors.grid, width: 1, frame: o.frame ?? false });
        }
      },
      // The Earth as a plain wireframe sphere of 6378.137 km (km scenes).
      earth(o = {}) {
        const R = EARTH_KM;
        return add({ kind: 'earth', o }, [[-R, -R, -R], [R, R, R]], o.frame);
      },
      earthRadiusKm: EARTH_KM,
      // Moving with the clock: samples [[ms, [x, y, z]]]; {color, size,
      // label, trail (width, or false), lead}.
      moving(samples, o = {}) { return add({ kind: 'moving', samples, o }, samples.map((q) => q[1]), o.frame); },
      // A segment from `from` (a point, or samples) to moving samples.
      vector(from, samples, o = {}) { return add({ kind: 'vector', from, samples, o }, [], false); },
      // An ellipsoid that moves and grows with the clock: samples
      // [[ms, center, [three orthogonal semi-axis vectors]]].
      movingEllipsoid(samples, o = {}) { return add({ kind: 'movingEllipsoid', samples, o }, samples.flatMap((q) => corners(q[1], q[2])), o.frame); },
      // The starting view: {preset: '3d' | 'xy' | 'xz' | 'yz', direction,
      // normal (a plane to open at 50° from its normal, as planeNormal gives)}.
      view(v) { s._view = v.normal ? { ...v, direction: planeView(v.normal, v.tilt) } : v; },
    };
    await build(s);

    // 2. The box: limits on tick multiples; equal or independent axis scales;
    // an axis given labelled ticks ([[value, label]]) is categorical.
    const pts = extent.length ? extent : [[-1, -1, -1], [1, 1, 1]];
    const lim = [0, 1, 2].map((i) => axisLimits(Math.min(...pts.map((p) => p[i])), Math.max(...pts.map((p) => p[i]))));
    (options.ticks ?? []).forEach((given, i) => {
      if (!given) return;
      const values = given.map((t) => t[0]), gap = values.length > 1 ? Math.min(...values.slice(1).map((v, k) => v - values[k])) : 1;
      const lo = Math.min(...values, ...pts.map((p) => p[i])) - gap / 2, hi = Math.max(...values, ...pts.map((p) => p[i])) + gap / 2;
      const names = new Map(given);
      lim[i] = { lo, hi, step: gap, ticks: values, format: (v) => names.get(v) ?? '', categorical: true };
    });
    // Limits given by the scene ([[lo, hi] | null] × 3): the box clips to them.
    const given = options.limits ?? [];
    given.forEach((range, i) => {
      if (!range) return;
      const [lo, hi] = range, step = niceStep(hi - lo);
      const ticks = [];
      for (let k = Math.ceil(lo / step - 1e-9); k <= Math.floor(hi / step + 1e-9); k++) ticks.push(k * step);
      lim[i] = { lo, hi, step, ticks, format: tickFormat(step), fixed: true };
    });
    if (options.aspect !== 'normal') {
      // Equal aspect: one scale, and each axis's limits widened about their
      // centre so that ticks of one step fill a box with the data's
      // proportions (about the limits' centre, which already hold the data,
      // so that widening never adds a step on one side).
      const step = Math.max(...lim.map((l) => l.step));
      for (let i = 0; i < 3; i++) {
        if (lim[i].categorical || lim[i].fixed) continue;
        const mid = (lim[i].lo + lim[i].hi) / 2;
        const half = Math.max(lim[i].hi - lim[i].lo, step) / 2;
        lim[i] = axisLimitsStep(mid - half, mid + half, step);
      }
    }
    const span = lim.map((l) => l.hi - l.lo);
    const k = options.aspect === 'normal' ? span.map((d) => BOX / d) : span.map(() => BOX / Math.max(...span));
    const center = lim.map((l) => (l.lo + l.hi) / 2);
    const world = (p) => new C.Cartesian3((p[0] - center[0]) * k[0], (p[1] - center[1]) * k[1], (p[2] - center[2]) * k[2]);
    const linear = (a) => new C.Cartesian3(a[0] * k[0], a[1] * k[1], a[2] * k[2]);
    const sizeWorld = Math.max(...span.map((d, i) => d * k[i]));
    // Clipping to the box, when the scene gives limits: points inside it, and
    // the parts of segments inside it (Liang–Barsky).
    const clipping = given.some(Boolean);
    const inside = (p) => !clipping || p.every((x, i) => x >= lim[i].lo - 1e-9 * span[i] && x <= lim[i].hi + 1e-9 * span[i]);
    const clipSegment = (a, b) => {
      let t0 = 0, t1 = 1;
      for (let i = 0; i < 3; i++) {
        const d = b[i] - a[i];
        for (const [q, r] of [[-d, a[i] - lim[i].lo], [d, lim[i].hi - a[i]]]) {
          if (Math.abs(q) < 1e-300) { if (r < 0) return null; continue; }
          const t = r / q;
          if (q < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
        }
      }
      const at = (t) => a.map((x, i) => x + (b[i] - x) * t);
      return [at(t0), at(t1)];
    };
    const clipPolyline = (pts) => {
      if (!clipping) return [pts];
      const runs = [];
      let run = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = clipSegment(pts[i], pts[i + 1]);
        if (!seg) { if (run.length > 1) runs.push(run); run = []; continue; }
        if (!run.length) run.push(seg[0]);
        run.push(seg[1]);
        if (seg[1].some((x, j) => Math.abs(x - pts[i + 1][j]) > 1e-12 * (span[j] || 1))) { runs.push(run); run = []; }
      }
      if (run.length > 1) runs.push(run);
      return runs;
    };

    // 3. The box, its grid and its ticks.
    const frameLines = scene.primitives.add(new C.PolylineCollection());
    const corner = (sx, sy, sz) => [sx ? lim[0].hi : lim[0].lo, sy ? lim[1].hi : lim[1].lo, sz ? lim[2].hi : lim[2].lo];
    const edge = (axis, a, b) => {   // the edge along `axis` at sides a, b of the other two
      const at = (t) => { const p = [0, 0, 0]; const [j, m] = [0, 1, 2].filter((x) => x !== axis); p[axis] = t; p[j] = a ? lim[j].hi : lim[j].lo; p[m] = b ? lim[m].hi : lim[m].lo; return p; };
      return at;
    };
    for (let axis = 0; axis < 3; axis++) for (const a of [0, 1]) for (const b of [0, 1]) {
      const at = edge(axis, a, b);
      frameLines.add({ positions: [world(at(lim[axis].lo)), world(at(lim[axis].hi))], width: 1, material: C.Material.fromType('Color', { color: colors.box }) });
    }
    // Grid planes: face (axis i at side 0 or 1), lines at the other axes' ticks.
    const faces = [0, 1, 2].map((i) => [0, 1].map((side) => {
      const col = scene.primitives.add(new C.PolylineCollection());
      const [j, m] = [0, 1, 2].filter((x) => x !== i);
      const at = (tj, tm) => { const p = [0, 0, 0]; p[i] = side ? lim[i].hi : lim[i].lo; p[j] = tj; p[m] = tm; return world(p); };
      const material = C.Material.fromType('Color', { color: colors.grid });
      for (const t of lim[j].ticks) col.add({ positions: [at(t, lim[m].lo), at(t, lim[m].hi)], width: 1, material });
      for (const t of lim[m].ticks) col.add({ positions: [at(lim[j].lo, t), at(lim[j].hi, t)], width: 1, material });
      col.show = false;
      return col;
    }));
    // Tick marks, numbers and the axis label on each of the 12 edges; three show.
    const names = options.axes ?? ['x', 'y', 'z'];
    const font = getComputedStyle(document.body).getPropertyValue('--sans') || 'sans-serif';
    const edgeSets = new Map();
    for (let axis = 0; axis < 3; axis++) for (const a of [0, 1]) for (const b of [0, 1]) {
      const at = edge(axis, a, b);
      const mid = at((lim[axis].lo + lim[axis].hi) / 2);
      const centerline = [...center]; centerline[axis] = mid[axis];
      const out = C.Cartesian3.normalize(C.Cartesian3.subtract(world(mid), world(centerline), new C.Cartesian3()), new C.Cartesian3());
      const offset = (p, f) => C.Cartesian3.add(world(p), C.Cartesian3.multiplyByScalar(out, sizeWorld * f, new C.Cartesian3()), new C.Cartesian3());
      const marks = scene.primitives.add(new C.PolylineCollection());
      const labels = scene.primitives.add(new C.LabelCollection({ scene }));
      const ends = {};
      for (const t of lim[axis].ticks) {
        const p = at(t);
        marks.add({ positions: [world(p), offset(p, 0.022)], width: 1, material: C.Material.fromType('Color', { color: colors.tick }) });
        const label = labels.add({ position: offset(p, 0.08), text: lim[axis].format(t), font: `500 11px ${font}`, fillColor: color('muted'), outlineColor: colors.bg, outlineWidth: 3,
          style: C.LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY });
        if (Math.abs(t - lim[axis].lo) < lim[axis].step * 1e-6) ends.lo = label;
        if (Math.abs(t - lim[axis].hi) < lim[axis].step * 1e-6) ends.hi = label;
      }
      labels.add({ position: offset(mid, axis === 2 ? 0.3 : 0.22), text: names[axis], font: `600 12px ${font}`, fillColor: color('text'), outlineColor: colors.bg, outlineWidth: 3,
        style: C.LabelStyle.FILL_AND_OUTLINE, horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.CENTER, disableDepthTestDistance: Number.POSITIVE_INFINITY });
      marks.show = labels.show = false;
      edgeSets.set(`${axis}${a}${b}`, [marks, labels, ends]);
    }
    // The back planes and the labelled edges follow the camera.
    const centerWorld = new C.Cartesian3(0, 0, 0);
    let shown = '';
    chosen = () => {
      if (!viewer) return;
      const cam = viewer.scene.camera.positionWC;
      const v = [cam.x - centerWorld.x, cam.y - centerWorld.y, cam.z - centerWorld.z];
      const front = v.map((x) => (x > 0 ? 1 : 0)), bottom = v[2] >= 0 ? 0 : 1;
      // z: the vertical edge that sits left on screen of the two side corners.
      const side = [[front[0], 1 - front[1]], [1 - front[0], front[1]]].map(([sx, sy]) => {
        const p = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, world(corner(sx, sy, 0)));
        return { sx, sy, x: p ? p.x : 0 };
      }).sort((p, q) => p.x - q.x)[0];
      const keys = [`0${front[1]}${bottom}`, `1${front[0]}${bottom}`, `2${side.sx}${side.sy}`];
      const key = `${front.join('')}${bottom}${keys.join('')}`;
      if (key === shown) return;
      shown = key;
      faces.forEach((pair, i) => pair.forEach((col, sideIndex) => { col.show = sideIndex === 1 - front[i]; }));
      for (const [id, [marks, labelSet]] of edgeSets) marks.show = labelSet.show = keys.includes(id);
      // The x and y edges meet at the front corner: the y number there gives way.
      const yEnds = edgeSets.get(keys[1])[2];
      for (const [id, set] of edgeSets) if (id[0] === '1') { if (set[2].lo) set[2].lo.show = true; if (set[2].hi) set[2].hi.show = true; }
      const yCorner = front[1] ? yEnds.hi : yEnds.lo;
      if (yCorner) yCorner.show = false;
    };

    // 4. The data.
    const lines = scene.primitives.add(new C.PolylineCollection());
    const points = scene.primitives.add(new C.PointPrimitiveCollection());
    const solids = scene.primitives.add(new C.PrimitiveCollection());
    const labels = scene.primitives.add(new C.LabelCollection({ scene }));
    const lineMaterial = (o) => {
      const c = color(o.color, o.alpha);
      return o.arrow ? C.Material.fromType('PolylineArrow', { color: c })
        : o.dash ? C.Material.fromType('PolylineDash', { color: c, dashLength: o.dashLength ?? 12 })
          : o.glow ? C.Material.fromType('PolylineGlow', { color: c, glowPower: 0.18, taperPower: 1 })
            : C.Material.fromType('Color', { color: c });
    };
    const labelOptions = (text, o) => {
      const align = o.align ?? 'left';
      return {
        text, font: `${o.weight ?? 600} ${o.size ?? 12}px ${font}`,
        fillColor: color(o.color ?? 'text'), outlineColor: colors.bg, outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: align === 'right' ? C.HorizontalOrigin.RIGHT : align === 'center' ? C.HorizontalOrigin.CENTER : C.HorizontalOrigin.LEFT,
        verticalOrigin: o.above ? C.VerticalOrigin.BOTTOM : C.VerticalOrigin.CENTER,
        pixelOffset: new C.Cartesian2(o.dx ?? (align === 'left' ? 9 : align === 'right' ? -9 : 0), o.dy ?? (o.above ? -8 : 0)),
        disableDepthTestDistance: o.overlay === false ? undefined : Number.POSITIVE_INFINITY,
      };
    };
    const sampled = (samples, o = {}) => {
      const property = new C.SampledPositionProperty();
      property.setInterpolationOptions({ interpolationDegree: Math.min(o.degree ?? 5, samples.length - 1), interpolationAlgorithm: C.LagrangePolynomialApproximation });
      for (const [ms, p] of samples) property.addSample(C.JulianDate.fromDate(new Date(ms)), world(p));
      // Before its first sample and after its last, an object holds still.
      property.forwardExtrapolationType = C.ExtrapolationType.HOLD;
      property.backwardExtrapolationType = C.ExtrapolationType.HOLD;
      return property;
    };
    for (const item of items) {
      const o = item.o;
      if (item.kind === 'line') for (const run of clipPolyline(item.pts)) lines.add({ positions: run.map(world), width: o.width ?? 2, material: lineMaterial(o) });
      else if (item.kind === 'track' && clipping) for (const run of clipPolyline(item.samples.map((q) => q[1]))) lines.add({ positions: run.map(world), width: o.width ?? 2, material: lineMaterial(o) });
      else if (item.kind === 'track') {
        // CesiumJS interpolates the samples for display, as its path visualizer does.
        const property = new C.SampledPositionProperty();
        property.setInterpolationOptions({ interpolationDegree: Math.min(7, item.samples.length - 1), interpolationAlgorithm: C.LagrangePolynomialApproximation });
        const t0 = C.JulianDate.fromDate(new Date(0));
        for (const [t, p] of item.samples) property.addSample(C.JulianDate.addSeconds(t0, t, new C.JulianDate()), world(p));
        const per = o.subdivide ?? 8, dense = [];
        for (let i = 0; i < item.samples.length - 1; i++) for (let q = 0; q < per; q++) {
          const t = item.samples[i][0] + ((item.samples[i + 1][0] - item.samples[i][0]) * q) / per;
          const p = property.getValue(C.JulianDate.addSeconds(t0, t, new C.JulianDate()));
          if (p) dense.push(p);
        }
        dense.push(world(item.samples.at(-1)[1]));
        lines.add({ positions: dense, width: o.width ?? 2, material: lineMaterial(o) });
      } else if (item.kind === 'point') {
        if (!inside(item.p)) continue;
        points.add({ position: world(item.p), pixelSize: o.size ?? 8, color: color(o.color ?? 'sat', o.alpha), outlineColor: colors.bg, outlineWidth: o.outline ?? 2,
          disableDepthTestDistance: o.overlay ? Number.POSITIVE_INFINITY : undefined });
      } else if (item.kind === 'label') { if (inside(item.p)) labels.add({ position: world(item.p), ...labelOptions(item.text, o) }); }
      else if (item.kind === 'solid') {
        if (item.shape === 'cylinder' && clipping) {
          // A cylinder keeps the part of its axis inside the box.
          const axis = item.axes[2], a = v3.sub(item.center, axis), b = v3.add(item.center, axis), seg = clipSegment(a, b);
          if (!seg) continue;
          const half = v3.scale(v3.sub(seg[1], seg[0]), 0.5);
          solid({ ...item, center: v3.scale(v3.add(seg[0], seg[1]), 0.5), axes: [item.axes[0], item.axes[1], half] });
        } else if (inside(item.center)) solid(item);
      }
      else if (item.kind === 'earth') {
        const geometry = new C.EllipsoidOutlineGeometry({ radii: new C.Cartesian3(EARTH_KM, EARTH_KM, EARTH_KM), stackPartitions: 12, slicePartitions: 24, subdivisions: 128 });
        solids.add(new C.Primitive({
          geometryInstances: new C.GeometryInstance({ geometry, modelMatrix: affine([0, 0, 0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]),
            attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color(o.color ?? colors.earth, o.alpha)) } }),
          appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true, renderState: { lineWidth: 1 } }), asynchronous: false,
        }));
      } else if (item.kind === 'moving') {
        const span = (item.samples.at(-1)[0] - item.samples[0][0]) / 1000;
        // In a clipped box an object shows only while it is inside.
        let show = true;
        if (clipping) {
          show = new C.TimeIntervalCollectionProperty();
          item.samples.forEach(([ms, p], j) => {
            const next = item.samples[j + 1];
            show.intervals.addInterval(new C.TimeInterval({ start: C.JulianDate.fromDate(new Date(ms)), stop: C.JulianDate.fromDate(new Date(next ? next[0] : ms)),
              isStopIncluded: !next, data: inside(p) && (!next || inside(next[1])) }));
          });
        }
        viewer.entities.add({
          position: sampled(item.samples, o),
          point: { show, pixelSize: o.size ?? 10, color: color(o.color ?? 'accent'), outlineColor: colors.bg, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: o.label ? { show, ...labelOptions(o.label, { color: o.labelColor ?? o.color, ...o.labelOptions }) } : undefined,
          path: o.trail === false || clipping ? undefined : { leadTime: o.lead ?? 0, trailTime: o.trailTime ?? span, width: o.trail ?? 2.5, resolution: Math.max(1, (o.resolution ?? span / 600)),
            material: o.dash ? new C.PolylineDashMaterialProperty({ color: color(o.color ?? 'accent', o.trailAlpha) }) : color(o.color ?? 'accent', o.trailAlpha) },
        });
      } else if (item.kind === 'vector') {
        const from = Array.isArray(item.from[0]) && item.from[0].length === 2 && Array.isArray(item.from[0][1]) ? sampled(item.from) : new C.ConstantPositionProperty(world(item.from));
        viewer.entities.add({ polyline: { positions: new C.PositionPropertyArray([from, sampled(item.samples, o)]), width: o.width ?? 3,
          material: o.arrow === false ? color(o.color ?? 'text', o.alpha) : new C.PolylineArrowMaterialProperty(color(o.color ?? 'text', o.alpha)) } });
      } else if (item.kind === 'movingEllipsoid') {
        const radii = new C.SampledProperty(C.Cartesian3), orientation = new C.SampledProperty(C.Quaternion);
        for (const [ms, , axes] of item.samples) {
          // The ellipsoid's image under the box's axis scales: the principal
          // axes of S (Σ aᵢaᵢᵀ) S, which stay orthogonal whatever S is.
          const M = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => axes.reduce((sum, a) => sum + a[i] * a[j], 0) * k[i] * k[j]));
          const w = covarianceAxes(M).map((a) => new C.Cartesian3(...a)), r = w.map((a) => Math.max(C.Cartesian3.magnitude(a), 1e-3));
          const u = w.map((a, i) => C.Cartesian3.divideByScalar(a, r[i], new C.Cartesian3()));
          if (C.Cartesian3.dot(C.Cartesian3.cross(u[0], u[1], new C.Cartesian3()), u[2]) < 0) C.Cartesian3.negate(u[2], u[2]);
          const m3 = new C.Matrix3(u[0].x, u[1].x, u[2].x, u[0].y, u[1].y, u[2].y, u[0].z, u[1].z, u[2].z);
          const time = C.JulianDate.fromDate(new Date(ms));
          radii.addSample(time, new C.Cartesian3(...r));
          orientation.addSample(time, C.Quaternion.fromRotationMatrix(m3));
        }
        viewer.entities.add({ position: sampled(item.samples.map((q) => [q[0], q[1]]), { degree: 1 }), orientation,
          ellipsoid: { radii, material: color(o.color ?? 'accent', o.alpha ?? 0.35), outline: o.outline ?? true, outlineColor: color(o.outlineColor ?? o.color ?? 'accent', 0.7), slicePartitions: 48, stackPartitions: 32 } });
      }
    }

    // A general affine map of a unit shape: centre, and three semi-axis vectors (data units).
    function affine(centerData, axes) {
      const w = axes.map(linear), c = world(centerData);
      return new C.Matrix4(w[0].x, w[1].x, w[2].x, c.x, w[0].y, w[1].y, w[2].y, c.y, w[0].z, w[1].z, w[2].z, c.z, 0, 0, 0, 1);
    }
    function solid(item) {
      const o = item.o, model = affine(item.center, item.axes);
      const geometry = item.shape === 'box' ? C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(2, 2, 2), vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT })
        : item.shape === 'cylinder' ? new C.CylinderGeometry({ length: 2, topRadius: 1, bottomRadius: 1, slices: 48, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT })
          : new C.EllipsoidGeometry({ radii: new C.Cartesian3(1, 1, 1), stackPartitions: 48, slicePartitions: 64, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT });
      const fill = color(o.color, o.alpha ?? 0.35);
      solids.add(new C.Primitive({
        geometryInstances: new C.GeometryInstance({ geometry, modelMatrix: model, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(fill) } }),
        appearance: new C.PerInstanceColorAppearance({ translucent: fill.alpha < 1, closed: true, flat: !!o.flat }),
        asynchronous: false,
      }));
      if (o.outline) {
        const outlineGeometry = item.shape === 'box' ? C.BoxOutlineGeometry.fromDimensions({ dimensions: new C.Cartesian3(2, 2, 2) })
          : item.shape === 'cylinder' ? new C.CylinderOutlineGeometry({ length: 2, topRadius: 1, bottomRadius: 1, numberOfVerticalLines: 0 })
            : new C.EllipsoidOutlineGeometry({ radii: new C.Cartesian3(1, 1, 1), stackPartitions: 6, slicePartitions: 8, subdivisions: 96 });
        solids.add(new C.Primitive({
          geometryInstances: new C.GeometryInstance({ geometry: outlineGeometry, modelMatrix: model, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color(o.outlineColor ?? o.color, o.outlineAlpha ?? 0.7)) } }),
          appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true, renderState: { lineWidth: 1 } }),
          asynchronous: false,
        }));
      }
    }

    // 5. The clock, when anything moves.
    const moving = items.some((i) => ['moving', 'vector', 'movingEllipsoid'].includes(i.kind));
    timeSpan = null;
    timeRow.hidden = true;
    if (moving || options.time) {
      const all = items.flatMap((i) => (i.samples ?? []).map((q) => q[0])).filter(Number.isFinite);
      const startMs = options.time?.startMs ?? Math.min(...all), stopMs = options.time?.stopMs ?? Math.max(...all);
      const format = options.time?.format ?? ((ms) => `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')} UTC`);
      timeSpan = { startMs, stopMs, format };
      viewer.clock.startTime = C.JulianDate.fromDate(new Date(startMs));
      viewer.clock.stopTime = C.JulianDate.fromDate(new Date(stopMs));
      viewer.clock.clockRange = C.ClockRange.CLAMPED;
      viewer.clock.shouldAnimate = false;
      slider.min = String(startMs); slider.max = String(stopMs); slider.step = String(Math.max(1, (stopMs - startMs) / 2000));
      timeRow.hidden = false;
      const now = ctx.time?.get?.();
      const initial = options.time?.ms ?? (Number.isFinite(now) && now >= startMs && now <= stopMs ? now : stopMs);
      if (ctx.time) ctx.time.set(initial); else timeListener(initial);
      timeListener(initial);
    }

    // 6. The camera: the scene's preset or direction, about the box centre.
    const v = s._view ?? {};
    const radius = 0.5 * Math.hypot(...span.map((d, i) => d * k[i])) * 1.04;
    framing = { center: centerWorld, radius, direction: v.direction ?? PRESETS[v.preset ?? '3d'], preset: v.direction ? null : v.preset ?? '3d', margin: v.margin };
    setView(v.direction ? null : framing.preset);
    shown = '';
    chosen();

    legend.replaceChildren(...(options.legend ?? []).map(([c, text, style]) => h('li', {}, h('i', { class: style ?? 'line', style: `--swatch: ${color(c).toCssColorString()}` }), text)));
    legend.hidden = legend.childElementCount === 0;
    settle();
    // A few frames before the model reports done.
    await new Promise((resolve) => {
      let frames = 0;
      const off = scene.postRender.addEventListener(() => { if (++frames >= 3) { off(); resolve(); } });
      setTimeout(() => { off(); resolve(); }, 3000);
      scene.requestRender();
    });
  }

  return { draw, figure, setView: (name) => setView(name) };
}

// Limits [lo, hi] on multiples of a given step (equal-aspect boxes).
function axisLimitsStep(min, max, step) {
  // Limits already on a multiple stay there.
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let k = Math.round(lo / step); k <= Math.round(hi / step); k++) ticks.push(k * step);
  return { lo, hi, step, ticks, format: tickFormat(step) };
}
// The eight corners of a solid, for the box's extent.
function corners(center, axes) {
  const out = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
    out.push(v3.add(center, v3.add(v3.add(v3.scale(axes[0], a), v3.scale(axes[1], b)), v3.scale(axes[2], c))));
  }
  return out;
}
