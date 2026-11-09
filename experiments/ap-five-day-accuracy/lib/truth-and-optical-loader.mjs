import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as flatbuffers from "flatbuffers";
import {
  OEM,
  OEMT,
  ephemerisDataBlockT,
  ephemerisDataLineT,
  RFMT,
  CelestialFrameWrapperT,
  CelestialFrame,
  RFMUnion,
  CATT,
  timingStandard,
} from "spacedatastandards.org/lib/js/OEM/main.js";
import { TDM, TDMT, TDMSegmentT, TDMObservationT } from "spacedatastandards.org/lib/js/TDM/main.js";
import { EOO, EOOT } from "spacedatastandards.org/lib/js/EOO/main.js";
import { encodeModuleConfig } from "space-data-module-sdk/runtime-contracts";
import { assertAllowedPath, isHeldForStudy } from "./hold-gate.mjs";
import { TYPES, transformStateKm, MODULES_ROOT } from "./wasm-hosts.mjs";
import {
  parseIod,
  statedSites,
  messageText,
} from "../../e6-public-observations/iod.mjs";

const { readParquet } = await import(
  path.join(MODULES_ROOT, "data-source/satnogs-optical-source/tests/parquet.mjs")
);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const utcMs = (iso) => Date.parse(/[zZ]$/.test(iso) ? iso : `${iso}Z`);

const TRUTH_GATE_FLAGS = path.join(
  new URL("../../../experiments/truth-gate/flags.json", import.meta.url).pathname
);

function loadTruthDropSet() {
  const drop = new Set();
  if (fs.existsSync(TRUTH_GATE_FLAGS)) {
    const j = JSON.parse(fs.readFileSync(TRUTH_GATE_FLAGS, "utf8"));
    for (const f of j.flags ?? []) {
      if (f.action === "drop") {
        drop.add(`${f.product}|${f.norad}|${Date.parse(f.epoch)}`);
      }
    }
  }
  return drop;
}

function decodeOemStream(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const out = [];
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  if (u.byteLength >= 8 && String.fromCharCode(u[4], u[5], u[6], u[7]) === "$OEM") {
    out.push(OEM.getRootAsOEM(new flatbuffers.ByteBuffer(u)).unpack());
    return out;
  }
  for (let off = 0; off + 8 <= u.byteLength; ) {
    const len = dv.getUint32(off, true);
    if (len === 0 || off + 4 + len > u.byteLength) break;
    out.push(OEM.getRootAsOEM(new flatbuffers.ByteBuffer(u.subarray(off + 4, off + 4 + len))).unpack());
    off += 4 + len;
  }
  return out;
}

/**
 * Packs GCRF states [{ epoch, r: [km], v: [km/s] }] into a canonical SDS $OEM buffer (for sdn-ap `fit`).
 */
export function buildGcrfOemBytes({ norad, objectName = `SAT-${norad}`, objectId = `${norad}`, originator = "SDN", states }) {
  const rfm = Object.assign(new RFMT(), {
    FRAME_TYPE: RFMUnion.CelestialFrameWrapper,
    FRAME: Object.assign(new CelestialFrameWrapperT(), { frame: CelestialFrame.GCRF }),
    NAME: "GCRF",
  });
  const cat = Object.assign(new CATT(), {
    OBJECT_NAME: objectName,
    OBJECT_ID: objectId,
    NORAD_CAT_ID: Number(norad) >>> 0,
  });
  const lines = states.map((s) =>
    Object.assign(new ephemerisDataLineT(), {
      EPOCH: s.epoch.replace(/Z$/i, ""),
      X: s.r[0],
      Y: s.r[1],
      Z: s.r[2],
      X_DOT: s.v[0],
      Y_DOT: s.v[1],
      Z_DOT: s.v[2],
    })
  );
  const blk = Object.assign(new ephemerisDataBlockT(), {
    OBJECT: cat,
    CENTER_NAME: "EARTH",
    REFERENCE_FRAME: rfm,
    TIME_SYSTEM: timingStandard.UTC,
    START_TIME: lines[0].EPOCH,
    STOP_TIME: lines.at(-1).EPOCH,
    EPHEMERIS_DATA_LINES: lines,
  });
  const oem = Object.assign(new OEMT(), {
    CCSDS_OEM_VERS: "2.0",
    CREATION_DATE: lines.at(-1).EPOCH,
    ORIGINATOR: originator,
    EPHEMERIS_DATA_BLOCK: [blk],
  });
  const b = new flatbuffers.Builder(Math.max(4096, lines.length * 96));
  OEM.finishOEMBuffer(b, oem.pack(b));
  return b.asUint8Array().slice();
}

/**
 * Loads precision GCRF reference trajectories from /opt/data/sdn-archive/reference-states/reference/
 * for Sep-Nov 2026 (excluding held satellites and bad states).
 */
export function loadReferenceOemIndex({
  refDirs = [
    (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/reference-states/reference",
    (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/reference-states/reference-leo-pod-2",
  ],
  minStartIso = "2026-08-20T00:00:00Z",
} = {}) {
  for (const d of refDirs) assertAllowedPath(d);
  const minMs = utcMs(minStartIso);
  const dropSet = loadTruthDropSet();

  const prefixes = [
    "ESA0OPSFIN_20262",
    "ESA0OPSFIN_20263",
    "S1A_OPER_AUX_POEORB",
    "S1C_OPER_AUX_POEORB",
    "S1D_OPER_AUX_POEORB",
    "ssa",
    "ilrsa.orb.",
    "nsgf.orb.",
  ];

  const byNorad = new Map(); // norad -> [{ product, family, start, stop, file }]
  for (const refDir of refDirs) {
    if (!fs.existsSync(refDir)) continue;
    for (const dirName of fs.readdirSync(refDir).filter((d) => prefixes.some((p) => d.startsWith(p))).sort()) {
      const idxPath = path.join(refDir, dirName, "index.json");
      if (!fs.existsSync(idxPath)) continue;
      const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      let family = "OTHER";
      if (dirName.startsWith("ESA0OPSFIN")) family = "ESA_GNSS";
      else if (dirName.startsWith("S1")) family = "COPERNICUS_S1_POD";
      else if (dirName.startsWith("ssa")) family = "IDS_DORIS";
      else if (dirName.startsWith("ilrsa.orb")) family = "ILRS_SLR_MEO";
      else if (dirName.startsWith("nsgf.orb")) family = "ILRS_SLR_LEO";

      for (const o of idx.objects ?? []) {
        const stopMs = utcMs(o.stop);
        if (stopMs < minMs) continue;
        if (isHeldForStudy(o.norad, o.comment || "", o.stop)) continue;
        if (!byNorad.has(o.norad)) byNorad.set(o.norad, []);
        byNorad.get(o.norad).push({
          norad: o.norad,
          product: dirName,
          family,
          start: utcMs(o.start),
          stop: stopMs,
          file: path.join(refDir, dirName, o.file),
        });
      }
    }
  }

  for (const arr of byNorad.values()) {
    arr.sort((a, b) => a.start - b.start || a.product.localeCompare(b.product));
  }

  const fileCache = new Map();
  const loadEntryStates = (entry) => {
    if (fileCache.has(entry.file)) return fileCache.get(entry.file);
    assertAllowedPath(entry.file);
    const raw = fs.readFileSync(entry.file);
    const oems = decodeOemStream(raw);
    const states = [];
    for (const oem of oems) {
      for (const blk of oem.EPHEMERIS_DATA_BLOCK ?? []) {
        for (const l of blk.EPHEMERIS_DATA_LINES ?? []) {
          const ms = utcMs(l.EPOCH);
          if (isHeldForStudy(entry.norad, "", l.EPOCH)) continue;
          if (dropSet.has(`${entry.product}|${entry.norad}|${ms}`)) continue;
          const r = [l.X, l.Y, l.Z];
          const v = [l.X_DOT, l.Y_DOT, l.Z_DOT];
          if (r.some((x) => x === 0 || !Number.isFinite(x)) || Math.hypot(...r) < 6357) continue;
          states.push({ ms, epoch: l.EPOCH.replace(/Z$/i, ""), r, v, family: entry.family, product: entry.product });
        }
      }
    }
    fileCache.set(entry.file, states);
    return states;
  };

  /**
   * Returns continuous/merged sorted GCRF states for `norad` in [startMs, stopMs].
   * Evaluates exact cubic Hermite interpolation at any epoch `tMs` when bracketed by <= maxGapSec (default 900s)
   * with both position & velocity present!
   */
  function getSeries(norad, startMs, stopMs) {
    const entries = byNorad.get(norad) ?? [];
    const byMs = new Map();
    for (const e of entries) {
      if (e.stop < startMs - 900e3 || e.start > stopMs + 900e3) continue;
      for (const s of loadEntryStates(e)) {
        if (s.ms >= startMs - 900e3 && s.ms <= stopMs + 900e3) {
          if (!byMs.has(s.ms)) byMs.set(s.ms, s);
        }
      }
    }
    return [...byMs.values()].sort((a, b) => a.ms - b.ms);
  }

  function stateAtExactOrHermite(series, tMs, maxBracketSec = 900) {
    if (!series.length) return null;
    let lo = 0, hi = series.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (series[mid].ms < tMs) lo = mid + 1;
      else hi = mid;
    }
    if (lo < series.length && Math.abs(series[lo].ms - tMs) <= 50) return series[lo];
    if (lo > 0 && Math.abs(series[lo - 1].ms - tMs) <= 50) return series[lo - 1];
    if (lo === 0 || lo >= series.length) return null;
    const s0 = series[lo - 1];
    const s1 = series[lo];
    const dt = (s1.ms - s0.ms) * 1e-3;
    if (!(dt > 0 && dt <= maxBracketSec)) return null;
    const hasVel = s0.v.some((x) => x !== 0) && s1.v.some((x) => x !== 0);
    if (!hasVel) return null;
    // Exact 2-point cubic Hermite interpolation on dense POD/SP3 grid (<= 5 min / 300 s spacing -> sub-mm truncation!)
    const u = (tMs - s0.ms) * 1e-3 / dt;
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    const dh00 = (6 * u2 - 6 * u) / dt;
    const dh10 = 3 * u2 - 4 * u + 1;
    const dh01 = (-6 * u2 + 6 * u) / dt;
    const dh11 = 3 * u2 - 2 * u;
    const r = [0, 0, 0], v = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      r[k] = h00 * s0.r[k] + h10 * dt * s0.v[k] + h01 * s1.r[k] + h11 * dt * s1.v[k];
      v[k] = dh00 * s0.r[k] + dh10 * s0.v[k] + dh01 * s1.r[k] + dh11 * s1.v[k];
    }
    return { ms: tMs, epoch: new Date(tMs).toISOString().replace(/Z$/, ""), r, v, family: s0.family, product: s0.product };
  }

  return { byNorad, getSeries, stateAtExactOrHermite };
}

/**
 * Loads EUMETSAT Metop-SG A1 (NORAD 65159) AUX_POFD XML and transforms ITRF -> GCRF strictly via WASM foundation/frames!
 */
export async function loadMetopSgGcrfSeries(framesHost, eopRows, {
  zipPath = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/eumetsat-metopsg/AUX_POFD/SGA1________AUX_POFD___S20261106000000Z_E20261111000000Z_G20261108064405Z_FDS__OPE_OPER.SIP.zip",
  startIso = "2026-11-06T00:00:00",
  stopIso = "2026-11-11T00:00:00",
  stepMinutes = 5,
} = {}) {
  assertAllowedPath(zipPath);
  const eofXml = execSync(`unzip -p "${zipPath}" "*.EOF"`, { encoding: "utf8", maxBuffer: 48 * 1024 * 1024 });
  const osvRegex =
    /<OSV>\s*<TAI>[^<]+<\/TAI>\s*<UTC>UTC=([^<]+)<\/UTC>\s*<UT1>UT1=[^<]+<\/UT1>[\s\S]*?<X[^>]*>([^<]+)<\/X>\s*<Y[^>]*>([^<]+)<\/Y>\s*<Z[^>]*>([^<]+)<\/Z>\s*<VX[^>]*>([^<]+)<\/VX>\s*<VY[^>]*>([^<]+)<\/VY>\s*<VZ[^>]*>([^<]+)<\/VZ>/g;

  // Compact EOP slice around Nov 2026 for fast WASM calls
  const { EOP } = await import("spacedatastandards.org/lib/js/EOP/main.js");
  const nearEop = eopRows
    .filter((r) => r.MJD >= 61340 && r.MJD <= 61365)
    .map((row) => {
      const b = new flatbuffers.Builder(256);
      EOP.finishEOPBuffer(b, row.pack(b));
      return { portId: "earth_orientation", typeRef: TYPES.EOP, payload: b.asUint8Array().slice() };
    });

  const out = [];
  let m;
  while ((m = osvRegex.exec(eofXml)) !== null) {
    const utc = m[1].trim();
    if (utc < startIso || utc > stopIso || !utc.endsWith(":00.000000")) continue;
    const minPart = Number(utc.slice(14, 16));
    if (minPart % stepMinutes !== 0) continue;
    const rItrf = [Number(m[2]) * 1e-3, Number(m[3]) * 1e-3, Number(m[4]) * 1e-3];
    const vItrf = [Number(m[5]) * 1e-3, Number(m[6]) * 1e-3, Number(m[7]) * 1e-3];
    const g = await transformStateKm(framesHost, nearEop, {
      fromAxis: "ITRF",
      toAxis: "GCRF",
      epochIso: `${utc}Z`,
      rKm: rItrf,
      vKmS: vItrf,
    });
    out.push({ ms: utcMs(utc), epoch: utc, r: g.rKm, v: g.vKmS, family: "EUMETSAT_METOPSG", product: path.basename(zipPath) });
  }
  return out;
}

/**
 * Loads FAA WAAS SBAS GEO broadcast states (hac/cddis-sbas/2026/*.json), converts GPS->UTC (+0/-18s)
 * and ITRF->GCRF strictly via WASM foundation/frames, and associates non-held GEO NORADs.
 */
export async function loadWaasSbasGcrfByPrn(framesHost, eopRows, {
  sbasDir = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/cddis-sbas/2026",
  doys = [302, 303, 304, 305, 306, 307],
  sampleStepSeconds = 900,
} = {}) {
  assertAllowedPath(sbasDir);
  const { EOP } = await import("spacedatastandards.org/lib/js/EOP/main.js");
  const nearEop = eopRows
    .filter((r) => r.MJD >= 61335 && r.MJD <= 61365)
    .map((row) => {
      const b = new flatbuffers.Builder(256);
      EOP.finishEOPBuffer(b, row.pack(b));
      return { portId: "earth_orientation", typeRef: TYPES.EOP, payload: b.asUint8Array().slice() };
    });

  // Known operational FAA WAAS GEO PRN -> NORAD mapping (excluding Eutelsat 117WB PRN 131 = 41589 per owner ruling!):
  // PRN 133 = SES-15 (NORAD 42709), PRN 135 = Galaxy 30 (NORAD 46114), PRN 138 = Anik F1R / TeleSat (check health == 0)
  const PRN_TO_NORAD = new Map([
    [133, { norad: 42709, name: "SES-15 (WAAS PRN 133)" }],
    [135, { norad: 46114, name: "GALAXY 30 (WAAS PRN 135)" }],
  ]);

  const byNorad = new Map();
  for (const doy of doys) {
    const f = path.join(sbasDir, `${doy}.json`);
    if (!fs.existsSync(f)) continue;
    const data = JSON.parse(fs.readFileSync(f, "utf8"));
    let lastKeptByPrn = new Map();
    for (const rec of data.records ?? []) {
      const info = PRN_TO_NORAD.get(rec.prn);
      if (!info) continue;
      if (rec.ura > 8) continue; // Only operational low-URA WAAS broadcast messages (RINEX health 31 = all 5 SBAS flags healthy)
      const utcEpochMs = rec.gpsMs - 18000; // TAI-UTC=37s, TAI-GPS=19s => UTC = GPS - 18s in 2026
      const prevMs = lastKeptByPrn.get(rec.prn) ?? 0;
      if (utcEpochMs - prevMs < sampleStepSeconds * 1000 - 500) continue;
      lastKeptByPrn.set(rec.prn, utcEpochMs);
      const iso = new Date(utcEpochMs).toISOString();
      const g = await transformStateKm(framesHost, nearEop, {
        fromAxis: "ITRF",
        toAxis: "GCRF",
        epochIso: iso,
        rKm: rec.r,
        vKmS: rec.v,
      });
      if (!byNorad.has(info.norad)) byNorad.set(info.norad, { ...info, states: [] });
      byNorad.get(info.norad).states.push({
        ms: utcEpochMs,
        epoch: iso.replace(/Z$/, ""),
        r: g.rKm,
        v: g.vKmS,
        family: "WAAS_SBAS_GEO",
        product: `cddis-sbas-2026-${doy}`,
      });
    }
  }
  for (const v of byNorad.values()) {
    v.states.sort((a, b) => a.ms - b.ms);
  }
  return byNorad;
}

/**
 * Indexes SatNOGS Optical sessions in [startSession .. stopSession], reading tracks.parquet and measurements.parquet,
 * and invokes WASM data-source/satnogs-optical-source (`read_station_night`) to emit canonical $TDM + $GST + $PVN!
 */
export function scanSatnogsOpticalSessions({
  optRoot = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/satnogs-optical",
  startSession = "2026-09-20",
  stopSession = "2026-11-08",
  filterNorads = null,
} = {}) {
  assertAllowedPath(optRoot);
  const sessDirs = fs
    .readdirSync(optRoot)
    .filter((d) => d.startsWith("session_date="))
    .map((d) => ({ dir: d, session: d.replace("session_date=", "") }))
    .filter((s) => s.session >= startSession && s.session <= stopSession)
    .sort((a, b) => a.session.localeCompare(b.session));

  const byNorad = new Map(); // norad -> Map<session, Array<{ stationJson, rows }>>
  const unkTracks = []; // for current-week UNK track association

  for (const s of sessDirs) {
    const genBase = path.join(optRoot, s.dir, "generations");
    if (!fs.existsSync(genBase)) continue;
    // Select strictly the latest generation by manifest published_at / correlation_run_id (never combine generations!)
    let bestGenDir = null;
    let bestSortKey = "";
    for (const g of fs.readdirSync(genBase)) {
      const mFile = path.join(genBase, g, "manifest.json");
      if (!fs.existsSync(mFile)) continue;
      const mj = JSON.parse(fs.readFileSync(mFile, "utf8"));
      const sk = `${mj.published_at || ""}|${String(mj.correlation_run_id ?? 0).padStart(9, "0")}|${g}`;
      if (sk >= bestSortKey) {
        bestSortKey = sk;
        bestGenDir = path.join(genBase, g);
      }
    }
    if (!bestGenDir) continue;
    const sess = { session: s.session };
    const sessDir = bestGenDir;
    const measPath = path.join(sessDir, "measurements.parquet");
    if (!fs.existsSync(measPath)) continue;

    // Load stations JSON in this session
    const stationsDir = path.join(sessDir, "stations");
    const stationMap = new Map();
    if (fs.existsSync(stationsDir)) {
      for (const sf of fs.readdirSync(stationsDir).filter((f) => f.endsWith(".json"))) {
        const sj = JSON.parse(fs.readFileSync(path.join(stationsDir, sf), "utf8"));
        stationMap.set(Number(sj.station?.id ?? sf.match(/\d+/)?.[0]), sj);
      }
    }

    const pq = readParquet(measPath);
    const C = pq.columns;
    const nRows = pq.rows;
    for (let i = 0; i < nRows; i++) {
      if (C.quarantined?.[i]) continue;
      const refType = C.epoch_refers_to?.[i];
      // Enforce valid mid/start exposure semantics (refuse frame-arrival without offset)
      if (refType !== "exposure-mid" && refType !== "exposure-start") continue;
      const norad = C.correlation_object_norad_id?.[i];
      const stId = Number(C.station_id?.[i]);
      const stJson = stationMap.get(stId);
      if (!stJson) continue;

      if (norad !== null && norad !== undefined && norad > 0) {
        if (filterNorads && !filterNorads.has(Number(norad))) continue;
        const tIso = `${new Date(Number(C.t_utc[i] / 1000n)).toISOString().slice(0, 19)}.${String(C.t_utc[i] % 1000000n).padStart(6, "0")}Z`;
        if (isHeldForStudy(norad, "", tIso)) continue;
        let sessMap = byNorad.get(Number(norad));
        if (!sessMap) {
          sessMap = new Map();
          byNorad.set(Number(norad), sessMap);
        }
        const key = `${sess.session}|${stId}`;
        let bucket = sessMap.get(key);
        if (!bucket) {
          bucket = { session: sess.session, stationId: stId, stationJson: stJson, rows: [] };
          sessMap.set(key, bucket);
        }
        bucket.rows.push({
          measurement_client_uuid: C.measurement_client_uuid[i],
          track_id: C.track_id[i],
          station_id: stId,
          correlation_object_norad_id: Number(norad),
          correlation_unk_designation: null,
          t_utc: C.t_utc[i],
          ra_deg: C.ra_deg[i],
          dec_deg: C.dec_deg[i],
          sigma_ra_arcsec: C.sigma_ra_arcsec[i] ?? 20,
          sigma_dec_arcsec: C.sigma_dec_arcsec[i] ?? 20,
          epoch_refers_to: refType,
          quarantined: false,
          frame: C.frame?.[i] ?? "ICRS",
          bias_applied_ms: C.bias_applied_ms?.[i] ?? 0,
          snr: C.snr?.[i] ?? 10,
        });
      } else if (!filterNorads && sess.session >= "2026-11-01" && C.correlation_unk_designation?.[i]) {
        unkTracks.push({
          session: sess.session,
          stationId: stId,
          stationJson: stJson,
          unkId: C.correlation_unk_designation[i],
          track_id: C.track_id[i],
          t_utc: C.t_utc[i],
          ra_deg: C.ra_deg[i],
          dec_deg: C.dec_deg[i],
          sigma_ra_arcsec: C.sigma_ra_arcsec[i] ?? 20,
          sigma_dec_arcsec: C.sigma_dec_arcsec[i] ?? 20,
          epoch_refers_to: refType,
        });
      }
    }
  }

  return { byNorad, unkCount: unkTracks.length, unkTracks };
}

/**
 * Converts a station-night bucket through WASM `data-source/satnogs-optical-source` (`read_station_night`)
 * into verified $TDM, $EOO (per-observation uncertainty), $GST, and $PVN byte buffers!
 */
export async function convertBucketViaSatnogsSource(
  satnogsSourceHost,
  bucket,
  { minimumMeasurements = 3, minSigmaArcsec = 8 } = {}
) {
  const rows = [...bucket.rows].sort((a, b) => (a.t_utc < b.t_utc ? -1 : a.t_utc > b.t_utc ? 1 : 0));
  const station = bucket.stationJson;
  const iso = (us) =>
    `${new Date(Number(us / 1000n)).toISOString().slice(0, 19)}.${String(us % 1000000n).padStart(6, "0")}`;
  const REF = { "exposure-mid": "MIDDLE", "exposure-start": "START" };

  const tdm = new TDMT();
  tdm.CREATION_DATE = (station.generated_utc || "2026-11-08T00:00:00Z").replace(/Z$/, "");
  tdm.ORIGINATOR = "LIBRE_SPACE_FOUNDATION";
  const eooInputs = [];
  let seg = null;
  let key = "";
  const exposureSeconds = Number(station.station?.instrument?.exposure_s ?? 0);

  for (const r of rows) {
    const k = `${r.track_id}|${r.epoch_refers_to}`;
    if (k !== key) {
      seg = new TDMSegmentT();
      Object.assign(seg, {
        TIME_SYSTEM: "UTC",
        PARTICIPANT_1: `SATNOGS-OPTICAL-${String(r.station_id).padStart(4, "0")}`,
        PARTICIPANT_2: String(r.correlation_object_norad_id),
        MODE: "SEQUENTIAL",
        PATH: "2,1",
        ANGLE_TYPE: "RADEC",
        REFERENCE_FRAME: r.frame === "ICRS" ? "ICRF" : r.frame,
        TRACK_ID: String(r.track_id),
        INTEGRATION_REF: REF[r.epoch_refers_to] ?? "MIDDLE",
        INTEGRATION_INTERVAL: r.epoch_refers_to === "exposure-start" ? Math.max(0.1, exposureSeconds) : 0,
        DATA_QUALITY: "RAW",
      });
      tdm.SEGMENTS.push(seg);
      key = k;
    }
    const ep = iso(r.t_utc);
    seg.OBSERVATIONS.push(new TDMObservationT("ANGLE_1", ep, r.ra_deg), new TDMObservationT("ANGLE_2", ep, r.dec_deg));
    const e = Object.assign(new EOOT(), {
      ID: r.measurement_client_uuid,
      OB_TIME: ep,
      IMAGE_SET_ID: String(r.track_id),
      SENSOR_ID: String(r.station_id),
      ORIG_SENSOR_ID: station.station.name,
      NORAD_CAT_ID: r.correlation_object_norad_id,
      UCT: false,
      RA: r.ra_deg,
      DECLINATION: r.dec_deg,
      RA_UNC: Math.max(minSigmaArcsec, r.sigma_ra_arcsec) / 3600,
      DECLINATION_UNC: Math.max(minSigmaArcsec, r.sigma_dec_arcsec) / 3600,
      SENLAT: station.station.site.lat,
      SENLON: station.station.site.lon,
      SENALT: (station.station.site.height_m ?? 0) / 1000,
      TIMING_BIAS: (r.bias_applied_ms ?? 0) / 1000,
      EXP_DURATION: r.epoch_refers_to === "exposure-start" ? Math.max(0.1, exposureSeconds) : 0,
      SNR: r.snr ?? 10,
    });
    const b = new flatbuffers.Builder(512);
    EOO.finishEOOBuffer(b, e.pack(b));
    eooInputs.push({ portId: "measurements", typeRef: TYPES.EOO, payload: b.asUint8Array() });
  }

  const bTdm = new flatbuffers.Builder(Math.max(4096, rows.length * 128));
  TDM.finishTDMBuffer(bTdm, tdm.pack(bTdm));
  const cfgInputs =
    minimumMeasurements !== 3
      ? [{ portId: "config", typeRef: TYPES.MCFG, payload: encodeModuleConfig({ minimumMeasurements }) }]
      : [];
  const res = await satnogsSourceHost.invoke({
    methodId: "read_station_night",
    inputs: [{ portId: "angles", typeRef: TYPES.TDM, payload: bTdm.asUint8Array() }, ...eooInputs, ...cfgInputs],
  });
  if (res.statusCode !== 0) {
    throw new Error(`satnogs-optical-source refused: ${res.errorCode}: ${res.errorMessage}`);
  }
  const byPort = (p) => res.outputs.filter((o) => o.portId === p).map((o) => new Uint8Array(o.payload));
  return {
    tdms: byPort("observations"),
    eoos: byPort("uncertainty"),
    stations: byPort("stations"),
    provenance: byPort("provenance")[0],
  };
}

/**
 * Routes any open/public WGS-84 optical site-night (IAU CPS SCORE, Fink ZTF Palomar I41, or SeeSat-L IOD)
 * through WASM `data-source/satnogs-optical-source` (`read_station_night`) so WGS-84 geodetic -> ECEF
 * (`OBSERVER_X/Y/Z` + `$GST` + `$EOO` + `$TDM`) runs 100% inside WASM with zero JS geodetic physics.
 */
export async function convertGenericOpticalSiteNightViaSatnogsSource(
  satnogsSourceHost,
  {
    norad,
    stationIdNum,
    stationName,
    latDeg,
    lonDeg,
    altM = 0,
    obsList, // [{ ms, raDeg, decDeg, sigmaArcsec, trackId? }]
    minSigmaArcsec = 5,
    minimumMeasurements = 2,
  }
) {
  const sorted = [...obsList].sort((a, b) => a.ms - b.ms);
  // Deduplicate exact-millisecond observations
  const uniq = [];
  for (const o of sorted) {
    if (!uniq.length || Math.abs(o.ms - uniq.at(-1).ms) >= 5) uniq.push(o);
  }
  if (uniq.length < minimumMeasurements) {
    return { tdms: [], eoos: [], stations: [], stationKey: `SATNOGS-OPTICAL-${String(stationIdNum).padStart(4, "0")}` };
  }
  const bucket = {
    stationId: stationIdNum,
    stationJson: {
      generated_utc: "2026-11-08T00:00:00Z",
      station: {
        id: stationIdNum,
        name: stationName,
        site: { lat: latDeg, lon: lonDeg, height_m: altM },
        instrument: { exposure_s: 0 },
      },
    },
    rows: uniq.map((o, idx) => ({
      measurement_client_uuid: `${stationName}-${norad}-${o.ms}-${idx}`,
      track_id: o.trackId || `${stationName}-${new Date(o.ms).toISOString().slice(0, 10)}`,
      station_id: stationIdNum,
      correlation_object_norad_id: Number(norad),
      t_utc: BigInt(Math.round(o.ms * 1000)),
      ra_deg: o.raDeg,
      dec_deg: o.decDeg,
      sigma_ra_arcsec: o.sigmaArcsec ?? minSigmaArcsec,
      sigma_dec_arcsec: o.sigmaArcsec ?? minSigmaArcsec,
      epoch_refers_to: "exposure-mid",
      quarantined: false,
      frame: "ICRS",
      bias_applied_ms: 0,
      snr: 15,
    })),
  };
  const conv = await convertBucketViaSatnogsSource(satnogsSourceHost, bucket, {
    minimumMeasurements,
    minSigmaArcsec,
  });
  return {
    ...conv,
    stationKey: `SATNOGS-OPTICAL-${String(stationIdNum).padStart(4, "0")}`,
  };
}

/**
 * Loads IAU CPS SatHub SCORE open optical observations (`hac/iau-cps-score/observations-2026-09-01_2026-11-08.json`),
 * filtering out held satellites and discrepant smartphone outliers.
 */
export function loadIauScoreOptical({
  scoreFile = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/iau-cps-score/observations-2026-09-01_2026-11-08.json",
} = {}) {
  assertAllowedPath(scoreFile);
  if (!fs.existsSync(scoreFile)) return new Map();
  const data = JSON.parse(fs.readFileSync(scoreFile, "utf8"));
  const byNorad = new Map();
  for (const it of data.items ?? []) {
    const norad = Number(it.satellite_number);
    if (!(norad > 0) || it.potentially_discrepant) continue;
    if (isHeldForStudy(norad, it.satellite_name || "", it.obs_time_utc || "2026-11-08T00:00:00Z")) continue;
    if (!Number.isFinite(it.sat_ra_deg) || !Number.isFinite(it.sat_dec_deg)) continue;
    if (!Number.isFinite(it.obs_lat_deg) || !Number.isFinite(it.obs_long_deg)) continue;
    if (!byNorad.has(norad)) byNorad.set(norad, []);
    byNorad.get(norad).push({
      norad,
      name: it.satellite_name,
      epochIso: it.obs_time_utc,
      ms: utcMs(it.obs_time_utc),
      raDeg: it.sat_ra_deg,
      decDeg: it.sat_dec_deg,
      latDeg: it.obs_lat_deg,
      lonDeg: it.obs_long_deg,
      altM: it.obs_alt_m ?? 0,
      timeSigmaS: it.obs_time_uncert_sec ?? 0.2,
      sigmaArcsec: it.sigma_2_ra ? Math.sqrt(it.sigma_2_ra) * 3600 : 60,
      mag: it.apparent_mag,
      instrument: it.instrument,
    });
  }
  for (const arr of byNorad.values()) arr.sort((a, b) => a.ms - b.ms);
  return byNorad;
}

/**
 * Loads ZTF Fink Palomar (I41: 33.3563 N, -116.8648 E, 1712 m) sub-arcsecond tracklets across Sep-Nov 2026.
 * Also collapses same-exposure bead detections (`identical jd`) into exposure-mid astrometric sights (`1.5"`).
 */
export function loadFinkZtfTracklets({
  finkDir = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/fink-ztf-tracklets/2026",
} = {}) {
  assertAllowedPath(finkDir);
  if (!fs.existsSync(finkDir)) return [];
  const tracklets = new Map(); // trksub -> rows
  for (const f of fs.readdirSync(finkDir).filter((x) => x.endsWith(".json")).sort()) {
    const arr = JSON.parse(fs.readFileSync(path.join(finkDir, f), "utf8"));
    for (const r of arr) {
      const jd = Number(r["i:jd"]);
      const ra = Number(r["i:ra"]);
      const dec = Number(r["i:dec"]);
      const id = String(r["d:tracklet"] || "");
      if (!id || !Number.isFinite(jd) || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
      const ms = (jd - 2440587.5) * 86400000;
      if (!tracklets.has(id)) tracklets.set(id, []);
      tracklets.get(id).push({
        trackletId: id,
        jd,
        ms,
        epochIso: new Date(ms).toISOString(),
        raDeg: ra,
        decDeg: dec,
        mag: Number(r["i:magpsf"] ?? NaN),
        latDeg: 33.3563,
        lonDeg: -116.8648,
        altM: 1712.0,
        sigmaArcsec: 1.5,
      });
    }
  }
  for (const rows of tracklets.values()) rows.sort((a, b) => a.ms - b.ms);
  return [...tracklets.values()].filter((t) => t.length >= 2);
}

/**
 * Collapses each ZTF Fink tracklet's per-exposure streak beads into 1.5" Palomar (I41) midpoint sights (`$EOO` ready).
 */
export function collapseFinkZtfToExposureSights(tracklets) {
  const sights = [];
  for (const rows of tracklets) {
    const byJd = new Map();
    for (const r of rows) {
      const k = r.jd.toFixed(6);
      if (!byJd.has(k)) byJd.set(k, []);
      byJd.get(k).push(r);
    }
    for (const grp of byJd.values()) {
      let sx = 0, sy = 0, decSum = 0;
      for (const p of grp) {
        const rad = (p.raDeg * Math.PI) / 180;
        sx += Math.cos(rad);
        sy += Math.sin(rad);
        decSum += p.decDeg;
      }
      let raMean = (Math.atan2(sy, sx) * 180) / Math.PI;
      if (raMean < 0) raMean += 360;
      const decMean = decSum / grp.length;
      const first = grp[0];
      // Also record streak span in arcsec across the 30s exposure
      const dRa = ((grp.at(-1).raDeg - first.raDeg + 540) % 360) - 180;
      const spanArcsec = Math.hypot(dRa * Math.cos((decMean * Math.PI) / 180), grp.at(-1).decDeg - first.decDeg) * 3600;
      sights.push({
        trackletId: first.trackletId,
        jd: first.jd,
        ms: first.ms,
        epochIso: first.epochIso,
        raDeg: raMean,
        decDeg: decMean,
        beads: grp.length,
        streakSpanArcsec: spanArcsec,
        latDeg: 33.3563,
        lonDeg: -116.8648,
        altM: 1712.0,
        sigmaArcsec: 1.5,
      });
    }
  }
  return sights.sort((a, b) => a.ms - b.ms);
}

/**
 * Loads SeeSat-L positional IOD observations (epochCode === 5 J2000/ICRF) from `/opt/data/sdn-archive/hac/seesat-l`
 * strictly for observers who explicitly state WGS-84 coordinates in their SeeSat-L messages.
 * License note (`licenses.json`): `reproduce: "no"` — used strictly for study accuracy benchmarking and
 * independent cross-network validation of open SatNOGS Optical `mTle = 0` fits; NEVER redistributed in catalog.ocm.stream!
 */
export function loadSeeSatLOptical({
  seesatDir = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive") + "/hac/seesat-l",
  months = ["Sep-2026", "Oct-2026", "Nov-2026"],
  minIso = "2026-09-15T00:00:00Z",
  maxIso = "2026-11-08T23:59:59.999Z",
} = {}) {
  assertAllowedPath(seesatDir);
  const sitesByCode = new Map();
  const rawObs = [];

  for (const month of months) {
    const mDir = path.join(seesatDir, month);
    if (!fs.existsSync(mDir)) continue;
    for (const f of fs.readdirSync(mDir).filter((x) => /^\d{4}\.html$/.test(x)).sort()) {
      const html = fs.readFileSync(path.join(mDir, f), "utf8");
      const txt = messageText(html);
      for (const st of statedSites(txt)) {
        sitesByCode.set(st.station, st);
      }
      for (const line of txt.split(/\r?\n/)) {
        const parsed = parseIod(line);
        if (!parsed || parsed.raDeg === null || parsed.decDeg === null) continue;
        if (parsed.epochCode !== 5) continue; // J2000 / ICRF only
        if (parsed.time < minIso || parsed.time > maxIso) continue;
        if (!(parsed.norad > 0) || isHeldForStudy(parsed.norad, "", parsed.time)) continue;
        rawObs.push(parsed);
      }
    }
  }

  const byNorad = new Map();
  const seen = new Set();
  for (const o of rawObs) {
    const site = sitesByCode.get(o.station);
    if (!site) continue; // Strictly require observer-stated WGS-84 coordinates
    const ms = utcMs(o.time);
    if (!Number.isFinite(ms)) continue;
    const dedupKey = `${o.norad}|${o.station}|${ms}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    if (!byNorad.has(o.norad)) byNorad.set(o.norad, []);
    byNorad.get(o.norad).push({
      norad: o.norad,
      cospar: o.cospar,
      station: o.station,
      epochIso: o.time,
      ms,
      raDeg: o.raDeg,
      decDeg: o.decDeg,
      sigmaArcsec: o.sigmaDeg ? Math.max(5, o.sigmaDeg * 3600) : 18,
      timeSigmaS: o.timeSigmaSeconds ? Math.max(0.02, o.timeSigmaSeconds) : 0.08,
      latDeg: site.latDeg,
      lonDeg: site.lonDeg,
      altM: site.heightM ?? 0,
    });
  }
  for (const arr of byNorad.values()) arr.sort((a, b) => a.ms - b.ms);
  return { byNorad, sitesByCode };
}

/**
 * Selects the latest dense multi-night optical cluster (`>= 2` distinct nights with consecutive
 * night-to-night gaps `<= maxGapDays` and total span `<= maxSpanDays`, capped at `maxNights`)
 * so Gooding / far-sight IOD and `angles-only-od` solve clean integer revolution counts without
 * multi-week unmodeled drift.
 */
export function selectBestDenseNightCluster(
  items,
  getNightIsoDate,
  { maxGapDays = 4.0, maxSpanDays = 7.5, maxNights = 4, minObservationsPerNight = 2 } = {}
) {
  if (!items || !items.length) return [];
  const countsByNight = new Map();
  for (const it of items) {
    const d = getNightIsoDate(it);
    const add = Array.isArray(it.rows) ? it.rows.length : Array.isArray(it.list) ? it.list.length : 1;
    countsByNight.set(d, (countsByNight.get(d) || 0) + add);
  }
  const uNights = [...countsByNight.entries()]
    .filter(([, cnt]) => cnt >= minObservationsPerNight)
    .map(([d]) => d)
    .sort();
  if (uNights.length < 2) return [];

  const clusters = [];
  let cur = [uNights[0]];
  for (let i = 1; i < uNights.length; i++) {
    const gapDays = (Date.parse(`${uNights[i]}T00:00:00Z`) - Date.parse(`${uNights[i - 1]}T00:00:00Z`)) / 86400e3;
    if (gapDays <= maxGapDays + 1e-6) {
      cur.push(uNights[i]);
    } else {
      if (cur.length >= 2) clusters.push(cur);
      cur = [uNights[i]];
    }
  }
  if (cur.length >= 2) clusters.push(cur);
  if (!clusters.length) return [];

  // Prefer the latest cluster; if the very last cluster has only 2 nights and an earlier cluster within 12 days has >=3 nights, prefer >=3 nights
  let chosen = clusters.at(-1);
  if (chosen.length === 2 && clusters.length >= 2) {
    const prev = clusters.at(-2);
    const ageDiffDays = (Date.parse(`${chosen.at(-1)}T00:00:00Z`) - Date.parse(`${prev.at(-1)}T00:00:00Z`)) / 86400e3;
    if (prev.length >= 3 && ageDiffDays <= 14) chosen = prev;
  }

  let sliced = chosen.slice(-maxNights);
  while (
    sliced.length > 2 &&
    (Date.parse(`${sliced.at(-1)}T00:00:00Z`) - Date.parse(`${sliced[0]}T00:00:00Z`)) / 86400e3 > maxSpanDays
  ) {
    sliced = sliced.slice(1);
  }
  const keepSet = new Set(sliced);
  return items.filter((it) => keepSet.has(getNightIsoDate(it)));
}
