// C3-A8, report only, no rule: mean z^2 by family, axis and lead on validation under the model (C3-ab) and the reference arm (C3-ab-ref), each at its own constants; and 54377's normal axis on its own, per cutoff, under both.
// The rolling history carries January's plane 2 event into the April-May u_hat: this shows its size. Stored rows; arithmetic on covariance terms; no FFM.
//   node experiments/ffm-covariance-adaptive/report-arms.mjs
import fs from 'node:fs';
import path from 'node:path';
import { config, registered, Opened, writeReceipt, results } from './common.mjs';
import { loadClass, samplesOf, constellationOf } from './lib/windows.mjs';
import { compose } from './lib/compose.mjs';
import { AXES } from './lib/model.mjs';

registered();
const opened = new Opened();
const familyOf = (s) => { const c = constellationOf(s.w.norad); if (c === 'sphere') return 'spheres'; if (c === 'Galileo') return 'Galileo'; return s.w.cluster === 'GLO-P2' ? 'GLONASS plane 2' : 'GLONASS other'; };
const armOf = (fit, name) => { const a = fit.arms[name]; return { a0: a.a0, a1: a.a1, n0: a.n0, useG: true, useU: true, kRef: fit.kRef, history: name === 'C3-ab' ? 'truth' : 'reference' }; };
const out = { plan: 'C3-A8, report only', classes: {}, satellite54377: [] };
for (const cls of ['R3', 'R2-M', 'R2-O']) {
  const fit = JSON.parse(fs.readFileSync(path.join(results, `fit-${cls}.json`))), D = loadClass(cls, { opened });
  const val = samplesOf(D, 'validation').filter((s) => s.primary);
  const a = compose(val, armOf(fit, 'C3-ab')), b = compose(val, armOf(fit, 'C3-ab-ref'));
  const zOf = (s, k) => s.l.err[k] / Math.sqrt(s.m[AXES[k]] + s.l.C);
  const rows = [];
  for (const family of [...new Set(val.map(familyOf))].sort()) for (const L of config.leads_h) for (let k = 0; k < 3; k += 1) {
    const ix = val.map((s, i) => (familyOf(s) === family && s.l.L === L ? i : -1)).filter((i) => i >= 0);
    if (!ix.length) continue;
    const mean = (f) => ix.reduce((p, i) => p + f(i), 0) / ix.length;
    rows.push({ family, L, axis: 'RTN'[k], n: ix.length, satellites: new Set(ix.map((i) => val[i].w.norad)).size, meanZ2: mean((i) => zOf(a[i], k) ** 2), meanZ2Reference: mean((i) => zOf(b[i], k) ** 2), meanU: mean((i) => a[i].u[k]), meanUReference: mean((i) => b[i].u[k]) });
  }
  out.classes[cls] = rows;
  if (cls === 'R3') {
    const all = samplesOf(D).filter((s) => s.w.norad === 54377);
    const x = compose(all, armOf(fit, 'C3-ab')), y = compose(all, armOf(fit, 'C3-ab-ref'));
    all.forEach((s, i) => { out.satellite54377.push({ set: s.w.set, E: new Date(s.w.E).toISOString().slice(0, 10), L: s.l.L, primary: s.primary, history: (s.w.hist.get(s.l.L) ?? []).length, errNM: s.l.err[2], sigmaNC2M: Math.sqrt(s.l.P[5]), uN: x[i].u[2], zN: zOf(x[i], 2), uNReference: y[i].u[2], zNReference: zOf(y[i], 2) }); });
  }
}
console.log(writeReceipt('report-arms', out, opened));
process.exit(0);
