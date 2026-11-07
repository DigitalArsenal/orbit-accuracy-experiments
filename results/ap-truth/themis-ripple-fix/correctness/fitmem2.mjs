// Amendment 23: a fit's wall and wasm linear-memory high-water on THEMIS A 2013-02-15 (the fitter's pinned 72 h arc), the GTO and the
// Molniya (drag fitted) fixtures, each in a fresh instance. node fitmem2.mjs <modules> <label=wasm>...
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const [modules, ...builds] = process.argv.slice(2);
const test = path.join(modules, 'propagator/sdn-ap/test');
const lib = (f) => import(pathToFileURL(path.join(test, 'lib', f)).href);
const { runModelTruth } = await lib('heo-model-truth.mjs');
const { configuration, pcfAtmosphereFamily } = await lib('pcf.mjs');
const { T } = await lib('ocm.mjs');
const entry = createRequire(path.join(modules, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const VACUUM_AP = { EPHEMERIS_SOURCE: '', ATMOSPHERE_MODEL: pcfAtmosphereFamily.JACCHIA70, HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: 31,
  HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: 20 };
const themis = [{ portId: 'ephemeris', typeRef: T('OEM'), payload: new Uint8Array(fs.readFileSync(path.join(test, 'fixtures/themis-a-2013-02-15-fit-72h.oem'))) },
  configuration({ theory: 'AP', forces: VACUUM_AP })];
const first = builds[0].split('=')[1];
const gto = await runModelTruth({ name: 'GTO', n: 2.40, e: 0.72, i: 27, raan: 40, argp: 270, ma: 10, drag: false, hourly: true, fitInput: true, modulePath: first });
const mol = await runModelTruth({ name: 'Molniya', n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true, hourly: true, fitInput: true, modulePath: first });
const CASES = { 'THEMIS A 2013-02-15': themis, GTO: [gto.ephemeris, gto.configuration, gto.spaceWeather], 'Molniya, drag fitted': [mol.ephemeris, mol.configuration, mol.spaceWeather] };
for (const b of builds) {
  const [label, wasm] = b.split('=');
  for (const [name, inputs] of Object.entries(CASES)) {
    const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
    const t0 = performance.now();
    const r = await h.invoke({ methodId: 'fit', inputs });
    console.log(JSON.stringify({ build: label, fixture: name, status: r.statusCode, fitSeconds: +((performance.now() - t0) / 1000).toFixed(1), highWaterBytes: h.memory.buffer.byteLength }));
    await h.close?.();
  }
}
process.exit(0);
