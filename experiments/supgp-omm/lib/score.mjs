// Score one SupGP set on one operator ephemeris, and fit our OMM to the same
// points. Every orbit computation is gp-error-model (WASM): element_residuals
// scores CelesTrak's set, fit_elements fits ours. This file frames the calls,
// applies the gate and runs the guards; it computes no orbit quantity.
import { json } from '../../../harness/modules.mjs';
import { FIT, GATE } from '../config.mjs';
import { OMM_TYPE, decodeOmmStream, ommFrame } from './records.mjs';
import { Guard } from './guards.mjs';

const ELEMENTS = ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'];
export const isoZ = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
export const roundToSecond = (ms) => Math.round(ms / 1000) * 1000;
export const parseUtc = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);

// The exact statistics the module reports for a set of points (all of them, no thinning).
export const statsOf = (s) => (s && s.n ? {
  n: s.n, span: s.span, rms3dKm: s.rms3dKm, rmsPerCoordinateKm: s.rmsPerCoordinateKm, rmsRtnKm: s.rmsRtnKm, meanRtnKm: s.meanRtnKm,
  max3dKm: s.max3dKm, maxAt: s.maxAt, maxRtnKm: s.maxRtnKm, rmsVelocityKmS: s.rmsVelocityKmS, failures: s.failures,
} : { n: 0, failures: s?.failures });

// The intended window of a set on an ephemeris: [EPOCH, EPOCH + hours], cut to the states the
// ephemeris has. The EPOCH is snapped to the second (CelesTrak's epochs sit on the operator's
// state grid, with microsecond noise).
export function windowOf({ epoch, hours, summary }) {
  const epochMs = roundToSecond(parseUtc(epoch));
  const toMs = epochMs + hours * 3600e3;
  const fromMs = Math.max(epochMs, summary.firstMs);
  const step = (summary.stepSeconds ?? 0) * 1000;
  return {
    hours, epochMs, fromMs, toMs, from: isoZ(fromMs), to: isoZ(toMs),
    // complete: the ephemeris holds states over the whole intended window (to within one state step).
    complete: summary.firstMs <= epochMs + step && summary.lastMs >= toMs - step,
    availableHours: Math.max(0, Math.min(toMs, summary.lastMs) - fromMs) / 3600e3,
    fitFromEphemerisStart: summary.firstMs > epochMs,
  };
}

// Gate of E11: the recomputed per-coordinate RMS must reproduce the published one.
export function gateOf(recomputedKm, publishedKm) {
  const toleranceKm = Math.max(GATE.absoluteKm, GATE.relative * publishedKm);
  const delta = recomputedKm - publishedKm;
  return {
    publishedRmsKm: publishedKm, recomputedRmsKm: recomputedKm, deltaKm: delta, ratio: recomputedKm / publishedKm, toleranceKm,
    pass: Number.isFinite(recomputedKm) && Math.abs(delta) <= toleranceKm,
    clean: Number.isFinite(recomputedKm) && Math.abs(delta) <= Math.max(GATE.absoluteKm, GATE.clean * publishedKm),
  };
}

// CelesTrak's set on the window. One element set per call, so the module cannot pick another.
export async function scoreSupgp(fitter, row, ephemeris, window, guard) {
  const set = { norad: row.norad, epoch: row.epoch, elements: row.elements };
  const frame = ommFrame([set]);
  guard.supgpSetSent(row, decodeOmmStream(frame.payload));
  const setIso = `${row.epoch}Z`;
  const label = `supgp:${row.norad}:${row.epoch}`;
  const res = await fitter.invokeJson('element_residuals', [frame, ephemeris, json('options', {
    requests: [{ norad: row.norad, set: setIso, label, windows: [{ from: window.from, to: window.to, label: 'window' }] }],
  })], 'residuals');
  guard.scoreEcho({ res, norad: row.norad, set: setIso, label, window, who: 'supgp' });
  return statsOf(res.results[0].windows[0]);
}

// One fit_elements call. start 'ephemeris': the module's own start (osculating-to-mean inversion, and for
// inclinations under 3 degrees a set of restarts). start 'celestrak-elements': the LM starts from CelesTrak's
// elements; only the starting point changes, the fit still minimises the RMS on the same points.
async function fitOnce(fitter, row, ephemeris, window, scoredSupgp, guard, { closure, start }) {
  const epoch = window.fitFromEphemerisStart ? 'first' : `${row.epoch}Z`;
  const inputs = [ephemeris];
  if (start === 'celestrak-elements') inputs.push(ommFrame([{ norad: row.norad, epoch: row.epoch, elements: row.elements }]));
  inputs.push(json('options', { ...FIT, closure, ...(start === 'celestrak-elements' ? { initial: 'apriori' } : {}), fits: [{ norad: row.norad, from: window.from, to: window.to, epoch, fitBstar: true }] }));
  const out = await fitter.invoke('fit_elements', inputs);
  const report = JSON.parse(Buffer.from(out.outputs.find((o) => o.portId === 'report').payload).toString());
  const fit = report.fits?.[0] ?? {};
  const result = {
    start, converged: fit.converged === true && !fit.error, error: fit.error ?? null, iterations: fit.iterations, stop: fit.stop, stages: fit.stages,
    epoch: fit.epoch, epochRequest: epoch, states: fit.states, weightedRms: fit.weightedRms, conditionNumber: fit.conditionNumber,
    elements: fit.elements, equinoctial: fit.equinoctial, bstar: fit.bstar, rms: statsOf(fit.rms),
    closure: fit.closure ? { splitEpoch: fit.closure.splitEpoch, fitStates: fit.closure.fitStates, error: fit.closure.error ?? null, rms: statsOf(fit.closure.rms) } : null,
  };
  guard.fitReport({ report, norad: row.norad, window, scoredSupgp, fit: result, apriori: start === 'celestrak-elements' ? 1 : 0 });
  return { result, out };
}

// Our OMM, fitted to the same points (B* fitted), then re-scored from the OMM record itself. When the module's own
// start ends in a fit that is not lower than CelesTrak's (it can, on near-equatorial orbits, whose cost has several
// basins) or does not converge, the fit is repeated once from CelesTrak's elements and the lower of the two is kept;
// both attempts are recorded.
export async function fitOurs(fitter, row, ephemeris, window, scoredSupgp, guard, { closure = false } = {}) {
  const attempts = [await fitOnce(fitter, row, ephemeris, window, scoredSupgp, guard, { closure, start: 'ephemeris' })];
  const lower = (a) => a.result.converged && a.result.rms.rmsPerCoordinateKm < scoredSupgp.rmsPerCoordinateKm;
  if (!lower(attempts[0])) attempts.push(await fitOnce(fitter, row, ephemeris, window, scoredSupgp, guard, { closure, start: 'celestrak-elements' }));
  const converged = attempts.filter((a) => a.result.converged);
  const best = converged.length ? converged.reduce((x, y) => (y.result.rms.rmsPerCoordinateKm < x.result.rms.rmsPerCoordinateKm ? y : x)) : attempts[0];
  const result = best.result;
  result.attempts = attempts.map((a) => ({ start: a.result.start, converged: a.result.converged, error: a.result.error, rmsPerCoordinateKm: a.result.rms.rmsPerCoordinateKm, iterations: a.result.iterations }));
  if (!result.converged) return { result, omm: null };
  const ommBytes = Buffer.from(best.out.outputs.find((o) => o.portId === 'elements').payload);
  guard.fitOmm({ ommBytes, norad: row.norad, fit: result, decode: decodeOmmStream });
  // Independent scoring: the OMM record alone, through element_residuals, on the same window.
  const setIso = result.epoch.endsWith('Z') ? result.epoch : `${result.epoch}Z`;
  const rescored = await fitter.invokeJson('element_residuals', [{ portId: 'elements', payload: ommBytes, typeRef: OMM_TYPE },
    ephemeris, json('options', { requests: [{ norad: row.norad, set: setIso, label: 'ours', windows: [{ from: window.from, to: window.to, label: 'window' }] }] })], 'residuals');
  guard.scoreEcho({ res: rescored, norad: row.norad, set: setIso, label: 'ours', window, who: 'ours' });
  const again = statsOf(rescored.results[0].windows[0]);
  guard.oursRescored({ fit: result, again });
  result.rescored = { rmsPerCoordinateKm: again.rmsPerCoordinateKm, n: again.n };
  return { result, omm: ommBytes };
}

// One candidate version of one set: score CelesTrak's set, apply the gate, fit ours when asked and the gate passes.
// `ephemeris` is the labelled port frame; `summary` its summarizeOem().
export async function evaluate(fitter, { row, ephemeris, summary, hours, fit = true, closure = false }) {
  const guard = new Guard(`${row.group}/${row.norad}@${row.epoch}`);
  const window = windowOf({ epoch: row.epoch, hours, summary });
  const t0 = performance.now();
  const supgp = await scoreSupgp(fitter, row, ephemeris, window, guard);
  const tScore = performance.now();
  const gate = gateOf(supgp.rmsPerCoordinateKm, row.publishedRmsKm);
  const out = { window: { ...window }, supgp, gate, ephemeris: { frame: summary.frame, states: summary.states, firstMs: summary.firstMs, lastMs: summary.lastMs, stepSeconds: summary.stepSeconds }, ours: null, omm: null, guards: guard.checks, timing: { scoreMs: tScore - t0 } };
  if (gate.pass && fit && supgp.n > 0) {
    const f = await fitOurs(fitter, row, ephemeris, window, supgp, guard, { closure });
    out.ours = f.result;
    out.omm = f.omm;
    out.timing.fitMs = performance.now() - tScore;
    if (f.result.converged && Number.isFinite(f.result.rms.rmsPerCoordinateKm)) {
      out.comparison = {
        supgpMinusOursM: (supgp.rmsPerCoordinateKm - f.result.rms.rmsPerCoordinateKm) * 1000,
        oursLower: f.result.rms.rmsPerCoordinateKm < supgp.rmsPerCoordinateKm,
        oursRatio: f.result.rms.rmsPerCoordinateKm / supgp.rmsPerCoordinateKm,
      };
    }
  }
  out.guards = guard.checks;
  return out;
}
