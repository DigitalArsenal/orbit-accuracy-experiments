// Development look at TRAINING arcs and flags only (disclosed in PLAN-B.md): how the squared Mahalanobis distance of the uncalibrated bases
// splits by the causal flag and by the causal custody ratio, per class. Prints aggregates; writes nothing.
//   node experiments/v1c5/dev/tails.mjs [runDir]
import fs from 'node:fs';
import path from 'node:path';
const runDir = process.argv[2] ?? '/opt/data/sdn-archive/v1c5';
const jsonl = f => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const arcs = jsonl(path.join(runDir, 'train-sgp.jsonl')), flags = new Map(jsonl(path.join(runDir, 'events-train.jsonl')).map(r => [r.key, r]));
const q = (v, p) => { const s = [...v].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN; };
const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
const tierOf = r => !r ? 'noflag' : r.flagged ? 'FLAGGED' : (r.custody?.longestGapDays / r.custody?.thresholdDays >= 0.5 ? 'ratio>=.5' : 'low');
const rows = new Map();
for (const a of arcs) {
  if (a.skipped) continue;
  const r = flags.get(a.key); if (!r) continue;
  for (const s of a.samples) {
    const sc = s.bases.F?.score; if (!sc) continue;
    for (const key of [`${a.group}|${tierOf(r)}|${s.hours <= 12 ? 'short' : 'long'}`]) (rows.get(key) ?? rows.set(key, []).get(key)).push(sc.d2Predicted / 3);
  }
}
console.log('class | tier | horizons | n | mean | median | q95 | q99 | share of summed d2 in top 1%');
for (const [k, v] of [...rows].sort()) {
  const s = [...v].sort((a, b) => b - a), total = v.reduce((a, b) => a + b, 0), top = s.slice(0, Math.max(1, Math.floor(v.length * 0.01))).reduce((a, b) => a + b, 0);
  console.log(k.padEnd(48), String(v.length).padStart(6), mean(v).toPrecision(3).padStart(9), q(v, .5).toPrecision(3).padStart(9), q(v, .95).toPrecision(3).padStart(9), q(v, .99).toPrecision(3).padStart(9), (top / total).toFixed(2));
}
console.log('flag pairs', flags.size, 'flagged', [...flags.values()].filter(r => r.flagged).length);
