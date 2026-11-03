// GEO-TRUTH.md: the tables of parts W and F, every window and the windows with no burn from the start of the fit to day 7, and the same split of AP6.md's geostationary BeiDou and
// QZSS windows. Statistics only.
//   node experiments/operator-theory/geo-truth-table.mjs --out results/ap-truth/geo
import fs from 'node:fs';
import path from 'node:path';
const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out'), B = '/opt/data/sdn-archive/operator-theory/ap/b040', DAY = 86400000;
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const rowsIn = (d) => fs.readdirSync(d).filter((f) => /^rows(-\d+)?\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(d, f)));
const byKey = (d) => new Map(rowsIn(d).map((r) => [r.key, r]));
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b), x = (s.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };
const fig = (v) => (v.length ? { n: v.length, median: pct(v, 0.5), p95: pct(v, 0.95) } : { n: 0 });
const burnsOf = (file) => new Map(JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8')).satellites.map((s) => [s.name, s.burns.map((b) => Date.parse(b.day))]));
const ARMS = [['SGP4', 'S'], ['XP', 'XP'], ['XPU', 'U'], ['AP', 'AP'], ['FFM', 'F']];
const DAYS = ['1', '2', '3', '7'];
const e = (r, a, d) => r?.arms?.[a]?.days?.[d]?.e;

function cells(label, rows, ussf, burns, arcs) {
  const out = [];
  for (const fit of arcs) for (const scope of ['all', 'no burn']) for (const sat of ['all', ...new Set(rows.map((r) => r.name))]) {
    const list = rows.filter((r) => !r.error && (sat === 'all' || r.name === sat)).filter((r) => {
      if (scope === 'all') return true;
      const c = Date.parse(r.cutoff), b = burns.get(r.name) ?? [];
      // A burn day is a sidereal day of the truth; it touches the window when that day overlaps the fit or the 7 days after it.
      return !b.some((t) => t + DAY > c - fit * 3600000 && t < c + 7 * DAY);
    });
    const arms = {};
    for (const [name, code] of ARMS) arms[name] = Object.fromEntries(DAYS.map((d) => [d, fig(list.map((r) => e(code === 'U' ? ussf.get(r.key) : r, `${code}${fit}`, d)).filter(Number.isFinite))]));
    out.push({ group: label, satellite: sat, fitHours: fit, scope, windows: list.length, arms });
  }
  return out;
}
const doc = { registered: 'experiments/operator-theory/GEO-TRUTH.md', reading: 'report only', truth: 'WAAS message type 9 broadcast, URA 2 m (part W, part F); GFZ multi-GNSS rapid orbits (BeiDou and QZSS)', cells: [], files: [] };
const waas = rowsIn(path.join(B, 'regimes-wa')), waasU = byKey(path.join(B, 'ussf-regimes-wa'));
doc.cells.push(...cells('Geostationary, commercial (WAAS)', waas, waasU, burnsOf('burns-waas.json'), [24, 72]));
const six = rowsIn(path.join(B, 'regimes')).filter((r) => r.group === 'GE'), sixU = byKey(path.join(B, 'ussf-regimes'));
doc.cells.push(...cells('Geostationary, BeiDou and QZSS (rule written after seeing three of them)', six, sixU, burnsOf('burns-beidou.json'), [72]));
for (const r of jsonl(path.join(B, 'geo-files', 'rows.jsonl'))) doc.files.push({ object: r.object, start: r.start, fitHours: r.fitHours, days: Object.fromEntries(Object.entries(r.arms).map(([k, a]) => [k === 'S' ? 'SGP4' : k === 'U' ? 'XPU' : k === 'F' ? 'FFM' : k === 'operator' ? 'Operator' : k, a.days ? Object.fromEntries(Object.entries(a.days).map(([d, v]) => [d, v.e])) : { error: a.error }])) });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'geo-truth.json'), `${JSON.stringify(doc, null, 1)}\n`);
const r3 = (x) => (x === undefined ? '-' : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3));
const md = ['# Geostationary orbits against truth', '', 'Report only, `experiments/operator-theory/GEO-TRUTH.md`. Median 3D error, km.', '', '| Orbit | Satellite | Fit, h | Windows | Day | SGP4 | XP, whiteroom | XP, Space Force | AP | FFM |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const c of doc.cells.filter((x) => x.satellite === 'all' || x.group.startsWith('Geostationary, commercial'))) for (const d of DAYS) md.push(`| ${c.group}${c.scope === 'no burn' ? ', no burn' : ''} | ${c.satellite} | ${c.fitHours} | ${c.windows} | ${d} | ${ARMS.map(([a]) => r3(c.arms[a][d].median)).join(' | ')} |`);
md.push('', 'Fitted to the operators\' own files, against the broadcast, by day after the end of the fit:', '', '| Satellite | File start | Fit, h | Arm | Days 1..7 |', '| --- | --- | --- | --- | --- |');
for (const f of doc.files) for (const [arm, days] of Object.entries(f.days)) md.push(`| ${f.object} | ${f.start.slice(0, 16)} | ${f.fitHours} | ${arm} | ${days.error ? days.error : Object.entries(days).map(([d, v]) => `${d}: ${r3(v)}`).join(', ')} |`);
fs.writeFileSync(path.join(OUT, 'geo-truth.md'), `${md.join('\n')}\n`);
console.log(md.slice(6, 6 + 200).join('\n'));
