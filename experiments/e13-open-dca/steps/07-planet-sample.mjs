// E13 step 07: the Planet sample. Eligible Doves have at least `minimumStates` daily states in the study window and a mean altitude
// inside Swarm's band; a salted hash orders them and the first `calibration` + `heldOut` are drawn (the held-out ones never enter a
// density solution). Writes planet-sample.json beside this step (hardware ids only; no state leaves the archive).
//
//   node steps/07-planet-sample.mjs
import crypto from 'node:crypto';
import path from 'node:path';
import { json, loadModule } from '../../../harness/modules.mjs';
import { config, energyModulesDir, experimentDir, writeJson } from '../common.mjs';
import { readPlanetSeries } from '../planet-history.mjs';

const P = config.planet;
const series = readPlanetSeries({ fromDay: P.window[0], toDay: P.window[1] });
const hash = (hwid) => crypto.createHash('sha256').update(`${P.sample.salt}:${hwid}`).digest().readUInt32BE(0);
// The altitude of a Dove is its WGS84 geodetic height from analysis/density-calibration `energy`, mean over its states. Selection only: the
// J2000 state is read as GCRF and its TT epoch as UTC (a frame bias of 20 mas and a longitude shift of 0.3 deg, neither of which moves a height).
const energy = await loadModule(energyModulesDir(), 'analysis/density-calibration');
const eligible = [];
for (const [hwid, states] of series) {
  if (states.length < P.eligible.minimumStates) continue;
  const out = await energy.invokeJson('energy', [json('request', { states: states.map((x) => ({ mjd: x.ttMs / 86400000 + 40587, r: x.state.slice(0, 3), v: x.state.slice(3, 6) })), degree: 2 })], 'result');
  const heights = out.geodetic.altKm.filter((h) => h !== null);
  const alt = heights.reduce((s, h) => s + h, 0) / heights.length;
  if (alt >= P.eligible.meanAltitudeKm[0] && alt <= P.eligible.meanAltitudeKm[1]) eligible.push({ hwid, states: states.length, altitudeKm: alt });
}
await energy.destroy();
eligible.sort((a, b) => hash(a.hwid) - hash(b.hwid));
const drawn = eligible.slice(0, P.sample.calibration + P.sample.heldOut);
console.log(`[planet sample] ${series.size} Doves in the window, ${eligible.length} eligible, ${drawn.length} drawn`);
writeJson(path.join(experimentDir, 'planet-sample.json'), {
  experiment: 'e13-open-dca', salt: P.sample.salt, window: P.window, eligible: P.eligible, doves: series.size, eligibleCount: eligible.length,
  calibration: drawn.slice(0, P.sample.calibration).map((d) => d.hwid).sort(), heldOut: drawn.slice(P.sample.calibration).map((d) => d.hwid).sort(),
});
