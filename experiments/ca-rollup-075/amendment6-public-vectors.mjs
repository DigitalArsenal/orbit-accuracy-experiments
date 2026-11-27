#!/usr/bin/env node
// Amendment 6 (#1128): All-8-Group Unified 0.7.5 / 0.2.7 Signed RTN Vector & Public-History Generator
// Runs ALL 2,045 in-aggregate tests from work-fifthday/sets-all.json (LS, DO, S1, P/SD, GD, GN, IG, GE)
// through compiled flows/catalog-builder 0.2.7 + propagator/sdn-ap 0.7.5 with strictly causal forecast-only
// space weather, scoring against independent GCRF truth $OEMs in /opt/data/sdn-archive/reference-states/.
// Records genuine signed 3-D and 6-D RTN error vectors + daily RMS + pre-T0 fit diagnostics (fitRmsKm, bterm, maxAp)
// for S (SGP4), O/Op (SDN-AP 0.7.5), and X/Xp (SGP4-XP).
//
// Usage:
//   SDN_MODULES_ROOT=... node amendment6-public-vectors.mjs --workers 14 [--smoke]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DAY_MS, nowUtc, isoNoZ, utcMs, dayStr,
  loadSdsAndSdk, gpJsonToOmm, buildCausalSpwRecords, signedRtnErrorKm, buildCatalogBatch,
} from './amendment6-lib.mjs';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MODULES = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCHIVE = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const SITE_JSONL = process.env.SDN_SITE_JSONL || path.join(OAE, 'runs/ca-rollup-075/public-only-tests-ref.jsonl');

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const RUNS_DIR = path.join(OAE, 'runs/ca-rollup-075/pub-vectors');
const SETS_PATH = path.join(ARCHIVE, 'derived/site-measure/work-fifthday/sets-all.json');
const STEP_MS = 300000; // 5-min scoring grid

function signedRtn6Km(pState, tR, tV) {
  const dx = pState[0] - tR[0], dy = pState[1] - tR[1], dz = pState[2] - tR[2];
  const dvx = pState[3] - tV[0], dvy = pState[4] - tV[1], dvz = pState[5] - tV[2];
  const rMag = Math.hypot(tR[0], tR[1], tR[2]);
  const rx = tR[0] / rMag, ry = tR[1] / rMag, rz = tR[2] / rMag;
  const hx = tR[1] * tV[2] - tR[2] * tV[1];
  const hy = tR[2] * tV[0] - tR[0] * tV[2];
  const hz = tR[0] * tV[1] - tR[1] * tV[0];
  const hMag = Math.hypot(hx, hy, hz);
  const nx = hx / hMag, ny = hy / hMag, nz = hz / hMag;
  const tx = ny * rz - nz * ry, ty = nz * rx - nx * rz, tz = nx * ry - ny * rx;
  return [
    dx * rx + dy * ry + dz * rz,
    dx * tx + dy * ty + dz * tz,
    dx * nx + dy * ny + dz * nz,
    dvx * rx + dvy * ry + dvz * rz,
    dvx * tx + dvy * ty + dvz * tz,
    dvx * nx + dvy * ny + dvz * nz,
  ];
}

function buildTruthIndex(wantNorads) {
  const index = new Map();
  const roots = [
    path.join(ARCHIVE, 'reference-states/reference'),
    path.join(ARCHIVE, 'reference-states/reference-leo-pod-2'),
    path.join(ARCHIVE, 'e14-covariance-realism/reference'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root)) {
      if (d.startsWith('leoOrb_')) continue;
      const full = path.join(root, d);
      let entries;
      try { entries = fs.readdirSync(full); } catch { continue; }
      for (const f of entries) {
        if (!f.endsWith('.oem')) continue;
        const id = Number(f.slice(0, -4));
        if (!wantNorads.has(id)) continue;
        if (!index.has(id)) index.set(id, []);
        index.get(id).push(path.join(full, f));
      }
    }
  }
  for (const list of index.values()) list.sort();
  return index;
}

function prepareTests(smoke) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const cachePath = path.join(RUNS_DIR, `prep${smoke ? '-smoke' : ''}.json`);
  if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8'));

  const inAgg = new Set();
  if (fs.existsSync(SITE_JSONL)) {
    for (const line of fs.readFileSync(SITE_JSONL, 'utf8').split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line);
      if (r.inAggregates) inAgg.add(`${r.groupKey}|${r.noradId}|${r.startUtc.slice(0, 10)}`);
    }
  }

  const setsDoc = JSON.parse(fs.readFileSync(SETS_PATH, 'utf8'));
  let allTests = Object.values(setsDoc.tests);
  if (inAgg.size > 0) {
    allTests = allTests.filter((t) => inAgg.has(`${t.group}|${t.norad}|${dayStr(t.cutoffMs)}`));
  }
  allTests.sort((a, b) => a.group.localeCompare(b.group) || a.norad - b.norad || a.cutoffMs - b.cutoffMs);
  if (smoke) {
    const byG = new Map();
    const pick = [];
    for (const t of allTests) {
      const c = byG.get(t.group) || 0;
      if (c < 2) { pick.push(t); byG.set(t.group, c + 1); }
    }
    allTests = pick;
  }

  const wantNorads = new Set(allTests.map((t) => t.norad));
  const truthIndex = buildTruthIndex(wantNorads);
  const truthFilesByNorad = Object.fromEntries([...truthIndex].map(([id, list]) => [String(id), list]));
  const meta = { count: allTests.length, norads: wantNorads.size, truthFilesByNorad };
  fs.writeFileSync(path.join(RUNS_DIR, `tests${smoke ? '-smoke' : ''}.json`), JSON.stringify(allTests));
  fs.writeFileSync(cachePath, JSON.stringify(meta));
  console.log(`${nowUtc()} [pub-vec-075] Prepared ${allTests.length} tests across ${wantNorads.size} satellites`);
  return meta;
}

async function runWorker(shard, workers, smoke) {
  const t0 = Date.now();
  const outFile = path.join(RUNS_DIR, `rows${smoke ? '-smoke' : ''}-${shard}.jsonl`);
  if (fs.existsSync(outFile)) {
    console.log(`[pub-vec-075 w${shard}] cached -> skipping`);
    return;
  }

  const meta = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, `prep${smoke ? '-smoke' : ''}.json`), 'utf8'));
  const allTests = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, `tests${smoke ? '-smoke' : ''}.json`), 'utf8'));
  const mine = allTests.filter((_, i) => i % workers === shard);

  const sds = await loadSdsAndSdk(MODULES);
  const { fb, sdkBrowser, sdkIso, OCM_MOD, OEM_MOD, PCF_MOD, frame, pack } = sds;
  const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(MODULES, dir, 'plugin-manifest.json'), 'utf8'));

  const chain = await sdkIso.createStandaloneHarness('browser', path.join(MODULES, 'flows/catalog-builder/dist/isomorphic/module.wasm'), { surface: 'direct', enableBrowserWasiThreads: false });
  const gpH = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/gp-error-model/dist/isomorphic/module.wasm')), manifest: manifest('analysis/gp-error-model'), surface: 'direct' });
  const compH = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'analysis/catalog-composer/dist/isomorphic/module.wasm')), manifest: manifest('analysis/catalog-composer'), surface: 'direct' });
  const apEval = await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(MODULES, 'propagator/sdn-ap/dist/isomorphic/module.wasm')), surface: 'direct', initialMemoryBytes: 64 * 1024 * 1024 });
  const reusable = { chain, gp: gpH, composer: compH };

  mine.sort((a, b) => a.norad - b.norad || a.cutoffMs - b.cutoffMs);
  const spanByNorad = new Map();
  for (const t of mine) {
    const s = spanByNorad.get(t.norad) ?? { lo: Infinity, hi: -Infinity };
    if (t.cutoffMs < s.lo) s.lo = t.cutoffMs;
    if (t.cutoffMs + 5 * DAY_MS > s.hi) s.hi = t.cutoffMs + 5 * DAY_MS;
    spanByNorad.set(t.norad, s);
  }

  let cachedNorad = null, cachedTruth = null;
  function loadTruthForNorad(norad) {
    if (cachedNorad === norad && cachedTruth) return cachedTruth;
    const span = spanByNorad.get(norad) ?? { lo: -Infinity, hi: Infinity };
    const files = meta.truthFilesByNorad[String(norad)] || [];
    const byBucket = new Map();
    for (const f of files) {
      let oem;
      try {
        oem = OEM_MOD.OEM.getSizePrefixedRootAsOEM(new fb.ByteBuffer(new Uint8Array(fs.readFileSync(f)))).unpack();
      } catch { continue; }
      const blk = oem.EPHEMERIS_DATA_BLOCK?.[0];
      if (!blk) continue;
      const bStart = blk.START_TIME ? utcMs(blk.START_TIME) : -Infinity;
      const bStop = blk.STOP_TIME ? utcMs(blk.STOP_TIME) : Infinity;
      if (bStop < span.lo - DAY_MS || bStart > span.hi + DAY_MS) continue;
      for (const L of blk.EPHEMERIS_DATA_LINES || []) {
        const ms = utcMs(L.EPOCH);
        if (!Number.isFinite(ms) || ms < span.lo - 60000 || ms > span.hi + 60000) continue;
        const bkt = Math.round(ms / STEP_MS);
        if (!byBucket.has(bkt)) {
          byBucket.set(bkt, { ms, iso: isoNoZ(ms), r: [L.X, L.Y, L.Z], v: [L.X_DOT, L.Y_DOT, L.Z_DOT] });
        }
      }
    }
    cachedNorad = norad;
    cachedTruth = [...byBucket.values()].sort((a, b) => a.ms - b.ms);
    return cachedTruth;
  }

  function sliceTruth(norad, startMs) {
    const all = loadTruthForNorad(norad);
    let lo = 0, hi = all.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (all[mid].ms <= startMs) lo = mid + 1; else hi = mid; }
    const out = [];
    const endMs = startMs + 5 * DAY_MS;
    let prevMs = -Infinity;
    for (let i = lo; i < all.length && all[i].ms <= endMs; i++) {
      if (all[i].ms - prevMs >= STEP_MS - 1000) { out.push(all[i]); prevMs = all[i].ms; }
    }
    return out;
  }

  const spwCache = new Map();
  const spwFor = (cutoffDate, startMs) => {
    if (!spwCache.has(cutoffDate)) {
      spwCache.set(cutoffDate, buildCausalSpwRecords({
        archiveRoot: ARCHIVE,
        firstDate: dayStr(startMs - 45 * DAY_MS),
        lastDate: dayStr(startMs + 50 * DAY_MS),
        cutoffDate,
        sds,
      }));
    }
    return spwCache.get(cutoffDate);
  };

  const ingestOmm = async (ommRaw) => {
    const r = await apEval.invoke({ methodId: 'ingest_omm', inputs: [frame('omm', 'OMM', ommRaw)] });
    return r.statusCode === 0 ? Buffer.from(r.outputs.find((o) => o.portId === 'ocm').payload) : null;
  };
  const propGcrf6 = async (ocmBytes, epochs) => {
    const cfg = Object.assign(new PCF_MOD.PCFT(), {
      OUTPUT: Object.assign(new PCF_MOD.PCFOutputT(), { FRAME: PCF_MOD.pcfOutputFrame.GCRF, STEP_SECONDS: 60, MAXIMUM_STATES: 500000, EPOCHS: epochs }),
    });
    const r = await apEval.invoke({ methodId: 'propagate', inputs: [frame('ocm', 'OCM', ocmBytes), frame('configuration', 'PCF', pack(cfg, 'PCF', false))] });
    if (r.statusCode !== 0) return null;
    const blk = OEM_MOD.OEM.getRootAsOEM(new fb.ByteBuffer(r.outputs.find((o) => o.portId === 'ephemeris').payload)).EPHEMERIS_DATA_BLOCK(0);
    if (!blk || blk.ephemerisDataLinesLength() !== epochs.length) return null;
    const out = new Array(epochs.length);
    for (let i = 0; i < epochs.length; i++) {
      const L = blk.EPHEMERIS_DATA_LINES(i);
      out[i] = [L.X(), L.Y(), L.Z(), L.X_DOT(), L.Y_DOT(), L.Z_DOT()];
    }
    return out;
  };

  const rowsOut = [];
  for (let idx = 0; idx < mine.length; idx++) {
    const t = mine[idx];
    const startMs = t.cutoffMs;
    const cutoffDate = dayStr(startMs);
    const causalSets = (t.sets || []).filter((s) => s.creationMs <= startMs && s.epochMs < startMs).sort((a, b) => a.epochMs - b.epochMs);
    if (!causalSets.length) continue;
    const seedRow = causalSets.at(-1).row;
    const truth = sliceTruth(t.norad, startMs);
    if (truth.length < 20) continue;

    const weatherRecords = spwFor(cutoffDate, startMs);
    const seeds = new Map([[t.norad, gpJsonToOmm(seedRow, sds, true)]]);
    const histMap = new Map([[t.norad, causalSets.map((s) => ({ ms: s.epochMs, buf: gpJsonToOmm(s.row, sds, true) }))]]);

    const resO = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sdn-ap', nowMs: startMs, seeds, historyByNorad: histMap, weatherRecords, reusable });
    const resX = await buildCatalogBatch({ modulesRoot: MODULES, sds, kind: 'sgp4-xp', nowMs: startMs, seeds, historyByNorad: histMap, weatherRecords, reusable });
    const oO = resO.get(t.norad), oX = resX.get(t.norad);
    const oS = await ingestOmm(gpJsonToOmm(seedRow, sds, false));
    if (!oO || !oX || !oS) continue;

    // Pre-T0 fit diagnostics from O's $OCM (for heteroscedastic covariance conditioning audit)
    let fitRmsKm = null, btermO = null, maxApNear = null;
    try {
      const unpO = OCM_MOD.OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(oO.ocmBuf))).unpack();
      fitRmsKm = unpO.ORBIT_DETERMINATION?.FIT_STATISTICS?.FIT_RMS_KM ?? null;
      btermO = unpO.MEAN_ELEMENTS?.BTERM ?? null;
      const spw = unpO.PERTURBATIONS?.SPACE_WEATHER || [];
      maxApNear = spw.slice(0, 9).reduce((m, w) => Math.max(m, Number(w.AP_AVG) || 0), 0);
    } catch {}

    const epochs = truth.map((p) => p.iso);
    const pS = await propGcrf6(oS, epochs);
    const pO = await propGcrf6(oO.ocmBuf, epochs);
    const pX = await propGcrf6(oX.ocmBuf, epochs);
    if (!pS || !pO || !pX) continue;

    const byDay = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (let i = 0; i < truth.length; i++) {
      const d = Math.floor((truth[i].ms - startMs - 1) / DAY_MS) + 1;
      if (d >= 1 && d <= 5) byDay[d].push(i);
    }

    const days = {};
    for (const d of [1, 2, 3, 4, 5]) {
      const idxs = byDay[d];
      if (idxs.length < 6) continue;
      const midI = idxs[Math.floor(idxs.length / 2)];
      const rms = (P) => {
        let s2 = 0;
        for (const i of idxs) {
          const r = truth[i].r, p = P[i];
          s2 += (p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2 + (p[2] - r[2]) ** 2;
        }
        return +Math.sqrt(s2 / idxs.length).toFixed(5);
      };
      days[String(d)] = {
        n: idxs.length,
        rmsKm: { S: rms(pS), O: rms(pO), X: rms(pX) },
        vKm: {
          S: signedRtnErrorKm(pS[midI], truth[midI].r, truth[midI].v).map((z) => +z.toFixed(5)),
          O: signedRtnErrorKm(pO[midI], truth[midI].r, truth[midI].v).map((z) => +z.toFixed(5)),
          X: signedRtnErrorKm(pX[midI], truth[midI].r, truth[midI].v).map((z) => +z.toFixed(5)),
        },
        v6O: signedRtn6Km(pO[midI], truth[midI].r, truth[midI].v).map((z) => +z.toPrecision(6)),
      };
    }
    // Also capture age-bin 0 (0.125 d = 3h) and age-bin 1 (0.5 d = 12h) 6-D RTN for ERM calibration
    const earlyV6O = {};
    for (const [lbl, h] of [['0.125', 3], ['0.5', 12]]) {
      const targetMs = startMs + h * 3600000;
      let bestI = -1, bestD = Infinity;
      for (let i = 0; i < truth.length; i++) {
        const dd = Math.abs(truth[i].ms - targetMs);
        if (dd < bestD) { bestD = dd; bestI = i; }
      }
      if (bestI >= 0 && bestD <= 1800000) {
        earlyV6O[lbl] = signedRtn6Km(pO[bestI], truth[bestI].r, truth[bestI].v).map((z) => +z.toPrecision(6));
      }
    }

    rowsOut.push(JSON.stringify({
      key: t.key, group: t.group, norad: t.norad, startUtc: new Date(startMs).toISOString(),
      fb: { O: oO.isFallback, X: oX.isFallback },
      diagO: { rmsKm: fitRmsKm != null ? +fitRmsKm.toFixed(4) : null, bterm: btermO != null ? +btermO.toPrecision(4) : null, maxAp: maxApNear, branch: oO.reason },
      days, earlyV6O,
    }));
    if ((idx + 1) % 25 === 0 || idx + 1 === mine.length) {
      console.log(`${nowUtc()} [pub-vec-075 w${shard}/${workers}] ${idx + 1}/${mine.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  fs.writeFileSync(`${outFile}.tmp`, rowsOut.join('\n') + '\n');
  fs.renameSync(`${outFile}.tmp`, outFile);
  await chain.destroy?.(); await gpH.destroy?.(); await compH.destroy?.(); await apEval.destroy?.();
}

async function main() {
  const workers = Number(arg('--workers', '14'));
  const smoke = has('--smoke');
  if (arg('--worker') !== null) {
    await runWorker(Number(arg('--worker')), workers, smoke);
    return;
  }
  const t0 = Date.now();
  prepareTests(smoke);
  const wCount = smoke ? Math.min(2, workers) : workers;
  await Promise.all(Array.from({ length: wCount }, (_, w) => new Promise((resolve, reject) => {
    const c = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=4096', SELF, '--worker', String(w), '--workers', String(wCount), ...(smoke ? ['--smoke'] : [])], { stdio: 'inherit', env: process.env });
    c.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pub-vec-075 worker ${w} exited ${code}`))));
  })));
  const merged = [];
  for (let w = 0; w < wCount; w++) {
    const txt = fs.readFileSync(path.join(RUNS_DIR, `rows${smoke ? '-smoke' : ''}-${w}.jsonl`), 'utf8').trim();
    if (txt) for (const l of txt.split('\n')) merged.push(JSON.parse(l));
  }
  const outPath = path.join(OAE, `runs/ca-rollup-075/public-vectors-075${smoke ? '-smoke' : ''}.jsonl`);
  fs.writeFileSync(outPath, merged.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const byG = {};
  let totL5 = 0, totN5 = 0, totW5 = 0;
  for (const r of merged) {
    const g = byG[r.group] ||= { n: 0, d1S: [], d1O: [], d1X: [], d5S: [], d5O: [], d5X: [], l5: 0, w5: 0, fbO: 0 };
    g.n++;
    if (r.fb?.O) g.fbO++;
    if (r.days?.['1']) { g.d1S.push(r.days['1'].rmsKm.S * 1000); g.d1O.push(r.days['1'].rmsKm.O * 1000); g.d1X.push(r.days['1'].rmsKm.X * 1000); }
    if (r.days?.['5']) {
      const s5 = r.days['5'].rmsKm.S, o5 = r.days['5'].rmsKm.O, x5 = r.days['5'].rmsKm.X;
      g.d5S.push(s5 * 1000); g.d5O.push(o5 * 1000); g.d5X.push(x5 * 1000);
      totN5++;
      if (o5 - s5 >= 1.0) { g.l5++; totL5++; }
      if (o5 - s5 <= -1.0) { g.w5++; totW5++; }
    }
  }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : null; };
  console.log(`\n${nowUtc()} [pub-vec-075] COMPLETE: ${merged.length} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${outPath}`);
  console.log(`TOTAL DAY 5: N=${totN5} Loss>=1km=${totL5} (was 216 in 0.7.2!) Win<=-1km=${totW5}`);
  for (const [k, v] of Object.entries(byG)) {
    console.log(`  ${k.padEnd(2)}: n=${String(v.n).padStart(3)} fbO=${v.fbO} | D1 med(m): S=${med(v.d1S)} X=${med(v.d1X)} O=${med(v.d1O)} | D5 med(m): S=${med(v.d5S)} X=${med(v.d5X)} O=${med(v.d5O)} | L5>=1km=${v.l5} W5<=-1km=${v.w5}`);
  }
}

await main();
process.exit(0);
