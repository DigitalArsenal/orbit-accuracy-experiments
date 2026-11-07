// S1-24H-DAY7.md: its windows, the 2026 sample, its stores and its holds. Selection and reading only: every figure is a stored row's.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HELD_NORADS } from './pairs.mjs';
import { windowState } from './steps.mjs';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const A = '/opt/data/sdn-archive/operator-theory';
export const STORES = {
  rows2025: path.join(A, 's1-step-free'), flags2025: path.join(repo, 'results/operator-theory/s1-step-free/table.json'),
  windows2026: path.join(A, 'ap/b0411/truth2'), ffm2026: path.join(A, 'ap/b0411/compare-truth2'), ap2026: path.join(A, 'ap/b051/truth2'), flags2026: path.join(repo, 'results/operator-theory/maneuver-flags/flags.json'),
  out: path.join(A, 's1-24h-day7'),
};
// maneuver-flags.mjs's holds: C2's held objects, Swarm, GRACE-FO, every Starlink group, any Sentinel-1 cutoff from 2026-06-01, no Sentinel-1 truth after 2026-06-08.
export const EXCLUDE = { norads: new Set([...HELD_NORADS, 31698, 22824, 66315, 8820]), names: /stella|terrasar|sentinel-1d|lageos ?1\b|starlink|swarm|grace/i, s1CutoffBefore: '2026-06-01', s1TruthTo: '2026-06-08T00:00:00Z' };
export const NORADS = [39634, 62261];
export const SAMPLE = { n: 26, salt: 's1-24h-day7|' };
export const FIT_HOURS = 24, LEAD_HOURS = 168;

/** Only Sentinel-1 lines are parsed (the row's key leads it); a held row is never parsed. */
const s1Rows = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort()
  .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l.startsWith('{"key":"S1|')).map((l) => JSON.parse(l)));
const byKey = (rows) => new Map(rows.map((r) => [r.key, r]));
export const held = (w) => EXCLUDE.norads.has(Number(w.norad)) || EXCLUDE.names.test(w.name ?? '') || !NORADS.includes(Number(w.norad)) || String(w.cutoff).slice(0, 10) >= EXCLUDE.s1CutoffBefore;
const e7 = (r, arm) => r?.arms?.[arm]?.days?.['7']?.e;
const hash = (key) => crypto.createHash('sha256').update(`${SAMPLE.salt}${key}`).digest('hex');

/** The set's windows, in key order: { key, set, norad, name, cutoff, stored: { F24, AP24 } (day 7 km), flag }. 2025: every step-free day-7 window of
 *  s1-step-free with both arms scored. 2026: the first SAMPLE.n by hash of the maneuver-flags step-free day-7 windows with both arms scored; `pool` the count. */
export function windowsOf(set) {
  let list;
  if (set === '2025') {
    const rows = byKey(s1Rows(STORES.rows2025)), flags = JSON.parse(fs.readFileSync(STORES.flags2025, 'utf8')).flags;
    list = [...rows.values()].map((r) => ({ key: r.key, set, norad: r.norad, name: r.name, cutoff: r.cutoff.slice(0, 10), stored: { F24: e7(r, 'F24'), AP24: e7(r, 'AP24') }, flag: flags[r.key] }));
  } else if (set === '2026') {
    const ffm = byKey(s1Rows(STORES.ffm2026)), ap = byKey(s1Rows(STORES.ap2026)), flags = new Map(JSON.parse(fs.readFileSync(STORES.flags2026, 'utf8')).windows.filter((w) => w.group === 'S1').map((w) => [w.key, w]));
    list = s1Rows(STORES.windows2026).filter((r) => !r.error).map((r) => ({ key: r.key, set, norad: r.norad, name: r.name, cutoff: r.cutoff.slice(0, 10), stored: { F24: e7(ffm.get(r.key), 'F24'), AP24: e7(ap.get(r.key), 'AP24') }, flag: flags.get(r.key) }));
  } else throw new Error(`--set 2025 or 2026, not ${set}`);
  for (const w of list) if (held(w)) throw new Error(`${w.key}: held`);
  const pool = list.filter((w) => w.flag && Number.isFinite(w.stored.F24) && Number.isFinite(w.stored.AP24) && windowState(w.flag, FIT_HOURS, LEAD_HOURS).stepFree);
  const chosen = set === '2025' ? pool : [...pool].sort((a, b) => (hash(a.key) < hash(b.key) ? -1 : 1)).slice(0, SAMPLE.n);
  return { pool: pool.length, windows: chosen.sort((a, b) => (a.key < b.key ? -1 : 1)) };
}

/** The history cutoffs of (b): every day from 30 to 1 before each window's cutoff, per object: [{ key, norad, cutoff }]. */
export function historyOf(windows) {
  const out = new Map();
  for (const w of windows) for (let k = 30; k >= 1; k -= 1) {
    const cutoff = new Date(Date.parse(`${w.cutoff}T00:00:00Z`) - k * 86400000).toISOString().slice(0, 10), key = `S1|${w.norad}|${cutoff}`;
    out.set(key, { key, norad: w.norad, cutoff });
  }
  return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}
