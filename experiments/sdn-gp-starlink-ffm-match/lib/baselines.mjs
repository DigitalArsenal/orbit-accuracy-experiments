// The two baselines on one window of an ephemeris, with the radial / in-track / cross-track split.
//   SGP4     analysis/gp-error-model `fit_elements`, scored by `element_residuals` (RTN of the ephemeris).
//   SGP4-XP  propagator/sgp4-xp `fit` (black box); its held-out RMS by day is the module's own, the RTN split of the
//            held-out days is the set propagated by the module to the ephemeris epochs and compared by `pair_statistics`.
// JavaScript here builds records, calls modules and does counting; every orbit and frame computation is a module's.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openModule } from './modules.mjs';
import { frame, oemBytes, ommBytes, ommFrame, readOmm, readOem, blockLines, paramsOf } from './sds.mjs';
import { DAY, iso, ms, slice } from './windows.mjs';

const OEM_FRAME = { EME2000: 'EME2000', GCRF: 'GCRF', ITRF: 'ITRF2000', TEME: 'TEMEOFDATE' };
// pair_statistics needs a covariance on the predicted state; only its error vector in RTN is used here.
const PLACEHOLDER_COVARIANCE = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6];
const RTN_STRIDE_SECONDS = 300; // RTN of the held-out days is taken on at most one state per five minutes

export async function openBaselines(modules) {
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  const xp = await openModule(modules, 'propagator/sgp4-xp');
  const gem = await openModule(modules, 'analysis/gp-error-model', { fresh: true });
  return { erm, xp, gem, provenance: [xp.provenance, gem.provenance], close: () => xp.destroy() };
}

const block = (object, lines, extra) => oemBytes({
  originator: object.originator ?? 'G1', creation: object.creation ?? '',
  block: { frame: OEM_FRAME[object.frame] ?? object.frame, timeSystem: object.timeSystem ?? 'UTC', object: { name: object.name, id: object.objectId ?? '', norad: object.norad },
    lines, start: lines[0].epoch, stop: lines.at(-1).epoch, ...extra },
});

const dayOf = (t, stopFit, leadDays) => leadDays.find((k) => t > stopFit + (k - 1) * DAY && t <= stopFit + k * DAY);
const rms = (values) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const record = (omm, theory, norad) => ({
  theory, epoch: omm.EPOCH, meanMotion: omm.MEAN_MOTION, eccentricity: omm.ECCENTRICITY, inclination: omm.INCLINATION, raan: omm.RA_OF_ASC_NODE,
  argPerigee: omm.ARG_OF_PERICENTER, meanAnomaly: omm.MEAN_ANOMALY, norad, bstar: omm.BSTAR, agom: omm.MEAN_MOTION_DDOT,
});

async function ricOfHeldOut(b, object, ommPayload, held, stopFit, leadDays) {
  const step = held.length > 1 ? (ms(held[1].epoch) - ms(held[0].epoch)) / 1000 : 60;
  const thin = Math.max(1, Math.round(RTN_STRIDE_SECONDS / step));
  const chosen = held.filter((_, i) => i % thin === 0);
  const grid = block(object, chosen.map((l) => ({ epoch: l.epoch, r: [0, 0, 0], v: [0, 0, 0] })), {});
  const t0 = performance.now();
  const prop = await b.xp.call('propagate', [ommFrame('omm', ommPayload), frame('grid', 'OEM', grid)]);
  const propagateMs = performance.now() - t0;
  const predicted = blockLines(readOem(prop.ephemeris).EPHEMERIS_DATA_BLOCK[0]);
  if (predicted.length !== chosen.length) throw new Error(`propagate returned ${predicted.length} of ${chosen.length} states`);
  const pairs = predicted.map((p, i) => ({ id: String(i), predicted: { position: p.r, velocity: p.v, covariance: PLACEHOLDER_COVARIANCE, covarianceAxes: 'INERTIAL' }, truth: { position: chosen[i].r, velocity: chosen[i].v } }));
  const stats = b.erm.decode((await b.gem.call('pair_statistics', [b.erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs })])).statistics).pairs;
  const byDay = {};
  stats.forEach((s, i) => { const k = dayOf(ms(chosen[i].epoch), stopFit, leadDays); if (k) (byDay[k] ??= []).push(s.errorRtn); });
  const ric = Object.fromEntries(Object.entries(byDay).map(([k, e]) => [k, [0, 1, 2].map((c) => rms(e.map((v) => v[c])))]));
  return { ric, usPerState: (propagateMs * 1000) / chosen.length };
}

export async function fitXp(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay) {
  const bytes = block(object, lines, { useableStart: lines[0].epoch, useableStop: iso(stopFit) });
  const t0 = performance.now();
  let out;
  try { out = await b.xp.call('fit', [frame('ephemeris', 'OEM', bytes)]); } catch (error) { return { ok: false, error: String(error.message).slice(0, 200) }; }
  const fitMs = performance.now() - t0;
  const omm = readOmm(out.elements);
  const p = paramsOf(omm);
  const days = {};
  for (const k of leadDays) {
    const n = Number(p[`HELD_OUT_DAY${k}_STATES`]);
    if (Number.isFinite(n) && n >= minStatesPerDay) days[k] = { rmsKm: Number(p[`HELD_OUT_DAY${k}_RMS_KM`]), n };
  }
  const held = lines.filter((l) => ms(l.epoch) > stopFit);
  let ric = {}, usPerState = null;
  if (held.length) {
    try { ({ ric, usPerState } = await ricOfHeldOut(b, object, out.elements, held, stopFit, leadDays)); } catch (error) { return { ok: false, error: `ric: ${String(error.message).slice(0, 160)}` }; }
  }
  for (const k of Object.keys(days)) days[k].ric = ric[k] ?? null;
  return {
    ok: true, converged: p.FIT_CONVERGED === 'true', iterations: Number(p.FIT_ITERATIONS), fitRmsKm: Number(p.FIT_RMS_KM), fitStates: Number(p.FIT_STATES),
    fitRic: [Number(p.FIT_RADIAL_RMS_KM), Number(p.FIT_ALONG_TRACK_RMS_KM), Number(p.FIT_CROSS_TRACK_RMS_KM)], days,
    elementBytes: ommBytes(record(omm, 'SGP4XP', object.norad)).length, recordBytes: out.elements.length, parameters: 8,
    fitMs, usPerState, bterm: omm.BSTAR, agom: omm.MEAN_MOTION_DDOT, meanMotion: omm.MEAN_MOTION,
  };
}

export async function fitSgp4(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay) {
  const bytes = block(object, lines, {});
  const ephemeris = frame('ephemeris', 'OEM', bytes);
  const t0 = performance.now();
  let fit, report, f;
  try {
    fit = await b.gem.call('fit_elements', [ephemeris, b.erm.frame('options', 'fitOptions', { from: iso(startMs), to: iso(stopFit), epoch: 'first', fitBstar: true, closure: false })]);
    report = b.erm.decode(fit.report);
    f = report.fits?.[0];
  } catch (error) { return { ok: false, error: String(error.message).slice(0, 200) }; }
  const fitMs = performance.now() - t0;
  if (!f || !f.converged) return { ok: false, error: f?.error ?? 'not converged' };
  const windows = leadDays.map((k) => ({ from: iso(stopFit + (k - 1) * DAY + 1), to: iso(stopFit + k * DAY), label: String(k) }));
  let result;
  try {
    const r = await b.gem.call('element_residuals', [{ portId: 'elements', payload: fit.elements, typeRef: { schemaName: 'OMM.fbs', fileIdentifier: '$OMM', rootTypeName: 'OMM', wireFormat: 'flatbuffer' } }, ephemeris,
      b.erm.frame('options', 'residualRequests', { requests: [{ norad: object.norad, set: f.epoch, windows }] })]);
    result = b.erm.decode(r.residuals).results[0];
  } catch (error) { return { ok: false, error: `residuals: ${String(error.message).slice(0, 160)}`, fitRmsKm: f.rms.rms3dKm }; }
  const days = {};
  for (const w of result.windows) if (w.n >= minStatesPerDay) days[w.label] = { rmsKm: w.rms3dKm, n: w.n, ric: w.rmsRtnKm };
  const omm = readOmm(fit.elements);
  return {
    ok: true, converged: true, iterations: f.iterations, fitRmsKm: f.rms.rms3dKm, fitStates: f.rms.n, fitRic: f.rms.rmsRtnKm, days,
    elementBytes: ommBytes(record(omm, 'SGP4', object.norad)).length, recordBytes: fit.elements.length, parameters: 7, fitMs, bstar: omm.BSTAR, meanMotion: omm.MEAN_MOTION,
  };
}

/** One fit window scored by both baselines. Returns null when the ephemeris cannot supply the fit interval. */
export async function scoreWindow(b, object, startMs, { fitSeconds, leadDays, minCoverage = 0.9 }) {
  const stopFit = startMs + fitSeconds * 1000;
  const lines = slice(object, startMs, stopFit + Math.max(...leadDays) * DAY);
  if (lines.length < 20) return null;
  const stepSeconds = (ms(lines[1].epoch) - ms(lines[0].epoch)) / 1000;
  const minStatesPerDay = Math.floor((minCoverage * 86400) / stepSeconds);
  const [xp, sgp4] = [await fitXp(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay), await fitSgp4(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay)];
  return { source: object.source, id: object.id, norad: object.norad, startUtc: iso(startMs), fitSeconds, stepSeconds, states: lines.length, xp, sgp4 };
}
