#!/usr/bin/env node
// E7 step 40 (PLAN.md sections 6 and 7): statistics, classes and the answer
// to the owner's question from one step-20 batch; writes
// results/e7/<window>/metrics.json and REPORT.md (generated, never typed)
// with the shard manifests.
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
const CHI2_3_95 = 7.814727903251178;
const primary = ['H-epoch', 'H-arc', 'H-arc-GLS', 'H-arc-debiased', 'H-epoch-E1', 'H-arc-E1'];
const comparisons = [
  ...primary.map((v) => [v, 'S']), ['S-E1', 'S'], ['S-debiased', 'S'], ['H-truth', 'S'],
  ['H-arc', 'H-epoch'], ['H-arc-GLS', 'H-arc'], ['H-arc-debiased', 'H-arc'], ['H-epoch-E1', 'H-epoch'], ['H-arc-E1', 'H-arc'],
  ['H-epoch:other-B', 'H-epoch'], ['H-epoch-JB2008-released', 'H-epoch'], ['H-epoch-JB2008-observed', 'H-epoch'], ['H-arc-JB2008-observed', 'H-arc'], ['H-truth', 'H-epoch'],
];
const order = ['S', 'S-E1', 'S-debiased', 'H-epoch', 'H-epoch:', 'H-epoch-E1', 'H-epoch-JB2008-released', 'H-epoch-JB2008-observed', 'H-truth', 'H-arc', 'H-arc:', 'H-arc-GLS', 'H-arc-debiased', 'H-arc-E1', 'H-arc-JB2008-observed'];
const rank = (v) => { const i = order.findIndex((o) => (o.endsWith(':') ? v.startsWith(o) : v === o)); return i < 0 ? 99 : i; };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : NaN; };

const classOfSample = (r) => (r.maneuvers?.beforeCutoff?.length ? 'maneuver before the cutoff' : r.maneuvers?.inSpan?.length ? 'maneuver in the prediction span' : r.maneuvers ? 'no maneuver detected' : 'detection failed');
const metrics = { window: values.window, batch: values.batch, runs, freezeCommit: manifests[0].freezeCommit ?? null, statistics, horizonsHours: H, regimes: {} };
for (const regime of Object.keys(config.regimes)) {
  const mine = rows.filter((r) => r.regime === regime);
  if (!mine.length) continue;
  const variants = [...new Set(mine.flatMap((r) => [...Object.keys(r.errors), ...Object.keys(r.failures)]))].filter((v) => v !== 'maneuvers').sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const out = { samples: mine.length, objects: new Set(mine.map((r) => r.norad)).size, variants: {}, comparisons: [], fits: {}, failures: {}, classes: {}, coverage: {}, seconds: {} };
  for (const v of variants) {
    const failed = mine.filter((r) => r.failures[v]);
    out.failures[v] = { count: failed.length, reasons: Object.entries(failed.reduce((a, r) => { const k = r.failures[v].replace(/\(.*?\)/g, '()').slice(0, 80); a[k] = (a[k] ?? 0) + 1; return a; }, {})) };
    out.variants[v] = H.map((h, k) => {
      // Denominator: every sample of the regime with truth at this horizon.
      const attempted = mine.filter((r) => !r.targets[k].missing);
      const scored = attempted.filter((r) => r.errors[v]?.[k]);
      const unscored = attempted.length - scored.length;
      const d = scored.map((r) => norm(r.errors[v][k]));
      const withFailures = [...d, ...Array(unscored).fill(Infinity)];
      const base = { h, attempted: attempted.length, scored: scored.length, unscored,
        rms: d.length ? Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length) : null, p99: d.length ? q(d, 0.99) : null, max: d.length ? Math.max(...d) : null,
        operational: { median: q(withFailures, 0.5), p95: q(withFailures, 0.95), p99: q(withFailures, 0.99) } };
      const s = paired(mine, regime, [v], k);
      if (s.length < 3) return base;
      const ci = bootstrap(s, { median: medianOf(0), p95: p95Of(0) }, statistics);
      return { ...base, objects: new Set(s.map((x) => x.norad)).size, median: ci.median, p95: ci.p95, axes: axes(s.map((x) => x.errors[0])) };
    });
    const withD2 = mine.filter((r) => r.d2?.[v]);
    if (withD2.length) {
      out.coverage[v] = H.map((h, k) => {
        const d2 = withD2.map((r) => r.d2[v][k]).filter((x) => x !== null && x !== undefined && Number.isFinite(x));
        return { h, n: d2.length, meanD2Over3: d2.length ? d2.reduce((a, b) => a + b, 0) / d2.length / 3 : null, inside95: d2.length ? d2.filter((x) => x <= CHI2_3_95).length / d2.length : null };
      });
    }
    out.seconds[v] = median(mine.map((r) => r.seconds?.[v]).filter((x) => x !== undefined));
  }
  const pairs = [...comparisons.filter(([a, b]) => variants.includes(a) && variants.includes(b)),
    ...variants.filter((v) => /^(H-epoch|H-arc|S-debiased):/.test(v)).map((v) => [v, 'S'])];
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
  // Maneuver classes: samples per class and the median 3D error of the main
  // variants within each (paired with S), descriptive.
  for (const cls of [...new Set(mine.map(classOfSample))]) {
    const inClass = mine.filter((r) => classOfSample(r) === cls);
    out.classes[cls] = { samples: inClass.length, objects: new Set(inClass.map((r) => r.norad)).size,
      variants: Object.fromEntries(['S', ...primary].filter((v) => variants.includes(v)).map((v) => [v, H.map((h, k) => {
        const d = inClass.filter((r) => r.errors[v]?.[k] && r.errors.S?.[k]).map((r) => [norm(r.errors[v][k]), norm(r.errors.S[k])]);
        return { h, n: d.length, median: d.length ? median(d.map((x) => x[0])) : null, ratioToS: d.length ? median(d.map((x) => x[0])) / median(d.map((x) => x[1])) : null };
      })])) };
  }
  for (const v of variants.filter((x) => x.startsWith('H-arc'))) {
    const infos = mine.map((r) => r.info?.[v]).filter((i) => i?.fit || i?.arc);
    if (!infos.length) continue;
    const fits = infos.filter((i) => i.fit).map((i) => i.fit);
    const params = fits.filter((f) => f.converged && f.parameters?.length).map((f) => f.parameters);
    out.fits[v] = { attempted: infos.length, converged: fits.filter((f) => f.converged).length, split: infos.filter((i) => i.arc?.split).length,
      medianSets: median(infos.map((i) => i.arc?.sets ?? 0)), medianIterations: fits.length ? median(fits.map((f) => f.iterations ?? 0)) : null,
      medianReducedChiSquare: fits.filter((f) => f.converged).length ? median(fits.filter((f) => f.converged).map((f) => f.reducedChiSquare)) : null,
      parameters: config.regimes[regime].arcParameters.map((p, i) => ({ kind: p.kind, median: params.length ? median(params.map((x) => x[i])) : null })),
      medianInflation: infos.some((i) => i.arc?.inflation) ? [0, 1, 2, 3, 4, 5].map((c) => median(infos.filter((i) => i.arc?.inflation).map((i) => i.arc.inflation[c]))) : null,
      debias: infos.some((i) => i.debias) ? Object.entries(infos.filter((i) => i.debias).reduce((a, i) => { a[i.debias.kind] = (a[i.debias.kind] ?? 0) + 1; return a; }, {})) : null };
  }
  const latency = mine.map((r) => (Date.parse(r.cutoff) - Date.parse(`${r.epoch.slice(0, 23)}Z`)) / 3600000);
  out.cutoffLatencyHours = { median: median(latency), p95: q(latency, 0.95) };
  out.maneuvers = { beforeCutoff: mine.filter((r) => r.maneuvers?.beforeCutoff?.length).length, inSpan: mine.filter((r) => r.maneuvers?.inSpan?.length).length,
    detectionFailed: mine.filter((r) => !r.maneuvers).length };
  metrics.regimes[regime] = out;
  console.log(`${regime}: ${mine.length} samples`);
}
const m0 = manifests[0];
metrics.provenance = {
  repository: m0.repository, modulesRepository: m0.modulesRepository, modules: m0.modules, packages: m0.packages,
  config: m0.config, chosen: config.chosen, modulesBinary: config.modulesBinary,
  inputs: Object.fromEntries(Object.entries(m0.inputs).filter(([k]) => !['gpHistory', 'reference'].includes(k))),
  gpHistoryFiles: new Set(manifests.flatMap((m) => Object.keys(m.inputs.gpHistory ?? {}))).size,
  referenceFiles: new Set(manifests.flatMap((m) => Object.keys(m.inputs.reference ?? {}))).size,
};

// ── Report ──
const fmt = (x) => (x === null || x === undefined ? '—' : x === Infinity ? '∞' : !Number.isFinite(x) ? '—' : Math.abs(x) >= 1000 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
const ci = (c) => (c ? `${fmt(c.estimate)} [${fmt(c.lower)}, ${fmt(c.upper)}]` : '—');
const rci = (c) => (c ? `${c.estimate.toFixed(2)} [${c.lower.toFixed(2)}, ${c.upper.toFixed(2)}]` : '—');
const hLabel = (h) => (h === 168 ? '7 d' : `${h} h`);
const row = (cells) => `| ${cells.join(' | ')} |`;
const head = (first, extra = []) => [row([first, ...H.map(hLabel), ...extra]), row(['---', ...H.map(() => '---:'), ...extra.map(() => '---')])];
const L = [];
L.push(`# E7 results: ${values.window}`, '');
L.push('Generated by `experiments/e7-full-force-handoff/steps/40-evaluate.mjs` from the runs listed in `metrics.json`. Do not edit by hand.', '');
L.push(`Batch \`${values.batch}\` (${runs.length} shards); freeze commit ${metrics.freezeCommit ? `\`${metrics.freezeCommit}\`` : '— (not the test window)'}; modules \`${m0.modulesRepository.commit}\`${m0.modulesRepository.dirty ? ' (dirty)' : ''}; propagator/hpop WASM SHA-256 \`${m0.modules.find((m) => m.path === 'propagator/hpop')?.wasmSha256}\`.`, '');
L.push(`Every variant uses only what was public at its OMM's CREATION_DATE (PLAN.md section 4), except the variants marked "observed" (hindcasts). Intervals: 95 % percentile, two-way (object × UTC day) pigeonhole bootstrap, ${statistics.resamples} resamples, seed ${statistics.seed}. Ratio ρ = median 3D(variant) / median 3D(comparator) on paired samples; *meaningfully better*: upper bound < ${config.decision.meaningfulRatioBelow}; *better*: < 1; *worse*: lower bound > 1.`, '');
L.push('## The question: does full-force HPOP from the OMM improve on SGP4 over 0–7 days?', '');
L.push(`Answer per regime (PLAN.md section 6): **yes** if meaningfully better than S at ${config.decision.horizonsHours.map(hLabel).join(', ')}; **partly** if meaningfully better at some and worse at none; **no** otherwise. H-epoch is the handoff of the whitepaper's section 5 and the primary answer.`, '');
L.push(row(['Regime', 'Variant', 'Answer', ...H.map(hLabel)]), row(['---', '---', '---', ...H.map(() => '---')]));
for (const [regime, r] of Object.entries(metrics.regimes)) {
  for (const c of r.comparisons.filter((x) => x.comparator === 'S' && primary.includes(x.variant))) {
    L.push(row([regime, c.variant, `**${c.answer}**`, ...c.horizons.map((x) => (x.ratio ? `${x.ratio.estimate.toFixed(2)} (${x.class})` : '—'))]));
  }
}
L.push('', 'Cells: ρ against S, and its class.', '');
for (const [regime, r] of Object.entries(metrics.regimes)) {
  L.push(`## ${regime}`, '', `${r.samples} samples, ${r.objects} objects; cutoff (OMM CREATION_DATE) after the epoch: median ${fmt(r.cutoffLatencyHours.median)} h, 95th percentile ${fmt(r.cutoffLatencyHours.p95)} h. Force model: ${JSON.stringify(config.regimes[regime].forces)}${config.regimes[regime].forces.drag ? `, atmosphere ${config.drivers.operationalAtmosphere} (operational)` : ''}.`, '');
  L.push('### Median 3D error, m [95 % interval]', '', ...head('Variant'));
  for (const [v, hs] of Object.entries(r.variants)) L.push(row([v, ...hs.map((x) => (x.median ? ci(x.median) : '—'))]));
  L.push('', '### 95th percentile of the 3D error, m [95 % interval]', '', ...head('Variant'));
  for (const [v, hs] of Object.entries(r.variants)) L.push(row([v, ...hs.map((x) => (x.p95 ? ci(x.p95) : '—'))]));
  L.push('', '### Operational acceptance: untrimmed RMS / 99th percentile / maximum of the 3D error, m', '', ...head('Variant'));
  for (const [v, hs] of Object.entries(r.variants)) L.push(row([v, ...hs.map((x) => (x.rms !== null ? `${fmt(x.rms)} / ${fmt(x.p99)} / ${fmt(x.max)}` : '—'))]));
  L.push('', '### Operational acceptance: scored / attempted, and the median / 95th / 99th percentile with every failure and missing prediction counted as unbounded, m', '', ...head('Variant'));
  for (const [v, hs] of Object.entries(r.variants)) L.push(row([v, ...hs.map((x) => `${x.scored}/${x.attempted}; ${fmt(x.operational.median)} / ${fmt(x.operational.p95)} / ${fmt(x.operational.p99)}`)]));
  if (Object.keys(r.coverage).length) {
    L.push('', '### Covariance realism of the fitted variants: mean d²/3 / share inside the 95 % ellipsoid (n)', '', 'The fit\'s formal covariance times max(1, reduced χ²), propagated by HPOP; consistent: mean d²/3 near 1 and 95 % coverage near 0.95.', '', ...head('Variant'));
    for (const [v, hs] of Object.entries(r.coverage)) L.push(row([v, ...hs.map((x) => (x.n ? `${fmt(x.meanD2Over3)} / ${x.inside95.toFixed(3)} (${x.n})` : '—'))]));
  }
  L.push('', '### Paired ratios of median 3D error [95 % interval] and class', '', ...head('Variant / comparator'));
  for (const c of r.comparisons) L.push(row([`${c.variant} / ${c.comparator}`, ...c.horizons.map((x) => (x.ratio ? `${rci(x.ratio)} ${x.class}, n ${x.n}` : `n ${x.n}`))]));
  L.push('', '### RTN breakdown: median |R| / |T| / |N|, m, and the share of squared error in R / T / N (5 robust-sigma clip on 3D; secondary)', '', ...head('Variant'));
  for (const [v, hs] of Object.entries(r.variants)) L.push(row([v, ...hs.map((x) => (x.axes ? `${x.axes.medianAbs.map(fmt).join(' / ')}; ${x.axes.share.map((s) => `${(100 * s).toFixed(0)}`).join('/')} %` : '—'))]));
  L.push('', `### Maneuvers (analysis/maneuver-detection on SGP4 trajectories of the OMMs): ${r.maneuvers.beforeCutoff} samples with a maneuver detected before the cutoff inside the longest arc span (their arcs split), ${r.maneuvers.inSpan} with one in the prediction span (detected with later OMMs; classification only), ${r.maneuvers.detectionFailed} where detection failed.`, '');
  L.push(row(['Class', 'Samples (objects)', 'Variant', ...H.map(hLabel)]), row(['---', '---:', '---', ...H.map(() => '---')]));
  for (const [cls, c] of Object.entries(r.classes)) for (const [v, hs] of Object.entries(c.variants)) L.push(row([cls, `${c.samples} (${c.objects})`, v, ...hs.map((x) => (x.n ? `${fmt(x.median)} m (×${fmt(x.ratioToS)})` : '—'))]));
  L.push('', 'Cells: median 3D error and, in parentheses, its ratio to S on the same samples (no interval; descriptive).', '');
  if (Object.keys(r.fits).length) {
    L.push('### Arc fits', '', row(['Variant', 'Attempted', 'Converged', 'Split at a maneuver', 'Median OMMs', 'Median iterations', 'Median reduced χ²', 'Median fitted parameters', 'Median inflation R/T/N/dR/dT/dN', 'Debiasing models']),
      row(['---', '---:', '---:', '---:', '---:', '---:', '---:', '---', '---', '---']));
    for (const [v, f] of Object.entries(r.fits)) L.push(row([v, f.attempted, f.converged, f.split, fmt(f.medianSets), fmt(f.medianIterations), fmt(f.medianReducedChiSquare),
      f.parameters.length ? f.parameters.map((p) => `${p.kind} ${p.median === null ? '—' : p.median.toExponential(2)}`).join('; ') : 'state only',
      f.medianInflation ? f.medianInflation.map(fmt).join('/') : '—', f.debias ? f.debias.map(([k, n]) => `${k} ${n}`).join(', ') : '—']));
    L.push('');
  }
  L.push('### Failures', '', row(['Variant', 'Count', 'Reasons', 'Median s per sample']), row(['---', '---:', '---', '---:']));
  for (const v of Object.keys(r.variants)) L.push(row([v, r.failures[v].count, r.failures[v].count ? r.failures[v].reasons.map(([k, n]) => `${n}: ${k}`).join('; ') : '—', fmt(r.seconds[v])]));
  L.push('');
}
L.push('## Provenance', '', `Modules repository \`${m0.modulesRepository.commit}\`; this repository \`${m0.repository.commit}\`${m0.repository.dirty ? ' (dirty)' : ''}. Space-Track gp_history files read: ${metrics.provenance.gpHistoryFiles} (SHA-256 in each shard manifest; the element sets stay on the machine that ran this). Truth files read: ${metrics.provenance.referenceFiles}.`, '');
L.push(row(['Module', 'Version', 'WASM SHA-256']), row(['---', '---', '---']), ...m0.modules.map((m) => row([m.path, m.version, `\`${m.wasmSha256}\``])), '');

const out = path.join(repoRoot, 'results/e7', values.window);
fs.mkdirSync(path.join(out, 'manifests'), { recursive: true });
fs.writeFileSync(path.join(out, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
fs.writeFileSync(path.join(out, 'REPORT.md'), `${L.join('\n')}\n`);
for (const m of manifests) fs.writeFileSync(path.join(out, 'manifests', `${m.run}.json`), `${JSON.stringify(m, null, 1)}\n`);
console.log(`wrote ${path.relative(repoRoot, out)}/REPORT.md and metrics.json`);
