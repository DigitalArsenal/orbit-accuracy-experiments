// E4's products and comparisons, routed through the modules (PLAN.md
// sections 3 and 4, amendment A4). This file moves records between modules
// and applies the frames module's RTN rotation to differences and
// covariances; it does no orbit computation of its own.
//
// Products: S (SGP4 from the element set), R (the resident product: the
// set's epoch state propagated by propagator/hpop's resident model, called H
// before A4), H-epoch (the same epoch state propagated with every force the
// module carries) and H-arc (that force model fitted to the epoch states of a
// 3-day arc of sets). R, H-epoch and H-arc depend only on the object and its
// element set, so they are made once per set for every epoch any operator
// file scores with that set.
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
import { ommFrame, OEM_TYPE } from '../../harness/records.mjs';
import { rtnAxes } from '../../harness/frames.mjs';
import { kernelFrame } from '../../harness/prw.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { estimationCodec } from '../e2-catalog-covariance/estimation-wire.mjs';
import { conditioned, epochStates } from '../e2-catalog-covariance/product.mjs';
import { addMeanOuter, lowerToFull } from '../e2-catalog-covariance/moments.mjs';
import {
  decodeSamples, executionFrame, finalsRecords, fitArc, mjdOf, readGfzKp, readRsga, releasedEopFrame, releasedSpwRows, spaceWeatherFrame, withParameters,
} from './full-force.mjs';
import { DAY_MS, config, home } from './common.mjs';

const PRW_TYPE = { schemaName: 'PRW.fbs', fileIdentifier: '$PRW', rootTypeName: 'PRW', wireFormat: 'flatbuffer' };

// Space-Track epoch text -> ms (microseconds dropped; ages carry a 1 s bin).
export const epochMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);
const stripZ = (s) => s.replace(/Z$/, '');

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

// The H-arc's sets: every set of the object created by the latest set's
// creation, with an epoch in (latest epoch - spanDays, latest epoch], one per
// epoch (the later creation), in epoch order (amendment A4).
export function arcSets(sets, latest, spanDays) {
  const t = epochMs(latest.epoch), issued = epochMs(latest.creationDate);
  const byEpoch = new Map();
  for (const s of sets ?? []) {
    const e = epochMs(s.epoch);
    if (e > t || e <= t - spanDays * DAY_MS || epochMs(s.creationDate) > issued) continue;
    const prior = byEpoch.get(e);
    if (!prior || s.creationDate > prior.creationDate) byEpoch.set(e, s);
  }
  if (!byEpoch.has(t)) byEpoch.set(t, latest);
  return [...byEpoch.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => (epochMs(s.epoch) === t ? latest : s));
}

// Nominal Cr*A/m (m^2/kg) of an object (config.a4.physical).
export function nominalAgom(provider, norad) {
  const p = config.a4.physical;
  const name = p.byObject[String(norad)] ?? p.byProvider[provider];
  const c = p.classes[name];
  if (!c) throw new Error(`no physical class for ${provider} ${norad}`);
  return { name, agom: p.cr * c.areaM2 / c.massKg };
}

export async function productContext(modules, run) {
  const names = ['analysis/gp-error-model', 'analysis/epoch-state', 'propagator/hpop', 'foundation/frames', 'foundation/time', 'analysis/estimation', 'data-source/eop-parser'];
  const m = {};
  for (const name of names) { m[name] = await loadModule(modules, name); run.addModule(m[name].provenance); }
  const read = (rel) => { const file = path.join(modules, rel); const bytes = fs.readFileSync(file); run.addInputs('models', { [rel]: sha256(bytes) }); return JSON.parse(bytes); };
  const sgp4Model = read(config.inputs.sgp4CovarianceModel);
  const hpopModel = read(config.inputs.hpopCovarianceModel);
  const hpopModelFrame = json('model', hpopModel);
  let generation = 0n;

  // ── the full-force environment (A4) ──
  const a4 = config.a4;
  const kernelPath = path.join(repoRoot, a4.inputs.kernel.path);
  if (!fs.existsSync(kernelPath)) throw new Error(`DE440s kernel missing: fetch ${a4.inputs.kernel.url} to ${a4.inputs.kernel.path}`);
  const kernelBytes = fs.readFileSync(kernelPath);
  if (sha256(kernelBytes) !== a4.inputs.kernel.sha256) throw new Error('DE440s kernel bytes differ from the pinned SHA-256');
  run.addInputs('kernel', { [path.basename(kernelPath)]: a4.inputs.kernel.sha256 });
  const kernel = kernelFrame(kernelBytes);
  const eop = await finalsRecords(m['data-source/eop-parser'], config.inputs.eopFinals);
  run.addInputs('eop', { [path.basename(config.inputs.eopFinals)]: eop.sha256 });
  const gfz = readGfzKp(a4.inputs.gfzKp);
  run.addInputs('spaceWeather', { [path.basename(a4.inputs.gfzKp)]: gfz.sha256 });
  const rsga = readRsga(a4.inputs.swpcRsga.map(home), path.join(repoRoot, 'runs', 'cache', 'rsga'));
  run.addInputs('swpcRsga', rsga.files);
  const codec = await estimationCodec(modules, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  // Environment frames for a propagation over [fromMs, toMs] made at issueMs.
  const inputsFor = (issueMs, fromMs, toMs, forces) => [
    kernel,
    releasedEopFrame(eop.records, issueMs, a4.drivers.eopLatencyDays, mjdOf(fromMs) - 2, mjdOf(toMs) + 2),
    ...(forces.drag ? [spaceWeatherFrame(releasedSpwRows(gfz, rsga, issueMs, fromMs - 2 * DAY_MS, toMs + 2 * DAY_MS).rows)] : []),
  ];

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

  // H-arc pseudo-observation weights: the regime's [0, 0.5] d 6x6 RTN second
  // moment (clipped covariance plus the clipped mean's outer product), SI.
  function arcWeights(regime) {
    const s = sgp4Model.strata.find((x) => x.regime === regime && x.ageIndex === 0);
    if (!s?.covariance) return null;
    const second = addMeanOuter(s);
    return lowerToFull(second.clipped?.covariance ?? second.covariance).map((v) => v * 1e6);
  }

  // R, H-epoch and H-arc for one object and element set, at the union of
  // the epochs the operator files score with that set. epochs: [{epoch ISO
  // UTC, state [m, m/s]}] sorted, unique (the state is only a placeholder for
  // hpop_arcs, which reads the epochs). Returns {regime, forceRegime, R, He,
  // Ha: Map epoch -> {state, covariance [36] m^2 | null}, info}.
  async function setProducts(set, norad, provider, sets, epochs) {
    const t0 = epochMs(set.epoch);
    const ages = epochs.map((s) => (Date.parse(s.epoch) - t0) / DAY_MS);
    const plan = await m['analysis/gp-error-model'].invokeJson('hpop_arcs', [ommFrame([{ ...set, norad }]), gcrfOem(norad, epochs), hpopModelFrame,
      json('options', { targetAgesDays: ages, targetToleranceSeconds: config.scoring.ageBinHalfWidthSeconds })], 'plan');
    const arc = plan.arcs[0];
    const info = {};
    const out = { regime: arc?.regime ?? null, forceRegime: null, R: new Map(), He: new Map(), Ha: new Map(), info };
    if (!arc) { info.reason = 'hpop_arcs: no arc'; return out; }
    const [seed] = await epochStates(m['analysis/epoch-state'], [{ ...set, norad }]);
    if (!seed) { info.reason = 'epoch-state refused the set'; return out; }
    const targets = new Set(arc.targets.map((t) => Date.parse(t.epoch)));
    const scored = epochs.filter((s) => targets.has(Date.parse(s.epoch)));

    // R: the resident product (PLAN.md section 3's H; renamed by A4).
    const gcrf = () => new RFMCoordinateSystemT('GCRF', rfmAxisType.ICRF, new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399), 399);
    const identity = new PRWInstanceT('com.orbpro.hpop', 'e4', ++generation);
    const record = new PRWResidentStateT(identity, 1, norad, String(norad),
      new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [], new FRMVector3T(...seed.state.slice(0, 3)), new FRMVector3T(...seed.state.slice(3, 6)), 'GCRF', seed.epoch, 'UTC'),
      gcrf());
    record.VALID = true;
    // A regime without P0 in the model: the state alone, no covariance (A2).
    if (arc.covariance) record.COVARIANCE = new PRWStateMatrixT(6, arc.covariance);
    if (arc.processNoise) record.PROCESS_NOISE = new PRWProcessNoiseT(prwProcessNoiseModel.WHITE_ACCELERATION, prwProcessNoiseAxes.RADIAL_TRANSVERSE_NORMAL, arc.processNoise.spectralDensityM2S3, arc.processNoise.discretizationSeconds);
    const encode = (arm, value) => { const r = new PRWT(); r[arm] = value; const b = new flatbuffers.Builder(1024); PRW.finishSizePrefixedPRWBuffer(b, r.pack(b)); return b.asUint8Array().slice(); };
    await m['propagator/hpop'].invoke('ingest_state', [{ portId: 'state', typeRef: PRW_TYPE, payload: encode('RESIDENT_STATE', record) }]);
    for (const s of scored) {
      const request = new PRWResidentRequestT(identity, new TIMInstantT(prwTiming.UTC, timEpochRepresentation.ISO8601, 0, 0, s.epoch), [1], 0, gcrf());
      const res = await m['propagator/hpop'].invoke('propagate_state', [{ portId: 'request', typeRef: PRW_TYPE, payload: encode('RESIDENT_REQUEST', request) }]);
      const o = PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(res.outputs[0].payload)).RESIDENT_STATE();
      const st = o.STATE(), p = st.POSITION(), v = st.VELOCITY(), c = o.COVARIANCE();
      out.R.set(s.epoch, { state: [p.X(), p.Y(), p.Z(), v.X(), v.Y(), v.Z()], covariance: c ? Array.from({ length: c.valuesLength() }, (_, k) => c.VALUES(k)) : null });
    }
    if (!arc.covariance) info.rCovariance = `no P0 for ${arc.regime}: state without covariance`;

    // The full-force products (A4).
    const forceRegime = /^LEO/.test(arc.regime) ? 'LEO' : /^MEO/.test(arc.regime) ? 'MEO' : /^GEO/.test(arc.regime) ? 'GEO' : null;
    out.forceRegime = forceRegime;
    if (!forceRegime) { info.fullForce = `no force table for ${arc.regime}`; return out; }
    const forces = a4.forces[forceRegime];
    const issueMs = epochMs(set.creationDate);
    const b = Math.max(0, set.elements.BSTAR) * a4.bstar.toCdAreaOverMass;
    const nominal = nominalAgom(provider, norad);
    const coefficients = { b, agom: nominal.agom };
    Object.assign(info, { physicalClass: nominal.name, agom: nominal.agom, b: forces.drag ? b : null });
    const seedMs = epochMs(seed.epoch);
    const lastMs = Date.parse(scored.at(-1)?.epoch ?? seed.epoch);
    // A scored epoch at the seed's epoch takes the seed itself.
    const later = scored.filter((s) => Date.parse(s.epoch) > seedMs);
    const atSeed = scored.filter((s) => Date.parse(s.epoch) <= seedMs);

    // H-epoch: the seed with R's P0 and Q.
    try {
      const noise = arc.covariance && arc.processNoise ? { q: arc.processNoise.spectralDensityM2S3, intervalSeconds: arc.processNoise.discretizationSeconds } : null;
      if (later.length) {
        const samples = decodeSamples(await m['propagator/hpop'].invoke('invoke', [
          executionFrame({ epoch: seed.epoch, state: seed.state, samples: later.map((s) => stripZ(s.epoch)), forces, coefficients,
            covariance: arc.covariance ?? null, noise, integrator: a4.integrator }),
          ...inputsFor(issueMs, seedMs, lastMs, forces),
        ]));
        if (samples.length !== later.length) throw new Error(`propagator/hpop returned ${samples.length} samples for ${later.length} epochs`);
        later.forEach((s, k) => out.He.set(s.epoch, { state: samples[k].state, covariance: samples[k].covariance }));
      }
      for (const s of atSeed) out.He.set(s.epoch, { state: seed.state, covariance: arc.covariance ?? null });
    } catch (error) {
      info.hEpochError = String(error.message).slice(0, 300);
    }

    // H-arc: the batch fit of the arc's epoch states, then its propagation.
    try {
      const used = arcSets(sets, set, a4.fit.spanDays);
      const states = await epochStates(m['analysis/epoch-state'], used.map((s) => ({ ...s, norad })));
      const k = used.findIndex((s) => s.gpId === set.gpId);
      const observations = states.filter(Boolean);
      info.arc = { sets: used.length, states: observations.length };
      const weights = arcWeights(arc.regime);
      if (!states[k]) info.hArc = 'epoch-state refused the latest set';
      else if (observations.length < a4.fit.minimumSets) info.hArc = `too few element sets (${observations.length})`;
      else if (!weights) info.hArc = `no [0, 0.5] d stratum for ${arc.regime}`;
      else {
        const spec = a4.fit.parameters[forceRegime];
        const value = spec.kind === 'DRAG_AREA_OVER_MASS' ? b : nominal.agom;
        const sigma = spec.sigma ?? spec.relativeSigma * value;
        const parameters = [{ kind: spec.kind, value }];
        const n = 7;
        const apriori = Array(n * n).fill(0);
        a4.fit.aprioriStateSigma.forEach((x, i) => { apriori[i * n + i] = x * x; });
        apriori[6 * n + 6] = sigma * sigma;
        const reference = states[k];
        const earliestMs = Math.min(...observations.map((o) => epochMs(o.epoch)));
        const r = await fitArc({ estimation: m['analysis/estimation'], hpop: m['propagator/hpop'], codec }, inputsFor(issueMs, earliestMs, seedMs, forces), reference,
          observations.map((o) => ({ epoch: o.epoch, state: o.state, covariance: weights })),
          { parameters, apriori, forces, fixed: coefficients, integrator: a4.integrator, fit: a4.fit });
        info.fit = { status: r.status, rounds: r.rounds, hpopCalls: r.hpopCalls, iterations: r.fit?.iterations, converged: r.fit?.converged,
          reducedChiSquare: r.fit?.reducedChiSquare, degreesOfFreedom: r.fit?.degreesOfFreedom, parameter: r.fit?.estimate?.[6], parameterSigma: r.fit?.covariance ? Math.sqrt(r.fit.covariance[6 * n + 6]) : null };
        if (!r.fit?.converged) info.hArc = `fit not converged (status ${r.status})`;
        else {
          const fitted = withParameters(coefficients, parameters, r.fit.estimate.slice(6));
          const covariance = conditioned(r.fit.covariance.map((v) => v * Math.max(1, r.fit.reducedChiSquare)));
          const fittedState = r.fit.estimate.slice(0, 6);
          if (later.length) {
            const samples = decodeSamples(await m['propagator/hpop'].invoke('invoke', [
              executionFrame({ epoch: reference.epoch, state: fittedState, samples: later.map((s) => stripZ(s.epoch)), forces, coefficients: fitted,
                parameters, covariance, integrator: a4.integrator }),
              ...inputsFor(issueMs, seedMs, lastMs, forces),
            ]));
            if (samples.length !== later.length) throw new Error(`propagator/hpop returned ${samples.length} samples for ${later.length} epochs`);
            later.forEach((s, j) => out.Ha.set(s.epoch, { state: samples[j].state, covariance: samples[j].covariance, n: samples[j].n }));
          }
          for (const s of atSeed) out.Ha.set(s.epoch, { state: fittedState, covariance, n });
        }
      }
    } catch (error) {
      info.hArcError = String(error.message).slice(0, 300);
    }
    return out;
  }

  // a - b in the RTN axes of `about` (all GCRF, m, m/s): {e [6] km, km/s, axes}; with
  // cov (n x n m^2 row-major, n >= 6) also its RTN position block in km^2.
  async function rtnDifference(epoch, a, b, about, cov, n = 6) {
    const R = await rtnAxes(m['foundation/frames'], epoch, about);
    const rot = (v) => [0, 3, 6].map((i) => R[i] * v[0] + R[i + 1] * v[1] + R[i + 2] * v[2]);
    const dp = rot([0, 1, 2].map((k) => a[k] - b[k])), dv = rot([3, 4, 5].map((k) => a[k] - b[k]));
    const out = { e: [...dp, ...dv].map((x) => x / 1000) };
    if (cov) {
      const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => cov[i * n + j]));
      const RC = [0, 1, 2].map((i) => [0, 1, 2].map((j) => R[i * 3] * C[0][j] + R[i * 3 + 1] * C[1][j] + R[i * 3 + 2] * C[2][j]));
      out.c3 = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => (RC[i][0] * R[j * 3] + RC[i][1] * R[j * 3 + 1] + RC[i][2] * R[j * 3 + 2]) / 1e6));
    }
    return out;
  }

  return {
    // A5 reads the environment framing, the estimation codec and the SGP4 model too.
    modules: m, sgp4Errors, sgp4Covariance, setProducts, rtnDifference, inputsFor, codec, sgp4Model,
    async destroy() { for (const x of Object.values(m)) await x.destroy(); },
  };
}
