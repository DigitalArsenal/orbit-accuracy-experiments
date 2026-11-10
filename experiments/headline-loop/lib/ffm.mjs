// The numerical arms: propagator/ffm 2.2.0 (FFM_220) flown and analysis/estimation 0.7.0 (XM3's pin) fitting, each wasm by git show at its
// pinned commit and SHA-256 checked. lib/host.mjs and lib/fit.mjs, with two additions the reduced setting never needed: the ECOM2 terms in the
// request (FORCES.ECOM2) and the fit's parameter kinds by their PRW ordinals, so ECOM2 terms can be fitted (as the round-0 referee's ref-ffm.mjs).
// Encoding, decoding and routing only: every state is the module's.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REPO } from './env.mjs';

const OT = path.join(REPO, 'experiments/operator-theory');
const flatbuffers = await import('flatbuffers');
const P = await import('spacedatastandards.org/lib/js/PRW/main.js');
const { createBrowserModuleHarness } = await import('space-data-module-sdk/host/browser-module');
const XM3 = await import(path.join(OT, 'lib/xm3.mjs'));
const { FFM_220 } = await import(path.join(OT, 'lib/build.mjs'));
const { pinnedFile } = await import(path.join(OT, 'lib/ap.mjs'));
const { estimationCodecV3, boundsFrom } = await import(path.join(OT, 'lib/fit.mjs'));
const { decodeSamples, kernelFrame, encode } = await import(path.join(OT, 'lib/frame.mjs'));
const { EST_TYPE, decodeResult, positionObservation, seedStruct } = await import(path.join(REPO, 'experiments/e2-catalog-covariance/estimation-wire.mjs'));
const { estEpoch } = await import(path.join(REPO, 'experiments/e2-catalog-covariance/product.mjs'));
const { instant } = await import(path.join(REPO, 'harness/prw.mjs'));

const DAY = 86400000;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ms = (t) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);
const PRW_TYPE = { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW' };
const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
const vector = (v) => table('FRMVector3', { X: v[0], Y: v[1], Z: v[2] });
const gcrf = () => table('RFMCoordinateSystem', { NAME: 'GCRF', AXIS_TYPE: P.rfmAxisType.ICRF, AXIS_REFERENCE_BODY_ID: 399, ORIGIN: table('RFMOrigin', { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }) });
const ECOM_FIELD = { ECOM2_D0: 'D0_M_S2', ECOM2_Y0: 'Y0_M_S2', ECOM2_B0: 'B0_M_S2', ECOM2_D2_COS: 'D2_COS_M_S2', ECOM2_D2_SIN: 'D2_SIN_M_S2', ECOM2_D4_COS: 'D4_COS_M_S2', ECOM2_D4_SIN: 'D4_SIN_M_S2', ECOM2_B1_COS: 'B1_COS_M_S2', ECOM2_B1_SIN: 'B1_SIN_M_S2', ECOM2_B3_COS: 'B3_COS_M_S2', ECOM2_B3_SIN: 'B3_SIN_M_S2' };

/** lib/frame.mjs executionFrame, field for field, plus FORCES.ECOM2 from the request's ECOM2_* parameters. */
function executionFrame(request) {
  const f = request.forces, it = request.integrator;
  const value = (kind, fallback) => request.parameters.find((p) => p.kind === kind)?.value ?? fallback;
  const inTrack = value('IN_TRACK_ACCELERATION', request.fixed?.t);
  const ecom = request.parameters.filter((p) => ECOM_FIELD[p.kind]);
  const forces = table('PCFForceModel', {
    GRAVITY_CHOICE: P.pcfGravitySelection.SPHERICAL_HARMONICS, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: f.gm ?? 398600.4418e9,
    ENABLE_J2: false, ENABLE_J3: false, ENABLE_J4: false, ENABLE_HIGHER_ZONALS: false,
    MAXIMUM_DEGREE: f.degree, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: f.order, HAS_MAXIMUM_ORDER: true,
    ENABLE_THIRD_BODY: (f.thirdBodies ?? []).length > 0, THIRD_BODY_IDS: f.thirdBodies ?? [],
    ENABLE_SRP: !!f.srp, ENABLE_DRAG: !!f.drag, INITIAL_MASS_KG: 1, AREA_M2: 1,
    REFLECTIVITY_COEFFICIENT: value('SRP_AREA_OVER_MASS', request.fixed?.agom ?? 0), DRAG_COEFFICIENT: value('DRAG_AREA_OVER_MASS', request.fixed?.b ?? 0),
    ...(inTrack === undefined ? {} : { HAS_IN_TRACK_ACCELERATION_M_S2: true, IN_TRACK_ACCELERATION_M_S2: inTrack }),
    ATMOSPHERE_MODEL: P.pcfAtmosphereFamily[f.atmosphere ?? 'NRLMSISE00'], EPHEMERIS_SOURCE: 'JPL_SPK',
    SOLID_TIDES: f.solidTides ? P.pcfSolidTideModel.IERS_2010 : P.pcfSolidTideModel.NONE, RELATIVITY: P.pcfRelativityTerms[f.relativity ?? 'NONE'],
    ...(f.oceanTides ? { OCEAN_TIDES: P.pcfOceanTideModel.FES2004, OCEAN_TIDE_MAXIMUM_DEGREE: f.oceanDegree ?? 30 } : {}),
    ...(f.earthRadiation ? { EARTH_RADIATION: P.pcfEarthRadiationModel.KNOCKE } : {}),
    ...(ecom.length ? { RADIATION_PRESSURE_MODEL: P.pcfRadiationPressureFamily.CANNONBALL, ECOM2: table('PCFEcom2', Object.fromEntries(ecom.map((p) => [ECOM_FIELD[p.kind], p.value]))) } : {}),
  });
  const execution = table('PRWExecutionRequest', {
    INITIAL: table('PRWResidentState', { STATE: table('FRMStateVector', { REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vector(request.state.slice(0, 3)), VELOCITY: vector(request.state.slice(3, 6)), COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: request.epoch, EPOCH_TIME_SYSTEM: 'UTC' }), COORDINATE_SYSTEM: gcrf(), HAS_MASS_KG: false, MASS_KG: 0 }),
    TARGET_EPOCH: instant(request.samples.at(-1), 'UTC'),
    INTEGRATOR: table('PCFIntegratorSettings', { ALGORITHM: P.pcfIntegratorAlgorithm.RK78, INITIAL_STEP_SECONDS: 60, MINIMUM_STEP_SECONDS: it.minStep ?? 0.01, MAXIMUM_STEP_SECONDS: it.maxStep, ABSOLUTE_TOLERANCES: Array(6).fill(it.tolerance * 1000), RELATIVE_TOLERANCE: it.tolerance, MAXIMUM_STEPS: 1000000 }),
    FORCES: forces, INCLUDE_STM: !!request.stm, STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
    DENSITY_TREATMENT: f.drag ? P.prwDensityTreatment.FINITE_DIFFERENCE : P.prwDensityTreatment.NEGLECTED,
    DYNAMIC_PARAMETERS: request.parameters.map((p) => P.prwDynamicParameter[p.kind]), INITIAL_COVARIANCE: null, PROCESS_NOISE: null,
    SAMPLE_EPOCHS: request.samples.map((s) => instant(s, 'UTC')),
  });
  return { portId: 'request', typeRef: PRW_TYPE, payload: encode('EXECUTION_REQUEST', execution) };
}

// ---- settings: lib/settings.mjs (the referee's arms by name) ----
import { SETTINGS } from './settings.mjs';
export { apriori, SETTINGS, CONFIGURED, reducedFor } from './settings.mjs';

const KIND = (k) => { const v = P.prwDynamicParameter[k]; if (v === undefined) throw new Error(`no PRW dynamic parameter ${k}`); return v; };
const STATUS = { OK: 0, NEEDS_PROPAGATION: 1 };
const TERMINATION = ['CONVERGED', 'MAXIMUM_ITERATIONS', 'STALLED'];

export async function openFfm() {
  const modules = XM3.modulesRoot();
  const open = async (bytes, manifest, rel) => {
    const h = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
    return { sha: sha256(bytes), version: manifest.version, async invoke(methodId, inputs) { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${rel} ${methodId}: ${r.errorCode ?? r.statusCode}: ${r.errorMessage}`); return r; }, destroy: () => h.destroy() };
  };
  const est = XM3.pinned(modules, 'analysis/estimation');
  const estimation = await open(est.bytes, est.manifest, 'analysis/estimation');
  const ffmFile = pinnedFile('propagator/ffm', FFM_220);
  const ffm = await open(fs.readFileSync(ffmFile), JSON.parse(fs.readFileSync(path.join(path.dirname(ffmFile), 'plugin-manifest.json'), 'utf8')), 'propagator/ffm');
  if (ffm.sha !== FFM_220.wasmSha256) throw new Error('propagator/ffm is not 2.2.0 by hash');
  const { FIT_PARAMETER_DOMAINS: domains } = await import(pathToFileURL(path.join(modules, 'propagator/ffm/catalog-configuration.mjs')).href);
  const sdkDir = path.join(REPO, 'node_modules/space-data-module-sdk');
  const codec = await estimationCodecV3(modules, path.join(sdkDir, 'schemas/orbpro'));
  const E = XM3.config.environment;
  const kernelBytes = fs.readFileSync(E.kernel.path);
  if (sha256(kernelBytes) !== E.kernel.sha256) throw new Error('the DE440s kernel is not the registered one');
  const kernel = kernelFrame(kernelBytes);
  const raw = fs.readFileSync(E.earthOrientation.file);
  if (sha256(raw) !== E.earthOrientation.sha256) throw new Error('Earth orientation file is not the registered one');
  const eopRows = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(Buffer.from(JSON.parse(raw).inputs.earth_orientation_finals, 'base64')))).unpack().EARTH_ORIENTATION.ROWS;
  const mjd = (t) => t / DAY + 40587;
  const inputs = (fromMs, toMs, rows) => {
    const lo = mjd(fromMs - 2 * DAY) - 1, hi = mjd(toMs + 2 * DAY) + 1;
    const eop = eopRows.filter((r) => r.MJD >= lo && r.MJD <= hi);
    if (!eop.length || eop.at(-1).MJD < mjd(toMs)) throw new Error('Earth orientation ends early');
    return [kernel, { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: eop })) },
      ...(rows ? [{ portId: 'space_weather', typeRef: PRW_TYPE, payload: encode('SPACE_WEATHER', Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: rows.map((r) => Object.assign(new P.SPWT(), r)) })) }] : [])];
  };
  function decodeV3(bytes) { // lib/fit.mjs decodeV3
    const out = decodeResult(bytes);
    const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
    const field = (t, slot) => bb.__offset(t, 4 + 2 * slot);
    const root = bb.readInt32(bb.position()) + bb.position();
    const result = bb.__indirect(root + field(root, 1));
    const eo = field(result, 8);
    out.errorMessage = eo ? bb.__string(result + eo) : null;
    const fo = field(result, 12);
    if (fo && out.fit) { const t = bb.__indirect(result + fo); const at = (slot) => field(t, slot); out.fit.termination = TERMINATION[at(20) ? bb.readUint8(t + at(20)) : 0]; }
    return out;
  }
  return {
    provenance: { ffm: { version: ffm.version, sha256: ffm.sha }, estimation: { version: estimation.version, sha256: estimation.sha }, kernelSha256: E.kernel.sha256, eopSha256: E.earthOrientation.sha256 },
    /** lib/fit.mjs fitV3 with PRW-ordinal parameter kinds: the state at the arc's first epoch and the parameters, weighted at sigmaM. */
    async fit(lines, settings, spanEndMs, rows) {
      const env = inputs(ms(lines[0].epoch), spanEndMs, settings.forces.drag ? rows : null);
      const points = lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) }));
      const reference = { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) };
      const kinds = settings.parameters.map((p) => p.kind);
      const { lower, upper } = boundsFrom(domains, kinds);
      const variance = settings.sigmaM ** 2;
      const sorted = [...points].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
      const isoByLabel = new Map(sorted.map((p) => [JSON.stringify(estEpoch(p.time)), p.time]));
      const request = {
        config: { initial_epoch: estEpoch(reference.epoch), initial_state: reference.state, initial_covariance: Array(36).fill(0), process_noise_spectral_density: Array(6).fill(0), state_convergence_tolerance: 0, rms_convergence_tolerance: 0, sigma_edit_threshold: 0,
          dynamic_model_correlation_time_seconds: 0, maximum_iterations: 0, reference_frame: 'ICRF', estimator: 'BATCH_WEIGHTED_LEAST_SQUARES', process_noise: 'NONE', flags: 0 },
        extended_observations: sorted.map((p) => ({ observation: positionObservation(estEpoch(p.time), [0, 0, 0]), values: p.position, sigmas: [1, 1, 1] })),
        propagator_port_id: 'propagator/ffm', propagator_capability: 'plugin_propagate plugin_compute_stm',
        batch_options: { parameter_kinds: kinds.map(KIND), parameter_values: settings.parameters.map((p) => p.value), apriori_covariance: settings.apriori ?? [],
          observation_covariances: sorted.flatMap(() => [variance, 0, 0, 0, variance, 0, 0, 0, variance]), covariance_axes: 0, parameter_lower_bounds: lower, parameter_upper_bounds: upper,
          maximum_iterations: settings.maximumIterations, correction_tolerance: settings.correctionTolerance, sigma_edit_threshold: settings.sigmaEditThreshold },
      };
      const answers = [];
      for (let round = 0; ; round += 1) {
        if (round > settings.maximumIterations + 2) throw new Error('fit_batch kept asking for propagation');
        const response = await estimation.invoke('fit_batch', [{ portId: 'request', typeRef: EST_TYPE, payload: codec.encode({ request, propagation_answers: answers }) }]);
        const out = decodeV3(response.outputs.find((o) => o.portId === 'result').payload);
        if (out.status !== STATUS.NEEDS_PROPAGATION) {
          const f = out.fit;
          if (!f || !f.estimate?.length) throw new Error(out.errorMessage ?? `fit_batch status ${out.status}`);
          return { ok: out.status === STATUS.OK && f.termination === 'CONVERGED', termination: f.termination, epoch: reference.epoch, state: f.estimate.slice(0, 6), parameters: kinds.map((kind, i) => ({ kind, value: f.estimate[6 + i] })),
            weightedRms: f.weightedRms, iterations: f.iterations, measurements: f.measurementCount };
        }
        const q0 = out.queries[0];
        const parameters = kinds.map((kind, i) => ({ kind, value: q0.parameter_values[i] }));
        const epochs = [...new Set(out.queries.map((q) => isoByLabel.get(JSON.stringify(q.target_epoch))))];
        const query = (q) => ({ sequence: q.sequence, seed: seedStruct(q), target_epoch: q.target_epoch, parameter_values: q.parameter_values });
        let samples;
        try { samples = decodeSamples(await ffm.invoke('invoke', [executionFrame({ epoch: reference.epoch, state: q0.seed.state, samples: epochs, forces: settings.forces, parameters, fixed: settings.fixed ?? {}, stm: true, integrator: settings.integrator }), ...env])); }
        catch (error) { const refusal = String(error.message).slice(0, 300); for (const q of out.queries) answers.push({ query: query(q), refused: true, refusal }); continue; }
        const byEpoch = new Map(epochs.map((e, i) => [e, samples[i]]));
        for (const q of out.queries) {
          const s = byEpoch.get(isoByLabel.get(JSON.stringify(q.target_epoch))), n = s.n, stm = [], sensitivity = [];
          for (let i = 0; i < 6; i += 1) { for (let j = 0; j < 6; j += 1) stm.push(s.stm[i * n + j]); for (let j = 6; j < n; j += 1) sensitivity.push(s.stm[i * n + j]); }
          answers.push({ query: query(q), sample: { epoch: q.target_epoch, state: s.state, stm }, sensitivity });
        }
      }
    },
    /** The fitted product flown to `epochs` (ISO UTC, ascending, at most 9,000 a call): [{ r, v }] km GCRF. */
    async forecast(product, epochs, settings, rows) {
      const out = [];
      for (let i = 0; i < epochs.length; i += 9000) {
        const chunk = epochs.slice(i, i + 9000);
        const samples = decodeSamples(await ffm.invoke('invoke', [executionFrame({ epoch: product.epoch, state: product.state, samples: chunk, forces: settings.forces, parameters: product.parameters, fixed: settings.fixed ?? {}, stm: false, integrator: settings.integrator }), ...inputs(ms(product.epoch), ms(chunk.at(-1)), settings.forces.drag ? rows : null)]));
        if (samples.length !== chunk.length) throw new Error(`forecast: ${samples.length} of ${chunk.length} states`);
        out.push(...samples.map((x) => ({ r: x.state.slice(0, 3).map((v) => v / 1000), v: x.state.slice(3, 6).map((v) => v / 1000) })));
      }
      return out;
    },
    async close() { await estimation.destroy(); await ffm.destroy(); },
  };
}
