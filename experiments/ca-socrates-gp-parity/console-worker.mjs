#!/usr/bin/env node
// ca-socrates-gp-parity Part 3 worker, console arm (Amendment A1): the console's sampled-state screen.
//   node console-worker.mjs <job.json>
// Per unit (one block of primaries and one batch of 512 secondaries, as spaceaware-ui surface.ts:349-378 batches):
// states from propagator/sgp4 (propagate_ephemeris, TEME km and km/s) on the console's grid (residentSamples.ts),
// arranged into the console's OEM blocks (cqrCodec.ts:127-165), one prepare_sample_screening_index, screen_window in
// the console's 30-minute windows with one coarse step of overlap (analysisWorker.ts:94-136), events merged by the
// console's id (cqrCodec.ts:312), then destroy_screening_index. JS only arranges the module's numbers.
// The SGP4 access below is copied from orbit-accuracy-experiments 532bd3d experiments/ca-screen-recall/access.mjs:117-178
// (openSgp4): the artifact's answer is copied behind 0..7 bytes of padding until the SDK decoder accepts its alignment.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NOT_SAMPLED } from './common.mjs';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const load = (file) => import(pathToFileURL(file).href);
const ca = path.join(job.modules, 'analysis/conjunction-assessment');
const sgp4Dir = path.join(job.modules, 'propagator/sgp4');
const cqr = await load(path.join(ca, 'tests/lib/cqr.mjs'));
const hz = await load(path.join(ca, 'tests/lib/conjunctionCommandHarness.mjs'));
const S = await load(path.join(ca, 'node_modules/spacedatastandards.org/lib/js/CQR/main.js'));
const fb = await load(path.join(ca, 'node_modules/flatbuffers/mjs/flatbuffers.js'));
const sdk = await load(path.join(ca, 'node_modules/space-data-module-sdk/src/host/browserModuleHarness.js'));
const codec = await load(path.join(ca, 'node_modules/space-data-module-sdk/src/invoke/codec.js'));
const enc = await load(path.join(sgp4Dir, 'tests/lib/payloadEncoders.mjs'));
const oemModule = await load(path.join(sgp4Dir, 'node_modules/spacedatastandards.org/lib/js/OEM/OEM.js'));
const fbs = await load(path.join(sgp4Dir, 'node_modules/flatbuffers/mjs/flatbuffers.js'));
const flatc = await cqr.initCqrFlatc();
const ommSchema = cqr.publishedSchema('OMM');
const decode = (bytes) => S.CQR.getRootAsCQR(new fb.ByteBuffer(bytes)).unpack();
const s = job.screen, plan = job.plan, MIN_SECONDS = 900;
const meta = job.catalog; // per catalog index: [norad, objectId, objectName]

// ---- propagator/sgp4 (copied, see header) ----------------------------------------------------------------------
const OMM_TYPE = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };
const PROP_TYPE = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };
const sgp4Raw = await sdk.createBrowserModuleHarness({ wasmSource: fs.readFileSync(job.sgp4Wasm), manifest: JSON.parse(fs.readFileSync(job.sgp4Manifest, 'utf8')), surface: 'direct' });
const sgp4 = async (request) => {
  const answer = await sgp4Raw.invokeRaw(codec.encodePluginInvokeRequest(request));
  for (let pad = 0; pad < 8; pad++) {
    const buffer = new ArrayBuffer(answer.length + 8), view = new Uint8Array(buffer, pad, answer.length);
    view.set(answer);
    try {
      const r = codec.decodePluginInvokeResponse(view);
      if (r.statusCode !== 0) throw new Error(`${request.methodId}: ${r.errorCode}: ${r.errorMessage}`);
      return r;
    } catch (error) { if (!/misaligned/.test(error.message)) throw error; }
  }
  throw new Error(`${request.methodId}: no padding satisfied the payload alignment`);
};
await sgp4({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', payload: new Uint8Array(fs.readFileSync(job.ommStream)), typeRef: OMM_TYPE }] });

// States [x y z vx vy vz] per line at startJd + i * step, i < lines, by NORAD; an object the module cannot answer in
// full with finite values is left out (the console skips it: residentSamples.ts:86-87).
async function sample(numbers, startJd, lines) {
  const out = new Map();
  // The module needs its stop after its start: a single state is the first of two lines.
  const stopEpoch = startJd + ((Math.max(lines, 2) - 1) * plan.stepSeconds) / 86400;
  // The module refuses a whole call when one object fails ("SGP4 fails for NORAD n at ..."); the console samples each
  // object on its own and skips the one that fails, so the named object is left out and the rest asked again
  // (halving the group when no object is named).
  const ask = async (group) => {
    if (!group.length) return [];
    try {
      const r = await sgp4({ methodId: 'propagate_ephemeris', inputs: [{ portId: 'request', typeRef: PROP_TYPE,
        payload: enc.encodePropagatorBatchRequest({ outputFrame: enc.ReferenceFrame.TEME, epoch: startJd, stopEpoch, stepSeconds: plan.stepSeconds, catalogNumbers: group }) }] });
      return r.outputs;
    } catch (error) {
      if (!/propagation-failed/.test(error.message)) throw error;
      const named = Number(/NORAD (\d+)/.exec(error.message)?.[1]);
      if (group.includes(named)) return ask(group.filter((n) => n !== named));
      if (group.length === 1) return [];
      const half = Math.ceil(group.length / 2);
      return [...await ask(group.slice(0, half)), ...await ask(group.slice(half))];
    }
  };
  for (let g = 0; g < numbers.length; g += job.sampleGroup) {
    const group = numbers.slice(g, g + job.sampleGroup);
    const r = { outputs: await ask(group) };
    for (const frame of r.outputs) {
      const oem = oemModule.OEM.getRootAsOEM(new fbs.ByteBuffer(frame.payload));
      if (oem.ephemerisDataBlockLength() !== 1) continue;
      const block = oem.EPHEMERIS_DATA_BLOCK(0);
      const norad = block.OBJECT().NORAD_CAT_ID();
      if (block.ephemerisDataLinesLength() < lines) continue;
      const values = new Float64Array(lines * 6), line = block.EPHEMERIS_DATA_LINES(0);
      let finite = true;
      for (let l = 0; l < lines && finite; l++) {
        block.EPHEMERIS_DATA_LINES(l, line);
        const v = [line.X(), line.Y(), line.Z(), line.X_DOT(), line.Y_DOT(), line.Z_DOT()];
        for (let c = 0; c < 6; c++) { if (!Number.isFinite(v[c])) finite = false; values[l * 6 + c] = v[c]; }
      }
      if (finite) out.set(norad, values);
    }
  }
  return out;
}

// ---- the console's index request (cqrCodec.ts:127-165) ----------------------------------------------------------
let generation = 0;
function indexRequest(sources, primaryHandles) {
  const instance = { moduleId: 'conjunction-assessment', instanceId: 'spaceaware-console', generation: ++generation };
  const index = new S.CQRIndexRequestT();
  index.INSTANCE = new S.PRWInstanceT(instance.moduleId, instance.instanceId, BigInt(instance.generation));
  index.INDEX_CONTENT = S.cqrIndexRepresentation.SAMPLED_STATES;
  index.REFINEMENT_MODE = S.cqrRefinementStrategy.EXACT_ONLY;
  index.PRIMARY_SOURCE_HANDLES = primaryHandles;
  index.SOURCES = sources.map((x) => {
    const block = new S.ephemerisDataBlockT();
    block.CENTER_NAME = 'EARTH';
    block.CENTER_NAIF_ID = 399;
    block.REFERENCE_FRAME = new S.RFMT(S.RFMUnion.CelestialFrameWrapper, new S.CelestialFrameWrapperT(S.CelestialFrame.TEMEOFDATE));
    block.TIME_SYSTEM = S.timingStandard.UTC;
    block.START_TIME = plan.startIso;
    block.INTERPOLATION = 'HERMITE';
    block.INTERPOLATION_DEGREE = 3;
    block.STEP_SIZE = plan.stepSeconds;
    block.STATE_VECTOR_SIZE = 6;
    block.EPHEMERIS_DATA = Array.from(x.values);
    const ephemeris = new S.OEMT();
    ephemeris.EPHEMERIS_DATA_BLOCK = [block];
    const out = new S.CQRObjectSourceT();
    out.OBJECT_ID = x.objectId;
    out.OBJECT_NAME = x.objectName;
    out.NORAD_CATALOG_ID = x.norad;
    out.SOURCE_HANDLE = x.handle;
    out.EPHEMERIS = ephemeris;
    return out;
  });
  const record = new S.CQRT();
  record.INDEX_REQUEST = index;
  const builder = new fb.Builder(sources.length * plan.count * 48 + sources.length * 512 + 1024);
  S.CQR.finishCQRBuffer(builder, record.pack(builder));
  return { instance, bytes: builder.asUint8Array() };
}

let harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: job.caWasm });
const cqrIn = (payload) => [{ portId: 'request', typeRef: { schemaName: 'CQR.fbs', fileIdentifier: '$CQR', rootTypeName: 'CQR', wireFormat: 'flatbuffer' }, payload }];
async function prepare(req) {
  const r = await harness.invoke({ methodId: 'prepare_sample_screening_index', inputs: cqrIn(req.bytes) });
  if (r.statusCode !== 0) throw new Error(`prepare_sample_screening_index ${r.errorCode}: ${r.errorMessage}`);
  const result = decode(r.outputs.find((f) => f.portId === 'result').payload).INDEX_RESULT;
  return { instance: req.instance, handle: Number(result.SCREENING_INDEX_HANDLE), sourceCount: Number(result.SOURCE_COUNT), candidatePairs: Number(result.CANDIDATE_PAIR_COUNT) };
}
const iso = (jd) => new Date(Math.round((jd - 2440587.5) * 86400000)).toISOString();
const event = (e) => ({
  id: `${e.PRIMARY_ID}:${e.SECONDARY_ID}:${iso(Number(e.TCA.JULIAN_DATE))}`,
  a: e.PRIMARY_NORAD_ID, b: e.SECONDARY_NORAD_ID, aId: e.PRIMARY_ID, bId: e.SECONDARY_ID,
  tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S,
  maxProb: e.PROBABILITY?.MAXIMUM_PROBABILITY ?? null, dilutionM: e.HAS_DILUTION_THRESHOLD_M ? e.DILUTION_THRESHOLD_M : null,
  combinedRadiusM: e.HAS_COMBINED_RADIUS_M ? e.COMBINED_RADIUS_M : null,
});

// One console window (encodeScreenWindow, cqrCodec.ts:185-210: the controls it sets; the rest are schema defaults).
async function screenWindow(index, cursor, durationDays) {
  const controls = { START_EPOCH: cqr.utcJd(cursor), DURATION_SECONDS: durationDays * 86400, THRESHOLD_M: s.thresholdM, REQUESTED_WORKERS: job.threads,
    COARSE_STEP_SECONDS: s.coarseStepSeconds, REFINEMENT_TOLERANCE_SECONDS: s.refinementToleranceSeconds, COMBINED_RADIUS_M: s.combinedRadiusM, ALGORITHM: s.algorithm };
  const payload = cqr.encodeCqr(flatc, { WINDOW_REQUEST: { INSTANCE: { MODULE_ID: index.instance.moduleId, INSTANCE_ID: index.instance.instanceId, GENERATION: index.instance.generation },
    SCREENING_INDEX_HANDLE: index.handle, CONTROLS: controls, EVALUATION_FRAME: cqr.earthFrame('TEME') } });
  const events = [], excluded = [];
  let stats = null;
  for (;;) {
    const r = await harness.invoke({ methodId: 'screen_window', inputs: cqrIn(payload) });
    // Amendment A0: incomplete-screening answers a final result whose FAILED_PAIRS counts the failed evaluations.
    const resultFrame = r.outputs.find((f) => f.portId === 'result');
    const incomplete = r.statusCode !== 0 && r.errorCode === 'incomplete-screening' && resultFrame;
    if (r.statusCode !== 0 && !incomplete) throw new Error(`screen_window ${r.errorCode}: ${r.errorMessage}`);
    const result = decode(resultFrame.payload).CATALOG_RESULT;
    if (incomplete && !result.FINAL_CHUNK) throw new Error(`screen_window ${r.errorCode} before the final chunk: ${r.errorMessage}`);
    for (const e of result.EVENTS ?? []) events.push(event(e));
    for (const f of r.outputs.filter((o) => o.portId === 'excluded')) {
      const omm = JSON.parse(flatc.generateJSON(ommSchema, { path: '/omm.bin', data: f.payload }, { defaultsJson: true }));
      excluded.push({ norad: Number(omm.NORAD_CAT_ID), comment: omm.COMMENT ?? null });
    }
    if (result.FINAL_CHUNK) {
      const st = result.STATISTICS;
      stats = st && Object.fromEntries(Object.entries(st).map(([key, v]) => [key, typeof v === 'bigint' ? Number(v) : v]));
      return { events, excluded, stats };
    }
  }
}

try {
  for (const u of job.units) {
    const out = path.join(job.outDir, `slice-${String(u.unit).padStart(4, '0')}.json`);
    if (fs.existsSync(out)) continue;
    const t0 = performance.now();
    const primaries = job.order.slice(u.p0, u.p1), secondaries = job.order.slice(u.s0, u.s1);
    const numbers = [...primaries, ...secondaries].map((i) => meta[i][0]);
    const states = await sample(numbers, plan.startJd, plan.count);
    const identity = await sample(numbers, plan.identityJd, 1);
    const sampleMs = performance.now() - t0;
    const failed = numbers.filter((n) => !states.has(n) || !identity.has(n));
    // Coincident-state filter (samePlatform.ts:82-104): a secondary whose window-start state equals a primary's.
    const pIds = primaries.map((i) => meta[i][0]).filter((n) => states.has(n) && identity.has(n));
    const coincide = (x, y) => [0, 1, 2, 3, 4, 5].every((c) => Math.abs(x[c] - y[c]) <= (c < 3 ? 1e-6 : 1e-9));
    const skipped = [], kept = [];
    for (const i of [...primaries, ...secondaries]) {
      const n = meta[i][0];
      if (!states.has(n) || !identity.has(n)) continue;
      const isPrimary = i >= 0 && primaries.includes(i);
      if (!isPrimary && pIds.some((p) => coincide(identity.get(n), identity.get(p)))) { skipped.push(n); continue; }
      kept.push({ handle: i + 1, norad: n, objectId: meta[i][1], objectName: meta[i][2], values: states.get(n) });
    }
    const primaryHandles = primaries.filter((i) => states.has(meta[i][0]) && identity.has(meta[i][0])).map((i) => i + 1);
    process.send?.({ progress: `unit ${u.unit}: sampled ${numbers.length} objects in ${(sampleMs / 1000).toFixed(1)} s` });
    const built = indexRequest(kept, primaryHandles);
    const encodeMs = performance.now() - t0 - sampleMs;
    let index = await prepare(built);
    const prepareMs = performance.now() - t0 - sampleMs;
    process.send?.({ progress: `unit ${u.unit}: index ${(built.bytes.length / 1048576).toFixed(0)} MiB encoded in ${(encodeMs / 1000).toFixed(1)} s, prepared in ${((prepareMs - encodeMs) / 1000).toFixed(1)} s` });
    // The console's windows (analysisWorker.ts:94-136).
    const windowDays = 0.5 / 24, overlapDays = s.coarseStepSeconds / 86400, endJd = job.window.startJd + job.window.durationDays;
    const byId = new Map(), moduleListed = new Map(), failures = [];
    let windows = 0, failedPairs = 0;
    const span = async (cursor, durationDays) => {
      try {
        return await screenWindow(index, cursor, durationDays);
      } catch (error) {
        failures.push({ startJd: cursor, seconds: durationDays * 86400, error: String(error.message ?? error).split('\n')[0] });
        try { await harness.destroy?.(); } catch { /* lost */ }
        harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: job.caWasm });
        index = await prepare(indexRequest(kept, primaryHandles));
        if ((durationDays * 86400) / 2 < MIN_SECONDS) throw new Error(`unit ${u.unit}: ${failures.at(-1).error}; no shorter split`);
        const a = await span(cursor, durationDays / 2), b = await span(cursor + durationDays / 2, durationDays / 2);
        return { events: [...a.events, ...b.events], excluded: [...a.excluded, ...b.excluded], stats: null };
      }
    };
    for (let cursor = job.window.startJd; cursor < endJd - 1e-12; cursor += windowDays) {
      const nominalEnd = Math.min(endJd, cursor + windowDays);
      const windowEnd = nominalEnd < endJd ? Math.min(endJd, nominalEnd + overlapDays) : nominalEnd;
      const r = await span(cursor, windowEnd - cursor);
      windows++;
      if (windows % job.progressWindows === 0) process.send?.({ progress: `unit ${u.unit}: ${windows} windows, ${byId.size} events, ${((performance.now() - t0 - prepareMs - sampleMs) / 1000).toFixed(1)} s in windows` });
      failedPairs += Number(r.stats?.FAILED_PAIRS ?? 0);
      for (const e of r.events) byId.set(e.id, e);
      for (const x of r.excluded) moduleListed.set(`${x.norad}|${x.comment}`, x);
    }
    await harness.invoke({ methodId: 'destroy_screening_index', inputs: cqrIn(cqr.encodeCqr(flatc, { DESTROY_REQUEST: {
      INSTANCE: { MODULE_ID: index.instance.moduleId, INSTANCE_ID: index.instance.instanceId, GENERATION: index.instance.generation }, SCREENING_INDEX_HANDLE: index.handle } })) });
    const events = [...byId.values()];
    const answer = { unit: u.unit, slice: 0, block: u.block, batch: u.batch, startJd: job.window.startJd, durationSeconds: job.window.durationDays * 86400,
      index: { sources: kept.length, primaries: primaryHandles.length, sourceCount: index.sourceCount, candidatePairs: index.candidatePairs },
      windows, found: events.length, failures, failedPairs, sampleMs, prepareMs, elapsedMs: performance.now() - t0, skippedCoincident: skipped,
      excluded: [...new Set(failed)].map((n) => ({ norad: n, comment: NOT_SAMPLED })).concat([...moduleListed.values()]), events };
    fs.writeFileSync(`${out}.part`, `${JSON.stringify(answer)}\n`);
    fs.renameSync(`${out}.part`, out);
    process.send?.({ unit: u.unit, block: u.block, events: events.length, elapsedMs: answer.elapsedMs, sampleMs, prepareMs, windows, excluded: answer.excluded.length, failures: failures.length });
  }
} finally {
  await harness.destroy?.();
  await sgp4Raw.destroy?.();
}
process.exit(0);
