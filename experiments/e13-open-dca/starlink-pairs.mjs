// The Starlink version pairs as observations of ln Cd*A/m (PLAN.md Amendments S2 to S5): the clean pairs of the decaying strata, each with its altitude and, for the primary analysis,
// the precision its energy noise earns it. One reader for steps 70 and 72.
//
// A pair (the collector's pairs/<norad>/<t1>.json) measures Cd*A/m from the energy that separates two consecutive versions' start states (Method B). The drag energy it can see is
// D = |S * B| (J/kg: the sensitivity of the energy mismatch to Cd*A/m times the answer), which falls by a factor of ten from 300 to 500 km, while the energy noise of the two start
// states does not: sigma_E = sqrt(2) * sqrt((g * sigma_R)^2 + (v * sigma_vT)^2) for the new version's stated start sigmas (radial position m, along-track velocity mm/s), with g = 8.4 m/s^2
// and v = 7600 m/s as the order-of-magnitude factors of dC/dr and dC/dv (a noise model, not physics; the old version's start state is taken to be as good). So the pair's ln B
// has the scatter sqrt((sigma_E / D)^2 + 0.03^2) and the precision (0.10 / that)^2, against a reference scatter of 0.10 (Planet's arcs scatter 0.10).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { H, experimentDir, paths, readJson } from './common.mjs';

export const NOISE_MODEL = { gravityMs2: 8.4, speedMs: 7600, floor: 0.03, reference: 0.10, twoStates: Math.SQRT2 };

// options: through (ISO, ignore later pairs), legacy (S2/S3 as written: residual at the answer below 1 J/kg, unit precision) or the S5 primary (residual at most
// max(1 J/kg, 0.5 % of D), precision from the noise model).
export function loadStarlinkPairs({ through = Infinity, legacy = false } = {}) {
  const sample = readJson(path.join(experimentDir, 'sample.json')).satellites;
  const arcs = [], seen = new Set();
  const counts = { files: 0, consecutive: 0, decaying: 0, clean: 0 };
  if (!fs.existsSync(paths.pairs)) return { arcs, counts, createdLagHours: [] };
  const lags = [];
  for (const dir of fs.readdirSync(paths.pairs)) for (const f of fs.readdirSync(path.join(paths.pairs, dir))) {
    const p = readJson(path.join(paths.pairs, dir, f));
    const key = `${p.norad}|${p.t1}`;
    if (p.kind !== 'e13-pair' || seen.has(key) || !p.methodB || Date.parse(p.t1) > through) continue;
    seen.add(key);
    ++counts.files;
    if (!(p.hoursBetween >= 5 && p.hoursBetween <= 9)) continue;
    ++counts.consecutive;
    if (!sample[p.norad]?.startsWith('decay')) continue;
    ++counts.decaying;
    const B = p.methodB.cdAreaOverMass, D = Math.abs(p.methodB.sensitivityJkgPerM2kg * B), check = Math.abs(p.methodB.checkMismatchJkg ?? 1e9);
    if (!(B > 0.002 && B < 0.5) || !(p.energyJkg.predictedChange <= -20)) continue;
    if (legacy ? !(check < 1) : !(check <= Math.max(1, 0.005 * D))) continue;
    ++counts.clean;
    const s = p.statedSigma?.newAtT1;
    const sigmaE = s ? NOISE_MODEL.twoStates * Math.hypot(NOISE_MODEL.gravityMs2 * s[0], NOISE_MODEL.speedMs * s[4] * 1e-3) : NaN;
    const sigma = Math.hypot(sigmaE / D, NOISE_MODEL.floor);
    const arc = { dove: String(p.norad), startMs: Date.parse(p.t0), endMs: Date.parse(p.t1), y: Math.log(B), altKm: p.geodeticAltitudeKm?.oldT0 ?? NaN, group: 'starlink', dragEnergyJkg: D, sigma };
    if (!legacy) {
      if (!Number.isFinite(sigma)) continue;                       // a pair without stated sigmas has no noise model
      arc.precision = (NOISE_MODEL.reference / sigma) ** 2;
    }
    arcs.push(arc);
    if (p.next?.createdMs) lags.push((p.next.createdMs - Date.parse(p.t1)) / H);
  }
  lags.sort((a, b) => a - b);
  return { arcs, counts, createdLagHours: lags };
}

// The pairs directory as one input for a run manifest: the number of files and the SHA-256 of their names and contents in order.
export function pairsInput() {
  const hash = crypto.createHash('sha256');
  let files = 0;
  if (fs.existsSync(paths.pairs)) for (const dir of fs.readdirSync(paths.pairs).sort()) for (const f of fs.readdirSync(path.join(paths.pairs, dir)).sort()) { hash.update(`${dir}/${f}\n`); hash.update(fs.readFileSync(path.join(paths.pairs, dir, f))); ++files; }
  return { [`pairs (${files} files)`]: hash.digest('hex') };
}
