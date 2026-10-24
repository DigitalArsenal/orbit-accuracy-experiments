// Amendment A11, M29: the GP element-set histories of the CORDS observed reentries (lib/cords.mjs), cut from the local gp_history archive for the creation dates 16 days before to one day after each
// reentry into <store>/m29/sets/<norad>.json (local only). No request to Space-Track. Files are read once each, in shards.
//   node experiments/sdn-gp-starlink-ffm-match/m29-extract-cords.mjs [--shard k/n]      (the last shard writes the object files: run `--merge` after all shards)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { store, args } from './common.mjs';
import { cordsObserved } from './lib/cords.mjs';
import { gpHistoryFiles } from './lib/spacetrack-local.mjs';

const objects = cordsObserved();
const parts = path.join(store, 'm29/cords-parts');
fs.mkdirSync(parts, { recursive: true });
const year = (ms) => new Date(ms).getUTCFullYear();
// file -> NORADs needed
const need = new Map();
for (const o of objects) {
  const obs = Date.parse(o.observedUtc);
  for (const y of new Set([year(obs - 16 * 86400e3), year(obs + 86400e3)])) for (const f of gpHistoryFiles(obs - 16 * 86400e3, obs + 86400e3, y)) { const set = need.get(f.file) ?? new Set(); set.add(o.norad); need.set(f.file, set); }
}
const files = [...need.keys()].sort();
if (args.merge) {
  for (const o of objects) {
    const sets = [];
    for (const f of fs.readdirSync(parts).filter((n) => n.endsWith(`.${o.norad}.json`))) sets.push(...JSON.parse(fs.readFileSync(path.join(parts, f), 'utf8')));
    sets.sort((a, b) => (a.EPOCH < b.EPOCH ? -1 : a.EPOCH > b.EPOCH ? 1 : a.CREATION_DATE < b.CREATION_DATE ? -1 : 1));
    fs.writeFileSync(path.join(store, 'm29/sets', `${o.norad}.json`), `${JSON.stringify({ norad: o.norad, name: o.name, rcs: o.type, truth: { source: 'cords-observed', ms: Date.parse(o.observedUtc) }, aerospace: { tleEpochUtc: o.tleEpochUtc, predictionUtc: o.predictionUtc, uncertaintyHours: o.uncertaintyHours }, sets })}\n`);
    console.error(`${o.norad} ${o.name}: ${sets.length} sets`);
  }
  process.exit(0);
}
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
console.error(`${objects.length} objects, ${files.length} files, shard ${k}/${n}`);
fs.mkdirSync(path.join(store, 'm29/sets'), { recursive: true });
for (const [i, file] of files.entries()) {
  if (i % n !== k) continue;
  const stem = path.basename(file).replace(/\.json\.gz$/, '');
  const todo = [...need.get(file)].filter((norad) => !fs.existsSync(path.join(parts, `${stem}.${norad}.json`)));
  if (!todo.length) continue;
  const wanted = new Set(todo);
  const found = new Map(todo.map((x) => [x, []]));
  for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'))) if (wanted.has(r.NORAD_CAT_ID)) found.get(r.NORAD_CAT_ID).push(r);
  for (const [norad, recs] of found) fs.writeFileSync(path.join(parts, `${stem}.${norad}.json`), JSON.stringify(recs));
  if (i % 20 === 0) console.error(`${i + 1}/${files.length} ${stem}`);
}
