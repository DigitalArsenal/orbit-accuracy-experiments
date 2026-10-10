// Scoring of E13's hypotheses (PLAN.md section 6): statistics on residuals; no physics. A density window is one satellite's 12 h UTC window;
// x' = the window's mean ln(rho_observed / rho_JB2008) less the satellite's dev-split level; s-bar = the common mode's mean over the window.
import fs from 'node:fs';
import path from 'node:path';
import { pigeonholeBootstrap, quantile, rng } from '../../harness/stats.mjs';
import { STORE, config, readJson } from './common.mjs';
import { windowMean, forecastMean, nowcast } from './common-mode.mjs';
import { SATELLITES } from './density-truth.mjs';

const H = 3600e3, DAY = 86400e3;

// The 12 h windows of one split from the store (steps/20): {key: [{startMs, n, x, altKm}]}.
export function loadDensityWindows(split, keys = SATELLITES) {
  return Object.fromEntries(keys.map((key) => [key, readJson(path.join(STORE, 'density', split, `${key}.json`)).windows]));
}

// Each satellite's level: the mean of x over the dev split's windows.
export function devLevels(keys = SATELLITES) {
  const dev = loadDensityWindows('dev', keys);
  return Object.fromEntries(keys.map((k) => { const x = dev[k].filter((w) => w.x !== null).map((w) => w.x); return [k, x.reduce((a, b) => a + b, 0) / x.length]; }));
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

// Rows {key, day, startMs, xp, sbar} for the windows where the common mode is finite. `sbarOf(startMs, endMs)` gives the correction's mean over
// the window (windowMean of a solution, possibly shifted for the control, or a forecast); `devMeanS` is removed from it.
export function densityRows(windows, levels, sbarOf, devMeanS = 0) {
  const rows = [];
  for (const [key, list] of Object.entries(windows)) {
    for (const w of list) {
      if (w.x === null) continue;
      const sbar = sbarOf(w.startMs, w.startMs + 12 * H);
      if (!Number.isFinite(sbar)) continue;
      rows.push({ key, day: new Date(w.startMs).toISOString().slice(0, 10), startMs: w.startMs, xp: w.x - levels[key], sbar: sbar - devMeanS });
    }
  }
  return rows;
}

// R1 = 1 - sd(x' - s) / sd(x') over rows (pooled), with the sums that a bootstrap needs.
export function spreadReduction(rows) {
  if (rows.length < 3) return { n: rows.length, R1: NaN };
  const sdX = sd(rows.map((r) => r.xp)), sdRes = sd(rows.map((r) => r.xp - r.sbar));
  return { n: rows.length, sdX, sdRes, R1: 1 - sdRes / sdX };
}

// Cells (satellite x UTC day) with the sufficient statistics of R1, for the two-way cluster bootstrap.
export function cellsOf(rows) {
  const cells = new Map();
  for (const r of rows) {
    const id = `${r.key}|${r.day}`;
    const c = cells.get(id) ?? { row: r.key, col: r.day, n: 0, sx: 0, sxx: 0, se: 0, see: 0 };
    const e = r.xp - r.sbar;
    c.n += 1; c.sx += r.xp; c.sxx += r.xp * r.xp; c.se += e; c.see += e * e;
    cells.set(id, c);
  }
  return [...cells.values()];
}
export function r1FromCells(cells) {
  let n = 0, sx = 0, sxx = 0, se = 0, see = 0;
  for (const c of cells) { n += c.weight * c.n; sx += c.weight * c.sx; sxx += c.weight * c.sxx; se += c.weight * c.se; see += c.weight * c.see; }
  const vx = sxx / n - (sx / n) ** 2, ve = see / n - (se / n) ** 2;
  return 1 - Math.sqrt(ve / vx);
}
export function r1WithInterval(rows, stats = config.analysis.bootstrap) {
  return pigeonholeBootstrap(cellsOf(rows), r1FromCells, { resamples: stats.resamples, seed: stats.seed, confidence: stats.confidence });
}

// Per-satellite breakdown: {key: {n, R1, slope}} (slope of x' on s-bar through the origin of their means).
export function perSatellite(rows) {
  const out = {};
  for (const key of new Set(rows.map((r) => r.key))) {
    const r = rows.filter((x) => x.key === key), s = r.map((x) => x.sbar), xp = r.map((x) => x.xp), ms = mean(s), mx = mean(xp);
    const cov = r.reduce((a, x, i) => a + (xp[i] - mx) * (s[i] - ms), 0) / r.length;
    out[key] = { ...spreadReduction(r), slope: cov / sd(s) ** 2, corr: cov / (sd(s) * sd(xp)) };
  }
  return out;
}

// H2: the windows of the storm days (daily Ap >= stormApAtLeast): the share where s-bar has the sign of x', and the median of s/x' where |x'| > 0.1.
export function stormCapture(rows, stormDays) {
  const r = rows.filter((x) => stormDays.has(x.day));
  const same = r.filter((x) => Math.sign(x.sbar) === Math.sign(x.xp)).length;
  const big = r.filter((x) => Math.abs(x.xp) > 0.1).map((x) => x.sbar / x.xp);
  return { windows: r.length, sameSignShare: r.length ? same / r.length : NaN, medianCapture: big.length ? quantile(big, 0.5) : NaN, nBig: big.length, rows: r };
}

// Days with GFZ daily Ap >= threshold in [fromDay, toDay]: from the merged GFZ file of the configuration.
export function stormDays(fromDay, toDay, threshold = config.analysis.stormApAtLeast) {
  const text = fs.readFileSync(config.inputs.gfzHistory, 'latin1');
  const out = new Map();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const t = line.trim().split(/\s+/);
    const day = `${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`;
    if (day >= fromDay && day <= toDay && +t[23] >= threshold) out.set(day, +t[23]);
  }
  return out;
}


// Two-way cluster bootstrap (Owen 2007) as harness/stats.mjs pigeonholeBootstrap, also returning the one-sided p-value of the statistic against
// a null value: the share of resamples at or beyond it, (k + 1) / (B + 1). side 'greater': the alternative is a statistic above the null.
export function boot(cells, statistic, { nullValue = null, side = 'greater', stats = config.analysis.bootstrap } = {}) {
  const rows = [...new Set(cells.map((c) => c.row))], cols = [...new Set(cells.map((c) => c.col))];
  const random = rng(stats.seed);
  const draws = (keys) => { const count = new Map(keys.map((k) => [k, 0])); for (let i = 0; i < keys.length; ++i) { const k = keys[Math.floor(random() * keys.length)]; count.set(k, count.get(k) + 1); } return count; };
  const values = [];
  for (let b = 0; b < stats.resamples; ++b) {
    const r = draws(rows), c = draws(cols);
    const weighted = [];
    for (const cell of cells) { const w = r.get(cell.row) * c.get(cell.col); if (w) weighted.push({ ...cell, weight: w }); }
    const v = statistic(weighted);
    if (Number.isFinite(v)) values.push(v);
  }
  const alpha = (1 - stats.confidence) / 2;
  const out = { estimate: statistic(cells.map((c) => ({ ...c, weight: 1 }))), lower: quantile(values, alpha), upper: quantile(values, 1 - alpha), resamples: values.length, seed: stats.seed };
  if (nullValue !== null) out.p = (values.filter((v) => (side === 'greater' ? v <= nullValue : v >= nullValue)).length + 1) / (values.length + 1);
  return out;
}

// Weighted quantile of {value, weight} items.
export function weightedQuantile(items, q) {
  const s = items.filter((x) => Number.isFinite(x.value) && x.weight > 0).sort((a, b) => a.value - b.value);
  if (!s.length) return NaN;
  const total = s.reduce((a, x) => a + x.weight, 0);
  let acc = 0;
  for (const x of s) { acc += x.weight; if (acc >= q * total) return x.value; }
  return s.at(-1).value;
}

// Holm's step-down procedure over {id, p}.
export function holm(tests, alpha = config.analysis.hypotheses.holm.alpha) {
  const order = [...tests].sort((a, b) => a.p - b.p);
  let stop = false;
  return order.map((t, i) => {
    const threshold = alpha / (order.length - i);
    const reject = !stop && t.p <= threshold;
    if (!reject) stop = true;
    return { ...t, threshold, reject };
  });
}

// Propagation rows {id, issue, variant, errors: {h: m}} -> paired cells (id x issue day) holding the errors of the variants at a horizon.
export function propagationCells(rows, variants, horizon) {
  const cells = new Map();
  for (const r of rows) {
    if (!variants.includes(r.variant) || !r.errors || !Number.isFinite(r.errors[horizon])) continue;
    const key = `${r.id}|${r.issue}`;
    if (!cells.has(key)) cells.set(key, { row: r.id, col: r.issue.slice(0, 10), e: {} });
    cells.get(key).e[r.variant] = r.errors[horizon];
  }
  return [...cells.values()].filter((c) => variants.every((v) => Number.isFinite(c.e[v])));
}
// The median error ratio of a variant to the reference over paired cells, with its interval and the one-sided p of "ratio below 1".
export function medianRatio(cells, variant, reference = 'D0') {
  const stat = (w) => weightedQuantile(w.map((c) => ({ value: c.e[variant] / c.e[reference], weight: c.weight })), 0.5);
  return { pairs: cells.length, ...boot(cells, stat, { nullValue: 1, side: 'less' }),
    medianErrorM: { [variant]: weightedQuantile(cells.map((c) => ({ value: c.e[variant], weight: 1 })), 0.5), [reference]: weightedQuantile(cells.map((c) => ({ value: c.e[reference], weight: 1 })), 0.5) },
    shareImproved: cells.filter((c) => c.e[variant] < c.e[reference]).length / cells.length };
}


// The causal version of H1 (descriptive): at 00:00 UTC of each day the nowcast (the arcs that ended at least `latencyHours` before, `historyDays` back);
// each 12 h window is read once, at the first issue whose supported nodes cover it, so that the estimate is the one a user would have had. The common
// mode of a nowcast is relative to its own span, so x is read against the mean of x over that span as well (x'' = x less that mean, per satellite and
// issue). Returns rows {key, day, startMs, xp, sbar} for spreadReduction, and the hours between a window's end and the issue that first covered it.
export function causalRows(windows, allArcs, nowOptions, fromMs, toMs, firstIssueMs = fromMs) {
  const rows = [], delays = [];
  let covered = -Infinity;
  for (let t0 = Math.max(fromMs, firstIssueMs); t0 <= toMs + DAY; t0 += DAY) {
    let sol;
    try { sol = nowcast(allArcs, t0, nowOptions); } catch { continue; }
    if (!sol) continue;
    const first = sol.nodeMs[sol.supported.indexOf(true)], last = sol.nodeMs[sol.supported.lastIndexOf(true)];
    for (const [key, list] of Object.entries(windows)) {
      const inSpan = list.filter((w) => w.x !== null && w.startMs >= first && w.startMs + 12 * H <= last);
      if (inSpan.length < 20) continue;
      const level = inSpan.reduce((a, w) => a + w.x, 0) / inSpan.length;
      for (const w of list) {
        const end = w.startMs + 12 * H;
        if (w.x === null || end > last || end <= Math.max(covered, last - 2 * DAY) || w.startMs < fromMs || w.startMs > toMs) continue;       // only the windows this issue added (the first issue adds the last two days, not the whole history)
        const sb = windowMean(sol, w.startMs, end);
        if (Number.isFinite(sb)) { rows.push({ key, day: new Date(w.startMs).toISOString().slice(0, 10), startMs: w.startMs, xp: w.x - level, sbar: sb }); delays.push((t0 - end) / H); }
      }
    }
    covered = last;
  }
  return { rows, delays };
}

export { windowMean, forecastMean };
