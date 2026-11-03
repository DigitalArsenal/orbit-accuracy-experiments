// AP7.md, after cycle-ap7-site.sh: builds the 0.4.11 store the site tools read. Each row is 0.4.0's row with every AP and XP arm removed and
// 0.4.11's AP and XP arms put in, by the same key. SGP4, FFM, the Space Force's XP and the operator's own file do not depend on the AP build, so
// they are 0.4.0's rows. A key that 0.4.11 did not reach stops the merge: no 0.4.0 AP or XP figure is carried over. The Space Force's stores and
// SGP4's laser stores are linked, not copied. Data steps only.
//   node experiments/operator-theory/ap7-merge.mjs
import fs from 'node:fs';
import path from 'node:path';
import { BUILD, AP_ARM } from './lib/build.mjs';

const AP = '/opt/data/sdn-archive/operator-theory/ap', OLD = path.join(AP, 'b040'), NEW = path.join(AP, BUILD);
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const files = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));
const ROWS = /^rows-\d+\.jsonl$/;

/** Rows of `from` keyed by `key`, AP and XP arms (`drop`) replaced by those of `fresh`, written as one file per old file name pattern. */
function merge({ name, from, fresh, out, key, drop, re = ROWS, single = null }) {
  const add = new Map();
  for (const dir of [fresh].flat()) for (const f of files(dir, re)) for (const r of jsonl(f)) add.set(key(r), r);
  fs.mkdirSync(out, { recursive: true });
  for (const f of files(out, /\.jsonl$/)) fs.rmSync(f);
  let n = 0, missing = 0, errored = 0;
  const groups = new Map();
  for (const f of files(from, re)) {
    const target = single ?? path.basename(f).replace(/-\d+\.jsonl$/, '-0.jsonl');
    for (const r of jsonl(f)) {
      const k = key(r), a = add.get(k);
      if (r.error) { (groups.get(target) ?? groups.set(target, []).get(target)).push(r); n += 1; continue; }
      if (!a) { missing += 1; if (missing <= 3) console.error(`${name}: 0.4.11 has no row for ${k}`); continue; }
      if (a.error) errored += 1;
      const arms = Object.fromEntries(Object.entries(r.arms).filter(([arm]) => !drop(arm)));
      for (const [arm, v] of Object.entries(a.arms ?? {})) if (drop(arm)) arms[arm] = v;
      (groups.get(target) ?? groups.set(target, []).get(target)).push({ ...r, arms, ...(a.error ? { errorNew: a.error } : {}), build: BUILD });
      n += 1;
    }
  }
  if (missing) throw new Error(`${name}: ${missing} rows that 0.4.11 did not reach; rerun cycle-ap7-site.sh first`);
  for (const [target, rows] of groups) fs.writeFileSync(path.join(out, target), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  console.error(`${name}: ${n} rows${errored ? `, ${errored} with a 0.4.11 error` : ''}`);
}

const truthKey = (r) => r.key;
const apOrXp = (arm) => /^(AP|XP)\d+$/.test(arm);
merge({ name: 'compare-truth', from: path.join(OLD, 'compare-truth'), fresh: path.join(NEW, 'compare-truth-xp'), out: path.join(NEW, 'compare-truth'), key: truthKey, drop: (arm) => /^XP\d+$/.test(arm) });
merge({ name: 'compare-truth2', from: path.join(OLD, 'compare-truth2'), fresh: path.join(NEW, 'compare-truth2-xp'), out: path.join(NEW, 'compare-truth2'), key: truthKey, drop: (arm) => /^XP\d+$/.test(arm) });
// 0.4.0's regimes store also holds the HX rows, so its 0.4.11 rows come from both runs.
merge({ name: 'regimes', from: path.join(OLD, 'regimes'), fresh: [path.join(NEW, 'regimes-apxp'), path.join(NEW, 'regimes-hx-apxp')], out: path.join(NEW, 'regimes'), key: truthKey, drop: apOrXp });
for (const s of ['regimes-hx', 'regimes-wa']) merge({ name: s, from: path.join(OLD, s), fresh: path.join(NEW, `${s}-apxp`), out: path.join(NEW, s), key: truthKey, drop: apOrXp });
const pairKey = (r) => `${r.key}|${r.olderStart}|${r.newerStart}`;
const providerArm = (arm) => /^A-(APn|XP)@/.test(arm) || arm.startsWith(`${AP_ARM}@`);
merge({ name: 'providers', from: path.join(OLD, 'providers'), fresh: path.join(NEW, 'providers-apxp'), out: path.join(NEW, 'providers'), key: pairKey, drop: providerArm, re: /^rows(-iss)?-\d+\.jsonl$/ });
merge({ name: 'geo-files', from: path.join(OLD, 'geo-files'), fresh: path.join(NEW, 'geo-files-apxp'), out: path.join(NEW, 'geo-files'), key: truthKey, drop: (arm) => arm === 'AP' || arm === 'XP', re: /^rows\.jsonl$/, single: 'rows.jsonl' });

for (const s of ['ussf-truth', 'ussf-truth2', 'ussf-regimes', 'ussf-regimes-hx', 'ussf-regimes-wa', 'ussf-providers', 'ussf-laser', 'laser-sgp4', 'laser-sgp4-72', 'laser-sgp4-high']) {
  const link = path.join(NEW, s);
  if (fs.existsSync(path.join(OLD, s)) && !fs.existsSync(link)) fs.symlinkSync(path.join(OLD, s), link);
}
console.error(`${BUILD}: merged`);
