// Step 1: the element-set histories of the registered objects, from the local Space-Track GP history (creation-day files), into the local
// store (never committed). Per object, every SGP4 set (EPHEMERIS_TYPE 0) created from 10 days before its first window's information cutoff E
// to the last E of its windows; the sets needed by one window are cut from these at run time (created not after E, epoch not after E).
//   node experiments/sdn-ap-gp-history-od/history.mjs
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { config, windows, store, frozen, endOf, DAY, write, sha256 } from './common.mjs';

frozen();
const gpDir = path.join(config.archive, config.gp.dir);
const BACK_DAYS = 10; // 120 h of states, a set up to 48 h before the first of them, and a margin
const need = new Map(); // norad -> { from, to } (ms of creation)
for (const w of windows) {
  const e = endOf(w);
  const n = need.get(w.norad) ?? { from: Infinity, to: -Infinity };
  n.from = Math.min(n.from, e - BACK_DAYS * DAY); n.to = Math.max(n.to, e);
  need.set(w.norad, n);
}
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const days = new Set();
for (const { from, to } of need.values()) for (let t = Date.parse(`${dayOf(from)}T00:00:00Z`); t <= to; t += DAY) days.add(dayOf(t));
const sets = new Map();
const files = {};
let read = 0;
for (const day of [...days].sort()) {
  const dirYear = path.join(gpDir, day.slice(0, 4));
  if (!fs.existsSync(dirYear)) continue;
  for (const name of fs.readdirSync(dirYear).filter((n) => n.startsWith(day) && n.endsWith('.json.gz')).sort()) {
    const raw = fs.readFileSync(path.join(dirYear, name));
    files[`${day.slice(0, 4)}/${name}`] = sha256(raw);
    for (const g of JSON.parse(gunzipSync(raw))) {
      const norad = Number(g.NORAD_CAT_ID);
      const n = need.get(norad);
      if (!n || g.MEAN_ELEMENT_THEORY !== config.gp.theory || String(g.EPHEMERIS_TYPE) !== config.gp.ephemerisType) continue;
      const created = Date.parse(`${g.CREATION_DATE}Z`);
      if (created < n.from || created > n.to) continue;
      const list = sets.get(norad) ?? new Map();
      list.set(String(g.GP_ID), { GP_ID: String(g.GP_ID), NORAD_CAT_ID: g.NORAD_CAT_ID, OBJECT_NAME: g.OBJECT_NAME, OBJECT_ID: g.OBJECT_ID, EPOCH: g.EPOCH, CREATION_DATE: g.CREATION_DATE, MEAN_MOTION: g.MEAN_MOTION, ECCENTRICITY: g.ECCENTRICITY, INCLINATION: g.INCLINATION,
        RA_OF_ASC_NODE: g.RA_OF_ASC_NODE, ARG_OF_PERICENTER: g.ARG_OF_PERICENTER, MEAN_ANOMALY: g.MEAN_ANOMALY, BSTAR: g.BSTAR, MEAN_MOTION_DOT: g.MEAN_MOTION_DOT, MEAN_MOTION_DDOT: g.MEAN_MOTION_DDOT });
      sets.set(norad, list);
    }
    read += 1;
  }
  if (read % 20 === 0) console.error(`${day}: ${read} files`);
}
const out = path.join(store, 'sets');
for (const norad of need.keys()) write(path.join(out, `${norad}.json`), `${JSON.stringify([...(sets.get(norad)?.values() ?? [])])}\n`);
write(path.join(store, 'history-files.json'), { read, days: days.size, files });
console.error(`${need.size} objects, ${[...sets.values()].reduce((s, m) => s + m.size, 0)} sets from ${read} files`);
