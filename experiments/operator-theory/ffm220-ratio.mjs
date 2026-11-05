// COMPARE.md, 2026-11-05: the paired FFM/AP ratio of the precise-orbit cells before and after FFM moved from propagator/ffm 2.0.4 to 2.2.0 (lib/build.mjs FFM_220).
// For each cells.json regime, fit and day: the windows where AP (sdn-ap 0.5.1, ap/b051), FFM on 2.0.4 (ap/b0411, the stores cells.json read before) and FFM on
// 2.2.0 (ap/ffm220, cycle-ffm220.sh) all scored; the ratio is exp(median by window of ln(FFM / AP)), each build's on the same windows. Report only.
//   node experiments/operator-theory/ffm220-ratio.mjs --out results/ap-truth/compare/ffm-ap-ratio.json
import fs from 'node:fs';
import path from 'node:path';
import { median } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';
import { HELD_ROW } from './lib/pairs.mjs';
import { FFM_220 } from './lib/build.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const AP = '/opt/data/sdn-archive/operator-theory/ap', OLD = path.join(AP, 'b0411'), B051 = path.join(AP, 'b051'), NEW = path.join(AP, 'ffm220');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const byKey = (...dirs) => new Map(dirs.flatMap((d) => rowsIn(d)).map((r) => [r.key, r]));
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
// cells.json's precise-orbit regimes, by the same membership: AP5.md's cuts, then AP6.md's groups.
const regimes = [
  { regime: 'Strong drag, 2025', members: rowsIn(path.join(OLD, 'truth')).filter((r) => !r.error), ap: byKey(path.join(B051, 'truth')), old: byKey(path.join(OLD, 'compare-truth')), now: byKey(path.join(NEW, 'compare-truth')), arcs: [24] },
  ...[['Strong drag, 2026', 'P'], ['Near 700 km', 'S1'], ['Medium Earth orbit', 'GN']].map(([regime, group]) => ({ regime, members: rowsIn(path.join(OLD, 'truth2')).filter((r) => r.group === group && !r.error), ap: byKey(path.join(B051, 'truth2')), old: byKey(path.join(OLD, 'compare-truth2')), now: byKey(path.join(NEW, 'compare-truth2')), arcs: [24, 72] })),
];
const six = { ap: byKey(path.join(B051, 'regimes'), path.join(B051, 'regimes-hx')), old: byKey(path.join(OLD, 'regimes')), now: byKey(path.join(NEW, 'regimes')) };
const live = rowsIn(path.join(OLD, 'regimes')).filter((r) => !r.error);
for (const [group, g] of Object.entries(GROUPS)) {
  const members = live.filter((r) => r.group === group);
  if (!members.length) continue;
  regimes.push({ regime: g.label, members, ...six, arcs: [...new Set(members.flatMap((r) => Object.keys(r.arms).filter((a) => /^F\d+$/.test(a)).map((a) => Number(a.slice(1)))))].sort((a, b) => a - b) });
}
const ratio = (pairs) => Number(Math.exp(median(pairs.map(([f, a]) => Math.log(f / a)))).toFixed(3));
const out = [];
for (const c of regimes) for (const fit of c.arcs) for (const day of ['1', '2', '3', '7']) {
  const w = c.members.map((r) => ({ name: r.name, ap: e(c.ap.get(r.key), `AP${fit}`, day), old: e(c.old.get(r.key), `F${fit}`, day), now: e(c.now.get(r.key), `F${fit}`, day) }))
    .filter((x) => [x.ap, x.old, x.now].every((v) => Number.isFinite(v) && v > 0));
  const notRun = c.members.filter((r) => Number.isFinite(e(c.old.get(r.key), `F${fit}`, day)) && !c.now.has(r.key)).length;
  out.push({ regime: c.regime, fit, lead: Number(day) * 24, windows: w.length, satellites: new Set(w.map((x) => x.name)).size, notRun,
    before: w.length ? ratio(w.map((x) => [x.old, x.ap])) : null, after: w.length ? ratio(w.map((x) => [x.now, x.ap])) : null });
}
const doc = { ffm: { before: { version: '2.0.4', sha256: 'c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2' }, after: { version: FFM_220.version, sha256: FFM_220.wasmSha256 } }, ap: 'sdn-ap 0.5.1 (ap/b051)', statistic: 'exp(median by window of ln(FFM / AP)), on the windows where AP and both FFM builds scored', rows: out };
if (argOf('--out')) fs.writeFileSync(argOf('--out'), `${JSON.stringify(doc, null, 1)}\n`);
for (const r of out) console.log(`${r.regime.padEnd(40)} fit ${String(r.fit).padStart(3)} lead ${String(r.lead).padStart(3)} h  n ${String(r.windows).padStart(4)}  FFM/AP ${r.before} -> ${r.after}${r.notRun ? `  (${r.notRun} windows not yet on 2.2.0)` : ''}`);
