// The 2026-11-04 re-measure of AP5's and AP6's windows on the one-$OCM build (lib/build.mjs PIN: sdn-ap 0.5.1, sgp4-xp 0.2.1), store ap/b051, against the stored
// rows of the builds before it: per store and arm, the rows whose lead-day errors are byte-equal, and the Space Force XP's median error by group, arc and day,
// sgp4-xp 0.1.1 (ap/b0411) beside 0.2.1. Statistics only.
//   node experiments/operator-theory/lib/remeasure.mjs --json <file> --md <file>
import fs from 'node:fs';
import path from 'node:path';
import { BUILD_NOTE } from './build.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const A = '/opt/data/sdn-archive/operator-theory/ap';
const rowsIn = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const x = (s.length - 1) / 2; return (s[Math.floor(x)] + s[Math.ceil(x)]) / 2; };
const r4 = (x) => (x === null ? null : Number(x.toFixed(4)));
// store in b051, the stored store it is compared with, and which arms
const PAIRS = [
  ['truth', 'b0418/truth', /^AP/], ['truth2', 'b0418/truth2', /^AP/], ['regimes', 'b0418/regimes-apxp', /^(AP|XP)/],
  ['truth', 'b0411/truth', /^AP/], ['truth2', 'b0411/truth2', /^AP/], ['regimes', 'b0411/regimes', /^(AP|XP)/],
  ['compare-truth', 'b0411/compare-truth', /^XP/], ['compare-truth2', 'b0411/compare-truth2', /^XP/],
  ['regimes-hx', 'b0418/regimes-hx-apxp', /^(AP|XP)/], ['regimes-wa', 'b0418/regimes-wa-apxp', /^(AP|XP)/], ['regimes-hx', 'b0411/regimes-hx', /^(AP|XP)/], ['regimes-wa', 'b0411/regimes-wa', /^(AP|XP)/],
  ['ussf-truth', 'b0411/ussf-truth', /^U/], ['ussf-truth2', 'b0411/ussf-truth2', /^U/], ['ussf-regimes', 'b0411/ussf-regimes', /^U/], ['ussf-regimes-hx', 'b0411/ussf-regimes-hx', /^U/], ['ussf-regimes-wa', 'b0411/ussf-regimes-wa', /^U/],
];
const out = { build: BUILD_NOTE, store: `${A}/b051`, pairs: [], ussf: [] };
for (const [store, against, arms] of PAIRS) {
  const fresh = rowsIn(path.join(A, 'b051', store)), old = new Map(rowsIn(path.join(A, against)).map((r) => [r.key, r]));
  const t = {};
  for (const r of fresh) for (const [arm, a] of Object.entries(r.arms ?? {}).filter(([k]) => arms.test(k))) {
    const b = old.get(r.key)?.arms?.[arm], x = (t[arm] ??= { equal: 0, different: 0, notStored: 0 });
    if (!b) x.notStored += 1; else if (a.ok === b.ok && JSON.stringify(a.days ?? null) === JSON.stringify(b.days ?? null)) x.equal += 1; else x.different += 1;
  }
  out.pairs.push({ store, against, windows: fresh.length, arms: t });
}
for (const store of ['ussf-truth', 'ussf-truth2', 'ussf-regimes', 'ussf-regimes-hx', 'ussf-regimes-wa']) {
  const old = new Map(rowsIn(path.join(A, 'b0411', store)).map((r) => [r.key, r])), groups = new Map();
  for (const r of rowsIn(path.join(A, 'b051', store))) for (const [arm, a] of Object.entries(r.arms ?? {})) {
    const k = `${store === 'ussf-truth' ? 'T' : r.group}|${arm}`, L = groups.get(k) ?? groups.set(k, { n: 0, old: {}, new: {} }).get(k);
    L.n += 1;
    for (const d of ['1', '2', '3', '7']) { (L.new[d] ??= []).push(a.days?.[d]?.e); (L.old[d] ??= []).push(old.get(r.key)?.arms?.[arm]?.days?.[d]?.e); }
  }
  for (const [k, L] of groups) { const [group, arm] = k.split('|'); out.ussf.push({ group, arm, windows: L.n, medianKm: Object.fromEntries(['1', '2', '3', '7'].map((d) => [d, { old: r4(med(L.old[d])), new: r4(med(L.new[d])) }])) }); }
}
const lines = [`# Re-measure on ${BUILD_NOTE}`, '', '| Store | Against | Arm | Equal | Different | Not stored |', '|---|---|---|---:|---:|---:|'];
for (const p of out.pairs) for (const [arm, x] of Object.entries(p.arms)) lines.push(`| ${p.store} | ${p.against} | ${arm} | ${x.equal} | ${x.different} | ${x.notStored} |`);
lines.push('', 'Space Force XP, median km, sgp4-xp 0.1.1 / 0.2.1:', '', '| Group | Arm | Windows | Day 1 | Day 2 | Day 3 | Day 7 |', '|---|---|---:|---:|---:|---:|---:|');
for (const u of out.ussf) lines.push(`| ${u.group} | ${u.arm} | ${u.windows} | ${['1', '2', '3', '7'].map((d) => `${u.medianKm[d].old} / ${u.medianKm[d].new}`).join(' | ')} |`);
if (argOf('--json')) fs.writeFileSync(argOf('--json'), `${JSON.stringify(out, null, 1)}\n`);
if (argOf('--md')) fs.writeFileSync(argOf('--md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
