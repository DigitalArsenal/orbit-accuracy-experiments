// The module calls of experiments/ap-catalog-construction (PLAN.md): the sdn-ap 0.6.5 build the plan names, the weather table, the
// fit and the flights, and the score. Every orbit computation runs in the module; this file builds records and counts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(HERE, '../..');
export const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
export const DAY = 86400000;
const STACK = path.resolve(REPO, '../../..');
process.env.SDN_MODULES_ROOT ??= CONFIG.modulesRoot;
process.env.SDN_ARCHIVE_ROOT ??= CONFIG.archive;
export const MODULES = process.env.SDN_MODULES_ROOT;
const imp = (p) => import(pathToFileURL(p).href);
const FIVE = path.join(REPO, 'experiments/ap-five-day-accuracy/lib');
const SDS = path.join(STACK, 'repos/main-packages/spacedatastandards.org/lib/js');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The registered bytes, or the reason they are not here (the runner then says SKIPPED and fails). */
export function buildProblem() {
  const wasm = path.join(MODULES, CONFIG.build.module, 'dist/isomorphic/module.wasm');
  const got = fs.existsSync(wasm) ? sha256(fs.readFileSync(wasm)) : null;
  if (got !== CONFIG.build.wasmSha256) return `${CONFIG.build.module} at ${MODULES} is ${got ?? 'absent'}, the plan names ${CONFIG.build.wasmSha256}`;
  const forecaster = path.join(REPO, CONFIG.weatherForecaster.file);
  const f = fs.existsSync(forecaster) ? sha256(fs.readFileSync(forecaster)) : null;
  if (f !== CONFIG.weatherForecaster.sha256) return `${CONFIG.weatherForecaster.file} is ${f ?? 'absent'}, the plan names ${CONFIG.weatherForecaster.sha256}`;
  return null;
}
const problem = buildProblem();
if (problem) { console.log(`SKIPPED, not a pass: ${problem}`); process.exit(1); }
export const wasmSha = CONFIG.build.wasmSha256;

const { loadWasmModule, TYPES } = await imp(`${FIVE}/wasm-hosts.mjs`);
export const { buildSpaceWeather } = await imp(`${FIVE}/space-weather.mjs`);
const { buildApFitPcfBytes } = await imp(`${FIVE}/external-and-optical-ap-engine.mjs`);
const { propagateSingleTleSgp4Gcrf } = await imp(`${FIVE}/ssn-epoch-engine.mjs`);
export const { classifyOrbitRegime } = await imp(`${FIVE}/crlb-covariance.mjs`);
const { CREDITS, buildPvnBytes } = await imp(`${FIVE}/hold-gate.mjs`); // provenance records only; nothing is excluded (PLAN.md)
const { OCM } = await imp(`${SDS}/OCM/main.js`);
const PCF = await imp(`${SDS}/PCF/main.js`);
const { OEM, OEMT, ephemerisDataBlockT, ephemerisDataLineT, CATT, timingStandard } = await imp(`${SDS}/OEM/main.js`);
const { RFMT } = await imp(`${SDS}/RFM/RFM.js`);
const { CelestialFrameWrapperT } = await imp(`${SDS}/RFM/CelestialFrameWrapper.js`);
const { CelestialFrame } = await imp(`${SDS}/RFM/CelestialFrame.js`);
const { RFMUnion } = await imp(`${SDS}/RFM/RFMUnion.js`);
const flatbuffers = await imp(createRequire(path.join(REPO, 'package.json')).resolve('flatbuffers'));

export const STEP = CONFIG.grid.stepSeconds * 1000;
export const COVER = CONFIG.scoring.minimumDayCoverage;
export const utcMs = (iso) => Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
export const jdOfMs = (ms) => { const d = ms / DAY; return { whole: Math.floor(d) + 2440587.5, frac: d - Math.floor(d) }; };
export const msOfJd = (whole, frac) => Math.round((whole - 2440587.5 + frac) * DAY);
export const tleMs = (x) => msOfJd(x.whole, x.frac);
export const isoNoZ = (ms) => new Date(ms).toISOString().replace(/Z$/, '');
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const grid = (fromMs, days, stepMs = STEP) => Array.from({ length: Math.floor((days * DAY) / stepMs) + 1 }, (_, i) => fromMs + i * stepMs);

let host = await loadWasmModule(`${CONFIG.build.module}/dist/isomorphic/module.wasm`);
export const freshHost = async () => { host = await loadWasmModule(`${CONFIG.build.module}/dist/isomorphic/module.wasm`); };

/** A GCRF $OEM whose useable interval is the whole block, so the fit takes the whole arc. */
function wholeArcOem({ norad, states }) {
  const rfm = Object.assign(new RFMT(), { FRAME_TYPE: RFMUnion.CelestialFrameWrapper, FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.GCRF }), NAME: 'GCRF' });
  const lines = states.map((s) => Object.assign(new ephemerisDataLineT(), { EPOCH: s.epoch, X: s.r[0], Y: s.r[1], Z: s.r[2], X_DOT: s.v[0], Y_DOT: s.v[1], Z_DOT: s.v[2] }));
  const blk = Object.assign(new ephemerisDataBlockT(), {
    OBJECT: Object.assign(new CATT(), { OBJECT_NAME: `SAT-${norad}`, OBJECT_ID: `${norad}`, NORAD_CAT_ID: Number(norad) >>> 0 }),
    CENTER_NAME: 'EARTH', REFERENCE_FRAME: rfm, TIME_SYSTEM: timingStandard.UTC,
    START_TIME: lines[0].EPOCH, STOP_TIME: lines.at(-1).EPOCH, USEABLE_START_TIME: lines[0].EPOCH, USEABLE_STOP_TIME: lines.at(-1).EPOCH,
    EPHEMERIS_DATA_LINES: lines });
  const oem = Object.assign(new OEMT(), { CCSDS_OEM_VERS: '2.0', CREATION_DATE: lines.at(-1).EPOCH, ORIGINATOR: 'SDN-AP', EPHEMERIS_DATA_BLOCK: [blk] });
  const b = new flatbuffers.Builder(Math.max(4096, lines.length * 96));
  OEM.finishOEMBuffer(b, oem.pack(b));
  return b.asUint8Array().slice();
}

/** The fit's configuration: the registered one (buildApFitPcfBytes with the plan's weather horizon) for every arm. */
const fitPcf = (eccentricity) => buildApFitPcfBytes({ eccentricity, weatherHorizonDays: CONFIG.fit.weatherHorizonDays });

/** AP fitted to GCRF states. `placement`: the record's epoch at the first state (0) or the last (2). A refused fit replaces the
 *  module instance and returns { ok: false }. */
export async function fitAp({ norad, states, eccentricity, spwBytes, placement, sourceId = 'gp-own-epoch' }) {
  host.instance.exports.sdnap_fit_epoch_diagnostic(placement);
  const res = await host.invoke({ methodId: 'fit', inputs: [
    { portId: 'ephemeris', typeRef: TYPES.OEM, payload: wholeArcOem({ norad, states }) },
    { portId: 'configuration', typeRef: TYPES.PCF, payload: fitPcf(eccentricity) },
    { portId: 'provenance', typeRef: TYPES.PVN, payload: buildPvnBytes({ sourceId, lineage: CREDITS.GP_EPOCH }) },
    { portId: 'space_weather', typeRef: TYPES.SPW, payload: spwBytes }] });
  if (res.statusCode !== 0) { await freshHost(); return { ok: false, error: `${res.errorCode ?? 'fit-error'}: ${String(res.errorMessage ?? '').slice(0, 120)}` }; }
  const ocmBytes = new Uint8Array(res.outputs.find((o) => o.portId === 'elements').payload);
  const u = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes)).unpack();
  return { ok: true, ocmBytes, rmsM: (u.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? NaN) * 1000 };
}

/** An AP record flown to the listed instants: GCRF positions, km. */
export async function flyAp(ocmBytes, msList) {
  const pcf = Object.assign(new PCF.PCFT(), { OUTPUT: Object.assign(new PCF.PCFOutputT(), {
    FRAME: PCF.pcfOutputFrame.GCRF, EPOCHS: msList.map(isoNoZ), MAXIMUM_STATES: Math.max(1000, msList.length + 16) }) });
  const b = new flatbuffers.Builder(Math.max(512, msList.length * 48));
  b.finish(pcf.pack(b), '$PCF');
  const res = await host.invoke({ methodId: 'propagate', inputs: [
    { portId: 'ocm', typeRef: TYPES.OCM, payload: ocmBytes }, { portId: 'configuration', typeRef: TYPES.PCF, payload: b.asUint8Array() }] });
  if (res.statusCode !== 0 || !res.outputs.length) return { error: `${res.errorCode}: ${String(res.errorMessage).slice(0, 120)}` };
  const blk = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(res.outputs[0].payload))).EPHEMERIS_DATA_BLOCK(0);
  if (blk.ephemerisDataLinesLength() !== msList.length) return { error: `propagate returned ${blk.ephemerisDataLinesLength()} of ${msList.length}` };
  const r = [];
  for (let i = 0; i < msList.length; i += 1) { const l = blk.EPHEMERIS_DATA_LINES(i); r.push([l.X(), l.Y(), l.Z()]); }
  return { r };
}

/** A public set flown on the module's own SGP4 to the listed instants: [{ ms, epoch, r, v }] in GCRF, or null on an SGP4 error. */
export function flySgp4(tle, msList) {
  if (!msList.length) return [];
  const out = propagateSingleTleSgp4Gcrf(host, tle, msList.map(jdOfMs));
  if (out.some((s) => s.status !== 0)) return null;
  return out.map((s, i) => ({ ms: msList[i], epoch: isoNoZ(msList[i]), r: s.rGcrf, v: s.vGcrf }));
}

/** 3D position error against truth: RMS per day from `fromMs` (days 1..days) and over the primary span. A day counts with at least
 *  COVER of the states its grid holds; the primary figure needs all of its days. */
export function score(positions, truth, fromMs, perDay, days = CONFIG.scoring.days) {
  const sum = new Array(days).fill(0), n = new Array(days).fill(0);
  for (let i = 0; i < truth.length; i += 1) {
    const d = Math.floor((truth[i].ms - fromMs - 1) / DAY);
    if (d < 0 || d >= days) continue;
    const p = positions[i], q = truth[i].r;
    sum[d] += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; n[d] += 1;
  }
  const enough = n.map((k) => k >= COVER * perDay);
  const rms = (s, k) => (k > 0 ? Math.sqrt(s / k) : null);
  let s3 = 0, n3 = 0, ok = true;
  for (let d = 0; d < CONFIG.scoring.primaryHours / 24; d += 1) { ok = ok && enough[d]; s3 += sum[d]; n3 += n[d]; }
  return { days: sum.map((s, d) => (enough[d] ? rms(s, n[d]) : null)), primary: ok ? rms(s3, n3) : null };
}

const spwCache = new Map();
/** The weather table as known on the day of `ms` (the registered builder's window: 45 days before to 50 after). */
export function spwFor(ms) {
  const day = dayOf(ms);
  if (!spwCache.has(day)) spwCache.set(day, buildSpaceWeather({ firstDate: dayOf(ms - 45 * DAY), lastDate: dayOf(ms + 50 * DAY), cutoffDate: day }).bytes);
  return spwCache.get(day);
}
