// The Molniya start-0 fitted-drag fixture for a fit E2E: the 72 h fit arc ($OEM on the pinned FFM model truth, as molniya6.mjs's
// 'argp 270, start 0' builds it), the fit's $PCF and $SPW frames, written to <out>; then each file fitted on <check.wasm> to show the
// files reproduce the coefficient. node molniya-fixture.mjs <modules> <out> <check.wasm>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const [modules, out, check] = process.argv.slice(2);
const test = path.join(modules, 'propagator/sdn-ap/test');
const { runModelTruth } = await import(pathToFileURL(path.join(test, 'lib/heo-model-truth.mjs')).href);
const { ocmOf } = await import(pathToFileURL(path.join(test, 'lib/ocm.mjs')).href);
const entry = createRequire(path.join(modules, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const f = await runModelTruth({ name: 'Molniya argp 270, start 0', n: 2, e: 0.74, i: 63.4, raan: 300, drag: true, hourly: true, argp: 270, ma: 10,
  fitStartDays: 0, fitInput: true, modulePath: check });
fs.mkdirSync(out, { recursive: true });
const files = { 'molniya-start0-fit-72h.oem': f.ephemeris, 'molniya-start0-fit.pcf': f.configuration, 'molniya-start0-fit.spw': f.spaceWeather };
const manifest = {};
for (const [name, frame] of Object.entries(files)) {
  const bytes = new Uint8Array(frame.payload);
  fs.writeFileSync(path.join(out, name), bytes);
  manifest[name] = { portId: frame.portId, typeRef: frame.typeRef, bytes: bytes.length, sha256: sha(bytes) };
}
const inputs = Object.entries(files).map(([name, frame]) => ({ portId: frame.portId, typeRef: frame.typeRef, payload: new Uint8Array(fs.readFileSync(path.join(out, name))) }));
const h = await createStandaloneHarness('browser', check, { surface: 'direct' });
const r = await h.invoke({ methodId: 'fit', inputs });
const o = ocmOf(new Uint8Array(r.outputs.find((x) => x.portId === 'elements').payload));
await h.close?.();
console.log(JSON.stringify({ manifest, check: { wasm: sha(fs.readFileSync(check)), status: r.statusCode, bterm: o.MEAN_ELEMENTS.BTERM,
  fitRmsKm: o.ORBIT_DETERMINATION.FIT_STATISTICS.FIT_RMS_KM, iterations: o.ORBIT_DETERMINATION.FIT_STATISTICS.ITERATIONS } }));
process.exit(0);
