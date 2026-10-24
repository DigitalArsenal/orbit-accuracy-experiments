// Amendment A11, M24 on NASA's ISS archive: `detect_maneuvers` on the 72 h windows of lib/iss-windows.mjs (burn windows in the pre and post files, burn-free leading windows), with the daily
// space weather of the window's years loaded (lib/spw-history.mjs). States: EME2000 to TEME by foundation/frames, every state of the window (240 s steps), none dropped.
import fs from 'node:fs';
import { oemBytes } from './sds.mjs';
import { transformState } from './frames.mjs';
import { detectManeuvers, loadEnvironment } from './sdngp-events.mjs';
import { parseIssOem } from './iss-oem.mjs';
import { issWindows, archiveHeaders, WINDOW_H } from './iss-windows.mjs';
import { spaceWeatherHistory } from './spw-history.mjs';
import { iso } from './windows.mjs';

/** The windows of the archive, cached by the caller; each carries `file` (the path of its OEM text). */
export function archiveWindows() {
  const files = archiveHeaders();
  const byDate = new Map(files.map((f) => [f.date, f.file]));
  const r = issWindows(files);
  return { ...r, windows: r.windows.map((w) => ({ ...w, file: byDate.get(w.date) })) };
}

export async function scoreArchive({ b, sink, only = null, windows = archiveWindows().windows }) {
  const { payload } = spaceWeatherHistory(b.weatherTable);
  const env = await loadEnvironment(b.sdngp, payload);
  if (!env.ok) throw new Error(`load_environment: ${env.error}`);
  let cache = null;
  for (const [i, w] of windows.entries()) {
    if (!sink.mine()) continue;
    const id = `ISS ${w.kind} ${w.date}${w.cluster ? ` c${w.cluster}` : ''}`, startUtc = iso(w.startMs);
    if (only && !only.some((o) => o.id === id)) continue;
    if (sink.has(`m24a|${id}|${startUtc}|${WINDOW_H * 3600}`)) continue;
    if (!cache || cache.file !== w.file) cache = { file: w.file, parsed: parseIssOem(fs.readFileSync(w.file, 'utf8')) };
    const states = cache.parsed.states.filter((s) => s.ms >= w.startMs && s.ms <= w.stopMs);
    const lines = [];
    for (const s of states) { const t = await transformState(b.frames, 'EME2000', 'TEME', iso(s.ms), [...s.r, ...s.v]); lines.push({ epoch: iso(s.ms), r: t.slice(0, 3), v: t.slice(3, 6) }); }
    const bytes = oemBytes({ originator: 'NASA/JSC/FOD/TOPO', block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: 'ISS', id: '1998-067A', norad: 25544 }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch }, sizePrefixed: false });
    const r = await detectManeuvers(b.sdngp, { oem: bytes });
    const row = { source: 'm24a', id, index: i, kind: w.kind, cluster: w.cluster, file: w.date, startUtc, stopUtc: iso(w.stopMs), fitSeconds: WINDOW_H * 3600, states: lines.length, build: b.sdngp.provenance.wasmSha256.slice(0, 12),
      ...(w.tigMs ? { tigUtc: iso(w.tigMs), name: w.name, plannedDvMS: w.dvMS, haKm: w.haKm, hpKm: w.hpKm, otherBurns: w.otherBurns, short: w.short } : {}) };
    if (!r.ok) sink.append({ ...row, ok: false, error: r.error });
    else sink.append({ ...row, ok: true, detections: r.maneuvers.map((m) => ({ epoch: m.EVENT_START_TIME, dvMS: [m.DELTA_VEL_U, m.DELTA_VEL_V, m.DELTA_VEL_W].map((x) => x * 1000), algorithm: m.ALGORITHM ?? null })) });
  }
}
