// CelesTrak supplemental GP beside both catalogs (PLAN.md section 6, descriptive, "where captured"): every SupGP snapshot of
// our collector archive (2026-10-10 to 2026-10-15), read with the SupGP pass's reader. A SupGP set is usable at T when the
// snapshot holding it was fetched at or before T and its epoch is at or before T. SupGP sets are fitted to operator
// ephemerides, for Starlink, Planet and the ISS the very files the truth comes from, so they are not independent of the
// truth there; they are reported, never combined.
import fs from 'node:fs';
import path from 'node:path';
import { readSnapshot, snapshotStamps } from '../../supgp-omm/lib/supgp.mjs';
import { PATHS } from '../settings.mjs';
import { shiftDay } from './windows.mjs';

const stampDay = (stamp) => `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;

export class SupgpCatalog {
  constructor(fromDay, toDay, root = PATHS.supgp) {
    this.byNorad = new Map();
    this.snapshots = [];
    const groups = fs.existsSync(root) ? fs.readdirSync(root).filter((g) => !g.startsWith('_') && fs.statSync(path.join(root, g)).isDirectory()) : [];
    for (const group of groups) {
      for (const stamp of snapshotStamps(group, root).filter((s) => stampDay(s) >= shiftDay(fromDay, -10) && stampDay(s) <= toDay)) {
        let snap;
        try { snap = readSnapshot(group, { root, stamp }); } catch (e) { this.snapshots.push({ group, stamp, error: String(e.message).slice(0, 120) }); continue; }
        const fetchedMs = Date.parse(snap.fetchedUtc);
        this.snapshots.push({ group, stamp, fetchedUtc: snap.fetchedUtc, sha256: snap.sha256, sets: snap.rows.length });
        for (const r of snap.rows) {
          const set = { source: 'SupGP', norad: r.norad, id: `${group}:${stamp}:${r.index}`, epoch: r.epoch, epochMs: Date.parse(`${r.epoch}Z`), fetchedMs, creationDate: snap.fetchedUtc.replace(/Z$/, ''), elements: r.elements, group, name: r.name };
          if (!this.byNorad.has(set.norad)) this.byNorad.set(set.norad, new Map());
          const known = this.byNorad.get(set.norad).get(set.epochMs);
          if (!known || known.fetchedMs > fetchedMs) this.byNorad.get(set.norad).set(set.epochMs, set);
        }
      }
    }
  }

  latest(norad, T) {
    const sets = this.byNorad.get(norad);
    if (!sets) return null;
    let best = null;
    for (const s of sets.values()) if (s.epochMs <= T && s.fetchedMs <= T && (!best || s.epochMs > best.epochMs)) best = s;
    return best;
  }
}
