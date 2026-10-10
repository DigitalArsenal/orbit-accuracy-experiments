// A segment's fixed attributes (regime, integrator) and the default
// hypothesis's residual fingerprint: shared by the synthetic and operator
// steps so both are read the same way. Routing and statistics only.
import { defaultFor } from './hypothesis.mjs';
import { fitPositions, integratorFor, propagate, scoreHypothesis, thin } from './fit.mjs';
import { fingerprint, sunDirections } from './fingerprint.mjs';

const R_EARTH = 6378137;

// Regime facts from the published positions: drag applies below the
// configured altitude (perigee), the integrator follows the period.
export function prepare(segment, settings) {
  const radii = segment.points.map((p) => Math.hypot(...p.position));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  return { ...segment, drag: Math.min(...radii) - R_EARTH < settings.gauntlet.dragBelowKm * 1000, integrator: integratorFor(settings, mean) };
}

// The default hypothesis of a prepared segment: full force on its labels,
// drag only where it applies.
export const defaultOf = (segment) => ({ ...defaultFor(segment.label), ...(segment.drag ? {} : { atmosphere: 'NONE' }) });

// Fit h, then the fingerprint of its residuals on at most maxPoints points.
export async function scoreWithFingerprint(env, h, segment, settings, start = {}) {
  const points = await env.toGcrf(segment.points, segment.label, h);
  const s = await scoreHypothesis(env, h, segment, points, settings, { start, keepResiduals: true });
  const idx = thin(points.map((_, k) => k), settings.fingerprintPoints);
  const sel = idx.map((k) => points[k]);
  const axes = [];
  for (const k of idx) axes.push(await env.rtnAxes(points[k].epoch, s.states[k]));
  const fp = fingerprint({
    points: sel, residuals: idx.map((k) => s.residuals[k]), states: idx.map((k) => s.states[k]), axes,
    sunDirs: await sunDirections(env, sel), midMs: (points[0].ms + points.at(-1).ms) / 2, scores: s,
  });
  const { residuals, states, ...scores } = s;
  return { scores, fingerprint: fp };
}

// Maneuver screen (PLAN.md section 9): the default hypothesis fitted to
// consecutive windows; a window is flagged when its fit RMS over every point
// exceeds the regime's floor or a listed event (ISS) falls within it. Returns
// the clean chunks [{fromMs, toMs}] of the segment, each up to `max` days and
// at least `min`, at most `limit` of them, and the window record.
export async function screen(env, segment, settings, operators, { limit = 1 } = {}) {
  const cls = segment.drag ? 'LEO' : 'HIGH';
  const { windowHours, floorM } = operators.screen[cls], days = operators.segmentDays[cls];
  const h = defaultOf(segment);
  const points = await env.toGcrf(segment.points, segment.label, h);
  const t0 = points[0].ms, t1 = points.at(-1).ms, W = windowHours * 3600000;
  const events = (segment.meta?.events ?? []).map((e) => Date.parse(e.tig));
  const margin = operators.screen.eventMarginMinutes * 60000;
  const windows = [], chunks = [];
  let runStart = null;
  for (let a = t0; a + W <= t1 + 1; a += W) {
    const inWin = points.filter((p) => p.ms >= a && p.ms <= a + W);
    let rmsM = null, flag = events.some((e) => e >= a - margin && e <= a + W + margin) ? 'event' : null;
    if (!flag && inWin.length >= 8) {
      try {
        const fitted = await fitPositions(env, h, segment, thin(inWin, settings.maxFitPoints), settings);
        const later = inWin.slice(1);
        const s = await propagate(env, h, segment, { epoch: fitted.epoch, state: fitted.state }, fitted.coefficients, later.map((p) => p.epoch), { integrator: segment.integrator });
        rmsM = Math.sqrt(s.reduce((acc, x, k) => acc + (x.state[0] - later[k].position[0]) ** 2 + (x.state[1] - later[k].position[1]) ** 2 + (x.state[2] - later[k].position[2]) ** 2, 0) / later.length);
        if (rmsM > floorM) flag = 'residual';
      } catch (error) { flag = `fit-error: ${String(error.message).slice(0, 80)}`; }
    }
    windows.push({ from: new Date(a).toISOString(), rmsM, flag });
    if (flag) { runStart = null; continue; }
    runStart ??= a;
    if (a + W - runStart >= days.max * 86400000 - 1) { chunks.push({ fromMs: runStart, toMs: runStart + days.max * 86400000 }); runStart = null; if (chunks.length >= limit) break; }
  }
  if (chunks.length < limit && runStart !== null) {
    const end = Math.min(t1, windows.length ? Date.parse(windows.at(-1).from) + W : t1);
    if (end - runStart >= days.min * 86400000) chunks.push({ fromMs: runStart, toMs: end });
  }
  return { chunks, windows };
}

// The published points of a chunk, as a segment of their own.
export const chunkOf = (segment, chunk) => ({ ...segment, points: segment.points.filter((p) => { const t = Date.parse(p.epoch); return t >= chunk.fromMs - 1 && t <= chunk.toMs + 1; }) });
