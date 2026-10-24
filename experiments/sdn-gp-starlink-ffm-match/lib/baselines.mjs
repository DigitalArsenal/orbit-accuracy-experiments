// The two baselines on one window of an ephemeris, with the radial / in-track / cross-track split.
//   SGP4     analysis/gp-error-model `fit_elements`, scored by `element_residuals` (RTN of the ephemeris).
//   SGP4-XP  propagator/sgp4-xp `fit` (black box); its held-out RMS by day is the module's own, the RTN split of the
//            held-out days is the set propagated by the module to the ephemeris epochs and compared by `pair_statistics`.
// JavaScript here builds records, calls modules and does counting; every orbit and frame computation is a module's.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { openModule } from './modules.mjs';
import { openSdngp } from './sdngp.mjs';
import { transformState } from './frames.mjs';
import { store } from '../common.mjs';
import { frame, oemBytes, ommBytes, ommFrame, readOmm, readOem, blockLines, paramsOf } from './sds.mjs';
import { DAY, iso, ms, slice } from './windows.mjs';

const OEM_FRAME = { EME2000: 'EME2000', GCRF: 'GCRF', ITRF: 'ITRF2000', TEME: 'TEMEOFDATE' };
// pair_statistics needs a covariance on the predicted state; only its error vector in RTN is used here.
export const PLACEHOLDER_COVARIANCE = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6];
const RTN_STRIDE_SECONDS = 300; // RTN of the held-out days is taken on at most one state per five minutes

export async function openBaselines(modules, { sdngp = false } = {}) {
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
  const xp = await openModule(modules, 'propagator/sgp4-xp');
  const gem = await openModule(modules, 'analysis/gp-error-model', { fresh: true });
  const out = { erm, xp, gem, provenance: [xp.provenance, gem.provenance], close: async () => { await xp.destroy(); await out.sdngp?.destroy(); await out.frames?.destroy(); } };
  if (sdngp) { // the SDN-AP third fitter (amendment A9): the side-B module, the frames module for the held-out epochs and the run's saved space-weather table
    out.sdngp = await openSdngp({ store });
    out.frames = await openModule(modules, 'foundation/frames');
    out.weatherTable = Buffer.from(JSON.parse(fs.readFileSync(path.join(store, 'environment/environment.json'), 'utf8')).inputs.space_weather, 'base64');
    out.provenance.push(out.sdngp.provenance);
  }
  return out;
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
    fitMs, usPerState, bterm: omm.BSTAR, agom: omm.MEAN_MOTION_DDOT, meanMotion: omm.MEAN_MOTION, inclination: omm.INCLINATION, eccentricity: omm.ECCENTRICITY,
  };
}

export async function fitSgp4(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay, fixedBstar) {
  const bytes = block(object, lines, {});
  const ephemeris = frame('ephemeris', 'OEM', bytes);
  const t0 = performance.now();
  let fit, report, f;
  try {
    fit = await b.gem.call('fit_elements', [ephemeris, b.erm.frame('options', 'fitOptions', { from: iso(startMs), to: iso(stopFit), epoch: 'first', ...(fixedBstar === undefined ? { fitBstar: true } : { fitBstar: false, bstar: fixedBstar }), closure: false })]);
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
    elementBytes: ommBytes(record(omm, 'SGP4', object.norad)).length, recordBytes: fit.elements.length, parameters: 7, fitMs, bstar: omm.BSTAR, meanMotion: omm.MEAN_MOTION, inclination: omm.INCLINATION, eccentricity: omm.ECCENTRICITY,
  };
}

const FIT_FRAME = { EME2000: 'EME2000', GCRF: 'GCRF', ICRF: 'GCRF', TEME: 'TEMEOFDATE' }; // the frame is declared as it is (builds from 2d906c4d90fd read EME2000; earlier builds were given GCRF for it, 23 mas apart: 0.2 m at LEO)

const sdngpOem = (object, lines, stopFit, { defaultSpan = false } = {}) => oemBytes({ originator: object.originator ?? 'G1', block: { frame: FIT_FRAME[object.frame] ?? object.frame, frameName: object.frame === 'TEME' ? 'TEME' : object.frame === 'EME2000' ? 'EME2000' : 'GCRF', timeSystem: object.timeSystem ?? 'UTC', object: { name: object.name, id: object.objectId ?? '', norad: object.norad },
  lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStart: defaultSpan ? undefined : lines[0].epoch, useableStop: iso(stopFit) }, sizePrefixed: false }); // defaultSpan (A9f): only the end of the fit is declared, the module chooses the span

/** The states of a fitted SDN-AP set (TEME, by the module) at the given epochs (ms), in the named axes ('EME2000' or 'GCRF', by foundation/frames): [{r, v}] in km, km/s. */
async function sdngpStates(b, omm, epochMs, epochsMs, axes) {
  const states = await b.sdngp.states(omm, epochsMs.map((t) => (t - epochMs) / 60000));
  if (states.some((x) => x.status !== 0)) throw new Error(`sdngp propagate status ${states.find((x) => x.status !== 0).status}`);
  const out = [];
  for (let i = 0; i < epochsMs.length; i += 1) {
    const t = await transformState(b.frames, 'TEME', axes, iso(epochsMs[i]), [...states[i].r, ...states[i].v]);
    out.push({ r: t.slice(0, 3), v: t.slice(3, 6) });
  }
  return out;
}

/** The states of a segment set (SDN-AP regime CISLUNAR or HELIO, amendment A9h) at the given pack epochs, by `propagate` on a grid block that names the set's own center, in the ICRF axes the module answers in: [{r, v}] in km, km/s. */
async function sdngpGridStates(b, fit, object, chosen) {
  const grid = oemBytes({ originator: 'G1', block: { frame: 'ICRF', frameName: 'ICRF', center: fit.unpacked.CENTER_NAME ?? 'EARTH', timeSystem: 'UTC', object: { name: object.name, id: '', norad: object.norad },
    lines: chosen.map((l) => ({ epoch: l.epoch, r: [0, 0, 0], v: [0, 0, 0] })), start: chosen[0].epoch, stop: chosen.at(-1).epoch }, sizePrefixed: false });
  const prop = await b.sdngp.propagateGrid(fit.omm, grid);
  if (!prop.ok) throw new Error(`propagate: ${prop.error}`);
  if (prop.blocks[0].length !== chosen.length) throw new Error(`propagate returned ${prop.blocks[0].length} of ${chosen.length} states`);
  return prop.blocks[0].map((x) => ({ r: x.r, v: x.v }));
}

/** SDN-AP fitted to the first `fitSeconds` of an ephemeris from `startMs` and propagated to `epochsMs` in the named axes: [{r, v}], or { error }. */
export async function sdngpPredict(b, object, startMs, fitSeconds, epochsMs, axes = 'GCRF') {
  const stopFit = startMs + fitSeconds * 1000;
  const lines = slice(object, startMs, stopFit);
  let fit;
  try { fit = await b.sdngp.fit(sdngpOem(object, lines, stopFit), { weatherTable: b.weatherTable }); } catch (error) { return { error: String(error.message).slice(0, 200) }; }
  if (!fit.ok) return { error: fit.error };
  try { return await sdngpStates(b, fit.omm, ms(fit.unpacked.EPOCH), epochsMs, axes); } catch (error) { return { error: String(error.message).slice(0, 200) }; }
}

export async function fitSdngp(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay, { loweringLimit, defaultSpan = false } = {}) {
  const bytes = sdngpOem(object, lines, stopFit, { defaultSpan });
  if (loweringLimit !== undefined) b.sdngp.setLoweringLimit(loweringLimit); // amendment A9d: the 2c.2 rule on (0.5 m2/kg) or off (Infinity) for the fits that follow
  const t0 = performance.now();
  let fit;
  try { fit = await b.sdngp.fit(bytes, { weatherTable: b.weatherTable }); } catch (error) { return { ok: false, error: String(error.message).slice(0, 200) }; }
  const fitMs = performance.now() - t0;
  if (!fit.ok) return { ok: false, error: fit.error };
  const epochMs = ms(fit.unpacked.EPOCH);
  const axes = object.frame === 'EME2000' ? 'EME2000' : 'GCRF';
  const spanMatch = /span ([\d.]+) h \(([^)]*)\)/.exec(fit.comment ?? '');
  const fromMatch = /states fitted from ([\d.]+) h/.exec(fit.comment ?? ''); // a segment set's comment names where in the arc its segment starts (the epoch carried past a maneuver); the arc runs from the block's first state to the fit end
  const spanHours = spanMatch ? Number(spanMatch[1]) : fromMatch ? (stopFit - ms(lines[0].epoch)) / 3600e3 - Number(fromMatch[1]) : (stopFit - startMs) / 3600e3, spanSource = spanMatch ? spanMatch[2] : fromMatch ? 'segment' : null;
  const regime = fit.params.SDNGP_REGIME ?? null;
  const segment = regime === 'CISLUNAR' || regime === 'HELIO'; // amendment A9h: a far block the build fits as a segment set; the batch entry refuses it, so its states come from `propagate` on a grid
  const ricOf = segment
    ? async (chosen) => rtnSeries(b, await sdngpGridStates(b, fit, object, chosen), chosen)
    : async (chosen) => rtnSeries(b, await sdngpStates(b, fit.omm, epochMs, chosen.map((l) => ms(l.epoch)), axes), chosen); // predicted states (module) -> the truth's axes (foundation/frames) -> pair_statistics RTN
  const thinned = (list) => { const step = list.length > 1 ? (ms(list[1].epoch) - ms(list[0].epoch)) / 1000 : 60; const every = Math.max(1, Math.round(RTN_STRIDE_SECONDS / step)); return list.filter((_, i) => i % every === 0); };
  let fitRic = null, days = {}, usPerState = null;
  try {
    if (!segment) { // a segment set is not propagated backward in time: no fit-span split for it
      const fitFrom = defaultSpan ? stopFit - spanHours * 3600e3 - 1 : -Infinity; // the span the module's rule chose; a declared span is every state up to the fit end, as before
      const fitLines = thinned(lines.filter((l) => ms(l.epoch) <= stopFit && ms(l.epoch) >= fitFrom));
      const fitSeries = await ricOf(fitLines);
      fitRic = [0, 1, 2].map((c) => rms(fitSeries.map((e) => e[c])));
    }
    const held = lines.filter((l) => ms(l.epoch) > stopFit);
    if (held.length) {
      const chosen = thinned(held);
      const t1 = performance.now();
      const series = await ricOf(chosen);
      usPerState = ((performance.now() - t1) * 1000) / chosen.length;
      const byDay = {};
      series.forEach((e, i) => { const k = dayOf(ms(chosen[i].epoch), stopFit, leadDays); if (k) (byDay[k] ??= []).push(e); });
      const stepSeconds = held.length > 1 ? (ms(held[1].epoch) - ms(held[0].epoch)) / 1000 : 60;
      for (const [k, e] of Object.entries(byDay)) {
        const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c])));
        if (e.length * Math.max(1, Math.round(RTN_STRIDE_SECONDS / stepSeconds)) >= minStatesPerDay) days[k] = { rmsKm: Math.hypot(...ric), n: e.length, ric };
      }
    }
  } catch (error) { return { ok: false, error: `ric: ${String(error.message).slice(0, 160)}`, fitRmsKm: fit.fitRmsKm }; }
  const p = fit.params;
  return {
    ok: true, converged: true, iterations: fit.iterations, fitRmsKm: fit.fitRmsKm, fitStates: fit.statesFitted, fitRic, days,
    elementBytes: fit.minimal.length, recordBytes: fit.omm.length, parameters: 10, fitMs, usPerState, // six elements, signed B_eff, AGOM, tauc, taus (tau0 replaces B_eff above 0.5 m2/kg)
    lowering: Number(p.SDNGP_LOWERING ?? 0), bEff: Number(p.SDNGP_B_EFF), bEffSigma: Number(p.SDNGP_B_EFF_SIGMA), kappa: p.SDNGP_KAPPA === undefined ? null : Number(p.SDNGP_KAPPA), tau0: Number(p.SDNGP_TAU0), tauc: Number(p.SDNGP_TAUC), taus: Number(p.SDNGP_TAUS),
    agom: fit.unpacked.MEAN_MOTION_DDOT, meanMotion: fit.unpacked.MEAN_MOTION, inclination: fit.unpacked.INCLINATION, eccentricity: fit.unpacked.ECCENTRICITY, heldOutRmsKm: fit.heldOutRmsKm,
    module: b.sdngp.provenance.wasmSha256.slice(0, 12), spanHours, spanSource,
    ...(segment ? { regime, maneuverBeforeSeconds: p.SDNGP_MANEUVER_BEFORE_SECONDS === undefined ? null : Number(p.SDNGP_MANEUVER_BEFORE_SECONDS) } : {}),
  };
}

/** One fit window scored by both baselines. Returns null when the ephemeris cannot supply the fit interval. */
export async function scoreWindow(b, object, startMs, { fitSeconds, leadDays, minCoverage = 0.9, fixedBstar, arms = 'both', sdngp = false, loweringLimit, defaultSpan = false }) {
  const stopFit = startMs + fitSeconds * 1000;
  const lines = slice(object, defaultSpan ? Math.max(object.t[0], stopFit - 120 * 3600e3) : startMs, stopFit + Math.max(...leadDays) * DAY); // defaultSpan (A9f): the truth from 120 h before the fit end, the module chooses its span
  if (lines.length < 20) return null;
  const gaps = lines.slice(1, 60).map((l, i) => ms(l.epoch) - ms(lines[i].epoch)).sort((a, c) => a - c); // median spacing: some kernels sample irregularly
  const stepSeconds = gaps[Math.floor(gaps.length / 2)] / 1000;
  const minStatesPerDay = Math.floor((minCoverage * 86400) / stepSeconds);
  const xp = arms === 'sgp4' || arms === 'sdngp' ? null : await fitXp(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay);
  const sgp4 = arms === 'xp' || arms === 'sdngp' ? null : await fitSgp4(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay, fixedBstar);
  const sdngpResult = sdngp || arms === 'sdngp' ? await fitSdngp(b, object, lines, startMs, stopFit, leadDays, minStatesPerDay, { loweringLimit, defaultSpan }) : undefined;
  return { source: object.source + (defaultSpan ? '+default' : ''), id: object.id, norad: object.norad, startUtc: iso(startMs), fitSeconds, stepSeconds, states: lines.length, xp, sgp4, ...(sdngpResult === undefined ? {} : { sdngp: sdngpResult }) };
}

/** The two fitted element sets of a window as the modules return them ($OMM payloads), for propagation to other epochs. */
export async function fitElementSets(b, object, startMs, fitSeconds) {
  const stopFit = startMs + fitSeconds * 1000;
  const lines = slice(object, startMs, stopFit);
  const out = { xp: null, sgp4: null };
  try { out.xp = (await b.xp.call('fit', [frame('ephemeris', 'OEM', block(object, lines, { useableStart: lines[0].epoch, useableStop: iso(stopFit) }))])).elements; } catch { /* reported as null */ }
  try {
    out.sgp4 = (await b.gem.call('fit_elements', [frame('ephemeris', 'OEM', block(object, lines, {})),
      b.erm.frame('options', 'fitOptions', { from: iso(startMs), to: iso(stopFit), epoch: 'first', fitBstar: true, closure: false })])).elements;
  } catch { /* reported as null */ }
  return out;
}

/** A set ($OMM payload) propagated by propagator/sgp4-xp to the given epochs (ms) in the named axes ('EME2000', 'GCRF'): [{r, v}] in km, km/s. */
export async function propagateSet(b, payload, epochsMs, axes = 'EME2000') {
  const grid = oemBytes({ block: { frame: axes, object: { name: 'grid', norad: 0 }, lines: epochsMs.map((t) => ({ epoch: iso(t), r: [0, 0, 0], v: [0, 0, 0] })), start: iso(epochsMs[0]), stop: iso(epochsMs.at(-1)) } });
  const prop = await b.xp.call('propagate', [ommFrame('omm', payload), frame('grid', 'OEM', grid)]);
  return blockLines(readOem(prop.ephemeris).EPHEMERIS_DATA_BLOCK[0]);
}

/** The radial / in-track / cross-track error (km) of each predicted state against its truth state ([{r, v}], same axes and epochs), by pair_statistics. */
export async function rtnSeries(b, predicted, truth) {
  const pairs = predicted.map((p, i) => ({ id: String(i), predicted: { position: p.r, velocity: p.v, covariance: PLACEHOLDER_COVARIANCE, covarianceAxes: 'INERTIAL' }, truth: { position: truth[i].r, velocity: truth[i].v } }));
  return b.erm.decode((await b.gem.call('pair_statistics', [b.erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs })])).statistics).pairs.map((s) => s.errorRtn);
}

/** Radial / in-track / cross-track RMS (km) of predicted states against truth states (same axes, same epochs), by pair_statistics. */
export async function compareStates(b, predicted, truth) {
  const series = await rtnSeries(b, predicted, truth);
  const ric = [0, 1, 2].map((c) => rms(series.map((e) => e[c])));
  return { n: series.length, rmsKm: Math.hypot(...ric), ric, inTrackMeanKm: series.reduce((s, x) => s + x[1], 0) / series.length };
}
