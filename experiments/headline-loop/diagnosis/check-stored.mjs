// Setup check: this diagnosis's AP (published $PCF) and FFM rows against the stored rows behind the published cells, same window keys.
//   node experiments/headline-loop/diagnosis/check-stored.mjs <rows.jsonl ...>
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/opt/data/sdn-archive/operator-theory/ap';
const load = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /^rows.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(ROOT, dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const stores = { HX: ['b063/regimes-hx', 'ffm220/regimes'], DO: ['b051/regimes', 'ffm220/regimes'], LS: ['b051/regimes', 'ffm220/regimes'], GD: ['b051/regimes', 'ffm220/regimes'], IG: ['b051/regimes', 'ffm220/regimes'], HE: ['b051/regimes', 'ffm220/regimes'], GN: ['b051/truth2', 'ffm220/compare-truth2'], S1: ['b051/truth2', 'ffm220/compare-truth2'], P: ['b051/truth2', 'ffm220/compare-truth2'] };
const mine = process.argv.slice(2).flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => !r.error);
const cache = {};
const diffs = {};
for (const r of mine) {
  const g = r.group, [apDir, ffDir] = stores[g] ?? [];
  if (!apDir) continue;
  cache[apDir] ??= new Map(load(apDir).map((x) => [x.key, x]));
  cache[ffDir] ??= new Map(load(ffDir).map((x) => [x.key, x]));
  // stored keys: regimes by name; XM groups by norad
  const date = r.key.split('|').at(-1);
  const cands = [...cache[apDir].values()].filter((x) => x.key.startsWith(`${g}|`) && x.key.endsWith(date) && (x.name === r.name || x.key.includes(`|${r.name}|`) || (x.norad && String(r.name).length && false)));
  const a = cands[0] ?? [...cache[apDir].values()].find((x) => x.key.startsWith(`${g}|`) && x.key.endsWith(date) && x.name === r.name);
  const ff = a ? cache[ffDir].get(a.key) : null;
  for (const [mineArm, storeArm, src] of [['AP', `AP${r.arcH}`, a], ['F', `F${r.arcH}`, ff]]) {
    const m1 = r.arms[mineArm]?.days?.[1]?.e, s1 = src?.arms?.[storeArm]?.days?.[1]?.e;
    if (Number.isFinite(m1) && Number.isFinite(s1)) (diffs[`${g} ${r.arcH} ${mineArm}`] ??= []).push(Math.abs(m1 - s1) * 1000);
  }
}
for (const [k, v] of Object.entries(diffs)) { v.sort((x, y) => x - y); console.log(`${k}: ${v.length} windows matched, |difference| at day 1 median ${v[v.length >> 1].toFixed(3)} m, max ${v.at(-1).toFixed(3)} m`); }
