// SDS records E6 moves between modules: $RFO (SatNOGS Doppler), $EOO
// (optical RA/Dec), $OEM prediction blocks for analysis/association, and the
// $EOP rows the modules take. Encoding and decoding only.
import * as flatbuffers from 'flatbuffers';
import * as RFO from 'spacedatastandards.org/lib/js/RFO/main.js';
import * as EOO from 'spacedatastandards.org/lib/js/EOO/main.js';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import * as EOP from 'spacedatastandards.org/lib/js/EOP/main.js';

const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
function assign(object, fields) {
  for (const [k, v] of Object.entries(fields)) {
    if (!(k in object)) throw new Error(`${object.constructor.name} has no field ${k}`);
    object[k] = v;
  }
  return object;
}
const finish = (code, object) => {
  const b = new flatbuffers.Builder(1024);
  b.finish(object.pack(b), `$${code}`);
  return b.asUint8Array().slice();
};

export const rfoBytes = (fields) => finish('RFO', assign(new RFO.RFOT(), fields));
export const eooBytes = (fields) => finish('EOO', assign(new EOO.EOOT(), fields));
export const rfoFrame = (bytes) => ({ portId: 'rf_observations', typeRef: typeRef('RFO'), payload: bytes });
export const eooFrame = (bytes) => ({ portId: 'optical_observations', typeRef: typeRef('EOO'), payload: bytes });
export const decodeRfo = (bytes) => RFO.RFO.getRootAsRFO(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).unpack();
export const decodeEoo = (bytes) => EOO.EOO.getRootAsEOO(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).unpack();

const celestial = (name) => assign(new OEM.RFMT(), {
  REFERENCE_FRAME_type: OEM.RFMUnion.CelestialFrameWrapper,
  REFERENCE_FRAME: assign(new OEM.CelestialFrameWrapperT(), { frame: OEM.CelestialFrame[name] }),
});
const COV = ['CX_X', 'CY_X', 'CY_Y', 'CZ_X', 'CZ_Y', 'CZ_Z', 'CX_DOT_X', 'CX_DOT_Y', 'CX_DOT_Z', 'CX_DOT_X_DOT',
  'CY_DOT_X', 'CY_DOT_Y', 'CY_DOT_Z', 'CY_DOT_X_DOT', 'CY_DOT_Y_DOT', 'CZ_DOT_X', 'CZ_DOT_Y', 'CZ_DOT_Z', 'CZ_DOT_X_DOT', 'CZ_DOT_Y_DOT', 'CZ_DOT_Z_DOT'];

// One $OEM prediction for analysis/association: states [{epoch ISO UTC,
// state [m, m/s]}] in `frame`, with covariances [{epoch, lower [21] in km
// and km/s}] in the same frame.
export function predictionFrame({ norad, frame, states, covariances, degree = 7 }) {
  const block = assign(new OEM.ephemerisDataBlockT(), {
    OBJECT: assign(new OEM.CATT(), { NORAD_CAT_ID: norad, OBJECT_ID: String(norad) }),
    CENTER_NAME: 'EARTH', REFERENCE_FRAME: celestial(frame), TIME_SYSTEM: OEM.timingStandard.UTC,
    INTERPOLATION: 'LAGRANGE', INTERPOLATION_DEGREE: degree,
    EPHEMERIS_DATA_LINES: states.map(({ epoch, state }) => assign(new OEM.ephemerisDataLineT(), {
      EPOCH: epoch, X: state[0] / 1000, Y: state[1] / 1000, Z: state[2] / 1000, X_DOT: state[3] / 1000, Y_DOT: state[4] / 1000, Z_DOT: state[5] / 1000,
    })),
    COVARIANCE_MATRIX_LINES: covariances.map(({ epoch, lower }) => {
      const line = new OEM.covarianceMatrixLineT();
      line.EPOCH = epoch;
      COV.forEach((n, i) => { line[n] = lower[i]; });
      return line;
    }),
  });
  const message = assign(new OEM.OEMT(), { ORIGINATOR: 'orbit-accuracy-experiments e6', EPHEMERIS_DATA_BLOCK: [block] });
  return { portId: 'predictions', typeRef: typeRef('OEM'), payload: finish('OEM', message) };
}

// $EOP rows (decoded by data-source/eop-parser) as one size-prefixed stream.
export function eopStream(rows) {
  const parts = rows.map((row) => {
    const b = new flatbuffers.Builder(256);
    b.finishSizePrefixed(Object.assign(new EOP.EOPT(), row).pack(b), '$EOP');
    return b.asUint8Array().slice();
  });
  const payload = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { payload.set(p, at); at += p.length; }
  return { portId: 'earth_orientation', typeRef: typeRef('EOP'), payload };
}

export const jsonFrame = (portId, value) => ({ portId, typeRef: { schemaName: 'application/json' }, payload: Buffer.from(JSON.stringify(value)) });
