// The operator-covariance sidecar of one captured file (E13b amendment A4): a $OCM FlatBuffer holding derived ten-minute GCRF states
// and the operator's own 21 UVW covariance values at each, for the first 16 hours of the file. Typed wire adapter only.
import * as fb from 'flatbuffers';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';
import { sha } from './transport.mjs';
import { SAMPLE_EVERY, STEP } from './meme.mjs';

const table = (name, value) => Object.assign(new O[name + 'T'](), value);
const iso = ms => new Date(ms).toISOString();

/** states: [{ ms, stateM }] in GCRF (m, m/s) from the frames module; points: [{ ms, uvwCov }] from the source, same epochs. */
export function ocmSidecar({ file, head, states, points, producer }) {
  if (!points.length || states.length !== points.length) throw new Error('sidecar states and covariance differ in count');
  points.forEach((p, i) => {
    if (states[i].ms !== p.ms) throw new Error('sidecar state epoch differs from its covariance epoch');
    if (p.uvwCov.length !== 21 || !p.uvwCov.every(Number.isFinite)) throw new Error('nonfinite or incomplete source covariance');
  });
  const { source } = head, name = file.name.split('_')[2];
  const ocm = table('OCM', {
    HEADER: table('Header', { CCSDS_OCM_VERS: '3.0', CLASSIFICATION: 'U', CREATION_DATE: file.retrievedUtc, ORIGINATOR: 'sdn-operator-capture' }),
    METADATA: table('Metadata', { OBJECT_NAME: name, CATALOG_NAME: 'NORAD', OBJECT_DESIGNATOR: String(source.norad), OPERATOR: 'SpaceX', CONSTELLATION: 'STARLINK',
      TIME_SYSTEM: 'UTC', EPOCH_TZERO: iso(points[0].ms), START_TIME: iso(points[0].ms), STOP_TIME: iso(points.at(-1).ms) }),
    TRAJ_TYPE: O.trajectoryType.CARTESIAN_PV, STATE_VECTOR_SIZE: 6, STATE_STEP_SIZE: STEP * SAMPLE_EVERY,
    STATE_DATA: states.flatMap(s => s.stateM.map(v => v / 1000)),                       // km, km/s
    COVARIANCE_DATA: points.flatMap(p => p.uvwCov),                                     // the source's values, unchanged
    CENTER_NAME: 'EARTH',
    TRAJ_REF_FRAME: table('RFM', { REFERENCE_FRAME_type: O.RFMUnion.CelestialFrameWrapper, REFERENCE_FRAME: new O.CelestialFrameWrapperT(O.CelestialFrame.GCRF) }),
    COV_REF_FRAME: table('RFM', { REFERENCE_FRAME_type: O.RFMUnion.CustomFrameWrapper, REFERENCE_FRAME: new O.CustomFrameWrapperT(O.CustomFrame.UVW) }),
    COV_TYPE: 'CARTPV', COV_ORDERING: O.covarianceOrdering.LTM, COV_SIZE: 6, COV_UNITS: ['km', 'km', 'km', 'km/s', 'km/s', 'km/s'],
    PROVENANCE: table('PVN', { SOURCE_ID: 'spacex-starlink', SOURCE_KIND: O.pvnSourceKind.Ephemeris, ORIGINATOR: 'SpaceX', PROVIDER_ID: 'sdn-operator-capture/1.0',
      PRODUCER: producer, LICENSE_CLASS: O.pvnLicenseClass.Reproducible, LICENSE_ID: 'spacex-starlink', LINEAGE: 'spacex-starlink-meme' }),
    USER_DEFINED_PARAMETERS: Object.entries({
      SOURCE_FILE: file.name, SOURCE_URL: file.url, SOURCE_CREATED_UTC: source.createdUtc, SOURCE_RETRIEVED_UTC: file.retrievedUtc, SOURCE_ETAG: file.etag ?? '',
      SOURCE_RANGE: `bytes=0-${file.bytes.length - 1}`, SOURCE_RANGE_SHA256: sha(file.bytes), SOURCE_NATIVE_FRAME: 'EME2000', RAW_PERSISTED: 'false',
      COV_AXES: 'UVW as the operator labels it: U radial, V in-track, W cross-track (RTN); not rotated',
      REGISTERED_RECORD_SOURCE_SHA256: source.sha256,                                   // pairs this sidecar with the file's json.gz record
    }).map(([PARAM_NAME, PARAM_VALUE]) => table('UserDefinedParameters', { PARAM_NAME, PARAM_VALUE })),
  });
  const builder = new fb.Builder(1 << 15);
  O.OCM.finishSizePrefixedOCMBuffer(builder, ocm.pack(builder));
  return builder.asUint8Array();
}

/** The counts of a sidecar, and nothing else: states, covariance values, hours, frame and ordering labels. */
export function sidecarCounts(bytes) {
  const ocm = O.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(bytes)).unpack();
  const states = ocm.STATE_DATA.length / ocm.STATE_VECTOR_SIZE;
  return { states, covarianceValues: ocm.COVARIANCE_DATA.length, covariancePerState: ocm.COVARIANCE_DATA.length / states,
    hours: (states - 1) * ocm.STATE_STEP_SIZE / 3600, covOrdering: O.covarianceOrdering[ocm.COV_ORDERING], covFrame: O.CustomFrame[ocm.COV_REF_FRAME?.REFERENCE_FRAME?.frame],
    trajFrame: O.CelestialFrame[ocm.TRAJ_REF_FRAME?.REFERENCE_FRAME?.frame], identifier: Buffer.from(bytes).subarray(8, 12).toString() };
}
