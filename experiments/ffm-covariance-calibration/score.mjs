// C2 fitting, choice and freeze (PLAN.md 3.5-3.6). Statistics only: every d2 is gp-error-model pair_statistics on the composed
// covariance (covarianceTerms in the predicted state's RTN axes: k_e A + f_R^2 e_RR + f_T^2 e_TT + f_N^2 e_NN + q_T U_T + q_RN (U_R +
// U_N) + sigma_delta^2 D_tau), with the C2-A1 truth covariance on the truth side for NSGF truth. JavaScript fits the constants:
// a Gaussian likelihood start, then the band loss sum_L [(ln mean d2/3)^2 + ((coverage - 0.95)/0.02)^2], by Nelder-Mead in log space.
//   node experiments/ffm-covariance-calibration/score.mjs --class I|LP|R3|R1|R2|L --fit      (fit on calibration, choose on validation)
//   node experiments/ffm-covariance-calibration/score.mjs --class <c> --freeze               (the frozen-constants receipt entry)
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, writeReceipt, store, args, results, sha256 } from './common.mjs';
import { b2 } from './lib/precise.mjs';

frozen();
const cls = args.class;
const B2C = JSON.parse(fs.readFileSync(b2('config.json')));
const rowsDir = path.join(store, 'rows');
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsOf = (prefix) => fs.readdirSync(rowsDir).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(rowsDir, f)));
const CHI = config.model.chi2_3_95, BAND = config.band;
const DAY = 86400e3;

/** Samples of a class and set: [{ L, err (m), terms {A, UR, UT, UN, D1, Dinf} (lower 6, m^2), truthSigma, cluster, block }], and the exclusion counts. */
function samples(set) {
  const out = [], counts = { windows: 0, excluded: {} };
  const ex = (why) => { counts.excluded[why] = (counts.excluded[why] ?? 0) + 1; };
  if (cls === 'I') {
    const screen = new Map(rowsOf('iss-screen.').map((r) => [r.file, r]));
    for (const r of rowsOf(`iss-terms.${set}.`)) {
      if (r.excluded) { ex('terms refused (weather gap in the prediction span)'); continue; }
      const sc = screen.get(r.file);
      if (!sc) { ex('no screen row'); continue; }
      if (sc.excluded) { ex('overlapping NASA files differ radially by more than 0.5 km'); continue; }
      counts.windows += 1;
      for (const l of r.leads) out.push({ L: l.L, err: l.errRtnM, terms: l.terms, truthSigma: null, cluster: Math.floor(Date.parse(r.E) / (30 * DAY)), window: r.file });
    }
  } else if (cls === 'LP') {
    const sens = args.sensitivity === 'true';
    for (const r of rowsOf(`lp-terms.${set}.`)) {
      if (r.excluded || !r.fit?.ok) { ex(r.excluded ? r.excluded.slice(0, 60) : `fit ${r.fit?.termination ?? r.fit?.error}`); continue; }
      if (sens && r.trackMaxSigmaM > 0.3) { ex('sensitivity: fit-track arc above 0.3 m'); continue; }
      counts.windows += 1;
      for (const l of r.leads) { if (sens && l.truthSigmaM > 0.3) continue; out.push({ L: l.L, err: l.errRtnM, terms: l.terms, truthSigma: sens ? null : l.truthSigmaM, cluster: r.norad, window: `${r.sphere}|${r.E}` }); }
    }
  } else throw new Error(`class ${cls}: rows not built yet`);
  return { out, counts };
}

const unitRtn = { RR: [1, 0, 0, 0, 0, 0], TT: [0, 0, 1, 0, 0, 0], NN: [0, 0, 0, 0, 0, 1] };
/** Covariance terms of a parameter vector p { k_e, f_R, f_T, f_N, q_T, q_RN, s2, tau } for one sample. */
function termsOf(p, s) {
  const t = [{ weight: p.k_e, covariance: s.terms.A }];
  if (p.f_R) t.push({ weight: p.f_R ** 2, covariance: unitRtn.RR });
  if (p.f_T) t.push({ weight: p.f_T ** 2, covariance: unitRtn.TT });
  if (p.f_N) t.push({ weight: p.f_N ** 2, covariance: unitRtn.NN });
  if (p.q_T) t.push({ weight: p.q_T, covariance: s.terms.UT });
  if (p.q_RN) { t.push({ weight: p.q_RN, covariance: s.terms.UR }); t.push({ weight: p.q_RN, covariance: s.terms.UN }); }
  if (p.s2) t.push({ weight: p.s2, covariance: p.tau === 'inf' ? s.terms.Dinf : s.terms.D1 });
  return t;
}
// A synthetic pair whose RTN axes are the inertial axes (position on x, velocity on y), so the stored RTN error and terms are used as is.
const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];
let pairs = null;
async function d2Of(p, list) {
  pairs ??= await (await import('./lib/pairs.mjs')).openPairs(B2C.a12.modulesLinks);
  const chunk = 4000, d2 = [];
  for (let i = 0; i < list.length; i += chunk) {
    const st = await pairs.stats(list.slice(i, i + chunk).map((s) => ({
      predicted: { position: P0, velocity: V0, covarianceTerms: termsOf(p, s), covarianceAxes: 'RTN' },
      truth: { position: P0.map((x, k) => x - s.err[k]), velocity: V0, ...(s.truthSigma ? { covariance: [1, 0, 1, 0, 0, 1].map((x) => x * s.truthSigma ** 2 / 2), covarianceAxes: 'RTN' } : {}) },
    })), 'predicted');
    for (const x of st) d2.push(x.d2Combined ?? x.d2Predicted);
  }
  return d2;
}
// The composed position covariance's log-determinant (statistics, for the likelihood start only).
function logDet(p, s) {
  const m = [0, 0, 0, 0, 0, 0];
  for (const t of termsOf(p, s)) for (let k = 0; k < 6; k += 1) m[k] += t.weight * t.covariance[k];
  if (s.truthSigma) { m[0] += s.truthSigma ** 2 / 2; m[2] += s.truthSigma ** 2 / 2; m[5] += s.truthSigma ** 2 / 2; }
  const [a, b, c, d, e, f] = m; // lower: RR, TR, TT, NR, NT, NN
  const det = a * (c * f - e * e) - b * (b * f - e * d) + d * (b * e - c * d);
  return Math.log(Math.max(det, 1e-300));
}
const cells = (list, d2) => {
  const by = {};
  list.forEach((s, i) => { (by[s.L] ??= { d2: [], clusters: new Set(), windows: new Set() }); by[s.L].d2.push(d2[i]); by[s.L].clusters.add(s.cluster); by[s.L].windows.add(s.window); });
  return Object.fromEntries(Object.entries(by).map(([L, c]) => {
    const n = c.d2.length, mean = c.d2.reduce((x, y) => x + y, 0) / n / 3, cov = c.d2.filter((x) => x <= CHI).length / n;
    const sorted = [...c.d2].sort((x, y) => x - y);
    const minClusters = cls === 'I' ? BAND.issMin30DayBlocks : BAND.minClusters;
    const inBand = mean >= BAND.meanD2over3[0] && mean <= BAND.meanD2over3[1] && cov >= BAND.coverage95[0] && cov <= BAND.coverage95[1];
    return [L, { n, clusters: c.clusters.size, meanD2over3: mean, medianD2over3: sorted[Math.floor(n / 2)] / 3, coverage: cov, inBand, eligible: n >= BAND.minWindows && c.clusters.size >= minClusters }];
  }));
};
const bandLoss = (cs) => Object.values(cs).reduce((s, c) => s + Math.log(c.meanD2over3) ** 2 + ((c.coverage - 0.95) / 0.02) ** 2, 0);

// Nelder-Mead in log space.
async function minimize(f, x0, { iterations = 300, step = 1 } = {}) {
  const n = x0.length;
  let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))];
  let values = []; for (const x of simplex) values.push(await f(x));
  for (let it = 0; it < iterations; it += 1) {
    const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]); values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) < 1e-6 * (1 + Math.abs(values[0]))) break;
    const centroid = x0.map((_, j) => simplex.slice(0, n).reduce((s, x) => s + x[j], 0) / n);
    const at = (t) => centroid.map((c, j) => c + t * (simplex[n][j] - c));
    const xr = at(-1), fr = await f(xr);
    if (fr < values[0]) { const xe = at(-2), fe = await f(xe); if (fe < fr) { simplex[n] = xe; values[n] = fe; } else { simplex[n] = xr; values[n] = fr; } }
    else if (fr < values[n - 1]) { simplex[n] = xr; values[n] = fr; }
    else { const xc = at(0.5), fc = await f(xc); if (fc < values[n]) { simplex[n] = xc; values[n] = fc; } else { for (let i = 1; i <= n; i += 1) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); values[i] = await f(simplex[i]); } } }
  }
  const best = values.indexOf(Math.min(...values));
  return { x: simplex[best], value: values[best] };
}

const CANDIDATES = {
  M0: { names: [], fixed: { k_e: 1 } },
  M1: { names: ['k_e', 'f_R', 'f_T', 'f_N'] },
  M2: { names: ['k_e', 'f_R', 'f_T', 'f_N', 'q_T', 'q_RN'] },
  'M3/tau1': { names: ['k_e', 'f_R', 'f_T', 'f_N', 'q_T', 'q_RN', 's2'], fixed: { tau: 1 } },
  'M3/tauInf': { names: ['k_e', 'f_R', 'f_T', 'f_N', 'q_T', 'q_RN', 's2'], fixed: { tau: 'inf' } },
};
const START = { k_e: 1, f_R: 1, f_T: 1, f_N: 1, q_T: 1e-12, q_RN: 1e-13, s2: 1e-2 };
const toP = (names, x, fixed = {}) => ({ ...fixed, ...Object.fromEntries(names.map((k, i) => [k, Math.exp(x[i])])) });

if (args.fit) {
  const cal = samples('calibration'), val = samples('validation');
  const hasD = cal.out.some((s) => s.terms.D1.some((v) => v !== 0));
  const report = { class: cls, sensitivity: args.sensitivity === 'true', calibration: cal.counts, validation: val.counts, samples: { calibration: cal.out.length, validation: val.out.length }, candidates: {} };
  for (const [name, c] of Object.entries(CANDIDATES)) {
    if (name.startsWith('M3') && !hasD) { report.candidates[name] = { skipped: 'no B parameter in this class: no density term' }; continue; }
    let p = c.names.length ? null : { ...c.fixed }; // M0 = A5: k_e = 1, every other term zero
    if (c.names.length) {
      // likelihood start
      const nll = async (x) => { const q = toP(c.names, x, c.fixed); const d2 = await d2Of(q, cal.out); return d2.reduce((s, v, i) => s + 0.5 * (v + logDet(q, cal.out[i])), 0); };
      const l = await minimize(nll, c.names.map((k) => Math.log(START[k])), { iterations: 200, step: 2 });
      const band = async (x) => bandLoss(cells(cal.out, await d2Of(toP(c.names, x, c.fixed), cal.out)));
      const b = await minimize(band, l.x, { iterations: 300, step: 0.5 });
      p = toP(c.names, b.x, c.fixed);
      report.candidates[name] = { parameters: p, likelihoodStart: toP(c.names, l.x, c.fixed), calibrationLoss: b.value };
    } else report.candidates[name] = { parameters: p };
    const cc = cells(cal.out, await d2Of(p, cal.out)), vc = cells(val.out, await d2Of(p, val.out));
    Object.assign(report.candidates[name], { calibrationCells: cc, validationCells: vc, validationInBand: Object.values(vc).filter((x) => x.inBand).length, validationLoss: bandLoss(vc), freeParameters: c.names.length });
    console.error(cls, name, JSON.stringify(Object.fromEntries(Object.entries(vc).map(([L, x]) => [L, [x.meanD2over3.toFixed(2), x.coverage.toFixed(3), x.n]]))));
  }
  // choice on validation: most cells in band, then the smaller band loss, then fewer parameters (PLAN.md 3.5 point 3)
  const ranked = Object.entries(report.candidates).filter(([, c]) => c.validationCells).sort(([, a], [, b]) => b.validationInBand - a.validationInBand || a.validationLoss - b.validationLoss || a.freeParameters - b.freeParameters);
  report.chosen = ranked[0][0];
  report.ranking = ranked.map(([n, c]) => ({ candidate: n, validationInBand: c.validationInBand, validationLoss: c.validationLoss, freeParameters: c.freeParameters }));
  console.log(writeReceipt(`fit-${cls}${report.sensitivity ? '-sensitivity' : ''}`, report));
  await pairs?.close();
  process.exit(0);
}

if (args.p8) {
  // C2-A4 point 1: per lead of the chosen model on validation, the covariance scaled so that the 95 % coverage is exactly 0.95
  // (s = the type-7 0.95 quantile of d2 / 7.8147), then mean d2 / 3 of the scaled d2; P8 passes when every lead lies in 0.8-1.25.
  const fit = JSON.parse(fs.readFileSync(path.join(results, `fit-${cls}.json`)));
  const p = fit.candidates[fit.chosen].parameters;
  const val = samples('validation');
  const d2 = await d2Of(p, val.out);
  const by = {};
  val.out.forEach((x, i) => (by[x.L] ??= []).push(d2[i]));
  const q = (xs, f) => { const s0 = [...xs].sort((a, b) => a - b); const h = (s0.length - 1) * f, lo = Math.floor(h); return s0[lo] + (s0[Math.ceil(h)] - s0[lo]) * (h - lo); };
  const leads = Object.fromEntries(Object.entries(by).map(([L, xs]) => { const sc = q(xs, 0.95) / CHI; const m = xs.reduce((a, b) => a + b / sc, 0) / xs.length / 3; return [L, { n: xs.length, scale: sc, shape: m, inBand: m >= 0.8 && m <= 1.25 }]; }));
  const pass = Object.values(leads).every((x) => x.inBand);
  console.log(writeReceipt(`precheck-P8-${cls}`, { plan: '3.8 P8; C2-A4 point 1', class: cls, chosen: fit.chosen, parameters: p, fitReceipt: `fit-${cls}.json`, leads,
    outcome: pass ? 'pass' : 'FAIL: the class is infeasible for a lead-independent model (C2-A4 point 1)' }));
  await pairs?.close();
  process.exit(0);
}

if (args.freeze) {
  const key = `${cls}${args.sensitivity === 'true' ? '-sensitivity' : ''}`;
  const fitFile = path.join(results, `fit-${key}.json`);
  const fit = JSON.parse(fs.readFileSync(fitFile));
  const file = path.join(results, 'frozen-constants.json');
  const frozenAll = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { receipt: 'frozen-constants', note: 'PLAN.md 3.5 point 4: no change after any held-out score; any later variant is exploratory', classes: {} };
  if (frozenAll.classes[key]) throw new Error(`${key} is already frozen`);
  const p8 = path.join(results, `precheck-P8-${cls}.json`);
  frozenAll.classes[key] = { chosen: fit.chosen, parameters: fit.candidates[fit.chosen].parameters, fitReceipt: path.basename(fitFile), fitReceiptSha256: sha256(fs.readFileSync(fitFile)), fitCommit: fit.experimentsCommit,
    p8: fs.existsSync(p8) && !args.sensitivity ? JSON.parse(fs.readFileSync(p8)).outcome : null, frozenUtc: new Date().toISOString() };
  fs.writeFileSync(file, `${JSON.stringify(frozenAll, null, 1)}\n`);
  console.log(file);
}
