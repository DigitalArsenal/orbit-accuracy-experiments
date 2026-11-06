// Amendments 19 and 20: the GTO E2E's fixtures, the Molniya fixtures and a THEMIS fixture, fitted and flown on one build against the
// FFM model truth (test/lib/heo-model-truth.mjs), one environment. node fixtures.mjs <modules> <label> <wasm>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [modules, label, modulePath] = process.argv.slice(2);
const { runModelTruth } = await import(pathToFileURL(path.join(modules, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
const ffm = sha(path.join(modules, 'propagator/ffm/dist/isomorphic/module.wasm'));
const FIXTURES = {
  GTO: { n: 2.40, e: 0.72, i: 27, raan: 40, argp: 270, ma: 10, drag: false },
  'GTO-500': { n: 2.40, e: 0.7081, i: 27, raan: 40, argp: 270, ma: 10, drag: false },
  'half-day': { n: 2.0059, e: 0.72, i: 63.4, raan: 300, argp: 270, ma: 10, drag: false },
  '12-hour-55deg': { n: 2, e: 0.72, i: 55, raan: 300, argp: 270, ma: 10, drag: false },
  Molniya: { n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true },
  'Molniya-pinned': { n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true, fitPolicy: { form: 'GAUSSIAN_SIGNED', mean: 0.044, sigma: 1e-7 } },
  'Molniya, no drag': { n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: false },
  // THEMIS D's AP (31, 20) fit, 2013-02-12 window (correctness/elements.json), no drag
  THEMIS: { n: 1.0499037196959449, e: 0.8221736866449335, i: 8.132697128525981, raan: 47.85625519596603, argp: 68.66350938631257, ma: 41.75807242078289, drag: false },
};
for (const [name, c] of Object.entries(FIXTURES)) {
  const r = await runModelTruth({ name, ...c, hourly: true, modulePath });
  console.log(JSON.stringify({ fixture: name, build: label, wasm: sha(modulePath), ffm, day: Object.fromEntries([1, 3, 7].map((d) => [d, { alongTrack: +r.wholeDay[d].t.toFixed(2), radial: +r.wholeDay[d].r.toFixed(2) }])), bterm: r.fitted.bterm }));
}
process.exit(0);
