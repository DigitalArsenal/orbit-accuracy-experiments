// C2 pre-checks on the data alone (PLAN.md 3.8), before any fit:
//   P9  data availability: per object the converted truth spans, the cutoffs of each set whose [E - 24 h, E + 72 h] the spans cover, the
//       COSMIC-2 count, and the GNSS sample by the lowest SHA-256 of `C2|P9|<class>|<norad>` among satellites with coverage;
//   P2  truth quality: each NSGF arc's stated overlap RMS with the next day's arc (index.json statedSigmaM, per axis) against 0.3 m;
//   P11 oracle power: per cell size, the probability that a perfectly calibrated covariance passes the band (chi-square 3 draws), and
//       the 5-object, 15 % scale-error case.
// Index files only (no state is read). Statistics only.
//   node experiments/ffm-covariance-calibration/precheck-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, Opened, writeReceipt, sha256, REFERENCE_ROOTS, NAMED, clusterOf, DAY, HOUR, iso } from './common.mjs';
import { rng } from '../../harness/stats.mjs';

frozen();
const opened = new Opened();
const S = config.split;

// ── the spans of every object in every reference root (index.json only) ──
const spans = new Map(); // norad -> [{start, stop, product, system, root}]
for (const r of REFERENCE_ROOTS) {
  for (const product of fs.readdirSync(opened.add(r, 'reference root (listing)'))) {
    const f = path.join(r, product, 'index.json');
    if (!fs.existsSync(f)) continue;
    const ix = JSON.parse(opened.read(f, 'index.json'));
    for (const o of ix.objects) {
      const system = /SP3 satellite ([A-Z])\d/.exec(o.comment ?? '')?.[1] ?? null;
      const list = spans.get(o.norad) ?? [];
      list.push({ start: Date.parse(o.start), stop: Date.parse(o.stop), product, system, root: r, statedSigmaM: ix.statedSigmaM ?? null });
      spans.set(o.norad, list);
    }
  }
}
for (const l of spans.values()) l.sort((a, b) => a.start - b.start);

/** Whether the spans of `list` cover [a, b] with no hole longer than `gap` ms. */
function covers(list, a, b, gap = 30 * 60e3) {
  let t = a;
  for (const s of list) { if (s.stop < t) continue; if (s.start > t + gap) return false; t = Math.max(t, s.stop); if (t >= b) return true; }
  return t >= b;
}
const cutoffs = (from, to, everyDays = 2) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += everyDays * DAY) out.push(t); return out; };
const CAL = cutoffs(S.calibration.cutoffs.from, S.calibration.cutoffs.to, S.calibration.cutoffs.everyDays);
const VAL = cutoffs(S.validation.cutoffs.from, S.validation.cutoffs.to, S.validation.cutoffs.everyDays);
const HOT = (last) => cutoffs(S.heldOutTime.from, iso(last - 72 * HOUR).slice(0, 10), 2);
const usable = (list, Es) => Es.filter((E) => covers(list, E - 24 * HOUR, E + 72 * HOUR));

// ── GNSS and COSMIC-2 sample (P9): coverage = spans cover >= 90 % of the days of [first calibration E - 24 h, last validation E + 72 h] ──
const coverFrom = CAL[0] - 24 * HOUR, coverTo = VAL.at(-1) + 72 * HOUR;
const dayCoverage = (list) => { let days = 0, held = 0; for (let t = coverFrom; t < coverTo; t += DAY) { ++days; if (list.some((s) => s.start <= t + 12 * HOUR && s.stop >= t + 12 * HOUR)) ++held; } return held / days; };
const pick = (cls, candidates, count) => candidates.map((n) => ({ norad: n, key: sha256(`C2|P9|${cls}|${n}`) })).sort((a, b) => (a.key < b.key ? -1 : 1)).slice(0, count);
const esa = (system) => [...spans].filter(([, l]) => l.some((s) => s.system === system && s.product.startsWith('ESA0OPSFIN'))).map(([n, l]) => [n, l.filter((s) => s.product.startsWith('ESA0OPSFIN'))]);
const gnss = {};
for (const [cls, system] of [['GPS', 'G'], ['GLONASS', 'R'], ['Galileo', 'E']]) {
  const all = esa(system).map(([n, l]) => ({ norad: n, coverage: dayCoverage(l) }));
  gnss[cls] = { truthProduct: 'ESA0OPSFIN (ESA final, one product per object)', satellites: all.length, withCoverage: all.filter((x) => x.coverage >= 0.9).map((x) => x.norad).sort((a, b) => a - b), coverage: Object.fromEntries(all.map((x) => [x.norad, Number(x.coverage.toFixed(4))])) };
}
const cosmicAll = [...spans].filter(([, l]) => l.some((s) => s.product.startsWith('leoOrb'))).map(([n, l]) => ({ norad: n, coverage: dayCoverage(l.filter((s) => s.product.startsWith('leoOrb'))) }));
const cosmic = { truthProduct: 'UCAR COSMIC-2 leoOrb (reference-leo-pod-2)', satellites: cosmicAll.map((x) => x.norad).sort((a, b) => a - b), withCoverage: cosmicAll.filter((x) => x.coverage >= 0.9).map((x) => x.norad).sort((a, b) => a - b), coverage: Object.fromEntries(cosmicAll.map((x) => [x.norad, Number(x.coverage.toFixed(4))])) };
const counts = S.sampleSelection.counts;
const sample = {
  GPS: pick('GPS', gnss.GPS.withCoverage, counts.calibration.GPS),
  GLONASS: pick('GLONASS', gnss.GLONASS.withCoverage, counts.calibration.GLONASS),
  Galileo: pick('Galileo', gnss.Galileo.withCoverage, counts.heldOutObject.Galileo),
  'COSMIC-2': pick('COSMIC-2', cosmic.withCoverage, counts.calibration['COSMIC-2'] + counts.heldOutObject['COSMIC-2']),
};
const cosmicNeeded = counts.calibration['COSMIC-2'] + counts.heldOutObject['COSMIC-2'];

// ── windows per object and set ──
const objectsOf = {
  R1: { calibration: ['Swarm A', 'Swarm C', 'Swarm B', 'GRACE-FO 1', 'GRACE-FO 2'], heldOutObject: ['TerraSAR-X'] },
  R2: { calibration: ['Sentinel-1A', 'Sentinel-1C', 'Ajisai', 'LARES', 'LARETS', 'Starlette', 'WESTPAC'], heldOutObject: ['Stella', 'Sentinel-1D'] },
  R3: { calibration: ['LAGEOS-2', 'LARES-2', 'Etalon-1', 'Etalon-2'], heldOutObject: ['LAGEOS-1'] },
};
const perObject = [];
const row = (cls, set, name, norad, preferPrefix = null) => {
  const all = spans.get(norad) ?? [];
  const list = preferPrefix ? all.filter((s) => s.product.startsWith(preferPrefix)) : all;
  const last = list.length ? Math.max(...list.map((s) => s.stop)) : null;
  const r = { class: cls, set, name, norad, cluster: clusterOf(norad), products: [...new Set(list.map((s) => s.product.replace(/[._0-9].*$/, '')))], first: list.length ? iso(list[0].start) : null, last: last ? iso(last) : null };
  if (set === 'calibration') Object.assign(r, { calibration: usable(list, CAL).length, validation: usable(list, VAL).length, heldOutTime: last ? usable(list, HOT(last)).length : 0 });
  else Object.assign(r, { heldOutObject: usable(list, [...CAL, ...VAL, ...(last ? HOT(last) : [])]).length });
  perObject.push(r);
};
for (const [cls, sets] of Object.entries(objectsOf)) for (const [set, names] of Object.entries(sets)) for (const name of names) row(cls, set, name, NAMED[name]);
sample.GPS.forEach((x) => row('R3', 'calibration', 'GPS', x.norad, 'ESA0OPSFIN'));
sample.GLONASS.forEach((x) => row('R3', 'calibration', 'GLONASS', x.norad, 'ESA0OPSFIN'));
sample.Galileo.forEach((x) => row('R3', 'heldOutObject', 'Galileo', x.norad, 'ESA0OPSFIN'));
sample['COSMIC-2'].forEach((x, i) => row('R1', i < counts.calibration['COSMIC-2'] ? 'calibration' : 'heldOutObject', 'COSMIC-2', x.norad, 'leoOrb'));
const totals = {};
for (const r of perObject) for (const k of ['calibration', 'validation', 'heldOutTime', 'heldOutObject']) if (r[k] !== undefined) { totals[r.class] ??= {}; totals[r.class][k] = (totals[r.class][k] ?? 0) + r[k]; }
const clusters = {};
for (const r of perObject) for (const k of ['calibration', 'heldOutObject']) if (r.set === k) { clusters[r.class] ??= {}; (clusters[r.class][k] ??= new Set()).add(r.cluster); }
const clusterCounts = Object.fromEntries(Object.entries(clusters).map(([c, v]) => [c, Object.fromEntries(Object.entries(v).map(([k, s]) => [k, s.size]))]));

const missing = perObject.filter((r) => !r.products.length).map((r) => `${r.name} (${r.norad}): no converted truth in the reference roots`);
const p9 = {
  plan: '3.8 P9, 3.4',
  rule: 'windows counted where the truth spans cover [E - 24 h, E + 72 h] with no hole over 30 min (the 90 % epoch rule is applied per window at run time); cutoffs every second day; held-out by time from 2026-06-01 to the last span minus 72 h every second day',
  gnss, cosmic, sample, perObject, totals, clusterCounts, missing,
  outcome: cosmic.withCoverage.length >= cosmicNeeded && !missing.length ? 'pass' : 'FAIL',
  failures: [
    ...(cosmic.withCoverage.length < cosmicNeeded ? [`COSMIC-2: ${cosmic.withCoverage.length} satellites with coverage (${cosmic.satellites.join(', ')}), ${cosmicNeeded} needed (4 calibration + 2 held out)`] : []),
    ...missing,
  ],
};
console.log(writeReceipt('precheck-P9', p9, opened));

// ── P2: NSGF consecutive-arc overlaps (stated per-axis RMS with the next day's arc) ──
const nsgf = {};
for (const [n, l] of spans) for (const s of l.filter((x) => x.product.startsWith('nsgf.orb.'))) {
  const name = s.product.split('.')[2];
  (nsgf[name] ??= { norad: n, arcs: 0, stated: 0, over: [], values: [] });
  nsgf[name].arcs += 1;
  if (Number.isFinite(s.statedSigmaM)) { nsgf[name].stated += 1; nsgf[name].values.push(s.statedSigmaM); if (s.statedSigmaM > config.precheckThresholds.P2.nsgfOverlapRms_m) nsgf[name].over.push({ product: s.product, rmsM: Number(s.statedSigmaM.toFixed(4)) }); }
}
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : null; };
const p2rows = Object.fromEntries(Object.entries(nsgf).map(([k, v]) => [k, { norad: v.norad, arcs: v.arcs, stated: v.stated, medianM: q(v.values, 0.5), p90M: q(v.values, 0.9), maxM: Math.max(...v.values), over: v.over }]));
const overTotal = Object.values(p2rows).reduce((a, v) => a + v.over.length, 0), arcsTotal = Object.values(p2rows).reduce((a, v) => a + v.arcs, 0);
console.log(writeReceipt('precheck-P2', {
  plan: '3.8 P2', criterion: 'each NSGF arc agrees with the next day\'s arc within 0.3 m RMS per axis (the stated sigma of analysis/reference-states: the per-axis RMS of the overlap)',
  issTruthAge: 'checked by the planner (PLAN.md section 1, row 7): minor', anomalyLedger: 'applied at run time through harness/truth-gate.mjs (every frame read)',
  nsgf: p2rows, arcsOver: overTotal, arcs: arcsTotal,
  outcome: overTotal === 0 ? 'pass' : 'FAIL',
  failures: Object.entries(p2rows).filter(([, v]) => v.over.length).map(([k, v]) => `${k}: ${v.over.length} of ${v.arcs} arcs above 0.3 m (median ${v.medianM?.toFixed(3)} m, p90 ${v.p90M?.toFixed(3)} m, max ${v.maxM.toFixed(3)} m)`),
  note: 'no exclusion is applied: the treatment of arcs above 0.3 m is a question to the coordinator',
}, opened));

// ── P11: oracle pass probability ──
function chi2(r) { let s = 0; for (let i = 0; i < 3; ++i) { const u1 = r() || 1e-12, u2 = r(); const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); s += z * z; } return s; }
function passProbability(n, { objects = 0, scaleSd = 0, trials = 4000, seed = 1 } = {}) {
  const r = rng(seed); let pass = 0;
  for (let t = 0; t < trials; ++t) {
    const scales = objects ? Array.from({ length: objects }, () => { const u1 = r() || 1e-12, u2 = r(); return Math.exp(scaleSd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)); }) : null;
    let sum = 0, inside = 0;
    for (let i = 0; i < n; ++i) { const d2 = chi2(r) * (scales ? scales[i % objects] : 1); sum += d2; if (d2 <= config.model.chi2_3_95) ++inside; }
    const m = sum / n / 3, c = inside / n;
    if (m >= config.band.meanD2over3[0] && m <= config.band.meanD2over3[1] && c >= config.band.coverage95[0] && c <= config.band.coverage95[1]) ++pass;
  }
  return pass / trials;
}
const grid = [30, 100, 200, 300, 500, 1000];
const p11 = {
  plan: '3.6, 3.8 P11', method: 'independent chi-square(3) draws (Box-Muller on SplitMix32, seed 1), 4,000 trials per size; the scale case multiplies each of 5 objects\' draws by exp(N(0, 0.15))',
  independent: Object.fromEntries(grid.map((n) => [n, passProbability(n)])),
  fiveObjectsScale15: Object.fromEntries(grid.map((n) => [n, passProbability(n, { objects: 5, scaleSd: 0.15, seed: 2 })])),
  perClassCell: Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, Object.fromEntries(Object.entries(t).map(([k, n]) => [k, { windows: n, oracle: n ? passProbability(n, { trials: 2000, seed: 3 }) : null }]))])),
  note: 'per class and set, the cell size is the window count of P9 (each window gives one sample per lead); the per-cell oracle pass count and its 5th percentile are recomputed with the realized cell sizes at scoring',
};
console.log(writeReceipt('precheck-P11', p11, opened));
