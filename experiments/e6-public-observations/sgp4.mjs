// propagator/sgp4 through its SDK methods: `ingest_omm` ($OMM) and
// `propagate_state` (orbpro.propagator.PropagatorBatchRequest in,
// orbpro.plugins.PropagatorState out, m and m/s). The module keeps
// one entity per NORAD number; ingesting an element set replaces the
// previous one. `propagate_state` answers in Earth-fixed axes (frame code 1:
// TEME turned by GMST, the pseudo-Earth-fixed frame, without polar motion),
// velocity relative to those axes; checked against Vallado's verification
// case 00005 (runs/scratch, z axis to 1e-9 km, |r| unchanged). Encoding and
// decoding only.
import * as flatbuffers from 'flatbuffers';
import * as OMM from 'spacedatastandards.org/lib/js/OMM/main.js';

const omm = (s) => {
  const t = new OMM.OMMT();
  Object.assign(t, {
    CCSDS_OMM_VERS: 2, OBJECT_NAME: s.name ?? '', OBJECT_ID: s.objectId ?? '', EPOCH: s.epoch, NORAD_CAT_ID: s.norad,
    MEAN_ELEMENT_THEORY: OMM.meanElementSource.SGP4, ...s.elements,
  });
  const b = new flatbuffers.Builder(1024);
  OMM.OMM.finishOMMBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
};

// orbpro.propagator.PropagatorBatchRequest {epoch: double (JD UTC),
// entity_handles: [uint32], output_offset: uint32, max_count: uint32}.
function batchRequest(jd, handle) {
  const b = new flatbuffers.Builder(64);
  b.startVector(4, 1, 4); b.addInt32(handle); const handles = b.endVector();
  b.startObject(4);
  b.addFieldFloat64(0, jd, 0);
  b.addFieldOffset(1, handles, 0);
  b.addFieldInt32(2, 0, 0);
  b.addFieldInt32(3, 1, 0);
  b.finish(b.endObject());
  return b.asUint8Array().slice();
}

// orbpro.plugins.PropagatorState: position, velocity ([double]), epoch
// (int64 ms since J2000), referenceFrame (byte), ..., catalogNumber (slot
// 7), ..., valid.
function decodeState(bytes) {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  const root = bb.readInt32(0);
  const field = (slot) => bb.__offset(root, 4 + 2 * slot);
  const vec = (slot) => { const o = field(slot); const at = bb.__vector(root + o); return [0, 1, 2].map((i) => bb.readFloat64(at + 8 * i)); };
  const frameOffset = field(3);
  const validOffset = field(9);
  const catalogOffset = field(7);
  return {
    position: vec(0), velocity: vec(1), catalogNumber: catalogOffset ? bb.readUint32(root + catalogOffset) : null,
    frame: frameOffset ? bb.readInt8(root + frameOffset) : 2,  // 0 ECI, 1 ECEF, 2 TEME, 3 ICRF
    valid: validOffset ? bb.readUint8(root + validOffset) !== 0 : true,
  };
}

const JD_UNIX = 2440587.5;

// Entity handles by NORAD number, per module instance: the module numbers
// entities in ingestion order and replaces an entity's set in place.
const handles = new WeakMap();

// The element set's Earth-fixed states [m, m/s] at each instant (ms, UTC).
export async function earthFixedStates(sgp4, set, instantsMs) {
  await sgp4.invoke('ingest_omm', [{ portId: 'omm', payload: omm(set), typeRef: { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM' } }]);
  if (!handles.has(sgp4)) handles.set(sgp4, new Map());
  const known = handles.get(sgp4);
  if (!known.has(set.norad)) known.set(set.norad, known.size);
  const handle = known.get(set.norad);
  const out = [];
  for (const ms of instantsMs) {
    const response = await sgp4.invoke('propagate_state', [{ portId: 'request', payload: batchRequest(ms / 86400000 + JD_UNIX, handle), typeRef: { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP' } }]);
    const s = decodeState(response.outputs.find((f) => f.portId === 'state').payload);
    if (!s.valid || s.frame !== 1) throw new Error(`propagator/sgp4: no Earth-fixed state for ${set.norad} at ${new Date(ms).toISOString()}`);
    if (s.catalogNumber !== set.norad) throw new Error(`propagator/sgp4: handle ${handle} answered ${s.catalogNumber}, not ${set.norad}`);
    out.push([...s.position, ...s.velocity]);
  }
  return out;
}

// The legacy two-line element text format, as SatNOGS serves an
// observation's element set, read into OMM fields (text parsing only).
export function parseTwoLine(line1, line2) {
  const yy = Number(line1.slice(18, 20)), doy = Number(line1.slice(20, 32));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const ms = Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
  const iso = new Date(Math.round(ms)).toISOString().replace('Z', '');
  const exp = (text) => { const t = text.trim(); const m = /^([+-]?)(\d+)([+-]\d)$/.exec(t); return m ? Number(`${m[1]}0.${m[2]}e${m[3]}`) : Number(t); };
  return {
    norad: Number(line1.slice(2, 7)),
    epoch: iso,
    elements: {
      MEAN_MOTION: Number(line2.slice(52, 63)), ECCENTRICITY: Number(`0.${line2.slice(26, 33).trim()}`),
      INCLINATION: Number(line2.slice(8, 16)), RA_OF_ASC_NODE: Number(line2.slice(17, 25)), ARG_OF_PERICENTER: Number(line2.slice(34, 42)),
      MEAN_ANOMALY: Number(line2.slice(43, 51)), BSTAR: exp(line1.slice(53, 61)),
      MEAN_MOTION_DOT: Number(line1.slice(33, 43)), MEAN_MOTION_DDOT: exp(line1.slice(44, 52)),
    },
  };
}
