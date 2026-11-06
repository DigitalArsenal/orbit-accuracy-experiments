// Amendment 22: six Molniya fixtures (drag fitted) across perigee phase and apsidal state on the pinned truth, on one build: day 1 / 3 / 7
// whole-day RMS along-track and radial, the fitted coefficient, the fit's wall and the peak wasm memory of the fit's harness.
// node molniya6.mjs <modules> <label> <wasm>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [modules, label, modulePath] = process.argv.slice(2);
const { runModelTruth } = await import(pathToFileURL(path.join(modules, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
const base = { n: 2, e: 0.74, i: 63.4, raan: 300, drag: true, hourly: true };
// argument of perigee, fit arc start after the truth's start (days): perigee phase in quarter revolutions, and apsidal state
const SIX = [['argp 270, start 0', 270, 0], ['argp 270, start 0.125', 270, 0.125], ['argp 270, start 0.25', 270, 0.25],
  ['argp 270, start 0.375', 270, 0.375], ['argp 240, start 0', 240, 0], ['argp 300, start 0', 300, 0]];
const only = process.env.ONLY ? process.env.ONLY.split('|') : null;
for (const [name, argp, start] of SIX) {
  if (only && !only.includes(name)) continue;
  const t0 = performance.now();
  const r = await runModelTruth({ name: `Molniya ${name}`, ...base, argp, ma: 10, fitStartDays: start, modulePath });
  const wall = (performance.now() - t0) / 1000;
  console.log(JSON.stringify({ fixture: name, build: label, wasm: sha(modulePath), bterm: r.fitted.bterm, wallSeconds: +wall.toFixed(1),
    day: Object.fromEntries([1, 3, 7].map((d) => [d, { alongTrack: +r.wholeDay[d].t.toFixed(2), radial: +r.wholeDay[d].r.toFixed(2) }])) }));
}
process.exit(0);
