#!/usr/bin/env node
// E15's daily runner (PLAN.md sections 3-5). Run once a day after the issue time (04:10 UTC); it lives until that day's
// live truth is scored (at most --hours), then scores every earlier target day whose published products have appeared.
//
//   node experiments/e15-aoe-lineage/daily.mjs [--target YYYY-MM-DD] [--sources starlink,planet,css,iss,geo,gnss-esa,gnss-gfz]
//        [--hours 14] [--no-backfill] [--no-wait]
//
// For target day X (target time t = X 04:00 UTC) it serves the issues X - h (h = 0, 1, 3, 7) that lie in the train or test
// window: at each issue time T, AOE-latest and ST-latest (lib/aoe.mjs, lib/st.mjs), each propagated by SGP4 to the first
// reference state in [t, t + 15 min] (lib/score.mjs). Operator files (Starlink, Planet, CMSE, NASA, Intelsat, SES) are read
// in memory while they can be read; the AOE snapshot of day X and Space-Track's creations through T are waited for.
// Residual rows go to the store (settings PATHS.rows, never committed); the runner prints counts, never a statistic of the
// test window.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { execFile } from 'node:child_process';
import { loadModule } from '../../harness/modules.mjs';
import { startRun } from '../../harness/provenance.mjs';
import { COMPUTE, PATHS } from './settings.mjs';
import { config, configPath, issueMs, issuesForTarget, isoDay, shiftDay, targetDays } from './lib/windows.mjs';
import { AoeCatalog, snapshotDays } from './lib/aoe.mjs';
import { StCatalog, stReachesMs } from './lib/st.mjs';
import { SupgpCatalog } from './lib/supgp.mjs';
import { scoreItems } from './lib/score.mjs';
import { coverageOf, haveRows, writeCoverage, writeRows } from './lib/rows.mjs';
import { Http, Readers, isoZ } from './lib/truth/common.mjs';
import * as starlink from './lib/truth/starlink.mjs';
import * as planet from './lib/truth/planet.mjs';
import { cssTruth, geoTruth, issTruth } from './lib/truth/operators.mjs';
import { gnssEsa, gnssGfz } from './lib/truth/gnss.mjs';
import { spire } from './lib/truth/spire.mjs';
import { podTruth, slrTruth } from './lib/truth/products.mjs';

const SOURCES = { starlink, planet, css: cssTruth, iss: issTruth, geo: geoTruth, 'gnss-esa': gnssEsa, 'gnss-gfz': gnssGfz, spire, pod: podTruth, slr: slrTruth };
const { values } = parseArgs({ options: { target: { type: 'string' }, sources: { type: 'string' }, hours: { type: 'string', default: '14' }, 'no-backfill': { type: 'boolean' }, 'no-wait': { type: 'boolean' }, 'no-products': { type: 'boolean' } } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
const today = values.target ?? isoDay(started);
const deadline = issueMs(today) + Number(values.hours) * 3600e3;
const wanted = values.sources ? values.sources.split(',') : Object.keys(SOURCES);
for (const s of wanted) if (!SOURCES[s]) throw new Error(`unknown source ${s}; one of ${Object.keys(SOURCES).join(', ')}`);

fs.mkdirSync(path.join(PATHS.store, 'logs'), { recursive: true });
const logFile = fs.createWriteStream(path.join(PATHS.store, 'logs', `daily-${today}.log`), { flags: 'a' });
const log = (m) => { const line = `${new Date().toISOString().slice(0, 19)}Z ${m}`; logFile.write(`${line}\n`); console.log(line); };

const run = startRun({ experiment: config.experiment, step: `daily-${today}`, configPath, modulesDir: PATHS.scoreModules, args: values });
const http = new Http(log);
const readers = new Readers(run);
const scorer = await loadModule(PATHS.scoreModules, 'analysis/gp-error-model');
run.addModule(scorer.provenance);
log(`run ${run.id}: target day ${today}, sources ${wanted.join(', ')}, until ${isoZ(deadline)}`);

// The coordinator's limits: no new work while the 1-minute load is above 45 or the disk is below 15 GiB.
async function gate() {
  for (;;) {
    const load = os.loadavg()[0];
    const free = fs.statfsSync(PATHS.store).bavail * fs.statfsSync(PATHS.store).bsize / 2 ** 30;
    if (load <= COMPUTE.pauseAboveLoad1m && free >= COMPUTE.minFreeGiB) return;
    log(`paused: load ${load.toFixed(1)}, free ${free.toFixed(0)} GiB`);
    await sleep(COMPUTE.pauseMs);
  }
}

// The Starlink names registry is kept current while the runner lives (every 30 min).
let lastPoll = 0;
async function pollStarlink() {
  if (!wanted.includes('starlink') || Date.now() - lastPoll < 30 * 60e3) return;
  lastPoll = Date.now();
  try { await starlink.pollManifest(http, log); } catch (e) { log(`starlink manifest: ${e.message}`); }
}

// Scores the items of one truth source for target day X and writes the rows.
async function scoreTarget(X, source, got, aoe, st, supgp) {
  const t = issueMs(X);
  const issues = issuesForTarget(X);
  const items = [];
  const counts = { objects: got.items.length, missingTruth: 0, notInBoth: 0, scoredObjects: 0, byIssue: {}, truthObjects: [], inAoe: [], inSt: [], inBoth: [] };
  for (const it of got.items) {
    if (it.missing) { ++counts.missingTruth; continue; }
    // Catalog membership of the truth objects (PLAN.md section 6, coverage): an AOE number, Space-Track sets in the window.
    counts.truthObjects.push(it.norad);
    if (aoe.byNorad.has(it.norad)) counts.inAoe.push(it.norad);
    if (st.byNorad.has(it.norad)) counts.inSt.push(it.norad);
    if (aoe.byNorad.has(it.norad) && st.byNorad.has(it.norad)) counts.inBoth.push(it.norad);
    const targets = [];
    for (const { h, issue, window } of issues) {
      const T = issueMs(issue);
      const sets = { 'AOE-latest': aoe.latest(it.norad, T), 'ST-latest': st.latest(it.norad, T), 'SupGP-latest': supgp?.latest(it.norad, T) ?? null };
      const k = counts.byIssue[`${issue}|${h}`] ??= { AOE: 0, ST: 0, both: 0, aoeNotRetrievedByT: 0, SupGP: 0 };
      if (sets['AOE-latest']) { ++k.AOE; if (!aoe.retrievedBy(sets['AOE-latest'], T)) ++k.aoeNotRetrievedByT; }
      if (sets['ST-latest']) ++k.ST;
      if (sets['AOE-latest'] && sets['ST-latest']) ++k.both;
      if (sets['AOE-latest'] || sets['ST-latest']) targets.push({ issue, h, window, T, targetMs: t, sets });
      if (sets['SupGP-latest']) ++k.SupGP;
    }
    // Scored objects are in both catalogs (an AOE number and Space-Track sets in the window).
    if (!aoe.byNorad.has(it.norad) || !st.byNorad.has(it.norad)) { ++counts.notInBoth; continue; }
    if (!targets.length) continue;
    ++counts.scoredObjects;
    items.push({ ...it, targets });
  }
  await gate();
  const { rows, counts: sc } = await scoreItems(scorer, items, { log });
  const files = rows.length ? writeRows(X, source.id, rows) : [];
  writeCoverage(X, source.id, { targetDay: X, targetUtc: isoZ(t), source: source.id, regime: source.regime, run: run.id, truth: got.coverage, counts, scoring: sc, rows: rows.length, failures: rows.filter((r) => r.failure).length, files: files.map((f) => path.relative(PATHS.rows, f)) });
  log(`${source.id} ${X}: ${rows.length} rows (${rows.filter((r) => r.failure).length} without a sample) for ${counts.scoredObjects} objects; ${counts.missingTruth} without truth, ${counts.notInBoth} not in both catalogs`);
  run.addInputs(`truth:${source.id}:${X}`, Object.fromEntries(got.items.filter((x) => x.truth?.sha256).map((x) => [`${x.norad}:${x.truth.version}`, x.truth.sha256])));
  return rows.length;
}

// LEO-POD and SLR products published since the last run, converted by the modules' own script (analysis/reference-states
// scripts/fetch-reference-products.mjs, read-only checkout) into the store: Swarm, Sentinel-1 POEORB, ILRS and NSGF SLR arcs
// (public servers), GRACE-FO rapid science orbits and DORIS orbits (local copies with provenance). Earth orientation is
// finals2000A's observed rows, refreshed each run. --from stays on NSGF's 4-day arc grid.
async function convertProducts() {
  const script = path.join(PATHS.readerModules, 'analysis/reference-states/scripts/fetch-reference-products.mjs');
  const to = shiftDay(today, -1);
  fs.rmSync(path.join(PATHS.store, 'products', 'finals2000A.all'), { force: true });
  const args = [script, '--from', '2026-10-08', '--to', to, '--products', 'swarm,slr-daily,slr,sentinel1,gfz-rso,doris', '--eop', 'finals', '--out', PATHS.store, '--local-archive', '/opt/data/sdn-archive/hac'];
  log(`products: converting LEO-POD and SLR products to ${to}`);
  await new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: path.dirname(script), timeout: 3600e3, maxBuffer: 64 << 20 }, (error, stdout, stderr) => {
      const lines = `${stdout}\n${stderr}`.split('\n').filter((l) => l.trim());
      logFile.write(lines.map((l) => `  products| ${l}\n`).join(''));
      log(`products: ${error ? `stopped (${String(error.message).split('\n')[0].slice(0, 160)})` : 'done'}, ${lines.length} lines of output`);
      resolve();
    });
  });
}

// The issues the target days serve, first and last.
function issueSpan(days) {
  const issues = days.flatMap((X) => issuesForTarget(X).map((x) => x.issue)).sort();
  return issues.length ? [issues[0], issues.at(-1)] : null;
}
// AOE sets of every snapshot that can serve those issues (an object keeps its set until AOE writes a new one).
function aoeCatalog(days) {
  const [from, to] = issueSpan(days);
  const aoe = new AoeCatalog(shiftDay(from, -10), to);
  run.addInputs('aoe', Object.fromEntries(aoe.snapshots.map((s) => [`${s.day}/records.jsonl`, s.sha256.records])));
  log(`AOE snapshots ${aoe.snapshots.map((s) => s.day).join(', ') || 'none'}: ${aoe.byNorad.size} objects`);
  return aoe;
}
// CelesTrak SupGP from the collector archive, beside both (descriptive).
function supgpCatalog(days) {
  const [from, to] = issueSpan(days);
  const supgp = new SupgpCatalog(from, to);
  run.addInputs('supgp', Object.fromEntries(supgp.snapshots.filter((s) => s.sha256).map((s) => [`${s.group}/${s.stamp}.json`, s.sha256])));
  return supgp;
}
// Space-Track sets of the objects given (the truth objects and the regime's population), as E3 reads them.
function stCatalog(days, norads) {
  const [from, to] = issueSpan(days);
  const st = new StCatalog(from, to, { keep: (n) => norads.has(n) });
  run.addInputs('gpHistory', st.files);
  log(`Space-Track: ${st.count} sets of ${st.byNorad.size} of ${norads.size} objects, ${st.duplicates} republished duplicates merged`);
  return st;
}

const summary = { target: today, live: {}, backfill: {} };
try {
  // ── Live truth for today's target ──
  const liveIssues = issuesForTarget(today);
  const liveSources = wanted.filter((s) => SOURCES[s].live);
  if (liveIssues.length && liveSources.length) {
    const t = issueMs(today);
    await pollStarlink();
    // Files replaced in place are read now and held in memory until the catalogs are ready.
    const held = {};
    for (const s of liveSources.filter((x) => x !== 'starlink')) {
      if (haveRows(today, s)) { log(`${s} ${today}: rows exist`); continue; }
      await gate();
      try { held[s] = await SOURCES[s].acquire({ http, readers, run, log, targetMs: t }); } catch (e) { log(`${s} ${today}: ${e.message}`); summary.live[s] = { error: e.message }; }
    }
    // Wait for the AOE snapshot of the day (h = 0), Space-Track's creations through T, and the Starlink sweep around t.
    const needAoe = liveIssues.some((x) => x.h === 0);
    for (;;) {
      await pollStarlink();
      const aoeReady = !needAoe || snapshotDays().includes(today);
      const stReady = stReachesMs() >= t;
      const reg = wanted.includes('starlink') ? starlink.registry() : null;
      const sweepReady = !reg || [...reg.byNorad.values()].some((m) => [...m.values()].some((v) => v.startMs > t));
      if (aoeReady && stReady && sweepReady) break;
      if (values['no-wait'] || Date.now() > deadline) { log(`stopped waiting: AOE ${aoeReady}, Space-Track ${stReady}, Starlink sweep ${sweepReady}`); summary.waitedOut = { aoeReady, stReady, sweepReady }; break; }
      log(`waiting: AOE snapshot ${aoeReady}, Space-Track through T ${stReady}, Starlink sweep listed ${sweepReady}`);
      await sleep(10 * 60e3);
    }
    const aoe = aoeCatalog([today]);
    summary.aoe = aoe.describe().map((s) => ({ day: s.day, complete: s.run.complete, records: s.counts.records, aoeOnly: s.counts.aoeOnly, rejected: s.counts.rejected, retrieval: s.retrieval }));
    const listed = wanted.includes('starlink') ? [...starlink.registry().byNorad.keys()] : [];
    if (liveSources.includes('starlink') && !haveRows(today, 'starlink')) {
      await gate();
      // Truth is fetched for the satellites AOE carries; scoring keeps those Space-Track also carries.
      try { held.starlink = await starlink.acquire({ http, readers, log, targetMs: t, wanted: new Set(listed.filter((n) => aoe.byNorad.has(n))) }); } catch (e) { log(`starlink ${today}: ${e.message}`); summary.live.starlink = { error: e.message }; }
    }
    const st = stCatalog([today], new Set([...listed, ...Object.values(held).flatMap((got) => got.items.map((x) => x.norad))]));
    if (held.starlink) held.starlink.coverage.population = { listed: listed.length, inAoe: listed.filter((n) => aoe.byNorad.has(n)).length, inSt: listed.filter((n) => st.byNorad.has(n)).length, inBoth: listed.filter((n) => aoe.byNorad.has(n) && st.byNorad.has(n)).length };
    const supgp = supgpCatalog([today]);
    for (const [s, got] of Object.entries(held)) summary.live[s] = { rows: await scoreTarget(today, SOURCES[s], got, aoe, st, supgp), truth: got.coverage.items };
  }

  // ── Published products for earlier target days ──
  if (!values['no-backfill']) {
    if (!values['no-products'] && (wanted.includes('pod') || wanted.includes('slr'))) { await gate(); await convertProducts(); }
    const stored = wanted.filter((s) => !SOURCES[s].live);
    // Every target day whose target time has passed (a product not yet published answers `ready: false`).
    const days = targetDays().filter((X) => X <= today && issueMs(X) < Date.now());
    // A stored source is done once scored, except the reference products, which grow as products are published.
    const todo = days.flatMap((X) => stored.filter((s) => SOURCES[s].growing || !haveRows(X, s)).map((s) => ({ X, s })));
    if (todo.length) {
      const aoe = aoeCatalog([...new Set(todo.map((x) => x.X))]);
      const supgp = supgpCatalog([...new Set(todo.map((x) => x.X))]);
      for (const { X, s } of todo) {
        await gate();
        let got;
        try { got = await SOURCES[s].acquire({ http, readers, run, log, targetMs: issueMs(X) }); } catch (e) { log(`${s} ${X}: ${e.message}`); continue; }
        if (got.ready === false) { log(`${s} ${X}: products not yet published`); continue; }
        if (got.growing && (coverageOf(X, s)?.truth?.items ?? -1) >= got.coverage.items) continue;
        const st = stCatalog([X], new Set(got.items.map((x) => x.norad)));
        summary.backfill[`${s}:${X}`] = { rows: await scoreTarget(X, SOURCES[s], got, aoe, st, supgp), truth: got.coverage.items };
      }
    }
  }
} finally {
  run.write('summary.json', summary);
  run.finish({ http: http.stats(), wallSeconds: (Date.now() - started) / 1000 });
  await readers.destroy();
  await scorer.destroy();
  log(`done in ${((Date.now() - started) / 60e3).toFixed(1)} min: ${JSON.stringify(summary.live)} ${JSON.stringify(summary.backfill)}`);
  logFile.end();
}
