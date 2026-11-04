// Planet's files in the store and their publication times (HTTP Last-Modified). Local only, CC BY-NC 4.0, never committed. Reading and
// selection only: each arc's publication is that of the first file holding its newest state.
import fs from 'node:fs';
import path from 'node:path';
import { config, store } from '../common.mjs';

const P = config.planet;
const published = () => JSON.parse(fs.readFileSync(path.join(store, P.publishedFile))).days;
let table = null;
/** The publication time of file day `day`, UTC ms, or undefined. */
export function publishedMs(day) { table ??= published(); return table[day] ? Date.parse(table[day]) : undefined; }
export const publishedDays = () => { table ??= published(); return Object.keys(table).sort(); };
const fileOf = (day) => { let found = null; for (const dir of [...P.dirs, path.join(store, 'planet')]) { const f = path.join(dir, `planet_${day}.states`); if (fs.existsSync(f)) found = f; } return found; };
export const planetBytes = (day) => { const f = fileOf(day); return f ? fs.readFileSync(f) : null; };
/** day of the first file holding each state: `${hwid}|${ttMs}` -> file day, over the file days given in order. */
export function firstFiles(days) {
  const first = new Map();
  for (const day of [...days].sort()) {
    const bytes = planetBytes(day);
    if (!bytes) continue;
    for (const line of bytes.toString().split('\n')) {
      const f = line.trim().split(/\s+/);
      if (f.length < 9 || !/^[0-9a-f]{4}$/i.test(f[0])) continue;
      const key = `${f[0].toLowerCase()}|${Date.UTC(2000, 0, 1, 12) + Math.round(Number(f[1]) * 1e3)}`;
      if (!first.has(key)) first.set(key, day);
    }
  }
  return first;
}
