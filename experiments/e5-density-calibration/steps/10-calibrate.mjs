#!/usr/bin/env node
// E5 step 10: the DCA-like calibration. For every calibration set (the
// satellites whose densities may calibrate a held-out target) and degree,
// analysis/density-calibration `calibrate` estimates the JB2008 exospheric
// temperature correction dT(lat, local time) in 3-hour bins from the observed
// densities, one UTC day per call. This file selects samples and routes them.
//
//   node experiments/e5-density-calibration/steps/10-calibrate.mjs --window validation|test|historicalTest [--degrees 0,1,2]
import { parseArgs } from 'node:util';
import { startRun } from '../../../harness/provenance.mjs';
import { config, configPath, callJson, DAY_MS, dayMs, isoDay, jb2008Rows, loadModules, mjdOfMs, modulesDir, setIndices, windowSpans } from '../common.mjs';
import { samples } from '../densities.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, degrees: { type: 'string' }, modules: { type: 'string' } } });
const spans = windowSpans(values.window);
const historical = values.window === 'historicalTest';
const degrees = (values.degrees ?? config.calibration.candidates.degree.join(',')).split(',').map(Number);
const run = startRun({ experiment: config.experiment, step: `10-calibrate-${values.window}`, configPath, modulesDir: modulesDir(values.modules), args: values });
const { loaded } = await loadModules(run, ['analysis/density-calibration'], values);
const dc = loaded['analysis/density-calibration'];
const log = (...a) => console.log(`[${run.id}]`, ...a);
run.addInputs('set', setIndices().sha256);

// Calibration sets: every distinct calibrator list the window's targets use.
const lists = historical ? config.density.heldOut.historical.map((h) => h.calibrators)
  : [...config.density.heldOut['2026'].map((h) => h.calibrators), ...Object.values(config.propagation.targets).map((t) => t.calibrators)];
const sets = [...new Map(lists.map((l) => [[...l].sort().join('+'), [...l].sort()])).entries()];
const c = config.calibration;
const result = { window: values.window, binHours: c.binHours, degrees, sets: {} };
const inputs = (name, hash) => run.addInputs('densities', { [name]: hash });
for (const [key, members] of sets) {
  result.sets[key] = { members, degrees: {} };
  for (const degree of degrees) result.sets[key].degrees[degree] = [];
  for (const span of spans) {
    // Bins from the forecast's mean window before the first issue day to seven days after the last.
    const from = dayMs(span.from) - (c.meanWindowDays + 1) * DAY_MS, to = dayMs(span.to) + 8 * DAY_MS;
    for (let day = from; day < to; day += DAY_MS) {
      const pts = { mjd: [], latDeg: [], lonDeg: [], altKm: [], rho: [] };
      for (const m of members) {
        const s = samples(m, day, day + DAY_MS, inputs);
        s.t.forEach((t, i) => {
          if (!s.valid[i]) return;
          pts.mjd.push(mjdOfMs(t)); pts.latDeg.push(s.lat[i]); pts.lonDeg.push(s.lon[i]); pts.altKm.push(s.altKm[i]); pts.rho.push(s.rho[i]);
        });
      }
      for (const degree of degrees) {
        const out = pts.mjd.length ? await callJson(dc, 'calibrate', 'request', {
          points: pts, jb2008: { rows: jb2008Rows(isoDay(day - 6 * DAY_MS), isoDay(day + 2 * DAY_MS)) }, degree, binHours: c.binHours,
          fromMjd: mjdOfMs(day), toMjd: mjdOfMs(day + DAY_MS), logSigma: c.logSigma, priorSigmaK: c.priorSigmaK.slice(0, degree + 1),
          minPoints: c.minPoints, iterations: c.iterations, editSigma: c.editSigma,
        }) : { bins: [] };
        result.sets[key].degrees[degree].push(...out.bins.map((b) => ({ fromMjd: b.fromMjd, toMjd: b.toMjd, n: b.n, used: b.used ?? 0,
          coefficients: b.coefficients, sigmas: b.sigmas ?? null, prefitRms: b.prefitRms ?? null, postfitRms: b.postfitRms ?? null, converged: b.converged ?? false })));
      }
      if ((day - from) % (5 * DAY_MS) === 0) log(`${key} ${isoDay(day)}: ${pts.mjd.length} samples`);
    }
  }
  const b0 = result.sets[key].degrees[degrees[0]];
  log(`${key}: ${b0.filter((b) => b.coefficients).length}/${b0.length} bins estimated`);
}
run.write('calibration.json', result);
run.finish();
log('done');
