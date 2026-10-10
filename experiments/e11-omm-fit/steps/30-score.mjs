// E11 step 30: metric (b), prediction beyond CelesTrak's window, for one window
// (dev | validation | test; test only after the freeze).
//   node experiments/e11-omm-fit/steps/30-score.mjs --window dev --hpop <A5 harness/ephemeris-fit.mjs> --hpop-config <env json>
// For each gate-passing pair whose object has HPOP OCMs (PLAN.md section 4):
// - targets: 61 epochs, 60 s apart, centred on each horizon after the end of
//   CelesTrak's window (6 h, 1 d, 3 d, 7 d);
// - truth: the OCM, fitted by A5's fitter, of the latest later version of the
//   same object whose segment span covers the targets and whose issue time
//   precedes them (operator-OCM), propagated by ocmTrajectory;
// - products scored by analysis/gp-error-model element_residuals on the same
//   targets: SupGP, OMM-fit on CelesTrak's window, every grid candidate, and the
//   Space-Track OMM at the issue time.
// Output (runs/, not committed): scores.jsonl, one row per pair, product and
// horizon, plus metrics.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import * as flatbuffers from 'flatbuffers';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import * as OMM from 'spacedatastandards.org/lib/js/OMM/main.js';
import { config, configPath, assertWindowReadable } from '../common.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { loadModule, json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { readElementSets } from '../../../harness/gp-archive.mjs';
import { versions, ms } from '../analysis.mjs';

const H = 3600e3;
const { values } = parseArgs({ options: { window: { type: 'string', default: 'dev' }, modules: { type: 'string' }, hpop: { type: 'string' }, hpopConfig: { type: 'string' },
  limit: { type: 'string' } } });
const freeze = assertWindowReadable(values.window);
const modulesDir = values.modules ?? '/Users/tj/software/worktrees/space-data-network-modules--omm-fit-20261010';
const run = startRun({ experiment: config.experiment, step: `30-score-${values.window}`, configPath, modulesDir, args: values });
const gp = await loadModule(modulesDir, 'analysis/gp-error-model');
run.addModule(gp.provenance);
const lib = await import(pathToFileURL(path.resolve(values.hpop)));
const env = await lib.ephemerisFitEnv(JSON.parse(fs.readFileSync(values.hpopConfig, 'utf8')));
const root = path.dirname(config.archives.derived);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const iso = (t) => new Date(t).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');

// HPOP versions by object: created, OCM segments with spans and fit RMS.
const hpopRows = fs.readFileSync(path.join(config.archives.derived, 'hpop-index.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const hpop = new Map();
for (const r of hpopRows) {
  const h = JSON.parse(fs.readFileSync(path.join(root, r.dir, 'hpop.json'), 'utf8'));
  const segs = h.segments.map((s, i) => ({ i, span: s.stats.span.map(ms), rms3dKm: s.stats.rms3dKm ?? s.stats.rms3d / 1000, file: path.join(root, r.dir, `ocm-${i}.fbs`) }));
  if (!hpop.has(r.norad)) hpop.set(r.norad, []);
  hpop.get(r.norad).push({ version: r.version, created: ms(r.created), segs });
}
// The truth segment for targets [a, b].
function truthFor(norad, a, b) {
  let best = null;
  for (const v of hpop.get(norad) ?? []) {
    if (v.created > a) continue;
    for (const s of v.segs) if (s.span[0] <= a && s.span[1] >= b && (!best || v.created > best.created)) best = { ...s, version: v.version, created: v.created };
  }
  return best;
}
// SupGP set elements from the collector archive, by (norad, epoch).
const supgpCache = new Map();
function supgpSet(provider, norad, epoch) {
  const dir = path.join(config.archives.supgp, provider);
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort().reverse()) {
    if (!supgpCache.has(f)) supgpCache.set(f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const s = supgpCache.get(f).find((x) => x.NORAD_CAT_ID === norad && x.EPOCH === epoch);
    if (s) return { norad, epoch: s.EPOCH, elements: Object.fromEntries(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'].map((k) => [k, s[k]])) };
  }
  return null;
}
// The version's own OMM records, in fit order (converged fits only).
function versionOmms(v) {
  const file = path.join(root, v.dir, 'omm.fbs');
  if (!fs.existsSync(file)) return new Map();
  const bytes = new Uint8Array(fs.readFileSync(file));
  const out = [];
  for (let at = 0; at + 8 <= bytes.length;) {
    const len = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, true);
    const o = OMM.OMM.getSizePrefixedRootAsOMM(new flatbuffers.ByteBuffer(bytes.subarray(at, at + 4 + len)));
    out.push({ epoch: o.EPOCH(), elements: { MEAN_MOTION: o.MEAN_MOTION(), ECCENTRICITY: o.ECCENTRICITY(), INCLINATION: o.INCLINATION(), RA_OF_ASC_NODE: o.RA_OF_ASC_NODE(),
      ARG_OF_PERICENTER: o.ARG_OF_PERICENTER(), MEAN_ANOMALY: o.MEAN_ANOMALY(), BSTAR: o.BSTAR() } });
    at += 4 + len;
  }
  const ids = v.stats.omm.filter((o) => o.converged).map((o) => o.id);
  return new Map(ids.map((id, i) => [id, out[i]]));
}
function truthOem(norad, points) {
  const b = new OEM.ephemerisDataBlockT();
  Object.assign(b, { CENTER_NAME: 'EARTH', TIME_SYSTEM: OEM.timingStandard.UTC });
  b.OBJECT = Object.assign(new OEM.CATT(), { NORAD_CAT_ID: norad });
  b.REFERENCE_FRAME = Object.assign(new OEM.RFMT(), { NAME: 'GCRF' });
  b.EPHEMERIS_DATA_LINES = points.map((p) => {
    const l = new OEM.ephemerisDataLineT();
    l.EPOCH = p.epoch;
    [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT] = p.state.map((x) => x / 1000);
    return l;
  });
  const fb = new flatbuffers.Builder(1 << 16);
  OEM.OEM.finishSizePrefixedOEMBuffer(fb, Object.assign(new OEM.OEMT(), { EPHEMERIS_DATA_BLOCK: [b] }).pack(fb));
  return { portId: 'ephemeris', payload: Buffer.from(fb.asUint8Array()), typeRef: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' } };
}

const vs = versions(values.window);
const subjects = vs.filter((v) => hpop.has(v.norad)).flatMap((v) => (v.stats.gate ?? []).filter((g) => g.pass).map((g) => ({ v, g })));
const days = (t) => new Date(t).toISOString().slice(0, 10);
const created = vs.map((v) => ms(v.created));
const st = vs.length ? readElementSets(config.archives.spacetrack, days(Math.min(...created) - 10 * 86400e3), days(Math.max(...created)), { keep: (n) => hpop.has(n), lagDays: 1 }) : { sets: [], files: {} };
run.addInputs('spacetrack', st.files);
const spacetrackAt = (norad, t) => st.sets.filter((s) => s.norad === norad && ms(s.epoch) <= t && ms(s.creationDate) <= t)
  .sort((a, b) => ms(b.epoch) - ms(a.epoch) || String(b.creationDate).localeCompare(String(a.creationDate)))[0] ?? null;

const scores = [];
const missing = [];
let done = 0;
for (const { v, g } of subjects) {
  if (values.limit && done >= Number(values.limit)) break;
  const end = ms(g.window[1]);
  const windows = [];
  const points = [];
  for (const h of config.horizons.hours) {
    const centre = end + h * H, half = (config.horizons.scoreWindowMinutes / 2) * 60e3;
    const truth = truthFor(v.norad, centre - half, centre + half);
    if (!truth) { missing.push({ norad: v.norad, version: v.version, supgpEpoch: g.supgpEpoch, horizonHours: h }); continue; }
    const epochs = [];
    for (let t = centre - half; t <= centre + half + 1; t += config.horizons.stepSeconds * 1000) epochs.push(iso(t));
    const traj = await lib.ocmTrajectory(env, fs.readFileSync(truth.file), epochs);
    points.push(...traj);
    windows.push({ from: epochs[0], to: epochs.at(-1), label: `${h}h`, truth });
  }
  if (!windows.length) continue;
  const eph = truthOem(v.norad, points);
  const products = [['supgp', supgpSet(v.provider, v.norad, g.supgpEpoch)], ...[...versionOmms(v)].map(([id, s]) => [id === 'celestrak-0' ? 'omm-fit-celestrak' : id, s && { norad: v.norad, ...s }]),
    ['spacetrack', spacetrackAt(v.norad, ms(v.created))]];
  for (const [product, set] of products) {
    if (!set) { missing.push({ norad: v.norad, version: v.version, product }); continue; }
    const res = await gp.invokeJson('element_residuals', [ommFrame([set]), eph, json('options', { requests: [{ norad: v.norad, set: set.epoch,
      windows: windows.map((w) => ({ from: w.from, to: w.to, label: w.label })) }] })], 'residuals');
    for (const w of res.results[0].windows ?? []) {
      const tw = windows.find((x) => x.label === w.label);
      scores.push({ provider: v.provider, norad: v.norad, version: v.version, supgpEpoch: g.supgpEpoch, product, horizon: w.label, n: w.n, rms3dKm: w.rms3dKm,
        rmsPerCoordinateKm: w.rmsPerCoordinateKm, truthVersion: tw.truth.version, truthSegment: tw.truth.i, truthFitRms3dKm: tw.truth.rms3dKm });
    }
  }
  ++done;
}
run.addInputs('derived', { 'index.jsonl': sha(fs.readFileSync(path.join(config.archives.derived, 'index.jsonl'))), 'hpop-index.jsonl': sha(fs.readFileSync(path.join(config.archives.derived, 'hpop-index.jsonl'))) });
run.write('scores.jsonl', `${scores.map((s) => JSON.stringify(s)).join('\n')}\n`);
run.write('missing.jsonl', `${missing.map((s) => JSON.stringify(s)).join('\n')}\n`);
run.write('metrics.json', { window: values.window, freezeCommit: freeze, pairs: subjects.length, scored: done, rows: scores.length, missing: missing.length });
run.finish({ scored: done });
console.log(`run ${run.id}: ${done} pairs scored, ${scores.length} rows, ${missing.length} missing`);
await env.destroy?.();
await gp.destroy();
