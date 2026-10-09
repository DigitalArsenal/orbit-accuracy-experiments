#!/usr/bin/env node
// E3 step 20: rank and weight on the train window, build SEL and FUS, compute
// every endpoint (PLAN.md sections 4 and 5), and generate the report from the
// metrics. Statistics only; the errors are step 10's.
//
//   node experiments/e3-combined-catalog/steps/20-evaluate.mjs --train RUN_ID --test RUN_ID --inventory RUN_ID
//        [--resamples N] [--results DIR]
// --dry evaluates a train run as both windows, to check this step before the
// freeze; it writes nothing under results/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { median, quantile, rng } from '../../../harness/stats.mjs';
import { config, configPath } from '../common.mjs';

const { values } = parseArgs({ options: { train: { type: 'string' }, test: { type: 'string' }, inventory: { type: 'string' }, resamples: { type: 'string' }, results: { type: 'string' }, modules: { type: 'string' }, dry: { type: 'boolean' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const run = startRun({ experiment: config.experiment, step: '20-evaluate', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const S = config.statistics;
const resamples = Number(values.resamples ?? S.bootstrapResamples);

const runDir = (id) => path.join(repoRoot, 'runs', id);
const readRun = (id) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir(id), 'manifest.json'), 'utf8'));
  if (!manifest.finished) throw new Error(`${id} did not finish`);
  const lines = (f) => zlib.gunzipSync(fs.readFileSync(path.join(runDir(id), f))).toString().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  run.addInputs('runs', { [`${id}/manifest.json`]: sha256(fs.readFileSync(path.join(runDir(id), 'manifest.json'))) });
  return { id, manifest, metrics: JSON.parse(fs.readFileSync(path.join(runDir(id), 'metrics.json'), 'utf8')), samples: lines('samples.jsonl.gz'), records: lines('records.jsonl.gz') };
};
const train = readRun(values.train);
const test = readRun(values.dry ? values.train : values.test);
if (!values.dry) {
  if (train.metrics.window.name !== 'train' || test.metrics.window.name !== 'test') throw new Error('--train and --test must be step 10 runs of those windows');
  if (!test.manifest.config.frozen) throw new Error(`${test.id} ran on an unfrozen config`);
  for (const r of [train, test]) if (r.manifest.config.sha256 !== run.manifest.config.sha256) throw new Error(`${r.id} used other config bytes`);
}
const inventory = values.inventory ? JSON.parse(fs.readFileSync(path.join(runDir(values.inventory), 'metrics.json'), 'utf8')) : null;

const norm = (e) => Math.hypot(e[0], e[1], e[2]);
const regimes = Object.keys(config.regimes);
const horizons = config.horizonsDays;
const lineageOf = (m) => (m.startsWith('ST') ? config.sources.ST.lineage : config.sources[m]?.lineage ?? config.sources.URA.lineage);

// 5-robust-sigma clip on the 3D error (per group).
function clipMask(errs) {
  const d = errs.map(norm);
  const med = median(d), mad = median(d.map((x) => Math.abs(x - med))) * S.madScale;
  return d.map((x) => !(mad > 0) || Math.abs(x - med) <= S.clipRobustSigma * mad);
}

// ── Calibration on train ──
const group = (samples) => {
  const g = new Map();
  for (const s of samples) {
    if (!s.error) continue;
    const k = `${s.regime}|${s.h}|${s.method}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(s);
  }
  return g;
};
const trainGroups = group(train.samples);
const calibration = {};
for (const [k, list] of trainGroups) {
  const errs = list.map((s) => s.error);
  const keep = clipMask(errs);
  const kept = errs.filter((_, i) => keep[i]);
  calibration[k] = { n: list.length, median3dKm: median(errs.map(norm)), meanSquareRtnKm2: [0, 1, 2].map((a) => kept.reduce((t, e) => t + e[a] * e[a], 0) / kept.length) };
}
const ranking = {};
for (const r of regimes) for (const h of horizons) {
  ranking[`${r}|${h}`] = config.selectionCandidates
    .filter((m) => (calibration[`${r}|${h}|${m}`]?.n ?? 0) >= 30)
    .sort((a, b) => calibration[`${r}|${h}|${a}`].median3dKm - calibration[`${r}|${h}|${b}`].median3dKm);
}

// ── SEL and FUS per (object, issue time, horizon) ──
function combine(samples) {
  const cells = new Map();
  for (const s of samples) {
    if (!s.error) continue;
    const k = `${s.norad}|${s.T}|${s.h}`;
    if (!cells.has(k)) cells.set(k, { regime: s.regime, norad: s.norad, T: s.T, h: s.h, target: s.target, by: {} });
    cells.get(k).by[s.method] = s.error;
  }
  const out = [];
  for (const c of cells.values()) {
    const order = ranking[`${c.regime}|${c.h}`] ?? [];
    const sel = order.find((m) => c.by[m]);
    if (!sel) continue;
    out.push({ ...c, method: 'SEL', error: c.by[sel], chosen: sel });
    // The best-ranked applicable method of each lineage.
    const picks = new Map();
    for (const m of order) if (c.by[m] && !picks.has(lineageOf(m))) picks.set(lineageOf(m), m);
    if (picks.size < 2) { out.push({ ...c, method: 'FUS', error: c.by[sel], chosen: sel }); continue; }
    const fused = [0, 1, 2].map((a) => {
      let w = 0, sum = 0;
      for (const m of picks.values()) { const wi = 1 / calibration[`${c.regime}|${c.h}|${m}`].meanSquareRtnKm2[a]; w += wi; sum += wi * c.by[m][a]; }
      return sum / w;
    });
    out.push({ ...c, method: 'FUS', error: fused, chosen: [...picks.values()].join('+') });
  }
  return out;
}

// ── Statistics with the two-way pigeonhole bootstrap (objects x days) ──
function weightedQuantile(pairs, q) {  // pairs: [value, weight], sorted by value
  const total = pairs.reduce((t, p) => t + p[1], 0);
  let acc = 0;
  for (const [v, w] of pairs) { acc += w; if (acc >= q * total) return v; }
  return pairs.at(-1)?.[0] ?? NaN;
}
function bootstrap(cells, statistic, seed) {
  // cells: [{row, col, values}] ; statistic(weightedCells) -> number
  const rows = [...new Set(cells.map((c) => c.row))], cols = [...new Set(cells.map((c) => c.col))];
  const random = rng(seed);
  const draw = (keys) => { const m = new Map(keys.map((k) => [k, 0])); for (let i = 0; i < keys.length; ++i) { const k = keys[Math.floor(random() * keys.length)]; m.set(k, m.get(k) + 1); } return m; };
  const xs = [];
  for (let b = 0; b < resamples; ++b) {
    const r = draw(rows), c = draw(cols);
    const w = cells.map((cell) => ({ ...cell, weight: r.get(cell.row) * c.get(cell.col) })).filter((x) => x.weight);
    const v = statistic(w);
    if (Number.isFinite(v)) xs.push(v);
  }
  const a = (1 - S.confidence) / 2;
  return { estimate: statistic(cells.map((x) => ({ ...x, weight: 1 }))), lower: quantile(xs, a), upper: quantile(xs, 1 - a), resamples: xs.length };
}
const cellsOf = (list, value) => {
  const m = new Map();
  for (const s of list) {
    const k = `${s.norad}|${s.T.slice(0, 10)}`;
    if (!m.has(k)) m.set(k, { row: s.norad, col: s.T.slice(0, 10), values: [] });
    m.get(k).values.push(value(s));
  }
  return [...m.values()];
};
const quantileStat = (q) => (cells) => weightedQuantile(cells.flatMap((c) => c.values.map((v) => [v, c.weight])).sort((a, b) => a[0] - b[0]), q);

function summarize(list, seed) {
  const errs = list.map((s) => s.error);
  const d = errs.map(norm);
  const keep = clipMask(errs);
  const kept = errs.filter((_, i) => keep[i]);
  const sq = [0, 1, 2].map((a) => kept.reduce((t, e) => t + e[a] * e[a], 0));
  const total = sq[0] + sq[1] + sq[2];
  const cells = cellsOf(list, (s) => norm(s.error));
  return {
    n: list.length, objects: new Set(list.map((s) => s.norad)).size, days: new Set(list.map((s) => s.T.slice(0, 10))).size,
    median3dKm: bootstrap(cells, quantileStat(0.5), seed),
    p95_3dKm: bootstrap(cells, quantileStat(0.95), seed + 1),
    max3dKm: Math.max(...d),
    clippedRmsRtnKm: sq.map((x) => Math.sqrt(x / kept.length)), clipped: list.length - kept.length,
    squaredErrorShareRtn: sq.map((x) => x / total),
  };
}

// Ratio of medians, paired on the cells where both methods exist.
function pairedRatio(list, a, b, seed) {
  const by = new Map();
  for (const s of list) {
    if (s.method !== a && s.method !== b) continue;
    const k = `${s.norad}|${s.T}|${s.h}`;
    if (!by.has(k)) by.set(k, {});
    by.get(k)[s.method] = s;
  }
  const pairs = [...by.values()].filter((p) => p[a] && p[b]);
  if (pairs.length < 10) return { n: pairs.length };
  const m = new Map();
  for (const p of pairs) {
    const k = `${p[a].norad}|${p[a].T.slice(0, 10)}`;
    if (!m.has(k)) m.set(k, { row: p[a].norad, col: p[a].T.slice(0, 10), a: [], b: [] });
    m.get(k).a.push(norm(p[a].error)); m.get(k).b.push(norm(p[b].error));
  }
  const stat = (cells) => {
    const qa = weightedQuantile(cells.flatMap((c) => c.a.map((v) => [v, c.weight])).sort((x, y) => x[0] - y[0]), 0.5);
    const qb = weightedQuantile(cells.flatMap((c) => c.b.map((v) => [v, c.weight])).sort((x, y) => x[0] - y[0]), 0.5);
    return qa / qb;
  };
  return { n: pairs.length, ...bootstrap([...m.values()], stat, seed) };
}

function evaluate(window) {
  const all = [...window.samples.filter((s) => s.error), ...combine(window.samples)];
  const methods = [...new Set(all.map((s) => s.method))];
  const table = [];
  let seed = S.bootstrapSeed;
  for (const r of regimes) for (const h of horizons) for (const m of methods) {
    const list = all.filter((s) => s.regime === r && s.h === h && s.method === m);
    if (!list.length) continue;
    const row = { regime: r, h, method: m, ...summarize(list, seed += 2) };
    if (m === 'SEL' || m === 'FUS') {
      const chosen = {};
      for (const s of list) chosen[s.chosen] = (chosen[s.chosen] ?? 0) + 1;
      row.chosen = chosen;
    }
    table.push(row);
  }
  const ratios = [];
  for (const r of regimes) for (const h of horizons) {
    const list = all.filter((s) => s.regime === r && s.h === h);
    for (const [a, b] of [['SEL', 'ST-latest'], ['FUS', 'SEL'], ['ST-stack3', 'ST-latest'], ['URA-IGS', 'URA'], ['HPOP-URA', 'ST-latest']]) {
      const x = pairedRatio(list, a, b, seed += 2);
      if (x.n) ratios.push({ regime: r, h, a, b, ...x });
    }
  }
  const failures = window.samples.filter((s) => s.failure).length;
  // Space-Track per record, by age from the set's own epoch.
  const records = [];
  for (const r of regimes) for (const a of horizons) {
    const list = window.records.filter((s) => s.regime === r && s.ageDays === a).map((s) => ({ ...s, T: s.epoch, method: 'ST-record' }));
    if (list.length) records.push({ regime: r, ageDays: a, ...summarize(list, seed += 2) });
  }
  return { table, ratios, records, failures, counts: window.metrics.counts, objectsByRegime: window.metrics.objectsByRegime, statedSigmaM: window.metrics.statedSigmaM };
}

const results = { train: evaluate(train), test: evaluate(test) };
const find = (rows, r, h, a, b) => rows.find((x) => x.regime === r && x.h === h && x.a === a && x.b === b);
const T = results.test.ratios;
const d = config.decisions;
const decisions = {};
{
  const rows = d.H1.horizonsDays.map((h) => find(T, d.H1.regime, h, 'SEL', 'ST-latest'));
  decisions.H1 = { rows, supported: rows.every((x) => x && x.upper < d.H1.ratioUpperBelow) };
  const hac = d.H1.hacHorizonsDays.map((h) => find(T, d.H1.regime, h, 'SEL', 'ST-latest'));
  decisions['H1-HAC'] = { rows: hac, supported: hac.every((x) => x && x.upper <= 1 / d.H1.hacFactor) };
  decisions.H2 = { rows: T.filter((x) => x.a === 'FUS' && x.b === 'SEL').map((x) => ({ ...x, supported: x.upper < d.H2.ratioUpperBelow })) };
  decisions.H3 = { rows: T.filter((x) => x.a === 'ST-stack3' && x.b === 'ST-latest').map((x) => ({ ...x, supported: x.upper < d.H3.ratioUpperBelow })) };
  decisions.L1 = { measured: false, reason: 'the CelesTrak capture failed (no response from celestrak.org from this machine)', captures: inventory?.celestrak ?? null };
  decisions['A0.2'] = { multiSampleBins: train.metrics.counts.stMulti + test.metrics.counts.stMulti, missing: train.metrics.counts.stMissing + test.metrics.counts.stMissing, pass: train.metrics.counts.stMulti + test.metrics.counts.stMulti === 0 };
}
const metrics = { runs: { train: train.id, test: test.id, inventory: values.inventory ?? null }, ranking, calibration, decisions, inventory, results };
run.write('metrics.json', metrics);

// ── Report, from the metrics ──
const km = (x) => (!Number.isFinite(x) ? '—' : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x >= 0.01 ? `${(x * 1000).toFixed(0)} m` : x >= 0.001 ? `${(x * 1000).toFixed(1)} m` : `${(x * 1e5).toFixed(1)} cm`);
const ci = (b) => `${km(b.estimate)} [${km(b.lower)}, ${km(b.upper)}]`;
const pct = (x) => `${(x * 100).toFixed(0)} %`;
const ratio = (x) => (x?.estimate === undefined ? '—' : `${x.estimate.toFixed(3)} [${x.lower.toFixed(3)}, ${x.upper.toFixed(3)}] (n ${x.n})`);
const order = ['SEL', 'FUS', 'ST-latest', 'ST-stack3', 'URA', 'HPOP-URA', 'URA-IGS'];
const L = [];
L.push('# E3 results: a catalog combined from several sources', '', `Generated by \`experiments/e3-combined-catalog/steps/20-evaluate.mjs\` from runs \`${train.id}\` (train), \`${test.id}\` (test)${values.inventory ? ` and \`${values.inventory}\` (inventory)` : ''}; evaluation run \`${run.id}\`. Do not edit by hand. Plan: [PLAN.md](../../experiments/e3-combined-catalog/PLAN.md).`, '');
L.push('Errors are km unless marked m; median and 95th percentile of the 3D position error with 95 % two-way (object × day) bootstrap intervals; n is samples (one per object, issue day and horizon).', '');
L.push('## Decisions (test window)', '', '| ID | Result | Detail |', '| --- | --- | --- |');
L.push(`| H1 | ${decisions.H1.supported ? 'SUPPORTED' : 'NOT SUPPORTED'} | GPS, SEL / ST-latest median: ${decisions.H1.rows.map((x, i) => `${d.H1.horizonsDays[i]} d ${ratio(x)}`).join('; ')} |`);
L.push(`| H1-HAC | ${decisions['H1-HAC'].supported ? 'SUPPORTED' : 'NOT SUPPORTED'} | upper bound ≤ ${(1 / d.H1.hacFactor).toFixed(1)} at ${d.H1.hacHorizonsDays.join(' and ')} d |`);
const h2 = decisions.H2.rows;
L.push(`| H2 | ${h2.some((x) => x.supported) ? `SUPPORTED in ${h2.filter((x) => x.supported).map((x) => `${x.regime} ${x.h} d`).join(', ')}` : 'NOT SUPPORTED anywhere'} | FUS / SEL: ${h2.map((x) => `${x.regime} ${x.h} d ${ratio(x)}`).join('; ') || 'no regime with two lineages'} |`);
const h3 = decisions.H3.rows;
L.push(`| H3 | ${h3.filter((x) => x.supported).length} of ${h3.length} regime-horizons | ST-stack3 / ST-latest upper bound < 1 in: ${h3.filter((x) => x.supported).map((x) => `${x.regime} ${x.h} d`).join(', ') || 'none'} |`);
L.push(`| L1 | NOT MEASURED | ${decisions.L1.reason} |`);
if (inventory?.checks?.['A0.1']) L.push(`| A0.1 | ${inventory.checks['A0.1'].pass ? 'PASS' : 'FAIL'} | C04 vs finals2000A conversions: max ${(inventory.checks['A0.1'].maxM * 100).toFixed(1)} cm (limit ${(inventory.checks['A0.1'].limitM * 100).toFixed(0)} cm) |`);
L.push(`| A0.2 | ${decisions['A0.2'].pass ? 'PASS' : 'FAIL'} | ST bins with n ≠ 1: ${decisions['A0.2'].multiSampleBins}; wanted epochs without a sample: ${decisions['A0.2'].missing} |`, '');
for (const [name, res] of [['Test', results.test], ['Train', results.train]]) {
  L.push(`## ${name} window: catalog accuracy by issue horizon`, '');
  for (const r of regimes) {
    const rows = res.table.filter((x) => x.regime === r);
    if (!rows.length) continue;
    L.push(`### ${r} (${res.objectsByRegime[r]?.length ?? 0} objects)`, '', `| Method | ${horizons.map((h) => `${h} d median | ${h} d p95 | n`).join(' | ')} |`, `| --- | ${horizons.map(() => '---: | ---: | ---:').join(' | ')} |`);
    for (const m of order) {
      const cells = horizons.map((h) => rows.find((x) => x.h === h && x.method === m));
      if (cells.every((c) => !c)) continue;
      L.push(`| ${m} | ${cells.map((c) => (c ? `${ci(c.median3dKm)} | ${ci(c.p95_3dKm)} | ${c.n}` : '— | — | 0')).join(' | ')} |`);
    }
    L.push('');
  }
}
L.push('## Where the error is (test, clipped share of squared error, R / T / N)', '', '| Regime | Method | Horizon | R | T | N | Clipped RMS R / T / N |', '| --- | --- | ---: | ---: | ---: | ---: | --- |');
for (const x of results.test.table.filter((x) => ['ST-latest', 'URA', 'HPOP-URA', 'SEL'].includes(x.method))) {
  L.push(`| ${x.regime} | ${x.method} | ${x.h} d | ${pct(x.squaredErrorShareRtn[0])} | ${pct(x.squaredErrorShareRtn[1])} | ${pct(x.squaredErrorShareRtn[2])} | ${x.clippedRmsRtnKm.map(km).join(' / ')} |`);
}
L.push('', '## Paired ratios of medians (test)', '', '| Regime | Horizon | A / B | Ratio [95 %] (n) |', '| --- | ---: | --- | --- |');
for (const x of results.test.ratios) L.push(`| ${x.regime} | ${x.h} d | ${x.a} / ${x.b} | ${ratio(x)} |`);
L.push('', '## Selection (train ranking) and what SEL served on test', '', '| Regime | Horizon | Ranking | SEL served |', '| --- | ---: | --- | --- |');
for (const r of regimes) for (const h of horizons) {
  const row = results.test.table.find((x) => x.regime === r && x.h === h && x.method === 'SEL');
  L.push(`| ${r} | ${h} d | ${(ranking[`${r}|${h}`] ?? []).join(' > ') || '—'} | ${row ? Object.entries(row.chosen).map(([k, v]) => `${k} ${v}`).join(', ') : '—'} |`);
}
L.push('', '## Space-Track per element set, by age from its epoch (test)', '', '| Regime | Age | Median | p95 | n | Objects |', '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const x of results.test.records) L.push(`| ${x.regime} | ${x.ageDays} d | ${ci(x.median3dKm)} | ${ci(x.p95_3dKm)} | ${x.n} | ${x.objects} |`);
L.push('', '## Coverage', '', '| Window | Targets | Without a reference state | ST sets scored | HPOP seeds / failed | Failed samples |', '| --- | ---: | ---: | ---: | --- | ---: |');
for (const [name, res] of [['test', results.test], ['train', results.train]]) {
  const c = res.counts;
  L.push(`| ${name} | ${c.targets} | ${c.targetsWithoutReference} | ${c.stSets} | ${c.hpop.seeds} / ${c.hpop.failures} | ${res.failures} |`);
}
if (inventory?.vimpel) {
  const v = inventory.vimpel;
  L.push('', `Vimpel: ${Object.entries(v.editions).map(([k, e]) => `${k} ${e.rows} rows`).join(', ')}; crosswalk ${v.crosswalkRows} rows (${v.crosswalkNoradIds} catalog numbers), truth objects among them: ${v.truthObjectsInCrosswalk.length}. Not scorable against precise orbits.`);
}
const sig = Object.values(results.test.statedSigmaM ?? {});
if (sig.length) L.push('', `Truth floor: the SLR, Sentinel-1 and Swarm products' stated per-axis sigma, median ${(median(sig) * 100).toFixed(1)} cm, largest ${(Math.max(...sig) * 100).toFixed(1)} cm (${sig.length} products); GNSS finals carry their SP3 accuracy codes, centimetres.`);
L.push('');
const report = `${L.join('\n')}\n`;
run.write('REPORT.md', report);
run.finish({ resamples });
if (values.dry) { log(`dry run: ${run.dir}/REPORT.md`); process.exit(0); }
const out = path.resolve(values.results ?? path.join(repoRoot, 'results', 'e3'));
fs.mkdirSync(path.join(out, run.id), { recursive: true });
for (const f of ['manifest.json', 'metrics.json']) fs.copyFileSync(path.join(run.dir, f), path.join(out, run.id, f));
for (const r of [train, test]) fs.copyFileSync(path.join(runDir(r.id), 'manifest.json'), path.join(out, run.id, `${r.id}.manifest.json`));
if (values.inventory) {
  fs.copyFileSync(path.join(runDir(values.inventory), 'manifest.json'), path.join(out, run.id, `${values.inventory}.manifest.json`));
  fs.copyFileSync(path.join(runDir(values.inventory), 'metrics.json'), path.join(out, run.id, `${values.inventory}.metrics.json`));
}
fs.writeFileSync(path.join(out, 'README.md'), report.replace('](../../experiments/', '](../../experiments/'));
log(`report -> ${path.join(out, 'README.md')}`);
for (const [k, v] of Object.entries(decisions)) log(`${k}: ${v.supported ?? v.pass ?? v.measured}`);
