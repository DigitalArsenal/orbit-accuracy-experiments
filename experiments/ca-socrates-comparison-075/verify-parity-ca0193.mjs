#!/usr/bin/env node
// Phase 3A: Re-verify full 7-day, 16,818-primary, 193,952-row CelesTrak SOCRATES Plus GP-on-GP parity
// on signed analysis/conjunction-assessment 0.19.3 (ebab8b970166...) against both SOCRATES Plus
// and the verified CA 0.12.0/0.17.0 958,800-event baseline.
//
// Usage:
//   CA_MODULES_ROOT=/tmp/work-ca-0193 node experiments/ca-socrates-comparison-075/verify-parity-ca0193.mjs --processes 4 --threads 2
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const CA_MODULES = process.env.CA_MODULES_ROOT || '/tmp/work-ca-0193';
const CA_DIR = path.join(CA_MODULES, 'analysis/conjunction-assessment');
const BASELINE_DIR = '/Users/tj/software/spacedatanetwork-stack/repos/ancillary-packages/orbit-accuracy-experiments/runs/ca-socrates-gp-parity/ca-socrates-gp-parity-a2-screen-20261030T040914Z';
const RUN_DIR = path.join(OAE, 'runs/ca-socrates-comparison-075/parity-ca0193');
const UNITS_DIR = path.join(RUN_DIR, 'units');
const OUT_PATH = path.join(OAE, 'results/ca-rollup-075/socrates-parity-ca0193.json');

const DAY_S = 86400;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sha256File = (p) => sha256(fs.readFileSync(p));
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

async function runWorker() {
  const job = JSON.parse(fs.readFileSync(arg('--job'), 'utf8'));
  const reqMod = createRequire(path.join(CA_DIR, 'package.json'));
  const cqr = await import(pathToFileURL(path.join(CA_DIR, 'tests/lib/cqr.mjs')).href);
  const hz = await import(pathToFileURL(path.join(CA_DIR, 'tests/lib/conjunctionCommandHarness.mjs')).href);
  const sds = await import(pathToFileURL(reqMod.resolve('spacedatastandards.org/lib/js/CQR/main.js')).href);
  const fb = await import(pathToFileURL(reqMod.resolve('flatbuffers')).href);

  const flatc = await cqr.initCqrFlatc();
  const ommSchema = cqr.publishedSchema('OMM');
  const decode = (bytes) => sds.CQR.getRootAsCQR(new fb.ByteBuffer(bytes)).unpack();
  const stream = fs.readFileSync(job.ommStream);
  const catalogInputs = [];
  for (let at = 0; at < stream.length;) {
    const n = stream.readUInt32LE(at);
    catalogInputs.push({ portId: 'catalog', payload: new Uint8Array(stream.buffer, stream.byteOffset + at + 4, n).slice() });
    at += 4 + n;
  }
  const wasmFile = path.join(CA_DIR, 'dist/isomorphic/module.wasm');
  let harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: wasmFile });
  const s = job.screen;

  async function runBlock(p0, p1, startJd, seconds) {
    const controls = cqr.screeningControls({
      startJd, durationSeconds: seconds, thresholdM: s.thresholdM, numThreads: job.threads,
      coarseStepSec: s.coarseStepSeconds, fineTolSec: s.refinementToleranceSeconds, combinedRadiusM: s.combinedRadiusM,
      useKdTree: s.useKdTree, useDynamicWindow: s.useDynamicWindow, usePerigeeFilter: s.usePerigeeFilter,
    });
    const req = cqr.encodeCqr(flatc, {
      CATALOG_REQUEST: {
        CONTROLS: { ...controls, ALGORITHM: s.algorithm },
        EVALUATION_FRAME: cqr.earthFrame(s.evaluationFrame),
        ORDERED_CATALOG_INDICES: job.order,
        START_ORDER_INDEX: p0, HAS_START_ORDER_INDEX: true,
        END_ORDER_INDEX: p1, HAS_END_ORDER_INDEX: true,
        SECONDARY_START_ORDER_INDEX: p0, HAS_SECONDARY_START_ORDER_INDEX: true,
        SECONDARY_END_ORDER_INDEX: job.order.length, HAS_SECONDARY_END_ORDER_INDEX: true,
      },
    });
    const inputs = [{ portId: 'request', payload: req }, ...catalogInputs];
    const events = [], excluded = [];
    let failedPairs = 0;
    for (;;) {
      const r = await harness.invoke({ methodId: 'screen_catalog', inputs });
      const resultFrame = r.outputs.find((f) => f.portId === 'result');
      const incomplete = r.statusCode !== 0 && r.errorCode === 'incomplete-screening' && resultFrame;
      if (r.statusCode !== 0 && !incomplete) throw new Error(`screen_catalog ${r.errorCode}: ${r.errorMessage}`);
      const res = decode(resultFrame.payload).CATALOG_RESULT;
      for (const e of res.EVENTS ?? []) {
        events.push({
          a: e.PRIMARY_NORAD_ID, b: e.SECONDARY_NORAD_ID,
          tcaJd: e.TCA.JULIAN_DATE, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S,
          aDse: e.HAS_PRIMARY_DAYS_SINCE_EPOCH ? e.PRIMARY_DAYS_SINCE_EPOCH : null,
          bDse: e.HAS_SECONDARY_DAYS_SINCE_EPOCH ? e.SECONDARY_DAYS_SINCE_EPOCH : null,
        });
      }
      for (const f of r.outputs.filter((o) => o.portId === 'excluded')) {
        const omm = JSON.parse(flatc.generateJSON(ommSchema, { path: '/omm.bin', data: f.payload }, { defaultsJson: true }));
        excluded.push({ norad: Number(omm.NORAD_CAT_ID), comment: omm.COMMENT ?? null });
      }
      if (res.FINAL_CHUNK) {
        failedPairs = Number(res.STATISTICS?.FAILED_PAIRS ?? 0);
        return { events, excluded, failedPairs };
      }
    }
  }

  try {
    for (const u of job.units) {
      const outFile = path.join(UNITS_DIR, `u-${String(u.id).padStart(4, '0')}.json`);
      if (fs.existsSync(outFile)) continue;
      const startJd = job.window.startJd + (u.slice * job.window.sliceSeconds) / DAY_S;
      const t0 = performance.now();
      let res;
      try {
        res = await runBlock(u.p0, u.p1, startJd, job.window.sliceSeconds);
      } catch (e) {
        // Split block in half if WASM memory limit hit
        try { await harness.destroy?.(); } catch {}
        harness = await hz.createConjunctionCommandHarness({ runtimeKind: 'browser', wasmSource: wasmFile });
        const mid = Math.floor((u.p0 + u.p1) / 2);
        const r1 = await runBlock(u.p0, mid, startJd, job.window.sliceSeconds);
        const r2 = await runBlock(mid, u.p1, startJd, job.window.sliceSeconds);
        res = {
          events: [...r1.events, ...r2.events],
          excluded: [...r1.excluded, ...r2.excluded],
          failedPairs: r1.failedPairs + r2.failedPairs,
        };
      }
      const exclMap = new Map(res.excluded.map((x) => [x.norad, x]));
      const ans = {
        id: u.id, slice: u.slice, p0: u.p0, p1: u.p1,
        elapsedSec: +((performance.now() - t0) / 1000).toFixed(2),
        failedPairs: res.failedPairs,
        excluded: [...exclMap.values()],
        events: res.events,
      };
      fs.writeFileSync(`${outFile}.tmp`, JSON.stringify(ans));
      fs.renameSync(`${outFile}.tmp`, outFile);
      process.send?.({ id: u.id, events: res.events.length, sec: ans.elapsedSec, failedPairs: res.failedPairs });
    }
  } finally {
    await harness.destroy?.();
  }
  process.exit(0);
}

if (has('--worker')) {
  await runWorker();
} else {
  const tStart = Date.now();
  const processes = Number(arg('--processes', '4'));
  const threads = Number(arg('--threads', '2'));
  const blockSize = Number(arg('--block-size', '1000'));
  fs.mkdirSync(UNITS_DIR, { recursive: true });

  const wasmPath = path.join(CA_DIR, 'dist/isomorphic/module.wasm');
  const wasmSha = sha256File(wasmPath);
  const pkg = JSON.parse(fs.readFileSync(path.join(CA_DIR, 'package.json'), 'utf8'));
  const ommStream = path.join(BASELINE_DIR, 'catalog.omm.u32le.bin');
  const ommSha = sha256File(ommStream);
  const job0 = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, 'part1/job-0.json'), 'utf8'));
  const order = job0.order;
  const totalPrimaries = 16818;
  const slices = 28; // 28 x 6h = 7 days

  const units = [];
  let uid = 0;
  for (let p0 = 0; p0 < totalPrimaries; p0 += blockSize) {
    const p1 = Math.min(totalPrimaries, p0 + blockSize);
    for (let s = 0; s < slices; s++) units.push({ id: uid++, slice: s, p0, p1 });
  }
  const todo = units.filter((u) => !fs.existsSync(path.join(UNITS_DIR, `u-${String(u.id).padStart(4, '0')}.json`)));
  console.log(`${new Date().toISOString()} CA ${pkg.version} (${wasmSha.slice(0, 12)}) SOCRATES parity: ${units.length} units (${todo.length} todo), ${processes} procs x ${threads} threads`);

  let done = units.length - todo.length;
  if (todo.length) {
    const buckets = Array.from({ length: Math.min(processes, todo.length) }, (_, w) => todo.filter((_, i) => i % processes === w));
    await Promise.all(buckets.map((list, w) => new Promise((resolve, reject) => {
      const jf = path.join(RUN_DIR, `job-${w}.json`);
      fs.writeFileSync(jf, JSON.stringify({ ommStream, order, screen: job0.screen, window: job0.window, threads, units: list }));
      const child = fork(SELF, ['--worker', '--job', jf], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      child.on('message', (m) => {
        done++;
        if (done % 10 === 0 || done === units.length) {
          console.log(`${new Date().toISOString()} parity unit ${m.id} (${done}/${units.length}, ${((Date.now() - tStart) / 60000).toFixed(1)} min, last=${m.sec}s ev=${m.events})`);
        }
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited ${code}`))));
    })));
  }

  // Merge all CA 0.19.3 events and compare against BOTH baseline CA 0.12.0/0.17.0 AND published SOCRATES Plus!
  const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const merge1s = (list) => {
    const sorted = list.map((e) => ({ ...e, key: pairKey(e.a, e.b) })).sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.tcaJd - y.tcaJd));
    const out = [];
    for (const e of sorted) {
      const last = out.at(-1);
      if (!(last && last.key === e.key && (e.tcaJd - last.tcaJd) * DAY_S <= 1)) out.push(e);
    }
    return out;
  };

  let totalFailedPairs = 0;
  const rawNew = [];
  const excludedNorads = new Set();
  for (const u of units) {
    const d = JSON.parse(fs.readFileSync(path.join(UNITS_DIR, `u-${String(u.id).padStart(4, '0')}.json`), 'utf8'));
    totalFailedPairs += d.failedPairs || 0;
    for (const e of d.events) rawNew.push(e);
    for (const x of d.excluded) excludedNorads.add(x.norad);
  }
  const evNew = merge1s(rawNew);

  // Load baseline CA 0.12.0 (identical to CA 0.17.0)
  const rawBase = [1, 2].flatMap((p) => JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, `part${p}/screen-events.json`), 'utf8')));
  const evBase = merge1s(rawBase);

  // One-to-one diff against baseline
  const byPairNew = new Map();
  evNew.forEach((e, n) => { (byPairNew.get(e.key) ?? byPairNew.set(e.key, []).get(e.key)).push(n); });
  const candB = [];
  evBase.forEach((e, i) => {
    for (const n of byPairNew.get(e.key) ?? []) {
      const dt = Math.abs(evNew[n].tcaJd - e.tcaJd) * DAY_S;
      if (dt <= 1) candB.push([dt, i, n]);
    }
  });
  candB.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const bToN = new Int32Array(evBase.length).fill(-1), nToB = new Int32Array(evNew.length).fill(-1);
  for (const [, i, n] of candB) if (bToN[i] < 0 && nToB[n] < 0) { bToN[i] = n; nToB[n] = i; }
  let exactIdentical = 0, maxDtBase = 0, maxDmBase = 0, maxDsBase = 0;
  for (let i = 0; i < evBase.length; i++) {
    const n = bToN[i];
    if (n < 0) continue;
    const dt = Math.abs(evNew[n].tcaJd - evBase[i].tcaJd) * DAY_S;
    const dm = Math.abs(evNew[n].missM - evBase[i].missM);
    const ds = Math.abs(evNew[n].speedMS - evBase[i].speedMS);
    if (dt === 0 && dm === 0 && ds === 0) exactIdentical++;
    if (dt > maxDtBase) maxDtBase = dt;
    if (dm > maxDmBase) maxDmBase = dm;
    if (ds > maxDsBase) maxDsBase = ds;
  }

  // Score directly against published SOCRATES Plus CSV (2026-10-28T17:00Z, 193,952 rows)
  const commonMod = await import(pathToFileURL(path.join(OAE, 'experiments/ca-socrates-gp-parity/common.mjs')).href);
  const report = commonMod.readSocrates();
  const catalog = commonMod.readCatalog();
  const editions = commonMod.editionClasses(report, catalog.rows);
  const winStart = job0.window.startJd, winEnd = winStart + 7;
  const nearEdge = (jd) => (jd - winStart) * DAY_S < 60 || (winEnd - jd) * DAY_S < 60;
  const classOf = (a, b) => (Math.max(a, b) >= 100000 ? 'numbered100000' : editions.matched.has(a) && editions.matched.has(b) ? 'primary' : 'editionMismatch');
  const ref = report.filter((r) => r.tcaJd >= winStart && r.tcaJd < winEnd).map((r) => ({ ...r, key: pairKey(r.a, r.b), cls: classOf(r.a, r.b), band: r.rangeM < 1000 ? 'below1km' : '1to5km', edge: nearEdge(r.tcaJd) }));
  const candS = [];
  ref.forEach((r, i) => {
    for (const n of byPairNew.get(r.key) ?? []) {
      const dt = Math.abs(evNew[n].tcaJd - r.tcaJd) * DAY_S;
      if (dt <= 60) candS.push([dt, i, n]);
    }
  });
  candS.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const refTo = new Int32Array(ref.length).fill(-1), evTo = new Int32Array(evNew.length).fill(-1);
  for (const [, i, n] of candS) if (refTo[i] < 0 && evTo[n] < 0) { refTo[i] = n; evTo[n] = i; }

  const recall = {};
  for (const cls of ['primary', 'numbered100000', 'editionMismatch']) {
    recall[cls] = {};
    for (const band of ['below1km', '1to5km', 'all']) {
      const idx = ref.map((_, i) => i).filter((i) => !ref[i].edge && ref[i].cls === cls && (band === 'all' || ref[i].band === band));
      const found = idx.filter((i) => refTo[i] >= 0).length;
      recall[cls][band] = { reference: idx.length, found, misses: idx.length - found, recall: idx.length ? +(found / idx.length).toFixed(6) : null };
    }
  }
  const edgeRef = ref.filter((r) => r.edge);
  const edgeFound = ref.filter((r, i) => r.edge && refTo[i] >= 0).length;

  const dist = (arr) => {
    const s = arr.map(Math.abs).sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return s.length ? { n: s.length, median: +q(0.5).toPrecision(5), p99: +q(0.99).toPrecision(5), max: +s[s.length - 1].toPrecision(5) } : { n: 0 };
  };
  const primaryMatched = ref.map((r, i) => [r, refTo[i]]).filter(([r, n]) => !r.edge && r.cls === 'primary' && n >= 0);
  const nlrv = primaryMatched.filter(([r]) => r.speedMS >= 50);
  const geometryPrimary = {
    matched: primaryMatched.length,
    nlrvTcaMs: dist(nlrv.map(([r, n]) => (evNew[n].tcaJd - r.tcaJd) * DAY_S * 1000)),
    missM: dist(primaryMatched.map(([r, n]) => evNew[n].missM - r.rangeM)),
    speedMS: dist(primaryMatched.map(([r, n]) => evNew[n].speedMS - r.speedMS)),
    beyondTolerance: {
      nlrvTca10ms: nlrv.filter(([r, n]) => Math.abs((evNew[n].tcaJd - r.tcaJd) * DAY_S) > 0.01).length,
      miss5m: primaryMatched.filter(([r, n]) => Math.abs(evNew[n].missM - r.rangeM) > 5.0).length,
      speed5ms: primaryMatched.filter(([r, n]) => Math.abs(evNew[n].speedMS - r.speedMS) > 5.0).length,
    },
  };

  const doc = {
    schema: 'sdn-ap-socrates-parity-1',
    generatedUtc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    module: {
      name: 'analysis/conjunction-assessment',
      version: pkg.version,
      wasmSha256: wasmSha,
    },
    socratesRun: {
      windowStartUtc: '2026-10-28T17:00:00Z',
      windowEndUtc: '2026-11-04T17:00:00Z',
      durationDays: 7,
      thresholdKm: 5,
      socratesRows: report.length,
      catalogObjects: catalog.rows.length,
      activePrimaries: totalPrimaries,
      ommStreamSha256: ommSha,
      editionsMatched: editions.matched.size,
      editionsTotal: editions.objects,
    },
    baselineDiffVs017: {
      baselineEvents: evBase.length,
      newEvents: evNew.length,
      paired: bToN.filter((x) => x >= 0).length,
      exactBitIdentical: exactIdentical,
      onlyInBaseline: bToN.filter((x) => x < 0).length,
      onlyInNew: nToB.filter((x) => x < 0).length,
      maxDtSeconds: maxDtBase,
      maxDMissM: maxDmBase,
      maxDSpeedMS: maxDsBase,
    },
    recall,
    boundaryEvents: { reference: edgeRef.length, found: edgeFound },
    geometryPrimary,
    excludedPortObjects: excludedNorads.size,
    failedPairs: totalFailedPairs,
    extrasUnexplainedDisclosedInA3: 1146,
    verdict: recall.primary.all.misses === 0 && recall.numbered100000.all.misses === 0 && geometryPrimary.beyondTolerance.nlrvTca10ms === 0 && geometryPrimary.beyondTolerance.miss5m === 0 && geometryPrimary.beyondTolerance.speed5ms === 0 ? 'PASS' : 'FAIL',
    wallMinutes: +((Date.now() - tStart) / 60000).toFixed(2),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`\n=== CA ${pkg.version} SOCRATES PARITY: ${doc.verdict} (${doc.wallMinutes} min) ===`);
  console.log(JSON.stringify({ primary: recall.primary.all, numbered100000: recall.numbered100000.all, boundary: doc.boundaryEvents, geom: geometryPrimary, diff017: doc.baselineDiffVs017 }, null, 2));
}
