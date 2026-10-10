#!/usr/bin/env node
// E8 step 90: metrics and REPORT.md from the runs, never typed by hand.
//
//   node .../90-report.mjs --density RUN (2026 test) --historical RUN --propagation RUN[,...] --estimates RUN[,...]
//        [--pools RUN[,...]] [--corrections RUN[,...]] [--destopy RUN (step 25, validation)] [--out results/e8/test]
// Also writes results/e8/calibration-sets/<pool run>.json (NORAD, tier, bin,
// GCAT prior: no element-set-derived quantity) and results/e8/corrections/
// <step 10 run>.json.gz (D5's node values and sigmas, each fit's summary).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config, readRun } from '../common.mjs';
import { densitySummary, forecastRows, holm, medianRatio, propagationSummary, sigmaRatio } from '../score.mjs';

const { values } = parseArgs({ options: { density: { type: 'string' }, historical: { type: 'string' }, propagation: { type: 'string' }, estimates: { type: 'string' },
  destopy: { type: 'string' }, pools: { type: 'string' }, corrections: { type: 'string' }, out: { type: 'string', default: 'results/e8/test' } } });
const list = (x) => (x ?? '').split(',').filter(Boolean);
const selection = JSON.parse(fs.readFileSync(path.join(repoRoot, 'results/e8/selection.json'), 'utf8'));
const K = selection.perBin, S = selection.structure, tau = selection.decayHours;
const tag = `K${K}-${S}`, T = `T${tau ?? 'inf'}`;
const D5a = `D5a-${tag}`, D5f = `D5f-${tag}-${T}`, D5 = `D5-${tag}-${T}`;
const outDir = path.join(repoRoot, values.out);
fs.mkdirSync(outDir, { recursive: true });
const manifests = {};
for (const id of [values.density, values.historical, ...list(values.propagation), ...list(values.estimates), values.destopy].filter(Boolean)) manifests[id] = readRun(id, 'manifest.json');
for (const m of Object.values(manifests)) if (m.config.frozen !== true) throw new Error(`${m.run} ran with an unfrozen config`);
const metrics = { selection: { perBin: K, structure: S, decayHours: tau }, variants: { D5a, D5f, D5 }, runs: { density: values.density, historical: values.historical ?? null,
  propagation: list(values.propagation), estimates: list(values.estimates), destopy: values.destopy ?? null } };

// ── Density, 2026 test ──
const density = readRun(values.density, 'density-rows.json');
if (density.window !== 'test') throw new Error('--density must be a test-window run');
const dV = ['D0', 'D2a', D5a];
metrics.density = { pooled: densitySummary(density.rows, dV), bySatellite: {}, byRegime: {}, forecast: { definitive: {}, operational: {} } };
metrics.density.d5aVsD2a = densitySummary(density.rows, ['D2a', D5a], 'D2a');
for (const t of [...new Set(density.rows.map((r) => r.target))]) metrics.density.bySatellite[t] = densitySummary(density.rows.filter((r) => r.target === t), dV);
for (const [regime] of config.regimes.bins) metrics.density.byRegime[regime] = densitySummary(density.rows.filter((r) => r.regime === regime), dV);
for (const arm of ['definitive', 'operational'])
  for (const bin of config.density.leadBinsDays) metrics.density.forecast[arm][`${bin[0]}-${bin[1]}`] = densitySummary(forecastRows(density.forecastRows, arm, bin, ['D0', 'D2f', D5f]), ['D0', 'D2f', D5f]);

// ── Density, historical (HASDM) ──
if (values.historical) {
  const h = readRun(values.historical, 'density-rows.json');
  const hv = ['D0', 'J', 'D2a', D5a, 'D3'];
  metrics.historical = { pooled: densitySummary(h.rows, hv), bySatellite: {}, byRegime: {}, vsHasdm: densitySummary(h.rows, ['D2a', D5a, 'D3'], 'D3') };
  for (const t of [...new Set(h.rows.map((r) => r.target))]) metrics.historical.bySatellite[t] = densitySummary(h.rows.filter((r) => r.target === t), hv);
  for (const [regime] of config.regimes.bins) metrics.historical.byRegime[regime] = densitySummary(h.rows.filter((r) => r.regime === regime), hv);
}

// ── Propagation ──
const prop = list(values.propagation).flatMap((id) => readRun(id, 'propagation-rows.json').rows);
const arms = { definitive: { rows: prop.filter((r) => r.arm === 'definitive'), variants: ['D0', 'D2', D5] }, operational: { rows: prop.filter((r) => r.arm === 'operational'), variants: ['D0', D5] } };
metrics.propagation = {};
for (const [arm, { rows, variants }] of Object.entries(arms)) {
  const m = metrics.propagation[arm] = { byHorizon: {}, bySatellite: {}, byBand: {} };
  for (const h of config.propagation.horizonsDays) {
    m.byHorizon[h] = { all: propagationSummary(rows, variants, h) };
    for (const [regime] of config.regimes.bins) m.byHorizon[h][regime] = propagationSummary(rows, variants, h, (r) => r.regimes?.[h] === regime);
  }
  for (const norad of [...new Set(rows.map((r) => r.norad))]) m.bySatellite[norad] = propagationSummary(rows, variants, 3, (r) => r.norad === norad);
  for (const band of [...new Set(Object.values(config.propagation.targets).map((t) => t.band))])
    m.byBand[band] = Object.fromEntries(config.propagation.horizonsDays.map((h) => [h, propagationSummary(rows, variants, h, (r) => r.band === band)]));
}
metrics.failures = prop.filter((r) => r.error).map((r) => ({ issue: r.issue, name: r.name, arm: r.arm, variant: r.variant, error: r.error }));

// ── Hypotheses (PLAN.md section 5) ──
const H = config.hypotheses;
const h1 = metrics.density.pooled.variants[D5a]?.reduction;
const h2 = metrics.density.forecast.operational['0-1']?.variants[D5f]?.reduction;
const h3 = metrics.propagation.definitive.byHorizon[3]?.all.variants[D5]?.medianRatio;
const h4 = sigmaRatio(forecastRows(density.forecastRows, 'operational', [0, 1], ['D2f', D5f]), D5f, 'D2f', H.H4.margin);
const h5 = medianRatio(arms.definitive.rows, D5, 'D0', 3, (r) => r.band === H.H5.band, H.H5.margin);
const family = holm([{ id: 'H1', p: h1?.p ?? 1 }, { id: 'H2', p: h2?.p ?? 1 }, { id: 'H3', p: h3?.p ?? 1 }, { id: 'H4', p: h4?.p ?? 1 }, { id: 'H5', p: h5?.p ?? 1 }], config.statistics.holmAlpha);
const verdict = (id) => family.find((t) => t.id === id);
metrics.hypotheses = {
  H1: { statistic: h1, holm: verdict('H1'), supported: !!(verdict('H1').reject && h1?.estimate >= H.H1.minimumReduction) },
  H2: { statistic: h2, holm: verdict('H2'), supported: !!verdict('H2').reject },
  H3: { statistic: h3, holm: verdict('H3'), supported: !!verdict('H3').reject },
  H4: { statistic: h4, margin: H.H4.margin, holm: verdict('H4'), supported: !!verdict('H4').reject },
  H5: { statistic: h5, margin: H.H5.margin, holm: verdict('H5'), supported: !!verdict('H5').reject },
};

// ── Identifiability (step 10 analysis fits) ──
metrics.identifiability = list(values.estimates).map((id) => {
  const r = readRun(id, 'estimates.json');
  return { run: id, window: r.window, mode: r.mode, perBin: r.perBin, structure: r.structure, noPriors: r.noPriors, spans: r.spans.map((s) => {
    const f = s.fits[0];
    const byTier = {};
    for (const o of f.objects) {
      const tier = s.objects.find((x) => String(x.norad) === o.id)?.tier ?? '?';
      (byTier[tier] ??= []).push(o);
    }
    // Aggregates over objects only (per-object quantities stay in runs/).
    const ratio = (xs) => xs.map((o) => Math.log(o.B) - o.lnBPrior.mean).sort((a, b) => a - b);
    const medianOf = (xs) => (xs.length ? xs[Math.floor(xs.length / 2)] : null);
    const withinTwoSigma = (xs) => xs.filter((o) => Math.abs(Math.log(o.B) - o.lnBPrior.mean) <= 2 * o.lnBPrior.sigma).length;
    return { span: s.span, fit: f.fit, objects: f.objects.length, skipped: f.skipped.length, computeSeconds: f.computeSeconds,
      tiers: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, { objects: v.length, medianSigmaM: medianOf(v.map((o) => o.sigmaM).sort((a, b) => a - b)),
        medianLnBMinusPrior: medianOf(ratio(v)), withinTwoPriorSigma: withinTwoSigma(v) }])) };
  }) };
});
// ── Latency, DESTOPy ──
const latencyFile = path.join(repoRoot, 'results/e8/latency.json');
metrics.latency = fs.existsSync(latencyFile) ? JSON.parse(fs.readFileSync(latencyFile, 'utf8')) : null;
if (values.destopy) {
  const d = readRun(values.destopy, 'density-rows.json');
  const v = [...new Set(d.rows.map((r) => r.variant))];
  metrics.destopy = { window: d.window, variants: v, pooled: densitySummary(d.rows, v) };
}
fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
// Calibration sets and corrections, without per-object quantities derived from element sets.
for (const id of list(values.pools)) {
  const p = readRun(id, 'pool.json');
  const sets = { window: p.window, run: id, spans: p.spans.map((s) => ({ span: s.span, S: s.S, poolFrom: s.poolFrom, counts: s.counts,
    bins: s.bins.map((b) => ({ fromKm: b.fromKm, toKm: b.toKm, candidates: b.candidates, rejectedForManoeuvres: b.rejected.length,
      chosen: b.chosen.map((c) => ({ norad: c.norad, name: c.name, type: c.type, tier: c.tier, gcat: c.gcat, lnBPrior: c.prior })) })) })) };
  fs.mkdirSync(path.join(repoRoot, 'results/e8/calibration-sets'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'results/e8/calibration-sets', `${id}.json`), `${JSON.stringify(sets, null, 1)}\n`);
  manifests[id] = readRun(id, 'manifest.json');
}
for (const id of list(values.corrections)) {
  const r = readRun(id, 'estimates.json');
  const out = { run: id, window: r.window, mode: r.mode, perBin: r.perBin, structure: r.structure, noPriors: r.noPriors, spans: r.spans.map((s) => ({ span: s.span,
    fits: s.fits.map((f) => ({ issue: f.issue, fromMjd: f.fromMjd, toMjd: f.toMjd, correction: f.correction, fit: f.fit, objects: f.objects.length, skipped: f.skipped.length,
      setsGiven: f.setsGiven, computeSeconds: f.computeSeconds })) })) };
  fs.mkdirSync(path.join(repoRoot, 'results/e8/corrections'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'results/e8/corrections', `${id}.json.gz`), zlib.gzipSync(JSON.stringify(out)));
  manifests[id] = readRun(id, 'manifest.json');
}
fs.mkdirSync(path.join(repoRoot, 'results/e8/manifests'), { recursive: true });
for (const [id, m] of Object.entries(manifests)) fs.writeFileSync(path.join(repoRoot, 'results/e8/manifests', `${id}.manifest.json`), `${JSON.stringify(m, null, 1)}\n`);

// ── Report ──
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const ci = (b, d = 3) => (b ? `${f(b.estimate, d)} [${f(b.lower, d)}, ${f(b.upper, d)}]` : '—');
const pct = (b) => (b ? `${f(100 * b.estimate, 1)} % [${f(100 * b.lower, 1)}, ${f(100 * b.upper, 1)}]` : '—');
const km = (b) => (b ? `${f(b.estimate / 1000, 2)} [${f(b.lower / 1000, 2)}, ${f(b.upper / 1000, 2)}]` : '—');
const bias = (b) => (b ? `${f(100 * (Math.exp(b.estimate) - 1), 1)} %` : '—');
const label = { D0: 'D0 JB2008 (SET)', D2a: 'D2a E5 stand-in, analysis', D2f: 'D2f E5 stand-in, forecast (zero latency assumed)', D2: 'D2 E5 stand-in',
  [D5a]: `D5a OMM decay, analysis (K=${K}, ${S})`, [D5f]: `D5f OMM decay, forecast (K=${K}, ${S}, τ=${tau ?? '∞'} h)`, [D5]: `D5 OMM decay (K=${K}, ${S}, τ=${tau ?? '∞'} h)`,
  D3: 'D3 HASDM', J: 'J JB2008 as published with the HASDM files' };
const yes = (h) => (metrics.hypotheses[h].supported ? 'yes' : 'no');
const rej = (h) => (verdict(h).reject ? 'reject null' : 'retain null');
const lines = ['# E8 results', '', `Generated by \`experiments/e8-omm-density/steps/90-report.mjs\` from runs ${Object.keys(manifests).map((x) => `\`${x}\``).join(', ')} (manifests in [../manifests](../manifests)). Do not edit by hand. Plan: [PLAN.md](../../../experiments/e8-omm-density/PLAN.md).`, '',
  `Selection (validation window, PLAN.md section 5): ${K} objects per 50-km bin, ${S} structure, decay τ = ${tau ?? '∞ (held)'} h ([selection.json](../selection.json)).`, '',
  '## Hypotheses', '', '| ID | Statistic | Estimate [95 % CI] | One-sided p | Holm | Supported |', '| --- | --- | --- | ---: | --- | --- |',
  `| H1 | 1 − σ(D5a)/σ(D0), density, 2026 test | ${ci(h1)} | ${f(h1?.p, 4)} | ${rej('H1')} | ${yes('H1')} (needs ≥ ${H.H1.minimumReduction}) |`,
  `| H2 | 1 − σ(D5f)/σ(D0), lead 0–1 d, operational drivers | ${ci(h2)} | ${f(h2?.p, 4)} | ${rej('H2')} | ${yes('H2')} |`,
  `| H3 | median e(D5)/e(D0) at 3 d, definitive drivers | ${ci(h3)} | ${f(h3?.p, 4)} | ${rej('H3')} | ${yes('H3')} |`,
  `| H4 | σ(D5f)/σ(D2f), lead 0–1 d, operational drivers (margin ${H.H4.margin}) | ${ci(h4)} | ${f(h4?.p, 4)} | ${rej('H4')} | ${yes('H4')} |`,
  `| H5 | median e(D5)/e(D0) at 3 d, targets ${H.H5.band} (margin ${H.H5.margin}) | ${ci(h5)} | ${f(h5?.p, 4)} | ${rej('H5')} | ${yes('H5')} |`, ''];
const densityTable = (title, s, variants) => {
  if (!s?.cells) return;
  lines.push(`### ${title}`, '', `${s.cells} satellite-days, ${s.satellites} satellites. r = ln(observed / model) of orbit means; bias = exp(mean r) − 1 (model low when positive).`, '',
    '| Variant | Orbit means | Bias | σ(r) [95 % CI] | σ reduction vs reference [95 % CI] |', '| --- | ---: | ---: | --- | --- |');
  for (const v of variants) { const e = s.variants[v]; if (!e) continue; lines.push(`| ${label[v] ?? v} | ${e.n} | ${bias(e.meanLn)} | ${ci(e.sigma)} | ${e.reduction ? pct(e.reduction) : '—'} |`); }
  lines.push('');
};
lines.push('## Density against held-out satellites, 2026 test windows', '');
densityTable('Pooled, analysis mode', metrics.density.pooled, dV);
densityTable('D5a against D2a (reference D2a)', metrics.density.d5aVsD2a, ['D2a', D5a]);
for (const [t, s] of Object.entries(metrics.density.bySatellite)) densityTable(`Held out: ${t}`, s, dV);
for (const [r, s] of Object.entries(metrics.density.byRegime)) densityTable(`Regime: ${r} (largest Kp in the 3 h before the scoring time)`, s, dV);
for (const arm of ['operational', 'definitive']) {
  lines.push(`### Forecast from each issue day, ${arm} drivers (D0 with the same drivers, same pairs)`, '', '| Lead (days) | Pairs | σ(D0) | σ(D2f) | σ(D5f) | D2f reduction [95 % CI] | D5f reduction [95 % CI] |', '| --- | ---: | --- | --- | --- | --- | --- |');
  for (const [k, s] of Object.entries(metrics.density.forecast[arm])) lines.push(`| ${k} | ${s.variants?.D0?.n ?? 0} | ${ci(s.variants?.D0?.sigma)} | ${ci(s.variants?.D2f?.sigma)} | ${ci(s.variants?.[D5f]?.sigma)} | ${pct(s.variants?.D2f?.reduction)} | ${pct(s.variants?.[D5f]?.reduction)} |`);
  lines.push('');
}
if (metrics.historical) {
  lines.push('## Density against HASDM, historical windows (CHAMP, GRACE-A)', '');
  const hv = ['D0', 'J', 'D2a', D5a, 'D3'];
  densityTable('Pooled', metrics.historical.pooled, hv);
  densityTable('Against HASDM (reference D3)', metrics.historical.vsHasdm, ['D2a', D5a, 'D3']);
  for (const [t, s] of Object.entries(metrics.historical.bySatellite)) densityTable(`Held out: ${t}`, s, hv);
  for (const [r, s] of Object.entries(metrics.historical.byRegime)) densityTable(`Regime: ${r}`, s, hv);
}
for (const arm of ['definitive', 'operational']) {
  const m = metrics.propagation[arm], variants = arms[arm].variants;
  lines.push(`## Propagation of held-out LEO satellites, ${arm} drivers (fit 24 h, predict; full force)`, '', 'Median and 95th percentile of the 3D error, km [95 % CI]; ratio = median over arcs of e(variant)/e(D0).', '');
  for (const h of config.propagation.horizonsDays) {
    lines.push(`### ${h} day${h > 1 ? 's' : ''}`, '', '| Regime | Arcs | Variant | Median | 95th percentile | Median ratio to D0 |', '| --- | ---: | --- | --- | --- | --- |');
    for (const regime of ['all', ...config.regimes.bins.map((b) => b[0])]) {
      const s = m.byHorizon[h][regime];
      for (const v of variants) { const e = s?.variants?.[v]; if (!e) continue; lines.push(`| ${regime} | ${s.arcs} | ${label[v] ?? v} | ${km(e.median)} | ${km(e.p95)} | ${e.medianRatio ? ci(e.medianRatio) : '—'} |`); }
    }
    lines.push('');
  }
  lines.push('### By altitude band', '', '| Band | Horizon (d) | Arcs | Variant | Median | Median ratio to D0 |', '| --- | ---: | ---: | --- | --- | --- |');
  for (const [band, byH] of Object.entries(m.byBand)) for (const [h, s] of Object.entries(byH)) for (const v of variants) { const e = s?.variants?.[v]; if (e) lines.push(`| ${band} | ${h} | ${s.arcs} | ${label[v] ?? v} | ${km(e.median)} | ${e.medianRatio ? ci(e.medianRatio) : '—'} |`); }
  lines.push('', '### By satellite, 3 days', '', `| Satellite | Band | Arcs | ${variants.map((v) => `${v === 'D0' ? 'D0' : label[v]?.split(' ')[0] ?? v} median km`).join(' | ')} | ${variants.filter((v) => v !== 'D0').map((v) => `${label[v]?.split(' ')[0] ?? v}/D0`).join(' | ')} |`,
    `| --- | --- | ---: | ${variants.map(() => '---').join(' | ')} | ${variants.filter((v) => v !== 'D0').map(() => '---').join(' | ')} |`);
  for (const [norad, s] of Object.entries(m.bySatellite)) {
    const t = config.propagation.targets[norad];
    lines.push(`| ${t?.name ?? norad} | ${t?.band ?? ''} | ${s.arcs} | ${variants.map((v) => km(s.variants?.[v]?.median)).join(' | ')} | ${variants.filter((v) => v !== 'D0').map((v) => ci(s.variants?.[v]?.medianRatio)).join(' | ')} |`);
  }
  lines.push('');
}
lines.push(`Failed or skipped arcs (rows): ${metrics.failures.length}.`, ...Object.entries(metrics.failures.reduce((a, x) => { const k = `${x.arm}/${x.variant}: ${x.error}`; a[k] = (a[k] ?? 0) + 1; return a; }, {})).map(([k, n]) => `- ${k} (${n})`).slice(0, 25), '');
lines.push('## Identifiability (analysis fits)', '', '| Run | Window | K | Structure | Priors | Objects | Level, K [σ] | Corr(level, mean ln B) | Tier A: median ln(B/prior) | Tier B: median ln(B/prior) |', '| --- | --- | ---: | --- | --- | ---: | --- | ---: | ---: | ---: |');
for (const r of metrics.identifiability) for (const s of r.spans) lines.push(`| ${r.run.replace('e8-omm-density-10-estimate-', '')} | ${s.span.from} | ${r.perBin} | ${r.structure} | ${r.noPriors ? 'none' : 'A, B'} | ${s.objects} | ${s.fit.level.map((l) => `${f(l.meanK, 1)} [${f(l.sigmaK, 1)}]`).join(', ')} | ${f(s.fit.levelLnBCorrelation, 2)} | ${f(s.tiers.A?.medianLnBMinusPrior, 2)} | ${f(s.tiers.B?.medianLnBMinusPrior, 2)} |`);
lines.push('');
if (metrics.latency) {
  const L = metrics.latency;
  lines.push('## Latency', '', '| Input | Statistic | Median | 95th percentile | Max |', '| --- | --- | ---: | ---: | ---: |');
  for (const [w, x] of Object.entries(L.d5).filter(([k]) => k !== 'forecastFitComputeSeconds')) {
    lines.push(`| D5 element sets, ${w} | creation − epoch (h) | ${f(x.creationDelayHours.median, 1)} | ${f(x.creationDelayHours.p95, 1)} | ${f(x.creationDelayHours.max, 1)} |`);
    lines.push(`| D5 element sets, ${w} | newest set's age at t0 (h) | ${f(x.newestSetAgeAtIssueHours.median, 1)} | ${f(x.newestSetAgeAtIssueHours.p95, 1)} | ${f(x.newestSetAgeAtIssueHours.max, 1)} |`);
  }
  lines.push(`| D5 forecast fit | compute (s) | ${f(L.d5.forecastFitComputeSeconds.median, 0)} | ${f(L.d5.forecastFitComputeSeconds.p95, 0)} | ${f(L.d5.forecastFitComputeSeconds.max, 0)} |`);
  for (const [k, x] of Object.entries(L.d2)) lines.push(`| D2 input ${k} | appearance − end of day (d) | ${f(x.appearanceDelayDays.median, 1)} | ${f(x.appearanceDelayDays.p95, 1)} | ${f(x.appearanceDelayDays.max, 1)} |`);
  if (L.drivers.setFreeCopy) lines.push(`| SET JB2008 indices, free copy | release − last data day (d) | ${f(L.drivers.setFreeCopy.lagDays, 1)} | | |`);
  lines.push('');
}
if (metrics.destopy) {
  lines.push(`## Cross-check: DESTOPy (validation window, descriptive)`, '');
  densityTable('Pooled', metrics.destopy.pooled, metrics.destopy.variants);
}
fs.writeFileSync(path.join(outDir, 'REPORT.md'), `${lines.join('\n')}\n`);
console.log(`wrote ${path.relative(repoRoot, outDir)}/REPORT.md`);
