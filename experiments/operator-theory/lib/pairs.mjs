// The next-file pair rule's key, and a registered set of pairs (XP-ARM-0-2-1.md): the keys of a store's rows. The holds: every Starlink group (a Starlink
// row is never parsed), C2's six Galileo satellites, Swarm and GRACE-FO; a registered set naming a held satellite is refused.
import fs from 'node:fs';
import path from 'node:path';

export const HELD_ROW = /"source":"starlink"/;
export const HELD_NORADS = new Set([43567, 37847, 41862, 41174, 43055, 41175, 39451, 39452, 39453, 43476, 43477]);
export const pairKey = (r) => `${r.source}|${r.norad ?? r.object}|${r.olderStart}|${r.newerStart}`;
/** The pair keys of every rows-*.jsonl and rows-iss-*.jsonl in `dir`. */
export function pairsOf(dir) {
  const keys = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => /^rows(-iss)?-\d+\.jsonl$/.test(n))) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line || HELD_ROW.test(line)) continue;
      const r = JSON.parse(line);
      if (HELD_NORADS.has(Number(r.norad))) throw new Error(`${dir}: NORAD ${r.norad} is held`);
      keys.add(pairKey(r));
    }
  }
  return keys;
}
