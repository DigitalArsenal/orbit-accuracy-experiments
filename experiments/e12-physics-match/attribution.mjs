// Attribution of a residual that remains after the best hypothesis (PLAN.md
// section 9, step 4): each family of fingerprint terms is turned into its
// share of the residual, and the families are ranked. A rule-based reading of
// the fingerprint, stated as such; statistics only.
//   rounding   closure within the file's printed digits (uniform rounding, 3D)
//   density    along-track drift and curvature over the closure half (drag
//              model, space-weather inputs, Cd*A/m history)
//   orbital    once/twice-per-revolution terms and their growth (state, GM,
//              zonal gravity, frame orientation)
//   earthfixed daily and Earth-fixed-phase terms (Earth orientation, time
//              scale, tesseral gravity, ocean tides)
//   radiation  steps at the shadow and slope changes at its boundaries (SRP
//              model, shadow model, Earth radiation)
//   crosstrack the normal component's share (third bodies, frame tilt, node)
export function attribute(f, scores, digits) {
  const q = digits?.positionM ?? 0;
  const roundingRms = q ? q / Math.sqrt(12) * Math.sqrt(3) : 0;
  if (roundingRms && scores.closureRms <= 3 * roundingRms) return { dominant: 'rounding', roundingRms, closureRms: scores.closureRms, families: {} };
  const half = f.span_days / 2;
  const families = {
    density: Math.abs(f.T_closure_quad) * half * half + Math.abs(f.T_closure_lin) * half,
    orbital: f.R_rev1 + f.T_rev1 + f.N_rev1 + f.R_rev2 + f.T_rev2 + (f.R_rev1_growth + f.T_rev1_growth) * f.span_days,
    earthfixed: f.R_daily + f.T_daily + f.N_daily + f.R_earthfixed1 + f.R_earthfixed2 + f.T_earthfixed1 + f.T_earthfixed2,
    radiation: Math.abs(f.R_shadow_step) + Math.abs(f.T_shadow_step) + Math.abs(f.T_entry_exit),
    crosstrack: f.N_closure_share,
  };
  const total = Object.values(families).reduce((a, b) => a + b, 0) || 1;
  const shares = Object.fromEntries(Object.entries(families).map(([k, v]) => [k, v / total]).sort((a, b) => b[1] - a[1]));
  return { dominant: Object.keys(shares)[0], roundingRms, closureRms: scores.closureRms, families: shares };
}
