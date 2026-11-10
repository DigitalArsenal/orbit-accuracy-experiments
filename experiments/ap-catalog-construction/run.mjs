#!/usr/bin/env node
// Registered runner of experiments/ap-catalog-construction (PLAN.md, config.json). Modules compute: public sets fly on sdn-ap
// 0.6.5's own SGP4, AP records are fitted and flown by the same module, operator files are read and carried to GCRF by the reader
// modules, the provider's XP sets fly on propagator/sgp4-xp 0.2.1. This file moves records and counts.
//   node experiments/ap-catalog-construction/run.mjs --check                  end to end on made-up sets (no catalog data)
//   node experiments/ap-catalog-construction/run.mjs --part 1|2 [--shard i/n] per-set rows to <store>/part<N>/ (never committed)
//   node experiments/ap-catalog-construction/run.mjs --part H [--shard i/n]   part H rows to <store>/partH/
//   node experiments/ap-catalog-construction/run.mjs --part dev-B [--shard i/n] the disclosed dry run, rows to runs/ap-catalog-construction/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CONFIG, HERE, REPO, MODULES, DAY, sha256, wasmSha, tleMs, grid, classifyOrbitRegime, fitAp, flyAp, flySgp4, score, spwFor, freshHost } from './lib/engine.mjs';
import { makeWindow, loadPublicSets, truthIndex, truthFor, truthCounts } from './lib/sets.mjs';
import { armStates, afterLastJump } from './lib/arms.mjs';
import { INPUTS, inputFiles } from './lib/inputs.mjs';
import { ratioWithInterval, verdict } from '../ap-from-public-sets/lib.mjs';
import { catalogDecision } from './table.mjs';

const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
if (!CONFIG.frozen) throw new Error('config.json is not frozen: the plan is registered first (README rule 2)');

/** One arm's AP record for one set, flown to `at`: { name, p, d, rms } or { name, e } or null when the arm does not exist. */
async function armRecord(name, { norad, tle, prior, inputT0, at, truth, fromMs, perDay, guard, days }) {
  const a = CONFIG.arms[name];
  const states = a.input ? await INPUTS[name](norad, inputT0, guard) : armStates(name, tle, prior);
  if (!states) return null;
  const f = await fitAp({ norad, states, eccentricity: tle.e, spwBytes: spwFor(a.input ? inputT0 : tleMs(tle)), placement: a.recordEpoch === 'last' ? 2 : 0, sourceId: a.input ?? 'gp-own-epoch' });
  if (!f.ok) return { name, e: f.error };
  const ap = await flyAp(f.ocmBytes, at);
  if (ap.error) return { name, e: ap.error };
  const s = score(ap.r, truth, fromMs, perDay, days);
  return { name, p: s.primary, d: s.days, rms: Math.round(f.rmsM * 10) / 10 };
}

/** The served record (the class's chain, first arm that exists) and the earlier construction's (D5, else B3), sharing fits. */
async function servedAndEarlier(cls, ctx) {
  const done = new Map();
  const get = async (name) => { if (!done.has(name)) done.set(name, await armRecord(name, ctx)); return done.get(name); };
  const first = async (chain) => { for (const n of chain) { const r = await get(n); if (r && !r.e) return n; } return 'A'; };
  const served = await first(CONFIG.servedRule[cls]), earlier = await first(CONFIG.earlierConstruction);
  return { served, earlier, arms: Object.fromEntries([...done].filter(([, r]) => r).map(([n, r]) => [n, r.e ? { e: r.e.slice(0, 80) } : { p: r.p, d: r.d, rms: r.rms }])) };
}

// ---- the end-to-end check: made-up sets through the whole construction (no catalog data) ----
if (argv.includes('--check')) {
  const problems = [];
  const t0 = Date.parse('2026-06-15T00:00:00Z');
  const jd = { whole: Math.floor(t0 / DAY) + 2440587.5, frac: 0 };
  const guard = makeWindow({ from: t0 - 30 * DAY, to: t0 + 30 * DAY });
  try { spwFor(t0); } catch (error) { console.log(`SKIPPED, not a pass: the weather archive is not readable here (${String(error.message).slice(0, 120)})`); process.exit(1); }
  // A made-up set's own SGP4 flight stands in for truth. A history of made-up sets cannot be made without orbit mathematics in this
  // file, so the history arms see copies of the current set with its own epoch: their flights agree, and every arm's path runs.
  const cases = [
    { label: 'MEO-like (K12)', copies: 2, set: { norad: 99901, ...jd, n: 2.0057, e: 0.005, inc: 55, raan: 120, argp: 30, ma: 10, bstar: 0, ndot: 0, nddot: 0 }, expect: 'K12' },
    { label: 'GEO-like (KG8c)', copies: 2, set: { norad: 99902, ...jd, n: 1.0027, e: 0.0002, inc: 40, raan: 80, argp: 270, ma: 50, bstar: 0, ndot: 0, nddot: 0 }, expect: 'KG8c' },
    { label: '690 km (KM5)', copies: 8, set: { norad: 99903, ...jd, n: 14.6, e: 0.001, inc: 98.2, raan: 120, argp: 90, ma: 10, bstar: 1e-5, ndot: 0, nddot: 0 }, expect: 'KM5' },
  ];
  for (const c of cases) {
    const cls = classifyOrbitRegime(c.set.n, c.set.e).regime;
    const at = grid(t0, 7).slice(1), flown = flySgp4(c.set, at);
    const truth = at.map((ms, i) => ({ ms, r: flown[i].r }));
    const prior = Array.from({ length: c.copies }, () => ({ ...c.set }));
    const out = await servedAndEarlier(cls, { norad: c.set.norad, tle: c.set, prior, inputT0: t0, at, truth, fromMs: t0, perDay: DAY / (CONFIG.grid.stepSeconds * 1000), guard });
    const s = out.arms[out.served];
    console.log(`${c.label}: class ${cls}, served ${out.served} (72 h distance from the set's flight ${s?.p?.toFixed(3)} km, fit ${s?.rms} m), earlier ${out.earlier}`);
    if (out.served !== c.expect) problems.push(`${c.label}: served ${out.served}, expected ${c.expect}`);
    if (!(s?.p < 2)) problems.push(`${c.label}: the served record does not follow the flight it was fitted to within 2 km`);
    if (out.earlier !== 'B3') problems.push(`${c.label}: the earlier construction is ${out.earlier}; with no set before the epoch it is B3`);
  }
  // The maneuver cut: a copy with a different mean anomaly is a jump, and the sets before the last jump are dropped.
  const g = cases[1].set, moved = { ...g, ma: g.ma + 30 };
  if (afterLastJump([g, moved, g], CONFIG.arms.KG8c.history.cutKm).length !== 1) problems.push('the maneuver cut does not drop the sets before the last jump');
  if (afterLastJump([g, g, g], CONFIG.arms.KG8c.history.cutKm).length !== 3) problems.push('the maneuver cut drops sets with no jump');
  // The statistic, the verdict and the catalog's decision on fixed numbers.
  const pairs = [];
  for (let sat = 1; sat <= 8; sat += 1) for (let k = 0; k < 6; k += 1) pairs.push({ sat, x: Math.log(0.5 + 0.05 * sat + 0.01 * k) });
  const r = ratioWithInterval(pairs, CONFIG.statistics);
  console.log(`statistic on fixed numbers: ratio ${r.ratio.toFixed(4)} (${r.lo.toFixed(4)} to ${r.hi.toFixed(4)}), verdict ${verdict(r, CONFIG.statistics)}`);
  if (!(r.ratio > 0.74 && r.ratio < 0.76 && verdict(r, CONFIG.statistics) === 'BEATS')) problems.push('the statistic on fixed numbers is off');
  const beats = { verdict: 'BEATS' }, ties = { verdict: 'TIE' };
  const decisions = [catalogDecision(beats, { lo: 0.9 }, beats), catalogDecision(beats, { lo: 1.05 }, beats), catalogDecision(ties, { lo: 0.9 }, beats), catalogDecision(ties, { lo: 0.9 }, ties)];
  console.log(`catalog decision on fixed verdicts: ${decisions.join(', ')}`);
  if (decisions.join() !== 'new construction,earlier construction,earlier construction,set') problems.push('the catalog decision rule is off');
  console.log(problems.length ? `CHECK FAILED\n- ${problems.join('\n- ')}` : `CHECK PASSED (${CONFIG.build.module} ${CONFIG.build.version} ${wasmSha.slice(0, 12)})`);
  process.exit(problems.length ? 1 : 0);
}

// ---- a part ----
const partId = arg('--part');
const part = CONFIG.parts[partId];
if (!part) throw new Error('usage: run.mjs --check | --part 1|2|H|dev-B [--shard i/n]');
if (part.runNotBefore && Date.now() < Date.parse(part.runNotBefore)) throw new Error(`REFUSED: part ${partId} runs once, not before ${part.runNotBefore} (PLAN.md)`);
const git = (dir, ...a) => { try { return execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
if (partId !== 'dev-B' && git(REPO, 'status', '--porcelain', '--', path.relative(REPO, HERE))) throw new Error('REFUSED: the experiment folder has uncommitted changes; a registered part runs on committed files only');
for (const [m, want] of Object.entries(CONFIG.readers)) { // the reader modules' bytes, as the plan names them
  const got = sha256(fs.readFileSync(path.join(MODULES, m, 'dist/isomorphic/module.wasm')));
  if (got !== want.wasmSha256) throw new Error(`REFUSED: ${m} is ${got}, the plan names ${want.wasmSha256}`);
}
const [shardI, shardN] = (arg('--shard') ?? '0/1').split('/').map(Number);
const outDir = partId === 'dev-B' ? path.join(REPO, 'runs/ap-catalog-construction/dev-B') : path.join(CONFIG.store, `part${partId}`);
fs.mkdirSync(outDir, { recursive: true });
const tag = `s${shardI}of${shardN}`;
const t00 = Date.now();
const counts = { sets: 0, noTruth: 0, errors: 0 };
const rows = [];

if (partId === 'H') {
  const { openXp, captureSets } = await import('./lib/xp.mjs');
  const capDir = path.join(CONFIG.archive, CONFIG.xp.capture);
  const T = Date.parse(JSON.parse(fs.readFileSync(path.join(capDir, 'run.json'), 'utf8')).started_utc);
  const days = part.days, guard = makeWindow({ from: T - (CONFIG.history.priorWindowDays + 1) * DAY, to: T + days * DAY });
  const index = truthIndex(T, T + days * DAY);
  const norads = [...index.keys()].sort((a, b) => a - b).filter((_, i) => i % shardN === shardI);
  const sets = await captureSets(path.join(capDir, CONFIG.xp.captureFile));
  const objects = new Map(loadPublicSets({ fromMs: T - CONFIG.history.priorWindowDays * DAY, cutoffMs: T, norads, guard }).map((o) => [o.norad, o]));
  const xp = await openXp();
  Object.assign(counts, { noXpSet: 0, notXpType: 0, noPublicSet: 0, ingestChanged: 0 });
  for (const norad of norads) {
    const s = sets.get(norad);
    if (!s) { counts.noXpSet += 1; continue; }
    if (s.type !== CONFIG.xp.setType) { counts.notXpType += 1; continue; }
    const tles = objects.get(norad)?.tles ?? [];
    const tle = tles.at(-1);
    if (!tle || T - tleMs(tle) > CONFIG.xp.publicSetMaximumAgeDays * DAY) { counts.noPublicSet += 1; continue; }
    const { truth, perDay, firstDayCovered } = truthFor(index, norad, T, days, guard);
    if (!firstDayCovered) { counts.noTruth += 1; continue; }
    counts.sets += 1;
    const at = truth.map((x) => x.ms), cls = classifyOrbitRegime(tle.n, tle.e).regime;
    const row = { norad, family: index.get(norad)[0].family, cls, captureUtc: new Date(T).toISOString(), publicSetAgeH: Math.round((T - tleMs(tle)) / 36e5 * 10) / 10 };
    try {
      const x = await xp.flyXp(s, at);
      if (!x.ingestKept) counts.ingestChanged += 1;
      row.XP = score(x.r, truth, T, perDay, days);
      const a = flySgp4(tle, at);
      row.A = a ? score(a.map((q) => q.r), truth, T, perDay, days) : null;
      const prior = tles.slice(0, -1).filter((y) => tleMs(y) >= tleMs(tle) - CONFIG.history.priorWindowDays * DAY);
      Object.assign(row, await servedAndEarlier(cls, { norad, tle, prior, inputT0: T, at, truth, fromMs: T, perDay, guard, days }));
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 160); counts.errors += 1; await freshHost(); }
    rows.push(row);
  }
  await xp.destroy();
} else {
  const p0 = Date.parse(part.from), p1 = Date.parse(part.to);
  const guard = makeWindow({ from: Date.parse(part.readFrom), to: Date.parse(part.readTo), never: (part.never ?? []).map(([a, b]) => [Date.parse(a), Date.parse(b)]) });
  const index = truthIndex(p0, p1 + CONFIG.scoring.days * DAY);
  const norads = [...index.keys()].sort((a, b) => a - b).filter((_, i) => i % shardN === shardI);
  const objects = loadPublicSets({ fromMs: Date.parse(part.readFrom), cutoffMs: p1, norads, guard });
  console.log(`part ${partId} ${tag}: ${norads.length} truth objects of ${index.size}, ${objects.length} with sets (${((Date.now() - t00) / 1000).toFixed(0)} s)`);
  for (const obj of objects) {
    let last = -Infinity;
    for (const tle of obj.tles) {
      const t0 = tleMs(tle);
      if (t0 < p0 || t0 >= p1 || t0 - last < CONFIG.selection.spacingDays * DAY) continue;
      const { truth, perDay, firstDayCovered } = truthFor(index, obj.norad, t0, CONFIG.scoring.days, guard);
      if (!firstDayCovered) { counts.noTruth += 1; continue; }
      last = t0; counts.sets += 1;
      const c = classifyOrbitRegime(tle.n, tle.e);
      const row = { norad: obj.norad, family: index.get(obj.norad)[0].family, cls: c.regime, hpKm: Math.round(c.hpKm), ecc: tle.e, t0: new Date(t0).toISOString() };
      try {
        const at = truth.map((s) => s.ms), a = flySgp4(tle, at);
        if (!a) throw new Error('sgp4-status');
        row.A = score(a.map((s) => s.r), truth, t0, perDay);
        const prior = obj.tles.filter((x) => tleMs(x) < t0 && tleMs(x) >= t0 - CONFIG.history.priorWindowDays * DAY);
        Object.assign(row, await servedAndEarlier(c.regime, { norad: obj.norad, tle, prior, inputT0: t0, at, truth, fromMs: t0, perDay, guard }));
      } catch (error) { row.error = String(error?.message ?? error).slice(0, 160); counts.errors += 1; await freshHost(); }
      rows.push(row);
      if (counts.sets % 100 === 0) console.log(`  ${counts.sets} sets, ${((Date.now() - t00) / 1000).toFixed(0)} s`);
    }
  }
}

fs.writeFileSync(path.join(outDir, `rows-${tag}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
const here = (f) => sha256(fs.readFileSync(path.join(HERE, f)));
const truthSha = sha256([...truthCounts.files.keys()].sort().join('\n'));
fs.writeFileSync(path.join(outDir, `manifest-${tag}.json`), JSON.stringify({
  command: `node experiments/ap-catalog-construction/run.mjs ${argv.join(' ')}`, finishedUtc: new Date().toISOString(), node: process.version,
  files: Object.fromEntries(['config.json', 'run.mjs', 'table.mjs', 'lib/engine.mjs', 'lib/sets.mjs', 'lib/arms.mjs', 'lib/inputs.mjs', 'lib/xp.mjs'].map((f) => [f, here(f)])),
  repositoryCommit: git(REPO, 'rev-parse', 'HEAD'), modulesCommit: git(MODULES, 'rev-parse', 'HEAD'), wasmSha256: wasmSha, counts, truthStatesScreenedOut: truthCounts.screenedStates,
  readerWasmSha256: Object.fromEntries(Object.keys(CONFIG.readers).map((m) => [m, sha256(fs.readFileSync(path.join(MODULES, m, 'dist/isomorphic/module.wasm')))])),
  truthFiles: truthCounts.files.size, truthFileListSha256: truthSha, inputFiles: Object.fromEntries([...inputFiles].sort()) }, null, 1));
console.log(`part ${partId} ${tag}: ${counts.sets} sets, ${counts.noTruth} without a scored first day, ${counts.errors} errors in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
process.exit(0);
