// XM2's FFM arms (PLAN.md, Arms, Fit, Environment): analysis/estimation 0.6.0 fit_batch version 3 answered by propagator/ffm 2.0.4
// through harness/ffm-fit-v3.mjs (fitV3; the forecast is propagateV3's request, its samples decoded with their time system), both wasm read with git show at build.json's commit and SHA-256 checked, hosted
// by the experiments' space-data-module-sdk browser-module harness (as C2 and B2 A12 host them); the environment frames:
//   kernel             DE440s (harness/prw.mjs kernelFrame), SHA-256 checked
//   earth_orientation  B1's IERS finals rows (sdn-ap-baselines environment.json), sliced to the arc as B1's forArc slices them
//   space_weather      XM's $SPW rows of the condition as SDS SPW rows in one PRW SPACE_WEATHER table; condition O's last row held
//                      through D0 + 8 (the values sdn-ap's HOLD_LAST holds for X2)
//   density_correction XM's cached $DCL (F3 only)
// Encoding, decoding and routing only: the fit is analysis/estimation's, the dynamics propagator/ffm's.
import fs from 'node:fs';
import path from 'node:path';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { config, root, store, sha256, modulesRoot, pinned, harnessChecked, DAY, ms, dateOf } from '../common.mjs';

harnessChecked();
const { fitV3, estimationCodecV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
const { executionFrame } = await import(path.join(root, 'harness/ffm-execution.mjs'));
const { kernelFrame } = await import(path.join(root, 'harness/prw.mjs'));
const PRW_TYPE = { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW' };
const DCL_TYPE = { schemaName: 'DCL.fbs', fileIdentifier: '$DCL', rootTypeName: 'DCL' };
const E = config.environment, FIT = config.fit;
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

/** The rows of a condition as FFM reads them: O's last row repeated, every value, on each later day through D0 + 8 (PLAN.md). */
export function heldRows(rows, condition, cutoffMs) {
  if (condition !== 'O') return { rows, held: [] };
  const last = rows.at(-1), end = Date.parse(`${dateOf(cutoffMs)}T00:00:00Z`) + 8 * DAY;
  const out = [...rows], held = [];
  for (let t = Date.parse(`${last.date}T00:00:00Z`) + DAY; t <= end; t += DAY) { out.push({ ...last, date: dateOf(t) }); held.push(dateOf(t)); }
  return { rows: out, held };
}

/** XM's cached $DCL issued at `issueMs` (XM lib/dca.mjs dclAt's cache, read only): { ok, dcl, sha256 } or { ok: false, error }. */
export function cachedDcl(issueMs) {
  const file = path.join(config.xm.store, 'dcl', `${issueMs}.json`);
  if (!fs.existsSync(file)) throw new Error(`no cached $DCL for issue ${new Date(issueMs).toISOString()} in XM's store`);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!c.ok) return { ok: false, error: c.error };
  const dcl = new Uint8Array(Buffer.from(c.dcl, 'base64'));
  if (sha256(dcl) !== c.sha256) throw new Error(`XM's cached $DCL ${file} does not match its SHA-256`);
  return { ok: true, dcl, sha256: c.sha256 };
}

/** The fit settings of one object: profile P0 with its C2 seeds (config.fit). */
let seedsCache = null;
export function settingsFor(norad) {
  if (!seedsCache) {
    const raw = fs.readFileSync(path.join(root, FIT.seeds.file));
    if (sha256(raw) !== FIT.seeds.sha256) throw new Error(`${FIT.seeds.file} is not the registered ${FIT.seeds.sha256}`);
    seedsCache = new Map(JSON.parse(raw).objects.map((o) => [o.norad, o]));
  }
  const s = seedsCache.get(norad);
  if (!s || !(s.bSeed > 0) || !(s.agomSeed > 0)) throw new Error(`no C2 seed for ${norad}`);
  const parameters = [{ kind: 'DRAG_AREA_OVER_MASS', value: s.bSeed }, { kind: 'SRP_AREA_OVER_MASS', value: s.agomSeed }];
  const a = FIT.apriori;
  const diag = [...Array(3).fill(a.positionSigmaM ** 2), ...Array(3).fill(a.velocitySigmaMS ** 2), ...parameters.map((q) => (a.parameterFraction * q.value) ** 2)];
  const m = diag.length;
  return {
    sigmaM: FIT.measurement.sigmaM, parameters, fixed: {}, apriori: Array.from({ length: m * m }, (_, j) => (Math.floor(j / m) === j % m ? diag[j % m] : 0)),
    maximumIterations: FIT.maximumIterations, correctionTolerance: FIT.correctionTolerance, sigmaEditThreshold: FIT.sigmaEditThreshold, forces: FIT.forces, integrator: FIT.integrator,
  };
}

/** The F modules, opened once per worker: { arm(...), provenance, close }. */
export async function openFfm() {
  const modules = modulesRoot();
  const estimation = await host(modules, 'analysis/estimation'), ffm = await host(modules, 'propagator/ffm');
  const { FIT_PARAMETER_DOMAINS: domains } = await import(path.join(modules, 'propagator/ffm/catalog-configuration.mjs'));
  const codec = await estimationCodecV3(modules, path.join(root, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const env = environment();
  const mjd = (t) => t / DAY + 40587;
  /** The frames of an arc [fromMs, toMs] with the condition's rows and optionally a $DCL. */
  const inputs = (fromMs, toMs, rows, dcl) => {
    const lo = fromMs - 2 * DAY, hi = toMs + 2 * DAY;
    const eop = env.eop.filter((r) => r.MJD >= mjd(lo) - 1 && r.MJD <= mjd(hi) + 1);
    const spw = rows.map((r) => Object.assign(new P.SPWT(), { DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
    return [
      env.kernel,
      { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: eop })) },
      { portId: 'space_weather', typeRef: PRW_TYPE, payload: encode('SPACE_WEATHER', Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: spw })) },
      ...(dcl ? [{ portId: 'density_correction', typeRef: DCL_TYPE, payload: dcl }] : []),
    ];
  };
  return {
    provenance: { estimation: estimation.provenance, ffm: ffm.provenance, kernelSha256: E.kernel.sha256, earthOrientationSha256: E.earthOrientation.sha256 },
    /**
     * One F arm: the fit of the thinned arc (lines [{epoch, r, v}] km, km/s, GCRF) and the forecast to `epochs` (ISO UTC, ascending).
     * Returns { ok, fit, states [{r, v}] km GCRF, fitMs, forecastMs } or { ok: false, error, fit?, fitMs, forecastMs? }.
     */
    async arm(norad, lines, epochs, rows, dcl) {
      const settings = settingsFor(norad);
      const ctx = { estimation, ffm, codec, domains, inputs: inputs(ms(lines[0].epoch), ms(epochs.at(-1)), rows, dcl) };
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

export { store };
