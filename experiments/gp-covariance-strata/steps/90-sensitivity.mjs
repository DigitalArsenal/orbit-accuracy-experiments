#!/usr/bin/env node
// Step 90: what TESTABLE becomes under single changes to the levers, on the same fresh pools and lawful spans (numbers only).
//   node steps/90-sensitivity.mjs <out json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIMES, BINS } from '../lib/bins.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(fs.readFileSync(path.join(here, '../../../results/gp-covariance-strata/frozen-constants.json'), 'utf8'));
const view = (rec, rule) => (rule === 'S1p' ? { oc: rec.s1p.oc, scan: rec.s1p.cScan } : { oc: rec.oc, scan: rec.cScan });
// A stratum record: {oc, cScan, clusters, nFresh, nEff, timeBlocks, s1p:{oc, cScan}}
function testable(regime, rec, rule, o) {
  if (regime === 'HEO' || !rec || !rec.oc) return false;
  if (regime === 'LEO-L' && !o.o4) return false;
  const { oc, scan } = view(rec, rule);
  const pass = (p) => p[0] >= o.gate && p[1] <= 0.05 && (rule === 'S1' ? p[2] <= 0.1 : true);
  if (!pass(oc)) return false;
  let cMin = null; for (const c of Object.keys(scan).map(Number).sort((a, b) => a - b)) if (pass(scan[c])) { cMin = Math.max(o.cFloor, c); break; }
  return cMin !== null && rec.clusters >= cMin && rec.nFresh >= 100 && rec.nEff >= 60 && rec.timeBlocks >= 6;
}
const scenarios = {
  baseline: { note: 'as frozen (O5 yes, O3 yes, O4 no; gate 0.8; C_min floor 3)', o: { gate: 0.8, cFloor: 3, o4: false } },
  'b O4 yes, Swarm and GRACE-FO': { note: 'LEO-L strata evaluated on their 3 clusters (Swarm A+C, Swarm B, GRACE-FO)', o: { gate: 0.8, cFloor: 3, o4: true } },
  'd C_min 2': { note: 'C_min floor 2 instead of 3; the OC gate unchanged', o: { gate: 0.8, cFloor: 2, o4: false } },
  'e OC gate 0.5': { note: 'P(label | correct) >= 0.5 instead of 0.8; the too-small side and T unchanged', o: { gate: 0.5, cFloor: 3, o4: false } },
};
const out = { rows: {} };
for (const [name, sc] of Object.entries(scenarios)) {
  if (!sc.o) { out.rows[name] = { note: sc.note, S1: null, S1p: null }; continue; }
  const row = { note: sc.note };
  for (const rule of ['S1', 'S1p']) {
    const list = [];
    for (const r of REGIMES) for (let b = 0; b < BINS.length; b++) {
      const key = `${r}|${b}`; const rec = fc.strata[key];
      if (testable(r, rec, rule, sc.o)) list.push(key);
    }
    row[rule] = { count: list.length, strata: list };
  }
  out.rows[name] = row;
}
// best P(label | correct) per regime under each rule, as the context for the gate
out.bestPCorrect = {};
for (const rule of ['S1', 'S1p']) { out.bestPCorrect[rule] = {}; for (const r of REGIMES) { const v = BINS.map((_, b) => fc.strata[`${r}|${b}`]).filter((x) => x.oc).map((x) => view(x, rule).oc[0]); if (v.length) out.bestPCorrect[rule][r] = Math.max(...v); } }
fs.writeFileSync(process.argv[2], `${JSON.stringify(out, null, 1)}\n`);
console.log('scenario | S1 | S1p'); for (const [k, v] of Object.entries(out.rows)) console.log(`${k} | ${v.S1 ? v.S1.count : 'n/a'} ${v.S1?.strata.join(',') ?? ''} | ${v.S1p ? v.S1p.count : 'n/a'} ${v.S1p?.strata.join(',') ?? ''}`);
console.log(JSON.stringify(out.bestPCorrect));
