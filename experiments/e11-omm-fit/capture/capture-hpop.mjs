#!/usr/bin/env node
// E11 HPOP worker: a full-force OCM for each operator file version, in memory.
// It is shared with E4 A5 and runs alongside capture.mjs.
//
// The fit is A5's harness/ephemeris-fit.mjs, the algorithm agreed with the
// analysis/od hpop mode and E11 on 2026-10-10. It is imported from a pinned
// checkout (--hpop) with its own modules checkout (--hpop-config). The fit
// gives OCMs per manoeuvre-free segment, the exact residuals at every point
// and the half-split closure.
// Versions come from the name registry that capture.mjs keeps in
// <root>/capture-state.json. They are restricted to a seeded subset of the
// Starlink sample (--subset K, sized to the CPU budget) and each ISS OEM
// version. Each version is fetched by name into memory, fitted, and dropped.
// Only the OCMs and statistics (hpop.json, with the raw sha256) are written,
// next to the version's OMM products in derived/<provider>/<norad>/<version>/.
// Failures leave a row in derived/hpop-failures.jsonl.
//
// Stop: kill "$(cat <root>/capture-hpop.pid)" or touch <root>/capture-hpop.stop
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Http, STARLINK, ISS, sha256, iso, ms, Capture } from './capture.mjs';
import { readMeme, readOem } from '../../e4-operator-ephemeris-parity/operators.mjs';
import { gitState } from '../../../harness/modules.mjs';

const H = 3600e3;

function args() {
  const a = { root: '/opt/data/sdn-archive/operator-ephemerides', hpop: null, hpopConfig: null, subset: 40, until: null, dryRun: 0, iss: true, maxAgeHours: 40 };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; ++i) {
    const k = v[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (k === 'noIss') a.iss = false;
    else a[k] = v[++i];
  }
  a.subset = Number(a.subset);
  a.dryRun = Number(a.dryRun) || 0;
  a.maxAgeHours = Number(a.maxAgeHours);
  if (!a.hpop || !a.hpopConfig) throw new Error('--hpop and --hpop-config are required');
  if (!a.dryRun && !a.until) throw new Error('--until is required');
  return a;
}

// The seeded HPOP subset of the Starlink sample (hash order, salt e11-hpop-subset-20261010).
export function hpopSubset(sample, k) {
  return [...sample].sort((x, y) => {
    const hx = crypto.createHash('sha256').update(`e11-hpop-subset-20261010:${x}`).digest('hex');
    const hy = crypto.createHash('sha256').update(`e11-hpop-subset-20261010:${y}`).digest('hex');
    return hx < hy ? -1 : 1;
  }).slice(0, k);
}

class Worker {
  constructor(a) {
    this.a = a;
    this.root = a.root;
    this.derived = path.join(this.root, 'derived');
    this.statePath = path.join(this.root, 'capture-hpop-state.json');
    this.state = fs.existsSync(this.statePath) ? JSON.parse(fs.readFileSync(this.statePath, 'utf8')) : {};
    for (const k of ['done', 'validators']) this.state[k] ??= {};
    this.http = new Http((m) => this.log(m));
    this.stop = false;
    this.rows = [];
  }
  log(m) {
    const line = `${new Date().toISOString()} ${m}`;
    if (this.a.dryRun) console.log(line);
    else fs.appendFileSync(path.join(this.root, 'capture-hpop.log'), `${line}\n`);
  }
  save() {
    if (this.a.dryRun) return;
    fs.writeFileSync(`${this.statePath}.tmp`, JSON.stringify(this.state));
    fs.renameSync(`${this.statePath}.tmp`, this.statePath);
  }
  async init() {
    const hpopPath = path.resolve(this.a.hpop);
    this.lib = await import(pathToFileURL(hpopPath));
    const cfg = JSON.parse(fs.readFileSync(this.a.hpopConfig, 'utf8'));
    this.env = await this.lib.ephemerisFitEnv(cfg);
    this.provenance = { fitter: { file: hpopPath, sha256: sha256(fs.readFileSync(hpopPath)), git: gitState(path.dirname(path.dirname(hpopPath))), version: this.lib.VERSION ?? null },
      modules: { dir: cfg.modulesDir, git: gitState(cfg.modulesDir), loaded: this.env.provenance?.modules ?? null }, inputs: this.env.provenance?.inputs ?? null,
      worker: sha256(fs.readFileSync(fileURLToPath(import.meta.url))) };
    const sample = fs.readFileSync(path.join(this.root, '_capture/starlink-sample.txt'), 'utf8').split(/\s+/).filter(Boolean).map(Number);
    this.subset = new Set(hpopSubset(sample, this.a.subset));
    this.log(`init: fitter ${this.provenance.fitter.sha256.slice(0, 16)} at ${this.provenance.fitter.git.commit?.slice(0, 9)}; modules ${this.provenance.modules.git.commit?.slice(0, 9)}; subset ${this.subset.size}`);
  }
  // The main capture's registry (read-only here).
  registry() {
    const p = path.join(this.root, 'capture-state.json');
    if (!fs.existsSync(p)) return {};
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
  }
  async fit({ provider, norad, name, url, fetched, parsed }) {
    const rawSha = sha256(fetched.body);
    const key = `${parsed.created ? parsed.created.replace(/[-:]/g, '').slice(0, 15) : 'nocreated'}-${rawSha.slice(0, 12)}`;
    const t0 = Date.now();
    const row = { provider, norad, name, version: key, url, created: parsed.created, points: parsed.epochs.length, span: [parsed.epochs[0], parsed.epochs.at(-1)],
      source: { requestUtc: fetched.requestUtc, responseUtc: fetched.responseUtc, httpStatus: fetched.status, etag: fetched.etag, lastModified: fetched.lastModified,
        bytes: fetched.body.length, sha256: rawSha }, provenance: this.provenance };
    try {
      const r = await this.lib.fitEphemeris(this.env, {
        object: { norad, name }, source: { provider, url, sha256: rawSha, issued: parsed.created ?? parsed.epochs[0] },
        frame: parsed.frame, timeScale: parsed.timeScale,
        states: parsed.epochs.map((e, i) => ({ epoch: e, position: parsed.states[i].slice(0, 3), velocity: parsed.states[i].length >= 6 ? parsed.states[i].slice(3, 6) : null })),
        events: [] });
      row.seconds = (Date.now() - t0) / 1000;
      row.timing = r.timing ?? null;
      row.splits = r.splits ?? null;
      row.skipped = r.skipped ?? null;
      row.segments = r.segments.map((s) => ({ index: s.index, reason: s.reason, regime: s.regime, perigeeAltitudeM: s.perigeeAltitudeM, stats: s.stats, closure: s.closure, referenceSgp4: s.referenceSgp4 ?? null }));
      if (!r.segments.length) throw new Error('no segment fitted');
      if (this.a.dryRun) { this.rows.push(row); return row; }
      const dir = path.join(this.derived, provider, String(norad), key);
      fs.mkdirSync(dir, { recursive: true });
      r.segments.forEach((s, i) => fs.writeFileSync(path.join(dir, `ocm-${i}.fbs`), Buffer.from(s.ocm)));
      fs.writeFileSync(path.join(dir, 'hpop.json'), `${JSON.stringify(row, null, 1)}\n`);
      fs.appendFileSync(path.join(this.derived, 'hpop-index.jsonl'), `${JSON.stringify({ provider, norad, version: key, created: parsed.created, sha256: rawSha,
        dir: path.relative(this.root, dir), seconds: row.seconds, segments: row.segments.map((s) => ({ n: s.stats?.n, rms3dKm: s.stats?.rms3dKm, closureMaxM: s.closure?.max3d })) })}\n`);
      return row;
    } catch (e) {
      const fail = { provider, norad, version: key, url, sha256: rawSha, reason: String(e.stack ?? e).slice(0, 1200), seconds: (Date.now() - t0) / 1000, at: new Date().toISOString() };
      if (this.a.dryRun) this.rows.push({ ...row, failure: fail.reason });
      else fs.appendFileSync(path.join(this.derived, 'hpop-failures.jsonl'), `${JSON.stringify(fail)}\n`);
      this.log(`failure ${provider} ${norad} ${key}: ${fail.reason.split('\n')[0]}`);
      return { failure: fail };
    }
  }
  async starlink(limit) {
    const reg = this.registry();
    const now = Date.now();
    const todo = Object.entries(reg.names ?? {})
      .filter(([n, v]) => this.subset.has(v.norad) && !this.state.done[n] && now - ms(v.start) < this.a.maxAgeHours * H)
      .sort((x, y) => ms(x[1].start) - ms(y[1].start));
    // Paired versions (their SupGP set is known) first.
    const paired = new Set(Object.values(reg.paired ?? {}));
    todo.sort((x, y) => paired.has(y[0]) - paired.has(x[0]));
    let done = 0;
    for (const [name, v] of todo) {
      if (this.stop || done >= limit) break;
      const r = await this.http.get('starlink', STARLINK + name);
      if (r.status !== 200 || !r.body) {
        this.log(`starlink ${name}: HTTP ${r.status} ${r.error ?? ''}`);
        if (r.status === 404) this.state.done[name] = { gone: true, at: new Date().toISOString() };
        continue;
      }
      let parsed;
      try { parsed = readMeme(r.body.toString('utf8')); } catch (e) { this.state.done[name] = { parseError: e.message }; continue; }
      const row = await this.fit({ provider: 'starlink', norad: v.norad, name: name.split('_')[2], url: STARLINK + name, fetched: r, parsed });
      this.state.done[name] = { at: new Date().toISOString(), failed: Boolean(row.failure), seconds: row.seconds ?? row.failure?.seconds };
      this.save();
      ++done;
    }
    return done;
  }
  async iss() {
    const r = await this.http.get('iss', ISS, this.state.validators.iss ?? {});
    if (r.status !== 200 || !r.body) return 0;
    this.state.validators.iss = { etag: r.etag, lastModified: r.lastModified };
    const key = `iss:${sha256(r.body)}`;
    if (this.state.done[key]) return 0;
    const parsed = readOem(r.body.toString('utf8'));
    const row = await this.fit({ provider: 'iss', norad: 25544, name: 'ISS', url: ISS, fetched: r, parsed });
    this.state.done[key] = { at: new Date().toISOString(), failed: Boolean(row.failure), seconds: row.seconds ?? row.failure?.seconds };
    this.save();
    return 1;
  }
  async run() {
    process.on('SIGTERM', () => { this.stop = true; });
    process.on('SIGINT', () => { this.stop = true; });
    await this.init();
    if (this.a.dryRun) {
      await this.starlink(this.a.dryRun);
      if (this.a.iss) await this.iss();
      return this.rows;
    }
    fs.writeFileSync(path.join(this.root, 'capture-hpop.pid'), String(process.pid));
    const until = ms(this.a.until);
    let nextIss = 0;
    while (!this.stop && Date.now() < until && !fs.existsSync(path.join(this.root, 'capture-hpop.stop'))) {
      try {
        if (this.a.iss && Date.now() >= nextIss) { nextIss = Date.now() + 3 * H; await this.iss(); }
        const n = await this.starlink(1);
        if (n) continue;  // keep working through the queue
      } catch (e) {
        this.log(`loop error: ${e.stack ?? e}`);
      }
      for (let i = 0; i < 300 && !this.stop; ++i) await new Promise((r) => setTimeout(r, 1000));
    }
    this.log('worker exit');
    try { if (fs.readFileSync(path.join(this.root, 'capture-hpop.pid'), 'utf8') === String(process.pid)) fs.rmSync(path.join(this.root, 'capture-hpop.pid')); } catch { /* gone */ }
    await this.env?.destroy?.();
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const w = new Worker(a);
  const out = await w.run();
  if (a.dryRun) {
    if (process.env.E11_DRY_OUT) fs.writeFileSync(process.env.E11_DRY_OUT, JSON.stringify(out));
    console.log(JSON.stringify(out.map((r) => ({ provider: r.provider, norad: r.norad, version: r.version, points: r.points, seconds: r.seconds, failure: r.failure?.slice(0, 300),
      segments: r.segments?.map((s) => ({ index: s.index, reason: s.reason, regime: s.regime, n: s.stats?.n, rms3dKm: s.stats?.rms3dKm, rmsPerCoordinateKm: s.stats?.rmsPerCoordinateKm,
        maxKm: s.stats?.maxKm, iterations: s.stats?.iterations, converged: s.stats?.converged, closureMax3dM: s.closure?.max3d, closureRms3dM: s.closure?.rms3d, closureN: s.closure?.n })) })), null, 1));
  }
  process.exit(0);
}
