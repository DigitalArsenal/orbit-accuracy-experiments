#!/usr/bin/env node
// Registered runner of experiments/ap-from-public-sets (PLAN.md, config.json). Modules compute: every set is flown by the
// sdn-ap module's own SGP4, every AP record is fitted and flown by the same module. This file moves records and counts.
//   node experiments/ap-from-public-sets/run.mjs --part 1 [--shard i/n]   per-set rows to <store>/part1/ (never committed)
//   node experiments/ap-from-public-sets/run.mjs --check                  end to end on a made-up set (no catalog data)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { CONFIG, REPO, DAY, ratioWithInterval, verdict, rmsOf } from './lib.mjs';

const STACK = path.resolve(REPO, '../../..');
process.env.SDN_MODULES_ROOT ??= CONFIG.modulesRoot;
process.env.SDN_ARCHIVE_ROOT ??= CONFIG.archive;
const MODULES = process.env.SDN_MODULES_ROOT;
const imp = (p) => import(pathToFileURL(p).href);
const FIVE = path.join(REPO, 'experiments/ap-five-day-accuracy/lib');
const SDS = path.join(STACK, 'repos/main-packages/spacedatastandards.org/lib/js');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const CHECK = argv.includes('--check');
if (!CONFIG.frozen) throw new Error('config.json is not frozen: the plan is registered first (README rule 2)');

// The one build this experiment runs on.
const WASM = path.join(MODULES, CONFIG.build.module, 'dist/isomorphic/module.wasm');
const wasmSha = fs.existsSync(WASM) ? sha256(fs.readFileSync(WASM)) : null;
if (wasmSha !== CONFIG.build.wasmSha256) {
  console.log(`SKIPPED, not a pass: ${CONFIG.build.module} at ${MODULES} is ${wasmSha ?? 'absent'}, the plan names ${CONFIG.build.wasmSha256}`);
  process.exit(1);
}

// The weather builder's forecaster is a locally built file; the plan names its bytes too.
const FORECASTER = path.join(REPO, CONFIG.weatherForecaster.file);
const forecasterSha = fs.existsSync(FORECASTER) ? sha256(fs.readFileSync(FORECASTER)) : null;
if (forecasterSha !== CONFIG.weatherForecaster.sha256) {
  console.log(`SKIPPED, not a pass: ${CONFIG.weatherForecaster.file} is ${forecasterSha ?? 'absent'}, the plan names ${CONFIG.weatherForecaster.sha256}`);
  process.exit(1);
}

const { loadWasmModule, TYPES } = await imp(`${FIVE}/wasm-hosts.mjs`);
const { loadGpHistory } = await imp(`${FIVE}/gp-history-loader.mjs`);
const { buildSpaceWeather } = await imp(`${FIVE}/space-weather.mjs`);
const { buildApFitPcfBytes } = await imp(`${FIVE}/external-and-optical-ap-engine.mjs`);
const { propagateSingleTleSgp4Gcrf } = await imp(`${FIVE}/ssn-epoch-engine.mjs`);
const { classifyOrbitRegime } = await imp(`${FIVE}/crlb-covariance.mjs`);
const { CREDITS, buildPvnBytes, isHeldForStudy } = await imp(`${FIVE}/hold-gate.mjs`);
const SRC = await imp(path.join(REPO, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')); // truth reader behind the truth gate
const GATE = await imp(path.join(REPO, 'harness/truth-gate.mjs')); // its jump screen, for states the ledger does not list yet
const { OCM } = await imp(`${SDS}/OCM/main.js`);
const PCF = await imp(`${SDS}/PCF/main.js`);
const { OEM, OEMT, ephemerisDataBlockT, ephemerisDataLineT, CATT, timingStandard } = await imp(`${SDS}/OEM/main.js`);
const { RFMT } = await imp(`${SDS}/RFM/RFM.js`);
const { CelestialFrameWrapperT } = await imp(`${SDS}/RFM/CelestialFrameWrapper.js`);
const { CelestialFrame } = await imp(`${SDS}/RFM/CelestialFrame.js`);
const { RFMUnion } = await imp(`${SDS}/RFM/RFMUnion.js`);
const flatbuffers = await imp(createRequire(path.join(REPO, 'package.json')).resolve('flatbuffers'));

const STEP = CONFIG.grid.stepSeconds * 1000;
const N_DAYS = CONFIG.scoring.days, COVER = CONFIG.scoring.minimumDayCoverage, PRIMARY_DAYS = CONFIG.scoring.primaryHours / 24;
const FWD = CONFIG.forecastDays, HIST = CONFIG.historyDays;
const utcMs = (iso) => Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
const jdOfMs = (ms) => { const d = ms / DAY; return { whole: Math.floor(d) + 2440587.5, frac: d - Math.floor(d) }; };
const msOfJd = (whole, frac) => Math.round((whole - 2440587.5 + frac) * DAY);
const isoNoZ = (ms) => new Date(ms).toISOString().replace(/Z$/, '');
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

let host = await loadWasmModule(`${CONFIG.build.module}/dist/isomorphic/module.wasm`);
const freshHost = async () => { host = await loadWasmModule(`${CONFIG.build.module}/dist/isomorphic/module.wasm`); };

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

/** AP fitted to SGP4-flown states. `placement` 0 puts the record's epoch at the first state, 2 at the last. A refused fit replaces the module instance. */
async function fitAp({ norad, states, eccentricity, spwBytes, placement }) {
  const place = host.instance.exports.sdnap_fit_epoch_diagnostic;
  if (typeof place !== 'function') throw new Error('this build has no sdnap_fit_epoch_diagnostic export');
  place(placement);
  const res = await host.invoke({ methodId: 'fit', inputs: [
    { portId: 'ephemeris', typeRef: TYPES.OEM, payload: wholeArcOem({ norad, states }) },
    { portId: 'configuration', typeRef: TYPES.PCF, payload: buildApFitPcfBytes({ eccentricity, weatherHorizonDays: CONFIG.fit.weatherHorizonDays }) },
    { portId: 'provenance', typeRef: TYPES.PVN, payload: buildPvnBytes({ sourceId: 'gp-own-epoch', lineage: CREDITS.GP_EPOCH }) },
    { portId: 'space_weather', typeRef: TYPES.SPW, payload: spwBytes }] });
  if (res.statusCode !== 0) { await freshHost(); return { ok: false, error: `${res.errorCode ?? 'fit-error'}: ${String(res.errorMessage ?? '').slice(0, 200)}` }; }
  const ocmBytes = new Uint8Array(res.outputs.find((o) => o.portId === 'elements').payload);
  const u = OCM.getRootAsOCM(new flatbuffers.ByteBuffer(ocmBytes)).unpack();
  return { ok: true, ocmBytes, rmsM: (u.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? NaN) * 1000 };
}

/** An AP record flown to the listed instants: positions in GCRF, km. */
async function flyAp(ocmBytes, msList) {
  const pcf = Object.assign(new PCF.PCFT(), { OUTPUT: Object.assign(new PCF.PCFOutputT(), {
    FRAME: PCF.pcfOutputFrame.GCRF, EPOCHS: msList.map(isoNoZ), MAXIMUM_STATES: Math.max(1000, msList.length + 16) }) });
  const b = new flatbuffers.Builder(Math.max(512, msList.length * 48));
  b.finish(pcf.pack(b), '$PCF');
  const res = await host.invoke({ methodId: 'propagate', inputs: [
    { portId: 'ocm', typeRef: TYPES.OCM, payload: ocmBytes }, { portId: 'configuration', typeRef: TYPES.PCF, payload: b.asUint8Array() }] });
  if (res.statusCode !== 0 || !res.outputs.length) return { error: `${res.errorCode}: ${String(res.errorMessage).slice(0, 200)}` };
  const blk = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(res.outputs[0].payload))).EPHEMERIS_DATA_BLOCK(0);
  if (blk.ephemerisDataLinesLength() !== msList.length) return { error: `propagate returned ${blk.ephemerisDataLinesLength()} of ${msList.length}` };
  const r = [];
  for (let i = 0; i < msList.length; i += 1) { const l = blk.EPHEMERIS_DATA_LINES(i); r.push([l.X(), l.Y(), l.Z()]); }
  return { r };
}

/** A set flown on SGP4 to the listed instants: [{ epoch, r, v }] in GCRF, or null when SGP4 reports an error. */
function flySgp4(tle, msList) {
  const out = propagateSingleTleSgp4Gcrf(host, tle, msList.map(jdOfMs));
  if (out.some((s) => s.status !== 0)) return null;
  return out.map((s, i) => ({ epoch: isoNoZ(msList[i]), r: s.rGcrf, v: s.vGcrf }));
}

/** 3D position error against truth: root mean square per day from t0 and over the primary span. Null under the coverage rule. */
function score(positions, truth, t0, perDay) {
  const sum = new Array(N_DAYS).fill(0), n = new Array(N_DAYS).fill(0);
  for (let i = 0; i < truth.length; i += 1) {
    const d = Math.floor((truth[i].ms - t0 - 1) / DAY);
    if (d < 0 || d >= N_DAYS) continue;
    const p = positions[i], q = truth[i].r;
    sum[d] += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; n[d] += 1;
  }
  const enough = n.map((k) => k >= COVER * perDay);
  const days = sum.map((s, d) => (enough[d] ? rmsOf(s, n[d]) : null));
  let s3 = 0, n3 = 0, ok = true;
  for (let d = 0; d < PRIMARY_DAYS; d += 1) { ok = ok && enough[d]; s3 += sum[d]; n3 += n[d]; }
  return { days, primary: ok ? rmsOf(s3, n3) : null };
}

const grid = (fromMs, days) => Array.from({ length: Math.floor((days * DAY) / STEP) + 1 }, (_, i) => fromMs + i * STEP);

/** The arms of PLAN.md for one set. `prior` holds the earlier sets of the look-back, oldest first. Returns { arms, fit, sets }. */
async function runArms({ norad, tle, prior, truth, perDay, spwBytes }) {
  const t0 = msOfJd(tle.whole, tle.frac), at = truth.map((s) => s.ms);
  const arms = {}, fit = {};
  const a = flySgp4(tle, at);
  if (!a) return { error: 'sgp4-status' };
  arms.A = score(a.map((s) => s.r), truth, t0, perDay);
  const fwd = flySgp4(tle, grid(t0, FWD));
  if (!fwd) return { error: 'sgp4-status' };
  // the history: each earlier set flown from its epoch until the next set's epoch
  const all = prior.concat([tle]);
  let hist = null;
  if (all.length >= CONFIG.history.minimumSets) {
    const bySet = new Map();
    for (let ms = t0 - HIST * DAY; ms < t0; ms += STEP) {
      let pick = null;
      for (const x of all) { if (msOfJd(x.whole, x.frac) <= ms) pick = x; else break; }
      if (pick) { if (!bySet.has(pick)) bySet.set(pick, []); bySet.get(pick).push(ms); }
    }
    const states = [];
    let ok = true;
    for (const [x, msList] of bySet) { const tr = flySgp4(x, msList); if (!tr) { ok = false; break; } tr.forEach((s, i) => states.push({ ms: msList[i], ...s })); }
    states.sort((p, q) => p.ms - q.ms);
    if (ok && states.length >= CONFIG.history.minimumGridShare * ((HIST * DAY) / STEP)) hist = states;
  }
  const plan = [['B3', fwd, 0]];
  if (hist) plan.push(['C5', hist, 2], ['D5', hist.concat(fwd), 0]);
  for (const [name, states, placement] of plan) {
    const f = await fitAp({ norad, states, eccentricity: tle.e, spwBytes, placement });
    if (!f.ok) { fit[name] = { ok: false, error: f.error }; continue; }
    const ap = await flyAp(f.ocmBytes, at);
    if (ap.error) { fit[name] = { ok: false, error: ap.error }; continue; }
    fit[name] = { ok: true, rmsM: Math.round(f.rmsM * 10) / 10 };
    arms[name] = score(ap.r, truth, t0, perDay);
  }
  return { arms, fit, sets: all.length, history: Boolean(hist) };
}

// ---- the end-to-end check: a made-up set through the whole construction (no catalog data, no truth) ----
if (CHECK) {
  const t0 = Date.parse('2026-06-15T00:00:00Z');
  const made = { norad: 99999, ...jdOfMs(t0), n: 14.2, e: 0.001, inc: 98.7, raan: 120, argp: 90, ma: 10, bstar: 1e-4, ndot: 0, nddot: 0 };
  let spwBytes;
  try { spwBytes = buildSpaceWeather({ firstDate: dayOf(t0 - 45 * DAY), lastDate: dayOf(t0 + 50 * DAY), cutoffDate: dayOf(t0) }).bytes; }
  catch (error) { console.log(`SKIPPED, not a pass: the weather archive is not readable here (${String(error.message).slice(0, 120)})`); process.exit(1); }
  // The made-up set's own SGP4 flight stands in for truth, so an arm's score is its distance from that flight. A history
  // cannot be made up without orbit mathematics in this file, so the check runs the single-set arm; the history arms use the
  // same fit and flight calls on more states.
  const truth = grid(t0, N_DAYS).slice(1).map((ms) => ({ ms }));
  const flown = flySgp4(made, truth.map((s) => s.ms));
  truth.forEach((s, i) => { s.r = flown[i].r; });
  const out = await runArms({ norad: made.norad, tle: made, prior: [], truth, perDay: DAY / STEP, spwBytes });
  const problems = [];
  if (out.error) problems.push(out.error);
  else {
    if (out.arms.A.primary !== 0) problems.push(`the set against its own flight is ${out.arms.A.primary} km, not 0`);
    if (out.history || out.arms.C5 || out.arms.D5) problems.push('a history arm ran with no earlier set');
    if (!out.fit.B3?.ok) problems.push(`B3: ${out.fit.B3?.error ?? 'not run'}`);
    else {
      console.log(`B3: fit residual ${out.fit.B3.rmsM} m; 72 h distance from the SGP4 flight ${out.arms.B3.primary.toFixed(3)} km; day 7 ${out.arms.B3.days[6].toFixed(3)} km`);
      if (!(out.fit.B3.rmsM < 2000 && out.arms.B3.primary < 2)) problems.push('B3 does not follow the SGP4 flight it was fitted to within 2 km');
    }
  }
  // the statistic and the verdict rule on fixed numbers
  const pairs = [];
  for (let sat = 1; sat <= 8; sat += 1) for (let k = 0; k < 6; k += 1) pairs.push({ sat, x: Math.log(0.5 + 0.05 * sat + 0.01 * k) });
  const r = ratioWithInterval(pairs);
  console.log(`statistic on fixed numbers: ratio ${r.ratio.toFixed(4)} (${r.lo.toFixed(4)} to ${r.hi.toFixed(4)}), verdict ${verdict(r)}`);
  if (!(r.ratio > 0.74 && r.ratio < 0.76 && r.lo < r.ratio && r.hi > r.ratio && verdict(r) === 'BEATS')) problems.push('the statistic on fixed numbers is off');
  if (verdict(ratioWithInterval(pairs.map((p) => ({ ...p, x: -p.x })))) !== 'LOSES') problems.push('the verdict rule does not report LOSES for the mirrored numbers');
  if (verdict(ratioWithInterval(pairs.slice(0, 12))) !== 'FEW') problems.push('the verdict rule does not report FEW for two satellites');
  console.log(problems.length ? `CHECK FAILED\n- ${problems.join('\n- ')}` : `CHECK PASSED (${CONFIG.build.module} ${CONFIG.build.version} ${wasmSha.slice(0, 12)})`);
  process.exit(problems.length ? 1 : 0);
}

// ---- a registered part ----
const partId = arg('--part');
const part = CONFIG.parts[partId];
if (!part) throw new Error('usage: run.mjs --part 1|2 [--shard i/n] | --check');
const [shardI, shardN] = (arg('--shard') ?? '0/1').split('/').map(Number);
const p0 = Date.parse(part.from), p1 = Date.parse(part.to);
const outDir = path.join(CONFIG.store, `part${partId}`);
fs.mkdirSync(outDir, { recursive: true });
const tag = `s${shardI}of${shardN}`;
const t00 = Date.now();

// Truth: every object of the listed families with states in the part's span, behind the hold gate.
const truthIndex = new Map();
for (const rel of CONFIG.truth.roots) {
  const root = path.join(CONFIG.archive, rel);
  if (!fs.existsSync(root)) continue;
  for (const dir of fs.readdirSync(root).sort()) {
    const fam = CONFIG.truth.families.find((f) => dir.startsWith(f.prefix));
    const idxPath = path.join(root, dir, 'index.json');
    if (!fam || !fs.existsSync(idxPath)) continue;
    for (const o of JSON.parse(fs.readFileSync(idxPath, 'utf8')).objects ?? []) {
      const start = utcMs(o.start), stop = utcMs(o.stop);
      if (!(stop >= p0 && start <= p1 + N_DAYS * DAY) || isHeldForStudy(o.norad, '', o.stop)) continue;
      if (!truthIndex.has(o.norad)) truthIndex.set(o.norad, []);
      truthIndex.get(o.norad).push({ family: fam.family, start, stop, file: path.join(root, dir, o.file) });
    }
  }
}
for (const list of truthIndex.values()) list.sort((a, b) => a.start - b.start || a.file.localeCompare(b.file));
const norads = [...truthIndex.keys()].sort((a, b) => a - b).filter((_, i) => i % shardN === shardI);
console.log(`part ${partId} ${tag}: ${norads.length} truth objects of ${truthIndex.size}`);

const counts = { sets: 0, noTruth: 0, errors: 0, screenedStates: 0 };
const inputs = new Map(); // truth file -> SHA-256
const cache = new Map();
function truthFile(file) {
  if (!cache.has(file)) {
    if (cache.size > 800) cache.delete(cache.keys().next().value);
    if (!inputs.has(file)) inputs.set(file, sha256(fs.readFileSync(file)));
    cache.set(file, SRC.readReference(file).lines.map((l) => ({ ms: utcMs(l.epoch), r: l.r, v: l.v })));
  }
  return cache.get(file);
}
/** Truth of (t0, t0 + scored days], at its own epochs thinned to the grid step; a later file wins where files overlap. States the
 *  truth gate's jump screen marks (inconsistent with both neighbors) are dropped and counted. */
function truthFor(norad, t0) {
  const byMs = new Map();
  for (const e of truthIndex.get(norad) ?? []) {
    if (e.stop < t0 || e.start > t0 + N_DAYS * DAY) continue;
    for (const s of truthFile(e.file)) if (s.ms > t0 && s.ms <= t0 + N_DAYS * DAY) byMs.set(s.ms, s);
  }
  const merged = [...byMs.values()].sort((a, b) => a.ms - b.ms);
  const marked = new Set(GATE.screen(merged).candidates);
  counts.screenedStates += marked.size;
  const series = marked.size ? merged.filter((_, i) => !marked.has(i)) : merged;
  const gaps = []; for (let k = 1; k < Math.min(series.length, 400); k += 1) gaps.push(series[k].ms - series[k - 1].ms);
  gaps.sort((x, y) => x - y);
  const native = gaps.length ? gaps[gaps.length >> 1] : STEP;
  const perDay = DAY / Math.max(STEP, native);
  const truth = []; let prev = -Infinity;
  for (const s of series) if (s.ms - prev >= STEP - 1000) { truth.push(s); prev = s.ms; }
  return { truth, perDay };
}

const objects = loadGpHistory({
  startDay: dayOf(p0 - (CONFIG.history.lookbackDays + 1) * DAY), cutoffIso: new Date(p1).toISOString().replace(/Z$/, '000'),
  windowDays: (p1 - p0) / DAY + CONFIG.history.lookbackDays + 1, noradAllowlist: new Set(norads) });
console.log(`objects with sets: ${objects.length} (${((Date.now() - t00) / 1000).toFixed(0)} s)`);
const spwCache = new Map();
const spwFor = (ms) => {
  const day = dayOf(ms);
  if (!spwCache.has(day)) spwCache.set(day, buildSpaceWeather({ firstDate: dayOf(ms - 45 * DAY), lastDate: dayOf(ms + 50 * DAY), cutoffDate: day }).bytes);
  return spwCache.get(day);
};

const rowsFile = path.join(outDir, `rows-${tag}.jsonl`);
const out = fs.createWriteStream(rowsFile, { flags: 'w' });
for (const obj of objects) {
  const family = truthIndex.get(obj.norad)?.[0]?.family;
  if (!family) continue;
  let last = -Infinity;
  for (const tle of obj.tles) {
    const t0 = msOfJd(tle.whole, tle.frac);
    if (t0 < p0 || t0 >= p1 || t0 - last < CONFIG.selection.spacingDays * DAY) continue;
    const { truth, perDay } = truthFor(obj.norad, t0);
    if (truth.filter((s) => s.ms <= t0 + DAY).length < COVER * perDay) { counts.noTruth += 1; continue; } // no scored first day: not a case
    last = t0; counts.sets += 1;
    const cls = classifyOrbitRegime(tle.n, tle.e);
    const row = { part: Number(partId), norad: obj.norad, family, cls: cls.regime, hpKm: Math.round(cls.hpKm), ecc: tle.e, t0: new Date(t0).toISOString() };
    try {
      const prior = obj.tles.filter((x) => { const e = msOfJd(x.whole, x.frac); return e < t0 && e >= t0 - CONFIG.history.lookbackDays * DAY; });
      Object.assign(row, await runArms({ norad: obj.norad, tle, prior, truth, perDay, spwBytes: spwFor(t0) }));
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 200); await freshHost(); }
    if (row.error) counts.errors += 1;
    out.write(`${JSON.stringify(row)}\n`);
    if (counts.sets % 50 === 0) console.log(`  ${counts.sets} sets, ${((Date.now() - t00) / 1000).toFixed(0)} s`);
  }
}
await new Promise((resolve) => out.end(resolve));
const git = (dir) => { try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } };
const here = (f) => sha256(fs.readFileSync(new URL(f, import.meta.url)));
fs.writeFileSync(path.join(outDir, `manifest-${tag}.json`), JSON.stringify({
  command: `node experiments/ap-from-public-sets/run.mjs ${argv.join(' ')}`, finishedUtc: new Date().toISOString(), node: process.version,
  configSha256: here('./config.json'), runnerSha256: here('./run.mjs'), libSha256: here('./lib.mjs'),
  repositoryCommit: git(REPO), modulesCommit: git(MODULES), wasmSha256: wasmSha, weatherForecasterSha256: forecasterSha, counts,
  truthFiles: inputs.size, truthFilesSha256: sha256([...inputs].sort().map(([f, h]) => `${h}  ${f}`).join('\n')),
  truthFileList: Object.fromEntries([...inputs].sort()) }, null, 1));
console.log(`part ${partId} ${tag}: ${counts.sets} sets, ${counts.noTruth} without a scored first day, ${counts.errors} errors -> ${rowsFile} in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
process.exit(0);
