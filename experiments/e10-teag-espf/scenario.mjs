// Synthetic tracking scenarios, every computation in a module: truth by
// propagator/hpop (hpop.mjs), Earth-fixed states, station states and the
// Sun's direction by foundation/frames, TT Julian dates by foundation/time,
// visibility by analysis/access, measurements by analysis/observation-
// simulator ($EOO RA/Dec, which estimation's predict_measurement models).
// This file frames records and selects rows; it computes no geometry.
import fs from 'node:fs';
import * as fb from 'flatbuffers';
import { ACW, ACWT, ACWRequestT, ACWGroundStationT, ACWStateSampleT, ACWConstraintT, ACWConstraintSetT, ACWTargetT, ACWTargetSignatureT, ACWSensorT, ACWSensorAccessT, ACWAccessWindowT, MEMErrorModelT, acwConstraintKind, acwConstraintOperator, acwEvaluationMode, acwOperationCode, acwSensorPhenomenology, memMeasurementType } from 'spacedatastandards.org/lib/js/ACW/main.js';
import { EOO } from 'spacedatastandards.org/lib/js/EOO/main.js';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/main.js';
import {
  FRM, FRMT, FRMFrameTransformRequestT, FRMStateVectorT, FRMVector3T, RFMCoordinateSystemT, RFMOriginT,
  frmOperationCode, frmResultStatus, frmStateRepresentation, rfmAxisType, rfmOriginKind,
} from 'spacedatastandards.org/lib/js/FRM/main.js';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { TIM, TIMConversionRequestT, TIMInstantT, TIMT, timConversionStatus, timEpochRepresentation, timingStandard } from 'spacedatastandards.org/lib/js/TIM/main.js';
import { sha256 } from '../../harness/modules.mjs';
import { PRW_TYPE, instant } from '../../harness/prw.mjs';
import { DAY_MS, iso } from './common.mjs';
import { propagate } from './hpop.mjs';

const ACW_TYPE = { schemaName: 'ACW.fbs', fileIdentifier: '$ACW', rootTypeName: 'ACW', wireFormat: 'flatbuffer' };
const FRM_TYPE = { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' };
const TIM_TYPE = { schemaName: 'TIM.fbs', fileIdentifier: '$TIM', rootTypeName: 'TIM' };
const EOP_TYPE = { schemaName: 'EOP.fbs', fileIdentifier: '$EOP', rootTypeName: 'EOP' };

// ── Earth orientation for foundation/frames: eop-parser's size-prefixed $EOP row stream ──
export async function eopRowStream(parser, file) {
  const body = fs.readFileSync(file);
  const response = await parser.invoke('parse_c04', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const rows = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n))));
    rows.push({ mjd: row.MJD(), bytes: out.subarray(at, at + 4 + n), object: row.unpack() });
    at += 4 + n;
  }
  return {
    rows, sha256: sha256(body),
    // The stream of whole rows covering [fromMs, toMs] (frames interpolates; at most 366 rows).
    window(fromMs, toMs) {
      const lo = Math.floor(fromMs / DAY_MS) + 40587 - 1, hi = Math.floor(toMs / DAY_MS) + 40587 + 2;
      const sel = rows.filter((r) => r.mjd >= lo && r.mjd <= hi);
      return { frame: { portId: 'earth_orientation', typeRef: EOP_TYPE, payload: new Uint8Array(Buffer.concat(sel.map((r) => r.bytes))) }, objects: sel.map((r) => r.object) };
    },
  };
}

// ── foundation/frames ──
const earth = () => new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399);
const system = (name, axis, origin, epoch) => new RFMCoordinateSystemT(name, rfmAxisType[axis], origin, 399, epoch, 'UTC');
const stateVector = (s, name, epoch) => new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [...s], new FRMVector3T(s[0], s[1], s[2]), new FRMVector3T(s[3], s[4], s[5]), name, epoch, 'UTC', 3.986004415e14);
function frmFrame(request) {
  const b = new fb.Builder(2048);
  FRM.finishFRMBuffer(b, new FRMT(request, null).pack(b));
  return { portId: 'request', typeRef: FRM_TYPE, payload: b.asUint8Array() };
}
async function transform(frames, eop, source, target, state, epoch) {
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.STATE_TRANSFORM, SOURCE_COORDINATE_SYSTEM: source, TARGET_COORDINATE_SYSTEM: target,
    SOURCE_STATE: stateVector(state, source.NAME, epoch), TARGET_REPRESENTATION: frmStateRepresentation.CARTESIAN, EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const response = await frames.invoke('transform_frame_position', [frmFrame(request), eop]);
  const r = FRM.getRootAsFRM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).FRAME_TRANSFORM_RESULT();
  if (!r || r.STATUS() !== frmResultStatus.OK) throw new Error(`foundation/frames: ${r?.ERROR_MESSAGE() ?? 'no result'}`);
  const t = r.TARGET_STATE(), p = t.POSITION(), v = t.VELOCITY();
  return [p.X(), p.Y(), p.Z(), v.X(), v.Y(), v.Z()];
}
export const gcrfToItrf = (frames, eop, ms, state) => transform(frames, eop, system('GCRF', 'ICRF', earth(), iso(ms)), system('ITRF', 'BODY_FIXED', earth(), iso(ms)), state, iso(ms));
// A ground station's GCRF position and velocity: the origin of its local
// east-north-up frame, carried to GCRF by the module.
export function stationGcrf(frames, eop, station, ms) {
  const site = Object.assign(new RFMOriginT(rfmOriginKind.GROUND_SITE), { SITE_ID: station.id, SITE_BODY_ID: 399, SITE_LATITUDE: station.latDeg, SITE_LONGITUDE: station.lonDeg, SITE_ALTITUDE: station.heightM });
  return transform(frames, eop, system(station.id, 'TOPOCENTRIC_EAST_NORTH_UP', site, iso(ms)), system('GCRF', 'ICRF', earth(), iso(ms)), [0, 0, 0, 0, 0, 0], iso(ms));
}

// ── foundation/time: UTC instant -> TT Julian date ──
export async function ttJd(time, ms) {
  const source = new TIMInstantT(timingStandard.UTC, timEpochRepresentation.ISO8601, 0, 0, iso(ms), 0, null, 0, false, null, null);
  const request = new TIMConversionRequestT(source, timingStandard.TT, timEpochRepresentation.JULIAN_DATE, 0, false, 0, false, 'e10');
  const b = new fb.Builder(512);
  TIM.finishTIMBuffer(b, new TIMT(timingStandard.UTC, null, request, null).pack(b));
  const response = await time.invoke('convert_time', [{ portId: 'request', typeRef: TIM_TYPE, payload: b.asUint8Array() }]);
  const r = TIM.getRootAsTIM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).CONVERSION_RESULT();
  if (r.STATUS() !== timConversionStatus.OK) throw new Error(`foundation/time: UTC -> TT failed for ${iso(ms)}`);
  return r.TARGET().JULIAN_DATE();
}

// ── foundation/time: UTC instant -> ISO 8601 on TDB ──
export async function tdbIso(time, ms) {
  const source = new TIMInstantT(timingStandard.UTC, timEpochRepresentation.ISO8601, 0, 0, iso(ms), 0, null, 0, false, null, null);
  const request = new TIMConversionRequestT(source, timingStandard.TDB, timEpochRepresentation.ISO8601, 0, false, 0, false, 'e10');
  const b = new fb.Builder(512);
  TIM.finishTIMBuffer(b, new TIMT(timingStandard.UTC, null, request, null).pack(b));
  const response = await time.invoke('convert_time', [{ portId: 'request', typeRef: TIM_TYPE, payload: b.asUint8Array() }]);
  const r = TIM.getRootAsTIM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).CONVERSION_RESULT();
  if (r.STATUS() !== timConversionStatus.OK) throw new Error(`foundation/time: UTC -> TDB failed for ${iso(ms)}`);
  return r.TARGET().ISO8601();
}

// ── propagator/hpop ephemeris: the Sun's GCRF position at a UTC instant ──
// (the geometric query takes TDB: the instant is converted by foundation/time)
export async function sunGcrf(hpop, env, ms, time) {
  const b = new fb.Builder(512);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EPHEMERIS_REQUEST: new P.PRWEphemerisRequestT(instant(await tdbIso(time, ms), 'TDB'), 10, 399) }).pack(b));
  const response = await hpop.invoke('invoke', [{ portId: 'request', typeRef: PRW_TYPE, payload: b.asUint8Array().slice() }, env.kernel]);
  const root = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs.find((o) => o.portId === 'response').payload))).unpack();
  const s = root.EPHEMERIS_RESULT.STATE.STATE;  // a PRWResidentState around the FRM state vector
  if (!/GCRF|ICRF/.test(s.COORDINATE_SYSTEM_NAME ?? '') && s.COORDINATE_SYSTEM_NAME) throw new Error(`Sun state in ${s.COORDINATE_SYSTEM_NAME}`);
  return [s.POSITION.X, s.POSITION.Y, s.POSITION.Z, s.VELOCITY.X, s.VELOCITY.Y, s.VELOCITY.Z];
}

// ── analysis/access: elevation windows of each station ──
export async function accessWindows(access, stations, samples, minElevationRad) {
  const request = Object.assign(new ACWRequestT(), {
    OPERATION: acwOperationCode.COMPUTE_ACCESS_WINDOWS ?? 1, EVALUATION_MODE: acwEvaluationMode.CONTINUOUS, ROOT_TOLERANCE_S: 0.01, TRACE_ID: 'e10',
    GROUND_STATIONS: stations.map((s) => Object.assign(new ACWGroundStationT(s.id, s.id, s.latDeg * Math.PI / 180, s.lonDeg * Math.PI / 180, s.heightM, 0, 1, []))),
    STATES: samples.map((s) => new ACWStateSampleT(s.jdTt, s.itrf[0], s.itrf[1], s.itrf[2])),
    CONSTRAINTS: new ACWConstraintSetT(acwConstraintOperator.ALL_OF, [Object.assign(new ACWConstraintT(), { KIND: acwConstraintKind.MIN_ELEVATION, LABEL: 'mask', THRESHOLD_RAD: minElevationRad })], []),
  });
  const b = new fb.Builder(1 << 20);
  ACW.finishACWBuffer(b, new ACWT(request, null).pack(b));
  const response = await access.invoke('compute_access_windows', [{ portId: 'request', typeRef: ACW_TYPE, payload: b.asUint8Array() }]);
  const result = ACW.getRootAsACW(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).RESULT().unpack();
  return result.WINDOWS.map((w) => ({ station: w.STATION_ID, start: w.START_JULIAN_DATE_TT, end: w.END_JULIAN_DATE_TT }));
}

// ── analysis/observation-simulator: RA/Dec ($EOO) of one target ──
// stations [{id, latDeg, lonDeg, heightM}]; sensor {intervalS, noiseRad,
// biasRad: {stationId: rad}, lightTime}; samples [{jdTt, itrf [6]}];
// sun [{jdTt, itrf [6]}]; windows from accessWindows; eopObjects ($EOP rows).
export async function simulate(simulator, { stations, samples, sun, windows, eopObjects, sensor, seed, target }) {
  const sample = (s) => Object.assign(new ACWStateSampleT(), { JULIAN_DATE_TT: s.jdTt, POSITION_X_M: s.itrf[0], POSITION_Y_M: s.itrf[1], POSITION_Z_M: s.itrf[2], VELOCITY_X_MPS: s.itrf[3], VELOCITY_Y_MPS: s.itrf[4], VELOCITY_Z_MPS: s.itrf[5] });
  const sensors = stations.map((s) => Object.assign(new ACWSensorT(), {
    SENSOR_ID: `eo-${s.id}`, HOST_ID: s.id, PHENOMENOLOGY: acwSensorPhenomenology.OPTICAL,
    ERROR_MODELS: [Object.assign(new MEMErrorModelT(), { MODEL_ID: `radec-${s.id}`, MEASUREMENT_TYPE: memMeasurementType.RIGHT_ASCENSION_DECLINATION, NOISE_SIGMA: sensor.noiseRad, BIAS: sensor.biasRad?.[s.id] ?? 0, APPLY_LIGHT_TIME: !!sensor.lightTime })],
    OBSERVATION_INTERVAL_S: sensor.intervalS, TRACK_DURATION_S: 0, MAX_SIMULTANEOUS_TRACKS: 1, REVISIT_INTERVAL_S: 0,
    MAX_HOST_SUN_ELEVATION_RAD: sensor.maxHostSunElevationRad ?? Math.PI / 2, LIMITING_MAGNITUDE: 0,
  }));
  const access = stations.map((s) => Object.assign(new ACWSensorAccessT(), {
    SENSOR_ID: `eo-${s.id}`, TARGET_ID: target.id,
    WINDOWS: windows.filter((w) => w.station === s.id).map((w) => Object.assign(new ACWAccessWindowT(), { START_JULIAN_DATE_TT: w.start, END_JULIAN_DATE_TT: w.end })),
  }));
  const tgt = Object.assign(new ACWTargetT(), { TARGET_ID: target.id, NORAD_CAT_ID: target.norad, OBJECT_ID: target.objectId, STATES: samples.map(sample),
    SIGNATURE: Object.assign(new ACWTargetSignatureT(), { DIAMETER_M: 2, GEOMETRIC_ALBEDO: 0.2 }) });
  const request = Object.assign(new ACWRequestT(), {
    OPERATION: acwOperationCode.SIMULATE_OBSERVATIONS, RANDOM_SEED: BigInt(seed), TRACE_ID: 'e10',
    GROUND_STATIONS: stations.map((s) => Object.assign(new ACWGroundStationT(s.id, s.id, s.latDeg * Math.PI / 180, s.lonDeg * Math.PI / 180, s.heightM, 0, 1, []))),
    TARGETS: [tgt], SENSORS: sensors, ACCESS: access, SUN_STATES: sun.map(sample), EARTH_ORIENTATION: eopObjects,
  });
  const b = new fb.Builder(1 << 22);
  ACW.finishACWBuffer(b, new ACWT(request, null).pack(b));
  const response = await simulator.invoke('simulate_observations', [{ portId: 'request', typeRef: ACW_TYPE, payload: b.asUint8Array() }]);
  const optical = response.outputs.filter((o) => o.portId === 'optical').map((o) => EOO.getRootAsEOO(new fb.ByteBuffer(new Uint8Array(o.payload))).unpack());
  return optical.map((o) => ({ time: o.OB_TIME, sensor: o.ID_SENSOR ?? o.SENSOR_ID, raDeg: o.RA, decDeg: o.DECLINATION, raUncDeg: o.RA_UNC, decUncDeg: o.DECLINATION_UNC }));
}

// ── A whole synthetic scenario ──
// model: {forces, integrator}; truth: {epochMs, state, endMs, stepS};
// stations; sensor; seed. Returns the truth on a grid, the observations
// (UTC ms, station GCRF state, RA/Dec in rad, sigma) and the truth at each
// observation instant.
export async function buildScenario(m, env, eopStream, spec) {
  const { epochMs, endMs, stepS } = spec.truth;
  const grid = [];
  for (let t = epochMs; t <= endMs + 1; t += stepS * 1000) grid.push(t);
  const truthGrid = await propagateTruth(m, env, spec, grid);
  const eop = eopStream.window(epochMs, endMs);
  const samples = [];
  for (const [k, ms] of grid.entries()) samples.push({ ms, jdTt: await ttJd(m.time, ms), itrf: await gcrfToItrf(m.frames, eop.frame, ms, truthGrid[k]) });
  const sunGrid = grid.filter((_, k) => k % Math.max(1, Math.round(600 / stepS)) === 0 || k === grid.length - 1);
  const sun = [];
  for (const ms of sunGrid) sun.push({ jdTt: await ttJd(m.time, ms), itrf: await gcrfToItrf(m.frames, eop.frame, ms, await sunGcrf(m.hpop, env, ms, m.time)) });
  const windows = await accessWindows(m.access, spec.stations, samples, spec.minElevationDeg * Math.PI / 180);
  const eoo = await simulate(m.simulator, { stations: spec.stations, samples, sun, windows, eopObjects: eop.objects, sensor: spec.sensor, seed: spec.seed, target: spec.target });
  eoo.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const observations = [];
  for (const o of eoo) {
    const ms = Date.parse(o.time.endsWith('Z') ? o.time : `${o.time}Z`);
    const station = spec.stations.find((s) => `eo-${s.id}` === o.sensor);
    observations.push({ ms, station: station.id, stationGcrf: await stationGcrf(m.frames, eop.frame, station, ms),
      values: [o.raDeg * Math.PI / 180, o.decDeg * Math.PI / 180], sigmas: [spec.sensor.noiseRad, spec.sensor.noiseRad] });
  }
  const truthAtObs = observations.length ? await propagateTruth(m, env, spec, observations.map((o) => o.ms)) : [];
  return { grid, truthGrid, observations, truthAtObs, windows };
}

// Truth along a list of instants (ms, increasing), with optional events:
// spec.events [{ms, deltaV [3] (m/s, GCRF), forces (replacement force model)}]
// applied in order; the state is carried through each event exactly.
export async function propagateTruth(m, env, spec, instants) {
  const events = [...(spec.events ?? [])].sort((a, b) => a.ms - b.ms);
  let state = [...spec.truth.state], epochMs = spec.truth.epochMs, model = spec.truthModel;
  const out = [];
  let k = 0;
  for (const event of [...events, null]) {
    const stop = event ? event.ms : Infinity;
    const segment = [];
    while (k < instants.length && instants[k] <= stop && (event === null || instants[k] < stop)) segment.push(instants[k++]);
    const targets = event ? [...segment, event.ms] : segment;
    if (targets.length) {
      const samples = [];
      const nonzero = targets.filter((t) => t !== epochMs);
      const prop = nonzero.length ? await propagate(m.hpop, env, model, { epochIso: iso(epochMs), state, sampleIsos: nonzero.map(iso) }) : [];
      let j = 0;
      for (const t of targets) samples.push(t === epochMs ? [...state] : prop[j++].state);
      for (let i = 0; i < segment.length; ++i) out.push(samples[i]);
      if (event) { state = samples.at(-1); epochMs = event.ms; }
    }
    if (event) {
      if (event.deltaV) state = state.map((x, i) => (i >= 3 ? x + event.deltaV[i - 3] : x));
      if (event.forces) model = { ...model, forces: { ...model.forces, ...event.forces } };
    }
  }
  return out;
}
