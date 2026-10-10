#!/usr/bin/env node
// E2b step 50: score a window (PLAN.md section 7). Every product and
// literature baseline on the scoring samples of step 10, with E2's
// consistency statistics, the energy and log scores, and the probability of
// collision effect (analysis/gp-error-model screening_cases on pairs of
// samples, each object with its own covariance); H4 on step 15's consecutive
// differences; fusion (step 40). On validation: the choice of section 7
// (selection.json). On test: the decisions H2-H6. Writes
// results/e2b/<window>/{metrics.json, manifest.json}.
//
//   node experiments/e2b-correlated-covariance/steps/50-score.mjs --window validation \
//     --errors <ids> --differences <id> --literature <ids> --fusion <ids>
import fs from 'node:fs';
import path from 'node:path';
import { json, sha256 } from '../../../harness/modules.mjs';
import { quantile, rng } from '../../../harness/stats.mjs';
import { epochMs } from '../../../harness/gp-archive.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { cli, config, configPath, readRuns, loadGp, REGIMES, DAY_MS } from '../common.mjs';
import { full3, isPD, mahalanobis } from '../linalg.mjs';
import { regimeProducts, kappaFunction, productCovariances, differenceCovariances } from '../model.mjs';
import { consistency, scoreSample, meanWithInterval, ratioOfMeans, axisNormStd, pigeonholeMedianRatio } from '../stats.mjs';
import { naive, covarianceIntersection, gls } from '../fusion.mjs';

const { values, window, modules } = cli({ errors: { type: 'string' }, differences: { type: 'string' }, literature: { type: 'string' },
  fusion: { type: 'string' }, products: { type: 'string', default: 'results/e2b/train/products.json' } });
for (const k of ['errors', 'differences', 'literature', 'fusion']) if (!values[k]) throw new Error(`--${k} is required`);
const productsFile = path.resolve(repoRoot, values.products);
if (config.frozen) {
  const pin = config.fitted?.products;
  if (!pin || pin.sha256 !== sha256(fs.readFileSync(productsFile))) throw new Error('products.json is not the file config.json pins');
}
const run = startRun({ experiment: config.experiment, step: `50-score-${window.name}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const ids = (k) => values[k].split(',');
for (const k of ['errors', 'differences', 'literature', 'fusion']) for (const id of ids(k)) run.addInputs(`run:${k}`, { [id]: sha256(fs.readFileSync(path.join(repoRoot, 'runs', id, 'manifest.json'))) });
run.addInputs('products', { [path.basename(productsFile)]: sha256(fs.readFileSync(productsFile)) });
const fitted = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
const gp = await loadGp(modules, run);
const S = config.statistics, A = config.acceptance, taus = config.measurement.tausDays;
const PRODUCTS = ['C2a', 'C2b', 'C5', 'T0', 'K1', 'K1o', 'C1a', 'C1b', 'C1bAbove', 'C3a', 'C3b'];
const seedOf = (...parts) => parseInt(sha256(Buffer.from(parts.join('|'))).slice(0, 8), 16) ^ S.bootstrapSeed;
const chosen = config.chosen?.byRegime ?? null;

// Pc effect: `screening.pairs` pairs of samples of different objects per
// regime and tau (seeded), scored for each product where both have one.
async function pcEffect(samples, product, seed) {
  const random = rng(seed);
  const pairs = [];
  for (let tries = 0; pairs.length < config.screening.pairs && tries < config.screening.pairs * 20; ++tries) {
    const a = samples[Math.floor(random() * samples.length)], b = samples[Math.floor(random() * samples.length)];
    if (a.norad !== b.norad) pairs.push([a, b]);
  }
  const usable = pairs.filter(([a, b]) => Array.isArray(a.cov[product]) && Array.isArray(b.cov[product]));
  if (!usable.length) return null;
  const report = await gp.invokeJson('screening_cases', [
    json('cases', { pairs: usable.map(([a, b]) => ({ e1: a.e, c1: a.cov[product], e2: b.e, c2: b.cov[product] })) }),
    json('options', { hardBodyRadiusM: config.screening.hardBodyRadiusM, pcThreshold: config.screening.pcThreshold,
      missDistancesM: config.screening.missDistancesM, directions: config.screening.directions })], 'report');
  const pick = (rows) => {
    const byMiss = Object.fromEntries(rows.map((r) => [r.missM, r]));
    const collision = rows.filter((r) => r.collision);
    const cases = collision.reduce((s, r) => s + r.cases, 0);
    return {
      pcAlertRateCollisions: collision.reduce((s, r) => s + r.pcAlertRate * r.cases, 0) / cases,
      meanPcZeroMiss: byMiss[0]?.meanPc, pcAlertRate1km: byMiss[1000]?.pcAlertRate, pcAlertRate5km: byMiss[5000]?.pcAlertRate,
      boundedSetAlertRateCollisions: collision.reduce((s, r) => s + r.boundedSetAlertRate * r.cases, 0) / cases,
      boundedSetAlertRate1km: byMiss[1000]?.boundedSetAlertRate,
    };
  };
  return { pairs: usable.length, ...Object.fromEntries(Object.entries(report.summary).map(([g, rows]) => [g, pick(rows)])) };
}

const metrics = { window: { name: window.name, from: window.from, to: window.to }, products: PRODUCTS, regimes: {} };
const differences = await readRuns(ids('differences'), 'differences');
for (const name of REGIMES) {
  const prod = regimeProducts(fitted.regimes[name]);
  const regimeDiffs = differences.filter((r) => r.regime === name);
  const kappa = kappaFunction(regimeDiffs, fitted.regimes[name].S, config.products.k1);
  const literature = new Map();
  for (const r of await readRuns(ids('literature'), 'literature', (x) => x.regime === name))
    for (const t of r.targets) literature.set(`${r.norad}|${r.anchor}|${t.tau}`, t);
  // ── scoring samples ──
  const samples = [];
  for (const r of await readRuns(ids('errors'), 'errors', (x) => x.regime === name && !x.missing)) {
    const a = r.sets.find((s) => s[0] === r.anchor);
    if (!a) continue;
    const sample = { norad: r.norad, object: r.norad, anchor: r.anchor, tau: r.tau, age: a[1], e: a[2].slice(0, 3),
      created: epochMs(r.anchorCreated), literature: literature.get(`${r.norad}|${r.anchor}|${r.tau}`) };
    sample.cov = productCovariances(prod, kappa, sample);
    samples.push(sample);
  }
  const withC1b = samples.filter((s) => s.literature?.C1b);
  const belowEarth = (s) => s.literature.C1bPerigeeKm < config.products.c1.earthRadiusKm;
  const R = metrics.regimes[name] = { samples: samples.length, objects: new Set(samples.map((s) => s.norad)).size, products: {}, pc: {},
    c1b: { n: withC1b.length,
      twoBodyFallbackShare: withC1b.length ? withC1b.filter((s) => s.literature.C1bFallback).length / withC1b.length : null,
      perigeeBelowEarthShare: withC1b.length ? withC1b.filter(belowEarth).length / withC1b.length : null } };
  // C1b on the samples whose arcs stay above the Earth's surface (descriptive).
  for (const s of samples) if (s.literature?.C1b && !belowEarth(s)) s.cov.C1bAbove = s.cov.C1b;
  for (const tau of taus) {
    const atTau = samples.filter((s) => s.tau === tau);
    for (const p of PRODUCTS) {
      const random = rng(seedOf('energy', name, p, tau));
      const scored = [];
      let missing = 0, notPD = 0;
      for (const s of atTau) {
        const c = s.cov[p];
        if (!c) { ++missing; continue; }
        if (!Array.isArray(c)) { ++notPD; continue; }
        const x = scoreSample(s.e, c, { m: S.energySamples, random });
        if (!x) { ++notPD; continue; }
        scored.push({ object: s.norad, d2: x.d2, errorM: Math.hypot(...s.e) * 1e3, energy: x.energy, logScore: x.logScore, z: x.z, anchor: s.anchor });
        s[`score_${p}`] = x;
      }
      const entry = { n: scored.length, missing, notPositiveDefinite: notPD };
      if (scored.length) {
        Object.assign(entry, consistency(scored, A.consistency, S));
        entry.energy = meanWithInterval(scored, 'energy', S);
        entry.logScore = scored.reduce((a, x) => a + x.logScore, 0) / scored.length;
        entry.axisNormStd = axisNormStd(scored);
      }
      ((R.products[p] ??= {}))[tau] = entry;
    }
    // Probability of collision effect.
    for (const p of PRODUCTS) ((R.pc[p] ??= {}))[tau] = await pcEffect(atTau, p, seedOf('pc', name, tau));
    log(`${name} tau ${tau}: ${PRODUCTS.map((p) => `${p} ${R.products[p][tau].meanD2Over3 ? R.products[p][tau].meanD2Over3.estimate.toFixed(2) : '-'}`).join(', ')}`);
  }
  // ── paired energy ratios at 1 day: each correlation-aware product against C5 ──
  R.energyRatio = {};
  for (const p of config.choice.candidates) {
    const both = samples.filter((s) => s.tau === A.h3.horizonDays && s[`score_${p}`] && s.score_C5).map((s) => ({ object: s.norad, a: s[`score_${p}`].energy, b: s.score_C5.energy }));
    R.energyRatio[p] = { n: both.length, ...ratioOfMeans(both, 'a', 'b', S) };
  }
  // ── H4: consecutive differences under the correlated and the independent prediction ──
  const lo = window.lo, hi = window.hi;
  const h4 = { correlated: [], independent: [], excluded: 0 };
  for (const d of regimeDiffs) {
    const t = epochMs(d.newer);
    if (t < lo || t >= hi) continue;
    if (d.gapDays > config.products.k1.maxGapDays) { ++h4.excluded; continue; }
    const pred = differenceCovariances(prod, d.gapDays);
    const e = d.d.slice(0, 3);
    if (!pred.correlated || !isPD(pred.correlated)) { ++h4.excluded; continue; }
    h4.correlated.push({ object: d.norad, d2: mahalanobis(e, full3(pred.correlated)), errorM: Math.hypot(...e) * 1e3 });
    h4.independent.push({ object: d.norad, d2: mahalanobis(e, full3(pred.independent)), errorM: Math.hypot(...e) * 1e3 });
  }
  R.h4 = { excluded: h4.excluded, correlated: consistency(h4.correlated, A.consistency, S), independent: consistency(h4.independent, A.consistency, S) };
  // ── fusion ──
  const fusionRows = await readRuns(ids('fusion'), 'fusion', (x) => x.regime === name && !x.missing);
  R.fusion = {};
  const fusionProducts = window.name === 'test' && chosen ? [chosen[name]] : config.choice.candidates;
  for (const p of fusionProducts) {
    R.fusion[p] = {};
    for (const h of config.fusion.horizonsDays) {
      const sel = fitted.regimes[name].selection[h].chosen;
      const methods = { SEL: [], NAIVE: [], CI: [], GLS: [], rank0: [], rank1: [], rank2: [] };
      let glsFailed = 0, skipped = 0;
      const cells = [];
      for (const r of fusionRows.filter((x) => x.h === h)) {
        const created = epochMs(r.issue);
        const cands = r.candidates.map(([epoch, , age, rtn]) => ({ epoch, age, e: rtn.slice(0, 3) }));
        const covs = cands.map((c) => productCovariances(prod, kappa, { norad: r.norad, created, tau: null, age: c.age })[p]);
        if (covs.some((c) => !Array.isArray(c))) { ++skipped; continue; }
        const errors = cands.map((c) => c.e);
        const results = { NAIVE: naive(errors, covs), CI: covarianceIntersection(errors, covs, config.fusion.ciGridStep) };
        const s = Math.min(sel, cands.length - 1);
        results.SEL = { e: errors[s], P: covs[s] };
        const cross = prod.crossNear((age) => covs[cands.findIndex((c) => c.age === age)] ?? prod.t0(age));
        const g = gls(errors, covs, (a, b) => {
          const [old, nw] = cands[a].age >= cands[b].age ? [a, b] : [b, a];
          const C = cross(cands[old].age, cands[nw].age);
          if (!C) return null;
          return old === a ? C : [C[0], C[3], C[6], C[1], C[4], C[7], C[2], C[5], C[8]];
        });
        if (g) results.GLS = g; else ++glsFailed;
        cands.forEach((c, k) => { results[`rank${k}`] = { e: c.e, P: covs[k] }; });
        const issueDay = r.issue.slice(0, 10);
        for (const [m, x] of Object.entries(results)) {
          const d2 = mahalanobis(x.e, full3(x.P));
          if (Number.isFinite(d2)) methods[m].push({ object: r.norad, d2, errorM: Math.hypot(...x.e) * 1e3, e: x.e, day: issueDay });
        }
        if (results.GLS) cells.push({ row: r.norad, col: issueDay, ci: Math.hypot(...results.CI.e), sel: Math.hypot(...results.SEL.e), naive: Math.hypot(...results.NAIVE.e), gls: Math.hypot(...results.GLS.e) });
        else cells.push({ row: r.norad, col: issueDay, ci: Math.hypot(...results.CI.e), sel: Math.hypot(...results.SEL.e), naive: Math.hypot(...results.NAIVE.e) });
      }
      const summary = (list) => {
        if (!list.length) return { n: 0 };
        const n = list.length, mean = [0, 1, 2].map((k) => list.reduce((a, x) => a + x.e[k], 0) / n);
        const ms = list.reduce((a, x) => a + x.e[0] ** 2 + x.e[1] ** 2 + x.e[2] ** 2, 0) / n;
        return { ...consistency(list, A.consistency, S), biasKm: mean, biasShare: (mean[0] ** 2 + mean[1] ** 2 + mean[2] ** 2) / ms };
      };
      const out = R.fusion[p][h] = { selectionRank: sel, skipped, glsFailed, methods: Object.fromEntries(Object.entries(methods).map(([m, l]) => [m, summary(l)])) };
      out.ratios = {
        CIoverSEL: pigeonholeMedianRatio(cells.map((c) => ({ row: c.row, col: c.col, a: c.ci, b: c.sel })), S),
        NAIVEoverSEL: pigeonholeMedianRatio(cells.map((c) => ({ row: c.row, col: c.col, a: c.naive, b: c.sel })), S),
      };
      const withGls = cells.filter((c) => c.gls !== undefined);
      if (withGls.length) out.ratios.GLSoverSEL = pigeonholeMedianRatio(withGls.map((c) => ({ row: c.row, col: c.col, a: c.gls, b: c.sel })), S);
    }
  }
  log(`${name}: H4 correlated ${R.h4.correlated.meanD2Over3?.estimate?.toFixed(2)} independent ${R.h4.independent.meanD2Over3?.estimate?.toFixed(2)}`);
}

// ── choice (validation) and decisions (test) ──
if (window.name === 'validation') {
  const selection = { rule: 'per regime, lowest mean 1-day energy score among T0, K1, K1o; overlapping 95 % intervals tie and go to the simpler (T0, K1, K1o)', byRegime: {}, scores: {} };
  for (const name of REGIMES) {
    const scores = config.choice.candidates.map((p) => ({ product: p, energy: metrics.regimes[name].products[p][config.choice.horizonDays].energy }));
    const best = scores.filter((s) => s.energy).reduce((a, b) => (b.energy.estimate < a.energy.estimate ? b : a));
    const tied = scores.filter((s) => s.energy && s.energy.lower <= best.energy.upper && s.energy.upper >= best.energy.lower);
    selection.byRegime[name] = config.choice.candidates.find((p) => tied.some((t) => t.product === p));
    selection.scores[name] = { best: best.product, tied: tied.map((t) => t.product), energy: Object.fromEntries(scores.map((s) => [s.product, s.energy])) };
  }
  metrics.selection = selection;
  const dir = path.join(repoRoot, 'results', 'e2b', 'validation');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'selection.json'), `${JSON.stringify(selection, null, 1)}\n`);
  log('selection', JSON.stringify(selection.byRegime));
}
if (window.name === 'test' && chosen) {
  const D = {};
  const consistentAt = (entry) => entry?.consistent === true;
  D.H2 = Object.fromEntries(REGIMES.map((r) => { const p = chosen[r]; const rows = A.consistency.horizonsDays.map((t) => ({ tau: t, consistent: consistentAt(metrics.regimes[r].products[p][t]) })); return [r, { product: p, rows, supported: rows.every((x) => x.consistent) }]; }));
  D.H3 = Object.fromEntries(REGIMES.map((r) => { const q = metrics.regimes[r].energyRatio[chosen[r]]; return [r, { product: chosen[r], ratio: q, supported: !!q && q.upper < A.h3.upperBelow }]; }));
  D.H4 = Object.fromEntries(REGIMES.map((r) => { const h = metrics.regimes[r].h4; const c = h.correlated.meanD2Over3?.estimate, i = h.independent.meanD2Over3?.estimate;
    return [r, { correlated: c, independent: i, supported: c >= A.h4.consistent[0] && c <= A.h4.consistent[1] && i < A.h4.independentBelow }]; }));
  D.H6 = Object.fromEntries(REGIMES.map((r) => {
    const f = metrics.regimes[r].fusion[chosen[r]][A.h6.horizonDays];
    const naiveRatio = f.methods.NAIVE.meanD2Over3, ci = f.methods.CI.meanD2Over3?.estimate;
    const inputs = ['rank0', 'rank1', 'rank2'].map((k) => f.methods[k].meanD2Over3?.estimate).filter(Number.isFinite);
    return [r, {
      a: { naive: naiveRatio, supported: !!naiveRatio && naiveRatio.lower > A.h6.naiveLowerAbove },
      b: { ci, largestInput: Math.max(...inputs), supported: ci <= Math.max(...inputs) },
      c: { ratio: f.ratios.CIoverSEL, supported: f.ratios.CIoverSEL.upper < A.h6.ciUpperBelow },
    }];
  }));
  metrics.decisions = D;
}
const dir = path.join(repoRoot, 'results', 'e2b', window.name);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
run.write('metrics.json', metrics);
const manifest = run.finish({ outputs: { 'metrics.json': sha256(fs.readFileSync(path.join(dir, 'metrics.json'))) } });
fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
await gp.destroy();
log('done');
