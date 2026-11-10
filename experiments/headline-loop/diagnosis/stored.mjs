// The stored per-window rows behind the published cells (AP on 0.5.1/0.6.3 stores, FFM 2.2.0 store), restricted to a group's windows:
// medians by lead day for AP and FFM over the published windows and over this diagnosis's subsets. Aggregates only.
//   node experiments/headline-loop/diagnosis/stored.mjs
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/opt/data/sdn-archive/operator-theory/ap';
const rows = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /^rows.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(ROOT, dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const byKey = (list) => new Map(list.map((r) => [r.key, r]));
const sets = [
  { group: 'GN', ap: 'b051/truth2', ff: 'ffm220/compare-truth2', arm: '24' },
  { group: 'S1', ap: 'b051/truth2', ff: 'ffm220/compare-truth2', arm: '24' },
  { group: 'P', ap: 'b051/truth2', ff: 'ffm220/compare-truth2', arm: '24' },
  { group: 'DO', ap: 'b051/regimes', ff: 'ffm220/regimes', arm: '24' },
  { group: 'LS', ap: 'b051/regimes', ff: 'ffm220/regimes', arm: '24' },
  { group: 'HX', ap: 'b063/regimes-hx', ff: 'ffm220/regimes', arm: '72' },
];
for (const s of sets) {
  const A = byKey(rows(s.ap).filter((r) => (r.group ?? r.key.split('|')[0]) === s.group)), F = byKey(rows(s.ff).filter((r) => (r.group ?? r.key.split('|')[0]) === s.group));
  const keys = [...A.keys()].filter((k) => F.has(k));
  const sub = (pred) => keys.filter(pred);
  const date = (k) => k.split('|').at(-1);
  const subsets = { all: sub(() => true), janfeb: sub((k) => date(k) >= '2026-01-01' && date(k) <= '2026-02-21') };
  for (const [name, ks] of Object.entries(subsets)) {
    if (!ks.length) continue;
    const line = [1, 2, 3, 7].map((d) => {
      const a = ks.map((k) => A.get(k).arms?.[`AP${s.arm}`]?.days?.[d]?.e), f = ks.map((k) => F.get(k).arms?.[`F${s.arm}`]?.days?.[d]?.e);
      const am = med(a), fm = med(f);
      return `d${d} AP ${am?.toFixed(4)} FFM ${fm?.toFixed(4)} x${am && fm ? (am / fm).toFixed(1) : '-'}`;
    }).join(' | ');
    console.log(`${s.group} ${s.arm}h ${name} n=${ks.length}: ${line}`);
  }
}
