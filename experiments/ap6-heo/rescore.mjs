// TRUTH-SERIES.md, amendment of 2026-11-05: the scored TESS (HE) cells of results/ap-truth/compare/cells.json against the series of ten-minute nodes. all-regimes.mjs
// flew every HE window twice on the same builds (lib/build.mjs PIN; FFM, SGP4 as stored): before, the reader as it was (one-minute records); after, the reader
// that keeps the nodes. Each cell is computed as compare-cells.mjs computes it (median and 95th percentile of the windows' lead-day errors); the before cells must
// equal cells.json's TESS rows. Statistics only.
//   node experiments/ap6-heo/rescore.mjs --before <dir> --after <dir> --out results/ap-truth/tess-nodes-20261105     (each dir holds regimes/ and ussf-regimes/)
import fs from 'node:fs';
import path from 'node:path';
import { pct, asc } from '../operator-theory/lib/compare.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = argOf('--out');
if (!argOf('--before') || !argOf('--after') || !OUT) throw new Error('--before, --after and --out');
const rowsIn = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const round = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
const COLUMNS = [['SGP4', 'S'], ['XP', 'XP'], ['XPU', 'U'], ['AP', 'AP'], ['FFM20', 'F']];
const DAYS = ['1', '2', '3', '7'];
const load = (dir) => {
  const main = new Map(rowsIn(path.join(dir, 'regimes')).filter((r) => r.group === 'HE' && !r.error).map((r) => [r.key, r]));
  const ussf = new Map(rowsIn(path.join(dir, 'ussf-regimes')).filter((r) => r.group === 'HE').map((r) => [r.key, r]));
  return { main, ussf, e: (key, code, fit, day) => (code === 'U' ? ussf : main).get(key)?.arms?.[`${code}${fit}`]?.days?.[day]?.e };
};
const before = load(argOf('--before')), after = load(argOf('--after'));
const keys = [...before.main.keys()].sort();
if (keys.join() !== [...after.main.keys()].sort().join()) throw new Error('the before and after runs hold different windows');
const fits = [...new Set(keys.flatMap((k) => Object.keys(before.main.get(k).arms).map((a) => Number(a.replace(/^\D+/, '')))))].sort(asc);
const cellOf = (run, fit, day) => Object.fromEntries(COLUMNS.map(([column, code]) => {
  const v = keys.map((k) => run.e(k, code, fit, day)).filter(Number.isFinite).sort(asc);
  return [column, v.length ? [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length] : null];
}).filter(([, x]) => x));
const published = JSON.parse(fs.readFileSync(path.join(REPO, 'results/ap-truth/compare/cells.json'), 'utf8')).rows.filter((r) => r.regime === 'Highly elliptical' && r.reference === 'truth');
const cells = [], mismatched = [];
for (const fit of fits) for (const day of DAYS) {
  const b = cellOf(before, fit, day), a = cellOf(after, fit, day);
  for (const row of published.filter((r) => r.fit === fit && r.lead === Number(day) * 24)) {
    for (const [column, x] of Object.entries(row.arms)) if (JSON.stringify(x) !== JSON.stringify(b[column])) mismatched.push(`${row.level} fit ${fit} lead ${row.lead} ${column}: cells.json ${JSON.stringify(x)}, before ${JSON.stringify(b[column])}`);
  }
  cells.push({ fit, lead: Number(day) * 24, n: keys.length, before: b, after: a });
}
const windows = keys.map((k) => ({ key: k, arms: Object.fromEntries(fits.flatMap((fit) => COLUMNS.map(([column, code]) => [`${column}${fit}`, Object.fromEntries(DAYS.map((d) => [d, [round(before.e(k, code, fit, d)), round(after.e(k, code, fit, d))]]))]))) }));
const doc = {
  amendment: '2026-11-05',
  plan: 'experiments/ap6-heo/TRUTH-SERIES.md',
  cause: 'the TESS kernels store a state every minute; nine in ten lie on the straight line between ten-minute nodes, so every other state of the 300 s lattice sat inside the orbit',
  change: 'the SPK reader keeps each segment\'s nodes (experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs nodeRows); the HE windows fit and score on the 600 s nodes',
  builds: 'every arm on the builds cells.json names; before and after differ only in the reader',
  fields: 'cells: one per fit and lead, the same at the regime, provider and satellite levels (TESS is the regime\'s one satellite); each column [median km, 95th percentile km, forecasts], before and after. windows: per window, column and lead day, [before km, after km].',
  cellsJsonReproduced: mismatched.length === 0,
  cells,
  windows,
};
fs.mkdirSync(path.dirname(`${OUT}.json`), { recursive: true });
fs.writeFileSync(`${OUT}.json`, `${JSON.stringify(doc, null, 1)}\n`);
const lines = ['# TESS cells re-scored on the ten-minute nodes (amendment 2026-11-05)', '', `Plan: experiments/ap6-heo/TRUTH-SERIES.md. ${keys.length} windows; the before figures equal cells.json's TESS rows: ${mismatched.length ? 'NO' : 'yes'}. Median km (95th percentile km), before -> after.`, '', `| Fit h | Lead h | ${COLUMNS.map(([c]) => c).join(' | ')} |`, `|---:|---:|${COLUMNS.map(() => '---|').join('')}`];
for (const c of cells) lines.push(`| ${c.fit} | ${c.lead} | ${COLUMNS.map(([col]) => (c.before[col] ? `${c.before[col][0]} (${c.before[col][1]}) -> ${c.after[col][0]} (${c.after[col][1]})` : '')).join(' | ')} |`);
fs.writeFileSync(`${OUT}.md`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
if (mismatched.length) { console.log(`before differs from cells.json: ${mismatched.slice(0, 6).join('; ')}`); process.exit(1); }
