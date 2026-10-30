// ca-screen-recall: the two modules, loaded from a space-data-network-modules checkout.
//   conjunction-assessment  screen_catalog (the screen under test) and alfano_max_probability
//   propagator/sgp4         propagate_ephemeris and propagate_state (the reference's positions)
// Both run as the built WASM artifacts through the module SDK's browser-module harness (the direct surface).
// This file builds requests and decodes answers; it computes nothing about orbits.
import fs from 'node:fs';
import path from 'node:path';
import { importFile, sha256 } from './common.mjs';

const OMM_TYPE = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };
const PROP_TYPE = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };

const sizePrefixed = (frames) => {
  const out = new Uint8Array(frames.reduce((n, f) => n + 4 + f.length, 0)), view = new DataView(out.buffer);
  let at = 0;
  for (const f of frames) { view.setUint32(at, f.length, true); out.set(f, at + 4); at += 4 + f.length; }
  return out;
};

const pluginOf = (bytes) => { const m = JSON.parse(bytes); return { pluginId: m.pluginId, version: m.version }; };
const packageVersion = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

// ---- the screen -----------------------------------------------------------

export async function openScreen({ modules, pinned, workDir }) {
  const ca = path.join(modules, 'analysis/conjunction-assessment');
  const cqr = await importFile(path.join(ca, 'tests/lib/cqr.mjs'));
  const hz = await importFile(path.join(ca, 'tests/lib/conjunctionCommandHarness.mjs'));
  // The artifact comes from the pinned commit; the harness reads the copy made here, so the hash is of the bytes it loads.
  const wasm = pinned.artifact('analysis/conjunction-assessment/dist/isomorphic/module.wasm');
  fs.mkdirSync(workDir, { recursive: true });
  const copy = path.join(workDir, 'conjunction-assessment.module.wasm');
  fs.writeFileSync(copy, wasm);
  const fresh = () => hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: copy });
  const flatc = await cqr.initCqrFlatc();
  const ommSchema = cqr.publishedSchema('OMM');
  // Requests go in through flatc; answers are read with the SDS bindings, which keep every double exact.
  const sds = await importFile(path.join(ca, 'node_modules/spacedatastandards.org/lib/js/CQR/main.js'));
  const fb = await importFile(path.join(ca, 'node_modules/flatbuffers/mjs/flatbuffers.js'));
  const decode = (bytes) => sds.CQR.getRootAsCQR(new fb.ByteBuffer(bytes)).unpack();
  const invoke = async (harness, methodId, inputs) => {
    const r = await harness.invoke({ methodId, inputs });
    if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${r.errorMessage}`);
    return r;
  };
  const vec = (v) => (v ? [v.X, v.Y, v.Z] : null);
  const state = (s) => (s ? { pos: vec(s.STATE.POSITION), vel: vec(s.STATE.VELOCITY), frame: s.STATE.COORDINATE_SYSTEM_NAME } : null);
  const event = (e) => ({
    primary: e.PRIMARY_NORAD_ID, secondary: e.SECONDARY_NORAD_ID,
    tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, relSpeedMS: e.RELATIVE_SPEED_M_S,
    pcMax: e.PROBABILITY?.MAXIMUM_PROBABILITY ?? null, combinedRadiusM: e.COMBINED_RADIUS_M ?? null,
    primaryState: state(e.PRIMARY_STATE), secondaryState: state(e.SECONDARY_STATE),
  });
  // One screen_catalog call on its own module instance; the module answers in chunks of events until FINAL_CHUNK.
  const oneWindow = async ({ omms, startJd, durationSeconds, thresholdM, common, workers }) => {
    const controls = cqr.screeningControls({
      startJd, durationSeconds, thresholdM, numThreads: workers, coarseStepSec: common.coarseStepSeconds,
      fineTolSec: common.refinementToleranceSeconds, combinedRadiusM: common.combinedRadiusM,
      useKdTree: common.useKdTree, useDynamicWindow: common.useDynamicWindow, usePerigeeFilter: common.usePerigeeFilter,
    });
    const inputs = [{ portId: 'request', payload: cqr.encodeCqr(flatc, { CATALOG_REQUEST: {
      CONTROLS: { ...controls, ALGORITHM: common.algorithm }, EVALUATION_FRAME: cqr.earthFrame(common.evaluationFrame) } }) },
    ...omms.map((payload) => ({ portId: 'catalog', payload }))];
    const t0 = performance.now(), events = [], excluded = [], harness = await fresh();
    let statistics = null, found = 0, chunks = 0;
    try {
      for (;;) {
        const r = await invoke(harness, 'screen_catalog', inputs);
        const result = decode(r.outputs.find((f) => f.portId === 'result').payload).CATALOG_RESULT;
        for (const e of result.EVENTS ?? []) events.push(event(e));
        for (const f of r.outputs.filter((o) => o.portId === 'excluded')) {
          const omm = JSON.parse(flatc.generateJSON(ommSchema, { path: '/omm.bin', data: f.payload }, { defaultsJson: true }));
          excluded.push(Number(omm.NORAD_CAT_ID));
        }
        statistics = Object.fromEntries(Object.entries(result.STATISTICS ?? {}).map(([k, v]) => [k, Number(v)])); found = result.CONJUNCTIONS_FOUND; chunks++;
        if (result.FINAL_CHUNK) break;
      }
    } finally { await harness.destroy?.(); }
    if (events.length !== Number(found)) throw new Error(`screen_catalog reported ${found} conjunctions but returned ${events.length} events`);
    return { events, excluded, statistics, chunks, elapsedMs: performance.now() - t0 };
  };
  let alfanoHarness = null;
  return {
    wasmSha256: sha256(wasm), plugin: pluginOf(pinned.show('analysis/conjunction-assessment/plugin-manifest.json')),
    packages: { 'space-data-module-sdk': packageVersion(path.join(ca, 'node_modules/space-data-module-sdk')), 'spacedatastandards.org': packageVersion(path.join(ca, 'node_modules/spacedatastandards.org')) },
    flatc, ommSchema, cqr,
    // The screen over consecutive windows (one call each, each on a fresh instance); events of one pair closer than a second
    // across a window boundary are one event (the module keeps a TCA at an edge in both windows).
    async screen({ omms, windows, thresholdM, common, workers }) {
      const parts = [];
      for (const w of windows) parts.push(await oneWindow({ omms, ...w, thresholdM, common, workers }));
      const merged = parts.flatMap((p) => p.events).sort((a, b) => Math.min(a.primary, a.secondary) - Math.min(b.primary, b.secondary)
        || Math.max(a.primary, a.secondary) - Math.max(b.primary, b.secondary) || a.tcaJd - b.tcaJd);
      const events = [];
      for (const e of merged) {
        const p = events.at(-1);
        const same = p && Math.min(p.primary, p.secondary) === Math.min(e.primary, e.secondary) && Math.max(p.primary, p.secondary) === Math.max(e.primary, e.secondary);
        if (same && Math.abs(e.tcaJd - p.tcaJd) * 86400 < 1) { if (e.missM < p.missM) events[events.length - 1] = e; } else events.push(e);
      }
      const sum = {};
      for (const p of parts) for (const [k, v] of Object.entries(p.statistics ?? {})) sum[k] = (sum[k] ?? 0) + v;
      return { events, excluded: [...new Set(parts.flatMap((p) => p.excluded))], statistics: sum, windows: parts.length, mergedAcrossEdges: merged.length - events.length,
        chunks: parts.reduce((n, p) => n + p.chunks, 0), elapsedMs: parts.reduce((t, p) => t + p.elapsedMs, 0) };
    },
    // The module's Alfano maximum probability for a miss distance and a combined hard-body radius.
    async alfano(missM, combinedRadiusM) {
      alfanoHarness ??= await fresh();
      const r = await invoke(alfanoHarness, 'alfano_max_probability', [{ portId: 'request', payload: cqr.encodeCqr(flatc, { ALFANO_REQUEST: { MISS_DISTANCE_M: missM, COMBINED_RADIUS_M: combinedRadiusM } }) }]);
      return decode(r.outputs[0].payload).ALFANO_RESULT.MAXIMUM_PROBABILITY;
    },
    destroy: () => alfanoHarness?.destroy?.(),
  };
}

// ---- the reference's propagator ---------------------------------------------

export async function openSgp4({ modules, pinned }) {
  const ca = path.join(modules, 'analysis/conjunction-assessment');
  const sgp4Dir = path.join(modules, 'propagator/sgp4');
  // The conjunction module's installed SDK loads both artifacts, so one SDK reads every answer.
  const sdk = await importFile(path.join(ca, 'node_modules/space-data-module-sdk/src/host/browserModuleHarness.js'));
  const codec = await importFile(path.join(ca, 'node_modules/space-data-module-sdk/src/invoke/codec.js'));
  const enc = await importFile(path.join(sgp4Dir, 'tests/lib/payloadEncoders.mjs'));
  const oemModule = await importFile(path.join(sgp4Dir, 'node_modules/spacedatastandards.org/lib/js/OEM/OEM.js'));
  const flatbuffers = await importFile(path.join(sgp4Dir, 'node_modules/flatbuffers/mjs/flatbuffers.js'));
  const wasm = pinned.artifact('propagator/sgp4/dist/isomorphic/module.wasm');
  const manifest = JSON.parse(pinned.show('propagator/sgp4/plugin-manifest.json'));
  const raw = await sdk.createBrowserModuleHarness({ wasmSource: wasm, manifest, surface: 'direct' });
  // This artifact lays its answer's payload arena out on 4 bytes; the SDK decoder requires 8. The bytes are copied
  // behind 0..7 bytes of padding until the decoder accepts the alignment; no byte of the answer changes.
  const invoke = async (request) => {
    const answer = await raw.invokeRaw(codec.encodePluginInvokeRequest(request));
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
  const request = (fields) => [{ portId: 'request', typeRef: PROP_TYPE, payload: enc.encodePropagatorBatchRequest({ outputFrame: enc.ReferenceFrame.TEME, ...fields }) }];
  return {
    wasmSha256: sha256(wasm), plugin: pluginOf(pinned.show('propagator/sgp4/plugin-manifest.json')),
    packages: { 'space-data-module-sdk': packageVersion(path.join(ca, 'node_modules/space-data-module-sdk')), 'spacedatastandards.org': packageVersion(path.join(sgp4Dir, 'node_modules/spacedatastandards.org')) },
    async ingest(omms) { await invoke({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', payload: sizePrefixed(omms), typeRef: OMM_TYPE }] }); },
    // Lines at startJd + i * stepSeconds, i = 0..lines-1, in TEME (km, km/s), per object in the answer's order.
    // numbers: NORAD ids to answer (absent: every object). Returns block-major pos[(b * lines + l) * 3 + c], vel alike.
    async sample({ startJd, lines, stepSeconds, numbers }) {
      const stopEpoch = startJd + ((lines - 1) * stepSeconds) / 86400;
      const r = await invoke({ methodId: 'propagate_ephemeris', inputs: request({ epoch: startJd, stopEpoch, stepSeconds, catalogNumbers: numbers ?? [] }) });
      const blocks = r.outputs.length, norads = new Uint32Array(blocks);
      const pos = new Float64Array(blocks * lines * 3), vel = new Float64Array(blocks * lines * 3);
      let b = 0;
      for (const frame of r.outputs) {
        const oem = oemModule.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(frame.payload));
        if (oem.ephemerisDataBlockLength() !== 1) throw new Error('expected one block per object');
        const block = oem.EPHEMERIS_DATA_BLOCK(0);
        if (block.ephemerisDataLinesLength() < lines) throw new Error(`object ${block.OBJECT().NORAD_CAT_ID()} answered ${block.ephemerisDataLinesLength()} of ${lines} lines`);
        norads[b] = block.OBJECT().NORAD_CAT_ID();
        const line = block.EPHEMERIS_DATA_LINES(0);
        for (let l = 0; l < lines; l++) {
          block.EPHEMERIS_DATA_LINES(l, line);
          const at = (b * lines + l) * 3;
          pos[at] = line.X(); pos[at + 1] = line.Y(); pos[at + 2] = line.Z();
          vel[at] = line.X_DOT(); vel[at + 1] = line.Y_DOT(); vel[at + 2] = line.Z_DOT();
        }
        b++;
      }
      return { norads, lines, pos, vel };
    },
    // One epoch (UTC Julian date), TEME, m and m/s, by NORAD id.
    async state({ jd, numbers }) {
      const r = await invoke({ methodId: 'propagate_state', inputs: request({ epoch: jd, maxCount: numbers.length, catalogNumbers: numbers }) });
      const out = new Map();
      for (const frame of r.outputs) {
        const s = enc.decodePropagatorState(frame.payload);
        out.set(s.catalogNumber, { pos: s.position, vel: s.velocity, valid: s.valid });
      }
      return out;
    },
    destroy: () => raw.destroy?.(),
  };
}
