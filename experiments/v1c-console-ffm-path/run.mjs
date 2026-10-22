#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import * as fb from 'flatbuffers';
import { selectSeeds, utcMs } from '../v1-ffm-physical-truth/seeds.mjs';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { observedFinals } from '../e3-combined-catalog/eop-finals.mjs';
import { readElementSets, epochMs, dayList, shiftDay } from '../../harness/gp-archive.mjs';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { c04Records, finalsRecords, eopFrame } from '../../harness/eop.mjs';
import { executionFrame, decodeExecution } from '../../harness/prw.mjs';
import { readGfzKp, spwRows, spaceWeatherFrame } from '../../harness/full-force.mjs';
import { convertIso } from '../../harness/time.mjs';
import { startRun, repoRoot } from '../../harness/provenance.mjs';
import { moduleFactory, bindings, coverage, resident, sgp4Client, distance } from './modules.mjs';
import { summarize, render, checkRecorded, publishRecorded } from './report.mjs';
const dir = path.dirname(new URL(import.meta.url).pathname), configPath = path.join(dir, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath));
const v1 = JSON.parse(fs.readFileSync(path.join(repoRoot, config.v1Config)));
const e3 = JSON.parse(fs.readFileSync(path.join(repoRoot, config.e3Config)));
const { values } = parseArgs({ options: { check: { type: 'boolean' }, report: { type: 'string' }, modules: { type: 'string' }, resume: { type: 'string' }, 'stop-after': { type: 'string' } } });
if (values.report) { publishRecorded(values.report, config, v1, e3); process.exit(0); }
if (values.check) { await checkRecorded(config, v1, e3); process.exit(0); }
assert(config.frozen && v1.frozen && e3.frozen, 'test window is locked');
for (const file of ['PLAN.md', 'config.json']) {
  const relative = `experiments/v1c-console-ffm-path/${file}`;
  assert.equal(execFileSync('git', ['show', `HEAD:${relative}`], { cwd: repoRoot }).toString(), fs.readFileSync(path.join(dir, file), 'utf8'), 'commit frozen registration before reading test data');
}
assert(fs.statfsSync(repoRoot).bavail * fs.statfsSync(repoRoot).bsize >= 20 * 1024 ** 3, 'disk guard: need 20 GiB');
const modules = path.resolve(values.modules ?? process.env.SDN_MODULES_ROOT ?? path.join(repoRoot, '../space-data-network-modules--ffm-console-path-v1-benchmark-20261022'));
const run = startRun({ experiment: config.experiment, step: 'run', configPath, modulesDir: modules, args: values, resume: values.resume });
const input = (kind, file) => { const bytes = fs.readFileSync(file); run.addInputs(kind, { [file]: sha256(bytes) }); return bytes; };
for (const f of [config.v1Config, config.e3Config, 'experiments/v1-ffm-physical-truth/seeds.mjs', 'harness/stats.mjs', 'results/v1/README.md', 'experiments/v1c-console-ffm-path/PLAN.md']) input('source', path.join(repoRoot, f));
run.manifest.cpuModel = os.cpus()[0].model;
run.manifest.moduleBuild = JSON.parse(input('build', path.join(modules, 'propagator/ffm/dist/build-provenance.json')));
run.manifest.threads = 1;
run.manifest.modulesRoot = modules;
const rawFile = path.join(run.dir, 'arcs.jsonl');
const arcs = fs.existsSync(rawFile) ? fs.readFileSync(rawFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const has = key => arcs.some(r => r.key === key);
const keep = arc => { arcs.push(arc); fs.appendFileSync(rawFile, JSON.stringify(arc) + '\n'); run.checkpoint(); console.log(`${run.id}: ${arc.key} (${arcs.length} arcs)`); };
const makeFfm = await moduleFactory(modules, 'propagator/ffm', run), b = await bindings(modules);
const parser = await loadModule(modules, 'data-source/eop-parser'); run.addModule(parser.provenance);
const time = await loadModule(modules, 'foundation/time'); run.addModule(time.provenance);
const c04 = await c04Records(parser, v1.inputs.eop); input('eop', v1.inputs.eop);
const finalsBytes = input('eop', e3.inputs.eopFinals);
const finals = await finalsRecords(parser, observedFinals(finalsBytes.toString('latin1')));
await parser.destroy();
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
const environment = (first, last, records) => [kernel, eopFrame(records, Math.floor(first / 86400000) + 40586, Math.floor(last / 86400000) + 40589), spaceWeatherFrame(spwRows(gfz, first - 86400000, last + 86400000))];
const limit = os.cpus().length * config.maxLoadPerCpu;
async function quiet() { while (os.loadavg()[0] >= limit) { console.log(`Waiting: load ${os.loadavg()[0].toFixed(2)} >= ${limit}`); await sleep(15000); } }
const cpuNow = () => process.threadCpuUsage();
const cpuSeconds = before => { const c = process.threadCpuUsage(before); return (c.user + c.system) / 1e6; };
async function propagate(seed, targets, configuration, env, mode, crAm, fixed = false, bstar = 0, timed = false) {
  env = env.filter(f => configuration.drag || f.portId !== 'space_weather');
  await quiet();
  const host = await makeFfm(); let client;
  const loadStart = os.loadavg(), wallStart = performance.now(); let cpu = 0, peakLoad = loadStart[0];
  const samples = [];
  try {
    let step;
    if (mode === 'coverage') {
      client = coverage(host, [configuration.frame, ...env], seed, bstar, fixed);
      if (configuration.name === 'FFM-1') assert.equal(client.profile, 'FFM-1');
      step = ms => client.step(ms);
    } else step = await resident(host, b, configuration, env, seed, crAm);
    const ticks = new Set(targets.map(t => t.ms));
    for (let ms = seed.ms + config.coverageStepSeconds * 1000; ms < targets.at(-1).ms; ms += config.coverageStepSeconds * 1000) ticks.add(ms);
    const targetAt = new Map(targets.map(t => [t.ms, t]));
    for (const ms of [...ticks].sort((a, z) => a - z)) {
      peakLoad = Math.max(peakLoad, os.loadavg()[0]);
      const before = cpuNow(); const actual = await step(ms); cpu += cpuSeconds(before);
      const t = targetAt.get(ms);
      if (t) {
        const truth = mode === 'coverage' ? client.transform(ms, t.state) : t.state;
        const gcrf = mode === 'coverage' ? client.transform(ms, [...actual, 0, 0, 0], true).slice(0, 3) : actual;
        samples.push({ hours: t.hours, elapsedHours: (ms - seed.ms) / 3600000, errorM: distance(actual, truth), position: gcrf });
      }
    }
    const loadEnd = os.loadavg(); peakLoad = Math.max(peakLoad, loadEnd[0]);
    return { samples, ...(timed ? { timing: { cpuSeconds: cpu, wallSeconds: (performance.now() - wallStart) / 1000, objectDays: (targets.at(-1).ms - seed.ms) / 86400000, loadStart, loadEnd, peakLoad, loadLimit: limit, admissible: peakLoad < limit } } : {}) };
  } finally { client?.dispose(); await host.destroy(); }
}
const ffmConfig = seed => ({ name: 'FFM-1', drag: true, frame: b.frame('configuration', 'EXECUTION_REQUEST', b.catalog.fullForceRequest({ epoch: seed.epoch, state: seed.state })) });
const seeds = selectSeeds(v1, v1.inputs.reference, { onInput: (file, hash) => run.addInputs('v1Reference', { [file]: hash }), log: console.log });
run.manifest.v1Seeds = { SLR: seeds.filter(s => s.group === 'SLR').length, GPS: seeds.filter(s => s.group === 'GPS').length };
assert.deepEqual(run.manifest.v1Seeds, { SLR: 16, GPS: 96 });
run.checkpoint();
console.log(`${run.id}: ${seeds.length} V1 seeds; ${os.cpus().length} CPUs; load ${os.loadavg()}`);
for (const s of seeds) {
  const key = `V1:${s.norad}:${s.seed.epoch}`; if (has(key)) continue;
  const seed = { epoch: s.seed.epoch, ms: utcMs(s.seed.epoch), state: [...s.seed.position, ...s.seed.velocity].map(x => x * 1000) };
  const targets = s.targets.map(t => ({ hours: t.hours, ms: utcMs(t.truth.epoch), state: [...t.truth.position, ...t.truth.velocity].map(x => x * 1000) }));
  const env = environment(seed.ms, targets.at(-1).ms, c04.records);
  const ef = { name: 'E-f', drag: false, frame: executionFrame({ epoch: seed.epoch, position: s.seed.position, velocity: s.seed.velocity, target: seed.epoch, kernel: true, integrator: v1.integrator, forces: { ...v1.configurations['E-f'], ...s.params } }) };
  // Resident configuration INITIAL is a placeholder; physical mass remains in FORCES.
  const efRequest = b.catalog.prw.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(ef.frame.payload)).unpack().EXECUTION_REQUEST;
  efRequest.INITIAL.HAS_MASS_KG = false; efRequest.INITIAL.MASS_KG = 0;
  ef.frame = b.frame('configuration', 'EXECUTION_REQUEST', efRequest);
  const physical = s.params.cr * s.params.areaM2 / s.params.massKg;
  const methods = {};
  methods['E-f coverage'] = await propagate(seed, targets, ef, env, 'coverage', .02);
  methods['E-f resident catalog coefficient'] = await propagate(seed, targets, ef, env, 'resident', .02);
  methods['E-f resident physical coefficient'] = await propagate(seed, targets, ef, env, 'resident', physical);
  const epoch = await convertIso(time, seed.epoch, 'UTC', 'TDB');
  const sampleEpochs = [];
  for (const t of s.targets) sampleEpochs.push(await convertIso(time, t.truth.epoch, 'UTC', 'TDB'));
  const host = await makeFfm();
  try {
    const response = await host.invoke({ methodId: 'invoke', inputs: [executionFrame({ epoch, timeScale: 'TDB', position: s.seed.position, velocity: s.seed.velocity, target: sampleEpochs.at(-1), samples: sampleEpochs, kernel: true, integrator: v1.integrator, forces: { ...v1.configurations['E-f'], ...s.params } }), ...env.filter(f => f.portId !== 'space_weather')] });
    assert.equal(response.statusCode, 0, response.errorMessage);
    methods['E-f execution physical coefficient'] = { samples: decodeExecution(response).samples.map((p, i) => ({ hours: targets[i].hours, errorM: distance(p.position.map(x => x * 1000), targets[i].state) })) };
  } finally { await host.destroy(); }
  const ffm = ffmConfig(seed);
  // Alternate order across seeds to reduce order bias in same-run CPU comparisons.
  for (const mode of arcs.length % 2 ? ['resident', 'coverage'] : ['coverage', 'resident']) methods[`FFM-1 ${mode}`] = await propagate(seed, targets, ffm, env, mode, .02, false, 0, true);
  keep({ key, suite: 'V1', group: s.group, methods });
  if (values['stop-after'] && arcs.length >= +values['stop-after']) { console.log('Checkpoint requested; resume this run.'); await time.destroy(); process.exit(75); }
}
await time.destroy();
// E3 selection is identical to 10-score.mjs; horizons alone are V1's six hours.
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
for (const n of objects) for (const day of days) {
  const key = `E3:${n}:${day}`; if (has(key)) continue;
  const ms = Date.parse(`${day}T${e3.issueTimeUtc}Z`) + e3.issueOffsetSeconds * 1000;
  const set = sets.filter(s => s.norad === n && epochMs(s.creationDate) <= ms && epochMs(s.epoch) <= ms).sort((a, z) => epochMs(z.epoch) - epochMs(a.epoch) || epochMs(z.creationDate) - epochMs(a.creationDate))[0];
  const targets = v1.horizonsHours.map(hours => { const t = ref(n).firstAtOrAfter(n, ms + hours * 3600000, e3.targetToleranceSeconds * 1000); return t ? { hours, ms: t.ms, state: [...t.r, ...t.v].map(x => x * 1000) } : null; }).filter(Boolean);
  if (!set || !targets.length) { keep({ key, suite: 'E3', group: regime.get(n), skipped: !set ? 'no OMM in force' : 'no truth', missingHorizons: v1.horizonsHours }); continue; }
  const sgp4 = await makeSgp4(set);
  try {
    const seed = { ms, epoch: new Date(ms).toISOString().replace('Z', ''), state: await sgp4.at(ms, true) };
    const env = environment(ms, targets.at(-1).ms, finals.records);
    const methods = { 'Console FFM-1': await propagate(seed, targets, ffmConfig(seed), env, 'coverage', .02, true, set.elements.BSTAR) };
    methods.SGP4 = { samples: [] };
    for (const t of targets) methods.SGP4.samples.push({ hours: t.hours, elapsedHours: (t.ms - ms) / 3600000, errorM: distance(await sgp4.at(t.ms), t.state) });
    run.addInputs('e3Reference', { ...truth.read, ...gpsTruth.read });
    keep({ key, suite: 'E3', group: regime.get(n), missingHorizons: v1.horizonsHours.filter(h => !targets.some(t => t.hours === h)), methods });
  } finally { await sgp4.destroy(); truth.dropCache(); gpsTruth.dropCache(); }
}
run.addInputs('e3Reference', { ...truth.read, ...gpsTruth.read });
run.manifest.e3ProductIndexes = [...truth.products, ...gpsTruth.products].map(p => ({ product: p.product, sha256: p.indexSha256 }));
const metrics = summarize(arcs, config, v1, e3);
run.write('metrics.json', metrics);
const manifest = run.finish({ rawSha256: sha256(fs.readFileSync(rawFile)) });
const output = path.join(repoRoot, 'results/v1c'); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'README.md'), render(metrics, manifest));
publishRecorded(run.id, config, v1, e3);
console.log(`Recorded ${run.id}; tables generated. Run --check for the E2E.`);
