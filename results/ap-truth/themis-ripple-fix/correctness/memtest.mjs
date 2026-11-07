// One worker flying records above e 0.3 in sequence: wasm linear memory after each flight, and the wall of a one-epoch
// propagate (init dominated). node memtest.mjs <wasm> <count> <set.ocm>...
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
const [wasm, count, ...files] = process.argv.slice(2);
const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
const sets = files.map((f) => new Uint8Array(fs.readFileSync(f)));
const fly = async (set, days) => {
  const me = S.readFitOcm(set).o.MEAN_ELEMENTS;
  const t0 = Date.parse(/Z$/.test(me.EPOCH) ? me.EPOCH : `${me.EPOCH}Z`), epochs = [];
  for (let t = t0; t <= t0 + days * 86400000; t += 300000) epochs.push(new Date(t).toISOString());
  const a = performance.now();
  const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }] });
  if (r.statusCode !== 0) throw new Error(`${r.errorCode} ${r.errorMessage}`);
  return performance.now() - a;
};
const mem = () => h.memory?.buffer?.byteLength ?? null;
const out = { wasm: path.basename(path.dirname(path.dirname(wasm))), initial: mem(), oneEpochMs: [], flights: [] };
for (const s of sets) out.oneEpochMs.push(await fly(s, 0));
for (let k = 0; k < Number(count); k += 1) {
  const ms = await fly(sets[k % sets.length], 7);
  out.flights.push({ k, ms: Math.round(ms), memory: mem() });
}
const m = out.flights.map((f) => f.memory);
console.log(JSON.stringify({ wasm: out.wasm, initialBytes: out.initial, afterFirstBytes: m[0], afterSecondBytes: m[1], peakBytes: Math.max(...m), finalBytes: m.at(-1), oneEpochMs: out.oneEpochMs.map((x) => Math.round(x)), medianFlightMs: out.flights.map((f) => f.ms).sort((a, b) => a - b)[out.flights.length >> 1] }));
process.exit(0);
