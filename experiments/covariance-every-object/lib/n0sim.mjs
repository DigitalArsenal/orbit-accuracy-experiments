// n0 simulation (PLAN.md reading 8). PROVISIONAL until Part 1 states its block length and admitted bins.
import fs from 'node:fs'; import path from 'node:path';
import { rng } from './synth.mjs'; import { uHat } from './inflate.mjs';
export const N0 = [5, 10, 20, 40], FLAG_U = 2 * Math.log(1.25), DAY = 86400e3;

/** Loads {objects:[{norad, cluster, rows:[[t, bin, regime, rho]] sorted by t}]} from dev-pairs under dir. */
export function loadPairs(dir, truth) {
  return truth.objects.map((o) => ({ ...o, rows: fs.readFileSync(path.join(dir, `${o.norad}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a[0] - b[0]) }));
}
/** Provisional block length: smallest whole number of days at which the lag autocorrelation of the daily mean ln(rho^2/a) (R,T,N mean) falls below 0.2, averaged over objects. */
export function blockDays(objs, a) {
  const acs = [];
  for (const o of objs) {
    const days = new Map();
    for (const [t, b, reg, rho] of o.rows) { const A = a[`${reg}|${b}`]; if (!A) continue; const v = rho.slice(0, 3).reduce((s, x, k) => s + Math.log((x * x + 1e-12) / A[k]), 0) / 3; const d = Math.floor(t / DAY); (days.get(d) ?? days.set(d, []).get(d)).push(v); }
    const ds = [...days.keys()].sort((x, y) => x - y); if (ds.length < 60) continue;
    const x = ds.map((d) => days.get(d).reduce((s, y) => s + y, 0) / days.get(d).length), map = new Map(ds.map((d, i) => [d, x[i]]));
    const mu = x.reduce((s, y) => s + y, 0) / x.length, v = x.reduce((s, y) => s + (y - mu) ** 2, 0);
    acs.push((lag) => { let c = 0, n = 0; for (const d of ds) if (map.has(d + lag)) { c += (map.get(d) - mu) * (map.get(d + lag) - mu); n++; } return v > 0 && n > 10 ? (c / n) / (v / x.length) : 0; });
  }
  for (let lag = 1; lag <= 30; lag++) if (acs.reduce((s, f) => s + f(lag), 0) / acs.length < 0.2) return lag;
  return 30;
}
/** One history: ~30 days tiled with blocks of `L` days drawn from the object's own series. Returns rows [bin, regime, rho2[3]] with per-object-cell scaling to a. */
function history(o, scale, L, r) {
  const t0 = o.rows[0][0], t1 = o.rows[o.rows.length - 1][0], out = [];
  for (let got = 0; got < 30; got += L) {
    const s = t0 + r() * Math.max(0, t1 - t0 - L * DAY);
    for (const row of o.rows) { if (row[0] < s) continue; if (row[0] >= s + L * DAY) break; const f = scale.get(`${row[2]}|${row[1]}`); if (f) out.push([row[1], row[2], row[3].slice(0, 3).map((x, k) => x * x * f[k])]); }
  }
  return out;
}
export function simulate(objs, a, { seed = 20261109, histories = 2000, L }) {
  const r = rng(seed), per = objs.map((o) => { // per-object-cell scale factor a / object moment (cells with >= 30 pairs)
    const m = new Map(); for (const [, b, reg, rho] of o.rows) { const k = `${reg}|${b}`, c = m.get(k) ?? { n: 0, s: [0, 0, 0] }; c.n++; for (let i = 0; i < 3; i++) c.s[i] += rho[i] ** 2; m.set(k, c); }
    const f = new Map(); for (const [k, c] of m) if (c.n >= 30 && a[k] && c.s.every((x) => x > 0)) f.set(k, a[k].map((ak, i) => ak / (c.s[i] / c.n))); return f;
  });
  const usable = objs.map((_, i) => i).filter((i) => per[i].size > 0), rows = N0.map((n0) => ({ n0, flagU0: 0, nU0: 0, ratios: [] }));
  for (let h = 0; h < histories; h++) {
    const i = usable[Math.floor(r() * usable.length)], hist = history(objs[i], per[i], L, r); if (hist.length < 12) continue;
    for (const row of rows) for (const world of [0, 1]) {
      const mult = world ? 4 : 1; let flag = false;
      for (let k = 0; k < 3; k++) {
        const u = uHat(hist.map((x) => x[2][k] * mult), hist.map((x) => a[`${x[1]}|${x[0]}`][k]), row.n0);
        if (world === 0) { if (u > FLAG_U) flag = true; } else row.ratios.push(Math.exp(u) / 4);
      }
      if (world === 0) { row.nU0++; if (flag) row.flagU0++; }
    }
  }
  return rows.map((row) => { const s = row.ratios.sort((x, y) => x - y); return { n0: row.n0, histories: row.nU0, pFlagU0: row.flagU0 / row.nU0, medianRatioAtLn4: s[s.length >> 1] }; });
}
export const chooseN0 = (rows) => rows.find((r) => r.pFlagU0 <= 0.05 && r.medianRatioAtLn4 >= 0.8 && r.medianRatioAtLn4 <= 1.25)?.n0 ?? null;
