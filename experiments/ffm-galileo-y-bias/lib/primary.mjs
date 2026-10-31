// Primary samples, as SRP (its PLAN.md section 5): notices from the public pages in C3's store, up to the seal; storm days from GFZ Ap, lines to gfzThrough. A window is keyed by satellite and t_in. Records only.
import { srp, c3, DAY, HOUR } from '../common.mjs';

export function openPrimary(opened) {
  const P = srp.common.config.primary;
  const sinex = c3.notices.parseSinex(opened.read(P.sinex, 'IGS SINEX').toString());
  const N = c3.notices.loadNotices(P.noticesDir, sinex, P.noticeSeal, opened), asOf = Date.parse(`${P.noticeSeal}T00:00:00Z`);
  const storms = new Set();
  for (const line of opened.read(P.gfzFile, `GFZ Ap, lines to ${P.gfzThrough}`).toString().split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const date = `${line.slice(0, 4)}-${line.slice(5, 7)}-${line.slice(8, 10)}`;
    if (date < '2025-06-01' || date > P.gfzThrough) continue;
    if (Number(line.trim().split(/\s+/)[23]) >= P.stormAp) storms.add(date);
  }
  const cache = new Map();
  const notice = (r) => { const k = `${r.norad}|${r.tIn}`; if (!cache.has(k)) { const t = Date.parse(r.tIn); cache.set(k, N.overlap(r.norad, t - P.noticeBeforeHours * HOUR, t + P.noticeAfterHours * HOUR, asOf).length > 0); } return cache.get(k); };
  const storm = (r, L) => { const t = Date.parse(r.tIn); for (let d = Math.floor((t - 24 * HOUR) / DAY); d * DAY < t + L * HOUR; d += 1) if (storms.has(new Date(d * DAY).toISOString().slice(0, 10))) return true; return false; };
  return { notice, storm, primary: (r, L) => !notice(r) && !storm(r, L) };
}
