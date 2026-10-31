// GFZ's rapid orbits as an independent position at a truth line's epoch: the daily reference file that holds the epoch, read through the truth gate, states only. C3-A2's check and C3-A5's P-REF against GFZ read E14's reference
// directory for GFZ0MGXRAP's products, never E14's results. Records only.
import fs from 'node:fs';
import path from 'node:path';
import { root, config, DAY } from '../common.mjs';

const SRC = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs'));
const IDENTITY = Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? 1 : 0));

/** gfzAt(norad, epochIso) -> { state (m, m/s), covariance (identity, a placeholder) } or null when GFZ has no state at that epoch. */
export function openGfz(opened, { root: dir = config.p1b.gfz.root, prefix = config.p1b.gfz.prefix } = {}) {
  const cache = new Map();
  return (norad, epochIso) => {
    // the epoch's UTC is mapped to the GPS day the file is named for
    const t = Date.parse(/Z$/.test(epochIso) ? epochIso : `${epochIso}Z`) + 18e3, d = new Date(t), y = d.getUTCFullYear(), doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / DAY) + 1;
    const name = `${prefix}${y}${String(doy).padStart(3, '0')}0000_01D_05M_ORB`, file = path.join(dir, name, `${norad}.oem`);
    if (!cache.has(file)) {
      if (cache.size > 32) cache.delete(cache.keys().next().value);
      if (!fs.existsSync(file)) cache.set(file, null);
      else { if (opened) opened.add(file, 'GFZ0MGXRAP'); cache.set(file, new Map(SRC.readReference(file).lines.map((l) => [Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`), l]))); }
    }
    const l = cache.get(file)?.get(t - 18e3);
    return l ? { state: [...l.r, ...l.v].map((x) => x * 1000), covariance: IDENTITY } : null;
  };
}
