// No-harm check: the same stored $OCM flown on two builds, the ephemeris bytes compared. node noharm.mjs <a.wasm> <b.wasm> <set.ocm>...
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const EXP = '/Users/tj/software/private/coordinator-d9/orbit-accuracy-experiments-cov/experiments/operator-theory';
const { config, root } = await import(`${EXP}/lib/xp2.mjs`);
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const MOD = process.env.SDN_MODULES_ROOT;
const entry = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const [aw, bw, ...sets] = process.argv.slice(2);
const ha = await createStandaloneHarness('browser', aw, { surface: 'direct' }), hb = await createStandaloneHarness('browser', bw, { surface: 'direct' });
for (const f of sets) {
  const set = new Uint8Array(fs.readFileSync(f));
  const me = S.readFitOcm(set).o.MEAN_ELEMENTS;
  const t0 = Date.parse(/Z$/.test(me.EPOCH) ? me.EPOCH : `${me.EPOCH}Z`);
  const epochs = [];
  for (let t = t0; t <= t0 + 7 * 86400000; t += 300000) epochs.push(new Date(t).toISOString());
  const fly = async (h) => {
    const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }] });
    if (r.statusCode !== 0) return `error ${r.errorCode}`;
    return crypto.createHash('sha256').update(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).digest('hex');
  };
  const a = await fly(ha), b = await fly(hb);
  console.log(JSON.stringify({ set: path.basename(f), e: me.ECCENTRICITY, n: me.MEAN_MOTION, identical: a === b, a: a.slice(0, 16), b: b.slice(0, 16) }));
}
process.exit(0);
