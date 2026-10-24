// Amendment A11e: the detector on FFM-1 arcs with a planted impulse, the pipeline check of M24 on the archive: the registered truth of a Starlink from its start to t_b (24 h, every fifth state) followed by the first 36 h
// after t_b of an M22 case (the control, or an impulse planted at t_b), TEME by foundation/frames, `detect_maneuvers` with the saved weather loaded. The burn is at 24 h of a 60 h arc; its time and size are known exactly.
import { oemBytes } from './sds.mjs';
import { transformState } from './frames.mjs';
import { detectManeuvers, loadEnvironment } from './sdngp-events.mjs';
import { CASES, satellites, readTruthFlat, t0Of, tbOf, loadTruth, caseStates } from './events.mjs';
import { iso } from './windows.mjs';

export const PLANTED_CASES = ['ctl', 'imp-V-0.1', 'imp-V-1', 'imp-V-10', 'imp-U-1', 'imp-W-1'];
export const ARC_HOURS = 60;

export async function scorePlanted({ b, sink, only = null }) {
  const env = await loadEnvironment(b.sdngp, b.weatherTable);
  if (!env.ok) throw new Error(`load_environment: ${env.error}`);
  for (const meta of satellites('m22')) {
    if (!sink.mine()) continue;
    if (only && !only.includes(meta.norad)) continue;
    const flat = readTruthFlat(meta), t0 = t0Of(meta), tb = tbOf(meta), all = loadTruth('m22', meta.norad);
    for (const caseId of PLANTED_CASES) {
      const id = `STARLINK (${meta.norad}) ${caseId}`, startUtc = iso(t0);
      if (sink.has(`m24p|${id}|${startUtc}|${ARC_HOURS * 3600}`)) continue;
      const st = caseStates(all, CASES.m22.findIndex((c) => c.id === caseId));
      const raw = [];
      for (let i = 0; i < 1440; i += 5) raw.push({ ms: t0 + i * 60000, r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] });
      raw.push({ ms: tb, r: [flat[1440 * 6], flat[1440 * 6 + 1], flat[1440 * 6 + 2]], v: [flat[1440 * 6 + 3], flat[1440 * 6 + 4], flat[1440 * 6 + 5]] });
      for (let k = 0; k < 432; k += 1) raw.push({ ms: tb + (k + 1) * 300000, r: st[k].r, v: st[k].v });
      const lines = [];
      for (const l of raw) { const t = await transformState(b.frames, 'GCRF', 'TEME', iso(l.ms), [...l.r, ...l.v]); lines.push({ epoch: iso(l.ms), r: t.slice(0, 3), v: t.slice(3, 6) }); }
      const bytes = oemBytes({ originator: 'G1 A11e', block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: `STARLINK-${meta.norad}`, id: '', norad: meta.norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch }, sizePrefixed: false });
      const r = await detectManeuvers(b.sdngp, { oem: bytes });
      const row = { source: 'm24p', id, norad: meta.norad, case: caseId, startUtc, tbUtc: iso(tb), fitSeconds: ARC_HOURS * 3600, states: lines.length, build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
      if (!r.ok) sink.append({ ...row, ok: false, error: r.error });
      else sink.append({ ...row, ok: true, detections: r.maneuvers.map((m) => ({ epoch: m.EVENT_START_TIME, dvMS: [m.DELTA_VEL_U, m.DELTA_VEL_V, m.DELTA_VEL_W].map((x) => x * 1000), algorithm: m.ALGORITHM ?? null })) });
    }
  }
}
