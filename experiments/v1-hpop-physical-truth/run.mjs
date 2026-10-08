#!/usr/bin/env node
// V1: propagator/hpop seeded from precise orbits and compared with the same
// precise orbits later, force by force (PLAN.md). Modules compute; this file
// selects states, converts nothing itself, and takes norms of differences.
//
//   node experiments/v1-hpop-physical-truth/run.mjs [--modules DIR] [--reference DIR] [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadModule, modulesRoot } from '../../harness/modules.mjs';
import { decodeOemStream } from '../../harness/records.mjs';
import { decodeExecution, decodeResident, executionFrame, kernelFrame, residentIngestFrames, residentRequestFrame } from '../../harness/prw.mjs';
import { convertIso } from '../../harness/time.mjs';
import { repoRoot, startRun } from '../../harness/provenance.mjs';
import { median } from '../../harness/stats.mjs';
import { sha256 } from '../../harness/modules.mjs';

const configPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { values } = parseArgs({ options: { modules: { type: 'string' }, reference: { type: 'string' }, quick: { type: 'boolean' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const referenceDir = path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference);
const run = startRun({ experiment: config.experiment, step: 'run', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);

// ── Reference states ──
const HOUR_MS = 3600000;
const utcMs = (iso) => Date.parse(/Z$/.test(iso) ? iso : `${iso}Z`);
const readArc = (files) => {
  const byTime = new Map();
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(referenceDir, file));
    run.addInputs('reference', { [file]: sha256(bytes) });
    for (const line of decodeOemStream(new Uint8Array(bytes))[0].EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES) {
      byTime.set(utcMs(line.EPOCH), { epoch: line.EPOCH.replace(/Z$/, ''), position: [line.X, line.Y, line.Z], velocity: [line.X_DOT, line.Y_DOT, line.Z_DOT] });
    }
  }
  return byTime;
};
const dirs = fs.readdirSync(referenceDir).sort();
const seeds = [];  // {group, object, norad, seed, targets: [{hours, truth}], params}
for (const o of config.slr.objects) {
  for (const arc of config.slr.arcs) {
    const product = dirs.find((d) => d.startsWith(`ilrsa.orb.${o.name}.${arc}`));
    if (!product) { log(`missing ILRS arc ${o.name} ${arc}`); continue; }
    const states = readArc([path.join(product, `${o.norad}.oem`)]);
    const t0 = Math.min(...states.keys());
    for (const offset of config.slr.seedOffsetsHours) {
      const start = t0 + offset * HOUR_MS;
      const targets = config.horizonsHours.map((h) => ({ hours: h, truth: states.get(start + h * HOUR_MS) })).filter((t) => t.truth);
      if (!states.has(start) || targets.length !== config.horizonsHours.length) { log(`skipped ${o.name} ${arc} +${offset} h: horizon not inside the arc`); continue; }
      const areaM2 = Math.PI * (o.diameterM / 2) ** 2;
      seeds.push({ group: 'SLR', object: o.name, norad: o.norad, arc, seed: states.get(start), targets, params: { massKg: o.massKg, areaM2, cr: o.cr } });
    }
  }
}
const igs = dirs.filter((d) => d.startsWith(config.gps.productPrefix));
const gpsObjects = [...new Set(igs.flatMap((d) => JSON.parse(fs.readFileSync(path.join(referenceDir, d, 'index.json'))).objects.map((o) => o.norad)))].sort((a, b) => a - b);
for (const norad of values.quick ? gpsObjects.slice(0, 3) : gpsObjects) {
  const states = readArc(igs.filter((d) => fs.existsSync(path.join(referenceDir, d, `${norad}.oem`))).map((d) => path.join(d, `${norad}.oem`)));
  for (const day of config.gps.seedDays) {
    const start = [...states.keys()].sort((a, b) => a - b).find((t) => t >= Date.parse(`${day}T00:00:00Z`));
    const targets = config.horizonsHours.map((h) => ({ hours: h, truth: states.get(start + h * HOUR_MS) })).filter((t) => t.truth);
    if (start === undefined || targets.length !== config.horizonsHours.length) continue;
    seeds.push({ group: 'GPS', object: `gps-${norad}`, norad, arc: day, seed: states.get(start), targets, params: { massKg: config.gps.massKg, areaM2: config.gps.areaM2, cr: config.gps.cr } });
  }
}
log(`${seeds.filter((s) => s.group === 'SLR').length} SLR seeds, ${seeds.filter((s) => s.group === 'GPS').length} GPS seeds`);

// ── Modules ──
const hpop = await loadModule(modules, 'propagator/hpop');
const time = await loadModule(modules, 'foundation/time');
run.addModule(hpop.provenance);
run.addModule(time.provenance);
const kernelBytes = fs.readFileSync(path.join(modules, config.inputs.kernel));
run.addInputs('kernel', { [config.inputs.kernel]: sha256(kernelBytes) });
const kernel = kernelFrame(kernelBytes);
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
const results = [];  // {group, object, norad, arc, seedEpoch, configuration, hours, errorM}
const started = performance.now();
for (const [i, s] of seeds.entries()) {
  const epoch = await tdb(s.seed.epoch);
  const targets = [];
  for (const t of s.targets) targets.push(await tdb(t.truth.epoch));
  for (const [name, forces] of Object.entries(config.configurations)) {
    const withKernel = (forces.thirdBodies ?? []).length > 0 || forces.srp;
    const request = { epoch, timeScale: 'TDB', position: s.seed.position, velocity: s.seed.velocity, samples: targets, target: targets.at(-1),
      integrator: config.integrator, forces: { ...forces, ...(forces.srp ? s.params : {}) }, kernel: withKernel };
    try {
      const out = decodeExecution(await hpop.invoke('invoke', [executionFrame(request), ...(withKernel ? [kernel] : [])]));
      out.samples.forEach((p, k) => results.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: name, hours: s.targets[k].hours, errorM: errorM(p.position, s.targets[k].truth.position) }));
    } catch (error) {
      results.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: name, error: String(error.message).slice(0, 300) });
    }
  }
  if ((i + 1) % 10 === 0) process.stderr.write(`\r${i + 1}/${seeds.length} seeds, ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
process.stderr.write('\n');

// ── Resident model, R-20 ──
const ingest = residentIngestFrames('v1-resident', 1, seeds.map((s, k) => ({ handle: k + 1, norad: s.norad, epoch: s.seed.epoch, position: s.seed.position, velocity: s.seed.velocity })));
await hpop.invoke('ingest_state', ingest.frames);
for (const [k, s] of seeds.entries()) {
  for (const t of s.targets) {
    try {
      const out = decodeResident(await hpop.invoke('propagate_state', [residentRequestFrame(ingest.identity, t.truth.epoch, [k + 1])]));
      results.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: 'R-20', hours: t.hours, errorM: errorM(out.position, t.truth.position) });
    } catch (error) {
      results.push({ group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedEpoch: s.seed.epoch, configuration: 'R-20', hours: t.hours, error: String(error.message).slice(0, 300) });
    }
  }
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
