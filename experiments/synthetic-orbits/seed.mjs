// The record a case's starting state is made from (run.mjs): the case's mean elements as an $OCM, which the reference build
// (sdn-ap 0.6.26, modules 7ed7cf88) propagates to the truth's start. These are the fields that commit's
// propagator/sdn-ap/test/lib/ocm.mjs seedOcm writes for the call run.mjs makes ({ epoch, n, e, i, raan, argp, ma, norad: 99498,
// tesseral: 31, zonal: 20 }), kept here so that the starting state depends on the case and the reference build alone, not on a
// modules working tree. `S`: the SDS bindings (headline-loop lib/arms.mjs S).
export function seedRecord(S, { epoch, n, e, i, raan, argp, ma }) {
  const O = S.OCM, t = new O.OCMT();
  t.HEADER = Object.assign(new O.HeaderT(), { CCSDS_OCM_VERS: '3.0', ORIGINATOR: 'SDN' });
  t.METADATA = Object.assign(new O.MetadataT(), { NORAD_CAT_ID: 99498, OBJECT_NAME: null, TIME_SYSTEM: 'UTC' });
  t.CENTER_NAME = 'EARTH';
  // the tesseral and zonal caps above 0 make the record's frame TEME of its epoch
  t.TRAJ_REF_FRAME = new O.RFMT(O.RFMUnion.CustomFrameWrapper, new O.CustomFrameWrapperT(O.CustomFrame.TEMEOFEPOCH), 0, 'TEMEOFEPOCH');
  t.TRAJ_FRAME_EPOCH = epoch;
  t.ORB_AVERAGING = 'BROUWER';
  // theory 5 (AP), no drag or radiation term
  t.MEAN_ELEMENTS = Object.assign(new O.OCMMeanElementsT(), { MEAN_ELEMENT_THEORY: 5, EPOCH: epoch, MEAN_MOTION: n, ECCENTRICITY: e, INCLINATION: i,
    RA_OF_ASC_NODE: raan, ARG_OF_PERICENTER: argp, MEAN_ANOMALY: ma, BTERM: 0, AGOM: 0 });
  t.PERTURBATIONS = Object.assign(new O.PerturbationsT(), { ATMOSPHERIC_MODEL: new O.ATMT(O.AtmosphericModelFamily.JXX, 1970),
    GRAVITY_MODEL: 'EGM-96', MAXIMUM_TESSERAL_DEGREE: 31, MAXIMUM_ZONAL_DEGREE: 20,
    WEATHER_SOURCE: S.PCF.pcfWeatherSource.THEORY_FLUX_MODEL, SPACE_WEATHER: [] });
  const b = new S.flatbuffers.Builder(8192);
  O.OCM.finishOCMBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}
