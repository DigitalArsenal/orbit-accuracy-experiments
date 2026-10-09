// Record framing for the orbit-determination pages (SDS 1.240.0): $PRW for
// propagator/hpop, $FRM for foundation/frames, $ACW for analysis/access and
// analysis/observation-simulator, $OEM, $EOP and the observation records for
// analysis/association, $CQR for analysis/conjunction-assessment. Encoding,
// decoding and unit scaling (km <-> m) only: every orbit, frame, measurement
// and probability is a module's. Runs in the browser and, for the site build,
// in Node.
import * as flatbuffers from 'flatbuffers';
import * as S from 'spacedatastandards.org/lib/js/CQR/main.js';
import * as ACW from 'spacedatastandards.org/lib/js/ACW/main.js';
import * as RDO from 'spacedatastandards.org/lib/js/RDO/main.js';
import * as EOO from 'spacedatastandards.org/lib/js/EOO/main.js';
import * as RFO from 'spacedatastandards.org/lib/js/RFO/main.js';

export { S, ACW, RDO, EOO, RFO };

export const type = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
export const JSON_TYPE = { schemaName: 'application/json' };
function table(mod, name, fields = {}) {
  const object = new mod[`${name}T`]();
  for (const key of Object.keys(fields)) if (!(key in object)) throw new Error(`${name} has no field ${key}`);
  return Object.assign(object, fields);
}
export const t = (name, fields) => table(S, name, fields);
export const frame = (portId, code, payload) => ({ portId, typeRef: type(code), payload });
export const jsonFrame = (portId, value) => ({ portId, typeRef: JSON_TYPE, payload: new TextEncoder().encode(JSON.stringify(value)) });
export const out = (response, port) => response.outputs.find((o) => o.portId === port)?.payload;
export const outs = (response, port) => response.outputs.filter((o) => o.portId === port).map((o) => o.payload);
export const readJson = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

function finish(root, ident, { sizePrefixed = false, size = 1 << 16 } = {}) {
  const b = new flatbuffers.Builder(size);
  const offset = root.pack(b);
  if (sizePrefixed) b.finishSizePrefixed(offset, ident); else b.finish(offset, ident);
  return b.asUint8Array().slice();
}
const bb = (bytes) => new flatbuffers.ByteBuffer(new Uint8Array(bytes));
const prefixed = (bytes, ident) => bytes.length > 8 && String.fromCharCode(...bytes.slice(8, 12)) === ident;

// ── time ──
export const isoMicro = (ms) => new Date(ms).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000');
export const utcMs = (iso) => Date.parse(/Z$/.test(iso) ? iso : `${iso}Z`);
const instant = (iso, scale = 'UTC') => t('TIMInstant', { TIME_SYSTEM: S.timingStandard[scale], EPOCH_FORMAT: S.timEpochRepresentation.ISO8601, ISO8601: iso });

// ── frames ──
const origin = () => t('RFMOrigin', { KIND: S.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 });
export const gcrfSystem = () => t('RFMCoordinateSystem', { NAME: 'GCRF', AXIS_TYPE: S.rfmAxisType.ICRF, AXIS_REFERENCE_BODY_ID: 399, ORIGIN: origin() });
export const itrfSystem = () => t('RFMCoordinateSystem', { NAME: 'ITRF', AXIS_TYPE: S.rfmAxisType.BODY_FIXED, AXIS_REFERENCE_BODY_ID: 399, ORIGIN: origin() });
export const celestialFrame = (name) => t('RFM', { REFERENCE_FRAME_type: S.RFMUnion.CelestialFrameWrapper, REFERENCE_FRAME: t('CelestialFrameWrapper', { frame: S.CelestialFrame[name] }) });
const vector = (v, scale = 1) => t('FRMVector3', { X: v[0] * scale, Y: v[1] * scale, Z: v[2] * scale });

// foundation/frames STATE_TRANSFORM of one state (km, km/s) between GCRF and
// ITRF at a UTC instant; earthOrientation: $EOP frames.
export function frameTransformRequest({ from, to, epoch, position, velocity }) {
  const systems = { GCRF: gcrfSystem, ITRF: itrfSystem };
  const request = t('FRMFrameTransformRequest', {
    OPERATION: S.frmOperationCode.STATE_TRANSFORM,
    SOURCE_COORDINATE_SYSTEM: systems[from](), TARGET_COORDINATE_SYSTEM: systems[to](),
    SOURCE_STATE: t('FRMStateVector', { REPRESENTATION: S.frmStateRepresentation.CARTESIAN, POSITION: vector(position, 1000), VELOCITY: vector(velocity, 1000),
      COORDINATE_SYSTEM_NAME: from, EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC', GRAVITATIONAL_PARAMETER: 3.986004418e14 }),
    TARGET_REPRESENTATION: S.frmStateRepresentation.CARTESIAN, EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  return frame('request', 'FRM', finish(t('FRM', { FRAME_TRANSFORM_REQUEST: request }), '$FRM'));
}
export function decodeFrameTransform(bytes) {
  const r = S.FRM.getRootAsFRM(bb(bytes)).unpack().FRAME_TRANSFORM_RESULT;
  if (!r || r.STATUS !== S.frmResultStatus.OK) throw new Error(`foundation/frames: ${r?.ERROR_MESSAGE ?? 'no result'}`);
  const s = r.TARGET_STATE;
  return { position: ['X', 'Y', 'Z'].map((k) => s.POSITION[k] / 1000), velocity: ['X', 'Y', 'Z'].map((k) => s.VELOCITY[k] / 1000) };
}
// foundation/frames LLA_TO_PCPF on WGS-84: geodetic degrees and metres to
// Earth-fixed km.
export async function geodeticToItrf(frames, { lat, lon, alt }) {
  const request = t('FRMFrameTransformRequest', { OPERATION: S.frmOperationCode.LLA_TO_PCPF, POSITION: vector([lat * Math.PI / 180, lon * Math.PI / 180, alt]),
    EQUATORIAL_RADIUS_M: 6378137, POLAR_RADIUS_M: 6356752.314245179 });
  const response = await frames.invoke('transform_frame_position', [frame('request', 'FRM', finish(t('FRM', { FRAME_TRANSFORM_REQUEST: request }), '$FRM'))]);
  const r = S.FRM.getRootAsFRM(bb(response.outputs[0].payload)).unpack().FRAME_TRANSFORM_RESULT;
  if (!r || r.STATUS !== S.frmResultStatus.OK) throw new Error(`foundation/frames: ${r?.ERROR_MESSAGE ?? 'no result'}`);
  return ['X', 'Y', 'Z'].map((k) => r.POSITION[k] / 1000);
}
export const eopFrames = (rows) => rows.map((row) => frame('earth_orientation', 'EOP', finish(Object.assign(new S.EOPT(), row), '$EOP')));
export async function transformState(frames, eop, request) {
  const response = await frames.invoke('transform_frame_position', [frameTransformRequest(request), ...eop]);
  return decodeFrameTransform(response.outputs[0].payload);
}

// ── propagator/hpop ──
// request: {epoch (ISO UTC), position [km], velocity [km/s] (GCRF), samples [ISO UTC],
//   forces {degree, order, thirdBodies, srp, massKg, areaM2, cr}, stm (bool),
//   covariance [36] (km, km/s) | null, noisePsd [3] m^2/s^3 RTN | null,
//   kernel (bool: JPL SPK on the kernel port), tolerance}
export function executionFrame(request) {
  const f = request.forces ?? {};
  const sh = f.degree !== undefined;
  const scale = [1e3, 1e3, 1e3, 1e3, 1e3, 1e3];
  const covariance = request.covariance ? request.covariance.map((v, q) => v * scale[Math.floor(q / 6)] * scale[q % 6]) : null;
  const last = request.samples.reduce((m, s) => (utcMs(s) > utcMs(m) ? s : m), request.epoch);
  const execution = t('PRWExecutionRequest', {
    INITIAL: t('PRWResidentState', {
      STATE: t('FRMStateVector', { REPRESENTATION: S.frmStateRepresentation.CARTESIAN, POSITION: vector(request.position, 1000), VELOCITY: vector(request.velocity, 1000),
        COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: request.epoch, EPOCH_TIME_SYSTEM: 'UTC' }),
      COORDINATE_SYSTEM: gcrfSystem(), HAS_MASS_KG: f.massKg !== undefined, MASS_KG: f.massKg ?? 0,
    }),
    TARGET_EPOCH: instant(last),
    INTEGRATOR: t('PRWIntegratorSettings', { ALGORITHM: S.prwSolverAlgorithm.RK78, INITIAL_STEP_SECONDS: 60, MINIMUM_STEP_SECONDS: 0.01, MAXIMUM_STEP_SECONDS: 300,
      ABSOLUTE_TOLERANCES: Array(6).fill((request.tolerance ?? 1e-12) * 1000), RELATIVE_TOLERANCE: request.tolerance ?? 1e-12, MAXIMUM_STEPS: 1000000 }),
    FORCES: t('PRWForceConfiguration', {
      GRAVITY_CHOICE: sh ? S.prwGravitySelection.SPHERICAL_HARMONICS : S.prwGravitySelection.POINT_MASS, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 398600.4418e9,
      MAXIMUM_DEGREE: f.degree ?? 0, HAS_MAXIMUM_DEGREE: sh, MAXIMUM_ORDER: f.order ?? 0, HAS_MAXIMUM_ORDER: sh,
      ENABLE_THIRD_BODY: (f.thirdBodies ?? []).length > 0, THIRD_BODY_IDS: f.thirdBodies ?? [], ENABLE_SRP: !!f.srp, ENABLE_DRAG: false,
      INITIAL_MASS_KG: f.massKg ?? 1000, AREA_M2: f.areaM2 ?? 1, REFLECTIVITY_COEFFICIENT: f.cr ?? 1, DRAG_COEFFICIENT: 2.2,
      ATMOSPHERE_MODEL: S.prwAtmosphereFamily.NRLMSISE00, EPHEMERIS_SOURCE: request.kernel ? 'JPL_SPK' : 'Analytical',
      SOLID_TIDES: S.prwSolidTideModel.NONE, RELATIVITY: S.prwRelativityTerms.NONE,
    }),
    INCLUDE_STM: !!request.stm, STM_TECHNIQUE: S.prwDerivativeTechnique.ANALYTIC, DENSITY_TREATMENT: S.prwDensityTreatment.NEGLECTED,
    INITIAL_COVARIANCE: covariance ? t('PRWStateMatrix', { DIMENSION: 6, VALUES: covariance }) : null,
    PROCESS_NOISE: request.noisePsd ? t('PRWProcessNoise', { MODEL: S.prwProcessNoiseModel.WHITE_ACCELERATION, AXES: S.prwProcessNoiseAxes.RADIAL_TRANSVERSE_NORMAL,
      SPECTRAL_DENSITY_M2_S3: request.noisePsd, DISCRETIZATION_SECONDS: request.noiseInterval ?? 60 }) : null,
    SAMPLE_EPOCHS: request.samples.map((s) => instant(s)),
  });
  return frame('request', 'PRW', finish(t('PRW', { EXECUTION_REQUEST: execution }), '$PRW', { sizePrefixed: true, size: 1 << 18 }));
}

// Samples in request order: {epoch (the requested UTC text; HPOP reports
// its own scale, TT), position [km], velocity [km/s], stm [36] | null (SI,
// row-major, from the initial epoch), covariance [36] (km, km/s) | null}.
export function decodeExecution(response, requested) {
  const bytes = out(response, 'response');
  const root = S.PRW.getSizePrefixedRootAsPRW(bb(bytes)).unpack();
  if (!root.EXECUTION_RESULT) throw new Error('propagator/hpop: no execution result');
  const samples = root.EXECUTION_RESULT.SAMPLES;
  if (samples.length !== requested.length) throw new Error(`propagator/hpop: ${samples.length} samples for ${requested.length} requested`);
  const scale = [1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3];
  return samples.map((s, i) => {
    const st = s.STATE.STATE;
    const n = s.COVARIANCE?.DIMENSION ?? 6;
    return {
      epoch: requested[i], scaleEpoch: st.EPOCH, timeScale: st.EPOCH_TIME_SYSTEM,
      position: ['X', 'Y', 'Z'].map((k) => st.POSITION[k] / 1000),
      velocity: ['X', 'Y', 'Z'].map((k) => st.VELOCITY[k] / 1000),
      stm: s.STM ? s.STM.VALUES.slice() : null,
      covariance: s.COVARIANCE ? Array.from({ length: 36 }, (_, q) => s.COVARIANCE.VALUES[Math.floor(q / 6) * n + (q % 6)] * scale[Math.floor(q / 6)] * scale[q % 6]) : null,
    };
  });
}

// The Sun (NAIF 10) relative to the Earth, GCRF km, from HPOP's ephemeris
// at a TDB instant.
export function sunRequest(tdb) {
  return frame('request', 'PRW', finish(t('PRW', { EPHEMERIS_REQUEST: t('PRWEphemerisRequest', { EPOCH: instant(tdb, 'TDB'), TARGET_NAIF_ID: 10, CENTER_NAIF_ID: 399 }) }), '$PRW', { sizePrefixed: true }));
}
export function decodeSun(response) {
  const root = S.PRW.getSizePrefixedRootAsPRW(bb(out(response, 'response'))).unpack();
  const st = root.EPHEMERIS_RESULT.STATE.STATE;
  return { position: ['X', 'Y', 'Z'].map((k) => st.POSITION[k] / 1000), velocity: ['X', 'Y', 'Z'].map((k) => st.VELOCITY[k] / 1000) };
}

// ── $OEM ──
const COV = ['CX_X', 'CY_X', 'CY_Y', 'CZ_X', 'CZ_Y', 'CZ_Z', 'CX_DOT_X', 'CX_DOT_Y', 'CX_DOT_Z', 'CX_DOT_X_DOT', 'CY_DOT_X', 'CY_DOT_Y', 'CY_DOT_Z',
  'CY_DOT_X_DOT', 'CY_DOT_Y_DOT', 'CZ_DOT_X', 'CZ_DOT_Y', 'CZ_DOT_Z', 'CZ_DOT_X_DOT', 'CZ_DOT_Y_DOT', 'CZ_DOT_Z_DOT'];
export const lowerOf = (m) => { const l = []; for (let r = 0; r < 6; r++) for (let c = 0; c <= r; c++) l.push(m[r * 6 + c]); return l; };
export const fullOf = (l) => { const m = Array(36); let k = 0; for (let r = 0; r < 6; r++) for (let c = 0; c <= r; c++) { m[r * 6 + c] = l[k]; m[c * 6 + r] = l[k++]; } return m; };

// blocks: [{norad, objectId, name, comment, states: [{epoch, state[6]}], covariances: [{epoch, matrix[36]}]}], GCRF, km.
export function encodeOem(blocks, { originator = 'orbit-accuracy-experiments', creation = '2026-10-09T00:00:00Z', interpolation = 'LAGRANGE', degree = 7 } = {}) {
  const oem = new S.OEMT();
  oem.CCSDS_OEM_VERS = 3;
  oem.CREATION_DATE = creation;
  oem.ORIGINATOR = originator;
  oem.EPHEMERIS_DATA_BLOCK = blocks.map((b) => {
    const block = new S.ephemerisDataBlockT();
    block.COMMENT = b.comment ?? '';
    block.OBJECT = Object.assign(new S.CATT(), { NORAD_CAT_ID: b.norad ?? 0, OBJECT_ID: b.objectId ?? '', OBJECT_NAME: b.name ?? '' });
    block.CENTER_NAME = 'EARTH';
    block.REFERENCE_FRAME = celestialFrame('GCRF');
    block.COV_REFERENCE_FRAME = celestialFrame('GCRF');
    block.TIME_SYSTEM = S.timingStandard.UTC;
    block.START_TIME = b.states[0].epoch;
    block.STOP_TIME = b.states.at(-1).epoch;
    block.INTERPOLATION = interpolation;
    block.INTERPOLATION_DEGREE = degree;
    block.EPHEMERIS_DATA_LINES = b.states.map(({ epoch, state }) => Object.assign(new S.ephemerisDataLineT(), {
      EPOCH: epoch, X: state[0], Y: state[1], Z: state[2], X_DOT: state[3], Y_DOT: state[4], Z_DOT: state[5] }));
    block.COVARIANCE_MATRIX_LINES = (b.covariances ?? []).map(({ epoch, matrix }) => {
      const line = Object.assign(new S.covarianceMatrixLineT(), { EPOCH: epoch });
      lowerOf(matrix).forEach((v, i) => { line[COV[i]] = v; });
      return line;
    });
    return block;
  });
  return finish(oem, '$OEM', { size: 1 << 20 });
}

export function decodeOem(bytes) {
  const u8 = new Uint8Array(bytes);
  const oem = prefixed(u8, '$OEM') ? S.OEM.getSizePrefixedRootAsOEM(bb(u8)).unpack() : S.OEM.getRootAsOEM(bb(u8)).unpack();
  return oem.EPHEMERIS_DATA_BLOCK.map((b) => ({
    norad: b.OBJECT?.NORAD_CAT_ID ?? 0, objectId: b.OBJECT?.OBJECT_ID ?? '', name: b.OBJECT?.OBJECT_NAME ?? '', comment: b.COMMENT ?? '',
    states: b.EPHEMERIS_DATA_LINES.map((l) => ({ epoch: l.EPOCH, state: [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT] })),
    covariances: b.COVARIANCE_MATRIX_LINES.map((l) => ({ epoch: l.EPOCH, matrix: fullOf(COV.map((k) => l[k])) })),
  }));
}

// ── observation records ──
const decoders = { RDO: (u) => RDO.RDO.getRootAsRDO(bb(u)).unpack(), EOO: (u) => EOO.EOO.getRootAsEOO(bb(u)).unpack(), RFO: (u) => RFO.RFO.getRootAsRFO(bb(u)).unpack() };
export const decodeRecord = (code, bytes) => decoders[code](new Uint8Array(bytes));
// The simulator's outputs as the association module's inputs.
export function observationFrames(response) {
  const ports = { radar: ['radar_observations', 'RDO'], optical: ['optical_observations', 'EOO'], rf: ['rf_observations', 'RFO'] };
  return response.outputs.filter((o) => ports[o.portId]).map((o) => frame(ports[o.portId][0], ports[o.portId][1], o.payload));
}

// ── $ACW ──
export const acw = (fields) => table(ACW, 'ACW', fields);
export const acwTable = (name, fields) => table(ACW, name, fields);
export const encodeAcw = (root) => frame('request', 'ACW', finish(root, '$ACW', { size: 1 << 22 }));
export const decodeAcw = (bytes) => ACW.ACW.getRootAsACW(bb(bytes)).unpack();

// ── $CQR ──
export function cqrFrame(arm, value) {
  return frame('request', 'CQR', finish(t('CQR', { [arm]: value }), '$CQR', { size: 1 << 20 }));
}
export const decodeCqr = (bytes) => S.CQR.getRootAsCQR(bb(bytes)).unpack();
