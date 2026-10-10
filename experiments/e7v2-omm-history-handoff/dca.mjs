// E5's stand-in for the Dynamic Calibration of the Atmosphere, as
// H-arc-v2-DCA reads it (PLAN.md section 7): the global JB2008 temperature
// correction a00 from E5's calibration bins (E5's published bins and E5's own
// computation for the spans it did not cover), through E5's forecast
// functions (analysis bins before t0; after t0 the relaxation from the
// nowcast to the 27-day level with E5's chosen time constant). As in E5, a
// calibrating satellite is never its own calibrator. Bookkeeping only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { a00Series, nowcast } from '../e5-density-calibration/forecast.mjs';
import { config } from './common.mjs';

const ALL = 'gracefo1+swarmA+swarmB+swarmC';
// E5's leave-out sets: Swarm A and C fly together, as do GRACE-FO 1 and 2.
const SET_FOR = { 39452: 'gracefo1+swarmB', 39453: 'gracefo1+swarmB', 39451: 'gracefo1+swarmA+swarmC', 43476: 'swarmA+swarmB+swarmC', 43477: 'swarmA+swarmB+swarmC' };

// Every bin of degree config.dca.degree per calibrator set, published bins
// first, a later file's bin skipped where one with the same start exists.
export function loadCalibration(run) {
  const extraDir = path.join(repoRoot, config.inputs.dcaExtraCalibration);
  const files = [...config.inputs.e5Calibration.map((f) => path.join(repoRoot, f)),
    ...(fs.existsSync(extraDir) ? fs.readdirSync(extraDir).filter((n) => n.endsWith('.calibration.json.gz')).sort().map((n) => path.join(extraDir, n)) : [])];
  const sets = new Map();
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    run.addInputs('dcaCalibration', { [path.relative(repoRoot, file)]: sha256(bytes) });
    const c = JSON.parse(zlib.gunzipSync(bytes));
    for (const [key, s] of Object.entries(c.sets)) {
      const bins = s.degrees[config.dca.degree] ?? [];
      if (!sets.has(key)) sets.set(key, new Map());
      const byStart = sets.get(key);
      for (const b of bins) if (b.coefficients && !byStart.has(b.fromMjd)) byStart.set(b.fromMjd, b);
    }
  }
  return new Map([...sets].map(([k, m]) => [k, [...m.values()].sort((a, b) => a.fromMjd - b.fromMjd)]));
}

// The stand-in for one object at cutoff t0: {a00(tMs), set, nowcastBins,
// levelBins} or null when the nowcast or the level has too few bins.
export function dcaFor(calibration, norad, t0Ms) {
  const set = SET_FOR[norad] ?? ALL;
  const bins = calibration.get(set) ?? [];
  const now = nowcast(bins, t0Ms, config.dca.degree);
  if (now.bins < config.dca.minimumNowcastBins || now.levelBins < config.dca.minimumLevelBins) return null;
  return { a00: a00Series(bins, t0Ms, config.dca.tauHours, config.dca.degree), set, nowcastBins: now.bins, levelBins: now.levelBins, nowcastK: now.coefficients[0], levelK: now.level[0] };
}
