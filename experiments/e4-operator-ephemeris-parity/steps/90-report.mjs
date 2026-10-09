#!/usr/bin/env node
// E4 step 90: aggregates, hypotheses and the report from step 10's rows
// (PLAN.md sections 4 and 5). Only aggregates leave runs/: results/e4/<run>/
// holds metrics.json, REPORT.md and the manifests of every run it used.
//
//   node experiments/e4-operator-ephemeris-parity/steps/90-report.mjs --runs ID,ID,... [--truth-run ID]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { quantile, rng } from '../../../harness/stats.mjs';
import { config, configPath } from '../common.mjs';
import { modulesRoot } from '../../../harness/modules.mjs';

const { values } = parseArgs({ options: { runs: { type: 'string' }, 'truth-run': { type: 'string' }, inputs: { type: 'string' }, modules: { type: 'string' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const runIds = values.runs.split(',');
const run = startRun({ experiment: config.experiment, step: '90-report', configPath, modulesDir: modules, args: values });
const CHI2_3_95 = 7.814727903251178;
const { bootstrapResamples: B, bootstrapSeed: SEED, confidence: CONF } = config.statistics;

const norm3 = (e) => Math.hypot(e[0], e[1], e[2]);
const median = (xs) => quantile(xs, 0.5);
const lowerToPos = (c) => [c[0], c[1], c[3], c[1], c[2], c[4], c[3], c[4], c[5]];
function mahalanobis3(e, c) {
  const l00 = Math.sqrt(c[0]), l10 = c[3] / l00, l20 = c[6] / l00;
  const l11 = Math.sqrt(c[4] - l10 * l10), l21 = (c[7] - l20 * l10) / l11, l22 = Math.sqrt(c[8] - l20 * l20 - l21 * l21);
  const z0 = e[0] / l00, z1 = (e[1] - l10 * z0) / l11, z2 = (e[2] - l20 * z0 - l21 * z1) / l22;
  return z0 * z0 + z1 * z1 + z2 * z2;
}
const add3 = (a, b) => a.map((v, i) => v + b[i]);

// Object-cluster percentile bootstrap of statistic(samples).
function bootstrap(samples, statistic) {
  const objects = [...new Set(samples.map((s) => s.object))];
  const by = new Map(objects.map((o) => [o, samples.filter((s) => s.object === o)]));
  const random = rng(SEED);
  const values = [];
  for (let b = 0; b < B; ++b) {
    const draw = [];
    for (let i = 0; i < objects.length; ++i) draw.push(...by.get(objects[Math.floor(random() * objects.length)]));
    const v = statistic(draw);
    if (Number.isFinite(v)) values.push(v);
  }
  const a = (1 - CONF) / 2;
  return { estimate: statistic(samples), lower: quantile(values, a), upper: quantile(values, 1 - a) };
}

function distribution(list) {
  if (!list.length) return { n: 0 };
  const axis = (k) => list.map((s) => Math.abs(s.e[k]));
  const d3 = list.map((s) => norm3(s.e));
  const stats = (xs) => ({ median: median(xs), p95: quantile(xs, 0.95), max: Math.max(...xs) });
  return {
    n: list.length, objects: new Set(list.map((s) => s.object)).size,
    km3d: stats(d3), kmR: stats(axis(0)), kmT: stats(axis(1)), kmN: stats(axis(2)),
    signedMedianKm: [0, 1, 2].map((k) => median(list.map((s) => s.e[k]))),
  };
}

// ── rows ──
const rows = [];
const runs = [];
for (const id of runIds) {
  const dir = path.join(repoRoot, 'runs', id);
  runs.push(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
  for (const line of zlib.gunzipSync(fs.readFileSync(path.join(dir, 'rows.jsonl.gz'))).toString().split('\n')) if (line) rows.push(JSON.parse(line));
}
const providers = [...new Set(rows.map((r) => r.provider))];
const horizonKey = (h) => String(h);
const order = (p) => [...new Set(rows.filter((r) => r.provider === p && r.horizons).flatMap((r) => r.horizons.map((h) => horizonKey(h.h))))]
  .sort((a, b) => (a === 'at-epoch' ? -1 : b === 'at-epoch' ? 1 : Number(a) - Number(b)));

// Manoeuvre flags (PLAN.md section 4): S's 3D difference at h = 0.
const flags = {};
for (const p of providers) {
  const h0 = rows.filter((r) => r.provider === p && r.horizons).map((r) => ({ r, h: r.horizons.find((x) => (x.h === 0 || x.h === 'at-epoch') && x.S) })).filter((x) => x.h);
  const d = h0.map((x) => norm3(x.h.S));
  const med = median(d), mad = median(d.map((x) => Math.abs(x - med)));
  const limit = Math.max(config.maneuvers.floorKm, med + config.maneuvers.robustSigma * config.maneuvers.madScale * mad);
  const flagged = new Set(h0.filter((x) => norm3(x.h.S) > limit).map((x) => `${x.r.file}|${x.r.norad}|${x.r.hwid ?? ''}`));
  flags[p] = { limitKm: limit, medianKm: med, madKm: mad, rowsWithEpochDifference: h0.length, flagged: flagged.size, set: flagged };
}
const isFlagged = (r) => flags[r.provider].set.has(`${r.file}|${r.norad}|${r.hwid ?? ''}`);

function samples(p, h, product, { includeFlagged = false, need = [] } = {}) {
  const out = [];
  for (const r of rows) {
    if (r.provider !== p || !r.horizons || (!includeFlagged && isFlagged(r))) continue;
    const x = r.horizons.find((y) => horizonKey(y.h) === h);
    if (!x) continue;
    const e = product.startsWith('truth.') ? x.truth?.[product.slice(6)] : x[product];
    if (!e || need.some((k) => !x[k])) continue;
    out.push({ object: r.norad, e, x, r });
  }
  return out;
}

const metrics = { experiment: config.experiment, runs: runIds, truthRun: values['truth-run'] ?? null, flags: {}, providers: {}, hypotheses: {} };
for (const p of providers) {
  metrics.flags[p] = { limitKm: flags[p].limitKm, medianKm: flags[p].medianKm, madKm: flags[p].madKm, rows: flags[p].rowsWithEpochDifference, flagged: flags[p].flagged };
  const prov = { rows: rows.filter((r) => r.provider === p).length, compared: rows.filter((r) => r.provider === p && r.horizons).length,
    withoutSet: rows.filter((r) => r.provider === p && r.skipped).length, objects: new Set(rows.filter((r) => r.provider === p && r.horizons).map((r) => r.norad)).size,
    setAgeAtCutoffDays: median(rows.filter((r) => r.provider === p && r.horizons).map((r) => r.setAgeAtCutoffDays)), horizons: {} };
  for (const h of order(p)) {
    const m = {};
    for (const product of ['S', 'H', 'P', 'truth.op', 'truth.S', 'truth.H']) {
      const list = samples(p, h, product);
      if (list.length) m[product] = { primary: distribution(list), withFlagged: distribution(samples(p, h, product, { includeFlagged: true })) };
    }
    // H5: median 3D of H over S on the samples that have both.
    const both = samples(p, h, 'S', { need: ['H'] });
    if (both.length) {
      const ratio = (xs) => median(xs.map((s) => norm3(s.x.H))) / median(xs.map((s) => norm3(s.x.S)));
      const r = bootstrap(both, ratio);
      const objects = new Set(both.map((s) => s.object)).size;
      // An object-cluster interval needs several objects; with fewer, the ratio is descriptive.
      m.h5 = { ...r, n: both.length, objects, verdict: objects < 3 ? 'descriptive (fewer than 3 objects)' : r.upper < 1 ? 'H closer' : r.lower > 1 ? 'S closer' : 'undecided' };
    }
    // Our covariance against the difference from the operator (descriptive), all providers.
    for (const [prod, cov] of [['S', 'Sc3'], ['H', 'Hc3']]) {
      const list = samples(p, h, prod, { need: [cov] });
      if (!list.length) continue;
      const d2 = list.map((s) => mahalanobis3(s.e, s.x[cov])).filter(Number.isFinite);
      m[`${prod}AgainstOperator`] = { n: d2.length, meanD2Over3: d2.reduce((a, b) => a + b, 0) / d2.length / 3, coverage95: d2.filter((d) => d <= CHI2_3_95).length / d2.length,
        medianSigmaKm: [0, 4, 8].map((k) => median(list.map((s) => Math.sqrt(s.x[cov][k])))) };
    }
    // Starlink: the operator's covariance (UVW = RTN, km^2).
    if (p === 'spacex-starlink') {
      for (const [prod, cov] of [['S', 'Sc3'], ['H', 'Hc3']]) {
        const list = samples(p, h, prod, { need: [cov, 'opCov'] });
        if (!list.length) continue;
        const op = (s) => lowerToPos(s.x.opCov);
        const d2 = (xs, f) => xs.map((s) => mahalanobis3(s.e, f(s))).filter(Number.isFinite);
        const meanRatio = (xs) => { const d = d2(xs, (s) => add3(s.x[cov], op(s))); return d.reduce((a, b) => a + b, 0) / d.length / 3; };
        const coverage = (xs) => { const d = d2(xs, (s) => add3(s.x[cov], op(s))); return d.filter((x) => x <= CHI2_3_95).length / d.length; };
        const sigmaRatio = (k) => (xs) => median(xs.map((s) => Math.sqrt(s.x[cov][k * 4]) / Math.sqrt(op(s)[k * 4])));
        const opOnly = d2(list, op), oursOnly = d2(list, (s) => s.x[cov]);
        const mr = bootstrap(list, meanRatio), cv = bootstrap(list, coverage);
        const a = config.acceptance.h2;
        m[`${prod}Covariance`] = {
          n: list.length, objects: new Set(list.map((s) => s.object)).size,
          sigmaRatioOursOverOperator: { R: bootstrap(list, sigmaRatio(0)), T: bootstrap(list, sigmaRatio(1)), N: bootstrap(list, sigmaRatio(2)) },
          medianSigmaOperatorKm: [0, 1, 2].map((k) => median(list.map((s) => Math.sqrt(op(s)[k * 4])))),
          medianSigmaOursKm: [0, 1, 2].map((k) => median(list.map((s) => Math.sqrt(s.x[cov][k * 4])))),
          combined: { meanD2Over3: mr, coverage95: cv, pass: mr.estimate >= a.meanRatio[0] && mr.estimate <= a.meanRatio[1] && cv.estimate >= a.coverage95[0] && cv.estimate <= a.coverage95[1] },
          operatorOnly: { meanD2Over3: opOnly.reduce((x, y) => x + y, 0) / opOnly.length / 3, coverage95: opOnly.filter((x) => x <= CHI2_3_95).length / opOnly.length },
          oursOnly: { meanD2Over3: oursOnly.reduce((x, y) => x + y, 0) / oursOnly.length / 3, coverage95: oursOnly.filter((x) => x <= CHI2_3_95).length / oursOnly.length },
        };
      }
    }
    // H4: operator against truth relative to ours.
    for (const prod of ['S', 'H']) {
      const list = samples(p, h, 'truth.op').filter((s) => s.x.truth?.[prod]);
      if (!list.length) continue;
      const ratio = (xs) => median(xs.map((s) => norm3(s.x.truth.op))) / median(xs.map((s) => norm3(s.x.truth[prod])));
      m[`h4${prod}`] = { ...bootstrap(list, ratio), n: list.length };
    }
    prov.horizons[h] = m;
  }
  metrics.providers[p] = prov;
}

// ── hypotheses ──
const A = config.acceptance;
const sl = metrics.providers['spacex-starlink'];
if (sl) {
  const at = (h) => sl.horizons[h]?.S?.primary?.km3d?.median;
  metrics.hypotheses.H1 = { epochMedianKm: at('0'), horizon72MedianKm: at('72') ?? null, lastHorizon: order('spacex-starlink').at(-1), lastHorizonMedianKm: at(order('spacex-starlink').at(-1)),
    pass: at('0') !== undefined && at('72') !== undefined ? at('0') < A.h1.epochMedianKm && at('72') < A.h1.horizon72MedianKm : null,
    note: at('72') === undefined ? 'no 72 h horizon in the MEME spans (amendment A1)' : undefined };
  metrics.hypotheses.H2 = Object.fromEntries(['S', 'H'].map((prod) => [prod, Object.fromEntries(Object.entries(sl.horizons)
    .filter(([h, m]) => Number(h) <= A.h2.maxHorizonHours && m[`${prod}Covariance`]).map(([h, m]) => [h, { meanD2Over3: m[`${prod}Covariance`].combined.meanD2Over3.estimate, coverage95: m[`${prod}Covariance`].combined.coverage95.estimate, pass: m[`${prod}Covariance`].combined.pass }]))]));
  metrics.hypotheses.H3 = Object.fromEntries(['S', 'H'].map((prod) => [prod, Object.fromEntries(Object.entries(sl.horizons)
    .filter(([, m]) => m[`${prod}Covariance`]).map(([h, m]) => [h, { ...m[`${prod}Covariance`].sigmaRatioOursOverOperator[A.h3.axis], atLeast10: m[`${prod}Covariance`].sigmaRatioOursOverOperator[A.h3.axis].lower >= A.h3.ratioAtLeast }]))]));
}
metrics.hypotheses.H4 = {};
for (const p of ['gps-precise', 'glonass-precise', 'cpf']) {
  const pv = metrics.providers[p];
  if (!pv) continue;
  const per = Object.fromEntries(Object.entries(pv.horizons).filter(([, m]) => m.h4S || m.h4H).map(([h, m]) => [h, { S: m.h4S, H: m.h4H }]));
  const all = Object.values(per).flatMap((x) => [x.S, x.H]).filter(Boolean);
  metrics.hypotheses.H4[p] = all.length ? { pass: all.every((x) => x.upper < A.h4.ratioUpperBelow), horizons: per } : { pass: null, note: 'no truth for this provider\'s objects (not tested)' };
}
metrics.hypotheses.H5 = Object.fromEntries(providers.map((p) => [p, Object.fromEntries(Object.entries(metrics.providers[p].horizons).filter(([, m]) => m.h5).map(([h, m]) => [h, m.h5.verdict]))]));

// ── report ──
const outDir = path.join(repoRoot, 'results', 'e4', run.id);
fs.mkdirSync(outDir, { recursive: true });
const km = (x) => (x === undefined || x === null || !Number.isFinite(x) ? '–' : x < 0.01 ? x.toFixed(4) : x < 10 ? x.toFixed(3) : x < 1000 ? x.toFixed(1) : x.toFixed(0));
const lines = [`# E4 report: \`${run.id}\``, '', `Generated from ${runIds.length} comparison runs by \`steps/90-report.mjs\`; the plan is`,
  '[PLAN.md](../../../experiments/e4-operator-ephemeris-parity/PLAN.md). Differences are ours minus the',
  'operator, in the operator state\'s RTN axes, km. Primary results leave out object-files flagged as manoeuvres.', ''];
lines.push('## Providers', '', '| Provider | Object-files compared | Objects | Without element set | Flagged (limit km) | Median set age at cut-off (d) |', '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const p of providers) {
  const pv = metrics.providers[p];
  lines.push(`| ${p} | ${pv.compared} | ${pv.objects} | ${pv.withoutSet} | ${metrics.flags[p].flagged} (${km(metrics.flags[p].limitKm)}) | ${km(pv.setAgeAtCutoffDays)} |`);
}
lines.push('');
for (const p of providers) {
  const pv = metrics.providers[p];
  lines.push(`## ${p}`, '', '3D difference from the operator, km: median / 95th percentile / max (samples).', '',
    '| Horizon (h) | S (SGP4) | H (HPOP) | H/S median ratio [95 %] |' + (p === 'planet' ? ' P (operator TLE) |' : ''), '| --- | --- | --- | --- |' + (p === 'planet' ? ' --- |' : ''));
  for (const [h, m] of Object.entries(pv.horizons)) {
    const cell = (d) => (d?.primary?.n ? `${km(d.primary.km3d.median)} / ${km(d.primary.km3d.p95)} / ${km(d.primary.km3d.max)} (${d.primary.n})` : '–');
    lines.push(`| ${h} | ${cell(m.S)} | ${cell(m.H)} | ${m.h5 ? `${m.h5.estimate.toFixed(2)} [${m.h5.lower.toFixed(2)}, ${m.h5.upper.toFixed(2)}] ${m.h5.verdict}` : '–'} |` + (p === 'planet' ? ` ${cell(m.P)} |` : ''));
  }
  lines.push('', 'Median |R| / |T| / |N|, km (S; H):', '', '| Horizon (h) | S | H |', '| --- | --- | --- |');
  for (const [h, m] of Object.entries(pv.horizons)) {
    const rtn = (d) => (d?.primary?.n ? `${km(d.primary.kmR.median)} / ${km(d.primary.kmT.median)} / ${km(d.primary.kmN.median)}` : '–');
    lines.push(`| ${h} | ${rtn(m.S)} | ${rtn(m.H)} |`);
  }
  const anyTruth = Object.values(pv.horizons).some((m) => m['truth.op']);
  if (anyTruth) {
    lines.push('', 'Against truth (ESA final orbits), 3D median / 95th percentile, km, and the operator/ours median ratio [95 %]:', '',
      '| Horizon (h) | Operator | S | H | Operator/S | Operator/H |', '| --- | --- | --- | --- | --- | --- |');
    for (const [h, m] of Object.entries(pv.horizons)) {
      if (!m['truth.op']) continue;
      const c = (d) => (d?.primary?.n ? `${km(d.primary.km3d.median)} / ${km(d.primary.km3d.p95)}` : '–');
      const r = (x) => (x ? `${x.estimate.toExponential(1)} [${x.lower.toExponential(1)}, ${x.upper.toExponential(1)}]` : '–');
      lines.push(`| ${h} | ${c(m['truth.op'])} | ${c(m['truth.S'])} | ${c(m['truth.H'])} | ${r(m.h4S)} | ${r(m.h4H)} |`);
    }
  }
  if (p === 'spacex-starlink') {
    lines.push('', 'Covariance against SpaceX\'s (UVW = RTN). Median σ, km, R / T / N; σ ratio ours/SpaceX in-track [95 %];',
      'd² of the difference under both covariances: mean d²/3 and the fraction inside the 95 % ellipsoid (nominal 1 and 0.95).', '',
      '| Horizon (h) | SpaceX σ | S σ | S/SpaceX T ratio | S+SpaceX d²/3, cover | H σ | H/SpaceX T ratio | H+SpaceX d²/3, cover |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const [h, m] of Object.entries(pv.horizons)) {
      const s = m.SCovariance, hh = m.HCovariance;
      if (!s && !hh) continue;
      const sig = (v) => (v ? v.map(km).join(' / ') : '–');
      const rt = (c) => (c ? `${km(c.sigmaRatioOursOverOperator.T.estimate)} [${km(c.sigmaRatioOursOverOperator.T.lower)}, ${km(c.sigmaRatioOursOverOperator.T.upper)}]` : '–');
      const dd = (c) => (c ? `${c.combined.meanD2Over3.estimate.toFixed(2)}, ${c.combined.coverage95.estimate.toFixed(3)}` : '–');
      lines.push(`| ${h} | ${sig((s ?? hh).medianSigmaOperatorKm)} | ${sig(s?.medianSigmaOursKm)} | ${rt(s)} | ${dd(s)} | ${sig(hh?.medianSigmaOursKm)} | ${rt(hh)} | ${dd(hh)} |`);
    }
  }
  lines.push('');
}
lines.push('## Hypotheses', '', '```json', JSON.stringify(metrics.hypotheses, (k, v) => (typeof v === 'number' ? Number(v.toPrecision(4)) : v), 1), '```', '');
fs.writeFileSync(path.join(outDir, 'REPORT.md'), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
for (const m of runs) fs.writeFileSync(path.join(outDir, `${m.run}.manifest.json`), `${JSON.stringify(m, null, 1)}\n`);
if (values['truth-run']) fs.copyFileSync(path.join(repoRoot, 'runs', values['truth-run'], 'manifest.json'), path.join(outDir, `${values['truth-run']}.manifest.json`));
const manifest = run.finish({ inputsRuns: runIds });
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`[${run.id}] ${path.relative(process.cwd(), outDir)}`);
