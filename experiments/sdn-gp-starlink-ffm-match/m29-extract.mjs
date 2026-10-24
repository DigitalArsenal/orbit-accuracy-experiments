// Amendment A11, M29: the GP element-set histories of the objects with a reentry in the local TIP and decay snapshots, cut from the local gp_history archive (creation dates from
// 2026-09-01) into <store>/m29/sets/<norad>.json (local only: Space-Track element sets stay on the archive host). No request to Space-Track.
//   node experiments/sdn-gp-starlink-ffm-match/m29-extract.mjs
import fs from 'node:fs';
import path from 'node:path';
import { store } from './common.mjs';
import { readTip, readDecay, gpRecords } from './lib/spacetrack-local.mjs';

const tip = readTip(), decay = readDecay();
const LAST_SNAPSHOT = Date.parse('2026-10-24T12:00:00Z');
const wanted = new Map();
for (const [norad, list] of tip) {
  const last = list.at(-1);
  if (last.decayMs < LAST_SNAPSHOT && decay.get(norad)?.final) wanted.set(norad, { norad, name: decay.get(norad).name, rcs: decay.get(norad).rcs, finalDecayDate: decay.get(norad).final, tips: list });
}
console.error(`${wanted.size} objects with a TIP series and a decay message`);
const t0 = Date.now();
let n = 0;
const records = gpRecords(new Set(wanted.keys()), Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-10-25T00:00:00Z'), (f) => { n += 1; if (n % 25 === 0) console.error(`${n} files (${((Date.now() - t0) / 1000).toFixed(0)} s)`); });
const dir = path.join(store, 'm29/sets');
fs.mkdirSync(dir, { recursive: true });
for (const [norad, info] of wanted) {
  const sets = records.filter((r) => r.NORAD_CAT_ID === norad).sort((a, b) => (a.EPOCH < b.EPOCH ? -1 : a.EPOCH > b.EPOCH ? 1 : a.CREATION_DATE < b.CREATION_DATE ? -1 : 1));
  fs.writeFileSync(path.join(dir, `${norad}.json`), `${JSON.stringify({ ...info, sets }, null, 0)}\n`);
  console.error(`${norad} ${info.name}: ${sets.length} sets, ${sets[0]?.EPOCH} to ${sets.at(-1)?.EPOCH}`);
}
