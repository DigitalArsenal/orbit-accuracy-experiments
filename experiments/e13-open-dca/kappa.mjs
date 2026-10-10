// kappa = the mean d ln(rho) / dT of JB2008 over a ring of points at the Doves' height (PLAN.md section 4.4): the conversion of a log-density
// scale s into the exospheric-temperature offset a00 = s / kappa that a propagation adds to the DTC rows. d ln(rho) / dT comes from
// analysis/density-calibration `evaluate` with `derivative` (the module's finite difference of the density model); this file averages.
//
// The ring: 12 latitudes (-82.5..82.5 every 15 degrees) x 12 longitudes (every 30 degrees) at 12:00 UTC of each day, which covers every
// local solar time; the mean is area-weighted (cos latitude). The density-weighted mean is also returned (descriptive: the drag of an
// orbit weighs the dense places more).
import { json } from '../../harness/modules.mjs';
import { DAY, config } from './common.mjs';
import { jb2008Rows } from './vendor/full-force.mjs';

const LATS = Array.from({ length: 12 }, (_, i) => -82.5 + 15 * i), LONS = Array.from({ length: 12 }, (_, i) => -165 + 30 * i);

// env: {dc, set} from density-truth.mjs openDensityEnv. days: ISO dates. Returns {day: {kappa, kappaRhoWeighted}}.
export async function kappaTable(env, days, altKm = config.analysis.correction.altitudeKm) {
  const out = {};
  for (const day of days) {
    const t = Date.parse(`${day}T12:00:00Z`);
    const pts = [];
    for (const lat of LATS) for (const lon of LONS) pts.push({ lat, lon, w: Math.cos(lat * Math.PI / 180) });
    const r = await env.dc.invokeJson('evaluate', [json('request', {
      points: { mjd: pts.map(() => t / DAY + 40587), latDeg: pts.map((p) => p.lat), lonDeg: pts.map((p) => p.lon), altKm: pts.map(() => altKm) },
      jb2008: { rows: jb2008Rows(env.set, t - 6 * DAY, t + 2 * DAY) }, derivative: true })], 'result');
    let sw = 0, sk = 0, sr = 0, skr = 0;
    pts.forEach((p, i) => {
      if (!(r.density[i] > 0) || !Number.isFinite(r.dLnRhoDT[i])) return;
      sw += p.w; sk += p.w * r.dLnRhoDT[i]; sr += p.w * r.density[i]; skr += p.w * r.density[i] * r.dLnRhoDT[i];
    });
    out[day] = { kappa: sk / sw, kappaRhoWeighted: skr / sr };
  }
  return out;
}
