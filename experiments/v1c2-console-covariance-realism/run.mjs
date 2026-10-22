#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { observedFinals } from '../e3-combined-catalog/eop-finals.mjs';
import { readElementSets, readCreationDays, epochMs, dayList, shiftDay } from '../../harness/gp-archive.mjs';
import { loadModule, sha256, gitState } from '../../harness/modules.mjs';
import { finalsRecords, eopFrame } from '../../harness/eop.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { readGfzKp, spwRows, spaceWeatherFrame } from '../../harness/full-force.mjs';
import { startRun, repoRoot } from '../../harness/provenance.mjs';
import { moduleFactory, bindings, coverage, sgp4Client, distance } from '../v1c-console-ffm-path/modules.mjs';
import { covarianceResident, score, validMatrix } from './modules.mjs';
import { checkRecorded, publish } from './report.mjs';
const dir = path.dirname(new URL(import.meta.url).pathname), configPath = path.join(dir, 'config.json');
const read = p => JSON.parse(fs.readFileSync(p));
const config = read(configPath), v1c = read(path.join(repoRoot, config.v1cConfig));
const v1 = read(path.join(repoRoot, v1c.v1Config)), e3 = read(path.join(repoRoot, v1c.e3Config));
const { values } = parseArgs({ options: { check: { type: 'boolean' }, modules: { type: 'string' }, 'v1c-run': { type: 'string' }, resume: { type: 'string' }, 'stop-after': { type: 'string' } } });
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
run.manifest.repositoryRoot = repoRoot; run.manifest.modulesRoot = modules; run.manifest.threads = 1;
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
  ...['PLAN.md', 'config.json', 'run.mjs', 'modules.mjs', 'report.mjs'].map(f => `experiments/v1c2-console-covariance-realism/${f}`)];
for (const f of sourceFiles) input('source', path.join(repoRoot, f));
for (const mod of ['propagator/ffm', 'propagator/sgp4', 'analysis/gp-error-model', 'data-source/eop-parser']) {
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
const makeFfm = await moduleFactory(modules, 'propagator/ffm', run), b = await bindings(modules);
const parser = await loadModule(modules, 'data-source/eop-parser'); run.addModule(parser.provenance);
const finals = await finalsRecords(parser, observedFinals(input('eop', e3.inputs.eopFinals).toString('latin1'))); await parser.destroy();
const gp = await loadModule(modules, 'analysis/gp-error-model'); run.addModule(gp.provenance);
const codec = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
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
const makeSgp4 = await sgp4Client(modules, await moduleFactory(modules, 'propagator/sgp4', run));
run.manifest.e3Objects = Object.fromEntries(Object.keys(e3.regimes).map(g => [g, objects.filter(n => regime.get(n) === g).length]));
run.manifest.e3IssueDays = days.length;

const history = readCreationDays(e3.inputs.gpHistory, shiftDay(days[0], -config.archiveLookbackDays), days.at(-1), { keep: n => objects.includes(n), theory: e3.elementSets.meanElementTheory, ephemerisType: e3.elementSets.ephemerisType });
run.addInputs('history', history.files);
// Inherited input bytes must match the published V1c manifest before scoring.
for (const kind of ['gpHistory', 'eop', 'weather']) for (const [file, hash] of Object.entries(run.manifest.inputs[kind] ?? {})) assert.equal(hash, parent.inputs[kind][file], `V1c input differs: ${file}`);
assert.equal(Object.values(run.manifest.inputs.kernel)[0], Object.values(parent.inputs.kernel)[0]);
const limit = os.cpus().length * v1c.maxLoadPerCpu;
const relative = (a, z) => Math.max(...a.map((x, i) => Math.abs(x - z[i]))) / Math.max(...z.map(Math.abs));
for (const prior of oldArcs) {
  if (has(prior.key)) continue;
  while (os.loadavg()[0] >= limit) { console.log(`Waiting for load ${os.loadavg()[0]} < ${limit}`); await sleep(15000); }
  const [, ns, day] = prior.key.split(':'), n = +ns;
  const arc = { key: prior.key, norad: n, group: prior.group, missingHorizons: prior.missingHorizons };
  if (prior.skipped) { keep({ ...arc, skipped: prior.skipped }); continue; }
  const ms = Date.parse(`${day}T${e3.issueTimeUtc}Z`) + e3.issueOffsetSeconds * 1000;
  const set = sets.filter(s => s.norad === n && epochMs(s.creationDate) <= ms && epochMs(s.epoch) <= ms).sort((a, z) => epochMs(z.epoch) - epochMs(a.epoch) || epochMs(z.creationDate) - epochMs(a.creationDate))[0];
  assert(set, 'V1c anchor missing');
  const targets = v1.horizonsHours.map(hours => { const t = ref(n).firstAtOrAfter(n, ms + hours * 3600000, e3.targetToleranceSeconds * 1000); return t ? { hours, ms: t.ms, state: [...t.r, ...t.v].map(x => x * 1000) } : null; }).filter(Boolean);
  assert.deepEqual(targets.map(t => t.hours), prior.methods.SGP4.samples.map(s => s.hours));
  const anchorMs = epochMs(set.epoch);
  const causal = history.sets.filter(s => s.norad === n && epochMs(s.creationDate) <= ms && epochMs(s.epoch) >= anchorMs - config.historyDays * 86400000 && epochMs(s.epoch) <= anchorMs + 1000);
  // Last stream entry is the selected V1c anchor, as the duplicate rule retains the later entry.
  const elements = [...causal.filter(s => s.gpId !== set.gpId), set];
  const asks = [ms, ...targets.map(t => t.ms)].map((t, i) => ({ id: String(i), set: { norad: n, epoch: set.epoch }, ageDays: (t - anchorMs) / 86400000 }));
  const response = await gp.invoke('object_covariance', [ommFrame(elements, 'elements'), codec.frame('request', 'objects', { objects: asks })]);
  const cov = codec.decode(response.outputs.find(f => f.portId === 'covariance').payload).objects;
  assert.equal(cov.length, asks.length);
  const supported = c => ['EMPIRICAL', 'POPULATION'].includes(c.status);
  for (const c of cov) if (supported(c)) validMatrix(c.covarianceInertial, config.covarianceSymmetryRelative);
  const sgp4 = await makeSgp4(set), host = await makeFfm(); let catalog;
  try {
    const fixedSeed = { ms, epoch: new Date(ms).toISOString().replace('Z', ''), state: await sgp4.at(ms, true) };
    const configuration = b.frame('configuration', 'EXECUTION_REQUEST', b.catalog.fullForceRequest({ epoch: fixedSeed.epoch, state: fixedSeed.state }));
    const env = environment(ms, targets.at(-1).ms, finals.records);
    catalog = coverage(host, [configuration, ...env], fixedSeed, set.elements.BSTAR, true);
    assert.equal(catalog.profile, 'FFM-1');
    const seed = { ...fixedSeed, state: catalog.transform(ms, fixedSeed.state, true) };
    // Resident and coverage are separate module instances, exactly as in the console.
    const residentHost = supported(cov[0]) ? await makeFfm() : null;
    try {
      const step = residentHost ? await covarianceResident(residentHost, b, configuration, env, seed, cov[0].covarianceInertial, set.elements.BSTAR) : null;
      if (step) { const zero = await step(ms); arc.zeroTimeCovarianceRelative = relative(zero.covariance, cov[0].covarianceInertial); assert(arc.zeroTimeCovarianceRelative <= config.zeroTimeCovarianceRelative); }
      const ticks = new Set(targets.map(t => t.ms));
      for (let t = ms + v1c.coverageStepSeconds * 1000; t < targets.at(-1).ms; t += v1c.coverageStepSeconds * 1000) ticks.add(t);
      const at = new Map(targets.map((t, i) => [t.ms, { ...t, covariance: cov[i + 1] }]));
      arc.samples = [];
      for (const tms of [...ticks].sort((a, z) => a - z)) {
        const covered = catalog.step(tms), t = at.get(tms); if (!t) continue;
        const resident = step ? await step(tms) : null;
        const sgpState = await sgp4.at(tms), oldSgp = prior.methods.SGP4.samples.find(s => s.hours === t.hours), oldFfm = prior.methods['Console FFM-1'].samples.find(s => s.hours === t.hours);
        const sample = { hours: t.hours, elapsedHours: (tms - ms) / 3600000, sgp4ErrorDifferenceM: Math.abs(distance(sgpState, t.state) - oldSgp.errorM),
          SGP4: { status: t.covariance.status, d2: null }, 'FFM-1': { status: cov[0].status, d2: null } };
        assert(sample.sgp4ErrorDifferenceM <= config.pathAgreementM, `SGP4 replay mismatch ${prior.key}`);
        const coverageState = catalog.transform(tms, [...covered, 0, 0, 0], true);
        assert(distance(coverageState, oldFfm.position) <= config.pathAgreementM, 'coverage replay mismatch');
        if (supported(t.covariance)) Object.assign(sample.SGP4, await score(gp, codec, sgpState, t.covariance.covarianceInertial, t.state));
        if (resident) {
          validMatrix(resident.covariance, config.covarianceSymmetryRelative);
          sample.residentCoverageDifferenceM = distance(resident.state, oldFfm.position);
          assert(sample.residentCoverageDifferenceM <= config.pathAgreementM, `FFM replay mismatch ${prior.key} ${t.hours}h: ${sample.residentCoverageDifferenceM} m`);
          Object.assign(sample['FFM-1'], await score(gp, codec, [...oldFfm.position, ...resident.state.slice(3)], resident.covariance, t.state));
        }
        arc.samples.push(sample);
      }
    } finally { await residentHost?.destroy(); }
    run.addInputs('e3Reference', { ...truth.read, ...gpsTruth.read });
    for (const [file, hash] of Object.entries(run.manifest.inputs.e3Reference)) assert.equal(hash, parent.inputs.e3Reference[file]);
    keep(arc);
  } finally { catalog?.dispose(); await host.destroy(); await sgp4.destroy(); truth.dropCache(); gpsTruth.dropCache(); }
  if (values['stop-after'] && arcs.length >= +values['stop-after']) { await gp.destroy(); console.log('Checkpoint; resume this run.'); process.exit(75); }
}
await gp.destroy();
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
