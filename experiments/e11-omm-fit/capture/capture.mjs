#!/usr/bin/env node
// E11 in-memory operator capture, shared with E4 A5.
//
// The owner's rules:
// - 2026-07-16, restated 2026-10-10: "The ephemeris should be in memory only,
//   and only as long as it takes to do the OD".
// - 2026-10-10: "we should NOT be storing the ephemeris raw, ONLY the HPOP OCM
//   and OMM derived once we curve fit".
// - 2026-10-10: every Starlink file, every cycle ("the total pull every few
//   hours is gigabytes"). The Starlink files are open source.
//
// Each operator file version is fetched into memory, serially per provider,
// with conditional GETs for the manifests. Then:
// 1. It is fitted with SGP4 by analysis/gp-error-model fit_elements in a
//    bounded, niced pool of worker threads:
//    - every version gets CelesTrak's 12-h window length from its issue time
//      (grid candidate span12-bstar);
//    - the pre-registered E11 sample also gets the whole candidate grid;
//    - a version paired with a SupGP set gets CelesTrak's window for that set,
//      and is fetched again if the set arrives later.
//    Every fit reports exact statistics on every point and its half-split
//    closure.
// 2. On the same points, element_residuals scores the paired SupGP set and the
//    latest Space-Track OMM (EPOCH and CREATION_DATE at or before the issue
//    time). The recomputed SupGP per-coordinate RMS must match CelesTrak's
//    published RMS: this is the gate.
// 3. HPOP OCMs come from capture-hpop.mjs (A5's fitter), a separate pool.
// Only derived records (OMMs), statistics and provenance (URL, times, ETag,
// sha256 of the raw bytes, settings, every RMS, convergence) are written,
// compact, to daily files. A failed version leaves a failure row with the raw
// sha256.
//
// Pairing (E11):
// - Starlink: a SupGP set (NORAD, EPOCH) pairs with the version whose span
//   starts latest at or before EPOCH; superseded versions stay downloadable by
//   name. The window is [EPOCH, EPOCH + 12 h].
// - ISS: the window is [segment EPOCH, + 6 h], on the OEM current when the
//   snapshot is fetched.
// - rms files give the per-coordinate RMS (3D RMS / sqrt 3).
//
// Stop: kill "$(cat <root>/capture.pid)" or touch <root>/capture.stop
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as flatbuffers from 'flatbuffers';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import { loadModule, json, gitState } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { readOem } from '../../e4-operator-ephemeris-parity/operators.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
export const UA = 'sdn-e11-operator-capture/3.0 (+https://github.com/DigitalArsenal/orbit-accuracy-experiments)';
export const STARLINK = 'https://api.starlink.com/public-files/ephemerides/';
export const ISS = 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
const PLANET = 'https://ephemerides.planet-labs.com/';
const PLANET_FILES = ['planet.states', 'planet_mc.tle'];
export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const iso = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
export const ms = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);
const H = 3600e3;
const ELEMENTS = ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'];
export const TERMS = {
  starlink: 'SpaceX Starlink public ephemerides, open source (owner, 2026-10-10)',
  iss: 'NASA ISS trajectory (JSC FOD/TOPO), U.S. Government work, public domain',
  planet: 'Planet Labs PBC orbital ephemerides, CC BY-NC 4.0',
};

// ── settings (pre-registered with E11's PLAN.md; changing them is an amendment) ──
export const SETTINGS = {
  starlinkWindowHours: 12,  // pinned 2026-10-10 on 7 paired versions: 6 of 7 published RMS reproduced within 0.002 km
  issSegmentHours: 6,
  gate: { absoluteKm: 0.005, relative: 0.1 },
  grid: [
    ...[6, 12, 24, 48, 0].flatMap((h) => [
      { id: `span${h || 'end'}-bstar`, hours: h, fitBstar: true },
      { id: `span${h || 'end'}-bstarST`, hours: h, fitBstar: false, bstar: 'spacetrack' },
    ]),
    { id: 'span24-bstar-cov', hours: 24, fitBstar: true, weighting: 'covariance' },
  ],
  everyFile: ['span12-bstar'],
  fit: { tolerance: 1e-10, maxIterations: 100 },
};

// ── records ──
// An in-memory $OEM from parsed states (m, m/s); MEME covariance lines in UVW (km).
export function oemFrame(norad, name, parsed, { covariance = false } = {}) {
  const b = new OEM.ephemerisDataBlockT();
  b.CENTER_NAME = 'EARTH';
  b.TIME_SYSTEM = parsed.timeScale === 'UTC' ? OEM.timingStandard.UTC : OEM.timingStandard[parsed.timeScale];
  b.OBJECT = Object.assign(new OEM.CATT(), { NORAD_CAT_ID: norad, OBJECT_NAME: name ?? null });
  b.REFERENCE_FRAME = Object.assign(new OEM.RFMT(), { NAME: parsed.frame });
  b.EPHEMERIS_DATA_LINES = parsed.epochs.map((e, i) => {
    const l = new OEM.ephemerisDataLineT();
    l.EPOCH = e;
    [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT] = parsed.states[i].map((x) => x / 1000);
    return l;
  });
  if (covariance && parsed.covariances) {
    b.COV_REFERENCE_FRAME = Object.assign(new OEM.RFMT(), { NAME: 'UVW' });
    const keys = ['CX_X', 'CY_X', 'CY_Y', 'CZ_X', 'CZ_Y', 'CZ_Z', 'CX_DOT_X', 'CX_DOT_Y', 'CX_DOT_Z', 'CX_DOT_X_DOT', 'CY_DOT_X', 'CY_DOT_Y',
      'CY_DOT_Z', 'CY_DOT_X_DOT', 'CY_DOT_Y_DOT', 'CZ_DOT_X', 'CZ_DOT_Y', 'CZ_DOT_Z', 'CZ_DOT_X_DOT', 'CZ_DOT_Y_DOT', 'CZ_DOT_Z_DOT'];
    b.COVARIANCE_MATRIX_LINES = parsed.epochs.map((e, i) => {
      const c = new OEM.covarianceMatrixLineT();
      c.EPOCH = e;
      keys.forEach((k, j) => { c[k] = parsed.covariances[i][j]; });
      return c;
    });
  }
  const fb = new flatbuffers.Builder(1 << 22);
  OEM.OEM.finishSizePrefixedOEMBuffer(fb, Object.assign(new OEM.OEMT(), { EPHEMERIS_DATA_BLOCK: [b] }).pack(fb));
  return { portId: 'ephemeris', payload: Buffer.from(fb.asUint8Array()), typeRef: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' } };
}
const statsOf = (s) => s && (s.n ? { n: s.n, span: s.span, rms3dKm: s.rms3dKm, rmsPerCoordinateKm: s.rmsPerCoordinateKm, rmsRtnKm: s.rmsRtnKm, meanRtnKm: s.meanRtnKm,
  max3dKm: s.max3dKm, maxRtnKm: s.maxRtnKm, rmsVelocityKmS: s.rmsVelocityKmS, failures: s.failures } : { n: 0, failures: s.failures });

// One version, in memory: the fits, the references and the gate. Pure: no I/O.
// input: {provider, norad, name, parsed, pairs: [{set, window, fitBstar}], gridIds, spacetrack}
// Returns {row, omms (Buffer | null)}; row.failure is set when the version fails.
export async function fitVersion(gp, { provider, norad, name, parsed, pairs = [], gridIds = [], spacetrack: st = null }) {
  const issuedMs = ms(parsed.created ?? parsed.epochs[0]);
  const lastMs = ms(parsed.epochs.at(-1));
  const anchor = ms(parsed.epochs.find((e) => ms(e) >= issuedMs) ?? parsed.epochs[0]);
  const paired = pairs.map((p, i) => ({ id: `celestrak-${i}`, pair: p,
    options: { from: p.window[0], to: p.window[1], epoch: p.set.epoch.endsWith('Z') ? p.set.epoch : `${p.set.epoch}Z`, fitBstar: p.fitBstar ?? true } }));
  const grid = SETTINGS.grid.filter((g) => gridIds.includes(g.id)).map((g) => {
    const f = { id: g.id, weighting: g.weighting, options: { from: iso(anchor), to: iso(g.hours ? Math.min(anchor + g.hours * H, lastMs) : lastMs), epoch: 'first', fitBstar: g.fitBstar,
      ...(g.weighting ? { weighting: g.weighting } : {}) } };
    if (g.fitBstar === false) { if (st) f.options.bstar = st.elements.BSTAR; else f.skip = 'no Space-Track set at the issue time'; }
    if (g.weighting === 'covariance' && !parsed.covariances) f.skip = 'no operator covariance';
    return f;
  });
  const fits = [...paired, ...grid.filter((f) => !f.skip)];
  const row = { provider, norad, name, created: parsed.created, span: [parsed.epochs[0], parsed.epochs.at(-1)], points: parsed.epochs.length, frame: parsed.frame,
    timeScale: parsed.timeScale, spacetrack: st ? { epoch: st.epoch, creationDate: st.creationDate, gpId: st.gpId } : null,
    skipped: grid.filter((f) => f.skip).map((f) => ({ id: f.id, reason: f.skip })) };
  if (!fits.length) { row.failure = 'nothing to fit'; return { row, omms: null }; }
  const eph = oemFrame(norad, name, parsed, { covariance: fits.some((f) => f.weighting === 'covariance') });
  const out = await gp.invoke('fit_elements', [eph, json('options', { ...SETTINGS.fit, fits: fits.map((f) => ({ norad, ...f.options })) })]);
  const report = JSON.parse(Buffer.from(out.outputs.find((o) => o.portId === 'report').payload).toString());
  const ommOut = out.outputs.find((o) => o.portId === 'elements')?.payload;
  row.omm = fits.map((f, i) => {
    const r = report.fits[i] ?? {};
    return { id: f.id, options: f.options, converged: r.converged === true && !r.error, error: r.error, epoch: r.epoch, elements: r.elements, iterations: r.iterations, stop: r.stop,
      rms: statsOf(r.rms), closure: r.closure ? { splitEpoch: r.closure.splitEpoch, fitStates: r.closure.fitStates, error: r.closure.error, rms: statsOf(r.closure.rms) } : null,
      weightedRms: r.weightedRms };
  });
  const references = [];
  for (const p of paired) references.push({ label: `${p.id}:supgp`, set: { norad, epoch: p.pair.set.epoch, elements: p.pair.set.elements }, windows: [{ from: p.options.from, to: p.options.to, label: p.id }] });
  if (st) references.push({ label: 'spacetrack', set: st, windows: fits.map((f) => ({ from: f.options.from, to: f.options.to, label: f.id })) });
  if (references.length) {
    const res = await gp.invokeJson('element_residuals', [ommFrame(references.map((r) => r.set)), eph,
      json('options', { requests: references.map((r) => ({ norad, set: r.set.epoch, label: r.label, windows: r.windows })) })], 'residuals');
    row.references = res.results.map((x) => ({ label: x.label, set: x.set, error: x.error, windows: (x.windows ?? []).map((w) => ({ label: w.label, ...statsOf(w) })) }));
  }
  row.gate = paired.map((p) => {
    const s = row.references?.find((r) => r.label === `${p.id}:supgp`)?.windows?.[0];
    const ours = row.omm.find((o) => o.id === p.id);
    const published = p.pair.set.rmsKm;
    const recomputed = s?.rmsPerCoordinateKm;
    const tol = Math.max(SETTINGS.gate.absoluteKm, SETTINGS.gate.relative * published);
    return { id: p.id, supgpEpoch: p.pair.set.epoch, elementSetNo: p.pair.set.elementSetNo, snapshot: p.pair.set.snapshot, window: p.window, publishedRmsKm: published,
      recomputedRmsKm: recomputed, oursRmsKm: ours?.rms?.rmsPerCoordinateKm, ours3dKm: ours?.rms?.rms3dKm, supgp3dKm: s?.rms3dKm, n: s?.n,
      pass: Number.isFinite(recomputed) && Math.abs(recomputed - published) <= tol, toleranceKm: tol };
  });
  if (row.omm.every((o) => !o.converged)) row.failure = `every OMM fit failed: ${row.omm[0]?.error}`;
  else if (row.gate.some((g) => !g.pass)) row.failure = `rms-file gate tripped: ${JSON.stringify(row.gate.filter((g) => !g.pass).map((g) => [g.supgpEpoch, g.publishedRmsKm, g.recomputedRmsKm]))}`;
  return { row, omms: ommOut ? Buffer.from(ommOut) : null };
}

// ── polite HTTP (one provider at a time; validators for conditional GETs) ──
export class Http {
  constructor(log, gapMs = { default: 5000 }) { this.last = new Map(); this.disabled = new Set(); this.log = log; this.gapMs = gapMs; }
  async get(provider, url, validators = {}) {
    if (this.disabled.has(provider)) return { status: -1 };
    const wait = (this.last.get(provider) ?? 0) + (this.gapMs[provider] ?? this.gapMs.default) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const headers = { 'User-Agent': UA };
    if (validators.etag) headers['If-None-Match'] = validators.etag;
    if (validators.lastModified) headers['If-Modified-Since'] = validators.lastModified;
    const t0 = Date.now();
    let res, body = null, error = null;
    for (let attempt = 1; attempt <= 2; ++attempt) {
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(300000) });
        body = res.status === 200 ? Buffer.from(await res.arrayBuffer()) : null;
        error = null;
      } catch (e) {
        error = String(e.message ?? e);
        res = null;
      }
      this.last.set(provider, Date.now());
      if (res && (res.status === 403 || res.status === 429)) {
        this.disabled.add(provider);
        this.log(`provider ${provider} disabled for this run after HTTP ${res.status} on ${url}`);
        break;
      }
      if (res && res.status < 500) break;
      if (attempt === 1) await new Promise((r) => setTimeout(r, 60000));
    }
    return { status: res?.status ?? 0, body, error, requestUtc: iso(t0), responseUtc: iso(Date.now()),
      etag: res?.headers.get('etag') ?? null, lastModified: res?.headers.get('last-modified') ?? null };
  }
}

// ── Space-Track OMM at the issue time (incremental per-object cache) ──
export class SpaceTrack {
  constructor(root) { this.root = root; this.norads = new Set(); this.read = new Set(); this.sets = new Map(); this.files = {}; }
  want(norads) { let added = false; for (const n of norads) if (!this.norads.has(n)) { this.norads.add(n); added = true; } if (added) { this.read.clear(); } }
  refresh(fromDay) {
    for (const y of [...new Set([fromDay.slice(0, 4), new Date().toISOString().slice(0, 4)])]) {
      const dir = path.join(this.root, y);
      if (!fs.existsSync(dir)) continue;
      for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz') && x.slice(0, 10) >= fromDay).sort()) {
        const f = path.join(dir, n);
        if (this.read.has(f)) continue;
        const raw = fs.readFileSync(f);
        this.files[path.relative(this.root, f)] = sha256(raw);
        for (const g of JSON.parse(gunzipSync(raw))) {
          const norad = Number(g.NORAD_CAT_ID);
          if (!this.norads.has(norad) || g.MEAN_ELEMENT_THEORY !== 'SGP4' || String(g.EPHEMERIS_TYPE) !== '0') continue;
          if (!this.sets.has(norad)) this.sets.set(norad, new Map());
          // Only what the lookup needs (about 200 bytes a set for some 11k objects).
          this.sets.get(norad).set(String(g.GP_ID), { EPOCH: g.EPOCH, CREATION_DATE: g.CREATION_DATE, GP_ID: g.GP_ID, ...Object.fromEntries(ELEMENTS.map((k) => [k, Number(g[k])])) });
        }
        if (!/--/.test(n) || Date.now() - fs.statSync(f).mtimeMs > 2 * H) this.read.add(f);
      }
    }
  }
  at(norad, t) {
    let best = null;
    for (const g of this.sets.get(norad)?.values() ?? []) {
      if (ms(g.EPOCH) > t || ms(g.CREATION_DATE) > t) continue;
      if (!best || ms(g.EPOCH) > ms(best.EPOCH) || (ms(g.EPOCH) === ms(best.EPOCH) && g.CREATION_DATE > best.CREATION_DATE)) best = g;
    }
    return best && { norad, epoch: best.EPOCH, creationDate: best.CREATION_DATE, gpId: String(best.GP_ID), elements: Object.fromEntries(ELEMENTS.map((k) => [k, Number(best[k])])) };
  }
}

// ── SupGP snapshots from the collector archive ──
export function supgpSnapshots(root, group) {
  const dir = path.join(root, group);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^\d{8}T\d{6}Z\.json$/.test(n)).sort().map((n) => ({ stamp: n.slice(0, 16), file: path.join(dir, n) }));
}
export function readSupgp(snap) {
  return JSON.parse(fs.readFileSync(snap.file, 'utf8')).map((s) => ({ norad: s.NORAD_CAT_ID, epoch: s.EPOCH, name: s.OBJECT_NAME, rmsKm: Number(s.RMS),
    elementSetNo: s.ELEMENT_SET_NO, snapshot: snap.stamp, elements: Object.fromEntries(ELEMENTS.map((k) => [k, Number(s[k])])) }));
}

// ── the pool ──
class Pool {
  constructor(n, modules, log) {
    this.log = log;
    this.idle = [];
    this.waiting = new Map();
    this.next = 0;
    this.queue = [];
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./capture-worker.mjs', import.meta.url), { workerData: { modules } });
      w.on('message', (m) => {
        if (m.ready) { this.provenance = m.provenance; this.idle.push(w); this.pump(); return; }
        const done = this.waiting.get(m.id);
        this.waiting.delete(m.id);
        this.idle.push(w);
        done?.(m);
        this.pump();
      });
      w.on('error', (e) => this.log(`pool worker error: ${e.stack ?? e}`));
      return w;
    });
  }
  run(task, transfer) {
    return new Promise((resolve) => { this.queue.push({ task: { ...task, id: ++this.next }, transfer, resolve }); this.pump(); });
  }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift();
      const { task, transfer, resolve } = this.queue.shift();
      this.waiting.set(task.id, resolve);
      w.postMessage(task, transfer);
    }
  }
  async close() { await Promise.all(this.workers.map((w) => w.terminate())); }
}

// ── the capture ──
export class Capture {
  constructor(a) {
    this.a = a;
    this.root = a.root;
    this.derived = path.join(this.root, 'derived');
    this.statePath = path.join(this.root, 'capture-state.json');
    this.state = fs.existsSync(this.statePath) ? JSON.parse(fs.readFileSync(this.statePath, 'utf8')) : {};
    for (const k of ['validators', 'paired', 'next', 'names', 'versions']) this.state[k] ??= {};
    this.sample = new Set(fs.readFileSync(a.sample, 'utf8').split(/\s+/).filter(Boolean).map(Number));
    this.http = new Http((m) => this.log(m), { default: 5000, starlink: a.starlinkGapMs });
    this.stop = false;
    this.counts = { fetched: 0, fetchedBytes: 0, fitted: 0, failed: 0, paired: 0, gatePass: 0 };
    this.lastSave = 0;
  }
  log(m) { fs.appendFileSync(path.join(this.root, 'capture.log'), `${new Date().toISOString()} ${m}\n`); }
  save(force = false) {
    if (!force && Date.now() - this.lastSave < 60e3) return;
    this.lastSave = Date.now();
    fs.writeFileSync(`${this.statePath}.tmp`, JSON.stringify(this.state));
    fs.renameSync(`${this.statePath}.tmp`, this.statePath);
  }
  freeGib() { const s = fs.statfsSync(this.root); return (s.bavail * s.bsize) / 2 ** 30; }
  static startOf(name) { return Date.UTC(1980, 0, 6) + (Number(name.split('_')[5]) - 18) * 1000 - 3 * 86400e3; }

  async init() {
    this.gp = await loadModule(this.a.modules, 'analysis/gp-error-model');
    this.pool = new Pool(this.a.workers, this.a.modules, (m) => this.log(m));
    this.runId = `capture-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
    this.provenance = { run: this.runId, pid: process.pid, started: new Date().toISOString(), gpErrorModel: this.gp.provenance, modules: gitState(this.a.modules),
      experiments: gitState(REPO), capture: sha256(fs.readFileSync(fileURLToPath(import.meta.url))), worker: sha256(fs.readFileSync(path.join(HERE, 'capture-worker.mjs'))),
      settings: SETTINGS, workers: this.a.workers, terms: TERMS };
    fs.mkdirSync(this.derived, { recursive: true });
    fs.appendFileSync(path.join(this.derived, 'runs.jsonl'), `${JSON.stringify(this.provenance)}\n`);
    this.spacetrack = new SpaceTrack(this.a.spacetrack);
    this.log(`init ${this.runId}: gp-error-model ${this.gp.provenance.version} ${this.gp.provenance.wasmSha256.slice(0, 16)}; ${this.a.workers} workers; sample ${this.sample.size}`);
  }
  // Compact daily files: <provider>/rows-YYYYMMDD.jsonl and omm-YYYYMMDD.fbs (rows carry the offsets).
  persist(row, omms) {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dir = path.join(this.derived, row.provider);
    fs.mkdirSync(dir, { recursive: true });
    if (omms) {
      const f = path.join(dir, `omm-${day}.fbs`);
      const offset = fs.existsSync(f) ? fs.statSync(f).size : 0;
      fs.appendFileSync(f, omms);
      row.ommFile = path.relative(this.root, f);
      row.ommOffset = offset;
      row.ommLength = omms.length;
    }
    row.run = this.runId;
    fs.appendFileSync(path.join(dir, `rows-${day}.jsonl`), `${JSON.stringify(row)}\n`);
  }
  fail(row) {
    fs.appendFileSync(path.join(this.derived, 'failures.jsonl'), `${JSON.stringify({ provider: row.provider, norad: row.norad, version: row.version, url: row.url,
      sha256: row.source?.sha256, reason: String(row.failure).slice(0, 800), at: new Date().toISOString(), run: this.runId, gate: row.gate })}\n`);
  }

  // ── Starlink: every version in the manifest ──
  async manifest() {
    const r = await this.http.get('starlink', `${STARLINK}MANIFEST.txt`, this.state.validators.manifest ?? {});
    if (r.status === 200 && r.body) {
      this.state.validators.manifest = { etag: r.etag, lastModified: r.lastModified };
      const now = new Date().toISOString();
      for (const n of r.body.toString('utf8').split(/\s+/)) {
        if (!n.startsWith('MEME_')) continue;
        this.state.names[n] ??= { norad: Number(n.split('_')[1]), start: iso(Capture.startOf(n)), firstSeen: now };
      }
    }
    // Names older than 48 h are no longer needed (pairs arrive within hours).
    for (const [n, v] of Object.entries(this.state.names)) if (Date.now() - ms(v.start) > 48 * H) delete this.state.names[n];
    this.spacetrack.want(new Set(Object.values(this.state.names).map((v) => v.norad)));
    this.spacetrack.refresh(new Date(Date.now() - 12 * 86400e3).toISOString().slice(0, 10));
    this.save(true);
    return r.status;
  }
  pairs() {
    const byNorad = new Map();
    for (const [n, v] of Object.entries(this.state.names)) { if (!byNorad.has(v.norad)) byNorad.set(v.norad, []); byNorad.get(v.norad).push([n, v]); }
    const out = new Map();
    for (const snap of supgpSnapshots(this.a.supgp, 'starlink').slice(-3)) {
      for (const s of readSupgp(snap)) {
        const id = `${s.norad}@${s.epoch}`;
        if (this.state.paired[id]) continue;
        let best = null;
        for (const [n, v] of byNorad.get(s.norad) ?? []) if (ms(v.start) <= ms(s.epoch) && (!best || ms(v.start) > ms(best[1].start))) best = [n, v];
        if (!best) continue;
        if (!out.has(best[0])) out.set(best[0], []);
        out.get(best[0]).push({ id, set: s });
      }
    }
    return out;
  }
  async starlink() {
    const status = await this.manifest();
    if (this.http.disabled.has('starlink')) return 0;
    const pairs = this.pairs();
    const todo = Object.keys(this.state.names).filter((n) => !this.state.names[n].processed || pairs.has(n))
      .sort((x, y) => (pairs.has(y) - pairs.has(x)) || (this.sample.has(this.state.names[y].norad) - this.sample.has(this.state.names[x].norad)) ||
        ms(this.state.names[y].start) - ms(this.state.names[x].start));
    this.log(`starlink pass: manifest HTTP ${status}; ${todo.length} versions to fetch (${pairs.size} with new pairs); load ${os.loadavg()[0].toFixed(1)}`);
    const t0 = Date.now();
    const c0 = { ...this.counts };
    let n = 0;
    const inflight = new Set();
    for (const name of todo) {
      if (this.stop || this.http.disabled.has('starlink') || n >= this.a.maxPerPass) break;
      if (this.freeGib() < this.a.diskFloorGib) {
        this.log(`pause: less than ${this.a.diskFloorGib} GiB free; the pass resumes in 5 min`);
        this.state.next.starlink = Date.now() + 5 * 60e3;
        break;
      }
      while (inflight.size >= 2 * this.a.workers) await Promise.race(inflight);
      while (os.loadavg()[0] > this.a.maxLoad && !this.stop) await new Promise((r) => setTimeout(r, 30000));
      const v = this.state.names[name];
      if (!v) continue;
      const r = await this.http.get('starlink', STARLINK + name);
      if (r.status !== 200 || !r.body) {
        v.fetchFailures = (v.fetchFailures ?? 0) + 1;
        if (r.status === 404 || v.fetchFailures >= 3) v.processed = true;
        continue;
      }
      this.counts.fetched += 1;
      this.counts.fetchedBytes += r.body.length;
      const first = !v.processed;
      const ps = pairs.get(name) ?? [];
      const st = this.spacetrack.at(v.norad, ms(v.start) + 30 * 60e3);
      const meta = { url: STARLINK + name, version: name, source: { requestUtc: r.requestUtc, responseUtc: r.responseUtc, httpStatus: r.status, etag: r.etag,
        lastModified: r.lastModified, bytes: r.body.length, sha256: sha256(r.body), terms: TERMS.starlink } };
      const body = r.body.buffer.slice(r.body.byteOffset, r.body.byteOffset + r.body.byteLength);
      r.body = null;
      const pairInputs = ps.map((p) => ({ set: p.set, window: [iso(ms(p.set.epoch)), iso(ms(p.set.epoch) + SETTINGS.starlinkWindowHours * H)], fitBstar: true }));
      const gridIds = first ? (this.sample.has(v.norad) ? SETTINGS.grid.map((g) => g.id) : SETTINGS.everyFile) : [];
      const job = this.pool.run({ format: 'meme', body, input: { provider: 'starlink', norad: v.norad, name: name.split('_')[2], pairs: pairInputs, gridIds, spacetrack: st } }, [body])
        .then((m) => {
          const row = { ...(m.row ?? { provider: 'starlink', norad: v.norad }), ...meta, timing: m.timing };
          for (const p of ps) this.state.paired[p.id] = m.row?.gate?.some((g) => g.supgpEpoch === p.set.epoch) ? (row.failure || m.failure ? 'failed' : name) : 'outside';
          if (m.failure || row.failure) { row.failure ??= m.failure.reason; this.counts.failed += 1; this.fail(row); }
          else {
            this.persist(row, m.omms ? Buffer.from(m.omms) : null);
            this.counts.fitted += 1;
            this.counts.paired += row.gate?.length ?? 0;
            this.counts.gatePass += row.gate?.filter((g) => g.pass).length ?? 0;
          }
          v.processed = true;
          v.created = row.created;
          this.save();
        });
      inflight.add(job);
      job.finally(() => inflight.delete(job));
      ++n;
    }
    await Promise.all(inflight);
    if (n < todo.length && !this.stop) this.state.next.starlink = Math.min(this.state.next.starlink ?? Infinity, Date.now() + 5 * 60e3);
    this.save(true);
    const d = Object.fromEntries(Object.keys(this.counts).map((k) => [k, this.counts[k] - c0[k]]));
    this.log(`starlink pass done: ${n} versions in ${((Date.now() - t0) / 60e3).toFixed(1)} min; this pass ${JSON.stringify(d)}; load ${os.loadavg()[0].toFixed(1)}`);
    return n;
  }

  // ── ISS ──
  async iss() {
    const snap = supgpSnapshots(this.a.supgp, 'iss').at(-1);
    const sets = snap ? readSupgp(snap) : [];
    const pending = sets.filter((s) => !this.state.paired[`25544@${s.epoch}`]);
    const r = await this.http.get('iss', ISS, pending.length ? {} : (this.state.validators.iss ?? {}));
    if (r.status !== 200 || !r.body) return 0;
    this.state.validators.iss = { etag: r.etag, lastModified: r.lastModified };
    const rawSha = sha256(r.body);
    const parsed = readOem(r.body.toString('utf8'));
    const pairs = pending.filter((s) => ms(s.epoch) >= ms(parsed.epochs[0]) && ms(s.epoch) <= ms(parsed.epochs.at(-1)))
      .map((s) => ({ set: s, window: [iso(ms(s.epoch)), iso(ms(s.epoch) + SETTINGS.issSegmentHours * H)], fitBstar: true }));
    const known = this.state.versions[`iss:${rawSha}`];
    if (known && !pairs.length) return 0;
    this.spacetrack.want([25544]);
    this.spacetrack.refresh(new Date(Date.now() - 12 * 86400e3).toISOString().slice(0, 10));
    const st = this.spacetrack.at(25544, ms(parsed.created ?? parsed.epochs[0]));
    const { row, omms } = await fitVersion(this.gp, { provider: 'iss', norad: 25544, name: 'ISS', parsed, pairs, gridIds: known ? [] : SETTINGS.grid.map((g) => g.id), spacetrack: st });
    Object.assign(row, { url: ISS, version: rawSha.slice(0, 16), source: { requestUtc: r.requestUtc, responseUtc: r.responseUtc, httpStatus: r.status, etag: r.etag,
      lastModified: r.lastModified, bytes: r.body.length, sha256: rawSha, terms: TERMS.iss } });
    if (row.failure) this.fail(row); else this.persist(row, omms);
    this.state.versions[`iss:${rawSha}`] = { created: parsed.created, at: new Date().toISOString() };
    for (const p of pairs) this.state.paired[`25544@${p.set.epoch}`] = row.failure ? 'failed' : rawSha;
    this.save(true);
    return 1;
  }

  // ── Planet: one state per satellite (no ephemeris to fit); provenance only ──
  async planet() {
    for (const n of PLANET_FILES) {
      const r = await this.http.get('planet', PLANET + n, this.state.validators[`planet:${n}`] ?? {});
      if (r.status === 200 && r.body) {
        this.state.validators[`planet:${n}`] = { etag: r.etag, lastModified: r.lastModified };
        fs.appendFileSync(path.join(this.derived, 'planet-provenance.jsonl'), `${JSON.stringify({ provider: 'planet', file: n, url: PLANET + n, sha256: sha256(r.body),
          bytes: r.body.length, etag: r.etag, lastModified: r.lastModified, requestUtc: r.requestUtc, records: r.body.toString('utf8').split(/\r?\n/).filter(Boolean).length,
          terms: TERMS.planet, note: 'one state (or element set) per satellite: no ephemeris to fit' })}\n`);
      }
    }
    this.save(true);
  }

  async run() {
    fs.writeFileSync(path.join(this.root, 'capture.pid'), String(process.pid));
    process.on('SIGTERM', () => { this.stop = true; });
    process.on('SIGINT', () => { this.stop = true; });
    await this.init();
    const until = ms(this.a.until);
    const due = (k, every) => { if ((this.state.next[k] ?? 0) <= Date.now()) { this.state.next[k] = Date.now() + every; return true; } return false; };
    while (!this.stop && Date.now() < until && !fs.existsSync(path.join(this.root, 'capture.stop'))) {
      try {
        if (this.freeGib() >= this.a.diskFloorGib) {
          const latest = supgpSnapshots(this.a.supgp, 'starlink').at(-1)?.stamp;
          const newSnap = latest && latest !== this.state.lastSupgp;
          if (due('starlink', H) || newSnap) { this.state.lastSupgp = latest; await this.starlink(); }
          if (due('iss', 3 * H) || newSnap) await this.iss();
          if (due('planet', 3 * H)) await this.planet();
        } else this.log(`pause: less than ${this.a.diskFloorGib} GiB free`);
      } catch (e) {
        this.log(`loop error: ${e.stack ?? e}`);
      }
      this.save(true);
      if (this.a.once) break;
      for (let i = 0; i < 60 && !this.stop; ++i) await new Promise((r) => setTimeout(r, 1000));
    }
    this.log('capture exit');
    try { if (fs.readFileSync(path.join(this.root, 'capture.pid'), 'utf8') === String(process.pid)) fs.rmSync(path.join(this.root, 'capture.pid')); } catch { /* gone */ }
    await this.pool.close();
    await this.gp.destroy?.();
  }
}

function args() {
  const a = { root: '/opt/data/sdn-archive/operator-ephemerides', supgp: '/opt/data/sdn-archive/celestrak/supgp',
    spacetrack: '/opt/data/sdn-archive/spacetrack/gp_history/by-creation', until: null, sample: null, modules: null, workers: 5, maxLoad: 55, starlinkGapMs: 200, maxPerPass: Infinity, once: false, diskFloorGib: 20 };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; ++i) {
    const k = v[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (k === 'once') a.once = true; else a[k] = v[++i];
  }
  for (const k of ['workers', 'maxLoad', 'starlinkGapMs', 'maxPerPass', 'diskFloorGib']) a[k] = Number(a[k]);
  if (!a.sample || !a.modules || !a.until) throw new Error('--sample, --modules and --until are required');
  return a;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await new Capture(args()).run();
  process.exit(0);
}
