// The 3D view of a model page: one CesiumJS widget (vendored, no ion), made
// when the model first draws and destroyed when the page goes away. Models
// hand it what the modules computed; this file only draws.
//
//   const view = scene3d(ctx, { title, caption, earth: true });
//   await view.draw((s) => { s.line(points); s.point(p, { label: 'r' }); }, { frame: 'GCRF', epochMs });
//
// Every view is still: no animation and no camera flights, so reduced
// motion needs nothing more. Earth scenes take kilometres in the frame named (GCRF or TEME) and show
// them against the Earth as it was oriented at epochMs (CesiumJS's IAU 2006
// tables for GCRF, its TEME-to-pseudo-fixed rotation for TEME). Abstract
// scenes (earth: false) take plain units with z up.
import { siteUrl } from '../modules.js';
import { h } from './ui.js';

const SPACE_ORIGIN = [0, 0, 2.0e7];  // abstract scenes sit far from the hidden Earth
const UNIT = 1000;                   // metres per abstract unit
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
  return {
    light,
    accent: token('--accent', '#f5a524'), cyan: token('--cyan', '#59d9ff'), text: token('--text', '#f5f5f7'),
    muted: token('--muted', '#8e8e93'), alert: token('--alert', '#ff3b30'), sat: light ? C.Color.fromCssColorString('#3a4a5c') : token('--sat', '#b3e0ff'),
    bg: C.Color.fromCssColorString(light ? '#eef0f4' : '#030508'),
    grid: C.Color.fromCssColorString(light ? '#1d1d1f' : '#f5f5f7').withAlpha(light ? 0.12 : 0.1),
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
// A power-of-ten magnification that shows `size` as about `target`, and its label.
export function magnification(size, target) {
  const k = 10 ** Math.round(Math.log10(target / Math.max(size, 1e-30)));
  const exp = Math.round(Math.log10(k));
  const sup = String(exp).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  return { k, label: k === 1 ? 'true scale' : Math.abs(exp) <= 3 ? `×${k.toLocaleString('en-US')}` : `×10${sup}` };
}

export function scene3d(ctx, { title, caption, earth = true, after = null } = {}) {
  const box = h('div', { class: 'scene', role: 'img', 'aria-label': title });
  const legend = h('ul', { class: 'scene-legend' });
  const captionNode = h('span', {}, caption ?? '');
  const reset = h('button', { type: 'button', class: 'scene-button', title: 'Reset the view', 'aria-label': 'Reset the view', onclick: () => frameCamera() }, '⟲');
  const explore = h('button', { type: 'button', class: 'scene-explore', hidden: true, onclick: () => { setInputs(true); explore.hidden = true; } }, 'Tap to explore in 3D');
  const figure = h('figure', { class: 'chart-card scene-card' }, h('figcaption', {}, h('strong', {}, title), captionNode),
    h('div', { class: 'scene-frame' }, box, reset, explore), legend);
  if (after) after.after(figure); else ctx.root.append(figure);
  loadCesium().catch(() => {});

  let widget = null, last = null, framing = null, pending = Promise.resolve();
  const setInputs = (on) => { if (widget) widget.scene.screenSpaceCameraController.enableInputs = on; };

  async function create(C) {
    const options = {
      skyBox: false, requestRenderMode: true, maximumRenderTimeChange: Infinity, scene3DOnly: true,
      useBrowserRecommendedResolution: false, creditContainer: h('div'), msaaSamples: 4,
      contextOptions: { webgl: { alpha: false, antialias: true, powerPreference: 'low-power' } },
    };
    if (earth) options.baseLayer = new C.ImageryLayer(await C.SingleTileImageryProvider.fromUrl(siteUrl('./vendor/earth/day.webp')));
    else { options.globe = false; options.skyAtmosphere = false; }
    widget = new C.CesiumWidget(box, options);
    widget.resolutionScale = Math.min(1, 2 / (window.devicePixelRatio || 1));
    const scene = widget.scene;
    scene.fog.enabled = false;
    if (earth) {
      scene.globe.showGroundAtmosphere = true;
      scene.globe.enableLighting = false;
      scene.globe.depthTestAgainstTerrain = true;
      scene.screenSpaceCameraController.minimumZoomDistance = 50;
    }
    scene.light = new C.DirectionalLight({ direction: C.Cartesian3.normalize(new C.Cartesian3(-0.3, -0.5, -0.8), new C.Cartesian3()), intensity: 2.2 });
    if (coarsePointer()) { setInputs(false); explore.hidden = false; }
  }

  function destroy() {
    if (widget && !widget.isDestroyed()) widget.destroy();
    widget = null;
    box.replaceChildren();
  }
  addEventListener('pagehide', destroy);
  addEventListener('pageshow', (event) => { if (event.persisted && last) draw(last.build, last.options); });
  new MutationObserver(() => { if (widget && last) draw(last.build, last.options); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function frameCamera() {
    if (!widget || !framing) return;
    const C = window.Cesium, camera = widget.scene.camera;
    const { center, radius, direction } = framing;
    const frustum = camera.frustum;
    const aspect = widget.canvas.clientWidth / Math.max(1, widget.canvas.clientHeight);
    const fov = frustum.fov ?? Math.PI / 3;
    const half = aspect >= 1 ? Math.atan(Math.tan(fov / 2) / aspect) : fov / 2;
    const range = (radius / Math.sin(half)) * (framing.margin ?? 1.1);
    const d = C.Cartesian3.normalize(new C.Cartesian3(...direction), new C.Cartesian3());
    camera.lookAtTransform(C.Matrix4.fromTranslation(new C.Cartesian3(...center)), C.Cartesian3.multiplyByScalar(d, range, new C.Cartesian3()));
    widget.scene.requestRender();
  }

  // Draw a scene. build(s) adds what to show; options: {frame: 'GCRF'|'TEME',
  // epochMs, legend: [[color name, text]], caption, view: {direction, center, radius}}.
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
    if (!widget) {
      box.replaceChildren();
      await create(C);
    }
    const scene = widget.scene, colors = palette(C);
    scene.backgroundColor = colors.bg;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = earth;
    if (earth) scene.globe.baseColor = colors.bg;
    scene.primitives.removeAll();
    if (options.caption !== undefined) captionNode.textContent = options.caption;

    // GCRF or TEME kilometres → Earth-fixed metres at the epoch.
    let rotation = C.Matrix3.IDENTITY;
    if (earth && options.epochMs !== undefined) {
      const time = C.JulianDate.fromDate(new Date(options.epochMs));
      if (options.frame === 'TEME') rotation = C.Transforms.computeTemeToPseudoFixedMatrix(time);
      else {
        await C.Transforms.preloadIcrfFixed(new C.TimeInterval({ start: time, stop: C.JulianDate.addSeconds(time, 60, new C.JulianDate()) }));
        rotation = C.Transforms.computeIcrfToFixedMatrix(time) ?? C.Transforms.computeTemeToPseudoFixedMatrix(time);
      }
    }
    const rotate = (p) => { const r = C.Matrix3.multiplyByVector(rotation, new C.Cartesian3(p[0], p[1], p[2]), new C.Cartesian3()); return [r.x, r.y, r.z]; };
    const world = earth
      ? (p) => { const r = rotate(p); return new C.Cartesian3(r[0] * 1000, r[1] * 1000, r[2] * 1000); }
      : (p) => new C.Cartesian3(SPACE_ORIGIN[0] + p[0] * UNIT, SPACE_ORIGIN[1] + p[1] * UNIT, SPACE_ORIGIN[2] + p[2] * UNIT);
    const axisWorld = earth ? (a) => { const r = rotate(a); return new C.Cartesian3(r[0] * 1000, r[1] * 1000, r[2] * 1000); } : (a) => new C.Cartesian3(a[0] * UNIT, a[1] * UNIT, a[2] * UNIT);
    const extent = [];  // world points the camera frames

    const lines = scene.primitives.add(new C.PolylineCollection());
    const points = scene.primitives.add(new C.PointPrimitiveCollection());
    const solids = scene.primitives.add(new C.PrimitiveCollection());
    const labels = scene.primitives.add(new C.LabelCollection({ scene }));
    const color = (c, alpha) => {
      const base = typeof c === 'string' ? (colors[c] ?? C.Color.fromCssColorString(c)) : (c ?? colors.accent);
      return alpha === undefined ? base : base.withAlpha(alpha);
    };
    const outline = colors.bg;

    const s = {
      C, colors, earth,
      color,
      // A polyline through points; {color, alpha, width, dash, arrow, glow, close, frame: false}.
      line(pts, o = {}) {
        if (pts.length < 2) return null;
        const positions = pts.map(world);
        if (o.close) positions.push(positions[0]);
        if (o.frame !== false) extent.push(...positions);
        const c = color(o.color, o.alpha);
        const material = o.arrow ? C.Material.fromType('PolylineArrow', { color: c })
          : o.dash ? C.Material.fromType('PolylineDash', { color: c, dashLength: o.dashLength ?? 12 })
            : o.glow ? C.Material.fromType('PolylineGlow', { color: c, glowPower: 0.18, taperPower: 1 })
              : C.Material.fromType('Color', { color: c });
        return lines.add({ positions, width: o.width ?? 2, material });
      },
      arrow(from, to, o = {}) { return s.line([from, to], { width: 9, ...o, arrow: true }); },
      // A smooth curve through time-ordered samples, interpolated for display
      // by CesiumJS (as its path visualizer does): samples [[t, [x, y, z]]].
      track(samples, o = {}) {
        if (samples.length < 3) return s.line(samples.map((q) => q[1]), o);
        const property = new C.SampledPositionProperty();
        property.setInterpolationOptions({ interpolationDegree: Math.min(7, samples.length - 1), interpolationAlgorithm: C.LagrangePolynomialApproximation });
        const t0 = C.JulianDate.fromDate(new Date(0));
        for (const [t, p] of samples) property.addSample(C.JulianDate.addSeconds(t0, t, new C.JulianDate()), new C.Cartesian3(...p));
        const per = o.subdivide ?? 8, dense = [];
        for (let i = 0; i < samples.length - 1; i++) for (let k = 0; k < per; k++) {
          const t = samples[i][0] + ((samples[i + 1][0] - samples[i][0]) * k) / per;
          const p = property.getValue(C.JulianDate.addSeconds(t0, t, new C.JulianDate()));
          if (p) dense.push([p.x, p.y, p.z]);
        }
        dense.push(samples.at(-1)[1]);
        return s.line(dense, o);
      },
      point(p, o = {}) {
        const position = world(p);
        if (o.frame !== false) extent.push(position);
        points.add({ position, pixelSize: o.size ?? 8, color: color(o.color ?? 'sat', o.alpha), outlineColor: outline, outlineWidth: o.outline ?? 2 });
        if (o.label) s.label(p, o.label, { color: o.labelColor ?? o.color, ...o.labelOptions });
        return position;
      },
      // Text at a point: {color, size, dx, dy, align: 'left'|'right'|'center', above, frame}.
      label(p, text, o = {}) {
        const position = world(p);
        if (o.frame) extent.push(position);
        const align = o.align ?? 'left';
        return labels.add({
          position, text, font: `${o.weight ?? 600} ${o.size ?? 12}px ${getComputedStyle(document.body).getPropertyValue('--sans') || 'sans-serif'}`,
          fillColor: color(o.color ?? 'text'), outlineColor: outline, outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: align === 'right' ? C.HorizontalOrigin.RIGHT : align === 'center' ? C.HorizontalOrigin.CENTER : C.HorizontalOrigin.LEFT,
          verticalOrigin: o.above ? C.VerticalOrigin.BOTTOM : C.VerticalOrigin.CENTER,
          pixelOffset: new C.Cartesian2(o.dx ?? (align === 'left' ? 9 : align === 'right' ? -9 : 0), o.dy ?? (o.above ? -8 : 0)),
          disableDepthTestDistance: o.overlay === false ? undefined : Number.POSITIVE_INFINITY,
        });
      },
      // An ellipsoid from its three semi-axis vectors (scene units).
      ellipsoid(center, axes, o = {}) { return solid('ellipsoid', center, axes, o); },
      sphere(center, radius, o = {}) { return solid('ellipsoid', center, [[radius, 0, 0], [0, radius, 0], [0, 0, radius]], o); },
      // A flat disc spanned by two semi-axis vectors.
      disc(center, u, v, o = {}) {
        const n = v3.scale(v3.unit(v3.cross(u, v)), Math.max(v3.norm(u), v3.norm(v)) * 1e-3);
        return solid('ellipsoid', center, [u, v, n], { flat: true, ...o });
      },
      // An ellipse outline spanned by two semi-axis vectors.
      ring(center, u, v, o = {}) {
        const n = o.segments ?? 96;
        return s.line(Array.from({ length: n }, (_, k) => {
          const a = (2 * Math.PI * k) / n;
          return v3.add(center, v3.add(v3.scale(u, Math.cos(a)), v3.scale(v, Math.sin(a))));
        }), { ...o, close: true });
      },
      // A cylinder of radius r from a to b.
      cylinder(a, b, r, o = {}) {
        const axis = v3.sub(b, a), z = v3.unit(axis);
        const x = v3.unit(Math.abs(z[0]) < 0.9 ? v3.cross(z, [1, 0, 0]) : v3.cross(z, [0, 1, 0])), y = v3.cross(z, x);
        return solid('cylinder', v3.scale(v3.add(a, b), 0.5), [v3.scale(x, r), v3.scale(y, r), v3.scale(z, v3.norm(axis) / 2)], o);
      },
      // An axis-aligned box: center, [dx, dy, dz] full sizes.
      box(center, size, o = {}) { return solid('box', center, [[size[0] / 2, 0, 0], [0, size[1] / 2, 0], [0, 0, size[2] / 2]], o); },
      // Three labeled axes from an origin.
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
          s.line([v3.add(center, v3.add(v3.scale(v, x), v3.scale(u, -half))), v3.add(center, v3.add(v3.scale(v, x), v3.scale(u, half)))], { color: colors.grid, width: 1, frame: o.frame ?? false });
        }
      },
      // An error history as a trail in the RTN axes at `anchor`: items
      // [{c: [radial, in-track, cross-track] (scene units), label}], magnified k.
      trail(anchor, basis, items, k, o = {}) {
        const pts = items.map((it) => v3.add(anchor, fromRtn(basis, v3.scale(it.c, k))));
        const reach = Math.max(...pts.map((p) => v3.norm(v3.sub(p, anchor))), 1e-9);
        s.axes(anchor, basis, reach * 1.15, ['Radial', 'In-track', 'Cross-track'], { color: 'muted', alpha: 0.8 });
        s.line([anchor, ...pts], { color: o.color ?? 'text', width: o.width ?? 2.5 });
        items.forEach((it, i) => { if (it.label) s.point(pts[i], { color: o.color ?? 'text', size: 6, outline: 1, label: it.label, labelColor: o.color ?? 'text' }); });
        return pts;
      },
      // A 1σ covariance (RTN, scene units²) as an ellipsoid at `anchor`,
      // magnified k; its two shorter axes also ×thin, directions kept.
      covariance(anchor, basis, Prtn, k, o = {}) {
        const axes = covarianceAxes(Prtn).sort((a, b) => v3.norm(b) - v3.norm(a));
        return s.ellipsoid(anchor, axes.map((a, i) => fromRtn(basis, v3.scale(a, k * (i ? o.thin ?? 1 : 1)))), o);
      },
      earthRadiusKm: EARTH_KM,
      // An Earth-fixed vector (as the globe is drawn) in the scene's frame.
      fromFixed(p) { const r = C.Matrix3.multiplyByVector(C.Matrix3.transpose(rotation, new C.Matrix3()), new C.Cartesian3(p[0], p[1], p[2]), new C.Cartesian3()); return [r.x, r.y, r.z]; },
      // Frame the camera: {direction (scene axes, from the subject toward the
      // camera), center, radius (scene units), includeEarth}.
      view(v) { s._view = v; },
    };

    function solid(kind, center, axes, o) {
      const R = axes.map(axisWorld);
      const radii = R.map((a) => Math.max(C.Cartesian3.magnitude(a), 1e-3));
      const cols = R.map((a, k) => C.Cartesian3.divideByScalar(a, radii[k], new C.Cartesian3()));
      const m3 = new C.Matrix3(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z);
      const centerWorld = world(center);
      const model = C.Matrix4.multiplyByScale(C.Matrix4.fromRotationTranslation(m3, centerWorld), new C.Cartesian3(...radii), new C.Matrix4());
      if (o.frame !== false) for (const a of R) for (const sign of [1, -1]) extent.push(C.Cartesian3.add(centerWorld, C.Cartesian3.multiplyByScalar(a, sign, new C.Cartesian3()), new C.Cartesian3()));
      const geometry = kind === 'box' ? C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(2, 2, 2), vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT })
        : kind === 'cylinder' ? new C.CylinderGeometry({ length: 2, topRadius: 1, bottomRadius: 1, slices: 48, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT })
          : new C.EllipsoidGeometry({ radii: new C.Cartesian3(1, 1, 1), stackPartitions: 48, slicePartitions: 64, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT });
      const fill = color(o.color, o.alpha ?? 0.35);
      solids.add(new C.Primitive({
        geometryInstances: new C.GeometryInstance({ geometry, modelMatrix: model, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(fill) } }),
        appearance: new C.PerInstanceColorAppearance({ translucent: fill.alpha < 1, closed: true, flat: !!o.flat }),
        asynchronous: false,
      }));
      if (o.outline) {
        const outlineGeometry = kind === 'box' ? C.BoxOutlineGeometry.fromDimensions({ dimensions: new C.Cartesian3(2, 2, 2) })
          : kind === 'cylinder' ? new C.CylinderOutlineGeometry({ length: 2, topRadius: 1, bottomRadius: 1, numberOfVerticalLines: 0 })
            : new C.EllipsoidOutlineGeometry({ radii: new C.Cartesian3(1, 1, 1), stackPartitions: 6, slicePartitions: 8, subdivisions: 96 });
        solids.add(new C.Primitive({
          geometryInstances: new C.GeometryInstance({ geometry: outlineGeometry, modelMatrix: model, attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(color(o.outlineColor ?? o.color, o.outlineAlpha ?? 0.7)) } }),
          appearance: new C.PerInstanceColorAppearance({ flat: true, translucent: true, renderState: { lineWidth: 1 } }),
          asynchronous: false,
        }));
      }
    }

    await build(s);

    // Frame what was drawn.
    const v = s._view ?? {};
    let center, radius;
    if (v.center && v.radius) { center = world(v.center); radius = v.radius * (earth ? 1000 : UNIT); }
    else {
      const sphere = C.BoundingSphere.fromPoints(extent.length ? extent : [world([0, 0, 0])]);
      const withEarth = earth && v.includeEarth !== false ? C.BoundingSphere.union(sphere, new C.BoundingSphere(C.Cartesian3.ZERO, EARTH_KM * 1000)) : sphere;
      center = withEarth.center; radius = Math.max(withEarth.radius, earth ? 1 : 0.01 * UNIT);
    }
    // From an orbit normal: tilted off it, so the plane reads as an ellipse.
    if (!v.direction && v.normal) {
      const n = v3.unit(v.normal);
      const e = v3.norm(v3.cross([0, 0, 1], n)) > 1e-3 ? v3.unit(v3.cross([0, 0, 1], n)) : [1, 0, 0];
      // A low orbit seen near face-on hides behind the Earth: tip it toward edge-on.
      const reach = C.BoundingSphere.fromPoints(extent).radius / (EARTH_KM * 1000);
      const tilt = v.tilt ?? (reach < 1.6 ? 1.18 : 0.45);
      v.direction = v3.unit(v3.add(v3.scale(n, Math.cos(tilt)), v3.scale(e, -Math.sin(tilt))));
    }
    const direction = v.direction ? axisWorld(v.direction) : earth ? new C.Cartesian3(0.55, -0.6, 0.58) : new C.Cartesian3(0.6, -1, 0.75);
    framing = { center: [center.x, center.y, center.z], radius, direction: [direction.x, direction.y, direction.z], margin: v.margin };
    frameCamera();

    legend.replaceChildren(...(options.legend ?? []).map(([c, text, style]) => h('li', {}, h('i', { class: style ?? 'line', style: `--swatch: ${color(c).toCssColorString()}` }), text)));
    legend.hidden = legend.childElementCount === 0;
    scene.requestRender();
    // One frame before the model reports done.
    await new Promise((resolve) => {
      const off = scene.postRender.addEventListener(() => { off(); resolve(); });
      setTimeout(() => { off(); resolve(); }, 3000);
      scene.requestRender();
    });
  }

  return { draw, figure };
}
