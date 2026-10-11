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
  let sus = 0, sss = 0;                                                    // the slope of u0 on the satellite's centred s-bar, pooled: 1 where the common mode has the amplitude the satellites feel
  for (const { target, sol } of parts) {
    if (!sol) continue;                                                      // a solve that failed (too few arcs) scores nothing
    const usable = target.map((a) => ({ ...a, sbar: windowMean(sol, a.startMs, a.endMs) })).filter((a) => Number.isFinite(a.sbar));
    for (const list of bySatellite(usable).values()) {
      const y0 = median(list.map((a) => a.y)), y1 = median(list.map((a) => a.y - a.sbar)), sMean = list.reduce((acc, a) => acc + a.sbar, 0) / list.length, yMean = list.reduce((acc, a) => acc + a.y, 0) / list.length;
      for (const a of list) { cells.push({ row: a.dove, col: new Date((a.startMs + a.endMs) / 2).toISOString().slice(0, 10), u0: a.y - y0, u1: a.y - a.sbar - y1, prec: a.precision ?? 1 }); sus += (a.precision ?? 1) * (a.y - yMean) * (a.sbar - sMean); sss += (a.precision ?? 1) * (a.sbar - sMean) ** 2; }
    }
  }
  const satellites = new Set(cells.map((c) => c.row)).size;
  if (cells.length < 20) return { n: cells.length, satellites, r3: null };
  const stat = (w) => 1 - wmad(w.map((c) => ({ value: c.u1, weight: c.weight * c.prec }))) / wmad(w.map((c) => ({ value: c.u0, weight: c.weight * c.prec })));
  const r3 = boot(cells, stat);
  return { n: cells.length, satellites, slope: sss > 0 ? sus / sss : null, r3: { estimate: r3.estimate, lower: r3.lower, upper: r3.upper }, mad0: wmad(cells.map((c) => ({ value: c.u0, weight: c.prec }))), mad1: wmad(cells.map((c) => ({ value: c.u1, weight: c.prec }))) };
}

// The three solves compared on the SAME target arcs (the cells scorable in all of them): R3 of the combined solve less the larger of the R3 of the target fleet's other half and of the other fleet,
// with a bootstrap interval of that difference (the cells are shared, so the interval is far tighter than the intervals of the three R3 side by side).
// `byKind`: {own: [{target, sol}], other: [...], both: [...]}, the same targets in the same order in each.
export function pairedR3Difference(byKind) {
  const kinds = ['own', 'other', 'both'];
  if (kinds.some((k) => !byKind[k] || byKind[k].some((p) => !p.sol))) return null;
  const cells = [];
  byKind.own.forEach((part, h) => {
    const usable = part.target.map((a, i) => ({ ...a, sb: Object.fromEntries(kinds.map((k) => [k, windowMean(byKind[k][h].sol, a.startMs, a.endMs)])) })).filter((a) => kinds.every((k) => Number.isFinite(a.sb[k])));
    for (const list of bySatellite(usable).values()) {
      const y0 = median(list.map((a) => a.y)), y1 = Object.fromEntries(kinds.map((k) => [k, median(list.map((a) => a.y - a.sb[k]))]));
      for (const a of list) cells.push({ row: a.dove, col: new Date((a.startMs + a.endMs) / 2).toISOString().slice(0, 10), prec: a.precision ?? 1, u0: a.y - y0, ...Object.fromEntries(kinds.map((k) => [`u_${k}`, a.y - a.sb[k] - y1[k]])) });
    }
  });
  if (cells.length < 20) return null;
  const r3 = (w, k) => 1 - wmad(w.map((c) => ({ value: c[`u_${k}`], weight: c.weight * c.prec }))) / wmad(w.map((c) => ({ value: c.u0, weight: c.weight * c.prec })));
  const difference = (w) => r3(w, 'both') - Math.max(r3(w, 'own'), r3(w, 'other'));
  const d = boot(cells, difference), one = (k) => r3(cells.map((c) => ({ ...c, weight: 1 })), k);
  return { n: cells.length, r3: { own: one('own'), other: one('other'), both: one('both') }, difference: { estimate: d.estimate, lower: d.lower, upper: d.upper } };
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
      const pw = (a) => a.precision ?? 1, pSum = fit.reduce((acc, a) => acc + pw(a), 0);
      const yFit = fit.reduce((acc, a) => acc + pw(a) * a.y, 0) / pSum;
      const sFit = Object.fromEntries(taus.map((tau) => [String(tau), fit.reduce((acc, a) => acc + pw(a) * forecastMean(sol, a.startMs, a.endMs, tau), 0) / pSum]));
      for (const a of ahead) {
        const d = a.y - yFit;
        records.push({ key: `${t0}|${a.dove}|${a.startMs}`, block, w: pw(a), lead: ((a.startMs + a.endMs) / 2 - t0) / DAY, ref: d, errs: Object.fromEntries(taus.map((tau) => {
          const sb = forecastMean(sol, a.startMs, a.endMs, tau);
          return [String(tau), Number.isFinite(sb) && Number.isFinite(sFit[String(tau)]) ? d - (sb - sFit[String(tau)]) : NaN];
        })) });
      }
    }
  }
  return records;
}

// The forecast records of the solves {own, other, both} on the SAME target arcs and issue times (the ones every solve scores): the uncorrected change is then the same in each,
// and the ratios are comparable.
export function commonRecords(byKind, taus) {
  const finite = (r) => Number.isFinite(r.ref) && taus.every((t) => Number.isFinite(r.errs[String(t)]));
  const sets = Object.values(byKind).map((rs) => new Set(rs.filter(finite).map((r) => r.key)));
  const keep = new Set([...sets[0]].filter((k) => sets.every((s) => s.has(k))));
  return Object.fromEntries(Object.entries(byKind).map(([k, rs]) => [k, rs.filter((r) => keep.has(r.key))]));
}

// The ratio of the combined solve less the smaller of the others', per tau, with a block-bootstrap interval (null below `minimumBlocks` blocks); negative where the combination forecasts better.
export function pairedRatioDifference(common, taus, { minimumBlocks = 6 } = {}) {
  const out = {};
  for (const tau of taus) {
    const key = String(tau), w = (r) => r.w ?? 1;
    const ids = common.both.map((r) => r.key);
    const by = (kind) => new Map(common[kind].map((r) => [r.key, r]));
    const own = by('own'), other = by('other');
    const cells = common.both.map((r) => ({ row: r.block, col: 'all', ref2: w(r) * r.ref ** 2, e_both: w(r) * r.errs[key] ** 2, e_own: w(r) * own.get(r.key).errs[key] ** 2, e_other: w(r) * other.get(r.key).errs[key] ** 2 }));
    const ratio = (cs, k) => Math.sqrt(cs.reduce((a, c) => a + c.weight * c[`e_${k}`], 0) / cs.reduce((a, c) => a + c.weight * c.ref2, 0));
    const stat = (cs) => ratio(cs, 'both') - Math.min(ratio(cs, 'own'), ratio(cs, 'other'));
    const blocks = new Set(cells.map((c) => c.row)).size, one = cells.map((c) => ({ ...c, weight: 1 }));
    const b = blocks >= minimumBlocks ? boot(cells, stat) : null;
    out[key] = { n: ids.length, blocks, ratios: { own: ratio(one, 'own'), other: ratio(one, 'other'), both: ratio(one, 'both') }, difference: stat(one), lower: b?.lower ?? null, upper: b?.upper ?? null };
  }
  return out;
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
