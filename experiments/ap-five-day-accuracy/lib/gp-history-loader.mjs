import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { assertAllowedPath, isHeldForStudy } from "./hold-gate.mjs";

export function jdOf(text) {
  const m = /^(\d+)-(\d+)-(\d+)T(\d+):(\d+):([\d.]+)/.exec(text);
  if (!m) return null;
  const whole = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 2440587.5;
  const frac = (+m[4] * 3600 + +m[5] * 60 + +m[6]) / 86400;
  return { whole, frac };
}

export function isoFromJd(whole, frac) {
  // Reconstruct microsecond-accurate ISO string YYYY-MM-DDTHH:MM:SS.ffffff
  let totalDays = whole - 2440587.5 + frac;
  let dayInt = Math.floor(totalDays);
  let dayFrac = totalDays - dayInt;
  let totalUs = Math.round(dayFrac * 86400e6);
  if (totalUs >= 86400000000) {
    dayInt += 1;
    totalUs -= 86400000000;
  } else if (totalUs < 0) {
    dayInt -= 1;
    totalUs += 86400000000;
  }
  const dateStr = new Date(dayInt * 86400000).toISOString().slice(0, 10);
  const us = totalUs % 1000000;
  const totalSec = Math.floor(totalUs / 1000000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return (
    `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:` +
    `${String(s).padStart(2, "0")}.${String(us).padStart(6, "0")}`
  );
}

export function parseGpRecord(r) {
  const jd = jdOf(r.EPOCH);
  if (!jd) return null;
  return {
    norad: Number(r.NORAD_CAT_ID) || 0,
    epoch: r.EPOCH,
    whole: jd.whole,
    frac: jd.frac,
    d70: jd.whole - 2440587.5 + jd.frac,
    n: Number(r.MEAN_MOTION),
    e: Number(r.ECCENTRICITY),
    inc: Number(r.INCLINATION),
    raan: Number(r.RA_OF_ASC_NODE),
    argp: Number(r.ARG_OF_PERICENTER),
    ma: Number(r.MEAN_ANOMALY),
    bstar: Number(r.BSTAR) || 0,
    ndot: Number(r.MEAN_MOTION_DOT) || 0,
    nddot: Number(r.MEAN_MOTION_DDOT) || 0,
    gpId: Number(r.GP_ID) || 0,
    name: r.OBJECT_NAME || null,
    objectId: r.OBJECT_ID || null,
    objectType: r.OBJECT_TYPE || null,
  };
}

/**
 * Loads and deduplicates historical GP/TLE rows from /opt/data/sdn-archive/spacetrack/{gp,gp_history}.
 * Supports causal cutoff (cutoffIso) so we can run both:
 *  - Full current-day catalog (cutoffIso = "2026-11-08T23:59:59.999999")
 *  - Strictly causal held-out forecast validation (cutoffIso = "2026-11-07T23:59:59.999999")
 */
export function loadGpHistory({
  archiveRoot = (process.env.SDN_ARCHIVE_ROOT || "/opt/data/sdn-archive"),
  startDay = "2026-11-01",
  cutoffIso = "2026-11-08T23:59:59.999999",
  windowDays = 7.0,
  satcatRegistry = null,
  noradAllowlist = null,
} = {}) {
  assertAllowedPath(archiveRoot);
  const cutoffDate = cutoffIso.slice(0, 10);
  const cutoffJd = jdOf(cutoffIso.replace("Z", ""));
  const cutoffDays1970 = cutoffJd.whole - 2440587.5 + cutoffJd.frac;

  // Map<number, Array<CompactTle>>
  const rawByNorad = new Map();

  const ingestArray = (arr, isDailySnapshot = false) => {
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      const norad = Number(r.NORAD_CAT_ID);
      if (!Number.isInteger(norad) || norad <= 0) continue;
      if (noradAllowlist && !noradAllowlist.has(norad)) continue;
      const sc = satcatRegistry?.get(norad);
      const objName = r.OBJECT_NAME || sc?.name || "";
      if (isHeldForStudy(norad, objName, cutoffDate)) continue;
      if (r.DECAY_DATE && r.DECAY_DATE <= cutoffDate) continue;
      if (sc?.decayDate && sc.decayDate <= cutoffDate) continue;
      // Enforce causal creation-date and epoch gates
      if (!isDailySnapshot && r.CREATION_DATE && r.CREATION_DATE > cutoffIso.slice(0, 19)) continue;
      const ep = r.EPOCH;
      if (!ep || ep > cutoffIso) continue;
      const n = Number(r.MEAN_MOTION);
      const e = Number(r.ECCENTRICITY);
      if (!(n > 0.05) || !(e >= 0.0 && e < 0.995)) continue;

      const jd = jdOf(ep);
      if (!jd) continue;
      const d70 = jd.whole - 2440587.5 + jd.frac;
      if (d70 > cutoffDays1970 + 1e-9) continue;
      if (d70 < cutoffDays1970 - (windowDays + 3.0)) continue;

      const item = {
        norad,
        epoch: ep,
        whole: jd.whole,
        frac: jd.frac,
        d70,
        n,
        e,
        inc: Number(r.INCLINATION),
        raan: Number(r.RA_OF_ASC_NODE),
        argp: Number(r.ARG_OF_PERICENTER),
        ma: Number(r.MEAN_ANOMALY),
        bstar: Number(r.BSTAR) || 0,
        ndot: Number(r.MEAN_MOTION_DOT) || 0,
        nddot: Number(r.MEAN_MOTION_DDOT) || 0,
        gpId: Number(r.GP_ID) || 0,
        name: r.OBJECT_NAME || null,
        objectId: r.OBJECT_ID || null,
        objectType: r.OBJECT_TYPE || null,
      };
      let list = rawByNorad.get(norad);
      if (!list) {
        list = [];
        rawByNorad.set(norad, list);
      }
      list.push(item);
    }
  };

  // 1. Daily GP snapshots in [startDay .. cutoffDate]
  const gpDir = `${archiveRoot}/spacetrack/gp/2026`;
  if (fs.existsSync(gpDir)) {
    const gpFiles = fs.readdirSync(gpDir)
      .filter((f) => f.endsWith(".json.gz") && f.slice(0, 10) >= startDay && f.slice(0, 10) <= cutoffDate)
      .sort();
    for (const f of gpFiles) {
      const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(gpDir, f))).toString("utf8"));
      ingestArray(arr, true);
    }
  }

  // 2. High-cadence gp_history/by-creation chunks in [startDay .. cutoffDate]
  const histDir = `${archiveRoot}/spacetrack/gp_history/by-creation/2026`;
  if (fs.existsSync(histDir)) {
    const histFiles = fs.readdirSync(histDir)
      .filter((f) => f.endsWith(".json.gz") && f.slice(0, 10) >= startDay && f.slice(0, 10) <= cutoffDate)
      .sort();
    for (const f of histFiles) {
      const arr = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(histDir, f))).toString("utf8"));
      ingestArray(arr, false);
    }
  }

  // 3. Deduplicate and trim per object to [latest.d70 - windowDays, latest.d70]
  const objects = [];
  for (const [norad, list] of rawByNorad.entries()) {
    list.sort((a, b) => a.d70 - b.d70 || a.gpId - b.gpId);
    const dedup = [];
    for (const item of list) {
      if (dedup.length > 0 && Math.abs(item.d70 - dedup[dedup.length - 1].d70) * 86400.0 < 60.0) {
        // Same TLE epoch within 60 s: keep higher gpId
        if (item.gpId >= dedup[dedup.length - 1].gpId) {
          dedup[dedup.length - 1] = item;
        }
      } else {
        dedup.push(item);
      }
    }
    const latest = dedup[dedup.length - 1];
    // Discard stale objects whose latest TLE is more than 30 days old (if any slipped in)
    if (cutoffDays1970 - latest.d70 > 30.0) continue;
    const minD70 = latest.d70 - windowDays;
    const trimmed = dedup.filter((t) => t.d70 >= minD70 - 1e-9);
    objects.push({
      norad,
      name: latest.name || satcatRegistry?.get(norad)?.name || `SAT-${norad}`,
      objectId: latest.objectId || satcatRegistry?.get(norad)?.intlDes || "",
      objectType: latest.objectType || satcatRegistry?.get(norad)?.objectType || "UNKNOWN",
      tles: trimmed,
    });
  }

  objects.sort((a, b) => a.norad - b.norad);
  return objects;
}
