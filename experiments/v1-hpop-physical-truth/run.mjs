#!/usr/bin/env node
// V1: propagator/hpop seeded from precise orbits and compared with the same
// precise orbits later, force by force (PLAN.md). Modules compute; this file
// selects states, converts nothing itself, and takes norms of differences.
//
//   node experiments/v1-hpop-physical-truth/run.mjs [--modules DIR] [--reference DIR] [--eop FILE] [--quick]
//        [--budget SECONDS] [--resume RUN_ID]
// With --budget the run stops after the seed that crosses the budget, keeping
// what it has in partial.jsonl, and exits 75; --resume continues it.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadModule, modulesRoot } from '../../harness/modules.mjs';
import { selectSeeds, utcMs } from './seeds.mjs';
import { decodeExecution, decodeResident, executionFrame, kernelFrame, residentIngestFrames, residentRequestFrame } from '../../harness/prw.mjs';
import { convertIso } from '../../harness/time.mjs';
import { c04Records, eopFrame } from '../../harness/eop.mjs';
import { repoRoot, startRun } from '../../harness/provenance.mjs';
import { median } from '../../harness/stats.mjs';
import { sha256 } from '../../harness/modules.mjs';

const configPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { values } = parseArgs({ options: { modules: { type: 'string' }, reference: { type: 'string' }, eop: { type: 'string' }, quick: { type: 'boolean' }, budget: { type: 'string' }, resume: { type: 'string' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const referenceDir = path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference);
const run = startRun({ experiment: config.experiment, step: 'run', configPath, modulesDir: modules, args: values, resume: values.resume });
const budgetMs = values.budget ? Number(values.budget) * 1000 : Infinity;
const invocationStart = performance.now();
const log = (...a) => console.log(`[${run.id}]`, ...a);

// ── Reference states (seeds.mjs) ──
const seeds = selectSeeds(config, referenceDir, { quick: values.quick, log, onInput: (file, hash) => run.addInputs('reference', { [file]: hash }) });
log(`${seeds.filter((s) => s.group === 'SLR').length} SLR seeds, ${seeds.filter((s) => s.group === 'GPS').length} GPS seeds`);

// ── Modules ──
const hpop = await loadModule(modules, 'propagator/hpop');
const time = await loadModule(modules, 'foundation/time');
run.addModule(hpop.provenance);
run.addModule(time.provenance);
const kernelBytes = fs.readFileSync(path.join(modules, config.inputs.kernel));
run.addInputs('kernel', { [config.inputs.kernel]: sha256(kernelBytes) });
const kernel = kernelFrame(kernelBytes);
// Earth orientation for the configurations that ask for it (amendment A3):
// IERS EOP C04 rows through data-source/eop-parser, one window covering every
// arc, from a day before the first seed to two days after the last target.
let earthOrientation = null;
if (Object.values(config.configurations).some((f) => f.eop)) {
  const eopFile = path.resolve(values.eop ?? process.env.SDN_EOP_C04 ?? config.inputs.eop);
  const parser = await loadModule(modules, 'data-source/eop-parser');
  run.addModule(parser.provenance);
  const parsed = await c04Records(parser, eopFile);
  run.addInputs('eop', { [path.basename(eopFile)]: parsed.sha256 });
  const mjd = (iso) => Math.floor(utcMs(iso) / 86400000) + 40587;
  const first = Math.min(...seeds.map((s) => mjd(s.seed.epoch))) - 1;
  const last = Math.max(...seeds.flatMap((s) => s.targets.map((t) => mjd(t.truth.epoch)))) + 2;
  earthOrientation = eopFrame(parsed.records, first, last);
  log(`EOP: ${earthOrientation.rows} C04 rows, MJD ${first}..${last}`);
  await parser.destroy();
}
const tdbCache = new Map();
const tdb = async (iso) => {
  if (!tdbCache.has(iso)) tdbCache.set(iso, await convertIso(time, iso, 'UTC', 'TDB'));
  return tdbCache.get(iso);
};
const errorM = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;

// ── V1.1: two-body, five Kepler periods ──
const tb = seeds.find((s) => s.object === 'lageos1');
const { periods, muKm3S2, limitM } = config.criteria.twoBody;
const r = Math.hypot(...tb.seed.position), v = Math.hypot(...tb.seed.velocity);
const a = 1 / (2 / r - (v * v) / muKm3S2);                    // vis-viva
const periodS = 2 * Math.PI * Math.sqrt(a ** 3 / muKm3S2);     // Kepler's third law
// TDB ISO text plus seconds, in integer nanoseconds (TDB is uniform here).
const addSeconds = (iso, seconds) => {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?$/.exec(iso);
  const ns = BigInt(Date.parse(`${m[1]}Z`)) * 1000000n + BigInt((m[2] ?? '').padEnd(9, '0').slice(0, 9)) + BigInt(Math.round(seconds * 1e9));
  const whole = ns / 1000000000n, frac = ns % 1000000000n;
  return `${new Date(Number(whole) * 1000).toISOString().slice(0, 19)}.${String(frac).padStart(9, '0')}`;
};
const seed0 = await tdb(tb.seed.epoch);
const twoBodyTarget = addSeconds(seed0, periods * periodS);
const twoBody = decodeExecution(await hpop.invoke('invoke', [executionFrame({ epoch: seed0, timeScale: 'TDB', position: tb.seed.position, velocity: tb.seed.velocity,
  target: twoBodyTarget, samples: [twoBodyTarget], integrator: config.integrator, forces: {} })]));
const twoBodyErrorM = errorM(twoBody.final.position, tb.seed.position);
const checks = { 'V1.1': { description: `two-body, ${periods} Kepler periods from LAGEOS-1: return to the start`, periodS, errorM: twoBodyErrorM, limitM, pass: twoBodyErrorM < limitM } };
log(`V1.1 two-body: ${periods} periods of ${periodS.toFixed(3)} s, return error ${twoBodyErrorM.toExponential(3)} m`);

// ── Execution configurations ──
// results: {group, object, norad, arc, seedEpoch, configuration, hours, errorM},
// kept one seed at a time in partial.jsonl so a split run can resume.
const partialFile = path.join(run.dir, 'partial.jsonl');
const results = fs.existsSync(partialFile) ? fs.readFileSync(partialFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const has = (s, cfg) => results.some((x) => x.object === s.object && x.seedEpoch === s.seed.epoch && x.configuration === cfg);
const keep = (rows) => { results.push(...rows); fs.appendFileSync(partialFile, rows.map((r) => `${JSON.stringify(r)}\n`).join('')); };
const overBudget = () => performance.now() - invocationStart > budgetMs;
const stopIncomplete = (done, total) => {
  run.checkpoint();
  log(`incomplete: ${done}/${total}; continue with --resume ${run.id}`);
  process.exit(75);
};
const started = performance.now();
for (const [i, s] of seeds.entries()) {
  if (Object.keys(config.configurations).every((name) => has(s, name))) continue;
  const rows = [];
  const epoch = await tdb(s.seed.epoch);
  const targets = [];
  for (const t of s.targets) targets.push(await tdb(t.truth.epoch));
  for (const [name, forces] of Object.entries(config.configurations)) {
    const withKernel = (forces.thirdBodies ?? []).length > 0 || forces.srp;
    const request = { epoch, timeScale: 'TDB', position: s.seed.position, velocity: s.seed.velocity, samples: targets, target: targets.at(-1),
      integrator: config.integrator, forces: { ...forces, ...(forces.srp ? s.params : {}) }, kernel: withKernel };
    try {
      const out = decodeExecution(await hpop.invoke('invoke', [executionFrame(request), ...(withKernel ? [kernel] : []), ...(forces.eop ? [earthOrientation] : [])]));
      out.samples.forEach((p, k) => rows.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: name, hours: s.targets[k].hours, errorM: errorM(p.position, s.targets[k].truth.position) }));
    } catch (error) {
      rows.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: name, error: String(error.message).slice(0, 300) });
    }
  }
  keep(rows);
  if ((i + 1) % 10 === 0) process.stderr.write(`\r${i + 1}/${seeds.length} seeds, ${((performance.now() - started) / 1000).toFixed(0)} s`);
  if (overBudget() && i < seeds.length - 1) stopIncomplete(`${i + 1} execution seeds`, `${seeds.length}`);
}
process.stderr.write('\n');

// ── Resident model, R-20 ──
const ingest = residentIngestFrames('v1-resident', 1, seeds.map((s, k) => ({ handle: k + 1, norad: s.norad, epoch: s.seed.epoch, position: s.seed.position, velocity: s.seed.velocity })));
await hpop.invoke('ingest_state', ingest.frames);
for (const [k, s] of seeds.entries()) {
  if (has(s, 'R-20')) continue;
  const rows = [];
  for (const t of s.targets) {
    try {
      const out = decodeResident(await hpop.invoke('propagate_state', [residentRequestFrame(ingest.identity, t.truth.epoch, [k + 1])]));
      rows.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: 'R-20', hours: t.hours, errorM: errorM(out.position, t.truth.position) });
    } catch (error) {
      rows.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: 'R-20', hours: t.hours, error: String(error.message).slice(0, 300) });
    }
  }
  keep(rows);
  if (overBudget() && k < seeds.length - 1) stopIncomplete(`${k + 1} resident seeds`, `${seeds.length}`);
}

// ── Criteria ──
const find = (s, cfg, h) => results.find((x) => x.object === s.object && x.seedEpoch === s.seed.epoch && x.configuration === cfg && x.hours === h)?.errorM;
const ordering = (group, pairs, hours) => {
  const failures = [];
  for (const s of seeds.filter((x) => x.group === group)) {
    for (const [better, worse] of pairs) {
      const b = find(s, better, hours), w = find(s, worse, hours);
      if (!(b < w)) failures.push({ object: s.object, seedEpoch: s.seed.epoch, better, worse, hours, betterM: b ?? null, worseM: w ?? null });
    }
  }
  return failures;
};
const c = config.criteria;
const slrFail = [...ordering('SLR', c.slrOrdering.pairs, c.slrOrdering.atHours), ...ordering('SLR', [c.slrOrdering.srpPair], c.slrOrdering.srpAtHours)];
checks['V1.2'] = { description: 'each added force reduces the error (SLR: zonals, Sun and Moon at 24 h, radiation pressure at 72 h; GPS: zonals, Sun and Moon at 24 h)', failures: [...slrFail, ...ordering('GPS', c.gpsOrdering.pairs, c.gpsOrdering.atHours)] };
checks['V1.2'].pass = checks['V1.2'].failures.length === 0;
checks['V1.3'] = { description: 'the resident 20x20 field beats zonals alone for GPS at 24 h (tesserals)', failures: ordering('GPS', [c.tesserals.pair], c.tesserals.atHours) };
checks['V1.3'].pass = checks['V1.3'].failures.length === 0;
const slrEd = seeds.filter((s) => s.group === 'SLR').map((s) => find(s, c.magnitude.configuration, c.magnitude.atHours)).filter(Number.isFinite);
checks['V1.4'] = { description: `median ${c.magnitude.atHours} h error of ${c.magnitude.configuration} over SLR seeds`, medianM: median(slrEd), limitM: c.magnitude.medianBelowM, n: slrEd.length, pass: median(slrEd) < c.magnitude.medianBelowM };

// Summary: median error by group, configuration and horizon.
const summary = [];
for (const group of ['SLR', 'GPS']) {
  for (const cfg of [...Object.keys(config.configurations), 'R-20']) {
    const row = { group, configuration: cfg };
    for (const h of config.horizonsHours) {
      const xs = results.filter((x) => x.group === group && x.configuration === cfg && x.hours === h && Number.isFinite(x.errorM)).map((x) => x.errorM);
      row[`${h}h`] = { n: xs.length, medianM: median(xs), maxM: Math.max(...xs) };
    }
    row.errors = results.filter((x) => x.group === group && x.configuration === cfg && x.error).length;
    summary.push(row);
  }
}
run.write('metrics.json', { checks, summary, results });

// Report, from the metrics above.
const fmt = (x) => (Number.isFinite(x) ? (x >= 100 ? x.toFixed(0) : x.toFixed(2)) : '—');
const lines = [`# V1 results: \`${run.id}\``, '', 'Generated by `experiments/v1-hpop-physical-truth/run.mjs`. Do not edit by hand.', '', '## Criteria', '', '| Check | Result | Detail |', '| --- | --- | --- |'];
lines.push(`| V1.1 | ${checks['V1.1'].pass ? 'PASS' : 'FAIL'} | ${checks['V1.1'].description}: ${checks['V1.1'].errorM.toExponential(2)} m (limit ${limitM} m) |`);
for (const id of ['V1.2', 'V1.3']) lines.push(`| ${id} | ${checks[id].pass ? 'PASS' : 'FAIL'} | ${checks[id].description}; ${checks[id].failures.length} violations |`);
lines.push(`| V1.4 | ${checks['V1.4'].pass ? 'PASS' : 'FAIL'} | ${checks['V1.4'].description}: ${fmt(checks['V1.4'].medianM)} m over ${checks['V1.4'].n} seeds (limit ${checks['V1.4'].limitM} m) |`, '');
for (const group of ['SLR', 'GPS']) {
  lines.push(`## ${group}: median (max) 3D position error, m`, '', `| Configuration | ${config.horizonsHours.map((h) => `${h} h`).join(' | ')} | Failed calls |`, `| --- | ${config.horizonsHours.map(() => '---:').join(' | ')} | ---: |`);
  for (const row of summary.filter((x) => x.group === group)) lines.push(`| ${row.configuration} | ${config.horizonsHours.map((h) => `${fmt(row[`${h}h`].medianM)} (${fmt(row[`${h}h`].maxM)})`).join(' | ')} | ${row.errors} |`);
  lines.push('');
}
for (const id of ['V1.2', 'V1.3']) {
  if (!checks[id].failures.length) continue;
  lines.push(`## ${id} violations`, '', '| Object | Seed (UTC) | Expected better | Error, m | Expected worse | Error, m | At |', '| --- | --- | --- | ---: | --- | ---: | ---: |');
  for (const f of checks[id].failures) lines.push(`| ${f.object} | ${f.seedEpoch} | ${f.better} | ${fmt(f.betterM)} | ${f.worse} | ${fmt(f.worseM)} | ${f.hours} h |`);
  lines.push('');
}
const failedCalls = results.filter((x) => x.error);
if (failedCalls.length) lines.push('## Failed calls', '', ...[...new Set(failedCalls.map((x) => `- ${x.configuration}: ${x.error}`))].slice(0, 20), '');
run.write('REPORT.md', `${lines.join('\n')}\n`);
run.finish({ timeConversions: tdbCache.size });
for (const [id, ch] of Object.entries(checks)) log(`${id} ${ch.pass ? 'PASS' : 'FAIL'}: ${ch.description}`);
await hpop.destroy();
await time.destroy();
