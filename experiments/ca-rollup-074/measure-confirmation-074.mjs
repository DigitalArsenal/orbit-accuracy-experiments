#!/usr/bin/env node
// Unified 6-regime held-out physical covariance & position accuracy confirmation for sdn-ap 0.7.4 & gp-error-model.
// Strictly disjoint from DEV dates (DEV <= 2026-05-20; confirmation >= 2026-06-01) and DEV-used unseen-object sets.
// Verifies public vs full WASM bit-exact parity before writing aggregates.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const OAE = path.resolve(path.dirname(SELF), '../..');
const MOD = process.env.SDN_MODULES_ROOT || path.resolve(OAE, '../../main-packages/space-data-network-modules');
const ARCH = process.env.SDN_ARCHIVE_ROOT || '/opt/data/sdn-archive';
const R3_DEV = process.env.SDN_R3_DEV_ROWS || path.join(ARCH, 'derived/cov-r3-dev/precise_arc.jsonl.gz');
const CONF_DIR = path.join(OAE, 'runs/ca-rollup-074/confirmation-074');
const REG_PATH = path.join(CONF_DIR, 'REGISTRATION.json');
const ROWS_OUT = path.join(CONF_DIR, 'conf_rows.jsonl.gz');
const XP_ROWS_OUT = path.join(CONF_DIR, 'conf_xp_rows.jsonl.gz');
const DENSE_OUT = path.join(CONF_DIR, 'conf_dense60s.json');
const GP_OUT = path.join(CONF_DIR, 'conf_gp_sgp4.json');
const DAY = 864e5, HOUR = 36e5;
const EVAL_HOURS = [0, 6, 12, 18, 24, 36, 48, 60, 72];
const MU = 398600.4418;
const COVF = [
  'CX_X', 'CY_X', 'CY_Y', 'CZ_X', 'CZ_Y', 'CZ_Z',
  'CX_DOT_X', 'CX_DOT_Y', 'CX_DOT_Z', 'CX_DOT_X_DOT',
  'CY_DOT_X', 'CY_DOT_Y', 'CY_DOT_Z', 'CY_DOT_X_DOT', 'CY_DOT_Y_DOT',
  'CZ_DOT_X', 'CZ_DOT_Y', 'CZ_DOT_Z', 'CZ_DOT_X_DOT', 'CZ_DOT_Y_DOT', 'CZ_DOT_Z_DOT',
];

const shaFile = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function parseArgs(argv) {
  const out = { workers: 10, skipGp: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--workers') out.workers = Number(argv[++i]);
    if (argv[i] === '--skip-gp') out.skipGp = true;
  }
  return out;
}

function loadWeatherTable() {
  const txt = fs.readFileSync(path.join(ARCH, 'derived/coverage/weather/Kp_ap_Ap_SN_F107_merged.txt'), 'utf8');
  const rows = [];
  for (const line of txt.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 28) continue;
    const y = +p[0], m = +p[1], d = +p[2];
    if (y < 2025) continue;
    const ap3 = p.slice(15, 23).map(Number);
    const apAvg = +p[23], f107 = +p[25];
    if (!(f107 > 0) || !(apAvg >= 0)) continue;
    rows.push({
      date: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      ms: Date.UTC(y, m - 1, d),
      ap3, apAvg, f107,
    });
  }
  for (let i = 0; i < rows.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - 40); j <= Math.min(rows.length - 1, i + 40); j++) { s += rows[j].f107; c++; }
    rows[i].f107c81 = s / c;
  }
  return rows;
}

function classifyOrbitFromState(r, v) {
  const rn = Math.hypot(r[0], r[1], r[2]);
  const v2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  const a = 1 / (2 / rn - v2 / MU);
  if (!(a > 6500 && a < 100000)) return null;
  const nRevDay = Math.sqrt(MU / (a ** 3)) * 86400 / (2 * Math.PI);
  const hx = r[1] * v[2] - r[2] * v[1], hy = r[2] * v[0] - r[0] * v[2], hz = r[0] * v[1] - r[1] * v[0];
  const hn = Math.hypot(hx, hy, hz);
  const rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2];
  const ex = ((v2 - MU / rn) * r[0] - rv * v[0]) / MU;
  const ey = ((v2 - MU / rn) * r[1] - rv * v[1]) / MU;
  const ez = ((v2 - MU / rn) * r[2] - rv * v[2]) / MU;
  const e = Math.hypot(ex, ey, ez);
  const incDeg = Math.acos(Math.max(-1, Math.min(1, hz / hn))) * 180 / Math.PI;
  if (nRevDay >= 1.2 && nRevDay <= 3.5 && e <= 0.1) return { regime: 'gnss_meo', a, nRevDay, e, incDeg };
  if (nRevDay >= 0.85 && nRevDay <= 1.15 && e <= 0.15) return { regime: 'geostationary', a, nRevDay, e, incDeg };
  return null;
}

if (isMainThread) {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(CONF_DIR, { recursive: true });

  const sdnApFullPath = path.join(MOD, 'propagator/sdn-ap/.build-full/dist/isomorphic/module.wasm');
  const sdnApPubPath = path.join(MOD, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
  const gpErrPath = path.join(MOD, 'analysis/gp-error-model/dist/isomorphic/module.wasm');
  const sdnApPkg = JSON.parse(fs.readFileSync(path.join(MOD, 'propagator/sdn-ap/package.json'), 'utf8'));
  const gpPkg = JSON.parse(fs.readFileSync(path.join(MOD, 'analysis/gp-error-model/package.json'), 'utf8'));
  const sdnApProvPath = path.join(MOD, 'scripts/artifact-provenance.json');
  const sdnApProv = fs.existsSync(sdnApProvPath) ? JSON.parse(fs.readFileSync(sdnApProvPath, 'utf8')) : null;
  const canonicalSha256 = sdnApProv?.modules?.['propagator/sdn-ap']?.canonicalSha256 || shaFile(sdnApPubPath);

  const reg = {
    registeredAtUtc: new Date().toISOString(),
    versions: { sdnAp: sdnApPkg.version, gpErrorModel: gpPkg.version },
    canonicalSha256,
    frozenWasmSha256: {
      sdnApFull: { path: sdnApFullPath, sha256: shaFile(sdnApFullPath) },
      sdnApPublic: { path: sdnApPubPath, sha256: shaFile(sdnApPubPath) },
      gpErrorModel: { path: gpErrPath, sha256: shaFile(gpErrPath) },
    },
  };
  fs.writeFileSync(REG_PATH, JSON.stringify(reg, null, 2) + '\n');
  console.log(`Registered ${reg.versions.sdnAp} confirmation WASMs -> ${REG_PATH}`);
  console.log(`  sdnApFull=${reg.frozenWasmSha256.sdnApFull.sha256.slice(0, 12)} sdnApPublic=${reg.frozenWasmSha256.sdnApPublic.sha256.slice(0, 12)} gpErrorModel=${reg.frozenWasmSha256.gpErrorModel.sha256.slice(0, 12)}`);

  const refDir = path.join(ARCH, 'reference-states/reference');
  const gfzDir = path.join(ARCH, 'e14-covariance-realism/reference');
  const allDirs = fs.readdirSync(refDir);
  const wx = loadWeatherTable();
  const wxByDate = new Map(wx.map((r) => [r.date, r]));

  const AP_DIR = path.join(MOD, 'propagator/sdn-ap') + '/';
  const reqA = createRequire(AP_DIR + 'package.json');
  const fbA = reqA('flatbuffers');
  const E = await import(pathToFileURL(reqA.resolve('spacedatastandards.org/lib/js/OEM/main.js')).href);
  const plain = (b) => { const u = Buffer.from(b); return u.length >= 8 && u.readUInt32LE(0) + 4 === u.length ? u.subarray(4) : u; };
  const firstStateOfOem = (file) => {
    const oem = E.OEM.getRootAsOEM(new fbA.ByteBuffer(plain(fs.readFileSync(file)))).unpack();
    const L = oem.EPHEMERIS_DATA_BLOCK?.[0]?.EPHEMERIS_DATA_LINES?.[0];
    return L ? { r: [L.X, L.Y, L.Z], v: [L.X_DOT, L.Y_DOT, L.Z_DOT], name: oem.EPHEMERIS_DATA_BLOCK[0].OBJECT?.OBJECT_NAME || '' } : null;
  };

  // Load DEV-used NORAD IDs (from R3_DEV if present, plus exact DEV diagnostic satellites from 2026-01-10..2026-05-18)
  const devNoradsByClass = new Map();
  const allDevNorads = new Set([39451, 39452, 39453, 39634, 62261, 7646, 16908, 25398, 38077, 22195, 53105]);
  if (fs.existsSync(R3_DEV)) {
    for (const line of zlib.gunzipSync(fs.readFileSync(R3_DEV)).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      allDevNorads.add(Number(r.norad));
      if (!devNoradsByClass.has(r.cellClassId)) devNoradsByClass.set(r.cellClassId, new Set());
      devNoradsByClass.get(r.cellClassId).add(Number(r.norad));
    }
  } else {
    // Reconstruct the exact 12 MEO & 8 GEO NORADs sampled in DEV (2026-01-15..2026-05-15) to partition unseen_sat cleanly
    const doyToDate = (y, doy) => new Date(Date.UTC(y, 0, 1) + (doy - 1) * DAY).toISOString().slice(0, 10);
    const markDev = (rootDir, prefix, wantRegime, maxSats, clsKey) => {
      const dirs = fs.readdirSync(rootDir).filter((d) => d.startsWith(`${prefix}_2026`)).sort();
      const dates = dirs.map((d) => { const m = /_(\d{4})(\d{3})/.exec(d); return m ? [doyToDate(+m[1], +m[2]), d] : null; })
        .filter((x) => x && x[0] >= '2026-01-15' && x[0] <= '2026-05-15');
      if (!dates.length) return;
      const sampleDir = dates[Math.floor(dates.length / 2)][1];
      const sats = [];
      for (const f of fs.readdirSync(path.join(rootDir, sampleDir)).sort()) {
        if (!f.endsWith('.oem')) continue;
        const norad = +f.slice(0, -4);
        try {
          const st = firstStateOfOem(path.join(rootDir, sampleDir, f));
          if (st && classifyOrbitFromState(st.r, st.v)?.regime === wantRegime) sats.push(norad);
        } catch {}
      }
      const set = new Set();
      const stride = Math.max(1, Math.floor(sats.length / maxSats));
      for (let i = 0; i < sats.length && set.size < maxSats; i += stride) {
        set.add(sats[i]);
        allDevNorads.add(sats[i]);
      }
      devNoradsByClass.set(clsKey, set);
    };
    markDev(refDir, 'ESA0OPSFIN', 'gnss_meo', 12, 'gps_meo');
    markDev(gfzDir, 'GFZ0MGXRAP', 'geostationary', 8, 'geostationary');
  }

  const jobs = [];

  // 1. LEO < 600 km (Swarm A/B/C): STRICTLY 2026-06-01 .. 2026-08-15 (DEV <= 2026-05-20)
  for (const [tag, norad, name] of [['SP3ACOM', 39452, 'SWARM-A'], ['SP3BCOM', 39451, 'SWARM-B'], ['SP3CCOM', 39453, 'SWARM-C']]) {
    const dirs = allDirs.filter((d) => d.startsWith(`SW_OPER_${tag}`)).sort();
    const dates = [];
    for (const d of dirs) {
      const m = /202\d{5}/.exec(d);
      if (!m) continue;
      const ds = `${m[0].slice(0, 4)}-${m[0].slice(4, 6)}-${m[0].slice(6, 8)}`;
      if (ds >= '2026-06-01' && ds <= '2026-08-15') dates.push(ds);
    }
    const uniq = [...new Set(dates)].sort();
    const picked = new Set();
    for (let i = 0; i < uniq.length; i += 3) picked.add(uniq[i]);
    for (const d of uniq) if ((wxByDate.get(d)?.apAvg ?? 0) >= 25) picked.add(d);
    for (const ds of [...picked].sort()) {
      jobs.push({ regime: 'leo_under_600', split: 'post_cutoff', loader: 'swarm', tag, norad, name, startUtc: `${ds}T00:00:00.000Z`, arcH: 24, ecom2: false });
    }
  }

  // 2. LEO 600-750 km (Sentinel-1A/C/D): STRICTLY 2026-06-01 .. 2026-11-12
  for (const [tag, norad, name] of [['S1A', 39634, 'SENTINEL-1A'], ['S1C', 62261, 'SENTINEL-1C'], ['S1D', 66315, 'SENTINEL-1D']]) {
    const dirs = allDirs.filter((d) => d.startsWith(`${tag}_OPER_AUX_POEORB`)).sort();
    const dates = [];
    for (const d of dirs) {
      const m = /V(202\d{5})T/.exec(d);
      if (!m) continue;
      const ds = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
      if (ds >= '2026-06-01' && ds <= '2026-11-12') dates.push(ds);
    }
    const uniq = [...new Set(dates)].sort();
    for (let i = 0; i < uniq.length; i += 5) {
      jobs.push({ regime: 'leo_600_750', split: 'post_cutoff', loader: 's1', tag, norad, name, startUtc: `${uniq[i]}T00:00:00.000Z`, arcH: 24, ecom2: false });
    }
  }

  // 3. Passive spheres 750-2,000 km: STRICTLY 2026-06-05 .. 2026-08-26 (6 distinct satellites, zero overlap with DEV <= 2026-05-20)
  const SPHERES = [
    [7646, 'starlette', 'STARLETTE'], [16908, 'ajisai', 'AJISAI'],
    [22824, 'stella', 'STELLA'], [25398, 'westpac', 'WESTPAC'],
    [27944, 'larets', 'LARETS'], [38077, 'lares', 'LARES'],
  ];
  for (const [norad, slrTag, name] of SPHERES) {
    const prefix = `nsgf.orb.${slrTag}.`;
    const dirs = allDirs.filter((d) => d.startsWith(prefix)).sort();
    const dates = [];
    for (const d of dirs) {
      const yymmdd = d.split('.')[3] ?? '';
      if (yymmdd.length !== 6) continue;
      const ds = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
      if (ds >= '2026-06-05' && ds <= '2026-08-26') dates.push(ds);
    }
    const uniq = [...new Set(dates)].sort();
    for (let i = 0; i < uniq.length; i += 3) {
      const split = norad === 22824 || norad === 27944 ? 'unseen_sat' : 'post_cutoff';
      jobs.push({ regime: 'spheres_750_2000', split, loader: 'slr', tag: prefix, norad, name, startUtc: `${uniq[i]}T00:00:00.000Z`, arcH: 24, ecom2: false, alsoXp: true });
      jobs.push({ regime: 'spheres_750_2000', split, loader: 'slr', tag: prefix, norad, name, startUtc: `${uniq[i]}T00:00:00.000Z`, arcH: 72, ecom2: false });
    }
  }

  // 4. Medium 2,000-15,000 km: STRICTLY 2026-07-04 .. 2026-10-24
  for (const [norad, prefix, name] of [
    [8820, 'ilrsa.orb.lageos1.', 'LAGEOS-1'], [22195, 'ilrsa.orb.lageos2.', 'LAGEOS-2'], [53105, 'nsgf.orb.lares2.', 'LARES-2'],
  ]) {
    const dirs = allDirs.filter((d) => d.startsWith(prefix)).sort();
    const dates = [];
    for (const d of dirs) {
      const yymmdd = d.split('.')[3] ?? '';
      if (yymmdd.length !== 6) continue;
      const ds = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
      if (ds >= '2026-07-04' && ds <= '2026-10-24') dates.push(ds);
    }
    const uniq = [...new Set(dates)].sort();
    const split = norad === 8820 ? 'unseen_sat' : 'post_cutoff';
    for (const ds of uniq) {
      jobs.push({ regime: 'medium_2000_15000', split, loader: 'slr', tag: prefix, norad, name, startUtc: `${ds}T00:00:00.000Z`, arcH: 24, ecom2: false });
      jobs.push({ regime: 'medium_2000_15000', split, loader: 'slr', tag: prefix, norad, name, startUtc: `${ds}T00:00:00.000Z`, arcH: 72, ecom2: false });
    }
  }

  // 5. Discover ALL satellites in ESA0OPSFIN & GFZ0MGXRAP across confirmation range (2026-07-01 .. 2026-11-12)
  const doyToDate = (y, doy) => new Date(Date.UTC(y, 0, 1) + (doy - 1) * DAY).toISOString().slice(0, 10);
  const satCatalog = new Map();
  const scanDailyTree = (rootDir, prefix, sourceTag) => {
    if (!fs.existsSync(rootDir)) return;
    for (const d of fs.readdirSync(rootDir).sort()) {
      if (!d.startsWith(`${prefix}_`)) continue;
      const m = new RegExp(`^${prefix}_(\\d{4})(\\d{3})`).exec(d);
      if (!m) continue;
      const ds = doyToDate(+m[1], +m[2]);
      if (ds < '2026-07-01' || ds > '2026-11-12') continue;
      for (const f of fs.readdirSync(path.join(rootDir, d))) {
        if (!f.endsWith('.oem')) continue;
        const norad = +f.slice(0, -4);
        if (!Number.isFinite(norad) || norad <= 0) continue;
        let entry = satCatalog.get(norad);
        if (!entry) {
          try {
            const st = firstStateOfOem(path.join(rootDir, d, f));
            const cls = st ? classifyOrbitFromState(st.r, st.v) : null;
            if (!cls) continue;
            entry = { norad, regime: cls.regime, source: sourceTag, name: st.name || `${cls.regime}-${norad}`, incDeg: cls.incDeg, nRevDay: cls.nRevDay, dates: new Set() };
            satCatalog.set(norad, entry);
          } catch { continue; }
        }
        entry.dates.add(ds);
      }
    }
  };
  scanDailyTree(refDir, 'ESA0OPSFIN', 'gnss');
  scanDailyTree(gfzDir, 'GFZ0MGXRAP', 'geo');

  const devGnss = new Set([
    ...(devNoradsByClass.get('gps_meo') || []),
    ...(devNoradsByClass.get('galileo_meo') || []),
    ...(devNoradsByClass.get('glonass_meo') || []),
    ...(devNoradsByClass.get('beidou_meo') || []),
  ]);
  const devGeo = devNoradsByClass.get('geostationary') || new Set();

  let unseenGnssCount = 0, postGnssCount = 0, unseenGeoCount = 0, postGeoCount = 0;
  for (const entry of [...satCatalog.values()].sort((a, b) => a.norad - b.norad)) {
    const dates = [...entry.dates].sort();
    if (entry.regime === 'gnss_meo') {
      const isUnseen = !allDevNorads.has(entry.norad);
      if (isUnseen) {
        const avail = dates.filter((d) => d >= '2026-07-05' && d <= '2026-11-10');
        if (!avail.length) continue;
        unseenGnssCount++;
        const stride = Math.max(1, Math.floor(avail.length / 5));
        for (let i = 0, c = 0; i < avail.length && c < 5; i += stride, c++) {
          jobs.push({ regime: 'gnss_meo', split: 'unseen_sat', loader: entry.source, tag: 'ESA0OPSFIN', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 24, ecom2: false, alsoXp: unseenGnssCount <= 16 });
          jobs.push({ regime: 'gnss_meo', split: 'unseen_sat', loader: entry.source, tag: 'ESA0OPSFIN', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 72, ecom2: true });
        }
      } else if (devGnss.has(entry.norad)) {
        const avail = dates.filter((d) => d >= '2026-10-05' && d <= '2026-11-10');
        if (!avail.length) continue;
        postGnssCount++;
        const stride = Math.max(1, Math.floor(avail.length / 3));
        for (let i = 0, c = 0; i < avail.length && c < 3; i += stride, c++) {
          jobs.push({ regime: 'gnss_meo', split: 'post_cutoff', loader: entry.source, tag: 'ESA0OPSFIN', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 24, ecom2: false });
          jobs.push({ regime: 'gnss_meo', split: 'post_cutoff', loader: entry.source, tag: 'ESA0OPSFIN', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 72, ecom2: true });
        }
      }
    } else if (entry.regime === 'geostationary') {
      const isUnseen = !allDevNorads.has(entry.norad);
      if (isUnseen) {
        const avail = dates.filter((d) => d >= '2026-07-05' && d <= '2026-11-10');
        if (!avail.length) continue;
        unseenGeoCount++;
        const stride = Math.max(1, Math.floor(avail.length / 8));
        for (let i = 0, c = 0; i < avail.length && c < 8; i += stride, c++) {
          jobs.push({ regime: 'geostationary', split: 'unseen_sat', loader: 'geo', tag: 'GEO', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 24, ecom2: false, alsoXp: true });
          jobs.push({ regime: 'geostationary', split: 'unseen_sat', loader: 'geo', tag: 'GEO', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 72, ecom2: true });
        }
      } else if (devGeo.has(entry.norad)) {
        const avail = dates.filter((d) => d >= '2026-09-22' && d <= '2026-11-10');
        if (!avail.length) continue;
        postGeoCount++;
        const stride = Math.max(1, Math.floor(avail.length / 5));
        for (let i = 0, c = 0; i < avail.length && c < 5; i += stride, c++) {
          jobs.push({ regime: 'geostationary', split: 'post_cutoff', loader: 'geo', tag: 'GEO', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 24, ecom2: false, alsoXp: true });
          jobs.push({ regime: 'geostationary', split: 'post_cutoff', loader: 'geo', tag: 'GEO', norad: entry.norad, name: entry.name, startUtc: `${avail[i]}T00:00:00.000Z`, arcH: 72, ecom2: true });
        }
      }
    }
  }

  const denseJobs = [];
  for (const r of ['leo_under_600', 'leo_600_750', 'spheres_750_2000', 'medium_2000_15000', 'gnss_meo', 'geostationary']) {
    const cand = jobs.find((j) => j.regime === r && (r === 'gnss_meo' ? (j.split === 'unseen_sat' && j.arcH === 72) : (r === 'leo_under_600' || r === 'leo_600_750' ? j.arcH === 24 : j.arcH === 72)))
      || jobs.find((j) => j.regime === r);
    if (cand) denseJobs.push(cand);
  }

  const nWorkers = Math.max(1, Math.min(14, opts.workers));
  console.log(`Built ${jobs.length} confirmation jobs (unseenGnss=${unseenGnssCount}, postGnss=${postGnssCount}, unseenGeo=${unseenGeoCount}, postGeo=${postGeoCount}, dense60s=${denseJobs.length}, workers=${nWorkers})`);
  const chunks = Array.from({ length: nWorkers }, () => []);
  jobs.forEach((j, idx) => chunks[idx % nWorkers].push(j));
  const allRows = [];
  const xpRows = [];
  const denseResults = [];
  let done = 0;
  let pubParityChecked = 0, pubParityDiffs = 0;
  const t0 = Date.now();
  await Promise.all(chunks.map((chunk, wi) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), {
      workerData: {
        chunk,
        denseChunk: wi === 0 ? denseJobs : [],
        wi,
        modRoot: MOD,
        fullWasm: sdnApFullPath,
        pubWasm: sdnApPubPath,
      },
    });
    w.on('message', (msg) => {
      if (msg.row) allRows.push(msg.row);
      else if (msg.xpRow) xpRows.push(msg.xpRow);
      else if (msg.dense) denseResults.push(msg.dense);
      else if (msg.progress) {
        done += msg.progress;
        if (done % 150 === 0 || done === jobs.length) {
          console.log(`  confirmation progress ${done}/${jobs.length} (apRows=${allRows.length}, xpRows=${xpRows.length}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        }
      } else if (msg.done) {
        pubParityChecked += msg.pubParityChecked || 0;
        pubParityDiffs += msg.pubParityDiffs || 0;
        resolve();
      }
    });
    w.on('error', reject);
    w.on('exit', (code) => { if (code !== 0) reject(new Error(`worker ${wi} exited ${code}`)); });
  })));

  assert.equal(pubParityDiffs, 0, `Public vs full WASM parity mismatch: ${pubParityDiffs}/${pubParityChecked}`);
  fs.writeFileSync(ROWS_OUT, zlib.gzipSync(allRows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  fs.writeFileSync(XP_ROWS_OUT, zlib.gzipSync(xpRows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  fs.writeFileSync(DENSE_OUT, JSON.stringify({ generatedAtUtc: new Date().toISOString(), pubParityChecked, pubParityDiffs, windows: denseResults }, null, 2) + '\n');
  console.log(`Wrote ${allRows.length} AP rows & ${xpRows.length} XP rows to ${CONF_DIR} (pubParity=${pubParityChecked}/${pubParityChecked} exact)`);

  if (!opts.skipGp) {
    console.log('Running held-out Public-GP SGP4 confirmation (gp-error-model)...');
    const GP_DIR = path.join(MOD, 'analysis/gp-error-model');
    const reqG = createRequire(path.join(GP_DIR, 'package.json'));
    const { createBrowserModuleHarness } = await import(pathToFileURL(reqG.resolve('space-data-module-sdk/host/browser-module')).href);
    const { ARM_OF, decode: decodeErm, encode: encodeErm, ERM_TYPE } = await import(pathToFileURL(path.join(GP_DIR, 'scripts/erm-codec.mjs')).href);
    const { encodeOmm, ommFrame } = await import(pathToFileURL(path.join(GP_DIR, 'tests/products-fixtures.mjs')).href);
    const gpWasm = fs.readFileSync(gpErrPath);
    const gpManifest = JSON.parse(fs.readFileSync(path.join(GP_DIR, 'plugin-manifest.json'), 'utf8'));

    const gpArchive = path.join(ARCH, 'spacetrack/gp_history/by-creation/2026');
    const targetSats = allRows.filter((r) => r.startUtc >= '2026-10-10' && r.arcH === 24).map((r) => ({ norad: r.norad, regime: r.regime, name: r.name }));
    const uniqTargets = new Map();
    for (const t of targetSats) if (!uniqTargets.has(t.norad)) uniqTargets.set(t.norad, t);
    const targetSet = new Set(uniqTargets.keys());
    const gpSets = new Map();
    for (let day = Date.parse('2026-10-01T00:00:00Z'); day <= Date.parse('2026-11-15T00:00:00Z'); day += DAY) {
      const file = path.join(gpArchive, `${new Date(day).toISOString().slice(0, 10)}.json.gz`);
      if (!fs.existsSync(file)) continue;
      const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
      for (const r of rows) {
        if (r.MEAN_ELEMENT_THEORY !== 'SGP4') continue;
        const norad = Number(r.NORAD_CAT_ID);
        if (!targetSet.has(norad)) continue;
        let m = gpSets.get(norad);
        if (!m) gpSets.set(norad, m = new Map());
        const epoch = r.EPOCH.slice(0, 26);
        m.set(epoch, {
          objectId: r.OBJECT_ID ?? '', norad, name: r.OBJECT_NAME ?? '', epoch,
          n: Number(r.MEAN_MOTION), e: Number(r.ECCENTRICITY), i: Number(r.INCLINATION),
          raan: Number(r.RA_OF_ASC_NODE), argp: Number(r.ARG_OF_PERICENTER), m: Number(r.MEAN_ANOMALY), bstar: Number(r.BSTAR),
        });
      }
    }
    const gpCall = async (sets, requests, config) => {
      const h = await createBrowserModuleHarness({ wasmSource: gpWasm, manifest: gpManifest, surface: 'direct', hostOptions: { config } });
      try {
        const elements = ommFrame('elements', Buffer.concat(sets.map((s) => encodeOmm(s))));
        const request = { portId: 'request', payload: encodeErm(ARM_OF.object_covariance.request, { objects: requests }), typeRef: { ...ERM_TYPE } };
        const r = await h.invoke({ methodId: 'object_covariance', inputs: [elements, request] });
        if (r.statusCode !== 0) throw new Error(r.errorMessage);
        const out = {};
        for (const f of r.outputs) if (f.typeRef?.fileIdentifier === '$ERM') out[f.portId] = decodeErm(f.payload);
        return out;
      } finally { h.destroy(); }
    };
    const gpSummary = { evaluatedObjects: 0, evaluatedPairs: 0, inflatedPairs: 0, minAlpha: 1, maxAlpha: 1, rows: [] };
    for (const [norad, m] of [...gpSets.entries()].sort((a, b) => a[0] - b[0])) {
      const sets = [...m.values()].sort((a, b) => (a.epoch < b.epoch ? -1 : 1));
      if (sets.length < 10) continue;
      const anchor = sets.at(-1);
      const reqs = [0.5, 1, 2, 4].map((a) => ({ id: `${norad}:${a}`, set: { norad, epoch: anchor.epoch }, ageDays: a }));
      const pop = await gpCall(sets, reqs, {});
      const grd = await gpCall(sets, reqs, { 'object.inflationGuard': true });
      gpSummary.evaluatedObjects++;
      for (let i = 0; i < reqs.length; i++) {
        const p = pop.covariance.objects[i], g = grd.covariance.objects[i];
        if (!p.covarianceRtn || !g.covarianceRtn) continue;
        const ratio = g.covarianceRtn[0] / p.covarianceRtn[0];
        gpSummary.evaluatedPairs++;
        if (g.status === 'INFLATED') gpSummary.inflatedPairs++;
        gpSummary.minAlpha = Math.min(gpSummary.minAlpha, ratio);
        gpSummary.maxAlpha = Math.max(gpSummary.maxAlpha, ratio);
        gpSummary.rows.push({ norad, regime: uniqTargets.get(norad).regime, ageDays: reqs[i].ageDays, status: g.status, alpha: +ratio.toFixed(4) });
      }
    }
    fs.writeFileSync(GP_OUT, JSON.stringify({ generatedAtUtc: new Date().toISOString(), ...gpSummary }, null, 2) + '\n');
    console.log(`Wrote GP confirmation (${gpSummary.evaluatedObjects} sats, ${gpSummary.evaluatedPairs} pairs) to ${GP_OUT}`);
  } else if (!fs.existsSync(GP_OUT)) {
    fs.writeFileSync(GP_OUT, JSON.stringify({ generatedAtUtc: new Date().toISOString(), skipped: true, rows: [] }, null, 2) + '\n');
  }
  process.exit(0);
}

// Worker thread
const AP_DIR = path.join(workerData.modRoot, 'propagator/sdn-ap') + '/';
const reqA = createRequire(AP_DIR + 'package.json');
const loadA = (s) => import(pathToFileURL(reqA.resolve(s)).href);
const fbA = await loadA('flatbuffers');
const E = await loadA('spacedatastandards.org/lib/js/OEM/main.js');
const O = await loadA('spacedatastandards.org/lib/js/OCM/main.js');
const PA = await loadA('spacedatastandards.org/lib/js/PCF/main.js');
const S = await loadA('spacedatastandards.org/lib/js/SPW/main.js');
const C = await loadA('spacedatastandards.org/lib/js/CAT/main.js');
const { createStandaloneHarness: standaloneA } = await loadA('space-data-module-sdk/testing/isomorphic');
const { configuration } = await import(pathToFileURL(AP_DIR + 'test/lib/pcf.mjs').href);

const apFull = await standaloneA('browser', workerData.fullWasm, { surface: 'direct', maxThreads: 1 });
const apPub = await standaloneA('browser', workerData.pubWasm, { surface: 'direct', maxThreads: 1 });
const T = (n) => ({ schemaName: n + '.fbs', fileIdentifier: '$' + n, rootTypeName: n, wireFormat: 'flatbuffer' });
const plain = (b) => { const u = Buffer.from(b); return u.length >= 8 && u.readUInt32LE(0) + 4 === u.length ? u.subarray(4) : u; };
const prefixed = (u) => { const p = plain(u); const b = Buffer.alloc(4 + p.length); b.writeUInt32LE(p.length, 0); p.copy(b, 4); return b; };
const outOf = (r, p) => { const f = r.outputs?.find((o) => o.portId === p); return f ? Buffer.from(f.payload) : null; };
const parseMs = (s) => Date.parse(String(s).replace(/Z?$/, 'Z'));
const isoZ = (t) => new Date(t).toISOString();
const WX = loadWeatherTable();
const refDir = path.join(ARCH, 'reference-states/reference');
const refDirs = fs.readdirSync(refDir);
let pubParityChecked = 0, pubParityDiffs = 0;

function packSpw(fromMs, toMs) {
  const chunks = [];
  for (const r of WX) {
    if (r.ms < fromMs || r.ms > toMs) continue;
    const b = new fbA.Builder(256);
    const spw = new S.SPWT();
    spw.DATE = r.date;
    spw.F107_OBS = r.f107;
    spw.F107_OBS_CENTER81 = r.f107c81;
    spw.AP_AVG = r.apAvg;
    spw.AP1 = r.ap3[0]; spw.AP2 = r.ap3[1]; spw.AP3 = r.ap3[2]; spw.AP4 = r.ap3[3];
    spw.AP5 = r.ap3[4]; spw.AP6 = r.ap3[5]; spw.AP7 = r.ap3[6]; spw.AP8 = r.ap3[7];
    spw.F107_DATA_TYPE = S.F107DataType.OBS;
    b.finishSizePrefixed(spw.pack(b), '$SPW');
    chunks.push(Buffer.from(b.asUint8Array()));
  }
  return Buffer.concat(chunks);
}

function readOem(file) {
  const oem = E.OEM.getRootAsOEM(new fbA.ByteBuffer(plain(fs.readFileSync(file)))).unpack();
  const out = [];
  for (const blk of oem.EPHEMERIS_DATA_BLOCK ?? []) {
    for (const L of blk.EPHEMERIS_DATA_LINES ?? []) {
      const ep = String(L.EPOCH);
      out.push({ epoch: ep, ms: parseMs(ep), r: [L.X, L.Y, L.Z], v: [L.X_DOT, L.Y_DOT, L.Z_DOT] });
    }
  }
  return out;
}

const slrCache = new Map();
function loadTruth(job, fromMs, toMs) {
  const byMs = new Map();
  if (job.loader === 'slr') {
    if (!slrCache.has(job.tag)) {
      const m = new Map();
      for (const d of refDirs.filter((x) => x.startsWith(job.tag)).sort()) {
        const yymmdd = d.split('.')[3] ?? '';
        if (yymmdd < '260601') continue;
        const oem = fs.readdirSync(path.join(refDir, d)).find((n) => n.endsWith('.oem'));
        if (!oem) continue;
        for (const l of readOem(path.join(refDir, d, oem))) m.set(l.ms, l);
      }
      slrCache.set(job.tag, [...m.values()].sort((a, b) => a.ms - b.ms));
    }
    return slrCache.get(job.tag).filter((l) => l.ms >= fromMs && l.ms <= toMs);
  }
  if (job.loader === 'swarm') {
    for (const d of refDirs.filter((x) => x.startsWith(`SW_OPER_${job.tag}`))) {
      const m = /202\d{5}/.exec(d); if (!m) continue;
      const ms0 = Date.UTC(+m[0].slice(0, 4), +m[0].slice(4, 6) - 1, +m[0].slice(6, 8));
      if (ms0 < fromMs - 2 * DAY || ms0 > toMs + 2 * DAY) continue;
      const oem = fs.readdirSync(path.join(refDir, d)).find((n) => n.endsWith('.oem'));
      if (!oem) continue;
      for (const l of readOem(path.join(refDir, d, oem))) if (l.ms >= fromMs && l.ms <= toMs) byMs.set(l.ms, l);
    }
    return [...byMs.values()].sort((a, b) => a.ms - b.ms);
  }
  if (job.loader === 's1') {
    for (const d of refDirs.filter((x) => x.startsWith(`${job.tag}_OPER_AUX_POEORB`))) {
      const m = /V(202\d{5})T/.exec(d); if (!m) continue;
      const ms0 = Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8));
      if (ms0 < fromMs - 2 * DAY || ms0 > toMs + 2 * DAY) continue;
      const oem = fs.readdirSync(path.join(refDir, d)).find((n) => n.endsWith('.oem'));
      if (!oem) continue;
      for (const l of readOem(path.join(refDir, d, oem))) if (l.ms >= fromMs && l.ms <= toMs) byMs.set(l.ms, l);
    }
    return [...byMs.values()].sort((a, b) => a.ms - b.ms);
  }
  const tryRoot = (rootDir, prefix) => {
    for (let dayMs = Math.floor((fromMs - DAY) / DAY) * DAY; dayMs <= toMs + DAY; dayMs += DAY) {
      const d = new Date(dayMs), y = d.getUTCFullYear();
      const doy = String(Math.floor((dayMs - Date.UTC(y, 0, 1)) / DAY) + 1).padStart(3, '0');
      const f = path.join(rootDir, `${prefix}_${y}${doy}0000_01D_05M_ORB`, `${job.norad}.oem`);
      if (fs.existsSync(f)) for (const l of readOem(f)) if (l.ms >= fromMs && l.ms <= toMs) byMs.set(l.ms, l);
    }
  };
  if (job.loader === 'geo') {
    tryRoot(path.join(ARCH, 'e14-covariance-realism/reference'), 'GFZ0MGXRAP');
    if (byMs.size < 200) tryRoot(refDir, 'ESA0OPSFIN');
  } else {
    tryRoot(refDir, 'ESA0OPSFIN');
  }
  return [...byMs.values()].sort((a, b) => a.ms - b.ms);
}

function packOem(norad, name, lines) {
  const b = new fbA.Builder(65536);
  const oem = new E.OEMT(); oem.CCSDS_OEM_VERS = '3.0';
  const blk = new E.ephemerisDataBlockT();
  blk.OBJECT = Object.assign(new C.CATT(), { OBJECT_NAME: name, NORAD_CAT_ID: norad });
  blk.CENTER_NAME = 'EARTH';
  const rfm = new E.RFMT();
  rfm.REFERENCE_FRAME_type = E.RFMUnion.CelestialFrameWrapper;
  rfm.REFERENCE_FRAME = new E.CelestialFrameWrapperT(E.CelestialFrame.GCRF);
  rfm.NAME = 'GCRF';
  blk.REFERENCE_FRAME = rfm;
  blk.TIME_SYSTEM = E.timingStandard.UTC;
  blk.START_TIME = lines[0].epoch; blk.USEABLE_START_TIME = lines[0].epoch;
  blk.USEABLE_STOP_TIME = lines.at(-1).epoch; blk.STOP_TIME = lines.at(-1).epoch;
  blk.EPHEMERIS_DATA_LINES = lines.map((l) => Object.assign(new E.ephemerisDataLineT(), {
    EPOCH: l.epoch, X: l.r[0], Y: l.r[1], Z: l.r[2], X_DOT: l.v[0], Y_DOT: l.v[1], Z_DOT: l.v[2],
  }));
  oem.EPHEMERIS_DATA_BLOCK = [blk];
  b.finishSizePrefixed(oem.pack(b), '$OEM');
  return Buffer.from(b.asUint8Array());
}

function uvwBasis(r, v) {
  const rn = Math.hypot(r[0], r[1], r[2]);
  const U = [r[0] / rn, r[1] / rn, r[2] / rn];
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  const hn = Math.hypot(h[0], h[1], h[2]);
  const W = [h[0] / hn, h[1] / hn, h[2] / hn];
  const V = [W[1] * U[2] - W[2] * U[1], W[2] * U[0] - W[0] * U[2], W[0] * U[1] - W[1] * U[0]];
  return { B: [U, V, W] };
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function rotVec6ToUvw(B, dr, dv) {
  return [dot3(B[0], dr), dot3(B[1], dr), dot3(B[2], dr), dot3(B[0], dv), dot3(B[1], dv), dot3(B[2], dv)];
}
function covLineTo6x6(cl) {
  const M = new Float64Array(36);
  let q = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j <= i; j++) M[i * 6 + j] = M[j * 6 + i] = cl[COVF[q++]];
  return M;
}
function rotCov6ToUvw(B, M) {
  const T6 = Array.from({ length: 6 }, () => new Float64Array(6));
  for (let blk = 0; blk < 2; blk++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 6; j++)
        T6[3 * blk + i][j] = B[i][0] * M[(3 * blk) * 6 + j] + B[i][1] * M[(3 * blk + 1) * 6 + j] + B[i][2] * M[(3 * blk + 2) * 6 + j];
  const out = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c <= r; c++) {
      const cblk = c < 3 ? 0 : 1, ci = c % 3;
      out.push(T6[r][3 * cblk] * B[ci][0] + T6[r][3 * cblk + 1] * B[ci][1] + T6[r][3 * cblk + 2] * B[ci][2]);
    }
  }
  return out;
}

function fitCfgOf(job) {
  return configuration({
    theory: 'AP',
    forces: {
      EPHEMERIS_SOURCE: '',
      ATMOSPHERE_MODEL: PA.pcfAtmosphereFamily.NRLMSISE00,
      WEATHER_SOURCE: PA.pcfWeatherSource.RECORDS,
      DENSITY_CORRECTION: PA.pcfDensityCorrection.NONE,
      MAXIMUM_TESSERAL_DEGREE: 31, HAS_MAXIMUM_TESSERAL_DEGREE: true,
      MAXIMUM_DEGREE: 70, HAS_MAXIMUM_DEGREE: true,
      SOLID_TIDES: PA.pcfSolidTideModel.IERS_2010,
      ...(job.ecom2 ? { ECOM2: Object.assign(new PA.PCFEcom2T(), { Y0_M_S2: 0.0 }) } : {}),
    },
  });
}

function xpCfg() {
  return configuration({
    theory: 'SGP4XP',
    forces: {
      EPHEMERIS_SOURCE: '',
      ATMOSPHERE_MODEL: PA.pcfAtmosphereFamily.JACCHIA70,
      WEATHER_SOURCE: PA.pcfWeatherSource.THEORY_FLUX_MODEL,
    },
  });
}

async function scoreOcm(job, ocmBytes, matched, D0, checkParity) {
  const ocmT = O.OCM.getRootAsOCM(new fbA.ByteBuffer(plain(ocmBytes))).unpack();
  const me = ocmT.MEAN_ELEMENTS, cp = ocmT.COV_PROPAGATION, fs0 = ocmT.ORBIT_DETERMINATION?.FIT_STATISTICS;
  if (!me || !cp || !fs0?.CONVERGED) return null;
  const pInputs = [
    { portId: 'ocm', typeRef: T('OCM'), payload: prefixed(ocmBytes) },
    configuration({ output: { FRAME: PA.pcfOutputFrame.GCRF, EPOCHS: matched.map((x) => x.epoch) } }),
  ];
  const pRes = await apPub.invoke({ methodId: 'propagate', inputs: pInputs });
  if (pRes.statusCode !== 0) return null;
  const ephPub = outOf(pRes, 'ephemeris');
  if (checkParity && pubParityChecked < 20) {
    const pPriv = await apFull.invoke({ methodId: 'propagate', inputs: pInputs });
    const ephPriv = outOf(pPriv, 'ephemeris');
    pubParityChecked++;
    if (!ephPriv || !ephPub || !ephPriv.equals(ephPub)) pubParityDiffs++;
  }
  const blk = E.OEM.getRootAsOEM(new fbA.ByteBuffer(plain(ephPub))).unpack().EPHEMERIS_DATA_BLOCK[0];
  const nomLines = blk.EPHEMERIS_DATA_LINES, covLines = blk.COVARIANCE_MATRIX_LINES;
  if (!covLines || covLines.length !== matched.length) return null;

  let apAvgSum = 0, apAvgCnt = 0, apMax3h = 0, apDay0 = 0, f107Day0 = 0;
  for (const w of WX) {
    if (w.ms >= D0 && w.ms < D0 + 3 * DAY) { apAvgSum += w.apAvg; apAvgCnt++; apMax3h = Math.max(apMax3h, ...w.ap3); }
    if (w.ms === D0) { apDay0 = w.apAvg; f107Day0 = w.f107; }
  }
  const nMin = me.MEAN_MOTION * 2 * Math.PI / 1440;
  const aKm = Math.pow(0.074366859954178854 / nMin, 2 / 3) * 6378.1363;
  const hpKm = aKm * (1 - me.ECCENTRICITY) - 6378.1363;
  const leads = [];
  for (let i = 0; i < matched.length; i++) {
    const m = matched[i], l = nomLines[i];
    const rp = [l.X, l.Y, l.Z], vp = [l.X_DOT, l.Y_DOT, l.Z_DOT];
    const { B } = uvwBasis(rp, vp);
    const dr = [rp[0] - m.r[0], rp[1] - m.r[1], rp[2] - m.r[2]];
    const dv = [vp[0] - m.v[0], vp[1] - m.v[1], vp[2] - m.v[2]];
    leads.push({ h: m.h, e6: rotVec6ToUvw(B, dr, dv), pUvw: rotCov6ToUvw(B, covLineTo6x6(covLines[i])) });
  }
  return {
    regime: job.regime, split: job.split, norad: job.norad, name: job.name,
    arcH: job.arcH, ecom2: job.ecom2, covSize: ocmT.COV_SIZE,
    startUtc: job.startUtc, epochUtc: me.EPOCH,
    nRevDay: me.MEAN_MOTION, ecc: me.ECCENTRICITY, incDeg: me.INCLINATION, aKm, hpKm,
    bterm: me.BTERM, agom: me.AGOM, fitRmsKm: fs0.FIT_RMS_KM,
    tStartMin: cp.NOISE_START_MINUTES,
    apDay0, apMean3d: apAvgCnt ? apAvgSum / apAvgCnt : apDay0, apMax3h, f107Day0,
    leads,
  };
}

for (const job of workerData.chunk) {
  try {
    const D0 = Date.parse(job.startUtc);
    const truth = loadTruth(job, D0 - (job.arcH + 1) * HOUR, D0 + 73 * HOUR);
    const arcRaw = truth.filter((l) => l.ms >= D0 - job.arcH * HOUR && l.ms <= D0);
    if (arcRaw.length < 16) { parentPort.postMessage({ progress: 1 }); continue; }
    const stride = Math.max(1, Math.floor(arcRaw.length / 289));
    const thin = arcRaw.filter((_, i) => i % stride === 0 || i === arcRaw.length - 1);
    const oemPayload = packOem(job.norad, job.name, thin);
    const spw = packSpw(D0 - 10 * DAY, D0 + 35 * DAY);
    const matched = [];
    for (const h of EVAL_HOURS) {
      const targetMs = D0 + h * HOUR;
      let best = null, bestAbs = 300001;
      for (const l of truth) {
        const d = Math.abs(l.ms - targetMs);
        if (d <= 300000 && d < bestAbs) { best = l; bestAbs = d; }
      }
      if (best) matched.push({ h, epoch: isoZ(best.ms), r: best.r, v: best.v });
    }
    if (matched.length < 4) { parentPort.postMessage({ progress: 1 }); continue; }

    const fRes = await apFull.invoke({
      methodId: 'fit',
      inputs: [
        { portId: 'ephemeris', typeRef: T('OEM'), payload: oemPayload },
        fitCfgOf(job),
        { portId: 'space_weather', typeRef: T('SPW'), payload: spw },
      ],
    });
    if (fRes.statusCode === 0) {
      const row = await scoreOcm(job, outOf(fRes, 'elements'), matched, D0, true);
      if (row) parentPort.postMessage({ row });
    }
    if (job.alsoXp) {
      const xRes = await apFull.invoke({
        methodId: 'fit',
        inputs: [
          { portId: 'ephemeris', typeRef: T('OEM'), payload: oemPayload },
          xpCfg(),
        ],
      });
      if (xRes.statusCode === 0) {
        const xpRow = await scoreOcm(job, outOf(xRes, 'elements'), matched, D0, false);
        if (xpRow) parentPort.postMessage({ xpRow });
      }
    }
  } catch { /* skip broken truth file */ }
  parentPort.postMessage({ progress: 1 });
}

// Dense 60-second continuous-time monotonicity + NORAD re-ID parity audit on worker 0
for (const job of workerData.denseChunk) {
  try {
    const D0 = Date.parse(job.startUtc);
    const truth = loadTruth(job, D0 - (job.arcH + 1) * HOUR, D0 + 73 * HOUR);
    const arcRaw = truth.filter((l) => l.ms >= D0 - job.arcH * HOUR && l.ms <= D0);
    if (arcRaw.length < 16) continue;
    const stride = Math.max(1, Math.floor(arcRaw.length / 289));
    const thin = arcRaw.filter((_, i) => i % stride === 0 || i === arcRaw.length - 1);
    const spw = packSpw(D0 - 10 * DAY, D0 + 35 * DAY);
    const f1 = await apFull.invoke({
      methodId: 'fit',
      inputs: [{ portId: 'ephemeris', typeRef: T('OEM'), payload: packOem(job.norad, job.name, thin) }, fitCfgOf(job), { portId: 'space_weather', typeRef: T('SPW'), payload: spw }],
    });
    const f2 = await apFull.invoke({
      methodId: 'fit',
      inputs: [{ portId: 'ephemeris', typeRef: T('OEM'), payload: packOem(99999, 'PARITY-TEST', thin) }, fitCfgOf(job), { portId: 'space_weather', typeRef: T('SPW'), payload: spw }],
    });
    if (f1.statusCode !== 0 || f2.statusCode !== 0) continue;
    const ocm1 = outOf(f1, 'elements'), ocm2 = outOf(f2, 'elements');
    const denseEpochs = [];
    for (let m = 0; m <= 72 * 60; m++) denseEpochs.push(isoZ(D0 + m * 60000));
    const p1 = await apPub.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: T('OCM'), payload: prefixed(ocm1) }, configuration({ output: { FRAME: PA.pcfOutputFrame.GCRF, EPOCHS: denseEpochs } })] });
    const p2 = await apPub.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: T('OCM'), payload: prefixed(ocm2) }, configuration({ output: { FRAME: PA.pcfOutputFrame.GCRF, EPOCHS: [denseEpochs[0], denseEpochs[1440], denseEpochs[2880], denseEpochs[4320]] } })] });
    if (p1.statusCode !== 0 || p2.statusCode !== 0) continue;
    const b1 = E.OEM.getRootAsOEM(new fbA.ByteBuffer(plain(outOf(p1, 'ephemeris')))).unpack().EPHEMERIS_DATA_BLOCK[0];
    const b2 = E.OEM.getRootAsOEM(new fbA.ByteBuffer(plain(outOf(p2, 'ephemeris')))).unpack().EPHEMERIS_DATA_BLOCK[0];
    let parityDiff = 0;
    [0, 1440, 2880, 4320].forEach((idx, k) => {
      const s1 = b1.EPHEMERIS_DATA_LINES[idx], s2 = b2.EPHEMERIS_DATA_LINES[k];
      for (const f of ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT']) if (!Object.is(s1[f], s2[f])) parityDiff++;
      const c1 = b1.COVARIANCE_MATRIX_LINES[idx], c2 = b2.COVARIANCE_MATRIX_LINES[k];
      for (const f of COVF) if (!Object.is(c1[f], c2[f])) parityDiff++;
    });
    let nonFinite = 0, nonPd = 0, maxRelStep = 0;
    const sigI = [];
    for (let i = 0; i < b1.EPHEMERIS_DATA_LINES.length; i++) {
      const l = b1.EPHEMERIS_DATA_LINES[i], cl = b1.COVARIANCE_MATRIX_LINES[i];
      const { B } = uvwBasis([l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]);
      const pUvw = rotCov6ToUvw(B, covLineTo6x6(cl));
      if (!pUvw.every(Number.isFinite)) { nonFinite++; continue; }
      const M = new Float64Array(36);
      for (let r = 0, q = 0; r < 6; r++) for (let c = 0; c <= r; c++, q++) M[6 * r + c] = M[6 * c + r] = pUvw[q];
      const L = new Float64Array(36);
      let pd = true;
      for (let r = 0; r < 6 && pd; r++) {
        for (let c = 0; c <= r; c++) {
          let s = M[6 * r + c];
          for (let t = 0; t < c; t++) s -= L[6 * r + t] * L[6 * c + t];
          if (r === c) { if (!(s > 0)) { pd = false; break; } L[6 * r + r] = Math.sqrt(s); }
          else L[6 * r + c] = s / L[6 * c + c];
        }
      }
      if (!pd) nonPd++;
      const si = Math.sqrt(Math.max(0, pUvw[2])) * 1000;
      if (i > 0 && sigI[i - 1] > 1e-6) maxRelStep = Math.max(maxRelStep, Math.abs(si - sigI[i - 1]) / sigI[i - 1]);
      sigI.push(si);
    }
    const hourlySigIM = [0, 6, 12, 24, 36, 48, 60, 72].map((h) => +(sigI[h * 60] ?? NaN).toFixed(3));
    const monotonicSecular = hourlySigIM[3] > hourlySigIM[0] && hourlySigIM[5] > hourlySigIM[3] && hourlySigIM[7] > hourlySigIM[5];
    parentPort.postMessage({
      dense: {
        regime: job.regime, split: job.split, norad: job.norad, name: job.name, startUtc: job.startUtc, arcH: job.arcH, ecom2: job.ecom2,
        points: denseEpochs.length, nonFinite, nonPd, parityDiff, maxAdjacentMinuteRelStep: +maxRelStep.toFixed(6),
        hourlySigIM, monotonicSecular,
      },
    });
  } catch (err) {
    parentPort.postMessage({ dense: { regime: job.regime, norad: job.norad, error: String(err?.message ?? err) } });
  }
}

await apFull.destroy?.();
await apPub.destroy?.();
parentPort.postMessage({ done: true, pubParityChecked, pubParityDiffs });
