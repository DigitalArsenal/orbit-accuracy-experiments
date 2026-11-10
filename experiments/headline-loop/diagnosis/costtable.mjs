// cost.json (cost.mjs) as a Markdown table: µs per state, bare kernel, warm and cold, at 300 s and 60 s, per orbit and force selection.
//   node experiments/headline-loop/diagnosis/costtable.mjs <cost.json>
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const orbits = [...new Set(rows.map((r) => r.orbit))].sort((a, b) => (rows.find((r) => r.orbit === a).e - rows.find((r) => r.orbit === b).e) || a.localeCompare(b));
const configs = ['X', 'XD', 'Z', 'ZD', 'G', 'GD'];
const cls = (n) => (n > 0.8022 && n < 1.2033 ? 1 : n >= 1.6045 && n <= 2.4067 ? 2 : n > 2.4067 && n <= 3.61 ? 3 : n >= 1.2033 && n < 1.6045 ? 4 : 0);
const f = (x) => (x === undefined ? '-' : x >= 10 ? x.toFixed(0) : x.toFixed(1));
for (const key of ['s300', 's60']) {
  console.log(`\n${key === 's300' ? '300 s' : '60 s'} output, warm / cold µs per state`);
  console.log(`| Orbit | e | perigee km | rev/day | class | ${configs.join(' | ')} |`);
  console.log(`| --- | --: | --: | --: | --: | ${configs.map(() => '--:').join(' | ')} |`);
  for (const o of orbits) {
    const r0 = rows.find((r) => r.orbit === o);
    const cells = configs.map((c) => { const r = rows.find((x) => x.orbit === o && x.config === c); return r?.[key] ? `${f(r[key].warmUsPerState)} / ${f(r[key].coldUsPerState)}` : (r?.error ? 'err' : '-'); });
    console.log(`| ${o} | ${r0.e} | ${r0.hp} | ${r0.n.toFixed(2)} | ${cls(r0.n)} | ${cells.join(' | ')} |`);
  }
}
