// Amendment 21 (1b) and (2): the Molniya fitted-drag fixture's coefficient column and observability.
// node obs.mjs <modules> <label=wasm>...   (the first build's fitted set is the one the columns are taken at)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [modules, ...builds] = process.argv.slice(2);
const lib = (f) => import(pathToFileURL(path.join(modules, 'propagator/sdn-ap/test/lib', f)).href);
const { runModelTruth } = await lib('heo-model-truth.mjs');
const { repackOcm } = await lib('ocm.mjs');
const FIX = { name: 'Molniya', n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true, hourly: true };
const B = builds.map((b) => { const [label, file] = b.split('='); return { label, file }; });
// (2) observability: the fitted coefficient, its posterior, the residual and the prior's path on each build
let set = null;
for (const b of B) {
  const r = await runModelTruth({ ...FIX, modulePath: b.file });
  if (!set) set = Buffer.from(r.omm, 'base64');
  const prior = /drag prior: [^;]*/.exec(r.fitted.comment ?? '')?.[0] ?? null;
  console.log(JSON.stringify({ step: 2, build: b.label, bterm: r.fitted.bterm, sigmaLog: r.fitted.sigmaLog, sigmaOverValue: r.fitted.sigmaLog, wrms: r.fitted.wrms, accepted: r.fitted.accepted, prior, bModel: r.fitted.bModel }));
}
// (1b) the coefficient's column: the first build's fitted set at B and B (1 + 1e-3), flown on each build; per sample the position
// difference over the step (m per unit relative change of B), RMS of each build's column and of the difference between columns
const step = 1e-3;
const bumped = repackOcm(new Uint8Array(set), (t) => { t.MEAN_ELEMENTS.BTERM *= 1 + step; });
const column = {};
for (const b of B) {
  const a = await runModelTruth({ ...FIX, omm: new Uint8Array(set), modulePath: b.file });
  const c = await runModelTruth({ ...FIX, omm: bumped, modulePath: b.file });
  column[b.label] = a.flown.map((s, k) => [0, 1, 2].map((q) => (c.flown[k][q] - s[q]) * 1000 / step));
}
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const norm = (col) => rms(col.map((x) => Math.hypot(...x)));
const ref = B[B.length - 1].label;
for (const b of B) {
  const d = column[b.label].map((x, k) => Math.hypot(...[0, 1, 2].map((q) => x[q] - column[ref][k][q])));
  console.log(JSON.stringify({ step: '1b', build: b.label, columnRmsMPerUnit: +norm(column[b.label]).toFixed(1), againstLastRms: +rms(d).toFixed(2), relative: +(rms(d) / norm(column[ref])).toExponential(3) }));
}
process.exit(0);
