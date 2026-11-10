// The headline loop's statistics (stack #316): the round-0 referee's definition (goal.md) per cell, and the published statistic beside it.
// Used by score.mjs, cells.mjs and closing.mjs. Arithmetic on module errors only.
import { SETTINGS, isFullSetting } from './settings.mjs';

export const LN2 = Math.log(2);
export const LEAD_DEFINITION = 'RMS over the 24 h ending at the lead (lead 24 h: hours 0 to 24 after the fit; lead 168 h: hours 144 to 168)';
const LABEL = { T: 'Strong drag, 2025', P: 'Strong drag, 2026', S1: 'Near 700 km', GN: 'Medium Earth orbit', GN_GAL: 'Medium Earth orbit, Galileo (suite)', LS: 'Low orbit, laser spheres', DO: 'Low orbit, altimetry', GD: 'Laser geodetic', IG: 'Inclined geosynchronous', GE: 'Geostationary', HE: 'Highly elliptical', HX: 'Highly elliptical, THEMIS and Chandra', WA: 'Geostationary, commercial' };
// REF-7: the truth's stated accuracy, per axis, m, as the referee read it (parts/C1-reference.md, verdict table); null where none is stated.
export const TRUTH_SIGMA = {
  T: { m: 0.01, source: 'Swarm kinematic minus reduced-dynamic (archive index)' }, P: { m: 0.01, source: 'Swarm kinematic minus reduced-dynamic (archive index)' },
  S1: { m: 0.03, source: 'Copernicus POEORB requirement (not a measurement)' }, DO: { m: 0.03, source: 'assumed for the CNES/IDS orbit' },
  LS: { m: 3.6, source: 'NSGF arcs, worst object Larets 3.6 m (LARES 0.11 m), next-day overlap', bySatellite: { LARES: 0.11, LARETS: 3.6, WESTPAC: 1.1 } },
  GD: { m: 0.15, source: 'ILRS combination: LAGEOS 0.04, Etalon 0.15, LARES-2 0.03 m', bySatellite: { LAGEOS1: 0.04, LAGEOS2: 0.04, ETALON1: 0.15, ETALON2: 0.15, LARES2: 0.03 } },
  GN: { m: 0.025, source: 'IGS final (igs.org/products)' }, GN_GAL: { m: 0.025, source: 'IGS final' },
  IG: { m: null, source: 'decimeters (GFZ multi-GNSS, not read from the archive)' }, GE: { m: null, source: 'decimeters to meters (not read)' }, WA: { m: 2.0, source: 'WAAS stated range accuracy 2 m' },
  HE: { m: null, source: 'mission ephemeris, no stated accuracy' }, HX: { m: null, source: 'mission ephemerides, no stated accuracy' },
};
// goal.md qualification 1 (registered full settings with a radiation model fitted for the satellite) is isFullSetting; the gate's fit RMS per
// component is the weighted RMS times the arm's sigma (the estimation module whitens each component by it).

// ---------------------------------------------------------------- statistics ----------------------------------------------------------------
const asc = (a, b) => a - b;
export const quantile = (sorted, p) => { if (!sorted.length) return null; if (sorted.length === 1) return sorted[0]; const x = p * (sorted.length - 1), i = Math.floor(x), f = x - i; return sorted[i] + f * ((sorted[i + 1] ?? sorted[i]) - sorted[i]); };
export const median = (v) => quantile(v.filter(Number.isFinite).sort(asc), 0.5);
export function spearman(x, y) {
  const n = x.length; if (n < 3) return null;
  const rank = (v) => { const idx = v.map((x2, i) => [x2, i]).sort((a, b) => a[0] - b[0]); const r = new Array(n); for (let i = 0; i < n;) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j += 1; for (let k = i; k <= j; k += 1) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
  const rx = rank(x), ry = rank(y), mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i += 1) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
/** A seeded generator (mulberry32), so every interval reproduces. */
export function rng(seed = 20261110) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** The estimate over items [{ sat, block, value }]: the median over satellites of per-satellite medians (sat-median), the median of all values
 *  (paired-median), or the log of the ratio of medians of two arms (ratio-of-medians: value holds [a, b]). */
export function estimate(items, statistic) {
  if (!items.length) return null;
  if (statistic === 'ratio-of-medians') return Math.log(median(items.map((x) => x.value[0])) / median(items.map((x) => x.value[1])));
  if (statistic === 'paired-median') return median(items.map((x) => x.value));
  const by = new Map(); for (const x of items) (by.get(x.sat) ?? by.set(x.sat, []).get(x.sat)).push(x.value);
  return median([...by.values()].map(median));
}
/** Bootstrap interval (2.5 and 97.5 percentiles) of the estimate: two-way (satellites and time blocks resampled, a window kept as often as its
 *  satellite times its block was drawn), satellite (satellites alone), window (windows independent). null where it cannot be formed. */
export function bootstrap(items, statistic, how, draws = 2000, seed = 20261110) {
  const sats = [...new Set(items.map((x) => x.sat))], blocks = [...new Set(items.map((x) => x.block))];
  if (how === 'two-way' && (sats.length < 2 || blocks.length < 2)) return null;
  if (how === 'satellite' && sats.length < 2) return null;
  if (how === 'block' && blocks.length < 2) return null;
  if (items.length < 2) return null;
  const r = rng(seed), out = [];
  const bySat = new Map(sats.map((s) => [s, items.filter((x) => x.sat === s)]));
  for (let k = 0; k < draws; k += 1) {
    let pick = [];
    if (how === 'window') pick = items.map(() => items[Math.floor(r() * items.length)]);
    else {
      const sc = new Map(), bc = new Map();
      if (how === 'block') for (const s of sats) sc.set(s, 1);
      else for (let i = 0; i < sats.length; i += 1) { const s = sats[Math.floor(r() * sats.length)]; sc.set(s, (sc.get(s) ?? 0) + 1); }
      const byBlock = how === 'two-way' || how === 'block';
      if (byBlock) for (let i = 0; i < blocks.length; i += 1) { const b = blocks[Math.floor(r() * blocks.length)]; bc.set(b, (bc.get(b) ?? 0) + 1); }
      for (const [s, c] of sc) for (const x of bySat.get(s)) { const m = c * (byBlock ? (bc.get(x.block) ?? 0) : 1); for (let j = 0; j < m; j += 1) pick.push({ ...x, sat: `${x.sat}#${j % c}` }); }
    }
    const e = estimate(pick, statistic);
    if (Number.isFinite(e)) out.push(e);
  }
  if (out.length < draws / 2) return null;
  out.sort(asc);
  return [quantile(out, 0.025), quantile(out, 0.975)];
}
/** The exact distribution-free 95 % interval for the median over satellites of per-satellite values: [s(k), s(n-k+1)] with the largest k such
 *  that P(Binomial(n, 1/2) <= k - 1) <= 0.025. null under 6 satellites (no such k). */
export function orderInterval(values) {
  const v = values.filter(Number.isFinite).sort(asc), n = v.length;
  const binom = (k) => { let c = 1, s = 0; for (let i = 0; i <= k; i += 1) { s += c; c = (c * (n - i)) / (i + 1); } return s / 2 ** n; };
  let k = 0;
  while (k + 1 <= n && binom(k) <= 0.025) k += 1;
  return k >= 1 ? [v[k - 1], v[n - k]] : null;
}

// ---------------------------------------------------------------- cells ----------------------------------------------------------------
const LEAD_DAY = { 24: '1', 48: '2', 72: '3', 120: '5', 168: '7' };
/** Every cell of the rows: { group, fit, lead, ... statistics }. ref: the reference arm's key in the rows (FFMq, FFMc or FFMr). */
export function scoreCells(rows, { ref = 'FFMq', statistic = 'sat-median', interval = 'two-way', draws = 2000, leads = [24, 48, 72, 168] } = {}) {
  const cells = [];
  const ok = rows.filter((r) => !r.error && r.arms?.AP?.days);
  const groups = [...new Set(ok.map((r) => r.group))];
  for (const g of groups) for (const fit of [...new Set(ok.filter((r) => r.group === g).map((r) => r.arcH))].sort(asc)) for (const lead of leads) {
    const day = LEAD_DAY[lead];
    const list = ok.filter((r) => r.group === g && r.arcH === fit && r.arms.AP.days[day] && r.arms[ref]?.days?.[day]);
    if (!list.length) continue;
    const blockH = fit + lead, t0 = Math.min(...list.map((r) => Date.parse(r.cutoff)));
    const sig = TRUTH_SIGMA[g] ?? { m: null };
    const sigmaOf = (r) => { const by = sig.bySatellite; const k = String(r.name).toUpperCase().replace(/[^A-Z0-9]/g, ''); return by && Object.keys(by).find((x) => k.startsWith(x)) ? by[Object.keys(by).find((x) => k.startsWith(x))] : sig.m; };
    // reference-quality gate: the reference's fit RMS per component (weighted RMS x its sigma) against 3 times the truth's sigma
    const usable = (r) => { const s = sigmaOf(r); const fr = Number(r.arms[ref].weightedRms) * (SETTINGS[r.arms[ref].arm]?.sigmaM ?? NaN); return s == null || !Number.isFinite(fr) ? null : fr <= 3 * s; };
    const items = list.map((r) => ({ sat: r.name, block: Math.floor((Date.parse(r.cutoff) - t0) / (blockH * 3600000)), a: r.arms.AP.days[day].e, f: r.arms[ref].days[day].e, r }));
    const finite = items.filter((x) => x.a > 0 && x.f > 0);
    const d = finite.map((x) => ({ sat: x.sat, block: x.block, value: Math.log(x.a / x.f) }));
    const satNames = [...new Set(items.map((x) => x.sat))].sort();
    const perSat = satNames.map((s) => median(d.filter((x) => x.sat === s).map((x) => x.value))).filter(Number.isFinite);
    const est = statistic === 'ratio-of-medians' ? estimate(finite.map((x) => ({ ...x, value: [x.a, x.f] })), statistic) : estimate(d, statistic);
    const boot = interval === 'order' ? null : bootstrap(statistic === 'ratio-of-medians' ? finite.map((x) => ({ sat: x.sat, block: x.block, value: [x.a, x.f] })) : d, statistic, interval, draws);
    const order = orderInterval(perSat);
    // the 95th percentiles: per satellite ln(p95 AP / p95 ref)
    const p95Sat = satNames.map((s) => { const xs = finite.filter((x) => x.sat === s); return xs.length ? Math.log(quantile(xs.map((x) => x.a).sort(asc), 0.95) / quantile(xs.map((x) => x.f).sort(asc), 0.95)) : null; }).filter(Number.isFinite);
    const p95Items = satNames.flatMap((s) => { const xs = finite.filter((x) => x.sat === s); return xs.length ? [{ sat: s, block: 0, value: Math.log(quantile(xs.map((x) => x.a).sort(asc), 0.95) / quantile(xs.map((x) => x.f).sort(asc), 0.95)) }] : []; });
    const p95Boot = bootstrap(p95Items, 'sat-median', 'satellite', draws), p95Order = orderInterval(p95Sat);
    const Dv = list.map((r) => r.arms.AP[`dVs${ref}`]?.[day]).filter(Number.isFinite).sort(asc);
    const gate = list.map(usable), notUsable = gate.filter((x) => x === false).length, gateKnown = gate.filter((x) => x !== null).length;
    const halfOf = (r) => (ref === 'FFMq' ? r.arms.FFMqHalfTol : null);
    const half = list.filter((r) => halfOf(r)?.days?.['7'] && r.arms[ref]?.days?.['7']).map((r) => Math.abs(halfOf(r).days['7'].e / r.arms[ref].days['7'].e - 1));
    const refArm = list[0].arms[ref].arm;
    const pass = (b) => b && b[1] < LN2;
    const upperBoot = boot?.[1] ?? null, upperOrder = order?.[1] ?? null;
    const hind = ref === 'FFMq' ? list.filter((r) => r.arms.APobs?.days?.[day] && r.arms.FFMqObs?.days?.[day]) : [];
    const cell = {
      group: g, regime: LABEL[g] ?? g, fit, lead, leadDefinition: LEAD_DEFINITION, reference: ref, referenceArm: refArm,
      windows: list.length, windowsScoredByBoth: finite.length, satellites: satNames.length, satelliteNames: satNames, timeBlocks: new Set(items.map((x) => x.block)).size, timeBlockHours: blockH,
      medianKm: { AP: median(list.map((r) => r.arms.AP.days[day].e)), ref: median(list.map((r) => r.arms[ref].days[day].e)) },
      p95Km: { AP: quantile(list.map((r) => r.arms.AP.days[day].e).sort(asc), 0.95), ref: quantile(list.map((r) => r.arms[ref].days[day].e).sort(asc), 0.95) },
      ratioOfMedians: median(list.map((r) => r.arms.AP.days[day].e)) / median(list.map((r) => r.arms[ref].days[day].e)),
      pairedMedianRatio: Math.exp(median(d.map((x) => x.value))), pairedMedianExcessKm: median(finite.map((x) => x.a - x.f)),
      // REF-5 and BUD-5: the paired ratio and the paired excess (AP minus reference, km), each with a 95 % interval from time blocks of fit + lead
      pairedRatioBlock: (() => { const b = bootstrap(d, 'paired-median', 'block', Math.min(draws, 1000)); return b ? b.map(Math.exp) : null; })(),
      pairedExcessBlockKm: bootstrap(finite.map((x) => ({ sat: x.sat, block: x.block, value: x.a - x.f })), 'paired-median', 'block', Math.min(draws, 1000)),
      satelliteBalancedRatio: perSat.length ? Math.exp(median(perSat)) : null,
      statistic, interval, estimateRatio: Number.isFinite(est) ? Math.exp(est) : null,
      bootstrapRatio: boot ? boot.map(Math.exp) : null, orderRatio: order ? order.map(Math.exp) : null,
      passUnder2: pass(boot) && pass(order), noInterval: !boot || !order,
      p95: { satelliteBalancedRatio: p95Sat.length ? Math.exp(median(p95Sat)) : null, bootstrapRatio: p95Boot ? p95Boot.map(Math.exp) : null, orderRatio: p95Order ? p95Order.map(Math.exp) : null, passUnder2: pass(p95Boot) && pass(p95Order) },
      rankCorrelation: spearman(finite.map((x) => x.a), finite.map((x) => x.f)),
      D: Dv.length ? { medianM: quantile(Dv, 0.5) * 1000, p95M: quantile(Dv, 0.95) * 1000, n: Dv.length } : null,
      truthSigmaM: sig.m, truthSigmaSource: sig.source, refUnder3Sigma: sig.m == null ? null : median(list.map((r) => r.arms[ref].days[day].e)) * 1000 < 3 * sig.m,
      gate: { settingsQualified: isFullSetting(refArm), referenceNotUsable: notUsable, windowsJudged: gateKnown, halfToleranceDay7: half.length ? { n: half.length, medianChange: median(half), max: Math.max(...half), under1pct: half.every((x) => x < 0.01) } : null },
      hindcast: hind.length ? { n: hind.length, medianKm: { AP: median(hind.map((r) => r.arms.APobs.days[day].e)), ref: median(hind.map((r) => r.arms.FFMqObs.days[day].e)) }, pairedMedianRatio: Math.exp(median(hind.map((r) => Math.log(r.arms.APobs.days[day].e / r.arms.FFMqObs.days[day].e)))), rankCorrelation: spearman(hind.map((r) => r.arms.APobs.days[day].e), hind.map((r) => r.arms.FFMqObs.days[day].e)) } : null,
      // BUD-3: AP's floor on a conservative-force model orbit (sampled windows): its fit RMS and its RMS against that orbit over the lead day, m
      floor: (() => { const xs = list.filter((r) => r.arms.APfloor?.ok && Number.isFinite(r.arms.APfloor.vsModel?.[day])); return xs.length ? { n: xs.length, fitRmsM: median(xs.map((r) => r.arms.APfloor.rms)) * 1000, vsModelM: median(xs.map((r) => r.arms.APfloor.vsModel[day])) * 1000 } : null; })(),
      // the other numerical arms on the same windows: the configured one the referee flew and the reduced one the published cells flew
      others: Object.fromEntries(['FFMc', 'FFMr'].filter((k) => k !== ref).map((k) => { const xs = list.filter((r) => r.arms[k]?.days?.[day]); return [k, xs.length ? { arm: xs[0].arms[k].arm, n: xs.length, medianKm: median(xs.map((r) => r.arms[k].days[day].e)), ratioOfMedians: median(xs.map((r) => r.arms.AP.days[day].e)) / median(xs.map((r) => r.arms[k].days[day].e)), overReference: median(xs.map((r) => r.arms[k].days[day].e)) / median(xs.map((r) => r.arms[ref].days[day].e)) } : null]; })),
    };
    // goal.md: a cell passes only on both upper bounds under ln 2, a qualified reference and no unusable window; no interval fails
    cell.goalPass = cell.passUnder2 && cell.p95.passUnder2 && cell.gate.settingsQualified && notUsable === 0 && gateKnown === list.length;
    cell.couldMeetDesign = satNames.length >= 8 && cell.timeBlocks >= 3;
    // BUD-7, C1-5: truths that are themselves models, printed and marked, never dropped (owner 2026-11-10: no measured data is excluded)
    cell.truthNote = g === 'HX' && fit === 168 ? 'Chandra alone: its kernel is a model trajectory with segment joins (BUD-7)' : g === 'HE' ? 'TESS: the kernels\' ten-minute nodes only (TESS-RESCORE.md)' : null;
    // C1-2: three numbers from one rule (both intervals): shown under 2, shown at or over 2, undecided; a cell with no interval enters none
    cell.verdict = cell.noInterval ? 'no interval' : boot[1] < LN2 && order[1] < LN2 ? 'shown under 2' : boot[0] >= LN2 && order[0] >= LN2 ? 'shown at or over 2' : 'undecided';
    // C1-5: a cell enters an AP-against-numerical count only when the reference's fit RMS is within 3 sigma in at least 90 % of its windows
    cell.gate.usableShare = gateKnown === list.length ? (list.length - notUsable) / list.length : null;
    cell.entersCount = cell.gate.usableShare !== null && cell.gate.usableShare >= 0.9;
    cells.push(cell);
  }
  return cells;
}
