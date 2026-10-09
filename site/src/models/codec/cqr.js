// $CQR and $OMM framing for analysis/conjunction-assessment (SDS 1.240.0).
// Encoding only; the screening, refinement and probability are the module's.
import * as flatbuffers from 'flatbuffers';
import {
  CQR, CQRT, CQRAlfanoRequestT, CQRCatalogRequest, CQRCatalogRequestT, CQRObjectSourceT, CQRPairRequestT, CQRPlaneGeometryT, CQRProbabilityRequestT,
  CQRScreeningControlsT, OMM, OMMT, RFMCoordinateSystemT, RFMOriginT, TIMInstantT, cqrProbabilityAlgorithm, rfmAxisType, rfmOriginKind,
  timEpochRepresentation, timingStandard,
} from 'spacedatastandards.org/lib/js/CQR/main.js';
import { RFMT } from 'spacedatastandards.org/lib/js/OMM/RFM.js';
import { RFMUnion } from 'spacedatastandards.org/lib/js/OMM/RFMUnion.js';
import { CelestialFrameWrapperT } from 'spacedatastandards.org/lib/js/OMM/CelestialFrameWrapper.js';
import { CelestialFrame } from 'spacedatastandards.org/lib/js/OMM/CelestialFrame.js';

export const CQR_TYPE = { schemaName: 'CQR.fbs', fileIdentifier: '$CQR', rootTypeName: 'CQR', wireFormat: 'flatbuffer' };
export { cqrProbabilityAlgorithm };

export function encodeCqr(arm, value) {
  const record = new CQRT();
  record[arm] = value;
  const builder = new flatbuffers.Builder(1 << 16);
  CQR.finishCQRBuffer(builder, record.pack(builder));
  return builder.asUint8Array().slice();
}
export const decodeCqr = (bytes) => CQR.getRootAsCQR(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).unpack();
export const request = (arm, value) => ({ portId: 'request', typeRef: CQR_TYPE, payload: encodeCqr(arm, value) });
export const output = (response, port) => response.outputs.find((o) => o.portId === port)?.payload;

export const jdOf = (ms) => ms / 86400000 + 2440587.5;
export const msOf = (jd) => (jd - 2440587.5) * 86400000;
export const utcJd = (jd) => new TIMInstantT(timingStandard.UTC, timEpochRepresentation.JULIAN_DATE, jd);
export const teme = () => new RFMCoordinateSystemT('TEME', rfmAxisType.TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE, new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399));

export function controls({ startJd, durationSeconds, thresholdM = 5000, coarseStepSec = 60, toleranceSec = 0.001, combinedRadiusM = 10, algorithm = 'ALFANO_MAXIMUM' }) {
  const c = new CQRScreeningControlsT(utcJd(startJd), durationSeconds, thresholdM, 1, coarseStepSec, toleranceSec, combinedRadiusM);
  c.ALGORITHM = cqrProbabilityAlgorithm[algorithm];
  return c;
}

// SGP4 mean elements as an $OMM object (TEME of date, UTC).
// e: {name, id, norad, epoch (ISO), n (rev/day), ecc, inc, raan, argp, ma (deg), bstar}
export function ommT(e) {
  const o = new OMMT();
  Object.assign(o, {
    OBJECT_NAME: e.name, OBJECT_ID: e.id, NORAD_CAT_ID: e.norad, CENTER_NAME: 'EARTH', EPOCH: e.epoch,
    REFERENCE_FRAME: new RFMT(RFMUnion.CelestialFrameWrapper, new CelestialFrameWrapperT(CelestialFrame.TEMEOFDATE)),
    MEAN_MOTION: e.n, ECCENTRICITY: e.ecc, INCLINATION: e.inc, RA_OF_ASC_NODE: e.raan, ARG_OF_PERICENTER: e.argp, MEAN_ANOMALY: e.ma, BSTAR: e.bstar ?? 0,
  });
  return o;
}
export function ommBytes(e) {
  const b = new flatbuffers.Builder(512);
  OMM.finishOMMBuffer(b, ommT(e).pack(b));
  return b.asUint8Array().slice();
}
export const sgp4Source = (e) => new CQRObjectSourceT(e.id, e.name, e.norad, null, 0, 'sgp4', ommT(e));

// One catalog request with every object an inline primary: the module
// screens primary-primary pairs, all n(n − 1)/2 of them.
export function catalogInputs(objects, c) {
  const req = new CQRCatalogRequestT();
  req.CONTROLS = controls(c);
  req.EVALUATION_FRAME = teme();
  req.PRIMARIES = objects.map(sgp4Source);
  // The object API writes every vector, and an ORDERED_CATALOG_INDICES vector,
  // even an empty one, means catalog port frames: leave it absent.
  req.pack = function pack(builder) {
    const primaries = CQRCatalogRequest.createPrimariesVector(builder, builder.createObjectOffsetList(this.PRIMARIES));
    const controlsOffset = this.CONTROLS.pack(builder), frame = this.EVALUATION_FRAME.pack(builder);
    CQRCatalogRequest.startCQRCatalogRequest(builder);
    CQRCatalogRequest.addPrimaries(builder, primaries);
    CQRCatalogRequest.addControls(builder, controlsOffset);
    CQRCatalogRequest.addEvaluationFrame(builder, frame);
    return CQRCatalogRequest.endCQRCatalogRequest(builder);
  };
  return [request('CATALOG_REQUEST', req)];
}

export function pairRequest(a, b, c) {
  const p = new CQRPairRequestT(sgp4Source(a), sgp4Source(b), controls(c), (c.combinedRadiusM ?? 10) / 2, (c.combinedRadiusM ?? 10) / 2, teme());
  return request('PAIR_REQUEST', p);
}

export const probabilityRequest = (g, algorithm = 'FOSTER') => request('PROBABILITY_REQUEST',
  new CQRProbabilityRequestT(new CQRPlaneGeometryT(g.xi, g.zeta, g.varXi, g.covXiZeta ?? 0, g.varZeta, g.radius), cqrProbabilityAlgorithm[algorithm]));
export const alfanoRequest = (missM, radiusM) => request('ALFANO_REQUEST', new CQRAlfanoRequestT(missM, radiusM));

// A deterministic synthetic shell of n objects: mean elements spread over
// altitude, inclination, node and phase by a fixed linear congruential
// sequence. Inputs only; nothing here propagates.
export function syntheticShell(n, { epoch = '2026-10-01T00:00:00.000000', seed = 20261009 } = {}) {
  let s = seed;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, (_, i) => ({
    name: `SHELL-${String(i + 1).padStart(4, '0')}`, id: `SYN-${i + 1}`, norad: 900001 + i, epoch,
    n: 14.6 + 0.8 * r(), ecc: 0.0002 + 0.002 * r(), inc: 50 + 48 * r(), raan: 360 * r(), argp: 360 * r(), ma: 360 * r(), bstar: 0,
  }));
}
