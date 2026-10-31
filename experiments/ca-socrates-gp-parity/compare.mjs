#!/usr/bin/env node
// ca-socrates-gp-parity, step 2: the screen's events against SOCRATES's, by the rules in PLAN.md.
//   node experiments/ca-socrates-gp-parity/compare.mjs --run runs/ca-socrates-gp-parity/<run-id> [--modules DIR]
// Matching, counting and classification only. The one computation, the module's own minimum range for each pair
// SOCRATES lists and the screen does not (the first diagnosis of a miss), runs in the pinned module (assess_conjunction).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, a2, here, repo, id, sha256, frozenPlan, readSocrates, readSatcat, readCatalog, editionClasses, modulesRoot, pinnedModule, modulePin, importFile, jdToIso, utcMs, msToJd, DAY_S, parseListing, notScreenedAt, listingWords } from './common.mjs';

const { values: o } = parseArgs({ options: { run: { type: 'string' }, parts: { type: 'string', default: '1,2' }, modules: { type: 'string' }, dev: { type: 'boolean', default: false }, 'dev-reference': { type: 'string' }, amendment: { type: 'string' } } });
const pin = modulePin(o.amendment);
const log = (m) => process.stderr.write(`${new Date().toISOString()} ${m}\n`);
// --dev exercises this file on a timing probe (the week after the window) against a synthetic reference made from
// the probe's own events, or a fabricated one (--dev-reference, listing-proof.mjs); it never reads SOCRATES's events. Only a registered run is compared with SOCRATES.
const plan = o.dev ? null : frozenPlan();
const cmp = config.comparison;
const dir = path.resolve(o.run);
const partIds = o.parts.split(',').map(Number).sort();
for (const p of partIds) if (!config.primaries.parts.some((x) => x.id === p)) throw new Error(`unknown part ${p}`);
const full = config.primaries.parts.every((x) => partIds.includes(x.id));
// Each part's screen answer, checked against the hashes its manifest recorded.
const parts = partIds.map((p) => {
  const pd = path.join(dir, `part${p}`);
  const read = (f) => fs.readFileSync(path.join(pd, f));
  const manifest = JSON.parse(read('manifest.screen.json'));
  if (o.dev ? manifest.mode !== 'probe' : manifest.mode !== 'registered' || !manifest.plan) throw new Error(o.dev ? '--dev reads only a probe run' : 'compare reads only a registered screen run');
  for (const [f, h] of Object.entries(manifest.outputs)) if (sha256(read(f)) !== h) throw new Error(`part ${p}: ${f} changed since the screen wrote it`);
  return { id: p, dir: pd, manifest, summary: JSON.parse(read('screen-summary.json')), primaries: JSON.parse(read('primaries.json')), events: JSON.parse(read('screen-events.json')) };
});
const summary = parts[0].summary;
// Every part was screened with the artifact this comparison diagnoses with (Amendment A2 pins another one).
for (const q of parts) if (!o.dev && q.manifest.module.wasmSha256 !== pin.wasmSha256) throw new Error(`part ${q.id} was screened with ${q.manifest.module.wasmSha256}, not ${pin.wasmSha256}`);
for (const q of parts) if (JSON.stringify(q.summary.window) !== JSON.stringify(summary.window)) throw new Error('parts screened different windows');
const subset = new Set(parts.flatMap((q) => q.primaries));
const rawEvents = parts.flatMap((q) => q.events);
const screenManifest = parts[0].manifest;

// ---- inputs ---------------------------------------------------------------------------------------------------
const report = o.dev ? (o['dev-reference'] ? JSON.parse(fs.readFileSync(o['dev-reference'], 'utf8')) : syntheticReference(rawEvents)) : readSocrates();
const satcat = readSatcat();
const catalog = readCatalog();
const gpByNorad = new Map(catalog.rows.map((g) => [Number(g.NORAD_CAT_ID), g]));
const editions = editionClasses(report, catalog.rows);
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const winStart = summary.window.startJd, winEnd = winStart + (summary.window.slices * summary.window.sliceSeconds) / DAY_S;
// Parts 1 and 2 cover the registered window; an A1 arm may cover its first part (registered in Amendment A1).
if (!o.dev && summary.amendment !== 'A1' && (winStart !== config.window.startJd || summary.window.slices * summary.window.sliceSeconds !== config.window.durationSeconds)) throw new Error('the screen run did not cover the registered window');
if (!o.dev && summary.amendment === 'A1' && (winStart !== config.window.startJd || winEnd > config.window.startJd + config.window.durationSeconds / DAY_S + 1e-9)) throw new Error('an A1 arm must lie inside the registered window from its start');

// The excluded port, per slice: since CA 0.13.0 it lists an object screened in part as well as one excluded. A listing
// labels a miss; it never changes a count: every SOCRATES row stays in its denominator whatever the port says.
const listingsBySlice = new Map(), failedPairsBySlice = new Map(), listingRows = [];
for (const q of parts) for (const f of fs.readdirSync(path.join(q.dir, 'slices')).filter((n) => n.endsWith('.json'))) {
  const u = JSON.parse(fs.readFileSync(path.join(q.dir, 'slices', f), 'utf8'));
  if (!listingsBySlice.has(u.slice)) listingsBySlice.set(u.slice, new Map());
  const bySlice = listingsBySlice.get(u.slice);
  for (const x of u.excluded) {
    const l = { norad: x.norad, ...parseListing(x.comment) };
    if (!bySlice.has(x.norad)) bySlice.set(x.norad, []);
    bySlice.get(x.norad).push(l);
    listingRows.push({ slice: u.slice, ...l });
  }
  if (Number(u.failedPairs ?? 0) > 0) failedPairsBySlice.set(u.slice, (failedPairsBySlice.get(u.slice) ?? 0) + Number(u.failedPairs));
}
// Per object: the slices it is listed in, in which form, and the instant SGP4 first refuses it.
function listingSummary(rows) {
  const objects = new Map(), byForm = {}, byRefusal = {};
  for (const r of rows) {
    if (!objects.has(r.norad)) objects.set(r.norad, { norad: r.norad, slicesByForm: {}, refusal: r.refusal ?? null });
    const o = objects.get(r.norad);
    (o.slicesByForm[r.form] ??= new Set()).add(r.slice);
    if (r.form === 'refused-part-way' && (!o.lastValid || r.lastValid < o.lastValid)) o.lastValid = r.lastValid;
    if (r.firstRefusal && (!o.firstRefusal || r.firstRefusal < o.firstRefusal)) { o.firstRefusal = r.firstRefusal; o.refusal = r.refusal; }
  }
  const perObject = [...objects.values()].map((o) => ({ ...o, slicesByForm: Object.fromEntries(Object.entries(o.slicesByForm).map(([k, v]) => [k, [...v].sort((x, y) => x - y)])) }))
    .sort((x, y) => (x.firstRefusal ?? '').localeCompare(y.firstRefusal ?? '') || x.norad - y.norad);
  for (const o of perObject) {
    for (const [form, slices] of Object.entries(o.slicesByForm)) {
      byForm[form] ??= { objects: 0, objectSlices: 0 }; byForm[form].objects++; byForm[form].objectSlices += slices.length;
      const key = o.refusal ?? form;
      byRefusal[key] ??= { objects: new Set(), objectSlices: 0 }; byRefusal[key].objects.add(o.norad); byRefusal[key].objectSlices += slices.length;
    }
  }
  return { objects: perObject.length, records: rows.length, byForm, byRefusal: Object.fromEntries(Object.entries(byRefusal).map(([k, v]) => [k, { objects: v.objects.size, objectSlices: v.objectSlices }])), perObject };
}
const sliceOf = (jd) => Math.floor(((jd - winStart) * DAY_S) / summary.window.sliceSeconds);

// ---- the screen's events: one per encounter -------------------------------------------------------------------
// Consecutive calls abut; an event of the same pair within mergeSeconds of another (across a slice boundary or
// within one) is one encounter: the earlier is kept and the merge is counted.
const sorted = rawEvents.map((e) => ({ ...e, key: pairKey(e.a, e.b) })).sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.tcaJd - y.tcaJd));
const events = [];
let merged = 0;
for (const e of sorted) {
  const last = events[events.length - 1];
  if (last && last.key === e.key && (e.tcaJd - last.tcaJd) * DAY_S <= cmp.mergeSeconds) { merged++; continue; }
  events.push(e);
}
const inWindow = (jd) => jd >= winStart && jd < winEnd;
const outOfWindow = events.filter((e) => !inWindow(e.tcaJd)).length;

// ---- the reference: SOCRATES rows of pairs the screen covered (a member is a subset primary) -------------------
const status = (n) => {
  const r = runStatus.get(n);
  return r !== undefined ? r : satcat.get(n)?.status ?? null;
};
const runStatus = new Map();
for (const r of report) { runStatus.set(r.a, r.aStatus); runStatus.set(r.b, r.bStatus); }
const classOf = (a, b) => (Math.max(a, b) >= 100000 ? 'numbered100000' : editions.matched.has(a) && editions.matched.has(b) ? 'primary' : 'editionMismatch');
const bandOf = (m) => (m < 1000 ? 'below 1 km' : '1 to 5 km');
// A SOCRATES row whose TCA lies within windowEdgeSeconds of either end of the window is counted apart and never
// enters a recall denominator (the window start is read from the report's TCA span), as for the screen's events.
const nearEdge = (jd) => (jd - winStart) * DAY_S < cmp.windowEdgeSeconds || (winEnd - jd) * DAY_S < cmp.windowEdgeSeconds;
// The reference: SOCRATES rows with a screened member whose TCA lies inside the screen's window (every row, for Parts 1 and 2).
const reference = report.filter((r) => (subset.has(r.a) || subset.has(r.b)) && r.tcaJd >= winStart && r.tcaJd < winEnd).map((r) => ({ ...r, key: pairKey(r.a, r.b), cls: classOf(r.a, r.b), band: bandOf(r.rangeM), edge: nearEdge(r.tcaJd) }));

// ---- matching: same pair, |TCA difference| <= matchSeconds, one to one, nearest first -------------------------
const byPair = new Map();
events.forEach((e, n) => { if (!byPair.has(e.key)) byPair.set(e.key, []); byPair.get(e.key).push(n); });
const candidates = [];
reference.forEach((r, i) => {
  for (const n of byPair.get(r.key) ?? []) {
    const dt = Math.abs(events[n].tcaJd - r.tcaJd) * DAY_S;
    if (dt <= cmp.matchSeconds) candidates.push([dt, i, n]);
  }
});
candidates.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
const refTo = new Int32Array(reference.length).fill(-1), evTo = new Int32Array(events.length).fill(-1);
for (const [, i, n] of candidates) if (refTo[i] < 0 && evTo[n] < 0) { refTo[i] = n; evTo[n] = i; }

// ---- recall --------------------------------------------------------------------------------------------------
const CLASSES = ['primary', 'editionMismatch', 'numbered100000'], BANDS = ['below 1 km', '1 to 5 km'];
const recall = {};
for (const cls of CLASSES) {
  recall[cls] = {};
  for (const band of [...BANDS, 'all']) {
    const rows = reference.map((r, i) => i).filter((i) => !reference[i].edge && reference[i].cls === cls && (band === 'all' || reference[i].band === band));
    const found = rows.filter((i) => refTo[i] >= 0).length;
    recall[cls][band] = { reference: rows.length, found, recall: rows.length ? found / rows.length : null };
  }
}

const edgeIdx = reference.map((r, i) => i).filter((i) => reference[i].edge);
const edgeRows = { reference: edgeIdx.length, found: edgeIdx.filter((i) => refTo[i] >= 0).length,
  rows: edgeIdx.map((i) => ({ pair: [reference[i].a, reference[i].b], cls: reference[i].cls, socratesTcaUtc: reference[i].tcaText, socratesRangeM: reference[i].rangeM, found: refTo[i] >= 0 })) };

// ---- the secondary verdict (Amendment A2, declared before its run) ------------------------------------------------
// Below secondary.speedBelowMS the TCA of a flat minimum is ill-conditioned: a VLRV row counts as found when the screen
// reports any event of its pair inside the window; the primary verdict and its rule are unchanged.
const vlrvBelow = a2.secondary.speedBelowMS;
const pairFound = (i) => (byPair.get(reference[i].key) ?? []).some((n) => inWindow(events[n].tcaJd));
const secondaryRecall = {};
for (const cls of CLASSES) {
  secondaryRecall[cls] = {};
  for (const band of [...BANDS, 'all']) {
    const rows = reference.map((r, i) => i).filter((i) => !reference[i].edge && reference[i].cls === cls && (band === 'all' || reference[i].band === band));
    const found = rows.filter((i) => refTo[i] >= 0 || (reference[i].speedMS < vlrvBelow && pairFound(i))).length;
    secondaryRecall[cls][band] = { reference: rows.length, found, recall: rows.length ? found / rows.length : null };
  }
}
const vlrvPairLevel = reference.map((r, i) => i).filter((i) => !reference[i].edge && refTo[i] < 0 && reference[i].speedMS < vlrvBelow && pairFound(i)).map((i) => {
  const r = reference[i], near = (byPair.get(r.key) ?? []).map((n) => events[n]).sort((x, y) => Math.abs(x.tcaJd - r.tcaJd) - Math.abs(y.tcaJd - r.tcaJd))[0];
  return { pair: [r.a, r.b], cls: r.cls, socratesTcaUtc: r.tcaText, socratesRangeM: r.rangeM, socratesSpeedMS: r.speedMS, nearestScreenEvent: { tcaUtc: jdToIso(near.tcaJd), secondsFromSocrates: (near.tcaJd - r.tcaJd) * DAY_S, missM: near.missM } };
});

// ---- geometry of matched events ------------------------------------------------------------------------------
const tol = config.tolerances;
const stratum = (speedMS) => (speedMS >= tol.strata.nlrvMinMS ? 'NLRV' : speedMS >= tol.strata.lrvMinMS ? 'LRV' : 'VLRV');
const dist = (v) => {
  const s = v.map(Math.abs).sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return s.length ? { n: s.length, median: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] } : { n: 0 };
};
const matchedRows = reference.map((r, i) => [r, refTo[i]]).filter(([r, n]) => n >= 0 && !r.edge).map(([r, n]) => {
  const e = events[n];
  const dse = new Map([[e.a, e.aDse], [e.b, e.bDse]]);
  return { r, e, dtS: (e.tcaJd - r.tcaJd) * DAY_S, dMissM: e.missM - r.rangeM, dSpeedMS: e.speedMS - r.speedMS, stratum: stratum(r.speedMS),
    dDse: [dse.get(r.a) - r.aDse, dse.get(r.b) - r.bDse], pcRatio: r.maxProb > 0 && e.maxProb > 0 ? e.maxProb / r.maxProb : null };
});
const row = (x) => ({ pair: [x.r.a, x.r.b], names: [x.r.aName, x.r.bName], socratesTcaUtc: x.r.tcaText, socratesRangeM: x.r.rangeM, socratesSpeedMS: x.r.speedMS,
  screenTcaUtc: jdToIso(x.e.tcaJd), dtSeconds: x.dtS, dMissM: x.dMissM, dSpeedMS: x.dSpeedMS, stratum: x.stratum });
// Per class and stratum: the distributions and the count beyond each registered tolerance (TCA beyond 10 ms is
// gated for NLRV only and counted for every stratum; miss and speed are gated in every stratum).
const geometry = {};
const STRATA = ['NLRV', 'LRV', 'VLRV'];
for (const cls of CLASSES) {
  const rows = matchedRows.filter((x) => x.r.cls === cls);
  const g = { matched: rows.length, byStratum: {}, missM: dist(rows.map((x) => x.dMissM)), speedMS: dist(rows.map((x) => x.dSpeedMS)),
    dseDays: dist(rows.flatMap((x) => x.dDse)), log10PcRatio: dist(rows.filter((x) => x.pcRatio).map((x) => Math.log10(x.pcRatio))),
    pcRatioBelowOne: rows.filter((x) => x.pcRatio && x.pcRatio < 1).length, pcCompared: rows.filter((x) => x.pcRatio).length };
  for (const st of STRATA) {
    const q = rows.filter((x) => x.stratum === st);
    g.byStratum[st] = { matched: q.length, tcaSeconds: dist(q.map((x) => x.dtS)), missM: dist(q.map((x) => x.dMissM)), speedMS: dist(q.map((x) => x.dSpeedMS)),
      beyond: { tca: q.filter((x) => Math.abs(x.dtS) > tol.tcaNlrvSeconds).length, miss: q.filter((x) => Math.abs(x.dMissM) > tol.missM).length, speed: q.filter((x) => Math.abs(x.dSpeedMS) > tol.speedMS).length },
      tcaGated: st === 'NLRV' };
  }
  const beyond = {
    tcaNlrv: rows.filter((x) => x.stratum === 'NLRV' && Math.abs(x.dtS) > tol.tcaNlrvSeconds),
    miss: rows.filter((x) => Math.abs(x.dMissM) > tol.missM),
    speed: rows.filter((x) => Math.abs(x.dSpeedMS) > tol.speedMS),
  };
  g.beyondTolerance = Object.fromEntries(Object.entries(beyond).map(([k, v]) => [k, v.length]));
  const size = { tcaNlrv: (x) => Math.abs(x.dtS), miss: (x) => Math.abs(x.dMissM), speed: (x) => Math.abs(x.dSpeedMS) };
  g.worst = Object.fromEntries(Object.entries(beyond).map(([k, v]) => [k, [...v].sort((x, y) => size[k](y) - size[k](x)).slice(0, cmp.listMax).map(row)]));
  geometry[cls] = g;
}

// ---- misses: every SOCRATES event the screen lacks, with a first diagnosis --------------------------------------
const missIdx = reference.map((r, i) => i).filter((i) => refTo[i] < 0 && !reference[i].edge);
const pairCheck = await openPairCheck();
const misses = [];
for (const i of missIdx) {
  const r = reference[i];
  const same = (byPair.get(r.key) ?? []).map((n) => events[n]).sort((x, y) => Math.abs(x.tcaJd - r.tcaJd) - Math.abs(y.tcaJd - r.tcaJd))[0] ?? null;
  const k = sliceOf(r.tcaJd);
  const listed = [r.a, r.b].flatMap((n) => listingsBySlice.get(k)?.get(n) ?? []);
  const unscreened = listed.filter((l) => notScreenedAt(l, r.tcaJd));
  const absent = [r.a, r.b].filter((n) => !gpByNorad.has(n));
  const d = { pair: [r.a, r.b], names: [r.aName, r.bName], statuses: [r.aStatus, r.bStatus], cls: r.cls, band: r.band, socratesTcaUtc: r.tcaText, socratesRangeM: r.rangeM, socratesSpeedMS: r.speedMS,
    nearestScreenEvent: same && { tcaUtc: jdToIso(same.tcaJd), secondsFromSocrates: (same.tcaJd - r.tcaJd) * DAY_S, missM: same.missM }, listedInSlice: listed, absentFromCatalog: absent,
    failedPairsInSlice: failedPairsBySlice.get(k) ?? 0,
    sliceBoundarySeconds: Math.min(...[k, k + 1].map((b) => Math.abs((r.tcaJd - (winStart + (b * summary.window.sliceSeconds) / DAY_S)) * DAY_S))) };
  if (!absent.length && misses.filter((m) => m.pairMethod).length < cmp.diagnoseMax) d.pairMethod = await pairCheck(gpByNorad.get(r.a), gpByNorad.get(r.b), r.tcaJd);
  d.diagnosis = absent.length ? 'object absent from the catalog' : unscreened.length ? `object not screened at this TCA: ${[...new Set(unscreened.map((l) => `${l.norad}, ${listingWords(l)}`))].join('; ')}`
    : d.nearestScreenEvent && Math.abs(d.nearestScreenEvent.secondsFromSocrates) <= cmp.matchSeconds ? 'matched to another SOCRATES row of the same pair'
    : d.pairMethod?.missM > config.screen.thresholdM ? 'the module puts this minimum beyond 5 km (threshold edge or geometry difference)'
    : d.pairMethod ? 'the module finds this minimum within 5 km: the screen missed it (screen defect)' : 'not diagnosed (cap reached)';
  if (d.failedPairsInSlice) d.diagnosis += `; ${d.failedPairsInSlice} pair evaluations failed in this slice (incomplete-screening, A0)`;
  misses.push(d);
}
await pairCheck.close();

// ---- the screen's events SOCRATES lacks, each explained -------------------------------------------------------
const reportObjects = new Set(runStatus.keys());
const fleetOf = (n) => {
  const name = (satcat.get(n)?.name ?? '').replace(/\s*\[.\]\s*$/, '');
  const m = /^([A-Z][A-Z ]*?[A-Z])(?=[-\s]?\d|$)/.exec(name);
  return m ? m[1] : name;
};
const fleets = new Set(cmp.population.fleets);
const docked = new Map();
for (const g of catalog.rows) {
  const n = Number(g.NORAD_CAT_ID), name = String(g.OBJECT_NAME);
  for (const [complex, patterns] of Object.entries(cmp.population.dockedComplexes)) if (patterns.some((p) => name.startsWith(p))) docked.set(n, complex);
}
const visiting = (n) => cmp.population.visitingVehicles.some((p) => String(gpByNorad.get(n)?.OBJECT_NAME ?? '').startsWith(p));
const active = new Set(cmp.population.activeStatusCodes);
const reportPairs = new Set(report.map((r) => pairKey(r.a, r.b)));
const explain = (e) => {
  if ((e.tcaJd - winStart) * DAY_S < cmp.windowEdgeSeconds || (winEnd - e.tcaJd) * DAY_S < cmp.windowEdgeSeconds) return 'window edge';
  if (e.missM > config.screen.thresholdM - tol.missM) return 'threshold edge';
  const sa = status(e.a), sb = status(e.b), pay = (n) => satcat.get(n)?.type === 'PAY';
  if (!(pay(e.a) && active.has(sa)) && !(pay(e.b) && active.has(sb))) return 'population: no active payload at run time';
  if (sa === '+' && sb === '+' && Math.max(e.a, e.b) < 100000 && fleetOf(e.a) === fleetOf(e.b) && fleets.has(fleetOf(e.a))) return 'population: intra-fleet (operational members of one constellation)';
  const ca = docked.get(e.a), cb = docked.get(e.b);
  if ((ca && (ca === cb || (visiting(e.b) && e.speedMS < cmp.population.dockedSpeedMS))) || (cb && visiting(e.a) && e.speedMS < cmp.population.dockedSpeedMS)) return 'population: docked complex';
  if (editions.mismatched.has(e.a) || editions.mismatched.has(e.b)) return 'edition: SOCRATES used another element set';
  if (!reportObjects.has(e.a) || !reportObjects.has(e.b)) return 'unverified: an object never appears in the report';
  if (reportPairs.has(e.key)) return 'unexplained: SOCRATES lists the pair at other times';
  return 'unexplained';
};
const extras = events.map((e, n) => [e, n]).filter(([e, n]) => evTo[n] < 0 && inWindow(e.tcaJd)).map(([e]) => ({ e, why: explain(e), cls: classOf(e.a, e.b) }));
const extraCounts = {};
for (const x of extras) { extraCounts[x.cls] ??= {}; extraCounts[x.cls][x.why] = (extraCounts[x.cls][x.why] ?? 0) + 1; }
const extraRow = (x) => ({ pair: [x.e.a, x.e.b], names: [gpByNorad.get(x.e.a)?.OBJECT_NAME, gpByNorad.get(x.e.b)?.OBJECT_NAME], statuses: [status(x.e.a), status(x.e.b)],
  tcaUtc: jdToIso(x.e.tcaJd), missM: x.e.missM, speedMS: x.e.speedMS, cls: x.cls, why: x.why });
const unexplained = extras.filter((x) => x.why.startsWith('unexplained') || x.why.startsWith('unverified')).sort((x, y) => x.e.missM - y.e.missM);

// ---- verdict --------------------------------------------------------------------------------------------------
const p = recall.primary.all, g = geometry.primary;
const coverage = full ? 'the whole SOCRATES population: every active primary (Parts 1 and 2)' : `subset: part ${partIds.join(', ')} only (${subset.size} of ${config.primaries.eligible} active primaries)`;
const verdict = {
  coverage,
  recall: { reference: p.reference, found: p.found, status: p.reference === 0 ? 'inconclusive' : p.found === p.reference ? 'pass' : 'fail' },
  geometry: { status: g.matched === 0 ? 'inconclusive' : Object.values(g.beyondTolerance).every((v) => v === 0) ? 'pass' : 'fail', beyondTolerance: g.beyondTolerance },
};
verdict.status = verdict.recall.status === 'pass' && verdict.geometry.status === 'pass' ? 'pass' : verdict.recall.status === 'inconclusive' ? 'inconclusive' : 'fail';
const sp = secondaryRecall.primary.all;
const secondary = { rule: a2.secondary.rule, recall: secondaryRecall, vlrvPairLevel,
  verdict: { recall: { reference: sp.reference, found: sp.found, status: sp.reference === 0 ? 'inconclusive' : sp.found === sp.reference ? 'pass' : 'fail' }, geometry: verdict.geometry } };
secondary.verdict.status = secondary.verdict.recall.status === 'pass' && verdict.geometry.status === 'pass' ? 'pass' : secondary.verdict.recall.status === 'inconclusive' ? 'inconclusive' : 'fail';

const metrics = {
  experiment: id, run: path.basename(dir), plan, tag: null,
  mode: o.dev ? 'dev (synthetic reference on a probe)' : 'registered',
  socrates: { url: config.socrates.url, sha256: config.socrates.sha256, rows: report.length, lastModified: config.socrates.lastModified, window: config.window },
  catalog: { snapshot: config.catalog.snapshot, snapshotSha256: config.catalog.snapshotSha256, cutUtc: config.catalog.cutUtc, replaced: catalog.replaced, objects: catalog.rows.length, ommStreamSha256: summary.catalog.ommStreamSha256 },
  screenManifests: parts.map((q) => ({ part: q.id, run: q.manifest.run, module: q.manifest.module, outputs: q.manifest.outputs, startedAt: q.manifest.startedAt, finishedAt: q.manifest.finishedAt })),
  editions: { reportObjects: editions.objects, matched: editions.matched.size, mismatched: [...editions.mismatched].map(([n, d]) => ({ norad: n, maxDeltaDays: d })), absent: [...editions.absent] },
  parts: partIds, full,
  screen: { primaries: parts.map((q) => q.summary.primaries), units: parts.reduce((n, q) => n + q.summary.units, 0), failedCalls: parts.flatMap((q) => q.summary.failedCalls),
    failedPairs: parts.reduce((n, q) => n + Number(q.summary.failedPairs ?? 0), 0), incompleteUnits: parts.flatMap((q) => (q.summary.incompleteUnits ?? []).map((x) => ({ part: q.id, ...x }))), rawEvents: rawEvents.length, merged, events: events.length, outOfWindow, listings: listingSummary(listingRows), wallMinutes: parts.map((q) => q.summary.wallMinutes), processes: summary.processes, threads: summary.threads },
  reference: { rows: reference.length, byClass: Object.fromEntries(CLASSES.map((c) => [c, reference.filter((r) => r.cls === c).length])) },
  recall, edgeRows, misses, geometry,
  extras: { total: extras.length, byClass: extraCounts, unexplainedOrUnverified: unexplained.length, rows: unexplained.slice(0, cmp.listMax).map(extraRow) },
  tolerances: tol, verdict, secondary, amendment: o.amendment ?? null, module: { commit: pin.commit, version: pin.version, wasmSha256: pin.wasmSha256 },
  runtime: { node: process.version, cpus: os.availableParallelism(), finishedAt: new Date().toISOString() },
};
metrics.tag = `${o.dev ? 'dev-' : ''}${full ? 'full' : `part${partIds.join('-')}`}`;
// Outputs are named by coverage, so Part 1's comparison and the whole population's sit side by side.
const tag = `${o.dev ? 'dev-' : ''}${full ? 'full' : `part${partIds.join('-')}`}`;
fs.writeFileSync(path.join(dir, `metrics.${tag}.json`), `${JSON.stringify(metrics, null, 2)}\n`);
fs.writeFileSync(path.join(dir, `extras.${tag}.json`), `${JSON.stringify(extras.map(extraRow))}\n`);
fs.writeFileSync(path.join(dir, `matches.${tag}.json`), `${JSON.stringify(matchedRows.map(row))}\n`);
log(`reference ${reference.length} (primary ${p.reference}); found ${p.found}; misses ${misses.length}; extras ${extras.length} (${unexplained.length} unexplained or unverified); verdict ${verdict.status}`);
console.log(JSON.stringify({ dir, recall: recall.primary, verdict }));

// The module's pair method around SOCRATES's TCA (+-600 s, 5 s coarse step, 1 ms tolerance, 100 km threshold so
// a minimum beyond 5 km is still reported): its minimum range and TCA for a missed row's pair.
async function openPairCheck() {
  const modules = modulesRoot(o.modules);
  const pinned = pinnedModule(modules, path.join(dir, 'compare'), pin);
  const ca = path.join(pinned.root, 'analysis/conjunction-assessment');
  const cqr = await importFile(path.join(ca, 'tests/lib/cqr.mjs'));
  const hz = await importFile(path.join(ca, 'tests/lib/conjunctionCommandHarness.mjs'));
  const harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: pinned.file });
  const flatc = await cqr.initCqrFlatc();
  const omm = (g) => ({ OBJECT_NAME: g.OBJECT_NAME, OBJECT_ID: g.OBJECT_ID, EPOCH: g.EPOCH, MEAN_MOTION: Number(g.MEAN_MOTION), ECCENTRICITY: Number(g.ECCENTRICITY),
    INCLINATION: Number(g.INCLINATION), RA_OF_ASC_NODE: Number(g.RA_OF_ASC_NODE), ARG_OF_PERICENTER: Number(g.ARG_OF_PERICENTER), MEAN_ANOMALY: Number(g.MEAN_ANOMALY),
    CLASSIFICATION_TYPE: g.CLASSIFICATION_TYPE, NORAD_CAT_ID: Number(g.NORAD_CAT_ID), ELEMENT_SET_NO: Number(g.ELEMENT_SET_NO), REV_AT_EPOCH: Number(g.REV_AT_EPOCH),
    BSTAR: Number(g.BSTAR), MEAN_MOTION_DOT: Number(g.MEAN_MOTION_DOT), MEAN_MOTION_DDOT: Number(g.MEAN_MOTION_DDOT) });
  const check = async (g1, g2, tcaJd) => {
    try {
      const request = cqr.encodeCqr(flatc, { PAIR_REQUEST: { PRIMARY: cqr.gpSource(omm(g1)), SECONDARY: cqr.gpSource(omm(g2)),
        CONTROLS: { ...cqr.screeningControls({ startJd: tcaJd - 600 / DAY_S, durationSeconds: 1200, coarseStepSec: 5, fineTolSec: 0.001, thresholdKm: 100 }), ALGORITHM: 'ALFANO_MAXIMUM' },
        PRIMARY_RADIUS_M: 5, SECONDARY_RADIUS_M: 5, EVALUATION_FRAME: cqr.earthFrame('TEME') } });
      const r = await harness.invoke({ methodId: 'assess_conjunction', inputs: [{ portId: 'request', payload: request }] });
      if (r.statusCode !== 0) return { error: `${r.errorCode}: ${r.errorMessage}` };
      const e = cqr.decodeCqr(flatc, r.outputs[0].payload).EVENT_RESULT;
      return { tcaUtc: e.TCA.ISO8601, secondsFromSocrates: (e.TCA.JULIAN_DATE - tcaJd) * DAY_S, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S };
    } catch (error) { return { error: String(error.message ?? error).split('\n')[0] }; }
  };
  check.close = () => harness.destroy?.();
  return check;
}

// Development reference: two of every three probe events as SOCRATES-like rows (TCA moved 0.4 ms, range and speed
// rounded to SOCRATES's 1 m and 1 m/s, days since epoch to 0.001 d), plus one row an hour away from each fifth kept
// event (a miss to diagnose). The held-out third are the screen's extras.
function syntheticReference(list) {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const rows = [];
  list.forEach((e, n) => {
    if (n % 3 === 0) return;
    const tcaJd = e.tcaJd + 0.0004 / DAY_S, tcaMs = Math.round((tcaJd - 2440587.5) * DAY_S * 1000);
    const base = { i: rows.length, a: e.a, aName: String(e.a), aStatus: null, aDse: r3(e.aDse), b: e.b, bName: String(e.b), bStatus: null, bDse: r3(e.bDse),
      tcaText: new Date(tcaMs).toISOString(), tcaMs, tcaJd, rangeM: Math.round(e.missM), speedMS: Math.round(e.speedMS), maxProb: e.maxProb ?? 0, dilutionM: 0 };
    rows.push(base);
    if (n % 5 === 0) rows.push({ ...base, i: rows.length, tcaJd: base.tcaJd + 1 / 24, tcaMs: base.tcaMs + 3600000, tcaText: new Date(base.tcaMs + 3600000).toISOString() });
  });
  return rows;
}
