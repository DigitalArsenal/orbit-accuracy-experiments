#!/usr/bin/env node
// E11 in-memory operator capture, shared with E4 A5.
//
// Owner rule (2026-07-16, restated 2026-10-10): "The ephemeris should be in
// memory only, and only as long as it takes to do the OD", and "we should NOT
// be storing the ephemeris raw, ONLY the HPOP OCM and OMM derived once we
// curve fit".
//
// Each operator file version is fetched into memory (conditional GETs where
// the provider supports them), then:
//  1. fitted with SGP4 by analysis/gp-error-model fit_elements:
//     - on the window CelesTrak fits for the paired SupGP set, when that set is
//       known;
//     - on the pre-registered E11 candidate grid anchored at the file's issue
//       time;
//     every fit reports its exact residual statistics on every point of its
//     window and its half-split closure;
//  2. fitted with full-force HPOP, an OCM per manoeuvre-free segment, by A5's
//     harness/ephemeris-fit.mjs (--hpop) when it is available;
//  3. scored with the paired SupGP set and the latest Space-Track OMM
//     (EPOCH and CREATION_DATE at or before the issue time) on the same
//     points, by element_residuals. The recomputed SupGP per-coordinate RMS
//     must match CelesTrak's published rms value (the frame-error gate).
// Only the derived records (OMM, OCM), the statistics and the provenance
// (URL, times, ETag, sha256 of the raw bytes, settings, every RMS,
// convergence) are written. A version whose fit fails or whose gate trips
// leaves only a failure row with the raw sha256. The raw bytes are dropped
// when the version's processing returns.
//
// Pairing (E11, 2026-10-10):
//  - Starlink: CelesTrak fits the MEME version current at its run. A SupGP set
//    (NORAD, EPOCH) pairs with the latest version whose span starts at or
//    before EPOCH (superseded versions stay downloadable by name). The window
//    is [EPOCH, EPOCH + 12 h].
//  - ISS (NASA OEM): one set per 6-h segment. A set pairs with the OEM version
//    whose span contains its EPOCH and that was current when the SupGP
//    snapshot was fetched. The window is [EPOCH, EPOCH + 6 h].
//  - rms files give the per-coordinate RMS (3D RMS / sqrt 3) over that window.
// Politeness: one request at a time per provider, at least 5 s apart; the
// manifest hourly, ISS and Planet every 3 h; a provider is disabled at its
// first 403 or 429; the run pauses while /opt/data has less than 30 GiB free.
//
// Stop: kill "$(cat <root>/capture.pid)" or touch <root>/capture.stop
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as flatbuffers from 'flatbuffers';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import { loadModule, json, gitState } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { readMeme, readOem } from '../../e4-operator-ephemeris-parity/operators.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
export const UA = 'sdn-e11-operator-capture/2.0 (+https://github.com/DigitalArsenal/orbit-accuracy-experiments)';
export const STARLINK = 'https://api.starlink.com/public-files/ephemerides/';
export const ISS = 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
const PLANET = 'https://ephemerides.planet-labs.com/';
const PLANET_FILES = ['planet.states', 'planet_mc.tle'];
export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const iso = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
export const ms = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);
const H = 3600e3;

// ── settings (pre-registered with E11's PLAN.md; changing them is an amendment) ──
export const SETTINGS = {
  starlinkWindowHours: 12,  // pinned 2026-10-10 on 7 paired versions: 6 of 7 published RMS reproduced within 0.002 km
  issSegmentHours: 6,
  gate: { absoluteKm: 0.005, relative: 0.1 },
  // E11 candidate grid, anchored at the issue time (first point at or after created).
  grid: [
    ...[6, 12, 24, 48, 0].flatMap((h) => [
      { id: `span${h || 'end'}-bstar`, hours: h, fitBstar: true },
      { id: `span${h || 'end'}-bstarST`, hours: h, fitBstar: false, bstar: 'spacetrack' },
    ]),
    { id: 'span24-bstar-cov', hours: 24, fitBstar: true, weighting: 'covariance' },
  ],
  fit: { tolerance: 1e-10, maxIterations: 100 },
};

function args() {
  const a = { root: '/opt/data/sdn-archive/operator-ephemerides', supgp: '/opt/data/sdn-archive/celestrak/supgp',
    spacetrack: '/opt/data/sdn-archive/spacetrack/gp_history/by-creation', until: null, sample: null, modules: null, hpop: null,
    hpopConfig: null, dryRun: false, hpopSample: 0, calibrate: false };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; ++i) {
    const k = v[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (k === 'dryRun') a.dryRun = true;
    else if (k === 'calibrate') a.calibrate = true;
    else a[k] = v[++i];
  }
  if (!a.sample || !a.modules) throw new Error('--sample and --modules are required');
  if (!a.dryRun && !a.until) throw new Error('--until is required');
  a.hpopSample = Number(a.hpopSample) || 0;
  return a;
}

// ── polite HTTP (one provider at a time; validators for conditional GETs) ──
export class Http {
  constructor(log) { this.last = new Map(); this.disabled = new Set(); this.log = log; }
  async get(provider, url, validators = {}) {
    if (this.disabled.has(provider)) return { status: -1 };
    const wait = (this.last.get(provider) ?? 0) + 5000 - Date.now();
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

// ── records ──
// An in-memory $OEM (EME2000 or the file's frame, UTC) from parsed states (m, m/s); MEME covariance lines in UVW (km).
function oemFrame(norad, name, parsed, { covariance = false } = {}) {
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

// ── Space-Track OMM at the issue time (incremental per-object cache) ──
class SpaceTrack {
  constructor(root, norads) { this.root = root; this.norads = new Set(norads); this.read = new Set(); this.sets = new Map(); this.files = {}; }
  refresh(fromDay) {
    const dirs = [...new Set([fromDay.slice(0, 4), new Date().toISOString().slice(0, 4)])];
    for (const y of dirs) {
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
          this.sets.get(norad).set(String(g.GP_ID), g);
        }
        // A partial window still being written is read again next time.
        if (!/--/.test(n) || Date.now() - fs.statSync(f).mtimeMs > 2 * H) this.read.add(f);
      }
    }
  }
  // The latest set with EPOCH <= t and CREATION_DATE <= t.
  at(norad, t) {
    let best = null;
    for (const g of this.sets.get(norad)?.values() ?? []) {
      if (ms(g.EPOCH) > t || ms(g.CREATION_DATE) > t) continue;
      if (!best || ms(g.EPOCH) > ms(best.EPOCH) || (ms(g.EPOCH) === ms(best.EPOCH) && g.CREATION_DATE > best.CREATION_DATE)) best = g;
    }
    return best && { norad, epoch: best.EPOCH, creationDate: best.CREATION_DATE, gpId: String(best.GP_ID),
      elements: Object.fromEntries(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'].map((k) => [k, Number(best[k])])) };
  }
}

// ── SupGP snapshots from the collector archive ──
export function supgpSnapshots(root, group) {
  const dir = path.join(root, group);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^\d{8}T\d{6}Z\.json$/.test(n)).sort().map((n) => {
    const stamp = n.slice(0, 16);
    const rmsFile = path.join(dir, `${stamp}.rms.txt`);
    return { stamp, file: path.join(dir, n), rmsFile: fs.existsSync(rmsFile) ? rmsFile : null };
  });
}
export function readSupgp(snap) {
  const sets = JSON.parse(fs.readFileSync(snap.file, 'utf8'));
  // rms lines are in the JSON's order; RMS is also a JSON field.
  return sets.map((s) => ({ norad: s.NORAD_CAT_ID, epoch: s.EPOCH, name: s.OBJECT_NAME, rmsKm: Number(s.RMS), elementSetNo: s.ELEMENT_SET_NO,
    elements: Object.fromEntries(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'].map((k) => [k, Number(s[k])])) }));
}

// ── the capture ──
export class Capture {
  constructor(a) {
    this.a = a;
    this.root = a.root;
    this.derived = path.join(this.root, 'derived');
    this.statePath = path.join(this.root, 'capture-state.json');
    this.state = fs.existsSync(this.statePath) ? JSON.parse(fs.readFileSync(this.statePath, 'utf8')) : {};
    for (const k of ['validators', 'versions', 'paired', 'next', 'names']) this.state[k] ??= {};
    this.sample = fs.readFileSync(a.sample, 'utf8').split(/\s+/).filter(Boolean).map(Number);
    this.http = new Http((m) => this.log(m));
    const v1 = path.join(this.root, 'capture-state.v1-raw-mode.json');
    if (!this.state.seededV1 && fs.existsSync(v1)) {
      for (const n of JSON.parse(fs.readFileSync(v1, 'utf8')).manifest_names ?? [])
        this.state.names[n] ??= { norad: Number(n.split('_')[1]), start: iso(Capture.startOf(n)), firstSeen: '2026-10-10T12:10:30Z' };
      this.state.seededV1 = true;
    }
    this.stop = false;
    this.dry = [];
  }
  log(m) {
    const line = `${new Date().toISOString()} ${m}`;
    if (this.a.dryRun) console.log(line);
    else fs.appendFileSync(path.join(this.root, 'capture.log'), `${line}\n`);
  }
  save() {
    if (this.a.dryRun) return;
    fs.writeFileSync(`${this.statePath}.tmp`, JSON.stringify(this.state));
    fs.renameSync(`${this.statePath}.tmp`, this.statePath);
  }
  freeGib() {
    const s = fs.statfsSync(this.root);
    return (s.bavail * s.bsize) / 2 ** 30;
  }
  async init() {
    this.gp = await loadModule(this.a.modules, 'analysis/gp-error-model');
    this.provenance = { gpErrorModel: this.gp.provenance, modules: gitState(this.a.modules), experiments: gitState(REPO), capture: sha256(fs.readFileSync(fileURLToPath(import.meta.url))) };
    if (this.a.hpop) {
      const hpopPath = path.resolve(this.a.hpop);
      this.hpopLib = await import(pathToFileURL(hpopPath));
      const cfg = JSON.parse(fs.readFileSync(this.a.hpopConfig, 'utf8'));
      this.hpopEnv = await this.hpopLib.ephemerisFitEnv(cfg);
      this.provenance.hpop = { file: hpopPath, sha256: sha256(fs.readFileSync(hpopPath)), git: gitState(path.dirname(path.dirname(hpopPath))), env: this.hpopEnv.provenance ?? null };
    }
    const fromDay = new Date(Date.now() - 12 * 86400e3).toISOString().slice(0, 10);
    this.spacetrack = new SpaceTrack(this.a.spacetrack, [...this.sample, 25544]);
    this.spacetrack.refresh(fromDay);
    this.log(`init: gp-error-model ${this.gp.provenance.version} ${this.gp.provenance.wasmSha256.slice(0, 16)}; hpop ${this.provenance.hpop ? this.provenance.hpop.sha256.slice(0, 16) : 'off'}; sample ${this.sample.length}`);
  }

  // OMM fits (one fit_elements call) and the reference sets scored on the same windows.
  async omm(norad, name, parsed, fits, references) {
    const eph = oemFrame(norad, name, parsed, { covariance: fits.some((f) => f.weighting === 'covariance') });
    const out = await this.gp.invoke('fit_elements', [eph, json('options', { ...SETTINGS.fit, fits: fits.map((f) => ({ norad, ...f.options })) })]);
    const report = JSON.parse(Buffer.from(out.outputs.find((o) => o.portId === 'report').payload).toString());
    const omms = out.outputs.find((o) => o.portId === 'elements')?.payload;
    let scores = null;
    if (references.length) {
      const res = await this.gp.invokeJson('element_residuals', [ommFrame(references.map((r) => r.set)), eph,
        json('options', { requests: references.map((r) => ({ norad, set: r.set.epoch, label: r.label, windows: r.windows })) })], 'residuals');
      scores = res.results;
    }
    return { report, omms: omms ? Buffer.from(omms) : null, scores };
  }

  windowFits(parsed, anchorMs, endMs, extra = [], grid = true) {
    if (!grid) return extra;
    const lastMs = ms(parsed.epochs.at(-1));
    const anchor = parsed.epochs.find((e) => ms(e) >= anchorMs) ?? parsed.epochs[0];
    const a = ms(anchor);
    const fits = SETTINGS.grid.map((g) => ({ id: g.id, weighting: g.weighting, grid: g,
      options: { from: iso(a), to: iso(g.hours ? Math.min(a + g.hours * H, endMs ?? lastMs) : (endMs ?? lastMs)), epoch: 'first', fitBstar: g.fitBstar,
        ...(g.weighting ? { weighting: g.weighting } : {}) } }));
    return [...extra, ...fits];
  }

  // One operator file version, in memory; returns the persisted row (or a failure row).
  async processVersion({ provider, norad, name, url, fetched, parsed, pairs = [], hpop = true, grid = true }) {
    const t0 = Date.now();
    const rawSha = sha256(fetched.body);
    const key = `${parsed.created ? parsed.created.replace(/[-:]/g, '').slice(0, 15) : 'nocreated'}-${rawSha.slice(0, 12)}`;
    const issuedMs = ms(parsed.created ?? parsed.epochs[0]);
    const st = this.spacetrack.at(norad, issuedMs);
    const row = { provider, norad, name, version: key, url, created: parsed.created, span: [parsed.epochs[0], parsed.epochs.at(-1)], points: parsed.epochs.length,
      frame: parsed.frame, timeScale: parsed.timeScale,
      source: { requestUtc: fetched.requestUtc, responseUtc: fetched.responseUtc, httpStatus: fetched.status, etag: fetched.etag, lastModified: fetched.lastModified,
        bytes: fetched.body.length, sha256: rawSha },
      spacetrack: st ? { epoch: st.epoch, creationDate: st.creationDate, gpId: st.gpId } : null, settings: SETTINGS, provenance: this.provenance };
    try {
      // CelesTrak windows of the paired SupGP sets, then the E11 grid.
      const paired = pairs.map((p, i) => ({ id: `celestrak-${i}`, pair: p,
        options: { from: p.window[0], to: p.window[1], epoch: p.set.epoch.endsWith('Z') ? p.set.epoch : `${p.set.epoch}Z`, fitBstar: p.fitBstar ?? true } }));
      const fits = this.windowFits(parsed, issuedMs, null, paired, grid);
      for (const f of fits) if (f.grid && f.options.fitBstar === false) {
        if (st) f.options.bstar = st.elements.BSTAR;
        else f.skip = 'no Space-Track set at the issue time';
      }
      const active = fits.filter((f) => !f.skip);
      const references = [];
      for (const p of paired) references.push({ label: `${p.id}:supgp`, set: { norad, epoch: p.pair.set.epoch, elements: p.pair.set.elements }, windows: [{ from: p.options.from, to: p.options.to, label: p.id }] });
      // Calibration of the CelesTrak window (pre-freeze only): the same set over candidate windows.
      if (this.a.calibrate) for (const p of paired) {
        const e = ms(p.pair.set.epoch);
        const hours = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 24];
        references.push({ label: `${p.id}:calibration`, set: { norad, epoch: p.pair.set.epoch, elements: p.pair.set.elements },
          windows: hours.map((h) => ({ from: iso(e), to: iso(e + h * H), label: `${h}h` })) });
      }
      if (st) {
        references.push({ label: 'spacetrack', set: st, windows: [...paired, ...active.filter((f) => f.grid)].map((f) => ({ from: f.options.from, to: f.options.to, label: f.id })) });
      }
      const { report, omms, scores } = await this.omm(norad, name, parsed, active, references);
      row.omm = active.map((f, i) => ({ id: f.id, options: f.options, ...pick(report.fits[i]) }));
      row.skipped = fits.filter((f) => f.skip).map((f) => ({ id: f.id, reason: f.skip }));
      row.references = scores;
      // The rms-file gate for every paired set.
      row.gate = paired.map((p) => {
        const s = scores?.find((r) => r.label === `${p.id}:supgp`)?.windows?.[0];
        const ours = row.omm.find((o) => o.id === p.id);
        const recomputed = s?.rmsPerCoordinateKm;
        const published = p.pair.set.rmsKm;
        const tol = Math.max(SETTINGS.gate.absoluteKm, SETTINGS.gate.relative * published);
        return { id: p.id, supgpEpoch: p.pair.set.epoch, elementSetNo: p.pair.set.elementSetNo, window: p.pair.window, publishedRmsKm: published,
          recomputedRmsKm: recomputed, oursRmsKm: ours?.rms?.rmsPerCoordinateKm, ours3dKm: ours?.rms?.rms3dKm, supgp3dKm: s?.rms3dKm,
          n: s?.n, pass: Number.isFinite(recomputed) && Math.abs(recomputed - published) <= tol, toleranceKm: tol };
      });
      const failed = row.omm.filter((o) => !o.converged);
      if (failed.length === row.omm.length) throw new Error(`every OMM fit failed: ${failed[0]?.error}`);
      if (row.gate.some((g) => !g.pass)) throw new Error(`rms-file gate tripped: ${JSON.stringify(row.gate.filter((g) => !g.pass).map((g) => [g.supgpEpoch, g.publishedRmsKm, g.recomputedRmsKm]))}`);
      // HPOP OCM per manoeuvre-free segment.
      if (this.hpopEnv && hpop) {
        const h0 = Date.now();
        try {
          const r = await this.hpopLib.fitEphemeris(this.hpopEnv, { object: { norad, name }, source: { provider, url, sha256: rawSha, issued: parsed.created ?? parsed.epochs[0] },
            frame: parsed.frame, timeScale: parsed.timeScale,
            states: parsed.epochs.map((e, i) => ({ epoch: e, position: parsed.states[i].slice(0, 3), velocity: parsed.states[i].slice(3, 6), covariance: parsed.covariances?.[i] ?? null })),
            reference: st ? { epoch: st.epoch, elements: st.elements } : undefined });
          row.hpop = { seconds: (Date.now() - h0) / 1000, segments: r.segments.map((s) => ({ index: s.index, reason: s.reason, regime: s.regime, stats: s.stats, closure: s.closure, referenceSgp4: s.referenceSgp4 })) };
          row._ocms = r.segments.map((s) => Buffer.from(s.ocm));
        } catch (e) {
          row.hpop = { seconds: (Date.now() - h0) / 1000, error: String(e.message ?? e).slice(0, 500) };
        }
      }
      row.seconds = (Date.now() - t0) / 1000;
      this.persist(row, omms);
      return row;
    } catch (e) {
      const fail = { provider, norad, version: key, url, sha256: rawSha, reason: String(e.message ?? e).slice(0, 800), at: new Date().toISOString(), seconds: (Date.now() - t0) / 1000 };
      if (this.a.dryRun) this.dry.push({ ...row, failure: fail.reason });
      else fs.appendFileSync(path.join(this.derived, 'failures.jsonl'), `${JSON.stringify(fail)}\n`);
      this.log(`failure ${provider} ${norad} ${key}: ${fail.reason}`);
      return { failure: fail };
    }
  }

  persist(row, omms) {
    const ocms = row._ocms ?? [];
    delete row._ocms;
    if (this.a.dryRun) { this.dry.push(row); return; }
    const dir = path.join(this.derived, row.provider, String(row.norad), row.version);
    fs.mkdirSync(dir, { recursive: true });
    if (omms) fs.writeFileSync(path.join(dir, 'omm.fbs'), omms);
    ocms.forEach((b, i) => fs.writeFileSync(path.join(dir, `ocm-${i}.fbs`), b));
    fs.writeFileSync(path.join(dir, 'stats.json'), `${JSON.stringify(row, null, 1)}\n`);
    fs.appendFileSync(path.join(this.derived, 'index.jsonl'), `${JSON.stringify({ provider: row.provider, norad: row.norad, version: row.version, created: row.created,
      sha256: row.source.sha256, dir: path.relative(this.root, dir), gate: row.gate, hpop: Boolean(row.hpop && !row.hpop.error) })}\n`);
  }

  // ── Starlink ──
  // Version names by NORAD, from every manifest seen (and the names a raw-mode
  // run recorded at 2026-10-10T12:10Z, before this capture). Superseded versions
  // stay downloadable by name, so a version is fetched again when its SupGP set
  // arrives.
  static startOf(name) {
    const stop = Number(name.split('_')[5]);
    return Date.UTC(1980, 0, 6) + (stop - 18) * 1000 - 3 * 86400e3;  // GPS seconds of ephemeris_stop; 3-day files
  }
  async starlinkManifest() {
    const v = this.state.validators.manifest ?? {};
    const r = await this.http.get('starlink', `${STARLINK}MANIFEST.txt`, v);
    if (r.status === 200 && r.body) {
      this.state.validators.manifest = { etag: r.etag, lastModified: r.lastModified };
      const want = new Set(this.sample);
      for (const n of r.body.toString('utf8').split(/\s+/)) {
        if (!n.startsWith('MEME_') || !want.has(Number(n.split('_')[1]))) continue;
        this.state.names[n] ??= { norad: Number(n.split('_')[1]), start: iso(Capture.startOf(n)), firstSeen: new Date().toISOString() };
      }
    }
  }
  // Sample SupGP sets not yet paired (newest snapshot wins), with the version each pairs with.
  starlinkPairs() {
    const out = [];
    const sets = new Map();
    for (const snap of supgpSnapshots(this.a.supgp, 'starlink').slice(-3))
      for (const s of readSupgp(snap)) if (this.sample.includes(s.norad)) sets.set(`${s.norad}@${s.epoch}`, { ...s, snapshot: snap.stamp });
    for (const [id, s] of sets) {
      if (this.state.paired[id]) continue;
      let best = null;
      for (const [n, v] of Object.entries(this.state.names)) {
        if (v.norad !== s.norad || ms(v.start) > ms(s.epoch)) continue;
        if (!best || ms(v.start) > ms(this.state.names[best].start)) best = n;
      }
      out.push({ id, set: s, name: best });
    }
    return out;
  }
  async starlink({ limit = Infinity } = {}) {
    await this.starlinkManifest();
    const pairs = this.starlinkPairs();
    const byName = new Map();
    for (const p of pairs) {
      if (!p.name) {
        this.state.paired[p.id] = 'unknown version';
        if (!this.a.dryRun) fs.appendFileSync(path.join(this.derived, 'failures.jsonl'), `${JSON.stringify({ provider: 'starlink', norad: p.set.norad, supgpEpoch: p.set.epoch,
          reason: 'no recorded version starts at or before the SupGP epoch', at: new Date().toISOString() })}\n`);
        continue;
      }
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name).push(p);
    }
    // Versions to fetch: unprocessed ones (first sight), and processed ones with a new pair.
    const todo = Object.keys(this.state.names).filter((n) => !this.state.names[n].processed || byName.has(n))
      .sort((x, y) => (byName.has(y) - byName.has(x)) || this.sample.indexOf(this.state.names[x].norad) - this.sample.indexOf(this.state.names[y].norad));
    let done = 0;
    for (const name of todo) {
      if (this.stop || done >= limit) break;
      if (this.freeGib() < 30) { this.log('pause: less than 30 GiB free'); break; }
      const v = this.state.names[name];
      const r = await this.http.get('starlink', STARLINK + name);
      if (r.status !== 200 || !r.body) { this.log(`starlink ${name}: HTTP ${r.status} ${r.error ?? ''}`); v.fetchFailures = (v.fetchFailures ?? 0) + 1; if (v.fetchFailures >= 3) v.processed = true; continue; }
      let parsed;
      try { parsed = readMeme(r.body.toString('utf8')); } catch (e) { this.log(`starlink ${name}: ${e.message}`); v.processed = true; continue; }
      const pairsHere = (byName.get(name) ?? []).filter((p) => ms(parsed.epochs[0]) <= ms(p.set.epoch) && ms(p.set.epoch) <= ms(parsed.epochs.at(-1)))
        .map((p) => ({ set: p.set, id: p.id, window: [iso(ms(p.set.epoch)), iso(ms(p.set.epoch) + SETTINGS.starlinkWindowHours * H)], fitBstar: true }));
      const first = !v.processed;
      const hpop = first && (this.a.hpopSample === 0 || this.sample.indexOf(v.norad) < this.a.hpopSample);
      const row = await this.processVersion({ provider: 'starlink', norad: v.norad, name: name.split('_')[2], url: STARLINK + name, fetched: r, parsed,
        pairs: pairsHere, hpop, grid: first });
      v.processed = true;
      v.created = parsed.created;
      for (const p of byName.get(name) ?? []) this.state.paired[p.id] = pairsHere.some((q) => q.id === p.id) ? (row.failure ? 'failed' : name) : 'epoch outside the version';
      this.save();
      ++done;
      if (row.failure) this.log(`starlink ${name}: ${row.failure.reason}`);
    }
    return done;
  }

  // ── ISS ──
  async iss({ force = false } = {}) {
    const snaps = supgpSnapshots(this.a.supgp, 'iss');
    const snap = snaps.at(-1);
    const sets = snap ? readSupgp(snap) : [];
    const pending = sets.filter((s) => !this.state.paired[`25544@${s.epoch}`]);
    const v = this.state.validators.iss ?? {};
    // A full GET when pairs are pending (the bytes are needed), else conditional.
    const r = await this.http.get('iss', ISS, pending.length || force ? {} : v);
    if (r.status !== 200 || !r.body) return 0;
    this.state.validators.iss = { etag: r.etag, lastModified: r.lastModified };
    const rawSha = sha256(r.body);
    const parsed = readOem(r.body.toString('utf8'));
    const first = ms(parsed.epochs[0]), last = ms(parsed.epochs.at(-1));
    const pairs = pending.filter((s) => ms(s.epoch) >= first && ms(s.epoch) <= last)
      .map((s) => ({ set: s, window: [iso(ms(s.epoch)), iso(ms(s.epoch) + SETTINGS.issSegmentHours * H)], fitBstar: true }));
    const known = this.state.versions[`iss:${rawSha}`];
    if (known && !pairs.length) return 0;
    await this.processVersion({ provider: 'iss', norad: 25544, name: 'ISS', url: ISS, fetched: r, parsed, pairs, hpop: !known });
    this.state.versions[`iss:${rawSha}`] = { created: parsed.created, sha256: rawSha, paired: pairs.length > 0, at: new Date().toISOString() };
    for (const p of pairs) this.state.paired[`25544@${p.set.epoch}`] = rawSha;
    this.save();
    return 1;
  }

  // ── Planet: one state per satellite (no ephemeris to fit); provenance only ──
  async planet() {
    const rows = [];
    for (const n of PLANET_FILES) {
      const v = this.state.validators[`planet:${n}`] ?? {};
      const r = await this.http.get('planet', PLANET + n, v);
      if (r.status === 200 && r.body) {
        this.state.validators[`planet:${n}`] = { etag: r.etag, lastModified: r.lastModified };
        const lines = r.body.toString('utf8').split(/\r?\n/).filter(Boolean);
        rows.push({ provider: 'planet', file: n, url: PLANET + n, sha256: sha256(r.body), bytes: r.body.length, etag: r.etag, lastModified: r.lastModified,
          requestUtc: r.requestUtc, records: lines.length, note: 'one state (or element set) per satellite: no ephemeris to fit; an ephemeris needs HPOP propagation of the state (A5)' });
      } else {
        rows.push({ provider: 'planet', file: n, httpStatus: r.status, unchanged: r.status === 304 });
      }
    }
    if (this.a.dryRun) {
      this.dry.push(...rows);
    } else {
      for (const row of rows) if (row.sha256) fs.appendFileSync(path.join(this.derived, 'planet-provenance.jsonl'), `${JSON.stringify(row)}\n`);
    }
    this.save();
    return rows;
  }

  async run() {
    fs.mkdirSync(this.derived, { recursive: true });
    if (!this.a.dryRun) fs.writeFileSync(path.join(this.root, 'capture.pid'), String(process.pid));
    process.on('SIGTERM', () => { this.stop = true; });
    process.on('SIGINT', () => { this.stop = true; });
    await this.init();
    if (this.a.dryRun) {
      const n = Number(process.env.E11_DRY_STARLINK ?? 3);
      await this.starlink({ limit: n });
      await this.iss({ force: true });
      await this.planet();
      return this.dry;
    }
    const until = ms(this.a.until);
    const due = (k, every) => { if ((this.state.next[k] ?? 0) <= Date.now()) { this.state.next[k] = Date.now() + every; return true; } return false; };
    while (!this.stop && Date.now() < until && !fs.existsSync(path.join(this.root, 'capture.stop'))) {
      try {
        if (this.freeGib() >= 30) {
          if (due('starlink', H)) await this.starlink();
          if (due('iss', 3 * H)) await this.iss();
          if (due('planet', 3 * H)) await this.planet();
          if (due('spacetrack', H)) this.spacetrack.refresh(new Date(Date.now() - 12 * 86400e3).toISOString().slice(0, 10));
          // A SupGP snapshot newer than the last pass makes the pairs due now.
          const latest = supgpSnapshots(this.a.supgp, 'starlink').at(-1)?.stamp;
          if (latest && latest !== this.state.lastSupgp) { this.state.lastSupgp = latest; await this.starlink(); await this.iss(); }
        } else this.log('pause: less than 30 GiB free');
      } catch (e) {
        this.log(`loop error: ${e.stack ?? e}`);
      }
      this.save();
      for (let i = 0; i < 60 && !this.stop; ++i) await new Promise((r) => setTimeout(r, 1000));
    }
    this.log('capture exit');
    try { if (fs.readFileSync(path.join(this.root, 'capture.pid'), 'utf8') === String(process.pid)) fs.rmSync(path.join(this.root, 'capture.pid')); } catch { /* gone */ }
    await this.gp.destroy?.();
    await this.hpopEnv?.destroy?.();
    return null;
  }
}

// The persisted part of one fit_elements fit.
function pick(f) {
  if (!f) return { converged: false, error: 'no fit row' };
  return { converged: f.converged, error: f.error, epoch: f.epoch, elements: f.elements, iterations: f.iterations, stop: f.stop, criterion: f.criterion,
    states: f.states, rms: f.rms, closure: f.closure, weightedRms: f.weightedRms, conditionNumber: f.conditionNumber, covariance: f.covariance?.classical ?? null };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const c = new Capture(a);
  const out = await c.run();
  if (a.dryRun) {
    fs.writeFileSync(process.env.E11_DRY_OUT ?? path.join(os.tmpdir(), 'e11-capture-dry-run.json'), JSON.stringify(out));
    console.log(JSON.stringify(out.map((r) => ({ provider: r.provider, norad: r.norad, version: r.version, failure: r.failure, gate: r.gate,
      omm: r.omm?.map((o) => [o.id, o.converged, o.rms?.rmsPerCoordinateKm, o.closure?.rms?.max3dKm, o.iterations]),
      hpop: r.hpop && (r.hpop.error ?? r.hpop.segments?.map((s) => [s.index, s.stats?.rmsPerCoordinate, s.closure?.max3d ?? s.closure?.stats?.max3d])), seconds: r.seconds, hpopSeconds: r.hpop?.seconds })), null, 1));
  }
  process.exit(0);
}
