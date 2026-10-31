// XM6's FFM arm: XM3's lib/ffm.mjs at 22313bf with three changes, and nothing else: `arm` takes its fit settings, so the arc and the prior can
// vary; no $DCL input (no arm here reads one); and it imports XM3's common.mjs, settingsFor and driverRows rather than holding them. The hosting,
// the environment frames, the fit and the forecast are XM3's: F2 through this file must equal XM3's stored rows byte for byte (PLAN.md, the proof).
// Encoding, decoding and routing only: the fit is analysis/estimation's, the dynamics propagator/ffm's.
import fs from 'node:fs';
import path from 'node:path';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { config, root, sha256, modulesRoot, pinned, harnessChecked, DAY, ms } from '../../ffm-atmosphere-xm3/common.mjs';
export { settingsFor, driverRows } from '../../ffm-atmosphere-xm3/lib/ffm.mjs';

harnessChecked();
const { fitV3, estimationCodecV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
const { executionFrame } = await import(path.join(root, 'harness/ffm-execution.mjs'));
const { kernelFrame } = await import(path.join(root, 'harness/prw.mjs'));
const PRW_TYPE = { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW' };
const E = config.environment;
const short = (e) => String(e?.message ?? e).slice(0, 300);
/** An ISO epoch label to milliseconds, sub-millisecond digits kept (propagator/ffm labels samples in TDB to the nanosecond). */
const labelMs = (text) => { const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?Z?$/.exec(String(text)); return m ? Date.parse(`${m[1]}Z`) + (m[2] ? Number(`0.${m[2]}`) * 1000 : 0) : NaN; };

function encode(arm, value) {
  const b = new flatbuffers.Builder(1 << 16);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { [arm]: value }).pack(b));
  return b.asUint8Array().slice();
}

/** A pinned module through the experiments' SDK harness: { provenance, invoke (throws on a non-zero status), destroy }. */
async function host(modules, rel) {
  const { bytes, manifest } = pinned(modules, rel);
  const harness = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
  return {
    provenance: { path: rel, version: manifest.version, wasmSha256: sha256(bytes) },
    async invoke(methodId, inputs) {
      const r = await harness.invoke({ methodId, inputs });
      if (r.statusCode !== 0) throw new Error(`${rel} ${methodId}: ${r.errorCode ?? r.statusCode}: ${r.errorMessage}`);
      return r;
    },
    destroy: () => harness.destroy(),
  };
}

/** B1's finals Earth orientation rows (decoded once) and the kernel frame (built once). */
function environment() {
  const raw = fs.readFileSync(E.earthOrientation.file);
  if (sha256(raw) !== E.earthOrientation.sha256) throw new Error(`${E.earthOrientation.file} is not the registered ${E.earthOrientation.sha256}`);
  const saved = JSON.parse(raw);
  const eop = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(Buffer.from(saved.inputs.earth_orientation_finals, 'base64')))).unpack().EARTH_ORIENTATION.ROWS;
  const kernelBytes = fs.readFileSync(E.kernel.path);
  if (sha256(kernelBytes) !== E.kernel.sha256) throw new Error(`${E.kernel.path} is not the registered ${E.kernel.sha256}`);
  return { eop, kernel: kernelFrame(kernelBytes) };
}

/** The F modules, opened once per worker: { arm(...), provenance, close }. */
export async function openFfm() {
  const modules = modulesRoot();
  const estimation = await host(modules, 'analysis/estimation'), ffm = await host(modules, 'propagator/ffm');
  const { FIT_PARAMETER_DOMAINS: domains } = await import(path.join(modules, 'propagator/ffm/catalog-configuration.mjs'));
  const codec = await estimationCodecV3(modules, path.join(root, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const env = environment();
  const mjd = (t) => t / DAY + 40587;
  /** The frames of an arc [fromMs, toMs] with the condition's rows. */
  const inputs = (fromMs, toMs, rows) => {
    const lo = fromMs - 2 * DAY, hi = toMs + 2 * DAY;
    const eop = env.eop.filter((r) => r.MJD >= mjd(lo) - 1 && r.MJD <= mjd(hi) + 1);
    const spw = rows.map((r) => Object.assign(new P.SPWT(), { DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
    return [
      env.kernel,
      { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: eop })) },
      { portId: 'space_weather', typeRef: PRW_TYPE, payload: encode('SPACE_WEATHER', Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: spw })) },
    ];
  };
  return {
    provenance: { estimation: estimation.provenance, ffm: ffm.provenance, kernelSha256: E.kernel.sha256, earthOrientationSha256: E.earthOrientation.sha256 },
    /**
     * One F arm under `settings`: the fit of the thinned arc (lines [{epoch, r, v}] km, km/s, GCRF) and the forecast to `epochs` (ISO UTC, ascending).
     * Returns { ok, fit, states [{r, v}] km GCRF, fitMs, forecastMs } or { ok: false, error, fit?, fitMs, forecastMs? }.
     */
    async arm(settings, lines, epochs, rows) {
      const ctx = { estimation, ffm, codec, domains, inputs: inputs(ms(lines[0].epoch), ms(epochs.at(-1)), rows) };
      const points = lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) }));
      const reference = { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) };
      const t0 = performance.now();
      let f;
      try { f = await fitV3(ctx, points, reference, settings); } catch (error) { return { ok: false, error: `fit: ${short(error)}`, fitMs: performance.now() - t0 }; }
      const fitMs = performance.now() - t0;
      const fit = { termination: f.termination ?? null, status: f.status ?? null, error: f.error ?? null, iterations: f.iterations ?? null, rejectedTrials: f.rejectedTrials ?? null,
        refusedTrials: f.refusedTrials ?? null, refusal: f.refusal ?? null, ffmCalls: f.ffmCalls ?? null, refusedRounds: f.refusedRounds ?? null, parameters: f.parameters ?? null,
        boundStatus: f.boundStatus ?? null, reducedChiSquare: f.reducedChiSquare ?? null, weightedRms: f.weightedRms ?? null, measurements: f.measurements ?? null, rejected: f.rejected ?? null };
      if (!f.ok) return { ok: false, error: `fit: ${f.error ?? f.termination}`, fit, fitMs };
      // the forecast: harness/ffm-fit-v3.mjs propagateV3's request (the fit's forces, integrator, parameters and inputs; no STM), its
      // samples decoded with their time system: propagator/ffm labels each sample in TDB (prw_execution.cpp:87), so a sample is at its
      // requested UTC instant when every label lies one constant offset from its request (checked to 2 ms) and the system is TDB
      const t1 = performance.now();
      let samples;
      try {
        const response = await ffm.invoke('invoke', [executionFrame({ epoch: f.epoch, state: f.state, samples: epochs, forces: settings.forces, parameters: f.parameters, fixed: settings.fixed ?? {},
          stm: false, covariance: null, noise: null, integrator: settings.integrator }), ...ctx.inputs]);
        const frame = response.outputs.find((o) => o.portId === 'response');
        const out = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(frame.payload))).unpack();
        if (!out.EXECUTION_RESULT) throw new Error('propagator/ffm: no execution result');
        samples = out.EXECUTION_RESULT.SAMPLES.map((x) => { const st = x.STATE.STATE; return { epoch: st.EPOCH, system: st.EPOCH_TIME_SYSTEM, state: [st.POSITION.X, st.POSITION.Y, st.POSITION.Z, st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z] }; });
      } catch (error) { return { ok: false, error: `forecast: ${short(error)}`, fit, fitMs, forecastMs: performance.now() - t1 }; }
      const forecastMs = performance.now() - t1;
      if (samples.length !== epochs.length) return { ok: false, error: `forecast: ${samples.length} of ${epochs.length} states`, fit, fitMs, forecastMs };
      const offsets = samples.map((x, i) => labelMs(x.epoch) - ms(epochs[i]));
      const systems = [...new Set(samples.map((x) => x.system))];
      if (systems.length !== 1 || systems[0] !== 'TDB' || !offsets.every(Number.isFinite) || Math.max(...offsets) - Math.min(...offsets) > 2) {
        return { ok: false, error: `forecast: sample epochs ${systems.join(',')} offsets ${Math.min(...offsets)}..${Math.max(...offsets)} ms`, fit, fitMs, forecastMs };
      }
      const states = samples.map((x) => ({ r: x.state.slice(0, 3).map((v) => v / 1000), v: x.state.slice(3, 6).map((v) => v / 1000) }));
      fit.sampleLabel = { system: systems[0], offsetSeconds: offsets[0] / 1000 };
      return { ok: true, fit, states, fitMs, forecastMs };
    },
    async close() { await estimation.destroy(); await ffm.destroy(); },
  };
}

