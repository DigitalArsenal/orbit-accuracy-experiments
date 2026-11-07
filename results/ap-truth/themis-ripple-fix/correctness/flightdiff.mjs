// One $OCM flown 7 days at 300 s on two builds: the RMS and largest position difference (m). node flightdiff.mjs <a.wasm> <b.wasm> <set.ocm>...
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const EXP = '/Users/tj/software/private/coordinator-d9/orbit-accuracy-experiments-cov/experiments/operator-theory';
const { config, root } = await import(`${EXP}/lib/xp2.mjs`);
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const MOD = process.env.SDN_MODULES_ROOT;
const entry = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const [aw, bw, ...files] = process.argv.slice(2);
const ha = await createStandaloneHarness('browser', aw, { surface: 'direct' }), hb = await createStandaloneHarness('browser', bw, { surface: 'direct' });
for (const f of files) {
  const set = new Uint8Array(fs.readFileSync(f));
  const me = S.readFitOcm(set).o.MEAN_ELEMENTS;
  const t0 = Date.parse(/Z$/.test(me.EPOCH) ? me.EPOCH : `${me.EPOCH}Z`), epochs = [];
  for (let t = t0; t <= t0 + 7 * 86400000; t += 300000) epochs.push(new Date(t).toISOString());
  const fly = async (h) => {
    const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }] });
    if (r.statusCode !== 0) throw new Error(`${r.errorCode}`);
    return S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
  };
  const a = await fly(ha), b = await fly(hb);
  let s2 = 0, mx = 0;
  for (let k = 0; k < a.length; k += 1) {
    const d = Math.hypot(...[0, 1, 2].map((c) => (a[k].r[c] - b[k].r[c]) * 1000));
    s2 += d * d; mx = Math.max(mx, d);
  }
  console.log(JSON.stringify({ set: path.basename(f), states: a.length, rmsM: +Math.sqrt(s2 / a.length).toFixed(4), maxM: +mx.toFixed(4) }));
}
process.exit(0);
