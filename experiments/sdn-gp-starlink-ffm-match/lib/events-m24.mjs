// Amendment A10, M24 (DESIGN 5.5): the ISS OEM captures of the operator-ephemeris archive (NASA/JSC/FOD/TOPO, J2000, UTC, 240 s) through `detect_maneuvers`, 72 h windows every 24 h. The two distinct files hold
// no reboost (the event table of the first lists docking, departure and launch events with delta-v 0.0; the second carries none), so every detection is a false alarm.
// JavaScript here converts frames by foundation/frames and counts; the detector is the module's.
import path from 'node:path';
import { config } from '../common.mjs';
import { iss } from './sources.mjs';
import { oemBytes } from './sds.mjs';
import { transformState } from './frames.mjs';
import { detectManeuvers, loadEnvironment } from './sdngp-events.mjs';
import { iso } from './windows.mjs';
import { satellites, readTruthFlat, t0Of } from './events.mjs';

export const FILES = ['2026-10-12', '2026-10-23'].map((d) => ({ name: d, file: path.join(config.archive, 'operator-ephemerides/daily', d, 'iss-oem.txt.gz') }));
const WINDOW_H = 72, STRIDE_H = 24;

export async function scoreIss({ b, sink, only = null }) { // only: [{ file, startUtc }] (a replay)
  const env = await loadEnvironment(b.sdngp, b.weatherTable); // amendment A10d: the saved weather table is in force for the detector
  if (!env.ok) throw new Error(`load_environment: ${env.error}`);
  for (const { name, file } of FILES) {
    const [obj] = iss({ file });
    const teme = [];
    for (const l of obj.lines) { const t = await transformState(b.frames, 'EME2000', 'TEME', l.epoch.replace(/Z?$/, 'Z'), [...l.r, ...l.v]); teme.push({ epoch: iso(Date.parse(l.epoch.replace(/Z?$/, 'Z'))), r: t.slice(0, 3), v: t.slice(3, 6) }); }
    const t0 = Date.parse(teme[0].epoch), t1 = Date.parse(teme.at(-1).epoch);
    for (let s = t0; s + WINDOW_H * 3600e3 <= t1 + 1; s += STRIDE_H * 3600e3) {
      const lines = teme.filter((l) => Date.parse(l.epoch) >= s && Date.parse(l.epoch) <= s + WINDOW_H * 3600e3);
      const key = `ISS ${name}`, startUtc = iso(s);
      if (only && !only.some((o) => o.file === name && o.startUtc === startUtc)) continue;
      if (sink.has(`m24|${key}|${startUtc}|${WINDOW_H * 3600}`)) continue;
      const bytes = oemBytes({ originator: 'NASA/JSC/FOD/TOPO', block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: 'ISS', id: '1998-067A', norad: 25544 }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch }, sizePrefixed: false });
      const r = await detectManeuvers(b.sdngp, { oem: bytes });
      const row = { source: 'm24', id: key, file: name, startUtc, fitSeconds: WINDOW_H * 3600, states: lines.length, build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
      if (!r.ok) sink.append({ ...row, ok: false, error: r.error });
      else sink.append({ ...row, ok: true, detections: r.maneuvers.map((m) => ({ epoch: m.EVENT_START_TIME, dvMS: [m.DELTA_VEL_U, m.DELTA_VEL_V, m.DELTA_VEL_W].map((x) => x * 1000), algorithm: m.ALGORITHM ?? null })), sets: r.elements.length });
    }
  }
}

/**
 * Amendment A10c: the same detector on burn-free FFM-1 arcs: the 48 registered Starlink truths of M22 (one integration from one state), 72 h windows at 0 h and 24 h of the 96 h truth,
 * every fifth state (300 s), TEME by foundation/frames.
 */
export async function scoreControl({ b, sink, only = null }) {
  const env = await loadEnvironment(b.sdngp, b.weatherTable); // amendment A10d
  if (!env.ok) throw new Error(`load_environment: ${env.error}`);
  for (const meta of satellites('m22')) {
    if (!sink.mine()) continue;
    if (only && !only.includes(meta.norad)) continue;
    const flat = readTruthFlat(meta), t0 = t0Of(meta), n = Math.floor((flat.length / 6 - 1) / 5);
    const teme = [];
    for (let i = 0; i <= n; i += 1) {
      const j = i * 5, epoch = iso(t0 + j * 60000);
      const t = await transformState(b.frames, 'GCRF', 'TEME', epoch, Array.from(flat.slice(j * 6, j * 6 + 6)));
      teme.push({ epoch, r: t.slice(0, 3), v: t.slice(3, 6) });
    }
    for (const startH of [0, 24]) {
      const lines = teme.slice(startH * 12, startH * 12 + 72 * 12 + 1);
      const key = `STARLINK (${meta.norad}) +${startH}h`, startUtc = lines[0].epoch;
      if (sink.has(`m24c|${key}|${startUtc}|${72 * 3600}`)) continue;
      const bytes = oemBytes({ originator: 'G1 FFM-1', block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: `STARLINK-${meta.norad}`, id: '', norad: meta.norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch }, sizePrefixed: false });
      const r = await detectManeuvers(b.sdngp, { oem: bytes });
      const row = { source: 'm24c', id: key, norad: meta.norad, startH, startUtc, fitSeconds: 72 * 3600, states: lines.length, build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
      if (!r.ok) sink.append({ ...row, ok: false, error: r.error });
      else sink.append({ ...row, ok: true, detections: r.maneuvers.map((m) => ({ epoch: m.EVENT_START_TIME, dvMS: [m.DELTA_VEL_U, m.DELTA_VEL_V, m.DELTA_VEL_W].map((x) => x * 1000), algorithm: m.ALGORITHM ?? null })), sets: r.elements.length });
    }
  }
}
