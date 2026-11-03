// node pairs-worker.mjs <k> <n> <outDir>: objects k, k+n, ... of truth-objects.json from the pass-1 index.
import fs from 'node:fs'; import path from 'node:path';
import { openSgp4, rtn } from './lib/sgp4.mjs'; import { enumerate, regime } from './lib/pairs.mjs'; import { epochMs } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs';
const [k, n, dir] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const byNorad = new Map();
for (let w = 0; w < 8; w++) for (const l of fs.readFileSync(path.join(dir, '..', 'dev-index', `part-${w}.jsonl`), 'utf8').split('\n')) if (l) { const s = JSON.parse(l); (byNorad.get(s.norad) ?? byNorad.set(s.norad, []).get(s.norad)).push(s); }
const open = await openSgp4();
for (const o of TRUTH.objects.filter((_, i) => i % n === k)) {
  const from = Date.parse(`${o.from}T00:00:00Z`), to = Date.parse(`${o.to}T00:00:00Z`) + 86400e3;
  const { sets, pairs } = enumerate(byNorad.get(o.norad) ?? [], from, to, epochMs);
  const own = new Array(sets.length), cross = pairs.map(() => null), byK = new Map();
  pairs.forEach((p, i) => (byK.get(p.k) ?? byK.set(p.k, []).get(p.k)).push(i));
  const need = new Set(pairs.map((p) => p.j)); for (const p of pairs) need.add(p.k);
  for (const i of [...need].sort((a, b) => a - b)) {
    const h = await open(sets[i]);
    own[i] = await h.at(sets[i].t);
    for (const pi of byK.get(i) ?? []) cross[pi] = await h.at(sets[pairs[pi].j].t);
    h.destroy();
  }
  const out = fs.createWriteStream(path.join(dir, `${o.norad}.jsonl`));
  let invalid = 0;
  pairs.forEach((p, i) => { if (!cross[i] || !own[p.j]) { invalid++; return; } const rho = rtn(cross[i], own[p.j]).map((x) => Number(x.toPrecision(9))); out.write(JSON.stringify([sets[p.j].t, p.bin, regime(sets[p.j].el[0], sets[p.j].el[1], sets[p.j].el[2]), rho.slice(0, 6), sets[p.k].t, sets[p.j].c]) + '\n'); });
  await new Promise((r) => out.end(r));
  fs.writeFileSync(path.join(dir, `${o.norad}.summary.json`), JSON.stringify({ norad: o.norad, sets: sets.length, pairs: pairs.length - invalid, invalidPropagations: invalid }));
}
