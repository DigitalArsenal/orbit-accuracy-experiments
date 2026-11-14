// What names a record of the synthetic set, and what links one record to another.
//
// Nothing here is a real satellite. Every record states that: NORAD_CAT_ID 0, CATALOG_NAME SYNTHETIC-ORBITS, OBJECT_DESIGNATOR and OBJECT_NAME the case id,
// HEADER.MESSAGE_STATUS EXERCISE and EXERCISE_NAME the exercise ("synthetic-orbits seed 498").
//
// Three kinds of $OCM, each in a [4-byte little-endian size][FlatBuffer] stream (records.mjs):
//   the seed       (seed-ocm.fsdata)   a case's mean elements at the epoch the truth starts: the record seed.mjs makes and the reference build flies to that
//                                      epoch. HEADER.MESSAGE_ID is <case id>@<epoch>. The case's two numbers (drag area over mass Cd*A/m, radiation area over
//                                      mass Cr*A/m, m**2/kg) are stated as held ORBIT_DETERMINATION.OD_DYNAMIC_PARAMETERS, the standard's name and definition for
//                                      them. They are not stated in MEAN_ELEMENTS.BTERM and AGOM: those would change the state the reference build returns (verified).
//   the truth      (truth-ocm.fsdata)  one numerical flight: STATE_DATA (x, y, z km and vx, vy, vz km/s, GCRF, STATE_STEP_SIZE 300 s) from METADATA.START_TIME,
//                                      TRAJ_BASIS SIMULATED, the force terms it was flown with and its two numbers as above. HEADER.MESSAGE_ID is the flight's
//                                      cache key. PROVENANCE names the seed (SOURCE_ID, SOURCE_SHA256, SOURCE_BYTES) and SEED_SETS lists it.
//   the fit        (records*.fsdata)   the fitted record the module made from the flight's states. completeFit fills what the module leaves out:
//                                      the identity above, HEADER.MESSAGE_ID, and PROVENANCE: SOURCE_ID the flight's MESSAGE_ID, SOURCE_KIND Ephemeris,
//                                      SOURCE_SHA256 the SHA-256 of the flight's $OCM bytes, SOURCE_BYTES their length.
// The completion is done after the fit, on the record the module returned (unpack, fill, pack); the state the record flies is the same to the bit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { putUnique } from './duplicates.mjs';
import { RecordStream } from './records.mjs';

export const IDENTITY = { catalog: 'SYNTHETIC-ORBITS', exercise: 'synthetic-orbits seed 498', originator: 'orbit-accuracy-experiments synthetic-orbits', norad: 0 };
export const sha256hex = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const seedMessageId = (caseId, epoch) => `${caseId}@${String(epoch).replace('Z', '')}`;
const heldTerm = (O, name, value) => Object.assign(new O.OCMDynamicParameterT(), { NAME: name, VALUE: value, UNITS: 'm**2/kg', SOLVED_FOR: false });
/** The case's two numbers as held dynamical-model parameters: [{ kind, value }] with kind DRAG_AREA_OVER_MASS or SRP_AREA_OVER_MASS. */
export const heldTerms = (O, terms) => terms.map((t) => heldTerm(O, t.kind, t.value));

function header(O, t, { messageId, creation }) {
  t.HEADER ??= new O.HeaderT();
  Object.assign(t.HEADER, { CCSDS_OCM_VERS: t.HEADER.CCSDS_OCM_VERS || '3.0', ORIGINATOR: t.HEADER.ORIGINATOR || IDENTITY.originator, MESSAGE_ID: messageId, MESSAGE_STATUS: O.ocmMessageStatus.EXERCISE, EXERCISE_NAME: IDENTITY.exercise, ...(creation ? { CREATION_DATE: creation } : {}) });
}
function metadata(O, t, caseId) {
  t.METADATA ??= new O.MetadataT();
  Object.assign(t.METADATA, { NORAD_CAT_ID: IDENTITY.norad, CATALOG_NAME: IDENTITY.catalog, OBJECT_DESIGNATOR: caseId, OBJECT_NAME: caseId, TIME_SYSTEM: 'UTC' });
}
const pack = (O, fb, t) => { const b = new fb.Builder(1 << 14); O.OCM.finishOCMBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
const unpack = (O, fb, bytes) => O.OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(bytes))).unpack();

/** The seed record of a case: seedRecord's bytes (the record the reference build flies) with the identity and the held terms stated. `plain` is seedRecord's output. */
export function statedSeed(O, fb, plain, { caseId, epoch, terms, creation }) {
  const t = unpack(O, fb, plain);
  header(O, t, { messageId: seedMessageId(caseId, epoch), creation });
  metadata(O, t, caseId);
  t.TRAJ_BASIS = O.ocmTrajectoryBasis.SIMULATED;
  t.ORBIT_DETERMINATION = Object.assign(t.ORBIT_DETERMINATION ?? new O.OrbitDeterminationT(), { OD_DYNAMIC_PARAMETERS: heldTerms(O, terms) });
  return pack(O, fb, t);
}

/** The truth record of one flight. `states` Float64Array (x, y, z, vx, vy, vz per state), `startMs` the first state's epoch (UTC), `seed` { id, sha256, bytes, epoch }. */
export function truthRecord(O, fb, { hash, caseId, startMs, states, seed, terms, tolerance, degree, order, creation }) {
  const iso = (ms) => new Date(ms).toISOString().replace('Z', ''), count = states.length / 6, stopMs = startMs + (count - 1) * 300e3;
  const t = new O.OCMT();
  header(O, t, { messageId: hash, creation });
  metadata(O, t, caseId);
  Object.assign(t.METADATA, { START_TIME: iso(startMs), STOP_TIME: iso(stopMs) });
  t.TRAJ_TYPE = O.trajectoryType.CARTESIAN_PV;
  t.STATE_STEP_SIZE = 300; t.STATE_VECTOR_SIZE = 6; t.STATE_DATA = Array.from(states);
  t.CENTER_NAME = 'EARTH';
  t.TRAJ_REF_FRAME = new O.RFMT(O.RFMUnion.CelestialFrameWrapper, new O.CelestialFrameWrapperT(O.CelestialFrame.GCRF), 0, 'GCRF');
  t.TRAJ_FRAME_EPOCH = iso(startMs);
  t.TRAJ_BASIS = O.ocmTrajectoryBasis.SIMULATED;
  t.PERTURBATIONS = Object.assign(new O.PerturbationsT(), { GRAVITY_DEGREE: degree, GRAVITY_ORDER: order });
  t.INTEGRATOR = Object.assign(new O.OCMIntegratorT(), { ERROR_CONTROL: tolerance });
  t.ORBIT_DETERMINATION = Object.assign(new O.OrbitDeterminationT(), { OD_DYNAMIC_PARAMETERS: heldTerms(O, terms) });
  t.PROVENANCE = Object.assign(new O.PVNT(), { SOURCE_ID: seed.id, SOURCE_KIND: O.pvnSourceKind.ElementSet, SOURCE_SHA256: seed.sha256, SOURCE_BYTES: BigInt(seed.bytes) });
  t.SEED_SETS = [Object.assign(new O.OCMSeedSetT(), { NORAD_CAT_ID: IDENTITY.norad, EPOCH: seed.epoch, MESSAGE_ID: seed.id })];
  return pack(O, fb, t);
}

/** The fitted record the module returned, with what it leaves out filled: identity, HEADER.MESSAGE_ID, PROVENANCE naming the flight it was fitted to. `truth` { id, sha256, bytes }. */
export function completeFit(O, fb, fitted, { caseId, messageId, truth }) {
  const t = unpack(O, fb, fitted);
  header(O, t, { messageId });
  metadata(O, t, caseId);
  t.PROVENANCE = Object.assign(t.PROVENANCE ?? new O.PVNT(), { SOURCE_ID: truth.id, SOURCE_KIND: O.pvnSourceKind.Ephemeris, SOURCE_SHA256: truth.sha256, SOURCE_BYTES: BigInt(truth.bytes) });
  return pack(O, fb, t);
}

/** Index by HEADER.MESSAGE_ID. Duplicates are errors; { newest: true } selects by CREATION_DATE.
 * Missing or tied creation dates are refused. An incomplete trailing frame is deferred. */
export class FrameIndex {
  constructor(O, fb, file, { newest = false } = {}) { this.newest = newest; this.O = O; this.fb = fb; this.file = file; this.at = 0; this.map = new Map(); this.stream = new RecordStream(file); }
  scan() {
    if (!fs.existsSync(this.file)) return;
    const fd = fs.openSync(this.file, 'r');
    try {
      const size = fs.fstatSync(fd).size, head = Buffer.alloc(4);
      while (this.at + 4 <= size) {
        fs.readSync(fd, head, 0, 4, this.at); const n = head.readUInt32LE(0);
        if (this.at + 4 + n > size) break;   // an incomplete frame is deferred
        const frame = Buffer.alloc(n); fs.readSync(fd, frame, 0, n, this.at + 4);
        const header = this.O.OCM.getRootAsOCM(new this.fb.ByteBuffer(new Uint8Array(frame))).HEADER();
        putUnique(this.map, header?.MESSAGE_ID(), { sha256: sha256hex(frame), bytes: n }, header?.CREATION_DATE(), this.newest);
        this.at += 4 + n;
      }
    } finally { fs.closeSync(fd); }
  }
  lookup(id) { this.scan(); return this.map.get(id) ?? null; }
  ensure(id, make) {
    return this.stream.transaction((append) => {
      let e = this.lookup(id);
      if (!e) { append(make()); this.scan(); e = this.map.get(id); }
      if (!e) throw new Error(`${this.file}: the frame ${id} is not there after it was appended`);
      return e;
    });
  }
}

/** run.mjs and reissue-records.mjs encode the fit suffix in HEADER.MESSAGE_ID:
 * <case>:<12 hex build><fit suffix>:<theory>. Legacy identities without it share the empty suffix. */
export function fitSuffix(messageId, caseId) {
  if (!messageId?.startsWith(`${caseId}:`)) return '';
  return /^[0-9a-f]{12}([^:]*):[^:]+$/.exec(messageId.slice(caseId.length + 1))?.[1] ?? '';
}
