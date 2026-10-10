// A segment's fixed attributes (regime, integrator) and the default
// hypothesis's residual fingerprint: shared by the synthetic and operator
// steps so both are read the same way. Routing and statistics only.
import { defaultFor } from './hypothesis.mjs';
import { integratorFor, scoreHypothesis, thin } from './fit.mjs';
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
