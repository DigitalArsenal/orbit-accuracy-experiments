// F arms: XM3's fit and forecast, its settings and drivers imported unchanged (experiments/ffm-atmosphere-xm3 lib/ffm.mjs settingsFor, driverRows), its pinned analysis/estimation and propagator/ffm,
// harness/ffm-fit-v3.mjs fitV3 and harness/ffm-execution.mjs. Encoding, decoding and routing only: the fit is analysis/estimation's, the dynamics propagator/ffm's.
import fs from 'node:fs';
import path from 'node:path';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { root, store, DAY, HOUR } from '../common.mjs';

process.env.XM3_STORE = store;
const XM3 = path.join(root, 'experiments/ffm-atmosphere-xm3');
const C = await import(path.join(XM3, 'common.mjs'));
const F = await import(path.join(XM3, 'lib/ffm.mjs'));
export const { settingsFor, driverRows } = F;
const { fitV3, estimationCodecV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
const { kernelFrame } = await import(path.join(root, 'harness/prw.mjs'));
const { executionFrame } = await import(path.join(root, 'harness/ffm-execution.mjs'));
const PRW_TYPE = { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW' }, DCL_TYPE = { schemaName: 'DCL.fbs', fileIdentifier: '$DCL', rootTypeName: 'DCL' };
const E = C.config.environment;
const ms = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);
function encode(arm, value) { const b = new flatbuffers.Builder(1 << 16); P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { [arm]: value }).pack(b)); return b.asUint8Array().slice(); }
async function host(modules, rel) {
  const { bytes, manifest } = C.pinned(modules, rel), harness = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
  return { provenance: { path: rel, version: manifest.version, wasmSha256: C.sha256(bytes) }, async invoke(methodId, inputs) { const r = await harness.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${rel} ${methodId}: ${r.errorCode ?? r.statusCode}: ${r.errorMessage}`); return r; }, destroy: () => harness.destroy() };
}
function environment() {
  const raw = fs.readFileSync(E.earthOrientation.file);
  if (C.sha256(raw) !== E.earthOrientation.sha256) throw new Error('earth orientation');
  const saved = JSON.parse(raw), eop = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(Buffer.from(saved.inputs.earth_orientation_finals, 'base64')))).unpack().EARTH_ORIENTATION.ROWS;
  const kernelBytes = fs.readFileSync(E.kernel.path);
  if (C.sha256(kernelBytes) !== E.kernel.sha256) throw new Error('kernel');
  return { eop, kernel: kernelFrame(kernelBytes), kernelBytes };
}
export async function openFit() {
  const modules = C.modulesRoot();
  let estimation = await host(modules, 'analysis/estimation'), ffm = await host(modules, 'propagator/ffm');
  const { FIT_PARAMETER_DOMAINS: domains } = await import(path.join(modules, 'propagator/ffm/catalog-configuration.mjs'));
  const codec = await estimationCodecV3(modules, path.join(root, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const env = environment(), mjd = (t) => t / DAY + 40587;
  const earthFrame = (fromMs, toMs) => encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: env.eop.filter((r) => r.MJD >= mjd(fromMs - 2 * DAY) - 1 && r.MJD <= mjd(toMs + 2 * DAY) + 1) }));
  const weatherFrame = (rows) => encode('SPACE_WEATHER', Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: rows.map((r) => Object.assign(new P.SPWT(), { DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })) }));
  const inputs = (fromMs, toMs, rows, dcl) => [env.kernel, { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: earthFrame(fromMs, toMs) }, { portId: 'space_weather', typeRef: PRW_TYPE, payload: weatherFrame(rows) }, ...(dcl ? [{ portId: 'density_correction', typeRef: DCL_TYPE, payload: dcl }] : [])];
  return {
    provenance: { estimation: estimation.provenance, ffm: ffm.provenance }, env, earthFrame, weatherFrame,
    /** One fit of a thinned arc; horizonMs ends the Earth-orientation slice. */
    async fit(norad, lines, rows, dcl, horizonMs) {
      const settings = settingsFor(norad), ctx = { estimation, ffm, codec, domains, inputs: inputs(ms(lines[0].epoch), horizonMs, rows, dcl) };
      const points = lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference = { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) };
      const t0 = performance.now(), f = await fitV3(ctx, points, reference, settings), fitMs = performance.now() - t0;
      const out = { ok: !!f.ok, termination: f.termination ?? null, error: f.error ?? null, iterations: f.iterations ?? null, ffmCalls: f.ffmCalls ?? null, reducedChiSquare: f.reducedChiSquare ?? null, weightedRms: f.weightedRms ?? null, measurements: f.measurements ?? null, rejected: f.rejected ?? null, boundStatus: f.boundStatus ?? null, fitMs };
      if (f.parameters) { out.B = f.parameters[0].value; out.AGOM = f.parameters[1].value; out.state = f.state; out.epoch = f.epoch; out.parameters = f.parameters; }
      return out;
    },
    /** XM3's forecast request from a fit: GCRF states [{r, v}] km at `epochs`. */
    async forecast(norad, fit, firstMs, epochs, rows, dcl, horizonMs) {
      const settings = settingsFor(norad);
      const response = await ffm.invoke('invoke', [executionFrame({ epoch: fit.epoch, state: fit.state, samples: epochs, forces: settings.forces, parameters: fit.parameters, fixed: settings.fixed ?? {}, stm: false, covariance: null, noise: null, integrator: settings.integrator }), ...inputs(firstMs, horizonMs, rows, dcl)]);
      const out = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(response.outputs.find((o) => o.portId === 'response').payload))).unpack();
      if (!out.EXECUTION_RESULT) throw new Error('propagator/ffm: no execution result');
      const samples = out.EXECUTION_RESULT.SAMPLES.map((x) => { const st = x.STATE.STATE; return [st.POSITION.X, st.POSITION.Y, st.POSITION.Z]; });
      if (samples.length !== epochs.length) throw new Error(`forecast: ${samples.length} of ${epochs.length} states`);
      return samples.map((s) => s.map((v) => v / 1000));
    },
    /** A trajectory: GCRF metres and m/s at `epochs` from a state, under `forces`. */
    async trajectory({ epoch, state, parameters, forces, integrator, epochs, rows, fromMs, toMs }) {
      const response = await ffm.invoke('invoke', [executionFrame({ epoch, state, samples: epochs, forces, parameters, fixed: {}, stm: false, covariance: null, noise: null, integrator }), ...inputs(fromMs, toMs, rows, null)]);
      const out = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(response.outputs.find((o) => o.portId === 'response').payload))).unpack();
      return out.EXECUTION_RESULT.SAMPLES.map((x) => { const st = x.STATE.STATE; return [st.POSITION.X, st.POSITION.Y, st.POSITION.Z, st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z]; });
    },
    async reopen() { try { await estimation.destroy(); await ffm.destroy(); } catch { /* the trapped instance */ } estimation = await host(modules, 'analysis/estimation'); ffm = await host(modules, 'propagator/ffm'); },
    async close() { await estimation.destroy(); await ffm.destroy(); },
  };
}
export const HOURS72 = 72 * HOUR;
