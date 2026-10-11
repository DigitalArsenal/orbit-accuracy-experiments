// Scores of a common-mode solve against satellites that were in no solve (PLAN.md Amendments S2 item 4(d) and S3 item 6). Statistics on the ln Cd*A/m of arcs; no physics.
//
// A fleet's arcs are {dove (the satellite's id), startMs, endMs, y (ln B on the common reference), group (the fleet)}. A satellite is in the half given by the parity of
// a fixed hash of its id; the half under test is in no solve.
//   hindcastR3     H3's statistic for a held-out half: u = y less the satellite's median y (arm 0) or less its median of y - s-bar (arm 1), R3 = 1 - MAD(u1)/MAD(u0).
//   heldOutForecast  S2 item 4(d): at each issue time the solve is nowcast from `calibration` arcs only; each held-out satellite's arcs in the next 72 h are predicted by
//                    the satellite's own mean over its arcs of the last day, with and without the change of the nowcast + forecast s from those arcs to the arc.
import { median } from '../../harness/stats.mjs';
import { DAY, H } from './common.mjs';
import { boot, latencyStatistic, weightedQuantile } from './score.mjs';
import { forecastMean, nowcast, windowMean } from './common-mode.mjs';

// The half of a satellite: a fixed hash of its identifier (the sum of its characters' codes), so that no choice is made after the data are seen.
export const parityOf = (id) => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 2;
export const halves = (arcs) => [0, 1].map((h) => ({ half: h, target: arcs.filter((a) => parityOf(a.dove) === h), other: arcs.filter((a) => parityOf(a.dove) !== h) }));
const bySatellite = (arcs) => { const m = new Map(); for (const a of arcs) (m.get(a.dove) ?? m.set(a.dove, []).get(a.dove)).push(a); return m; };

const wmad = (items) => {
  const m = weightedQuantile(items, 0.5);
  return weightedQuantile(items.map((x) => ({ value: Math.abs(x.value - m), weight: x.weight })), 0.5);
};

// H3's statistic for held-out arcs read against solutions that did not contain them (a hindcast: all of a solution's arcs, both sides of an arc, are used). `parts`: [{target, sol}],
// one per held-out half, pooled. Returns {n, satellites, r3: {estimate, lower, upper}, mad0, mad1} (the bootstrap is the two-way cluster one over satellites and UTC days of the arcs' midpoints).
export function hindcastR3(parts) {
  const cells = [];
  for (const { target, sol } of parts) {
    const usable = target.map((a) => ({ ...a, sbar: windowMean(sol, a.startMs, a.endMs) })).filter((a) => Number.isFinite(a.sbar));
    for (const list of bySatellite(usable).values()) {
      const y0 = median(list.map((a) => a.y)), y1 = median(list.map((a) => a.y - a.sbar));
      for (const a of list) cells.push({ row: a.dove, col: new Date((a.startMs + a.endMs) / 2).toISOString().slice(0, 10), u0: a.y - y0, u1: a.y - a.sbar - y1 });
    }
  }
  const satellites = new Set(cells.map((c) => c.row)).size;
  if (cells.length < 20) return { n: cells.length, satellites, r3: null };
  const stat = (w) => 1 - wmad(w.map((c) => ({ value: c.u1, weight: c.weight }))) / wmad(w.map((c) => ({ value: c.u0, weight: c.weight })));
  const r3 = boot(cells, stat);
  return { n: cells.length, satellites, r3: { estimate: r3.estimate, lower: r3.lower, upper: r3.upper }, mad0: wmad(cells.map((c) => ({ value: c.u0, weight: 1 }))), mad1: wmad(cells.map((c) => ({ value: c.u1, weight: 1 }))) };
}

// The held-out forecast statistic. `calibration`: the arcs of the solve; `target`: the held-out satellites' arcs; `issues`: issue times (ms). Options: latencyHours (between an arc's
// end and the issue time), historyDays of the nowcast, taus, anchorMs, nodeHours..., solver: the options of solveCommonMode, fitHours: the span of the satellite's own arcs
// that sets its level (24 h for 7 h pairs, 30 h for daily arcs), minimumFitArcs, blockDays for the interval's blocks.
export function heldOutForecast(options) { return latencyStatistic(heldOutRecords(options), options.taus); }
export function heldOutRecords({ calibration, target, issues, latencyHours, historyDays, taus, anchorMs, solver, fitHours = 24, minimumFitArcs = 2, blockMs, firstMs, horizonMs = 3 * DAY }) {
  const records = [];
  const bySat = [...bySatellite(target).values()];
  for (const t0 of issues) {
    let sol = null;
    try { sol = nowcast(calibration, t0, { latencyHours, historyDays, anchorMs, ...solver }); } catch { /* too thin a window: no nowcast at this issue time */ }
    if (!sol) continue;
    const block = Math.floor((t0 - firstMs) / blockMs), cutoff = t0 - latencyHours * H;
    for (const list of bySat) {
      const fit = list.filter((a) => a.endMs <= cutoff && a.endMs > cutoff - fitHours * H);
      const ahead = list.filter((a) => a.startMs >= t0 && a.endMs <= t0 + horizonMs);
      if (fit.length < minimumFitArcs || !ahead.length) continue;
      const yFit = fit.reduce((acc, a) => acc + a.y, 0) / fit.length;
      const sFit = Object.fromEntries(taus.map((tau) => [String(tau), fit.reduce((acc, a) => acc + forecastMean(sol, a.startMs, a.endMs, tau), 0) / fit.length]));
      for (const a of ahead) {
        const d = a.y - yFit;
        records.push({ block, lead: ((a.startMs + a.endMs) / 2 - t0) / DAY, ref: d, errs: Object.fromEntries(taus.map((tau) => {
          const sb = forecastMean(sol, a.startMs, a.endMs, tau);
          return [String(tau), Number.isFinite(sb) && Number.isFinite(sFit[String(tau)]) ? d - (sb - sFit[String(tau)]) : NaN];
        })) });
      }
    }
  }
  return records;
}

// The two fleets' own common modes against each other (PLAN.md Amendment S3 item 6b): the correlation of their window means and of their changes over k windows,
// over the windows [fromMs, toMs) that both cover. Pearson correlation of mean-removed series; n = the windows.
export function crossFleetAgreement(solA, solB, fromMs, toMs, windowHours = 12) {
  const win = windowHours * H, a = [], b = [];
  for (let t = fromMs; t + win <= toMs; t += win) {
    const x = windowMean(solA, t, t + win), y = windowMean(solB, t, t + win);
    if (Number.isFinite(x) && Number.isFinite(y)) { a.push(x); b.push(y); }
  }
  const corr = (u, v) => {
    if (u.length < 4) return null;
    const mu = u.reduce((s, x) => s + x, 0) / u.length, mv = v.reduce((s, x) => s + x, 0) / v.length;
    let suv = 0, suu = 0, svv = 0;
    for (let i = 0; i < u.length; ++i) { suv += (u[i] - mu) * (v[i] - mv); suu += (u[i] - mu) ** 2; svv += (v[i] - mv) ** 2; }
    return suv / Math.sqrt(suu * svv);
  };
  const out = { windowHours, windows: a.length, correlationOfMeans: corr(a, b) };
  for (const k of [1, 2]) {
    const da = [], db = [];
    for (let i = k; i < a.length; ++i) { da.push(a[i] - a[i - k]); db.push(b[i] - b[i - k]); }
    out[`correlationOfChangesOver${k * windowHours}h`] = corr(da, db);
  }
  out.sdA = a.length ? Math.sqrt(a.reduce((s, x) => s + (x - a.reduce((p, q) => p + q, 0) / a.length) ** 2, 0) / a.length) : null;
  out.sdB = b.length ? Math.sqrt(b.reduce((s, x) => s + (x - b.reduce((p, q) => p + q, 0) / b.length) ** 2, 0) / b.length) : null;
  return out;
}
