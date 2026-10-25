// Amendment A14, M27: `detect_maneuvers` on the GPS satellites (ESA final orbits, 2026-001 to 2026-266) and the QZSS satellites (GFZ multi-GNSS rapid orbits, 2026-004 to 2026-273) in 72 h windows every 24 h, against the
// forecast delta-V outages of the NANUs and NAQUs. States: the reference states of the archive (GCRF, 5 min), TEME by foundation/frames, every state of the window; the daily weather table of the years is the environment
// (the satellites are far above the drag regime; it is sent as for every other detection). Rows: source m27, one per satellite and window.
import fs from 'node:fs';
import path from 'node:path';
import { oemBytes } from './sds.mjs';
import { transformState } from './frames.mjs';
import { detectManeuvers, loadEnvironment } from './sdngp-events.mjs';
import { spaceWeatherHistory } from './spw-history.mjs';
import { chain, readReference, referenceDir, ARCHIVE } from './sources.mjs';
import { ms, iso } from './windows.mjs';
import { results } from '../common.mjs';

export const WINDOW_H = 72, STRIDE_H = 24, MIN_STATES = 48, MAX_GAP_S = 900;
export const SYSTEMS = {
  gps: { name: 'GPS', year: 2026, firstDay: 1, lastDay: 266, prefix: 'ESA0OPSFIN_', dir: (d) => referenceDir(d), pick: (name) => /^G\d/.test(name), originator: 'ESA/ESOC final orbits (ESA0OPSFIN)' },
  qzss: { name: 'QZSS', year: 2026, firstDay: 4, lastDay: 273, prefix: 'GFZ0MGXRAP_', dir: (d) => path.join(ARCHIVE, 'e14-covariance-realism/reference', d), pick: (name) => /^J\d/.test(name), originator: 'GFZ multi-GNSS rapid orbits (GFZ0MGXRAP)' },
};
const folder = (sys, day) => `${sys.prefix}${sys.year}${String(day).padStart(3, '0')}0000_01D_05M_ORB`;

/** The satellites of a system and the daily files of each: [{ norad, name, svn, files }] (the system's first existing day names them). */
export function satellites(system) {
  const sys = SYSTEMS[system];
  const days = Array.from({ length: sys.lastDay - sys.firstDay + 1 }, (_, k) => sys.firstDay + k).filter((d) => fs.existsSync(sys.dir(folder(sys, d))));
  if (!days.length) return [];
  const first = sys.dir(folder(sys, days[0])), last = sys.dir(folder(sys, days.at(-1)));
  const norads = [...new Set([...fs.readdirSync(first), ...fs.readdirSync(last)].filter((f) => f.endsWith('.oem')).map((f) => Number(f.replace('.oem', ''))))].sort((a, c) => a - c);
  const out = [];
  for (const norad of norads) {
    const files = days.map((d) => path.join(sys.dir(folder(sys, d)), `${norad}.oem`)).filter((f) => fs.existsSync(f));
    const name = readReference(files.at(-1)).name;
    if (sys.pick(name)) out.push({ norad, name, svn: Number(/^[A-Z](\d{3})/.exec(name)?.[1] ?? NaN), files });
  }
  return out;
}

/** `only`: [{ system, norad }] for a replay; `at`: ISO start epochs to score. */
export async function scoreGnss({ b, sink, only = null, at = null }) {
  const { payload } = spaceWeatherHistory(b.weatherTable);
  const env = await loadEnvironment(b.sdngp, payload);
  if (!env.ok) throw new Error(`load_environment: ${env.error}`);
  for (const system of Object.keys(SYSTEMS)) {
    for (const sat of satellites(system)) {
      if (only && !only.some((o) => o.system === system && o.norad === sat.norad)) continue;
      if (!sink.mine()) continue;
      const series = chain(sat.files), lines = series.lines.map((l) => ({ ...l, ms: ms(l.epoch) }));
      let teme = null; // converted once per satellite, on first use
      const t0 = lines[0].ms, tEnd = lines.at(-1).ms;
      for (let start = t0; start + WINDOW_H * 3600e3 <= tEnd + 1; start += STRIDE_H * 3600e3) {
        const startUtc = iso(start), id = `${sat.name} (${sat.norad})`;
        if (at && !at.includes(startUtc)) continue;
        if (sink.has(`m27|${id}|${startUtc}|${WINDOW_H * 3600}`)) continue;
        const win = lines.filter((l) => l.ms >= start && l.ms <= start + WINDOW_H * 3600e3);
        const row = { source: 'm27', system, id, norad: sat.norad, name: sat.name, svn: sat.svn, startUtc, stopUtc: iso(start + WINDOW_H * 3600e3), fitSeconds: WINDOW_H * 3600, states: win.length, build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
        const gap = win.slice(1).reduce((g, l, i) => Math.max(g, (l.ms - win[i].ms) / 1000), 0);
        if (win.length < MIN_STATES || gap > MAX_GAP_S) { sink.append({ ...row, skipped: win.length < MIN_STATES ? `${win.length} states (fewer than ${MIN_STATES})` : `a gap of ${Math.round(gap)} s` }); continue; }
        teme ??= new Map();
        const out = [];
        for (const l of win) {
          let t = teme.get(l.ms);
          if (!t) { t = await transformState(b.frames, 'GCRF', 'TEME', l.epoch, [...l.r, ...l.v]); teme.set(l.ms, t); }
          out.push({ epoch: iso(l.ms), r: t.slice(0, 3), v: t.slice(3, 6) });
        }
        const bytes = oemBytes({ originator: SYSTEMS[system].originator, block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: sat.name, id: '', norad: sat.norad }, lines: out, start: out[0].epoch, stop: out.at(-1).epoch }, sizePrefixed: false });
        const r = await detectManeuvers(b.sdngp, { oem: bytes });
        if (!r.ok) sink.append({ ...row, ok: false, error: r.error });
        else sink.append({ ...row, ok: true, detections: r.maneuvers.map((m) => ({ epoch: m.EVENT_START_TIME, dvMS: [m.DELTA_VEL_U, m.DELTA_VEL_V, m.DELTA_VEL_W].map((x) => x * 1000), algorithm: m.ALGORITHM ?? null })) });
        // drop converted states that no later window needs (the series is processed in order)
        for (const k of teme.keys()) if (k < start + STRIDE_H * 3600e3) teme.delete(k);
      }
    }
  }
}

// ---- amendment A17, M27b: the detector across the omitted days of the GPS series ----
export const HOLE_DAY_MIN_H = 23.9, HOLE_DAY_MAX_H = 24.1, FLANK_H = 24, FLANK_STATES = 289, HOLE_REPORT_H = 3;

/**
 * Rows `m27b` of the GPS satellites: (1) for every hole of one day in a satellite's series with a flank of 24 h (289 states, no gap over 15 min) on each side, the 578 states of the two flanks, kind `omitted-day`;
 * (2) holes of other lengths and holes with an incomplete flank, kind `hole`, skipped with the reason; (3) every answered window of M27 (72 h every 24 h) that overlaps no forecast window plus or minus 6 h of a
 * delta-V outage of its satellite, with the states strictly between 24 h and 48 h after its start removed, kind `control`. One `detect_maneuvers` call per window, TEME by foundation/frames, the daily weather loaded.
 * `only`: [{ norad }] for a replay; `at`: ISO start epochs to score.
 */
export async function scoreGnssGaps({ b, sink, only = null, at = null }) {
  const { payload } = spaceWeatherHistory(b.weatherTable);
  const env = await loadEnvironment(b.sdngp, payload);
  if (!env.ok) throw new Error(`load_environment: ${env.error}`);
  const notices = JSON.parse(fs.readFileSync(path.join(results, 'gnss-notice-events.json'), 'utf8')).gps;
  const H = 3600e3, system = 'gps';
  const maxGap = (list) => list.slice(1).reduce((g, l, i) => Math.max(g, (l.ms - list[i].ms) / 1000), 0);
  for (const sat of satellites(system)) {
    if (only && !only.some((o) => o.norad === sat.norad)) continue;
    const series = chain(sat.files), lines = series.lines.map((l) => ({ ...l, ms: ms(l.epoch) }));
    const id = `${sat.name} (${sat.norad})`;
    const spans = notices.deltaV.filter((e) => e.svn === sat.svn).map((e) => [Date.parse(e.forecast.start) - 6 * H, Date.parse(e.forecast.stop) + 6 * H]);
    // the windows in a fixed order: the holes in time order, then the controls in time order
    const windows = [];
    for (let i = 1; i < lines.length; i++) {
      const hours = (lines[i].ms - lines[i - 1].ms) / H;
      if (hours <= HOLE_REPORT_H) continue;
      const hole = { from: lines[i - 1].ms, to: lines[i].ms };
      if (hours <= HOLE_DAY_MIN_H || hours > HOLE_DAY_MAX_H) { windows.push({ kind: 'hole', start: hole.from, stop: hole.to, hole, skipped: `a hole of ${Math.round(hours)} h (not one day)` }); continue; }
      const before = lines.filter((l) => l.ms >= hole.from - FLANK_H * H && l.ms <= hole.from), after = lines.filter((l) => l.ms >= hole.to && l.ms <= hole.to + FLANK_H * H);
      const bad = before.length < FLANK_STATES || after.length < FLANK_STATES || maxGap(before) > MAX_GAP_S || maxGap(after) > MAX_GAP_S;
      if (bad) windows.push({ kind: 'hole', start: hole.from, stop: hole.to, hole, skipped: `a flank of ${before.length} and ${after.length} states (fewer than ${FLANK_STATES} or a gap)` });
      else windows.push({ kind: 'omitted-day', start: before[0].ms, stop: after.at(-1).ms, hole, states: [...before, ...after] });
    }
    const t0 = lines[0].ms, tEnd = lines.at(-1).ms;
    for (let start = t0; start + WINDOW_H * H <= tEnd + 1; start += STRIDE_H * H) {
      const win = lines.filter((l) => l.ms >= start && l.ms <= start + WINDOW_H * H);
      if (win.length < MIN_STATES || maxGap(win) > MAX_GAP_S) continue; // not an answered window of M27: not a control
      if (spans.some(([a, z]) => start < z && start + WINDOW_H * H > a)) continue; // overlaps a delta-V outage: not clear
      const hole = { from: start + 24 * H, to: start + 48 * H };
      windows.push({ kind: 'control', start, stop: start + WINDOW_H * H, hole, states: win.filter((l) => l.ms <= hole.from || l.ms >= hole.to) });
    }
    let teme = null;
    for (const w of windows) {
      if (!sink.mine()) continue;
      const startUtc = iso(w.start);
      if (at && !at.includes(startUtc)) continue;
      const fitSeconds = Math.round((w.stop - w.start) / 1000);
      if (sink.has(`m27b|${id}|${startUtc}|${fitSeconds}`)) continue;
      const row = { source: 'm27b', kind: w.kind, system, id, norad: sat.norad, name: sat.name, svn: sat.svn, startUtc, stopUtc: iso(w.stop), holeFromUtc: iso(w.hole.from), holeToUtc: iso(w.hole.to), fitSeconds, states: w.states?.length ?? 0, build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
      if (w.skipped) { sink.append({ ...row, skipped: w.skipped }); continue; }
      teme ??= new Map();
      const out = [];
      for (const l of w.states) {
        let t = teme.get(l.ms);
        if (!t) { t = await transformState(b.frames, 'GCRF', 'TEME', l.epoch, [...l.r, ...l.v]); teme.set(l.ms, t); }
        out.push({ epoch: iso(l.ms), r: t.slice(0, 3), v: t.slice(3, 6) });
      }
      const bytes = oemBytes({ originator: SYSTEMS[system].originator, block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: sat.name, id: '', norad: sat.norad }, lines: out, start: out[0].epoch, stop: out.at(-1).epoch }, sizePrefixed: false });
      const r = await detectManeuvers(b.sdngp, { oem: bytes });
      if (!r.ok) sink.append({ ...row, ok: false, error: r.error });
      else sink.append({ ...row, ok: true, detections: r.maneuvers.map((m) => ({ epoch: m.EVENT_START_TIME, dvMS: [m.DELTA_VEL_U, m.DELTA_VEL_V, m.DELTA_VEL_W].map((x) => x * 1000), algorithm: m.ALGORITHM ?? null })) });
      for (const k of teme.keys()) if (k < w.start - 4 * 24 * H) teme.delete(k); // windows are in time order within each kind; keep a few days
    }
  }
}

