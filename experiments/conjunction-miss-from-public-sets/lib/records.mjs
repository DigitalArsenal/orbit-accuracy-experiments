// The records of the registered arms: how a set's own SGP4 flight becomes an $OEM, the fit's $PCF for each recipe, and the fit call.
//   W: AP record, the theory sdn-ap fits (NRLMSISE-00 on daily weather rows, tesseral degree 31 (off above eccentricity 0.048), zonal degree 20, weather horizon 30 d).
//   X: SGP4-XP record, the module's SGP4-XP theory with the theory's own forces (stated atmosphere JACCHIA70, FIT unset, no weather rows).
// Both are fitted to the set's own SGP4 flight sampled every 300 s from the set's epoch minus 2.5 d to its epoch plus 5 d, the record's epoch at the first state.
import { SDS, importFile, importFlatbuffers } from './module.mjs';

export const TYPES = Object.freeze(Object.fromEntries(['OCM', 'OEM', 'PCF', 'SPW', 'PVN'].map((n) => [n, { schemaName: `${n}.fbs`, fileIdentifier: `$${n}`, rootTypeName: n, wireFormat: 'flatbuffer' }])));

export async function loadBindings() {
  const flatbuffers = await importFlatbuffers();
  const PCF = await importFile(`${SDS}/PCF/main.js`);
  const OCMmod = await importFile(`${SDS}/OCM/main.js`);
  const OEMmod = await importFile(`${SDS}/OEM/main.js`);
  const { RFMT } = await importFile(`${SDS}/RFM/RFM.js`);
  const { CelestialFrameWrapperT } = await importFile(`${SDS}/RFM/CelestialFrameWrapper.js`);
  const { CelestialFrame } = await importFile(`${SDS}/RFM/CelestialFrame.js`);
  const { RFMUnion } = await importFile(`${SDS}/RFM/RFMUnion.js`);
  return { flatbuffers, PCF, OCM: OCMmod.OCM, OEM: OEMmod.OEM, OEMT: OEMmod.OEMT, ephemerisDataBlockT: OEMmod.ephemerisDataBlockT, ephemerisDataLineT: OEMmod.ephemerisDataLineT,
    CATT: OEMmod.CATT, timingStandard: OEMmod.timingStandard, RFMT, CelestialFrameWrapperT, CelestialFrame, RFMUnion, TYPES };
}

/** A GCRF $OEM whose useable interval is the whole block, so the fit takes the whole arc. states: [{ epoch (UTC text), r, v }] in km and km/s. */
export function wholeArcOem(lib, { norad, states }) {
  const { flatbuffers, OEM, OEMT, ephemerisDataBlockT, ephemerisDataLineT, CATT, timingStandard, RFMT, CelestialFrameWrapperT, CelestialFrame, RFMUnion } = lib;
  const rfm = Object.assign(new RFMT(), { FRAME_TYPE: RFMUnion.CelestialFrameWrapper, FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.GCRF }), NAME: 'GCRF' });
  const lines = states.map((s) => Object.assign(new ephemerisDataLineT(), { EPOCH: s.epoch, X: s.r[0], Y: s.r[1], Z: s.r[2], X_DOT: s.v[0], Y_DOT: s.v[1], Z_DOT: s.v[2] }));
  const blk = Object.assign(new ephemerisDataBlockT(), {
    OBJECT: Object.assign(new CATT(), { OBJECT_NAME: `SAT-${norad}`, OBJECT_ID: `${norad}`, NORAD_CAT_ID: Number(norad) >>> 0 }),
    CENTER_NAME: 'EARTH', REFERENCE_FRAME: rfm, TIME_SYSTEM: timingStandard.UTC,
    START_TIME: lines[0].EPOCH, STOP_TIME: lines.at(-1).EPOCH, USEABLE_START_TIME: lines[0].EPOCH, USEABLE_STOP_TIME: lines.at(-1).EPOCH, EPHEMERIS_DATA_LINES: lines });
  const oem = Object.assign(new OEMT(), { CCSDS_OEM_VERS: '2.0', CREATION_DATE: lines.at(-1).EPOCH, ORIGINATOR: 'SDN-AP', EPHEMERIS_DATA_BLOCK: [blk] });
  const b = new flatbuffers.Builder(Math.max(4096, lines.length * 96));
  OEM.finishOEMBuffer(b, oem.pack(b));
  return b.asUint8Array().slice();
}

/** FORCES packed with its defaults: the module reads a stated atmosphere as a field present on the wire, and NRLMSISE-00 is the schema default. */
function packForcesWithDefaults(f) {
  const pack = f.pack.bind(f);
  f.pack = (bb) => {
    const offset = bb.addFieldOffset;
    bb.addFieldOffset = function (slot, value, d) { if (value !== d) offset.call(this, slot, value, d); };
    bb.forceDefaults(true);
    try { return pack(bb); } finally { bb.forceDefaults(false); bb.addFieldOffset = offset; }
  };
}

/** The fit's $PCF of a recipe ('W' or 'X') for a set of eccentricity e. */
export function fitPcfBytes(lib, arm, e) {
  const { PCF, flatbuffers } = lib;
  const c = new PCF.PCFT();
  if (arm === 'W') {
    const tesseral = e > 0.048 ? 0 : 31;
    c.THEORY = PCF.pcfTheory.AP;
    c.FORCES = Object.assign(new PCF.PCFForceModelT(), {
      EPHEMERIS_SOURCE: '', ATMOSPHERE_MODEL: PCF.pcfAtmosphereFamily.NRLMSISE00, WEATHER_SOURCE: PCF.pcfWeatherSource.RECORDS,
      HAS_MAXIMUM_TESSERAL_DEGREE: tesseral > 0, MAXIMUM_TESSERAL_DEGREE: tesseral, HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: 20 });
    c.FIT = Object.assign(new PCF.PCFFitPolicyT(), { WEATHER_HORIZON_DAYS: 30 });
  } else if (arm === 'X') {
    c.THEORY = PCF.pcfTheory.SGP4XP;
    c.FORCES = Object.assign(new PCF.PCFForceModelT(), { EPHEMERIS_SOURCE: '', ATMOSPHERE_MODEL: PCF.pcfAtmosphereFamily.JACCHIA70 });
  } else throw new Error(`no recipe ${arm}`);
  packForcesWithDefaults(c.FORCES);
  const b = new flatbuffers.Builder(256);
  b.finish(c.pack(b), '$PCF');
  return b.asUint8Array().slice();
}

/** The module's fit. Returns { ok, ocmBytes, rmsM } or { ok: false, status: { code, name, msg } }; `inputs` are the port inputs after the $OEM and $PCF. */
export async function fitRecord(host, lib, { oem, pcf, extra }) {
  const res = await host.invoke({ methodId: 'fit', inputs: [
    { portId: 'ephemeris', typeRef: TYPES.OEM, payload: oem }, { portId: 'configuration', typeRef: TYPES.PCF, payload: pcf }, ...extra] });
  if (res.statusCode !== 0) return { ok: false, status: { code: res.statusCode, name: res.errorCode ?? 'fit-error', msg: String(res.errorMessage ?? '').slice(0, 160) } };
  const ocmBytes = new Uint8Array(res.outputs.find((o) => o.portId === 'elements').payload);
  const u = lib.OCM.getRootAsOCM(new lib.flatbuffers.ByteBuffer(ocmBytes)).unpack();
  return { ok: true, ocmBytes, rmsM: (u.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? NaN) * 1000 };
}
