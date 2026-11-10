// stack #316: the closing tests of review round 0 that the re-flight's rows can decide, each printed with its numbers and its verdict
// (parts/C1-reference.md REF-1 to REF-8, C1-term-budget.md BUD-1 to BUD-7, C1-statistics.md C1-1 to C1-8). Aggregates only.
//   node experiments/headline-loop/closing.mjs --rows <store>/<ap sha12> [--referee <round-0 folder>] [--canonical <experiments checkout>] [--json out.json]
//   node experiments/headline-loop/closing.mjs --check     made-up rows: the ratio on common windows and the band test
import fs from 'node:fs';
import path from 'node:path';
import { median, scoreCells } from './lib/stats.mjs';
import { packageState } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const km = (v) => (typeof v === 'number' ? v : v?.e);
const DAY_OF = { 24: '1', 48: '2', 72: '3', 168: '7' };
/** Median of mine over median of theirs, on the windows both hold at that day: { ratio, n }. */
export function commonRatio(pairs, day) {
  const both = pairs.filter(([a, b]) => Number.isFinite(km(a?.[day])) && Number.isFinite(km(b?.[day])));
  return both.length ? { ratio: median(both.map(([a]) => km(a[day]))) / median(both.map(([, b]) => km(b[day]))), n: both.length } : { ratio: null, n: 0 };
}
const inBand = (x, lo = 0.8, hi = 1.25) => x !== null && x >= lo && x <= hi;

if (args.check) {
  const faults = [];
  const pairs = [[{ 1: { e: 2 } }, { 1: 1 }], [{ 1: { e: 4 } }, { 1: 2 }], [{ 1: { e: 9 } }, null]];
  const c = commonRatio(pairs, '1');
  if (c.n !== 2 || Math.abs(c.ratio - 2) > 1e-12) faults.push(`common ratio ${JSON.stringify(c)}`);
  if (!inBand(1) || inBand(1.3) || inBand(null)) faults.push('band');
  console.log(faults.length ? `CLOSING CHECK: FAIL\n${faults.join('\n')}` : 'CLOSING CHECK: PASS (ratio of medians on common windows only; the 0.8 to 1.25 band)');
  process.exit(faults.length ? 1 : 0);
}

const dir = args.rows;
if (!dir) throw new Error('--rows <store>/<ap sha12>');
const rows = fs.readdirSync(dir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f))).filter((r) => !r.error && r.arms?.AP?.days);
const REF = new Map();
if (args.referee) for (const f of fs.readdirSync(args.referee).filter((n) => /^ref-ffm-.*\.jsonl$/.test(n))) for (const r of jsonl(path.join(args.referee, f))) if (r.ok) REF.set(`${r.key}|${r.arm}|${r.arc}`, r.days);
const ARCHIVE = '/opt/data/sdn-archive/operator-theory/ap';
const stored = (d) => new Map(fs.readdirSync(path.join(ARCHIVE, d)).filter((f) => /^rows(-\d+)?\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(ARCHIVE, d, f))).map((r) => [r.key, r]));
const ffm220 = new Map([...stored('ffm220/compare-truth'), ...stored('ffm220/compare-truth2'), ...stored('ffm220/regimes')]);
const of = (g, fit) => rows.filter((r) => r.group === g && r.arcH === fit);
const med = (list, arm, day) => { const v = list.map((r) => r.arms[arm]?.days?.[day]?.e).filter(Number.isFinite); return v.length ? median(v) : null; };
const m = (x) => (x === null ? '-' : `${(x * 1000).toPrecision(3)} m`);
const out = {};
const say = (id, verdict, lines) => { out[id] = { verdict, lines }; console.log(`\n${id}: ${verdict}`); for (const l of lines) console.log(`  ${l}`); };

// REF-1 to REF-3: the configured arm against the referee's rows (common windows), per cell
const refBand = (groups, fits, armName) => {
  const lines = []; let ok = true, cells = 0;
  for (const g of groups) for (const fit of fits) for (const lead of [24, 48, 72, 168]) {
    const list = of(g, fit).filter((r) => r.arms.FFMc?.arm === armName);
    const c = commonRatio(list.map((r) => [r.arms.FFMc.days, REF.get(`${r.key}|${armName}|${fit}`)]), DAY_OF[lead]);
    if (!c.n) continue;
    cells += 1; ok &&= inBand(c.ratio);
    lines.push(`${g} ${fit}/${lead}: re-flown ${armName} over the referee's ${c.ratio.toFixed(3)} on ${c.n} common windows${inBand(c.ratio) ? '' : '  OUT OF 0.8 to 1.25'}`);
  }
  return { ok: ok && cells > 0, cells, lines };
};
{
  const b = refBand(['LS'], [24, 72], 'L40S');
  const lares = rows.filter((r) => r.group === 'LS' && /^LARES$/i.test(r.name)).map((r) => r.arms.FFMc?.parameters?.find((p) => p.kind === 'SRP_AREA_OVER_MASS')?.value).filter(Number.isFinite);
  const cr = lares.length ? median(lares) : null;
  say('REF-1', b.ok && cr !== null && cr >= 0.0002 && cr <= 0.0004 ? 'CLOSED' : 'NOT CLOSED', [...b.lines, `LARES fitted Cr A/m, median of ${lares.length} products: ${cr === null ? '-' : cr.toExponential(3)} m2/kg (closing band 2e-4 to 4e-4)`, `${b.cells} cells compared`]);
}
{
  const b = refBand(['GN', 'IG', 'GE'], [24, 72], 'E5');
  const meo = med(of('GN', 72), 'FFMc', '1');
  say('REF-2', b.ok && meo !== null && meo < 0.0005 ? 'CLOSED' : 'NOT CLOSED', [...b.lines, `Medium Earth orbit 72/24, E5 median: ${m(meo)} (closing: under 0.5 m)`, `${b.cells} cells compared`]);
}
{
  const b = refBand(['GD'], [72], 'Ffull');
  say('REF-3', b.ok ? 'CLOSED (rows); the word "full-force" on the site is the site\'s' : 'NOT CLOSED', [...b.lines, `${b.cells} cells compared`]);
}
// REF-4: the count against the configured arm (the referee's recount: 30 of 72)
const cellsC = scoreCells(rows, { ref: 'FFMc', draws: 200 });
const pub = JSON.parse(fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../results/ap-truth/compare/cells.json'), 'utf8')).rows.filter((r) => r.reference === 'truth' && r.level === 'regime');
const in72 = (c) => pub.some((p) => p.regime === c.regime && p.fit === c.fit && p.lead === c.lead);
{
  const c72 = cellsC.filter(in72), under = c72.filter((c) => c.ratioOfMedians < 2).length;
  say('REF-4', Math.abs(under - 30) <= 2 && c72.length === 72 ? 'CLOSED' : 'NOT CLOSED', [`AP under 2 times the configured FFM (ratio of medians): ${under} of ${c72.length} cells; the referee's recount 30 of 72 (its 20 unflown cells at their published ratio; windows here exclude the reserved periods)`, `AP below the configured FFM: ${c72.filter((c) => c.ratioOfMedians < 1).length}; median ratio ${median(c72.map((c) => c.ratioOfMedians))?.toFixed(2)}`]);
}
// REF-5: rank correlation, paired ratio with a blocked interval, and the hindcast, in the drag cells
const cellsQ = scoreCells(rows, { ref: 'FFMq', draws: 400 });
{
  const drag = cellsQ.filter((c) => ['T', 'P', 'S1'].includes(c.group) && in72(c));
  const lines = drag.map((c) => `${c.regime} ${c.fit}/${c.lead}: rank correlation ${c.rankCorrelation?.toFixed(2)}, paired ratio ${c.pairedMedianRatio?.toFixed(2)} [${c.pairedRatioBlock?.map((x) => x.toFixed(2)).join(', ') ?? 'none'}], hindcast ${c.hindcast ? `${c.hindcast.n} windows, paired ratio ${c.hindcast.pairedMedianRatio.toFixed(2)}, rank correlation ${c.hindcast.rankCorrelation?.toFixed(2)}` : 'none'}`);
  const ok = drag.length > 0 && drag.every((c) => c.pairedRatioBlock && (c.rankCorrelation < 0.5 || c.hindcast));
  say('REF-5', ok ? 'CLOSED (rows and cells.json carry them)' : 'NOT CLOSED', lines);
}
say('REF-6', 'CLOSED (cells.json fields and the scoreboard say "RMS over the 24 h ending at the lead"; the site and paper are theirs)', []);
say('REF-7', 'CLOSED (scoreboard prints each regime\'s truth sigma and marks a reference under 3 sigma)', []);
{
  const here = packageState();
  const canonical = args.canonical ? packageState(args.canonical) : null;
  say('REF-8', here.refusal || canonical?.refusal ? `NOT CLOSED${here.refusal ? '' : ' for the canonical checkout; CLOSED for this one'}` : 'CLOSED', [`this checkout: ${here.refusal ?? 'packages as the lockfile'}; the harness refuses any other`, `canonical checkout (--canonical, read only): ${canonical ? canonical.refusal ?? 'packages as the lockfile' : 'not named'}`]);
}
// BUD-1, BUD-2
{
  const l24 = med(of('LS', 24).filter((r) => /^LARES$/i.test(r.name)), 'FFMc', '1'), l72 = med(of('LS', 72).filter((r) => /^LARES$/i.test(r.name)), 'FFMc', '1');
  say('BUD-1', l24 !== null && l72 !== null && l24 < 0.002 && l72 < 0.002 ? 'CLOSED' : 'NOT CLOSED', [`LARES day-1 median, L40S: 24 h fit ${m(l24)}, 72 h fit ${m(l72)} (closing: both under 2 m; referee 0.71, 0.65 m)`]);
}
{
  const sat = (re) => med(of('GD', 72).filter((r) => re.test(r.name)), 'FFMc', '1');
  const l1 = sat(/LAGEOS.?1|lageos1/i), l2 = sat(/LAGEOS.?2|lageos2/i), lr2 = sat(/LARES.?2|lares2/i);
  const gn = med(of('GN', 72), 'FFMc', '1'), ig = med(of('IG', 72), 'FFMc', '1'), ge = med(of('GE', 72), 'FFMc', '1');
  const okGd = [l1, l2, lr2].every((x) => x !== null && x < 0.0006), okE = [[gn, 0.27], [ig, 0.39], [ge, 2.0]].every(([x, t]) => x !== null && x * 1000 <= t * 1.25);
  say('BUD-2', okGd && okE ? 'CLOSED' : 'NOT CLOSED', [`day-1 medians, Ffull: LAGEOS 1 ${m(l1)}, LAGEOS 2 ${m(l2)}, LARES-2 ${m(lr2)} (closing: each under 0.6 m)`, `day-1 medians, E5: Medium Earth orbit 72 h ${m(gn)} (0.27), inclined geosynchronous ${m(ig)} (0.39), geostationary ${m(ge)} (2.0) (closing: at the referee's thresholds within 25 %)`]);
}
// BUD-3: AP's floor on the conservative-force model orbit, per group
{
  const lines = [];
  for (const g of [...new Set(rows.map((r) => r.group))]) for (const fit of [...new Set(rows.filter((r) => r.group === g).map((r) => r.arcH))].sort((a, b) => a - b)) {
    const xs = of(g, fit).filter((r) => r.arms.APfloor?.ok);
    if (!xs.length) continue;
    lines.push(`${g} ${fit} h (${xs.length} windows): AP fit RMS on the model orbit ${(median(xs.map((r) => r.arms.APfloor.rms)) * 1000).toPrecision(3)} m, day 1 ${(median(xs.map((r) => r.arms.APfloor.vsModel['1']).filter(Number.isFinite)) * 1000).toPrecision(3)} m, day 7 ${(median(xs.map((r) => r.arms.APfloor.vsModel['7']).filter(Number.isFinite)) * 1000).toPrecision(3)} m`);
  }
  say('BUD-3', lines.length ? 'CLOSED (table published in the scoreboard; the headline\'s wording is the site\'s)' : 'NOT CLOSED', lines);
}
// BUD-4: Near 700 km 24 h, the 2 by 2
{
  const s = of('S1', 24).filter((r) => r.arms.FFMtightB?.days && r.arms.APwide?.days);
  const t = (arm, d) => m(med(s, arm, d));
  const decided = med(s, 'FFMtightB', '7') !== null && med(s, 'FFMtightB', '7') <= med(s, 'AP', '7');
  say('BUD-4', s.length ? `CLOSED (published${decided ? '; an estimator effect: FFM with the tight prior is at or below AP at day 7' : '; FFM with the tight prior stays above AP at day 7'})` : 'NOT CLOSED', [`${s.length} windows; day 1 / day 7 medians: FFM configured ${t('FFMc', '1')} / ${t('FFMc', '7')}; FFM tight B prior ${t('FFMtightB', '1')} / ${t('FFMtightB', '7')}; AP shipped ${t('AP', '1')} / ${t('AP', '7')}; AP wide prior ${t('APwide', '1')} / ${t('APwide', '7')}`]);
}
// BUD-5: the paired excess, per cell at day 1
{
  const d1 = cellsQ.filter((c) => in72(c) && c.lead === 24);
  say('BUD-5', 'CLOSED (cells.json carries the paired excess with its blocked interval per cell)', d1.map((c) => `${c.regime} ${c.fit}/24: AP minus FFMq ${(c.pairedMedianExcessKm * 1000).toPrecision(3)} m [${c.pairedExcessBlockKm?.map((x) => (x * 1000).toPrecision(3)).join(', ') ?? 'none'}]`));
}
// BUD-6: the 70x70 arm with the coefficient fitted on Near 700 km and altimetry, against the published FFM
{
  const lines = []; let within = true;
  for (const g of ['S1', 'DO']) for (const fit of [24, 72]) {
    const list = of(g, fit);
    const c = commonRatio(list.map((r) => [r.arms.FFMq?.days, ffm220.get(r.key)?.arms?.[`F${fit}`]?.days]), '1');
    if (!c.n) continue;
    within &&= Math.abs(c.ratio - 1) < 0.2;
    lines.push(`${g} ${fit} h: L70S day 1 over the published FFM ${c.ratio.toFixed(3)} on ${c.n} windows`);
  }
  say('BUD-6', lines.length ? `CLOSED (the cells are republished from the L70S column, FFMfull${within ? '; and it differs from the published by under 20 %' : ''})` : 'NOT CLOSED', lines);
}
// BUD-7: the eccentric rows' force model by window
{
  const hx = rows.filter((r) => ['HX', 'HE'].includes(r.group));
  const choice = (arm) => Object.entries(hx.reduce((a, r) => ({ ...a, [r.arms[arm]?.arm ?? 'none']: (a[r.arms[arm]?.arm ?? 'none'] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ');
  say('BUD-7', 'CLOSED for the force model (FFMq is one model, Ffull, on every eccentric window); lead label as REF-6; Chandra\'s join check NOT CLOSED (its four 168 h cells stay printed, marked as a model-trajectory truth)', [`window-arcs by setting: reduced (published choice by radius) ${choice('FFMr')}; qualified ${choice('FFMq')}`]);
}
// C1 statistics
{
  const q72 = cellsQ.filter(in72);
  say('C1-1', 'NOT CLOSED: (a) D is printed per cell; (b) the qualification against the centers\' own next files needs the next-file products, which this harness does not fly (the laser centers\' are March to May 2026)', [`cells with D: ${q72.filter((c) => c.D).length} of ${q72.length}`]);
  say('C1-2', 'CLOSED (rows: three numbers from one rule; the site\'s counts are the site\'s)', [`shown under 2 ${q72.filter((c) => c.verdict === 'shown under 2').length}, shown at or over 2 ${q72.filter((c) => c.verdict === 'shown at or over 2').length}, undecided ${q72.filter((c) => c.verdict === 'undecided').length}, no interval ${q72.filter((c) => c.verdict === 'no interval').length}`]);
  const agree = q72.filter((c) => c.bootstrapRatio && c.ratioOfMedians >= c.bootstrapRatio[0] && c.ratioOfMedians <= c.bootstrapRatio[1]).length;
  say('C1-3', `CLOSED (the scoreboard prints the satellite-balanced estimate and names the satellites); a regime claim with at least 8 satellites is not available in ${q72.filter((c) => c.satellites < 8).length} of the cells`, [`window-weighted ratio inside the satellite-balanced interval in ${agree} of ${q72.filter((c) => c.bootstrapRatio).length} cells with an interval; cells with at least 8 satellites and 3 blocks: ${q72.filter((c) => c.couldMeetDesign).length}`]);
  say('C1-4', 'NOT CLOSED: no registered gate; this re-flight is on development windows and says so', []);
  say('C1-5', 'CLOSED (rows: each cell carries entersCount from the 90 % rule; TESS is flown on the kernels\' nodes only)', [`cells entering the count: ${q72.filter((c) => c.entersCount).length} of ${q72.length}`]);
  say('C1-6', 'CLOSED (as REF-6)', []);
  say('C1-7', 'CLOSED (every ratio is formed on the windows both arms scored; the count is printed)', []);
  say('C1-8', 'NOT CLOSED here: the suite\'s next-file regimes are not flown by this harness; the sentence is the site\'s', []);
}
say('DSST-1', 'NOT CLOSED: the driver fix and rerun were not made (out of this job\'s scope); results/dsst-arm/README.md carries the finding and the sentence the paper may use', []);
{
  const he = rows.filter((r) => ['HE', 'HX'].includes(r.group));
  const d = he.map((r) => { const a = r.arms.FFMr?.days?.['1']?.e, b = ffm220.get(r.key)?.arms?.[`F${r.arcH}`]?.days?.['1']?.e; return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a / b - 1) : null; }).filter((x) => x !== null);
  say('BUILD-1', `every cell re-flown on ${rows[0]?.ap?.version}; FFM run to run on the eccentric windows: ${d.length ? `${d.filter((x) => x <= 0.01).length} of ${d.length} within 1 %` : 'none compared'}`, d.length ? [`largest change ${(Math.max(...d) * 100).toFixed(2)} %`] : []);
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify(out, null, 1));
