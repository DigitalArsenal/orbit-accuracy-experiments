#!/usr/bin/env node
// Scoring (PLAN.md, after the plan commit): truth = DORIS SP3 by prefix; comparator B = the Space-Track SGP4 set current at
// the fit's end (gp_history by creation day) flown by propagator/sgp4; both arms and the truth in GCRF by foundation/frames;
// R, T, N in the truth's axes by analysis/gp-error-model pair_statistics; the 3D error is the norm of [R, T, N].
// Writes results/satnogs-optical-ap/table.json and README.md. Only errors are written; no element set and no truth row.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import * as L from './lib.mjs';
import { DORIS_DIR, HELD } from './arcs.mjs';

const { flatbuffers, F, TY, frame, outputs, invoke } = L;
const RESULTS = path.join(L.ROOT, 'results/satnogs-optical-ap');
const GP = '/opt/data/sdn-archive/spacetrack/gp_history/by-creation';
const PREFIX = { 66514: 's6b', 46984: 's6a', 46469: 'h2c', 48621: 'h2d', 54754: 'swo', 36508: 'cs2', 41240: 'ja3', 41335: 's3a', 43437: 's3b' };
const DAY = 86400e3;
const enc = await import(pathToFileURL(path.join(L.M, 'propagator/sgp4/tests/lib/payloadEncoders.mjs')).href);
const erm = await import(pathToFileURL(path.join(L.M, 'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
const [eopParser, frames, sgp4, gem] = await Promise.all([L.host('data-source/eop-parser'), L.host('foundation/frames'), L.host('propagator/sgp4'), L.host('analysis/gp-error-model')]);
const eop = await L.earthOrientation(eopParser);

// ---- frames: one state between axes at an epoch ----
const system = (name, axis, epoch) => new F.RFMCoordinateSystemT(name, axis, new F.RFMOriginT(F.rfmOriginKind.CELESTIAL_BODY, 399), 399, epoch, 'UTC');
const AX = { GCRF: ['ICRF', F.rfmAxisType.ICRF], ITRF: ['ITRF', F.rfmAxisType.BODY_FIXED], TEME: ['TEME', F.rfmAxisType.TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE] };
async function transform(from, to, epoch, s) {
  const r = new F.FRMFrameTransformRequestT(F.frmOperationCode.STATE_TRANSFORM, null, null, 0, 0, null, system(...AX[from].slice(0, 1), AX[from][1], epoch), system(AX[to][0], AX[to][1], epoch),
    new F.FRMStateVectorT(F.frmStateRepresentation.CARTESIAN, s, new F.FRMVector3T(...s.slice(0, 3)), new F.FRMVector3T(...s.slice(3)), AX[from][0], epoch, 'UTC', 3.986004415e14),
    F.frmStateRepresentation.CARTESIAN, epoch, 'UTC', null);
  const b = new flatbuffers.Builder(2048);
  F.FRM.finishFRMBuffer(b, new F.FRMT(r, null).pack(b));
  const res = await invoke(frames, 'transform_frame_position', [frame('request', TY.FRM, b.asUint8Array()), ...eop.frames]);
  if (res.error) throw new Error(`frames: ${res.error}`);
  const out = F.FRM.getRootAsFRM(new flatbuffers.ByteBuffer(res.outputs[0].payload)).FRAME_TRANSFORM_RESULT();
  if (out.STATUS() !== 0) throw new Error(`frames: ${out.ERROR_MESSAGE()}`);
  const t = out.TARGET_STATE(), p = t.POSITION(), v = t.VELOCITY();
  return [p.X(), p.Y(), p.Z(), v.X(), v.Y(), v.Z()];
}

// ---- truth: DORIS SP3 (TAI, ITRF, km and dm/s) for the epochs [fromMs, toMs]; the latest-beginning product wins ----
function truthItrf(norad, fromMs, toMs) {
  const re = new RegExp(`^ssa${PREFIX[norad]}\\d0\\.b(\\d\\d)(\\d{3})\\.e(\\d\\d)(\\d{3})`);
  const doy = (yy, d) => Date.UTC(2000 + yy, 0, 1) + (d - 1) * DAY;
  const files = L.REG.dorisProductNames.map((n) => [n, re.exec(n)]).filter(([, m]) => m).map(([n, m]) => ({ n, b: doy(+m[1], +m[2]), e: doy(+m[3], +m[4]) + DAY }))
    .filter((f) => f.e >= fromMs && f.b <= toMs).sort((a, b) => a.b - b.b || a.n.localeCompare(b.n));
  const states = new Map(), used = [];
  for (const f of files) {
    const text = execFileSync('gzip', ['-dc', path.join(DORIS_DIR, f.n)], { maxBuffer: 1 << 28 }).toString();
    if (!/^%c [A-Z ] {2}cc TAI/m.test(text)) throw new Error(`${f.n}: time system is not TAI`);
    if (!/ITRF/.test(text.split('\n')[0])) throw new Error(`${f.n}: not ITRF`);
    let t = null, p = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('* ')) { const [y, mo, d, h, mi, s] = line.slice(2).trim().split(/\s+/).map(Number); t = Date.UTC(y, mo - 1, d, h, mi, Math.floor(s)) + Math.round((s % 1) * 1000) - 37000; p = null; }
      else if (line.startsWith('P') && t !== null) p = [line.slice(4, 18), line.slice(18, 32), line.slice(32, 46)].map(Number);
      else if (line.startsWith('V') && p && t >= fromMs && t <= toMs) { const v = [line.slice(4, 18), line.slice(18, 32), line.slice(32, 46)].map((x) => Number(x) * 1e-4); states.set(t, [...p, ...v]); }
    }
    used.push(f.n);
  }
  return { states, used };
}

// ---- comparator B: the SGP4 set with the latest EPOCH among those created at or before the fit's end ----
const dayCache = new Map();
function creationDay(day) {
  if (dayCache.has(day)) return dayCache.get(day);
  const file = path.join(GP, day.slice(0, 4), `${day}.json.gz`);
  const sets = fs.existsSync(file) ? JSON.parse(gunzipSync(fs.readFileSync(file))) : null;
  const keep = new Map();
  for (const g of sets ?? []) { const n = Number(g.NORAD_CAT_ID); if (n in PREFIX && g.MEAN_ELEMENT_THEORY === 'SGP4' && String(g.EPHEMERIS_TYPE) === '0') (keep.get(n) ?? keep.set(n, []).get(n)).push(g); }
  const v = { file: sets ? path.basename(file) : null, sha256: sets ? L.sha256(fs.readFileSync(file)) : null, keep };
  dayCache.set(day, v);
  return v;
}
const epochMs = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);
function currentSet(norad, endMs) {
  let best = null; const files = [];
  for (let k = 0; k <= 10; k += 1) {
    const day = new Date(endMs - k * DAY).toISOString().slice(0, 10);
    const d = creationDay(day);
    if (d.file) files.push({ file: d.file, sha256: d.sha256 });
    for (const g of d.keep.get(norad) ?? []) if (epochMs(g.CREATION_DATE) <= endMs && epochMs(g.EPOCH) <= endMs && (!best || epochMs(g.EPOCH) > epochMs(best.EPOCH))) best = g;
  }
  return { set: best, files };
}
const jd = (ms) => ms / DAY + 2440587.5;
async function flySgp4(g, startMs, stopMs) {
  const omm = enc.encodeOmmPayload({ noradId: Number(g.NORAD_CAT_ID), objectName: '', objectId: g.OBJECT_ID ?? '', epoch: g.EPOCH, meanMotion: +g.MEAN_MOTION, eccentricity: +g.ECCENTRICITY,
    inclination: +g.INCLINATION, raan: +g.RA_OF_ASC_NODE, argPericenter: +g.ARG_OF_PERICENTER, meanAnomaly: +g.MEAN_ANOMALY, bstar: +g.BSTAR, meanMotionDot: +g.MEAN_MOTION_DOT, meanMotionDdot: +g.MEAN_MOTION_DDOT });
  const request = enc.encodePropagatorBatchRequest({ epoch: jd(startMs), stopEpoch: jd(stopMs), catalogNumbers: [Number(g.NORAD_CAT_ID)], outputFrame: enc.ReferenceFrame.TEME, stepSeconds: 60 });
  const r = await invoke(sgp4, 'propagate_ephemeris', [{ portId: 'omm', typeRef: { schemaName: 'orbpro.sds.omm', fileIdentifier: '$OMM', rootTypeName: 'OMM' }, payload: enc.encodeSizePrefixedStream([omm]) },
    { portId: 'request', typeRef: { schemaName: 'orbpro.propagator.PropagatorBatchRequest', fileIdentifier: 'PROP', rootTypeName: 'PropagatorBatchRequest' }, payload: request }]);
  if (r.error) throw new Error(`sgp4: ${r.error}`);
  const byMs = new Map();
  for (const blk of enc.decodeOem(outputs(r, 'ephemeris')[0]).EPHEMERIS_DATA_BLOCK) for (const l of blk.EPHEMERIS_DATA_LINES) byMs.set(Math.round(L.msOf(l.EPOCH) / 1000) * 1000, [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT]);
  return byMs;
}

// ---- R, T, N of predicted against truth (GCRF, km) by pair_statistics ----
const COV = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6];
async function rtn(pred, truth) {
  const out = [];
  for (let i = 0; i < pred.length; i += 500) {
    const pairs = pred.slice(i, i + 500).map((p, k) => ({ id: String(i + k), predicted: { position: p.slice(0, 3), velocity: p.slice(3), covariance: COV, covarianceAxes: 'INERTIAL' },
      truth: { position: truth[i + k].slice(0, 3), velocity: truth[i + k].slice(3) } }));
    const r = await invoke(gem, 'pair_statistics', [erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs })]);
    if (r.error) throw new Error(`pair_statistics: ${r.error}`);
    out.push(...erm.decode(outputs(r, 'statistics')[0]).pairs.map((s) => s.errorRtn));
  }
  return out;
}
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };

const rows = [], fits = [], samples = {};  // samples[`${arm}|${norad}|${day}`] = [3D km]
for (const arc of L.REG.arcs.filter((a) => a.scorable)) {
  const dir = path.join(L.OUT, arc.id);
  const fit = JSON.parse(fs.readFileSync(path.join(dir, 'fit.json'), 'utf8'));
  fits.push(fit);
  const base = { arc: arc.id, norad: arc.norad, object: arc.name, build: L.REG.build.hash, inputClass: L.REG.inputClass };
  const endMs = fit.fitEnd ? L.msOf(fit.fitEnd) : null;
  // The common grid: 60 s at whole TAI minutes after the fit's end, to +72 h.
  let grid = [], truth = null, truthGcrf = new Map();
  if (endMs !== null) {
    const start = Math.ceil((endMs + 37000) / 60000) * 60000 - 37000;
    for (let t = start; t <= endMs + 3 * DAY; t += 60000) grid.push(t);
    truth = truthItrf(arc.norad, grid[0], grid.at(-1));
    for (const t of grid) { const s = truth.states.get(t); if (s) truthGcrf.set(t, await transform('ITRF', 'GCRF', new Date(t).toISOString(), s)); }
  }
  const dayOf = (t) => Math.ceil((t - endMs) / DAY);
  async function score(arm, statesByMs, extra) {
    for (const d of [1, 2, 3]) {
      const epochs = grid.filter((t) => dayOf(t) === d);
      const have = epochs.filter((t) => truthGcrf.has(t) && statesByMs.has(t));
      const row = { ...base, arm, leadDay: d, ...extra };
      if (have.length < 0.9 * epochs.length) { rows.push({ ...row, status: 'no-truth', samples: have.length, gridEpochs: epochs.length }); continue; }
      const e = await rtn(have.map((t) => statesByMs.get(t)), have.map((t) => truthGcrf.get(t)));
      const d3 = e.map((x) => Math.hypot(...x));
      (samples[`${arm}|${arc.norad}|${d}`] ??= []).push(...d3); (samples[`${arm}|all|${d}`] ??= []).push(...d3);
      rows.push({ ...row, status: 'scored', samples: d3.length, median3dKm: q(d3, 0.5), p95_3dKm: q(d3, 0.95),
        medianAbsKm: { R: q(e.map((x) => Math.abs(x[0])), 0.5), T: q(e.map((x) => Math.abs(x[1])), 0.5), N: q(e.map((x) => Math.abs(x[2])), 0.5) } });
    }
  }
  // AP
  if (fit.status !== 'fitted') for (const d of [1, 2, 3]) rows.push({ ...base, arm: 'AP', leadDay: d, status: fit.status, refusal: fit.refusal ?? null });
  else {
    const lines = L.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(fs.readFileSync(path.join(dir, 'flight.oem')))).unpack().EPHEMERIS_DATA_BLOCK.flatMap((b) => b.EPHEMERIS_DATA_LINES);
    const ap = new Map(lines.map((l) => [Math.round(L.msOf(l.EPOCH) / 1000) * 1000, [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT]]));
    await score('AP', ap, { truthProducts: truth.used.length });
  }
  // B
  const endB = endMs ?? arc.lastMs;
  if (endMs === null) for (const d of [1, 2, 3]) rows.push({ ...base, arm: 'B', leadDay: d, status: 'no-fit-end' });
  else {
    const { set, files } = currentSet(arc.norad, endB);
    if (!set) for (const d of [1, 2, 3]) rows.push({ ...base, arm: 'B', leadDay: d, status: 'unavailable', gpFiles: files.length });
    else {
      const teme = await flySgp4(set, grid[0], grid.at(-1));
      const b = new Map();
      for (const t of grid) if (teme.has(t) && truthGcrf.has(t)) b.set(t, await transform('TEME', 'GCRF', new Date(t).toISOString(), teme.get(t)));
      await score('B', b, { setAgeHours: Math.round((endB - epochMs(set.EPOCH)) / 36e3) / 100 });
    }
  }
  console.log(`${arc.id}: ${fit.status}; ${rows.filter((r) => r.arc === arc.id && r.status === 'scored').length} scored rows`);
}
// Every row carries the build hash, the lead and the input class; no element set, no truth state.
const pooled = {};
for (const [k, v] of Object.entries(samples)) pooled[k] = { samples: v.length, median3dKm: q(v, 0.5), p95_3dKm: q(v, 0.95) };
const table = { record: L.REG.record, credit: L.CREDIT, inputClass: L.REG.inputClass, build: L.REG.build.hash, modulesCommit: L.REG.build.modulesCommit,
  planSha256: fs.readFileSync(path.join(L.HERE, 'PLAN.sha256'), 'utf8').trim(), registeredCells: L.REG.cells, rows, pooled,
  stationNights: fits.flatMap((f) => f.stationNights.map((s) => ({ arc: f.arc, ...s }))),
  fits: fits.map((f) => ({ arc: f.arc, status: f.status, refusal: f.refusal ?? null, tracks: f.tracks, observations: f.observations, fitHours: f.fitHours, fitEnd: f.fitEnd,
    estimate: f.estimate ?? null, ap: f.ap ?? null, stages: (f.stages ?? []).map((s) => ({ stage: s.stage, tracks: s.tracks, candidates: s.candidates.length, converged: s.candidates.filter((c) => c.outcome.startsWith('converged')).length })) })) };
fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(path.join(RESULTS, 'table.json'), JSON.stringify(table, null, 1) + '\n');
await Promise.all([eopParser, frames, sgp4, gem].map((h) => h.destroy?.()));
console.log(`rows ${rows.length}: ${rows.filter((r) => r.status === 'scored').length} scored`);
