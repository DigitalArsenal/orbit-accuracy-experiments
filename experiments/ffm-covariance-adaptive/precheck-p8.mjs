// P8 (PLAN.md section 5): axes-mle-ref recovers a known per-axis scale on synthetic histories built from the measured a, c, history lengths (latencies) and dependence: |median e^u_hat / e^u - 1| <= 10 % per class, axis and lead.
// For each window and lead of the class, with the frozen a0, a1, n0 and k_ref, each history's errors are drawn N(0, e^u a_j + c_j) with the serial correlation measured on the class's z (exponential in time, fitted to the 3-day lag), and
// u_hat is the module-free statistic of lib/model.mjs. True scales: u = -0.7, 0 and +0.7, and the class's measured median u per axis and lead. Seed SHA-256 C3S|p8|<class>|<axis>|<L>|<u>. Statistics only; no FFM.
//   node experiments/ffm-covariance-adaptive/precheck-p8.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config, store, registered, Opened, writeReceipt, results, sha256, DAY } from './common.mjs';
import { axesMleRef, gOf, AXES, median } from './lib/model.mjs';
import { loadClass, groupOf, CLASSES } from './lib/windows.mjs';

registered();
const opened = new Opened();
const rngOf = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0; return ((z ^ (z >>> 16)) >>> 0) / 4294967296; }; };
const normal = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const out = { plan: 'section 5 P8', limit: 0.1, classes: {} };
for (const cls of Object.keys(CLASSES)) {
  const fit = JSON.parse(fs.readFileSync(path.join(results, `fit-${cls}.json`)));
  const ab = fit.arms['C3-ab'], kRef = fit.kRef;
  const ex = JSON.parse(fs.readFileSync(path.join(store, 'extract', `${cls}.json`))).rows;
  const D = loadClass(cls, { opened });
  // the measured serial correlation of z at the 3-day lag, per axis (not demeaned), for an exponential in time
  const rho = [0, 1, 2].map((k) => {
    const by = new Map(ex.filter((r) => r.primary).map((r) => [`${r.o}|${Math.round(r.t)}|${r.L}`, r.z[k]])); let a = 0, b = 0, c = 0;
    for (const [key, v] of by) { const [o, t, L] = key.split('|'); const w = by.get(`${o}|${Number(t) + 3}|${L}`); if (w !== undefined) { a += v * w; b += v * v; c += w * w; } }
    return b && c ? Math.max(0, a / Math.sqrt(b * c)) : 0;
  });
  const medU = {};
  for (const L of config.leads_h) { const x = ex.filter((r) => r.primary && r.L === L); if (x.length) medU[L] = [0, 1, 2].map((k) => median(x.map((r) => r.u[k]))); }
  const rows = [];
  const windows = [...D.windows.values()].flat();
  for (const L of config.leads_h) for (let k = 0; k < 3; k += 1) for (const [label, u0] of [['-0.7', -0.7], ['0', 0], ['+0.7', 0.7], ['measured', medU[L]?.[k] ?? 0]]) {
    const rand = rngOf(parseInt(sha256(Buffer.from(`C3S|p8|${cls}|${'RTN'[k]}|${L}|${label}`)).slice(0, 8), 16));
    const ratios = [], lengths = [];
    for (const w of windows) {
      const H = w.hist.get(L);
      if (!H?.length) continue;
      const list = H.map(({ j, l }) => ({ day: j.tIn / DAY, a: gOf(j.chi, j.chiRef, ab.a0, ab.a1, L) * l.P[AXES[k]], c: kRef[groupOf(L)][k] * l.ref.covRtn[AXES[k]] + l.C })).sort((x, y) => x.day - y.day);
      const tau = rho[k] > 0 ? -3 / Math.log(Math.min(rho[k], 0.999)) : 1e-9;
      let prev = normal(rand), prevDay = list[0].day;
      const samples = list.map((s, i) => { if (i) { const r = Math.exp(-(s.day - prevDay) / tau); prev = r * prev + Math.sqrt(Math.max(0, 1 - r * r)) * normal(rand); prevDay = s.day; } return { e: prev * Math.sqrt(Math.exp(u0) * s.a + s.c), a: s.a, c: s.c }; });
      ratios.push(Math.exp(axesMleRef(samples, ab.n0) - u0));
      lengths.push(list.length);
    }
    if (!ratios.length) continue;
    const m = median(ratios);
    rows.push({ L, axis: 'RTN'[k], trueU: label, u0, windows: ratios.length, medianHistory: median(lengths), medianRatio: m, off: m - 1, pass: Math.abs(m - 1) <= 0.1 });
  }
  if (!rows.length) { out.classes[cls] = { rhoAt3Days: rho, rows, failures: [], worst: null }; continue; }
  out.classes[cls] = { rhoAt3Days: rho, rows, failures: rows.filter((r) => !r.pass), worst: rows.reduce((p, q) => (Math.abs(q.off) > Math.abs(p.off) ? q : p)) };
  console.error(cls, 'worst', JSON.stringify(out.classes[cls].worst), 'failures', out.classes[cls].failures.length);
}
out.pass = Object.values(out.classes).every((c) => !c.failures.length);
console.log(writeReceipt('precheck-P8', out, opened));
process.exit(0);
