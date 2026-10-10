// E6 report (PLAN.md §2, §4.4): aggregates the per-sample rows of the fit
// steps' runs (30: SatNOGS arm; 40: laser-ranging arm) for one window into
// metrics.json and REPORT.md under results/e6/<window>/. Statistics only.
//   node experiments/e6-public-observations/steps/90-report.mjs --window test [--runs id,id]
import fs from 'node:fs';
import path from 'node:path';
import { cli, config } from '../common.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median, quantile, rng } from '../../../harness/stats.mjs';

const { values } = cli({ window: { type: 'string' }, runs: { type: 'string' } });
const windowName = values.window ?? 'dev';
const runsDir = path.join(repoRoot, 'runs');
const runIds = values.runs ? values.runs.split(',') : fs.readdirSync(runsDir).filter((d) => d.startsWith(`e6-30-fit-${windowName}-`) || d.startsWith(`e6-40-slr-fit-${windowName}-`)).sort();
const rows = [], manifests = [];
for (const id of runIds) {
  const f = path.join(runsDir, id, 'samples.jsonl');
  if (!fs.existsSync(f)) continue;
  manifests.push(JSON.parse(fs.readFileSync(path.join(runsDir, id, 'manifest.json'))));
  for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) rows.push(JSON.parse(l));
}
const S = config.statistics;
const norm = (e) => Math.hypot(e[0], e[1], e[2]);
function d2(e, c) {
  const a = c[0], b = c[1], cc = c[2], d = c[4], e2 = c[5], f = c[8];
  const l11 = Math.sqrt(a), l21 = b / l11, l31 = cc / l11, l22 = Math.sqrt(d - l21 * l21), l32 = (e2 - l31 * l21) / l22, l33 = Math.sqrt(f - l31 * l31 - l32 * l32);
  const y1 = e[0] / l11, y2 = (e[1] - l21 * y1) / l22, y3 = (e[2] - l31 * y1 - l32 * y2) / l33;
  return y1 * y1 + y2 * y2 + y3 * y3;
}
// Samples: {group, variant, tau, cluster (object and fit day), T, segments, error [3] m, d2 | null}.
const samples = [];
for (const r of rows) {
  if (r.skipped || !r.scoring) continue;
  const group = r.arm === 'slr' ? 'slr' : 'satnogs';
  const cluster = `${r.norad}|${r.T.slice(0, 10)}`;
  const base = { group, target: r.target ?? 'iss', cluster, T: r.T, segments: r.segmentsInArc };
  r.scoring.forEach((s) => { if (s.sgp4) samples.push({ ...base, variant: 'B', tau: s.tau, error: s.sgp4, d2: null }); });
  for (const [name, v] of Object.entries(r.variants ?? {})) {
    if (!v.scoring) continue;
    v.scoring.forEach((s, k) => samples.push({ ...base, variant: name, tau: r.scoring[k].tau, used: v.segments, error: s.error, d2: d2(s.error, s.covariance) }));
  }
}
function bootstrap(lists, statistic) {
  const clusters = [...new Set(lists.flatMap((l) => l.map((s) => s.cluster)))];
  const random = rng(S.bootstrapSeed), out = [];
  for (let b = 0; b < S.bootstrapResamples; ++b) {
    const count = new Map();
    for (let i = 0; i < clusters.length; ++i) { const c = clusters[Math.floor(random() * clusters.length)]; count.set(c, (count.get(c) ?? 0) + 1); }
    const res = lists.map((l) => l.flatMap((s) => Array(count.get(s.cluster) ?? 0).fill(s)));
    if (res.some((l) => !l.length)) continue;
    const v = statistic(...res);
    if (Number.isFinite(v)) out.push(v);
  }
  return { estimate: statistic(...lists), lower: quantile(out, 0.025), upper: quantile(out, 0.975), clusters: clusters.length };
}
const med3 = (l) => median(l.map((s) => norm(s.error))) / 1000;
const pairKey = (s) => `${s.target}|${s.T}|${s.tau}`;
function metricsOf(list, all) {
  const out = {};
  const variantNames = [...new Set(list.map((s) => s.variant))].sort();
  for (const v of variantNames) {
    out[v] = {};
    for (const tau of config.scoring.horizonsDays) {
      const l = list.filter((s) => s.variant === v && s.tau === tau);
      if (!l.length) continue;
      const base = new Map(all.filter((s) => s.variant === 'B' && s.tau === tau).map((s) => [pairKey(s), s]));
      const paired = l.filter((s) => base.has(pairKey(s)));
      const m = {
        n: l.length, clusters: new Set(l.map((s) => s.cluster)).size,
        median3dKm: bootstrap([l], med3), rms3dKm: Math.sqrt(l.reduce((a, s) => a + norm(s.error) ** 2, 0) / l.length) / 1000,
        medianAbsRtnKm: [0, 1, 2].map((i) => median(l.map((s) => Math.abs(s.error[i]))) / 1000), q90_3dKm: quantile(l.map((s) => norm(s.error)), 0.9) / 1000,
      };
      if (v !== 'B' && paired.length) m.ratioToB = bootstrap([paired, paired.map((s) => base.get(pairKey(s)))], (a, b) => med3(a) / med3(b));
      const d = l.filter((s) => s.d2 !== null && Number.isFinite(s.d2));
      if (d.length) { m.meanD2over3 = bootstrap([d], (x) => x.reduce((a, s) => a + s.d2, 0) / x.length / 3); m.coverage95 = d.filter((s) => s.d2 <= 7.815).length / d.length; }
      const h1 = paired.filter((s) => s.segments >= (config.acceptance.minimumSegments[list[0].group] ?? 0));
      if (v !== 'B' && h1.length) m.h1 = { n: h1.length, ratioToB: bootstrap([h1, h1.map((s) => base.get(pairKey(s)))], (a, b) => med3(a) / med3(b)), medianKm: med3(h1), baselineMedianKm: med3(h1.map((s) => base.get(pairKey(s)))) };
      out[v][tau] = m;
    }
  }
  return out;
}
const verdict = (ci) => (!ci ? 'not tested' : ci.upper < 1 ? 'supported' : ci.lower > 1 ? 'not supported (worse)' : 'undecided');
const realism = (m) => {
  if (!m?.meanD2over3) return { verdict: 'not tested' };
  const [lo, hi] = config.acceptance.h2.meanD2over3, [clo, chi] = config.acceptance.h2.coverage95;
  return { meanD2over3: m.meanD2over3.estimate, coverage95: m.coverage95, verdict: m.meanD2over3.estimate >= lo && m.meanD2over3.estimate <= hi && m.coverage95 >= clo && m.coverage95 <= chi ? 'supported' : 'not supported' };
};
const groups = {};
for (const g of ['satnogs', 'slr']) {
  const list = samples.filter((s) => s.group === g);
  if (!list.length) continue;
  const primary = config.acceptance.primary[g];
  const variants = metricsOf(list, list);
  const byTarget = g === 'slr' ? Object.fromEntries([...new Set(list.map((s) => s.target))].map((t) => [t, metricsOf(list.filter((s) => s.target === t), list)])) : undefined;
  const lc = {};
  for (const tau of config.scoring.horizonsDays) {
    const pts = [];
    for (const v of Object.keys(variants).filter((x) => /^L-n\d+$|^P-n0$/.test(x))) { const m = variants[v][tau]; if (m) pts.push({ segments: Number(v.split('-n')[1]), n: m.n, median3dKm: m.median3dKm, ratioToB: m.ratioToB }); }
    const f = variants[primary]?.[tau]; if (f) pts.push({ segments: 'all', n: f.n, median3dKm: f.median3dKm, ratioToB: f.ratioToB });
    lc[tau] = pts.sort((a, b) => (a.segments === 'all') - (b.segments === 'all') || a.segments - b.segments);
  }
  groups[g] = {
    primary, fitEpochs: rows.filter((r) => (r.arm === 'slr' ? 'slr' : 'satnogs') === g).length, skipped: rows.filter((r) => (r.arm === 'slr' ? 'slr' : 'satnogs') === g && r.skipped).length,
    variants, byTarget,
    accuracy: Object.fromEntries(config.scoring.horizonsDays.map((t) => [t, { ratio: variants[primary]?.[t]?.h1?.ratioToB ?? null, n: variants[primary]?.[t]?.h1?.n ?? 0, verdict: verdict(variants[primary]?.[t]?.h1?.ratioToB) }])),
    realism: Object.fromEntries(config.scoring.horizonsDays.map((t) => [t, realism(variants[primary]?.[t])])),
    learningCurve: lc,
  };
}
const metrics = { window: windowName, runs: runIds, groups, modules: manifests[0] ? { repository: manifests[0].modulesRepository, modules: manifests[0].modules } : null };
const dir = path.join(repoRoot, 'results/e6', windowName);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
const f2 = (x) => (x === undefined || x === null || !Number.isFinite(x) ? '–' : Math.abs(x) < 0.1 ? x.toFixed(3) : x.toFixed(2));
const ci = (c) => (c ? `${f2(c.estimate)} [${f2(c.lower)}, ${f2(c.upper)}]` : '–');
const lines = [`# E6 ${windowName} window`, '', `Generated by \`steps/90-report.mjs\` from ${runIds.length} run(s). Modules ${metrics.modules?.repository?.commit?.slice(0, 8) ?? '?'}. Intervals: 95 %, cluster bootstrap by object and fit day (${S.bootstrapResamples} resamples, seed ${S.bootstrapSeed}).`];
const table = (variants) => {
  const t = ['| Variant | τ (d) | n | clusters | Median 3D km | RMS 3D km | Median abs R / T / N km | Ratio of medians to B | Mean d²/3 | 95 % coverage |', '| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- |'];
  const order = (v) => (v === 'B' ? '0' : v === 'P-n0' ? '1' : /^L-n/.test(v) ? `3${String(Number(v.slice(3))).padStart(3, '0')}` : `2${v}`);
  for (const v of Object.keys(variants).sort((a, b) => order(a).localeCompare(order(b)))) for (const tau of config.scoring.horizonsDays) { const m = variants[v][tau]; if (!m) continue; t.push(`| ${v} | ${tau} | ${m.n} | ${m.clusters} | ${ci(m.median3dKm)} | ${f2(m.rms3dKm)} | ${m.medianAbsRtnKm.map(f2).join(' / ')} | ${ci(m.ratioToB)} | ${ci(m.meanD2over3)} | ${m.coverage95 === undefined ? '–' : f2(m.coverage95)} |`); }
  return t;
};
for (const [g, G] of Object.entries(groups)) {
  lines.push('', `## ${g === 'satnogs' ? 'SatNOGS Doppler (ISS)' : 'ILRS laser ranging'}`, '', `${G.fitEpochs} cutoffs (${G.skipped} without an element set). Primary variant ${G.primary}.`, '', ...table(G.variants));
  if (G.byTarget) for (const [t, v] of Object.entries(G.byTarget)) lines.push('', `### ${t}`, '', ...table(v));
  lines.push('', `Accuracy (${G.primary} against B, cutoffs with ≥ ${config.acceptance.minimumSegments[g]} segments): ${config.scoring.horizonsDays.map((t) => [t, G.accuracy[t]]).map(([t, h]) => `${t} d: ${h.verdict} (n ${h.n}, ratio ${ci(h.ratio)})`).join('; ')}.`);
  lines.push('', `Covariance realism (${G.primary}): ${config.scoring.horizonsDays.map((t) => [t, G.realism[t]]).map(([t, h]) => `${t} d: ${h.verdict}${h.meanD2over3 !== undefined ? ` (mean d²/3 ${f2(h.meanD2over3)}, coverage ${f2(h.coverage95)})` : ''}`).join('; ')}.`);
  lines.push('', 'Learning curve (median 3D km by segments used):', '');
  for (const tau of config.scoring.horizonsDays) { const pts = G.learningCurve[tau]; if (pts?.length) lines.push(`- ${tau} d: ${pts.map((p) => `${p.segments}: ${ci(p.median3dKm)} (n ${p.n})`).join('; ')}`); }
}
fs.writeFileSync(path.join(dir, 'REPORT.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
