#!/usr/bin/env node
// The all-SupGP OMM pass.
//
//   node experiments/supgp-omm/run.mjs [--groups starlink,iss,...] [--limit N] [--workers 6] [--closure]
//        [--out DIR] [--supgp DIR] [--fit-modules DIR] [--reader-modules DIR] [--registry DIR] [--run-id ID] [--no-persist]
//
// For every CelesTrak SupGP set of a group: fetch the operator's ephemeris in memory (polite HTTP),
// read it with the module readers (WASM), score CelesTrak's set on CelesTrak's window and apply the
// rms gate, fit our OMM (SGP4, B* fitted, gp-error-model fit_elements) to the same points, and write
// derived records only. The raw operator bytes are never written anywhere.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WORKERS, FIT, GATE, HTTP, MAX_WORKERS, MEME, PATHS } from './config.mjs';
import { PoliteHttp } from './lib/http.mjs';
import { readSnapshot } from './lib/supgp.mjs';
import { artifactInfo, checkout, loadFitter, loadReader } from './lib/modules.mjs';
import { Pool } from './lib/pool.mjs';
import { Store, verifyStore } from './lib/persist.mjs';
import { decodeOmmStream } from './lib/records.mjs';
import { Timing, failGroup, runGroup } from './lib/pass.mjs';
import { summarize } from './lib/summary.mjs';
import { knownAnswers } from './known-answer.mjs';
import { sources } from './sources/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

function args() {
  const a = { groups: null, limit: 0, workers: DEFAULT_WORKERS, closure: false, out: PATHS.derived, supgp: PATHS.supgp, fitModules: PATHS.fitModules, readerModules: PATHS.readerModules,
    registry: null, runId: null, persist: true, rowsInFlight: null, preflight: true, progressEvery: 500 };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; ++i) {
    const k = v[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (['closure'].includes(k)) a[k] = true;
    else if (k === 'noPersist') a.persist = false;
    else if (k === 'noPreflight') a.preflight = false;
    else a[k] = v[++i];
  }
  for (const k of ['limit', 'workers', 'rowsInFlight', 'progressEvery']) if (a[k] !== null) a[k] = Number(a[k]);
  a.groups = a.groups ? String(a.groups).split(',') : Object.keys(sources);
  a.rowsInFlight ??= a.workers * 4;
  a.registry ??= path.join(a.out, 'registry');
  a.runId ??= `supgp-omm-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
  a.maxGuardViolations = 5;
  return a;
}

// The newest archived IERS finals2000A (our own archive of space weather and Earth orientation).
function eopFile() {
  const latest = JSON.parse(fs.readFileSync(path.join(PATHS.eop, 'iers-eop/latest.json'), 'utf8'));
  return path.join(PATHS.eop, latest.files['finals.all.iau2000.txt'].path);
}

const a = args();
const wallStart = Date.now();
const logLines = [];
const log = (m) => { const line = `${new Date().toISOString()} ${m}`; logLines.push(line); console.log(line); };

async function main() {
  if (a.workers < 1 || a.workers > MAX_WORKERS) throw new Error(`--workers must be 1..${MAX_WORKERS}`);
  const store = new Store({ root: a.out, runId: a.runId, persist: a.persist });
  const http = new PoliteHttp({ log });
  const fitter = await loadFitter(a.fitModules);
  const run = {
    runId: a.runId, startedUtc: new Date(wallStart).toISOString(), node: process.version, platform: `${os.platform()} ${os.arch()}`, cpus: os.availableParallelism(), loadavgAtStart: os.loadavg()[0],
    settings: { gate: GATE, fit: FIT, http: HTTP, meme: MEME, workers: a.workers, closure: a.closure, rowsInFlight: a.rowsInFlight, limit: a.limit || null, groups: a.groups },
    checkouts: { experiments: checkout(REPO), fitModules: checkout(a.fitModules), readerModules: checkout(a.readerModules) },
    fitter: fitter.provenance,
    readerArtifacts: [artifactInfo(a.readerModules, 'files/orbit-products'), { path: 'data-source/spacex-starlink-source/dist/isomorphic/module.wasm' }],
    snapshots: {}, knownAnswers: null, groups: {}, timing: {},
  };

  // 1. Known answers, before any real data.
  log('known answers');
  run.knownAnswers = await knownAnswers(fitter, { fitModules: a.fitModules });
  for (const r of run.knownAnswers) log(`  ${r.ok === null ? 'SKIP' : 'ok  '} ${r.name}`);
  await fitter.destroy();

  // 2. The pool.
  const pool = new Pool({ size: a.workers, workerData: { fitModules: a.fitModules, readerModules: a.readerModules, sourceIds: a.groups.filter((g) => sources[g] && !sources[g].unavailable), eopFile: eopFile() }, log });
  await pool.ready;
  log(`${a.workers} workers ready`);

  const timing = new Timing();
  const allRows = {};
  let failed = false;
  for (const group of a.groups) {
    const source = sources[group];
    if (!source) { log(`${group}: no source in this pass`); continue; }
    const snapshot = readSnapshot(group, { root: a.supgp });
    run.snapshots[group] = { stamp: snapshot.stamp, fetchedUtc: snapshot.fetchedUtc, sha256: snapshot.sha256, url: snapshot.url, rmsFile: snapshot.rmsFile, sets: snapshot.rows.length };
    log(`${group}: snapshot ${snapshot.stamp} (${snapshot.rows.length} sets, fetched ${snapshot.fetchedUtc})`);
    const t0 = Date.now();
    let ctx = null;
    let rows;
    if (source.unavailable) {
      const detail = await source.probe({ http, snapshot }).catch((e) => `probe failed: ${e.message}`);
      rows = failGroup({ group, snapshot, store, options: a, code: source.code, detail: String(detail).slice(0, 1200) });
      run.groups[group] = { ...summarize(group, snapshot, rows), reason: { code: source.code, detail } };
      store.writeJson(`${group}/summary.json`, run.groups[group]);
      log(`${group}: ${source.code}: ${String(detail).slice(0, 240)}`);
      continue;
    }
    try {
      ctx = await source.prepare?.({ http, log, registryDir: a.registry, snapshot, loadReader: (rel) => loadReader(rel, a.readerModules) });
      rows = await runGroup({ group, snapshot, source, http, pool, store, ctx, options: a, log, timing });
    } catch (e) {
      log(`${group}: source not available: ${e.message}`);
      rows = failGroup({ group, snapshot, store, options: a, code: 'source-unreachable', detail: String(e.message ?? e).slice(0, 300) });
    }
    const summary = summarize(group, snapshot, rows);
    summary.wallSeconds = (Date.now() - t0) / 1000;
    summary.window = { hours: source.hours };
    store.writeJson(`${group}/summary.json`, summary);
    run.groups[group] = summary;
    allRows[group] = rows;
    log(`${group}: paired ${summary.paired}/${summary.objects}, ours lower ${summary.oursLower}/${summary.fitted}, median diff ${summary.diffM.median?.toFixed(2)} m, max ${summary.diffM.max?.toFixed(2)} m, ${summary.wallSeconds.toFixed(0)} s; unpaired ${JSON.stringify(summary.unpaired)}`);
    if (summary.guardViolations) { failed = true; log(`${group}: ${summary.guardViolations} GUARD VIOLATIONS`); }
    if (group === 'iss' && a.preflight && summary.paired / summary.objects < 0.9) { log('preflight: the ISS gate (the calibration group) passed on fewer than 90 % of its sets; stopping'); failed = true; break; }
  }

  const wall = (Date.now() - wallStart) / 1000;
  run.finishedUtc = new Date().toISOString();
  run.timing = {
    wallSeconds: wall, ...timing.json(), poolJobs: pool.jobs, workers: a.workers,
    hosts: Object.fromEntries([...http.stats].map(([h, s]) => [h, s])), disabledHosts: Object.fromEntries(http.disabled),
  };
  if (a.persist) {
    run.persistence = verifyStore(store.dir, decodeOmmStream);
    log(`persistence: ${run.persistence.rows} rows, ${run.persistence.omms} OMMs read back, ${run.persistence.mismatches.length} mismatches`);
    if (run.persistence.mismatches.length) failed = true;
  }
  run.log = logLines.slice(-400);
  store.writeJson('run.json', run);
  await pool.close();
  log(`done in ${(wall / 60).toFixed(1)} min; run ${a.runId}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e.stack ?? e); process.exitCode = 2; }).finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 100));
