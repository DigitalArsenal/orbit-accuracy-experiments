// Step 3: the results table, from the local rows (identifiers, counts and errors only) -> results/sdn-ap-gp-history-od/table.json and table.md.
// Everything in the committed table is computed here from the rows; nothing is typed. Counting, ordering and resampling only.
//   node experiments/sdn-ap-gp-history-od/tables.mjs [--check]   (--check recomputes and compares with the committed table.json)
// A run on a machine without the local rows says so and exits 0 (a skipped check, never a pass).
import fs from 'node:fs';
import path from 'node:path';
import { config, windows, store, results, write, sha256, dir } from './common.mjs';

const ARMS = config.arms;
const ARM_LABEL = { 'sgp4-latest': 'SGP4, latest element set', 'sgp4xp-fit': 'SGP4-XP fitted to the history', 'sdnap-fit': 'SDN-AP fitted to the history' };
const argv = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') && !all[i + 1]?.startsWith('--') && all[i + 1] ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const rowsDir = path.join(store, argv.rows ?? 'rows');
const outName = argv.out ?? 'table'; // run 1 (superseded by amendment A1) is tabulated with --rows rows-run1 --out table-run1
if (!fs.existsSync(rowsDir)) { console.error(`SKIPPED: no local rows under ${rowsDir}`); process.exit(0); }
const rows = new Map();
for (const f of fs.readdirSync(rowsDir).filter((n) => n.endsWith('.jsonl')).sort()) for (const l of fs.readFileSync(path.join(rowsDir, f), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); rows.set(r.key, r); }

const quantile = (values, q) => { const a = [...values].sort((x, y) => x - y); if (!a.length) return null; const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };
const median = (v) => quantile(v, 0.5);
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const B = config.statistics.bootstrapResamples;
/** Percentile bootstrap interval of the median: resample `items` (window values) with replacement. */
function interval(values, seed) {
  if (values.length < config.statistics.minimumWindowsForInterval) return null;
  const rand = mulberry32(seed), meds = new Float64Array(B), n = values.length, draw = new Array(n);
  for (let b = 0; b < B; b += 1) { for (let i = 0; i < n; i += 1) draw[i] = values[Math.floor(rand() * n)]; meds[b] = median(draw); }
  const s = Array.from(meds).sort((x, y) => x - y);
  return [quantile(s, 0.025), quantile(s, 0.975)];
}
/** The same, resampling objects first and then their windows: items are [{ object, value }]. */
function objectInterval(items, seed) {
  const byObject = new Map();
  for (const x of items) byObject.set(x.object, [...(byObject.get(x.object) ?? []), x.value]);
  if (byObject.size < config.statistics.minimumWindowsForInterval) return null;
  const groups = [...byObject.values()], rand = mulberry32(seed), meds = new Float64Array(B);
  for (let b = 0; b < B; b += 1) {
    const draw = [];
    for (let i = 0; i < groups.length; i += 1) { const g = groups[Math.floor(rand() * groups.length)]; for (let j = 0; j < g.length; j += 1) draw.push(g[Math.floor(rand() * g.length)]); }
    meds[b] = median(draw);
  }
  const s = Array.from(meds).sort((x, y) => x - y);
  return [quantile(s, 0.025), quantile(s, 0.975)];
}
const err3 = (days) => (days && days[1] && days[2] && days[3] ? Math.sqrt((days[1].rmsKm ** 2 + days[2].rmsKm ** 2 + days[3].rmsKm ** 2) / 3) : null);
const round = (x) => (x === null || x === undefined ? null : Number(x.toPrecision(6)));
const rounded = (arr) => (arr ? arr.map(round) : null);
let seedCounter = 0;
const seed = () => config.statistics.bootstrapSeed + (seedCounter += 1);

// the section 12.3 precise-fit SDN-AP rows of the headline build (the newest build that ran every source), for context on the same windows
function preciseFits() {
  const g1 = config.g1Store, root = path.join(g1, 'rows/sdngp');
  if (!fs.existsSync(root)) return null;
  const builds = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'complete.json'))).map((d) => ({ d, t: fs.statSync(path.join(root, d, 'complete.json')).mtimeMs })).sort((a, b) => a.t - b.t);
  if (!builds.length) return null;
  const { d } = builds.at(-1), out = new Map();
  for (const f of fs.readdirSync(path.join(root, d)).filter((n) => n.endsWith('.jsonl') && !n.includes('skipped'))) {
    for (const l of fs.readFileSync(path.join(root, d, f), 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(l);
      if (r.fitSeconds === config.window.fitSeconds && r.sdngp?.ok) out.set(`${r.source}|${r.id}|${r.startUtc}`, err3(r.sdngp.days));
    }
  }
  return { build: d, byWindow: out };
}
const precise = preciseFits();

const out = { schema: 'sdn-ap-gp-history-od/1', ...(argv.rows ? { superseded: 'the first run, before amendment A1 (PLAN.md)' } : {}), experiment: config.experiment, registeredUtc: config.registeredUtc, plan: sha256(fs.readFileSync(path.join(dir, 'PLAN.md'))), windowsSha256: sha256(fs.readFileSync(path.join(dir, 'windows.json'))),
  unit: 'km', metric: 'day 1 to 3 3D RMS error: sqrt((d1^2 + d2^2 + d3^2) / 3) over a window complete for the arm', bootstrap: { resamples: B, seed: config.statistics.bootstrapSeed, intervalPercent: config.statistics.intervalPercent },
  sdnapBuild: [...new Set([...rows.values()].map((r) => r.build))].sort(), preciseFitBuild: precise?.build ?? null, regimes: [] };

for (const regime of config.regimes) {
  const reg = windows.filter((w) => w.regime === regime.id);
  const mine = reg.map((w) => rows.get(`${w.regime}|${w.source}|${w.id}|${w.startUtc}`)).filter(Boolean);
  const objects = new Set(reg.map((w) => w.norad));
  const entry = { id: regime.id, label: regime.label, windows: { registered: reg.length, run: mine.length, withElementSets: mine.filter((r) => r.setsAvailable).length, withPseudoObservations: mine.filter((r) => r.pseudo && r.pseudo.states >= config.pseudoObservations.minimumStates).length, skipped: mine.filter((r) => r.skipped).length }, objects: objects.size, arms: {} };
  const perArm = {};
  for (const arm of ARMS) {
    const items = mine.filter((r) => r.arms?.[arm]).map((r) => ({ row: r, a: r.arms[arm] }));
    const complete = items.map((x) => ({ object: x.row.norad, key: x.row.key, value: err3(x.a.ok ? x.a.days : null), a: x.a })).filter((x) => x.value !== null);
    perArm[arm] = complete;
    const values = complete.map((x) => x.value);
    const days = {};
    for (const k of [1, 2, 3]) { const d = items.filter((x) => x.a.ok && x.a.days?.[k]).map((x) => x.a.days[k].rmsKm); days[k] = { windows: d.length, median: round(median(d)) }; }
    entry.arms[arm] = { label: ARM_LABEL[arm], attempted: items.length, fitted: items.filter((x) => x.a.ok).length, failed: items.filter((x) => !x.a.ok && !x.a.skipped).length, skipped: items.filter((x) => x.a.skipped).length, scored: items.filter((x) => x.a.ok && Object.keys(x.a.days ?? {}).length).length, complete: values.length,
      objects: new Set(complete.map((x) => x.object)).size, median: round(median(values)), p10: round(quantile(values, 0.1)), p90: round(quantile(values, 0.9)), ci95: rounded(interval(values, seed())), ci95Objects: rounded(objectInterval(complete.map((x) => ({ object: x.object, value: x.value })), seed())), days };
  }
  // paired on the windows complete for all three arms
  const common = perArm[ARMS[0]].map((x) => x.key).filter((k) => ARMS.every((arm) => perArm[arm].some((x) => x.key === k)));
  const val = (arm, key) => perArm[arm].find((x) => x.key === key).value;
  entry.paired = { windows: common.length, arms: {} };
  for (const arm of ARMS) {
    const v = common.map((k) => val(arm, k));
    const ratio = arm === ARMS[0] ? null : common.map((k) => val(arm, k) / val(ARMS[0], k));
    entry.paired.arms[arm] = { median: round(median(v)), p10: round(quantile(v, 0.1)), p90: round(quantile(v, 0.9)), ...(ratio ? { ratioToBaselineMedian: round(median(ratio)), ratioToBaselineCi95: rounded(interval(ratio, seed())), shareBetterThanBaseline: round(ratio.filter((r) => r < 1).length / ratio.length) } : {}) };
  }
  if (precise) {
    const ctx = common.map((k) => { const w = reg.find((x) => `${x.regime}|${x.source}|${x.id}|${x.startUtc}` === k); return precise.byWindow.get(`${w.source}|${w.id}|${w.startUtc}`); }).filter((v) => Number.isFinite(v));
    entry.paired.preciseFitSdnapMedian = { windows: ctx.length, median: round(median(ctx)) };
  }
  out.regimes.push(entry);
}

const fmt = (x) => (x === null || x === undefined ? 'n/a' : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3));
let md = `# SDN-AP fitted from public element-set history (experiment ${config.experiment})\n\nGenerated by \`experiments/sdn-ap-gp-history-od/tables.mjs\` from the local rows. Plan \`${out.plan.slice(0, 12)}\`, windows \`${out.windowsSha256.slice(0, 12)}\`. Day 1 to 3 3D RMS error in km: median [10th, 90th percentile], bootstrap 95 % interval of the median in parentheses (windows resampled; objects resampled where 5 or more).\n\n`;
for (const r of out.regimes) {
  md += `## ${r.label}\n\nWindows registered ${r.windows.registered} (${r.objects} objects); run ${r.windows.run}; with element sets ${r.windows.withElementSets}; with pseudo-observations ${r.windows.withPseudoObservations}.\n\n| Arm | Complete | Failed | Median [p10, p90] | 95 % interval, windows | 95 % interval, objects | Day 1 | Day 2 | Day 3 |\n| --- | --: | --: | --- | --- | --- | --: | --: | --: |\n`;
  for (const arm of ARMS) { const a = r.arms[arm]; md += `| ${a.label} | ${a.complete} | ${a.failed + a.skipped} | ${fmt(a.median)} [${fmt(a.p10)}, ${fmt(a.p90)}] | ${a.ci95 ? `${fmt(a.ci95[0])} to ${fmt(a.ci95[1])}` : 'n/a'} | ${a.ci95Objects ? `${fmt(a.ci95Objects[0])} to ${fmt(a.ci95Objects[1])}` : 'n/a'} | ${fmt(a.days[1].median)} | ${fmt(a.days[2].median)} | ${fmt(a.days[3].median)} |\n`; }
  md += `\nPaired, ${r.paired.windows} windows complete for all three arms: ${ARMS.slice(1).map((arm) => `${ARM_LABEL[arm]} over the baseline, median ratio ${fmt(r.paired.arms[arm].ratioToBaselineMedian)}${r.paired.arms[arm].ratioToBaselineCi95 ? ` (${fmt(r.paired.arms[arm].ratioToBaselineCi95[0])} to ${fmt(r.paired.arms[arm].ratioToBaselineCi95[1])})` : ''}, better in ${r.paired.arms[arm].shareBetterThanBaseline === undefined ? 'n/a' : `${(100 * r.paired.arms[arm].shareBetterThanBaseline).toFixed(0)} %`} of windows`).join('; ')}.${r.paired.preciseFitSdnapMedian ? ` Section 12.3's SDN-AP fitted to the precise orbit, same ${r.paired.preciseFitSdnapMedian.windows} windows: median ${fmt(r.paired.preciseFitSdnapMedian.median)} km.` : ''}\n\n`;
}
if (process.argv.includes('--check')) {
  const committed = JSON.parse(fs.readFileSync(path.join(results, `${outName}.json`), 'utf8'));
  if (JSON.stringify(committed) !== JSON.stringify(JSON.parse(JSON.stringify(out)))) { console.error('table.json differs from the table recomputed from the rows'); process.exit(1); }
  if (fs.readFileSync(path.join(results, `${outName}.md`), 'utf8') !== md) { console.error('table.md differs from the table recomputed from the rows'); process.exit(1); }
  console.log(`${outName}.json and ${outName}.md match the ${rows.size} local rows`);
} else {
  write(path.join(results, `${outName}.json`), out);
  write(path.join(results, `${outName}.md`), md);
  console.log(`wrote results/sdn-ap-gp-history-od/${outName}.json and .md from ${rows.size} rows`);
}
