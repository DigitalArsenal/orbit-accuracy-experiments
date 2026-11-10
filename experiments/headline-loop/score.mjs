// stack #316: the scoreboard of a re-flight, per cell (group, fit, lead), by the round-0 referee's definition (adversarial/round-0/parts/goal.md),
// with the old statistic beside it. Aggregates only: no per-object row, no element set.
//   node experiments/headline-loop/score.mjs --rows <store>/<ap sha12> [--reference FFMc|FFMr] [--statistic sat-median|paired-median|ratio-of-medians]
//        [--interval two-way|satellite|window|order] [--draws 2000] [--out results/headline-loop/<version>-<sha12>]
//   node experiments/headline-loop/score.mjs --check     made-up rows with known answers
// Per cell, on the windows both AP and the reference scored (C1-7):
//   D        the RMS over the lead day of |r_AP - r_ref| (the two forecasts' vector difference), median and 95th percentile, m (C1-1)
//   d        ln(E_AP / E_ref) per window; estimate the median over satellites of per-satellite medians (C1-3); intervals: a two-way bootstrap over
//            satellites and time blocks no shorter than fit + lead, and the exact order-statistic interval over satellites; passes when both upper
//            bounds are under ln 2; a cell with no interval fails (goal.md). The same for the 95th percentiles (per satellite ln(p95_AP / p95_ref)).
//   gate     goal.md's reference-quality gate: windows whose reference fit RMS exceeds 3 times the truth's stated sigma print "reference not usable"
//            and count against the cell; the step check (half tolerance moves day 7 under 1 %) from the FFMcHalfTol sample; the settings test
//            (registered full settings with a fitted radiation model) by name
//   also     the ratio of medians (the published statistic), the paired median of AP / ref and of AP - ref (BUD-5), the rank correlation of the
//            two arms' errors (REF-5), the satellites and windows, the truth's stated sigma and "under 3 sigma" (REF-7), the observed-weather
//            hindcast where flown (REF-5), the reduced arm beside the configured one (REF-1 to REF-3)
// Lead: the RMS over the 24 h ending at the lead (REF-6, C1-6), not the error at the lead epoch.
import fs from 'node:fs';
import path from 'node:path';
import { LN2, LEAD_DEFINITION, median, quantile, orderInterval, spearman, scoreCells, bootstrap } from './lib/stats.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');


const round = (x, p = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toPrecision(p)));
function readRows(dir) { return fs.readdirSync(dir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))); }

if (args.check) {
  const faults = [];
  // made-up rows: 8 satellites x 4 blocks, AP = 1.5 x reference everywhere, D = 2 m
  const rows = [];
  for (let s = 0; s < 8; s += 1) for (let b = 0; b < 4; b += 1) rows.push({ key: `X|S${s}|${b}`, group: 'GD', name: `S${s}`, cutoff: new Date(Date.parse('2025-10-01T00:00:00Z') + b * 7 * 86400000).toISOString(), arcH: 72, arms: { AP: { days: { 1: { e: 0.003 * (1 + s / 10) } }, dVsFFMq: { 1: 0.002 } }, FFMq: { arm: 'Ffull', weightedRms: 0.001, days: { 1: { e: 0.002 * (1 + s / 10) }, 7: { e: 0.01 } } }, FFMqHalfTol: { arm: 'Ffull', days: { 7: { e: 0.01001 } } }, FFMc: { arm: 'Ffull', days: { 1: { e: 0.002 * (1 + s / 10) } } }, FFMr: { arm: 'F20', days: { 1: { e: 0.004 * (1 + s / 10) } } } } });
  const [c] = scoreCells(rows, { leads: [24] });
  if (Math.abs(c.estimateRatio - 1.5) > 1e-9 || Math.abs(c.ratioOfMedians - 1.5) > 1e-9) faults.push(`estimate ${c.estimateRatio}, ratio of medians ${c.ratioOfMedians}`);
  if (!c.bootstrapRatio || Math.abs(c.bootstrapRatio[0] - 1.5) > 1e-9 || !c.orderRatio || !c.passUnder2) faults.push(`constant ratio: interval ${c.bootstrapRatio}, order ${c.orderRatio}, pass ${c.passUnder2}`);
  if (Math.abs(c.D.medianM - 2) > 1e-9 || c.satellites !== 8 || c.timeBlocks !== 4 || !c.couldMeetDesign) faults.push('D, satellites or time blocks');
  if (Math.abs(c.others.FFMr.overReference - 2) > 1e-9 || Math.abs(c.others.FFMc.overReference - 1) > 1e-9 || c.rankCorrelation < 0.99) faults.push('other arms or rank correlation');
  if (!c.goalPass || !c.gate.halfToleranceDay7?.under1pct) faults.push('a qualified, gated constant 1.5 cell does not pass');
  // five satellites: no order interval, the cell fails
  const [c5] = scoreCells(rows.filter((r) => Number(r.name.slice(1)) < 5), { leads: [24] });
  if (c5.orderRatio !== null || c5.goalPass) faults.push('five satellites have an order interval or pass');
  // ratio 3: fails
  const [c3] = scoreCells(rows.map((r) => ({ ...r, arms: { ...r.arms, AP: { ...r.arms.AP, days: { 1: { e: r.arms.FFMq.days[1].e * 3 } } } } })), { leads: [24] });
  if (c3.passUnder2) faults.push('a ratio of 3 passes');
  // the gate: a reduced reference fails qualification 1; a fit RMS over 3 sigma (0.2 x 10 m = 2 m against 0.45 m) is "reference not usable"
  const [cr] = scoreCells(rows.map((r) => ({ ...r, arms: { ...r.arms, FFMq: { ...r.arms.FFMq, arm: 'F20' } } })), { leads: [24] });
  const [cu] = scoreCells(rows.map((r, i) => ({ ...r, arms: { ...r.arms, FFMq: { ...r.arms.FFMq, weightedRms: i === 0 ? 0.2 : 0.001 } } })), { leads: [24] });
  if (cr.goalPass || cr.gate.settingsQualified || cu.goalPass || cu.gate.referenceNotUsable !== 1) faults.push('the reference-quality gate');
  // order interval: n = 8 gives k = 1 (P(B <= 0) = 1/256), so [min, max]
  const oi = orderInterval([1, 2, 3, 4, 5, 6, 7, 8]);
  if (!oi || oi[0] !== 1 || oi[1] !== 8) faults.push(`order interval of 1..8: ${oi}`);
  if (Math.abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) > 1e-12 || Math.abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) > 1e-12) faults.push('spearman');
  console.log(faults.length ? `SCORE CHECK: FAIL\n${faults.join('\n')}` : 'SCORE CHECK: PASS (estimate, two-way bootstrap and order interval on a constant ratio; D; design counts; configured and reduced arms; rank correlation; half-tolerance step check; 5 satellites fail for want of an interval; a ratio of 3 fails; a reduced reference and an unusable window fail the gate; order interval; spearman)');
  process.exit(faults.length ? 1 : 0);
}


const dir = args.rows;
if (!dir) throw new Error('--rows <store>/<ap sha12>');
if (args.compare) { compare(dir, args.compare); process.exit(0); }
const rowsAll = readRows(dir);
const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8'));
const opts = { ref: args.reference ?? 'FFMq', statistic: args.statistic ?? 'sat-median', interval: args.interval ?? 'two-way', draws: Number(args.draws ?? 2000), leads: [24, 48, 72, 168] };
const published = JSON.parse(fs.readFileSync(path.join(REPO, 'results/ap-truth/compare/cells.json'), 'utf8')).rows.filter((r) => r.reference === 'truth' && r.level === 'regime');
const pubOf = (c) => published.find((p) => p.regime === c.regime && p.fit === c.fit && p.lead === c.lead);
const ffmCol = (p) => Object.keys(p?.arms ?? {}).find((k) => k.startsWith('FFM'));
const in72 = (c) => !!pubOf(c);
const count = (list, f) => list.filter(f).length;
const WINDOWS = {
  all: 'All windows: the published cells\' own window sets (the 2026-03..05 windows flown in the second pass, flagged period), nothing after 2026-11-10.',
  first: 'First pass: the published windows less those whose fit arc or 7-day forecast touches 2026-03-01 to 05-31 (Strong drag 2026, Near 700 km and Medium Earth orbit keep 2026-01-01 to 02-21 cutoffs).',
};
/** One board: the cells, the summary, the table rows, on the rows given. */
function board(rows, which) {
  const cells = scoreCells(rows, opts);
  const byArm = (k) => ({ n: cells.filter((c) => pubOf(c) && c.others[k]).length, ratioOfMediansUnder2: cells.filter((c) => pubOf(c) && c.others[k]?.ratioOfMedians < 2).length, medianRatioOfMedians: median(cells.filter((c) => pubOf(c) && c.others[k]).map((c) => c.others[k].ratioOfMedians)) });
  const c72 = cells.filter(in72);
  const summary = {
    windows: which, windowsNote: `${WINDOWS[which]} Development windows, read before; not a registered result.`, rows: rows.length,
    cells72: { n: c72.length, ratioOfMediansUnder2: count(c72, (x) => x.ratioOfMedians < 2), medianRatioOfMedians: median(c72.map((x) => x.ratioOfMedians)), goalPass: count(c72, (x) => x.goalPass), passUnder2BothIntervals: count(c72, (x) => x.passUnder2), noInterval: count(c72, (x) => x.noInterval), couldMeetDesign: count(c72, (x) => x.couldMeetDesign), shownUnder2: count(c72, (x) => x.verdict === 'shown under 2'), shownAtOrOver2: count(c72, (x) => x.verdict === 'shown at or over 2'), undecided: count(c72, (x) => x.verdict === 'undecided'), entersCount: count(c72, (x) => x.entersCount), ratioOfMediansUnder2Entering: count(c72, (x) => x.entersCount && x.ratioOfMedians < 2) },
    cells72Configured: byArm('FFMc'), cells72Reduced: byArm('FFMr'),
    neverDesign: c72.filter((x) => !x.couldMeetDesign).map((x) => `${x.regime} ${x.fit}/${x.lead}: ${x.satellites} satellites, ${x.timeBlocks} blocks`),
  };
  const table = cells.map((c) => {
    const p = pubOf(c);
    return { ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])), published: p ? { AP: p.arms.AP?.[0] ?? null, FFM: p.arms[ffmCol(p)]?.[0] ?? null, ratioOfMedians: p.arms.AP && p.arms[ffmCol(p)] ? round(p.arms.AP[0] / p.arms[ffmCol(p)][0]) : null, n: p.n } : null };
  });
  return { summary, table };
}
const all = board(rowsAll, 'all'), first = board(rowsAll.filter((r) => !r.period), 'first');
const head = {
  build: { module: build.module, version: build.version, sha256: build.sha256 }, flownOn: new Date().toISOString().slice(0, 10), options: opts, leadDefinition: LEAD_DEFINITION,
  published72: { n: published.length, ratioOfMediansUnder2: count(published, (p) => p.arms.AP && p.arms[ffmCol(p)] && p.arms.AP[0] / p.arms[ffmCol(p)][0] < 2), medianRatioOfMedians: median(published.filter((p) => p.arms.AP && p.arms[ffmCol(p)]).map((p) => p.arms.AP[0] / p.arms[ffmCol(p)][0])) },
};
const outDir = args.out ?? path.join(REPO, 'results/headline-loop', `${build.version}-${build.sha256.slice(0, 12)}`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'scoreboard.json'), `${JSON.stringify({ ...head, allWindows: all.summary, firstPass: first.summary, cells: all.table, cellsFirstPass: first.table }, null, 1)}\n`);
const f = (x, p = 3) => (x === null || x === undefined ? '-' : Number(x).toPrecision(p));
const sums = (s) => [
  `- ${s.windowsNote} ${s.rows} window-arcs.`,
  `- The 72 published cells by the published statistic (ratio of medians): AP under 2 times the qualified FFM in ${s.cells72.ratioOfMediansUnder2} of ${s.cells72.n} (median ratio ${f(s.cells72.medianRatioOfMedians)}); the configured FFM ${s.cells72Configured.ratioOfMediansUnder2} of ${s.cells72Configured.n} (median ${f(s.cells72Configured.medianRatioOfMedians)}); the reduced FFM ${s.cells72Reduced.ratioOfMediansUnder2} of ${s.cells72Reduced.n} (median ${f(s.cells72Reduced.medianRatioOfMedians)}); published ${head.published72.ratioOfMediansUnder2} of ${head.published72.n} (median ${f(head.published72.medianRatioOfMedians)}).`,
  `- By goal.md's definition: ${s.cells72.goalPass} pass; ${s.cells72.passUnder2BothIntervals} have both median upper bounds under 2; ${s.cells72.noInterval} have no interval (fail); ${s.cells72.couldMeetDesign} have at least 8 satellites and 3 time blocks.`,
  `- One rule, three numbers (C1-2): shown under 2 in ${s.cells72.shownUnder2}, shown at or over 2 in ${s.cells72.shownAtOrOver2}, undecided in ${s.cells72.undecided}, no interval in ${s.cells72.noInterval}. Cells whose reference fit is within 3 times the truth's sigma in at least 90 % of windows (C1-5): ${s.cells72.entersCount}; of them under 2 by the ratio of medians: ${s.cells72.ratioOfMediansUnder2Entering}.`,
];
const tableLines = (table) => [
  '| Regime | fit h | lead h | windows | sats | blocks | AP km | FFMq km | FFMc km | FFMr km | ratio of medians: q, c, r (published) | sat-balanced d ratio [two-way] [order] | p95 ratio | rank corr. | paired ratio [blocks] | paired excess m [blocks] | AP floor m (fit RMS) | D median / p95 m | truth sigma m | gate | verdict | pass |',
  '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|--:|--:|---|---|---|---|--:|---|---|---|',
  ...table.map((c) => `| ${c.regime} | ${c.fit} | ${c.lead} | ${c.windows} | ${c.satellites} | ${c.timeBlocks} | ${f(c.medianKm.AP)} | ${f(c.medianKm.ref)} | ${f(c.others.FFMc?.medianKm)} | ${f(c.others.FFMr?.medianKm)} | ${f(c.ratioOfMedians)}, ${f(c.others.FFMc?.ratioOfMedians)}, ${f(c.others.FFMr?.ratioOfMedians)} (${f(c.published?.ratioOfMedians)}) | ${f(c.satelliteBalancedRatio)} [${c.bootstrapRatio ? c.bootstrapRatio.map((x) => f(x)).join(', ') : 'none'}] [${c.orderRatio ? c.orderRatio.map((x) => f(x)).join(', ') : 'none'}] | ${f(c.p95.satelliteBalancedRatio)} | ${f(c.rankCorrelation, 2)} | ${f(c.pairedMedianRatio)} [${c.pairedRatioBlock ? c.pairedRatioBlock.map((x) => f(x)).join(', ') : 'none'}] | ${f(c.pairedMedianExcessKm * 1000)} [${c.pairedExcessBlockKm ? c.pairedExcessBlockKm.map((x) => f(x * 1000)).join(', ') : 'none'}] | ${c.floor ? `${f(c.floor.vsModelM)} (${f(c.floor.fitRmsM)}), n ${c.floor.n}` : '-'} | ${c.D ? `${f(c.D.medianM)} / ${f(c.D.p95M)}` : '-'} | ${c.truthSigmaM ?? 'none'}${c.refUnder3Sigma ? ' (FFM under 3 sigma)' : ''} | ${c.gate.settingsQualified ? 'settings ok' : 'settings not full'}; ${c.gate.referenceNotUsable}/${c.gate.windowsJudged} unusable${c.gate.halfToleranceDay7 ? `; half tol. ${f(c.gate.halfToleranceDay7.max * 100, 2)} %` : ''}${c.truthNote ? `; ${c.truthNote}` : ''} | ${c.verdict} | ${c.goalPass ? 'yes' : 'no'} |`),
];
const lines = [
  `# Headline loop: ${build.module} ${build.version} (${build.sha256.slice(0, 12)}), re-flown ${head.flownOn}`, '',
  `Not a registered result. Lead: ${LEAD_DEFINITION}. Reference (${opts.ref}): ${opts.ref === 'FFMq' ? 'the qualified numerical arm, goal.md qualification 1 (L70S below 8,400 km, E5F navigation and geosynchronous, Ffull geodetic and eccentric)' : opts.ref}; beside it the configured arm the round-0 referee flew (FFMc: L40S, E5, Ffull) and the reduced arm the published cells flew (FFMr: L40, F20). Statistic (goal.md): d = ln(E_AP / E_FFM) per window on windows both scored, ${opts.statistic}, ${opts.interval} bootstrap (time blocks of fit + lead) and the exact order-statistic interval over satellites; "pass" needs both upper bounds under 2, the same for the 95th percentiles, a full-setting reference and no window whose reference fit RMS exceeds 3 times the truth's stated sigma. The precise-orbit windows of March to May 2026 were read by the builds that made the published cells and are read again here; the catalog studies' reservation of those months concerns public element sets, which this harness does not read. Aggregates only.`, '',
  '## All windows', '', ...sums(all.summary), '', ...tableLines(all.table), '',
  '## First pass (no window touching 2026-03..05)', '', ...sums(first.summary), '', ...tableLines(first.table),
];
fs.writeFileSync(path.join(outDir, 'README.md'), `${lines.join('\n')}\n`);
console.log([...sums(all.summary), ...sums(first.summary)].join('\n'));

/** --compare <rows B>: two AP builds side by side per cell, on all windows: each build's AP median, its ratio of medians and satellite-balanced
 *  ratio to the same reference with both intervals, its verdict; and the paired ln(E_B / E_A) on the windows both scored (median, 95 % interval
 *  over time blocks of fit + lead). Writes compare-<A sha12>-<B sha12>.json and .md beside the scoreboard (or --out). */
function compare(dirA, dirB) {
  const bA = JSON.parse(fs.readFileSync(path.join(dirA, 'build.json'), 'utf8')), bB = JSON.parse(fs.readFileSync(path.join(dirB, 'build.json'), 'utf8'));
  const rA = readRows(dirA), rB = readRows(dirB);
  const o = { ref: args.reference ?? 'FFMq', statistic: args.statistic ?? 'sat-median', interval: args.interval ?? 'two-way', draws: Number(args.draws ?? 2000), leads: [24, 48, 72, 168] };
  const cA = scoreCells(rA, o), cB = scoreCells(rB, o);
  const byKey = new Map(rB.filter((r) => !r.error).map((r) => [`${r.key}|${r.arcH}`, r]));
  const DAY = { 24: '1', 48: '2', 72: '3', 168: '7' };
  const rows = cA.map((a) => {
    const b = cB.find((x) => x.group === a.group && x.fit === a.fit && x.lead === a.lead);
    const day = DAY[a.lead], list = rA.filter((r) => !r.error && r.group === a.group && r.arcH === a.fit && r.arms.AP?.days?.[day] && byKey.get(`${r.key}|${r.arcH}`)?.arms?.AP?.days?.[day]);
    const t0 = list.length ? Math.min(...list.map((r) => Date.parse(r.cutoff))) : 0;
    const items = list.map((r) => ({ sat: r.name, block: Math.floor((Date.parse(r.cutoff) - t0) / ((a.fit + a.lead) * 3600000)), value: Math.log(byKey.get(`${r.key}|${r.arcH}`).arms.AP.days[day].e / r.arms.AP.days[day].e) })).filter((x) => Number.isFinite(x.value));
    const iv = bootstrap(items, 'paired-median', 'block', Math.min(o.draws, 1000));
    const side = (c) => (c ? { windows: c.windows, satellites: c.satellites, apKm: round(c.medianKm.AP), refKm: round(c.medianKm.ref), ratioOfMedians: round(c.ratioOfMedians), satelliteBalancedRatio: round(c.satelliteBalancedRatio), twoWay: c.bootstrapRatio?.map((x) => round(x)) ?? null, order: c.orderRatio?.map((x) => round(x)) ?? null, verdict: c.verdict, goalPass: c.goalPass } : null);
    return { regime: a.regime, group: a.group, fit: a.fit, lead: a.lead, A: side(a), B: side(b), pairedBOverA: items.length ? { windows: items.length, ratio: round(Math.exp(median(items.map((x) => x.value)))), interval: iv ? iv.map((x) => round(Math.exp(x))) : null } : null };
  });
  const name = `compare-${bA.sha256.slice(0, 12)}-${bB.sha256.slice(0, 12)}`;
  const outDir = args.out ?? path.join(REPO, 'results/headline-loop', `${bA.version}-${bA.sha256.slice(0, 12)}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify({ A: { version: bA.version, sha256: bA.sha256 }, B: { version: bB.version, sha256: bB.sha256 }, options: o, leadDefinition: LEAD_DEFINITION, cells: rows }, null, 1)}\n`);
  const f = (x, p = 3) => (x === null || x === undefined ? '-' : Number(x).toPrecision(p));
  const iv = (x) => (x ? `[${x.map((y) => f(y)).join(', ')}]` : '[none]');
  const lines = [
    `# AP ${bA.version} (${bA.sha256.slice(0, 12)}, A) and ${bB.version} (${bB.sha256.slice(0, 12)}, B), per cell`, '',
    `Reference ${o.ref}; ${LEAD_DEFINITION}; the numerical arms are the same rows for both builds. Not a registered result.`, '',
    '| Regime | fit h | lead h | windows A / B | AP km A / B | ratio of medians A / B | sat-balanced ratio A [two-way] | B [two-way] | verdict A / B | B over A, paired [blocks] |',
    '|---|--:|--:|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.regime} | ${r.fit} | ${r.lead} | ${r.A?.windows ?? '-'} / ${r.B?.windows ?? '-'} | ${f(r.A?.apKm)} / ${f(r.B?.apKm)} | ${f(r.A?.ratioOfMedians)} / ${f(r.B?.ratioOfMedians)} | ${f(r.A?.satelliteBalancedRatio)} ${iv(r.A?.twoWay)} | ${f(r.B?.satelliteBalancedRatio)} ${iv(r.B?.twoWay)} | ${r.A?.verdict ?? '-'} / ${r.B?.verdict ?? '-'} | ${r.pairedBOverA ? `${f(r.pairedBOverA.ratio)} ${iv(r.pairedBOverA.interval)}, n ${r.pairedBOverA.windows}` : '-'} |`),
  ];
  fs.writeFileSync(path.join(outDir, `${name}.md`), `${lines.join('\n')}\n`);
  console.log(`${name}: ${rows.length} cells to ${outDir}`);
}
