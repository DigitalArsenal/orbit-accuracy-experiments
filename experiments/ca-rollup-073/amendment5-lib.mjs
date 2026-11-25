// Shared causal helpers for Amendment 4 (#1126): FlatBuffers packing, causal forecast-only $SPW,
// Space-Track/SupGP $OMM packing, catalog-builder 0.2.4 driver, and GCRF -> RTN projection.
// Zero orbit propagation, frame transforms, screening, or Pc in JS — all physics runs in compiled WASM.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const sha256File = (f) => {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(f, 'r');
  const buf = Buffer.alloc(1 << 22);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
};
export const nowUtc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
export const isoNoZ = (ms) => new Date(ms).toISOString().replace(/Z$/, '');
export const utcMs = (s) => Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(String(s)) ? String(s) : `${String(s).replace(' ', 'T')}Z`);
export const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function loadSdsAndSdk(modulesRoot) {
  const cbPkg = path.join(modulesRoot, 'flows/catalog-builder/package.json');
  const caPkg = path.join(modulesRoot, 'analysis/conjunction-assessment/package.json');
  const expPkg = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../package.json');
  const sdsReqs = [cbPkg, caPkg, expPkg].filter((p) => fs.existsSync(p)).map((p) => createRequire(p));
  // Prefer space-data-module-sdk >= 0.9.7 (has runtime-contracts & current ModuleConfig ABI)
  const sdkReqs = [expPkg, cbPkg, caPkg].filter((p) => fs.existsSync(p)).map((p) => createRequire(p));
  const impFrom = (reqs, spec) => {
    for (const r of reqs) {
      try { return import(pathToFileURL(r.resolve(spec)).href); } catch { /* try next */ }
    }
    throw new Error(`Cannot resolve ${spec}`);
  };
  const imp = (spec) => impFrom(sdsReqs, spec);
  const fb = await imp('flatbuffers');
  const sdkBrowser = await impFrom(sdkReqs, 'space-data-module-sdk/host/browser-module');
  const sdkIso = await impFrom(sdkReqs, 'space-data-module-sdk/testing/isomorphic');
  const sdkRuntime = await impFrom(sdkReqs, 'space-data-module-sdk/runtime-contracts');
  const OMM_MOD = await imp('spacedatastandards.org/lib/js/OMM/main.js');
  const OCM_MOD = await imp('spacedatastandards.org/lib/js/OCM/main.js');
  const OEM_MOD = await imp('spacedatastandards.org/lib/js/OEM/main.js');
  const PCF_MOD = await imp('spacedatastandards.org/lib/js/PCF/main.js');
  const SPW_MOD = await imp('spacedatastandards.org/lib/js/SPW/main.js');
  const CAT_MOD = await imp('spacedatastandards.org/lib/js/CAT/main.js');
  const QRP_MOD = await imp('spacedatastandards.org/lib/js/QRP/main.js');
  const CQR_MOD = await imp('spacedatastandards.org/lib/js/CQR/main.js');
  const { F107DataType } = await imp('spacedatastandards.org/lib/js/SPW/F107DataType.js');

  // Force scalar defaults on SPW fields whose valid values include 0 (OBS = 0, AP_AVG = 0)
  if (!SPW_MOD.SPW._patchedForceDefaults) {
    const origF = SPW_MOD.SPW.addF107DataType;
    SPW_MOD.SPW.addF107DataType = (b, v) => { const w = b.force_defaults; b.forceDefaults(true); origF(b, v); b.forceDefaults(w); };
    const origA = SPW_MOD.SPW.addApAvg;
    SPW_MOD.SPW.addApAvg = (b, v) => { const w = b.force_defaults; b.forceDefaults(true); origA(b, v); b.forceDefaults(w); };
    SPW_MOD.SPW._patchedForceDefaults = true;
  }

  const pack = (rec, code, prefixed = true) => {
    const b = new fb.Builder(4096);
    if (prefixed) b.finishSizePrefixed(rec.pack(b), `$${code}`);
    else b.finish(rec.pack(b), `$${code}`);
    return Buffer.from(b.asUint8Array());
  };
  const typeRef = (code) => ({
    schemaName: `${code}.fbs`,
    fileIdentifier: { TimerTick: 'TICK', IngestResult: 'INGR' }[code] ?? `$${code}`,
    rootTypeName: code,
    wireFormat: 'flatbuffer',
  });
  const frame = (portId, code, payload) => ({ portId, typeRef: typeRef(code), payload });
  const splitPrefixed = (buf) => {
    const out = [];
    for (let i = 0; i < buf.length;) {
      const sz = buf.readUInt32LE(i);
      out.push(buf.subarray(i, i + 4 + sz));
      i += 4 + sz;
    }
    return out;
  };
  return {
    fb, sdkBrowser, sdkIso, sdkRuntime,
    OMM_MOD, OCM_MOD, OEM_MOD, PCF_MOD, SPW_MOD, CAT_MOD, QRP_MOD, CQR_MOD, F107DataType,
    pack, typeRef, frame, splitPrefixed,
  };
}

// Convert Space-Track GP or CelesTrak SupGP JSON object into packed $OMM FlatBuffer
export function gpJsonToOmm(row, sds, prefixed = true) {
  const { OMM_MOD, pack } = sds;
  const epochRaw = String(row.EPOCH || '').replace(' ', 'T').replace(/Z$/, '');
  const createdRaw = row.CREATION_DATE ? String(row.CREATION_DATE).replace(' ', 'T').replace(/Z$/, '') : epochRaw;
  const omm = Object.assign(new OMM_MOD.OMMT(), {
    CCSDS_OMM_VERS: Number(row.CCSDS_OMM_VERS) || 3,
    CREATION_DATE: createdRaw,
    ORIGINATOR: String(row.ORIGINATOR || (row.DATA_SOURCE ? `CELESTRAK-${row.DATA_SOURCE}` : '18 SPCS')),
    OBJECT_NAME: String(row.OBJECT_NAME || `SAT-${row.NORAD_CAT_ID}`),
    OBJECT_ID: String(row.OBJECT_ID || String(row.NORAD_CAT_ID)),
    CENTER_NAME: 'EARTH',
    EPOCH: epochRaw,
    MEAN_MOTION: Number(row.MEAN_MOTION),
    ECCENTRICITY: Number(row.ECCENTRICITY),
    INCLINATION: Number(row.INCLINATION),
    RA_OF_ASC_NODE: Number(row.RA_OF_ASC_NODE),
    ARG_OF_PERICENTER: Number(row.ARG_OF_PERICENTER),
    MEAN_ANOMALY: Number(row.MEAN_ANOMALY),
    EPHEMERIS_TYPE: Number(row.EPHEMERIS_TYPE) || 0,
    CLASSIFICATION_TYPE: String(row.CLASSIFICATION_TYPE || 'U'),
    NORAD_CAT_ID: Number(row.NORAD_CAT_ID) >>> 0,
    ELEMENT_SET_NO: Number(row.ELEMENT_SET_NO) || 999,
    REV_AT_EPOCH: Number(row.REV_AT_EPOCH) || 0,
    BSTAR: Number(row.BSTAR) || 0,
    MEAN_MOTION_DOT: Number(row.MEAN_MOTION_DOT) || 0,
    MEAN_MOTION_DDOT: Number(row.MEAN_MOTION_DDOT) || 0,
  });
  return pack(omm, 'OMM', prefixed);
}

// Strictly causal forecast-only $SPW table (2024..2027) from public GFZ + NOAA SWPC archives.
// Never reads any observation with date > cutoffDate. Uses CC BY 4.0 Kp/ap/Ap and F10.7 columns only.
const gfzSince1932Cache = new Map();
function loadGfzBase(archiveRoot) {
  if (gfzSince1932Cache.has(archiveRoot)) return gfzSince1932Cache.get(archiveRoot);
  const base = new Map();
  const f = path.join(archiveRoot, 'hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const p = line.trim().split(/\s+/);
      if (p.length < 27) continue;
      const y = Number(p[0]);
      if (y < 2024) continue;
      const date = `${y}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
      const ap3h = p.slice(15, 23).map(Number);
      let ap = Number(p[23]);
      if (ap < 0) {
        const v = ap3h.filter((x) => x >= 0);
        if (v.length) ap = v.reduce((a, b) => a + b, 0) / v.length;
      }
      const f107 = Number(p[25]);
      if (f107 > 0 && ap >= 0) {
        base.set(date, { f107, ap: Math.round(ap), ap3h: ap3h.every((x) => x >= 0) ? ap3h : null });
      }
    }
  }
  gfzSince1932Cache.set(archiveRoot, base);
  return base;
}

function findLatestSubdir(parentDir, cutoffDate) {
  if (!fs.existsSync(parentDir)) return null;
  let best = null;
  for (const name of fs.readdirSync(parentDir)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name <= cutoffDate && (!best || name > best)) best = name;
  }
  return best ? { dt: best, dir: path.join(parentDir, best) } : null;
}

export function buildCausalSpwRecords({ archiveRoot = '/opt/data/sdn-archive', firstDate, lastDate, cutoffDate, sds }) {
  const { SPW_MOD, F107DataType, pack } = sds;
  const raw = new Map();
  for (const [d, v] of loadGfzBase(archiveRoot)) {
    if (d <= cutoffDate) raw.set(d, { ...v });
  }
  const gfzDir = findLatestSubdir(path.join(archiveRoot, 'hac/gfz-kp/2026'), cutoffDate);
  if (gfzDir) {
    const nf = path.join(gfzDir.dir, 'Kp_ap_Ap_SN_F107_nowcast.txt');
    if (fs.existsSync(nf)) {
      for (const line of fs.readFileSync(nf, 'utf8').split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const p = line.trim().split(/\s+/);
        if (p.length < 27) continue;
        const y = Number(p[0]);
        if (y < 2024) continue;
        const date = `${y}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
        if (date > cutoffDate) continue;
        const ap3h = p.slice(15, 23).map(Number);
        let ap = Number(p[23]);
        if (ap < 0) {
          const v = ap3h.filter((x) => x >= 0);
          if (v.length) ap = v.reduce((a, b) => a + b, 0) / v.length;
        }
        const f107 = Number(p[25]);
        const prev = raw.get(date);
        if (f107 > 0 && ap >= 0) {
          raw.set(date, { f107, ap: Math.round(ap), ap3h: ap3h.every((x) => x >= 0) ? ap3h : (prev?.ap3h ?? null) });
        } else if (ap >= 0 && prev) {
          raw.set(date, { ...prev, ap: Math.round(ap) });
        }
      }
    }
  }
  // Causal NOAA SWPC overlay + SGARF 3-day forecast strictly <= cutoffDate
  const sgarf = new Map();
  const swpcDir = findLatestSubdir(path.join(archiveRoot, 'hac/noaa-swpc/2026'), cutoffDate);
  if (swpcDir) {
    const solarTxt = path.join(swpcDir.dir, 'daily-solar-indices.txt');
    if (fs.existsSync(solarTxt)) {
      for (const line of fs.readFileSync(solarTxt, 'utf8').split('\n')) {
        const m = /^(\d{4})\s+(\d{2})\s+(\d{2})\s+(\d+(?:\.\d+)?)/.exec(line.trim());
        if (!m) continue;
        const date = `${m[1]}-${m[2]}-${m[3]}`;
        const f107 = Number(m[4]);
        if (f107 > 0 && date <= cutoffDate) {
          const prev = raw.get(date) ?? { f107, ap: 10, ap3h: null };
          raw.set(date, { ...prev, f107 });
        }
      }
    }
    const geoTxt = path.join(swpcDir.dir, 'daily-geomagnetic-indices.txt');
    if (fs.existsSync(geoTxt)) {
      for (const line of fs.readFileSync(geoTxt, 'utf8').split('\n')) {
        if (!/^\d{4}\s+\d{2}\s+\d{2}/.test(line.trim())) continue;
        const date = `${line.slice(0, 4).trim()}-${line.slice(5, 7).trim().padStart(2, '0')}-${line.slice(8, 10).trim().padStart(2, '0')}`;
        if (date > cutoffDate) continue;
        const ap = Number(line.slice(58).trim().split(/\s+/)[0]);
        if (Number.isFinite(ap) && ap >= 0) {
          const prev = raw.get(date) ?? { f107: 120, ap: Math.round(ap), ap3h: null };
          raw.set(date, { ...prev, ap: Math.round(ap) });
        }
      }
    }
    const lagDays = Math.round((Date.parse(`${cutoffDate}T00:00:00Z`) - Date.parse(`${swpcDir.dt}T00:00:00Z`)) / DAY_MS);
    const sgarfPath = path.join(swpcDir.dir, 'sgarf.txt');
    if (lagDays <= 2 && fs.existsSync(sgarfPath)) {
      const txt = fs.readFileSync(sgarfPath, 'utf8');
      const fm = /Predicted\s+(\d{2})\s+([A-Za-z]{3})-\d{2}\s+[A-Za-z]{3}\s+(\d+)\/(\d+)\/(\d+)/.exec(txt);
      const am = /Predicted Afr\/Ap\s+\d{2}\s+[A-Za-z]{3}-\d{2}\s+[A-Za-z]{3}\s+\d+\/(\d+)-\d+\/(\d+)-\d+\/(\d+)/.exec(txt);
      if (fm && am) {
        const mm = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }[fm[2]] ?? swpcDir.dt.slice(5, 7);
        const day0Ms = Date.parse(`${swpcDir.dt.slice(0, 4)}-${mm}-${fm[1]}T00:00:00Z`);
        for (let i = 0; i < 3; i++) {
          const dStr = dayStr(day0Ms + i * DAY_MS);
          if (dStr >= cutoffDate) sgarf.set(dStr, { f107: Number(fm[3 + i]), ap: Number(am[1 + i]) });
        }
      }
    }
  }

  // Build daily grid covering [firstDate - 45d, lastDate + 45d] for exact 81-day centered F10.7 average
  const firstMs = Date.parse(`${firstDate}T00:00:00Z`);
  const lastMs = Date.parse(`${lastDate}T00:00:00Z`);
  const cutMs = Date.parse(`${cutoffDate}T00:00:00Z`);
  const padStartMs = firstMs - 45 * DAY_MS;
  const padStopMs = lastMs + 45 * DAY_MS;
  const totalDays = Math.round((padStopMs - padStartMs) / DAY_MS) + 1;

  // Baseline 27-day & 81-day causal averages ending strictly at cutoffDate
  const recent27F = [], recent81F = [], recent27A = [];
  for (let d = 0; d < 81; d++) {
    const e = raw.get(dayStr(cutMs - d * DAY_MS));
    if (e) {
      recent81F.push(e.f107);
      if (d < 27) { recent27F.push(e.f107); recent27A.push(e.ap); }
    }
  }
  const meanF27 = recent27F.length ? recent27F.reduce((a, b) => a + b, 0) / recent27F.length : 120;
  const meanF81 = recent81F.length ? recent81F.reduce((a, b) => a + b, 0) / recent81F.length : meanF27;
  const meanA27 = recent27A.length ? recent27A.reduce((a, b) => a + b, 0) / recent27A.length : 10;

  const series = new Array(totalDays);
  for (let i = 0; i < totalDays; i++) {
    const ms = padStartMs + i * DAY_MS;
    const d = dayStr(ms);
    if (ms <= cutMs && raw.has(d)) {
      const e = raw.get(d);
      series[i] = { date: d, f107: e.f107, ap: e.ap, ap3h: e.ap3h, isPrd: ms === cutMs };
    } else if (ms <= cutMs) {
      // Fill any missing historical gap from previous day
      const prev = i > 0 ? series[i - 1] : { f107: meanF81, ap: Math.round(meanA27) };
      series[i] = { date: d, f107: prev.f107, ap: prev.ap, ap3h: null, isPrd: false };
    } else if (sgarf.has(d)) {
      const s = sgarf.get(d);
      series[i] = { date: d, f107: s.f107, ap: s.ap, ap3h: null, isPrd: true };
    } else {
      // Strictly causal 27-day Bartels recurrence + AR(1) relaxation toward 81-day causal mean
      const lead = Math.round((ms - cutMs) / DAY_MS);
      const b27 = i >= 27 ? series[i - 27] : null;
      const wRot = 0.65 * Math.exp(-lead / 27);
      const f107 = b27 ? wRot * b27.f107 + (1 - wRot) * meanF81 : meanF81;
      const ap = b27 ? Math.max(0, Math.round(0.35 * Math.exp(-lead / 14) * b27.ap + (1 - 0.35 * Math.exp(-lead / 14)) * meanA27)) : Math.round(meanA27);
      series[i] = { date: d, f107, ap, ap3h: null, isPrd: true };
    }
  }

  const outRecords = [];
  for (let i = 0; i < totalDays; i++) {
    const row = series[i];
    if (row.date < firstDate || row.date > lastDate) continue;
    let sum81 = 0, cnt81 = 0;
    for (let j = Math.max(0, i - 40); j <= Math.min(totalDays - 1, i + 40); j++) {
      sum81 += series[j].f107;
      cnt81++;
    }
    const props = {
      DATE: row.date,
      F107_OBS: Math.fround(row.f107),
      F107_OBS_CENTER81: Math.fround(sum81 / cnt81),
      AP_AVG: Math.max(0, Math.round(row.ap)),
      F107_DATA_TYPE: row.isPrd ? F107DataType.PRD : F107DataType.OBS,
    };
    if (row.ap3h) {
      [props.AP_1, props.AP_2, props.AP_3, props.AP_4, props.AP_5, props.AP_6, props.AP_7, props.AP_8] = row.ap3h;
    }
    outRecords.push(pack(Object.assign(new SPW_MOD.SPWT(), props), 'SPW', true));
  }
  return outRecords;
}

// Exact signed RTN error vector [dR, dT, dN] (km) of predicted position rPred relative to truth (rTrue, vTrue) in GCRF
export function signedRtnErrorKm(rPred, rTrue, vTrue) {
  const dx = rPred[0] - rTrue[0], dy = rPred[1] - rTrue[1], dz = rPred[2] - rTrue[2];
  const rMag = Math.hypot(rTrue[0], rTrue[1], rTrue[2]);
  const rx = rTrue[0] / rMag, ry = rTrue[1] / rMag, rz = rTrue[2] / rMag;
  const hx = rTrue[1] * vTrue[2] - rTrue[2] * vTrue[1];
  const hy = rTrue[2] * vTrue[0] - rTrue[0] * vTrue[2];
  const hz = rTrue[0] * vTrue[1] - rTrue[1] * vTrue[0];
  const hMag = Math.hypot(hx, hy, hz);
  const nx = hx / hMag, ny = hy / hMag, nz = hz / hMag;
  const tx = ny * rz - nz * ry, ty = nz * rx - nx * rz, tz = nx * ry - ny * rx;
  return [
    dx * rx + dy * ry + dz * rz,
    dx * tx + dy * ty + dz * tz,
    dx * nx + dy * ny + dz * nz,
  ];
}

// Drive compiled flows/catalog-builder 0.2.4 controller + chain in memory to build one batch of objects
// Returns Map<noradId, { ocmBuf: Buffer, reason: string, branch: string }> (unprefixed OCM bytes ready for sdn-ap propagate)
export async function buildCatalogBatch({
  modulesRoot, sds, kind, nowMs,
  seeds, // Map<norad, Buffer (size-prefixed $OMM)>
  historyByNorad, // Map<norad, Array<{ ms: number, buf: Buffer (size-prefixed $OMM) }>>
  ephemeridesByNorad = null, // optional Map<norad, Buffer (size-prefixed $OCM)>
  weatherRecords, // Array<Buffer (size-prefixed $SPW)>
  reusable = null, // optional { chain, gp, composer } to amortize WASM startup across batches
}) {
  const { fb, sdkBrowser, sdkIso, sdkRuntime, OMM_MOD, OCM_MOD, CAT_MOD, QRP_MOD, pack, frame, splitPrefixed } = sds;
  const controlDir = path.join(modulesRoot, 'flows/catalog-builder/dist/flow/control');
  const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8'));

  const cfg = {
    'catalog.provider': `amend4-${kind}`,
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
    ...(ephemeridesByNorad ? {
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
  if (ephemeridesByNorad) {
    const ephList = getList('OCM.fbs', 'local', 'operator');
    for (const buf of ephemeridesByNorad.values()) ephList.push(buf);
  }

  const control = await sdkBrowser.createBrowserModuleHarness({
    wasmSource: fs.readFileSync(path.join(controlDir, 'dist/isomorphic/module.wasm')),
    manifest: manifest(path.join(modulesRoot, 'flows/catalog-builder/control')),
    surface: 'direct',
    hostOptions: { config: cfg },
  });
  const ownChain = !reusable;
  const chain = reusable?.chain ?? await sdkIso.createStandaloneHarness('browser', path.join(modulesRoot, 'flows/catalog-builder/dist/isomorphic/module.wasm'), { surface: 'direct', enableBrowserWasiThreads: false });
  const gp = reusable?.gp ?? await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(modulesRoot, 'analysis/gp-error-model/dist/isomorphic/module.wasm')), manifest: manifest(path.join(modulesRoot, 'analysis/gp-error-model')), surface: 'direct' });
  const composer = reusable?.composer ?? await sdkBrowser.createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(modulesRoot, 'analysis/catalog-composer/dist/isomorphic/module.wasm')), manifest: manifest(path.join(modulesRoot, 'analysis/catalog-composer')), surface: 'direct' });

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
            results.set(id, { ocmBuf: Buffer.from(el.payload), isFallback: false, reason: dec.MESSAGE || '' });
          } else if (fbOut && !results.has(id)) {
            results.set(id, { ocmBuf: Buffer.from(fbOut.payload), isFallback: true, reason: dec.MESSAGE || '' });
          }
          input = r.outputs.map((f) => ({ ...f, portId: { fallback: 'fallback', elements: 'candidate', decision: 'chain_status' }[f.portId] }));
        } else if (out.annotate_orbit) {
          const ar = await gp.invoke({ methodId: 'annotate_population_flow', inputs: [frame('ocm', 'OCM', out.annotate_orbit.payload), frame('elements', 'OMM', out.annotate_seed.payload)] });
          if (ar.statusCode !== 0) throw new Error(`annotate failed: ${ar.errorCode} ${ar.errorMessage}`);
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
    if (ownChain) {
      await chain.destroy?.();
      await gp.destroy?.();
      await composer.destroy?.();
    }
  }
  return results;
}
