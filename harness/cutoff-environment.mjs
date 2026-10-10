// Environment rows as a forecaster held them at an information cutoff: the
// Earth orientation, JB2008 drivers and daily space weather released by then,
// and, after the last released value, the published forecast or the last
// value held. Selection and re-framing of published rows only; the models
// that read them are the modules'.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from './modules.mjs';

const DAY_MS = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms) => Math.floor(ms / DAY_MS) * DAY_MS;
const mjdOf = (ms) => Math.floor(ms / DAY_MS) + 40587;

// ── Earth orientation ──
// records: [{mjd, row}] (harness/eop.mjs). Rows for MJD <= the cutoff's MJD
// - latencyDays are released; later days repeat the last released row.
export function releasedEopRecords(records, cutoffMs, latencyDays, fromMjd, toMjd) {
  const last = mjdOf(cutoffMs) - latencyDays;
  const known = records.filter((r) => r.mjd >= fromMjd && r.mjd <= Math.min(toMjd, last));
  const base = records.filter((r) => r.mjd <= last).at(-1);
  if (!base) throw new Error(`no EOP row released by MJD ${last}`);
  const out = [...known];
  for (let mjd = Math.max(fromMjd, last + 1); mjd <= toMjd; ++mjd) {
    const row = Object.assign(Object.create(Object.getPrototypeOf(base.row)), base.row, { MJD: mjd, DATE: `${isoDay((mjd - 40587) * DAY_MS)}T00:00:00Z` });
    out.push({ mjd, row, persisted: true });
  }
  return out;
}

// ── JB2008 (SET) ──
// SET's public files carry a day `latencyDays` after it. Rows for the days
// [fromMs, toMs] as released at cutoffMs: the published rows up to the last
// released day (jb2008Rows of harness/full-force.mjs), then that day's row
// repeated, its hourly DTC held at its last hour.
export function releasedJb2008Rows(jb2008Rows, set, fromMs, toMs, cutoffMs, latencyDays) {
  const lastDay = dayStart(cutoffMs) - latencyDays * DAY_MS;
  const from = dayStart(fromMs);
  const rows = lastDay >= from ? jb2008Rows(set, from, Math.min(toMs, lastDay)) : [];
  const base = jb2008Rows(set, lastDay, lastDay)[0];
  const held = base.DTC_HOURLY_K.at(-1);
  for (let t = Math.max(from, lastDay + DAY_MS); t <= toMs; t += DAY_MS) rows.push({ ...base, DATE: isoDay(t), DTC_HOURLY_K: base.DTC_HOURLY_K.map(() => held) });
  return rows;
}

// ── NOAA SWPC Report of Solar-Geophysical Activity (RSGA) ──
// The daily joint USAF/NOAA report, issued at 22:00 UTC: observed and three
// days of predicted Penticton F10.7, and observed, estimated and three days of
// predicted Ap. `dirs`: yearly *_RSGA.tar.gz archives and directories of
// *RSGA.txt files, as SWPC's warehouse serves them.
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseRsga(text) {
  const issued = /:Issued:\s+(\d{4})\s+(\w{3})\s+(\d+)\s+(\d{2})(\d{2})\s+UTC/.exec(text);
  if (!issued) return null;
  const year = Number(issued[1]);
  const issuedMs = Date.UTC(year, MONTHS[issued[2]], Number(issued[3]), Number(issued[4]), Number(issued[5]));
  // A date "15 Nov" near the issue: the year that puts it within 200 days.
  const dateMs = (d, m) => {
    let t = Date.UTC(year, MONTHS[m], Number(d));
    if (t - issuedMs > 200 * DAY_MS) t = Date.UTC(year - 1, MONTHS[m], Number(d));
    if (issuedMs - t > 200 * DAY_MS) t = Date.UTC(year + 1, MONTHS[m], Number(d));
    return t;
  };
  const fObs = /Observed\s+(\d+)\s+(\w{3})\s+(\d+)/.exec(text.slice(text.indexOf('10.7 cm Flux')));
  const fPred = /Predicted\s+(\d+)\s+(\w{3})-(\d+)\s+(\w{3})\s+(\d+)\/(\d+)\/(\d+)/.exec(text.slice(text.indexOf('10.7 cm Flux')));
  const geo = text.slice(text.indexOf('Geomagnetic A Indices'));
  const aObs = /Observed Afr\/Ap\s+(\d+)\s+(\w{3})\s+(\d+)\/(\d+)/.exec(geo);
  const aEst = /Estimated Afr\/Ap\s+(\d+)\s+(\w{3})\s+(\d+)\/(\d+)/.exec(geo);
  const aPred = /Predicted Afr\/Ap\s+(\d+)\s+(\w{3})-(\d+)\s+(\w{3})\s+(\d+)\/(\d+)-(\d+)\/(\d+)-(\d+)\/(\d+)/.exec(geo);
  if (!fObs || !fPred || !aEst || !aPred) return null;
  const f0 = dateMs(fObs[1], fObs[2]);
  const p0 = dateMs(fPred[1], fPred[2]);
  const a0 = dateMs(aEst[1], aEst[2]);
  const ap0 = dateMs(aPred[1], aPred[2]);
  return {
    issuedMs,
    f107: [{ day: f0, value: Number(fObs[3]), kind: 'observed' }, ...[5, 6, 7].map((k, i) => ({ day: p0 + i * DAY_MS, value: Number(fPred[k]), kind: 'predicted' }))],
    ap: [
      ...(aObs ? [{ day: dateMs(aObs[1], aObs[2]), value: Number(aObs[4]), kind: 'observed' }] : []),
      { day: a0, value: Number(aEst[4]), kind: 'estimated' },
      ...[6, 8, 10].map((k, i) => ({ day: ap0 + i * DAY_MS, value: Number(aPred[k]), kind: 'predicted' })),
    ],
  };
}
export function readRsga(sources, cacheDir) {
  const reports = [];
  const files = {};
  for (const src of sources) {
    let dir = src;
    if (src.endsWith('.tar.gz')) {
      dir = path.join(cacheDir, path.basename(src, '.tar.gz'));
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
  return { reports, files };
}

// Kp (x10) for a daily Ap from the standard ap-Kp table (Bartels' scale).
const KP10 = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57, 60, 63, 67, 70, 73, 77, 80, 83, 87, 90];
const AP = [0, 2, 3, 4, 5, 6, 7, 9, 12, 15, 18, 22, 27, 32, 39, 48, 56, 67, 80, 94, 111, 132, 154, 179, 207, 236, 300, 400];
const kp10Of = (ap) => KP10[AP.reduce((best, v, i) => (Math.abs(v - ap) < Math.abs(AP[best] - ap) ? i : best), 0)];

// $SPW rows for [fromMs, toMs] as released at cutoffMs: GFZ's observed values
// for the days before the newest RSGA's day d (the definitive values stand in
// for those released then; revisions are small), the RSGA's observed F10.7
// and estimated Ap for d, its predictions for d+1..d+3, and day d+3 held after
// that. Each row's 81-day centred F10.7 mean is taken over the released
// observed days inside the 81 days when at least 41 are, otherwise over the
// last 81 released days.
export function releasedSpwRows(gfz, rsga, cutoffMs, fromMs, toMs) {
  const issue = rsga.reports.filter((r) => r.issuedMs <= cutoffMs).at(-1);
  if (!issue) throw new Error(`no RSGA issued by ${new Date(cutoffMs).toISOString()}`);
  const d = issue.f107[0].day;
  const observedF = new Map();
  for (const [date, v] of gfz.days) { const t = Date.parse(`${date}T00:00:00Z`); if (t < d && v.f107obs > 0) observedF.set(t, v.f107obs); }
  observedF.set(d, issue.f107[0].value);
  const fAt = (t) => { const f = issue.f107.filter((x) => x.day <= t).at(-1); return f.value; };
  const apAt = (t) => { const a = issue.ap.filter((x) => x.day <= t && x.kind !== 'observed').at(-1) ?? issue.ap.at(-1); return a.value; };
  // The trailing mean of the last 81 released days stands in where fewer than
  // 41 days of the centred window are released (within 40 days of d).
  const trailing = [];
  for (let k = 0; k < 81; ++k) { const v = observedF.get(d - k * DAY_MS); if (v) trailing.push(v); }
  if (trailing.length < 75) throw new Error(`only ${trailing.length} released F10.7 days in the 81 before ${isoDay(d)}`);
  const trailingMean = trailing.reduce((a, b) => a + b, 0) / trailing.length;
  const rows = [];
  for (let t = dayStart(fromMs); t <= toMs; t += DAY_MS) {
    const window = [];
    for (let k = -40; k <= 40; ++k) { const v = observedF.get(t + k * DAY_MS); if (v) window.push(v); }
    const center = window.length >= 41 ? window.reduce((a, b) => a + b, 0) / window.length : trailingMean;
    if (t < d) {
      const g = gfz.days.get(isoDay(t));
      if (!g) throw new Error(`no GFZ row for ${isoDay(t)}`);
      const kp10 = g.kp.map((k) => Math.round(k * 10));
      const f = g.f107obs > 0 ? g.f107obs : center;
      rows.push({ DATE: isoDay(t), KP1: kp10[0], KP2: kp10[1], KP3: kp10[2], KP4: kp10[3], KP5: kp10[4], KP6: kp10[5], KP7: kp10[6], KP8: kp10[7],
        KP_SUM: kp10.reduce((a, b) => a + b, 0), AP1: g.ap[0], AP2: g.ap[1], AP3: g.ap[2], AP4: g.ap[3], AP5: g.ap[4], AP6: g.ap[5], AP7: g.ap[6], AP8: g.ap[7],
        AP_AVG: g.Ap, F107_OBS: f, F107_ADJ: g.f107adj > 0 ? g.f107adj : f, F107_DATA_TYPE: 0, F107_OBS_CENTER81: center });
    } else {
      const ap = apAt(t), kp = kp10Of(ap), f = fAt(t);
      rows.push({ DATE: isoDay(t), KP1: kp, KP2: kp, KP3: kp, KP4: kp, KP5: kp, KP6: kp, KP7: kp, KP8: kp, KP_SUM: 8 * kp,
        AP1: ap, AP2: ap, AP3: ap, AP4: ap, AP5: ap, AP6: ap, AP7: ap, AP8: ap, AP_AVG: ap, F107_OBS: f, F107_ADJ: f, F107_DATA_TYPE: t === d ? 0 : 1, F107_OBS_CENTER81: center });
    }
  }
  return { rows, issue: new Date(issue.issuedMs).toISOString() };
}
