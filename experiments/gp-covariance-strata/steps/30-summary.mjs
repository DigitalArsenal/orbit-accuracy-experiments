#!/usr/bin/env node
// Step 30: the dev rows as strata counts and the S4 audit (aggregates only; nothing per object is written).
//   node steps/30-summary.mjs <out json> <scratch dir>... (the first holds plane-input.json and the cache)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadRows } from '../lib/data.mjs';
import { REGIMES, BINS } from '../lib/bins.mjs';
import { HoldAudit, auditRetained, HELD_PATH, PREDICATES } from '../lib/holds.mjs';

const [out, ...dirs] = process.argv.slice(2);
const d = await loadRows(dirs);
const n = d.norad.length;
const cell = new Map();
const retained = new HoldAudit();
for (let i = 0; i < n; i++) {
  const key = `${d.regime[i] < 0 ? 'none' : REGIMES[d.regime[i]]}|${d.b[i]}`;
  const c = cell.get(key) ?? { rows: 0, objects: new Set(), clusters: new Set(), days: new Set(), sets: new Set() };
  c.rows++; c.objects.add(d.norad[i]); c.clusters.add(d.cluster[i]); c.days.add(Math.floor(d.t[i] / 86400000)); c.sets.add(d.setMs[i] * 1000 + d.norad[i] % 1000);
  cell.set(key, c);
  if (i % 7 === 0) auditRetained([{ norad: d.norad[i], t: d.t[i], setMs: d.setMs[i], gnss: d.gnss[i] }], retained);
}
const strata = {};
for (const [k, c] of cell) strata[k] = { rows: c.rows, objects: c.objects.size, clusters: c.clusters.size, days: c.days.size };
// merged audit counts from the builders
const dropped = Object.fromEntries(PREDICATES.map((p) => [p, 0]));
const read = new Set();
let counts = { objects: 0, sets: 0, targets: 0, rows: 0, missing: 0, noSpan: 0, held: 0 };
for (const dir of dirs) for (const f of fs.readdirSync(dir).filter((x) => /^rows-w\d+\.counts\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const k of Object.keys(counts)) counts[k] += j.counts[k];
  for (const [p, v] of Object.entries(j.audit.dropped)) dropped[p] += v;
  for (const p of Object.keys(j.reference)) read.add(p);
}
const setAudit = Object.fromEntries(PREDICATES.map((p) => [p, 0])); let setFiles = 0;
const sdir = dirs[0];
for (const f of fs.readdirSync(sdir).filter((x) => /^sets-.*\.json\.gz$/.test(x))) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(sdir, f))));
  for (const [p, v] of Object.entries(j.audit.dropped)) setAudit[p] += v;
  setFiles += Object.keys(j.files).length;
}
const heldPaths = [...read].filter((p) => HELD_PATH.test(p));
const truthAudit = JSON.parse(fs.readFileSync(path.join(sdir, 'truth-hold-audit.json'), 'utf8'));
fs.writeFileSync(out, `${JSON.stringify({
  rows: n, builder: { ...counts, ageOutsideBinDropped: d.ageOutside },
  s4: { setRecordsDroppedByName: { starlink: setAudit['name-starlink'], galileoGsat: setAudit['name-galileo-gsat'] },
    truthObjectBlocksDropped: { sp3PrnE: truthAudit.dropped['sp3-prn-E'], c2HeldObject: truthAudit.dropped['norad-c2-held'] },
    truthTargetsDroppedByTime: { c2Calibration20260601: dropped['c2-calibration-2026-06-01'], swarmGracefo20261031: dropped['swarm-gracefo-2026-10-31'], iss2025: dropped['iss-state-2025'] },
    heldRowsRetained: retained.retainedHeld, truthFilesRead: read.size, gpFilesRead: setFiles, inputPathsUnderHolds: heldPaths.length },
  strata }, null, 1)}\n`);
console.log(n, JSON.stringify(strata).length);
