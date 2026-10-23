// Step 2: the FFM-Starlink truth set and the Starlink baselines, one satellite per task.
//   node experiments/sdn-gp-starlink-ffm-match/truth.mjs [--workers N] [--limit N] [--only 45419,48127] [--no-fetch]
// Per satellite: the MEME text (the same-day local capture when present, else the SpaceX file fetched into memory,
// never written) -> analysis/od `fit_ffm` over [start, start+48 h) -> FFM-1 from the fitted state and B_eff for 96 h at
// 60 s (the truth) -> SGP4 and SGP4-XP on 24 h fits of that truth -> the same two on SpaceX's own states
// (24 h fit, day 1 inside the forecast, strictly before the 48 h join). Local outputs under <store>:
// truth/<norad>.json + .f64 (the derived FFM trajectory), rows/starlink/<norad>.json (statistics only).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, frozen, store, write, read, sha256, iso, freeGiB } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { loadEnvironment, operatorFit, propagate } from './lib/ffm.mjs';
import { parseMeme, memeHeader } from './lib/sources.mjs';
import { withT, ms } from './lib/windows.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const STARLINK_ROOT = 'https://api.starlink.com/public-files/ephemerides';
const DAILY = path.join(config.archive, 'operator-ephemerides/daily/2026-10-23/starlink');
const rowsDir = path.join(store, 'rows/starlink');
const truthDir = path.join(store, 'truth');
const claimDir = path.join(store, 'claims');
const MIN_FREE_GIB = 25; // stack disk guard

// ---- task order: the same-day local files first, then the registered seats round-robin over strata ----
function tasks() {
  const { queue } = read(path.join(store, 'population-queue.json'));
  const byCell = new Map();
  for (const q of queue) { const k = `${q.stratum}/${q.tercile}`; (byCell.get(k) ?? byCell.set(k, []).get(k)).push(q); }
  const local = fs.existsSync(DAILY) ? fs.readdirSync(DAILY).filter((f) => f.endsWith('.txt.gz')).map((f) => Number(f.replace('.txt.gz', ''))).sort((a, b) => a - b) : [];
  const info = new Map(queue.map((q) => [q.norad, q]));
  const out = local.map((norad) => ({ norad, population: 'daily', stratum: info.get(norad)?.stratum ?? null, tercile: info.get(norad)?.tercile ?? null, replacements: [] }));
  const seen = new Set(local);
  for (let round = 0; ; round += 1) {
    let any = false;
    for (const cell of [...byCell.keys()].sort()) {
      const seats = byCell.get(cell).filter((q) => q.seat);
      const q = seats[round];
      if (!q) continue;
      any = true;
      if (seen.has(q.norad)) continue;
      seen.add(q.norad);
      const spare = byCell.get(cell).filter((m) => !m.seat && !seen.has(m.norad)).slice(0, 2).map((m) => m.norad);
      out.push({ norad: q.norad, population: 'seat', stratum: q.stratum, tercile: q.tercile, replacements: spare });
    }
    if (!any) break;
  }
  return out;
}

// ---- the MEME text of one satellite, in memory ----
let manifestCache = null;
async function polite(url) {
  const lock = path.join(store, 'fetch.lock');
  for (;;) {
    let last = 0;
    try { last = fs.statSync(lock).mtimeMs; } catch { /* first request */ }
    const wait = last + config.fit.requestSpacingSeconds * 1000 - Date.now();
    if (wait <= 0) break;
    await sleep(wait + Math.random() * 400);
  }
  fs.writeFileSync(lock, String(Date.now()));
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (response.status === 403 || response.status === 429) throw new Error(`HTTP ${response.status} from ${new URL(url).host}: stop`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function memeOf(norad) {
  const local = path.join(DAILY, `${norad}.txt.gz`);
  if (fs.existsSync(local)) return { bytes: zlib.gunzipSync(fs.readFileSync(local)), name: `MEME_${norad}_local.txt`, origin: 'daily-capture-2026-10-23' };
  if (args['no-fetch']) throw new Error('not in the local capture and fetching is off');
  manifestCache ??= (await polite(`${STARLINK_ROOT}/MANIFEST.txt`)).toString('utf8').split('\n').filter(Boolean);
  const file = manifestCache.find((f) => f.startsWith(`MEME_${norad}_`));
  if (!file) throw new Error('not in the SpaceX manifest');
  return { bytes: await polite(`${STARLINK_ROOT}/${file}`), name: file, origin: 'spacex-fetch' };
}

// ---- one satellite ----
async function satellite(task, context, baselines, modules) {
  const { norad } = task;
  const meme = await memeOf(norad);
  const text = meme.bytes.toString('utf8');
  const header = memeHeader(text);
  if (!header.start) throw new Error('no ephemeris_start in the MEME header');
  const states = parseMeme(text);
  const fit = await operatorFit(modules, context, { memeBytes: meme.bytes, name: meme.name, norad, epoch: header.start, fit: config.fit });
  if (!fit.ok) throw new Error(`fit_ffm: ${fit.error}`);
  const longest = fit.segments.map((s) => ({ ...s, used: s.record.ORBIT_DETERMINATION.OD_OBSERVATIONS_USED })).sort((a, b) => b.used - a.used)[0];
  if (!longest || longest.used * config.fit.sampleSeconds < config.fit.minimumSegmentHours * 3600) throw new Error(`no fitted segment of ${config.fit.minimumSegmentHours} h (${fit.segments.length} segments, ${fit.events} events)`);
  const u = longest.user;
  const segmentEpoch = longest.record.METADATA.EPOCH_TZERO;
  const bEff = Number(u.B_EFF_M2_KG);
  const crAm = norad < 56000 ? config.fit.srpAreaOverMass.before56000 : config.fit.srpAreaOverMass.from56000;
  const t0 = ms(segmentEpoch);
  const epochs = Array.from({ length: (config.truth.hours * 3600) / config.truth.cadenceSeconds + 1 }, (_, i) => t0 + i * config.truth.cadenceSeconds * 1000);
  const ffm = await propagate(modules, context, { epoch: new Date(t0).toISOString(), state: longest.record.STATE_DATA.map((x) => x * 1000), cdAm: bEff, crAm, epochs, integrator: config.truth.integrator });
  // the truth trajectory, derived, local: km and km/s
  const flat = new Float64Array(ffm.samples.length * 6);
  ffm.samples.forEach((s, i) => s.state.forEach((x, j) => { flat[i * 6 + j] = x / 1000; }));
  fs.mkdirSync(truthDir, { recursive: true });
  fs.writeFileSync(path.join(truthDir, `${norad}.f64`), Buffer.from(flat.buffer));
  const truthObject = withT({
    source: 'starlink-ffm', id: `STARLINK (${norad})`, norad, name: `STARLINK-${norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
    lines: ffm.samples.map((s, i) => ({ epoch: new Date(s.ms).toISOString(), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })),
  });
  const ffmRow = await scoreWindow(baselines, truthObject, t0, { fitSeconds: config.windows.fitHours * 3600, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage });
  // SpaceX's own states inside its forecast: fit 24 h, day 1 strictly before the 48 h join
  const startMs = ms(header.start);
  const inSpan = states.filter((s) => ms(s.epoch) < startMs + 48 * 3600e3 - 1000);
  const spacexObject = withT({ source: 'starlink-spacex', id: `STARLINK (${norad})`, norad, name: `STARLINK-${norad}`, objectId: '', originator: 'SpaceX', creation: header.created ?? '', frame: 'EME2000', timeSystem: 'UTC', lines: inSpan });
  const spacexRow = inSpan.length > 100 ? await scoreWindow(baselines, spacexObject, ms(inSpan[0].epoch), { fitSeconds: config.windows.fitHours * 3600, leadDays: config.windows.spacexInSpanLeadDays, minCoverage: config.windows.minimumCoverage }) : null;
  const meta = {
    norad, population: task.population, stratum: task.stratum, tercile: task.tercile, origin: meme.origin, memeSha256: sha256(meme.bytes), memeStartUtc: header.start, memeCreatedUtc: header.created,
    fit: { segments: fit.segments.length, events: fit.events, usedSamples: longest.used, rmsKm: Number(u.FIT_RMS_KM), maxKm: Number(u.FIT_MAXIMUM_KM), iterations: Number(u.FIT_ITERATIONS), convergence: longest.record.ORBIT_DETERMINATION.OD_CONVERGENCE_CRITERIA,
      bEffM2Kg: bEff, bEffAtZeroBound: bEff === 0, kappaGivenPrior: u.KAPPA_GIVEN_B_PRIOR ?? null, crAm, cpuSeconds: fit.cpuSeconds, wallSeconds: fit.wallSeconds },
    truth: { epochUtc: new Date(t0).toISOString(), hours: config.truth.hours, cadenceSeconds: config.truth.cadenceSeconds, file: `truth/${norad}.f64`, sha256: sha256(Buffer.from(flat.buffer)), stateGcrfKm: longest.record.STATE_DATA, densityCorrection: config.truth.densityCorrection, ffmCpuSeconds: ffm.cpuSeconds },
    modules: { odWasmSha256: fit.wasmSha256, ffmWasmSha256: ffm.wasmSha256, environmentSha256: context.provenance.environmentSha256 },
    ffm: ffmRow, spacex: spacexRow,
  };
  write(path.join(truthDir, `${norad}.json`), meta);
  write(path.join(rowsDir, `${norad}.json`), { norad, population: task.population, stratum: task.stratum, tercile: task.tercile, fit: meta.fit, ffm: ffmRow, spacex: spacexRow });
}

async function worker(id) {
  frozen();
  const modules = modulesRoot();
  const context = await loadEnvironment(modules, { archive: config.archive, store });
  const baselines = await openBaselines(modules);
  fs.mkdirSync(claimDir, { recursive: true });
  fs.mkdirSync(rowsDir, { recursive: true });
  const only = args.only ? new Set(args.only.split(',').map(Number)) : null;
  let limit = args.limit ? Number(args.limit) : Infinity;
  for (const task of tasks()) {
    if (only && !only.has(task.norad)) continue;
    if (freeGiB() < MIN_FREE_GIB) { console.error(`worker ${id}: disk under ${MIN_FREE_GIB} GiB free, stopping`); break; }
    if (fs.existsSync(path.join(store, 'truth.stop'))) { console.error(`worker ${id}: stop file`); break; }
    if (fs.existsSync(path.join(rowsDir, `${task.norad}.json`))) continue;
    const claim = path.join(claimDir, String(task.norad));
    try { fs.mkdirSync(claim); } catch { // a claim older than 30 minutes with no row is a worker that was stopped: take it over
      if (Date.now() - fs.statSync(claim).mtimeMs < 30 * 60e3) continue;
      fs.utimesSync(claim, new Date(), new Date());
    }
    if (limit-- <= 0) break;
    for (const candidate of [task.norad, ...task.replacements]) {
      const started = Date.now();
      try {
        await satellite({ ...task, norad: candidate, replacementOf: candidate === task.norad ? null : task.norad }, context, baselines, modules);
        console.error(`worker ${id}: ${candidate} ok in ${((Date.now() - started) / 1000).toFixed(0)} s`);
        break;
      } catch (error) {
        const reason = String(error.message).slice(0, 300);
        console.error(`worker ${id}: ${candidate} FAILED ${reason}`);
        write(path.join(rowsDir, `${candidate}.failed.json`), { norad: candidate, population: task.population, stratum: task.stratum, tercile: task.tercile, replacementOf: candidate === task.norad ? null : task.norad, reason });
        if (/HTTP (403|429)/.test(reason)) { fs.writeFileSync(path.join(store, 'truth.stop'), reason); return; }
      }
    }
  }
  await baselines.close();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (args.worker !== undefined) { await worker(args.worker); process.exit(0); }
  frozen();
  const count = Number(args.workers ?? 1);
  fs.mkdirSync(store, { recursive: true });
  fs.rmSync(path.join(store, 'truth.stop'), { force: true });
  const children = Array.from({ length: count }, (_, k) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, '--worker', String(k), ...process.argv.slice(2).filter((a) => a !== '--workers' && a !== String(count))], { stdio: ['ignore', 'inherit', 'inherit'] });
    return new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  });
  console.error(`started ${count} workers (pids are the children of ${process.pid})`);
  await Promise.all(children);
}
