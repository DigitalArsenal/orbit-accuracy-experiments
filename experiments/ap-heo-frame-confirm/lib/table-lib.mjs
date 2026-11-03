// The registered statements of a confirmation task from stored rows (AP5's statistics): paired per-window quantities, a cluster bootstrap by ISO week of the cutoff,
// 10,000 draws, percentile interval [2.5 %, 97.5 %], a deterministic seed from SHA-256. Statistics only; no physics.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { rand, pct, asc, median } from '../../operator-theory/lib/compare.mjs';
import { cutoffsOf } from './cutoffs.mjs';

export const DRAWS = 10000, LEVEL = 0.975, FAIL_LOSS = 1e12;
const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** Every row of a store directory (rows-<k>.jsonl), in key order. */
export function readRows(dir) {
  const rows = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f))) : [];
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

/** Cluster bootstrap of `statistic(sample)` over windows grouped by ISO week of the cutoff: { estimate, interval, clusters }. */
export function bootstrap(items, statistic, tag) {
  const clusters = [...new Set(items.map((x) => x.cluster))].sort();
  if (!items.length) return { estimate: null, interval: null, clusters: 0 };
  const by = new Map(clusters.map((c) => [c, items.filter((x) => x.cluster === c)]));
  const random = rand(parseInt(crypto.createHash('sha256').update(`${tag}|${clusters.length}`).digest('hex').slice(0, 8), 16));
  const draws = [];
  for (let t = 0; t < DRAWS; t += 1) {
    const sample = [];
    for (let i = 0; i < clusters.length; i += 1) sample.push(...by.get(clusters[Math.floor(random() * clusters.length)]));
    draws.push(statistic(sample));
  }
  draws.sort(asc);
  return { estimate: statistic(items), interval: [pct(draws, 1 - LEVEL), pct(draws, LEVEL)], clusters: clusters.length };
}

const e = (row, arm, day) => row?.arms?.[arm]?.days?.[day]?.e;
const has = (row, arm, day) => Number.isFinite(e(row, arm, day));
const coverage = (row, arm) => row?.arms?.[arm]?.error === 'coverage';

/** The windows of a statement and, per window, the arms' errors in km at `day`. A window whose arms lack the day's bin, or fail for coverage, leaves the statement, counted.
 *  A failure of `lossArm` (AP5's first arm) is a loss, +Infinity, never a dropped window; any other failure leaves the window, counted. */
function collect(rows, groups, arms, day, lossArm = null) {
  const items = [], dropped = { noBin: 0, coverage: 0, failed: 0 }; let losses = 0;
  for (const row of rows.filter((r) => groups.includes(r.group) && !r.error)) {
    if (arms.some((a) => !row.arms?.[a])) { dropped.noBin += 1; continue; }
    if (arms.some((a) => coverage(row, a))) { dropped.coverage += 1; continue; }
    const lost = lossArm && row.arms[lossArm].ok === false;
    const rest = arms.filter((a) => a !== (lost ? lossArm : null));
    if (rest.some((a) => !has(row, a, day))) { if (rest.some((a) => row.arms[a].ok === false)) dropped.failed += 1; else dropped.noBin += 1; continue; }
    if (lost) losses += 1;
    items.push({ key: row.key, group: row.group, cluster: isoWeek(row.cutoff.slice(0, 10)), km: Object.fromEntries(arms.map((a) => [a, a === lossArm && lost ? FAIL_LOSS : e(row, a, day)])) });
  }
  return { items, dropped: { ...dropped, losses } };
}

const ln = Math.log;
const pctOf = (d) => (Number.isFinite(d) ? (100 * (Math.exp(d) - 1)) : d);
const within = (iv, m) => !!iv && iv[0] >= -m && iv[1] <= m;

/** One statement: its kind decides the per-window quantity and the criterion. The verdict follows the registered point criterion; `intervalWithin` / `intervalBeyond` are printed beside it. */
export function evaluate(st, rows, taskId) {
  const days = st.days ?? [st.day];
  const cells = days.map((day) => {
    const tag = `${taskId}|${st.id}|${st.kind}|${day}`;
    const arms = st.kind === 'gain' ? [st.reference, st.old, st.new] : [st.a ?? st.new, st.b ?? st.old];
    const { items, dropped } = collect(rows, st.groups, arms, day, st.kind === 'notWorse' ? st.a : st.kind === 'regression' ? st.new : null);
    const cell = { day, n: items.length, dropped };
    if (!items.length) return { ...cell, estimate: null, interval: null, pass: false, note: 'no windows' };
    if (st.kind === 'closeness') {                       // median paired difference a - b in meters, within +- marginM
      const stat = (s) => median(s.map((x) => 1000 * (x.km[st.a] - x.km[st.b])));
      const r = bootstrap(items, stat, tag);
      return { ...cell, ...r, unit: 'm', pass: Math.abs(r.estimate) <= st.marginM, intervalWithin: within(r.interval, st.marginM) };
    }
    if (st.kind === 'notWorse') {                        // AP5 rule 1 mirrored: a is worse than b if the interval of the median ln(a / b) lies wholly above 0
      const stat = (s) => median(s.map((x) => ln(x.km[st.a] / x.km[st.b])));
      const r = bootstrap(items, stat, tag);
      const medianDiffM = median(items.map((x) => 1000 * (x.km[st.a] - x.km[st.b]))), material = medianDiffM > (st.materialityM ?? 0);
      return { ...cell, ...r, unit: 'ln ratio', percent: [pctOf(r.estimate), pctOf(r.interval[0]), pctOf(r.interval[1])], medianDiffM, pass: !(r.interval[0] > 0 && material), worse: r.interval[0] > 0 && material, reverseRule1: r.interval[0] > 0 };
    }
    if (st.kind === 'regression') {                      // median paired ratio new / old, at most maxRatio
      const stat = (s) => median(s.map((x) => x.km[st.new] / x.km[st.old]));
      const r = bootstrap(items, stat, tag);
      const ratioOfMedians = median(items.map((x) => x.km[st.new])) / median(items.map((x) => x.km[st.old]));
      return { ...cell, ...r, unit: 'ratio', ratioOfMedians, pass: r.estimate <= st.maxRatio, intervalWithin: r.interval[1] <= st.maxRatio };
    }
    if (st.kind === 'gain') {                            // (median paired old - reference) - (median paired new - reference), in meters, at least minM; and new - reference within +- marginM
      const diff = (s, a) => median(s.map((x) => 1000 * (x.km[a] - x.km[st.reference])));
      const gain = (s) => diff(s, st.old) - diff(s, st.new), close = (s) => diff(s, st.new);
      const g = bootstrap(items, gain, `${tag}|gain`), c = bootstrap(items, close, `${tag}|close`);
      return { ...cell, gain: g, closeness: c, unit: 'm', estimate: c.estimate, interval: c.interval, clusters: c.clusters, pass: Math.abs(c.estimate) <= st.marginM && g.estimate >= st.minGainM, intervalWithin: within(c.interval, st.marginM) && g.interval[0] >= st.minGainM };
    }
    throw new Error(`unknown statement kind ${st.kind}`);
  });
  return { ...st, cells, pass: cells.every((c) => c.pass) };
}

/** Median and 95th percentile (km) of an arm's error by group and day, over the windows that have it. */
export function figures(rows, groups, arm, day) {
  const v = rows.filter((r) => groups.includes(r.group) && !r.error).map((r) => e(r, arm, day)).filter(Number.isFinite).sort(asc);
  return v.length ? { n: v.length, median: pct(v, 0.5), p95: pct(v, 0.95) } : { n: 0, median: null, p95: null };
}

/** The windows' accounting per group: rows, rows with an error, windows per cutoff. */
export function accounting(rows, cfg) {
  return Object.keys(cfg.groups).map((id) => {
    const mine = rows.filter((r) => r.group === id);
    return { group: id, expectedCutoffs: cutoffsOf(cfg.groups[id].cutoffs).length, rows: mine.length, rowErrors: mine.filter((r) => r.error).length, armFailures: Object.fromEntries(cfg.groups[id].arms.map((a) => [a, mine.filter((r) => Object.entries(r.arms ?? {}).some(([k, v]) => k.startsWith(a) && k.slice(a.length).match(/^\d+$/) && v.ok === false)).length])) };
  });
}

/** The whole aggregate of a task's store: statements, report-only contrasts, figures, accounting. */
export function aggregate(cfg, rows) {
  const metrics = { task: cfg.task, windows: rows.length, accounting: accounting(rows, cfg), statements: cfg.statements.map((st) => evaluate(st, rows, cfg.task)), contrasts: [], figures: [] };
  for (const c of cfg.reportOnly?.contrasts ?? []) {
    const days = c.days;
    metrics.contrasts.push({ ...c, cells: days.map((day) => {
      const { items, dropped } = collect(rows, c.groups, [c.a, c.b], day);
      if (!items.length) return { day, n: 0, dropped };
      const r = bootstrap(items, (s) => median(s.map((x) => 1000 * (x.km[c.a] - x.km[c.b]))), `${cfg.task}|${c.id}|${day}`);
      return { day, n: items.length, dropped, ...r };
    }) });
  }
  for (const f of cfg.reportOnly?.figures ?? []) for (const group of f.groups) metrics.figures.push({ group, arms: f.arms, days: f.days, cells: Object.fromEntries(f.arms.map((arm) => [arm, Object.fromEntries(f.days.map((day) => [day, figures(rows, [group], arm, day)]))])) });
  return metrics;
}

const fmt = (x, d = 3) => (x === null || x === undefined ? '-' : Number(x).toFixed(d));
const iv = (v, d = 3) => (v ? `[${fmt(v[0], d)}, ${fmt(v[1], d)}]` : '-');
/** README.md text from the aggregate: every statement with its interval, then the report-only tables. */
export function render(cfg, metrics) {
  const out = [`# ${cfg.title}`, '', `Registered by the commit named in \`check.mjs\`; ${metrics.windows} windows read. Intervals are the 95 % percentile interval of a 10,000-draw cluster bootstrap by ISO week of the cutoff. Verdicts follow the registered point criterion; \`interval inside\` says whether the whole interval meets it too.`, '', '## Statements', ''];
  for (const s of metrics.statements) {
    out.push(`### ${s.id}. ${s.label}: ${s.reportOnly ? `REPORT ONLY (${s.pass ? 'criterion met' : 'criterion not met'})` : s.pass ? 'PASS' : 'FAIL'}`, '', s.criterion, '');
    for (const c of s.cells) {
      if (c.estimate === null && !c.gain) { out.push(`- day ${c.day}: no windows`); continue; }
      const dropped = Object.entries(c.dropped).filter(([, n]) => n).map(([k, n]) => (k === 'losses' ? `${n} failed fits counted as losses` : `${k} ${n}`)).join(', ');
      if (s.kind === 'closeness') out.push(`- day ${c.day}: median paired ${s.a} less ${s.b} ${fmt(c.estimate, 4)} m ${iv(c.interval, 4)}; ${c.pass ? 'within' : 'outside'} +-${s.marginM} m, interval ${c.intervalWithin ? 'inside' : 'not inside'}; n ${c.n}, weeks ${c.clusters}${dropped ? `, ${dropped}` : ''}`);
      else if (s.kind === 'notWorse') out.push(`- day ${c.day}: median ${s.a} / ${s.b} ${fmt(c.percent[0], 4)} % [${fmt(c.percent[1], 4)}, ${fmt(c.percent[2], 4)}] %, median ${s.a} less ${s.b} ${fmt(c.medianDiffM, 4)} m; reverse rule 1 ${c.reverseRule1 ? 'holds' : 'does not hold'}, material (above ${s.materialityM ?? 0} m) ${c.medianDiffM > (s.materialityM ?? 0) ? 'yes' : 'no'}; ${c.worse ? 'WORSE' : 'not worse'}; n ${c.n}, weeks ${c.clusters}${dropped ? `, ${dropped}` : ''}`);
      else if (s.kind === 'regression') out.push(`- day ${c.day}: median paired ratio ${s.new} / ${s.old} ${fmt(c.estimate, 4)} ${iv(c.interval, 4)}; ratio of medians ${fmt(c.ratioOfMedians, 4)}; ${c.pass ? 'at most' : 'above'} ${s.maxRatio}, interval ${c.intervalWithin ? 'inside' : 'not inside'}; n ${c.n}, weeks ${c.clusters}${dropped ? `, ${dropped}` : ''}`);
      else if (s.kind === 'gain') out.push(`- day ${c.day}: median paired ${s.new} less ${s.reference} ${fmt(c.closeness.estimate, 3)} m ${iv(c.closeness.interval, 3)} (within +-${s.marginM} m: ${Math.abs(c.closeness.estimate) <= s.marginM ? 'yes' : 'no'}); gain against ${s.old} ${fmt(c.gain.estimate, 3)} m ${iv(c.gain.interval, 3)} (at least ${s.minGainM} m: ${c.gain.estimate >= s.minGainM ? 'yes' : 'no'}); interval inside ${c.intervalWithin ? 'yes' : 'no'}; n ${c.n}, weeks ${c.clusters}${dropped ? `, ${dropped}` : ''}`);
    }
    out.push('');
  }
  if (metrics.contrasts.length) {
    out.push('## Report-only paired contrasts (median of a less b, meters)', '');
    for (const c of metrics.contrasts) out.push(`- ${c.label}: ${c.cells.map((x) => (x.n ? `day ${x.day} ${fmt(x.estimate, 3)} m ${iv(x.interval, 3)} (n ${x.n})` : `day ${x.day} no windows`)).join('; ')}`);
    out.push('');
  }
  out.push('## Medians (95th percentile), km', '');
  for (const f of metrics.figures) {
    out.push(`### ${f.group}`, '', `| Arm | ${f.days.map((d) => `Day ${d}`).join(' | ')} |`, `|---|${f.days.map(() => '---:').join('|')}|`);
    for (const arm of f.arms) out.push(`| ${arm} | ${f.days.map((d) => { const c = f.cells[arm][d]; return c.n ? `${fmt(c.median, 4)} (${fmt(c.p95, 3)}) n ${c.n}` : '-'; }).join(' | ')} |`);
    out.push('');
  }
  out.push('## Accounting', '', '| Group | Cutoffs | Rows | Rows with an error | Arm failures |', '|---|---:|---:|---:|---|');
  for (const a of metrics.accounting) out.push(`| ${a.group} | ${a.expectedCutoffs} | ${a.rows} | ${a.rowErrors} | ${Object.entries(a.armFailures).map(([k, n]) => `${k} ${n}`).join(', ')} |`);
  return `${out.join('\n')}\n`;
}
