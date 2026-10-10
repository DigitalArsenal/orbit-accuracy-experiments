// JB2008 drivers as a forecaster held them at an information cutoff t0
// (00:00 UTC of day D), PLAN.md section 2 "Operational": SET's daily indices
// and hourly DTC for the days before D (the definitive values stand in for
// those released then), SWPC's RSGA forecasts for D..D+2 (F10 scaled by the
// predicted over the observed Penticton flux; DTC from the predicted Ap by
// config.drivers.operational.dtcFromAp), the last value held after, and the
// 81-day centred values recomputed from the daily values as known at t0.
// Selection and re-framing of published rows, and that statistical mapping;
// the density model that reads them is the module's.
//
// The RSGA reader follows E7's draft harness (orbit-accuracy-experiments
// branch task/e7-full-force-20261009, harness/cutoff-environment.mjs); it
// moves to the harness when E7 lands.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { config, DAY_MS, dayMs, isoDay, setIndices } from './common.mjs';

// ── NOAA SWPC Report of Solar-Geophysical Activity (issued 22:00 UTC) ──
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseRsga(text) {
  const issued = /:Issued:\s+(\d{4})\s+(\w{3})\s+(\d+)\s+(\d{2})(\d{2})\s+UTC/.exec(text);
  if (!issued) return null;
  const year = Number(issued[1]);
  const issuedMs = Date.UTC(year, MONTHS[issued[2]], Number(issued[3]), Number(issued[4]), Number(issued[5]));
  const dateMs = (d, m) => {
    let t = Date.UTC(year, MONTHS[m], Number(d));
    if (t - issuedMs > 200 * DAY_MS) t = Date.UTC(year - 1, MONTHS[m], Number(d));
    if (issuedMs - t > 200 * DAY_MS) t = Date.UTC(year + 1, MONTHS[m], Number(d));
    return t;
  };
  const flux = text.slice(text.indexOf('10.7 cm Flux'));
  const fObs = /Observed\s+(\d+)\s+(\w{3})\s+(\d+)/.exec(flux);
  const fPred = /Predicted\s+(\d+)\s+(\w{3})-(\d+)\s+(\w{3})\s+(\d+)\/(\d+)\/(\d+)/.exec(flux);
  const geo = text.slice(text.indexOf('Geomagnetic A Indices'));
  const aPred = /Predicted Afr\/Ap\s+(\d+)\s+(\w{3})-(\d+)\s+(\w{3})\s+(\d+)\/(\d+)-(\d+)\/(\d+)-(\d+)\/(\d+)/.exec(geo);
  if (!fObs || !fPred || !aPred) return null;
  const p0 = dateMs(fPred[1], fPred[2]), a0 = dateMs(aPred[1], aPred[2]);
  return {
    issuedMs,
    observedF107: { day: dateMs(fObs[1], fObs[2]), value: Number(fObs[3]) },
    predictedF107: [5, 6, 7].map((k, i) => ({ day: p0 + i * DAY_MS, value: Number(fPred[k]) })),
    predictedAp: [6, 8, 10].map((k, i) => ({ day: a0 + i * DAY_MS, value: Number(aPred[k]) })),
  };
}
let rsgaCache = null;
export function rsga() {
  if (rsgaCache) return rsgaCache;
  const reports = [], files = {};
  for (const src of config.inputs.rsga) {
    let dir = src;
    if (src.endsWith('.tar.gz')) {
      dir = path.join(repoRoot, 'runs', 'cache', 'e8-rsga', path.basename(src, '.tar.gz'));
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); execFileSync('tar', ['-xzf', src, '-C', dir]); }
      files[path.basename(src)] = sha256(fs.readFileSync(src));
    }
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /RSGA\.txt$/.test(e.name) ? [path.join(d, e.name)] : []));
    for (const f of walk(dir)) {
      const text = fs.readFileSync(f, 'latin1');
      if (!src.endsWith('.tar.gz')) files[path.basename(f)] = sha256(Buffer.from(text, 'latin1'));
      const r = parseRsga(text);
      if (r) reports.push(r);
    }
  }
  reports.sort((a, b) => a.issuedMs - b.issuedMs);
  rsgaCache = { reports, files };
  return rsgaCache;
}

// The daily series as known at t0 (F10, S10, M10, Y10 by day, ms keys) and
// the daily DTC (K) for D.. from the RSGA issued last before t0.
function knownAt(t0) {
  const D = Math.floor(t0 / DAY_MS) * DAY_MS;
  const { sol } = setIndices();
  const report = rsga().reports.filter((r) => r.issuedMs < t0).at(-1);
  if (!report || t0 - report.issuedMs > 3 * DAY_MS) throw new Error(`no RSGA issued in the 3 days before ${isoDay(t0)}`);
  const last = sol.get(isoDay(D - DAY_MS));
  if (!last) throw new Error(`no SET row for ${isoDay(D - DAY_MS)}`);
  const setObs = sol.get(isoDay(report.observedF107.day));
  const scale = setObs ? setObs.F10 / report.observedF107.value : last.F10 / report.observedF107.value;
  const f10 = (t) => {
    const p = report.predictedF107.filter((x) => x.day <= t).at(-1);
    return p && p.day >= D ? p.value * scale : last.F10;
  };
  const m = config.drivers.operational.dtcFromAp;
  const dtcDay = (t) => {
    const a = report.predictedAp.filter((x) => x.day <= t).at(-1) ?? report.predictedAp[0];
    return m.intercept + m.sqrtApSlope * Math.sqrt(a.value);
  };
  const value = (t, key) => {
    if (t < D) { const r = sol.get(isoDay(t)); if (!r) throw new Error(`no SET row for ${isoDay(t)}`); return r[key]; }
    return key === 'F10' ? f10(t) : last[key];
  };
  return { D, value, dtcDay, report: { issued: new Date(report.issuedMs).toISOString(), predictedF107: report.predictedF107.map((x) => [isoDay(x.day), x.value]), predictedAp: report.predictedAp.map((x) => [isoDay(x.day), x.value]) } };
}

// JB2008_INDICES rows for the days from..to (ISO, inclusive) as known at t0;
// DTC_HOURLY_K edited by add(tMs) when given (a correction's offset).
export function operationalJb2008Rows(t0, from, to, add = null) {
  const k = knownAt(t0);
  const { dtc } = setIndices();
  const rows = [];
  const keys = [['F10', 'F10_CENTRED_81'], ['S10', 'S10_CENTRED_81'], ['M10', 'M10_CENTRED_81'], ['Y10', 'Y10_CENTRED_81']];
  for (let t = dayMs(from); t <= dayMs(to); t += DAY_MS) {
    const row = { DATE: isoDay(t) };
    for (const [key, centred] of keys) {
      row[key] = k.value(t, key);
      let s = 0;
      for (let j = -40; j <= 40; ++j) s += k.value(t + j * DAY_MS, key);
      row[centred] = s / 81;
    }
    const hourly = t < k.D ? dtc.get(isoDay(t)) : Array(24).fill(k.dtcDay(t));
    if (!hourly) throw new Error(`no DTCFILE row for ${isoDay(t)}`);
    row.DTC_HOURLY_K = hourly.map((v, h) => (add ? v + add(t + h * 3600000) : v));
    row.SOURCE_FLAGS = t < k.D ? 'released' : 'forecast';
    rows.push(row);
  }
  return rows;
}
export const operationalReport = (t0) => knownAt(t0).report;
