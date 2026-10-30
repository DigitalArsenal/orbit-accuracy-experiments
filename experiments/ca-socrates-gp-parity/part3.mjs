#!/usr/bin/env node
// ca-socrates-gp-parity Part 3 (Amendment A1): the console's own path, two arms, in Part 1's run layout.
//   node experiments/ca-socrates-gp-parity/part3.mjs --arm console --run <part-1-run-id>
//   node experiments/ca-socrates-gp-parity/part3.mjs --arm descriptions --run <part-1-run-id>
//   Probe: --probe --out DIR [--hours H] [--units U] [--blocks K] [--processes P --threads T]
// console:      sampled states (propagator/sgp4) through prepare_sample_screening_index and screen_window, as the console
//               drives them (console-worker.mjs); the first A1.consoleBlocks blocks of Part 1.
// descriptions: SOURCE_DESCRIPTIONS through prepare_screening_index and screen_window (window-worker.mjs); blocks 0 and 1.
// Output: runs/ca-socrates-gp-parity/<run-id>-<arm>/part1/, read by compare.mjs --parts 1 and compare-a1.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { config, repo, id, here, sha256, frozenPlan, modulesRoot, pinnedModule, readCatalog, readSatcat, ommBytes, importFile, jdToIso } from './common.mjs';

const { values: o } = parseArgs({ options: {
  arm: { type: 'string' }, run: { type: 'string' }, modules: { type: 'string' }, probe: { type: 'boolean', default: false }, out: { type: 'string' },
  hours: { type: 'string' }, units: { type: 'string' }, blocks: { type: 'string' }, processes: { type: 'string' }, threads: { type: 'string' },
} });
const A1 = JSON.parse(fs.readFileSync(path.join(here, 'config.a1.json'), 'utf8'));
const arm = A1.arms[o.arm];
if (!arm) throw new Error(`--arm must be one of ${Object.keys(A1.arms).join(', ')}`);
const log = (m) => process.stderr.write(`${new Date().toISOString()} ${m}\n`);
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
// Registered: Part 1's guard, and Part 3's own sources committed and pushed with A1.
let plan = null;
if (!o.probe) {
  plan = frozenPlan();
  for (const f of A1.runSources) {
    const rel = `experiments/${id}/${f}`;
    let committed;
    try { committed = gitIn(repo, 'show', `HEAD:${rel}`); } catch { throw new Error(`${rel} is not committed`); }
    if (!committed.equals(fs.readFileSync(path.join(here, f)))) throw new Error(`${rel} differs from HEAD`);
  }
  if (!fs.readFileSync(path.join(here, 'PLAN.md'), 'utf8').includes('## Amendment A1')) throw new Error('PLAN.md lacks Amendment A1');
  if (!o.run) throw new Error('--run <part-1-run-id> is required');
}
if (o.probe && !o.out) throw new Error('a probe needs --out');
const startedAt = new Date().toISOString(), loadStart = os.loadavg();
const s = config.screen;
const processes = Number(o.processes ?? A1.processes), threads = Number(o.threads ?? A1.threadsPerProcess);
const durationDays = o.probe ? Number(o.hours ?? 1) / 24 : arm.hours / 24;
if (!o.probe && !(arm.hours > 0 && arm.hours * 3600 <= config.window.durationSeconds)) throw new Error('an arm spans the registered window from its start, or its first part');
const startJd = o.probe ? config.probe.startJd : config.window.startJd;
const dir = o.probe ? path.resolve(o.out) : path.join(repo, 'runs', id, `${o.run}-${o.arm}`);
const partDir = path.join(dir, 'part1'), slicesDir = path.join(partDir, 'slices');
fs.mkdirSync(slicesDir, { recursive: true });

// Inputs: the pinned artifacts, the catalog and Part 1's order.
const modules = modulesRoot(o.modules);
const ca = pinnedModule(modules, dir);
if (A1.caModule.commit !== config.module.commit) throw new Error('A1 pins another CA commit: register its artifact and host files first');
const showAt = (rel) => gitIn(modules, 'show', `${A1.sgp4Module.commit}:${rel}`);
const sgp4Wasm = showAt(A1.sgp4Module.wasmPath);
if (sha256(sgp4Wasm) !== A1.sgp4Module.wasmSha256) throw new Error('propagator/sgp4 artifact differs from the registered one');
for (const [rel, hash] of Object.entries(A1.sgp4Module.hostFiles)) if (sha256(fs.readFileSync(path.join(modules, rel))) !== hash) throw new Error(`${rel} differs from ${A1.sgp4Module.commit}`);
fs.writeFileSync(path.join(dir, 'sgp4.module.wasm'), sgp4Wasm);
fs.writeFileSync(path.join(dir, 'sgp4.plugin-manifest.json'), showAt(A1.sgp4Module.manifestPath));
const catalog = readCatalog();
const cqr = await importFile(path.join(modules, 'analysis/conjunction-assessment/tests/lib/cqr.mjs'));
const flatc = await cqr.initCqrFlatc();
const ommSchema = cqr.publishedSchema('OMM');
const records = catalog.rows.map((g) => ommBytes(flatc, ommSchema, g));
const stream = Buffer.alloc(records.reduce((n, r) => n + 4 + r.length, 0));
let at = 0;
for (const r of records) { stream.writeUInt32LE(r.length, at); stream.set(r, at + 4); at += 4 + r.length; }
if (sha256(stream) !== config.catalog.ommStreamSha256) throw new Error('catalog stream differs from the registered one');
const ommStream = path.join(dir, 'catalog.omm.u32le.bin');
fs.writeFileSync(ommStream, stream);
const P = config.primaries, satcat = readSatcat();
const inCatalog = new Map(catalog.rows.map((g, n) => [Number(g.NORAD_CAT_ID), n]));
const ranked = [...inCatalog.keys()].filter((n) => { const x = satcat.get(n); return x && x.type === P.objectType && P.statusCodes.includes(x.status); })
  .map((n) => [sha256(`${P.seed}:${n}`), n]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map(([, n]) => n);
if (sha256(ranked.join('\n')) !== P.rankedListSha256) throw new Error('ranked primaries differ');
const rankedSet = new Set(ranked);
const order = [...ranked.map((n) => inCatalog.get(n)), ...catalog.rows.map((_, i) => i).filter((i) => !rankedSet.has(Number(catalog.rows[i].NORAD_CAT_ID)))];
const N = order.length, B = P.blockSize;
const K = Number(o.blocks ?? arm.blocks);
const primaries = ranked.slice(0, K * B);
fs.writeFileSync(path.join(partDir, 'primaries.json'), `${JSON.stringify(primaries)}\n`);
const num = (g) => ({ OBJECT_NAME: g.OBJECT_NAME, OBJECT_ID: g.OBJECT_ID, EPOCH: g.EPOCH, MEAN_MOTION: Number(g.MEAN_MOTION), ECCENTRICITY: Number(g.ECCENTRICITY),
  INCLINATION: Number(g.INCLINATION), RA_OF_ASC_NODE: Number(g.RA_OF_ASC_NODE), ARG_OF_PERICENTER: Number(g.ARG_OF_PERICENTER), MEAN_ANOMALY: Number(g.MEAN_ANOMALY),
  CLASSIFICATION_TYPE: g.CLASSIFICATION_TYPE, NORAD_CAT_ID: Number(g.NORAD_CAT_ID), ELEMENT_SET_NO: Number(g.ELEMENT_SET_NO), REV_AT_EPOCH: Number(g.REV_AT_EPOCH),
  BSTAR: Number(g.BSTAR), MEAN_MOTION_DOT: Number(g.MEAN_MOTION_DOT), MEAN_MOTION_DDOT: Number(g.MEAN_MOTION_DDOT) });

// Units and jobs.
let jobs = [], unitCount = 0, window;
if (o.arm === 'console') {
  // The console's sample plan (residentSamples.ts:22-31, 78-79): the window +-300 s, a whole UTC second, 60 s.
  const pad = 300 / 86400, startMs = Math.floor((((startJd - pad) - 2440587.5) * 86400000) / 1000) * 1000;
  const samplePlan = { startJd: startMs / 86400000 + 2440587.5, startIso: new Date(startMs).toISOString(), stepSeconds: 60,
    count: Math.ceil(((durationDays + 2 * pad) * 86400 + 1) / 60) + 1, identityJd: startJd };
  let units = [];
  for (let b = 0; b < K; b++) {
    const p0 = b * B, p1 = Math.min(N, p0 + B);
    for (let j = 0, s0 = p1; s0 < N; j++, s0 += A1.consoleBatchSize) units.push({ unit: units.length, block: b, batch: j, p0, p1, s0, s1: Math.min(N, s0 + A1.consoleBatchSize) });
  }
  if (o.probe && o.units) units = units.slice(0, Number(o.units));
  unitCount = units.length;
  window = { startUtc: jdToIso(startJd), startJd, sliceSeconds: durationDays * 86400, slices: 1 };
  const catalogMeta = catalog.rows.map((g) => [Number(g.NORAD_CAT_ID), String(g.OBJECT_ID), String(g.OBJECT_NAME)]);
  const todo = units.filter((u) => !fs.existsSync(path.join(slicesDir, `slice-${String(u.unit).padStart(4, '0')}.json`)));
  for (let w = 0; w < Math.min(processes, todo.length); w++) jobs.push({ worker: 'console-worker.mjs', job: { modules, caWasm: ca.file, sgp4Wasm: path.join(dir, 'sgp4.module.wasm'),
    sgp4Manifest: path.join(dir, 'sgp4.plugin-manifest.json'), ommStream, catalog: catalogMeta, order, plan: samplePlan, window: { startJd, durationDays }, screen: s, threads,
    sampleGroup: A1.sampleGroup, progressWindows: 4, outDir: slicesDir, units: todo.filter((_, n) => n % processes === w) } });
  log(`console: ${K} blocks, ${unitCount} units (batches of ${A1.consoleBatchSize}), ${samplePlan.count} samples from ${samplePlan.startIso}; ${todo.length} to do`);
} else {
  const windows = o.probe ? 1 : (durationDays * 86400) / A1.descriptionsWindowSeconds;
  const sliceSeconds = o.probe ? durationDays * 86400 : A1.descriptionsWindowSeconds;
  if (!Number.isInteger(windows)) throw new Error('descriptions windows must tile the span');
  window = { startUtc: jdToIso(startJd), startJd, sliceSeconds, slices: windows };
  const gps = order.map((i) => num(catalog.rows[i]));
  const catalogJson = path.join(dir, 'catalog.ordered.json');
  fs.writeFileSync(catalogJson, JSON.stringify(gps));
  const blocks = Array.from({ length: K }, (_, b) => ({ block: b, p0: b * B, p1: Math.min(N, (b + 1) * B), unitBase: b * windows, windows: Array.from({ length: windows }, (_, k) => k) }));
  unitCount = K * windows;
  for (let w = 0; w < Math.min(processes, blocks.length); w++) jobs.push({ worker: 'window-worker.mjs', job: { modules, wasmFile: ca.file, catalogJson, screen: s, threads,
    window: { startJd, sliceSeconds }, outDir: slicesDir, blocks: blocks.filter((_, n) => n % processes === w) } });
  log(`descriptions: ${K} blocks x ${windows} windows of ${sliceSeconds} s`);
}

const t0 = Date.now();
let done = 0;
await Promise.all(jobs.map(({ worker, job }, w) => {
  const jobFile = path.join(partDir, `job-${o.arm}-${w}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(job));
  return new Promise((resolve, reject) => {
    const child = fork(path.join(here, worker), [jobFile], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (m) => {
      if (m.progress) { log(`${o.arm} ${m.progress}`); return; }
      if (m.failure) { log(`${o.arm} block ${m.block} call failed (${m.failure.seconds} s from ${jdToIso(m.failure.startJd)}): ${m.failure.error}; splitting`); return; }
      done++;
      log(`${o.arm} unit ${m.unit} (block ${m.block}) done: ${m.events} events, ${(m.elapsedMs / 1000).toFixed(1)} s${m.sampleMs ? ` (sampling ${(m.sampleMs / 1000).toFixed(1)} s, index ${(m.prepareMs / 1000).toFixed(1)} s, ${m.windows} windows)` : ''}, ${m.excluded} excluded${m.failures ? `, ${m.failures} failed calls` : ''} (${done}/${unitCount}, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${worker} ${w} exited ${code}`))));
  });
}));

// Part 1's layout, so compare.mjs --parts 1 reads it unchanged.
const answers = fs.readdirSync(slicesDir).filter((f) => /^slice-\d+\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(slicesDir, f), 'utf8')));
if (answers.length !== unitCount) throw new Error(`${answers.length} of ${unitCount} units present`);
const events = answers.flatMap((x) => x.events);
const excluded = [...new Map(answers.flatMap((x) => x.excluded).map((e) => [e.norad, e])).values()];
const eventsFile = path.join(partDir, 'screen-events.json');
fs.writeFileSync(eventsFile, `${JSON.stringify(events)}\n`);
const summary = {
  experiment: id, mode: o.probe ? 'probe' : 'registered', arm: o.arm, amendment: 'A1', part: 1, window, catalog: { objects: records.length, replaced: catalog.replaced, ommStreamSha256: sha256(stream) },
  primaries: { seed: P.seed, eligible: ranked.length, part: 1, from: 0, to: K * B, count: primaries.length, blockSize: B, listSha256: sha256(primaries.join('\n')), blocks: K },
  units: unitCount, events: events.length, excludedObjects: excluded,
  failedCalls: answers.flatMap((x) => (x.failures ?? []).map((f) => ({ unit: x.unit, block: x.block, slice: x.slice, ...f }))),
  failedPairs: answers.reduce((n, x) => n + Number(x.failedPairs ?? 0), 0), incompleteUnits: answers.filter((x) => Number(x.failedPairs ?? 0) > 0).map((x) => ({ unit: x.unit, block: x.block, slice: x.slice, failedPairs: x.failedPairs })),
  skippedCoincident: [...new Set(answers.flatMap((x) => x.skippedCoincident ?? []))],
  unitElapsedSeconds: { total: answers.reduce((n, x) => n + x.elapsedMs, 0) / 1000, max: Math.max(...answers.map((x) => x.elapsedMs)) / 1000 },
  wallMinutes: (Date.now() - t0) / 60000, processes, threads,
};
fs.writeFileSync(path.join(partDir, 'screen-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const manifest = {
  experiment: id, step: `part3-${o.arm}`, mode: summary.mode, part: 1, run: path.basename(dir), startedAt, finishedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)], plan,
  configSha256: sha256(fs.readFileSync(path.join(here, 'config.json'))), a1ConfigSha256: sha256(fs.readFileSync(path.join(here, 'config.a1.json'))),
  module: { commit: ca.commit, path: config.module.wasmPath, wasmSha256: ca.wasmSha256, packages: ca.packages },
  sgp4Module: o.arm === 'console' ? { commit: A1.sgp4Module.commit, path: A1.sgp4Module.wasmPath, wasmSha256: A1.sgp4Module.wasmSha256 } : null,
  runtime: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.availableParallelism(), loadAverageStart: loadStart, loadAverageEnd: os.loadavg() },
  outputs: { 'screen-events.json': sha256(fs.readFileSync(eventsFile)), 'screen-summary.json': sha256(fs.readFileSync(path.join(partDir, 'screen-summary.json'))), 'primaries.json': sha256(fs.readFileSync(path.join(partDir, 'primaries.json'))) },
};
fs.writeFileSync(path.join(partDir, 'manifest.screen.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ dir, arm: o.arm, units: unitCount, events: events.length, excluded: excluded.length, wallMinutes: summary.wallMinutes }));
