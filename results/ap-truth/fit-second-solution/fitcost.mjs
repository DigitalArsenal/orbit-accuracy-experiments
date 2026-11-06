// FIT-SECOND-SOLUTION.md Amendment 3: the fit's wall time and the wasm linear memory after it (memory only grows, so its peak), one
// fresh harness per build, builds alternating, `--runs` fits each; the THEMIS A 2013-02-15 72 h fit $OEM (themis-a-20130215.oem here), AP
// vacuum, caps 31 and 20. Module calls only.
//   SDN_MODULES_ROOT=<modules> node fitcost.mjs --builds base=<wasm>,exact=<wasm> [--runs 3] [--oem <file>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const MOD = process.env.SDN_MODULES_ROOT;
const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
const { pcf: pcfOf, pcfAtmosphereFamily } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/pcf.mjs')).href);
const { ocmOf } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
const oem = fs.readFileSync(args.oem ?? path.join(HERE, 'themis-a-20130215.oem'));
const config = pcfOf({ theory: 'AP', forces: { EPHEMERIS_SOURCE: '', ATMOSPHERE_MODEL: pcfAtmosphereFamily.JACCHIA70, HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: 31, HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: 20 } });
const T = (n) => ({ schemaName: `${n}.fbs`, fileIdentifier: `$${n}`, rootTypeName: n });
const builds = args.builds.split(',').map((b) => { const [name, file] = b.split('='); return { name, file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }; });
const rows = [];
for (let run = 0; run < Number(args.runs ?? 3); run += 1) {
  for (const b of builds) {
    const h = await createStandaloneHarness('browser', b.file, { surface: 'direct' });
    const before = h.memory.buffer.byteLength, t0 = performance.now();
    const r = await h.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: T('OEM'), payload: oem }, { portId: 'configuration', typeRef: T('PCF'), payload: config }] });
    const seconds = (performance.now() - t0) / 1000, after = h.memory.buffer.byteLength;
    if (r.statusCode !== 0) throw new Error(`${b.name}: ${r.errorCode} ${r.errorMessage}`);
    const o = ocmOf(new Uint8Array(r.outputs.find((x) => x.portId === 'elements').payload));
    const row = { build: b.name, sha256: b.sha256, run, seconds, memoryBefore: before, memoryAfter: after, rmsKm: o.ORBIT_DETERMINATION.FIT_STATISTICS.FIT_RMS_KM, bterm: o.MEAN_ELEMENTS.BTERM, load: (await import('node:os')).loadavg()[0] };
    rows.push(row);
    console.log(JSON.stringify(row));
    await h.destroy?.();
  }
}
const median = (v) => { const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
for (const b of builds) { const rs = rows.filter((r) => r.build === b.name); console.log(`${b.name} ${b.sha256.slice(0, 12)}: fit ${median(rs.map((r) => r.seconds)).toFixed(1)} s median of ${rs.length}, memory after fit ${Math.max(...rs.map((r) => r.memoryAfter))} bytes, FIT_RMS ${(rs[0].rmsKm * 1000).toFixed(2)} m, BTERM ${rs[0].bterm}`); }
