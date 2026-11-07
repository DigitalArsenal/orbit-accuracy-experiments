#!/usr/bin/env node
// Step 40: R0 and R2, each refit leaving one cluster out; the choice rule (PLAN.md 1.3); the frozen P_strat per stratum.
//   node steps/40-candidates.mjs <out json> <rows dir>... [--regime LEO-L,...]
import fs from 'node:fs';
import { regimeTables } from '../lib/tab.mjs';
import { fit, evalRow } from '../lib/fit.mjs';
import { BINS } from '../lib/bins.mjs';
import { labelStats } from '../lib/stats.mjs';

const args = process.argv.slice(2);
const only = args.includes('--regime') ? args[args.indexOf('--regime') + 1].split(',') : null;
const [out, ...dirs] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--regime');
const tabs = await regimeTables(dirs);
const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
const eig3max = (A, B) => { // lambda_max of A^-1/2 B A^-1/2 = max eigenvalue of A^-1 B (symmetric 3x3 via power iteration on A^-1 B)
  const inv = (m) => { const [a, b, c, d, e, f] = m; const A1 = d * f - e * e, B1 = c * e - b * f, C1 = b * e - c * d, det = a * A1 + b * B1 + c * C1; return [A1 / det, B1 / det, C1 / det, (a * f - c * c) / det, (b * c - a * e) / det, (a * d - b * b) / det]; };
  const full = (m) => [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]];
  const Ai = full(inv(A)), Bm = full(B);
  const M = Ai.map((r) => [0, 1, 2].map((j) => r[0] * Bm[0][j] + r[1] * Bm[1][j] + r[2] * Bm[2][j]));
  let v = [1, 1, 1], lam = 0;
  for (let it = 0; it < 200; it++) { const w = M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]); lam = Math.hypot(...w) / Math.hypot(...v); const nrm = Math.hypot(...w); v = w.map((x) => x / nrm); }
  return lam;
};
for (const regime of Object.keys(tabs)) {
  if (regime === 'HEO' || (only && !only.includes(regime))) continue;
  const tab = tabs[regime];
  const clusters = [...tab.byCluster.keys()];
  const rec = { regime, rows: tab.n, clusters: clusters.length, folds: {}, passRate: {} };
  if (clusters.length < 2) { rec.note = 'fewer than two clusters: no leave-one-cluster-out choice'; result[regime] = rec; continue; }
  const passes = { R0: [0, 0], R2: [0, 0] };
  for (const c of clusters) {
    const train = BINS.map((_, b) => tab.byBin[b].filter((i) => tab.cluster[i] !== c));
    const held = BINS.map((_, b) => tab.byBin[b].filter((i) => tab.cluster[i] === c));
    for (const kind of ['R0', 'R2']) {
      const f = fit(kind, tab, train);
      for (let b = 0; b < BINS.length; b++) {
        if (held[b].length < 30 || !f.cells[b]) continue;
        const rows = held[b].map((i) => { const r = evalRow(tab, i, f); return { d2: r.d2, z: r.z, half: tab.half[i] }; });
        const h0 = rows.filter((r) => r.half === 0).length, h1 = rows.length - h0;
        if (h0 < 10 || h1 < 10) continue;
        const s = labelStats(rows);
        passes[kind][1]++; if (s.L1) passes[kind][0]++;
      }
    }
    console.log(regime, 'fold', tab.clusterNames[c], JSON.stringify(passes));
  }
  rec.passRate = { R0: passes.R0[0] / Math.max(1, passes.R0[1]), R2: passes.R2[0] / Math.max(1, passes.R2[1]) };
  rec.folds = { R0: passes.R0, R2: passes.R2 };
  // full refit of both on all dev rows
  const all = BINS.map((_, b) => tab.byBin[b]);
  const f0 = fit('R0', tab, all), f2 = fit('R2', tab, all);
  const cmp = (A, B) => BINS.map((_, b) => (A.cells[b] && B.cells[b] ? eig3max(B.cells[b].P, A.cells[b].P) : null)); // lambda_max(B^-1 A): A <= lam B
  const l02 = cmp(f0, f2), l20 = cmp(f2, f0); // l02: max ratio of R0 over R2; l20: R2 over R0
  const r0Dominates = l20.every((x) => x === null || x <= 1 + 1e-9);   // R2 <= R0 in Loewner order
  const r2Dominates = l02.every((x) => x === null || x <= 1 + 1e-9);
  let pick, c = 1, why;
  if (rec.passRate.R0 !== rec.passRate.R2) { pick = rec.passRate.R0 > rec.passRate.R2 ? 'R0' : 'R2'; why = 'higher leave-one-cluster-out L1 pass rate'; }
  else if (r0Dominates && !r2Dominates) { pick = 'R0'; why = 'tie; R0 Loewner-larger'; }
  else if (r2Dominates && !r0Dominates) { pick = 'R2'; why = 'tie; R2 Loewner-larger'; }
  else { c = Math.max(1, ...l20.filter((x) => x !== null)); pick = 'R0xc'; why = 'tie; neither dominates; R0 times the smallest c >= 1 with c R0 >= R2'; }
  const chosen = pick === 'R2' ? f2 : f0;
  rec.pick = pick; rec.why = why; rec.c = c;
  rec.cells = BINS.map((_, b) => (chosen.cells[b] ? { P: chosen.cells[b].P.map((x) => x * (pick === 'R0xc' ? c : 1)), n: chosen.cells[b].n } : null));
  rec.r0 = f0.cells.map((x) => x && x.P); rec.r2 = f2.cells.map((x) => x && x.P);
  result[regime] = rec;
  fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  console.log(regime, JSON.stringify({ passRate: rec.passRate, pick, why, c }));
}
fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
