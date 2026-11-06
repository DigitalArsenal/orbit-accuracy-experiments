// FIT-SECOND-SOLUTION.md part 2: the paired table from run.mjs's rows (arms base and cand). node paired.mjs [store]
// Per object, the ratio candidate / base of the 3D RMS per window at days 1, 3 and 7: median and 95 % window-cluster
// bootstrap interval (10,000 draws, seed 20261106); line 2 holds when the upper bound is at most 1.05 at each day on THEMIS.
import fs from 'node:fs';
import path from 'node:path';

const STORE = process.argv[2] ?? '/opt/data/sdn-archive/operator-theory/fit-second-solution/measure';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const rows = fs.readdirSync(STORE).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(STORE, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => r.ok);
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
function bootstrap(v) {
  let s = 20261106 >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const meds = [];
  for (let b = 0; b < 10000; b += 1) meds.push(median(v.map(() => v[Math.floor(rnd() * v.length)])));
  meds.sort((a, b) => a - b);
  return [meds[250], meds[9750]];
}
const base = new Map(rows.filter((r) => r.arm === 'base').map((r) => [r.key, r]));
const cand = rows.filter((r) => r.arm === 'cand' && base.has(r.key));
const out = { registration: 'experiments/operator-theory/FIT-SECOND-SOLUTION.md', builds: Object.fromEntries([...new Map(rows.map((r) => [r.arm, r.sha256]))]), objects: [] };
for (const object of ['THEMIS', 'CHANDRA', 'TESS']) {
  const rs = cand.filter((r) => r.object === object);
  if (!rs.length) continue;
  const ratio = (k) => { const v = rs.map((r) => r.days[k].e / base.get(r.key).days[k].e); return { median: median(v), interval: bootstrap(v) }; };
  out.objects.push({ object, windows: rs.length, ratio: Object.fromEntries([1, 3, 7].map((k) => [k, ratio(k)])),
    pass: object === 'THEMIS' ? [1, 3, 7].every((k) => ratio(k).interval[1] <= 1.05) : null,
    fitSeconds: { base: median(rs.map((r) => base.get(r.key).fitSeconds)), cand: median(rs.map((r) => r.fitSeconds)) },
    perWindow: rs.map((r) => { const b = base.get(r.key); return { key: r.key, fitRmsM: [b.fit.rmsKm * 1000, r.fit.rmsKm * 1000], bterm: [b.elements.bterm, r.elements.bterm], iterations: [b.fit.iterations, r.fit.iterations], day1: [b.days[1].e, r.days[1].e], day3: [b.days[3].e, r.days[3].e], day7: [b.days[7].e, r.days[7].e] }; }) });
}
fs.writeFileSync(path.join(HERE, 'measure.json'), `${JSON.stringify(out, null, 1)}\n`);
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const lines = ['# Second start: paired measurement (FIT-SECOND-SOLUTION.md part 2)', '', `Builds: ${Object.entries(out.builds).map(([a, s]) => `${a} ${s.slice(0, 12)}`).join(', ')}. Rows: ${STORE}.`, '',
  '| Object | Windows | Day 1 ratio | Day 3 ratio | Day 7 ratio | Line 2 | Fit (s) base / cand |', '| --- | --: | --: | --: | --: | --- | --: |',
  ...out.objects.map((o) => `| ${o.object} | ${o.windows} | ${[1, 3, 7].map((k) => `${f(o.ratio[k].median, 3)} [${f(o.ratio[k].interval[0], 3)}, ${f(o.ratio[k].interval[1], 3)}]`).join(' | ')} | ${o.pass === null ? 'report only' : o.pass ? 'PASS' : 'fail'} | ${f(o.fitSeconds.base)} / ${f(o.fitSeconds.cand)} |`), '',
  '| Window | Fit RMS (m) base / cand | BTERM base / cand | Day 1 (m) | Day 3 (m) | Day 7 (m) |', '| --- | --: | --: | --: | --: | --: |',
  ...out.objects.flatMap((o) => o.perWindow.map((w) => `| ${w.key} | ${f(w.fitRmsM[0])} / ${f(w.fitRmsM[1])} | ${w.bterm[0].toPrecision(4)} / ${w.bterm[1].toPrecision(4)} | ${f(w.day1[0])} / ${f(w.day1[1])} | ${f(w.day3[0])} / ${f(w.day3[1])} | ${f(w.day7[0])} / ${f(w.day7[1])} |`)), ''];
fs.writeFileSync(path.join(HERE, 'MEASURE.md'), lines.join('\n'));
console.log(lines.slice(0, 9).join('\n'));
