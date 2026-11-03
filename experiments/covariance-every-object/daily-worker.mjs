// node daily-worker.mjs <k> <n> <day> <outFile> <limit|0>: the objects with norad % n == k, issue time E = <day>T00:00Z.
import fs from 'node:fs'; import path from 'node:path';
import { listFiles, readFile, epochMs } from './lib/archive.mjs'; import { enumerate, regime } from './lib/pairs.mjs'; import { openSgp4, rtn } from './lib/sgp4.mjs'; import { uHat } from './lib/inflate.mjs'; import { FLAG_U } from './lib/n0sim.mjs';
const [k, n, day, outFile, limit] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4], process.argv[5], Number(process.argv[6])];
const cfg = JSON.parse(process.env.COV_DAILY_CONFIG), E = Date.parse(`${day}T00:00:00Z`), D30 = E - 30 * 86400e3;
const dayBefore = (d, m) => new Date(Date.parse(`${d}T00:00:00Z`) - m * 86400e3).toISOString().slice(0, 10);
const by = new Map(), dropped = {};
for (const f of listFiles(dayBefore(day, 31), day)) {
  // whole-day and window files created at or before E: a window file named for E's day starts at 00:00 and is created after E, so only earlier days count
  if (path.basename(f).slice(0, 10) >= day) continue;
  const r = readFile(f, (x) => x % n === k);
  for (const [p, c] of Object.entries(r.dropped)) dropped[p] = (dropped[p] ?? 0) + c;
  for (const s of r.sets) { const t = epochMs(s.epoch); if (t >= D30 - 0 && t < E && epochMs(s.created) <= E) (by.get(s.norad) ?? by.set(s.norad, []).get(s.norad)).push(s); }
}
const open = await openSgp4(), out = [];
let objs = [...by.keys()].sort((a, b) => a - b); if (limit) objs = objs.slice(0, limit);
for (const norad of objs) {
  const { sets, pairs } = enumerate(by.get(norad), D30, E, epochMs);
  const older = new Set(pairs.map((p) => p.k)).size;
  if (older < 12) { out.push({ norad, older, pairs: pairs.length, base: true, reason: 'older<12' }); continue; }
  const own = new Map(), cross = new Map(); // one fresh instance per set
  const need = new Set(); pairs.forEach((p) => { need.add(p.k); need.add(p.j); });
  const byK = new Map(); pairs.forEach((p, i) => (byK.get(p.k) ?? byK.set(p.k, []).get(p.k)).push(i));
  for (const i of need) { const h = await open(sets[i]); own.set(i, await h.at(sets[i].t)); for (const pi of byK.get(i) ?? []) cross.set(pi, await h.at(sets[pairs[pi].j].t)); h.destroy(); }
  const r2 = [[], [], []], a = [[], [], []]; let used = 0, lastReg = null;
  pairs.forEach((p, i) => {
    const c = cross.get(i), o = own.get(p.j); if (!c || !o) return;
    const reg = regime(sets[p.j].el[0], sets[p.j].el[1], sets[p.j].el[2]); lastReg = reg; const A = cfg.a[`${reg}|${p.bin}`]; if (!A) return;
    const rho = rtn(c, o); used++; for (let ax = 0; ax < 3; ax++) { r2[ax].push(rho[ax] ** 2); a[ax].push(A[ax]); }
  });
  if (used === 0) { out.push({ norad, older, pairs: pairs.length, base: true, reason: 'no admitted bin' }); continue; }
  const u = [0, 1, 2].map((ax) => uHat(r2[ax], a[ax], cfg.n0));
  out.push({ norad, regime: lastReg, older, pairs: used, base: false, u: u.map((x) => Number(x.toPrecision(6))), flagged: u.some((x) => x > FLAG_U) });
}
fs.writeFileSync(outFile, out.map((x) => JSON.stringify(x)).join('\n') + (out.length ? '\n' : ''));
fs.writeFileSync(outFile + '.dropped.json', JSON.stringify(dropped));
