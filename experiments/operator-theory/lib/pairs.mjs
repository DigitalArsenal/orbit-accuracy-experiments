// The next-file pair rule's key, and a registered set of pairs (XP-ARM-0-2-1.md): the keys of a store's rows. Every Starlink group is held, so a
// Starlink row is never parsed.
import fs from 'node:fs';
import path from 'node:path';

export const HELD_ROW = /"source":"starlink"/;
export const pairKey = (r) => `${r.source}|${r.norad ?? r.object}|${r.olderStart}|${r.newerStart}`;
/** The pair keys of every rows-*.jsonl and rows-iss-*.jsonl in `dir`. */
export function pairsOf(dir) {
  const keys = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => /^rows(-iss)?-\d+\.jsonl$/.test(n))) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) if (line && !HELD_ROW.test(line)) keys.add(pairKey(JSON.parse(line)));
  }
  return keys;
}
