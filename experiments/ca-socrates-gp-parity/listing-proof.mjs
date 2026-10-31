#!/usr/bin/env node
// ca-socrates-gp-parity A3: proof by a fabricated listing, through the real compare.mjs and compare-a1.mjs.
//   node experiments/ca-socrates-gp-parity/listing-proof.mjs
// 1. compare.mjs: SOCRATES-like rows the screen dropped, one for each thing the excluded port can say about an object, are
//    each counted as a miss and leave recall below 1; only the label differs. An object still screened at the row's TCA is
//    not labeled as unscreened.
// 2. compare-a1.mjs: a console arm lacking encounters Part 1 has. A real SOCRATES row whose object the arm skipped is excused by
//    rule (ii) in comparison (ii), and is still a miss in comparison (i): the file stops if comparison (i) does not say so.
//    A record of the module's port excuses nothing. Every excuse is counted by rule.
// The events are invented on real catalog numbers, in the run's own layout, under runs/ (ignored), and removed afterward.
// The one SOCRATES row is read at run time and not printed. No element set leaves this machine.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, repo, id, here, sha256, a3, readCatalog, readSocrates, msToJd, utcMs, jdToIso, DAY_S, NOT_SAMPLED } from './common.mjs';

const runs = path.join(repo, 'runs', id), tag = `proof-${process.pid}`;
const startJd = config.window.startJd, at = (s) => startJd + s / DAY_S;
const iso = (s) => jdToIso(at(s));
const REFUSAL = 'SGP4: decayed (the radius is below one Earth radius)';
const partWay = (lastS) => `Screened until LAST_VALID; SGP4 refuses it from FIRST_REFUSAL. LAST_VALID=${iso(lastS)}; FIRST_REFUSAL=${iso(lastS + 0.002)}; REFUSAL=${REFUSAL}`;
const fromStart = (s) => `Excluded from conjunction screening; SGP4 refuses it from the window start. LAST_VALID=NONE; FIRST_REFUSAL=${iso(s)}; REFUSAL=${REFUSAL}`;

const catalog = readCatalog();
// Objects of one low-drag band (compare-a1 widens its threshold excuse by band), below 100000, none in the report's row used in step 2.
const pool = catalog.rows.filter((g) => Number(g.NORAD_CAT_ID) < 100000 && Math.abs(Number(g.BSTAR)) < 1e-4).slice(0, 40);
assert.ok(pool.length === 40, 'the catalog has 40 low-drag objects');
const N = pool.map((g) => Number(g.NORAD_CAT_ID));
const epochJd = new Map(catalog.rows.map((g) => [Number(g.NORAD_CAT_ID), msToJd(utcMs(g.EPOCH))]));
const event = (a, b, s, missM) => ({ a, b, aId: String(a), bId: String(b), tcaJd: at(s), missM, speedMS: 7000, maxProb: 1e-6, dilutionM: 0, aDse: at(s) - epochJd.get(a), bDse: at(s) - epochJd.get(b), combinedRadiusM: 10 });
const socratesRow = (i, a, b, s, rangeM) => { const tcaMs = Math.round((at(s) - 2440587.5) * DAY_S * 1000); return {
  i, a, aName: String(a), aStatus: '+', aDse: Math.round((at(s) - epochJd.get(a)) * 1000) / 1000, b, bName: String(b), bStatus: '+', bDse: Math.round((at(s) - epochJd.get(b)) * 1000) / 1000,
  tcaText: new Date(tcaMs).toISOString(), tcaMs, tcaJd: at(s), rangeM, speedMS: 7000, maxProb: 1e-6, dilutionM: 0 }; };
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value)}\n`); };
const SLICE = config.screen.sliceSeconds;

// A part's directory, in the layout compare.mjs reads and hashes.
function writePart(partDir, { mode, events, primaries, window, units, excludedObjects, extra = {} }) {
  writeJson(path.join(partDir, 'primaries.json'), primaries);
  writeJson(path.join(partDir, 'screen-events.json'), events);
  writeJson(path.join(partDir, 'screen-summary.json'), { experiment: id, mode, amendment: 'A1', part: 1, window, catalog: { ommStreamSha256: config.catalog.ommStreamSha256 }, primaries: { seed: 'fabricated', eligible: primaries.length, part: 1, from: 0, to: primaries.length, count: primaries.length, blockSize: primaries.length, listSha256: 'fabricated', blocks: 1 }, units: units.length, events: events.length, excludedObjects, failedCalls: [], failedPairs: 0, incompleteUnits: [], wallMinutes: 0, processes: 1, threads: 1, ...extra });
  units.forEach((u, k) => writeJson(path.join(partDir, 'slices', `slice-${String(k).padStart(4, '0')}.json`), u));
  const outputs = Object.fromEntries(['screen-events.json', 'screen-summary.json', 'primaries.json'].map((f) => [f, sha256(fs.readFileSync(path.join(partDir, f)))]));
  writeJson(path.join(partDir, 'manifest.screen.json'), { experiment: id, step: 'fabricated', mode, part: 1, run: tag, plan: null, module: { commit: a3.module.commit, path: a3.module.wasmPath, version: a3.module.version, wasmSha256: a3.module.wasmSha256, packages: a3.module.packages }, outputs });
}
const node = (script, args) => execFileSync(process.execPath, [path.join(here, script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });

const dirs = [path.join(runs, tag), path.join(runs, `${tag}-compare`), path.join(runs, `${tag}-console`)];
const out = {};
try {
  // ---- 1. compare.mjs ----------------------------------------------------------------------------------------------
  const window = { startUtc: config.window.startUtc, startJd, sliceSeconds: SLICE, slices: 28 };
  const [a0, b0, a1, b1, a2, b2, a3o, b3, a4, b4] = N;
  const rows = [
    socratesRow(0, a0, b0, 3000, 500),   // found
    socratesRow(1, a1, b1, 25000, 600),  // dropped; a1 is screened until 30,000 s, in this slice
    socratesRow(2, a2, b2, 50000, 700),  // dropped; a2 is refused from 45,000 s, before this TCA
    socratesRow(3, a3o, b3, 70000, 800), // dropped; a3o is refused from the call's start
    socratesRow(4, a4, b4, 90000, 900),  // dropped; a4 is the arm's own "could not sample" record
  ];
  const events = [event(a0, b0, 3000, 500)];
  const units = Array.from({ length: 28 }, (_, k) => ({ unit: k, slice: k, block: 0, startJd: at(k * SLICE), durationSeconds: SLICE, excluded: [], failedPairs: 0, calls: [], failures: [], events: k === 0 ? events : [], elapsedMs: 0 }));
  units[1].excluded.push({ norad: a1, comment: partWay(30000) });
  units[2].excluded.push({ norad: a2, comment: partWay(45000) });
  units[3].excluded.push({ norad: a3o, comment: fromStart(3 * SLICE) });
  units[4].excluded.push({ norad: a4, comment: NOT_SAMPLED });
  const compareDir = path.join(runs, `${tag}-compare`);
  writePart(path.join(compareDir, 'part1'), { mode: 'probe', events, primaries: [a0, a1, a2, a3o, a4], window, units, excludedObjects: [] });
  const referenceFile = path.join(compareDir, 'reference.json');
  writeJson(referenceFile, rows);
  node('compare.mjs', ['--dev', '--amendment', a3.amendment, '--run', compareDir, '--parts', '1', '--dev-reference', referenceFile]);
  const metrics = JSON.parse(fs.readFileSync(path.join(compareDir, 'metrics.dev-part1.json'), 'utf8'));
  const R = metrics.recall.primary.all;
  assert.deepEqual([R.reference, R.found], [5, 1], 'every dropped row stays in the denominator');
  assert.equal(metrics.verdict.recall.status, 'fail');
  assert.equal(metrics.misses.length, 4, 'every dropped row is a miss');
  const label = (a) => metrics.misses.find((m) => m.pair[0] === a).diagnosis;
  assert.ok(!label(a1).startsWith('object not screened'), `a row before LAST_VALID is not labeled as unscreened: ${label(a1)}`);
  assert.ok(label(a2).startsWith(`object not screened at this TCA: ${a2}, SGP4 refuses it from`), label(a2));
  assert.ok(label(a3o).includes("SGP4 refuses it from the call's start"), label(a3o));
  assert.ok(label(a4).includes('the console path could not sample it over the span'), label(a4));
  out.compare = { reference: R.reference, found: R.found, recallStatus: metrics.verdict.recall.status, misses: metrics.misses.length,
    labels: { beforeLastValid: 'not labeled unscreened', afterFirstRefusal: 'object not screened at this TCA', refusedFromCallStart: 'object not screened at this TCA', consoleCouldNotSample: 'object not screened at this TCA' },
    listings: metrics.screen.listings.byForm };

  // ---- 2. compare-a1.mjs -------------------------------------------------------------------------------------------
  // A real SOCRATES row of the arm's first day, away from the span's ends, whose objects are not in the pool.
  const inPool = new Set(N);
  const row = readSocrates().find((r) => r.tcaJd > at(3600) && r.tcaJd < at(80000) && !inPool.has(r.a) && !inPool.has(r.b) && Math.max(r.a, r.b) < 100000);
  const [p, q, s1, s2, t1, t2, u1, u2, v1, v2, w1, w2] = N.slice(10);
  const e = (a, b, s, m) => event(a, b, s, m);
  const realEvent = { ...event(row.a, row.b, 0, row.rangeM), tcaJd: row.tcaJd };
  const part1Events = [
    e(p, q, 5000, 1000),            // in both arms, 1 m apart: the band's largest matched |Δmiss|
    realEvent,                      // Part 1 only; the arm could not sample row.a; a SOCRATES row
    e(s1, s2, 6000, 2000),          // Part 1 only; the module lists s1 as screened in part, past this TCA: no excuse
    e(t1, t2, 7000, 2100),          // Part 1 only, nothing listed: no excuse
    e(u1, u2, 8000, 4999.5),        // Part 1 only, within the band's largest |Δmiss| of 5 km: excused
    e(v1, v2, 86400 - 30, 3000),    // Part 1 only, within 60 s of the span's end: excused
  ];
  const armEvents = [e(p, q, 5000, 1001), e(w1, w2, 9000, 2200)]; // w1 x w2 is in the arm only: no excuse
  const unit = (k, list) => ({ unit: k, slice: k, block: 0, startJd: at(k * SLICE), durationSeconds: SLICE, excluded: [], failedPairs: 0, calls: [], failures: [], events: list, elapsedMs: 0 });
  const p1Units = [0, 1, 2, 3].map((k) => unit(k, part1Events.filter((x) => Math.floor((x.tcaJd - startJd) * DAY_S / SLICE) === k)));
  writePart(path.join(runs, tag, 'part1'), { mode: 'registered', events: part1Events, primaries: [p, row.a, s1, t1, u1, v1], window, units: p1Units, excludedObjects: [] });
  const armWindow = { startUtc: config.window.startUtc, startJd, sliceSeconds: 86400, slices: 1 };
  const armListed = [{ norad: row.a, comment: NOT_SAMPLED }, { norad: s1, comment: partWay(40000) }];
  const armDir = path.join(runs, `${tag}-console`);
  writePart(path.join(armDir, 'part1'), { mode: 'registered', events: armEvents, primaries: [p, row.a, s1, t1, u1, v1], window: armWindow, units: [{ ...unit(0, armEvents), slice: 0, durationSeconds: 86400, excluded: armListed }], excludedObjects: armListed, extra: { skippedCoincident: [] } });
  // Comparison (i) as compare.mjs reports the row the arm lacks: a miss, which has no excuse path.
  const iFile = path.join(armDir, 'metrics.part1.json');
  writeJson(iFile, { misses: [{ pair: [row.a, row.b], socratesTcaUtc: row.tcaText }], edgeRows: { rows: [] } });
  const summary = JSON.parse(node('compare-a1.mjs', ['--run', tag, '--arm', 'console']));
  const detail = JSON.parse(fs.readFileSync(path.join(armDir, 'compare-a1.console.json'), 'utf8'));
  assert.equal(summary.verdict.status, 'differs (defect)', 'a one-arm encounter with no registered excuse is a defect');
  assert.equal(detail.onlyOneArm.total, 6);
  assert.equal(detail.onlyOneArm.byExplanation['unexplained (defect)'], 3, 'the module\'s record and an empty listing excuse nothing');
  assert.equal(detail.excuses.total, 3);
  assert.equal(detail.excuses.listedBySocrates, 1);
  assert.deepEqual(detail.excuses.outcomes, { 'a miss in comparison (i)': 1 });
  assert.equal(detail.consoleSkipFinding.encountersNotShown, 1);
  assert.deepEqual(detail.consoleSkipFinding.objects.map((x) => x.norad), [row.a]);
  // If comparison (i) did not report that row, this file must stop rather than excuse it.
  writeJson(iFile, { misses: [], edgeRows: { rows: [] } });
  assert.throws(() => node('compare-a1.mjs', ['--run', tag, '--arm', 'console']), 'an excused SOCRATES row comparison (i) does not report must stop compare-a1.mjs');
  out.excuse = { oneArmEncounters: detail.onlyOneArm.total, defects: detail.onlyOneArm.byExplanation['unexplained (defect)'], excused: detail.excuses.total,
    byRule: Object.fromEntries(Object.entries(detail.onlyOneArm.byExplanation).filter(([k]) => k !== 'unexplained (defect)')), excusedAndListedBySocrates: detail.excuses.listedBySocrates, itsOutcome: detail.excuses.outcomes,
    stopsWhenComparisonIDoesNotReportIt: true };
} finally {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
}
console.log(JSON.stringify(out));
process.exit(0);
