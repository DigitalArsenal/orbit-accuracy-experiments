#!/usr/bin/env node
// Step 10: the element sets of the truth NORADs, one worker per month, kept outside the repository (scratch).
//   node steps/10-sets.mjs <scratch dir> <from YYYY-MM-DD> <to YYYY-MM-DD> [workers]
// Each record passes the S4 name predicate (Starlink, Galileo, GSAT) before anything else; the counts are written.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readElementSets, shiftDay } from '../../../harness/gp-archive.mjs';
import { loadTruthIndex, ROOTS } from '../lib/truth.mjs';
import { HoldAudit, heldPredicate } from '../lib/holds.mjs';

const ARCHIVE = '/opt/data/sdn-archive/spacetrack/gp_history/by-creation';
if (process.argv[2] === '--worker') {
  const [, , , scratch, from, to, listFile] = process.argv;
  const want = new Set(JSON.parse(fs.readFileSync(listFile, 'utf8')));
  const audit = new HoldAudit();
  const r = readElementSets(ARCHIVE, from, to, { keep: (norad, g) => {
    audit.seen++;
    const p = heldPredicate({ norad: Number(g.NORAD_CAT_ID), name: g.OBJECT_NAME });
    if (p === 'name-starlink' || p === 'name-galileo-gsat') { audit.drop(p); return false; }
    return want.has(norad);
  }, lagDays: 3, duplicateEpochSeconds: 1 });
  // objectName kept for the audit of the retained rows
  fs.writeFileSync(path.join(scratch, `sets-${from}.json.gz`), zlib.gzipSync(JSON.stringify({ sets: r.sets, files: r.files, audit: audit.json() })));
  process.send?.({ from, sets: r.sets.length });
  process.exit(0);
}
const [scratch, from, to, nw = '8'] = process.argv.slice(2);
fs.mkdirSync(scratch, { recursive: true });
const hold = new HoldAudit();
const truth = loadTruthIndex({ audit: hold, roots: [...Object.values(ROOTS), ...(process.env.EXTRA_ROOTS ? process.env.EXTRA_ROOTS.split(',') : [])] });
const listFile = path.join(scratch, 'norads.json');
fs.writeFileSync(listFile, JSON.stringify([...truth.byObject.keys()]));
const months = [];
for (let d = from; d <= to;) { const e = new Date(Date.parse(`${d}T00:00:00Z`)); const nxt = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); const last = shiftDay(nxt, -1); months.push([d, last > to ? to : last]); d = nxt; }
let running = 0, i = 0, done = 0;
await new Promise((resolve) => {
  const next = () => {
    while (running < Number(nw) && i < months.length) {
      const [a, b] = months[i++];
      if (fs.existsSync(path.join(scratch, `sets-${a}.json.gz`))) { ++done; continue; }
      ++running;
      const c = fork(fileURLToPath(import.meta.url), ['--worker', scratch, a, b, listFile], { execArgv: [] });
      c.on('exit', (code) => { --running; ++done; if (code) console.error(`worker ${a} exit ${code}`); console.log(`${a}: done ${done}/${months.length}`); next(); });
    }
    if (running === 0 && i >= months.length) resolve();
  };
  next();
});
fs.writeFileSync(path.join(scratch, 'truth-hold-audit.json'), JSON.stringify(hold.json()));
