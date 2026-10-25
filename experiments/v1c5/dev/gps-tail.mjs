// Development look (training only): what the causal custody record says about GPS samples with a huge d²/3.
import fs from 'node:fs';
import path from 'node:path';
const runDir = process.argv[2] ?? '/opt/data/sdn-archive/v1c5';
const jsonl = f => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arcs = jsonl(path.join(runDir, 'train-sgp.jsonl')), flags = new Map(jsonl(path.join(runDir, 'events-train.jsonl')).map(r => [r.key, r]));
const feat = r => ({ age: r.custody?.ageDays, med: r.custody?.medianGapDays, longest: r.custody?.longestGapDays, thr: r.custody?.thresholdDays, ev45: r.detector?.events?.length ?? 0, ev7: r.detector?.recent?.length ?? 0, sets: r.custody?.sets, flagged: r.flagged });
const tail = [], body = [];
for (const a of arcs) {
  if (a.skipped || a.group !== 'GPS') continue;
  const r = flags.get(a.key); if (!r) continue;
  const d2 = a.samples.map(s => s.bases.F?.score?.d2Predicted / 3).filter(Number.isFinite);
  if (!d2.length) continue;
  const worst = Math.max(...d2);
  (worst > 100 ? tail : body).push({ norad: a.norad, key: a.key, worst, ...feat(r) });
}
const stat = (arr, k) => { const v = arr.map(x => x[k]).filter(Number.isFinite).sort((a, b) => a - b); return v.length ? `${v[0].toFixed(2)} / ${v[v.length >> 1].toFixed(2)} / ${v.at(-1).toFixed(2)}` : '-'; };
console.log('arcs with worst d2/3 > 100:', tail.length, 'others:', body.length);
for (const k of ['age', 'med', 'longest', 'thr', 'ev45', 'ev7', 'sets']) console.log(k.padEnd(8), 'tail min/med/max', stat(tail, k).padEnd(28), 'body', stat(body, k));
console.log('tail flagged share', (tail.filter(t => t.flagged).length / tail.length).toFixed(2), 'body', (body.filter(t => t.flagged).length / body.length).toFixed(2));
const byObj = new Map(); for (const t of tail) byObj.set(t.norad, (byObj.get(t.norad) ?? 0) + 1);
console.log('objects in tail:', [...byObj].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => `${n}:${c}`).join(' '));
