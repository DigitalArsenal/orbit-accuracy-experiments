#!/usr/bin/env node
// ca-screen-recall: one run of PLAN.md. Registered run: node experiments/ca-screen-recall/run.mjs [--modules DIR] [--archive DIR] [--run ID]
// Development and replay runs: --smoke | --replay with --out DIR (never written under runs/ or results/).
// Order: subset -> SGP4 module -> brute-force reference -> screen arms -> matching, Pc and propagator parity.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { config, repo, id, sha256, frozenPlan, readSnapshot, selectSubset, ommBytes, modulesRoot, pinnedModules, DAY_S } from './common.mjs';
import { openScreen, openSgp4 } from './access.mjs';
import { bruteForce } from './reference.mjs';
import { matchEvents, bandOf, placeInWindow, distribution, lowerBound, screenPair } from './compare.mjs';

const BANDS = ['below 1 km', '1 to 5 km'];
const iso = (jd) => new Date((jd - 2440587.5) * DAY_S * 1000).toISOString();
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

// One arm: the reference's events against one screen answer.
async function assessArm({ arm, answer, reference, window, screenModule, sgp4, withParity }) {
  const cmp = config.comparison, reportM = config.reference.reportBelowM;
  const excluded = new Set(answer.excluded);
  const refPlaced = reference.map((e) => ({ ...e, place: placeInWindow(e.tcaJd, window), skip: excluded.has(e.a) || excluded.has(e.b), band: bandOf(e.missM) }));
  const scPlaced = answer.events.map((e) => ({ ...e, place: placeInWindow(e.tcaJd, window) }));
  const refIdx = refPlaced.map((_, n) => n).filter((n) => refPlaced[n].place !== 'out' && !refPlaced[n].skip);
  const scIdx = scPlaced.map((_, n) => n).filter((n) => scPlaced[n].place !== 'out');
  const { refTo, screenTo } = matchEvents(refIdx.map((n) => refPlaced[n]), scIdx.map((n) => scPlaced[n]), cmp.tcaToleranceSeconds);
  const refMatch = new Map(refIdx.map((n, m) => [n, refTo[m] < 0 ? -1 : scIdx[refTo[m]]]));
  const scMatch = new Map(scIdx.map((n, m) => [n, screenTo[m] < 0 ? -1 : refIdx[screenTo[m]]]));

  // Recall by band (events inside the window), and the same for edge and near-threshold events.
  const recall = {}, misses = [], matches = [];
  for (const band of BANDS) {
    const rows = refIdx.filter((n) => refPlaced[n].place === 'in' && refPlaced[n].band === band);
    const found = rows.filter((n) => refMatch.get(n) >= 0).length;
    recall[band] = { reference: rows.length, found, recall: rows.length ? found / rows.length : null, lowerBound: lowerBound(found, rows.length, cmp.confidence) };
    for (const n of rows) {
      const r = refPlaced[n], m = refMatch.get(n);
      if (m >= 0) matches.push({ r: n, s: m, band, dtSeconds: (scPlaced[m].tcaJd - r.tcaJd) * DAY_S, dMissM: scPlaced[m].missM - r.missM });
      else {
        const sameParity = scPlaced.filter((s) => screenPair(s) === `${Math.min(r.a, r.b)}-${Math.max(r.a, r.b)}`).sort((x, y) => Math.abs(x.tcaJd - r.tcaJd) - Math.abs(y.tcaJd - r.tcaJd))[0] ?? null;
        misses.push({ pair: [r.a, r.b], band, referenceTcaUtc: iso(r.tcaJd), referenceMissM: r.missM,
          screenEventsForPair: scPlaced.filter((s) => screenPair(s) === `${Math.min(r.a, r.b)}-${Math.max(r.a, r.b)}`).length,
          nearestScreenEvent: sameParity ? { tcaUtc: iso(sameParity.tcaJd), missM: sameParity.missM, secondsFromReference: (sameParity.tcaJd - r.tcaJd) * DAY_S } : null });
      }
    }
  }
  const total = BANDS.reduce((s, b) => s + recall[b].reference, 0), foundAll = BANDS.reduce((s, b) => s + recall[b].found, 0);
  recall.all = { reference: total, found: foundAll, recall: total ? foundAll / total : null, lowerBound: lowerBound(foundAll, total, cmp.confidence) };
  const tally = (pick) => { const rows = refIdx.filter(pick); return { reference: rows.length, found: rows.filter((n) => refMatch.get(n) >= 0).length }; };
  const edge = tally((n) => refPlaced[n].place === 'edge' && refPlaced[n].band), nearThreshold = tally((n) => refPlaced[n].place === 'in' && refPlaced[n].band === null);

  // The screen's events: matched, near the threshold, at a window edge, beyond the reference's scope, or false.
  const sc = { total: scPlaced.length, outOfWindow: scPlaced.filter((e) => e.place === 'out').length, matched: 0, nearThreshold: 0, edge: 0, beyondReference: 0, duplicates: 0, falseEvents: [] };
  for (const n of scIdx) {
    const e = scPlaced[n], m = scMatch.get(n);
    if (e.missM >= reportM) { sc.beyondReference++; continue; }
    if (m >= 0) { if (refPlaced[m].band === null) sc.nearThreshold++; else sc.matched++; continue; }
    if (e.place === 'edge') { sc.edge++; continue; }
    const nearDup = scIdx.some((o) => o !== n && scMatch.get(o) >= 0 && screenPair(scPlaced[o]) === screenPair(e) && Math.abs(scPlaced[o].tcaJd - e.tcaJd) * DAY_S <= cmp.tcaToleranceSeconds);
    if (nearDup) sc.duplicates++;
    sc.falseEvents.push({ pair: [Math.min(e.primary, e.secondary), Math.max(e.primary, e.secondary)], tcaUtc: iso(e.tcaJd), missM: e.missM, reason: nearDup ? 'second event within the tolerance of a matched one' : 'no reference minimum below 5.5 km within the tolerance' });
  }

  // Differences over matched events inside the window.
  const diffs = {};
  for (const band of [...BANDS, 'all']) {
    const rows = matches.filter((x) => band === 'all' || x.band === band);
    diffs[band] = { matched: rows.length, tcaSeconds: distribution(rows.map((x) => Math.abs(x.dtSeconds))), missM: distribution(rows.map((x) => Math.abs(x.dMissM))),
      signedMissMeanM: mean(rows.map((x) => x.dMissM)), signedTcaMeanSeconds: mean(rows.map((x) => x.dtSeconds)) };
  }
  const flagged = matches.filter((x) => Math.abs(x.dtSeconds) > cmp.flag.tcaSeconds || Math.abs(x.dMissM) > cmp.flag.missM);
  const outliers = {
    flagThresholds: cmp.flag, flagged: flagged.length,
    rows: flagged.sort((x, y) => Math.max(Math.abs(y.dtSeconds), Math.abs(y.dMissM)) - Math.max(Math.abs(x.dtSeconds), Math.abs(x.dMissM))).slice(0, cmp.outlierRowsMax)
      .map((x) => ({ pair: [refPlaced[x.r].a, refPlaced[x.r].b], band: x.band, referenceTcaUtc: iso(refPlaced[x.r].tcaJd), referenceMissM: refPlaced[x.r].missM, dtSeconds: x.dtSeconds, dMissM: x.dMissM })),
  };

  // Pc: the screen's value against the module's Alfano maximum at the screen's own miss and at the reference's.
  const rel = (a, b) => (b ? Math.abs(a - b) / b : null), pcSelf = [], pcRef = [];
  let pcMissing = 0;
  for (const x of matches) {
    const s = scPlaced[x.s], radius = s.combinedRadiusM ?? answer.combinedRadiusM;
    if (s.pcMax === null) { pcMissing++; continue; }
    pcSelf.push(rel(s.pcMax, await screenModule.alfano(s.missM, radius)));
    pcRef.push(rel(s.pcMax, await screenModule.alfano(refPlaced[x.r].missM, radius)));
  }
  // Propagator parity at the screen's TCAs: the screen's states against the SGP4 module's at the same instant.
  let parity = null;
  if (withParity) {
    const dr = [], dv = [], rows = [];
    let frames = 0;
    for (const x of matches) {
      const s = scPlaced[x.s], states = await sgp4.state({ jd: s.tcaJd, numbers: [s.primary, s.secondary] });
      for (const [num, st] of [[s.primary, s.primaryState], [s.secondary, s.secondaryState]]) {
        const ref = states.get(num);
        if (!st || !ref) { frames++; continue; }
        if (st.frame !== 'TEME') frames++;
        const dp = Math.hypot(st.pos[0] - ref.pos[0], st.pos[1] - ref.pos[1], st.pos[2] - ref.pos[2]), dq = Math.hypot(st.vel[0] - ref.vel[0], st.vel[1] - ref.vel[1], st.vel[2] - ref.vel[2]);
        dr.push(dp); dv.push(dq); rows.push({ norad: num, positionM: dp, velocityMS: dq, tcaUtc: iso(s.tcaJd) });
      }
    }
    parity = { objects: dr.length, unmatchedOrOtherFrame: frames, positionM: distribution(dr), velocityMS: distribution(dv), largest: rows.sort((a, b) => b.positionM - a.positionM).slice(0, 5) };
  }
  const gate = arm.id === config.pass.arm ? recall['below 1 km'] : null;
  return {
    id: arm.id, thresholdM: arm.thresholdM, elapsedMs: answer.elapsedMs, chunks: answer.chunks, statistics: answer.statistics,
    excludedObjects: answer.excluded, recall, misses, edge, nearThreshold, screenEvents: sc, differences: diffs, outliers,
    probability: { compared: pcSelf.length, missing: pcMissing, relativeDifferenceAtScreenMiss: distribution(pcSelf), relativeDifferenceAtReferenceMiss: distribution(pcRef) },
    parity,
    gate: gate && { reference: gate.reference, found: gate.found, status: gate.reference === 0 ? 'inconclusive: no reference event below 1 km' : gate.found === gate.reference ? 'pass' : 'fail' },
    _matches: matches.map((x) => ({ pair: [refPlaced[x.r].a, refPlaced[x.r].b], referenceTcaJd: refPlaced[x.r].tcaJd, referenceMissM: refPlaced[x.r].missM, screenTcaJd: scPlaced[x.s].tcaJd, screenMissM: scPlaced[x.s].missM, band: x.band })),
  };
}

export async function execute({ mode = 'registered', modules: modulesFlag, archive, outDir, runId, smokeSize, log = (m) => process.stderr.write(`${new Date().toISOString()} ${m}\n`) }) {
  const startedAt = new Date().toISOString(), loadStart = os.loadavg();
  const plan = mode === 'registered' ? frozenPlan() : null;
  if (mode !== 'registered' && !outDir) throw new Error(`${mode} runs need --out`);
  const modules = modulesRoot(modulesFlag), pinned = pinnedModules(modules);
  if (smokeSize && mode !== 'smoke') throw new Error('--count and --seconds are for --smoke runs');
  const selection = mode === 'smoke' ? { seed: config.smoke.seed, count: smokeSize?.count ?? config.smoke.count } : { seed: config.selection.seed, count: mode === 'replay' ? config.replay.count : config.selection.count };
  const window = { startJd: config.window.startJd, durationSeconds: mode === 'smoke' ? smokeSize?.seconds ?? config.smoke.durationSeconds : mode === 'replay' ? config.replay.durationSeconds : config.window.durationSeconds };
  const dir = outDir ?? path.join(repo, 'runs', id, runId ?? `${id}-${startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`);
  fs.mkdirSync(dir, { recursive: true });

  const snapshot = readSnapshot(archive);
  const subset = selectSubset(snapshot.rows, selection);
  const numbers = subset.objects.map((r) => Number(r.NORAD_CAT_ID));
  log(`${mode}: ${subset.eligible} eligible, ${numbers.length} selected, window ${window.durationSeconds} s`);

  const screenModule = await openScreen({ modules, pinned, workDir: dir });
  const sgp4 = await openSgp4({ modules, pinned });
  try {
    const omms = subset.objects.map((gp) => ommBytes(screenModule.flatc, screenModule.ommSchema, gp));
    await sgp4.ingest(omms);

    // The reference's time grid: lines at start + i * step are what the module answers (checked against single-epoch states).
    const probeStep = 7.3, probeStart = window.startJd + 5000 / DAY_S;
    const lines = await sgp4.sample({ startJd: probeStart, lines: 5, stepSeconds: probeStep, numbers: numbers.slice(0, 3) });
    let gridMaxM = 0;
    for (let l = 0; l < 5; l++) {
      const states = await sgp4.state({ jd: probeStart + (l * probeStep) / DAY_S, numbers: numbers.slice(0, 3) });
      for (let b = 0; b < 3; b++) {
        const st = states.get(lines.norads[b]), at = (b * 5 + l) * 3;
        gridMaxM = Math.max(gridMaxM, 1000 * Math.hypot(lines.pos[at] - st.pos[0] / 1000, lines.pos[at + 1] - st.pos[1] / 1000, lines.pos[at + 2] - st.pos[2] / 1000));
      }
    }
    log(`time-grid check: ephemeris lines against single-epoch states differ by at most ${gridMaxM.toFixed(3)} m`);
    if (gridMaxM > 1) throw new Error('the SGP4 module\'s ephemeris lines are not at start + i * step');

    const reference = await bruteForce({ sgp4, numbers, window, log });
    const arms = [];
    for (const arm of config.screen.arms) {
      const windowsOf = (seconds) => Array.from({ length: Math.ceil(window.durationSeconds / seconds) }, (_, n) => ({ startJd: window.startJd + (n * seconds) / DAY_S, durationSeconds: Math.min(seconds, window.durationSeconds - n * seconds) }));
      const request = (windows) => screenModule.screen({ omms, windows, thresholdM: arm.thresholdM, common: config.screen.common, workers: config.screen.workers });
      log(`screen arm ${arm.id} (${arm.thresholdM} m, ${arm.windowSeconds ? `${arm.windowSeconds} s windows` : 'one call'})`);
      let answer, fallback = null;
      try { answer = await request(windowsOf(arm.windowSeconds ?? window.durationSeconds)); } catch (error) {
        if (!arm.fallbackWindowSeconds) throw error;
        fallback = { reason: String(error.message).slice(0, 200), windowSeconds: arm.fallbackWindowSeconds };
        log(`screen arm ${arm.id}: the single call failed (${fallback.reason}); repeating in ${arm.fallbackWindowSeconds} s windows`);
        answer = await request(windowsOf(arm.fallbackWindowSeconds));
      }
      answer.combinedRadiusM = config.screen.common.combinedRadiusM;
      log(`screen arm ${arm.id}: ${answer.events.length} events in ${(answer.elapsedMs / 1000).toFixed(1)} s, ${answer.excluded.length} excluded`);
      const result = await assessArm({ arm, answer, reference: reference.events, window, screenModule, sgp4, withParity: arm.id === config.pass.arm });
      result.windows = answer.windows; result.mergedAcrossEdges = answer.mergedAcrossEdges; result.fallback = fallback;
      fs.writeFileSync(path.join(dir, `screen-events.${arm.id}.json`), `${JSON.stringify(answer.events)}\n`);
      fs.writeFileSync(path.join(dir, `matches.${arm.id}.json`), `${JSON.stringify(result._matches)}\n`);
      delete result._matches;
      arms.push(result);
    }

    const placed = reference.events.map((e) => placeInWindow(e.tcaJd, window));
    const metrics = {
      experiment: id, mode, window: { startUtc: config.window.startUtc, startJd: window.startJd, durationSeconds: window.durationSeconds },
      subset: { seed: selection.seed, requested: selection.count, eligible: subset.eligible, selected: numbers.length, listSha256: sha256(numbers.join('\n')) },
      timeGrid: { maxLineVersusStateM: gridMaxM },
      reference: { events: reference.events.length, inWindow: placed.filter((p) => p === 'in').length, atWindowEdge: placed.filter((p) => p === 'edge').length, outsideWindow: placed.filter((p) => p === 'out').length,
        belowOneKm: reference.events.filter((e, n) => placed[n] === 'in' && bandOf(e.missM) === BANDS[0]).length, oneToFiveKm: reference.events.filter((e, n) => placed[n] === 'in' && bandOf(e.missM) === BANDS[1]).length,
        nearThreshold: reference.events.filter((e, n) => placed[n] === 'in' && bandOf(e.missM) === null).length, stats: reference.stats },
      arms: Object.fromEntries(arms.map((a) => [a.id, a])),
      verdict: arms.find((a) => a.id === config.pass.arm).gate,
    };
    fs.writeFileSync(path.join(dir, 'reference-events.json'), `${JSON.stringify(reference.events)}\n`);
    fs.writeFileSync(path.join(dir, 'subset.json'), `${JSON.stringify(numbers)}\n`);
    fs.writeFileSync(path.join(dir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
    const manifest = {
      experiment: id, mode, startedAt, finishedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)],
      plan, configSha256: sha256(fs.readFileSync(new URL('./config.json', import.meta.url))),
      modulesRepository: { path: modules, pinnedCommit: pinned.commit, checkoutHead: pinned.head },
      modules: { 'analysis/conjunction-assessment': { ...screenModule.plugin, wasmSha256: screenModule.wasmSha256, packages: screenModule.packages }, 'propagator/sgp4': { ...sgp4.plugin, wasmSha256: sgp4.wasmSha256, packages: sgp4.packages } },
      runtime: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.availableParallelism(), model: os.cpus()[0]?.model, loadAverageStart: loadStart, loadAverageEnd: os.loadavg() },
      inputs: { snapshot: { path: config.data.snapshot, sha256: snapshot.sha256, jsonSha256: config.data.snapshotJsonSha256, records: config.data.snapshotRecords } },
      outputs: { 'metrics.json': sha256(fs.readFileSync(path.join(dir, 'metrics.json'))), 'reference-events.json': sha256(fs.readFileSync(path.join(dir, 'reference-events.json'))), 'subset.json': sha256(fs.readFileSync(path.join(dir, 'subset.json'))) },
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { dir, metrics, manifest };
  } finally {
    await screenModule.destroy();
    await sgp4.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { modules: { type: 'string' }, archive: { type: 'string' }, run: { type: 'string' }, out: { type: 'string' }, count: { type: 'string' }, seconds: { type: 'string' }, smoke: { type: 'boolean', default: false }, replay: { type: 'boolean', default: false } } });
  const mode = values.smoke ? 'smoke' : values.replay ? 'replay' : 'registered';
  const smokeSize = values.count || values.seconds ? { count: values.count ? Number(values.count) : undefined, seconds: values.seconds ? Number(values.seconds) : undefined } : undefined;
  const { dir, metrics } = await execute({ mode, modules: values.modules, archive: values.archive, outDir: values.out, runId: values.run, smokeSize });
  console.log(JSON.stringify({ dir, reference: metrics.reference, verdict: metrics.verdict }));
  process.exit(0);
}
