#!/usr/bin/env node
// ca-socrates-gp-parity worker: one process, one instance of the pinned conjunction-assessment artifact.
//   node worker.mjs <job.json>
// For each assigned slice k it makes one screen_catalog call over the whole catalog (all pairs), window
// [start + k * S, start + (k + 1) * S), drains the chunks until FINAL_CHUNK, and writes slice-<k>.json.
// It builds requests and decodes answers; it computes nothing about orbits.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const load = (file) => import(pathToFileURL(file).href);
const ca = path.join(job.modules, 'analysis/conjunction-assessment');
const cqr = await load(path.join(ca, 'tests/lib/cqr.mjs'));
const hz = await load(path.join(ca, 'tests/lib/conjunctionCommandHarness.mjs'));
const sds = await load(path.join(ca, 'node_modules/spacedatastandards.org/lib/js/CQR/main.js'));
const fb = await load(path.join(ca, 'node_modules/flatbuffers/mjs/flatbuffers.js'));

let harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: job.wasmFile });
const flatc = await cqr.initCqrFlatc();
const ommSchema = cqr.publishedSchema('OMM');
const decode = (bytes) => sds.CQR.getRootAsCQR(new fb.ByteBuffer(bytes)).unpack();

// The catalog: uint32 little-endian length-prefixed $OMM records, the bytes the parent hashed.
const stream = fs.readFileSync(job.ommStream);
const frames = [];
for (let at = 0; at < stream.length;) {
  const n = stream.readUInt32LE(at);
  frames.push(new Uint8Array(stream.buffer, stream.byteOffset + at + 4, n).slice());
  at += 4 + n;
}
const catalogInputs = frames.map((payload) => ({ portId: 'catalog', payload }));

const event = (e) => ({
  a: e.PRIMARY_NORAD_ID, b: e.SECONDARY_NORAD_ID, aId: e.PRIMARY_ID, bId: e.SECONDARY_ID,
  tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S,
  maxProb: e.PROBABILITY?.MAXIMUM_PROBABILITY ?? null, dilutionM: e.HAS_DILUTION_THRESHOLD_M ? e.DILUTION_THRESHOLD_M : null,
  aDse: e.HAS_PRIMARY_DAYS_SINCE_EPOCH ? e.PRIMARY_DAYS_SINCE_EPOCH : null, bDse: e.HAS_SECONDARY_DAYS_SINCE_EPOCH ? e.SECONDARY_DAYS_SINCE_EPOCH : null,
  combinedRadiusM: e.HAS_COMBINED_RADIUS_M ? e.COMBINED_RADIUS_M : null,
});

const s = job.screen;
const MIN_SECONDS = 900;

// One screen_catalog call over [startJd, startJd + seconds), drained to FINAL_CHUNK.
async function call(k, startJd, seconds) {
  const controls = cqr.screeningControls({
    startJd, durationSeconds: seconds, thresholdM: s.thresholdM, numThreads: job.threads,
    coarseStepSec: s.coarseStepSeconds, fineTolSec: s.refinementToleranceSeconds, combinedRadiusM: s.combinedRadiusM,
    useKdTree: s.useKdTree, useDynamicWindow: s.useDynamicWindow, usePerigeeFilter: s.usePerigeeFilter,
  });
  // A unit is one time slice, or one time slice of one primary block: primaries are catalog order positions
  // [p0, p1) and secondaries [p0, N) in job.order (the subset first), so every pair is screened exactly once.
  const unit = job.units?.[k];
  const ranges = unit ? { ORDERED_CATALOG_INDICES: job.order, START_ORDER_INDEX: unit.p0, HAS_START_ORDER_INDEX: true, END_ORDER_INDEX: unit.p1, HAS_END_ORDER_INDEX: true,
    SECONDARY_START_ORDER_INDEX: unit.p0, HAS_SECONDARY_START_ORDER_INDEX: true, SECONDARY_END_ORDER_INDEX: job.order.length, HAS_SECONDARY_END_ORDER_INDEX: true } : {};
  const request = cqr.encodeCqr(flatc, { CATALOG_REQUEST: { CONTROLS: { ...controls, ALGORITHM: s.algorithm }, EVALUATION_FRAME: cqr.earthFrame(s.evaluationFrame), ...ranges } });
  const inputs = [{ portId: 'request', payload: request }, ...catalogInputs];
  const events = [], excluded = [];
  let chunks = 0;
  for (;;) {
    const r = await harness.invoke({ methodId: 'screen_catalog', inputs });
    const resultFrame = r.outputs.find((f) => f.portId === 'result');
    // Amendment A0: incomplete-screening (422) answers a final result whose STATISTICS.FAILED_PAIRS counts the pair
    // evaluations that failed; the call is complete, its events are kept and its failed pairs are a finding.
    const incomplete = r.statusCode !== 0 && r.errorCode === 'incomplete-screening' && resultFrame;
    if (r.statusCode !== 0 && !incomplete) throw new Error(`screen_catalog ${r.errorCode}: ${r.errorMessage}`);
    const result = decode(resultFrame.payload).CATALOG_RESULT;
    if (incomplete && !result.FINAL_CHUNK) throw new Error(`screen_catalog ${r.errorCode} before the final chunk: ${r.errorMessage}`);
    for (const e of result.EVENTS ?? []) events.push(event(e));
    for (const f of r.outputs.filter((o) => o.portId === 'excluded')) {
      const omm = JSON.parse(flatc.generateJSON(ommSchema, { path: '/omm.bin', data: f.payload }, { defaultsJson: true }));
      excluded.push({ norad: Number(omm.NORAD_CAT_ID), comment: omm.COMMENT ?? null });
    }
    chunks++;
    if (result.FINAL_CHUNK) {
      const st = result.STATISTICS;
      const statistics = st && Object.fromEntries(Object.entries(st).map(([key, v]) => [key, typeof v === 'bigint' ? Number(v) : v]));
      const found = Number(result.CONJUNCTIONS_FOUND);
      if (events.length !== found) throw new Error(`CONJUNCTIONS_FOUND ${found} but ${events.length} events returned`);
      return { calls: [{ startJd, seconds, found, chunks, statistics, incomplete: incomplete ? r.errorCode : null }], excluded, events, objectsParsed: Number(result.OBJECTS_PARSED), failures: [] };
    }
  }
}

// A failed call (for example a trap, which loses the instance) is a finding: it is recorded, a new instance is
// made, and the same span is screened as two consecutive calls of half its length, down to MIN_SECONDS.
async function screenSpan(k, startJd, seconds) {
  try {
    return await call(k, startJd, seconds);
  } catch (error) {
    const failure = { startJd, seconds, error: String(error.message ?? error).split('\n')[0] };
    process.send?.({ unit: k, failure });
    try { await harness.destroy?.(); } catch { /* the instance is already lost */ }
    harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: job.wasmFile });
    if (seconds / 2 < MIN_SECONDS || (seconds / 2) % s.coarseStepSeconds !== 0) throw new Error(`unit ${k}: ${failure.error} at ${seconds} s; no shorter split`);
    const halves = [await screenSpan(k, startJd, seconds / 2), await screenSpan(k, startJd + seconds / 2 / 86400, seconds / 2)];
    return { calls: halves.flatMap((h) => h.calls), excluded: halves.flatMap((h) => h.excluded), events: halves.flatMap((h) => h.events),
      objectsParsed: halves[0].objectsParsed, failures: [failure, ...halves.flatMap((h) => h.failures)] };
  }
}

try {
  for (const k of job.slices) {
    const out = path.join(job.outDir, `slice-${String(k).padStart(4, '0')}.json`);
    if (fs.existsSync(out)) continue;
    const slice = job.units ? job.units[k].slice : k;
    const startJd = job.window.startJd + (slice * job.window.sliceSeconds) / 86400;
    const t0 = performance.now();
    const r = await screenSpan(k, startJd, job.window.sliceSeconds);
    const statistics = r.calls.length === 1 ? r.calls[0].statistics : null;
    const answer = { unit: k, slice, block: job.units?.[k]?.block ?? null, startJd, durationSeconds: job.window.sliceSeconds, objectsParsed: r.objectsParsed,
      found: r.events.length, calls: r.calls, failures: r.failures, statistics, failedPairs: r.calls.reduce((n, c) => n + Number(c.statistics?.FAILED_PAIRS ?? 0), 0), excluded: [...new Map(r.excluded.map((x) => [x.norad, x])).values()], elapsedMs: performance.now() - t0, events: r.events };
    fs.writeFileSync(`${out}.part`, `${JSON.stringify(answer)}\n`);
    fs.renameSync(`${out}.part`, out);
    process.send?.({ unit: k, events: r.events.length, elapsedMs: answer.elapsedMs, excluded: answer.excluded.length, failures: r.failures.length, failedPairs: answer.failedPairs });
  }
} finally {
  await harness.destroy?.();
}
process.exit(0);
