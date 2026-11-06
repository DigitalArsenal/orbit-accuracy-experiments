// Amendment 10.3: N distinct records above e* flown to one epoch, on W workers (worker_threads, one harness each); wall time and
// each worker's peak wasm memory. Records: the given fitted $OCM sets with their eccentricity offset by k x 1e-6 and mean anomaly by
// k x 0.1 deg (distinct elements, so no two share a grid). node catalog.mjs <wasm> <N> <W> <set.ocm>...
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const EXP = '/Users/tj/software/private/coordinator-d9/orbit-accuracy-experiments-cov/experiments/operator-theory';
const { config, root } = await import(`${EXP}/lib/xp2.mjs`);
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));

if (isMainThread) {
  const [wasm, N, W, ...files] = process.argv.slice(2);
  const sets = files.map((f) => new Uint8Array(fs.readFileSync(f)));
  const records = [];
  for (let k = 0; k < Number(N); k += 1) {
    const o = S.OCM.OCM.getRootAsOCM(new S.flatbuffers.ByteBuffer(sets[k % sets.length])).unpack();
    o.MEAN_ELEMENTS.ECCENTRICITY += k * 1e-6;
    o.MEAN_ELEMENTS.MEAN_ANOMALY = (o.MEAN_ELEMENTS.MEAN_ANOMALY + k * 0.1) % 360;
    // inclination k x 0.01 deg (1.7e-4 rad per step, beyond the 1e-4 rad sharing range): no two records share a grid
    o.MEAN_ELEMENTS.INCLINATION += k * 0.01;
    if (process.env.STRIP_COV === '1') { o.COVARIANCE_DATA = []; o.COV_PARAMETER_KINDS = []; }  // records without covariance
    const b = new S.flatbuffers.Builder(4096);
    S.OCM.OCM.finishOCMBuffer(b, o.pack(b));
    records.push(b.asUint8Array().slice());
  }
  const t0 = performance.now();
  const per = Math.ceil(records.length / Number(W));
  const results = await Promise.all(Array.from({ length: Number(W) }, (_, w) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { wasm, records: records.slice(w * per, (w + 1) * per) } });
    worker.on('message', resolve);
    worker.on('error', reject);
  })));
  const wall = performance.now() - t0;
  console.log(JSON.stringify({ records: records.length, workers: Number(W), wallSecondsAllPasses: +(wall / 1000).toFixed(1),
    loadSecondsPerWorker: +(Math.max(...results.map((r) => r.ms)) / 1000).toFixed(1), refreshSecondsPerWorker: +(Math.max(...results.map((r) => r.ms2)) / 1000).toFixed(1),
    msPerRecordLoad: +(results.reduce((s, r) => s + r.ms, 0) / records.length).toFixed(1), msPerRecordRefresh: +(results.reduce((s, r) => s + r.ms2, 0) / records.length).toFixed(1),
    msPerRecordHeldGrid: +(results.reduce((s, r) => s + r.againMs, 0) / results.length).toFixed(1),
    medianMsPerRecordLoad: +(() => { const v = results.flatMap((r) => r.each).sort((a, b) => a - b); return v[v.length >> 1]; })().toFixed(1),
    withoutCovariance: process.env.STRIP_COV === '1',
    peakBytesPerWorker: Math.max(...results.map((r) => r.peak)), refused: results.reduce((s, r) => s + r.refused, 0) }));
  process.exit(0);
} else {
  const MOD = process.env.SDN_MODULES_ROOT;
  const entry = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const h = await createStandaloneHarness('browser', workerData.wasm, { surface: 'direct' });
  let peak = 0, refused = 0;
  const fly = async (set) => {
    const me = S.readFitOcm(set).o.MEAN_ELEMENTS;
    const epoch = new Date(Date.parse(/Z$/.test(me.EPOCH) ? me.EPOCH : `${me.EPOCH}Z`)).toISOString();
    const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes([epoch]) }] });
    if (r.statusCode !== 0) refused += 1;
    peak = Math.max(peak, h.memory?.buffer?.byteLength ?? 0);
  };
  // pass 1 (a catalog load), pass 2 (a refresh of the same catalog), then each of the first 10 records flown twice in a row
  // (the second flight of a record whose grid is still held)
  const t0 = performance.now(), each = [];
  for (const set of workerData.records) { const a = performance.now(); await fly(set); each.push(performance.now() - a); }
  const t1 = performance.now();
  for (const set of workerData.records) await fly(set);
  const t2 = performance.now();
  let again = 0;
  for (const set of workerData.records.slice(0, 10)) { await fly(set); const a = performance.now(); await fly(set); again += performance.now() - a; }
  parentPort.postMessage({ ms: t1 - t0, ms2: t2 - t1, againMs: again / Math.min(10, workerData.records.length), peak, refused, each });
}
