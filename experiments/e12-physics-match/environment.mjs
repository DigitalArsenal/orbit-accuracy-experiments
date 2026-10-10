// E12's modules and environment inputs: the JPL kernel, Earth orientation
// (an IERS finals2000A file as published at a stated time, or zero rows for
// "no EOP"), daily space weather (GFZ observed, the NOAA SWPC forecast held at
// an information cutoff, or constant values) and SET's JB2008 drivers. Also
// the conversion of an operator's published states to GCRF/UTC under a
// hypothesis's reading of the file's frame and time labels. Framing and
// selection only: the rotations, time scales and propagation are the modules'.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { EOP, EOPT } from 'spacedatastandards.org/lib/js/EOP/main.js';
import {
  FRM, FRMT, FRMFrameTransformRequestT, FRMStateVectorT, FRMVector3T, RFMCoordinateSystemT, RFMOriginT,
  frmOperationCode, frmResultStatus, frmStateRepresentation, rfmAxisType, rfmOriginKind,
} from 'spacedatastandards.org/lib/js/FRM/main.js';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { PRW_TYPE, kernelFrame, instant } from '../../harness/prw.mjs';
import { convertIso } from '../../harness/time.mjs';
import { readRsga, releasedSpwRows, releasedJb2008Rows } from '../../harness/cutoff-environment.mjs';
import { jb2008Rows, readGfzKp, readSetIndices } from '../../harness/full-force.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { estimationCodec } from '../e2-catalog-covariance/estimation-wire.mjs';
import { WEATHER_MODELS } from './hypothesis.mjs';

export const DAY_MS = 86400000;
export const mjdOf = (ms) => Math.floor(ms / DAY_MS) + 40587;
export const isoMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);
export const isoOf = (ms) => new Date(ms).toISOString();
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const readMaybeGz = (file) => { const b = fs.readFileSync(file); return file.endsWith('.gz') ? zlib.gunzipSync(b) : b; };

const encode = (arm, value, size = 1 << 16) => {
  const b = new fb.Builder(size);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { [arm]: value }).pack(b));
  return b.asUint8Array().slice();
};
const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);

// The axes a file's frame label can name, as foundation/frames selectors.
const AXIS = {
  GCRF: 'ICRF', ICRF: 'ICRF', EME2000: 'MEAN_EQUATOR_EQUINOX_J2000', J2000: 'MEAN_EQUATOR_EQUINOX_J2000',
  TEME: 'TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE', TOD: 'TRUE_OF_DATE_EQUATOR', MOD: 'MEAN_OF_DATE_EQUATOR_FK5', ITRF: 'BODY_FIXED',
};
// The constant scale offsets the time axis tests are read from foundation/time
// at the segment's first and last epoch (equal unless a leap second falls inside).

export async function loadEnvironment({ modulesDir, config, run }) {
  const names = ['propagator/hpop', 'analysis/estimation', 'foundation/frames', 'foundation/time', 'data-source/eop-parser'];
  const m = {};
  for (const name of names) { m[name] = await loadModule(modulesDir, name); run?.addModule(m[name].provenance); }
  const hpopSha = m['propagator/hpop'].provenance.wasmSha256;
  if (config.modulesBinary?.hpopWasmSha256 && hpopSha !== config.modulesBinary.hpopWasmSha256) {
    throw new Error(`propagator/hpop WASM ${hpopSha} is not the binary config.json names (${config.modulesBinary.hpopWasmSha256})`);
  }
  const resolve = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
  const inputs = config.inputs;

  // Planetary ephemerides by hypothesis level (DE440 is DE440s), each loaded
  // once, on first use, against its pinned SHA-256.
  const kernels = new Map();
  const kernelFor = (name) => {
    if (!kernels.has(name)) {
      const k = inputs.kernels[name];
      if (!k) throw new Error(`no kernel configured for ${name}`);
      const bytes = fs.readFileSync(resolve(k.path));
      if (sha256(bytes) !== k.sha256) throw new Error(`${name} kernel bytes differ from the pinned SHA-256`);
      run?.addInputs('kernel', { [path.basename(k.path)]: k.sha256 });
      kernels.set(name, kernelFrame(bytes));
    }
    return kernels.get(name);
  };
  const kernel = kernelFor('DE440');

  // Earth orientation: finals2000A rows as parsed by data-source/eop-parser.
  const eopBody = readMaybeGz(resolve(inputs.eopFinals));
  run?.addInputs('eop', { [path.basename(inputs.eopFinals)]: sha256(eopBody) });
  const parsed = await m['data-source/eop-parser'].invoke('parse_finals2000a', [{ portId: 'body', payload: eopBody, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: eopBody.length } }]);
  const stream = Buffer.from(parsed.outputs.find((o) => o.portId === 'records').payload);
  const eopRows = new Map();
  for (let at = 0; at < stream.length;) {
    const n = stream.readUInt32LE(at);
    const row = EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(stream.subarray(at + 4, at + 4 + n)))).unpack();
    eopRows.set(row.MJD, row);
    at += 4 + n;
  }
  // ZERO: the same rows with every orientation parameter zero (UT1 = UTC, no
  // polar motion, no celestial pole offsets): a propagator without EOP.
  const zeroOf = (row) => Object.assign(new EOPT(), row, {
    X_POLE_WANDER_RADIANS: 0, Y_POLE_WANDER_RADIANS: 0, X_CELESTIAL_POLE_OFFSET_RADIANS: 0, Y_CELESTIAL_POLE_OFFSET_RADIANS: 0,
    UT1_MINUS_UTC_SECONDS: 0, LENGTH_OF_DAY_CORRECTION_SECONDS: 0, NUTATION_DPSI_RADIANS: 0, NUTATION_DEPS_RADIANS: 0,
    X_POLE_WANDER_RADIANS_HP: 0, Y_POLE_WANDER_RADIANS_HP: 0, X_CELESTIAL_POLE_OFFSET_RADIANS_HP: 0, Y_CELESTIAL_POLE_OFFSET_RADIANS_HP: 0,
    UT1_MINUS_UTC_SECONDS_HP: 0, LENGTH_OF_DAY_CORRECTION_SECONDS_HP: 0,
  });
  const eopRowsFor = (mode, fromMs, toMs) => {
    const rows = [];
    for (let mjd = mjdOf(fromMs) - 1; mjd <= mjdOf(toMs) + 2; ++mjd) {
      const r = eopRows.get(mjd);
      if (!r) throw new Error(`no finals2000A row for MJD ${mjd}`);
      rows.push(mode === 'ZERO' ? zeroOf(r) : r);
    }
    return rows;
  };
  const eopFrame = (mode, fromMs, toMs) => ({ portId: 'earth_orientation', typeRef: PRW_TYPE,
    payload: encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: eopRowsFor(mode, fromMs, toMs) })) });
  const eopStream = (mode, fromMs, toMs) => {
    const parts = eopRowsFor(mode, fromMs, toMs).map((row) => {
      const b = new fb.Builder(512);
      EOP.finishSizePrefixedEOPBuffer(b, row.pack(b));
      return Buffer.from(b.asUint8Array());
    });
    return { portId: 'earth_orientation', typeRef: { schemaName: 'EOP.fbs', fileIdentifier: '$EOP', rootTypeName: 'EOP' }, payload: Buffer.concat(parts) };
  };

  // Space weather.
  // A gzipped GFZ file is read through an uncompressed copy in runs/cache.
  const gfzPath = (() => {
    const file = resolve(inputs.gfzKp);
    if (!file.endsWith('.gz')) return file;
    const bytes = readMaybeGz(file), out = path.join(repoRoot, 'runs', 'cache', `gfz-${sha256(bytes).slice(0, 16)}.txt`);
    if (!fs.existsSync(out)) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, bytes); }
    return out;
  })();
  const gfz = readGfzKp(gfzPath);
  run?.addInputs('spaceWeather', { [path.basename(inputs.gfzKp)]: gfz.sha256 });
  const rsga = readRsga(inputs.swpcRsga.map(resolve), path.join(repoRoot, 'runs', 'cache', 'rsga'));
  run?.addInputs('swpcRsga', rsga.files);
  const set = inputs.solfsmy ? readSetIndices(resolve(inputs.solfsmy), resolve(inputs.dtcfile)) : null;
  if (set) run?.addInputs('jb2008', { 'SOLFSMY.TXT': set.sha256.solfsmy, 'DTCFILE.TXT': set.sha256.dtcfile });
  const constant = config.constantWeather;

  const spwObserved = (fromMs, toMs) => {
    const rows = [];
    for (let t = Math.floor(fromMs / DAY_MS) * DAY_MS; t <= toMs; t += DAY_MS) {
      const d = gfz.days.get(isoDay(t));
      if (!d || !(d.f107obs > 0)) throw new Error(`no observed GFZ row for ${isoDay(t)}`);
      const window = [];
      for (let k = -40; k <= 40; ++k) { const e = gfz.days.get(isoDay(t + k * DAY_MS)); if (e && e.f107obs > 0) window.push(e.f107obs); }
      if (window.length < 75) throw new Error(`81-day F10.7 window has ${window.length} days around ${isoDay(t)}`);
      const kp10 = d.kp.map((k) => Math.round(k * 10));
      rows.push({ DATE: isoDay(t), KP1: kp10[0], KP2: kp10[1], KP3: kp10[2], KP4: kp10[3], KP5: kp10[4], KP6: kp10[5], KP7: kp10[6], KP8: kp10[7],
        KP_SUM: kp10.reduce((a, b) => a + b, 0), AP1: d.ap[0], AP2: d.ap[1], AP3: d.ap[2], AP4: d.ap[3], AP5: d.ap[4], AP6: d.ap[5], AP7: d.ap[6], AP8: d.ap[7],
        AP_AVG: d.Ap, F107_OBS: d.f107obs, F107_ADJ: d.f107adj, F107_DATA_TYPE: 0, F107_OBS_CENTER81: window.reduce((a, b) => a + b, 0) / window.length });
    }
    return rows;
  };
  const spwFrame = (rows) => ({ portId: 'space_weather', typeRef: PRW_TYPE, payload: encode('SPACE_WEATHER', table('PRWSpaceWeatherTable', { ROWS: rows.map((r) => table('SPW', r)) })) });
  const jbFrame = (rows) => ({ portId: 'jb2008_indices', typeRef: PRW_TYPE, payload: encode('JB2008_INDICES', table('PRWJB2008IndicesTable', { ROWS: rows.map((r) => table('PRWJB2008Indices', r)) })) });

  const codec = await estimationCodec(modulesDir, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro'));

  return {
    hpop: m['propagator/hpop'], estimation: m['analysis/estimation'], frames: m['foundation/frames'], time: m['foundation/time'],
    codec, gfz, rsga, set,
    provenance: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.provenance])),

    // Environment frames of hypothesis h over [fromMs, toMs] with the
    // information cutoff cutoffMs (the file's creation time): {frames, weather}.
    inputsFor(h, fromMs, toMs, cutoffMs) {
      const frames = [kernelFor(h.ephemeris), eopFrame(h.eop, fromMs, toMs)];
      let weather = null;
      if (WEATHER_MODELS.has(h.atmosphere)) {
        const a = fromMs - 6 * DAY_MS, b = toMs + 2 * DAY_MS;
        if (h.spaceWeather === 'CONSTANT') {
          if (h.atmosphere === 'JB2008') throw new Error('JB2008 has no constant-input convention here (PLAN.md section 4)');
          weather = constant;
        } else if (h.atmosphere === 'JB2008') {
          if (!set) throw new Error('no SET drivers configured');
          frames.push(jbFrame(h.spaceWeather === 'OBSERVED' ? jb2008Rows(set, a, b) : releasedJb2008Rows(jb2008Rows, set, a, b, cutoffMs, config.cutoff.jb2008PublicLatencyDays)));
        } else {
          frames.push(spwFrame(h.spaceWeather === 'OBSERVED' ? spwObserved(a, b) : releasedSpwRows(gfz, rsga, cutoffMs, a, b).rows));
        }
      }
      return { frames, weather };
    },

    // Published states -> GCRF/UTC under a hypothesis's reading of the file's
    // frame and time scale (h.frame, h.timeScale; the label itself only guards
    // an Earth-fixed file from an inertial reading).
    // points: [{epoch (ISO text on the file's scale), position [m], velocity [m/s] | null}]. Returns
    // [{epoch (ISO UTC), ms, position, velocity | null}].
    async toGcrf(points, label, h) {
      const { frame, timeScale: scale } = h;
      const axis = AXIS[frame];
      if (!axis) throw new Error(`unknown frame ${frame}`);
      if (label.frame === 'ITRF' && frame !== 'ITRF') throw new Error('an Earth-fixed file is read as Earth-fixed');
      // The scale offset, from foundation/time at both ends.
      const offsetAt = async (text) => (scale === 'UTC' ? 0 : isoMs(await convertIso(this.time, text.replace(/Z$/, ''), scale, 'UTC')) - isoMs(text));
      const first = await offsetAt(points[0].epoch), last = await offsetAt(points.at(-1).epoch);
      if (Math.abs(first - last) > 1e-3) throw new Error('a leap second inside the segment');
      const fromMs = isoMs(points[0].epoch) + first, toMs = isoMs(points.at(-1).epoch) + first;
      const eop = eopStream(h.eop, fromMs, toMs);
      const out = [];
      for (const p of points) {
        const ms = isoMs(p.epoch) + first;
        const epoch = isoOf(ms).replace('Z', '');
        if (axis === 'ICRF') { out.push({ epoch: `${epoch}Z`, ms, position: p.position, velocity: p.velocity }); continue; }
        const r = await transform(this.frames, axis, epoch, p.position, p.velocity, eop);
        out.push({ epoch: `${epoch}Z`, ms, position: r.position, velocity: p.velocity ? r.velocity : null });
      }
      return out;
    },

    // GCRF/UTC states -> the axes `frame` with epochs written on `scale`
    // (synthetic files that mislabel either). points: [{epoch (ISO UTC), position, velocity}].
    async fromGcrf(points, frame, scale, eopMode) {
      const axis = AXIS[frame];
      const offset = scale === 'UTC' ? 0 : isoMs(await convertIso(this.time, points[0].epoch.replace(/Z$/, ''), 'UTC', scale)) - isoMs(points[0].epoch);
      const fromMs = isoMs(points[0].epoch), toMs = isoMs(points.at(-1).epoch);
      const eop = eopStream(eopMode, fromMs, toMs);
      const out = [];
      for (const p of points) {
        const epoch = p.epoch.replace(/Z$/, '');
        const r = axis === 'ICRF' ? { position: p.position, velocity: p.velocity } : await transform(this.frames, axis, epoch, p.position, p.velocity, eop, true);
        out.push({ epoch: isoOf(isoMs(p.epoch) + offset), position: r.position, velocity: r.velocity });
      }
      return out;
    },

    // The GCRF -> RTN rotation (rows R, T, N) for a GCRF state [m, m/s].
    async rtnAxes(epoch, state) { return rtnRotation(this.frames, epoch.replace(/Z$/, ''), state); },

    // The Sun's GCRF position (m) at ISO UTC epochs, from the kernel through
    // propagator/hpop's EPHEMERIS_REQUEST.
    async sunPositions(epochs) {
      const out = [];
      for (const e of epochs) {
        const request = { portId: 'request', typeRef: PRW_TYPE, payload: encode('EPHEMERIS_REQUEST', table('PRWEphemerisRequest', { EPOCH: instant(await convertIso(this.time, e.replace(/Z$/, ''), 'UTC', 'TDB'), 'TDB'), TARGET_NAIF_ID: 10, CENTER_NAIF_ID: 399 })) };
        const response = await this.hpop.invoke('invoke', [request, kernel]);
        const root = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs.find((o) => o.portId === 'response').payload))).unpack();
        const p = root.EPHEMERIS_RESULT.STATE.STATE.POSITION;
        out.push([p.X, p.Y, p.Z]);
      }
      return out;
    },

    async destroy() { for (const v of Object.values(m)) await v.destroy(); },
  };
}

// ── foundation/frames requests ──
const FRM_TYPE = { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' };
const earth = () => new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399);
const system = (name, axis, origin, epoch) => new RFMCoordinateSystemT(name, rfmAxisType[axis], origin, 399, epoch, 'UTC');
const stateVector = (position, velocity, name, epoch) => new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [...position, ...(velocity ?? [0, 0, 0])],
  new FRMVector3T(...position), new FRMVector3T(...(velocity ?? [0, 0, 0])), name, epoch, 'UTC', 3.986004418e14);
function frmFrame(request, portId) {
  const b = new fb.Builder(2048);
  FRM.finishFRMBuffer(b, new FRMT(request, null).pack(b));
  return { portId, typeRef: FRM_TYPE, payload: b.asUint8Array() };
}
function frmResult(response) {
  const r = FRM.getRootAsFRM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).FRAME_TRANSFORM_RESULT();
  if (!r || r.STATUS() !== frmResultStatus.OK) throw new Error(`foundation/frames: ${r?.ERROR_MESSAGE() ?? 'no result'}`);
  return r;
}
// axis -> GCRF, or GCRF -> axis with `inverse`.
async function transform(frames, axis, epoch, position, velocity, eop, inverse = false) {
  const [from, to] = inverse ? ['ICRF', axis] : [axis, 'ICRF'];
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.STATE_TRANSFORM,
    SOURCE_COORDINATE_SYSTEM: system(from === 'ICRF' ? 'GCRF' : from, from, earth(), epoch),
    TARGET_COORDINATE_SYSTEM: system(to === 'ICRF' ? 'GCRF' : to, to, earth(), epoch),
    SOURCE_STATE: stateVector(position, velocity, from, epoch), TARGET_REPRESENTATION: frmStateRepresentation.CARTESIAN,
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const t = frmResult(await frames.invoke('transform_frame_position', [frmFrame(request, 'request'), eop])).TARGET_STATE();
  const p = t.POSITION(), v = t.VELOCITY();
  return { position: [p.X(), p.Y(), p.Z()], velocity: [v.X(), v.Y(), v.Z()] };
}
async function rtnRotation(frames, epoch, state) {
  const object = Object.assign(new RFMOriginT(rfmOriginKind.SPACE_OBJECT), { OBJECT_ID: 'e12' });
  const request = Object.assign(new FRMFrameTransformRequestT(), {
    OPERATION: frmOperationCode.FRAME_ROTATION,
    SOURCE_COORDINATE_SYSTEM: system('GCRF', 'ICRF', earth(), epoch),
    TARGET_COORDINATE_SYSTEM: system('RTN', 'ORBITAL_RADIAL_TRANSVERSE_NORMAL', object, epoch),
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
  });
  const objectState = Object.assign(new FRMFrameTransformRequestT(), {
    SOURCE_STATE: stateVector(state.slice(0, 3), state.slice(3, 6), 'ICRF', epoch), SOURCE_COORDINATE_SYSTEM: system('ICRF', 'ICRF', object, epoch),
  });
  const m = frmResult(await frames.invoke('transform_frame_position', [frmFrame(request, 'request'), frmFrame(objectState, 'object_state')])).ROTATION_DCM();
  return [m.M11(), m.M12(), m.M13(), m.M21(), m.M22(), m.M23(), m.M31(), m.M32(), m.M33()];
}
