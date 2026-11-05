#!/usr/bin/env node
// The DSST arm (DSST.md): fits | flights | tables | --check.
//   node experiments/dsst-arm/run.mjs fits      fit every registered window (part 2)
//   node experiments/dsst-arm/run.mjs flights   fly every stored fit to its cell's leads and score it (part 2)
//   node experiments/dsst-arm/run.mjs tables    results/dsst-arm/table.json and README.md from the stored rows
//   node experiments/dsst-arm/run.mjs --check   the registration predates every row; the tables reproduce from the rows; holds kept
// Registration guard: no row is written before DSST.md's registration commit is on origin/main with the registration files equal
// to their blobs there, and never for a key outside windows.json's set or a held key.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collect, cellGrid, REGISTERED, ROOT, GALILEO_HELD, SWARM_GRACEFO, SWARM_GRACEFO_HOLD_FROM, STARLINK } from './windows.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
const STORE = path.join(ROOT, 'dsst-arm');
const RESULTS = path.join(repo, 'results/dsst-arm');
const FILES = ['DSST.md', 'windows.json', 'windows.mjs', 'run.mjs'];
const COLUMN = 'DSST';

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

/** Before a row is written: the registration is on origin/main, the files equal it, the key is registered and not held. */
export function guard(set, key, row) {
  const registration = registrationAt('origin/main');
  if (!registration) fail('DSST.md has no registration commit on origin/main: push it before any row is written');
  if (!registration.equal) fail(`${registration.differs} differs from origin/main ${registration.sha.slice(0, 12)}: commit and push it before any row is written`);
  if (!set) fail('the archive is absent: no window set');
  if (!set.keys.has(key)) fail(`${key} is not a registered window`);
  const why = heldKey(row ?? { key });
  if (why) fail(`${key} is held (${why})`);
  return registration;
}

const readRows = () => (fs.existsSync(STORE) ? fs.readdirSync(STORE).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(STORE, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const asc = (a, b) => a - b;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
const round = (x) => Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4));

/** results/dsst-arm/table.json from the rows: the DSST column per (reference, regime, fit, lead) beside the cells' columns, unchanged. */
function buildTable(rows, registration) {
  const cells = JSON.parse(fs.readFileSync(path.join(repo, 'results/ap-truth/compare/cells.json'), 'utf8'));
  const grid = cellGrid();
  const out = [];
  for (const [, cell] of Object.entries(grid)) {
    for (const fit of cell.fits) for (const lead of cell.leads) {
      const mine = rows.filter((r) => r.reference === cell.reference && r.regime === cell.regime && r.fit === fit && Number.isFinite(r.leads?.[lead]?.e));
      const other = cells.rows.find((r) => r.level === 'regime' && r.provider === 'All' && r.reference === cell.reference && r.regime === cell.regime && r.fit === fit && r.lead === lead);
      if (!mine.length && !other) continue;
      const v = mine.map((r) => r.leads[lead].e).sort(asc);
      const failures = rows.filter((r) => r.reference === cell.reference && r.regime === cell.regime && r.fit === fit && r.failed).length;
      out.push({ reference: cell.reference, regime: cell.regime, input: cell.input, fit, lead, n: other?.n ?? null, burnsInFit: other?.burnsInFit ?? null, burnsInForecast: other?.burnsInForecast ?? null,
        build: { ...(other?.build ?? {}), [COLUMN]: ['orekit@13.1', 'hipparchus@4.0.1', ...new Set(rows.map((r) => `DsstArm.java@${r.build?.driverSha256?.slice(0, 12)}`))] },
        arms: { ...(other?.arms ?? {}), ...(v.length ? { [COLUMN]: [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length] } : {}) }, failures: { [COLUMN]: failures } });
    }
  }
  return { registered: `experiments/dsst-arm/DSST.md at ${registration?.sha ?? 'uncommitted'}`, columns: { ...cells.columns, [COLUMN]: 'DSST (Orekit 13.1)' }, fields: `${cells.fields} failures: fits that did not converge, counted, never dropped.`, rows: out };
}

const tableBytes = (table) => `${JSON.stringify(table, null, 1)}\n`;

function phaseTables(rows, registration) {
  if (!rows.length) { console.log('no rows: no table is written'); return; }
  fs.mkdirSync(RESULTS, { recursive: true });
  const table = buildTable(rows, registration);
  fs.writeFileSync(path.join(RESULTS, 'table.json'), tableBytes(table));
  fs.writeFileSync(path.join(RESULTS, 'README.md'), readme(table, rows));
  console.log(`${table.rows.length} cells from ${rows.length} rows -> results/dsst-arm/table.json`);
}

function readme(table, rows) {
  const lines = ['# DSST beside SGP4, both XPs, AP and FFM', '', `Registered: \`${table.registered}\`. ${rows.length} rows, ${rows.filter((r) => r.failed).length} failed fits. Median km, 95th percentile km, n per cell; \`table.json\` carries every column's build.`, '', '| Reference | Regime | Fit h | Lead h | ' + Object.keys(table.columns).join(' | ') + ' |', '|---|---|---:|---:|' + Object.keys(table.columns).map(() => '---:').join('|') + '|'];
  for (const r of table.rows) lines.push(`| ${r.reference} | ${r.regime} | ${r.fit} | ${r.lead} | ${Object.keys(table.columns).map((c) => (r.arms[c] ? `${r.arms[c][0]} / ${r.arms[c][1]} (${r.arms[c][2]})` : '')).join(' | ')} |`);
  return `${lines.join('\n')}\n`;
}

function check() {
  const head = registrationAt('HEAD'), main = registrationAt('origin/main');
  if (!head) fail('DSST.md is not committed');
  if (!head.equal) fail(`${head.differs} differs from HEAD: commit the registration`);
  const set = windowSet();
  const rows = readRows();
  const where = main?.equal ? `on origin/main at ${main.sha.slice(0, 12)}` : `committed at ${head.sha.slice(0, 12)}, not yet on origin/main`;
  const digest = set ? `window digest ${set.digest.slice(0, 12)} verified` : 'archive absent: window digest not checked';
  if (!rows.length) { console.log(`PASS: registered (${where}; ${digest}), no rows`); return; }
  if (!main?.equal) fail('rows exist but the registration is not on origin/main');
  for (const r of rows) {
    if (!set?.keys.has(r.key)) fail(`row ${r.key} is not a registered window`);
    const why = heldKey(r);
    if (why) fail(`row ${r.key} is held (${why})`);
    if (!(Date.parse(r.writtenAt) > main.at)) fail(`row ${r.key} written ${r.writtenAt}, not after the registration commit ${new Date(main.at).toISOString()}`);
  }
  const table = buildTable(rows, main), file = path.join(RESULTS, 'table.json');
  if (!fs.existsSync(file)) fail('results/dsst-arm/table.json is missing');
  if (fs.readFileSync(file, 'utf8') !== tableBytes(table)) fail('results/dsst-arm/table.json does not reproduce from the stored rows');
  if (fs.readFileSync(path.join(RESULTS, 'README.md'), 'utf8') !== readme(table, rows)) fail('results/dsst-arm/README.md does not reproduce from the stored rows');
  console.log(`PASS: registered ${where}; ${rows.length} rows after it; ${digest}; table.json and README.md reproduce; holds kept`);
}

const phase = process.argv[2];
if (phase === '--check') check();
else if (phase === 'tables') { const head = registrationAt('origin/main') ?? registrationAt('HEAD'); phaseTables(readRows(), head); }
else if (phase === 'fits' || phase === 'flights') {
  const set = windowSet();
  const registration = registrationAt('origin/main');
  if (!registration?.equal) fail(`${phase}: DSST.md's registration is not on origin/main with equal files; no row is written`);
  if (!set) fail(`${phase}: the archive is absent`);
  console.error(`${phase}: registration ${registration.sha.slice(0, 12)} on origin/main, ${set.keys.size} windows; part 2 (DsstArm.java) is not in this registration: the SDN-AP session's review comes first. No fit runs.`);
  process.exit(2);
} else { console.error('usage: run.mjs fits | flights | tables | --check'); process.exit(2); }
