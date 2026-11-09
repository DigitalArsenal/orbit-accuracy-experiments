import fs from "node:fs";
import * as flatbuffers from "flatbuffers";
import { SPW, SPWT } from "spacedatastandards.org/lib/js/SPW/SPW.js";
import { F107DataType } from "spacedatastandards.org/lib/js/SPW/F107DataType.js";
import { assertAllowedPath } from "./hold-gate.mjs";
import { forecastSpwBartelsWasm } from "./tle-upgrades-host.mjs";

const DAY_MS = 86400000;
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const dateToMjd = (dateStr) => Math.round(Date.parse(`${dateStr}T00:00:00Z`) / DAY_MS) + 40587;

// Force scalar defaults on SPW fields whose valid values include 0 (OBS = 0, AP_AVG = 0)
const origAddF107Type = SPW.addF107DataType;
SPW.addF107DataType = (b, v) => { const w = b.force_defaults; b.forceDefaults(true); origAddF107Type(b, v); b.forceDefaults(w); };
const origAddApAvg = SPW.addApAvg;
SPW.addApAvg = (b, v) => { const w = b.force_defaults; b.forceDefaults(true); origAddApAvg(b, v); b.forceDefaults(w); };

function findLatestDatedSubdir(parentDir, cutoffDate) {
  if (!fs.existsSync(parentDir)) return null;
  let bestDt = null;
  for (const name of fs.readdirSync(parentDir)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) continue;
    if (name <= cutoffDate && (bestDt === null || name > bestDt)) {
      bestDt = name;
    }
  }
  return bestDt ? { dt: bestDt, dir: `${parentDir}/${bestDt}` } : null;
}

function parseGfzTableInto(filePath, cutoffDate, raw) {
  if (!fs.existsSync(filePath)) return;
  assertAllowedPath(filePath);
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 27) continue;
    const y = Number(parts[0]);
    if (y < 2026) continue;
    const m = parts[1].padStart(2, "0");
    const d = parts[2].padStart(2, "0");
    const date = `${y}-${m}-${d}`;
    if (date > cutoffDate) continue;
    // NOTE: Never read parts[24] (sunspot number, CC BY-NC 4.0). Only Kp/ap/Ap and F10.7 (CC BY 4.0).
    const ap3h = parts.slice(15, 23).map(Number);
    let ap = Number(parts[23]);
    if (ap < 0) {
      const validAp = ap3h.filter((v) => v >= 0);
      if (validAp.length > 0) ap = validAp.reduce((a, b) => a + b, 0) / validAp.length;
    }
    const f107 = Number(parts[25]);
    const prev = raw.get(date);
    if (f107 > 0 && ap >= 0) {
      raw.set(date, {
        f107,
        ap: Math.round(ap),
        ap3h: ap3h.every((v) => v >= 0) ? ap3h : (prev?.ap3h ?? null),
        dataType: date < cutoffDate ? F107DataType.OBS : F107DataType.PRD,
      });
    } else if (ap >= 0 && prev) {
      raw.set(date, { ...prev, ap: Math.round(ap) });
    }
  }
}

/**
 * Builds a complete, strictly causal daily $SPW table from pure public HAC archives:
 * 1. GFZ Potsdam historical archive (`Kp_ap_Ap_SN_F107_since_1932.txt` up to 2026-10-09, CC BY 4.0 columns only)
 *    ALWAYS loaded first so historical months (Jan-Oct 2026) have exact observed F10.7 & Ap.
 * 2. Latest causal GFZ nowcast (`hac/gfz-kp/2026/<dt <= cutoffDate>/Kp_ap_Ap_SN_F107_nowcast.txt`)
 * 3. Latest causal NOAA SWPC daily-solar-indices.txt, daily-geomagnetic-indices.txt, and SGARF 3-day forecast
 * 4. C++17 WebAssembly causal 27-day Bartels solar-rotation recurrence + AR(1) relaxation forecaster
 *    (`tleup_forecast_spw_bartels`) + exact 81-day centered F107_OBS_CENTER81.
 *
 * Zero held / operator-capture files are ever accessed.
 */
export function buildSpaceWeather({
  archiveRoot = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive"),
  firstDate = "2026-09-25",
  lastDate = "2026-12-12",
  cutoffDate = "2026-11-08",
} = {}) {
  // Map of YYYY-MM-DD -> { f107, ap, ap3h, dataType }
  const raw = new Map();
  const sgarf = new Map();

  // 1a. ALWAYS load GFZ since-1932 baseline archive first (covers 2026-01-01 .. 2026-10-09)
  parseGfzTableInto(`${archiveRoot}/hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt`, cutoffDate, raw);

  // 1b. Overlay latest causal GFZ nowcast directory strictly <= cutoffDate
  const gfzLatest = findLatestDatedSubdir(`${archiveRoot}/hac/gfz-kp/2026`, cutoffDate);
  if (gfzLatest) {
    parseGfzTableInto(`${gfzLatest.dir}/Kp_ap_Ap_SN_F107_nowcast.txt`, cutoffDate, raw);
  }

  // 2. Overlay latest causal NOAA SWPC directory strictly <= cutoffDate
  const swpcLatest = findLatestDatedSubdir(`${archiveRoot}/hac/noaa-swpc/2026`, cutoffDate);
  if (swpcLatest) {
    const swpcDir = swpcLatest.dir;
    const solarTxt = `${swpcDir}/daily-solar-indices.txt`;
    if (fs.existsSync(solarTxt)) {
      assertAllowedPath(solarTxt);
      for (const line of fs.readFileSync(solarTxt, "utf8").split("\n")) {
        const m = /^(\d{4})\s+(\d{2})\s+(\d{2})\s+(\d+(?:\.\d+)?)/.exec(line.trim());
        if (!m) continue;
        const date = `${m[1]}-${m[2]}-${m[3]}`;
        const f107 = Number(m[4]);
        if (f107 > 0 && date <= cutoffDate) {
          const prev = raw.get(date) ?? { f107, ap: 10, ap3h: null, dataType: F107DataType.OBS };
          raw.set(date, { ...prev, f107, dataType: date < cutoffDate ? F107DataType.OBS : F107DataType.PRD });
        }
      }
    }

    const geoTxt = `${swpcDir}/daily-geomagnetic-indices.txt`;
    if (fs.existsSync(geoTxt)) {
      assertAllowedPath(geoTxt);
      for (const line of fs.readFileSync(geoTxt, "utf8").split("\n")) {
        if (!/^\d{4}\s+\d{2}\s+\d{2}/.test(line.trim())) continue;
        const date = `${line.slice(0, 4).trim()}-${line.slice(5, 7).trim().padStart(2, "0")}-${line.slice(8, 10).trim().padStart(2, "0")}`;
        if (date > cutoffDate) continue;
        const tailTokens = line.slice(58).trim().split(/\s+/);
        const ap = Number(tailTokens[0]);
        if (Number.isFinite(ap) && ap >= 0) {
          const prev = raw.get(date) ?? {
            f107: 127,
            ap: Math.round(ap),
            ap3h: null,
            dataType: date < cutoffDate ? F107DataType.OBS : F107DataType.PRD,
          };
          raw.set(date, { ...prev, ap: Math.round(ap) });
        }
      }
    }

    // 3. Joint USAF/NOAA SGARF 3-day forecast (only if issued within 2 days of cutoffDate)
    const lagDays = Math.round((Date.parse(`${cutoffDate}T00:00:00Z`) - Date.parse(`${swpcLatest.dt}T00:00:00Z`)) / DAY_MS);
    const sgarfPath = `${swpcDir}/sgarf.txt`;
    if (lagDays <= 2 && fs.existsSync(sgarfPath)) {
      assertAllowedPath(sgarfPath);
      const txt = fs.readFileSync(sgarfPath, "utf8");
      const fm = /Predicted\s+(\d{2})\s+([A-Za-z]{3})-\d{2}\s+[A-Za-z]{3}\s+(\d+)\/(\d+)\/(\d+)/.exec(txt);
      const am = /Predicted Afr\/Ap\s+\d{2}\s+[A-Za-z]{3}-\d{2}\s+[A-Za-z]{3}\s+\d+\/(\d+)-\d+\/(\d+)-\d+\/(\d+)/.exec(txt);
      if (fm && am) {
        const monthMap = {
          Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
          Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
        };
        const mm = monthMap[fm[2]] ?? swpcLatest.dt.slice(5, 7);
        const day0Ms = Date.parse(`2026-${mm}-${fm[1]}T00:00:00Z`);
        const fVals = [Number(fm[3]), Number(fm[4]), Number(fm[5])];
        const aVals = [Number(am[1]), Number(am[2]), Number(am[3])];
        for (let i = 0; i < 3; i++) {
          const dStr = isoDate(day0Ms + i * DAY_MS);
          if (dStr >= cutoffDate) {
            sgarf.set(dStr, { f107: fVals[i], ap: aVals[i] });
          }
        }
      }
    }
  }

  // 4. Invoke C++17 WASM causal 27-day Bartels solar-rotation + AR(1) forecaster over 2026-03-01 .. 2027-02-05
  const obsDates = [...raw.keys()].sort();
  const obsMjd = new Int32Array(obsDates.length);
  const obsF107 = new Float64Array(obsDates.length);
  const obsAp = new Float64Array(obsDates.length);
  for (let i = 0; i < obsDates.length; i++) {
    const dt = obsDates[i];
    const e = raw.get(dt);
    obsMjd[i] = dateToMjd(dt);
    obsF107[i] = e.f107;
    obsAp[i] = e.ap;
  }

  const sgDates = [...sgarf.keys()].sort();
  const sgarfMjd = new Int32Array(sgDates.length);
  const sgarfF107 = new Float64Array(sgDates.length);
  const sgarfAp = new Float64Array(sgDates.length);
  for (let i = 0; i < sgDates.length; i++) {
    const dt = sgDates[i];
    const s = sgarf.get(dt);
    sgarfMjd[i] = dateToMjd(dt);
    sgarfF107[i] = s.f107;
    sgarfAp[i] = s.ap;
  }

  const gridStartDate = firstDate < "2026-03-01" ? firstDate : "2026-03-01";
  const gridStopDate = lastDate > "2027-02-05" ? lastDate : "2027-02-05";
  const gridStartMjd = dateToMjd(gridStartDate);
  const gridStopMjd = dateToMjd(gridStopDate);
  const gridCount = gridStopMjd - gridStartMjd + 1;
  const cutoffMjd = dateToMjd(cutoffDate);

  const { outF107, outF107C81, outAp, outIsPrd } = forecastSpwBartelsWasm({
    obsMjd,
    obsF107,
    obsAp,
    sgarfMjd,
    sgarfF107,
    sgarfAp,
    cutoffMjd,
    gridStartMjd,
    gridCount,
  });

  const gridStartMs = Date.parse(`${gridStartDate}T00:00:00Z`);
  const fullRows = [];
  const rows = [];
  const parts = [];

  for (let k = 0; k < gridCount; k++) {
    const date = isoDate(gridStartMs + k * DAY_MS);
    const f107 = Math.fround(outF107[k]);
    const f107Center81 = Math.fround(outF107C81[k]);
    const ap = Math.max(0, Math.round(outAp[k]));
    const rawEntry = raw.get(date);
    const ap3h = date <= cutoffDate && rawEntry?.ap3h ? rawEntry.ap3h : null;
    const dataType = outIsPrd[k] ? F107DataType.PRD : F107DataType.OBS;

    const rowObj = { date, f107, f107Center81, ap, ap3h, dataType };
    fullRows.push(rowObj);

    if (date < firstDate || date > lastDate) continue;
    const spwProps = {
      DATE: date,
      F107_OBS: f107,
      F107_OBS_CENTER81: f107Center81,
      AP_AVG: ap,
      F107_DATA_TYPE: dataType,
    };
    if (ap3h) {
      [
        spwProps.AP_1, spwProps.AP_2, spwProps.AP_3, spwProps.AP_4,
        spwProps.AP_5, spwProps.AP_6, spwProps.AP_7, spwProps.AP_8,
      ] = ap3h;
    }
    const spw = Object.assign(new SPWT(), spwProps);
    const b = new flatbuffers.Builder(256);
    SPW.finishSizePrefixedSPWBuffer(b, spw.pack(b));
    parts.push(b.asUint8Array().slice());
    rows.push(rowObj);
  }

  return {
    bytes: Buffer.concat(parts),
    rows,
    fullRows,
    byDate: new Map(rows.map((r) => [r.date, r])),
  };
}
