// E4's products and comparisons, routed through the modules (PLAN.md
// sections 3 and 4). This file moves records between modules and applies
// the frames module's RTN rotation to differences and covariances; it does
// no orbit computation of its own.
import fs from 'node:fs';
import { gunzipSync as zlibGunzip } from 'node:zlib';
import path from 'node:path';
import * as flatbuffers from 'flatbuffers';
import {
  OEM, OEMT, ephemerisDataBlockT, ephemerisDataLineT, CATT, RFMT, RFMUnion, CelestialFrameWrapperT, CelestialFrame, timingStandard,
} from 'spacedatastandards.org/lib/js/OEM/main.js';
import {
  FRMStateVectorT, FRMVector3T, PRW, PRWInstanceT, PRWProcessNoiseT, PRWResidentRequestT, PRWResidentStateT, PRWStateMatrixT,
  PRWT, RFMCoordinateSystemT, RFMOriginT, TIMInstantT, frmStateRepresentation, prwProcessNoiseAxes, prwProcessNoiseModel,
  rfmAxisType, rfmOriginKind, timEpochRepresentation, timingStandard as prwTiming,
} from 'spacedatastandards.org/lib/js/PRW/main.js';
import { json, loadModule, sha256 } from '../../harness/modules.mjs';
import { decodeOemStream, mpeFrame, ommFrame, OEM_TYPE } from '../../harness/records.mjs';
import { rtnAxes } from '../../harness/frames.mjs';
import { DAY_MS, config } from './common.mjs';

const PRW_TYPE = { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW', wireFormat: 'flatbuffer' };

// Space-Track epoch text -> ms (microseconds dropped; ages carry a 1 s bin).
export const epochMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);
const unixSeconds = (text) => {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?/.exec(text);
  return Date.parse(`${m[1]}Z`) / 1000 + Number(`0.${m[2] ?? '0'}`);
};

// GCRF states [{epoch ISO UTC, state [m, m/s]}] of one object as a size-prefixed $OEM (km, km/s).
export function gcrfOem(norad, states) {
  const lines = states.map((s) => new ephemerisDataLineT(s.epoch, ...s.state.slice(0, 3).map((v) => v / 1000), ...s.state.slice(3, 6).map((v) => v / 1000)));
  const object = Object.assign(new CATT(), { NORAD_CAT_ID: norad, OBJECT_ID: String(norad) });
  const frame = Object.assign(new RFMT(), { REFERENCE_FRAME_type: RFMUnion.CelestialFrameWrapper, REFERENCE_FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.GCRF }), NAME: 'GCRF' });
  const block = Object.assign(new ephemerisDataBlockT(), {
    OBJECT: object, CENTER_NAME: 'EARTH', REFERENCE_FRAME: frame, TIME_SYSTEM: timingStandard.UTC,
    START_TIME: states[0].epoch, STOP_TIME: states.at(-1).epoch, STATE_VECTOR_SIZE: 6, EPHEMERIS_DATA_LINES: lines,
  });
  const b = new flatbuffers.Builder(4096);
  OEM.finishSizePrefixedOEMBuffer(b, Object.assign(new OEMT(), { CCSDS_OEM_VERS: 3, ORIGINATOR: 'e4', EPHEMERIS_DATA_BLOCK: [block] }).pack(b));
  return { portId: 'reference', typeRef: OEM_TYPE, payload: Buffer.from(b.asUint8Array()) };
}

// Element sets from gp_history, by creation-day file (whole days and the
// partial windows that start on a day), for the objects asked for.
// -> Map norad -> [{norad, epoch, creationDate, gpId, objectName, elements}]
export function readSets(archive, fromDay, toDay, norads, run) {
  const out = new Map();
  const files = {};
  for (let t = Date.parse(`${fromDay}T00:00:00Z`); t <= Date.parse(`${toDay}T00:00:00Z`); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    const dir = path.join(archive, day.slice(0, 4));
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((n) => n.startsWith(day) && n.endsWith('.json.gz')).sort()) {
      const raw = fs.readFileSync(path.join(dir, name));
      files[path.join(day.slice(0, 4), name)] = sha256(raw);
      for (const g of JSON.parse(zlibGunzip(raw))) {
        const norad = Number(g.NORAD_CAT_ID);
        if (norads && !norads.has(norad)) continue;
        if (g.MEAN_ELEMENT_THEORY !== config.elementSets.meanElementTheory || String(g.EPHEMERIS_TYPE) !== config.elementSets.ephemerisType) continue;
        if (!out.has(norad)) out.set(norad, new Map());
        out.get(norad).set(String(g.GP_ID), {
          norad, epoch: g.EPOCH, creationDate: g.CREATION_DATE, gpId: String(g.GP_ID), objectName: g.OBJECT_NAME,
          elements: Object.fromEntries(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'].map((f) => [f, Number(g[f])])),
        });
      }
    }
  }
  run?.addInputs('gpHistory', files);
  return new Map([...out].map(([n, m]) => [n, [...m.values()]]));
}

// The set a product uses at cut-off tc (ms): latest EPOCH among sets with
// EPOCH <= tc and CREATION_DATE <= tc (PLAN.md section 2); ties go to the
// later creation. `notAfter` (ms) further bounds the epoch (Planet: the
// state's epoch).
export function setAt(sets, tc, notAfter = tc) {
  let best = null;
  for (const s of sets ?? []) {
    const e = epochMs(s.epoch), c = epochMs(s.creationDate);
    if (e > tc || e > notAfter || c > tc) continue;
    if (!best || e > epochMs(best.epoch) || (e === epochMs(best.epoch) && s.creationDate > best.creationDate)) best = s;
  }
  return best;
}

export async function productContext(modules, run) {
  const names = ['analysis/gp-error-model', 'analysis/epoch-state', 'propagator/hpop', 'foundation/frames', 'foundation/time'];
  const m = {};
  for (const name of names) { m[name] = await loadModule(modules, name); run.addModule(m[name].provenance); }
  const read = (rel) => { const file = path.join(modules, rel); const bytes = fs.readFileSync(file); run.addInputs('models', { [rel]: sha256(bytes) }); return JSON.parse(bytes); };
  const sgp4Model = read(config.inputs.sgp4CovarianceModel);
  const hpopModel = read(config.inputs.hpopCovarianceModel);
  const hpopModelFrame = json('model', hpopModel);
  let generation = 0n;

  // S: errors of the set's SGP4 prediction against each reference state, in
  // that state's RTN axes (accumulate, one sample per narrow age bin).
  // states: [{epoch, state}] GCRF; returns per state {e: [R,T,N,dR,dT,dN] km, km/s, regimeIndex, ageDays} | null.
  async function sgp4Errors(set, norad, states) {
    const t0 = epochMs(set.epoch);
    const ages = states.map((s) => (Date.parse(s.epoch) - t0) / DAY_MS);
    const half = config.scoring.ageBinHalfWidthSeconds / 86400;
    const options = json('options', { ageBinsDays: ages.map((a) => [Math.max(0, a - half), a + half]), referenceStepSeconds: 0 });
    const acc = await m['analysis/gp-error-model'].invokeJson('accumulate', [ommFrame([{ ...set, norad }]), gcrfOem(norad, states), options], 'accumulator');
    const out = states.map(() => null);
    for (const s of acc.strata) if (s.n === 1) out[s.age] = { e: s.sum, regimeIndex: s.regime, ageDays: ages[s.age] };
    return out;
  }

  // The SGP4 covariance model's RTN position covariance (km^2, 3x3) for a
  // regime and age, as the module tests coverage with it (clipped when present).
  function sgp4Covariance(regimeIndex, ageDays) {
    const s = sgp4Model.strata.find((x) => x.regimeIndex === regimeIndex && ageDays >= x.ageDays[0] && ageDays < x.ageDays[1]);
    if (!s) return null;
    const c = s.clipped?.covariance ?? s.covariance;
    if (!c) return null;
    return { regime: s.regime, ageDays: s.ageDays, c3: [c[0], c[1], c[3], c[1], c[2], c[4], c[3], c[4], c[5]] };
  }

  // H: epoch-state seed at the set's epoch, P0 and Q from hpop_arcs, HPOP
  // resident propagation to each state's epoch. Returns per state
  // {state [m, m/s] GCRF, covariance [36] m^2} | null, and the arc's regime.
  async function hpop(set, norad, states) {
    const t0 = epochMs(set.epoch);
    const ages = states.map((s) => (Date.parse(s.epoch) - t0) / DAY_MS);
    const plan = await m['analysis/gp-error-model'].invokeJson('hpop_arcs', [ommFrame([{ ...set, norad }]), gcrfOem(norad, states), hpopModelFrame,
      json('options', { targetAgesDays: ages, targetToleranceSeconds: config.scoring.ageBinHalfWidthSeconds })], 'plan');
    const arc = plan.arcs[0];
    if (!arc) return { reason: 'hpop_arcs: no arc', samples: states.map(() => null) };
    const response = await m['analysis/epoch-state'].invoke('derive', [mpeFrame([{ entityId: `NORAD:${norad}`, epochUnix: unixSeconds(set.epoch), ...set.elements }])]);
    const seeds = decodeOemStream(new Uint8Array(response.outputs.find((f) => f.portId === 'states').payload));
    if (!seeds.length) return { reason: 'epoch-state refused the set', regime: arc.regime, samples: states.map(() => null) };
    const l = seeds[0].EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
    const gcrf = () => new RFMCoordinateSystemT('GCRF', rfmAxisType.ICRF, new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399), 399);
    const identity = new PRWInstanceT('com.orbpro.hpop', 'e4', ++generation);
    const record = new PRWResidentStateT(identity, 1, norad, String(norad),
      new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [], new FRMVector3T(l.X * 1000, l.Y * 1000, l.Z * 1000), new FRMVector3T(l.X_DOT * 1000, l.Y_DOT * 1000, l.Z_DOT * 1000), 'GCRF', l.EPOCH, 'UTC'),
      gcrf());
    record.VALID = true;
    // A regime without P0 in the model: the state alone, no covariance.
    if (arc.covariance) record.COVARIANCE = new PRWStateMatrixT(6, arc.covariance);
    if (arc.processNoise) record.PROCESS_NOISE = new PRWProcessNoiseT(prwProcessNoiseModel.WHITE_ACCELERATION, prwProcessNoiseAxes.RADIAL_TRANSVERSE_NORMAL, arc.processNoise.spectralDensityM2S3, arc.processNoise.discretizationSeconds);
    const encode = (arm, value) => { const r = new PRWT(); r[arm] = value; const b = new flatbuffers.Builder(1024); PRW.finishSizePrefixedPRWBuffer(b, r.pack(b)); return b.asUint8Array().slice(); };
    await m['propagator/hpop'].invoke('ingest_state', [{ portId: 'state', typeRef: PRW_TYPE, payload: encode('RESIDENT_STATE', record) }]);
    const byEpoch = new Map(arc.targets.map((t) => [Date.parse(t.epoch), t]));
    const samples = [];
    for (const s of states) {
      if (!byEpoch.has(Date.parse(s.epoch))) { samples.push(null); continue; }
      const request = new PRWResidentRequestT(identity, new TIMInstantT(prwTiming.UTC, timEpochRepresentation.ISO8601, 0, 0, s.epoch), [1], 0, gcrf());
      const res = await m['propagator/hpop'].invoke('propagate_state', [{ portId: 'request', typeRef: PRW_TYPE, payload: encode('RESIDENT_REQUEST', request) }]);
      const out = PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(res.outputs[0].payload)).RESIDENT_STATE();
      const st = out.STATE(), p = st.POSITION(), v = st.VELOCITY(), c = out.COVARIANCE();
      samples.push({ state: [p.X(), p.Y(), p.Z(), v.X(), v.Y(), v.Z()], covariance: c ? Array.from({ length: c.valuesLength() }, (_, k) => c.VALUES(k)) : null });
    }
    return { regime: arc.regime, processNoise: !!arc.processNoise, ...(arc.covariance ? {} : { reason: `no P0 for ${arc.regime}: state without covariance` }), samples };
  }

  // a - b in the RTN axes of `about` (all GCRF, m, m/s): {e [6] km, km/s, axes}; with
  // cov (6x6 m^2 row-major) also its RTN position block in km^2.
  async function rtnDifference(epoch, a, b, about, cov) {
    const R = await rtnAxes(m['foundation/frames'], epoch, about);
    const rot = (v) => [0, 3, 6].map((i) => R[i] * v[0] + R[i + 1] * v[1] + R[i + 2] * v[2]);
    const dp = rot([0, 1, 2].map((k) => a[k] - b[k])), dv = rot([3, 4, 5].map((k) => a[k] - b[k]));
    const out = { e: [...dp, ...dv].map((x) => x / 1000) };
    if (cov) {
      const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => cov[i * 6 + j]));
      const RC = [0, 1, 2].map((i) => [0, 1, 2].map((j) => R[i * 3] * C[0][j] + R[i * 3 + 1] * C[1][j] + R[i * 3 + 2] * C[2][j]));
      out.c3 = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => (RC[i][0] * R[j * 3] + RC[i][1] * R[j * 3 + 1] + RC[i][2] * R[j * 3 + 2]) / 1e6));
    }
    return out;
  }

  return {
    modules: m, sgp4Errors, sgp4Covariance, hpop, rtnDifference,
    async destroy() { for (const x of Object.values(m)) await x.destroy(); },
  };
}
