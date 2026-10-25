// Pseudo-observations from an object's element-set history (amendment A11 and A11d, M29): the SGP4 module's `propagate_ephemeris` (one call per set, in a fresh module, TEME, km, km/s, UTC) gives the
// states of a set over the interval (epoch of the set before, epoch of the set], at most 48 h back; the pseudo-observation series up to a set's epoch is the union of those intervals (so only sets up
// to the epoch of interest enter, and each speaks for the interval it was fitted to describe). A set the module cannot propagate gives no states and is counted. The orbit physics is the module's; this
// file encodes the request, cuts the intervals and counts.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openModule } from './modules.mjs';

const OMM_TYPE = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };
const PROP_TYPE = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };
const jd = (ms) => 2440587.5 + ms / 86400000;
const epochMs = (s) => Date.parse(`${s.EPOCH}Z`);

/** The sets of a Space-Track GP history: one per epoch (the latest created wins), in epoch order. */
export function uniqueSets(records) {
  const byEpoch = new Map();
  for (const r of records) {
    const prev = byEpoch.get(r.EPOCH);
    if (!prev || r.CREATION_DATE > prev.CREATION_DATE) byEpoch.set(r.EPOCH, r);
  }
  return [...byEpoch.values()].sort((a, b) => (a.EPOCH < b.EPOCH ? -1 : 1));
}

export async function openGpPseudo(modules) {
  const enc = await import(pathToFileURL(path.join(modules, 'propagator/sgp4/tests/lib/payloadEncoders.mjs')));
  const sgp4 = await openModule(modules, 'propagator/sgp4', { fresh: true });
  const MAX_BACK_H = 48;
  const ommOf = (s) => enc.encodeOmmPayload({
    noradId: Number(s.NORAD_CAT_ID), objectName: s.OBJECT_NAME ?? '', objectId: s.OBJECT_ID ?? '', epoch: s.EPOCH, meanMotion: Number(s.MEAN_MOTION), eccentricity: Number(s.ECCENTRICITY), inclination: Number(s.INCLINATION),
    raan: Number(s.RA_OF_ASC_NODE), argPericenter: Number(s.ARG_OF_PERICENTER), meanAnomaly: Number(s.MEAN_ANOMALY), bstar: Number(s.BSTAR), meanMotionDot: Number(s.MEAN_MOTION_DOT), meanMotionDdot: Number(s.MEAN_MOTION_DDOT),
  });
  return {
    provenance: sgp4.provenance,
    /**
     * The interval states of every set: [{ set, epochMs, states: [{ ms, r, v }], failed }] where states fall in (epoch of the previous set, epoch of the set] (at most 48 h back), every `stepSeconds` and at the set's
     * epoch, each from that set alone in a fresh module (a set the SGP4 module cannot propagate gives no states and is marked failed, the others go on). The first set has no previous one and gets (epoch - 6 h, epoch].
     */
    async intervals(sets, { stepSeconds = 300 } = {}) {
      const norad = Number(sets[0].NORAD_CAT_ID);
      const out = [];
      for (const [j, s] of sets.entries()) {
        const e = epochMs(s), prev = j ? epochMs(sets[j - 1]) : e - 6 * 3600e3, from = Math.max(prev, e - MAX_BACK_H * 3600e3);
        const request = enc.encodePropagatorBatchRequest({ epoch: jd(from), stopEpoch: jd(e), catalogNumbers: [norad], outputFrame: enc.ReferenceFrame.TEME, stepSeconds });
        let states = [], failed = false;
        try {
          const res = await sgp4.call('propagate_ephemeris', [
            { portId: 'omm', typeRef: OMM_TYPE, payload: Buffer.from(enc.encodeSizePrefixedStream([ommOf(s)])) },
            { portId: 'request', typeRef: PROP_TYPE, payload: Buffer.from(request) },
          ]);
          const oem = enc.decodeOem(new Uint8Array(res.ephemeris));
          states = oem.EPHEMERIS_DATA_BLOCK.flatMap((blk) => blk.EPHEMERIS_DATA_LINES.map((l) => ({ ms: Date.parse(`${l.EPOCH.replace(/Z?$/, 'Z')}`), r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] }))).filter((x) => x.ms > prev + 1 && x.ms <= e + 1);
        } catch { failed = true; }
        out.push({ set: s, epochMs: e, states, failed });
      }
      return out;
    },
    destroy: () => sgp4.destroy(),
  };
}
