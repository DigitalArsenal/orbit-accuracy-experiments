#!/usr/bin/env node
// The tables of experiments/ap-catalog-construction (PLAN.md): per-set rows become aggregates. No per-set or per-satellite row leaves
// the store. Parts 1 and 2 write results/ap-catalog-construction/part<N>/; part H writes into the store only (published on the owner's
// word, stack issue 288); the dry runs write beside their rows under runs/.
//   node experiments/ap-catalog-construction/table.mjs --part 1|2|H|dev-A|dev-B|dev-H [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { median } from '../ap-from-public-sets/lib.mjs';
import { satelliteStatistic, tailStatistics, meetsTail } from './lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const STATS = CONFIG.statistics, TH = STATS.tailThresholds;

/** The catalog's rule for a class (PLAN.md): the new construction where its served record BEATS the set, its interval against the
 *  earlier construction lies wholly below 1 and it meets the three tail thresholds; else the earlier construction where that BEATS the
 *  set and meets them; else the set on SGP4. An interval that spans 1, or does not exist, keeps the earlier construction. */
export function catalogDecision(servedVsSet, servedVsEarlier, servedTail, earlierVsSet, earlierTail, th = TH) {
  if (servedVsSet.verdict === 'BEATS' && servedVsEarlier.hi != null && servedVsEarlier.hi < 1 && meetsTail(servedTail, th)) return 'new construction';
  if (earlierVsSet.verdict === 'BEATS' && meetsTail(earlierTail, th)) return 'earlier construction';
  return 'set';
}
/** Part 2 for a class that part 1 gave to the new construction: holds when its served record against the earlier construction has an
 *  interval whose upper end is below the registered margin, on at least the minimum satellites and sets; fails when it does not; a
 *  class with fewer is untested. Other classes: not applicable. */
export function part2Holds(part1Decision, servedVsEarlier, stats = STATS) {
  if (part1Decision !== 'new construction') return 'not applicable';
  if (servedVsEarlier.satellites < stats.minimumSatellites || servedVsEarlier.sets < stats.minimumSets || servedVsEarlier.hi == null) return 'untested';
  return servedVsEarlier.hi < stats.part2Margin ? 'holds' : 'fails';
}

const km = (x) => (x == null ? null : Number(x.toFixed(4)));
const num = (x) => (x == null ? null : Number(x.toFixed(3)));
const fig = (row, name) => (name === 'A' ? { p: row.A?.primary, d: row.A?.days } : row.arms?.[name] ?? null);
const XPof = (row) => (row.XP ? { p: row.XP.primary, d: row.XP.days } : null);
const SAMEof = (row) => (row.XPsame && !row.XPsame.e ? { p: row.XPsame.primary, d: row.XPsame.days } : null);
const val = (x, d = null) => (x && !x.e ? (d == null ? x.p : x.d?.[d]) ?? null : null);
const pairsOf = (list, N, D, d = null) => list.flatMap((r) => { const a = val(N(r), d), b = val(D(r), d); return a > 0 && b > 0 ? [{ sat: r.norad, x: Math.log(a / b) }] : []; });
const tailRows = (list, R) => list.flatMap((r) => { const a = val(fig(r, 'A')), b = val(R(r)); return a > 0 && b > 0 ? [{ sat: r.norad, a, b }] : []; });
const count = (list, key) => list.reduce((m, r) => ({ ...m, [r[key]]: (m[r[key]] ?? 0) + 1 }), {});
const shrink = (s) => ({ ...s, ratio: num(s.ratio), lo: num(s.lo), hi: num(s.hi), coverage: num(s.coverage), shareCloser: num(s.shareCloser), bootstrap: s.bootstrap && { ratio: num(s.bootstrap.ratio), lo: num(s.bootstrap.lo), hi: num(s.bootstrap.hi) } });
const shrinkTail = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? v.map(num) : num(v)]));

const REC = { served: (r) => fig(r, r.served), public: (r) => fig(r, r.public), earlier: (r) => fig(r, r.earlier), earlier0: (r) => fig(r, r.earlier0), set: (r) => fig(r, 'A') };

/** Parts 1, 2 and the dry runs of periods: each record against the set (statistic, verdict, tail), against the earlier construction. */
function block(list, part1Decision) {
  const out = { rows: list.length, servedAs: count(list, 'served'), publicAs: count(list, 'public'), earlierAs: count(list, 'earlier'), earlierUnguardedAs: count(list, 'earlier0'), records: {} };
  for (const name of ['served', 'public', 'earlier', 'earlier0']) {
    out.records[name] = { km: km(median(list.map((r) => val(REC[name](r))))), vsSet: shrink(satelliteStatistic(pairsOf(list, REC[name], REC.set), STATS)), tail: shrinkTail(tailStatistics(tailRows(list, REC[name]), STATS)) };
  }
  out.setKm = km(median(list.map((r) => val(REC.set(r)))));
  out.servedVsEarlier = shrink(satelliteStatistic(pairsOf(list, REC.served, REC.earlier), STATS));
  out.publicVsEarlier = shrink(satelliteStatistic(pairsOf(list, REC.public, REC.earlier), STATS));
  out.days = Array.from({ length: CONFIG.scoring.days }, (_, d) => ({ day: d + 1, servedVsSet: num(satelliteStatistic(pairsOf(list, REC.served, REC.set, d), STATS).ratio), servedVsEarlier: num(satelliteStatistic(pairsOf(list, REC.served, REC.earlier, d), STATS).ratio) }));
  const R = out.records;
  out.catalog = catalogDecision(R.served.vsSet, out.servedVsEarlier, R.served.tail, R.earlier.vsSet, R.earlier.tail);
  out.catalogPublicOnly = catalogDecision(R.public.vsSet, out.publicVsEarlier, R.public.tail, R.earlier.vsSet, R.earlier.tail);
  if (part1Decision !== undefined) out.part2 = { part1Decision, result: part2Holds(part1Decision, out.servedVsEarlier) };
  return out;
}
/** Part H: one row per satellite; verdicts on satellites alone (no set minimum: one set each). */
function blockH(list) {
  const S = { ...STATS, minimumSets: STATS.minimumSatellites };
  const st = (N, D) => shrink(satelliteStatistic(pairsOf(list, N, D), S));
  return { satellites: list.length, xpKm: km(median(list.map((r) => val(XPof(r))))), setKm: km(median(list.map((r) => val(REC.set(r))))), servedKm: km(median(list.map((r) => val(REC.served(r))))),
    publicKm: km(median(list.map((r) => val(REC.public(r))))), servedAs: count(list, 'served'),
    servedVsXp: st(REC.served, XPof), publicVsXp: st(REC.public, XPof), earlierVsXp: st(REC.earlier, XPof), setVsXp: st(REC.set, XPof), servedVsXpSame: st(REC.served, SAMEof), xpSameVsXp: st(SAMEof, XPof),
    days: Array.from({ length: CONFIG.parts.H.days }, (_, d) => ({ day: d + 1, xpKm: km(median(list.map((r) => val(XPof(r), d)))), servedKm: km(median(list.map((r) => val(REC.served(r), d)))) })) };
}

const cell = (s) => (s?.verdict === 'FEW' && s.lo == null ? 'FEW' : s?.ratio == null ? 'no pairs' : `${s.ratio.toFixed(2)}${s.lo == null ? '' : ` (${s.lo.toFixed(2)} to ${s.hi.toFixed(2)})`} ${s.verdict}`);
const bcell = (s) => (s?.bootstrap?.ratio == null ? '' : `${s.bootstrap.ratio.toFixed(2)}${s.bootstrap.lo == null ? '' : ` (${s.bootstrap.lo.toFixed(2)} to ${s.bootstrap.hi.toFixed(2)})`}`);
const tailCell = (t) => (t?.T95 == null ? '' : `${t.T95.toFixed(2)} / ${t.Trms.toFixed(2)} / ${(100 * t.shareBeyondTwice).toFixed(1)} %`);
function render(partId, t) {
  const L = [`# The catalog's AP construction: ${partId.startsWith('dev') ? `dry run ${partId}` : `part ${partId}`}`, '', 'Generated by `experiments/ap-catalog-construction/table.mjs` from the run\'s rows; nothing here is typed. Plan: `experiments/ap-catalog-construction/PLAN.md`.', ''];
  if (t.capture) {
    L.push(`Capture time ${t.captureUtc}; ${t.counts.sets} satellites scored from it. 72 h error from the capture time, median km. Ratio: the median over satellites, with the order-statistic interval of at least 95 % coverage; under ${STATS.minimumSatellites} satellites FEW and no ratio. Served: the registered chain; public: the chain without operator inputs; XPsame: the provider's theory (the XP module's own fit) fitted to the served record's input states.`, '');
    L.push('| Class | Satellites | XP km | Set km | Served km | Served / XP | Public / XP | Set / XP | Served / XPsame | XPsame / XP |', '| --- | --: | --: | --: | --: | --- | --- | --- | --- | --- |');
    for (const c of CONFIG.classes) {
      const b = t.classes[c];
      if (!b.satellites) continue;
      if (b.satellites < STATS.minimumSatellites) { L.push(`| ${c} | ${b.satellites} | | | | FEW | FEW | FEW | FEW | FEW |`); continue; }
      L.push(`| ${c} | ${b.satellites} | ${b.xpKm ?? ''} | ${b.setKm ?? ''} | ${b.servedKm ?? ''} | ${cell(b.servedVsXp)} | ${cell(b.publicVsXp)} | ${cell(b.setVsXp)} | ${cell(b.servedVsXpSame)} | ${cell(b.xpSameVsXp)} |`);
    }
    return `${L.join('\n')}\n`;
  }
  L.push(`Sets with epochs from ${t.span.from.slice(0, 10)} to ${t.span.to.slice(0, 10)} (exclusive): ${t.counts.sets} sets of ${t.counts.satellites} satellites with truth; ${t.counts.withoutScoredFirstDay} more sets had no scored first day; ${t.counts.errors} errors; ${t.counts.truthStatesScreenedOut} truth states dropped by the truth gate's jump screen.`, '');
  L.push(`Error: RMS of 3D position over the 72 hours after the set's epoch, median km. Ratio: the median over satellites of each satellite's median ratio, with the order-statistic interval of at least 95 % coverage (FEW under ${STATS.minimumSatellites} satellites or ${STATS.minimumSets} sets). Tail: T95 / Trms / share of sets beyond twice the set (amendment A3 of ap-from-public-sets; thresholds ${TH.T95.toFixed(2)} / ${TH.Trms.toFixed(2)} / ${(100 * TH.shareBeyondTwice).toFixed(1)} %). Served: the registered chain; public: the chain without operator inputs; earlier: A3's guarded record of ap-from-public-sets; earlier unguarded: D5, else B3.`, '');
  L.push('## By orbit class, against the set on SGP4', '', '| Class | Set km | Served km | Served / set | Tail | Public / set | Tail | Earlier / set | Tail | Earlier unguarded / set |', '| --- | --: | --: | --- | --- | --- | --- | --- | --- | --- |');
  for (const c of CONFIG.classes) { const b = t.classes[c], R = b.records; L.push(`| ${c} | ${b.setKm ?? ''} | ${R.served.km ?? ''} | ${cell(R.served.vsSet)} | ${tailCell(R.served.tail)} | ${cell(R.public.vsSet)} | ${tailCell(R.public.tail)} | ${cell(R.earlier.vsSet)} | ${tailCell(R.earlier.tail)} | ${cell(R.earlier0.vsSet)} |`); }
  L.push('', '## Secondary: the bootstrap of ap-from-public-sets (pooled median of sets, satellites resampled; decides nothing)', '', '| Class | Served / set | Public / set | Earlier / set | Served / earlier |', '| --- | --- | --- | --- | --- |');
  for (const c of CONFIG.classes) { const b = t.classes[c], R = b.records; L.push(`| ${c} | ${bcell(R.served.vsSet)} | ${bcell(R.public.vsSet)} | ${bcell(R.earlier.vsSet)} | ${bcell(b.servedVsEarlier)} |`); }
  L.push('', '## By orbit class, against the earlier construction, and the catalog', '', `| Class | Served / earlier | Public / earlier | Catalog serves | Public sets only, catalog would serve |${t.part === '2' ? ' Part 2 |' : ''}`, `| --- | --- | --- | --- | --- |${t.part === '2' ? ' --- |' : ''}`);
  for (const c of CONFIG.classes) { const b = t.classes[c]; L.push(`| ${c} | ${cell(b.servedVsEarlier)} | ${cell(b.publicVsEarlier)} | ${b.catalog} | ${b.catalogPublicOnly} |${b.part2 ? ` ${b.part2.result} (part 1: ${b.part2.part1Decision}) |` : ''}`); }
  L.push('', '## Served as', '', '| Class | Served | Public | Earlier (guarded) |', '| --- | --- | --- | --- |');
  const as = (m) => Object.entries(m).map(([k, n]) => `${k} ${n}`).join(', ');
  for (const c of CONFIG.classes) { const b = t.classes[c]; L.push(`| ${c} | ${as(b.servedAs)} | ${as(b.publicAs)} | ${as(b.earlierAs)} |`); }
  L.push('', '## By day from the set\'s epoch: served / set and served / earlier (point estimates)', '', `| Class | ${Array.from({ length: CONFIG.scoring.days }, (_, d) => `Day ${d + 1}`).join(' | ')} |`, `| --- | ${Array.from({ length: CONFIG.scoring.days }, () => '---').join(' | ')} |`);
  for (const c of CONFIG.classes) L.push(`| ${c} | ${t.classes[c].days.map((d) => `${d.servedVsSet ?? '-'} / ${d.servedVsEarlier ?? '-'}`).join(' | ')} |`);
  L.push('', '## By truth source', '', '| Truth | Served / set | Public / set | Served / earlier |', '| --- | --- | --- | --- |');
  for (const [f, b] of Object.entries(t.families)) L.push(`| ${f} | ${cell(b.records.served.vsSet)} | ${cell(b.records.public.vsSet)} | ${cell(b.servedVsEarlier)} |`);
  L.push('', 'Verdict: BEATS when the whole interval is below 1, LOSES when above, TIE when it spans 1, FEW under the minimum. The bootstrap of ap-from-public-sets is in table.json beside each statistic (`bootstrap`); it decides nothing.', '');
  return `${L.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const partId = argv.includes('--part') ? argv[argv.indexOf('--part') + 1] : null;
  const part = CONFIG.parts[partId];
  if (!part) throw new Error('usage: table.mjs --part 1|2|H|dev-A|dev-B|dev-H [--check]');
  const registered = ['1', '2', 'H'].includes(partId);
  const store = registered ? path.join(CONFIG.store, `part${partId}`) : path.join(REPO, 'runs/ap-catalog-construction', partId);
  const outDir = partId === '1' || partId === '2' ? path.join(REPO, 'results/ap-catalog-construction', `part${partId}`) : store;
  const files = fs.existsSync(store) ? fs.readdirSync(store).filter((f) => /^rows-s\d+of\d+\.jsonl$/.test(f)).sort() : [];
  if (!files.length) { console.log(`SKIPPED, not a pass: no rows in ${store}`); process.exit(1); }
  if (files.length !== Number(/of(\d+)/.exec(files[0])[1])) throw new Error(`${files.length} shard files in ${store}`);
  const rows = files.flatMap((f) => fs.readFileSync(path.join(store, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const manifests = files.map((f) => JSON.parse(fs.readFileSync(path.join(store, f.replace('rows-', 'manifest-').replace('.jsonl', '.json')), 'utf8')));
  const same = (get) => { const v = new Set(manifests.map((m) => JSON.stringify(get(m)))); if (v.size !== 1) throw new Error('shards disagree on their code or build'); return JSON.parse([...v][0]); };
  const good = rows.filter((r) => !r.error);
  const table = { experiment: CONFIG.experiment, part: partId, build: CONFIG.build, executedFiles: same((m) => m.executedFiles), repositoryCommit: same((m) => m.repositoryCommit), wasmSha256: same((m) => m.wasmSha256),
    counts: { sets: rows.length, satellites: new Set(rows.map((r) => r.norad)).size, errors: rows.length - good.length, withoutScoredFirstDay: manifests.reduce((s, m) => s + m.counts.noTruth, 0), truthStatesScreenedOut: manifests.reduce((s, m) => s + m.truthStatesScreenedOut, 0) } };
  if (part.capture) {
    Object.assign(table, { capture: part.capture, captureUtc: rows[0]?.captureUtc ?? null });
    table.classes = Object.fromEntries(CONFIG.classes.map((c) => [c, blockH(good.filter((r) => r.cls === c))]));
  } else {
    const p1 = partId === '2' ? JSON.parse(fs.readFileSync(path.join(REPO, 'results/ap-catalog-construction/part1/table.json'), 'utf8')) : null;
    table.span = { from: part.from, to: part.to };
    table.classes = Object.fromEntries(CONFIG.classes.map((c) => [c, block(good.filter((r) => r.cls === c), p1 ? p1.classes[c].catalog : undefined)]));
    table.families = Object.fromEntries([...new Set(good.map((r) => r.family))].sort().map((f) => [f, block(good.filter((r) => r.family === f))]));
  }
  const text = render(partId, table), json = `${JSON.stringify(table, null, 1)}\n`;
  if (argv.includes('--check')) {
    const ok = fs.existsSync(path.join(outDir, 'table.json')) && fs.readFileSync(path.join(outDir, 'table.json'), 'utf8') === json && fs.readFileSync(path.join(outDir, 'README.md'), 'utf8') === text;
    console.log(ok ? `CHECK PASSED: ${partId} table rebuilt from ${rows.length} rows equals the written table` : 'CHECK FAILED: the written table differs from the table rebuilt from the rows');
    process.exit(ok ? 0 : 1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), json);
  fs.writeFileSync(path.join(outDir, 'README.md'), text);
  console.log(text);
}
