// The product: analysis/density-calibration calibrate_log_density at the pinned wasm, under the typed config of the arm. Requests carry the
// arcs public at the issue. Encoding, decoding and selection only: the solve is the module's.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { config, store, modulesRoot, git, sha256, DAY } from '../common.mjs';
import { publishedMs } from './planet.mjs';

const req = createRequire(path.join(modulesRoot, 'analysis/density-calibration/package.json'));
const standards = path.dirname(req.resolve('spacedatastandards.org/package.json'));
export const flatbuffers = await import(pathToFileURL(req.resolve('flatbuffers')).href);
export const DCL = await import(pathToFileURL(path.join(standards, 'lib/js/DCL/main.js')).href);
export const DCL_TYPE = { schemaName: 'DCL.fbs', fileIdentifier: '$DCL', rootTypeName: 'DCL', wireFormat: 'flatbuffer' };

/** A pinned module build of the density module: { bytes, manifest }. `which`: config.modules.density or .legacyDensity. */
export function pinnedDensity(which = config.modules.density) {
  const out = path.join(store, 'build', which.wasmSha256.slice(0, 16));
  const file = path.join(out, 'module.wasm'), manifestFile = path.join(out, 'plugin-manifest.json');
  if (!fs.existsSync(file) || !fs.existsSync(manifestFile)) {
    fs.mkdirSync(out, { recursive: true });
    const bytes = git(modulesRoot, 'show', `${which.commit}:analysis/density-calibration/dist/isomorphic/module.wasm`);
    if (sha256(bytes) !== which.wasmSha256) throw new Error(`density wasm at ${which.commit} is ${sha256(bytes)}, registered ${which.wasmSha256}`);
    fs.writeFileSync(file, bytes);
    fs.writeFileSync(manifestFile, git(modulesRoot, 'show', `${which.commit}:analysis/density-calibration/plugin-manifest.json`));
  }
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== which.wasmSha256) throw new Error(`${file} is not the registered wasm`);
  return { bytes, manifest: JSON.parse(fs.readFileSync(manifestFile)) };
}
export async function openDensity(publication = null, which = config.modules.density) {
  const { bytes, manifest } = pinnedDensity(which);
  const harness = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct', ...(publication ? { hostOptions: { config: publication } } : {}) });
  return { invoke: (methodId, inputs) => harness.invoke({ methodId, inputs }), destroy: () => harness.destroy() };
}
const T = (name, fields) => Object.assign(new DCL[`${name}T`](), fields);
export function issueRequest(issueMs, arcs) {
  const value = T('DCL', { CREATED_AT_MS: BigInt(issueMs), ATMOSPHERE: T('ATM', { MODEL: DCL.AtmosphericModelFamily.NRLMSIS00E }),
    OBJECTS: arcs.map((a) => T('dclObject', { ID: a.dove, FIRST_MS: BigInt(a.startMs), LAST_MS: BigInt(a.endMs), LN_B: a.y, LN_B_SIGMA: a.sigma, BALLISTIC_COEFFICIENT_M2_KG: a.B, OK: true })) });
  const b = new flatbuffers.Builder(1 << 16);
  DCL.DCL.finishDCLBuffer(b, value.pack(b));
  return { portId: 'request', typeRef: DCL_TYPE, payload: b.asUint8Array().slice() };
}
/** The arcs public at the issue and inside the module's history window. */
export const publicArcs = (arcs, issueMs) => arcs.filter((a) => a.startMs >= issueMs - config.product.historyDays * DAY && publishedMs(a.file) <= issueMs);
/** The record at an issue: { ok, dcl, t, s, toMs, lineage } or { ok: false, error }. */
export async function issueRecord(density, issueMs, arcs) {
  const chosen = publicArcs(arcs, issueMs);
  if (!chosen.length) return { ok: false, error: 'no arc public at the issue' };
  const r = await density.invoke('calibrate_log_density', [issueRequest(issueMs, chosen)]);
  if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode ?? r.statusCode}: ${r.errorMessage}` };
  const bytes = new Uint8Array(r.outputs[0].payload), d = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(bytes)).unpack();
  return { ok: true, dcl: bytes, t: d.CORRECTION.NODE_TIMES_MS.map(Number), s: [...d.CORRECTION.NODE_LOG_DENSITY_SCALE_DIMENSIONLESS], toMs: Number(d.SETTINGS.TO_MS), lineage: d.PROVENANCE.LINEAGE };
}
/** A record's bytes with its node times moved: the labeled wrong-date null. Nothing else changes. */
export function movedRecord(bytes, dtMs) {
  const d = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(bytes)).unpack();
  d.CORRECTION.NODE_TIMES_MS = d.CORRECTION.NODE_TIMES_MS.map((t) => t + BigInt(dtMs));
  d.SETTINGS.FROM_MS += BigInt(dtMs); d.SETTINGS.TO_MS += BigInt(dtMs);
  const b = new flatbuffers.Builder(1 << 16);
  DCL.DCL.finishDCLBuffer(b, d.pack(b));
  return b.asUint8Array().slice();
}
/** FFM's reading of a record: linear between nodes, the ends held (propagator/ffm density_correction.h). */
export function sOf(t, s, ms) {
  if (ms <= t[0]) return s[0];
  if (ms >= t.at(-1)) return s.at(-1);
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= ms) lo = m; else hi = m; }
  return s[lo] + ((s[hi] - s[lo]) * (ms - t[lo])) / (t[hi] - t[lo]);
}
