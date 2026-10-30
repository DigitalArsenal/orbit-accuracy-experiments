#!/usr/bin/env node
// ca-socrates-gp-parity, step 1: the production screen over SOCRATES's window on SOCRATES's GP editions.
//   Registered run:  node experiments/ca-socrates-gp-parity/screen.mjs --part 1            (prints the run directory)
//                    node experiments/ca-socrates-gp-parity/screen.mjs --part 2 --run <run-id>
//   Timing probe:    node experiments/ca-socrates-gp-parity/screen.mjs --probe --part 1 --slices N --units U --out DIR [--processes P --threads T]
// The registered run refuses to start unless PLAN.md and the run sources are committed and pushed (frozenPlan).
// A probe screens the same catalog in the week after the registered window and is never written to runs/ or results/.
// This step never reads the SOCRATES report: the screen does not know the answer it is compared with.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { config, repo, id, here, sha256, frozenPlan, modulesRoot, pinnedModule, modulePin, readCatalog, readSatcat, ommBytes, importFile, jdToIso } from './common.mjs';

const { values: o } = parseArgs({ options: {
  modules: { type: 'string' }, run: { type: 'string' }, out: { type: 'string' }, probe: { type: 'boolean', default: false }, part: { type: 'string' }, amendment: { type: 'string' },
  slices: { type: 'string' }, units: { type: 'string' }, processes: { type: 'string' }, threads: { type: 'string' }, 'slice-seconds': { type: 'string' },
} });
const log = (m) => process.stderr.write(`${new Date().toISOString()} ${m}\n`);
const startedAt = new Date().toISOString(), loadStart = os.loadavg();
const plan = o.probe ? null : frozenPlan();
if (o.probe && !o.out) throw new Error('a probe needs --out (outside runs/ and results/)');
const P = config.primaries;
const part = P.parts.find((x) => x.id === Number(o.part));
if (!part) throw new Error(`--part must be one of ${P.parts.map((x) => x.id).join(', ')}`);
if (!o.probe && part.id !== 1 && !o.run) throw new Error(`part ${part.id} continues the run of part 1: pass --run <run-id>`);
const s = { ...config.screen, ...(o.probe && o['slice-seconds'] ? { sliceSeconds: Number(o['slice-seconds']) } : {}) };
const processes = Number(o.processes ?? s.processes), threads = Number(o.threads ?? s.threadsPerProcess);
const window = o.probe
  ? { startUtc: config.probe.startUtc, startJd: config.probe.startJd, sliceSeconds: s.sliceSeconds, slices: Number(o.slices ?? 1) }
  : { startUtc: config.window.startUtc, startJd: config.window.startJd, sliceSeconds: s.sliceSeconds, slices: config.window.durationSeconds / s.sliceSeconds };
if (!Number.isInteger(window.slices) || s.sliceSeconds % s.coarseStepSeconds !== 0) throw new Error('slices must tile the window on the coarse-step grid');
// Amendment A2 screens with another pinned CA artifact into its own run (the registered window and numbers unchanged).
const pin = modulePin(o.amendment);
const runId = o.run ?? `${id}-${o.amendment ? `${o.amendment.toLowerCase()}-` : ''}screen-${startedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
const dir = o.probe ? path.resolve(o.out) : path.join(repo, 'runs', id, runId);
const partDir = path.join(dir, `part${part.id}`);
const slicesDir = path.join(partDir, 'slices');
fs.mkdirSync(slicesDir, { recursive: true });

// Inputs: the pinned artifact and the catalog, as the bytes every worker reads.
const modules = modulesRoot(o.modules);
const pinned = pinnedModule(modules, dir, pin);
const catalog = readCatalog();
const cqr = await importFile(path.join(modules, 'analysis/conjunction-assessment/tests/lib/cqr.mjs'));
const flatc = await cqr.initCqrFlatc();
const ommSchema = cqr.publishedSchema('OMM');
const records = catalog.rows.map((g) => ommBytes(flatc, ommSchema, g));
const stream = Buffer.alloc(records.reduce((n, r) => n + 4 + r.length, 0));
let at = 0;
for (const r of records) { stream.writeUInt32LE(r.length, at); stream.set(r, at + 4); at += 4 + r.length; }
if (sha256(stream) !== config.catalog.ommStreamSha256) throw new Error(`catalog stream ${sha256(stream)} is not the registered ${config.catalog.ommStreamSha256}`);
const ommStream = path.join(dir, 'catalog.omm.u32le.bin');
fs.writeFileSync(ommStream, stream);
const catalogInfo = { objects: records.length, replaced: catalog.replaced, ommStreamSha256: sha256(stream), noradListSha256: sha256(catalog.rows.map((g) => Number(g.NORAD_CAT_ID)).join('\n')) };
log(`catalog ${records.length} objects (${catalog.replaced.length} replaced), stream ${catalogInfo.ommStreamSha256}`);

// The primaries: active payloads in the catalog ranked by SHA-256 of seed + ':' + NORAD_CAT_ID. The catalog order is
// every ranked primary, then every other object; a block's primaries are order positions [p0, p1) and its
// secondaries [p0, N). A part is a range of the ranking, cut into blocks of blockSize, each over every slice.
const satcat = readSatcat();
const inCatalog = new Map(catalog.rows.map((g, n) => [Number(g.NORAD_CAT_ID), n]));
const eligible = [...inCatalog.keys()].filter((n) => { const x = satcat.get(n); return x && x.type === P.objectType && P.statusCodes.includes(x.status); });
const ranked = eligible.map((n) => [sha256(`${P.seed}:${n}`), n]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map(([, n]) => n);
if (sha256(ranked.join('\n')) !== P.rankedListSha256) throw new Error(`the ranked primaries ${sha256(ranked.join('\n'))} are not the registered ${P.rankedListSha256}`);
const chosen = ranked.slice(part.from, part.to);
if (sha256(chosen.join('\n')) !== part.listSha256) throw new Error(`part ${part.id}'s primaries are not the registered list`);
const rankedSet = new Set(ranked);
const order = [...ranked.map((n) => inCatalog.get(n)), ...catalog.rows.map((_, i) => i).filter((i) => !rankedSet.has(Number(catalog.rows[i].NORAD_CAT_ID)))];
let units = [];
for (let b = 0, p0 = part.from; p0 < part.to; b++, p0 += P.blockSize) {
  for (let k = 0; k < window.slices; k++) units.push({ part: part.id, block: b, p0, p1: Math.min(part.to, p0 + P.blockSize), slice: k });
}
if (o.probe && o.units) units = units.slice(0, Number(o.units));
const primaries = { seed: P.seed, eligible: eligible.length, part: part.id, from: part.from, to: part.to, count: chosen.length, blockSize: P.blockSize, listSha256: part.listSha256 };
fs.writeFileSync(path.join(partDir, 'primaries.json'), `${JSON.stringify(chosen)}\n`);
log(`part ${part.id}: primaries ${part.from}..${part.to} of ${eligible.length} (${part.listSha256}); ${units.length} units`);

// Units are assigned round robin; a finished unit file is never recomputed (a run resumes).
const unitFile = (k) => path.join(slicesDir, `slice-${String(k).padStart(4, '0')}.json`);
const todo = units.map((_, k) => k).filter((k) => !fs.existsSync(unitFile(k)));
log(`${units.length} units (${window.slices} slices of ${window.sliceSeconds} s from ${window.startUtc}); ${todo.length} to do on ${processes} processes x ${threads} threads`);
const t0 = Date.now();
let done = units.length - todo.length;
const workers = Array.from({ length: Math.min(processes, todo.length) }, (_, w) => {
  const jobFile = path.join(partDir, `job-${w}.json`);
  fs.writeFileSync(jobFile, JSON.stringify({ modules, wasmFile: pinned.file, ommStream, outDir: slicesDir, threads, screen: s,
    window: { startJd: window.startJd, sliceSeconds: window.sliceSeconds }, order, units, slices: todo.filter((_, n) => n % processes === w) }));
  return new Promise((resolve, reject) => {
    const child = fork(path.join(here, 'worker.mjs'), [jobFile], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('message', (m) => {
      if (m.failure) { log(`unit ${m.unit} call failed (${m.failure.seconds} s from ${jdToIso(m.failure.startJd)}): ${m.failure.error}; splitting`); return; }
      done++;
      log(`part ${part.id} unit ${m.unit} done: ${m.events} events, ${(m.elapsedMs / 1000).toFixed(1)} s, ${m.excluded} excluded${m.failures ? `, ${m.failures} failed calls` : ''}${m.failedPairs ? `, ${m.failedPairs} failed pairs (incomplete-screening)` : ''} (${done}/${units.length}, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited ${code}`))));
  });
});
await Promise.all(workers);

// Merge: every unit present, events in unit order.
const answers = units.map((_, k) => JSON.parse(fs.readFileSync(unitFile(k), 'utf8')));
const events = answers.flatMap((x) => x.events);
const excluded = [...new Map(answers.flatMap((x) => x.excluded).map((e) => [e.norad, e])).values()];
const eventsFile = path.join(partDir, 'screen-events.json');
fs.writeFileSync(eventsFile, `${JSON.stringify(events)}\n`);
const summary = {
  experiment: id, mode: o.probe ? 'probe' : 'registered', amendment: o.amendment ?? null, part: part.id, window: { ...window, endUtc: jdToIso(window.startJd + (window.slices * window.sliceSeconds) / 86400) },
  catalog: catalogInfo, primaries, units: units.length, events: events.length, excludedObjects: excluded,
  failedCalls: answers.flatMap((x) => (x.failures ?? []).map((f) => ({ unit: x.unit, block: x.block, slice: x.slice, ...f }))),
  failedPairs: answers.reduce((n, x) => n + Number(x.failedPairs ?? 0), 0),
  incompleteUnits: answers.filter((x) => Number(x.failedPairs ?? 0) > 0).map((x) => ({ unit: x.unit, block: x.block, slice: x.slice, failedPairs: x.failedPairs })),
  unitElapsedSeconds: { total: answers.reduce((n, x) => n + x.elapsedMs, 0) / 1000, max: Math.max(...answers.map((x) => x.elapsedMs)) / 1000 },
  wallMinutes: (Date.now() - t0) / 60000, processes, threads,
};
fs.writeFileSync(path.join(partDir, 'screen-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const gitState = (d) => { try { return { commit: execFileSync('git', ['-C', d, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }; } catch { return { commit: null }; } };
const manifest = {
  experiment: id, step: 'screen', mode: summary.mode, amendment: o.amendment ?? null, part: part.id, run: runId, startedAt, finishedAt: new Date().toISOString(), command: [process.execPath, ...process.argv.slice(1)], plan,
  configSha256: sha256(fs.readFileSync(path.join(here, 'config.json'))), repository: gitState(repo),
  module: { commit: pinned.commit, path: pin.wasmPath, version: pin.version, wasmSha256: pinned.wasmSha256, packages: pinned.packages, modulesCheckoutHead: gitState(modules).commit },
  runtime: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.availableParallelism(), model: os.cpus()[0]?.model, loadAverageStart: loadStart, loadAverageEnd: os.loadavg() },
  inputs: { snapshot: { path: config.catalog.snapshot, sha256: config.catalog.snapshotSha256, jsonSha256: config.catalog.snapshotJsonSha256 }, replacements: config.catalog.replacements, ommStreamSha256: catalogInfo.ommStreamSha256, satcatSha256: config.satcat.sha256 },
  outputs: { 'screen-events.json': sha256(fs.readFileSync(eventsFile)), 'screen-summary.json': sha256(fs.readFileSync(path.join(partDir, 'screen-summary.json'))), 'primaries.json': sha256(fs.readFileSync(path.join(partDir, 'primaries.json'))) },
};
fs.writeFileSync(path.join(partDir, 'manifest.screen.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ dir, runId, part: part.id, events: events.length, excluded: excluded.length, failedCalls: summary.failedCalls.length, wallMinutes: summary.wallMinutes }));
