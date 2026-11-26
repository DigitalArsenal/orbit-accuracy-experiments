#!/usr/bin/env node
// Item 5 (#1128 / #976): Build Live Full-Catalog 3-Arm Snapshot (32,988 objects, T0 = 2026-11-24T17:00:00Z)
// Runs every object through compiled flows/catalog-builder 0.2.6 + analysis/gp-error-model 0.19.2
// (capturing the ANNOTATED $OCM with native empirical covariance on ALL AP and SGP4-XP branches!)
// plus stock Space-Track public GP $OMM for SGP4.
// Strict pre-T0 causality: GP snapshot <= T0, 21-day gp_history <= T0, SpaceX 16-57Z cycle < T0, causal SPW.
//
// Usage:
//   SDN_MODULES_ROOT=... node build-live-catalog-074.mjs --workers 14 [--smoke]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DAY_MS, nowUtc, utcMs, dayStr, sha256File,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords,
} from './amendment6-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const LIVE_DIR = process.env.SDN_LIVE_CATALOG_DIR || path.join(OAE, 'runs/ca-rollup-074/live-20261124');
const T0_ISO = '2026-11-24T17:00:00.000Z';
const T0_MS = Date.parse(T0_ISO);
const SL_CYCLE = '2026-11-24T16-57-57-960Z';
const WEATHER_CUTOFF = '2026-11-24';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

// Drive catalog-builder 0.2.6 + gp-error-model 0.19.2 capturing the FINAL ANNOTATED $OCM (with native covariance!)
async function buildAnnotatedBatch({ sds, kind, nowMs, seeds, historyByNorad, ephemeridesByNorad, weatherRecords, reusable }) {
  const { fb, sdkBrowser, sdkRuntime, OMM_MOD, OCM_MOD, CAT_MOD, QRP_MOD, pack, frame, splitPrefixed } = sds;
  const controlDir = path.join(MODULES, 'flows/catalog-builder/dist/flow/control');
  const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));
  const cfg = {
    'catalog.provider': `live074-${kind}`,
    'catalog.identity_provider': 'local',
    'catalog.identity_source': 'identities',
    'catalog.weather_provider': 'local',
    'catalog.weather_source': 'weather',
    'catalog.seed_sources': ['primary'],
    'catalog.seed_providers': ['local'],
    'catalog.object_product_kind': kind,
    'catalog.page_size': 64,
    'catalog.batch_size': 16,
    'catalog.max_removal_fraction': 1,
    ...(ephemeridesByNorad?.size ? {
      'catalog.ephemeris_sources': ['operator'],
      'catalog.ephemeris_providers': ['local'],
    } : {}),
  };
  const store = new Map();
  const batches = new Map();
  const getList = (s, p, n) => { const k = `${s}/${p}/${n}`; if (!store.has(k)) store.set(k, []); return store.get(k); };
  const seedList = getList('OMM.fbs', 'local', 'primary');
  const idList = getList('CAT.fbs', 'local', 'identities');
  for (const [norad, ommPref] of seeds) {
    seedList.push(ommPref);
    idList.push(pack(Object.assign(new CAT_MOD.CATT(), { NORAD_CAT_ID: norad, OBJECT_NAME: `OBJ-${norad}` }), 'CAT', true));
  }
  getList('SPW.fbs', 'local', 'weather').push(...weatherRecords);
  if (ephemeridesByNorad?.size) {
    const ephList = getList('OCM.fbs', 'local', 'operator');
    for (const buf of ephemeridesByNorad.values()) ephList.push(buf);
  }
  const control = await sdkBrowser.createBrowserModuleHarness({
    wasmSource: fs.readFileSync(path.join(controlDir, 'dist/isomorphic/module.wasm')),
    manifest: manifest(path.join(MODULES, 'flows/catalog-builder/control')),
    surface: 'direct',
    hostOptions: { config: cfg },
  });
  const { chain, gp, composer } = reusable;
  const results = new Map();
  try {
    const maxTicks = Math.max(1, Math.ceil(seeds.size / 16) + 2);
    for (let tickIdx = 0; tickIdx < maxTicks && results.size < seeds.size; tickIdx++) {
      const prevCount = results.size;
      let response = await control.invoke({
        methodId: 'advance',
        inputs: [frame('tick', 'TimerTick', sdkRuntime.encodeTimerTick({ triggerId: 'refresh', firedMs: nowMs + tickIdx * 1000 }))],
      });
      for (let step = 0; step < 50000; step++) {
        if (response.statusCode !== 0) throw new Error(`controller advance failed: ${response.errorCode} ${response.errorMessage}`);
        const out = Object.fromEntries(response.outputs.map((f) => [f.portId, f]));
        if (out.notice) break;
        let input = [];
        if (out.query) {
          const q = QRP_MOD.QRP.getRootAsQRP(new fb.ByteBuffer(out.query.payload)).unpack();
          if (q.FILTERS?.length) {
            const id = Number(q.FILTERS.find((f) => f.FIELD === 'NORAD_CAT_ID')?.VALUE);
            const from = Number(q.FROM_EPOCH_MS), to = Number(q.TO_EPOCH_MS);
            const hist = historyByNorad.get(id) ?? [];
            const rows = hist.filter((x) => x.ms >= from && x.ms <= to).map((x) => x.buf);
            const header = Object.assign(new QRP_MOD.QRPT(), {
              KIND: QRP_MOD.qrpKind.Page, STATUS: QRP_MOD.qrpStatus.Ok,
              SCHEMA_NAME: q.SCHEMA_NAME, PROVIDER_ID: q.PROVIDER_ID, SOURCE_NAME: q.SOURCE_NAME,
              RECORD_COUNT: rows.length, TOTAL_COUNT: BigInt(rows.length),
              FROM_EPOCH_MS: q.FROM_EPOCH_MS, TO_EPOCH_MS: q.TO_EPOCH_MS,
            });
            input = [frame('page', 'QRP', Buffer.concat([pack(header, 'QRP', true), ...rows])), frame('query_status', 'QRP', out.query.payload)];
          } else {
            const data = q.BATCH_ID ? (batches.get(q.BATCH_ID) ?? []) : getList(q.SCHEMA_NAME, q.PROVIDER_ID, q.SOURCE_NAME);
            const [off, head] = q.CURSOR ? q.CURSOR.split(':').map(Number) : [0, data.length];
            const page = data.slice(off, Math.min(head, off + q.LIMIT));
            const end = off + page.length;
            const header = Object.assign(new QRP_MOD.QRPT(), {
              KIND: QRP_MOD.qrpKind.Page, STATUS: QRP_MOD.qrpStatus.Ok,
              SCHEMA_NAME: q.SCHEMA_NAME, PROVIDER_ID: q.PROVIDER_ID, SOURCE_NAME: q.SOURCE_NAME,
              BATCH_ID: q.BATCH_ID, RECORD_COUNT: page.length, TOTAL_COUNT: BigInt(head),
              NEXT_CURSOR: end < head ? `${end}:${head}` : null,
            });
            input = [frame('page', 'QRP', Buffer.concat([pack(header, 'QRP', true), ...page])), frame('query_status', 'QRP', out.query.payload)];
          }
        } else if (out.seed || out.fallback_seed) {
          const isFit = Boolean(out.seed);
          const seedPayload = (out.seed ?? out.fallback_seed).payload;
          const id = OMM_MOD.OMM.getRootAsOMM(new fb.ByteBuffer(seedPayload)).NORAD_CAT_ID();
          const ports = ['flight_config', 'fit_config', 'weather', 'history', 'plan', 'ephemeris'].filter((p) => out[p]).map((p) => out[p]);
          const inputs = isFit ? [frame('omm', 'OMM', seedPayload), ...ports] : [frame('omm', 'OMM', seedPayload)];
          const r = await chain.invoke({ methodId: isFit ? 'run_chain' : 'ingest_seed', inputs });
          if (r.statusCode !== 0) throw new Error(`chain failed (${id}): ${r.errorCode} ${r.errorMessage}`);
          const el = r.outputs.find((f) => f.portId === 'elements');
          const fbOut = r.outputs.find((f) => f.portId === 'fallback');
          const dec = QRP_MOD.QRP.getRootAsQRP(new fb.ByteBuffer(r.outputs.find((f) => f.portId === 'decision').payload)).unpack();
          if (el) {
            results.set(id, { ocmBuf: Buffer.from(el.payload), isFallback: false, annotated: false, fromEph: Boolean(out.ephemeris), reason: dec.MESSAGE || '' });
          } else if (fbOut && !results.has(id)) {
            results.set(id, { ocmBuf: Buffer.from(fbOut.payload), isFallback: true, annotated: false, fromEph: false, reason: dec.MESSAGE || '' });
          }
          input = r.outputs.map((f) => ({ ...f, portId: { fallback: 'fallback', elements: 'candidate', decision: 'chain_status' }[f.portId] }));
        } else if (out.annotate_orbit) {
          const ar = await gp.invoke({ methodId: 'annotate_population_flow', inputs: [frame('ocm', 'OCM', out.annotate_orbit.payload), frame('elements', 'OMM', out.annotate_seed.payload)] });
          if (ar.statusCode !== 0) throw new Error(`annotate failed: ${ar.errorCode} ${ar.errorMessage}`);
          const ann = ar.outputs.find((f) => f.portId === 'ocm' || f.portId === 'annotated');
          if (ann && ann.payload?.length >= 12) {
            const raw = Buffer.from(ann.payload);
            const annBuf = raw.subarray(4, 8).toString('ascii') === '$OCM' ? raw : raw.subarray(4);
            const ocm = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(annBuf));
            const id = ocm.METADATA()?.NORAD_CAT_ID();
            if (id && results.has(id)) {
              const prev = results.get(id);
              const hasCov = (ocm.covarianceBlocksLength?.() || 0) > 0 || (ocm.covarianceDataLength?.() || 0) > 0;
              results.set(id, { ...prev, ocmBuf: annBuf, annotated: hasCov });
            }
          }
          input = ar.outputs.map((f) => ({ ...f, portId: f.portId === 'decision' ? 'annotation_status' : 'annotated' }));
        } else if (out.meta) {
          const m = sdkRuntime.decodeIngestRequest(out.meta.payload);
          const rows = splitPrefixed(Buffer.from((out.product_records ?? out.index_records ?? out.state_records).payload));
          const exists = batches.has(m.tags.batchId);
          if (!exists) {
            batches.set(m.tags.batchId, rows);
            if (!out.state_records || m.reconcile !== 'current') getList(m.schema, m.tags.providerId, m.tags.sourceName).push(...rows);
            else store.set(`${m.schema}/${m.tags.providerId}/${m.tags.sourceName}`, rows.slice());
          }
          input = [frame('stored', 'IngestResult', sdkRuntime.encodeIngestResult({ schema: m.schema, ...m.tags, inserted: exists ? 0 : rows.length, reconciledDuplicates: 0 }))];
        } else if (out.recipe) {
          const cr = await composer.invoke({ methodId: 'replace_products', inputs: [out.recipe, out.catalog, { ...out.selection, portId: 'decision' }, ...(out.selected ? [{ ...out.selected, portId: 'ocm_products' }] : [])] });
          if (cr.statusCode !== 0) throw new Error(`compose failed: ${cr.errorCode} ${cr.errorMessage}`);
          input = cr.outputs.map((f) => ({ ...f, portId: f.portId === 'decision' ? 'compose_status' : 'replacement' }));
        } else {
          throw new Error(`unexpected controller ports: ${Object.keys(out).join(',')}`);
        }
        response = await control.invoke({ methodId: 'advance', inputs: input });
      }
      if (results.size === prevCount) break;
    }
  } finally {
    await control.destroy?.();
  }
  return results;
}

function sizePrefix(buf) {
  const out = Buffer.allocUnsafe(4 + buf.length);
  out.writeUInt32LE(buf.length, 0);
  buf.copy(out, 4);
  return out;
}

function prepareInputs(workers, smoke) {
  const prepDir = path.join(LIVE_DIR, 'prep');
  const metaPath = path.join(prepDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (m.workers === workers && m.smoke === smoke) return m;
  }
  fs.mkdirSync(prepDir, { recursive: true });
  console.log(`${nowUtc()} Preparing 2026-11-24 live catalog inputs (workers=${workers}, smoke=${smoke})...`);
  const gpSnap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ARCHIVE, 'spacetrack/gp/2026/2026-11-24.json.gz'))));
  const seedByNorad = new Map();
  for (const r of gpSnap) {
    const id = Number(r.NORAD_CAT_ID);
    const cMs = utcMs(r.CREATION_DATE), eMs = utcMs(r.EPOCH);
    if (cMs > T0_MS || eMs >= T0_MS) continue;
    const prev = seedByNorad.get(id);
    if (!prev || eMs > utcMs(prev.EPOCH)) seedByNorad.set(id, r);
  }
  let norads = [...seedByNorad.keys()].sort((a, b) => a - b);
  if (smoke) norads = norads.slice(0, 140);
  const want = new Set(norads);

  const slDir = path.join(ARCHIVE, 'operator-capture/cycles', SL_CYCLE);
  const slSet = new Set(fs.readdirSync(slDir).filter((f) => f.endsWith('.ocm')).map((f) => Number(f.slice(0, -4))));

  // Load 21-day gp_history strictly <= T0
  const fromMs = T0_MS - 21 * DAY_MS;
  const fromDay = dayStr(fromMs - DAY_MS);
  const toDay = dayStr(T0_MS);
  const histDir = path.join(ARCHIVE, 'spacetrack/gp_history/by-creation/2026');
  const files = fs.readdirSync(histDir).filter((f) => f.endsWith('.json.gz')).filter((f) => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(f);
    return m && m[1] >= fromDay && m[1] <= toDay;
  }).sort();

  const histByNorad = new Map(norads.map((id) => [id, new Map()]));
  for (const id of norads) {
    const s = seedByNorad.get(id);
    histByNorad.get(id).set(s.EPOCH, s);
  }
  for (const f of files) {
    const mStart = /^(\d{4}-\d{2}-\d{2}T\d{2}\d{2}\d{2}Z)/.exec(f);
    if (mStart) {
      const ts = mStart[1].replace(/T(\d{2})(\d{2})(\d{2})Z/, 'T$1:$2:$3Z');
      if (Date.parse(ts) > T0_MS) continue;
    }
    const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(histDir, f))));
    for (const r of arr) {
      const id = Number(r.NORAD_CAT_ID);
      if (!want.has(id)) continue;
      const cMs = utcMs(r.CREATION_DATE), eMs = utcMs(r.EPOCH);
      if (!(cMs <= T0_MS && eMs < T0_MS && eMs >= fromMs)) continue;
      histByNorad.get(id).set(r.EPOCH, r);
    }
  }

  for (let w = 0; w < workers; w++) {
    const rows = [];
    for (let i = w; i < norads.length; i += workers) {
      const id = norads[i];
      const hist = [...histByNorad.get(id).values()].sort((a, b) => utcMs(a.EPOCH) - utcMs(b.EPOCH));
      rows.push({ norad: id, seed: seedByNorad.get(id), hist, hasOpEph: slSet.has(id) });
    }
    fs.writeFileSync(path.join(prepDir, `shard-${w}.json`), JSON.stringify(rows));
  }
  const meta = { workers, smoke, objects: norads.length, operatorOcmsAvailable: norads.filter((id) => slSet.has(id)).length, t0: T0_ISO };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  console.log(`${nowUtc()} Prepared ${norads.length} objects (${meta.operatorOcmsAvailable} with SpaceX ephemerides)`);
  return meta;
}

async function runWorker(w, total) {
  const t0 = Date.now();
  const sds = await loadSdsAndSdk(MODULES);
  const { sdkBrowser, sdkIso, OCM_MOD, fb } = sds;
  const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));
  const shardPath = path.join(LIVE_DIR, 'prep', `shard-${w}.json`);
  const items = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  const weatherRecords = buildCausalSpwRecords({
    archiveRoot: ARCHIVE, sds,
    firstDate: dayStr(T0_MS - 35 * DAY_MS),
    lastDate: dayStr(T0_MS + 14 * DAY_MS),
    cutoffDate: WEATHER_CUTOFF,
  });
  const slDir = path.join(ARCHIVE, 'operator-capture/cycles', SL_CYCLE);

  const reusable = {
    chain: await sdkIso.createStandaloneHarness('browser', path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm'), { surface: 'direct', enableBrowserWasiThreads: false }),
    gp: await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/gp-error-model/dist/isomorphic/module.wasm')), manifest: manifest(path.join(MODULES, 'analysis/gp-error-model')), surface: 'direct' }),
    composer: await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/catalog-composer/dist/isomorphic/module.wasm')), manifest: manifest(path.join(MODULES, 'analysis/catalog-composer')), surface: 'direct' }),
  };

  const sgp4Chunks = [], apChunks = [], xpChunks = [];
  const stats = { objects: items.length, apOk: 0, apFallback: 0, apAnnotated: 0, apFromEph: 0, xpOk: 0, xpFallback: 0, xpAnnotated: 0, xpFromEph: 0, apCpuMs: 0, xpCpuMs: 0 };
  const BATCH = 32;
  for (let off = 0; off < items.length; off += BATCH) {
    const slice = items.slice(off, off + BATCH);
    const seeds = new Map();
    const histMap = new Map();
    const ephMap = new Map();
    for (const it of slice) {
      const ommPref = gpJsonToOmm(it.seed, sds, true);
      seeds.set(it.norad, ommPref);
      sgp4Chunks.push(ommPref);
      histMap.set(it.norad, it.hist.map((r) => ({ ms: utcMs(r.EPOCH), buf: gpJsonToOmm(r, sds, true) })));
      if (it.hasOpEph) ephMap.set(it.norad, fs.readFileSync(path.join(slDir, `${it.norad}.ocm`)));
    }
    const tAp = Date.now();
    const apRes = await buildAnnotatedBatch({ sds, kind: 'sdn-ap', nowMs: T0_MS, seeds, historyByNorad: histMap, ephemeridesByNorad: ephMap, weatherRecords, reusable });
    stats.apCpuMs += Date.now() - tAp;
    const tXp = Date.now();
    const xpRes = await buildAnnotatedBatch({ sds, kind: 'sgp4-xp', nowMs: T0_MS, seeds, historyByNorad: histMap, ephemeridesByNorad: ephMap, weatherRecords, reusable });
    stats.xpCpuMs += Date.now() - tXp;

    for (const it of slice) {
      const a = apRes.get(it.norad);
      if (a?.ocmBuf) {
        apChunks.push(sizePrefix(a.ocmBuf));
        if (a.isFallback) stats.apFallback++; else stats.apOk++;
        if (a.annotated) stats.apAnnotated++;
        if (a.fromEph) stats.apFromEph++;
      }
      const x = xpRes.get(it.norad);
      if (x?.ocmBuf) {
        xpChunks.push(sizePrefix(x.ocmBuf));
        if (x.isFallback) stats.xpFallback++; else stats.xpOk++;
        if (x.annotated) stats.xpAnnotated++;
        if (x.fromEph) stats.xpFromEph++;
      }
    }
    if ((off + slice.length) % 64 === 0 || off + slice.length === items.length) {
      console.log(`${nowUtc()} [cat w${w}/${total}] ${off + slice.length}/${items.length} apOk=${stats.apOk} apCov=${stats.apAnnotated} xpCov=${stats.xpAnnotated} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  await reusable.chain.destroy?.();
  await reusable.gp.destroy?.();
  await reusable.composer.destroy?.();

  fs.writeFileSync(path.join(LIVE_DIR, `shard-${w}-sgp4.omm.bin`), Buffer.concat(sgp4Chunks));
  fs.writeFileSync(path.join(LIVE_DIR, `shard-${w}-ap.ocm.bin`), Buffer.concat(apChunks));
  fs.writeFileSync(path.join(LIVE_DIR, `shard-${w}-xp.ocm.bin`), Buffer.concat(xpChunks));
  fs.writeFileSync(path.join(LIVE_DIR, `shard-${w}-stats.json`), JSON.stringify(stats));
}

async function runParent(workers, smoke) {
  const tStart = Date.now();
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  const meta = prepareInputs(workers, smoke);
  const todo = [];
  for (let w = 0; w < workers; w++) {
    if (!fs.existsSync(path.join(LIVE_DIR, `shard-${w}-stats.json`))) todo.push(w);
  }
  await Promise.all(todo.map((w) => new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF,
      '--worker', String(w), '--of', String(workers)], { stdio: 'inherit', env: { ...process.env, SDN_MODULES_ROOT: MODULES } });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited ${code}`))));
  })));

  // Concatenate shards into sgp4-catalog.omm.bin, ap-catalog.ocm.bin, xp-catalog.ocm.bin
  const sgp4Out = [], apOut = [], xpOut = [];
  const summary = {
    objects: meta.objects,
    t0: T0_ISO,
    operatorOcmsAvailable: meta.operatorOcmsAvailable,
    apOk: 0, apFallback: 0, apAnnotated: 0, apFromEph: 0,
    xpOk: 0, xpFallback: 0, xpAnnotated: 0, xpFromEph: 0,
    apCpuMs: 0, xpCpuMs: 0,
    wallMs: Date.now() - tStart,
    catalogBuilderVersion: '0.2.6',
    gpErrorModelVersion: '0.19.1',
    sdnApVersion: '0.7.4',
    chainWasmSha256: sha256File(path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm')),
    gpErrorModelWasmSha256: sha256File(path.join(MODULES, 'analysis/gp-error-model/dist/isomorphic/module.wasm')),
  };
  for (let w = 0; w < workers; w++) {
    sgp4Out.push(fs.readFileSync(path.join(LIVE_DIR, `shard-${w}-sgp4.omm.bin`)));
    apOut.push(fs.readFileSync(path.join(LIVE_DIR, `shard-${w}-ap.ocm.bin`)));
    xpOut.push(fs.readFileSync(path.join(LIVE_DIR, `shard-${w}-xp.ocm.bin`)));
    const st = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, `shard-${w}-stats.json`), 'utf8'));
    for (const k of ['apOk', 'apFallback', 'apAnnotated', 'apFromEph', 'xpOk', 'xpFallback', 'xpAnnotated', 'xpFromEph', 'apCpuMs', 'xpCpuMs']) summary[k] += st[k];
  }
  fs.writeFileSync(path.join(LIVE_DIR, 'sgp4-catalog.omm.bin'), Buffer.concat(sgp4Out));
  fs.writeFileSync(path.join(LIVE_DIR, 'ap-catalog.ocm.bin'), Buffer.concat(apOut));
  fs.writeFileSync(path.join(LIVE_DIR, 'xp-catalog.ocm.bin'), Buffer.concat(xpOut));
  fs.writeFileSync(path.join(LIVE_DIR, 'build-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log('LIVE CATALOG 0.7.4 COMPLETE:', JSON.stringify(summary, null, 2));
}

if (arg('--worker') !== null) {
  await runWorker(Number(arg('--worker')), Number(arg('--of', '14')));
} else {
  await runParent(Number(arg('--workers', '14')), has('--smoke'));
}
process.exit(0);
