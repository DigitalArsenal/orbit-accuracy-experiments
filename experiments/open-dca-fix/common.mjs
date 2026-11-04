// open-dca-fix: configuration, the store, the planted seed, the statistics of PLAN.md. XM's and XM3's code is imported unchanged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.OPEN_DCA_FIX_STORE ?? config.store;
export const modulesRoot = path.resolve(process.env.SDN_MODULES_ROOT ?? path.join(root, '../../main-packages/space-data-network-modules'));
export const HOUR = 3600000, DAY = 86400000, MINUTE = 60000;
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const iso = (t) => new Date(t).toISOString();
export const dateOf = (t) => iso(t).slice(0, 10);
export const dayName = (t) => dateOf(t).replaceAll('-', '');
export const dayStart = (name) => Date.parse(`${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}T00:00:00Z`);
export function daysOf(from, to) { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) out.push(dayName(t)); return out; }
export function appendJsonl(file, row) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(row)}\n`); }
export const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = `${file}.${process.pid}.tmp`; fs.writeFileSync(t, `${JSON.stringify(value, null, 1)}\n`); fs.renameSync(t, file); }
/** ISO week of a date, 2026-W01. */
export function isoWeek(t) { const d = new Date(t); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); const y = d.getUTCFullYear(); const j4 = new Date(Date.UTC(y, 0, 4)); const w = 1 + Math.round(((d - j4) / DAY - 3 + ((j4.getUTCDay() + 6) % 7)) / 7); return `${y}-W${String(w).padStart(2, '0')}`; }

// ---- statistics ----------------------------------------------------------------------------------------------------------------
export const median = (v) => { const x = [...v].sort((a, b) => a - b), n = x.length; return n % 2 ? x[(n - 1) / 2] : (x[n / 2 - 1] + x[n / 2]) / 2; };
/** The 10 % trimmed mean. A failure is +Infinity and lands in the upper tail. */
export function trimmed(v, share = config.statistic.trim) {
  const x = [...v].sort((a, b) => a - b), k = Math.floor(x.length * share), kept = x.slice(k, x.length - k);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** ISO-week cluster bootstrap of a statistic over items [{week, value}]: { value, lo, hi, p (share of draws at or above 0), n, weeks }. */
export function bootstrap(items, statistic = trimmed, { draws = config.statistic.draws, seed = config.statistic.seed, level = 0.95 } = {}) {
  const byWeek = new Map();
  for (const it of items) { if (!byWeek.has(it.week)) byWeek.set(it.week, []); byWeek.get(it.week).push(it.value); }
  const weeks = [...byWeek.values()], rng = mulberry(seed), out = [];
  for (let d = 0; d < draws; d += 1) { const pick = []; for (let k = 0; k < weeks.length; k += 1) pick.push(...weeks[Math.floor(rng() * weeks.length)]); out.push(statistic(pick)); }
  out.sort((a, b) => a - b);
  const at = (q) => out[Math.min(out.length - 1, Math.max(0, Math.round(q * (out.length - 1))))];
  return { value: statistic(items.map((i) => i.value)), lo: at((1 - level) / 2), hi: at(1 - (1 - level) / 2), p: out.filter((x) => x >= 0).length / out.length, n: items.length, weeks: weeks.length };
}
/** Holm at a one-sided family level over { name: p }: the names that pass. */
export function holm(ps, family = 0.025) {
  const order = Object.entries(ps).sort((a, b) => a[1] - b[1]), passed = [];
  for (let i = 0; i < order.length; i += 1) { if (order[i][1] <= family / (order.length - i)) passed.push(order[i][0]); else break; }
  return passed;
}
