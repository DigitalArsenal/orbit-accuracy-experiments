// The worked examples whose reference comes from a source that may not be redistributed: no stated license, a non-commercial license, or terms that bind
// each recipient. SpaceX is not here: the owner ruled its numbers public on 2026-11-01. The same list as the sdn-ap site's tools/compare/licensed.mjs.
// compare-examples-publish.mjs writes these in the AP-only form: AP's track in km, GCRF, Float64, 3 per time; then for each name in `errors`, Float32
// distance from the reference in meters, 1 per time; then Float32 rotations in-track, cross-track, radial to GCRF from AP's own track, x, y, z, w per
// time (little endian). The JSON says center "AP", errors (the forecasts in block order) and referenceDrawn false, and has no offsets list. No other
// forecast's position and no offset vector is in the file, so no reference position can be computed from it (compare-examples-proof.mjs).
import { axesAt } from './steps.mjs';

export const NOT_REDRAWN = new Set(['ESA', 'ESA navigation', 'ESA ultra-rapid', 'Intelsat', 'SES', 'China Space Station', 'Planet (Flock)']);

/** An example published in the AP-only form: its provider is licensed, or its reference is not drawn. */
export const licensed = (d) => NOT_REDRAWN.has(d.provider) || d.referenceDrawn === false;

/** The rotation from a track's axes in-track, cross-track, radial to GCRF at each time, Float32 quaternions x, y, z, w. The site reads these and builds no axes of its own. */
export function framesOf(track, count) {
  const out = new Float32Array(4 * count);
  for (let i = 0; i < count; i += 1) {
    const { R, I, C } = axesAt(track, count, i);
    const m00 = I[0], m10 = I[1], m20 = I[2], m01 = C[0], m11 = C[1], m21 = C[2], m02 = R[0], m12 = R[1], m22 = R[2], t = m00 + m11 + m22;
    let x, y, z, w;
    if (t > 0) { const s = 2 * Math.sqrt(t + 1); w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
    else if (m00 >= m11 && m00 >= m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 >= m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
    out.set([x, y, z, w], 4 * i);
  }
  return out;
}
