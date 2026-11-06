// PER-REV-FLAG.md end to end: the amendment precedes every re-flag row; the flag (lib/steps.mjs revFlag) reproduces S1-24H-DAY7's classification from its stored
// rows (35 of 35 day-7 FFM losses flagged, its 5 burn-free windows not); every re-flag row written by the committed runner on propagator/ffm 2.2.0; the tables
// reproduce from the stored rows; the holds.
//   node experiments/operator-theory/steps.e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FFM_220 } from './lib/build.mjs';
import { HOUR, revDifferences, revFlag, periodOf } from './lib/steps.mjs';
import { STORES as DAY7 } from './lib/day7.mjs';
import { STORE, EXCLUDE, heldWindow } from './per-rev-flag.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const RESULTS = path.join(repo, 'results/operator-theory/per-rev-flag'), PLAN = 'experiments/operator-theory/PER-REV-FLAG.md';
const git = (...a) => execFileSync('git', ['-C', repo, ...a]).toString('utf8');
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
const read = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);

// 1. The S1-24H-DAY7 classification, from its stored rows: FFM24's revolutions less the truth's 30 s revolutions over [cutoff - 24 h, cutoff + 168 h].
const day7 = ['windows-2025', 'windows-2026'].flatMap((d) => read(path.join(DAY7.out, d)));
const classed = day7.map((r) => {
  const D0 = Date.parse(r.cutoff), F = r.arms.F24, A = r.arms.AP24;
  const flag = revFlag(revDifferences(F.revolutions, r.truth.fine), periodOf(r.truth.fine), D0 - 24 * HOUR, D0 + 168 * HOUR);
  return { key: r.key, loss: F.days['7'].e > A.days['7'].e, flag };
});
const losses = classed.filter((w) => w.loss), unflagged = classed.filter((w) => !w.flag.flagged);
check(day7.length === 52 && losses.length === 35 && losses.every((w) => w.flag.flagged),
  `S1-24H-DAY7: ${losses.filter((w) => w.flag.flagged).length} of its ${losses.length} day-7 FFM losses flagged (of ${day7.length} windows)`);
check(unflagged.length === 5 && unflagged.every((w) => w.flag.burnFree && !w.loss),
  `S1-24H-DAY7: ${unflagged.length} windows unflagged, ${unflagged.filter((w) => w.flag.burnFree).length} burn-free, FFM worse on ${unflagged.filter((w) => w.loss).length} (largest change ${Math.max(...unflagged.map((w) => Math.abs(w.flag.largest.sizeM))).toFixed(2)} m; smallest flagged ${Math.min(...classed.filter((w) => w.flag.flagged).map((w) => Math.abs(w.flag.largest.sizeM))).toFixed(2)} m)`);

// 2. The amendment precedes every re-flag row (author dates hold through a merge).
const rows = fs.readdirSync(STORE).flatMap((g) => read(path.join(STORE, g)));
const plan = git('log', '--format=%H %aI', '--', PLAN).trim().split('\n').map((l) => { const [sha, at] = l.split(' '); return { sha, at }; });
const firstRow = rows.map((r) => r.createdUtc).sort()[0];
check(rows.length > 0 && Date.parse(plan.at(-1).at) < Date.parse(firstRow), `PER-REV-FLAG.md (${plan.at(-1).sha.slice(0, 10)} at ${plan.at(-1).at}) precedes the first of ${rows.length} re-flag rows (${firstRow})`);
// 3. The runner and the build.
const runner = crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'per-rev-flag.mjs'))).digest('hex');
check(rows.every((r) => r.runner === runner && r.ffm?.wasmSha256 === FFM_220.wasmSha256), `every re-flag row written by the committed per-rev-flag.mjs (${runner.slice(0, 12)}) on propagator/ffm ${FFM_220.version}`);
// 4. The tables reproduce from the stored rows.
if (fs.existsSync(path.join(RESULTS, 'table.json'))) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'per-rev-flag-'));
  execFileSync(process.execPath, [path.join(here, 'per-rev-flag-table.mjs'), '--out', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (const f of ['table.json', 'README.md']) check(fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/operator-theory/per-rev-flag/${f} reproduces from the stored rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
} else check(false, 'results/operator-theory/per-rev-flag/table.json is written');
// 5. cells.json splits on the new flag and reproduces from the stored rows (compare-cells.mjs --check).
let cellsOk = true;
try { execFileSync(process.execPath, [path.join(here, 'compare-cells.mjs'), '--check'], { stdio: ['ignore', 'ignore', 'inherit'] }); } catch { cellsOk = false; }
const cells = JSON.parse(fs.readFileSync(path.join(repo, 'results/ap-truth/compare/cells.json'), 'utf8')).rows.filter((r) => Number.isInteger(r.burnsInFit));
check(cellsOk && cells.length > 0, `results/ap-truth/compare/cells.json reproduces (compare-cells.mjs --check) with burn counts from the new flag on ${cells.length} rows (${[...new Set(cells.map((r) => r.regime))].join(', ')})`);
// 5. The holds.
check(rows.every((r) => !heldWindow(r)) && rows.every((r) => !EXCLUDE.norads.has(Number(r.norad))), `holds: no held object, no Sentinel-1 cutoff from ${EXCLUDE.s1CutoffBefore}, no Swarm or GRACE-FO, no Starlink`);
console.log(failures ? `PER REV FLAG E2E FAIL: ${failures}` : 'PER REV FLAG E2E PASS');
process.exit(failures ? 1 : 0);
