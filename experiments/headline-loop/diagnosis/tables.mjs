// Markdown tables for DIAGNOSIS.md from rep.mjs rows: per group and fit arc, the arms against truth by lead day (median km), the
// median per-window ratio to FFM, and the carrier's distance from FFM.
//   node experiments/headline-loop/diagnosis/tables.mjs <dir with rows-*.jsonl> [--tag ''|attr|t12]
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const tagArg = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : '';
const files = fs.readdirSync(dir).filter((f) => new RegExp(`^rows-[A-Z0-9]+-pub${tagArg}-\\d+\\.jsonl$`).test(f));
const rows = files.flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => !r.error);
const med = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const LEADS = [1, 2, 3, 5, 7];
const km = (x) => (x === null ? '-' : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3));
const NAMES = { AP: 'AP from truth (published $PCF)', 'AP-v': 'AP from truth, no drag', 'AP-w': 'AP from truth, wide priors ($PCF only)', K: "AP from truth, FFM's B and S held", 'K-v': "AP from truth, FFM's S held, no drag", 'R7-z': 'AP carrier (fitted to FFM over arc + 7 d)', 'R7-v-z': 'AP carrier (fitted to FFM over arc + 7 d)', 'R3-v': 'AP carrier, arc + 3 d', F: 'FFM' };
const groups = new Map();
for (const r of rows) { const k = `${r.group} ${r.arcH} h`; (groups.get(k) ?? groups.set(k, []).get(k)).push(r); }
for (const [g, list] of [...groups.entries()].sort()) {
  const arms = [...new Set(list.flatMap((r) => Object.keys(r.arms)))];
  console.log(`\n#### ${g}: ${list.length} windows\n`);
  console.log(`| Arm, against truth | ${LEADS.map((d) => `day ${d}`).join(' | ')} | ratio to FFM, day 1 / 2 / 3 / 7 |`);
  console.log(`| --- | ${LEADS.map(() => '--:').join(' | ')} | --: |`);
  for (const a of arms) {
    const ok = list.filter((r) => r.arms[a]?.days);
    const cells = LEADS.map((d) => km(med(ok.map((r) => r.arms[a].days[d]?.e))));
    const ratio = [1, 2, 3, 7].map((d) => { const x = med(ok.map((r) => r.arms[a].days[d]?.e / r.arms.F?.days?.[d]?.e)); return x === null ? '-' : x.toFixed(1); }).join(' / ');
    console.log(`| ${NAMES[a] ?? a} (n ${ok.length}) | ${cells.join(' | ')} | ${a === 'F' ? '1' : ratio} |`);
  }
  for (const a of arms.filter((x) => /^R/.test(x))) {
    const ok = list.filter((r) => r.arms[a]?.vsF);
    console.log(`| ${a} minus FFM (representation; arc ${km(med(ok.map((r) => r.arms[a].arcVsF?.e)))}) | ${LEADS.map((d) => km(med(ok.map((r) => r.arms[a].vsF[d]?.e)))).join(' | ')} | |`);
  }
}
