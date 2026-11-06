// SDN-AP condition (2): attribute a fit's cost: per fixture the wall, iterations, grids built (sdnap_wide_grid_cache out[2] where
// the build has it) and high-water in MiB; per build the wasm cost of one grid build (a fresh instance flies 5 GTO-like sets of
// distinct keys once each, then again with their grids held: (first - again) / builds). node fitcost.mjs <modules> <label=wasm>...
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const [modules, ...builds] = process.argv.slice(2);
const test = path.join(modules, 'propagator/sdn-ap/test');
const lib = (f) => import(pathToFileURL(path.join(test, 'lib', f)).href);
const { runModelTruth } = await lib('heo-model-truth.mjs');
const { configuration, pcfAtmosphereFamily } = await lib('pcf.mjs');
const { T, ocmOf, seedOcm, flight } = await lib('ocm.mjs');
const entry = createRequire(path.join(modules, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const MiB = (b) => +(b / 1048576).toFixed(1);
const VACUUM_AP = { EPHEMERIS_SOURCE: '', ATMOSPHERE_MODEL: pcfAtmosphereFamily.JACCHIA70, HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: 31,
  HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: 20 };
const themis = [{ portId: 'ephemeris', typeRef: T('OEM'), payload: new Uint8Array(fs.readFileSync(path.join(test, 'fixtures/themis-a-2013-02-15-fit-72h.oem'))) },
  configuration({ theory: 'AP', forces: VACUUM_AP })];
const first = builds[0].split('=')[1];
const gto = await runModelTruth({ name: 'GTO', n: 2.40, e: 0.72, i: 27, raan: 40, argp: 270, ma: 10, drag: false, hourly: true, fitInput: true, modulePath: first });
const mol = await runModelTruth({ name: 'Molniya', n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true, hourly: true, fitInput: true, modulePath: first });
const CASES = { 'THEMIS A 2013-02-15': themis, GTO: [gto.ephemeris, gto.configuration, gto.spaceWeather], 'Molniya, drag fitted': [mol.ephemeris, mol.configuration, mol.spaceWeather] };
const built = (h) => {
  const x = h.instance.exports;
  if (!x.sdnap_wide_grid_cache) return null;
  const p = x.sdnap_alloc(24);
  x.sdnap_wide_grid_cache(p);
  const v = new Float64Array(h.memory.buffer, p, 3)[2];
  x.sdnap_free(p);
  return v;
};
const epoch = '2026-10-01T00:00:00.000';
const output = { START_TIME: epoch, STOP_TIME: '2026-10-01T12:00:00.000', STEP_SECONDS: 600 };
const sets = [0.70, 0.71, 0.72, 0.73, 0.74].map((e) => seedOcm({ epoch, n: 2.40, e, i: 27, raan: 40, argp: 270, ma: 10, tesseral: 31, zonal: 20 }));
for (const b of builds) {
  const [label, wasm] = b.split('=');
  for (const [name, inputs] of Object.entries(CASES)) {
    const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
    const t0 = performance.now();
    const r = await h.invoke({ methodId: 'fit', inputs });
    const fitSeconds = +((performance.now() - t0) / 1000).toFixed(1);
    const out = r.outputs?.find((o) => o.portId === 'elements');
    const stats = out ? ocmOf(new Uint8Array(out.payload)).ORBIT_DETERMINATION?.FIT_STATISTICS : null;
    console.log(JSON.stringify({ build: label, fixture: name, status: r.statusCode, fitSeconds, iterations: stats?.ITERATIONS ?? null,
      rmsM: stats ? +(stats.FIT_RMS_KM * 1000).toFixed(2) : null, gridsBuilt: built(h), highWaterMiB: MiB(h.memory.buffer.byteLength) }));
    await h.close?.();
  }
  const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
  const fly = async () => { const t = performance.now(); for (const s of sets) { const r = await h.invoke({ methodId: 'propagate', inputs: flight([s], { output }) }); if (r.statusCode !== 0) throw new Error(`flight ${r.errorCode}`); } return performance.now() - t; };
  const b0 = built(h) ?? 0, tFirst = await fly(), b1 = built(h) ?? 0, tAgain = await fly(), b2 = built(h) ?? 0;
  console.log(JSON.stringify({ build: label, perBuild: { firstMs: +tFirst.toFixed(0), againMs: +tAgain.toFixed(0), builds: b1 - b0, buildsAgain: b2 - b1,
    msPerBuild: b1 > b0 ? +((tFirst - tAgain) / (b1 - b0)).toFixed(1) : null } }));
  await h.close?.();
}
process.exit(0);
