#!/usr/bin/env node
// The DSST arm (DSST.md as amended 2026-11-05): fits | flights | tables | --check.
//   node experiments/dsst-arm/run.mjs fits --store ap/b051/regimes [--workers 6] [--cost]   fit and fly a store's registered windows (truth-fits.mjs)
//   node experiments/dsst-arm/run.mjs flights                                               the flights are flown with the fits; reports them
//   node experiments/dsst-arm/run.mjs tables                                                results/dsst-arm/table.json and README.md from the stored rows
//   node experiments/dsst-arm/run.mjs --check   the registration and amendment predate every row; the tables reproduce from the rows; holds kept
// Registration guard: no row is written before DSST.md's registration commit (the newest commit touching it) is on origin/main with every
// registration file equal to its blob there, and never for a key outside windows.json's set or a held key.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { collect, cellGrid, REGISTERED, ROOT, GALILEO_HELD, SWARM_GRACEFO, SWARM_GRACEFO_HOLD_FROM, STARLINK } from './windows.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
const STORE = path.join(ROOT, 'dsst-arm');
const RESULTS = path.join(repo, 'results/dsst-arm');
const FILES = ['DSST.md', 'windows.json', 'windows.mjs', 'run.mjs', 'truth-fits.mjs', 'DsstArm.java'];
const COLUMN = 'DSST';
const B051 = path.join(ROOT, 'ap/b051');

const git = (...a) => execFileSync('git', a, { cwd: repo, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
const fail = (message) => { console.error(`FAIL: ${message}`); process.exit(1); };

/** The registration's commit at `ref`, or null: the newest commit touching DSST.md there, with every registration file equal to its blob. */
function registrationAt(ref) {
  let line;
  try { line = git('log', '-1', '--format=%H %ct', ref, '--', 'experiments/dsst-arm/DSST.md').toString().trim(); } catch { return null; }
  if (!line) return null;
  const [sha, seconds] = line.split(' ');
  for (const name of FILES) {
    let blob;
    try { blob = git('show', `${ref}:experiments/dsst-arm/${name}`); } catch { return { sha, at: Number(seconds) * 1000, equal: false, differs: name }; }
    if (!blob.equals(fs.readFileSync(path.join(here, name)))) return { sha, at: Number(seconds) * 1000, equal: false, differs: name };
  }
  return { sha, at: Number(seconds) * 1000, equal: true };
}

/** The registered window set, checked against windows.json's digest; null when the archive is absent. */
function windowSet() {
  if (!fs.existsSync(ROOT)) return null;
  const registered = JSON.parse(fs.readFileSync(REGISTERED, 'utf8'));
  const set = collect();
  if (set.digest !== registered.digest || set.keys.size !== registered.windows) fail(`the stores give ${set.keys.size} windows, digest ${set.digest.slice(0, 12)}; registered ${registered.windows}, ${registered.digest.slice(0, 12)}`);
  return set;
}

const heldKey = (row) => {
  if (STARLINK.test(JSON.stringify(row)) || /(^|\|)starlink(\||$)/.test(row.key)) return 'starlink';
  if (GALILEO_HELD.has(Number(row.norad))) return 'galileo-held';
  const at = Date.parse(row.cutoff ?? row.olderStart ?? '');
  if (SWARM_GRACEFO.has(Number(row.norad)) && at >= SWARM_GRACEFO_HOLD_FROM) return 'swarm-gracefo-after-2026-10-31';
  return null;
};

const readRows = () => (fs.existsSync(STORE) ? fs.readdirSync(STORE).filter((f) => /^rows-.*\.jsonl$/.test(f) && !/-cost\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(STORE, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const readCostRows = () => (fs.existsSync(STORE) ? fs.readdirSync(STORE).filter((f) => /^rows-.*-cost\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(STORE, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const asc = (a, b) => a - b;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
const round = (x) => Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4));
const median = (v) => { const a = [...v].sort(asc); const k = Math.floor(a.length / 2); return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2; };

/** AP's e (km) per window and lead from the b051 stores, for the paired ratios: { `${key}@${fit}@${lead}`: e }. */
function apErrors() {
  const out = new Map();
  for (const dir of ['truth', 'truth2', 'regimes', 'regimes-hx', 'regimes-wa']) {
    const d = path.join(B051, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((n) => /^rows-\d+\.jsonl$/.test(n))) for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
      if (!l) continue;
      const r = JSON.parse(l);
      for (const [arm, a] of Object.entries(r.arms ?? {})) { const m = /^AP(\d+)$/.exec(arm); if (!m || !a?.days) continue; for (const [day, v] of Object.entries(a.days)) if (Number.isFinite(v?.e)) out.set(`${r.key}@${m[1]}@${Number(day) * 24}`, v.e); }
    }
  }
  return out;
}

/** AP5.md's statistic: d = ln(e_AP / e_DSST) per window, clusters the ISO week of the cutoff, a 10,000-draw cluster bootstrap of the median, 97.5 % percentile interval. */
function pairedRatio(pairs) {
  if (pairs.length < 2) return null;
  const isoWeek = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return `${d.getUTCFullYear()}-${1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)}`; };
  const clusters = new Map();
  for (const p of pairs) (clusters.get(isoWeek(Date.parse(p.cutoff))) ?? clusters.set(isoWeek(Date.parse(p.cutoff)), []).get(isoWeek(Date.parse(p.cutoff)))).push(p.d);
  const groups = [...clusters.values()];
  let seed = 20261105;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const medians = [];
  for (let b = 0; b < 10000; b += 1) { const draw = []; for (let i = 0; i < groups.length; i += 1) draw.push(...groups[Math.floor(rnd() * groups.length)]); medians.push(median(draw)); }
  medians.sort(asc);
  return { n: pairs.length, clusters: groups.length, medianLnRatio: Number(median(pairs.map((p) => p.d)).toFixed(4)), interval975: [Number(pct(medians, 0.0125).toFixed(4)), Number(pct(medians, 0.9875).toFixed(4))], medianRatio: Number(Math.exp(median(pairs.map((p) => p.d))).toFixed(4)) };
}

/** results/dsst-arm/table.json from the rows: the DSST column per (reference, regime, fit, lead) beside the cells' columns, unchanged, with the paired ratio. */
function buildTable(rows, registration) {
  const cells = JSON.parse(fs.readFileSync(path.join(repo, 'results/ap-truth/compare/cells.json'), 'utf8'));
  const grid = cellGrid();
  const ap = apErrors();
  const out = [];
  for (const [, cell] of Object.entries(grid)) {
    for (const fit of cell.fits) for (const lead of cell.leads) {
      const inCell = rows.filter((r) => r.reference === cell.reference && r.regime === cell.regime && r.fit === fit);
      const mine = inCell.filter((r) => Number.isFinite(r.leads?.[lead]?.e));
      const other = cells.rows.find((r) => r.level === 'regime' && r.provider === 'All' && r.reference === cell.reference && r.regime === cell.regime && r.fit === fit && r.lead === lead);
      if (!inCell.length) continue;
      const v = mine.map((r) => r.leads[lead].e).sort(asc);
      const pairs = mine.map((r) => ({ cutoff: r.cutoff, d: ap.has(`${r.key}@${fit}@${lead}`) ? Math.log(ap.get(`${r.key}@${fit}@${lead}`) / r.leads[lead].e) : null })).filter((p) => Number.isFinite(p.d));
      out.push({ reference: cell.reference, regime: cell.regime, input: cell.input, fit, lead, n: other?.n ?? null, windows: inCell.length, failed: inCell.filter((r) => r.failed).length, unscored: inCell.filter((r) => r.unscored).length, burnsInFit: other?.burnsInFit ?? null, burnsInForecast: other?.burnsInForecast ?? null,
        build: { ...(other?.build ?? {}), [COLUMN]: [...new Set(rows.map((r) => `orekit@${r.build?.orekit?.sha256?.slice(0, 12)}+DsstArm.java@${r.build?.driverSha256?.slice(0, 12)}`))] },
        arms: { ...(other?.arms ?? {}), ...(v.length ? { [COLUMN]: [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length] } : {}) },
        apOverDsst: pairedRatio(pairs) });
    }
  }
  return { registered: `experiments/dsst-arm/DSST.md at ${registration?.sha ?? 'uncommitted'}`, columns: { ...cells.columns, [COLUMN]: 'DSST (Orekit 13.1)' },
    fields: `${cells.fields} windows, failed, unscored: the DSST rows of the cell and fit; failed: fits that threw or did not converge, counted, never dropped; unscored: windows the AP arm's runner also leaves unscored (no lead bin, arc coverage, an excluded weather span). apOverDsst: AP5.md's statistic on the paired windows, d = ln(e_AP / e_DSST), clusters the ISO week of the cutoff, 10,000-draw cluster bootstrap, 97.5 % percentile interval of the median; medianRatio = exp(median d) (above 1: DSST closer than AP).`,
    builds: rows.length ? rows[0].build : null, rows: out };
}

/** The cost rows (the registered subsample, one window at a time, single thread): medians per (input, regime) and fit. */
function buildCost(costRows) {
  const by = new Map();
  for (const r of costRows.filter((r) => !r.failed && !r.unscored && r.cost)) { const k = `${r.input}|${r.regime}|${r.fit}`; (by.get(k) ?? by.set(k, []).get(k)).push(r); }
  const med = (list, f) => Number(median(list.map(f)).toPrecision(4));
  const rows = [...by].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => { const [input, regime, fit] = k.split('|'); return { input, regime, fit: Number(fit), n: list.length,
    fitCpuSPerObjectDay: med(list, (r) => (r.cost.fitCpuS / (r.fit / 24))), fitWallSPerObjectDay: med(list, (r) => r.cost.fitWallS / (r.fit / 24)), flightCpuSPerObjectDay: med(list, (r) => r.cost.flightCpuS / r.cost.objectDays), flightWallSPerObjectDay: med(list, (r) => r.cost.flightWallS / r.cost.objectDays),
    stepSeconds: list[0].cost.stepSeconds, peakHeapBytes: Math.round(median(list.map((r) => r.cost.peakHeapBytes))), arcStates: Math.round(median(list.map((r) => r.arcStates))) }; });
  const summaries = fs.existsSync(STORE) ? fs.readdirSync(STORE).filter((f) => /^cost-.*\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(STORE, f), 'utf8'))) : [];
  return { measures: 'per window: CPU user plus system (OperatingSystemMXBean.getProcessCpuTime) and wall for the fit, per object-day of the arc, and for the flight, per object-day flown at the step named; peak heap (the heap pools\' peak usage, reset before the call); the JVM\'s maximum resident set size per process (/usr/bin/time -l); jar bytes 8,496,500 (Orekit) + 3,055,806 (Hipparchus); one uncounted window warms the JVM; the 1-minute load average before and after each window is in its row', machine: 'Mac Studio, Apple M3 Ultra, 28 cores', singleThread: true, processes: summaries, rows };
}

const tableBytes = (table) => `${JSON.stringify(table, null, 1)}\n`;

function readme(table, cost, rows) {
  const lines = ['# DSST beside SGP4, both XPs, AP and FFM', '', `Registered: \`${table.registered}\`. ${rows.length} DSST rows (${rows.filter((r) => r.failed).length} failed fits, counted; ${rows.filter((r) => r.unscored).length} unscored windows). Median km / 95th percentile km (n) per cell; \`table.json\` carries every column's build, the paired AP-over-DSST ratio with its interval, and the cost rows.`, '',
    `Build: Orekit ${table.builds?.orekit?.version} (${table.builds?.orekit?.sha256?.slice(0, 12)}), Hipparchus ${table.builds?.hipparchus?.version}, ${table.builds?.jvm}, DsstArm.java ${table.builds?.driverSha256?.slice(0, 12)}. Cost rows on ${cost.machine}, single thread.`, '',
    '| Reference | Regime | Fit h | Lead h | ' + Object.keys(table.columns).join(' | ') + ' | AP/DSST median ratio [97.5 % interval of ln] |', '|---|---|---:|---:|' + Object.keys(table.columns).map(() => '---:').join('|') + '|---|'];
  for (const r of table.rows) lines.push(`| ${r.reference} | ${r.regime} | ${r.fit} | ${r.lead} | ${Object.keys(table.columns).map((c) => (r.arms[c] ? `${r.arms[c][0]} / ${r.arms[c][1]} (${r.arms[c][2]})` : '')).join(' | ')} | ${r.apOverDsst ? `${r.apOverDsst.medianRatio} [${r.apOverDsst.interval975.join(', ')}] n ${r.apOverDsst.n}` : ''} |`);
  lines.push('', '## Cost', '', `${cost.measures}.`, '', '| Input | Regime | Fit h | n | Fit CPU s / object-day | Fit wall | Flight CPU s / object-day | Flight wall | Step s | Peak heap MB |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of cost.rows) lines.push(`| ${c.input} | ${c.regime} | ${c.fit} | ${c.n} | ${c.fitCpuSPerObjectDay} | ${c.fitWallSPerObjectDay} | ${c.flightCpuSPerObjectDay} | ${c.flightWallSPerObjectDay} | ${c.stepSeconds} | ${(c.peakHeapBytes / 1048576).toFixed(0)} |`);
  for (const p of cost.processes) lines.push('', `Process ${p.store}: maximum resident set size ${p.maxRssBytes ? `${(p.maxRssBytes / 1048576).toFixed(0)} MB` : 'not recorded'}, ${p.rows} windows, ${p.jvm}.`);
  return `${lines.join('\n')}\n`;
}

function phaseTables(rows, costRows, registration) {
  if (!rows.length) { console.log('no rows: no table is written'); return; }
  fs.mkdirSync(RESULTS, { recursive: true });
  const table = { ...buildTable(rows, registration), cost: buildCost(costRows) };
  fs.writeFileSync(path.join(RESULTS, 'table.json'), tableBytes(table));
  fs.writeFileSync(path.join(RESULTS, 'README.md'), readme(table, table.cost, rows));
  console.log(`${table.rows.length} cells from ${rows.length} rows (${costRows.length} cost rows) -> results/dsst-arm/table.json`);
}

function check() {
  const head = registrationAt('HEAD'), main = registrationAt('origin/main');
  if (!head) fail('DSST.md is not committed');
  if (!head.equal) fail(`${head.differs} differs from HEAD: commit the registration`);
  const set = windowSet();
  const rows = readRows(), costRows = readCostRows();
  const where = main?.equal ? `on origin/main at ${main.sha.slice(0, 12)}` : `committed at ${head.sha.slice(0, 12)}, not yet on origin/main`;
  const digest = set ? `window digest ${set.digest.slice(0, 12)} verified` : 'archive absent: window digest not checked';
  if (!rows.length) { console.log(`PASS: registered (${where}; ${digest}), no rows`); return; }
  if (!main?.equal) fail('rows exist but the registration is not on origin/main');
  for (const r of [...rows, ...costRows]) {
    if (!set?.keys.has(r.key)) fail(`row ${r.key} is not a registered window`);
    const why = heldKey(r);
    if (why) fail(`row ${r.key} is held (${why})`);
    if (!(Date.parse(r.writtenAt) > main.at)) fail(`row ${r.key} written ${r.writtenAt}, not after the registration commit ${new Date(main.at).toISOString()}`);
  }
  const table = { ...buildTable(rows, main), cost: buildCost(costRows) }, file = path.join(RESULTS, 'table.json');
  if (!fs.existsSync(file)) fail('results/dsst-arm/table.json is missing');
  if (fs.readFileSync(file, 'utf8') !== tableBytes(table)) fail('results/dsst-arm/table.json does not reproduce from the stored rows');
  if (fs.readFileSync(path.join(RESULTS, 'README.md'), 'utf8') !== readme(table, table.cost, rows)) fail('results/dsst-arm/README.md does not reproduce from the stored rows');
  console.log(`PASS: registered ${where}; ${rows.length} rows and ${costRows.length} cost rows after it; ${digest}; table.json and README.md reproduce; holds kept`);
}

const phase = process.argv[2];
if (phase === '--check') check();
else if (phase === 'tables') { const reg = registrationAt('origin/main') ?? registrationAt('HEAD'); phaseTables(readRows(), readCostRows(), reg); }
else if (phase === 'flights') { const rows = readRows(); console.log(`${rows.filter((r) => !r.failed).length} flights flown with their fits, ${rows.filter((r) => r.failed).length} failed fits; nothing more to fly`); }
else if (phase === 'fits') {
  const set = windowSet();
  const registration = registrationAt('origin/main');
  if (!registration?.equal) fail(`fits: DSST.md's registration is not on origin/main with equal files (${registration?.differs ?? 'no commit'}); no row is written`);
  if (!set) fail('fits: the archive is absent');
  const rest = process.argv.slice(3);
  console.error(`fits: registration ${registration.sha.slice(0, 12)} on origin/main, ${set.keys.size} windows`);
  const r = spawnSync(process.execPath, [path.join(here, 'truth-fits.mjs'), ...rest], { stdio: 'inherit', env: process.env });
  process.exit(r.status ?? 1);
} else { console.error('usage: run.mjs fits --store <store> [--workers n] [--cost] | flights | tables | --check'); process.exit(2); }
