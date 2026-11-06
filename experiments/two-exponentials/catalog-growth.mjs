#!/usr/bin/env node
// Catalog growth runner (registration: CATALOG-GROWTH.md, task experiments-catalog-growth-20261106).
// --run    fly the rows from the archive (refuses on a dirty or uncommitted registration)
// --table  write table.json, README.md, chart.json from rows.jsonl
// --check  registration before rows, table reproduces byte for byte, verdicts stated
import { execFileSync, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const REG_REL = 'experiments/two-exponentials/CATALOG-GROWTH.md';
const OUT = path.join(ROOT, 'results/two-exponentials/catalog-growth');
const ARCHIVE = '/opt/data/sdn-archive';
const ZIP = `${ARCHIVE}/historical/space-track-gp-history-1959-2022-11-22/Archives2.zip`;
const GPH = `${ARCHIVE}/spacetrack/gp_history/by-creation`;
const SATCAT = `${ARCHIVE}/spacetrack/satcat/2026/2026-11-05.json.gz`;
const YEARS = Array.from({ length: 27 }, (_, i) => 2000 + i);
const TYPES = ['PAYLOAD', 'ROCKET BODY', 'DEBRIS', 'UNKNOWN', 'ALL'];
const ERAS = [
  { name: '2000-2009', from: 2000, to: 2009 },
  { name: '2010-2017', from: 2010, to: 2017 },
  { name: '2018-2026', from: 2018, to: 2026 },
  { name: '2000-2026', from: 2000, to: 2026 },
];
const MIN_BASE = 20;
const TRIALS = 2000;
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

function registration() {
  const dirty = git(['status', '--porcelain', '--', REG_REL]);
  if (dirty) throw new Error(`registration dirty or uncommitted: ${dirty}`);
  const commit = git(['log', '-1', '--format=%H', '--', REG_REL]);
  if (!commit) throw new Error('registration not committed');
  const blob = git(['hash-object', REG_REL]);
  return { commit, blob };
}

// ---------- extraction ----------
function shard(d4, d5) {
  const pat = `Archives2/sat000${d4}${d5}*.csv`;
  const cmd = `unzip -p '${ZIP}' '${pat}' 2>/dev/null | grep -aE ',(199[9]|20[0-2][0-9])-12-(0[2-9]|[12][0-9]|3[01])T[0-9:.]+,' | awk -F, '{ match($0,/,[0-9]{4}-12-[0-9][0-9]T/); print substr($0,RSTART+1,4)+1, $(NF-6) }' | sort -u`;
  return new Promise((resolve, reject) => {
    execFile('sh', ['-c', cmd], { maxBuffer: 1 << 30 }, (e, out) => (e ? reject(e) : resolve(out)));
  });
}

async function archives2(live) {
  const jobs = [];
  for (const d4 of [0, 1, 2]) for (let d5 = 0; d5 < 10; d5++) jobs.push([d4, d5]);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [d4, d5] = jobs[next++];
      const out = await shard(d4, d5);
      let n = 0;
      for (const line of out.split('\n')) {
        if (!line) continue;
        const [y, id] = line.split(' ');
        const yy = +y;
        if (yy >= 2000 && yy <= 2022) { live[yy].add(+id); n++; }
      }
      console.log(`archives2 shard ${d4}${d5}: ${n} pairs`);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
}

function gpHistory(live) {
  for (const y of [2023, 2024, 2025, 2026]) {
    const lo = `${y - 1}-12-02T00:00:00`;
    const hi = `${y}-01-01T00:00:00`;
    const days = [];
    for (let d = 2; d <= 31; d++) days.push(`${y - 1}-12-${String(d).padStart(2, '0')}`);
    for (let d = 1; d <= 3; d++) days.push(`${y}-01-0${d}`);
    for (const day of days) {
      const f = `${GPH}/${day.slice(0, 4)}/${day}.json.gz`;
      if (!fs.existsSync(f)) throw new Error(`missing gp_history file ${f}`);
      const recs = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());
      for (const r of recs) if (r.EPOCH >= lo && r.EPOCH < hi) live[y].add(+r.NORAD_CAT_ID);
    }
    console.log(`gp_history ${y}: ${live[y].size} live so far`);
  }
}

async function run() {
  const reg = registration();
  fs.mkdirSync(OUT, { recursive: true });
  const sat = JSON.parse(zlib.gunzipSync(fs.readFileSync(SATCAT)).toString());
  const info = new Map();
  for (const r of sat) info.set(+r.NORAD_CAT_ID, { type: r.OBJECT_TYPE, decay: r.DECAY || '' });
  const live = {};
  for (const y of YEARS) live[y] = new Set();
  await archives2(live);
  gpHistory(live);
  const counts = {};
  const unjoined = {};
  for (const y of YEARS) {
    const t = `${y}-01-01`;
    counts[y] = { PAYLOAD: 0, 'ROCKET BODY': 0, DEBRIS: 0, UNKNOWN: 0 };
    unjoined[y] = 0;
    for (const id of live[y]) {
      const s = info.get(id);
      if (s && s.decay && s.decay < t) continue;
      let ty = s ? s.type : 'UNKNOWN';
      if (!s) unjoined[y]++;
      if (!(ty in counts[y])) ty = 'UNKNOWN';
      counts[y][ty]++;
    }
    counts[y].ALL = counts[y].PAYLOAD + counts[y]['ROCKET BODY'] + counts[y].DEBRIS + counts[y].UNKNOWN;
  }
  const base = {};
  for (const ty of TYPES) base[ty] = YEARS.find((y) => counts[y][ty] >= MIN_BASE);
  const rows = [];
  const crows = [];
  for (const y of YEARS) for (const ty of TYPES) {
    const b = base[ty];
    rows.push({ date: `${y}-01-01`, year: y, type: ty, base_year: b, index: y < b ? null : counts[y][ty] / counts[b][ty] });
    crows.push({ date: `${y}-01-01`, type: ty, count: counts[y][ty], unjoined_in_unknown: ty === 'UNKNOWN' ? unjoined[y] : undefined });
  }
  fs.writeFileSync(path.join(OUT, 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'counts.jsonl'), crows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const meta = {
    registration_commit: reg.commit,
    registration_blob: reg.blob,
    runner_sha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    sources: { archives2: ZIP, gp_history: GPH, satcat: SATCAT },
    window_days: 30,
    note: 'counts.jsonl is for the whitepaper only; the site, chart and marketing never read it.',
  };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('rows written', rows.length);
}

// ---------- statistics ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fnv(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function ols(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const b = sxy / sxx;
  const a = my - b * mx;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (y[i] - a - b * x[i]) ** 2;
  const se = Math.sqrt(rss / (n - 2) / sxx);
  return { a, b, rss, se };
}
const aicLin = (n, rss) => n * Math.log(Math.max(rss, 1e-300) / n) + 6;
const aicExp = (n, rss, sumLn) => n * Math.log(Math.max(rss, 1e-300) / n) + 2 * sumLn + 6;
function delta(x, y) {
  const n = x.length;
  const ly = y.map(Math.log);
  const e = ols(x, ly);
  const l = ols(x, y);
  return aicLin(n, l.rss) - aicExp(n, e.rss, ly.reduce((a, b) => a + b, 0));
}
const call = (d) => (d >= 2 ? 'E' : d <= -2 ? 'L' : 'U');

function cell(type, era, series) {
  const pts = series.filter((p) => p.year >= era.from && p.year <= era.to && p.index != null);
  const x = pts.map((p) => p.year - 2000);
  const y = pts.map((p) => p.index);
  const n = x.length;
  const out = { type, era: era.name, n };
  if (n < 4 || y.some((v) => !(v > 0))) return { ...out, verdict: 'undecided', reason: 'insufficient or non-positive points' };
  const ly = y.map(Math.log);
  const e = ols(x, ly);
  const l = ols(x, y);
  const d = aicLin(n, l.rss) - aicExp(n, e.rss, ly.reduce((a, b) => a + b, 0));
  const t = T95[n - 2];
  const bLo = e.b - t * e.se;
  const bHi = e.b + t * e.se;
  const time = e.b === 0 ? null : Math.LN2 / Math.abs(e.b);
  let lo = null, hi = null;
  if (e.b > 0) { lo = bHi > 0 ? Math.LN2 / bHi : null; hi = bLo > 0 ? Math.LN2 / bLo : 'none'; }
  else if (e.b < 0) { lo = bHi < 0 ? Math.LN2 / -bHi : null; hi = bLo < 0 ? Math.LN2 / -bLo : 'none'; }
  const rnd = mulberry32(fnv(`${type}|${era.name}`));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const sdLog = Math.sqrt(e.rss / (n - 2));
  const sdLin = Math.sqrt(l.rss / (n - 2));
  const tally = { te: { E: 0, L: 0, U: 0 }, tl: { E: 0, L: 0, U: 0 } };
  for (let k = 0; k < TRIALS; k++) {
    const ys = x.map((xi) => Math.exp(e.a + e.b * xi + sdLog * gauss()));
    tally.te[call(delta(x, ys))]++;
    let yl, tries = 0;
    do { yl = x.map((xi) => l.a + l.b * xi + sdLin * gauss()); tries++; } while (yl.some((v) => !(v > 0)) && tries < 100);
    tally.tl[yl.some((v) => !(v > 0)) ? 'U' : call(delta(x, yl))]++;
  }
  const p = (v) => Math.round((v / TRIALS) * 1000) / 1000;
  const pc = { exp_true_E: p(tally.te.E), exp_true_L: p(tally.te.L), lin_true_L: p(tally.tl.L), lin_true_E: p(tally.tl.E) };
  let verdict = 'undecided';
  if (d >= 2 && pc.exp_true_E >= 0.8 && pc.lin_true_E <= 0.1) verdict = 'exponential';
  else if (d <= -2 && pc.lin_true_L >= 0.8 && pc.exp_true_L <= 0.1) verdict = 'linear';
  return {
    ...out,
    slope_log: e.b,
    time_years: time,
    time_kind: e.b > 0 ? 'doubling' : e.b < 0 ? 'halving' : 'none',
    time_lo: lo,
    time_hi: hi,
    delta_aic: d,
    pass: pc,
    verdict,
    direction: verdict === 'exponential' ? (e.b > 0 ? 'growth' : 'decline') : null,
  };
}

function build(rows) {
  const series = {};
  for (const ty of TYPES) series[ty] = rows.filter((r) => r.type === ty).sort((a, b) => a.year - b.year);
  const cells = [];
  for (const ty of TYPES) for (const era of ERAS) cells.push(cell(ty, era, series[ty]));
  return { series, cells };
}

const f3 = (v) => (v == null ? '-' : v.toFixed(3));
const f1 = (v) => (v == null ? '-' : typeof v === 'string' ? v : v.toFixed(1));

function render(rows) {
  const { series, cells } = build(rows);
  const table = {
    registration: REG_REL,
    window_days: 30,
    eras: ERAS,
    index_by_year: Object.fromEntries(TYPES.map((ty) => [ty, series[ty].map((r) => ({ year: r.year, base_year: r.base_year, index: r.index }))])),
    cells,
  };
  const chart = {
    note: 'Index only (base year = 1) and doublings (log2 of the index); no count.',
    years: YEARS,
    series: Object.fromEntries(TYPES.map((ty) => [ty, {
      base_year: series[ty][0].base_year,
      points: series[ty].filter((r) => r.index != null).map((r) => ({ year: r.year, index: r.index, doublings: Math.log2(r.index) })),
    }])),
    verdicts: cells.map((c) => ({ type: c.type, era: c.era, verdict: c.verdict, direction: c.direction ?? null, time_kind: c.time_kind ?? null, time_years: c.time_years ?? null, time_lo: c.time_lo ?? null, time_hi: c.time_hi ?? null })),
  };
  const L = [];
  L.push('# Catalog growth: on-orbit index (report-only)');
  L.push('');
  L.push('Registration: `CATALOG-GROWTH.md`. Index = objects with a live element set (epoch within 30 days before 1 January 00:00 UTC, not decayed) relative to the base year (2000 = 1 unless the table states another). `counts.jsonl` holds the counts for the whitepaper only; the site, the chart and marketing never read it.');
  L.push('');
  L.push('## Index by year');
  L.push('');
  L.push(`| Year | ${TYPES.join(' | ')} |`);
  L.push(`|---|${TYPES.map(() => '---').join('|')}|`);
  for (const y of YEARS) L.push(`| ${y} | ${TYPES.map((ty) => f3(series[ty].find((r) => r.year === y).index)).join(' | ')} |`);
  L.push('');
  L.push(`Base year: ${TYPES.map((ty) => `${ty} ${series[ty][0].base_year}`).join(', ')}.`);
  L.push('');
  L.push('## Time per era (95 percent interval) and verdict');
  L.push('');
  L.push('Pass chances: P(E|E) and P(L|E) at a true exponential; P(L|L) and P(E|L) at a true linear (2000 trials per cell).');
  L.push('');
  L.push('| Type | Era | n | Kind | Years | Interval | Delta AIC | P(E\\|E) | P(L\\|E) | P(L\\|L) | P(E\\|L) | Verdict |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of cells) {
    if (!c.pass) { L.push(`| ${c.type} | ${c.era} | ${c.n} | - | - | - | - | - | - | - | - | ${c.verdict} |`); continue; }
    L.push(`| ${c.type} | ${c.era} | ${c.n} | ${c.time_kind} | ${f1(c.time_years)} | ${f1(c.time_lo)} to ${f1(c.time_hi)} | ${c.delta_aic.toFixed(2)} | ${c.pass.exp_true_E} | ${c.pass.exp_true_L} | ${c.pass.lin_true_L} | ${c.pass.lin_true_E} | ${c.verdict}${c.direction ? ` (${c.direction})` : ''} |`);
  }
  L.push('');
  return {
    'table.json': JSON.stringify(table, null, 2) + '\n',
    'README.md': L.join('\n'),
    'chart.json': JSON.stringify(chart, null, 2) + '\n',
  };
}

function readRows() {
  return fs.readFileSync(path.join(OUT, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

function table() {
  const files = render(readRows());
  for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n), c);
  console.log('table written');
}

function check() {
  const fails = [];
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'meta.json'), 'utf8'));
  try {
    const reg = registration();
    if (reg.blob !== meta.registration_blob) fails.push('registration changed after the rows');
    if (reg.commit !== meta.registration_commit) fails.push('registration commit differs from the rows');
    execFileSync('git', ['merge-base', '--is-ancestor', meta.registration_commit, 'HEAD'], { cwd: ROOT });
    const added = git(['log', '--diff-filter=A', '--format=%H', '--', 'results/two-exponentials/catalog-growth/rows.jsonl']).split('\n').filter(Boolean);
    if (added.length) {
      const first = added[added.length - 1];
      execFileSync('git', ['merge-base', '--is-ancestor', meta.registration_commit, first], { cwd: ROOT });
      if (first === meta.registration_commit) fails.push('rows committed in the registration commit');
    }
  } catch (e) { fails.push(`registration order: ${e.message.split('\n')[0]}`); }
  const files = render(readRows());
  for (const [n, c] of Object.entries(files)) {
    const have = fs.existsSync(path.join(OUT, n)) ? fs.readFileSync(path.join(OUT, n), 'utf8') : null;
    if (have !== c) fails.push(`${n} does not reproduce byte for byte`);
  }
  const t = JSON.parse(files['table.json']);
  if (t.cells.length !== TYPES.length * ERAS.length) fails.push('cell count');
  for (const c of t.cells) {
    if (!['exponential', 'linear', 'undecided'].includes(c.verdict)) fails.push(`no verdict ${c.type} ${c.era}`);
    if (c.pass && c.time_kind !== 'none' && c.time_lo === undefined) fails.push(`no interval ${c.type} ${c.era}`);
  }
  for (const f of ['rows.jsonl', 'counts.jsonl']) if (!fs.existsSync(path.join(OUT, f))) fails.push(`missing ${f}`);
  const chart = fs.readFileSync(path.join(OUT, 'chart.json'), 'utf8');
  if (/"count"/.test(chart.replace('no count', ''))) fails.push('chart.json carries a count');
  console.log(fails.length ? `FAIL\n${fails.join('\n')}` : `PASS: ${t.cells.length} cells, verdicts ${[...new Set(t.cells.map((c) => c.verdict))].join('/')}`);
  process.exit(fails.length ? 1 : 0);
}

const mode = process.argv[2];
if (mode === '--run') await run();
else if (mode === '--table') table();
else if (mode === '--check') check();
else { console.error('usage: catalog-growth.mjs --run | --table | --check'); process.exit(2); }
