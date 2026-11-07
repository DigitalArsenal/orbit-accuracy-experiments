// AP from ILRS normal points (PLAN.md): the frozen-plan guard, the module hosts, the record codecs and the scorer.
// JavaScript reads files, routes FlatBuffers between modules and summarizes their numbers; every state comes from a module.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const results = path.join(root, 'results/ap-observations');
export const store = process.env.APOBS_STORE ?? config.store;
export const ARCHIVE = '/opt/data/sdn-archive';
export const MODULES = process.env.SDN_MODULES_ROOT ?? config.modules.root;
export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const DAY = 86400e3, H = 3600e3;
export const iso = (ms) => new Date(ms).toISOString().replace('Z', '000Z');
export const ms = (s) => Date.parse(String(s).replace(/(\.\d{3})\d*/, '$1').replace(/Z?$/, 'Z'));
export const keyOf = (c) => `${c.norad}|${c.cutoff}`;
export const stampOf = (c) => `${c.norad}-${c.cutoff.slice(0, 13).replace(/[-:]/g, '')}`;

/** Data are read only when PLAN.md and config.json are committed unchanged and every driven artifact matches its hash. */
export function frozen() {
  if (!config.frozen) throw new Error('plan is not frozen');
  for (const name of ['PLAN.md', 'config.json']) {
    const committed = execFileSync('git', ['show', `HEAD:experiments/ap-observations/${name}`], { cwd: root });
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`commit the frozen ${name} before data access`);
  }
  for (const [k, a] of Object.entries(config.modules.build)) {
    const h = sha256(fs.readFileSync(path.join(MODULES, a.path)));
    if (h !== a.sha256) throw new Error(`${k}: ${a.path} is ${h}, registered ${a.sha256}`);
  }
}
/** Commit time of a path's first commit. */
export const firstCommitMs = (rel) => Date.parse(execFileSync('git', ['log', '--reverse', '--format=%cI', '--', rel], { cwd: root }).toString().trim().split('\n')[0]);

const flowDir = path.join(MODULES, 'flows/observation-ap');
const req = createRequire(path.join(flowDir, 'package.json'));
const sdsRoot = path.join(flowDir, 'node_modules/spacedatastandards.org');
const imp = (p) => import(pathToFileURL(p).href);
// propagator/sgp4's request encoders (sgp4-lib/PROVENANCE.md): the byte-identical copy in sgp4-lib/, or the directory SGP4_LIB
// names (one holding tests/lib/payloadEncoders.mjs). Their dependencies (flatbuffers, spacedatastandards.org) resolve from the
// read-only clone's flows/observation-ap install, never from this repository's node_modules; every file the import loads is
// held to the closure SHA-256 in PROVENANCE.md. Imported before any other module, so that the closure is whole.
const encRoot = path.resolve(process.env.SGP4_LIB ?? path.join(dir, 'sgp4-lib'));
const encProvenance = JSON.parse(fs.readFileSync(path.join(dir, 'sgp4-lib/PROVENANCE.md'), 'utf8').match(/```json\n([\s\S]*?)\n```/)[1]);
const depsRoot = path.join(MODULES, encProvenance.dependencies.resolvedFrom);
const encLoaded = new Set();
let encRecording = false;
registerHooks({ resolve(specifier, context, next) {
  const bare = !/^(\.|\/|node:|file:|data:)/.test(specifier);
  const r = bare && context.parentURL?.startsWith(`${pathToFileURL(encRoot).href}/`)
    ? next(specifier, { ...context, parentURL: pathToFileURL(path.join(path.dirname(depsRoot), 'package.json')).href }) : next(specifier, context);
  if (encRecording && r.url.startsWith('file:')) encLoaded.add(fileURLToPath(r.url));
  return r;
} });
encRecording = true;
export const enc = await imp(path.join(encRoot, 'tests/lib/payloadEncoders.mjs'));
encRecording = false;
{
  const label = (p) => (p.startsWith(encRoot + path.sep) ? path.relative(encRoot, p) : p.startsWith(depsRoot + path.sep) ? `node_modules/${path.relative(depsRoot, p)}` : p);
  const lines = [...encLoaded].map((p) => `${label(p)} ${sha256(fs.readFileSync(p))}`).sort();
  const closure = sha256(`${lines.join('\n')}\n`);
  if (sha256(fs.readFileSync(path.join(encRoot, 'tests/lib/payloadEncoders.mjs'))) !== config.modules.build.sgp4Encoders.sha256) throw new Error(`${encRoot}: payloadEncoders.mjs differs from ${config.modules.build.sgp4Encoders.path}`);
  if (lines.length !== encProvenance.closure.files || closure !== encProvenance.closure.sha256) throw new Error(`SGP4 encoders: ${lines.length} files, closure ${closure}; PROVENANCE.md holds ${encProvenance.closure.files}, ${encProvenance.closure.sha256}`);
}
export const flatbuffers = await imp(req.resolve('flatbuffers'));
const sds = (p) => imp(path.join(sdsRoot, 'lib/js', p));
export const [P, PCF, OCMm, OEMm, EOPm, TDMm, GSTm] = await Promise.all(['PRW/main.js', 'PCF/main.js', 'OCM/main.js', 'OEM/main.js', 'EOP/main.js', 'TDM/main.js', 'GST/main.js'].map(sds));
const sdkRoot = path.join(flowDir, 'node_modules/space-data-module-sdk');
export const { createStandaloneHarness } = await imp(path.join(sdkRoot, 'src/testing/isomorphicHarness.js'));
export const { encodeHttpResponse } = await imp(path.join(sdkRoot, 'src/standards/runtimeContracts.js'));
export const { observationAp } = await imp(path.join(flowDir, 'flow.mjs'));

export const TYPE = (name, rootTypeName = name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName, wireFormat: 'flatbuffer' });
const HRSP = { schemaName: 'HttpResponse.fbs', fileIdentifier: 'HRSP', rootTypeName: 'HttpResponse', wireFormat: 'flatbuffer' };
const OMM_TYPE = { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' };
const PROP_TYPE = { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' };

/** The module hosts (SDK in-process harness, browser kind, direct surface; propagator/ffm with threads), as the flow's E2E. */
export async function openHosts(names = ['crd', 'sinex', 'eop', 'estimation', 'ffm', 'laserOd', 'sdnAp', 'sgp4', 'refs']) {
  const paths = { crd: 'data-source/ilrs-crd-source', sinex: 'data-source/ilrs-station-coordinates', eop: 'data-source/eop-parser', estimation: 'analysis/estimation',
    ffm: 'propagator/ffm', laserOd: 'flows/observation-od', sdnAp: 'propagator/sdn-ap', sgp4: 'propagator/sgp4', refs: 'analysis/reference-states' };
  const h = {};
  for (const n of names) h[n] = await createStandaloneHarness('browser', pathToFileURL(path.join(MODULES, paths[n], 'dist/isomorphic/module.wasm')), { surface: 'direct', ...(n === 'ffm' ? { enableThreads: true } : {}) });
  h.close = () => Promise.all(names.map((n) => h[n].destroy?.()));
  return h;
}
const outs = (r, port) => r.outputs.filter((o) => o.portId === port).map((o) => new Uint8Array(o.payload));
async function call(host, methodId, inputs) {
  const r = await host.invoke({ methodId, inputs });
  if (r.statusCode !== 0) { const e = new Error(`${r.errorCode ?? ''}: ${String(r.errorMessage ?? '').slice(0, 300)}`); e.refused = true; throw e; }
  return r;
}
async function source(host, methodId, portId, url, body, retrievedMs) {
  return call(host, methodId, [{ portId, typeRef: HRSP, payload: encodeHttpResponse({ url, status: 200, error: '', headers: { 'content-type': 'text/plain' }, body: new Uint8Array(body), retrievedMs }) }]);
}

// ---- inputs ----
const fileCache = new Map();
const cached = async (key, fn) => { if (!fileCache.has(key)) fileCache.set(key, await fn()); return fileCache.get(key); };
const npDir = path.join(ARCHIVE, 'hac/ilrs-edc/npt_crd_v2'), snxDir = path.join(ARCHIVE, 'hac/ilrs-edc/pos+eop');
export const c04File = path.join(ARCHIVE, 'reference-states/products/eopc04.1962-now');
const retrieved = (rel) => fs.statSync(path.join(ARCHIVE, rel)).mtimeMs;

/** The month files' $TDMs (read_crd), with each pass's epoch span and pad. */
export async function passesOf(h, target, months) {
  const all = [];
  for (const m of months) {
    const rel = `hac/ilrs-edc/npt_crd_v2/${target}/${target}_${m}.np2`;
    if (!fs.existsSync(path.join(ARCHIVE, rel))) continue;
    all.push(...await cached(rel, async () => {
      const r = await source(h.crd, 'read_crd', 'source', `https://edc.dgfi.tum.de/pub/slr/data/npt_crd_v2/${target}/2026/${target}_${m}.np2`, fs.readFileSync(path.join(ARCHIVE, rel)), retrieved(rel));
      return outs(r, 'observations').map((bytes) => {
        const t = TDMm.TDM.getRootAsTDM(new flatbuffers.ByteBuffer(bytes)).unpack();
        const obs = t.SEGMENTS.flatMap((s) => s.OBSERVATIONS);
        const epochs = obs.map((o) => ms(o.EPOCH)).filter(Number.isFinite);
        const meta = t.SEGMENTS[0]?.METADATA ?? {};
        const pad = String(meta.PARTICIPANT_1 ?? meta.OBSERVER_ID ?? t.OBSERVER_ID ?? '').match(/\d{4}/)?.[0] ?? null;
        return { bytes, start: Math.min(...epochs), end: Math.max(...epochs), pad, points: obs.filter((o) => o.KEYWORD === 'LASER_RANGE').length };
      });
    }));
  }
  return all;
}
/** The weekly ILRS SINEX dated at or before T (read_sinex): its $GSTs and pads. */
export async function stationsAt(h, T) {
  const files = fs.readdirSync(snxDir).filter((f) => /^ilrsa\.pos\+eop\.\d{6}\.v90\.snx\.gz$/.test(f)).sort();
  const dateOf = (f) => Date.parse(`20${f.slice(14, 16)}-${f.slice(16, 18)}-${f.slice(18, 20)}T00:00:00Z`);
  const f = files.filter((x) => dateOf(x) <= T).at(-1);
  if (!f) throw new Error(`no SINEX at or before ${iso(T)}`);
  return cached(f, async () => {
    const rel = `hac/ilrs-edc/pos+eop/${f}`;
    const r = await source(h.sinex, 'read_sinex', 'source', `https://edc.dgfi.tum.de/pub/slr/products/pos+eop/weekly/2026/${f.slice(14, 20)}/${f}`, zlib.gunzipSync(fs.readFileSync(path.join(ARCHIVE, rel))), retrieved(rel));
    const gsts = outs(r, 'stations');
    const pads = new Set(gsts.map((b) => { const g = GSTm.GST.getRootAsGST(new flatbuffers.ByteBuffer(b)).unpack(); return String(g.CDP_NUMBER ?? g.STATION_ID ?? '').match(/\d{4}/)?.[0]; }));
    return { file: f, gsts, pads };
  });
}
/** C04 header and the rows of [from, to] (days), through parse_c04: the EOP rows. */
export async function eopRows(h, fromMs, toMs) {
  const lines = (await cached('c04', () => fs.readFileSync(c04File, 'utf8'))).split('\n');
  const header = lines.slice(0, 6);
  const rows = lines.slice(6).filter((l) => { const m = l.trim().split(/\s+/); if (m.length < 4) return false; const t = Date.UTC(+m[0], +m[1] - 1, +m[2]); return t >= fromMs && t <= toMs; });
  const r = await source(h.eop, 'parse_c04', 'response', 'https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now', Buffer.from(`${[...header, ...rows].join('\n')}\n`), fs.statSync(c04File).mtimeMs);
  const [records] = outs(r, 'records');
  const out = [];
  for (const buf = Buffer.from(records), at = { i: 0 }; at.i < buf.length;) {
    const n = buf.readUInt32LE(at.i);
    out.push(EOPm.EOP.getRootAsEOP(new flatbuffers.ByteBuffer(Uint8Array.from(buf.subarray(at.i + 4, at.i + 4 + n)))).unpack());
    at.i += 4 + n;
  }
  return out;
}
export const kernelBytes = () => fileCache.get('kernel') ?? fileCache.set('kernel', fs.readFileSync(path.join(MODULES, config.modules.build.kernel.path))).get('kernel');

// ---- truth: the NSGF orbits, chained (later files hold their own epochs), through the harness truth gate ----
const truthCache = new Map();
export async function truthOf(target) {
  if (truthCache.has(target)) return truthCache.get(target);
  const { gate } = await import(path.join(root, 'harness/truth-gate.mjs'));
  const refRoot = path.join(ARCHIVE, 'reference-states/reference');
  const dirs = fs.readdirSync(refRoot).filter((d) => d.startsWith(`nsgf.orb.${target}.26`)).sort();
  const byEpoch = new Map();
  let head = null;
  for (const d of dirs) {
    const f = fs.readdirSync(path.join(refRoot, d)).find((x) => x.endsWith('.oem'));
    if (!f) continue;
    const oem = OEMm.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(fs.readFileSync(path.join(refRoot, d, f))))).unpack();
    const block = oem.EPHEMERIS_DATA_BLOCK[0];
    head ??= block;
    const kept = gate(block.EPHEMERIS_DATA_LINES, { product: d, norad: block.OBJECT.NORAD_CAT_ID }).kept;
    for (const l of kept) byEpoch.set(ms(l.EPOCH), l);
  }
  const lines = [...byEpoch.entries()].sort((a, b) => a[0] - b[0]).map(([t, l]) => ({ t, l }));
  const out = { head, norad: head.OBJECT.NORAD_CAT_ID, name: head.OBJECT.OBJECT_NAME, frame: head.REFERENCE_FRAME?.NAME, files: dirs.length, lines, stepS: (lines[1].t - lines[0].t) / 1000 };
  truthCache.set(target, out);
  return out;
}
export const slice = (truth, from, to, openStart = true) => truth.lines.filter(({ t }) => (openStart ? t > from : t >= from) && t <= to);
/** B2's thinning and coverage rule. */
export function thinned(truth, T) {
  const held = slice(truth, T, T + Math.max(...config.leadDays) * DAY);
  const every = Math.max(1, Math.round(config.thinSeconds / truth.stepS));
  return { chosen: held.filter((_, i) => i % every === 0), every, minPerDay: Math.floor((config.minimumCoverage * 86400) / truth.stepS) };
}

// ---- record builders ----
const table = (ns, name, fields = {}) => Object.assign(new ns[`${name}T`](), fields);
export function prw(arm, value) {
  const b = new flatbuffers.Builder(1 << 16);
  P.PRW.finishSizePrefixedPRWBuffer(b, table(P, 'PRW', { [arm]: value }).pack(b));
  return b.asUint8Array().slice();
}
export function pcf(fields) {
  const b = new flatbuffers.Builder(1024);
  b.finish(Object.assign(new PCF.PCFT(), fields).pack(b), '$PCF');
  return b.asUint8Array().slice();
}
/** sdn-ap fit's $PCF (flow README "Weather"): THEORY AP, Jacchia 1970 on the theory flux, tesseral 31, zonal 20. */
export const fitPcf = () => pcf({ THEORY: PCF.pcfTheory.AP, FORCES: Object.assign(new PCF.PCFForceModelT(), { EPHEMERIS_SOURCE: '',
  ATMOSPHERE_MODEL: PCF.pcfAtmosphereFamily.JACCHIA70, HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: 31, HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: 20 }) });
export const outputPcf = (startIso, stopIso, step) => pcf({ OUTPUT: Object.assign(new PCF.PCFOutputT(), { FRAME: PCF.pcfOutputFrame.GCRF, START_TIME: startIso, STOP_TIME: stopIso, STEP_SECONDS: step }) });
const vector = (v) => table(P, 'FRMVector3', { X: v[0], Y: v[1], Z: v[2] });
/** flows/observation-od's EXECUTION_REQUEST (the flow E2E's dynamics), first guess at `guess.epoch` in GCRF km, TARGET_EPOCH `target`. */
export function executionRequest({ guess, target, norad, objectId, crAm }) {
  return prw('EXECUTION_REQUEST', table(P, 'PRWExecutionRequest', {
    INITIAL: table(P, 'PRWResidentState', {
      STATE: table(P, 'FRMStateVector', { REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vector(guess.state.slice(0, 3).map((x) => x * 1000)),
        VELOCITY: vector(guess.state.slice(3).map((x) => x * 1000)), COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: guess.epoch, EPOCH_TIME_SYSTEM: 'UTC' }),
      COORDINATE_SYSTEM: table(P, 'RFMCoordinateSystem', { NAME: 'GCRF', AXIS_TYPE: P.rfmAxisType.ICRF, AXIS_REFERENCE_BODY_ID: 399,
        ORIGIN: table(P, 'RFMOrigin', { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }) }),
      CATALOG_NUMBER: norad, OBJECT_ID: objectId, VALID: true }),
    TARGET_EPOCH: table(P, 'TIMInstant', { TIME_SYSTEM: P.timingStandard.UTC, EPOCH_FORMAT: P.timEpochRepresentation.ISO8601, ISO8601: target }),
    INTEGRATOR: table(P, 'PCFIntegratorSettings', { ALGORITHM: P.pcfIntegratorAlgorithm.RK78, INITIAL_STEP_SECONDS: 30, MINIMUM_STEP_SECONDS: 0.001,
      MAXIMUM_STEP_SECONDS: 120, ABSOLUTE_TOLERANCES: Array(6).fill(1e-10), RELATIVE_TOLERANCE: 1e-13, MAXIMUM_STEPS: 1000000 }),
    FORCES: table(P, 'PCFForceModel', {
      GRAVITY_CHOICE: P.pcfGravitySelection.EGM2008, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 3.986004415e14,
      MAXIMUM_DEGREE: 70, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: 70, HAS_MAXIMUM_ORDER: true,
      ENABLE_THIRD_BODY: true, THIRD_BODY_IDS: [10, 301], EPHEMERIS_SOURCE: 'JPL_SPK',
      ENABLE_SRP: true, RADIATION_PRESSURE_MODEL: P.pcfRadiationPressureFamily.CANNONBALL, REFLECTIVITY_COEFFICIENT: crAm,
      ENABLE_DRAG: false, INITIAL_MASS_KG: 1, AREA_M2: 1, HAS_IN_TRACK_ACCELERATION_M_S2: true, IN_TRACK_ACCELERATION_M_S2: 0,
      SOLID_TIDES: P.pcfSolidTideModel.IERS_2010, RELATIVITY: P.pcfRelativityTerms.IERS_2010,
      OCEAN_TIDES: P.pcfOceanTideModel.FES2004, OCEAN_TIDE_MAXIMUM_DEGREE: 30, OCEAN_TIDE_MAXIMUM_ORDER: 30 }),
    STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC,
    DYNAMIC_PARAMETERS: [P.prwDynamicParameter.IN_TRACK_ACCELERATION],
  }));
}
/** The flow's carry request (flow.mjs carryRequest, same rules): the execution with INITIAL the estimate and its fitted parameters. */
export function flightRequest(execution, estimateBytes) {
  const ocm = OCMm.OCM.getRootAsOCM(new flatbuffers.ByteBuffer(estimateBytes)).unpack();
  const exec = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(execution)).unpack().EXECUTION_REQUEST;
  const s = ocm.STATE_DATA, f = exec.FORCES, state = exec.INITIAL.STATE;
  state.POSITION = Object.assign(new P.FRMVector3T(), { X: s[0] * 1000, Y: s[1] * 1000, Z: s[2] * 1000 });
  state.VELOCITY = Object.assign(new P.FRMVector3T(), { X: s[3] * 1000, Y: s[4] * 1000, Z: s[5] * 1000 });
  state.EPOCH = ocm.STATE_EPOCHS[0];
  for (const p of ocm.ORBIT_DETERMINATION.OD_DYNAMIC_PARAMETERS) {
    if (p.PARAMETER === P.prwDynamicParameter.IN_TRACK_ACCELERATION) Object.assign(f, { HAS_IN_TRACK_ACCELERATION_M_S2: true, IN_TRACK_ACCELERATION_M_S2: p.VALUE });
    else if (p.PARAMETER === P.prwDynamicParameter.DRAG_AREA_OVER_MASS) f.DRAG_COEFFICIENT = p.VALUE * f.INITIAL_MASS_KG / f.AREA_M2;
    else if (p.PARAMETER === P.prwDynamicParameter.SRP_AREA_OVER_MASS) f.REFLECTIVITY_COEFFICIENT = p.VALUE * f.INITIAL_MASS_KG / f.AREA_M2;
    else throw new Error(`dynamic parameter ${p.PARAMETER} has no FORCES field`);
  }
  Object.assign(exec, { DYNAMIC_PARAMETERS: [], SAMPLE_EPOCHS: [] });
  exec.TARGET_EPOCH.ISO8601 = state.EPOCH;
  const b = new flatbuffers.Builder(1 << 14);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EXECUTION_REQUEST: exec }).pack(b));
  return b.asUint8Array().slice();
}
export const kernelPrw = () => { const k = kernelBytes(); return prw('NATIVE_INPUT', table(P, 'PRWNativeInput', { DESCRIPTOR: table(P, 'NCD', { FORMAT: P.ncdContainerFormat.SPK_DAF,
  SOURCE_BYTE_LENGTH: BigInt(k.length), SOURCE_SHA256: sha256(k) }), CONTENT: k })); };

// ---- $OEM re-serialization (lines, size-prefixed) for compare_to_reference ----
function unpackOem(bytes) {
  const bb = new flatbuffers.ByteBuffer(bytes);
  const prefixed = String.fromCharCode(...bytes.subarray(8, 12)) === '$OEM';
  return (prefixed ? OEMm.OEM.getSizePrefixedRootAsOEM(bb) : OEMm.OEM.getRootAsOEM(bb)).unpack();
}
export function oemLines(bytes) { return unpackOem(bytes).EPHEMERIS_DATA_BLOCK.flatMap((b) => b.EPHEMERIS_DATA_LINES); }
export function linesOem(frame, lines, { template = null, prefixed = true } = {}) {
  const block = template ? Object.assign(new OEMm.ephemerisDataBlockT(), template, { COVARIANCE_MATRIX_LINES: [], EPHEMERIS_DATA: [] }) : new OEMm.ephemerisDataBlockT();
  block.REFERENCE_FRAME = Object.assign(new OEMm.RFMT(), template?.REFERENCE_FRAME ?? {}, { NAME: frame });
  block.TIME_SYSTEM = OEMm.timingStandard.UTC;
  block.INTERPOLATION_DEGREE = 5;
  if (lines.length) { block.START_TIME = lines[0].EPOCH; block.STOP_TIME = lines.at(-1).EPOCH; block.USEABLE_START_TIME = lines[0].EPOCH; block.USEABLE_STOP_TIME = lines.at(-1).EPOCH; }
  block.EPHEMERIS_DATA_LINES = lines.map((l) => Object.assign(new OEMm.ephemerisDataLineT(), { EPOCH: l.EPOCH, X: l.X, Y: l.Y, Z: l.Z, X_DOT: l.X_DOT, Y_DOT: l.Y_DOT, Z_DOT: l.Z_DOT }));
  const doc = new OEMm.OEMT(); doc.CCSDS_OEM_VERS = 3.0; doc.EPHEMERIS_DATA_BLOCK = [block];
  const b = new flatbuffers.Builder(1 << 16);
  if (prefixed) OEMm.OEM.finishSizePrefixedOEMBuffer(b, doc.pack(b)); else OEMm.OEM.finishOEMBuffer(b, doc.pack(b));
  return b.asUint8Array().slice();
}
export function frameOf(bytes) { return unpackOem(bytes).EPHEMERIS_DATA_BLOCK[0]?.REFERENCE_FRAME?.NAME; }

/** analysis/reference-states compare_to_reference: the residual (reference minus ephemeris, km) at each reference epoch in span. */
export async function compare(h, ephemerisBytes, referenceBytes) {
  const r = await call(h.refs, 'compare_to_reference', [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: ephemerisBytes }, { portId: 'reference', typeRef: TYPE('OEM'), payload: referenceBytes }]);
  const [res] = outs(r, 'residuals');
  return OEMm.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(res)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => ({ t: ms(l.EPOCH), e: Math.hypot(l.X, l.Y, l.Z) }));
}
/** Day values: RMS of the 3D error per lead day d (epochs in (T + (d-1) d, T + d d]), kept at B2's coverage. */
export function dayValues(residuals, T, every, minPerDay) {
  const out = {};
  for (const d of config.leadDays) {
    const e = residuals.filter(({ t }) => t > T + (d - 1) * DAY && t <= T + d * DAY).map((x) => x.e);
    if (e.length && e.length * every >= minPerDay) out[d] = { rmsKm: Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length), n: e.length };
  }
  return out;
}
export const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return null; const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };

// ---- arms' module calls ----
export const flowHosts = (h) => ({ laserOd: h.laserOd, estimation: h.estimation, ffm: h.ffm, sdnAp: h.sdnAp });
export async function apPropagate(h, ocmBytes, startIso, stopIso, step) {
  const r = await call(h.sdnAp, 'propagate', [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocmBytes }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: outputPcf(startIso, stopIso, step) }]);
  return outs(r, 'ephemeris')[0];
}
export async function apFit(h, ephemerisBytes) {
  const r = await call(h.sdnAp, 'fit', [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: ephemerisBytes }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: fitPcf() }]);
  return outs(r, 'elements')[0];
}
export async function ffmPropagate(h, request, eopPrw, startIso, stopIso, step) {
  const r = await call(h.ffm, 'propagate_oem', [{ portId: 'request', typeRef: TYPE('PRW'), payload: request }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: outputPcf(startIso, stopIso, step) },
    { portId: 'kernel', typeRef: TYPE('PRW'), payload: kernelPrw() }, { portId: 'earth_orientation', typeRef: TYPE('PRW'), payload: eopPrw }]);
  return outs(r, 'ephemeris')[0];
}
const jd = (t) => 2440587.5 + t / 86400000;
export async function sgp4Ephemeris(h, set, norad, fromMs, toMs, step) {
  const e = set.elements;
  const omm = enc.encodeOmmPayload({ noradId: norad, objectName: set.objectName ?? '', objectId: set.objectId ?? '', epoch: set.epoch, meanMotion: e.MEAN_MOTION, eccentricity: e.ECCENTRICITY, inclination: e.INCLINATION,
    raan: e.RA_OF_ASC_NODE, argPericenter: e.ARG_OF_PERICENTER, meanAnomaly: e.MEAN_ANOMALY, bstar: e.BSTAR, meanMotionDot: e.MEAN_MOTION_DOT, meanMotionDdot: e.MEAN_MOTION_DDOT });
  const request = enc.encodePropagatorBatchRequest({ epoch: jd(fromMs), stopEpoch: jd(toMs), catalogNumbers: [norad], outputFrame: enc.ReferenceFrame.TEME, stepSeconds: step });
  const r = await call(h.sgp4, 'propagate_ephemeris', [{ portId: 'omm', typeRef: OMM_TYPE, payload: Buffer.from(enc.encodeSizePrefixedStream([omm])) }, { portId: 'request', typeRef: PROP_TYPE, payload: Buffer.from(request) }]);
  return outs(r, 'ephemeris')[0];
}
export { outs, call };
