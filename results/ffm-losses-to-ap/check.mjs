#!/usr/bin/env node
// E2E of experiments-ffm-losses-report-20261104: the study's files parse, the README's class table sums to its loss count,
// the five fix records are named, and nothing under this directory carries a Space-Track line or an element set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error(`FFM-LOSSES-REPORT FAIL: ${m}`); process.exit(1); };
for (const f of ['cells.json', 'drag-leo.json', 'high-orbit.json', 'heo.json', 'drag-leo-skeptic.json', 'high-orbit-skeptic.json', 'heo-skeptic.json']) {
  try { JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { fail(`${f} does not parse: ${e.message}`); }
}
const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
const total = Number((readme.match(/\*\*([\d,]+) of ([\d,]+)\*\* paired window-leads/) || [])[1]?.replace(/,/g, ""));
const rows = readme.split("\n").map((l) => l.trim()).map((l) => l.match(/^\| (Weather \(shared density error\)|Maneuver|Force model|Unexplained|Settings|Scoring|Estimator) \| ([\d,]+) \| /)).filter(Boolean).map((m) => Number(m[2].replace(/,/g, "")));
if (rows.length !== 7) fail(`class table has ${rows.length} rows, want 7`);
const sum = rows.reduce((a, b) => a + b, 0);
if (!Number.isFinite(total) || sum !== total) fail(`class rows sum to ${sum}, README says ${total}`);
for (const id of ['experiments-ffm-harness-forces-20261104', 'modules-ffm-rk78-error-control-20261104', 'experiments-ffm-ecom2-srp-fit-20261104', 'experiments-ffm-maneuver-flags-20261104', 'experiments-heo-truth-nodes-20261104']) if (!readme.includes(id)) fail(`README does not name ${id}`);
for (const f of fs.readdirSync(dir)) {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  if (/^1 \d{5}[A-Z] /m.test(t) || /^2 \d{5} /m.test(t)) fail(`${f} carries a two-line element set`);
  if (/MEAN_MOTION|BSTAR/.test(t) && f !== 'check.mjs') fail(`${f} names element-set fields`);
}
console.log(`FFM-LOSSES-REPORT PASS: ${rows.length} classes sum to ${total} losses; 7 JSON files parse; 5 fix records named`);
