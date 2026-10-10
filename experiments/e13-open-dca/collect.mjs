// E13 collector. SpaceX reissues a Starlink ephemeris file about every 6.5 h and
// lists the new names in its manifest some time later. This process polls the
// manifest (conditional GET, every 30 min), and when the sampled satellites have
// new versions it fetches each one (serial requests at least 3.2 s apart, a
// User-Agent, no CelesTrak), cuts the first 8 h in memory, fits them with HPOP
// (Method A of PLAN.md: drag fitted, Cr*A/m locked at the class value), and
// stores only the derived record. The raw file is dropped when its head is cut.
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
const WORKERS = config.compute.workers;

// ── one collector at a time ──
if (fs.existsSync(paths.pid)) {
  const old = Number(fs.readFileSync(paths.pid, 'utf8'));
  let alive = false; try { process.kill(old, 0); alive = true; } catch { /* not running */ }
  if (alive) { console.error(`collector already running as pid ${old}`); process.exit(1); }
}
fs.writeFileSync(paths.pid, String(process.pid));
const counters = { fetched: 0, fitted: 0, failed: 0, skipped: 0, cycles: 0 };
let current = { state: 'starting' };
const status = (extra = {}) => { current = { ...current, ...extra }; writeJson(paths.status, { pid: process.pid, updatedUtc: isoZ(Date.now()), stopAfterUtc: config.starlink.stopAfterUtc, counters, ...current }); };
const shutdown = (why) => { log(`stopping: ${why}`); status({ state: `stopped (${why})` }); try { fs.unlinkSync(paths.pid); } catch { /* ignore */ } process.exit(0); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
const stopRequested = () => fs.existsSync(paths.stop);

// ── the sample and what is already stored ──
const sampleFile = readJson(path.join(experimentDir, 'sample.json'));
// The decaying satellites first (the cleanest sensors, so a cycle that is cut short has them), then the holding ones.
const sampleNorads = Object.keys(sampleFile.satellites).map(Number)
  .sort((a, b) => (Number(sampleFile.satellites[b].startsWith('decay')) - Number(sampleFile.satellites[a].startsWith('decay'))) || (a - b))
  .slice(0, Number(process.env.E13_SAMPLE_LIMIT) || Infinity);   // E13_SAMPLE_LIMIT: a test run on the first N
const recordPath = (norad, startIso) => path.join(paths.records, String(norad), `${compactUtc(startIso)}.json`);
const processedNames = () => {
  const done = new Set();
  if (fs.existsSync(paths.index)) for (const line of fs.readFileSync(paths.index, 'utf8').split('\n')) if (line.trim()) { try { done.add(JSON.parse(line).name); } catch { /* partial line */ } }
  if (fs.existsSync(paths.failures)) for (const line of fs.readFileSync(paths.failures, 'utf8').split('\n')) if (line.trim()) { try { const f = JSON.parse(line); if (f.final) done.add(f.name); } catch { /* partial line */ } }
  return done;
};

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

// ── one cycle: fetch the pending versions serially, fit them in the pool ──
async function runCycle(fetcher, pending, label) {
  ++counters.cycles;
  const { envConfig, summary } = cycleEnv();
  log(`cycle ${counters.cycles} (${label}): ${pending.length} versions; environment ${JSON.stringify(summary)}`);
  status({ state: 'cycle: starting workers', cycle: { n: counters.cycles, label, versions: pending.length, startedUtc: isoZ(Date.now()) } });
  const pool = new Pool(WORKERS, log, envConfig);
  await pool.start();
  const results = [];
  let first = true;
  try {
    if (counters.cycles === 1) await syntheticGuard(pool);
    for (const [norad, name] of pending) {
      if (stopRequested()) { log('stop file: leaving the cycle'); break; }
      await gates();
      while (pool.outstanding >= 2 * WORKERS) await sleep(2000);        // fetch no further ahead than the pool can use
      let response;
      try { response = await fetcher.get(config.starlink.baseUrl + name); } catch (error) {
        if (error instanceof Refused) { log(`REFUSED: ${error.message}`); status({ state: `disabled: ${error.message}` }); await pool.stop(); throw error; }
        appendJsonl(paths.failures, { at: isoZ(Date.now()), norad, name, stage: 'fetch', error: String(error.message), final: false }); ++counters.failed; continue;
      }
      if (response.status === 404) { appendJsonl(paths.failures, { at: isoZ(Date.now()), norad, name, stage: 'fetch', error: 'HTTP 404 (superseded and gone)', final: true }); ++counters.failed; continue; }
      ++counters.fetched;
      const digest = sha256(response.bytes), nbytes = response.bytes.length;
      let cut;
      try { cut = cutHead(response.bytes.toString('utf8')); } catch (error) {
        appendJsonl(paths.failures, { at: isoZ(Date.now()), norad, name, stage: 'parse', error: String(error.message), sha256: digest, final: true }); ++counters.failed; continue;
      }
      response.bytes = null;                                            // the raw file is dropped here; the head is all that stays in memory
      const file = { name, url: config.starlink.baseUrl + name, sha256: digest, bytes: nbytes, lastModified: response.lastModified, etag: response.etag, retrievedUtc: isoZ(Date.now()), ...cut.header, states: cut.file.states };
      const fullCheck = first; first = false;
      results.push(pool.run({ kind: 'head', norad, satName: nameFields(name).satName, file, head: cut.head, startSigma: cut.file.startSigma, fileFacts: { states: cut.file.states, distinctStepsSeconds: cut.file.distinctStepsSeconds }, fullCheck }, { retries: 1 }).then((r) => {
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
        ++counters.fitted;
        log(`${norad}: Cd*A/m ${d.dragCdAreaOverMass.toFixed(5)} rms ${d.residuals.rms3dM.toFixed(2)} m gate ${d.gate.pass ? 'pass' : 'FAIL'} jumps ${d.jumps.length} (${r.sec.toFixed(0)} s) [${counters.fitted}/${pending.length}]`);
      }));
      status({ state: 'cycle: fetching and fitting', progress: { fetched: counters.fetched, fitted: counters.fitted, of: pending.length } });
    }
    await Promise.all(results);
  } finally { await pool.stop(); }
  appendJsonl(path.join(STORE, 'cycles.jsonl'), { at: isoZ(Date.now()), cycle: counters.cycles, label, versions: pending.length, counters: { ...counters }, environment: summary });
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
const fetcher = new Fetcher(log);
let etag = null, firstChangeAt = null;
log(`collector start: ${sampleNorads.length} sampled satellites, ${WORKERS} workers, store ${STORE}, stops after ${config.starlink.stopAfterUtc}`);
try {
  while (!stopRequested() && Date.now() < STOP_AFTER) {
    await gates();
    status({ state: 'polling the manifest' });
    let manifest;
    try { manifest = await fetcher.manifest(etag); } catch (error) {
      if (error instanceof Refused) throw error;
      log(`manifest poll failed: ${error.message}`); await sleep(10 * 60e3); continue;
    }
    if (!manifest.notModified) {
      etag = manifest.etag;
      const done = processedNames();
      const pending = sampleNorads.map((n) => [n, manifest.names.get(n)]).filter(([, name]) => name && !done.has(name));
      appendJsonl(paths.polls, { at: isoZ(Date.now()), lastModified: manifest.lastModified, etag: manifest.etag, sha256: manifest.sha256, listed: manifest.names.size, sampled: sampleNorads.length, pending: pending.length });
      log(`manifest last-modified ${manifest.lastModified}: ${pending.length}/${sampleNorads.length} sampled satellites have a version not yet processed`);
      if (pending.length) firstChangeAt ??= Date.now();
      const ready = pending.length >= 0.9 * sampleNorads.length || (pending.length && Date.now() - firstChangeAt >= 45 * 60e3) || (counters.cycles === 0 && pending.length);
      if (ready) { await runCycle(fetcher, pending, counters.cycles === 0 ? 'first cycle: the files current at start' : 'new wave'); firstChangeAt = null; etag = null; continue; }
    }
    status({ state: 'waiting for the next wave', nextPollUtc: isoZ(Date.now() + config.starlink.manifestPollMinutes * 60e3) });
    for (let waited = 0; waited < config.starlink.manifestPollMinutes * 60e3 && !stopRequested(); waited += 30e3) await sleep(30e3);
  }
  shutdown(stopRequested() ? 'stop file' : 'finished');
} catch (error) {
  log(`FATAL: ${error?.stack ?? error}`);
  status({ state: `failed: ${String(error?.message ?? error).slice(0, 300)}` });
  try { fs.unlinkSync(paths.pid); } catch { /* ignore */ }
  process.exit(error instanceof Refused ? 4 : 1);
}
