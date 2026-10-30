#!/usr/bin/env node
// ca-socrates-gp-parity Part 3 worker (Amendment A1): the console's resident path, screen_window.
//   node window-worker.mjs <job.json>
// For each assigned block: one resident SOURCE_DESCRIPTIONS index (prepare_screening_index, EXACT_ONLY) over Part 1's
// order positions [p0, N) with the block's primaries as PRIMARY_SOURCE_HANDLES, then one screen_window call per
// window, drained to FINAL_CHUNK, then destroy_screening_index. The request shape is residentWindow in the module's
// tests/screeningWindowUnion.test.mjs:102-110 at 44ce9d27a. It builds requests and decodes answers only.
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
const flatc = await cqr.initCqrFlatc();
const ommSchema = cqr.publishedSchema('OMM');
const decode = (bytes) => sds.CQR.getRootAsCQR(new fb.ByteBuffer(bytes)).unpack();
const gps = JSON.parse(fs.readFileSync(job.catalogJson, 'utf8')); // catalog rows in Part 1's order, OMM fields as numbers
const s = job.screen, MIN_SECONDS = 900;
let harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: job.wasmFile });
let generation = 0;

const event = (e) => ({
  a: e.PRIMARY_NORAD_ID, b: e.SECONDARY_NORAD_ID, aId: e.PRIMARY_ID, bId: e.SECONDARY_ID,
  tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S,
  maxProb: e.PROBABILITY?.MAXIMUM_PROBABILITY ?? null, dilutionM: e.HAS_DILUTION_THRESHOLD_M ? e.DILUTION_THRESHOLD_M : null,
  aDse: e.HAS_PRIMARY_DAYS_SINCE_EPOCH ? e.PRIMARY_DAYS_SINCE_EPOCH : null, bDse: e.HAS_SECONDARY_DAYS_SINCE_EPOCH ? e.SECONDARY_DAYS_SINCE_EPOCH : null,
  combinedRadiusM: e.HAS_COMBINED_RADIUS_M ? e.COMBINED_RADIUS_M : null,
});
const invoke = (methodId, record) => harness.invoke({ methodId, inputs: [{ portId: 'request', payload: cqr.encodeCqr(flatc, record) }] });

async function prepare(block) {
  const INSTANCE = { MODULE_ID: 'conjunction-assessment', INSTANCE_ID: `socrates-a1-${block.block}`, GENERATION: ++generation };
  const sources = gps.slice(block.p0).map((g) => ({ ...cqr.gpSource(g), SOURCE_HANDLE: g.NORAD_CAT_ID }));
  const primaries = gps.slice(block.p0, block.p1).map((g) => g.NORAD_CAT_ID);
  const r = await invoke('prepare_screening_index', { INDEX_REQUEST: { INSTANCE, INDEX_CONTENT: 'SOURCE_DESCRIPTIONS', REFINEMENT_MODE: 'EXACT_ONLY', SOURCES: sources, PRIMARY_SOURCE_HANDLES: primaries } });
  if (r.statusCode !== 0) throw new Error(`prepare_screening_index ${r.errorCode}: ${r.errorMessage}`);
  const index = cqr.decodeCqr(flatc, r.outputs[0].payload).INDEX_RESULT;
  return { INSTANCE, handle: index.SCREENING_INDEX_HANDLE, sourceCount: Number(index.SOURCE_COUNT), candidatePairs: Number(index.CANDIDATE_PAIR_COUNT) };
}

async function window(index, startJd, seconds) {
  const controls = cqr.screeningControls({
    startJd, durationSeconds: seconds, thresholdM: s.thresholdM, numThreads: job.threads,
    coarseStepSec: s.coarseStepSeconds, fineTolSec: s.refinementToleranceSeconds, combinedRadiusM: s.combinedRadiusM,
    useKdTree: s.useKdTree, useDynamicWindow: s.useDynamicWindow, usePerigeeFilter: s.usePerigeeFilter,
  });
  const record = { WINDOW_REQUEST: { INSTANCE: index.INSTANCE, SCREENING_INDEX_HANDLE: index.handle, CONTROLS: { ...controls, ALGORITHM: s.algorithm }, EVALUATION_FRAME: cqr.earthFrame(s.evaluationFrame) } };
  const payload = cqr.encodeCqr(flatc, record);
  const events = [], excluded = [];
  let chunks = 0;
  for (;;) {
    const r = await harness.invoke({ methodId: 'screen_window', inputs: [{ portId: 'request', payload }] });
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
    chunks++;
    if (result.FINAL_CHUNK) {
      const st = result.STATISTICS;
      const statistics = st && Object.fromEntries(Object.entries(st).map(([key, v]) => [key, typeof v === 'bigint' ? Number(v) : v]));
      if (events.length !== Number(result.CONJUNCTIONS_FOUND)) throw new Error(`CONJUNCTIONS_FOUND ${result.CONJUNCTIONS_FOUND} but ${events.length} events returned`);
      return { calls: [{ startJd, seconds, found: events.length, chunks, statistics }], events, excluded, failures: [] };
    }
  }
}

// A failed call is a finding: recorded; a new instance; the index prepared again; the span as two halves.
let current = null;
async function span(block, startJd, seconds) {
  try {
    return await window(current, startJd, seconds);
  } catch (error) {
    const failure = { startJd, seconds, error: String(error.message ?? error).split('\n')[0] };
    process.send?.({ block: block.block, failure });
    try { await harness.destroy?.(); } catch { /* the instance is already lost */ }
    harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: job.wasmFile });
    current = await prepare(block);
    if (seconds / 2 < MIN_SECONDS || (seconds / 2) % s.coarseStepSeconds !== 0) throw new Error(`block ${block.block}: ${failure.error} at ${seconds} s; no shorter split`);
    const halves = [await span(block, startJd, seconds / 2), await span(block, startJd + seconds / 2 / 86400, seconds / 2)];
    return { calls: halves.flatMap((h) => h.calls), events: halves.flatMap((h) => h.events), excluded: halves.flatMap((h) => h.excluded), failures: [failure, ...halves.flatMap((h) => h.failures)] };
  }
}

try {
  for (const block of job.blocks) {
    const todo = block.windows.filter((k) => !fs.existsSync(path.join(job.outDir, `slice-${String(block.unitBase + k).padStart(4, '0')}.json`)));
    if (!todo.length) continue;
    const t0 = performance.now();
    current = await prepare(block);
    const prepareMs = performance.now() - t0;
    for (const k of todo) {
      const t1 = performance.now();
      const startJd = job.window.startJd + (k * job.window.sliceSeconds) / 86400;
      const r = await span(block, startJd, job.window.sliceSeconds);
      const unit = block.unitBase + k;
      const answer = { unit, slice: k, block: block.block, startJd, durationSeconds: job.window.sliceSeconds, index: { sourceCount: current.sourceCount, candidatePairs: current.candidatePairs, prepareMs },
        found: r.events.length, calls: r.calls, failures: r.failures, statistics: r.calls.length === 1 ? r.calls[0].statistics : null, failedPairs: r.calls.reduce((n, c) => n + Number(c.statistics?.FAILED_PAIRS ?? 0), 0),
        excluded: [...new Map(r.excluded.map((x) => [x.norad, x])).values()], elapsedMs: performance.now() - t1, events: r.events };
      const out = path.join(job.outDir, `slice-${String(unit).padStart(4, '0')}.json`);
      fs.writeFileSync(`${out}.part`, `${JSON.stringify(answer)}\n`);
      fs.renameSync(`${out}.part`, out);
      process.send?.({ unit, block: block.block, events: r.events.length, elapsedMs: answer.elapsedMs, excluded: answer.excluded.length, failures: r.failures.length });
    }
    await invoke('destroy_screening_index', { DESTROY_REQUEST: { INSTANCE: current.INSTANCE, SCREENING_INDEX_HANDLE: current.handle } });
  }
} finally {
  await harness.destroy?.();
}
process.exit(0);
