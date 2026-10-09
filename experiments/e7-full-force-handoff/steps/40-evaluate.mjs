#!/usr/bin/env node
// E7 step 40 (PLAN.md section 6): statistics, classes and the answer to the
// owner's question from one step-20 batch; writes results/e7/<window>/
// metrics.json and REPORT.md (generated, never typed) with the shard
// manifests.
//
//   node experiments/e7-full-force-handoff/steps/40-evaluate.mjs --window test --batch ID [--resamples N]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { config } from '../common.mjs';
import { answerOf, axes, bootstrap, classOf, loadBatch, medianOf, norm, p95Of, paired, ratioOf } from '../analysis.mjs';

const { values } = parseArgs({ options: { window: { type: 'string', default: 'test' }, batch: { type: 'string' }, resamples: { type: 'string' } } });
const { rows, manifests, runs } = loadBatch(values.window, values.batch);
const statistics = { resamples: Number(values.resamples ?? config.statistics.bootstrapResamples), seed: config.statistics.bootstrapSeed, confidence: config.statistics.confidence };
const H = config.horizonsHours;
const comparisons = [
  ['H-epoch', 'S'], ['H-arc', 'S'], ['H-epoch-E1', 'S'], ['H-arc-E1', 'S'], ['S-E1', 'S'], ['H-truth', 'S'],
  ['H-arc', 'H-epoch'], ['H-epoch-E1', 'H-epoch'], ['H-arc-E1', 'H-arc'], ['H-arc-E1', 'H-epoch-E1'],
  ['H-epoch-NRLMSISE', 'H-epoch'], ['H-epoch-persist', 'H-epoch'], ['H-truth', 'H-epoch'],
];
const order = ['S', 'S-E1', 'H-epoch', 'H-epoch-E1', 'H-arc', 'H-arc-E1', 'H-truth', 'H-epoch-NRLMSISE', 'H-epoch-persist'];
const rank = (v) => { const i = order.indexOf(v.replace(/:.*/, '')); return (i < 0 ? 99 : i) * 100 + (v.includes(':') ? 1 : 0); };

const metrics = { window: values.window, batch: values.batch, runs, freezeCommit: manifests[0].freezeCommit ?? null, statistics, horizonsHours: H, regimes: {} };
for (const regime of Object.keys(config.regimes)) {
  const mine = rows.filter((r) => r.regime === regime);
  if (!mine.length) continue;
  const variants = [...new Set(mine.flatMap((r) => [...Object.keys(r.errors), ...Object.keys(r.failures)]))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const out = { samples: mine.length, objects: new Set(mine.map((r) => r.norad)).size, variants: {}, comparisons: [], fits: {}, failures: {}, coefficients: {} };
  for (const v of variants) {
    const failures = mine.filter((r) => r.failures[v]);
    out.failures[v] = { count: failures.length, reasons: Object.entries(failures.reduce((a, r) => { const k = r.failures[v].replace(/\(.*?\)/g, '()').slice(0, 80); a[k] = (a[k] ?? 0) + 1; return a; }, {})) };
    out.variants[v] = H.map((h, k) => {
      const s = paired(mine, regime, [v], k);
      if (s.length < 3) return { h, n: s.length };
      const ci = bootstrap(s, { median: medianOf(0), p95: p95Of(0) }, statistics);
      return { h, n: s.length, objects: new Set(s.map((x) => x.norad)).size, median: ci.median, p95: ci.p95, axes: axes(s.map((x) => x.errors[0])) };
    });
  }
  const pairs = [...comparisons.filter(([a, b]) => variants.includes(a) && variants.includes(b)),
    ...variants.filter((v) => v.startsWith('H-epoch:') || /^H-arc(-E1)?:/.test(v)).map((v) => [v, 'S'])];
  for (const [v, c] of pairs) {
    const byH = H.map((h, k) => {
      const s = paired(mine, regime, [v, c], k);
      if (s.length < 3) return { h, n: s.length };
      const ci = bootstrap(s, { ratio: ratioOf(0, 1), ratio95: ratioOf(0, 1, 0.95), medianV: medianOf(0), medianC: medianOf(1) }, statistics);
      return { h, n: s.length, objects: new Set(s.map((x) => x.norad)).size, ...ci, class: classOf(ci.ratio) };
    });
    const classes = Object.fromEntries(byH.filter((x) => x.class).map((x) => [x.h, x.class]));
    out.comparisons.push({ variant: v, comparator: c, horizons: byH, answer: c === 'S' ? answerOf(classes) : null });
  }
  for (const v of variants.filter((x) => x.startsWith('H-arc'))) {
    const fits = mine.map((r) => r.fits[v]).filter(Boolean);
    if (!fits.length) continue;
    const params = fits.filter((f) => f.converged && f.parameters?.length).map((f) => f.parameters[0]);
    out.fits[v] = { attempted: fits.length, converged: fits.filter((f) => f.converged).length, medianIterations: median(fits.map((f) => f.iterations ?? 0)),
      medianSets: median(fits.map((f) => f.sets)), medianReducedChiSquare: median(fits.filter((f) => f.converged).map((f) => f.reducedChiSquare)),
      parameter: config.regimes[regime].arcParameters[0]?.kind ?? null, medianParameter: params.length ? median(params) : null,
      parameterQuartiles: params.length ? [0.25, 0.75].map((q) => { const s = [...params].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))]; }) : null };
  }
  const coef = mine.map((r) => r.coefficients).filter(Boolean);
  out.coefficients = { medianAgom: median(coef.map((c) => c.agom)), medianBstarB: median(coef.map((c) => c.bstarB)), medianNominalB: median(coef.map((c) => c.nominalB)),
    negativeBstar: coef.filter((c) => c.bstar < 0).length, samples: coef.length };
  out.seconds = Object.fromEntries(variants.map((v) => [v, median(mine.map((r) => r.seconds?.[v]).filter((x) => x !== undefined))]));
  metrics.regimes[regime] = out;
  console.log(`${regime}: ${mine.length} samples`);
}
const m0 = manifests[0];
metrics.provenance = {
  repository: m0.repository, modulesRepository: m0.modulesRepository, modules: m0.modules, packages: m0.packages,
  config: m0.config, chosen: config.chosen, inputs: Object.fromEntries(Object.entries(m0.inputs).filter(([k]) => !['gpHistory', 'reference'].includes(k))),
  gpHistoryFiles: new Set(manifests.flatMap((m) => Object.keys(m.inputs.gpHistory ?? {}))).size,
  referenceFiles: new Set(manifests.flatMap((m) => Object.keys(m.inputs.reference ?? {}))).size,
};

// ── Report ──
const fmt = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x >= 1000 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
const ci = (c) => (c ? `${fmt(c.estimate)} [${fmt(c.lower)}, ${fmt(c.upper)}]` : '—');
const rci = (c) => (c ? `${c.estimate.toFixed(2)} [${c.lower.toFixed(2)}, ${c.upper.toFixed(2)}]` : '—');
const hLabel = (h) => (h === 168 ? '7 d' : `${h} h`);
const L = [];
L.push(`# E7 results: ${values.window}`, '');
L.push('Generated by `experiments/e7-full-force-handoff/steps/40-evaluate.mjs` from the runs listed in `metrics.json`. Do not edit by hand.', '');
L.push(`Batch \`${values.batch}\` (${runs.length} shards); freeze commit ${metrics.freezeCommit ? `\`${metrics.freezeCommit}\`` : '— (not the test window)'}; modules \`${m0.modulesRepository.commit}\`${m0.modulesRepository.dirty ? ' (dirty)' : ''}; propagator/hpop WASM SHA-256 \`${m0.modules.find((m) => m.path === 'propagator/hpop')?.wasmSha256}\`.`, '');
L.push(`Intervals: 95 % percentile, two-way (object × UTC day) pigeonhole bootstrap, ${statistics.resamples} resamples, seed ${statistics.seed}. Ratio ρ = median 3D(variant) / median 3D(comparator) on paired samples; *meaningfully better*: upper bound < ${config.decision.meaningfulRatioBelow}; *better*: < 1; *worse*: lower bound > 1.`, '');
L.push('## The question: does full-force HPOP from the OMM improve on SGP4 over 0–7 days?', '');
L.push(`Answer per regime (PLAN.md section 6): **yes** if meaningfully better than S at ${config.decision.horizonsHours.map(hLabel).join(', ')}; **partly** if meaningfully better at some and worse at none; **no** otherwise.`, '');
L.push('| Regime | Variant | Answer | ' + H.map(hLabel).join(' | ') + ' |', '| --- | --- | --- | ' + H.map(() => '---').join(' | ') + ' |');
for (const [regime, r] of Object.entries(metrics.regimes)) {
  for (const c of r.comparisons.filter((x) => x.comparator === 'S' && ['H-epoch', 'H-arc', 'H-epoch-E1', 'H-arc-E1'].includes(x.variant))) {
    L.push(`| ${regime} | ${c.variant} | **${c.answer}** | ${c.horizons.map((x) => (x.ratio ? `${x.ratio.estimate.toFixed(2)} (${x.class})` : '—')).join(' | ')} |`);
  }
}
L.push('', 'Cells: ρ against S, and its class.', '');
for (const [regime, r] of Object.entries(metrics.regimes)) {
  L.push(`## ${regime}`, '', `${r.samples} samples, ${r.objects} objects. Force model: ${JSON.stringify(config.regimes[regime].forces)}.`, '');
  L.push('### Median 3D error, m [95 % interval]', '', '| Variant | ' + H.map(hLabel).join(' | ') + ' |', '| --- | ' + H.map(() => '---:').join(' | ') + ' |');
  for (const [v, hs] of Object.entries(r.variants)) L.push(`| ${v} | ${hs.map((x) => (x.median ? ci(x.median) : '—')).join(' | ')} |`);
  L.push('', '### 95th percentile of the 3D error, m [95 % interval]', '', '| Variant | ' + H.map(hLabel).join(' | ') + ' |', '| --- | ' + H.map(() => '---:').join(' | ') + ' |');
  for (const [v, hs] of Object.entries(r.variants)) L.push(`| ${v} | ${hs.map((x) => (x.p95 ? ci(x.p95) : '—')).join(' | ')} |`);
  L.push('', '### Paired ratios of median 3D error [95 % interval] and class', '', '| Variant / comparator | ' + H.map(hLabel).join(' | ') + ' |', '| --- | ' + H.map(() => '---').join(' | ') + ' |');
  for (const c of r.comparisons) L.push(`| ${c.variant} / ${c.comparator} | ${c.horizons.map((x) => (x.ratio ? `${rci(x.ratio)} ${x.class}, n ${x.n}` : `n ${x.n}`)).join(' | ')} |`);
  L.push('', '### RTN breakdown: median |R| / |T| / |N|, m, and the share of squared error in R / T / N (5 robust-sigma clip on 3D)', '', '| Variant | ' + H.map(hLabel).join(' | ') + ' |', '| --- | ' + H.map(() => '---').join(' | ') + ' |');
  for (const [v, hs] of Object.entries(r.variants)) L.push(`| ${v} | ${hs.map((x) => (x.axes ? `${x.axes.medianAbs.map(fmt).join(' / ')}; ${x.axes.share.map((s) => `${(100 * s).toFixed(0)}`).join('/')} %` : '—')).join(' | ')} |`);
  L.push('', '### Sample counts per variant (n per horizon) and failures', '', '| Variant | ' + H.map(hLabel).join(' | ') + ' | Failures | Median s per sample |', '| --- | ' + H.map(() => '---:').join(' | ') + ' | --- | ---: |');
  for (const [v, hs] of Object.entries(r.variants)) L.push(`| ${v} | ${hs.map((x) => x.n).join(' | ')} | ${r.failures[v].count ? r.failures[v].reasons.map(([k, n]) => `${n}: ${k}`).join('; ') : '0'} | ${fmt(r.seconds[v])} |`);
  if (Object.keys(r.fits).length) {
    L.push('', '### Arc fits', '', '| Variant | Attempted | Converged | Median OMMs | Median iterations | Median reduced χ² | Fitted parameter | Median [quartiles] |', '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
    for (const [v, f] of Object.entries(r.fits)) L.push(`| ${v} | ${f.attempted} | ${f.converged} | ${fmt(f.medianSets)} | ${fmt(f.medianIterations)} | ${fmt(f.medianReducedChiSquare)} | ${f.parameter ?? 'state only'} | ${f.medianParameter !== null ? `${f.medianParameter.toExponential(3)} [${f.parameterQuartiles.map((x) => x.toExponential(3)).join(', ')}] m²/kg` : '—'} |`);
  }
  L.push('', `Coefficients (median over samples): Cr·A/m ${r.coefficients.medianAgom.toExponential(3)} m²/kg; Cd·A/m from B* ${r.coefficients.medianBstarB.toExponential(3)}, nominal ${r.coefficients.medianNominalB.toExponential(3)} m²/kg; negative B* in ${r.coefficients.negativeBstar} of ${r.coefficients.samples} OMMs.`, '');
}
L.push('## Provenance', '', `Modules repository \`${m0.modulesRepository.commit}\`; this repository \`${m0.repository.commit}\`${m0.repository.dirty ? ' (dirty)' : ''}. Space-Track gp_history files read: ${metrics.provenance.gpHistoryFiles} (SHA-256 in each shard manifest; the element sets stay on the machine that ran this). Truth files read: ${metrics.provenance.referenceFiles}.`, '');
L.push('| Module | Version | WASM SHA-256 |', '| --- | --- | --- |', ...m0.modules.map((m) => `| ${m.path} | ${m.version} | \`${m.wasmSha256}\` |`), '');

const out = path.join(repoRoot, 'results/e7', values.window);
fs.mkdirSync(path.join(out, 'manifests'), { recursive: true });
fs.writeFileSync(path.join(out, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
fs.writeFileSync(path.join(out, 'REPORT.md'), `${L.join('\n')}\n`);
for (const m of manifests) fs.writeFileSync(path.join(out, 'manifests', `${m.run}.json`), `${JSON.stringify(m, null, 1)}\n`);
console.log(`wrote ${path.relative(repoRoot, out)}/REPORT.md and metrics.json`);
