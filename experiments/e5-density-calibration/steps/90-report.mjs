#!/usr/bin/env node
// E5 step 90: metrics and REPORT.md from the runs, never typed by hand.
//
//   node .../90-report.mjs --density RUN_ID (2026 test) [--historical RUN_ID] --propagation RUN_ID[,...] [--out results/e5/<name>]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { densitySummary, holm, propagationSummary } from '../score.mjs';

const { values } = parseArgs({ options: { density: { type: 'string' }, historical: { type: 'string' }, propagation: { type: 'string' }, out: { type: 'string', default: 'results/e5/test' } } });
const read = (id, file) => JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', id, file), 'utf8'));
const selection = JSON.parse(fs.readFileSync(path.join(repoRoot, 'results/e5/selection.json'), 'utf8'));
const L = selection.degree, tau = selection.decayHours;
const D2a = `D2a-L${L}`, D2f = `D2f-L${L}-T${tau ?? 'inf'}`, D2 = `D2-L${L}-T${tau ?? 'inf'}`;
const outDir = path.join(repoRoot, values.out);
fs.mkdirSync(outDir, { recursive: true });
const metrics = { selection: { degree: L, decayHours: tau }, runs: { density: values.density, historical: values.historical ?? null, propagation: values.propagation?.split(',') ?? [] } };
const manifests = {};
for (const id of [values.density, values.historical, ...(values.propagation?.split(',') ?? [])].filter(Boolean)) manifests[id] = read(id, 'manifest.json');
for (const m of Object.values(manifests)) if (m.config.frozen !== true && m.experiment) throw new Error(`${m.run} ran with an unfrozen config`);

// ── Density, 2026 test ──
const density = read(values.density, 'density-rows.json');
if (density.window !== 'test') throw new Error('--density must be a test-window run');
const dVariants = ['D0', 'D1', D2a];
metrics.density = { pooled: densitySummary(density.rows, dVariants), bySatellite: {}, byRegime: {}, forecast: {} };
for (const target of [...new Set(density.rows.map((r) => r.target))]) metrics.density.bySatellite[target] = densitySummary(density.rows.filter((r) => r.target === target), dVariants);
for (const [regime] of config.regimes.bins) metrics.density.byRegime[regime] = densitySummary(density.rows.filter((r) => r.regime === regime), dVariants);
for (const [a, b] of config.density.leadBinsDays) {
  const pairs = density.forecastRows.filter((r) => r.variant === D2f && r.leadDays >= a && r.leadDays < b);
  const rows = pairs.flatMap((r) => [{ target: r.target, day: `${r.issue}|${r.day}`, variant: 'D0', lnRatio: r.lnRatioD0 }, { target: r.target, day: `${r.issue}|${r.day}`, variant: D2f, lnRatio: r.lnRatio }]);
  metrics.density.forecast[`${a}-${b}`] = densitySummary(rows, ['D0', D2f]);
}

// ── Density, historical (HASDM) ──
if (values.historical) {
  const h = read(values.historical, 'density-rows.json');
  const hv = ['D0', 'J', 'D1', D2a, 'D3'];
  metrics.historical = { pooled: densitySummary(h.rows, hv), bySatellite: {}, byRegime: {}, vsHasdm: densitySummary(h.rows, [D2a, 'D3'], 'D3') };
  for (const target of [...new Set(h.rows.map((r) => r.target))]) metrics.historical.bySatellite[target] = densitySummary(h.rows.filter((r) => r.target === target), hv);
  for (const [regime] of config.regimes.bins) metrics.historical.byRegime[regime] = densitySummary(h.rows.filter((r) => r.regime === regime), hv);
}

// ── Propagation ──
const prop = (values.propagation?.split(',') ?? []).flatMap((id) => read(id, 'propagation-rows.json').rows);
const pVariants = ['D0', 'D1', D2];
metrics.propagation = {};
for (const h of config.propagation.horizonsDays) {
  metrics.propagation[h] = { all: propagationSummary(prop, pVariants, h) };
  for (const [regime] of config.regimes.bins) metrics.propagation[h][regime] = propagationSummary(prop, pVariants, h, (r) => r.regimes?.[h] === regime);
}
metrics.propagationBySatellite = {};
for (const norad of [...new Set(prop.map((r) => r.norad))]) metrics.propagationBySatellite[norad] = propagationSummary(prop, pVariants, 3, (r) => r.norad === norad);
metrics.failures = prop.filter((r) => r.error).map((r) => ({ issue: r.issue, name: r.name, variant: r.variant, error: r.error }));

// ── Hypotheses ──
const h1 = metrics.density.pooled.variants[D2a]?.reduction, h2 = metrics.density.forecast['0-1']?.variants[D2f]?.reduction, h3 = metrics.propagation[3]?.all.variants[D2]?.medianRatio;
const family = holm([{ id: 'H1', p: h1?.p ?? 1 }, { id: 'H2', p: h2?.p ?? 1 }, { id: 'H3', p: h3?.p ?? 1 }]);
const verdict = (id) => family.find((t) => t.id === id);
metrics.hypotheses = {
  H1: { statistic: h1, holm: verdict('H1'), supported: !!(verdict('H1').reject && h1?.estimate >= 0.25) },
  H2: { statistic: h2, holm: verdict('H2'), supported: !!verdict('H2').reject },
  H3: { statistic: h3, holm: verdict('H3'), supported: !!verdict('H3').reject },
  H4: metrics.historical ? { sigmaRatioD2aOverHasdm: metrics.historical.vsHasdm } : null,
};
fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
for (const [id, m] of Object.entries(manifests)) fs.writeFileSync(path.join(repoRoot, 'results/e5/manifests', `${id}.manifest.json`), `${JSON.stringify(m, null, 1)}\n`);

// ── Report ──
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ci = (b, d = 3) => (b ? `${f(b.estimate, d)} [${f(b.lower, d)}, ${f(b.upper, d)}]` : '—');
const pct = (b) => (b ? `${f(100 * b.estimate, 1)} % [${f(100 * b.lower, 1)}, ${f(100 * b.upper, 1)}]` : '—');
const km = (b) => (b ? `${f(b.estimate / 1000, 2)} [${f(b.lower / 1000, 2)}, ${f(b.upper / 1000, 2)}]` : '—');
const bias = (b) => (b ? `${f(100 * (Math.exp(b.estimate) - 1), 1)} %` : '—');
const label = { D0: 'D0 JB2008 (SET)', D1: 'D1 NRLMSISE-00', [D2a]: `D2a stand-in, analysis (L=${L})`, [D2f]: `D2f stand-in, forecast (τ=${tau ?? '∞'} h)`, [D2]: `D2 stand-in (L=${L}, τ=${tau ?? '∞'} h)`, D3: 'D3 HASDM', J: 'J JB2008 as published with the HASDM files' };
const lines = [`# E5 results`, '', `Generated by \`experiments/e5-density-calibration/steps/90-report.mjs\` from runs ${Object.keys(manifests).map((x) => `\`${x}\``).join(', ')} (manifests in [../manifests](../manifests)). Do not edit by hand. Plan: [PLAN.md](../../../experiments/e5-density-calibration/PLAN.md).`, '',
  `Selection (validation window, PLAN.md section 5): degree L = ${L}, decay τ = ${tau ?? '∞ (held)'} h ([selection.json](../selection.json)).`, '',
  '## Hypotheses', '', '| ID | Statistic | Estimate [95 % CI] | One-sided p | Holm | Supported |', '| --- | --- | --- | ---: | --- | --- |',
  `| H1 | 1 − σ(D2a)/σ(D0), density, 2026 test | ${ci(h1)} | ${f(h1?.p, 4)} | ${verdict('H1').reject ? 'reject null' : 'retain null'} | ${metrics.hypotheses.H1.supported ? 'yes' : 'no'} (needs ≥ 0.25) |`,
  `| H2 | 1 − σ(D2f)/σ(D0), lead 0–1 d | ${ci(h2)} | ${f(h2?.p, 4)} | ${verdict('H2').reject ? 'reject null' : 'retain null'} | ${metrics.hypotheses.H2.supported ? 'yes' : 'no'} |`,
  `| H3 | median e(D2)/e(D0) at 3 d | ${ci(h3)} | ${f(h3?.p, 4)} | ${verdict('H3').reject ? 'reject null' : 'retain null'} | ${metrics.hypotheses.H3.supported ? 'yes' : 'no'} |`, ''];
const densityTable = (title, s, variants) => {
  lines.push(`### ${title}`, '', `${s.cells} satellite-days, ${s.satellites} satellites. r = ln(observed / model) of orbit means; bias = exp(mean r) − 1 (model low when positive).`, '',
    '| Variant | Orbit means | Bias | σ(r) [95 % CI] | σ reduction vs reference [95 % CI] |', '| --- | ---: | ---: | --- | --- |');
  for (const v of variants) { const e = s.variants[v]; if (!e) continue; lines.push(`| ${label[v] ?? v} | ${e.n} | ${bias(e.meanLn)} | ${ci(e.sigma)} | ${e.reduction ? pct(e.reduction) : '—'} |`); }
  lines.push('');
};
lines.push('## Density against held-out satellites, 2026 test windows', '');
densityTable('Pooled', metrics.density.pooled, dVariants);
for (const [t, s] of Object.entries(metrics.density.bySatellite)) densityTable(`Held out: ${t}`, s, dVariants);
for (const [r, s] of Object.entries(metrics.density.byRegime)) if (s.cells) densityTable(`Regime: ${r} (largest Kp in the 3 h before the scoring time)`, s, dVariants);
lines.push('### Forecast from each issue day (D0 on the same pairs)', '', '| Lead (days) | Pairs | σ(D0) | σ(D2f) | Reduction [95 % CI] |', '| --- | ---: | --- | --- | --- |');
for (const [k, s] of Object.entries(metrics.density.forecast)) lines.push(`| ${k} | ${s.variants.D0?.n ?? 0} | ${ci(s.variants.D0?.sigma)} | ${ci(s.variants[D2f]?.sigma)} | ${pct(s.variants[D2f]?.reduction)} |`);
lines.push('');
if (metrics.historical) {
  lines.push('## Density against HASDM, historical windows (CHAMP, GRACE-A)', '');
  densityTable('Pooled', metrics.historical.pooled, ['D0', 'J', 'D1', D2a, 'D3']);
  for (const [t, s] of Object.entries(metrics.historical.bySatellite)) densityTable(`Held out: ${t}`, s, ['D0', 'J', 'D1', D2a, 'D3']);
  for (const [r, s] of Object.entries(metrics.historical.byRegime)) if (s.cells) densityTable(`Regime: ${r}`, s, ['D0', 'D1', D2a, 'D3']);
  const v = metrics.historical.vsHasdm.variants[D2a];
  lines.push(`H4 (descriptive): σ(D2a) relative to HASDM's, 1 − σ(D2a)/σ(D3) = ${pct(v?.reduction)} (negative: the stand-in spreads more than HASDM).`, '');
}
lines.push('## Propagation of held-out LEO satellites (fit 24 h, predict)', '', 'Median and 95th percentile of the 3D error, km [95 % CI]; ratio = median over arcs of e(variant)/e(D0).', '');
for (const h of config.propagation.horizonsDays) {
  lines.push(`### ${h} day${h > 1 ? 's' : ''}`, '', '| Regime | Arcs | Variant | Median | 95th percentile | Median ratio to D0 |', '| --- | ---: | --- | --- | --- | --- |');
  for (const regime of ['all', ...config.regimes.bins.map((b) => b[0])]) {
    const s = metrics.propagation[h][regime];
    for (const v of pVariants) { const e = s.variants[v]; if (!e) continue; lines.push(`| ${regime} | ${s.arcs} | ${label[v] ?? v} | ${km(e.median)} | ${km(e.p95)} | ${e.medianRatio ? ci(e.medianRatio) : '—'} |`); }
  }
  lines.push('');
}
lines.push('### By satellite, 3 days', '', '| Satellite | Arcs | D0 median km | D1 median km | D2 median km | D2/D0 |', '| --- | ---: | --- | --- | --- | --- |');
for (const [norad, s] of Object.entries(metrics.propagationBySatellite)) {
  const name = config.propagation.targets[norad]?.name ?? norad;
  lines.push(`| ${name} | ${s.arcs} | ${km(s.variants.D0?.median)} | ${km(s.variants.D1?.median)} | ${km(s.variants[D2]?.median)} | ${ci(s.variants[D2]?.medianRatio)} |`);
}
lines.push('', `Failed or skipped arcs: ${metrics.failures.length}.`, ...[...new Set(metrics.failures.map((x) => `- ${x.variant}: ${x.error}`))].slice(0, 15), '');
fs.writeFileSync(path.join(outDir, 'REPORT.md'), `${lines.join('\n')}\n`);
console.log(`wrote ${path.relative(repoRoot, outDir)}/REPORT.md`);
