// XM4's console path (PLAN.md, The path as flown): the seed through propagator/sgp4 in Earth-fixed axes, the catalog records framed as
// OrbPro's propagator.ffm/catalogConfiguration.js frames them (prepareCatalogConfiguration), and propagator/ffm's native exports called
// in the shard worker's order (propagator.ffm/ffmFrameWorker.js init). Encoding, framing and routing only: the seed conversion, the B*
// mapping and the dynamics are the modules'. Hosted by the experiments' SDK harness, a fresh instance per seed and per arm (V1c's way).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { config, sha256, modulesRoot, pinned, DAY } from '../common.mjs';

const modules = modulesRoot();
const url = (rel) => pathToFileURL(path.join(modules, rel)).href;
export const catalog = await import(url('propagator/ffm/catalog.mjs'));
export const enc = await import(url('propagator/sgp4/tests/lib/payloadEncoders.mjs'));
const flatbuffers = await import(pathToFileURL(createRequire(path.join(modules, 'propagator/ffm/package.json')).resolve('flatbuffers')).href);
const P = catalog.prw;
const E = config.environment, PATH = config.path;
const OMM_TYPE = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };
const PROP_TYPE = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };
const short = (e) => String(e?.message ?? e).slice(0, 300);
const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
export const jd = (t) => t / DAY + 2440587.5;
const mjd = (t) => t / DAY + 40587;

// catalogConfiguration.js alignedFrame: the frame padded with zero bytes to a multiple of 8, inside its own size prefix.
function alignedFrame(frame) {
  const padding = (8 - (frame.byteLength % 8)) % 8;
  if (padding === 0) return frame;
  const aligned = new Uint8Array(frame.byteLength + padding);
  aligned.set(frame);
  new DataView(aligned.buffer).setUint32(0, aligned.byteLength - 4, true);
  return aligned;
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, f) => n + f.byteLength, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.byteLength; }
  return out;
}

/** B1's finals Earth orientation rows (decoded once) and the kernel record (built once). */
function environment() {
  const raw = fs.readFileSync(E.earthOrientation.file);
  if (sha256(raw) !== E.earthOrientation.sha256) throw new Error(`${E.earthOrientation.file} is not the registered ${E.earthOrientation.sha256}`);
  const saved = JSON.parse(raw);
  const eop = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(Buffer.from(saved.inputs.earth_orientation_finals, 'base64')))).unpack().EARTH_ORIENTATION.ROWS;
  const kernelBytes = fs.readFileSync(E.kernel.path);
  if (sha256(kernelBytes) !== E.kernel.sha256) throw new Error(`${E.kernel.path} is not the registered ${E.kernel.sha256}`);
  return { eop, kernelBytes, kernel: catalog.kernelRecord(kernelBytes) };
}

/** The path's modules, opened once per worker. */
export async function openPath() {
  const ffm = pinned(modules, 'propagator/ffm'), sgp4 = pinned(modules, 'propagator/sgp4');
  const ffmCompiled = await WebAssembly.compile(ffm.bytes), sgp4Compiled = await WebAssembly.compile(sgp4.bytes);
  const env = environment();
  const eopFor = (D0) => { const lo = D0 - 2 * DAY, hi = D0 + 9 * DAY; return env.eop.filter((r) => r.MJD >= mjd(lo) - 1 && r.MJD <= mjd(hi) + 1); };

  /** prepareCatalogConfiguration's records for a seed at D0: the configuration with its validated placeholder, the kernel, the Earth
   *  orientation and the daily rows, each on an 8-byte boundary, and the size-prefixed $DCL last, as published. */
  function records(D0, rows, framedDcl) {
    const epoch = new Date((jd(D0) - 2440587.5) * 86400000).toISOString();
    const frames = [
      catalog.encode('EXECUTION_REQUEST', catalog.fullForceRequest({ epoch, state: PATH.placeholderState, forces: undefined })),
      env.kernel,
      catalog.encode('EARTH_ORIENTATION', table('PRWEarthOrientation', { ROWS: eopFor(D0) })),
      catalog.encode('SPACE_WEATHER', table('PRWSpaceWeatherTable', { ROWS: rows.map((r) => table('SPW', { DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })) })),
    ];
    return concat([...frames.map(alignedFrame), ...(framedDcl ? [framedDcl] : [])]);
  }

  /** The public set's state at D0 in Earth-fixed axes (m, m/s): plugin_propagate, the function the console's plugin_propagate_batch
   *  calls. { ok, fixed } or { ok: false, error }. `compiled` selects other SGP4 bytes (never in a scored run). */
  async function seed(set, norad, D0, compiled = sgp4Compiled, manifest = sgp4.manifest) {
    const e = set.elements;
    const omm = enc.encodeOmmPayload({ noradId: norad, objectName: set.objectName ?? '', objectId: set.objectId ?? '', epoch: set.epoch, meanMotion: e.MEAN_MOTION, eccentricity: e.ECCENTRICITY, inclination: e.INCLINATION,
      raan: e.RA_OF_ASC_NODE, argPericenter: e.ARG_OF_PERICENTER, meanAnomaly: e.MEAN_ANOMALY, bstar: e.BSTAR, meanMotionDot: e.MEAN_MOTION_DOT, meanMotionDdot: e.MEAN_MOTION_DDOT });
    const h = await createBrowserModuleHarness({ wasmSource: compiled, manifest, surface: 'direct' });
    try {
      const ingested = await h.invoke({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', typeRef: OMM_TYPE, payload: Buffer.from(enc.encodeSizePrefixedStream([omm])) }] });
      if (ingested.statusCode !== 0) return { ok: false, error: `ingest_omm: ${ingested.errorCode ?? ingested.statusCode}: ${String(ingested.errorMessage).slice(0, 200)}` };
      const request = enc.encodePropagatorBatchRequest({ epoch: jd(D0), catalogNumbers: [norad], outputFrame: enc.ReferenceFrame.ECEF, maxCount: 1 });
      const answered = await h.invoke({ methodId: 'propagate_state', inputs: [{ portId: 'request', typeRef: PROP_TYPE, payload: Buffer.from(request) }] });
      if (answered.statusCode !== 0) return { ok: false, error: `propagate_state: ${answered.errorCode ?? answered.statusCode}: ${String(answered.errorMessage).slice(0, 200)}` };
      const s = enc.decodePropagatorState(new Uint8Array(answered.outputs.find((o) => o.portId === 'state').payload));
      const fixed = [...s.position, ...s.velocity].map(Number);
      if (!s.valid || fixed.length !== 6 || !fixed.every(Number.isFinite) || !fixed.slice(0, 3).some((v) => v !== 0)) return { ok: false, error: 'invalid, non-finite or decayed SGP4 seed' };
      return { ok: true, fixed };
    } catch (error) { return { ok: false, error: `seed: ${short(error)}` }; } finally { await h.destroy(); }
  }

  /** One flight, the shard worker's calls in order: objects [{ fixed, bstar }] at D0 on `recordBytes`, read at epochsMs (ascending). Slot 0's
   *  states: { ok, profile, dragAreaOverMass, states [{r, v}] km GCRF, setupMs, coverageMs } or { ok: false, error, setupMs? }. */
  async function fly({ D0, objects, recordBytes, epochsMs, compiled = ffmCompiled, manifest = ffm.manifest }) {
    const h = await createBrowserModuleHarness({ wasmSource: compiled, manifest, surface: 'direct' });
    const t0 = performance.now();
    try {
      const x = h.instance.exports, memory = x.memory ?? h.memory, n = objects.length;
      const alloc = (a) => { const p = x.plugin_alloc(a.byteLength); if (!p) throw new Error('allocation failed'); new Uint8Array(memory.buffer, p, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); return p; };
      const text = (p) => { const b = new Uint8Array(memory.buffer); let z = p; while (b[z]) z += 1; return new TextDecoder().decode(b.slice(p, z)); };
      const reason = () => text(x.plugin_catalog_error());
      if (x.plugin_init() !== 0) return { ok: false, error: 'plugin_init refused' };
      const rp = alloc(recordBytes), bp = alloc(Float64Array.from(objects, (o) => o.bstar));
      const configured = x.plugin_configure_catalog(rp, recordBytes.byteLength, bp, n);
      x.plugin_free(rp); x.plugin_free(bp);
      if (configured !== 0) return { ok: false, error: `configuration: ${reason()}` };
      const profile = text(x.plugin_get_profile());
      if (profile !== PATH.profile) return { ok: false, error: `the module flies ${profile}, not ${PATH.profile}` };
      x.plugin_set_grid_stagger(PATH.gridStagger);
      x.plugin_set_ephemeris_retention(PATH.retentionDays);
      const seeds = new Float64Array(n * 7);
      objects.forEach((o, i) => { seeds[i * 7] = jd(D0); seeds.set(o.fixed, i * 7 + 1); });
      const sp = alloc(seeds);
      const seeded = x.plugin_init_states_ecef(sp, n);
      x.plugin_free(sp);
      if (seeded !== n) return { ok: false, error: `seeding: ${seeded} of ${n}: ${reason()}` };
      const mask = alloc(new Uint8Array(n).fill(1));
      x.plugin_set_visibility_mask(mask, n);
      const out = x.plugin_alloc(n * 6 * 8);
      const dragAreaOverMass = catalog.dragAreaOverMass(x, objects[0].bstar);
      const t1 = performance.now();
      const states = [];
      for (const t of epochsMs) {
        const covered = x.plugin_ensure_coverage(jd(t), 0, n);
        if (covered !== n) return { ok: false, error: `coverage at ${new Date(t).toISOString()}: ${covered}: ${reason()}`, setupMs: t1 - t0 };
        const read = x.plugin_eval_catalog_states_gcrf(jd(t), out, n);
        if (read !== n) return { ok: false, error: `read at ${new Date(t).toISOString()}: ${read}: ${reason()}`, setupMs: t1 - t0 };
        const v = new Float64Array(memory.buffer, out, 6);
        if (!v.every(Number.isFinite)) return { ok: false, error: `non-finite state at ${new Date(t).toISOString()}`, setupMs: t1 - t0 };
        if (v[0] === 0 && v[1] === 0 && v[2] === 0) return { ok: false, error: `no coverage at ${new Date(t).toISOString()}`, setupMs: t1 - t0 };
        states.push({ r: [v[0] / 1000, v[1] / 1000, v[2] / 1000], v: [v[3] / 1000, v[4] / 1000, v[5] / 1000] });
      }
      return { ok: true, profile, dragAreaOverMass, states, setupMs: t1 - t0, coverageMs: performance.now() - t1 };
    } catch (error) { return { ok: false, error: `flight: ${short(error)}` }; } finally { await h.destroy(); }
  }

  return { provenance: { ffm: { version: ffm.manifest.version, wasmSha256: sha256(ffm.bytes) }, sgp4: { version: sgp4.manifest.version, wasmSha256: sha256(sgp4.bytes) }, kernelSha256: E.kernel.sha256, earthOrientationSha256: E.earthOrientation.sha256 },
    env, eopFor, records, seed, fly };
}
