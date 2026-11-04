#!/usr/bin/env node
// Step 50: for each stratum under the frozen P_strat: dev statistics, block length, n_eff, operating characteristics with the
// half-bin gate, C_min, outcome. Simulation seed fixed (mulberry32).
//   node steps/50-strata.mjs <candidates.json> <out json> <rows dir>...
import fs from 'node:fs';
import { regimeTables } from '../lib/tab.mjs';
import { evalRow } from '../lib/fit.mjs';
import { BINS, REGIMES } from '../lib/bins.mjs';
import { CHI2_95, CHI2_99, Z95, labelStats, quantileSorted } from '../lib/stats.mjs';
import { openDate, PRODUCTS, WINDOW, FRESH_EXCLUDED_CLUSTERS } from '../lib/outcomes.mjs';

const [candFile, out, ...dirs] = process.argv.slice(2);
const cand = JSON.parse(fs.readFileSync(candFile, 'utf8'));
const tabs = await regimeTables(dirs);
const SEED = 20261103, TRIALS = 1500, TRIALS_C = 500, FRESH_DAYS = 27, DAY = 86400000;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function blockLength(days, lnd2) { // days: day index per row; daily mean series, lag autocorrelation
  const sum = new Map(), cnt = new Map();
  days.forEach((d, i) => { sum.set(d, (sum.get(d) ?? 0) + lnd2[i]); cnt.set(d, (cnt.get(d) ?? 0) + 1); });
  const ser = new Map([...sum].map(([d, s]) => [d, s / cnt.get(d)]));
  const vals = [...ser.values()], mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v0 = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  for (let L = 1; L <= 30; L++) {
    let s = 0, n = 0;
    for (const [d, x] of ser) { const y = ser.get(d + L); if (y !== undefined) { s += (x - mean) * (y - mean); n++; } }
    if (n < 5) return { L: 30, capped: true };
    if (s / n / v0 < 0.2) return { L, capped: false };
  }
  return { L: 30, capped: true };
}

const result = { seed: SEED, trials: TRIALS, freshDays: FRESH_DAYS, strata: {} };
for (const regime of REGIMES) {
  if (process.env.ONLY_REGIME && regime !== process.env.ONLY_REGIME) continue;
  const tab = tabs[regime], rc = cand[regime];
  for (let b = 0; b < BINS.length; b++) {
    const key = `${regime}|${b}`;
    const base = { regime, bin: b, binDays: BINS[b], open: openDate(regime, b), products: PRODUCTS[regime].map((p) => p.name) };
    const ids = tab?.byBin[b] ?? [];
    if (!rc || !rc.cells || !rc.cells[b] || ids.length < 30) { result.strata[key] = { ...base, devRows: ids.length, note: 'no frozen cell (fewer than two clusters or fewer than 30 rows)' }; continue; }
    const fitted = { cells: rc.cells };
    const n = ids.length;
    const d2 = new Float64Array(n), z = new Float64Array(3 * n), st = new Float64Array(n), cl = new Int32Array(n), day = new Int32Array(n), hf = new Uint8Array(n);
    const rows = [];
    ids.forEach((i, k) => { const r = evalRow(tab, i, fitted); d2[k] = r.d2; st[k] = r.step; z.set(r.z, 3 * k); cl[k] = tab.cluster[i]; day[k] = Math.floor(tab.t[i] / DAY); hf[k] = tab.half[i]; rows.push({ d2: r.d2, z: r.z, half: tab.half[i] }); });
    const dev = labelStats(rows);
    const stepCov = st.reduce((a, x) => a + (x <= CHI2_95 ? 1 : 0), 0) / n;
    const sorted = Float64Array.from(d2).sort();
    const s0 = quantileSorted(sorted, 0.95) / CHI2_95;               // the scale where dev coverage is 0.95 ("perfect")
    const lo99 = quantileSorted(sorted, 0.01), mean = d2.reduce((a, x) => a + x, 0) / n;
    const lnd2 = Array.from(d2, (x) => Math.log(Math.max(x, 1e-12)));
    const bl = blockLength(Array.from(day), lnd2);
    // per-cluster buckets by day
    const byC = new Map();
    for (let k = 0; k < n; k++) { if (process.env.O3_YES === '1' && tab.norad[ids[k]] === 39634) continue; (byC.get(cl[k]) ?? byC.set(cl[k], []).get(cl[k])).push(k); }
    const C = [...byC.keys()];
    const o3 = process.env.O3_YES === '1';   // sensitivity run only: Sentinel-1C fresh (Sentinel-1A has no fresh feed)
    const pool = regime === 'LEO-L' || o3 ? C : C.filter((c) => !FRESH_EXCLUDED_CLUSTERS.includes(tab.clusterNames[c]));   // clusters with a fresh feed (amendment 2)
    const info = pool.map((c) => { const ks = byC.get(c).sort((a, b2) => day[a] - day[b2]); const dmin = day[ks[0]], dmax = day[ks[ks.length - 1]]; const idxByDay = new Map(); ks.forEach((k) => (idxByDay.get(day[k]) ?? idxByDay.set(day[k], []).get(day[k])).push(k)); return { c, ks, dmin, dmax, idxByDay, days: idxByDay.size }; });
    const clusterDays = info.reduce((a, x) => a + x.days, 0);
    const rate = info.reduce((a, x) => a + x.ks.length, 0) / clusterDays;                                       // rows per cluster-day
    const Cexp = pool.length, nFresh = Math.round(rate * FRESH_DAYS * Cexp);
    const nb = Math.ceil(FRESH_DAYS / bl.L);
    // ICC of ln d2 over cluster x block units -> design effect -> n_eff
    const unit = new Map(); for (let k = 0; k < n; k++) { const u = `${cl[k]}|${Math.floor(day[k] / bl.L)}`; (unit.get(u) ?? unit.set(u, []).get(u)).push(lnd2[k]); }
    const gm = lnd2.reduce((a, x) => a + x, 0) / n; let ssb = 0, ssw = 0; for (const v of unit.values()) { const m = v.reduce((a, x) => a + x, 0) / v.length; ssb += v.length * (m - gm) ** 2; for (const x of v) ssw += (x - m) ** 2; }
    const U = unit.size, mbar = n / U, msb = ssb / Math.max(1, U - 1), msw = ssw / Math.max(1, n - U);
    const icc = Math.min(1, Math.max(0, (msb - msw) / (msb + (mbar - 1) * msw)));
    const mFresh = nFresh / Math.max(1, Cexp * nb);
    const de = 1 + Math.max(0, mFresh - 1) * icc, nEff = nFresh / de;
    // operating characteristics
    const R = rng(SEED + b * 977 + REGIMES.indexOf(regime) * 131);
    const F = [1, 0.7, 1.4];
    function trial(Cdraw) {
      const acc = F.map(() => ({ n: 0, c95: 0, c99: 0, n0: 0, h0: 0, n1: 0, h1: 0, ax: [0, 0, 0], mz: [0, 0, 0] }));
      for (let j = 0; j < Cdraw; j++) {
        const g = info[Math.floor(R() * info.length)];
        for (let q = 0; q < nb; q++) {
          const s = g.dmin + Math.floor(R() * Math.max(1, g.dmax - g.dmin - bl.L + 2));
          for (let dd = 0; dd < bl.L; dd++) {
            const list = g.idxByDay.get(s + dd); if (!list) continue;
            for (const k of list) for (let f = 0; f < 3; f++) {
              const A = acc[f], sc = s0 * F[f], sq = Math.sqrt(sc);
              A.n++; if (d2[k] <= CHI2_95 * sc) A.c95++; if (d2[k] <= CHI2_99 * sc) A.c99++;
              if (hf[k] === 0) { A.n0++; if (d2[k] <= CHI2_95 * sc) A.h0++; } else { A.n1++; if (d2[k] <= CHI2_95 * sc) A.h1++; }
              for (let a = 0; a < 3; a++) { const zz = z[3 * k + a]; if (Math.abs(zz) <= Z95 * sq) A.ax[a]++; A.mz[a] += zz / sq; }
            }
          }
        }
      }
      return acc;
    }
    // S1: the registered label rule (bands 0.93-0.97). S1p: the powered rule of amendment 1 (PLAN.md).
    const inb = (x) => x >= 0.93 && x <= 0.97;
    const usable = (A) => A.n >= 30 && A.n0 > 0 && A.n1 > 0;
    const labelS1 = (A) => usable(A) && inb(A.c95 / A.n) && inb(A.h0 / A.n0) && inb(A.h1 / A.n1) && A.c99 / A.n >= 0.975 && A.ax.every((v, a) => inb(v / A.n) && Math.abs(A.mz[a] / A.n) <= 0.5);
    const pooled = (A) => (A.ax[0] + A.ax[1] + A.ax[2]) / (3 * A.n);
    const labelP = (A, band) => usable(A) && Math.abs(A.c95 / A.n - 0.95) <= 2 * band.se95 && A.c99 / A.n >= 0.975 && A.h0 / A.n0 >= 0.9 && A.h1 / A.n1 >= 0.9 && Math.abs(pooled(A) - 0.95) <= 2 * band.sePool;
    const sd = (xs) => { const m = xs.reduce((u, v) => u + v, 0) / xs.length; return Math.sqrt(xs.reduce((u, v) => u + (v - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
    const runTrials = (Cdraw, T) => Array.from({ length: T }, () => trial(Cdraw));
    const share = (accs, f, fn) => accs.filter((t) => fn(t[f])).length / accs.length;
    const rates = (accs, fn) => [0, 1, 2].map((f) => share(accs, f, fn));
    const ocPass = (p) => p[0] >= 0.8 && p[1] <= 0.05 && p[2] <= 0.1;
    const ocPassP = (p) => p[0] >= 0.8 && p[1] <= 0.05;
    const accsExp = runTrials(Cexp, TRIALS);
    // the frozen bands: SE of the coverage point estimates from the cluster-block bootstrap at the expected design (n_eff as frozen)
    const okA = accsExp.map((t) => t[0]).filter(usable);
    const band = { se95: okA.length > 1 ? sd(okA.map((A) => A.c95 / A.n)) : NaN, sePool: okA.length > 1 ? sd(okA.map(pooled)) : NaN };
    const ocExp = rates(accsExp, labelS1), ocExpP = rates(accsExp, (A) => labelP(A, band));
    // S1 L3 under (b) reported beside the powered rule's pooled condition (a)
    const l3b = share(accsExp, 0, (A) => usable(A) && A.ax.every((v, a) => inb(v / A.n) && Math.abs(A.mz[a] / A.n) <= 0.5));
    let cMin = null, cMinP = null; const scan = {}, scanP = {};
    for (let c = 2; c <= Math.max(Cexp, 8); c++) {
      const accs = runTrials(c, TRIALS_C);
      const p = rates(accs, labelS1), pp = rates(accs, (A) => labelP(A, band));
      scan[c] = p.map((x) => Number(x.toFixed(3))); scanP[c] = pp.map((x) => Number(x.toFixed(3)));
      if (cMin === null && ocPass(p)) cMin = Math.max(3, c);
      if (cMinP === null && ocPassP(pp)) cMinP = Math.max(3, c);
    }
    result.strata[key] = { ...base, devRows: n, objects: new Set(ids.map((i) => tab.norad[i])).size, clusters: Cexp,
      dev: { c95: dev.c95, c99: dev.c99, h0: dev.h0, h1: dev.h1, axisShare: dev.ax.map((a) => a.share), axisMeanZ: dev.ax.map((a) => a.mean), L1: dev.L1, L2: dev.L2, L3: dev.L3, label: dev.label, stepLookupC95: stepCov, meanD2Over3: mean / 3, tailShare: d2.reduce((a, x) => a + (x > 16.27 ? 1 : 0), 0) / n },
      s0, blockDays: bl.L, blockCapped: bl.capped, timeBlocks: nb, icc, nFresh, nEff, oc: ocExp.map((x) => Number(x.toFixed(3))), ocPass: ocPass(ocExp), cMin, cScan: scan,
      s1p: { band, oc: ocExpP.map((x) => Number(x.toFixed(3))), ocPass: ocPassP(ocExpP), cMin: cMinP, cScan: scanP, l3bRate: Number(l3b.toFixed(3)) }, clusterNames: pool.map((c) => tab.clusterNames[c]) };
    console.log(key, JSON.stringify({ n, C: Cexp, s0: Number(s0.toFixed(2)), L: bl.L, nFresh, nEff: Math.round(nEff), oc: ocExp, cMin }));
    fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  }
}
fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
