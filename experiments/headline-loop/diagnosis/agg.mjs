// Aggregate rep.mjs rows: per arm, the median over windows of the 3D error against truth and against FFM by lead day, the median
// per-axis RMS at a chosen day, the median arc RMS, and the median of the per-window ratio to FFM. Windows where an arm failed are
// counted, not dropped silently. Aggregates only.
//   node experiments/headline-loop/diagnosis/agg.mjs <rows.jsonl ...> [--day 3] [--json out.json] [--filter "THEMIS"] [--arms AP,K,...]
import fs from 'node:fs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const DAY = Number(opt('day', 3)), FILTER = opt('filter', null), JSON_OUT = opt('json', null), ONLY = opt('arms', null)?.split(',');
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rows = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const latest = new Map();
for (const r of rows) {
  if (FILTER && !new RegExp(FILTER).test(r.key)) continue;
  if (opt('arc', null) && Number(opt('arc')) !== r.arcH) continue;
  const prev = latest.get(`${r.key}|${r.arcH}`);
  latest.set(`${r.key}|${r.arcH}`, prev ? { ...prev, ...r, arms: { ...prev.arms, ...r.arms } } : r);
}
const ws = [...latest.values()].filter((r) => !r.error);
const errored = [...latest.values()].filter((r) => r.error).map((r) => `${r.key}: ${r.error}`);
const arms = [...new Set(ws.flatMap((r) => Object.keys(r.arms)))].filter((a) => !ONLY || ONLY.includes(a) || a === 'F');
const LEADS = [1, 2, 3, 5, 7];
const f = (x) => (x === null || x === undefined ? '   -  ' : x >= 10 ? x.toFixed(1).padStart(6) : x.toFixed(3).padStart(6));
const out = { windows: ws.length, errored, arms: {} };
console.log(`windows ${ws.length}${errored.length ? `, ${errored.length} errored` : ''}; median km by lead day (1 2 3 5 7) vs truth | vs FFM | ratio to FFM (median of per-window ratios) | day ${DAY} R T N | arc RMS vs truth, vs FFM | failed`);
for (const a of arms) {
  const ok = ws.filter((r) => r.arms[a] && r.arms[a].ok !== false && r.arms[a].days);
  const failed = ws.filter((r) => r.arms[a] && (r.arms[a].ok === false || !r.arms[a].days)).length;
  const missing = ws.filter((r) => !r.arms[a]).length;
  const t = LEADS.map((d) => med(ok.map((r) => r.arms[a].days[d]?.e)));
  const v = LEADS.map((d) => med(ok.map((r) => r.arms[a].vsF?.[d]?.e)));
  const ratio = LEADS.map((d) => med(ok.map((r) => r.arms[a].days[d]?.e / r.arms.F.days[d]?.e)));
  const axes = ['r', 't', 'n'].map((c) => med(ok.map((r) => r.arms[a].days[DAY]?.[c])));
  const arc = med(ok.map((r) => r.arms[a].arc?.e)), arcF = med(ok.map((r) => r.arms[a].arcVsF?.e));
  out.arms[a] = { n: ok.length, failed, missing, truth: t, vsF: v, ratioToF: ratio, axesDay: axes, arc, arcVsF: arcF,
    S: med(ok.map((r) => r.arms[a].agom ?? r.arms[a].S)), B: med(ok.map((r) => r.arms[a].bterm ?? r.arms[a].B)) };
  console.log(`${a.padEnd(13)} n${String(ok.length).padStart(3)} ${t.map(f).join('')} |${v.map(f).join('')} |${ratio.map((x) => (x === null ? '   -  ' : x.toFixed(1).padStart(6))).join('')} |${axes.map(f).join('')} |${f(arc)}${f(arcF)} | ${failed ? `${failed} failed` : ''}${missing ? ` ${missing} not run` : ''}`);
}
if (errored.length) console.log(errored.slice(0, 8).join('\n'));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
