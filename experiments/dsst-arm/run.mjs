#!/usr/bin/env node
// The DSST arm (DSST.md as amended 2026-11-05): fits | flights | tables | --check.
//   node experiments/dsst-arm/run.mjs fits --store ap/b051/regimes [--workers 6] [--cost]   fit and fly a store's registered windows (truth-fits.mjs;
//                                                                                           the ap/b0411 pair stores through pair-fits.mjs, its --iss pass with XP2F_CONTROL=1)
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
const FILES = ['DSST.md', 'windows.json', 'windows.mjs', 'run.mjs', 'truth-fits.mjs', 'pair-fits.mjs', 'DsstArm.java'];
const COLUMN = 'DSST';
const { AP_ARM, COLUMN_BUILDS } = await import(path.join(repo, 'experiments/operator-theory/lib/build.mjs'));
const { windowState } = await import(path.join(repo, 'experiments/operator-theory/lib/steps.mjs'));

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

/** Every other arm's error (km) on exactly the windows and pairs DSST scored, read by key from the stores compare-cells.mjs reads for
 *  results/ap-truth/compare/cells.json (DSST.md, amendment 2026-11-05 (review 2), 2): of(row, fit, lead) -> { column: km }. */
function otherArms() {
  const rowsOf = (dir, re = /^rows(-iss)?-\d+\.jsonl$/) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l && !STARLINK.test(l)).map((l) => JSON.parse(l))) : []);
  const byKey = (dir, key = (r) => r.key) => new Map(rowsOf(dir).map((r) => [key(r), r]));
  const A = path.join(ROOT, 'ap'), cache = new Map(), load = (dir, key) => cache.get(dir) ?? cache.set(dir, byKey(dir, key)).get(dir);
  // truth: SGP4, XP and FFM from the 0.4.11 build's stores, the Space Force XP and AP by window from ap/b051 (compare-cells.mjs CUTS and AP6's regimes)
  const TRUTH = {
    'ap/b051/truth': { base: 'b0411/compare-truth', ussf: 'b051/ussf-truth', ap: 'b051/truth' },
    'ap/b051/truth2': { base: 'b0411/compare-truth2', ussf: 'b051/ussf-truth2', ap: 'b051/truth2' },
    'ap/b051/regimes': { base: 'b0411/regimes', ussf: 'b051/ussf-regimes', ap: 'b051/regimes' },
    'ap/b051/regimes-hx': { base: 'b0411/regimes-hx', ussf: 'b051/ussf-regimes-hx', ap: 'b051/regimes-hx' },
    'ap/b051/regimes-wa': { base: 'b0411/regimes-wa', ussf: 'b051/ussf-regimes-wa', ap: 'b051/regimes-wa' },
  };
  const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
  const pairKey = (r) => `${r.source}|${r.norad ?? r.object}|${r.olderStart}|${r.newerStart}`;
  const km = (stores, k, names) => { for (const name of names) for (const s of stores) { const v = s.get(k)?.arms?.[name]?.km; if (Number.isFinite(v)) return v; } return undefined; };
  // the laser pairs: compare-cells.mjs stores and armsOf
  const laserStores = () => [path.join(A, 'b0411/laser/forward'), path.join(A, 'b0411/laser-xp/forward'), path.join(ROOT, 'cheaper/forward'), path.join(A, 'b0411/laser-sgp4'), path.join(A, 'b0411/laser-sgp4-high'), path.join(A, 'b0411/laser-sgp4-72'), path.join(A, 'xp-arm-0-2-1/ussf-laser')].map((d) => load(d, pairKey));
  const laserArms = (regime, fit) => (regime === 'Low orbit'
    ? { SGP4: [`S@${fit}`], XP: [`A-XP@${fit}`], XPU: [`U-XP@${fit}`], AP: [`${AP_ARM}@${fit}`], FFM20: fit === 48 ? ['F-M20@48'] : [], FFM40: fit === 48 ? ['F-M40@48'] : [], FFMfull: fit === 48 ? ['F-full@48'] : [], Center: ['operator'] }
    : { SGP4: [`S@${fit}`], XP: [`A-XP@${fit}`], XPU: [`U-XP@${fit}`], AP: [`${AP_ARM}@${fit}`], FFM20: fit === 48 ? ['F-H20@48'] : [], FFMfull: fit === 48 ? ['F-Hfull@48'] : [], Center: ['operator'] });
  // the provider pairs: compare-cells.mjs kmOf and cell
  const providerStores = () => [load(path.join(A, 'b0411/providers'), pairKey), new Map([...rowsOf(path.join(ROOT, 'forward'), /^rows-\d+\.jsonl$/), ...rowsOf(path.join(ROOT, 'vendors/forward'), /^rows-\d+\.jsonl$/)].map((r) => [pairKey(r), r])), load(path.join(A, 'xp-arm-0-2-1/ussf-providers'), pairKey)];
  const providerArms = (fit) => ({ SGP4: [`S@${fit}`], XP: [`A-XP@${fit}`], XPU: [`U-XP@${fit}`], AP: [`${AP_ARM}@${fit}`], FFM40: [`F-M40@${fit}`], FFMfull: [`F-NRLMSISE00@${fit}`, `F-NO-DRAG@${fit}`], Center: ['operator'] });
  let laser = null, providers = null;
  return (row, fit, lead) => {
    const out = {};
    if (row.reference === 'truth') {
      const src = TRUTH[row.store], day = String(lead / 24), ffm = ['P', 'S1', 'LS', 'DO'].includes(row.group) ? 'FFM40' : 'FFM20';
      const base = load(path.join(A, src.base)).get(row.key), ussf = load(path.join(A, src.ussf)).get(row.key), ap = load(path.join(A, src.ap)).get(row.key);
      for (const [column, r, arm] of [['SGP4', base, `S${fit}`], ['XP', base, `XP${fit}`], ['XPU', ussf, `U${fit}`], ['AP', ap, `AP${fit}`], [ffm, base, `F${fit}`]]) { const v = e(r, arm, day); if (Number.isFinite(v)) out[column] = v; }
    } else {
      const laserPair = row.store === 'ap/b0411/laser/forward';
      const stores = laserPair ? (laser ??= laserStores()) : (providers ??= providerStores());
      for (const [column, names] of Object.entries(laserPair ? laserArms(row.regime, fit) : providerArms(fit))) { const v = km(stores, row.key, names); if (Number.isFinite(v)) out[column] = v; }
    }
    return out;
  };
}

/** results/dsst-arm/table.json from the rows: per (reference, regime, fit, lead), every column on the same subset, the windows and pairs DSST
 *  scored, each arm read by key from its own store (never the cells' full-set figures); the paired AP-over-DSST ratio on that subset. */
function buildTable(rows, registration) {
  const cells = JSON.parse(fs.readFileSync(path.join(repo, 'results/ap-truth/compare/cells.json'), 'utf8'));
  const grid = cellGrid();
  const of = otherArms();
  const flags = new Map(JSON.parse(fs.readFileSync(path.join(repo, 'results/operator-theory/maneuver-flags/flags.json'), 'utf8')).windows.map((w) => [w.key, w]));
  const TRUTH_LEADS = grid['truth|Strong drag, 2025']?.leads ?? [24, 48, 72, 168];
  const groups = new Map();
  for (const r of rows) {
    const leads = r.reference === 'truth' ? TRUTH_LEADS : [r.lead];
    for (const lead of leads) { const k = `${r.reference}|${r.regime}|${r.fit}|${lead}`; (groups.get(k) ?? groups.set(k, { reference: r.reference, regime: r.regime, input: r.input, fit: r.fit, lead, rows: [] }).get(k)).rows.push(r); }
  }
  const out = [];
  for (const g of [...groups.values()].sort((a, b) => a.reference.localeCompare(b.reference) || a.regime.localeCompare(b.regime) || a.fit - b.fit || a.lead - b.lead)) {
    const scored = g.rows.filter((r) => Number.isFinite(r.leads?.[g.lead]?.e));
    const values = { [COLUMN]: [] }, pairs = [];
    for (const r of scored) {
      const mine = r.leads[g.lead].e, others = of(r, g.fit, g.lead);
      values[COLUMN].push(mine);
      for (const [column, v] of Object.entries(others)) (values[column] ??= []).push(v);
      if (Number.isFinite(others.AP)) pairs.push({ cutoff: r.cutoff, d: Math.log(others.AP / mine) });
    }
    const arms = {};
    for (const column of [...Object.keys(cells.columns), COLUMN]) { const v = (values[column] ?? []).sort(asc); if (v.length) arms[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length]; }
    const flagged = g.reference === 'truth' && scored.length && scored.every((r) => flags.has(r.key)) ? scored.map((r) => windowState(flags.get(r.key), g.fit, g.lead)) : null;
    const builds = COLUMN_BUILDS[g.reference] ?? {};
    out.push({ reference: g.reference, regime: g.regime, input: g.input, fit: g.fit, lead: g.lead, windows: g.rows.length, scored: scored.length,
      failed: g.rows.filter((r) => r.failed).length, unscored: g.rows.filter((r) => r.unscored).length,
      burnsInFit: flagged ? flagged.filter((x) => x.inFit).length : null, burnsInForecast: flagged ? flagged.filter((x) => x.inForecast).length : null,
      build: { ...Object.fromEntries(Object.keys(arms).filter((c) => builds[c]).map((c) => [c, builds[c].map((b) => b.key)])), [COLUMN]: [...new Set(g.rows.map((r) => `orekit@${r.build?.orekit?.sha256?.slice(0, 12)}+DsstArm.java@${r.build?.driverSha256?.slice(0, 12)}`))] },
      arms, apOverDsst: pairedRatio(pairs) });
  }
  return { registered: `experiments/dsst-arm/DSST.md at ${registration?.sha ?? 'uncommitted'}`, columns: { ...cells.columns, [COLUMN]: 'DSST (Orekit 13.1)' },
    fields: 'Per (reference, regime, fit, lead): windows, the DSST rows of the cell (a truth window enters every lead); scored, those with a DSST error at the lead; failed: fits that threw or did not converge, counted, never dropped; unscored: windows the AP arm\'s runner also leaves unscored (no lead bin, arc coverage, an excluded weather span, a file shorter than the fit) and pairs whose reference starts inside the fit (forward error only: a lead counts from the fit\'s end). arms: column to [median km, 95th percentile km, n], every column on the scored subset only, each arm read by key from the store compare-cells.mjs reads for it; a column with no row for a key leaves it out, so its n can be below scored. burnsInFit, burnsInForecast: of the scored truth windows, those with a maneuver step in the fit arc and in the forecast span to the lead (results/operator-theory/maneuver-flags); null where no detector covered every window. apOverDsst: AP5.md\'s statistic on the scored windows with an AP figure, d = ln(e_AP / e_DSST), clusters the ISO week of the cutoff, 10,000-draw cluster bootstrap, 97.5 % percentile interval of the median; medianRatio = exp(median d) (above 1: DSST closer than AP).',
    builds: rows.length ? rows[0].build : null, rows: out };
}

/** The cost rows (the registered subsample, one window at a time, single thread): medians per (input, regime) and fit. */
function buildCost(costRows) {
  const by = new Map();
  for (const r of costRows.filter((r) => !r.failed && !r.unscored && r.cost && r.cost.heapBound)) { const k = `${r.input}|${r.regime}|${r.fit}`; (by.get(k) ?? by.set(k, []).get(k)).push(r); }
  const med = (list, f) => Number(median(list.map(f)).toPrecision(4));
  const rows = [...by].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => { const [input, regime, fit] = k.split('|'); return { input, regime, fit: Number(fit), n: list.length,
    fitCpuSPerObjectDay: med(list, (r) => (r.cost.fitCpuS / (r.fit / 24))), fitWallSPerObjectDay: med(list, (r) => r.cost.fitWallS / (r.fit / 24)), flightCpuSPerObjectDay: med(list, (r) => r.cost.flightCpuS / r.cost.objectDays), flightWallSPerObjectDay: med(list, (r) => r.cost.flightWallS / r.cost.objectDays),
    stepSeconds: list[0].cost.stepSeconds, rssMaxBytes: Math.round(median(list.map((r) => r.cost.rssMaxBytes).filter(Number.isFinite))), gcPercentOfCpu: Number(median(list.map((r) => (100 * r.cost.gcSeconds) / (r.cost.fitCpuS + r.cost.flightCpuS)).filter(Number.isFinite)).toFixed(1)), heapAfterFullGcMaxBytes: (() => { const v = list.map((r) => r.cost.heapAfterFullGcMaxBytes).filter(Number.isFinite); return v.length ? Math.max(...v) : null; })(), fullGcWindows: list.filter((r) => Number.isFinite(r.cost.heapAfterFullGcMaxBytes)).length, heapBound: list[0].cost.heapBound, arcStates: Math.round(median(list.map((r) => r.arcStates))) }; });
  const summaries = fs.existsSync(STORE) ? fs.readdirSync(STORE).filter((f) => /^cost-.*\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(STORE, f), 'utf8'))) : [];
  return { measures: 'per window: CPU user plus system (OperatingSystemMXBean.getProcessCpuTime) and wall for the fit, per object-day of the arc, and for the flight, per object-day flown at the step named; on a fixed 12 GiB heap (-Xms equal to -Xmx, the same for every window); DSST\'s CPU includes about 3 % spent in garbage collection, part of the JVM\'s real cost (the collection time, the sum of the logged pauses, is in each row; the calibration put it at 3.0 to 3.8 % at 4 to 8 GiB, set by the allocation rate); the JVM\'s resident set sampled once a second during the window (median of each window\'s largest) and the largest heap after a full collection where one occurred (the JVM\'s GC log); the heap DSST needs is the heap-size calibration\'s (DSST.md, amendment 2026-11-06 (heap calibration)); the JVM\'s maximum resident set size per process (/usr/bin/time -l); jar bytes 8,496,500 (Orekit) + 3,055,806 (Hipparchus); one uncounted window warms the JVM; the 1-minute load average before and after each window is in its row', machine: 'Mac Studio, Apple M3 Ultra, 28 cores', singleThread: true, processes: summaries, rows };
}

const tableBytes = (table) => `${JSON.stringify(table, null, 1)}\n`;

function readme(table, cost, rows) {
  const lines = ['# DSST beside SGP4, both XPs, AP and FFM', '', `Registered: \`${table.registered}\`. ${rows.length} DSST rows (${rows.filter((r) => r.failed).length} failed fits, counted; ${rows.filter((r) => r.unscored).length} unscored windows). Median km / 95th percentile km (n) per cell; \`table.json\` carries every column's build, the paired AP-over-DSST ratio with its interval, and the cost rows.`, '',
    `Build: Orekit ${table.builds?.orekit?.version} (${table.builds?.orekit?.sha256?.slice(0, 12)}), Hipparchus ${table.builds?.hipparchus?.version}, ${table.builds?.jvm}, DsstArm.java ${table.builds?.driverSha256?.slice(0, 12)}. Cost rows on ${cost.machine}, single thread.`, '',
    '| Reference | Regime | Fit h | Lead h | ' + Object.keys(table.columns).join(' | ') + ' | AP/DSST median ratio [97.5 % interval of ln] |', '|---|---|---:|---:|' + Object.keys(table.columns).map(() => '---:').join('|') + '|---|'];
  for (const r of table.rows) lines.push(`| ${r.reference} | ${r.regime} | ${r.fit} | ${r.lead} | ${Object.keys(table.columns).map((c) => (r.arms[c] ? `${r.arms[c][0]} / ${r.arms[c][1]} (${r.arms[c][2]})` : '')).join(' | ')} | ${r.apOverDsst ? `${r.apOverDsst.medianRatio} [${r.apOverDsst.interval975.join(', ')}] n ${r.apOverDsst.n}` : ''} |`);
  lines.push('', '## Cost', '', `${cost.measures}.`, '', '| Input | Regime | Fit h | n | Fit CPU s / object-day | Fit wall | Flight CPU s / object-day | Flight wall | Step s | GC % of CPU | Resident set MB | Heap after a full GC MB (windows) |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const c of cost.rows) lines.push(`| ${c.input} | ${c.regime} | ${c.fit} | ${c.n} | ${c.fitCpuSPerObjectDay} | ${c.fitWallSPerObjectDay} | ${c.flightCpuSPerObjectDay} | ${c.flightWallSPerObjectDay} | ${c.stepSeconds} | ${c.gcPercentOfCpu} | ${(c.rssMaxBytes / 1048576).toFixed(0)} | ${c.heapAfterFullGcMaxBytes === null ? '' : `${(c.heapAfterFullGcMaxBytes / 1048576).toFixed(0)} (${c.fullGcWindows})`} |`);
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

/** The commit on origin/main whose subject names a dated amendment, or null: { sha, at }. */
function amendmentAt(name) {
  let line;
  try { line = git('log', '-1', '--fixed-strings', `--grep=${name}`, '--format=%H %ct', 'origin/main', '--', 'experiments/dsst-arm/DSST.md').toString().trim(); } catch { return null; }
  if (!line) return null;
  const [sha, seconds] = line.split(' ');
  return { sha, at: Number(seconds) * 1000 };
}
// The registration each kind of row was written under: accuracy rows after the grid-check amendment, cost rows after the collection-time
// note, the last change to what a cost row records (on the 12 GiB heap of the heap calibration result).
const ACCURACY_REGISTRATION = 'Amendment 2026-11-05 (grid check)', COST_REGISTRATION = 'Note 2026-11-06 (collection time)';

function check() {
  const head = registrationAt('HEAD'), main = registrationAt('origin/main');
  if (!head) fail('DSST.md is not committed');
  if (!head.equal) fail(`${head.differs} differs from HEAD: commit the registration`);
  const set = windowSet();
  const rows = readRows(), costRows = readCostRows();
  const where = main?.equal ? `on origin/main at ${main.sha.slice(0, 12)}` : `committed at ${head.sha.slice(0, 12)}, not yet on origin/main`;
  const digest = set ? `window digest ${set.digest.slice(0, 12)} verified` : 'archive absent: window digest not checked';
  if (!rows.length && !costRows.length) { console.log(`PASS: registered (${where}; ${digest}), no rows`); return; }
  if (!main?.equal) fail('rows exist but the registration is not on origin/main');
  const accuracyAt = amendmentAt(ACCURACY_REGISTRATION), costAt = amendmentAt(COST_REGISTRATION);
  if (rows.length && !accuracyAt) fail(`accuracy rows exist but "${ACCURACY_REGISTRATION}" is not on origin/main`);
  if (costRows.length && !costAt) fail(`cost rows exist but "${COST_REGISTRATION}" is not on origin/main`);
  for (const [list, reg] of [[rows, accuracyAt], [costRows, costAt]]) for (const r of list) {
    if (!set?.keys.has(r.key)) fail(`row ${r.key} is not a registered window`);
    const why = heldKey(r);
    if (why) fail(`row ${r.key} is held (${why})`);
    if (!(Date.parse(r.writtenAt) > reg.at)) fail(`row ${r.key} written ${r.writtenAt}, not after its registration ${reg.sha.slice(0, 12)} (${new Date(reg.at).toISOString()})`);
  }
  const table = { ...buildTable(rows, main), cost: buildCost(costRows) }, file = path.join(RESULTS, 'table.json');
  if (!fs.existsSync(file)) fail('results/dsst-arm/table.json is missing');
  if (fs.readFileSync(file, 'utf8') !== tableBytes(table)) fail('results/dsst-arm/table.json does not reproduce from the stored rows');
  if (fs.readFileSync(path.join(RESULTS, 'README.md'), 'utf8') !== readme(table, table.cost, rows)) fail('results/dsst-arm/README.md does not reproduce from the stored rows');
  console.log(`PASS: registered ${where}; ${rows.length} accuracy rows after ${accuracyAt?.sha.slice(0, 12)} and ${costRows.length} cost rows after ${costAt?.sha.slice(0, 12) ?? '(none)'}; ${digest}; table.json and README.md reproduce; holds kept`);
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
  const runner = /--store\s+ap\/b0411\//.test(rest.join(' ')) ? 'pair-fits.mjs' : 'truth-fits.mjs';
  const r = spawnSync(process.execPath, [path.join(here, runner), ...rest], { stdio: 'inherit', env: process.env });
  process.exit(r.status ?? 1);
} else { console.error('usage: run.mjs fits --store <store> [--workers n] [--cost] | flights | tables | --check'); process.exit(2); }
