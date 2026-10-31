// open-dca-fix: PLAN.md's selection and test.
//   node experiments/open-dca-fix/run.mjs --check     the mechanics on one development date: the pinned product, the publication rule, D, under a minute
//   node experiments/open-dca-fix/run.mjs select      the development selection (density only); rows and summary in the store
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config, root, store, args, DAY, HOUR, MINUTE, iso, dateOf, dayStart, daysOf, isoWeek, sha256, trimmed, median, bootstrap, holm, appendJsonl, readJsonl, writeJson } from './common.mjs';
import { publishedMs, firstFiles } from './lib/planet.mjs';
import { openDensity, issueRecord, movedRecord, publicArcs, issueRequest, sOf, DCL, flatbuffers } from './lib/product.mjs';
import { arcBins, rowsAt, samples, anomalies, statD } from './lib/density.mjs';

// ---- arcs -----------------------------------------------------------------------------------------------------------------------
/** E13's stored NRLMSISE-00 arcs of the calibration Doves, each with the file day that first held its newest state. */
function storedArcs() {
  const sample = new Set(JSON.parse(fs.readFileSync(path.join(root, config.planet.sample))).calibration);
  const rows = config.selection.arcs.flatMap((file) => fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse));
  const kept = rows.map((a) => ({ ...a, B: a.cdAreaOverMass ?? a.cdAreaOverMassN, sigmaB: a.sigmaB ?? a.sigmaLnB * a.cdAreaOverMassN })).filter((a) => sample.has(a.hwid) && a.B > 0 && a.sigmaB / a.B <= 0.5 && a.hours >= 20 && a.hours <= 28);
  const dayOf = (a) => iso(Date.parse(a.utcA) + (a.ttB - a.ttA)).slice(0, 10);
  const days = [...new Set(kept.map((a) => dayOf(a).replaceAll('-', '')))];
  const first = firstFiles(days);
  return kept.map((a) => ({ dove: a.hwid, startMs: Date.parse(a.utcA), endMs: Date.parse(a.utcA) + (a.ttB - a.ttA), y: Math.log(a.B), B: a.B, sigma: a.sigmaB / a.B, file: first.get(`${a.hwid}|${a.ttB}`) }));
}
/** The cutoffs of a file day, by node age: fresh, mid, stale. */
function cutoffsOf(day, next) {
  const fresh = publishedMs(day) + 10 * MINUTE, stale = publishedMs(next) - 10 * MINUTE;
  return { fresh, mid: Math.round((fresh + stale) / 2), stale };
}
const nextDay = (day) => dateOf(dayStart(day) + DAY).replaceAll('-', '');

// ---- selection --------------------------------------------------------------------------------------------------------------------
const SATS = Object.keys(config.selection.truth.products);
const publicationOf = (lag, shrinkWindow = 0) => ({ open_dca_lag_hours: lag, ...(shrinkWindow ? { open_dca_noise_sigma: config.product.noiseSigma, open_dca_shrink_window_hours: shrinkWindow } : {}) });
function records(arcs) {
  const open = new Map(), memo = new Map();
  return async (key, publication, issueMs) => {
    if (!open.has(key)) open.set(key, await openDensity(publication));
    const id = `${key}|${issueMs}`;
    if (!memo.has(id)) memo.set(id, await issueRecord(open.get(key), issueMs, arcs));
    return memo.get(id);
  };
}
/** ln D^2 of bins against a record, its node times moved by dt. */
const lnD2 = (bins, record, dt = 0) => { const D0 = statD(bins.x), D = statD(bins.x.map((v, i) => v - sOf(record.t, record.s, bins.t[i] - dt))); return 2 * Math.log(D / D0); };

/** A candidate's rows at every cutoff of the development dates: { sat, day, age, cutoff, nodeAgeH, D0, now, null, hind, node }. */
async function candidateRows(name, publication, ages, arcs, days, evaluator, emit) {
  const get = records(arcs);
  const offset = (i) => (i + config.selection.wrongDateDays < days.length ? i + config.selection.wrongDateDays : i - config.selection.wrongDateDays);
  for (const [i, day] of days.entries()) {
    const C = cutoffsOf(day, nextDay(day)), Q = days[offset(i)], QC = cutoffsOf(Q, nextDay(Q));
    for (const age of ages) {
      const c = C[age], rows = rowsAt(c);
      if (!rows) continue;
      const now = await get(name, publication, c), other = await get(name, publication, QC[age]), hind = await get(name, publication, c + config.selection.hindcastHours * HOUR);
      for (const sat of SATS) {
        const bins = await evaluator.bins(sat, c, rows);
        if (!bins) continue;
        const row = { name, sat, day, age, cutoff: c, week: isoWeek(c), D0: statD(bins.x) };
        if (now.ok) { row.now = lnD2(bins, now); row.nodeAgeH = (c - now.toMs) / HOUR; } else row.refused = now.error;
        if (other.ok) row.null = lnD2(bins, other, c - QC[age]);
        if (hind.ok) row.hind = lnD2(bins, hind);
        if (now.ok && age === 'fresh') { const end = await evaluator.bins(sat, now.toMs, rows); if (end) row.node = lnD2(end, now); }
        emit(row);
      }
    }
  }
}
/** Selection step 1: the rms of the density change over 12 h windows of the next 72 h against the mean of the last 24 h, held and each tail. */
async function tailStep(arcs, days, evaluator) {
  const get = records(arcs), taus = [null, ...config.selection.tailTauHours], sums = Object.fromEntries(taus.map((t) => [String(t), { sum: 0, n: 0 }])), none = { sum: 0, n: 0 };
  for (const day of days) {
    const c = cutoffsOf(day, nextDay(day)).fresh, rows = rowsAt(c), now = await get('tail', publicationOf(0), c);
    if (!rows || !now.ok) continue;
    const last = now.toMs, sLast = now.s.at(-1);
    const sAt = (t, tau) => (t <= c || tau === null ? sOf(now.t, now.s, t) : sLast * Math.exp(-(t - c) / (tau * HOUR)));
    const meanS = (lo, hi, tau) => { let a = 0, n = 0; for (let t = lo + 300000; t < hi; t += 600000) { a += sAt(t, tau); n += 1; } return a / n; };
    for (const sat of SATS) {
      const points = samples(sat, c - 24 * HOUR, c + 72 * HOUR);
      if (points.length < 3000) continue;
      const x = await anomalies(evaluator.density, points, rows), mean = (lo, hi) => { let a = 0, n = 0; points.forEach((p, i) => { if (p.ms >= lo && p.ms < hi) { a += x[i]; n += 1; } }); return n >= 240 ? a / n : NaN; };
      const before = mean(c - 24 * HOUR, c);
      if (!Number.isFinite(before)) continue;
      for (let w = 0; w < 6; w += 1) {
        const lo = c + w * 12 * HOUR, hi = lo + 12 * HOUR, d = mean(lo, hi) - before;
        if (!Number.isFinite(d)) continue;
        none.sum += d * d; none.n += 1;
        for (const tau of taus) { const e = d - (meanS(lo, hi, tau) - meanS(c - 24 * HOUR, c, tau)); sums[String(tau)].sum += e * e; sums[String(tau)].n += 1; }
      }
    }
    void last;
  }
  const rms = (s) => Math.sqrt(s.sum / s.n);
  return { none: rms(none), n: none.n, tails: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, rms(v)])) };
}
function evaluatorFor(density) {
  const memo = new Map();
  return { density, async bins(sat, end, rows) { const id = `${sat}|${end}`; if (!memo.has(id)) memo.set(id, await arcBins(density, sat, end, rows)); return memo.get(id); } };
}
async function select() {
  const dir = path.join(store, 'selection');
  fs.mkdirSync(dir, { recursive: true });
  const arcs = storedArcs(), days = daysOf(...config.selection.days), density = await openDensity(), evaluator = evaluatorFor(density), summary = { started: iso(Date.now()), arcs: arcs.length };
  // Step 1: tail
  summary.tail = await tailStep(arcs, days, evaluator);
  const T = summary.tail.tails, bestTau = Object.entries(T).filter(([k]) => k !== 'null').sort((a, b) => a[1] - b[1])[0];
  summary.tail.chosen = bestTau[1] < T.null * (1 - config.statistic.tieBand) ? bestTau[0] : 'held';
  writeJson(path.join(dir, 'summary.json'), summary);
  console.log('tail step done');
  if (summary.tail.chosen !== 'held') { console.log('STOP: a decay beat the hold by more than the band; PLAN.md step 1 needs an amendment'); process.exit(3); }
  // Step 2: lag. The legacy record is reported beside.
  const lagRows = path.join(dir, 'lag-rows.jsonl');
  fs.rmSync(lagRows, { force: true });
  const emit = (row) => appendJsonl(lagRows, row), ages = ['fresh', 'mid', 'stale'];
  for (const lag of [0, ...config.selection.lagHours]) { await candidateRows(`lag${lag}`, publicationOf(lag), lag === 0 ? ages : ['fresh'], arcs, days, evaluator, emit); console.log(`lag ${lag} rows done`); }
  writeJson(path.join(dir, 'summary.json'), { ...summary, lag: lagTable(readJsonl(lagRows)) });
  console.log('lag step done');
  await density.destroy();
  process.exit(0);
}
const pairItems = (rows, name, base, field = 'now', baseField = 'now') => { const by = new Map(rows.filter((r) => r.name === base && r.age === 'fresh').map((r) => [`${r.sat}|${r.day}`, r])); return rows.filter((r) => r.name === name && r.age === 'fresh' && Number.isFinite(r[field]) && Number.isFinite(by.get(`${r.sat}|${r.day}`)?.[baseField])).map((r) => ({ week: r.week, value: r[field] - by.get(`${r.sat}|${r.day}`)[baseField] })); };
function lagTable(rows) {
  const out = { byLag: {}, ages: {} }, lags = config.selection.lagHours, ps = {};
  for (const lag of [0, ...lags]) {
    const name = `lag${lag}`, own = rows.filter((r) => r.name === name && r.age === 'fresh' && Number.isFinite(r.now));
    out.byLag[lag] = { now: bootstrap(own.map((r) => ({ week: r.week, value: r.now }))), median: median(own.map((r) => r.now)), againstNull: bootstrap(own.filter((r) => Number.isFinite(r.null)).map((r) => ({ week: r.week, value: r.now - r.null }))), hind: bootstrap(own.filter((r) => Number.isFinite(r.hind)).map((r) => ({ week: r.week, value: r.hind }))), node: bootstrap(own.filter((r) => Number.isFinite(r.node)).map((r) => ({ week: r.week, value: r.node }))), nodeAgeH: median(own.map((r) => r.nodeAgeH)) };
    if (lag) { out.byLag[lag].againstLag0 = bootstrap(pairItems(rows, name, 'lag0')); ps[lag] = out.byLag[lag].againstLag0.p; }
  }
  for (const age of ['mid', 'stale']) { const own = rows.filter((r) => r.name === 'lag0' && r.age === age && Number.isFinite(r.now)); out.ages[age] = { now: bootstrap(own.map((r) => ({ week: r.week, value: r.now }))), nodeAgeH: median(own.map((r) => r.nodeAgeH)) }; }
  const passed = holm(ps, config.statistic.familyLevel).filter((lag) => out.byLag[lag].againstNull.hi < 0);
  const ranked = passed.map(Number).sort((a, b) => out.byLag[a].now.value - out.byLag[b].now.value);
  let chosen = null;
  if (ranked.length) { const best = out.byLag[ranked[0]].now.value; chosen = ranked.filter((lag) => Math.exp(out.byLag[lag].now.value) <= Math.exp(best) * (1 + config.statistic.tieBand)).sort((a, b) => a - b)[0]; }
  return { ...out, holmPassed: holm(ps, config.statistic.familyLevel), passed, chosen };
}

// ---- the check -------------------------------------------------------------------------------------------------------------------
async function check() {
  const arcs = storedArcs(), day = '20251201', C = cutoffsOf(day, nextDay(day));
  const off = await openDensity(), on = await openDensity(publicationOf(9, 168));
  const before = await issueRecord(off, publishedMs(day) - MINUTE, arcs), after = await issueRecord(off, C.fresh, arcs), lagged = await issueRecord(on, C.fresh, arcs);
  for (const r of [before, after, lagged]) if (!r.ok) throw new Error(`the product refused: ${r.error}`);
  if (!(after.toMs > before.toMs)) throw new Error('a file public at the issue did not move the last solve epoch on');
  if (after.s.at(-1) !== after.s.at(-2) || after.t.at(-1) !== after.toMs + 48 * HOUR) throw new Error('the record does not hold its last value');
  if (lagged.toMs !== after.toMs - 9 * HOUR || !lagged.lineage.includes('lag9h; shrink-sigma0.065-window168h')) throw new Error('the typed config did not reach the record');
  const moved = movedRecord(after.dcl, 20 * DAY), d = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(moved)).unpack();
  if (Number(d.SETTINGS.TO_MS) !== after.toMs + 20 * DAY || Number(d.CORRECTION.NODE_TIMES_MS.at(-1)) !== after.t.at(-1) + 20 * DAY) throw new Error('the moved record');
  const rows = rowsAt(C.fresh), bins = await arcBins(off, 'swarmB', C.fresh, rows);
  if (!rows || !bins || !Number.isFinite(statD(bins.x))) throw new Error('no bins');
  if (publicArcs(arcs, C.fresh).some((a) => publishedMs(a.file) > C.fresh)) throw new Error('an arc not public at the issue');
  await off.destroy(); await on.destroy();
  console.log(`PASS open-dca-fix check: the pinned product, the publication rule, the hold, the typed config, the moved record and the bins, on ${day}`);
  process.exit(0);
}

if (args.check) await check();
else if (process.argv[2] === 'select') await select();
else { console.error('usage: run.mjs --check | select'); process.exit(1); }
