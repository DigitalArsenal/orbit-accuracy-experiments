// node devs2-worker.mjs <k> <n> <part1 frozen-constants.json> <outFile>: S2 cell counts for Part 1 dev rows of the objects with index % n == k (PLAN.md amendment 17).
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path';
import { OUT, epochMs } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs'; import { pAt, d2 } from './lib/pstrat.mjs'; import { floorCov } from './lib/inflate.mjs'; import { FLAG_U } from './lib/n0sim.mjs'; import { C95, C99 } from './lib/s2.mjs';
const [k, n, p1file, outFile] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], process.argv[5]];
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), res = path.join(repo, 'results/covariance-every-object');
const p1 = JSON.parse(fs.readFileSync(p1file)), n0 = JSON.parse(fs.readFileSync(path.join(res, 'n0-rows.json'))).n0 ?? 20, den = JSON.parse(fs.readFileSync(path.join(res, 'denominators.json'))).strata;
const adm = new Set(Object.entries(JSON.parse(fs.readFileSync(path.join(res, 'admission.json'))).cells).flatMap(([c, v]) => v.filter((x) => x.admittedBySD).map((x) => `${c}|${x.axis}`))), AX = ['R', 'T', 'N'];
const mine = TRUTH.objects.filter((_, i) => i % n === k), want = new Set(mine.map((o) => o.norad)), created = new Map();
for (let w = 0; w < 8; w++) for (const l of fs.readFileSync(path.join(OUT, 'dev-index', `part-${w}.jsonl`), 'utf8').split('\n')) if (l) { const s = JSON.parse(l); if (want.has(s.norad)) (created.get(s.norad) ?? created.set(s.norad, new Map()).get(s.norad)).set(Math.round(epochMs(s.epoch)), epochMs(s.created)); }
function newton(r2, a) { // argmin 1/2 sum [r2/(e^u a) + u] + (n0/4) u^2
  let u = 0; for (let it = 0; it < 60; it++) { let g = 0, h = n0 / 2; for (let i = 0; i < r2.length; i++) { const q = r2[i] / (a[i] * Math.exp(u)); g += 0.5 * (1 - q); h += 0.5 * q; } g += 0.5 * n0 * u; const step = Math.max(-5, Math.min(5, g / h)); u -= step; if (Math.abs(step) < 1e-10) break; }
  return u;
}
const cells = new Map(), stat = { sets: 0, base: 0, flagged: 0, noCreation: 0 };
for (const o of mine) {
  const pairs = fs.readFileSync(path.join(OUT, 'dev-pairs', `${o.norad}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a[5] - b[5]);
  const bySet = new Map();
  for (const l of zlib.gunzipSync(fs.readFileSync(path.join('/opt/data/sdn-archive/gp-covariance-strata/dev-rows', `${o.norad}.jsonl.gz`))).toString().split('\n')) { if (!l) continue; const r = JSON.parse(l); (bySet.get(r.setEpoch) ?? bySet.set(r.setEpoch, []).get(r.setEpoch)).push(r); }
  for (const [setEpoch, rows] of bySet) {
    stat.sets++; const E = created.get(o.norad)?.get(Math.round(Date.parse(setEpoch))); if (E === undefined) { stat.noCreation++; continue; }
    let hi = 0, lo = pairs.length; while (hi < lo) { const m = (hi + lo) >> 1; if (pairs[m][5] <= E) hi = m + 1; else lo = m; }
    const win = [], older = new Set(); for (let i = hi - 1; i >= 0 && pairs[i][5] >= E - 30 * 86400e3; i--) if (pairs[i][4] >= E - 30 * 86400e3 && pairs[i][4] < E) { win.push(pairs[i]); older.add(pairs[i][4]); }
    let u = [0, 0, 0], base = older.size < 12;
    if (!base) {
      u = [0, 1, 2].map((ax) => { const r2 = [], a = []; for (const p of win) if (adm.has(`${p[2]}|${p[1]}|${AX[ax]}`)) { r2.push(p[3][ax] ** 2); a.push(den[`${p[2]}|${p[1]}`].a_RTN_m2[ax]); } return r2.length ? newton(r2, a) : 0; });
      if (!u.some((x) => x > 0)) base = true; // nothing to inflate: P_o = P_strat, as BASE
    }
    const flagged = !base && u.some((x) => x > FLAG_U); if (base) stat.base++; if (flagged) stat.flagged++;
    const d3 = u.map((x) => Math.exp(Math.max(0, x) / 2));
    for (const r of rows) {
      let d2O = r.d2; if (!base) { const P = pAt(p1.pStrat, r.regime, r.ageDays); if (P) d2O = d2(floorCov(P, d3), r.e); }
      const key = `${r.regime}|${r.bin}|${r.cluster}|${r.block}|${flagged}|${r.half}`, c = cells.get(key) ?? cells.set(key, { regime: r.regime, bin: r.bin, cluster: r.cluster, block: r.block, flagged, half: r.half, n: 0, cb: 0, co: 0, cb4: 0, co99: 0 }).get(key);
      c.n++; c.cb += +(r.d2 <= C95); c.co += +(d2O <= C95); c.cb4 += +(4 * r.d2 <= C95); c.co99 += +(d2O <= C99);
    }
  }
}
fs.writeFileSync(outFile, JSON.stringify({ stat, cells: [...cells.values()] }));
