// The worked examples whose reference comes from a source that may not be redistributed: no stated license, a non-commercial license, or terms that bind
// each recipient. SpaceX is not here: the owner ruled its numbers public on 2026-11-01. The same list as the sdn-ap site's tools/compare/licensed.mjs.
// compare-examples-publish.mjs writes these in the AP-only form: AP's track in km, GCRF, Float64, 3 per time; then for each name in `errors`, Float32
// distance from the reference in meters, 1 per time; then Float32 rotations in-track, cross-track, radial to GCRF from AP's own track, x, y, z, w per
// time (little endian). The JSON says center "AP", errors (the forecasts in block order) and referenceDrawn false, and has no offsets list. No other
// forecast's position and no offset vector is in the file, so no reference position can be computed from it (compare-examples-proof.mjs).

export const NOT_REDRAWN = new Set(['ESA', 'ESA navigation', 'ESA ultra-rapid', 'Intelsat', 'SES', 'China Space Station', 'Planet (Flock)']);

/** An example published in the AP-only form: its provider is licensed, or its reference is not drawn. */
export const licensed = (d) => NOT_REDRAWN.has(d.provider) || d.referenceDrawn === false;
