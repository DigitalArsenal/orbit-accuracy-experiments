// E13 collector. SpaceX reissues a Starlink ephemeris file about every 6.5-7.2 h and lists the new names in its manifest some time later. This
// process polls the manifest (conditional GET, every 30 min, also while it is busy), and when a sampled satellite has a version not yet processed it
// fetches it (serial requests at least 3.2 s apart, a User-Agent, no CelesTrak) and keeps, in memory only:
//   - the first 8 h, fitted with HPOP (Method A of PLAN.md: drag fitted, Cr*A/m locked at the class value), for the newest version of a satellite;
//   - the first 40 h and the stated covariance, until the satellite's next version arrives, whose first state is compared with this version's
//     prediction for that epoch (the pair mismatch of PLAN.md section 10: position and velocity in the radial / transverse / normal axes, the stated
//     sigmas, the Jacobi energy at both epochs).
// Only derived records are stored. The raw file is dropped when its parts are cut.
//
//   nohup node experiments/e13-open-dca/collect.mjs > /dev/null 2>&1 &     (pid in the store's collector.pid)
//   touch <store>/collector.stop      stops it after the file in hand
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, paths, STORE, sha256, sleep, isoZ, compactUtc, readJson, writeJson, appendJsonl, experimentDir } from './common.mjs';
import { Fetcher, Refused, cutHead, nameFields } from './fleet.mjs';
import { cycleEnv } from './env.mjs';
import { Pool } from './pool.mjs';

fs.mkdirSync(STORE, { recursive: true });
const logFile = fs.createWriteStream(paths.log, { flags: 'a' });
const log = (m) => logFile.write(`${new Date().toISOString().slice(0, 19)}Z [e13] ${m}\n`);
const STOP_AFTER = Date.parse(config.starlink.stopAfterUtc);
const WORKERS = Math.min(config.compute.workers, Number(process.env.E13_WORKERS) || Infinity);   // E13_WORKERS: fewer workers for a test run
const POLL_MS = config.starlink.manifestPollMinutes * 60e3;
const CYCLE_MAX_MS = 6 * 3600e3;                       // a cycle (one pool, one environment) runs at most this long, so the environment files stay fresh

// ── one collector at a time ──
if (fs.existsSync(paths.pid)) {
  const old = Number(fs.readFileSync(paths.pid, 'utf8'));
  let alive = false; try { process.kill(old, 0); alive = true; } catch { /* not running */ }
  if (alive) { console.error(`collector already running as pid ${old}`); process.exit(1); }
}
fs.writeFileSync(paths.pid, String(process.pid));
const counters = { fetched: 0, fitted: 0, failed: 0, skipped: 0, cycles: 0, pairs: 0, pairsSkipped: 0, mismatchOnly: 0 };
let current = { state: 'starting' };
const status = (extra = {}) => { current = { ...current, ...extra }; writeJson(paths.status, { pid: process.pid, updatedUtc: isoZ(Date.now()), stopAfterUtc: config.starlink.stopAfterUtc, counters, ...current }); };
const shutdown = (why) => { log(`stopping: ${why}`); status({ state: `stopped (${why})` }); try { fs.unlinkSync(paths.pid); } catch { /* ignore */ } process.exit(0); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
const stopRequested = () => fs.existsSync(paths.stop);

// ── the sample and what is already stored ──
const sampleFile = readJson(path.join(experimentDir, 'sample.json'));
// The decaying satellites first (the cleanest sensors, so a cycle that is cut short has them), then the holding ones.
const priority = (norad) => Number(sampleFile.satellites[norad].startsWith('decay'));
const sampleNorads = (process.env.E13_SAMPLE_NORADS ? process.env.E13_SAMPLE_NORADS.split(',').map(Number) : Object.keys(sampleFile.satellites).map(Number))
  .sort((a, b) => (priority(b) - priority(a)) || (a - b))
  .slice(0, Number(process.env.E13_SAMPLE_LIMIT) || Infinity);   // E13_SAMPLE_LIMIT, E13_SAMPLE_NORADS: a test run on a few satellites
const sampleSet = new Set(sampleNorads);
const recordPath = (norad, startIso) => path.join(paths.records, String(norad), `${compactUtc(startIso)}.json`);
const readLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const processed = new Set();                             // names with a stored record, a mismatch-only index line or a final failure
const known = new Map();                                 // norad -> names ever seen (index, failures, manifest polls), for the predecessor of a version
const remember = (norad, name) => { if (!known.has(norad)) known.set(norad, new Set()); known.get(norad).add(name); };
for (const r of readLines(paths.index)) { processed.add(r.name); remember(r.norad, r.name); }
for (const f of readLines(paths.failures)) if (f.final) { processed.add(f.name); remember(f.norad, f.name); }
// MEME_<norad>_<name>_<doy (3) hhmm (4) of the start>_<status>_<stop>_UNCLASSIFIED.txt: the start orders the versions of one satellite within a year
const startKey = (name) => Number(nameFields(name).doyHhmm);
const predecessorOf = (norad, name) => [...(known.get(norad) ?? [])].filter((n) => startKey(n) < startKey(name)).sort((a, b) => startKey(b) - startKey(a))[0] ?? null;
const memory = new Map();                                // norad -> {name, sha256, retained}: the newest processed version's first 40 h (never on disk)

// ── politeness gates: the coordinator's (load, disk) ──
async function gates() {
  for (;;) {
    const load = os.loadavg()[0];
    const free = (() => { try { const s = fs.statfsSync(STORE); return s.bavail * s.bsize / 2 ** 30; } catch { return Infinity; } })();
    if (load <= config.compute.pauseAboveLoad1m && free >= config.compute.pauseBelowFreeGiB) return;
    status({ state: `paused (load ${load.toFixed(1)}, free ${free.toFixed(0)} GiB)` });
    if (stopRequested()) shutdown('stop file');
    await sleep(5 * 60e3);
  }
}

// ── the manifest ──
const fetcher = new Fetcher(log);
let etag = null;
const queue = [];                                        // {norad, name, key}: versions to process, oldest first
const queued = new Set();
async function pollManifest() {
  let manifest;
  try { manifest = await fetcher.manifest(etag); } catch (error) { if (error instanceof Refused) throw error; log(`manifest poll failed: ${error.message}`); return 0; }
  if (manifest.notModified) return 0;
  etag = manifest.etag;
  let added = 0;
  for (const norad of sampleNorads) {
    const name = manifest.names.get(norad);
    if (!name) continue;
    remember(norad, name);
    if (processed.has(name) || queued.has(name)) continue;
    queue.push({ norad, name, key: startKey(name) }); queued.add(name); ++added;
  }
  appendJsonl(paths.polls, { at: isoZ(Date.now()), lastModified: manifest.lastModified, etag: manifest.etag, sha256: manifest.sha256, listed: manifest.names.size, sampled: sampleNorads.length, added, queue: queue.length });
  log(`manifest last-modified ${manifest.lastModified}: ${added} new versions of sampled satellites, ${queue.length} queued`);
  return added;
}
const byOrder = (a, b) => (a.key - b.key) || (priority(b.norad) - priority(a.norad)) || (a.norad - b.norad);

// ── one cycle: process the queue (versions oldest first), fits and pair mismatches in the pool ──
async function runCycle(label) {
  ++counters.cycles;
  const { envConfig, summary } = cycleEnv();
  log(`cycle ${counters.cycles} (${label}): ${queue.length} versions queued; environment ${JSON.stringify(summary)}`);
  status({ state: 'cycle: starting workers', cycle: { n: counters.cycles, label, versions: queue.length, startedUtc: isoZ(Date.now()) } });
  const pool = new Pool(WORKERS, log, envConfig);
  await pool.start();
  const results = [];
  const deadline = Date.now() + CYCLE_MAX_MS;
  let first = true, lastPoll = Date.now();
  try {
    if (counters.cycles === 1) await syntheticGuard(pool);
    while (queue.length && Date.now() < deadline) {
      if (stopRequested()) { log('stop file: leaving the cycle'); break; }
      await gates();
      while (pool.outstanding >= 2 * WORKERS) await sleep(2000);        // fetch no further ahead than the pool can use
      if (Date.now() - lastPoll >= POLL_MS) { await pollManifest(); lastPoll = Date.now(); }
      queue.sort(byOrder);
      const item = queue.shift();
      queued.delete(item.name);
      const fullCheck = first; first = false;
      const task = await processOne(pool, item, fullCheck);
      if (task) results.push(task.done);
      status({ state: 'cycle: fetching and fitting', progress: { fetched: counters.fetched, fitted: counters.fitted, pairs: counters.pairs, queue: queue.length } });
    }
    await Promise.all(results);
  } finally { await pool.stop(); }
  appendJsonl(path.join(STORE, 'cycles.jsonl'), { at: isoZ(Date.now()), cycle: counters.cycles, label, counters: { ...counters }, queueLeft: queue.length, environment: summary });
}

// Fetch a version, cut it, pair it with the version before it, and fit it when no later version of the satellite is queued. Returns {done}: a promise
// of the pool work (an object, so that awaiting this function does not wait for the pool).
async function processOne(pool, item, fullCheck) {
  const { norad, name } = item;
  const get = async (n) => {
    let response;
    try { response = await fetcher.get(config.starlink.baseUrl + n); } catch (error) {
      if (error instanceof Refused) { log(`REFUSED: ${error.message}`); status({ state: `disabled: ${error.message}` }); await pool.stop(); throw error; }
      return { error: String(error.message) };
    }
    return response;
  };
  const response = await get(name);
  if (response.error) {
    appendJsonl(paths.failures, { at: isoZ(Date.now()), norad, name, stage: 'fetch', error: response.error, final: false }); ++counters.failed;
    if ((item.attempts ?? 0) < 2) { queue.push({ ...item, attempts: (item.attempts ?? 0) + 1 }); queued.add(name); }
    return null;
  }
  if (response.status === 404) { appendJsonl(paths.failures, { at: isoZ(Date.now()), norad, name, stage: 'fetch', error: 'HTTP 404 (superseded and gone)', final: true }); processed.add(name); ++counters.failed; return null; }
  ++counters.fetched;
  const digest = sha256(response.bytes), nbytes = response.bytes.length;
  let cut;
  try { cut = cutHead(response.bytes.toString('utf8')); } catch (error) {
    appendJsonl(paths.failures, { at: isoZ(Date.now()), norad, name, stage: 'parse', error: String(error.message), sha256: digest, final: true }); processed.add(name); ++counters.failed; return null;
  }
  response.bytes = null;                                                // the raw file is dropped here; the parts that stay in memory are cut
  const file = { name, url: config.starlink.baseUrl + name, sha256: digest, bytes: nbytes, lastModified: response.lastModified, etag: response.etag, retrievedUtc: isoZ(Date.now()), ...cut.header, states: cut.file.states };
  const work = [];

  // the pair mismatch against the version before this one
  const prevName = predecessorOf(norad, name);
  if (prevName) {
    let prev = memory.get(norad)?.name === prevName ? memory.get(norad) : null;
    if (!prev) {                                                        // not in memory (a restart, or a version that was not the last one processed): fetch it once more
      const r = await get(prevName);
      if (r.status === 200) { try { prev = { name: prevName, sha256: sha256(r.bytes), retained: cutHead(r.bytes.toString('utf8')).retained, file: null }; } catch { prev = null; } r.bytes = null; }
    }
    if (prev) {
      const nx = cut.retained, pv = prev.retained, i = Array.prototype.indexOf.call(pv.epochsMs, nx.startMs);
      if (i < 0) { ++counters.pairsSkipped; appendJsonl(paths.pairIndex, { norad, prev: prevName, next: name, skipped: 'the new start epoch is not on the previous version\'s retained grid' }); } else {
        const job = { kind: 'pair', norad, satName: nameFields(name).satName,
          prev: { name: prevName, sha256: prev.sha256, startMs: pv.startMs, createdMs: pv.createdMs, frame: pv.frame, timeScale: pv.timeScale, state0: Array.from(pv.states.slice(0, 6)), stateT1: Array.from(pv.states.slice(6 * i, 6 * i + 6)), sigmaT1: Array.from(pv.sigma.slice(6 * i, 6 * i + 6)) },
          next: { name, sha256: digest, startMs: nx.startMs, createdMs: nx.createdMs, frame: nx.frame, timeScale: nx.timeScale, state: Array.from(nx.states.slice(0, 6)), sigma: Array.from(nx.sigma.slice(0, 6)) } };
        work.push(pool.run(job, { retries: 1 }).then((r) => {
          if (!r.ok) { log(`${norad}: pair FAILED: ${r.error}`); appendJsonl(paths.pairIndex, { norad, prev: prevName, next: name, error: r.error }); return; }
          const rec = r.result;
          writeJson(path.join(paths.pairs, String(norad), `${compactUtc(rec.t1)}.json`), rec);
          appendJsonl(paths.pairIndex, { norad, prev: prevName, next: name, t0: rec.t0, t1: rec.t1, hoursBetween: rec.hoursBetween, position3dM: rec.mismatch.position3dM, positionRtnM: rec.mismatch.positionRtnM, energyMismatchJkg: rec.energyJkg.mismatch, energyPredictedJkg: rec.energyJkg.predictedChange });
          ++counters.pairs;
          log(`${norad}: pair ${rec.hoursBetween.toFixed(2)} h apart, position mismatch ${rec.mismatch.position3dM.toFixed(1)} m (z ${rec.z.positionRtnOld.map((z) => z.toFixed(1)).join('/')}), energy ${rec.energyJkg.mismatch.toFixed(1)} of ${rec.energyJkg.predictedChange.toFixed(0)} J/kg`);
        }));
      }
    }
  }
  memory.set(norad, { name, sha256: digest, retained: cut.retained });

  // the head fit, for the newest version of the satellite only (a version with a later one queued gets the mismatch alone)
  const newest = !queue.some((q) => q.norad === norad);
  if (!newest) {
    appendJsonl(paths.index, { norad, name, start: file.ephemerisStart, created: file.created, retrieved: file.retrievedUtc, mismatchOnly: true });
    processed.add(name); ++counters.mismatchOnly;
    return { done: Promise.all(work) };
  }
  work.push(pool.run({ kind: 'head', norad, satName: nameFields(name).satName, file, head: cut.head, startSigma: cut.file.startSigma, fileFacts: { states: cut.file.states, distinctStepsSeconds: cut.file.distinctStepsSeconds }, fullCheck }, { retries: 1 }).then((r) => {
    if (!r.ok) {
      log(`${norad}: fit FAILED in ${r.sec?.toFixed(0)} s: ${r.error}`);
      appendJsonl(paths.failures, { at: isoZ(Date.now()), norad, name, stage: 'fit', error: r.error, sha256: digest, final: !/GUARD FAILED/.test(r.error) }); ++counters.failed;
      if (/GUARD FAILED/.test(r.error)) { log('A GUARD FAILED: stopping the collector (a number would not belong to its fit)'); status({ state: `aborted by a guard: ${r.error.slice(0, 300)}` }); fs.writeFileSync(path.join(STORE, 'ABORTED.txt'), `${isoZ(Date.now())}\n${r.error}\n`); process.exit(3); }
      return;
    }
    const rec = r.result, d = rec.fits.drag;
    // The modules' hashes and the input files' hashes are the same for every record of a cycle: kept once, named by their own hash.
    const provenanceRef = sha256(Buffer.from(JSON.stringify(rec.provenance))).slice(0, 16);
    const provenanceFile = path.join(STORE, 'provenance', `${provenanceRef}.json`);
    if (!fs.existsSync(provenanceFile)) writeJson(provenanceFile, rec.provenance);
    rec.provenance = { fitter: rec.provenance.fitter, ref: provenanceRef };
    writeJson(recordPath(norad, file.ephemerisStart), rec);
    appendJsonl(paths.index, { norad, name, start: file.ephemerisStart, created: file.created, retrieved: file.retrievedUtc, cdAreaOverMass: d.dragCdAreaOverMass, rms3dM: d.residuals.rms3dM, gatePass: d.gate.pass, jumps: d.jumps.length, thrustFit: !!rec.fits.dragThrust, fitSeconds: rec.fitSeconds, fitId: d.fitId, path: path.relative(STORE, recordPath(norad, file.ephemerisStart)) });
    processed.add(name);
    ++counters.fitted;
    log(`${norad}: Cd*A/m ${d.dragCdAreaOverMass.toFixed(5)} rms ${d.residuals.rms3dM.toFixed(2)} m gate ${d.gate.pass ? 'pass' : 'FAIL'} jumps ${d.jumps.length} (${r.sec.toFixed(0)} s) [${counters.fitted} fitted, ${queue.length} queued]`);
  }));
  return { done: Promise.all(work) };
}

// ── guard: a head made by HPOP at a known Cd*A/m must be fitted back to it before any real file is trusted ──
async function syntheticGuard(pool) {
  const cases = [{ label: 'noise-free, locked Cr*A/m = true', trueCd: 0.03, trueCr: 0.19, lockCr: 0.19, noiseM: 0 }, { label: 'noise 2 m, locked Cr*A/m = true', trueCd: 0.03, trueCr: 0.19, lockCr: 0.19, noiseM: 2 }];
  const out = await Promise.all(cases.map((c) => pool.run({ kind: 'synthetic', ...c }, { retries: 0 })));
  const rows = out.map((r, i) => (r.ok ? r.result : { ...cases[i], error: r.error }));
  const primary = rows[0];
  const pass = !primary.error && Math.abs(primary.relativeError) < 1e-6 && primary.converged && rows[1] && !rows[1].error && Math.abs(rows[1].relativeError) < 0.02;
  writeJson(path.join(paths.guards, `synthetic-${compactUtc(isoZ(Date.now()))}.json`), { pass, criteria: { noiseFreeRelativeErrorBelow: 1e-6, noise2mRelativeErrorBelow: 0.02 }, rows });
  log(`synthetic known-answer test ${pass ? 'PASS' : 'FAIL'}: ${rows.map((x) => (x.error ? `error ${x.error}` : `${x.label}: Cd*A/m ${x.fittedCd.toExponential(6)} (true ${x.trueCd}) relative error ${x.relativeError.toExponential(2)}`)).join('; ')}`);
  if (!pass) { status({ state: 'aborted: the synthetic known-answer test failed' }); fs.writeFileSync(path.join(STORE, 'ABORTED.txt'), `${isoZ(Date.now())}\nsynthetic known-answer test failed\n${JSON.stringify(rows)}\n`); process.exit(3); }
}

// ── main loop ──
log(`collector start: ${sampleNorads.length} sampled satellites, ${WORKERS} workers, store ${STORE}, stops after ${config.starlink.stopAfterUtc}; ${processed.size} versions already processed`);
try {
  while (!stopRequested() && Date.now() < STOP_AFTER) {
    await gates();
    status({ state: 'polling the manifest' });
    await pollManifest();
    if (queue.length) { await runCycle(counters.cycles === 0 ? 'first cycle: the files current at start' : 'new versions'); continue; }
    status({ state: 'waiting for the next version', nextPollUtc: isoZ(Date.now() + POLL_MS) });
    for (let waited = 0; waited < POLL_MS && !stopRequested(); waited += 30e3) await sleep(30e3);
  }
  shutdown(stopRequested() ? 'stop file' : 'finished');
} catch (error) {
  log(`FATAL: ${error?.stack ?? error}`);
  status({ state: `failed: ${String(error?.message ?? error).slice(0, 300)}` });
  try { fs.unlinkSync(paths.pid); } catch { /* ignore */ }
  process.exit(error instanceof Refused ? 4 : 1);
}
