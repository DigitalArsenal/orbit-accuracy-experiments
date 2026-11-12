// The window set: the low table's windows the coverage rows are flown on, drawn from the stores without reading any error.
//   node windows.mjs <out> --burns <the burn detector's final lists: <group>/<name>.burns.json>     drawn from the stores as they are now
//   node windows.mjs <out> --from <a windows file> --sha256 <its SHA-256> --s1-days <D>          a set drawn before, taken as it is
// Writes <out>/windows.txt (one line per window and fit arc: key|arcH for strong drag, key|arcH|group|name otherwise) and
// <out>/windows.json (its SHA-256, the counts, the near-700 km scored days). The lines name satellites and dates: they stay in <out>.
// Drawn from the stores:
// - Strong drag 2026 (P): every window and fit arc the numerical arm flew (FFMq) that the AP table scored at day 5.
// - Strong drag 2025 (T): the same, every 4th in (cutoff, name) order from the third.
// - Laser spheres (LS) and altimetry (DO): the AP table's windows scored at day 5 whose fit is plain on the full arc and that hold no burn
//   from the fit arc's start to cutoff + 5 days; a row with no burn list is taken whole only where it has no thrusters (LS). At most 60
//   per row and fit arc, every k-th in (cutoff, name) order.
// - Near 700 km (S1): the AP table's windows scored at day 5 with no burn from the fit arc's start to cutoff + D days, for D = 5, 3, 1 the
//   first that leaves 20 or more windows; the rows are scored on days 1 to D only.
// The table grows as windows are scored, so a set drawn later can hold more windows: a build compared against rows flown before is flown
// on the set those rows were flown on (--from).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { outDir, opt, strongDragWindows, tableRows, STORE, NUMERICAL, AP_TABLE, DAY, HOUR } from './lib.mjs';

const out = outDir(process.argv[2]);
const B = strongDragWindows();
const groupOf = new Map(B.map((w) => [`${w.key}|${w.arcH}`, w.group]));
const lineGroup = (l) => { const f = l.split('|'); return f.length === 6 ? f[4] : groupOf.get(l) ?? null; };
let lines, s1Days, from;
if (opt('--from')) {
  const text = fs.readFileSync(opt('--from'), 'utf8');
  const sha = crypto.createHash('sha256').update(text).digest('hex');
  if (sha !== opt('--sha256')) throw new Error(`${opt('--from')}: SHA-256 ${sha}, given ${opt('--sha256')}`);
  s1Days = Number(opt('--s1-days'));
  if (![1, 2, 3, 4, 5].includes(s1Days)) throw new Error('--s1-days D: the near-700 km rows\' last scored day, 1 to 5');
  lines = text.split('\n').filter(Boolean);
  const unknown = lines.filter((l) => !lineGroup(l));
  if (unknown.length) throw new Error(`${unknown.length} lines name no window of the stores`);
  from = { file: path.basename(opt('--from')), sha256: sha };
} else {
  const BURNS = opt('--burns');
  if (!BURNS || !fs.existsSync(BURNS)) throw new Error('--burns <dir>: the burn detector\'s final lists (<group>/<name>.burns.json)');
  const lt = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const cache = new Map();
  const burnsOf = (group, name) => {
    const k = `${group}|${name}`;
    if (!cache.has(k)) {
      const f = path.join(BURNS, group, `${name.replace(/[^A-Za-z0-9]+/g, '_')}.burns.json`);
      cache.set(k, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).burns.map((b) => [Date.parse(b.from), Date.parse(b.to)]) : null);
    }
    return cache.get(k);
  };
  const cutoffOf = (r) => Date.parse(`${r.key.split('|')[2]}T00:00:00Z`);
  const burnIn = (bl, a, b) => bl.some(([f, t]) => f < b && t > a);
  const scoredDay5 = (r) => { const v = r.days?.['5']; return !!v && (typeof v !== 'object' || Object.keys(v).length > 0); };
  // strong drag
  const sd = B.filter((w) => w.inTable && w.group === 'P').map((w) => `${w.key}|${w.arcH}`);
  const t25 = B.filter((w) => w.inTable && w.group === 'T').sort((x, y) => lt(x.date, y.date) || lt(x.name, y.name));
  const sdT = t25.filter((w, i) => i >= 2 && (i - 2) % 4 === 0).map((w) => `${w.key}|${w.arcH}`);
  // laser spheres and altimetry
  const rows = tableRows();
  const PLAIN = new Set(['the full arc', 'plain', 'plain, no 72 h arc']);
  const by = new Map();
  for (const r of rows) {
    const g = r.group;
    if (!['DO', 'LS'].includes(g) || !scoredDay5(r) || r.error || r.apError) continue;
    if (r.fitProcess != null && !PLAIN.has(r.fitProcess)) continue;
    const bl = burnsOf(g, r.name);
    if (bl === null && g !== 'LS') continue;
    const d0 = cutoffOf(r);
    if (bl && burnIn(bl, d0 - r.arcH * HOUR, d0 + 5 * DAY)) continue;
    const k = `${g}|${r.arcH}`;
    if (!by.has(k)) by.set(k, { g, arcH: r.arcH, R: [] });
    by.get(k).R.push(r);
  }
  const cal = [];
  for (const { g, R } of [...by.values()].sort((x, y) => lt(x.g, y.g) || x.arcH - y.arcH)) {
    R.sort((x, y) => lt(x.key.split('|')[2], y.key.split('|')[2]) || lt(x.name, y.name));
    const step = Math.max(1, Math.ceil(R.length / 60));
    cal.push(...R.filter((r, i) => i % step === 0).map((r) => `${r.key}|${r.arcH}|${g}|${r.name}`));
  }
  // near 700 km
  const s1rows = rows.filter((r) => r.group === 'S1' && scoredDay5(r));
  let s1 = [];
  for (const days of [5, 3, 1]) {
    const keep = [];
    for (const r of s1rows) {
      const bl = burnsOf('S1', r.name);
      if (bl === null) continue;
      const d0 = cutoffOf(r);
      if (!burnIn(bl, d0 - r.arcH * HOUR, d0 + days * DAY)) keep.push(`${r.key}|${r.arcH}|S1|${r.name}`);
    }
    if (keep.length >= 20 || days === 1) { s1 = [...new Set(keep)].sort(); s1Days = days; break; }
  }
  lines = [...sd, ...sdT, ...cal, ...s1];
  from = { store: STORE, numerical: NUMERICAL, apTable: AP_TABLE, burns: path.resolve(BURNS) };
}
const text = `${lines.join('\n')}\n`;
fs.writeFileSync(path.join(out, 'windows.txt'), text);
const byRegime = {};
for (const l of lines) { const g = lineGroup(l); byRegime[g] = (byRegime[g] ?? 0) + 1; }
const manifest = { windows: lines.length, sha256: crypto.createHash('sha256').update(text).digest('hex'), byRegime, s1ScoredDays: Array.from({ length: s1Days }, (x, i) => i + 1), from };
fs.writeFileSync(path.join(out, 'windows.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${lines.length} windows`, JSON.stringify(byRegime), `near 700 km scored to day ${s1Days}`, manifest.sha256);
