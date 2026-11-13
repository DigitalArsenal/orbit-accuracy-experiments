// The sdn-ap module of this experiment: the SHA-256 check before every load, SGP4 flights, AP and SGP4-XP record flights, and the closest-approach
// search over two flights. Every orbit propagation and every fit is done by the module; the search and the scoring are script code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createStandaloneHarness } from 'space-data-module-sdk/testing/isomorphic';

export const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(HERE, '../..');
export const STACK = path.resolve(REPO, '../../..');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The configuration of a run: --config <file> (default config.json beside the scripts); SDN_ARCHIVE_ROOT overrides the archive root. */
export function readConfig(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--config');
  const file = i >= 0 ? path.resolve(argv[i + 1]) : path.join(HERE, 'config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.file = file;
  config.configSha256 = sha256(fs.readFileSync(file));
  config.archiveRoot = process.env.SDN_ARCHIVE_ROOT ?? config.archive.root;
  config.storeDir = path.resolve(process.env.CONJ_STORE ?? (path.isAbsolute(config.store) ? config.store : path.join(REPO, config.store)));
  return config;
}

/** The module's bytes: SDN_AP_WASM, else the path in the configuration. Refuses any other SHA-256 than the registered one. */
export function modulePath(config) {
  return process.env[config.module.wasmPathEnv] ?? path.resolve(REPO, config.module.wasmPath);
}
export function verifyModule(config) {
  const file = modulePath(config);
  const got = sha256(fs.readFileSync(file));
  if (got !== config.module.wasmSha256) throw new Error(`the module at ${file} has SHA-256 ${got}; this experiment registers ${config.module.wasmSha256} (sdn-ap ${config.module.version})`);
  return file;
}
/** Every load goes through here, so every load is checked. */
export async function loadHost(config) {
  return createStandaloneHarness('browser', verifyModule(config), { surface: 'direct' });
}
/** The header line of every output file. */
export const header = (config, what, extra = {}) => ({ _header: { what, experiment: config.experiment, module: config.module.version, moduleWasmSha256: config.module.wasmSha256, configSha256: config.configSha256, ...extra } });

/** The Space Data Standards bindings (SDS_ROOT overrides the stack checkout's). */
export const SDS = process.env.SDS_ROOT ?? path.join(STACK, 'repos/main-packages/spacedatastandards.org/lib/js');
export const importFile = (p) => import(pathToFileURL(p).href);
export const importFlatbuffers = () => importFile(createRequire(path.join(REPO, 'package.json')).resolve('flatbuffers'));

// ---------- time ----------
export function jdOfSec(t) {
  const d = t / 86400;
  const fl = Math.floor(d);
  return { whole: fl + 2440587.5, frac: d - fl };
}
/** UTC text with up to microseconds to unix seconds (float). */
export function secOfIso(text) {
  const v = /[zZ]$/.test(text) ? text : `${text}Z`;
  const m = /\.(\d+)/.exec(text);
  const extra = m && m[1].length > 3 ? Number(`0.${m[1].slice(3)}`) * 0.001 : 0;
  return Date.parse(v) / 1000 + extra;
}
/** A set row of the set index as the structure the module's flight reads. */
export function tleOf(s, norad) {
  const t = secOfIso(s.ep);
  const jd = jdOfSec(t);
  return { whole: jd.whole, frac: jd.frac, n: s.n, e: s.e, inc: s.inc, raan: s.raan, argp: s.argp, ma: s.ma, bstar: s.bstar, ndot: s.ndot, nddot: s.nddot, norad: Number(norad), epochSec: t };
}

// ---------- flights ----------
/** One set flown by the module's SGP4 at the listed instants (unix seconds): { st, r, v } in GCRF, km and km/s. */
export function fly(host, tle, secs) {
  const x = host.instance.exports;
  const M = secs.length;
  const pRow = x.sdnap_alloc(M * 112), pMin = x.sdnap_alloc(M * 8), pOut = x.sdnap_alloc(M * 48), pSt = x.sdnap_alloc(M * 4);
  const pIn6 = x.sdnap_alloc(48), pOut6 = x.sdnap_alloc(48);
  const mem = host.memory.buffer;
  for (let j = 0; j < M; j++) {
    const f64 = new Float64Array(mem, pRow + j * 112, 13);
    f64.fill(0);
    f64[0] = tle.whole; f64[1] = tle.frac; f64[2] = tle.n; f64[3] = tle.e; f64[4] = tle.inc; f64[5] = tle.raan; f64[6] = tle.argp; f64[7] = tle.ma;
    f64[8] = tle.bstar; f64[9] = tle.ndot; f64[10] = tle.nddot;
    const u32 = new Uint32Array(mem, pRow + j * 112 + 104, 2);
    u32[0] = tle.norad >>> 0;
    u32[1] = 0; // theory SGP4
  }
  x.sdnap_init_elements(pRow, M);
  const jds = secs.map(jdOfSec);
  new Float64Array(host.memory.buffer, pMin, M).set(jds.map((jd) => ((jd.whole - tle.whole) + (jd.frac - tle.frac)) * 1440.0));
  x.sdnap_propagate_minutes_soa(pMin, 0, M, pOut, pSt);
  const raw = Float64Array.from(new Float64Array(host.memory.buffer, pOut, M * 6));
  const st = Int32Array.from(new Int32Array(host.memory.buffer, pSt, M));
  const r = new Float64Array(3 * M), v = new Float64Array(3 * M);
  for (let j = 0; j < M; j++) {
    new Float64Array(host.memory.buffer, pIn6, 6).set([raw[j], raw[M + j], raw[2 * M + j], raw[3 * M + j], raw[4 * M + j], raw[5 * M + j]]);
    x.sdnap_frame_probe(jds[j].whole, jds[j].frac, pIn6, pOut6, 1); // TEME to GCRF
    const g = new Float64Array(host.memory.buffer, pOut6, 6);
    r[3 * j] = g[0]; r[3 * j + 1] = g[1]; r[3 * j + 2] = g[2]; v[3 * j] = g[3]; v[3 * j + 1] = g[4]; v[3 * j + 2] = g[5];
  }
  x.sdnap_free(pRow); x.sdnap_free(pMin); x.sdnap_free(pOut); x.sdnap_free(pSt); x.sdnap_free(pIn6); x.sdnap_free(pOut6);
  return { st, r, v };
}

/** An AP or SGP4-XP record ($OCM bytes) flown by the module's propagate at the listed instants: { st, r, v } in GCRF. `lib` carries the bindings. */
export async function flyRecord(host, lib, ocmBytes, secs) {
  const { PCF, OEM, flatbuffers, TYPES } = lib;
  const ms = secs.map((s) => Math.round(s * 1000));
  const pcf = Object.assign(new PCF.PCFT(), { OUTPUT: Object.assign(new PCF.PCFOutputT(), {
    FRAME: PCF.pcfOutputFrame.GCRF, EPOCHS: ms.map((t) => new Date(t).toISOString().replace(/Z$/, '')), MAXIMUM_STATES: Math.max(1000, ms.length + 16) }) });
  const b = new flatbuffers.Builder(Math.max(512, ms.length * 48));
  b.finish(pcf.pack(b), '$PCF');
  const res = await host.invoke({ methodId: 'propagate', inputs: [
    { portId: 'ocm', typeRef: TYPES.OCM, payload: ocmBytes }, { portId: 'configuration', typeRef: TYPES.PCF, payload: b.asUint8Array() }] });
  if (res.statusCode !== 0 || !res.outputs.length) return { error: `${res.errorCode}: ${String(res.errorMessage).slice(0, 120)}` };
  const blk = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(res.outputs[0].payload))).EPHEMERIS_DATA_BLOCK(0);
  if (blk.ephemerisDataLinesLength() !== ms.length) return { error: `propagate returned ${blk.ephemerisDataLinesLength()} of ${ms.length}` };
  const n = ms.length, r = new Float64Array(3 * n), v = new Float64Array(3 * n), st = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const l = blk.EPHEMERIS_DATA_LINES(i);
    r[3 * i] = l.X(); r[3 * i + 1] = l.Y(); r[3 * i + 2] = l.Z(); v[3 * i] = l.X_DOT(); v[3 * i + 1] = l.Y_DOT(); v[3 * i + 2] = l.Z_DOT();
  }
  return { st, r, v };
}

// ---------- closest approach ----------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * The closest approach of two flights near `center` (unix seconds). Each source is { at(secs) -> { st, r, v } | { error } } (sync or async).
 * States in one inertial frame every second over center +- 300 s; where the minimum lies at an edge the window is widened once to +- 1500 s; the minimum
 * is refined by Newton steps on the range rate (states flown by the module at each step), stopping when the step is under 0.6 ms or after six steps.
 * A grid point whose status is not zero is skipped and counted. The row is kept in every case; its flags say what happened.
 */
export async function closestApproach(A, B, center, win = 300) {
  let skipped = 0;
  for (let k = 0; k < 2; k++) {
    const W = k === 0 ? win : 1500, n = 2 * W + 1;
    const secs = new Array(n);
    for (let i = 0; i < n; i++) secs[i] = center - W + i;
    const a = await A.at(secs), b = await B.at(secs);
    if (a.error || b.error) return { error: a.error ?? b.error };
    let best = -1, bd = Infinity;
    skipped = 0;
    for (let i = 0; i < n; i++) {
      if (a.st[i] !== 0 || b.st[i] !== 0) { skipped += 1; continue; }
      const d = Math.hypot(b.r[3 * i] - a.r[3 * i], b.r[3 * i + 1] - a.r[3 * i + 1], b.r[3 * i + 2] - a.r[3 * i + 2]);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return { error: 'sgp4-status' };
    const edge = best === 0 || best === n - 1;
    if (edge && k === 0) continue;
    let t = secs[best], it = 0, rel = null;
    for (; it < 6; it++) {
      const tt = Math.round(t * 1000) / 1000;
      const x = await A.at([tt]), y = await B.at([tt]);
      if (x.error || y.error) return { error: x.error ?? y.error };
      t = tt;
      rel = [y.r[0] - x.r[0], y.r[1] - x.r[1], y.r[2] - x.r[2]];
      const vrel = [y.v[0] - x.v[0], y.v[1] - x.v[1], y.v[2] - x.v[2]];
      const dt = -dot(rel, vrel) / dot(vrel, vrel);
      if (Math.abs(dt) < 6e-4) break;
      t += dt;
    }
    return { tca: t, miss: norm(rel) * 1000, wid: k === 1, edge, conv: it < 6, skipped };
  }
  return { error: 'unreachable' };
}

/** A state source for the closest-approach search: a set on SGP4. */
export const sgp4Source = (host, tle) => ({ at: (secs) => fly(host, tle, secs) });
/** A state source: a record flown by the module. */
export const recordSource = (host, lib, ocmBytes) => ({ at: (secs) => flyRecord(host, lib, ocmBytes, secs) });
