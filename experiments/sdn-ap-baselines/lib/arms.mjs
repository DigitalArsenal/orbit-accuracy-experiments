// The three baseline arms of PLAN.md on one window, scored by G1's scorer. Requests are built and answers decoded here; every orbit,
// frame and error-axis computation is a module's (gp-error-model, propagator/sdn-ap, propagator/ffm, foundation/frames).
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config, g1Dir } from '../common.mjs';

const g1 = (name) => import(path.join(g1Dir, name));
const [B, W, F, S, PCF, FFM, PW, SP, RW] = await Promise.all(['lib/baselines.mjs', 'lib/windows.mjs', 'lib/frames.mjs', 'lib/sds.mjs', 'lib/pcf.mjs', 'lib/ffm.mjs', 'lib/pack-window.mjs', 'score-pack.mjs', 'regime-windows.mjs'].map(g1));
const { DAY, iso, ms, slice } = W;
// the SDK harness G1 runs its modules with (its own dependency, not this repository's root)
const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(g1Dir, 'package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
const T = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });
const OEM_FRAME = { EME2000: 'EME2000', GCRF: 'GCRF', ITRF: 'ITRF2000', TEME: 'TEMEOFDATE' }; // G1 lib/baselines.mjs
const LEAD = config.scoring.leadDays;
const THIN_S = config.scoring.thinSeconds;
const rms = (values) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const short = (error) => String(error?.message ?? error).slice(0, 200);
const packKind = (regime) => (regime.startsWith('moon-') ? 'moon' : regime.startsWith('cislunar-') ? 'cislunar' : 'helio');

/** Opens every module once: G1's baselines (gp-error-model, frames, the SDN-AP snapshot and its weather table), FFM's catalog helpers and environment. */
export async function openArms(modules) {
  const b = await B.openBaselines(modules, { sdngp: true });
  if (b.sdngp.provenance.wasmSha256 !== config.g1.sdnapWasmSha256) throw new Error(`SDN-AP snapshot ${b.sdngp.provenance.wasmSha256} is not the registered ${config.g1.sdnapWasmSha256}`);
  const g1Context = await FFM.loadEnvironment(modules, { archive: '/opt/data/sdn-archive', store: config.g1.store });
  const { ffmEnvironment } = await import('./environment.mjs');
  const extended = await ffmEnvironment(modules, g1Context); // amendment A1: the saved environment extended to the years of the older windows
  const catalog = g1Context.catalog;
  const kernelInput = g1Context.inputs.find((i) => i.portId === 'kernel');
  const ffmContextFor = (fromMs, toMs) => ({ ...g1Context, inputs: extended.inputsFor(fromMs, toMs) });
  return { b, modules, ffmContextFor, catalog, kernelInput, environment: extended.provenance, close: () => b.close() };
}

// G1's thinning: one held-out state per THIN_S seconds by the first spacing of the list (lib/baselines.mjs fitSdngp)
const thinned = (list) => { const step = list.length > 1 ? (ms(list[1].epoch) - ms(list[0].epoch)) / 1000 : 60; const every = Math.max(1, Math.round(THIN_S / step)); return { chosen: list.filter((_, i) => i % every === 0), every }; };
const axesOf = (object) => (object.frame === 'EME2000' ? 'EME2000' : 'GCRF');

/** The window's truth lines and the counting rule of G1's scoreWindow. */
export function earthWindow(object, w) {
  const startMs = ms(w.startUtc), stopFit = startMs + w.fitSeconds * 1000;
  const lines = slice(object, startMs, stopFit + Math.max(...LEAD) * DAY);
  const gaps = lines.slice(1, 60).map((l, i) => ms(l.epoch) - ms(lines[i].epoch)).sort((a, c) => a - c);
  const stepSeconds = gaps[Math.floor(gaps.length / 2)] / 1000;
  return { startMs, stopFit, lines, stepSeconds, minStatesPerDay: Math.floor((config.scoring.minimumCoverage * 86400) / stepSeconds) };
}

/** Predicted states ([{r, v}] in the truth's axes, from `predict(epochsMs)`) scored against the truth: fit RIC (when asked) and held-out days. */
async function scoreEarth(a, object, win, predict, { fit = true } = {}) {
  const { b } = a;
  const out = { fitRmsKm: null, fitRic: null, days: {} };
  if (fit) {
    const { chosen } = thinned(win.lines.filter((l) => ms(l.epoch) <= win.stopFit));
    const series = await B.rtnSeries(b, await predict(chosen.map((l) => ms(l.epoch))), chosen);
    out.fitRic = [0, 1, 2].map((c) => rms(series.map((e) => e[c])));
    out.fitRmsKm = Math.hypot(...out.fitRic);
  }
  const held = win.lines.filter((l) => ms(l.epoch) > win.stopFit);
  if (!held.length) return out;
  const { chosen, every } = thinned(held);
  const series = await B.rtnSeries(b, await predict(chosen.map((l) => ms(l.epoch))), chosen);
  const byDay = {};
  series.forEach((e, i) => { const t = ms(chosen[i].epoch); const k = LEAD.find((d) => t > win.stopFit + (d - 1) * DAY && t <= win.stopFit + d * DAY); if (k) (byDay[k] ??= []).push(e); });
  for (const [k, e] of Object.entries(byDay)) {
    const ric = [0, 1, 2].map((c) => rms(e.map((v) => v[c])));
    if (e.length * every >= win.minStatesPerDay) out.days[k] = { rmsKm: Math.hypot(...ric), n: e.length, ric };
  }
  return out;
}

/** States of a set ingested by the SDN-AP snapshot (any of its theories), TEME by the module, in `axes` by foundation/frames. */
async function sdnapStates(a, omm, epochsMs, axes) {
  const epochMs = ms(readEpoch(omm));
  const states = await a.b.sdngp.states(omm, epochsMs.map((t) => (t - epochMs) / 60000));
  const bad = states.find((x) => x.status !== 0);
  if (bad) throw new Error(`propagator/sdn-ap status ${bad.status}`);
  const out = [];
  for (let i = 0; i < epochsMs.length; i += 1) {
    const t = await F.transformState(a.b.frames, 'TEME', axes, iso(epochsMs[i]), [...states[i].r, ...states[i].v]);
    out.push({ r: t.slice(0, 3), v: t.slice(3, 6) });
  }
  return out;
}
function readEpoch(omm) {
  const bytes = new Uint8Array(omm);
  const prefixed = String.fromCharCode(...bytes.slice(8, 12)) === '$OMM';
  const rec = prefixed ? S.OMM.OMM.getSizePrefixedRootAsOMM(new S.flatbuffers.ByteBuffer(bytes)) : S.OMM.OMM.getRootAsOMM(new S.flatbuffers.ByteBuffer(bytes));
  return rec.EPOCH();
}

/** Arm 2: gp-error-model fit_elements on the fit interval, propagated by the SDN-AP snapshot's SGP4 (theory 0). */
export async function armSgp4(a, object, win) {
  const { b } = a;
  const block = S.oemBytes({ originator: object.originator ?? 'G1', creation: object.creation ?? '', block: { frame: OEM_FRAME[object.frame] ?? object.frame, timeSystem: object.timeSystem ?? 'UTC', object: { name: object.name, id: object.objectId ?? '', norad: object.norad }, lines: win.lines, start: win.lines[0].epoch, stop: win.lines.at(-1).epoch } });
  const t0 = performance.now();
  let fit, f;
  try {
    fit = await b.gem.call('fit_elements', [S.frame('ephemeris', 'OEM', block), b.erm.frame('options', 'fitOptions', { from: iso(win.startMs), to: iso(win.stopFit), epoch: config.sgp4.epoch, fitBstar: config.sgp4.fitBstar, closure: config.sgp4.closure })]);
    f = b.erm.decode(fit.report).fits?.[0];
  } catch (error) { return { ok: false, error: short(error) }; }
  const fitMs = performance.now() - t0;
  if (!f || !f.converged) return { ok: false, error: f?.error ?? 'not converged', fitMs };
  try {
    const scored = await scoreEarth(a, object, win, (epochs) => sdnapStates(a, fit.elements, epochs, axesOf(object)));
    return { ok: true, converged: true, iterations: f.iterations, moduleFitRmsKm: f.rms.rms3dKm, ...scored, fitMs, bstar: S.readOmm(fit.elements).BSTAR };
  } catch (error) { return { ok: false, error: `score: ${short(error)}`, fitMs }; }
}

/** Arm 3: propagator/sdn-ap fit THEORY SGP4XP on G1's SDN-AP block, propagated by the same module. */
export async function armSgp4xp(a, object, win) {
  const { b } = a;
  const inputs = [{ portId: 'ephemeris', typeRef: T('OEM'), payload: B.sdngpOem(object, win.lines, win.stopFit) }, { portId: 'configuration', typeRef: PCF.PCF_TYPE, payload: PCF.pcfBytes({ theory: config.sgp4xp.theory }) }];
  if (b.weatherTable) inputs.push({ portId: 'space_weather_table', typeRef: T('PRW'), payload: b.weatherTable });
  const t0 = performance.now();
  let r;
  try { r = await b.sdngp.raw.h.invoke({ methodId: 'fit', inputs }); } catch (error) { return { ok: false, error: short(error) }; }
  const fitMs = performance.now() - t0;
  if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}`, fitMs };
  const omm = new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
  const unpacked = S.OMM.OMM.getRootAsOMM(new S.flatbuffers.ByteBuffer(omm)).unpack();
  const comment = unpacked.COMMENT ?? '';
  const num = (re) => { const m = re.exec(comment); return m ? Number(m[1]) : null; };
  try {
    const scored = await scoreEarth(a, object, win, (epochs) => sdnapStates(a, omm, epochs, axesOf(object)));
    return { ok: true, theory: unpacked.MEAN_ELEMENT_THEORY ?? null, iterations: num(/(\d+) iterations/), moduleFitRmsKm: num(/fit RMS ([\d.]+) km/), ...scored, fitMs, bterm: unpacked.BSTAR, agom: unpacked.MEAN_MOTION_DDOT };
  } catch (error) { return { ok: false, error: `score: ${short(error)}`, fitMs }; }
}

/** The truth state at E: the last state at or before the fit end. */
function startState(lines, stopFit) {
  let s = null;
  for (const l of lines) { if (ms(l.epoch) <= stopFit) s = l; else break; }
  return s;
}

/** FFM's area-to-mass values for an object (config.ffm): a laser-ranged sphere's from its published mass and diameter, else the a priori values. */
export function ffmParameters(norad) {
  const s = config.ffm.spheres[String(norad)];
  if (!s) return { cdAm: config.ffm.aPriori.cdAm, crAm: config.ffm.aPriori.crAm, basis: 'a priori' };
  const area = Math.PI * (s.diameterM / 2) ** 2;
  return { cdAm: (config.ffm.sphereCd * area) / s.massKg, crAm: (s.cr * area) / s.massKg, basis: `sphere ${s.name}` };
}

/** Arm 4, Earth-centered: the catalog full-force request from the truth state at E to the held-out epochs. */
export async function armFfmEarth(a, object, win, { cdAm, crAm, basis } = ffmParameters(object.norad)) {
  const s = startState(win.lines, win.stopFit);
  if (!s) return { ok: false, error: 'no truth state at or before the fit end' };
  const axes = axesOf(object);
  const gcrf = axes === 'GCRF' ? [...s.r, ...s.v] : await F.transformState(a.b.frames, axes, 'GCRF', s.epoch, [...s.r, ...s.v]);
  const t0 = performance.now();
  try {
    const predict = async (epochs) => {
      const res = await FFM.propagate(a.modules, a.ffmContextFor(ms(s.epoch), epochs.at(-1)), { epoch: s.epoch, state: gcrf.map((x) => x * 1000), cdAm, crAm, epochs });
      const out = [];
      for (const sample of res.samples) {
        const km = sample.state.map((x) => x / 1000);
        const t = axes === 'GCRF' ? km : await F.transformState(a.b.frames, 'GCRF', axes, iso(sample.ms), km);
        out.push({ r: t.slice(0, 3), v: t.slice(3, 6) });
      }
      return out;
    };
    const scored = await scoreEarth(a, object, win, predict, { fit: false });
    return { ok: true, ...scored, startOffsetSeconds: (win.stopFit - ms(s.epoch)) / 1000, cdAm, crAm, basis, wallMs: performance.now() - t0 };
  } catch (error) { return { ok: false, error: short(error), cdAm, crAm, basis }; }
}

/** Arm 4, Moon-centered (config.ffm.moon): the request flies about the Moon from the pack's state at E; the states are scored by G1's score-pack. */
export async function armFfmMoon(a, w, loaded) {
  const { meta, object } = loaded;
  const rule = RW.RULES[w.source];
  const startMs = ms(w.startUtc), stopFit = startMs + w.fitHours * 3600e3;
  const thin = config.scoring.packThin[packKind(w.regime)];
  const heldAll = slice(object, stopFit + 1, stopFit + rule.leadDays.at(-1) * DAY);
  const held = heldAll.filter((_, i) => i % thin === 0).filter((l) => ms(l.epoch) <= stopFit + Math.max(...LEAD) * DAY);
  const s = startState(slice(object, startMs, stopFit), stopFit);
  if (!s || !held.length) return { ok: false, error: 'no start state or no held-out states' };
  const m = config.ffm.moon, c = a.catalog, P = c.prw;
  const tbl = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
  const axesName = PW.axesOf(meta) === 'ICRF' ? 'ICRF' : 'EME2000';
  const request = c.fullForceRequest({ epoch: s.epoch, state: [...s.r, ...s.v].map((x) => x * 1000), target: iso(ms(held.at(-1).epoch)), cdAm: 0, crAm: m.crAm, forces: {
    GRAVITY_CHOICE: P.pcfGravitySelection[m.gravity], GRAVITATIONAL_PARAMETER: 4902.7998069317e9, MAXIMUM_DEGREE: m.degree, MAXIMUM_ORDER: m.degree,
    THIRD_BODY_IDS: m.thirdBodyIds, ENABLE_DRAG: false, SOLID_TIDES: P.pcfSolidTideModel.NONE, RELATIVITY: P.pcfRelativityTerms.NONE,
    EARTH_RADIATION: P.pcfEarthRadiationModel.NONE, OCEAN_TIDES: P.pcfOceanTideModel.NONE, CENTRAL_BODY_NAIF_ID: m.centralBodyNaifId } });
  const frame = tbl('RFMCoordinateSystem', { NAME: axesName, AXIS_TYPE: axesName === 'ICRF' ? P.rfmAxisType.ICRF : P.rfmAxisType.MEAN_EQUATOR_EQUINOX_J2000, AXIS_REFERENCE_BODY_ID: m.centralBodyNaifId,
    ORIGIN: tbl('RFMOrigin', { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: m.centralBodyNaifId }) });
  request.INITIAL.COORDINATE_SYSTEM = frame;
  request.INITIAL.STATE.COORDINATE_SYSTEM_NAME = axesName;
  request.SAMPLE_EPOCHS = held.map((l) => c.instant(l.epoch));
  const dir = path.join(a.modules, 'propagator/ffm');
  const harness = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm')), manifest: JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'))), surface: 'direct' });
  const t0 = performance.now();
  try {
    const response = await harness.invoke({ methodId: 'invoke', inputs: [{ portId: 'request', typeRef: c.TYPE, payload: c.encode('EXECUTION_REQUEST', request) }, a.kernelInput] });
    if (response.statusCode !== 0) return { ok: false, error: `propagator/ffm: ${response.errorCode}: ${String(response.errorMessage).slice(0, 160)}` };
    const result = P.PRW.getSizePrefixedRootAsPRW(new S.flatbuffers.ByteBuffer(new Uint8Array(response.outputs.find((o) => o.portId === 'response').payload))).unpack().EXECUTION_RESULT;
    if (!result?.SAMPLES || result.SAMPLES.length !== held.length) return { ok: false, error: `FFM returned ${result?.SAMPLES?.length ?? 0} of ${held.length} states` };
    const predicted = result.SAMPLES.map((x, i) => { const v = x.STATE.STATE; return { epoch: held[i].epoch, r: ['X', 'Y', 'Z'].map((k) => v.POSITION[k] / 1000), v: ['X', 'Y', 'Z'].map((k) => v.VELOCITY[k] / 1000) }; });
    const scored = await SP.scorePack(a.b, { pack: w.source, startMs, fitHours: w.fitHours, leadDays: LEAD, predicted, predictedCenter: meta.center, loaded });
    const days = Object.fromEntries(Object.entries(scored.byDay).filter(([, d]) => d).map(([k, d]) => [k, { rmsKm: d.rmsKm, n: d.n, ric: d.ric, directKm: d.directKm }]));
    return { ok: true, fitRmsKm: null, days, matched: scored.matched, unmatched: scored.unmatched, startOffsetSeconds: (stopFit - ms(s.epoch)) / 1000, crAm: m.crAm, axes: axesName, wallMs: performance.now() - t0 };
  } catch (error) { return { ok: false, error: short(error) }; } finally { await harness.destroy(); }
}

export const notApplicable = (why) => ({ ok: false, notApplicable: true, error: why });
