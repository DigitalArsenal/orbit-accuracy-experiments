#!/usr/bin/env node
// Measure causal Space-Track GP + 21d GP history (SGP4, SGP4-XP, SDN-AP) across CelesTrak SupGP
// constellations (kuiper, iridium, orbcomm, ast) against the first SupGP snapshot published > T0+24h.
// Strictly enforces CREATION_DATE <= T0 and EPOCH <= T0 on all inputs, pins WASM hashes against
// amendment6-config.json, and embeds gitHead, configSha256, and all module WASM SHA256 digests.
//
// Usage:
//   SDN_MODULES_ROOT=/tmp/work-m3-modules SDN_OUT_PATH=results/ca-rollup-076/supgp-constellations-0.7.6-m33.json \
//     node experiments/ca-rollup-075/measure-supgp-constellations-075.mjs [--workers 12]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import zlib from 'node:zlib';
import {
  DAY_MS, HOUR_MS, sha256File, nowUtc, utcMs, dayStr,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords, buildCatalogBatch,
} from './amendment6-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const OUT_PATH = process.env.SDN_OUT_PATH || path.join(OAE, 'results/ca-rollup-075/supgp-constellations-0.7.5.json');
const CFG_PATH = fs.existsSync(path.join(path.dirname(SELF), 'amendment6-config.json'))
  ? path.join(path.dirname(SELF), 'amendment6-config.json')
  : path.join(OAE, 'experiments/ca-rollup-075/amendment6-config.json');

const SUPGP_DIR = path.join(ARCHIVE, 'celestrak/supgp-host02');
const GP_DIR = path.join(ARCHIVE, 'spacetrack/gp/2026');
const CONSTELLATIONS = ['kuiper', 'iridium', 'orbcomm', 'ast'];

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const plain = (b) => {
  const u = Buffer.from(b);
  return u.length >= 8 && u.readUInt32LE(0) + 4 === u.length ? u.subarray(4) : u;
};

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const x = (sorted.length - 1) * q;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
};

const statsOf = (arr) => {
  const s = arr.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  return {
    n: s.length,
    medianM: +quantile(s, 0.5).toFixed(2),
    p95M: +quantile(s, 0.95).toFixed(2),
    maxM: +s[s.length - 1].toFixed(2),
  };
};

function parseStampMs(fname) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.json$/.exec(fname);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function findFirstSupGpAfter(constellation, minMs) {
  const dir = path.join(SUPGP_DIR, constellation);
  if (!fs.existsSync(dir)) throw new Error(`Missing SupGP directory: ${dir}`);
  const files = fs.readdirSync(dir)
    .map((f) => ({ f, ms: parseStampMs(f) }))
    .filter((x) => Number.isFinite(x.ms) && x.ms > minMs)
    .sort((a, b) => a.ms - b.ms);
  if (!files.length) throw new Error(`No SupGP file > ${new Date(minMs).toISOString()} in ${dir}`);
  const chosen = files[0];
  const jsonPath = path.join(dir, chosen.f);
  const rmsFile = chosen.f.replace(/\.json$/, '.rms.txt');
  const rmsPath = path.join(dir, rmsFile);
  if (!fs.existsSync(rmsPath)) throw new Error(`Missing companion RMS file: ${rmsPath}`);
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const byNorad = new Map();
  for (const r of rows) {
    const id = Number(r.NORAD_CAT_ID);
    if (Number.isFinite(id) && id > 0) byNorad.set(id, r);
  }
  const rmsVals = [];
  for (const line of fs.readFileSync(rmsPath, 'utf8').split(/\r?\n/)) {
    const m = /RMS\s*=\s*([0-9.]+)\s*km/i.exec(line);
    if (m) rmsVals.push(Number(m[1]));
  }
  rmsVals.sort((a, b) => a - b);
  return {
    constellation,
    file: chosen.f,
    issueUtc: new Date(chosen.ms).toISOString(),
    sha256: sha256File(jsonPath),
    rmsFile,
    rmsSha256: sha256File(rmsPath),
    floorMedianRmsKm: rmsVals.length ? +quantile(rmsVals, 0.5).toFixed(2) : null,
    floorP95RmsKm: rmsVals.length ? +quantile(rmsVals, 0.95).toFixed(2) : null,
    byNorad,
  };
}

function verifyProvenanceAndConfig(skipPinCheck) {
  const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
  const apPath = path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
  const chainPath = path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm');
  const controlPath = path.join(MODULES, 'flows/catalog-builder/dist/flow/control/dist/isomorphic/module.wasm');
  const runtimePath = path.join(MODULES, 'flows/catalog-builder/dist/flow/runtime/isomorphic/module.wasm');
  const gpErrPath = path.join(MODULES, 'analysis/gp-error-model/dist/isomorphic/module.wasm');
  const composerPath = path.join(MODULES, 'analysis/catalog-composer/dist/isomorphic/module.wasm');

  const apSha = sha256File(apPath);
  const chainSha = sha256File(chainPath);
  const controlSha = sha256File(controlPath);
  const runtimeSha = sha256File(runtimePath);
  const gpErrSha = sha256File(gpErrPath);
  const composerSha = sha256File(composerPath);

  if (!skipPinCheck) {
    assert.equal(cfg.frozen, true, 'amendment6-config.json must be frozen');
    const dirty = execFileSync('git', [
      'status', '--porcelain', '--',
      'experiments/ca-rollup-075/AMENDMENT-6.md',
      'experiments/ca-rollup-075/amendment6-config.json',
    ], { cwd: OAE, encoding: 'utf8' }).trim();
    assert.equal(dirty, '', `Amendment 6 registration dirty/uncommitted: ${dirty}`);
    assert.equal(apSha, cfg.modules.sdnAp.wasmSha256, `sdn-ap wasmSha256 mismatch: ${apSha}`);
    assert.equal(chainSha, cfg.modules.catalogBuilder.chainWasmSha256, `catalog-builder chainWasmSha256 mismatch: ${chainSha}`);
    assert.equal(controlSha, cfg.modules.catalogBuilder.controlWasmSha256, `catalog-builder controlWasmSha256 mismatch: ${controlSha}`);
    assert.equal(gpErrSha, cfg.modules.gpErrorModel.wasmSha256, `gp-error-model wasmSha256 mismatch: ${gpErrSha}`);
  }

  const provPath = path.join(MODULES, 'scripts/artifact-provenance.json');
  const prov = fs.existsSync(provPath) ? JSON.parse(fs.readFileSync(provPath, 'utf8')) : null;
  const apPkg = JSON.parse(fs.readFileSync(path.join(MODULES, 'propagator/sdn-ap/package.json'), 'utf8'));
  const cbPkg = JSON.parse(fs.readFileSync(path.join(MODULES, 'flows/catalog-builder/package.json'), 'utf8'));
  const gpPkg = JSON.parse(fs.readFileSync(path.join(MODULES, 'analysis/gp-error-model/package.json'), 'utf8'));
  const compPkg = JSON.parse(fs.readFileSync(path.join(MODULES, 'analysis/catalog-composer/package.json'), 'utf8'));

  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: OAE, encoding: 'utf8' }).trim();
  let modulesGitHead = null;
  try { modulesGitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: MODULES, encoding: 'utf8' }).trim(); } catch {}

  return {
    gitHead,
    modulesGitHead,
    configSha256: sha256File(CFG_PATH),
    modules: {
      sdnAp: {
        version: apPkg.version,
        wasmSha256: apSha,
        canonicalSha256: prov?.artifacts?.['propagator/sdn-ap/dist/isomorphic/module.wasm']?.canonicalModuleSha256 ?? cfg.modules.sdnAp.canonicalSha256,
      },
      catalogBuilder: {
        version: cbPkg.version,
        chainWasmSha256: chainSha,
        controlWasmSha256: controlSha,
        runtimeWasmSha256: runtimeSha,
      },
      gpErrorModel: { version: gpPkg.version, wasmSha256: gpErrSha },
      catalogComposer: { version: compPkg.version, wasmSha256: composerSha },
    },
  };
}

function loadCausalSpaceTrackInputs(wantSet, t0Ms, lookbackDays) {
  const seeds = new Map();
  const histByNorad = new Map([...wantSet].map((id) => [id, new Map()]));
  const seedCutoffMs = t0Ms - 2 * DAY_MS;
  const startDayMs = t0Ms - lookbackDays * DAY_MS;
  let filteredFutureCreated = 0;
  let filteredFutureEpoch = 0;

  for (let ms = startDayMs; ms <= t0Ms; ms += DAY_MS) {
    const p = path.join(GP_DIR, `${dayStr(ms)}.json.gz`);
    if (!fs.existsSync(p)) continue;
    const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
    for (const r of rows) {
      const id = Number(r.NORAD_CAT_ID);
      if (!wantSet.has(id)) continue;
      const createdMs = r.CREATION_DATE ? utcMs(r.CREATION_DATE) : utcMs(r.EPOCH);
      const epochMs = utcMs(r.EPOCH);
      if (!Number.isFinite(createdMs) || createdMs > t0Ms) { filteredFutureCreated++; continue; }
      if (!Number.isFinite(epochMs) || epochMs > t0Ms) { filteredFutureEpoch++; continue; }
      histByNorad.get(id).set(r.EPOCH, r);
      if (ms >= seedCutoffMs) {
        const prev = seeds.get(id);
        if (!prev || epochMs > utcMs(prev.EPOCH)) seeds.set(id, r);
      }
    }
  }
  const histSorted = new Map();
  for (const [id, byEpoch] of histByNorad) {
    histSorted.set(id, [...byEpoch.values()].sort((a, b) => utcMs(a.EPOCH) - utcMs(b.EPOCH)));
  }
  return { seeds, histSorted, filteredFutureCreated, filteredFutureEpoch };
}

async function runWorker(data) {
  const { modulesRoot, t0Ms, jobs, weatherRecords } = data;
  const sds = await loadSdsAndSdk(modulesRoot);
  const { fb, sdkBrowser, sdkIso, OEM_MOD, PCF_MOD, typeRef } = sds;
  const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(modulesRoot, dir, 'plugin-manifest.json'), 'utf8'));

  const chain = await sdkIso.createStandaloneHarness('browser', path.join(modulesRoot, 'flows/catalog-builder/dist/isomorphic/module.wasm'), { surface: 'direct', enableBrowserWasiThreads: false });
  const gpH = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(modulesRoot, 'analysis/gp-error-model/dist/isomorphic/module.wasm')), manifest: manifest('analysis/gp-error-model'), surface: 'direct' });
  const compH = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(modulesRoot, 'analysis/catalog-composer/dist/isomorphic/module.wasm')), manifest: manifest('analysis/catalog-composer'), surface: 'direct' });
  const apPub = await sdkIso.createStandaloneHarness('browser', path.join(modulesRoot, 'propagator/sdn-ap/dist/isomorphic/module.wasm'), { surface: 'direct', maxThreads: 1 });
  const reusable = { chain, gp: gpH, composer: compH };

  const spwBufs = weatherRecords.map((arr) => Buffer.from(arr));
  const makeFlightPcf = (epochs) => {
    const t = new PCF_MOD.PCFT();
    t.OUTPUT = Object.assign(new PCF_MOD.PCFOutputT(), { FRAME: PCF_MOD.pcfOutputFrame.GCRF, EPOCHS: epochs });
    const b = new fb.Builder(4096);
    PCF_MOD.PCF.finishPCFBuffer(b, t.pack(b));
    return b.asUint8Array().slice();
  };
  const ingestOmm = async (ommRaw) => {
    const r = await apPub.invoke({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', typeRef: typeRef('OMM'), payload: plain(ommRaw) }] });
    return r.statusCode === 0 ? Buffer.from(r.outputs.find((o) => o.portId === 'ocm').payload) : null;
  };
  const flyOcm = async (ocmBytes, epochs) => {
    const r = await apPub.invoke({
      methodId: 'propagate',
      inputs: [
        { portId: 'ocm', typeRef: typeRef('OCM'), payload: plain(ocmBytes) },
        { portId: 'configuration', typeRef: typeRef('PCF'), payload: makeFlightPcf(epochs) },
      ],
    });
    if (r.statusCode !== 0) return null;
    const eph = r.outputs.find((o) => o.portId === 'ephemeris')?.payload;
    return eph ? OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(plain(eph))).unpack().EPHEMERIS_DATA_BLOCK?.[0]?.EPHEMERIS_DATA_LINES : null;
  };

  const out = [];
  try {
    const BATCH = 16;
    for (let b0 = 0; b0 < jobs.length; b0 += BATCH) {
      const chunk = jobs.slice(b0, b0 + BATCH);
      const seeds = new Map();
      const historyByNorad = new Map();
      for (const job of chunk) {
        seeds.set(job.norad, gpJsonToOmm(job.seed, sds, true));
        historyByNorad.set(job.norad, job.hist.map((h) => ({ ms: utcMs(h.EPOCH), buf: gpJsonToOmm(h, sds, true) })));
      }
      const builtAp = await buildCatalogBatch({ modulesRoot, sds, kind: 'sdn-ap', nowMs: t0Ms, seeds, historyByNorad, weatherRecords: spwBufs, reusable });
      const builtXp = await buildCatalogBatch({ modulesRoot, sds, kind: 'sgp4-xp', nowMs: t0Ms, seeds, historyByNorad, weatherRecords: spwBufs, reusable });

      for (const job of chunk) {
        const ep = [String(job.sup.EPOCH).replace(' ', 'T').replace(/Z$/, '')];
        const supOcm = await ingestOmm(gpJsonToOmm(job.sup, sds, false));
        const stOcm = await ingestOmm(gpJsonToOmm(job.seed, sds, false));
        const opRes = builtAp.get(job.norad);
        const xpRes = builtXp.get(job.norad);
        if (!supOcm || !stOcm || !opRes?.ocmBuf || !xpRes?.ocmBuf) continue;
        const [lSup, lSt, lXp, lOp] = await Promise.all([
          flyOcm(supOcm, ep),
          flyOcm(stOcm, ep),
          flyOcm(xpRes.ocmBuf, ep),
          flyOcm(opRes.ocmBuf, ep),
        ]);
        if (!lSup?.[0] || !lSt?.[0] || !lXp?.[0] || !lOp?.[0]) continue;
        const distM = (a, b) => Math.hypot(a[0].X - b[0].X, a[0].Y - b[0].Y, a[0].Z - b[0].Z) * 1000;
        out.push({
          constellation: job.constellation,
          norad: job.norad,
          eS: distM(lSt, lSup),
          eXp: distM(lXp, lSup),
          eOp: distM(lOp, lSup),
          reason: opRes.reason || '',
        });
      }
    }
  } finally {
    await chain.destroy?.();
    await gpH.destroy?.();
    await compH.destroy?.();
    await apPub.destroy?.();
  }
  return out;
}

if (!isMainThread) {
  const rows = await runWorker(workerData);
  parentPort.postMessage({ rows });
  process.exit(0);
}

async function main() {
  const tStart = Date.now();
  const t0Utc = arg('--t0', '2026-11-08T00:00:00Z');
  const horizonHours = Number(arg('--horizon-hours', '24'));
  const lookbackDays = Number(arg('--lookback-days', '21'));
  const workers = Math.max(1, Number(arg('--workers', String(Math.min(12, os.cpus().length)))));
  const smoke = has('--smoke');
  const skipPinCheck = has('--skip-pin-check');

  const t0Ms = Date.parse(t0Utc);
  assert.ok(Number.isFinite(t0Ms), `Invalid --t0: ${t0Utc}`);
  const provMeta = verifyProvenanceAndConfig(skipPinCheck);
  const sds = await loadSdsAndSdk(MODULES);

  const truthsByConst = new Map();
  const wantSet = new Set();
  for (const c of CONSTELLATIONS) {
    const t = findFirstSupGpAfter(c, t0Ms + horizonHours * HOUR_MS);
    truthsByConst.set(c, t);
    for (const id of t.byNorad.keys()) wantSet.add(id);
  }

  const { seeds, histSorted, filteredFutureCreated, filteredFutureEpoch } = loadCausalSpaceTrackInputs(wantSet, t0Ms, lookbackDays);
  const weatherRecords = buildCausalSpwRecords({
    archiveRoot: ARCHIVE,
    firstDate: dayStr(t0Ms - 30 * DAY_MS),
    lastDate: dayStr(t0Ms + 30 * DAY_MS),
    cutoffDate: dayStr(t0Ms),
    sds,
  }).map((b) => Uint8Array.from(b));

  const jobs = [];
  for (const c of CONSTELLATIONS) {
    const t = truthsByConst.get(c);
    let ids = [...t.byNorad.keys()].filter((id) => seeds.has(id)).sort((a, b) => a - b);
    if (smoke) ids = ids.slice(0, 8);
    for (const id of ids) {
      const seed = seeds.get(id);
      const hist = histSorted.get(id);
      jobs.push({ constellation: c, norad: id, seed, hist: hist?.length ? hist : [seed], sup: t.byNorad.get(id) });
    }
  }

  const wCount = Math.min(workers, Math.max(1, jobs.length));
  const shards = Array.from({ length: wCount }, () => []);
  jobs.forEach((j, idx) => shards[idx % wCount].push(j));

  const allRows = [];
  await Promise.all(shards.map((shardJobs) => new Promise((resolve, reject) => {
    const w = new Worker(SELF, { workerData: { modulesRoot: MODULES, t0Ms, jobs: shardJobs, weatherRecords } });
    w.on('message', (msg) => { if (msg?.rows) allRows.push(...msg.rows); });
    w.on('error', reject);
    w.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));

  const constellationsOut = {};
  for (const c of CONSTELLATIONS) {
    const t = truthsByConst.get(c);
    const rows = allRows.filter((r) => r.constellation === c);
    const eS = rows.map((r) => r.eS);
    const eXp = rows.map((r) => r.eXp);
    const eOp = rows.map((r) => r.eOp);
    const n = rows.length;
    const closerS = rows.filter((r) => r.eOp < r.eS).length;
    const closerXp = rows.filter((r) => r.eOp < r.eXp).length;
    const branches = {};
    for (const r of rows) {
      const m = /branch=([^\s;]+)/.exec(r.reason);
      const br = m ? m[1] : (r.reason || 'unknown');
      branches[br] = (branches[br] || 0) + 1;
    }
    constellationsOut[c] = {
      constellation: c,
      satellitesScored: n,
      supGpTruthFile: t.file,
      supGpTruthUtc: t.issueUtc,
      supGpTruthSha256: t.sha256,
      supGpTruthRmsFile: t.rmsFile,
      supGpTruthRmsSha256: t.rmsSha256,
      supGpTruthFloorMedianRmsKm: t.floorMedianRmsKm,
      supGpTruthFloorP95RmsKm: t.floorP95RmsKm,
      sgp4SpaceTrackVsSupGp: statsOf(eS),
      sgp4XpPublicVsSupGp: statsOf(eXp),
      sdnApPublicVsSupGp: statsOf(eOp),
      opCloserThanSpaceTrack: { count: closerS, of: n, share: n ? +(closerS / n).toFixed(4) : 0 },
      opCloserThanXp: { count: closerXp, of: n, share: n ? +(closerXp / n).toFixed(4) : 0 },
      branches,
    };
    console.log(`${c.padEnd(8)} n=${String(n).padStart(3)} | S=${constellationsOut[c].sgp4SpaceTrackVsSupGp?.medianM}m Xp=${constellationsOut[c].sgp4XpPublicVsSupGp?.medianM}m Op=${constellationsOut[c].sdnApPublicVsSupGp?.medianM}m | Op>S=${closerS}/${n} Op>Xp=${closerXp}/${n}`);
  }

  const wallSec = +((Date.now() - tStart) / 1000).toFixed(1);
  const doc = {
    schema: 'sdn-ap-supgp-constellations-1',
    generatedUtc: nowUtc(),
    wallSec,
    t0Utc,
    evalHorizonHours: horizonHours,
    lookbackDays,
    gitHead: provMeta.gitHead,
    modulesGitHead: provMeta.modulesGitHead,
    configSha256: provMeta.configSha256,
    modules: provMeta.modules,
    causalityDisclosure: 'Strictly causal Space-Track GP + 21d GP history (CREATION_DATE <= T0, EPOCH <= T0) propagated forward ~24h and scored at the epoch of the earliest SupGP set published strictly > T0+24h. SupGP sets are SGP4 fits to operator ephemerides with finite fit RMS floor (0.23-0.30 km median in *.rms.txt), NOT independent POD truth.',
    causalityAudit: {
      filteredFutureCreated,
      filteredFutureEpoch,
      satellitesQueued: jobs.length,
      workers: wCount,
    },
    constellations: constellationsOut,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`Wrote ${OUT_PATH} in ${wallSec}s`);
}

await main();
process.exit(0);
