#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { observedFinals } from '../e3-combined-catalog/eop-finals.mjs';
import { readElementSets, readCreationDays, epochMs, dayList, shiftDay } from '../../harness/gp-archive.mjs';
import { loadModule, sha256, gitState } from '../../harness/modules.mjs';
import { finalsRecords, eopFrame } from '../../harness/eop.mjs';
import { readGfzKp, spwRows, spaceWeatherFrame } from '../../harness/full-force.mjs';
import { startRun, repoRoot } from '../../harness/provenance.mjs';
import { bindings } from '../v1c-console-ffm-path/modules.mjs';
import { checkRecorded, publish } from './report.mjs';
const dir = path.dirname(new URL(import.meta.url).pathname), configPath = path.join(dir, 'config.json');
const read = p => JSON.parse(fs.readFileSync(p));
const config = read(configPath), v1c = read(path.join(repoRoot, config.v1cConfig));
const v1 = read(path.join(repoRoot, v1c.v1Config)), e3 = read(path.join(repoRoot, v1c.e3Config));
const { values } = parseArgs({ options: { check: { type: 'boolean' }, modules: { type: 'string' }, 'v1c-run': { type: 'string' }, resume: { type: 'string' }, 'stop-after': { type: 'string' }, pilot: { type: 'string' } } });
if (values.check) { checkRecorded(config, v1, e3); process.exit(0); }
assert(config.frozen && v1c.frozen && v1.frozen && e3.frozen);
for (const file of ['PLAN.md', 'config.json']) {
  const relative = `experiments/v1c2-console-covariance-realism/${file}`;
  assert.equal(execFileSync('git', ['show', `HEAD:${relative}`], { cwd: repoRoot }).toString(), fs.readFileSync(path.join(dir, file), 'utf8'), 'commit frozen registration first');
}
assert(fs.statfsSync(repoRoot).bavail * fs.statfsSync(repoRoot).bsize >= 20 * 1024 ** 3, 'disk guard: need 20 GiB');
const modules = path.resolve(values.modules ?? process.env.SDN_MODULES_ROOT ?? path.join(repoRoot, '../space-data-network-modules--ffm-console-covariance-realism-20261022'));
const run = startRun({ experiment: config.experiment, step: 'run', configPath, modulesDir: modules, args: values, resume: values.resume });
run.manifest.invocations.at(-1).repository = gitState(repoRoot);
run.manifest.repositoryRoot = repoRoot; run.manifest.modulesRoot = modules; run.manifest.threads = 1; run.manifest.workers = 6;
const input = (kind, file) => { const bytes = fs.readFileSync(file); run.addInputs(kind, { [file]: sha256(bytes) }); return bytes; };
const parent = JSON.parse(input('source', path.join(repoRoot, config.v1cManifest)));
const oldRun = values['v1c-run'] ?? process.env.SDN_V1C_RUN_DIR ?? path.join(repoRoot, 'runs', parent.run);
const oldRaw = fs.readFileSync(path.join(oldRun, 'arcs.jsonl')); assert.equal(sha256(oldRaw), parent.rawSha256);
run.write('v1c-arcs.jsonl', oldRaw);
run.manifest.v1c = { run: parent.run, rawSha256: parent.rawSha256, manifestSha256: sha256(fs.readFileSync(path.join(repoRoot, config.v1cManifest))) };
const oldArcs = oldRaw.toString().trim().split('\n').map(JSON.parse).filter(a => a.suite === 'E3');
const sourceFiles = [config.v1cConfig, v1c.v1Config, v1c.e3Config, 'harness/stats.mjs', 'harness/gp-archive.mjs', 'harness/records.mjs', 'harness/eop.mjs', 'harness/full-force.mjs', 'harness/modules.mjs', 'harness/provenance.mjs',
  'experiments/e3-combined-catalog/truth.mjs', 'experiments/e3-combined-catalog/eop-finals.mjs', 'experiments/v1c-console-ffm-path/modules.mjs',
  'experiments/e14-covariance-realism/realism.mjs', 'experiments/e14-covariance-realism/config.json', 'experiments/e14-covariance-realism/windows.mjs',
  'experiments/e2b-correlated-covariance/stats.mjs', 'experiments/e2b-correlated-covariance/linalg.mjs', 'experiments/e2-catalog-covariance/score.mjs',
  ...['PLAN.md', 'config.json', 'run.mjs', 'modules.mjs', 'report.mjs', 'worker.mjs'].map(f => `experiments/v1c2-console-covariance-realism/${f}`)];
for (const f of sourceFiles) input('source', path.join(repoRoot, f));
for (const mod of ['propagator/ffm', 'propagator/sgp4', 'analysis/gp-error-model', 'data-source/eop-parser', 'foundation/time']) {
  for (const file of ['package.json', 'package-lock.json', 'plugin-manifest.json', 'dist/build-provenance.json']) {
    const p = path.join(modules, mod, file); if (fs.existsSync(p)) input('build', p);
  }
}
input('source', path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs'));
input('source', path.join(modules, 'analysis/gp-error-model/data/e14-s3-kc.erm'));
const rawFile = path.join(run.dir, 'arcs.jsonl');
const arcs = fs.existsSync(rawFile) ? fs.readFileSync(rawFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const has = key => arcs.some(a => a.key === key);
const keep = arc => { arcs.push(arc); fs.appendFileSync(rawFile, JSON.stringify(arc) + '\n'); run.checkpoint(); console.log(`${run.id}: ${arcs.length}/${oldArcs.length} ${arc.key}`); };
const b = await bindings(modules);
const parser = await loadModule(modules, 'data-source/eop-parser'); run.addModule(parser.provenance);
const finals = await finalsRecords(parser, observedFinals(input('eop', e3.inputs.eopFinals).toString('latin1'))); await parser.destroy();
const kernel = { portId: 'kernel', typeRef: b.catalog.TYPE, payload: b.catalog.kernelRecord(input('kernel', path.join(modules, v1.inputs.kernel))) };
const gfzFile = '/opt/data/sdn-archive/hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt';
const forecastFile = '/opt/data/sdn-archive/hac/noaa-swpc/services-20261009/45-day-forecast.txt';
input('weather', gfzFile); const gfz = readGfzKp(gfzFile);
const forecast = input('weather', forecastFile).toString().split('45-DAY F10.7 CM FLUX FORECAST')[1];
assert(forecast, 'missing NOAA flux section');
const forecastDates = [];
for (const match of forecast.matchAll(/(\d{2})([A-Za-z]{3})(\d{2})\s+(\d{3})/g)) {
  const date = new Date(`${match[1]} ${match[2]} 20${match[3]} 00:00:00 UTC`).toISOString().slice(0, 10);
  if (!(gfz.days.get(date)?.f107obs > 0)) { gfz.days.set(date, { ...(gfz.days.get(date) ?? {}), f107obs: +match[4], f107adj: +match[4] }); forecastDates.push(date); }
}
run.manifest.weather = { source: 'GFZ CC BY 4.0 historical daily drivers; NOAA SWPC public-domain forecast flux fills absent centered-average dates', forecastDates };
const environment = (first, last, records) => [kernel, eopFrame(records, Math.floor(first / 86400000) + 40586, Math.floor(last / 86400000) + 40589), spaceWeatherFrame(spwRows(gfz, first - 86400000, last + 2 * 86400000))];
const truth = new Products(e3.inputs.reference, e3.truthPrefixes);
const gpsTruth = new Products(e3.inputs.reference, [e3.regimes.GPS.truthPrefix]);
const regime = new Map();
for (const [name, spec] of Object.entries(e3.regimes)) if (spec.objects) for (const n of Object.keys(spec.objects)) regime.set(+n, name);
for (const n of truth.objects()) if (!regime.has(n) && truth.entries(n).some(e => e.product.startsWith(e3.regimes.GPS.truthPrefix) && e.comment.includes(`SP3 satellite ${e3.regimes.GPS.sp3System}`))) regime.set(n, 'GPS');
const ref = n => regime.get(n) === 'GPS' ? gpsTruth : truth;
const objects = [...regime.keys()].filter(n => ref(n).entries(n).length).sort((a, z) => a - z);
const days = dayList(...e3.windows.test);
const { sets, files } = readElementSets(e3.inputs.gpHistory, shiftDay(days[0], -10), days.at(-1), { keep: n => objects.includes(n), lagDays: e3.elementSets.creationLagDays, theory: e3.elementSets.meanElementTheory, ephemerisType: e3.elementSets.ephemerisType, duplicateEpochSeconds: e3.elementSets.duplicateEpochSeconds });
run.addInputs('gpHistory', files);
run.manifest.e3Objects = Object.fromEntries(Object.keys(e3.regimes).map(g => [g, objects.filter(n => regime.get(n) === g).length]));
run.manifest.e3IssueDays = days.length;

const history = readCreationDays(e3.inputs.gpHistory, shiftDay(days[0], -config.archiveLookbackDays), days.at(-1), { keep: n => objects.includes(n), theory: e3.elementSets.meanElementTheory, ephemerisType: e3.elementSets.ephemerisType });
run.addInputs('history', history.files);
console.log(`${run.id}: inputs ready; ${oldArcs.length} object/issue pairs; ${run.manifest.workers} single-threaded workers`);
// Inherited input bytes must match the published V1c manifest before scoring.
for (const kind of ['gpHistory', 'eop', 'weather']) for (const [file, hash] of Object.entries(run.manifest.inputs[kind] ?? {})) assert.equal(hash, parent.inputs[kind][file], `V1c input differs: ${file}`);
assert.equal(Object.values(run.manifest.inputs.kernel)[0], Object.values(parent.inputs.kernel)[0]);
const limit = os.cpus().length * v1c.maxLoadPerCpu;
const pilotFile = values.pilot ?? process.env.SDN_V1C2_PILOT;
assert(pilotFile, 'supply the sequential pilot for exact reproduction');
const pilotBytes = fs.readFileSync(pilotFile); run.write('pilot-arcs.jsonl', pilotBytes);
const pilot = new Map(pilotBytes.toString().trim().split('\n').map(JSON.parse).map(a => [a.key, a]));
run.manifest.pilot = { sha256: sha256(pilotBytes), arcs: pilot.size, matched: 0 };
for (const a of arcs) if (pilot.has(a.key)) { assert.deepEqual(a, pilot.get(a.key)); ++run.manifest.pilot.matched; }
let next = 0, completed = 0;
run.manifest.loadPeak = Math.max(run.manifest.loadPeak ?? 0, os.loadavg()[0]);
function makeWorker() {
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { modules, config, v1c } });
  let resolve, reject;
  const ready = new Promise((a, z) => { resolve = a; reject = z; });
  worker.on('error', error => reject(error));
  worker.on('message', message => {
    if (message.error) { reject(new Error(message.error)); return; }
    if (message.ready) { for (const p of message.provenance) run.addModule(p); resolve(); }
    else resolve(message.result);
  });
  return { ready, worker, request: job => new Promise((a, z) => { resolve = a; reject = z; worker.postMessage(job); }) };
}
const pool = [];
try {
  for (let i = 0; i < run.manifest.workers; i++) { const worker = makeWorker(); pool.push(worker); await worker.ready; }
  run.checkpoint();
  async function lane(worker) {
    while (next < oldArcs.length) {
      while (os.loadavg()[0] >= limit) { console.log(`Waiting for load ${os.loadavg()[0]} < ${limit}`); await sleep(15000); }
      if (next >= oldArcs.length) break;
      run.manifest.loadPeak = Math.max(run.manifest.loadPeak, os.loadavg()[0]);
      const prior = oldArcs[next++]; if (has(prior.key)) continue;
      const [, ns, day] = prior.key.split(':'), n = +ns;
      if (prior.skipped) { keep({ key: prior.key, norad: n, group: prior.group, missingHorizons: prior.missingHorizons, skipped: prior.skipped }); continue; }
      const ms = Date.parse(`${day}T${e3.issueTimeUtc}Z`) + e3.issueOffsetSeconds * 1000;
      const set = sets.filter(s => s.norad === n && epochMs(s.creationDate) <= ms && epochMs(s.epoch) <= ms).sort((a, z) => epochMs(z.epoch) - epochMs(a.epoch) || epochMs(z.creationDate) - epochMs(a.creationDate))[0];
      assert(set, 'V1c anchor missing');
      const targets = v1.horizonsHours.map(hours => { const t = ref(n).firstAtOrAfter(n, ms + hours * 3600000, e3.targetToleranceSeconds * 1000); return t ? { hours, ms: t.ms, state: [...t.r, ...t.v].map(x => x * 1000) } : null; }).filter(Boolean);
      assert.deepEqual(targets.map(t => t.hours), prior.methods.SGP4.samples.map(s => s.hours));
      const anchorMs = epochMs(set.epoch);
      const causal = history.sets.filter(s => s.norad === n && epochMs(s.creationDate) <= ms && epochMs(s.epoch) >= anchorMs - config.historyDays * 86400000 && epochMs(s.epoch) <= anchorMs + 1000);
      // Last stream entry is the selected V1c anchor, as the duplicate rule retains the later entry.
      const elements = [...causal.filter(s => s.gpId !== set.gpId), set];

      const env = environment(ms, targets.at(-1).ms, finals.records);
      run.addInputs('e3Reference', { ...truth.read, ...gpsTruth.read });
      for (const [file, hash] of Object.entries(run.manifest.inputs.e3Reference)) assert.equal(hash, parent.inputs.e3Reference[file]);
      truth.dropCache(); gpsTruth.dropCache();
      const arc = await worker.request({ prior, n, ms, set, targets, elements, env });
      if (pilot.has(arc.key)) { assert.deepEqual(arc, pilot.get(arc.key), 'parallel execution differs from sequential pilot'); ++run.manifest.pilot.matched; }
      keep(arc); completed++;
      if (values['stop-after'] && completed >= +values['stop-after']) next = oldArcs.length;
    }
  }
  await Promise.all(pool.map(lane));
} finally { await Promise.all(pool.map(p => p.worker.terminate())); }
if (arcs.length !== oldArcs.length) { console.log('Checkpoint; resume this run.'); process.exit(75); }
assert.equal(run.manifest.pilot.matched, pilot.size);
arcs.sort((a, z) => oldArcs.findIndex(p => p.key === a.key) - oldArcs.findIndex(p => p.key === z.key));
fs.writeFileSync(rawFile, arcs.map(a => JSON.stringify(a)).join('\n') + '\n');
run.manifest.e3ProductIndexes = [...truth.products, ...gpsTruth.products].map(p => ({ product: p.product, sha256: p.indexSha256 }));
assert.deepEqual(run.manifest.e3ProductIndexes, parent.e3ProductIndexes);
run.manifest.replayInputs = {};
const save = (file, relativePath, hash) => { const dest = path.join(run.dir, relativePath); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(file, dest); assert.equal(sha256(fs.readFileSync(dest)), hash); return relativePath; };
for (const kind of ['source', 'build', 'kernel']) for (const [file, hash] of Object.entries(run.manifest.inputs[kind] ?? {})) run.manifest.replayInputs[file] = save(file, `replay/inputs/${hash}-${path.basename(file)}`, hash);
for (const mod of run.manifest.modules) mod.replayPath = save(path.join(modules, mod.path, 'dist/isomorphic/module.wasm'), `replay/wasm/${mod.path}/module.wasm`, mod.wasmSha256);
run.manifest.generatedModuleChanges = execFileSync('git', ['diff', '--name-only'], { cwd: modules, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const manifest = run.finish({ rawSha256: sha256(fs.readFileSync(rawFile)), loadEnd: os.loadavg() });
publish(arcs, config, v1, e3, manifest);
console.log(`Recorded ${run.id}; run --check for E2E.`);
