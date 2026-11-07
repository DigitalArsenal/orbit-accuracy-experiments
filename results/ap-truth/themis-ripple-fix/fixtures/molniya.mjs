// The GTO E2E's Molniya fixtures on two builds, same model truth (test/lib/heo-model-truth.mjs). node molniya.mjs <modules> <label=wasm>...
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [modules, ...builds] = process.argv.slice(2);
const { runModelTruth } = await import(pathToFileURL(path.join(modules, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
const FIXTURES = {
  Molniya: { n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true },
  'Molniya-pinned': { n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true, fitPolicy: { form: 'GAUSSIAN_SIGNED', mean: 0.044, sigma: 1e-7 } },
  'Molniya, no drag': { n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: false },
};
for (const [name, c] of Object.entries(FIXTURES))
  for (const b of builds) {
    const [label, modulePath] = b.split('=');
    const r = await runModelTruth({ name, ...c, hourly: true, modulePath });
    console.log(JSON.stringify({ fixture: name, build: label, day: Object.fromEntries([1, 3, 7].map((d) => [d, { alongTrack: +r.wholeDay[d].t.toFixed(2), radial: +r.wholeDay[d].r.toFixed(2) }])), bterm: r.fitted.bterm }));
  }
process.exit(0);
