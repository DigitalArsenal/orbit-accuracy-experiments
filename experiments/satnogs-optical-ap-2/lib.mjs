// Shared harness pieces: the modules' own packages (SDS 1.276.0, SDK 0.9.12, flatbuffers 25.9.23, resolved from
// flows/angles-only-od's install), module hosts, typed-record helpers. JS moves bytes and labels; modules do the physics.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const M = process.env.SDN_MODULES_ROOT ?? '/Users/tj/software/private/coordinator-d9/space-data-network-modules-c';
export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const ROOT = path.resolve(HERE, '../..');
export const OUT = '/opt/data/sdn-archive/operator-theory/ap/satnogs-optical-ap-2';
export const REG = JSON.parse(fs.readFileSync(path.join(HERE, 'registered.json'), 'utf8'));
export const CREDIT = 'SatNOGS Optical contributors - https://optical.satnogs.org - CC BY-SA 4.0';
const req = createRequire(path.join(M, 'flows/angles-only-od/package.json'));
const imp = (spec) => import(pathToFileURL(req.resolve(spec)).href);
export const flatbuffers = await imp('flatbuffers');
export const P = await imp('spacedatastandards.org/lib/js/PRW/main.js');
export const PCF = await imp('spacedatastandards.org/lib/js/PCF/main.js');
export const F = await imp('spacedatastandards.org/lib/js/FRM/main.js');
export const { EOP } = await imp('spacedatastandards.org/lib/js/EOP/main.js');
export const { EOO, EOOT } = await imp('spacedatastandards.org/lib/js/EOO/main.js');
export const { TDM, TDMT, TDMSegmentT, TDMObservationT } = await imp('spacedatastandards.org/lib/js/TDM/main.js');
export const { OCM } = await imp('spacedatastandards.org/lib/js/OCM/main.js');
export const { OEM } = await imp('spacedatastandards.org/lib/js/OEM/OEM.js');
export const { GST } = await imp('spacedatastandards.org/lib/js/GST/main.js');
export const { PVN, pvnSourceKind } = await imp('spacedatastandards.org/lib/js/PVN/main.js');
export const { createStandaloneHarness } = await imp('space-data-module-sdk/testing/isomorphic');
export const { encodeHttpResponse, encodeModuleConfig, decodeFlowNotice } = await imp('space-data-module-sdk/runtime-contracts');
export const { readParquet } = await import(pathToFileURL(path.join(M, 'data-source/satnogs-optical-source/tests/parquet.mjs')).href);

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const T = (schemaName, fileIdentifier, rootTypeName) => ({ schemaName, fileIdentifier, rootTypeName, wireFormat: 'flatbuffer' });
export const TY = { PRW: T('PRW.fbs', '$PRW', 'PRW'), EST: T('Estimation.fbs', '$EST', 'EstimationEnvelope'), TDM: T('TDM.fbs', '$TDM', 'TDM'),
  OCM: T('OCM.fbs', '$OCM', 'OCM'), EOP: T('EOP.fbs', '$EOP', 'EOP'), FRM: T('FRM.fbs', '$FRM', 'FRM'), EOO: T('EOO.fbs', '$EOO', 'EOO'),
  GST: T('GST.fbs', '$GST', 'GST'), MCFG: T('ModuleConfig.fbs', 'MCFG', 'ModuleConfig'), PVN: T('PVN.fbs', '$PVN', 'PVN'),
  HRSP: T('HttpResponse.fbs', 'HRSP', 'HttpResponse'), PCF: T('PCF.fbs', '$PCF', 'PCF'), OEM: T('OEM.fbs', '$OEM', 'OEM') };
export const frame = (portId, typeRef, payload) => ({ portId, typeRef, payload });
export const outputs = (r, port) => r.outputs.filter((o) => o.portId === port).map((o) => new Uint8Array(o.payload));
export const wasmPath = (rel) => path.join(M, rel, 'dist/isomorphic/module.wasm');
export const host = (rel, threads = false) => createStandaloneHarness('browser', pathToFileURL(wasmPath(rel)), { surface: 'direct', ...(threads ? { enableThreads: true } : {}) });
// A refusal: `error` is "<code>: <message>"; `code` is the module's refusal code, passed through unchanged as a failure name.
export async function invoke(h, methodId, inputs) {
  const r = await h.invoke({ methodId, inputs });
  if (r.statusCode !== 0) return { error: `${r.errorCode ?? ''}: ${r.errorMessage ?? ''}`, code: r.errorCode || 'refused' };
  return r;
}
export const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
export const prw = (arm, value) => { const b = new flatbuffers.Builder(1 << 16); P.PRW.finishSizePrefixedPRWBuffer(b, table('PRW', { [arm]: value }).pack(b)); return b.asUint8Array().slice(); };
export const pcf = (fields) => { const b = new flatbuffers.Builder(512); b.finish(Object.assign(new PCF.PCFT(), fields).pack(b), '$PCF'); return b.asUint8Array().slice(); };
// The flight's $PCF OUTPUT (PLAN.md, fit path 5): GCRF at 60 s from the first whole TAI minute after the fit's end (DORIS SP3
// epochs; TAI - UTC 37 s) to 72 h after the fit's end. fitEnd: integer UTC nanoseconds.
export function flightConfig(fitEnd) {
  const endMs = Number(fitEnd / 1_000_000n);
  const taiMinute = Math.ceil((endMs + 37000) / 60000) * 60000 - 37000;
  const start = new Date(taiMinute).toISOString(), stop = new Date(taiMinute + Math.floor((endMs + 72 * 3600e3 - taiMinute) / 60000) * 60000).toISOString();
  return { start, stop, pcf: pcf({ OUTPUT: Object.assign(new PCF.PCFOutputT(), { FRAME: PCF.pcfOutputFrame.GCRF, START_TIME: start, STOP_TIME: stop, STEP_SECONDS: 60 }) }) };
}

// Time labels: UTC microseconds <-> ISO text; integer nanoseconds.
export const isoUs = (us) => `${new Date(Number(us / 1000n)).toISOString().slice(0, 19)}.${String(us % 1000000n).padStart(6, '0')}`;
export const nsOf = (iso) => {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?Z?$/.exec(iso);
  if (!m) throw new Error(`epoch ${iso}`);
  return BigInt(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) * 1_000_000n + BigInt(((m[7] ?? '') + '000000000').slice(0, 9));
};
export const isoNs = (n) => `${new Date(Number(n / 1_000_000n)).toISOString().slice(0, 19)}.${String(n % 1_000_000_000n).padStart(9, '0')}Z`;
export const msOf = (iso) => Date.parse(iso.replace(/(\.\d{3})\d*/, '$1').replace(/Z?$/, 'Z'));

// Earth orientation: the registered finals2000A file, rows 2026-08-01 to 2026-12-31 (a text cut by date columns).
export async function earthOrientation(eopParser) {
  const text = fs.readFileSync(REG.build.eop.path, 'utf8').split('\n').filter((l) => { const mjd = Number(l.slice(7, 15)); return mjd >= 61253 && mjd <= 61405; }).join('\n') + '\n';
  const r = await invoke(eopParser, 'parse_finals2000a', [frame('response', TY.HRSP, encodeHttpResponse({ url: 'https://datacenter.iers.org/data/latestVersion/finals.all.iau2000.txt',
    status: 200, error: '', headers: { 'content-type': 'text/plain' }, body: new TextEncoder().encode(text), retrievedMs: Date.parse('2026-11-04T10:17:00Z') }))]);
  if (r.error) throw new Error(`eop-parser: ${r.error}`);
  const stream = outputs(r, 'records')[0];
  const rows = [];
  for (const buf = Buffer.from(stream), at = { i: 0 }; at.i < buf.length;) {
    const n = buf.readUInt32LE(at.i);
    rows.push(EOP.getRootAsEOP(new flatbuffers.ByteBuffer(Uint8Array.from(buf.subarray(at.i + 4, at.i + 4 + n)))).unpack());
    at.i += 4 + n;
  }
  const frames = rows.map((row) => { const b = new flatbuffers.Builder(1024); EOP.finishEOPBuffer(b, row.pack(b)); return frame('earth_orientation', TY.EOP, b.asUint8Array().slice()); });
  return { stream, rows, frames, prw: prw('EARTH_ORIENTATION', table('PRWEarthOrientation', { ROWS: rows })) };
}

export function kernel() {
  const bytes = fs.readFileSync(path.join(M, REG.build.kernel.path));
  return prw('NATIVE_INPUT', table('PRWNativeInput', { DESCRIPTOR: table('NCD', { FORMAT: P.ncdContainerFormat.SPK_DAF,
    SOURCE_BYTE_LENGTH: BigInt(bytes.length), SOURCE_SHA256: sha256(bytes) }), CONTENT: bytes }));
}

// The registered dynamics (PLAN.md, fit path 2).
const instant = (t) => table('TIMInstant', { TIME_SYSTEM: P.timingStandard.UTC, EPOCH_FORMAT: P.timEpochRepresentation.ISO8601, ISO8601: t });
const vector = (v) => table('FRMVector3', { X: v[0], Y: v[1], Z: v[2] });
export const executionRequest = (state, epoch, target, norad) => table('PRWExecutionRequest', {
  INITIAL: table('PRWResidentState', {
    STATE: table('FRMStateVector', { REPRESENTATION: P.frmStateRepresentation.CARTESIAN, POSITION: vector(state.slice(0, 3)), VELOCITY: vector(state.slice(3)),
      COORDINATE_SYSTEM_NAME: 'GCRF', EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC' }),
    COORDINATE_SYSTEM: table('RFMCoordinateSystem', { NAME: 'GCRF', AXIS_TYPE: P.rfmAxisType.ICRF, AXIS_REFERENCE_BODY_ID: 399,
      ORIGIN: table('RFMOrigin', { KIND: P.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }) }),
    CATALOG_NUMBER: norad, OBJECT_ID: String(norad), VALID: true }),
  TARGET_EPOCH: instant(target), SAMPLE_EPOCHS: [],
  INTEGRATOR: table('PCFIntegratorSettings', { ALGORITHM: P.pcfIntegratorAlgorithm.RK78, INITIAL_STEP_SECONDS: 30, MINIMUM_STEP_SECONDS: 0.001,
    MAXIMUM_STEP_SECONDS: 120, ABSOLUTE_TOLERANCES: Array(6).fill(1e-10), RELATIVE_TOLERANCE: 1e-13, MAXIMUM_STEPS: 1000000 }),
  FORCES: table('PCFForceModel', { GRAVITY_CHOICE: P.pcfGravitySelection.EGM2008, ENABLE_POINT_MASS: true, GRAVITATIONAL_PARAMETER: 3.986004415e14,
    MAXIMUM_DEGREE: 20, HAS_MAXIMUM_DEGREE: true, MAXIMUM_ORDER: 20, HAS_MAXIMUM_ORDER: true,
    ENABLE_THIRD_BODY: true, THIRD_BODY_IDS: [10, 301], EPHEMERIS_SOURCE: 'JPL_SPK', ENABLE_SRP: false, ENABLE_DRAG: false, INITIAL_MASS_KG: 1, AREA_M2: 1 }),
  STM_TECHNIQUE: P.prwDerivativeTechnique.ANALYTIC, DYNAMIC_PARAMETERS: [],
});
