#!/usr/bin/env node
// E2b step 30: the train fit (PLAN.md sections 4-6). From the train runs of
// steps 10 (errors at common epochs), 15 (consecutive differences, C2a) and
// 40 (fusion candidates): Q1's P(a) and C12(g, tau) with H1, E2's H4 again,
// and every fitted number (T0, S(g), the correlation model R, C2a/C2b/C5,
// E3's selection ranking). Statistics only. Writes results/e2b/train/
// {correlation-model.json, products.json, metrics.json, manifest.json}.
//
//   node experiments/e2b-correlated-covariance/steps/30-fit.mjs --errors <ids> --differences <id> --fusion <ids>
import fs from 'node:fs';
import path from 'node:path';
import { quantile } from '../../../harness/stats.mjs';
import { epochMs } from '../../../harness/gp-archive.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { cli, config, configPath, readRuns, REGIMES } from '../common.mjs';
import { full3, lower3, isPD, eigenvalues3, sub, scale, mahalanobis } from '../linalg.mjs';
import { binOf, gapBin } from '../model.mjs';
import { clusterBootstrapSums, consistency, CHI2_3_95 } from '../stats.mjs';

const { values, window, modules } = cli({ errors: { type: 'string' }, differences: { type: 'string' }, fusion: { type: 'string' } });
if (window.name !== 'train') throw new Error('the fit runs on the train window');
for (const k of ['errors', 'differences', 'fusion']) if (!values[k]) throw new Error(`--${k} is required`);
const run = startRun({ experiment: config.experiment, step: '30-fit-train', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const S = config.statistics, opts = { resamples: S.bootstrapResamples, seed: S.bootstrapSeed, confidence: S.confidence };
const ids = (k) => values[k].split(',');
for (const k of ['errors', 'differences', 'fusion']) for (const id of ids(k)) run.addInputs(`run:${k}`, { [id]: sha256(fs.readFileSync(path.join(repoRoot, 'runs', id, 'manifest.json'))) });

const ageBins = config.bins.ageBinsDays, gapBins = config.bins.gapBinsDays, taus = config.measurement.tausDays;
const MIN = config.products.t0.minimumBinSamples;  // T0 bins and correlation cells
// Sums of outer products: 6x6 lower triangle (21), 3x3 row-major (9).
const outer21 = (a, b) => { const o = []; for (let i = 0; i < 6; ++i) for (let j = 0; j <= i; ++j) o.push(a[i] * b[j]); return o; };
const outer9 = (a, b) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => a[i] * b[j]));
const addTo = (acc, v) => { for (let k = 0; k < v.length; ++k) acc[k] += v[k]; };
const pos21to6 = (l) => l.slice(0, 6);

const model = { schema: {
  description: 'E2b train correlation model of SGP4 element-set errors against precise orbits, per regime. Errors: SGP4 minus precise state in the precise state\'s RTN axes (km, km/s). Ages in days from the set epoch.',
  P: 'by age bin: n, objects, mean[6], second[21] (6x6 lower triangle RR, TR, TT, NR, NT, NN, dR R, ... about zero), covariance[21] (about the mean)',
  cross: 'by kind (consecutive: the set and its predecessor; near: every older set within 7 d), tau (the newer set\'s age at the common epoch, days) and gap bin (newer minus older epoch): n, objects, C[9] = E[e_old e_new\'] (3x3 position, row-major), Mold[6], Mnew[6] (lower 3x3 second moments on the same pairs), R[9] = D_old^-1 C D_new^-1, Sd[6] = E[d d\'] with d = e_old - e_new, rho per axis with 95 % cluster-bootstrap intervals',
  use: 'C(old at age a_old, new at age a_new) ~ D(a_old) R(g = a_old - a_new, a_new) D(a_new), D the square roots of the diagonal of P (or of any covariance product) at those ages',
}, windows: { train: config.windows.train }, ageBinsDays: ageBins, gapBinsDays: gapBins, tausDays: taus, regimes: {} };
const products = { window: config.windows.train, regimes: {} };
const metrics = { window: { name: 'train', from: window.from, to: window.to }, regimes: {} };

const differences = await readRuns(ids('differences'), 'differences');
const c2 = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', ids('differences')[0], 'c2.json'), 'utf8'));
const fusionRows = await readRuns(ids('fusion'), 'fusion', (r) => !r.missing);

for (const name of REGIMES) {
  const rows = await readRuns(ids('errors'), 'errors', (r) => r.regime === name && !r.missing);
  // ── P samples: each (set, precise epoch) once ──
  const seen = new Set();
  const P = ageBins.map(() => ({ n: 0, sum: Array(6).fill(0), second: Array(21).fill(0), objects: new Set() }));
  const scoring = [];  // anchors' own errors at each tau
  for (const r of rows) {
    for (const [epoch, age, e] of r.sets) {
      const key = `${r.norad}|${epoch}|${r.epoch}`;
      if (!seen.has(key)) {
        seen.add(key);
        const b = binOf(ageBins, age);
        if (b >= 0) { const p = P[b]; ++p.n; addTo(p.sum, e); addTo(p.second, outer21(e, e)); p.objects.add(r.norad); }
      }
      if (epoch === r.anchor) scoring.push({ object: r.norad, tau: r.tau, age, e: e.slice(0, 3) });
    }
  }
  const Ptable = P.map((p, k) => {
    if (!p.n) return { ageDays: ageBins[k], n: 0 };
    const mean = p.sum.map((v) => v / p.n), second = p.second.map((v) => v / p.n);
    const cov = second.map((v, t) => { let i = 0; while ((i + 1) * (i + 2) / 2 <= t) ++i; const j = t - i * (i + 1) / 2; return (v - mean[i] * mean[j]) * p.n / Math.max(1, p.n - 1); });
    return { ageDays: ageBins[k], n: p.n, objects: p.objects.size, mean, second, covariance: cov };
  });

  // ── pair samples ──
  const cells = {};  // kind|tau|gapBin -> accumulator
  const cell = (kind, tau, b) => (cells[`${kind}|${tau}|${b}`] ??= { n: 0, C: Array(9).fill(0), Mo: Array(9).fill(0), Mn: Array(9).fill(0), Sd: Array(9).fill(0), objects: new Map() });
  const pooled = {};  // kind|tau -> per-object sums for rho (pooled over gaps)
  for (const r of rows) {
    const anchor = r.sets.find((s) => s[0] === r.anchor);
    if (!anchor) continue;
    const en = anchor[2].slice(0, 3), aNew = anchor[1];
    const older = r.sets.filter((s) => s[0] < r.anchor);
    const predecessor = older.reduce((best, s) => (!best || s[0] > best[0] ? s : best), null);
    for (const s of older) {
      const eo = s[2].slice(0, 3), g = s[1] - aNew, b = gapBin(g);
      if (b < 0) continue;
      for (const kind of s === predecessor ? ['consecutive', 'near'] : ['near']) {
        const c = cell(kind, r.tau, b);
        ++c.n;
        addTo(c.C, outer9(eo, en)); addTo(c.Mo, outer9(eo, eo)); addTo(c.Mn, outer9(en, en));
        const d = eo.map((x, i) => x - en[i]);
        addTo(c.Sd, outer9(d, d));
        // per object: [n, sum eo_k en_k, sum eo_k^2, sum en_k^2] for k = R, T, N
        const v = [1, ...[0, 1, 2].flatMap((k) => [eo[k] * en[k], eo[k] ** 2, en[k] ** 2])];
        const po = c.objects.get(r.norad) ?? Array(10).fill(0);
        addTo(po, v); c.objects.set(r.norad, po);
        const pk = (pooled[`${kind}|${r.tau}`] ??= []);
        pk.push({ object: r.norad, v });
      }
    }
  }
  const rho = (items) => [0, 1, 2].map((k) => {
    const r = clusterBootstrapSums(items, (a) => a[1 + 3 * k] / Math.sqrt(a[2 + 3 * k] * a[3 + 3 * k]), opts);
    return { estimate: r.estimate, lower: r.lower, upper: r.upper };
  });
  const cross = {};
  for (const kind of ['consecutive', 'near']) {
    cross[kind] = {};
    for (const tau of taus) {
      cross[kind][tau] = gapBins.map((g, b) => {
        const c = cells[`${kind}|${tau}|${b}`];
        if (!c || c.n < MIN) return { gapDays: g, n: c?.n ?? 0 };
        const mean = (v) => v.map((x) => x / c.n);
        const C = mean(c.C), Mo = mean(c.Mo), Mn = mean(c.Mn), Sd = mean(c.Sd);
        const so = [0, 4, 8].map((k) => Math.sqrt(Mo[k])), sn = [0, 4, 8].map((k) => Math.sqrt(Mn[k]));
        const R = C.map((v, k) => v / (so[Math.floor(k / 3)] * sn[k % 3]));
        const rhos = rho([...c.objects].map(([object, v]) => ({ object, v })));
        return { gapDays: g, n: c.n, objects: c.objects.size, C, Mold: lower3(Mo), Mnew: lower3(Mn), R, Sd: lower3(Sd),
          rho: Object.fromEntries(['R', 'T', 'N'].map((ax, k) => [ax, rhos[k]])),
          traceShare: { Pold: Mo[0] + Mo[4] + Mo[8], Pnew: Mn[0] + Mn[4] + Mn[8], crossTwice: 2 * (C[0] + C[4] + C[8]), Sd: Sd[0] + Sd[4] + Sd[8] } };
      });
    }
  }
  const pooledRho = Object.fromEntries(Object.entries(pooled).map(([k, items]) => { const r = rho(items); return [k, Object.fromEntries(['R', 'T', 'N'].map((ax, i) => [ax, r[i]]))]; }));
  // H1: consecutive, tau = h1.tauDays, pooled over gaps.
  const h1 = pooledRho[`consecutive|${config.acceptance.h1.tauDays}`];
  // E2's H4 again: consecutive pairs with gaps up to half a day at tau 0: Sd minus the newer sets' at-epoch second moment.
  const short = [0, 1].map((b) => cells[`consecutive|0|${b}`]).filter(Boolean);
  const nShort = short.reduce((a, c) => a + c.n, 0);
  const Sd = short.reduce((a, c) => a.map((v, i) => v + c.Sd[i]), Array(9).fill(0)).map((v) => v / nShort);
  const Mn = short.reduce((a, c) => a.map((v, i) => v + c.Mn[i]), Array(9).fill(0)).map((v) => v / nShort);
  const corrected = Sd.map((v, i) => v - Mn[i]);
  const e2h4 = { n: nShort, differenceSecondMoment: lower3(Sd), atEpochSecondMoment: lower3(Mn), corrected: lower3(corrected),
    eigenvaluesKm2: eigenvalues3(corrected), positiveDefinite: eigenvalues3(corrected)[0] > 0,
    traceRatio: (Sd[0] + Sd[4] + Sd[8]) / (2 * (Mn[0] + Mn[4] + Mn[8])) };

  // ── T0 ──
  const T0 = { bins: ageBins, minimumSamples: MIN, n: Ptable.map((p) => p.n), lower: Ptable.map((p) => (p.n ? pos21to6(p.second) : null)) };
  // ── S(g): consecutive differences' second moment (train window, gaps up to 3 d) ──
  const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`) + 86400000;
  const Sacc = gapBins.map(() => ({ n: 0, M: Array(9).fill(0) }));
  for (const r of differences) {
    if (r.regime !== name) continue;
    const t = epochMs(r.newer);
    if (t < lo || t >= hi || r.gapDays > config.products.k1.maxGapDays) continue;
    const b = gapBin(r.gapDays);
    if (b < 0) continue;
    const d = r.d.slice(0, 3);
    ++Sacc[b].n; addTo(Sacc[b].M, outer9(d, d));
  }
  const Sfit = { gapBins, n: Sacc.map((s) => s.n), lower: Sacc.map((s) => (s.n >= MIN ? lower3(s.M.map((v) => v / s.n)) : null)) };
  // ── R: correlation model by kind ──
  const R = Object.fromEntries(['consecutive', 'near'].map((kind) => [kind, { tausDays: taus, R: taus.map((tau) => cross[kind][tau].map((c) => c.R ?? null)) }]));
  // ── C2a, C2b, C5 (E2's) ──
  const strata = c2.regimes[name].strata;
  const c2a = taus.map((_, k) => { const s = strata.find((x) => x.ageIndex === k); return s?.covariance ? pos21to6(s.covariance) : null; });
  const c2b = c2a.map((c) => (c && c2a[0] ? sub(c, scale(c2a[0], 0.5)) : null));
  const kFactor = taus.map((tau, k) => {
    if (!c2a[k] || !isPD(c2a[k])) return null;
    const d2 = scoring.filter((s) => s.tau === tau).map((s) => mahalanobis(s.e, full3(c2a[k]))).filter(Number.isFinite);
    return Math.sqrt(d2.reduce((a, v) => a + v, 0) / d2.length / 3);
  });
  const c5 = c2a.map((c, k) => (c && kFactor[k] ? scale(c, kFactor[k] ** 2) : null));
  const C2 = { taus, C2a: c2a, C2b: c2b, C5: c5, k: kFactor, pairs: taus.map((_, k) => strata.find((x) => x.ageIndex === k)?.n ?? 0),
    positiveDefinite: { C2a: c2a.map((c) => !!c && isPD(c)), C2b: c2b.map((c) => !!c && isPD(c)) } };
  // ── E3's selection ranking for fusion ──
  const selection = {};
  for (const h of config.fusion.horizonsDays) {
    const ranks = [0, 1, 2].map((r) => {
      const errs = fusionRows.filter((x) => x.regime === name && x.h === h && x.candidates.length > r).map((x) => Math.hypot(...x.candidates[r][3].slice(0, 3)));
      return { rank: r, n: errs.length, medianKm: errs.length ? quantile(errs, 0.5) : null };
    });
    const eligible = ranks.filter((x) => x.n >= config.fusion.selectionMinimumSamples);
    selection[h] = { ranks, chosen: eligible.length ? eligible.reduce((a, b) => (b.medianKm < a.medianKm ? b : a)).rank : 0 };
  }
  // ── in-sample consistency on train (descriptive) ──
  const t0f = (await import('../model.mjs')).t0Function(T0);
  const inSample = {};
  for (const [id, cov] of [['T0', (s) => t0f(s.age)], ['C2a', (s) => c2a[taus.indexOf(s.tau)]], ['C2b', (s) => c2b[taus.indexOf(s.tau)]], ['C5', (s) => c5[taus.indexOf(s.tau)]]]) {
    inSample[id] = {};
    for (const tau of taus) {
      const list = scoring.filter((s) => s.tau === tau).map((s) => { const c = cov(s); const d2 = c && isPD(c) ? mahalanobis(s.e, full3(c)) : NaN; return { object: s.object, d2, errorM: Math.hypot(...s.e) * 1e3 }; }).filter((x) => Number.isFinite(x.d2));
      inSample[id][tau] = list.length ? consistency(list, config.acceptance.consistency, S) : { n: 0, notPositiveDefinite: true };
    }
  }
  model.regimes[name] = { P: Ptable, cross, pooledRho, e2h4 };
  products.regimes[name] = { T0, S: Sfit, R, C2, selection };
  metrics.regimes[name] = {
    samples: { pSamples: seen.size, scoring: scoring.length, rows: rows.length },
    h1: { rho: h1, supported: !!h1 && h1.T.lower > config.acceptance.h1.lowerAbove },
    e2h4: { n: e2h4.n, positiveDefinite: e2h4.positiveDefinite, eigenvaluesKm2: e2h4.eigenvaluesKm2, traceRatio: e2h4.traceRatio },
    sigmaByAgeKm: Ptable.map((p) => ({ ageDays: p.ageDays, n: p.n, sigma: p.n ? [0, 2, 5].map((k) => Math.sqrt(p.second[k])) : null, mean: p.n ? p.mean.slice(0, 3) : null })),
    selection, C2: { k: kFactor, pairs: C2.pairs, positiveDefinite: C2.positiveDefinite }, inSample,
  };
  log(`${name}: P samples ${seen.size}; rho_T consecutive tau 0 ${h1 ? `${h1.T.estimate.toFixed(3)} [${h1.T.lower.toFixed(3)}, ${h1.T.upper.toFixed(3)}]` : 'n/a'}; E2 H4 PD ${e2h4.positiveDefinite}`);
}
metrics.h1 = { supported: REGIMES.every((r) => metrics.regimes[r].h1.supported), byRegime: Object.fromEntries(REGIMES.map((r) => [r, metrics.regimes[r].h1.supported])) };
const outDir = path.join(repoRoot, 'results', 'e2b', 'train');
fs.mkdirSync(outDir, { recursive: true });
for (const [file, value] of [['correlation-model.json', model], ['products.json', products], ['metrics.json', metrics]]) {
  const text = `${JSON.stringify(value, null, 1)}\n`;
  fs.writeFileSync(path.join(outDir, file), text);
  run.write(file, text);
}
const manifest = run.finish({ outputs: Object.fromEntries(['correlation-model.json', 'products.json', 'metrics.json'].map((f) => [f, sha256(fs.readFileSync(path.join(outDir, f)))])) });
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
log('H1', JSON.stringify(metrics.h1));
