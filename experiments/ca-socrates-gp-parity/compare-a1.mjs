#!/usr/bin/env node
// ca-socrates-gp-parity Part 3 comparison (ii) (Amendment A1): an arm's events against Part 1's screen_catalog events on
// the same pairs, encounter for encounter.
//   node experiments/ca-socrates-gp-parity/compare-a1.mjs --run <part-1-run-id> --arm console|descriptions
// Both sides are merged by the 1 s rule; the console arm also drops what the console's same-platform event filter drops
// (samePlatform.ts:107-112). Encounters pair by NORAD pair and TCA within 1 s, one to one, nearest first.
// descriptions: identical to Part 1 within 1 ms, 1 mm, 1 mm/s, or a defect.
// console: gated on encounter-set equality; geometry by BSTAR band of the pair's larger |BSTAR|; an encounter found by one
// arm only is explained when its miss lies within its band's largest matched |Δmiss| of 5 km, or when it involves an
// object the console path could not sample over the whole window (the console skips such objects).
// Amendment A3: only the console path's own skip excuses (rule ii); a record of the module's excluded port does not. Every
// excused encounter is listed with whether SOCRATES lists it; comparison (i) (compare.mjs, already run on this arm) has no
// excuse path, so one SOCRATES lists must be a found event, a miss or an edge row there, and this file stops if it is none.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, repo, id, here, sha256, readCatalog, readSocrates, jdToIso, DAY_S, NOT_SAMPLED, parseListing } from './common.mjs';

const { values: o } = parseArgs({ options: { run: { type: 'string' }, arm: { type: 'string' } } });
const A1 = JSON.parse(fs.readFileSync(path.join(here, 'config.a1.json'), 'utf8'));
const C = A1.comparison;
const base = path.join(repo, 'runs', id, o.run);
const armDir = path.join(repo, 'runs', id, `${o.run}-${o.arm}`, 'part1');
const armManifest = JSON.parse(fs.readFileSync(path.join(armDir, 'manifest.screen.json'), 'utf8'));
for (const [f, h] of Object.entries(armManifest.outputs)) if (sha256(fs.readFileSync(path.join(armDir, f))) !== h) throw new Error(`${o.arm}: ${f} changed`);
const armSummary = JSON.parse(fs.readFileSync(path.join(armDir, 'screen-summary.json'), 'utf8'));
const K = armSummary.primaries.blocks;
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
// The arm's span (the registered window from its start, or its first part): both sides are compared inside it.
const winStart = armSummary.window.startJd, winEnd = winStart + (armSummary.window.slices * armSummary.window.sliceSeconds) / DAY_S;
if (winStart !== config.window.startJd) throw new Error('the arm does not start at the registered window');
const inSpan = (e) => e.tcaJd >= winStart && e.tcaJd < winEnd;
const p1Slices = Math.round(((winEnd - winStart) * DAY_S) / config.screen.sliceSeconds);

// Part 1's events of the same blocks (its block b screens exactly the pairs the arm's block b screens).
const p1Dir = path.join(base, 'part1', 'slices');
const p1Units = fs.readdirSync(p1Dir).filter((f) => /^slice-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(p1Dir, f), 'utf8'))).filter((u) => u.block < K && u.slice < p1Slices);
if (p1Units.length !== K * p1Slices) throw new Error(`Part 1 has ${p1Units.length} of ${K * p1Slices} units for the arm's blocks and span`);
const merge = (list) => {
  const sorted = list.map((e) => ({ ...e, key: pairKey(e.a, e.b) })).sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.tcaJd - y.tcaJd));
  const out = [];
  let merged = 0;
  for (const e of sorted) {
    const last = out[out.length - 1];
    if (last && last.key === e.key && (e.tcaJd - last.tcaJd) * DAY_S <= C.pairSeconds) { merged++; continue; }
    out.push(e);
  }
  return { events: out, merged };
};
const p1 = merge(p1Units.flatMap((u) => u.events).filter(inSpan));
let armRaw = JSON.parse(fs.readFileSync(path.join(armDir, 'screen-events.json'), 'utf8'));
const samePlatform = o.arm === 'console' ? armRaw.filter((e) => Math.abs(e.missM) <= 1e-3 && Math.abs(e.speedMS) <= 1e-6).length : 0;
if (o.arm === 'console') armRaw = armRaw.filter((e) => !(Math.abs(e.missM) <= 1e-3 && Math.abs(e.speedMS) <= 1e-6));
const arm = merge(armRaw.filter(inSpan));

// Pair one to one, nearest first.
const byPair = new Map();
arm.events.forEach((e, n) => { if (!byPair.has(e.key)) byPair.set(e.key, []); byPair.get(e.key).push(n); });
const cand = [];
p1.events.forEach((e, i) => { for (const n of byPair.get(e.key) ?? []) { const dt = Math.abs(arm.events[n].tcaJd - e.tcaJd) * DAY_S; if (dt <= C.pairSeconds) cand.push([dt, i, n]); } });
cand.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
const p1To = new Int32Array(p1.events.length).fill(-1), armTo = new Int32Array(arm.events.length).fill(-1);
for (const [, i, n] of cand) if (p1To[i] < 0 && armTo[n] < 0) { p1To[i] = n; armTo[n] = i; }

const catalog = readCatalog();
const bstar = new Map(catalog.rows.map((g) => [Number(g.NORAD_CAT_ID), Math.abs(Number(g.BSTAR))]));
const band = (e) => { const b = Math.max(bstar.get(e.a) ?? 0, bstar.get(e.b) ?? 0); return b < C.bstarBands[0] ? `|B*| < ${C.bstarBands[0]}` : b < C.bstarBands[1] ? `${C.bstarBands[0]} <= |B*| < ${C.bstarBands[1]}` : `|B*| >= ${C.bstarBands[1]}`; };
const dist = (v) => { const s = v.map(Math.abs).sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return s.length ? { n: s.length, median: q(0.5), p99: q(0.99), max: s[s.length - 1] } : { n: 0 }; };
const pairs = p1.events.map((e, i) => [e, p1To[i]]).filter(([, n]) => n >= 0).map(([e, n]) => ({ e, x: arm.events[n], dt: (arm.events[n].tcaJd - e.tcaJd) * DAY_S, dm: arm.events[n].missM - e.missM, ds: arm.events[n].speedMS - e.speedMS, band: band(e) }));
const bands = {};
for (const b of [...new Set(pairs.map((p) => p.band))].sort()) {
  const q = pairs.filter((p) => p.band === b);
  bands[b] = { paired: q.length, tcaSeconds: dist(q.map((p) => p.dt)), missM: dist(q.map((p) => p.dm)), speedMS: dist(q.map((p) => p.ds)) };
}
const row = (e, side, why) => ({ side, pair: [e.a, e.b], tcaUtc: jdToIso(e.tcaJd), missM: e.missM, speedMS: e.speedMS, band: band(e), why });
const listed = armSummary.excludedObjects ?? [];
const unsampled = new Set(listed.filter((x) => x.comment === NOT_SAMPLED).map((x) => x.norad));
const moduleListed = listed.filter((x) => x.comment !== NOT_SAMPLED).map((x) => ({ norad: x.norad, ...parseListing(x.comment) }));
const explain = (e) => {
  if ((e.tcaJd - winStart) * DAY_S < 60 || (winEnd - e.tcaJd) * DAY_S < 60) return 'window edge';
  if (o.arm === 'console' && (unsampled.has(e.a) || unsampled.has(e.b))) return 'an object the console path could not sample over the window (skipped, as the console skips it)';
  if (o.arm === 'console' && Math.abs(e.missM - config.screen.thresholdM) <= (bands[band(e)]?.missM.max ?? 0)) return 'threshold crossing within its band\'s largest |Δmiss|';
  return null;
};
const only = [...p1.events.map((e, i) => [e, p1To[i] < 0, 'Part 1 only']), ...arm.events.map((e, n) => [e, armTo[n] < 0, `${o.arm} only`])].filter(([, lone]) => lone).map(([e, , side]) => row(e, side, explain(e)));
const defects = only.filter((r) => !r.why);

// ---- every excuse, against SOCRATES and comparison (i) ---------------------------------------------------------------
const socrates = new Map();
for (const r of readSocrates()) { const k = pairKey(r.a, r.b); if (!socrates.has(k)) socrates.set(k, []); socrates.get(k).push(r); }
const iMetrics = path.join(armDir, '..', 'metrics.part1.json');
if (!fs.existsSync(iMetrics)) throw new Error(`comparison (i) must run first: compare.mjs --run ${path.dirname(armDir)} --parts 1`);
const comparisonI = JSON.parse(fs.readFileSync(iMetrics, 'utf8'));
const iKey = (pair, text) => `${pairKey(pair[0], pair[1])}|${text}`;
const iMisses = new Set(comparisonI.misses.map((x) => iKey(x.pair, x.socratesTcaUtc))), iEdge = new Set(comparisonI.edgeRows.rows.map((x) => iKey(x.pair, x.socratesTcaUtc)));
const armByPair = new Map();
for (const e of arm.events) { if (!armByPair.has(e.key)) armByPair.set(e.key, []); armByPair.get(e.key).push(e); }
const excused = only.filter((r) => r.why).map((r) => {
  const jd = Date.parse(r.tcaUtc) / (DAY_S * 1000) + 2440587.5, k = pairKey(r.pair[0], r.pair[1]);
  const rows = (socrates.get(k) ?? []).filter((x) => Math.abs(x.tcaJd - jd) * DAY_S <= config.comparison.matchSeconds);
  const socratesRows = rows.map((x) => {
    const found = (armByPair.get(k) ?? []).some((e) => Math.abs(e.tcaJd - x.tcaJd) * DAY_S <= config.comparison.matchSeconds);
    const outcome = found ? 'the arm has an event within the match tolerance' : iMisses.has(iKey([x.a, x.b], x.tcaText)) ? 'a miss in comparison (i)' : iEdge.has(iKey([x.a, x.b], x.tcaText)) ? 'an edge row in comparison (i)' : null;
    if (!outcome) throw new Error(`excused encounter ${k} at ${r.tcaUtc} is a SOCRATES row (${x.tcaText}) that comparison (i) neither found, missed nor counted apart`);
    return { tcaUtc: x.tcaText, rangeM: x.rangeM, outcome };
  });
  return { ...r, socrates: socratesRows };
});
const RULE_II = 'an object the console path could not sample over the window (skipped, as the console skips it)';
const skippedRows = excused.filter((r) => r.why === RULE_II && r.side === 'Part 1 only');
// The objects behind rule (ii), with the instant Part 1's screen says SGP4 first refuses each inside the arm's span.
const refusalOf = new Map();
for (const u of p1Units) for (const x of u.excluded ?? []) { const l = parseListing(x.comment); if (!refusalOf.has(x.norad) && l.firstRefusal) refusalOf.set(x.norad, { firstRefusal: l.firstRefusal, refusal: l.refusal, form: l.form }); }
const skippedObjects = [...unsampled].sort((a, b) => a - b).map((n) => ({ norad: n, inPart1Listing: refusalOf.get(n) ?? null, part1EncountersNotShown: skippedRows.filter((r) => r.pair.includes(n)).length }));
const b = C.descriptionsBounds;
const beyond = pairs.filter((p) => Math.abs(p.dt) > b.tcaSeconds || Math.abs(p.dm) > b.missM || Math.abs(p.ds) > b.speedMS);
const verdict = o.arm === 'descriptions'
  ? { rule: 'identical to Part 1: same encounters, |ΔTCA| <= 1 ms, |Δmiss| <= 1 mm, |Δspeed| <= 1 mm/s', status: only.length === 0 && beyond.length === 0 ? 'identical' : 'differs (defect)', onlyOneArm: only.length, beyondBounds: beyond.length }
  : { rule: 'encounter-set equality; one-arm encounters explained only by the registered rules', status: defects.length === 0 ? 'equal encounter sets (all differences explained)' : 'differs (defect)', onlyOneArm: only.length, unexplained: defects.length };
const out = {
  experiment: id, amendment: 'A1', comparison: 'ii', arm: o.arm, run: o.run, blocks: K, caModule: armManifest.module, sgp4Module: armManifest.sgp4Module ?? null,
  part1: { events: p1.events.length, mergedWithin1s: p1.merged }, armEvents: { events: arm.events.length, mergedWithin1s: arm.merged, samePlatformDropped: samePlatform, unsampledObjects: unsampled.size, moduleListed, skippedCoincident: armSummary.skippedCoincident?.length ?? 0 },
  paired: pairs.length, all: { tcaSeconds: dist(pairs.map((p) => p.dt)), missM: dist(pairs.map((p) => p.dm)), speedMS: dist(pairs.map((p) => p.ds)) }, bands,
  beyondDescriptionsBounds: beyond.length, beyondRows: beyond.sort((x, y) => Math.abs(y.dm) - Math.abs(x.dm)).slice(0, 50).map((p) => ({ pair: [p.e.a, p.e.b], tcaUtc: jdToIso(p.e.tcaJd), dtSeconds: p.dt, dMissM: p.dm, dSpeedMS: p.ds, band: p.band })),
  onlyOneArm: { total: only.length, byExplanation: only.reduce((m, r) => ({ ...m, [r.why ?? 'unexplained (defect)']: (m[r.why ?? 'unexplained (defect)'] ?? 0) + 1 }), {}), rows: [...defects, ...only.filter((r) => r.why)].slice(0, 100) },
  excuses: { total: excused.length, widthByBand: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, v.missM.max])), listedBySocrates: excused.filter((r) => r.socrates.length).length,
    outcomes: excused.flatMap((r) => r.socrates).reduce((m, x) => ({ ...m, [x.outcome]: (m[x.outcome] ?? 0) + 1 }), {}), rows: excused },
  consoleSkipFinding: o.arm === 'console' ? { objects: skippedObjects, encountersNotShown: skippedRows.length, rows: skippedRows } : null,
  verdict,
};
fs.writeFileSync(path.join(armDir, '..', `compare-a1.${o.arm}.json`), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ arm: o.arm, part1Events: out.part1.events, armEvents: out.armEvents.events, paired: out.paired, onlyOneArm: out.onlyOneArm.total, excuses: { total: out.excuses.total, listedBySocrates: out.excuses.listedBySocrates, outcomes: out.excuses.outcomes }, byExplanation: out.onlyOneArm.byExplanation, consoleSkip: out.consoleSkipFinding && { objects: out.consoleSkipFinding.objects.length, encountersNotShown: out.consoleSkipFinding.encountersNotShown }, verdict }));
