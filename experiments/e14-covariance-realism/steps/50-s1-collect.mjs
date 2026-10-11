#!/usr/bin/env node
// E14 step 50: the S1 collector (PLAN.md section 6). RAM only: every operator file is fetched into memory, parsed,
// kept in memory (states and position covariances) for its retention span, and dropped; nothing raw touches disk.
// When a newer version of a satellite arrives, each retained older version whose span covers the newer start gives
// one pair: the older file interpolated at the newer start (its own Lagrange rule) against the newer first state,
// both with their stated covariances, by analysis/gp-error-model pair_statistics. Only those statistics are written,
// to <store>/pairs.jsonl, with each version's provenance in <store>/versions.jsonl.
//
// SpaceX Starlink: 100 satellites (seed 20261014) outside E13's and E11's samples, every new version (manifest
// hourly). Planet: every satellite in planet_mc.tle, <hwid>_oem.txt every 3 h with conditional GETs. One request at a
// time per host, at least 6 s apart; a provider stops at its first 403 or 429; the run pauses below 30 GiB free.
//
//   nohup node experiments/e14-covariance-realism/steps/50-s1-collect.mjs --modules <modules checkout> &
//   touch <store>/collector.stop     # stops it at the next loop
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { loadModule, modulesRoot, json } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { rng } from '../../../harness/stats.mjs';
import { readMeme } from '../../e4-operator-ephemeris-parity/operators.mjs';
import { config } from '../windows.mjs';

const { values } = parseArgs({ options: { modules: { type: 'string' }, until: { type: 'string' }, providers: { type: 'string', default: 'starlink,planet' } } });
const S1 = config.s1;
const store = config.inputs.store;
fs.mkdirSync(store, { recursive: true });
const paths = { pairs: path.join(store, 'pairs.jsonl'), versions: path.join(store, 'versions.jsonl'), failures: path.join(store, 'failures.jsonl'),
  status: path.join(store, 'collector.status.json'), log: path.join(store, 'collector.log'), stop: path.join(store, 'collector.stop'), pid: path.join(store, 'collector.pid'),
  sample: path.join(store, 'starlink-sample.json') };
const stopMs = Date.parse(values.until ?? S1.stopUtc);
const providers = new Set(values.providers.split(','));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoMs = (ms) => new Date(ms).toISOString().replace('Z', '');
const append = (file, row) => fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
const log = (...a) => { const line = `${new Date().toISOString()} ${a.join(' ')}`; console.log(line); fs.appendFileSync(paths.log, `${line}\n`); };
fs.writeFileSync(paths.pid, `${process.pid}\n`);

const modulesDir = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const gp = await loadModule(modulesDir, 'analysis/gp-error-model');
if (!gp.provenance.version || !JSON.parse(fs.readFileSync(path.join(modulesDir, 'analysis/gp-error-model/plugin-manifest.json'), 'utf8')).methods.some((m) => m.methodId === 'pair_statistics'))
  throw new Error('analysis/gp-error-model has no pair_statistics (E14 needs 0.3.0)');
const moduleTag = { version: gp.provenance.version, wasmSha256: gp.provenance.wasmSha256 };
const callJson = async (method, inputs) => JSON.parse(Buffer.from((await gp.invoke(method, inputs)).outputs[0].payload).toString('utf8'));
const unitModel = { kind: 'e14-factors', version: 'regime-only', regimes: config.regimes, strata: [{ regime: '*', horizonDays: [0, 1e9], factor: 1 }] };

const counters = { starlink: { fetched: 0, notModified: 0, gone: 0, failed: 0, versions: 0, pairs: 0 }, planet: { fetched: 0, notModified: 0, gone: 0, failed: 0, versions: 0, pairs: 0 } };
const status = (state) => fs.writeFileSync(paths.status, `${JSON.stringify({ pid: process.pid, updatedUtc: new Date().toISOString(), stopUtc: new Date(stopMs).toISOString(), state, module: moduleTag, counters, retained: retainedCounts() }, null, 1)}\n`);
const memory = new Map();  // `${provider}:${id}` -> [version] sorted by start
const retainedCounts = () => { let v = 0; for (const list of memory.values()) v += list.length; return { satellites: memory.size, versions: v }; };

function freeGiB() {
  try { return Number(execFileSync('df', ['-k', store], { encoding: 'utf8' }).trim().split('\n').at(-1).split(/\s+/)[3]) / 1048576; } catch { return Infinity; }
}

class Fetcher {
  constructor(provider) { this.provider = provider; this.last = 0; this.disabled = null; }
  async get(url, headers = {}) {
    if (this.disabled) return { status: 'disabled' };
    for (let attempt = 1; attempt <= 2; ++attempt) {
      const wait = this.last + S1[this.provider].requestSpacingSeconds * 1000 - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'orbit-accuracy-experiments-e14-covariance-realism/0.1 (RAM-only realism study; one request at a time, >= 6 s apart)', ...headers }, signal: AbortSignal.timeout(300000) });
        this.last = Date.now();
        if (r.status === 304 || r.status === 404) return { status: r.status };
        if (r.status === 403 || r.status === 429) { this.disabled = `HTTP ${r.status} on ${url}`; log(`${this.provider}: disabled (${this.disabled})`); return { status: 'disabled' }; }
        if (r.status >= 500 && attempt === 1) { log(`${this.provider}: HTTP ${r.status} on ${url}; retry in 60 s`); await sleep(60000); continue; }
        if (r.status !== 200) return { status: r.status };
        return { status: 200, bytes: Buffer.from(await r.arrayBuffer()), etag: r.headers.get('etag'), lastModified: r.headers.get('last-modified') };
      } catch (error) {
        this.last = Date.now();
        if (attempt === 1) { log(`${this.provider}: ${error.message} on ${url}; retry in 60 s`); await sleep(60000); continue; }
        return { status: 'error', error: error.message };
      }
    }
    return { status: 'error' };
  }
}

// ── parsing (text only) ──
// Planet's CCSDS OEM: EME2000 states (km, km/s) at 60 s, then one RTN covariance (km^2 ..., lower 6x6) per epoch.
function readPlanetOem(text) {
  const created = /CREATION_DATE\s*=\s*(\S+)/.exec(text)?.[1];
  const frame = /REF_FRAME\s*=\s*(\S+)/.exec(text)?.[1];
  const degree = Number(/INTERPOLATION_DEGREE\s*=\s*(\d+)/.exec(text)?.[1] ?? 5);
  const lines = text.split(/\r?\n/);
  const epochs = [], states = [];
  let i = 0, inMeta = false;
  for (; i < lines.length; ++i) {
    const l = lines[i].trim();
    if (l.startsWith('META_START')) { inMeta = true; continue; }
    if (l.startsWith('META_STOP')) { inMeta = false; continue; }
    if (l.startsWith('COVARIANCE_START')) break;
    if (inMeta || !l || l.startsWith('COMMENT')) continue;
    const f = l.split(/\s+/);
    if (f.length >= 7 && /^\d{4}-\d\d-\d\dT/.test(f[0])) { epochs.push(Date.parse(/Z$/.test(f[0]) ? f[0] : `${f[0]}Z`)); states.push(f.slice(1, 7).map((v) => Number(v) * 1000)); }
  }
  const cov = new Map();  // epoch ms -> lower 6 position block (m^2)
  let axes = null, current = null, values = [];
  for (; i < lines.length; ++i) {
    const l = lines[i].trim();
    if (l.startsWith('EPOCH')) { current = Date.parse(l.split('=')[1].trim().replace(/([^Z])$/, '$1Z')); values = []; continue; }
    if (l.startsWith('COV_REF_FRAME')) { axes = l.split('=')[1].trim(); continue; }
    if (!l || l.startsWith('COVARIANCE') || current === null) continue;
    values.push(...l.split(/\s+/).map(Number));
    if (values.length === 21) { cov.set(current, values.slice(0, 6).map((x) => x * 1e6)); current = null; }
  }
  return { created: created ? Date.parse(/Z$/.test(created) ? created : `${created}Z`) : null, frame, degree, epochs, states, cov, covarianceAxes: axes };
}

// One version as kept in memory: epochs (ms), states (m, m/s), position covariance lower 6 (m^2, RTN/UVW).
function retainStarlink(text) {
  const p = readMeme(text);
  return { frame: p.frame, degree: 5, createdMs: Date.parse(p.created), epochsMs: Float64Array.from(p.epochs.map((e) => Date.parse(e))),
    states: Float64Array.from(p.states.flat()), cov: Float64Array.from(p.covariances.flatMap((c) => c.slice(0, 6).map((x) => x * 1e6))), axes: 'UVW' };
}
function retainPlanet(text) {
  const p = readPlanetOem(text);
  if (p.covarianceAxes !== 'RTN') throw new Error(`Planet covariance axes ${p.covarianceAxes}`);
  const keep = p.epochs.map((e, k) => (p.cov.has(e) ? k : -1)).filter((k) => k >= 0);
  return { frame: p.frame, degree: p.degree, createdMs: p.created, epochsMs: Float64Array.from(keep.map((k) => p.epochs[k])), states: Float64Array.from(keep.flatMap((k) => p.states[k])),
    cov: Float64Array.from(keep.flatMap((k) => p.cov.get(p.epochs[k]))), axes: 'RTN' };
}

// The newer version against every retained older one of the same satellite.
async function arrive(provider, id, norad, name, provenance, kept) {
  const key = `${provider}:${id}`;
  const startMs = kept.epochsMs[0];
  const list = memory.get(key) ?? [];
  if (list.some((v) => v.startMs === startMs)) return;  // the same version again
  const first = { position: Array.from(kept.states.slice(0, 3)), velocity: Array.from(kept.states.slice(3, 6)) };
  const regime = (await callJson('calibrate_covariance', [json('model', unitModel), json('objects', { objects: [{ id: 0, state: first, horizonDays: 0, covariance: [1, 0, 1, 0, 0, 1] }] })])).objects[0].regime;
  const version = { name, startMs, createdMs: kept.createdMs, lastMs: kept.epochsMs[kept.epochsMs.length - 1], kept, sha256: provenance.sha256, regime };
  append(paths.versions, { provider, id, norad, name, regime, start: new Date(startMs).toISOString(), created: kept.createdMs ? new Date(kept.createdMs).toISOString() : null,
    stop: new Date(version.lastMs).toISOString(), states: kept.epochsMs.length, frame: kept.frame, covarianceAxes: kept.axes, ...provenance });
  ++counters[provider].versions;
  const older = list.filter((v) => v.startMs < startMs && v.lastMs >= startMs);
  if (older.length) {
    const pairs = older.map((v) => {
      const e = v.kept.epochsMs;
      let hi = 0;
      while (hi < e.length && e[hi] < startMs) ++hi;
      const from = Math.max(0, Math.min(hi - 3, e.length - 6));
      const samples = [];
      for (let k = from; k < Math.min(e.length, from + 6); ++k)
        samples.push({ epoch: isoMs(e[k]), position: Array.from(v.kept.states.slice(6 * k, 6 * k + 3)), velocity: Array.from(v.kept.states.slice(6 * k + 3, 6 * k + 6)), covariance: Array.from(v.kept.cov.slice(6 * k, 6 * k + 6)) });
      return { id: v.name, predicted: { samples, epoch: isoMs(startMs), interpolationDegree: v.kept.degree, covarianceAxes: 'RTN' },
        truth: { ...first, covariance: Array.from(kept.cov.slice(0, 6)), covarianceAxes: 'RTN' } };
    });
    const out = await callJson('pair_statistics', [json('pairs', { pairs })]);
    out.pairs.forEach((r, k) => {
      const v = older[k];
      append(paths.pairs, { provider, id, norad, regime: v.regime, older: { name: v.name, sha256: v.sha256, start: new Date(v.startMs).toISOString(), created: v.createdMs ? new Date(v.createdMs).toISOString() : null },
        newer: { name, sha256: provenance.sha256, start: new Date(startMs).toISOString(), created: kept.createdMs ? new Date(kept.createdMs).toISOString() : null },
        t0: new Date(v.startMs).toISOString(), t1: new Date(startMs).toISOString(), hoursBetween: (startMs - v.startMs) / 3600000, module: moduleTag.wasmSha256.slice(0, 16), ...r });
      ++counters[provider].pairs;
    });
  }
  list.push(version);
  list.sort((a, b) => a.startMs - b.startMs);
  const keepFrom = Date.now() - S1[provider].retainDays * 86400000;
  memory.set(key, list.filter((v) => v.startMs >= keepFrom || v === version));
}

// ── Starlink ──
async function starlinkLoop() {
  const f = new Fetcher('starlink');
  const base = S1.starlink.baseUrl;
  let etag = null, names = null, sample = null, lastManifest = 0;
  const fetched = new Set();
  while (Date.now() < stopMs && !fs.existsSync(paths.stop) && !f.disabled) {
    if (freeGiB() < S1.minimumFreeGiB) { log('starlink: low disk, pausing 10 min'); await sleep(600000); continue; }
    if (Date.now() - lastManifest >= S1.starlink.manifestPollMinutes * 60000 || !names) {
      const r = await f.get(base + S1.starlink.manifest, etag ? { 'If-None-Match': etag } : {});
      lastManifest = Date.now();
      if (r.status === 200) {
        etag = r.etag;
        names = new Map();
        for (const token of r.bytes.toString('utf8').split(/\s+/)) if (token.startsWith('MEME_')) names.set(Number(token.split('_')[1]), token);
        log(`starlink: manifest ${names.size} satellites`);
      } else if (r.status !== 304) { log(`starlink: manifest ${r.status}`); await sleep(300000); continue; }
    }
    if (!sample) sample = starlinkSample(names);
    const due = sample.filter((n) => names.has(n) && !fetched.has(names.get(n)));
    for (const norad of due) {
      if (Date.now() >= stopMs || fs.existsSync(paths.stop) || f.disabled) break;
      const name = names.get(norad);
      const r = await f.get(base + name);
      fetched.add(name);
      if (r.status === 404) { ++counters.starlink.gone; continue; }
      if (r.status !== 200) { ++counters.starlink.failed; append(paths.failures, { at: new Date().toISOString(), provider: 'starlink', name, status: r.status, error: r.error ?? null }); continue; }
      ++counters.starlink.fetched;
      const provenance = { url: base + name, sha256: sha256(r.bytes), bytes: r.bytes.length, etag: r.etag, lastModified: r.lastModified, retrievedUtc: new Date().toISOString() };
      let kept;
      try { kept = retainStarlink(r.bytes.toString('utf8')); } catch (error) { append(paths.failures, { at: new Date().toISOString(), provider: 'starlink', name, stage: 'parse', error: error.message, sha256: provenance.sha256 }); continue; }
      r.bytes = null;  // the raw file is dropped here
      try { await arrive('starlink', String(norad), norad, name, provenance, kept); } catch (error) { append(paths.failures, { at: new Date().toISOString(), provider: 'starlink', name, stage: 'pair', error: error.message }); }
      status('running');
    }
    await sleep(60000);
  }
  log(`starlink: loop ends (${f.disabled ?? 'stop'})`);
}
function starlinkSample(names) {
  if (fs.existsSync(paths.sample)) return JSON.parse(fs.readFileSync(paths.sample, 'utf8')).norads;
  const exclude = new Set();
  for (const file of S1.starlink.exclude) {
    if (!fs.existsSync(file)) { log(`starlink: exclusion list ${file} missing`); continue; }
    const text = fs.readFileSync(file, 'utf8');
    // E13's sample (JSON: the 324 under `table` or `satellites`; `allClasses` is the whole manifest, not the sample);
    // E11's (text: one NORAD number a line).
    const list = file.endsWith('.json') ? Object.keys((({ table, satellites }) => table ?? satellites ?? {})(JSON.parse(text))) : text.split(/\s+/).filter((t) => /^\d+$/.test(t));
    for (const n of list) exclude.add(Number(n));
  }
  const pool = [...names.keys()].filter((n) => !exclude.has(n)).sort((a, b) => a - b);
  const random = rng(S1.starlink.sampleSeed);
  for (let i = pool.length - 1; i > 0; --i) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const norads = pool.slice(0, S1.starlink.sampleSize).sort((a, b) => a - b);
  fs.writeFileSync(paths.sample, `${JSON.stringify({ seed: S1.starlink.sampleSeed, drawnUtc: new Date().toISOString(), manifestSatellites: names.size, excluded: exclude.size, norads }, null, 1)}\n`);
  log(`starlink: sample of ${norads.length} from ${pool.length} (excluded ${exclude.size})`);
  return norads;
}

// ── Planet ──
async function planetLoop() {
  const f = new Fetcher('planet');
  const base = S1.planet.baseUrl;
  let hwids = null, crosswalkAt = 0;
  const etags = new Map();
  while (Date.now() < stopMs && !fs.existsSync(paths.stop) && !f.disabled) {
    if (freeGiB() < S1.minimumFreeGiB) { log('planet: low disk, pausing 10 min'); await sleep(600000); continue; }
    const sweepStart = Date.now();
    if (!hwids || Date.now() - crosswalkAt > 86400000) {
      const r = await f.get(base + S1.planet.crosswalk);
      crosswalkAt = Date.now();
      if (r.status === 200) {
        hwids = new Map();
        const lines = r.bytes.toString('utf8').split(/\r?\n/);
        for (let i = 0; i + 1 < lines.length; ++i) if (lines[i].startsWith('0 ') && lines[i + 1].startsWith('1 ')) hwids.set(lines[i].trim().split(/\s+/).at(-1).toLowerCase(), Number(lines[i + 1].slice(2, 7)));
        log(`planet: crosswalk ${hwids.size} satellites`);
      } else if (!hwids) { log(`planet: crosswalk ${r.status}`); await sleep(600000); continue; }
    }
    for (const [hwid, norad] of hwids) {
      if (Date.now() >= stopMs || fs.existsSync(paths.stop) || f.disabled) break;
      const url = `${base}${hwid}_oem.txt`;
      const prior = etags.get(hwid);
      const r = await f.get(url, prior ? { 'If-None-Match': prior } : {});
      if (r.status === 304) { ++counters.planet.notModified; continue; }
      if (r.status === 404) { ++counters.planet.gone; continue; }
      if (r.status !== 200) { ++counters.planet.failed; append(paths.failures, { at: new Date().toISOString(), provider: 'planet', hwid, status: r.status, error: r.error ?? null }); continue; }
      ++counters.planet.fetched;
      etags.set(hwid, r.etag);
      const provenance = { url, sha256: sha256(r.bytes), bytes: r.bytes.length, etag: r.etag, lastModified: r.lastModified, retrievedUtc: new Date().toISOString() };
      let kept;
      try { kept = retainPlanet(r.bytes.toString('utf8')); } catch (error) { append(paths.failures, { at: new Date().toISOString(), provider: 'planet', hwid, stage: 'parse', error: error.message, sha256: provenance.sha256 }); continue; }
      r.bytes = null;  // the raw file is dropped here
      try { await arrive('planet', hwid, norad, `${hwid}_oem.txt@${new Date(kept.epochsMs[0]).toISOString()}`, provenance, kept); } catch (error) { append(paths.failures, { at: new Date().toISOString(), provider: 'planet', hwid, stage: 'pair', error: error.message }); }
      status('running');
    }
    const wait = S1.planet.pollHours * 3600000 - (Date.now() - sweepStart);
    for (let w = 0; w < wait && Date.now() < stopMs && !fs.existsSync(paths.stop); w += 60000) await sleep(Math.min(60000, wait - w));
  }
  log(`planet: loop ends (${f.disabled ?? 'stop'})`);
}

log(`collector starts: providers ${[...providers].join(', ')}, until ${new Date(stopMs).toISOString()}, gp-error-model ${moduleTag.version} ${moduleTag.wasmSha256.slice(0, 16)}`);
status('starting');
const timer = setInterval(() => status('running'), 60000);
process.on('SIGTERM', () => { status('stopped (SIGTERM)'); process.exit(0); });
await Promise.all([providers.has('starlink') ? starlinkLoop() : null, providers.has('planet') ? planetLoop() : null]);
clearInterval(timer);
status('finished');
log('collector finished');
