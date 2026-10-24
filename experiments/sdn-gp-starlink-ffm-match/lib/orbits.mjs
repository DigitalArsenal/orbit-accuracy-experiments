// Keplerian <-> Cartesian conversions by foundation/orbits (a module): the synthetic decays start from a circular orbit, and the decay analysis reads the osculating
// a and e of FFM-1's states. Host side only: encoding and decoding.
import { OMM, OEM, TIM, flatbuffers } from './sds.mjs';
import { openModule } from './modules.mjs';

export const GM_FFM = 398600.4415; // km3/s2, the value propagator/ffm's catalog uses (EGM2008, TT-compatible: 3.986004415e14 m3/s2)
const T = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
const plainOrPrefixed = (bytes, cls, plain, prefixed) => (String.fromCharCode(...bytes.slice(4, 8)) === `$${cls}` ? plain : prefixed);

export async function openOrbits(modules, { gm = GM_FFM } = {}) {
  const m = await openModule(modules, 'foundation/orbits');
  const context = (() => { const t = Object.assign(new OMM.OMMT(), { CCSDS_OMM_VERS: 3.0, GM: gm }); const b = new flatbuffers.Builder(256); OMM.OMM.finishOMMBuffer(b, t.pack(b)); return Buffer.from(b.asUint8Array()); })();
  const omm = (bytes) => { const u = new Uint8Array(bytes); return plainOrPrefixed(u, 'OMM', OMM.OMM.getRootAsOMM, OMM.OMM.getSizePrefixedRootAsOMM)(new flatbuffers.ByteBuffer(u)).unpack(); };
  const oem = (bytes) => { const u = new Uint8Array(bytes); return plainOrPrefixed(u, 'OEM', OEM.OEM.getRootAsOEM, OEM.OEM.getSizePrefixedRootAsOEM)(new flatbuffers.ByteBuffer(u)).unpack(); };
  return {
    /** Elements (km, degrees) at `epoch` (ISO) -> { r: [km], v: [km/s] } in the module's inertial axes. */
    async toCartesian({ epoch, a, e, i, raan, argp, meanAnomaly }) {
      const t = Object.assign(new OMM.OMMT(), { CCSDS_OMM_VERS: 3.0, ORIGINATOR: 'G1', OBJECT_NAME: 'synthetic', CENTER_NAME: 'EARTH', TIME_SYSTEM: TIM.timingStandard.UTC, MEAN_ELEMENT_THEORY: OMM.meanElementSource.DSST,
        EPOCH: epoch, SEMI_MAJOR_AXIS: a, MEAN_MOTION: 0, ECCENTRICITY: e, INCLINATION: i, RA_OF_ASC_NODE: raan, ARG_OF_PERICENTER: argp, MEAN_ANOMALY: meanAnomaly, GM: gm });
      const b = new flatbuffers.Builder(512); OMM.OMM.finishOMMBuffer(b, t.pack(b));
      const out = await m.call('keplerian_to_cartesian', [{ portId: 'mean_elements', payload: Buffer.from(b.asUint8Array()), typeRef: T('OMM') }]);
      const line = oem(out.cartesian_state).EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
      return { r: [line.X, line.Y, line.Z], v: [line.X_DOT, line.Y_DOT, line.Z_DOT] };
    },
    /** One Cartesian state (km, km/s; inertial) -> osculating { a, e, i, raan, argp, meanAnomaly } (km, degrees). */
    async toKeplerian({ epoch, r, v }) {
      const t = Object.assign(new OEM.OEMT(), { CCSDS_OEM_VERS: 2.0, ORIGINATOR: 'G1', EPHEMERIS_DATA_BLOCK: [Object.assign(new OEM.ephemerisDataBlockT(), {
        OBJECT: Object.assign(new OEM.CATT(), { OBJECT_NAME: 'x' }), CENTER_NAME: 'EARTH', TIME_SYSTEM: TIM.timingStandard.UTC, START_TIME: epoch, STOP_TIME: epoch,
        EPHEMERIS_DATA_LINES: [Object.assign(new OEM.ephemerisDataLineT(), { EPOCH: epoch, X: r[0], Y: r[1], Z: r[2], X_DOT: v[0], Y_DOT: v[1], Z_DOT: v[2] })] })] });
      const b = new flatbuffers.Builder(512); OEM.OEM.finishOEMBuffer(b, t.pack(b));
      const out = await m.call('cartesian_to_keplerian', [{ portId: 'cartesian_state', payload: Buffer.from(b.asUint8Array()), typeRef: T('OEM') }, { portId: 'gravity_context', payload: context, typeRef: T('OMM') }]);
      const k = omm(out.mean_elements);
      return { a: k.SEMI_MAJOR_AXIS, e: k.ECCENTRICITY, i: k.INCLINATION, raan: k.RA_OF_ASC_NODE, argp: k.ARG_OF_PERICENTER, meanAnomaly: k.MEAN_ANOMALY };
    },
    destroy: () => m.destroy(),
  };
}
