#!/usr/bin/env node
// E15 metrics (PLAN.md section 6) from the residual rows, and the report generated from them.
//
//   node experiments/e15-aoe-lineage/evaluate.mjs --window train [--select] [--resamples 2000] [--results DIR]
//   node experiments/e15-aoe-lineage/evaluate.mjs --window test --planned-read      (the one test read; lib/windows.mjs)
//
// Train: per regime, horizon and method the median and 95th percentile of the 3D error with pigeonhole intervals (seed
// 20261011), clipped RMS per RTN axis; AOE-latest / ST-latest paired; L2 (median per-object correlation of along-track
// errors at h = 0); the SEL ranking and the FUS weights. --select writes them to results/e15/selection.json, which the
// test read needs. Test: the same tables with SEL and FUS built from that file, and H1, H2.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { sha256 } from '../../harness/modules.mjs';
import { repoRoot, startRun } from '../../harness/provenance.mjs';
import { PATHS } from './settings.mjs';
import { config, configPath, issueDays, selectionPath } from './lib/windows.mjs';
import { readCoverage, readRows } from './lib/rows.mjs';
import { lineageCorrelation, meanSquareRtn, norm, pairedRatio, summarize } from './lib/stats.mjs';
import { median } from '../../harness/stats.mjs';
import { AoeCatalog } from './lib/aoe.mjs';

const { values } = parseArgs({ options: { window: { type: 'string', default: 'train' }, select: { type: 'boolean' }, resamples: { type: 'string' }, results: { type: 'string' }, 'planned-read': { type: 'boolean' }, 'no-results': { type: 'boolean' } } });
const window = values.window;
if (!config.windows[window]) throw new Error(`unknown window ${window}`);
const resamples = Number(values.resamples ?? config.statistics.bootstrapResamples);
const { rows, files } = readRows(window, { plannedRead: values['planned-read'] === true });
const run = startRun({ experiment: config.experiment, step: `evaluate-${window}`, configPath, modulesDir: PATHS.scoreModules, args: values });
run.addInputs('rows', Object.fromEntries(files.map((f) => [f, sha256(fs.readFileSync(path.join(PATHS.rows, f)))])));
const log = (...a) => console.log(`[${run.id}]`, ...a);
const label = window === 'train' ? 'TRAIN' : 'TEST';

const regimes = Object.keys(config.regimes);
const horizons = config.horizonsDays;
const samples = rows.filter((r) => r.rtnKm);
const group = (list) => {
  const g = {};
  for (const s of list) ((g[`${s.regime}|${s.h}`] ??= {})[s.method] ??= []).push(s);
  return g;
};

// ── Selection and weights: from this window when it is train, else from the committed selection ──
function calibrate(list) {
  const g = group(list);
  const ranking = {}, weights = {}, lineage = {};
  for (const r of regimes) {
    lineage[r] = lineageCorrelation(Object.fromEntries(['AOE-latest', 'ST-latest'].map((m) => [m, list.filter((s) => s.regime === r && s.method === m)])));
    for (const h of horizons) {
      const by = g[`${r}|${h}`] ?? {};
      const cands = config.methods.SEL.candidates.filter((m) => (by[m]?.length ?? 0) >= config.methods.SEL.minimumTrainSamples)
        .map((m) => ({ m, median3dKm: median(by[m].map((s) => norm(s.rtnKm))), n: by[m].length })).sort((a, b) => a.median3dKm - b.median3dKm);
      ranking[`${r}|${h}`] = cands.length ? cands : [{ m: config.methods.SEL.default, default: true }];
      weights[`${r}|${h}`] = Object.fromEntries(config.methods.FUS.inputs.filter((m) => by[m]?.length).map((m) => [m, { n: by[m].length, meanSquareRtnKm2: meanSquareRtn(by[m].map((s) => s.rtnKm)) }]));
    }
  }
  return { ranking, weights, lineage };
}
const selection = window === 'train' ? { window: 'train', ...calibrate(samples) } : JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
if (window !== 'train') run.addInputs('selection', { [config.testRead.selection]: sha256(fs.readFileSync(selectionPath)) });

// SEL and FUS per (object, issue, horizon) cell.
function combine(list) {
  const cells = new Map();
  for (const s of list) {
    const k = `${s.norad}|${s.issue}|${s.h}`;
    if (!cells.has(k)) cells.set(k, { regime: s.regime, norad: s.norad, issue: s.issue, h: s.h, by: {} });
    cells.get(k).by[s.method] = s.rtnKm;
  }
  const out = [];
  for (const c of cells.values()) {
    const order = (selection.ranking[`${c.regime}|${c.h}`] ?? []).map((x) => x.m);
    const sel = order.find((m) => c.by[m]);
    if (!sel) continue;
    out.push({ ...c, method: 'SEL', rtnKm: c.by[sel], chosen: sel });
    const w = selection.weights[`${c.regime}|${c.h}`] ?? {};
    const inputs = config.methods.FUS.inputs.filter((m) => c.by[m] && w[m]);
    if (selection.lineage[c.regime]?.holds !== true || inputs.length < 2) { out.push({ ...c, method: 'FUS', rtnKm: c.by[sel], chosen: sel }); continue; }
    const fused = [0, 1, 2].map((a) => {
      let wsum = 0, sum = 0;
      for (const m of inputs) { const wi = 1 / w[m].meanSquareRtnKm2[a]; wsum += wi; sum += wi * c.by[m][a]; }
      return sum / wsum;
    });
    out.push({ ...c, method: 'FUS', rtnKm: fused, chosen: inputs.join('+') });
  }
  return out;
}

const all = [...samples, ...combine(samples)];
const g = group(all);
const methods = ['AOE-latest', 'ST-latest', 'SEL', 'FUS', 'SupGP-latest'];
const table = [];
const ratios = [];
let seed = config.statistics.bootstrapSeed;
for (const r of regimes) for (const h of horizons) {
  const by = g[`${r}|${h}`] ?? {};
  for (const m of methods) {
    if (!by[m]?.length) continue;
    const row = { regime: r, h, method: m, ...summarize(by[m], seed += 2, resamples) };
    if (m === 'SEL' || m === 'FUS') { row.chosen = {}; for (const s of by[m]) row.chosen[s.chosen] = (row.chosen[s.chosen] ?? 0) + 1; }
    table.push(row);
  }
  for (const [a, b] of [['AOE-latest', 'ST-latest'], ['SEL', 'ST-latest'], ['SEL', 'AOE-latest'], ['FUS', 'SEL'], ['SupGP-latest', 'ST-latest'], ['SupGP-latest', 'AOE-latest']]) {
    const x = pairedRatio(by, a, b, seed += 2, resamples);
    if (x.n) ratios.push({ regime: r, h, a, b, ...x });
  }
}

// ── Descriptive: error by age from the set's epoch, coverage, AOE availability ──
const bins = config.statistics.ageBinsDays;
const byAge = [];
for (const r of regimes) for (const m of ['AOE-latest', 'ST-latest']) for (let i = 0; i + 1 < bins.length; ++i) {
  const list = samples.filter((s) => s.regime === r && s.method === m && s.ageDays >= bins[i] && s.ageDays < bins[i + 1]);
  if (list.length) byAge.push({ regime: r, method: m, ageDays: [bins[i], bins[i + 1]], n: list.length, objects: new Set(list.map((s) => s.norad)).size, median3dKm: median(list.map((s) => norm(s.rtnKm))) });
}
const inWindow = new Set(issueDays(window));
const coverageFiles = readCoverage().filter((c) => Object.keys(c.counts?.byIssue ?? {}).some((k) => inWindow.has(k.split('|')[0])));
const coverage = {};
for (const c of coverageFiles) {
  const k = coverage[c.regime] ??= { truthObjects: new Set(), inAoe: new Set(), inSt: new Set(), inBoth: new Set(), targets: [] };
  for (const n of c.counts.truthObjects ?? []) k.truthObjects.add(n);
  for (const n of c.counts.inAoe ?? []) k.inAoe.add(n);
  for (const n of c.counts.inSt ?? []) k.inSt.add(n);
  for (const n of c.counts.inBoth ?? []) k.inBoth.add(n);
  k.targets.push({ targetDay: c.targetDay, source: c.source, truthItems: c.truth?.items ?? null, scoredObjects: c.counts.scoredObjects, rows: c.rows, failures: c.failures });
}
const coverageOut = Object.fromEntries(Object.entries(coverage).map(([r, k]) => [r, {
  truthObjects: k.truthObjects.size, aoeOnly: [...k.inAoe].filter((n) => !k.inSt.has(n)).length, stOnly: [...k.inSt].filter((n) => !k.inAoe.has(n)).length, both: k.inBoth.size, neither: [...k.truthObjects].filter((n) => !k.inAoe.has(n) && !k.inSt.has(n)).length, targets: k.targets,
}]));
const availability = {};
for (const c of coverageFiles) for (const [k, v] of Object.entries(c.counts.byIssue ?? {})) {
  const [issue, h] = k.split('|');
  if (!inWindow.has(issue)) continue;
  const a = availability[`${c.regime}|${issue}|${h}`] ??= { regime: c.regime, issue, h: Number(h), AOE: 0, ST: 0, both: 0, aoeNotRetrievedByT: 0 };
  for (const f of ['AOE', 'ST', 'both', 'aoeNotRetrievedByT']) a[f] += v[f];
}
// AOE's snapshots: completeness against the site's own total.
const aoe = new AoeCatalog(issueDays(window)[0], issueDays(window).at(-1));
const snapshots = aoe.describe().map((s) => ({ day: s.day, complete: s.run.complete, records: s.counts.records, siteTotal: s.run.siteTotal, unrenderable: s.run.unrenderable.length, aoeOnly: s.counts.aoeOnly, rejected: s.counts.rejected, checksumMismatches: s.counts.checksumMismatches, retrieval: s.retrieval }));

const metrics = { label, window, issueDays: [...inWindow], rows: rows.length, samples: samples.length, failures: rows.filter((r) => r.failure).length, selection: window === 'train' ? selection : { file: config.testRead.selection }, table, ratios, byAge, coverage: coverageOut, availability: Object.values(availability), snapshots };
if (window === 'test') {
  const find = (r, h, a, b) => ratios.find((x) => x.regime === r && x.h === h && x.a === a && x.b === b);
  metrics.decisions = {
    H1: ratios.filter((x) => x.a === 'AOE-latest' && x.b === 'ST-latest').map((x) => ({ ...x, supported: x.upper < 1 || x.lower > 1, direction: x.estimate < 1 ? 'AOE better' : 'ST better' })),
    H2: regimes.flatMap((r) => horizons.map((h) => {
      // The best single method: the one with the lower paired median in this window.
      const ast = find(r, h, 'AOE-latest', 'ST-latest');
      const best = ast?.estimate < 1 ? 'AOE-latest' : 'ST-latest';
      const sel = find(r, h, 'SEL', best), fus = find(r, h, 'FUS', 'SEL');
      return { regime: r, h, best, selOverBest: sel ?? null, fusOverSel: fus ?? null, selSupported: sel ? sel.upper < config.decisions.H2.selOverBestUpperBelow : null, fusSupported: selection.lineage[r]?.holds === true && fus ? fus.upper < config.decisions.H2.fusOverSelUpperBelow : null };
    })),
    L2: selection.lineage,
  };
}
run.write('metrics.json', metrics);
if (values.select) {
  if (window !== 'train') throw new Error('--select needs the train window');
  const sel = { generated: run.id, window: 'train', issueDays: [...inWindow], rows: files.length, targetsIncluded: coverageFiles.map((c) => `${c.targetDay}.${c.source}`), ranking: selection.ranking, weights: selection.weights, lineage: selection.lineage };
  fs.mkdirSync(path.dirname(selectionPath), { recursive: true });
  fs.writeFileSync(selectionPath, `${JSON.stringify(sel, null, 1)}\n`);
  log(`selection -> ${path.relative(repoRoot, selectionPath)}`);
}

// ── Report, from the metrics ──
const km = (x) => (!Number.isFinite(x) ? '—' : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x >= 0.01 ? `${(x * 1000).toFixed(0)} m` : `${(x * 1000).toFixed(1)} m`);
const ci = (b) => `${km(b.estimate)} [${km(b.lower)}, ${km(b.upper)}]`;
const ratio = (x) => (x?.estimate === undefined ? '—' : `${x.estimate.toFixed(3)} [${x.lower.toFixed(3)}, ${x.upper.toFixed(3)}] (n ${x.n})`);
const pct = (x) => `${(x * 100).toFixed(0)} %`;
const L = [];
L.push(`# E15 results (${label}): AOE as a second lineage`, '', `Generated by \`experiments/e15-aoe-lineage/evaluate.mjs\` (run \`${run.id}\`) from ${files.length} residual-row files; do not edit by hand. Plan: [PLAN.md](../../experiments/e15-aoe-lineage/PLAN.md).`, '');
L.push(`**${label}** window, issue days ${[...inWindow][0]} to ${[...inWindow].at(-1)}, issue time ${config.issueTimeUtc} UTC. Errors are km unless marked m: median and 95th percentile of the 3D position error against the reference orbit, with 95 % two-way (object × day) bootstrap intervals (${resamples} resamples, seed ${config.statistics.bootstrapSeed}); n is samples (one per object, issue day and horizon).`, '');
L.push('## AOE-latest / ST-latest (paired, ratio of medians)', '', '| Regime | Horizon | Ratio [95 %] (n) | Objects |', '| --- | ---: | --- | ---: |');
for (const x of ratios.filter((x) => x.a === 'AOE-latest' && x.b === 'ST-latest')) L.push(`| ${x.regime} | ${x.h} d | ${ratio(x)} | ${x.objects} |`);
L.push('', '## L2: is AOE a lineage independent of Space-Track?', '', `Median per-object Pearson correlation of along-track errors, AOE-latest against ST-latest, h = 0, objects with at least ${config.decisions.L2.minimumPairsPerObject} paired issue days; L2 holds below ${config.decisions.L2.medianCorrelationBelow}.`, '', '| Regime | Objects | Median r | Quartiles | L2 |', '| --- | ---: | ---: | --- | --- |');
for (const r of regimes) { const x = selection.lineage[r]; if (!x || !x.objectsWithPairs) continue; L.push(`| ${r} | ${x.objects} (of ${x.objectsWithPairs} with pairs) | ${Number.isFinite(x.median) ? x.median.toFixed(3) : '—'} | ${x.quartiles ? x.quartiles.map((q) => q.toFixed(2)).join(' to ') : '—'} | ${x.holds === null ? 'not measured' : x.holds ? 'holds' : 'does not hold'} |`); }
L.push('');
for (const r of regimes) {
  const rows_ = table.filter((x) => x.regime === r);
  if (!rows_.length) continue;
  L.push(`## ${r}`, '', `| Method | ${horizons.map((h) => `${h} d median | ${h} d p95 | n / obj`).join(' | ')} |`, `| --- | ${horizons.map(() => '---: | ---: | ---:').join(' | ')} |`);
  for (const m of methods) {
    const cells = horizons.map((h) => rows_.find((x) => x.h === h && x.method === m));
    if (cells.every((c) => !c)) continue;
    L.push(`| ${m} | ${cells.map((c) => (c ? `${ci(c.median3dKm)} | ${ci(c.p95_3dKm)} | ${c.n} / ${c.objects}` : '— | — | 0')).join(' | ')} |`);
  }
  L.push('', '| Method | Horizon | Clipped RMS R / T / N | Share R / T / N |', '| --- | ---: | --- | --- |');
  for (const x of rows_.filter((x) => x.method === 'AOE-latest' || x.method === 'ST-latest')) L.push(`| ${x.method} | ${x.h} d | ${x.clippedRmsRtnKm.map(km).join(' / ')} | ${x.squaredErrorShareRtn.map(pct).join(' / ')} |`);
  L.push('');
}
L.push('## Coverage of the scored regimes', '', '| Regime | Truth objects | Both catalogs | AOE only | ST only | Neither |', '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const [r, c] of Object.entries(coverageOut)) L.push(`| ${r} | ${c.truthObjects} | ${c.both} | ${c.aoeOnly} | ${c.stOnly} | ${c.neither} |`);
L.push('', '## AOE snapshots', '', '| Day | Records | Site total | Complete | Unrenderable boxes | AOE-only ids | Rejected | Retrieved (UTC) |', '| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |');
for (const s of snapshots) L.push(`| ${s.day} | ${s.records} | ${s.siteTotal ?? '—'} | ${s.complete ? 'yes' : 'no'} | ${s.unrenderable} | ${s.aoeOnly} | ${s.rejected} | ${s.retrieval.firstUtc?.slice(11, 16)} to ${s.retrieval.lastUtc?.slice(11, 16)} |`);
L.push('', '## Error by age from the set\'s epoch (median 3D)', '', '| Regime | Method | Age (d) | Median | n | Objects |', '| --- | --- | --- | ---: | ---: | ---: |');
for (const x of byAge) L.push(`| ${x.regime} | ${x.method} | ${x.ageDays[0]}–${x.ageDays[1]} | ${km(x.median3dKm)} | ${x.n} | ${x.objects} |`);
L.push('');
const report = `${L.join('\n')}\n`;
run.write('REPORT.md', report);
run.finish({ resamples });
log(`${samples.length} samples, ${rows.length - samples.length} rows without a sample -> ${run.dir}/REPORT.md`);
if (!values['no-results']) {
  const out = path.resolve(values.results ?? path.join(repoRoot, 'results', 'e15'));
  fs.mkdirSync(path.join(out, run.id), { recursive: true });
  for (const f of ['manifest.json', 'metrics.json']) fs.copyFileSync(path.join(run.dir, f), path.join(out, run.id, f));
  fs.writeFileSync(path.join(out, 'README.md'), report);
  log(`report -> ${path.join(out, 'README.md')}`);
}
