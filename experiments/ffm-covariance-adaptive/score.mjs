// C3-small's statistics on cal/val (PLAN.md sections 2, 3, 5). Every d2 is gp-error-model pair_statistics on the composed covariance; JavaScript composes the arithmetic of section 2 and fits the constants.
//   node experiments/ffm-covariance-adaptive/score.mjs --pref                 P-REF: k_ref per class, axis and lead group; corr(forecast - truth, reference - truth)
//   node experiments/ffm-covariance-adaptive/score.mjs --fit --class R3 --history reference     the report-only arm's constants, on its own (needs --pref); fit-<class>.reference.json
//   node experiments/ffm-covariance-adaptive/score.mjs --fit --class R3       the model (C3-A8, C3-A10): constants by calibration log score; C3-0, C3-a, C3-a-k, C3-b, C3-ab, with C3-b-ref and C3-ab-ref beside; validation cells and contrasts (needs the reference arm's fit)
//   node experiments/ffm-covariance-adaptive/score.mjs --pref2                P-REF's second check, a report: reference-based e^u against truth-based, at the reference arm's constants
//   node experiments/ffm-covariance-adaptive/score.mjs --pref-gfz [--arm reference]             C3-A5, C3-A8: e^u against ESA's truth and against GFZ, GNSS calibration windows (the stop); with the registered reference in ESA's place (a report)
//   node experiments/ffm-covariance-adaptive/score.mjs --extract --class R3   C3-ab's primary samples for P7 and P8 (under <store>/extract/)
//   node experiments/ffm-covariance-adaptive/score.mjs --freeze [--judged <end>]     results/.../frozen-constants.json, once, from the fit receipts and P7's summary
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, registered, Opened, writeReceipt, results, sha256 } from './common.mjs';
import { AXES, axesMleRef, gOf, logScore, median } from './lib/model.mjs';
import { loadClass, samplesOf, CLASSES, groupOf, clusterMap } from './lib/windows.mjs';
import { compose, d2Of } from './lib/compose.mjs';

registered();
const opened = new Opened();
const LEADS = config.leads_h, V = config.verdict, CHI = V.band.chi2_3_95;
const seedOf = (label) => parseInt(sha256(Buffer.from(label)).slice(0, 8), 16);
function rngOf(seed) { let s = seed >>> 0; return () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0; return ((z ^ (z >>> 16)) >>> 0) / 4294967296; }; }

/** Two-way interval: clusters x moving blocks of `blockDates` grid dates (12 days on the 3-day grid); samples [{ cluster, day, value }]; weights multiply. */
function twoWay(samples, { resamples = V.interval.resamples, label, blockDays = V.interval.blocksDays } = {}) {
  const clusters = [...new Set(samples.map((s) => s.cluster))].sort(), days = [...new Set(samples.map((s) => s.day))].sort((a, b) => a - b);
  if (!samples.length) return null;
  const ci = new Map(clusters.map((c, i) => [c, i])), di = new Map(days.map((d, i) => [d, i]));
  const C = clusters.length, T = days.length, S = Array.from({ length: C }, () => new Float64Array(T)), N = Array.from({ length: C }, () => new Float64Array(T));
  for (const s of samples) { const a = ci.get(s.cluster), b = di.get(s.day); S[a][b] += s.value; N[a][b] += 1; }
  const first = days[0], last = days[T - 1], span = last - first + 1, blocks = Math.ceil(span / blockDays), starts = Math.max(1, span - blockDays + 1);
  const random = rngOf(seedOf(label));
  const out = new Float64Array(resamples);
  for (let b = 0; b < resamples; b += 1) {
    const wc = new Float64Array(C), wt = new Float64Array(T);
    for (let i = 0; i < C; i += 1) wc[Math.floor(random() * C)] += 1;
    for (let i = 0; i < blocks; i += 1) { const s0 = first + Math.floor(random() * starts); for (let t = 0; t < T; t += 1) if (days[t] >= s0 && days[t] < s0 + blockDays) wt[t] += 1; }
    let num = 0, den = 0;
    for (let c = 0; c < C; c += 1) { if (!wc[c]) continue; for (let t = 0; t < T; t += 1) { const w = wc[c] * wt[t]; if (w) { num += w * S[c][t]; den += w * N[c][t]; } } }
    out[b] = den ? num / den : NaN;
  }
  const v = [...out].filter(Number.isFinite).sort((a, b) => a - b);
  return { lo: v[Math.floor(v.length * 0.025)], hi: v[Math.floor(v.length * 0.975)], resamples: v.length, sd: Math.sqrt(v.reduce((a, x) => a + (x - v.reduce((p, q) => p + q, 0) / v.length) ** 2, 0) / v.length) };
}

async function meanLogScore(samples, arm) {
  const c = compose(samples, arm), d2 = await d2Of(c);
  let sum = 0;
  c.forEach((s, i) => { sum += logScore(d2[i], s.m, s.l.C); });
  return sum / c.length;
}
/** Cells of composed samples: band, per-axis z, and the two-way interval of mean d2/3 and coverage. */
async function cellsOf(samples, arm, label, { intervals = false } = {}) {
  const c = compose(samples, arm), d2 = await d2Of(c), by = {};
  c.forEach((s, i) => { (by[s.l.L] ??= []).push({ s, d2: d2[i] }); });
  const out = {};
  for (const [L, list] of Object.entries(by)) {
    const n = list.length, mean = list.reduce((a, x) => a + x.d2, 0) / n / 3, cov = list.filter((x) => x.d2 <= CHI).length / n;
    const z = [0, 1, 2].map((k) => list.map(({ s }) => s.l.err[k] / Math.sqrt(s.m[AXES[k]] + s.l.C)));
    const cell = { n, clusters: new Set(list.map((x) => x.s.w.cluster)).size, satellites: new Set(list.map((x) => x.s.w.norad)).size, meanD2over3: mean, coverage: cov, inBand: mean >= V.band.meanD2over3[0] && mean <= V.band.meanD2over3[1] && cov >= V.band.coverage95[0] && cov <= V.band.coverage95[1],
      meanZ2: z.map((a) => a.reduce((p, q) => p + q * q, 0) / n), meanZ: z.map((a) => a.reduce((p, q) => p + q, 0) / n) };
    if (intervals) {
      cell.mean95 = twoWay(list.map((x) => ({ cluster: x.s.w.cluster, day: Math.floor(x.s.w.tIn / 86400e3), value: x.d2 / 3 })), { label: `${label}|mean|${L}` });
      cell.coverage95 = twoWay(list.map((x) => ({ cluster: x.s.w.cluster, day: Math.floor(x.s.w.tIn / 86400e3), value: x.d2 <= CHI ? 1 : 0 })), { label: `${label}|coverage|${L}` });
    }
    out[L] = cell;
  }
  return out;
}
async function contrast(samples, a, b, label) {
  const ca = compose(samples, a), cb = compose(samples, b), da = await d2Of(ca), db = await d2Of(cb);
  const list = ca.map((s, i) => ({ cluster: s.w.cluster, day: Math.floor(s.w.tIn / 86400e3), L: s.l.L, value: logScore(da[i], s.m, s.l.C) - logScore(db[i], cb[i].m, s.l.C) }));
  const mean = list.reduce((x, y) => x + y.value, 0) / list.length;
  return { n: list.length, mean, ...twoWay(list, { label }), byLead: Object.fromEntries(LEADS.map((L) => { const x = list.filter((q) => q.L === L); return [L, x.length ? { n: x.length, mean: x.reduce((p, q) => p + q.value, 0) / x.length, ...twoWay(x, { label: `${label}|${L}`, resamples: 2000 }) } : null]; })) };
}

const pathOf = (name) => path.join(results, `${name}.json`);

if (args.pref) {
  const out = { plan: 'section 2 P_ref, section 5 P-REF', intervalNote: 'The interval of corr is the two-way bootstrap of the mean standardized product, which is why its bounds pass +/-1. The rule does not change.', classes: {} };
  for (const cls of Object.keys(CLASSES)) {
    const D = loadClass(cls, { opened });
    const cal = samplesOf(D, 'calibration').filter((s) => s.primary && s.l.ref?.minusTruthRtnM);
    const kRef = [0, 1].map((g) => [0, 1, 2].map((k) => { const x = cal.filter((s) => groupOf(s.l.L) === g); return x.length ? Math.exp(axesMleRef(x.map((s) => ({ e: s.l.ref.minusTruthRtnM[k], a: s.l.ref.covRtn[AXES[k]], c: s.l.C })), 0)) : 1; }));
    // |corr(forecast - truth, reference - truth)| per axis and lead: Pearson, with the two-way interval of the mean of the standardized product
    const all = samplesOf(D).filter((s) => s.primary && s.l.ref?.minusTruthRtnM);
    const corr = {};
    for (const L of LEADS) for (let k = 0; k < 3; k += 1) {
      const x = all.filter((s) => s.l.L === L);
      if (x.length < 30) continue;
      const a = x.map((s) => s.l.err[k]), b = x.map((s) => s.l.ref.minusTruthRtnM[k]), ma = a.reduce((p, q) => p + q, 0) / a.length, mb = b.reduce((p, q) => p + q, 0) / b.length;
      const sa = Math.sqrt(a.reduce((p, q) => p + (q - ma) ** 2, 0) / a.length), sb = Math.sqrt(b.reduce((p, q) => p + (q - mb) ** 2, 0) / b.length);
      const r = a.reduce((p, q, i) => p + (q - ma) * (b[i] - mb), 0) / a.length / (sa * sb);
      const iv = twoWay(x.map((s, i) => ({ cluster: s.w.cluster, day: Math.floor(s.w.tIn / 86400e3), value: ((a[i] - ma) * (b[i] - mb)) / (sa * sb) })), { label: `C3S|pref|${cls}|${L}|${k}`, resamples: 2000 });
      corr[`${L}|${'RTN'[k]}`] = { n: x.length, r, lo: iv.lo, hi: iv.hi, stop: Math.abs(r) >= 0.2 && (iv.lo > 0 || iv.hi < 0) };
    }
    out.classes[cls] = { counts: D.counts, classMedianChi: D.classMedian, kRef: { groups: ['1-12 h', '24-72 h'], axes: 'RTN', values: kRef }, samples: cal.length, corr, corrStops: Object.entries(corr).filter(([, v]) => v.stop).map(([k]) => k) };
  }
  console.log(writeReceipt('precheck-P-REF', out, opened));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out.classes).map(([k, v]) => [k, { counts: v.counts, kRef: v.kRef.values, corrStops: v.corrStops, maxCorr: Math.max(...Object.values(v.corr).map((x) => Math.abs(x.r))) }]))));
  process.exit(0);
}

if (args.fit) {
  const cls = args.class, history = args.history ?? 'truth'; // the model is 'truth' (C3-A8); 'reference' is the report-only arm, fitted on its own
  const pref = JSON.parse(fs.readFileSync(pathOf('precheck-P-REF')));
  const kRef = pref.classes[cls].kRef.values;
  const D = loadClass(cls, { opened });
  // C3-A9: every constant by the log score of calibration windows with the whole 90 days behind them; earlier windows serve as history and are reported
  const FROM = Date.parse(`${config.model.fitFrom}T00:00:00Z`), calAll = samplesOf(D, 'calibration').filter((s) => s.primary), cal = calAll.filter((s) => s.w.E >= FROM), calEarly = calAll.filter((s) => s.w.E < FROM), val = samplesOf(D, 'validation').filter((s) => s.primary);
  const M = config.model;
  // the score of an arm at its best kappa: in closed form where C_w is 0 (R3: d2 scales by 1/kappa and the log determinant by 3 ln kappa), else a fixed golden section on ln kappa
  const scoreK = async (arm, iterations = 10) => {
    const c = compose(cal, { ...arm, kappa: 1 });
    if (cal.every((s) => !s.l.C)) {
      const d2 = await d2Of(c), kappa = d2.reduce((p, q) => p + q, 0) / d2.length / 3;
      let sum = 0;
      c.forEach((s, i) => { sum += logScore(d2[i] / kappa, s.m.map((x) => x * kappa), 0); });
      return { kappa, score: sum / c.length };
    }
    const at = async (x) => { const kappa = Math.exp(x), k = c.map((s) => ({ ...s, m: s.m.map((q) => q * kappa) })), d2 = await d2Of(k); let sum = 0; k.forEach((s, i) => { sum += logScore(d2[i], s.m, s.l.C); }); return sum / k.length; };
    const R = (Math.sqrt(5) - 1) / 2;
    let lo = -1.6, hi = 1.6, x1 = hi - R * (hi - lo), x2 = lo + R * (hi - lo), f1 = await at(x1), f2 = await at(x2);
    for (let i = 0; i < iterations; i += 1) {
      if (f1 >= f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - R * (hi - lo); f1 = await at(x1); } else { lo = x1; x1 = x2; f1 = f2; x2 = lo + R * (hi - lo); f2 = await at(x2); }
    }
    return f1 >= f2 ? { kappa: Math.exp(x1), score: f1 } : { kappa: Math.exp(x2), score: f2 };
  };
  const axis = (a) => { const o = []; for (let x = a.min; x <= a.max + 1e-9; x += a.step) o.push(Math.round(x * 1e6) / 1e6); return o; };
  const A0 = axis(M.a0), A1 = axis(M.a1);
  const t0 = Date.now();
  const arms = {};
  arms['C3-0'] = { useG: false, useU: false };
  // C3-a: the grid, then refined
  const best = (list) => list.reduce((p, q) => (q.score > p.score ? q : p));
  const scan = async (grid, f) => { const out = []; for (const g of grid) out.push({ ...g, ...(await f(g)) }); return out; };
  const refine = async (p, f) => { const out = []; for (let i = -4; i <= 4; i += 1) for (let j = -4; j <= 4; j += 1) out.push({ ...p, a0: Math.round((p.a0 + i * 0.025) * 1e6) / 1e6, a1: Math.round((p.a1 + j * 0.05) * 1e6) / 1e6 }); return best(await scan(out, f)); };
  const gridA = A0.flatMap((a0) => A1.map((a1) => ({ a0, a1 })));
  const fA = async (g) => ({ score: await meanLogScore(cal, { ...g, useG: true }) });
  const a1st = best(await scan(gridA, fA));
  arms['C3-a'] = { ...(await refine(a1st, fA)), useG: true };
  console.error(cls, 'C3-a', JSON.stringify(arms['C3-a']), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // C3-a with its own class scale: a comparator for attribution and nothing else (C3-A10)
  const fAK = (g) => scoreK({ ...g, useG: true });
  arms['C3-a-k'] = { ...(await refine(best(await scan(gridA, fAK)), fAK)), useG: true };
  Object.assign(arms['C3-a-k'], await scoreK(arms['C3-a-k'], 30));
  console.error(cls, 'C3-a-k', JSON.stringify(arms['C3-a-k']), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const bList = await scan(M.n0.map((n0) => ({ n0 })), async (g) => ({ score: await meanLogScore(cal, { ...g, useU: true, kRef, history }) }));
  arms['C3-b'] = { ...best(bList), useU: true, kRef, history };
  console.error(cls, 'C3-b', JSON.stringify(bList), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const fAB = async (g) => ({ score: await meanLogScore(cal, { ...g, useG: true, useU: true, kRef, history }) });
  const gridAB = M.n0.flatMap((n0) => gridA.map((g) => ({ ...g, n0 })));
  const ab1st = best(await scan(gridAB, fAB));
  arms['C3-ab'] = { ...(await refine(ab1st, fAB)), useG: true, useU: true, kRef, history };
  console.error(cls, 'C3-ab', JSON.stringify({ ...arms['C3-ab'], kRef: undefined }), `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // the report-only arm's own constants, beside the model's
  if (history === 'truth') {
    const ref = JSON.parse(fs.readFileSync(pathOf(`fit-${cls}.reference`)));
    arms['C3-b-ref'] = { n0: ref.arms['C3-b'].n0, useU: true, kRef, history: 'reference' };
    arms['C3-ab-ref'] = { a0: ref.arms['C3-ab'].a0, a1: ref.arms['C3-ab'].a1, n0: ref.arms['C3-ab'].n0, useG: true, useU: true, kRef, history: 'reference' };
  }
  const report = { class: cls, history, fitFrom: config.model.fitFrom, kRef, counts: D.counts, classMedianChi: D.classMedian, samples: { calibrationFitted: cal.length, calibrationEarly: calEarly.length, validation: val.length }, arms: {} };
  for (const [name, arm] of Object.entries(arms)) {
    report.arms[name] = { a0: arm.a0 ?? null, a1: arm.a1 ?? null, n0: arm.n0 ?? null, kappa: arm.kappa ?? 1, calibrationLogScore: arm.score ?? await meanLogScore(cal, arm),
      calibration: await cellsOf(cal, arm, `C3S|boot|${cls}|${name}|cal`, { intervals: false }), calibrationEarly: calEarly.length ? await cellsOf(calEarly, arm, `C3S|boot|${cls}|${name}|early`, { intervals: false }) : {}, validation: await cellsOf(val, arm, `C3S|boot|${cls}|${name}|val`, { intervals: true }) };
  }
  report.validationContrasts = { 'C3-ab - C3-0': await contrast(val, arms['C3-ab'], arms['C3-0'], `C3S|boot|${cls}|contrast|ab-0`), 'C3-ab - C3-a-k': await contrast(val, arms['C3-ab'], arms['C3-a-k'], `C3S|boot|${cls}|contrast|ab-ak`), 'C3-ab - C3-a': await contrast(val, arms['C3-ab'], arms['C3-a'], `C3S|boot|${cls}|contrast|ab-a`) };
  report.stop = report.validationContrasts['C3-ab - C3-0'].hi < 0;
  if (history === 'truth') {
    report.validationContrasts['C3-ab - C3-ab-ref'] = await contrast(val, arms['C3-ab'], arms['C3-ab-ref'], `C3S|boot|${cls}|contrast|ab-abref`);
    report.stopAgainstReference = report.validationContrasts['C3-ab - C3-ab-ref'].hi < 0;
  }
  report.seconds = (Date.now() - t0) / 1000;
  console.log(writeReceipt(history === 'truth' ? `fit-${cls}` : `fit-${cls}.${history}`, report, opened));
  console.log(JSON.stringify({ cls, a: { a0: report.arms['C3-a'].a0, a1: report.arms['C3-a'].a1 }, ak: { a0: report.arms['C3-a-k'].a0, a1: report.arms['C3-a-k'].a1, kappa: report.arms['C3-a-k'].kappa }, b: report.arms['C3-b'].n0, ab: { a0: report.arms['C3-ab'].a0, a1: report.arms['C3-ab'].a1, n0: report.arms['C3-ab'].n0 }, scores: Object.fromEntries(Object.entries(report.arms).map(([k, v]) => [k, v.calibrationLogScore])), contrasts: Object.fromEntries(Object.entries(report.validationContrasts).map(([k, v]) => [k, { mean: v.mean, lo: v.lo, hi: v.hi }])), stop: report.stop, stopAgainstReference: report.stopAgainstReference ?? null }));
  process.exit(0);
}

if (args.pref2) {
  // P-REF's second check, a report since C3-A8: per class, axis and lead, the reference-based e^u against the truth-based e^u (the same history, the error against truth, c = the truth term alone), at the reference arm's a0, a1, n0 and k_ref
  const out = { plan: 'section 5 P-REF, a report (C3-A8)', limit: 0.1, classes: {} };
  for (const cls of Object.keys(CLASSES)) {
    const fit = JSON.parse(fs.readFileSync(pathOf(`fit-${cls}.reference`))), ab = fit.arms['C3-ab'], kRef = fit.kRef;
    const D = loadClass(cls, { opened }), rows = [];
    for (const L of LEADS) for (let k = 0; k < 3; k += 1) {
      const ratios = [];
      for (const w of [...D.windows.values()].flat()) {
        const H = (w.hist.get(L) ?? []).filter(({ l }) => l.err);
        if (H.length < 5) continue;
        const a = H.map(({ j, l }) => gOf(j.chi, j.chiRef, ab.a0, ab.a1, L) * l.P[AXES[k]]);
        const uRef = axesMleRef(H.map(({ l }, i) => ({ e: l.ref.errRtnM[k], a: a[i], c: kRef[groupOf(L)][k] * l.ref.covRtn[AXES[k]] + l.C })), ab.n0);
        const uTruth = axesMleRef(H.map(({ l }, i) => ({ e: l.err[k], a: a[i], c: l.C })), ab.n0);
        ratios.push(Math.exp(uRef - uTruth));
      }
      if (ratios.length) { const m = median(ratios); rows.push({ L, axis: 'RTN'[k], windows: ratios.length, medianRatio: m, off: m - 1, stop: Math.abs(m - 1) > 0.1 }); }
    }
    out.classes[cls] = { rows, stops: rows.filter((r) => r.stop), worst: rows.length ? rows.reduce((p, q) => (Math.abs(q.off) > Math.abs(p.off) ? q : p)) : null };
    console.error(cls, 'worst', JSON.stringify(out.classes[cls].worst), 'stops', out.classes[cls].stops.length);
  }
  out.withinLimit = Object.values(out.classes).every((c) => !c.stops.length);
  console.log(writeReceipt('precheck-P-REF2', out, opened));
  process.exit(0);
}

if (args['pref-gfz']) {
  // C3-A5, C3-A8: on calibration windows of R3's GNSS satellites, e^u_hat against ESA's truth and against GFZ's positions at the same epochs, on the same history, at the fitted constants; only the error changes. The stop.
  // --arm reference: the same comparison with the registered reference in ESA's place, at the reference arm's constants and c. A report.
  const useRef = args.arm === 'reference';
  const R = config.pRefGfz, fit = JSON.parse(fs.readFileSync(pathOf(useRef ? 'fit-R3.reference' : 'fit-R3'))), ab = fit.arms['C3-ab'], kRef = fit.kRef;
  const D = loadClass('R3', { opened }), P = config.population.judged;
  const CL = { GLONASS: [...P.glonass.c2, ...P.glonass.new], Galileo: [...P.galileo.new, ...P.galileo.c2Six] };
  const out = { plan: useRef ? 'section 5 P-REF against GFZ, the reference arm, a report (C3-A8)' : 'section 5 P-REF against GFZ, C3-A5 and C3-A8', rule: R, classes: {} };
  const medianIn = (v) => median(v);
  for (const [cls, list] of Object.entries(CL)) {
    const rows = [];
    for (const L of LEADS) for (let k = 0; k < 3; k += 1) {
      const per = [];
      for (const o of list) {
        const ratios = [], beside = [];
        for (const w of (D.windows.get(o) ?? []).filter((x) => x.set === 'calibration')) {
          const H = (w.hist.get(L) ?? []).filter(({ l }) => l.gfz?.errRtnM && l.err);
          if (H.length < R.minHistory) continue;
          const a = H.map(({ j, l }) => gOf(j.chi, j.chiRef, ab.a0, ab.a1, L) * l.P[AXES[k]]), c = H.map(({ l }) => (useRef ? kRef[groupOf(L)][k] * l.ref.covRtn[AXES[k]] : 0) + l.C);
          const uEsa = axesMleRef(H.map(({ l }, i) => ({ e: useRef ? l.ref.errRtnM[k] : l.err[k], a: a[i], c: c[i] })), ab.n0);
          const uGfz = axesMleRef(H.map(({ l }, i) => ({ e: l.gfz.errRtnM[k], a: a[i], c: c[i] })), ab.n0);
          const extra = H.reduce((p, { l }) => p + (l.gfz.errRtnM[k] - l.err[k]) ** 2, 0) / H.length;
          const uBeside = axesMleRef(H.map(({ l }, i) => ({ e: l.gfz.errRtnM[k], a: a[i], c: c[i] + extra })), ab.n0);
          ratios.push(Math.exp(uEsa - uGfz)); beside.push(Math.exp(uEsa - uBeside));
        }
        if (ratios.length) per.push({ o, windows: ratios.length, ratio: medianIn(ratios), beside: medianIn(beside) });
      }
      if (!per.length) continue;
      const m = medianIn(per.map((x) => x.ratio)), rand = rngOf(seedOf(`C3S|pref-gfz|${cls}|${'RTN'[k]}|${L}`)), boots = new Float64Array(R.bootstrap.resamples);
      for (let b = 0; b < boots.length; b += 1) boots[b] = medianIn(Array.from({ length: per.length }, () => per[Math.floor(rand() * per.length)].ratio));
      const sorted = [...boots].sort((x, y) => x - y);
      rows.push({ L, axis: 'RTN'[k], satellites: per.length, medianRatio: m, interval95: [sorted[Math.floor(sorted.length * 0.025)], sorted[Math.floor(sorted.length * 0.975)]], medianBeside: medianIn(per.map((x) => x.beside)), below090: per.filter((x) => x.ratio < 0.9).map((x) => ({ norad: x.o, ratio: x.ratio, beside: x.beside })), perSatellite: per, stop: m < R.stop.medianBelow });
    }
    out.classes[cls] = { rows, stops: rows.filter((r) => r.stop).map((r) => `${r.axis} ${r.L} h`) };
    for (const r of rows) console.error(cls, r.axis, r.L, 'median', r.medianRatio.toFixed(3), `[${r.interval95[0].toFixed(3)}, ${r.interval95[1].toFixed(3)}]`, 'beside', r.medianBeside.toFixed(3), 'below 0.90:', r.below090.map((x) => `${x.norad} ${x.ratio.toFixed(2)}`).join(', '));
  }
  out.pass = Object.values(out.classes).every((c) => !c.stops.length);
  console.log(writeReceipt(useRef ? 'precheck-P-REF-GFZ.reference' : 'precheck-P-REF-GFZ', out, opened));
  console.log(JSON.stringify({ pass: out.pass, stops: Object.fromEntries(Object.entries(out.classes).map(([k, v]) => [k, v.stops])) }));
  process.exit(0);
}

if (args.freeze) {
  // What the freeze commit holds (PLAN.md section 6): the constants, k_ref, gate thresholds, dependence parameters and the fetch manifest rule. Written once, from the receipts; run.mjs --check reads it.
  const inputs = JSON.parse(fs.readFileSync(path.join(store, 'p7', 'inputs.json'))), summary = JSON.parse(fs.readFileSync(path.join(store, 'p7', 'summary.json')));
  const classes = Object.fromEntries(Object.keys(CLASSES).map((cls) => { const fit = JSON.parse(fs.readFileSync(pathOf(`fit-${cls}`))), ab = fit.arms['C3-ab'], ref = fit.arms['C3-ab-ref'], constants = (a) => ({ a0: a.a0, a1: a.a1, n0: a.n0, kappa: a.kappa }); return [cls, { history: fit.history, fitFrom: fit.fitFrom, a0: ab.a0, a1: ab.a1, n0: ab.n0, classMedianChi: fit.classMedianChi, fitReceiptSha256: sha256(fs.readFileSync(pathOf(`fit-${cls}`))), reportedArms: Object.fromEntries(['C3-a', 'C3-a-k', 'C3-b'].map((n) => [n, constants(fit.arms[n])])), referenceArm: { reportOnly: true, a0: ref.a0, a1: ref.a1, n0: ref.n0, n0B: fit.arms['C3-b-ref'].n0, kRef: fit.kRef, kRefGroups: ['1-12 h', '24-72 h'], fitReceiptSha256: sha256(fs.readFileSync(pathOf(`fit-${cls}.reference`))) } }]; }));
  const heavy = Object.fromEntries(Object.entries(summary).filter(([k]) => k.endsWith('.base-heavy')).map(([k, v]) => [k.split('.')[0], { nEff: v.nEff, n: v.n, meanCov: v.meanCov }]));
  const body = { experiment: config.id, frozenUtc: new Date().toISOString(), c2ConstantsSha256: config.c2.constantsSha256, classes,
    gate: { verdict: config.verdict, nEffHeavy: heavy, judged: args.judged ?? null, q6: config.q6 },
    dependence: { d2: inputs.d2, z: inputs.z, samePlaneByConstellation: inputs.samePlaneByConstellation, marginal: Object.fromEntries(Object.entries(inputs.marginal).map(([L, m]) => [L, { n: m.n, rawMean: m.rawMean, covAtMean1: m.covAtMean1, varPerWindow: m.varPerWindow }])) },
    fetchManifest: config.fetchManifest };
  const file = pathOf('frozen-constants');
  if (fs.existsSync(file)) throw new Error(`${file} exists: the freeze is written once`);
  fs.writeFileSync(file, `${JSON.stringify(body, null, 1)}\n`);
  console.log(file, sha256(fs.readFileSync(file)));
  process.exit(0);
}

if (args.extract) {
  const cls = args.class;
  const fit = JSON.parse(fs.readFileSync(pathOf(`fit-${cls}`)));
  const ab = fit.arms['C3-ab'], arm = { a0: ab.a0, a1: ab.a1, n0: ab.n0, useG: true, useU: true, kRef: fit.kRef, history: fit.history };
  const D = loadClass(cls, { opened });
  const all = samplesOf(D);
  const c = compose(all, arm), d2 = await d2Of(c);
  const rows = c.map((s, i) => ({ o: s.w.norad, cl: s.w.cluster, set: s.w.set, E: new Date(s.w.E).toISOString(), t: s.w.tIn / 86400e3, L: s.l.L, d2: d2[i], e: s.l.err, st: s.w.state.slice(0, 6), z: [0, 1, 2].map((k) => s.l.err[k] / Math.sqrt(s.m[AXES[k]] + s.l.C)), storm: s.l.storm, notice: s.w.notice, primary: s.primary, u: s.u, g: s.g, nHist: s.w.hist.get(s.l.L)?.length ?? 0, screen: Boolean(s.w.screen?.flagged) }));
  fs.mkdirSync(path.join(store, 'extract'), { recursive: true });
  const P = config.population.judged, everyone = [...Object.values(P.ilrsa), ...Object.values(P.nsgf), ...P.glonass.c2, ...P.glonass.new, ...P.galileo.new, ...P.galileo.c2Six];
  const clusterOf = clusterMap(D.sinex);
  fs.writeFileSync(path.join(store, 'extract', `${cls}.json`), JSON.stringify({ cls, rows, clusters: Object.fromEntries(everyone.map((n) => [n, clusterOf(n)])), stormDaysCalVal: [...D.storms].filter((d) => d >= '2025-10-03').sort() }));
  console.log(rows.length);
  process.exit(0);
}
