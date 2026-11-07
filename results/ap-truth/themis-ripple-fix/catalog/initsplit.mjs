// Amendment 14.1: a one-epoch propagate's wall on a record with and without its covariance (the covariance flies 1 + 2 x parameters
// sets, each its own init), median of 5. node initsplit.mjs <wasm> <set.ocm>
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
const [wasm, file] = process.argv.slice(2);
const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
const set = new Uint8Array(fs.readFileSync(file));
const o = S.OCM.OCM.getRootAsOCM(new S.flatbuffers.ByteBuffer(set)).unpack();
const kinds = (o.COV_PARAMETER_KINDS ?? []).length, covLen = (o.COVARIANCE_DATA ?? []).length;
o.COVARIANCE_DATA = [];
o.COV_PARAMETER_KINDS = [];
const b = new S.flatbuffers.Builder(4096);
S.OCM.OCM.finishOCMBuffer(b, o.pack(b));
const bare = b.asUint8Array().slice();
const median = (v) => [...v].sort((a, c) => a - c)[v.length >> 1];
const once = async (bytes, k) => {
  const me = S.readFitOcm(bytes).o.MEAN_ELEMENTS;
  // a distinct mean anomaly per call so no grid is held from the previous call
  const t = Date.parse(/Z$/.test(me.EPOCH) ? me.EPOCH : `${me.EPOCH}Z`) + k * 60000;
  const a = performance.now();
  const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: bytes }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes([new Date(t).toISOString()]) }] });
  return { ms: performance.now() - a, ok: r.statusCode === 0, code: r.errorCode };
};
const run = async (bytes) => { const v = []; let st; for (let k = 0; k < 5; k += 1) { st = await once(bytes, k); v.push(st.ms); } return { medianMs: Math.round(median(v)), ok: st.ok, code: st.code }; };
console.log(JSON.stringify({ wasm: path.basename(path.dirname(path.dirname(wasm))), covarianceParameters: kinds, covarianceValues: covLen, withCovariance: await run(set), withoutCovariance: await run(bare) }));
process.exit(0);
