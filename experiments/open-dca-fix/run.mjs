// open-dca-fix: PLAN.md's selection and test.
//   node experiments/open-dca-fix/run.mjs --check     the mechanics on one development date: the pinned product, the publication rule, D, under a minute
//   node experiments/open-dca-fix/run.mjs select      the development selection (density only); rows and summary in the store
//   node experiments/open-dca-fix/run.mjs fetch-planet                  the fresh dates' Planet files, local only, at the source's polite rate
//   node experiments/open-dca-fix/run.mjs fit-arcs --shard k/n          the fresh dates' arcs
//   node experiments/open-dca-fix/run.mjs test --shard k/n | table      the registered test
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
  if (summary.tail.chosen !== String(config.product.forecastTauHours)) { console.log(`STOP: step 1 chose ${summary.tail.chosen}, the registered amendment says ${config.product.forecastTauHours}`); process.exit(3); }
  // Step 2: lag. The legacy record is reported beside.
  const lagRows = path.join(dir, 'lag-rows.jsonl');
  fs.rmSync(lagRows, { force: true });
  const emit = (row) => appendJsonl(lagRows, row), ages = ['fresh', 'mid', 'stale'];
  for (const lag of [0, ...config.selection.lagHours]) { await candidateRows(`lag${lag}`, publicationOf(lag), lag === 0 ? ages : ['fresh'], arcs, days, evaluator, emit); console.log(`lag ${lag} rows done`); }
  writeJson(path.join(dir, 'summary.json'), { ...summary, lag: lagTable(readJsonl(lagRows)) });
  console.log('lag step done');
  await density.destroy();
  const table = lagTable(readJsonl(lagRows));
  if (table.chosen === null) { console.log('STOP: no lag passed; PLAN.md step 2 says selection has failed'); process.exit(4); }
  process.exit(0);
}
/** Selection step 4, on the chosen lag: each shrink window against no shrink, in the quietest quarter of windows by the uncorrected D and in the other three. */
async function shrinkStep() {
  const dir = path.join(store, 'selection'), lag = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'))).lag.chosen, base = readJsonl(path.join(dir, 'lag-rows.jsonl')).filter((r) => r.name === `lag${lag}` && r.age === 'fresh' && Number.isFinite(r.now));
  const arcs = storedArcs(), days = daysOf(...config.selection.days), density = await openDensity(), evaluator = evaluatorFor(density), file = path.join(dir, 'shrink-rows.jsonl');
  fs.rmSync(file, { force: true });
  for (const w of config.selection.shrinkWindowHours) await candidateRows(`shrink${w}`, publicationOf(lag, w), ['fresh'], arcs, days, evaluator, (row) => appendJsonl(file, row));
  await density.destroy();
  const rows = readJsonl(file), byKey = new Map(base.map((r) => [`${r.sat}|${r.day}`, r])), D0s = base.map((r) => r.D0).sort((a, b) => a - b), quiet = D0s[Math.floor(D0s.length / 4)], out = { lag, quietBelowD0: quiet, byWindow: {} };
  for (const w of config.selection.shrinkWindowHours) {
    const own = rows.filter((r) => r.name === `shrink${w}` && Number.isFinite(r.now) && byKey.has(`${r.sat}|${r.day}`)).map((r) => ({ week: r.week, value: r.now - byKey.get(`${r.sat}|${r.day}`).now, quiet: r.D0 < quiet, now: r.now, nul: r.null }));
    const q = bootstrap(own.filter((x) => x.quiet)), rest = bootstrap(own.filter((x) => !x.quiet)), all = bootstrap(own);
    out.byWindow[w] = { quiet: q, rest, all, now: bootstrap(own.map((x) => ({ week: x.week, value: x.now }))), againstNull: bootstrap(own.filter((x) => Number.isFinite(x.nul)).map((x) => ({ week: x.week, value: x.now - x.nul }))), passes: q.hi < 0 && Math.exp(rest.value) <= 1 + config.statistic.tieBand };
  }
  const passed = Object.entries(out.byWindow).filter(([, v]) => v.passes).sort((a, b) => a[1].all.value - b[1].all.value);
  out.chosen = passed.length ? Number(passed[0][0]) : null;
  writeJson(path.join(dir, 'shrink-summary.json'), out);
  console.log('shrink step done');
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

// ---- selection step 3: W_N on the shifted window -------------------------------------------------------------------------------------
/** Each development arc's ln(W_N over its labeled window / W_N over the window earlier by the chosen lag), along one FFM trajectory from the Dove's previous state. Shard k of n. */
async function wnArcs() {
  const { openFit } = await import('./lib/ffm.mjs');
  const { planetSeries, statesFrame, dragWork } = await import('./lib/arcs.mjs');
  const { W } = await import('./lib/density.mjs');
  const dir = path.join(store, 'selection'), lag = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'))).lag.chosen, [k, n] = (args.shard ?? '0/1').split('/').map(Number), out = path.join(dir, `wn-arcs.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => r.key));
  const arcs = config.selection.arcs.slice(0, 1).flatMap((file) => fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse)).filter((a) => a.cdAreaOverMassN > 0);
  const series = planetSeries(daysOf('2025-09-28', '2026-01-02').filter((d) => publishedMs(d))), F = await openFit(), density = await openDensity(), lagMs = lag * HOUR, offset = (t) => t;
  const forces = { degree: 12, order: 12, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: false };
  const list = arcs.filter((a) => series.has(a.hwid)).sort((a, b) => a.ttA - b.ttA || a.hwid.localeCompare(b.hwid));
  for (const [i, a] of list.entries()) {
    const key = `${a.hwid}|${a.ttB}`;
    if (i % n !== k || done.has(key)) continue;
    while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await new Promise((r) => setTimeout(r, 60000));
    const states = series.get(a.hwid), at = states.findIndex((s) => s.ttMs === a.ttA), before = at - 1;
    if (at < 1 || states[at + 1]?.ttMs !== a.ttB || a.ttA - states[before].ttMs < lagMs + HOUR) { appendJsonl(out, { key, skip: 'no earlier state' }); continue; }
    try {
      const frame = await statesFrame(density, a.hwid, [states[before], states[at], states[at + 1]], Date.parse(a.utcA), null), [P, A, B] = frame.lines;
      const ms = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`), start = ms(A.EPOCH), stop = ms(B.EPOCH), rows = W.rowsM(start - 8 * DAY, stop + 2 * DAY).rows;
      const grid = (lo, hi) => { const g = []; for (let t = lo; t < hi; t += 300000) g.push(t); g.push(hi); return g; };
      const label = grid(start, stop), shifted = grid(start - lagMs, stop - lagMs), times = [...new Set([...shifted, ...label])].sort((x, y) => x - y), epochs = times.map((t) => iso(t).replace(/Z$/, ''));
      const X = await F.trajectory({ epoch: P.EPOCH, state: [P.X, P.Y, P.Z, P.X_DOT, P.Y_DOT, P.Z_DOT].map((v) => v * 1000), parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: a.cdAreaOverMassN }, { kind: 'SRP_AREA_OVER_MASS', value: a.crAreaOverMass ?? 0.0135 }], forces, integrator: { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 }, epochs, rows, fromMs: ms(P.EPOCH), toMs: stop });
      const at2 = new Map(times.map((t, j) => [t, X[j]])), work = (g) => dragWork(density, g.map((t) => ({ epoch: iso(t).replace(/Z$/, ''), x: at2.get(t) })), rows);
      const wl = await work(label), ws = await work(shifted);
      appendJsonl(out, { key, dy: Math.log(wl / ws) });
    } catch (error) { appendJsonl(out, { key, error: String(error?.message ?? error).slice(0, 200) }); await F.reopen(); }
    void offset;
  }
  await F.close();
  process.exit(0);
}
/** Selection step 3's table: the plain lag against the lag with y on the shifted window, at fresh cutoffs. */
async function wnTable() {
  const dir = path.join(store, 'selection'), lag = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'))).lag.chosen, dy = new Map(), rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^wn-arcs\.s\d+\.jsonl$/.test(x))) for (const r of readJsonl(path.join(dir, f))) if (Number.isFinite(r.dy)) dy.set(r.key, r.dy);
  const sample = new Set(JSON.parse(fs.readFileSync(path.join(root, config.planet.sample))).calibration);
  const source = config.selection.arcs.flatMap((file) => fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse));
  const keyOf = new Map(source.map((a) => [`${a.hwid}|${Date.parse(a.utcA)}`, `${a.hwid}|${a.ttB}`]));
  const arcs = storedArcs().map((a) => { const d = dy.get(keyOf.get(`${a.dove}|${a.startMs}`)); return d === undefined ? a : { ...a, y: a.y + d }; });
  void sample;
  const days = daysOf(...config.selection.days), density = await openDensity(), evaluator = evaluatorFor(density);
  await candidateRows('wn', publicationOf(lag), ['fresh'], arcs, days, evaluator, (row) => rows.push(row));
  await density.destroy();
  const base = readJsonl(path.join(dir, 'lag-rows.jsonl')).filter((r) => r.name === `lag${lag}` && r.age === 'fresh' && Number.isFinite(r.now)), byKey = new Map(base.map((r) => [`${r.sat}|${r.day}`, r]));
  const items = rows.filter((r) => Number.isFinite(r.now) && byKey.has(`${r.sat}|${r.day}`)).map((r) => ({ week: r.week, value: r.now - byKey.get(`${r.sat}|${r.day}`).now }));
  const out = { lag, arcsShifted: dy.size, against: bootstrap(items), now: bootstrap(rows.filter((r) => Number.isFinite(r.now)).map((r) => ({ week: r.week, value: r.now }))), plain: bootstrap(base.map((r) => ({ week: r.week, value: r.now }))), dy: { median: median([...dy.values()]), rms: Math.sqrt([...dy.values()].reduce((a, b) => a + b * b, 0) / dy.size) } };
  // Amendment A2: by the step's own statistic, the trimmed mean of ln D^2 of each arm; the paired reading is reported beside it.
  out.wins = Math.exp(out.now.value) < Math.exp(out.plain.value) * (1 - config.statistic.tieBand);
  writeJson(path.join(dir, 'wn-summary.json'), out);
  console.log('W_N step done');
  process.exit(0);
}

// ---- the fresh dates' inputs: fetched once, at the source's polite rate, kept in the store ------------------------------------------
/** Planet's file of each day from `from` to `to`: its bytes in <store>/planet, its Last-Modified in the publication table. */
async function fetchPlanet() {
  const [from, to] = [args.from ?? config.test.planetFrom, args.to ?? config.test.planetTo];
  const dir = path.join(store, 'planet'), tableFile = path.join(store, config.planet.publishedFile);
  fs.mkdirSync(dir, { recursive: true });
  for (const day of daysOf(from, to)) {
    const file = path.join(dir, `planet_${day}.states`), table = JSON.parse(fs.readFileSync(tableFile));
    if (fs.existsSync(file) && table.days[day]) continue;
    const url = `${config.planet.server}planet_${day}.states`, response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (response.status !== 200) throw new Error(`${url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer()), modified = response.headers.get('last-modified');
    if (!modified) throw new Error(`${url}: no Last-Modified`);
    fs.writeFileSync(file, bytes);
    table.days[day] = modified;
    table.days = Object.fromEntries(Object.entries(table.days).sort());
    writeJson(tableFile, table);
    appendJsonl(path.join(dir, 'index.jsonl'), { url, retrieved: iso(Date.now()), bytes: bytes.length, sha256: sha256(bytes), lastModified: modified, etag: response.headers.get('etag') });
    await new Promise((r) => setTimeout(r, config.planet.politeSeconds * 1000));
  }
  console.log(`Planet files ${from} to ${to} in the store`);
  process.exit(0);
}

// ---- the fresh dates' arcs ---------------------------------------------------------------------------------------------------------------
/** The energy fit of every 20-28 h pair of each calibration Dove over the test's history, by the product's own fit_energy_arcs, weather as released at the arc's publication. Shard by Dove. */
async function fitArcs() {
  const { openFit } = await import('./lib/ffm.mjs');
  const { planetSeries, fitArc } = await import('./lib/arcs.mjs');
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number), out = path.join(store, 'arcs', `s${k}.jsonl`), done = new Map();
  for (const r of readJsonl(out)) done.set(`${r.dove}|${r.ttB}`, r);
  const series = planetSeries(daysOf(config.test.arcs.fromDay, config.test.arcs.toDay).filter((d) => publishedMs(d))), F = await openFit(), density = await openDensity(), doves = [...series.keys()].sort();
  for (const [index, dove] of doves.entries()) {
    if (index % n !== k) continue;
    const states = series.get(dove);
    let seed = null;
    for (let j = 1; j < states.length; j += 1) {
      const a = states[j - 1], b = states[j], hours = (b.ttMs - a.ttMs) / HOUR, key = `${dove}|${b.ttMs}`;
      if (hours < 20 || hours > 28) continue;
      if (done.has(key)) { if (done.get(key).ok) seed = done.get(key).B; continue; }
      while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await new Promise((r) => setTimeout(r, 60000));
      const publishedAt = publishedMs(b.file), rows = rowsAt(publishedAt);
      if (!rows) { appendJsonl(out, { dove, ttA: a.ttMs, ttB: b.ttMs, ok: false, error: 'no RSGA at the publication' }); continue; }
      let row;
      try { row = await fitArc(density, F, dove, a, b, publishedAt, rows, seed); } catch (error) { row = { ok: false, error: String(error?.message ?? error).slice(0, 200) }; await F.reopen(); }
      if (row.ok) seed = row.B;
      appendJsonl(out, { dove, ttA: a.ttMs, ttB: b.ttMs, file: b.file, ...row });
    }
  }
  await F.close();
  console.log(`shard ${k}/${n} done`);
  process.exit(0);
}
const testArcs = () => fs.readdirSync(path.join(store, 'arcs')).filter((f) => /^s\d+\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(store, 'arcs', f))).filter((r) => r.ok);

// ---- the test ------------------------------------------------------------------------------------------------------------------------------
const CHOSEN = () => { const c = config.product.chosen; if (!c) throw new Error('config.product.chosen is not set'); return c; };
function testJobs() {
  const days = daysOf(...config.test.days), jobs = [], mod = new Set(config.test.reportEveryIndexMod4);
  days.forEach((day, i) => {
    const norad = i % 2 === 0 ? config.test.satellites.even : config.test.satellites.odd, report = mod.has(i % 4), base = { day, index: i, norad };
    jobs.push({ ...base, arm: 'F2', age: 'fresh', forecast: true }, { ...base, arm: 'F4', age: 'fresh', forecast: true }, { ...base, arm: 'FH', age: 'fresh' }, { ...base, arm: 'FP', age: 'fresh' });
    if (report) jobs.push({ ...base, arm: 'F4a', age: 'fresh' }, { ...base, arm: 'F2n', age: 'node' }, { ...base, arm: 'FN', age: 'node' }, { ...base, arm: 'F2', age: 'mid' }, { ...base, arm: 'F4', age: 'mid' }, { ...base, arm: 'F2', age: 'stale' }, { ...base, arm: 'F4', age: 'stale' });
  });
  return jobs;
}
/** The test's fits and forecasts, shard k of n; a done key is skipped, so a stopped shard resumes. */
async function runTest() {
  const { openFit } = await import('./lib/ffm.mjs');
  const { series } = await import('./lib/truth.mjs');
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number), dir = path.join(store, 'test-rows'), out = path.join(dir, `s${k}.jsonl`), done = new Set();
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) for (const r of readJsonl(path.join(dir, f))) done.add(r.key);
  const arcs = testArcs(), days = daysOf(...config.test.days), chosen = await openDensity(CHOSEN()), off = await openDensity(), F = await openFit(), records = new Map();
  const record = async (name, density, issue) => { const id = `${name}|${issue}`; if (!records.has(id)) { if (records.size > 64) records.delete(records.keys().next().value); records.set(id, await issueRecord(density, issue, arcs)); } return records.get(id); };
  const offset = (i) => (i + config.selection.wrongDateDays < days.length ? i + config.selection.wrongDateDays : i - config.selection.wrongDateDays);
  const ms = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);
  const jobs = testJobs();
  for (const [j, job] of jobs.entries()) {
    const key = `${job.arm}|${job.day}|${job.age}`;
    if (j % n !== k || done.has(key)) continue;
    while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await new Promise((r) => setTimeout(r, 60000));
    const C = cutoffsOf(job.day, nextDay(job.day)), week = isoWeek(C.fresh), row = { key, arm: job.arm, day: job.day, age: job.age, index: job.index, norad: job.norad, week };
    try {
      const cutoff = job.age === 'node' ? C.fresh : C[job.age], rows = rowsAt(cutoff);
      if (!rows) throw new Error('no RSGA at the cutoff');
      let dcl = null, end = cutoff;
      const product = async () => { const r = await record('F4', chosen, C.fresh); if (!r.ok) throw new Error(`product: ${r.error}`); return r; };
      if (job.arm === 'F4' || job.arm === 'FN') { const r = await product(); dcl = r.dcl; row.nodeAgeH = (cutoff - r.toMs) / HOUR; }
      if (job.arm === 'FN' || job.arm === 'F2n') end = (await product()).toMs;
      if (job.arm === 'F4a') { const r = await record('F4a', off, C.fresh); if (!r.ok) throw new Error(`product: ${r.error}`); dcl = r.dcl; row.nodeAgeH = (cutoff - r.toMs) / HOUR; }
      if (job.arm === 'FH') { const r = await record('FH', chosen, C.fresh + config.selection.hindcastHours * HOUR); if (!r.ok) throw new Error(`product: ${r.error}`); dcl = r.dcl; }
      if (job.arm === 'FP') { const q = days[offset(job.index)], QC = cutoffsOf(q, nextDay(q)), r = await record('F4', chosen, QC.fresh); if (!r.ok) throw new Error(`product: ${r.error}`); dcl = movedRecord(r.dcl, C.fresh - QC.fresh); }
      const lines = series(job.norad, end - 72 * HOUR, end);
      if (lines.length < 0.9 * 864) throw new Error(`coverage ${lines.length}`);
      const horizon = cutoff + 8 * DAY, fit = await F.fit(job.norad, lines, rows, dcl, horizon), { state, epoch, parameters, ...record1 } = fit;
      Object.assign(row, record1);
      if (fit.ok && job.forecast) {
        row.days = {};
        for (const lead of config.test.leadDays) {
          const truth = series(job.norad, cutoff + (lead - 1) * DAY + 1, cutoff + lead * DAY);
          if (truth.length < 200) continue;
          const at = await F.forecast(job.norad, fit, ms(lines[0].epoch), truth.map((l) => l.epoch), rows, dcl, horizon);
          const sum = at.reduce((acc, r, q) => acc + (r[0] - truth[q].r[0]) ** 2 + (r[1] - truth[q].r[1]) ** 2 + (r[2] - truth[q].r[2]) ** 2, 0);
          row.days[lead] = { rmsKm: Math.sqrt(sum / at.length), n: at.length };
        }
      }
    } catch (error) { row.ok = false; row.error = String(error?.stack ?? error).slice(0, 300); try { await F.reopen(); } catch { /* the next job fails too */ } }
    appendJsonl(out, row);
  }
  await F.close();
  console.log(`shard ${k}/${n} done`);
  process.exit(0);
}
/** The registered table, in the store (INTERNAL); the verdict alone may be published. */
function testTable() {
  const dir = path.join(store, 'test-rows'), rows = fs.readdirSync(dir).flatMap((f) => readJsonl(path.join(dir, f))), by = new Map(rows.map((r) => [r.key, r]));
  const ln = (arm, base, age = 'fresh', baseAge = age) => rows.filter((r) => r.arm === arm && r.age === age).flatMap((r) => { const b = by.get(`${base}|${r.day}|${baseAge}`); if (!b) return []; const x = r.ok && r.reducedChiSquare > 0 ? r.reducedChiSquare : Infinity, y = b.ok && b.reducedChiSquare > 0 ? b.reducedChiSquare : Infinity; if (x === Infinity && y === Infinity) return []; return [{ week: r.week, value: y === Infinity ? -Infinity : Math.log(x / y) }]; });
  const safe = (v) => (Number.isFinite(v) ? v : null);
  const cell = (items) => { const f = items.filter((i) => Number.isFinite(i.value)), b = bootstrap(items); return { trimmed: safe(b.value), lo: safe(b.lo), hi: safe(b.hi), p: b.p, median: f.length ? median(f.map((i) => i.value)) : null, n: items.length, failures: items.length - f.length, weeks: b.weeks }; };
  const inArc = { 'F4/F2': cell(ln('F4', 'F2')), 'FH/F2': cell(ln('FH', 'F2')), 'FP/F2': cell(ln('FP', 'F2')), 'F4/FP': cell(ln('F4', 'FP')), 'F4a/F2': cell(ln('F4a', 'F2')), 'FN/F2n': cell(ln('FN', 'F2n', 'node')), 'F4/F2 mid': cell(ln('F4', 'F2', 'mid')), 'F4/F2 stale': cell(ln('F4', 'F2', 'stale')) };
  const forecast = {};
  for (const lead of config.test.leadDays) {
    const items = rows.filter((r) => r.arm === 'F4' && r.age === 'fresh').flatMap((r) => { const b = by.get(`F2|${r.day}|fresh`), x = r.days?.[lead]?.rmsKm, y = b?.days?.[lead]?.rmsKm; if (!b) return []; if (!x && !y) return []; return [{ week: r.week, value: !y ? -Infinity : !x ? Infinity : Math.log(x / y) }]; });
    forecast[lead] = cell(items);
  }
  const family = config.statistic.familyLevel, passed = holm({ 'F4/FP': inArc['F4/FP'].p, 'F4/F2': inArc['F4/F2'].p }, family), control = inArc['FH/F2'].hi !== null && inArc['FH/F2'].hi < 0;
  const gain = holm(Object.fromEntries(Object.entries(forecast).map(([k, v]) => [k, v.p])), family), above = Object.values(forecast).some((v) => v.lo !== null && v.lo > 0), noHarm = Object.values(forecast).every((v) => v.hi !== null && v.hi < Math.log(1.1)), attempted = Object.values(forecast).reduce((a, v) => a + v.n, 0), failed = Object.values(forecast).reduce((a, v) => a + v.failures, 0);
  const verdict = { control, inArc: !control ? 'no verdict: the control did not pass' : passed.includes('F4/F2') && passed.includes('F4/FP') ? 'both pass' : passed.includes('F4/FP') ? 'F4/FP only' : passed.includes('F4/F2') ? 'F4/F2 only' : 'neither', forecastGain: gain.length && !above ? gain : [], noHarm: noHarm && failed / attempted <= 0.01, failedForecasts: failed, attemptedForecasts: attempted };
  const q = rows.filter((r) => r.arm === 'F2' && r.age === 'fresh' && r.ok).map((r) => r.reducedChiSquare).sort((a, b) => a - b), edges = [q[Math.floor(q.length / 4)], q[Math.floor(q.length / 2)], q[Math.floor((3 * q.length) / 4)]], quartiles = [0, 1, 2, 3].map((k) => cell(rows.filter((r) => r.arm === 'F4' && r.age === 'fresh').flatMap((r) => { const b = by.get(`F2|${r.day}|fresh`); if (!b?.ok || !r.ok) return []; const c = b.reducedChiSquare, inQ = (k === 0 || c >= edges[k - 1]) && (k === 3 || c < edges[k]); return inQ ? [{ week: r.week, value: Math.log(r.reducedChiSquare / c) }] : []; })));
  writeJson(path.join(store, 'test-table.json'), { rows: rows.length, jobs: testJobs().length, inArc, forecast, verdict, quartiles, nodeAgeH: { fresh: median(rows.filter((r) => r.arm === 'F4' && r.age === 'fresh' && Number.isFinite(r.nodeAgeH)).map((r) => r.nodeAgeH)), mid: median(rows.filter((r) => r.arm === 'F4' && r.age === 'mid' && Number.isFinite(r.nodeAgeH)).map((r) => r.nodeAgeH)), stale: median(rows.filter((r) => r.arm === 'F4' && r.age === 'stale' && Number.isFinite(r.nodeAgeH)).map((r) => r.nodeAgeH)) } });
  console.log(`table written: ${rows.length} rows of ${testJobs().length}`);
  process.exit(0);
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
  const chosen = await openDensity(CHOSEN()), final = await issueRecord(chosen, C.fresh, arcs);
  if (!final.ok || !final.lineage.includes('hold-to-issue-then-tau168h; lag9h; shrink-off')) throw new Error('the chosen config did not reach the record');
  await off.destroy(); await on.destroy(); await chosen.destroy();
  console.log(`PASS open-dca-fix check: the pinned product, the publication rule, the hold, the typed config, the moved record and the bins, on ${day}`);
  process.exit(0);
}

if (args.check) await check();
else if (process.argv[2] === 'select') await select();
else if (process.argv[2] === 'select-shrink') await shrinkStep();
else if (process.argv[2] === 'select-wn') await wnArcs();
else if (process.argv[2] === 'select-wn-table') await wnTable();
else if (process.argv[2] === 'fetch-planet') await fetchPlanet();
else if (process.argv[2] === 'fit-arcs') await fitArcs();
else if (process.argv[2] === 'test') await runTest();
else if (process.argv[2] === 'table') testTable();
else { console.error('usage: run.mjs --check | select'); process.exit(1); }
