// S1-STEP-FREE.md end to end: the plan and its amendments precede every row; the 170 windows, each flown by the committed runner on propagator/ffm 2.2.0; every cell
// re-scores from the stored rows and the flag recomputed from the truth; the flagged, step-free and unchecked counts are the detector's; the holds.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/s1-step-free.e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { S1_STEP_FREE as WINDOWS } from './lib/regimes.mjs';
import { FFM_220 } from './lib/build.mjs';
import { HELD_NORADS } from './lib/pairs.mjs';
import { windowState } from './lib/steps.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const STORE = '/opt/data/sdn-archive/operator-theory/s1-step-free', RESULTS = path.join(repo, 'results/operator-theory/s1-step-free'), PLAN = 'experiments/operator-theory/S1-STEP-FREE.md';
const git = (...a) => execFileSync('git', ['-C', repo, ...a]).toString('utf8');
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
const rows = fs.readdirSync(STORE).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(STORE, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const doc = JSON.parse(fs.readFileSync(path.join(RESULTS, 'table.json'), 'utf8'));

// 1. The plan and each amendment, by author date (it holds through a rebase), precede the first row.
const plan = git('log', '--format=%H %aI', '--', PLAN).trim().split('\n').map((l) => { const [sha, at] = l.split(' '); return { sha, at }; });
const firstRow = rows.map((r) => r.createdUtc).sort()[0], registration = plan.at(-1), latest = plan[0];
const text = fs.readFileSync(path.join(repo, PLAN), 'utf8');
check(plan.every((c) => Date.parse(c.at) < Date.parse(firstRow)) && text.includes(FFM_220.wasmSha256) && text.includes(FFM_220.modulesCommit),
  `the plan (registered ${registration.sha.slice(0, 10)} at ${registration.at}) and its ${plan.length - 1} amendments (the last ${latest.sha.slice(0, 10)} at ${latest.at}, naming FFM ${FFM_220.version} ${FFM_220.wasmSha256.slice(0, 12)} at modules ${FFM_220.modulesCommit.slice(0, 10)}) precede the first row (${firstRow})`);
// 2. The windows, the runner, the builds.
const keys = WINDOWS.norads.flatMap((n) => WINDOWS.cutoffs.map((t) => `S1|${n}|${new Date(t).toISOString().slice(0, 10)}`));
const runner = crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 's1-step-free.mjs'))).digest('hex');
const byKey = new Map(rows.map((r) => [r.key, r]));
check(rows.length === 170 && keys.every((k) => byKey.has(k)) && rows.every((r) => r.runner === runner && r.ffm?.wasmSha256 === FFM_220.wasmSha256 && r.ffm?.version === FFM_220.version),
  `${rows.length} rows: the 170 registered windows, each written by the committed s1-step-free.mjs (${runner.slice(0, 12)}) on propagator/ffm ${FFM_220.version}`);
// 3. Every cell re-scores: the table script on the stored rows, the flag recomputed from the truth.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's1-step-free-'));
execFileSync(process.execPath, [path.join(here, 's1-step-free-table.mjs'), '--rows', STORE, '--out', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
for (const f of ['table.json', 'README.md']) check(fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/operator-theory/s1-step-free/${f} reproduces from the stored rows and the truth`);
fs.rmSync(tmp, { recursive: true, force: true });
// 4. The counts are the detector's: each cell's flagged, step-free and unchecked windows, from table.json's flags.
let same = true;
for (const c of doc.cells) {
  const n = { flagged: 0, stepFree: 0, unchecked: 0 };
  for (const k of keys) {
    const r = byKey.get(k), f = r.arms?.F24?.days?.[String(c.day)]?.e, a = r.arms?.AP24?.days?.[String(c.day)]?.e;
    if (!Number.isFinite(f) || !Number.isFinite(a)) continue;
    const s = windowState(doc.flags[k], WINDOWS.fitHours, c.day * 24);
    n[s.flagged ? 'flagged' : s.stepFree ? 'stepFree' : 'unchecked'] += 1;
  }
  if (n.flagged !== c.flagged.n || n.stepFree !== c.stepFree.n || n.unchecked !== c.unchecked.n) same = false;
}
const c7 = doc.cells.find((c) => c.day === 7), reg = doc.registeredCell;
check(same, `flagged, step-free and unchecked counts are the detector's at every day (day 7: ${c7.flagged.n} flagged, ${c7.stepFree.n} step-free, ${c7.unchecked.n} unchecked)`);
check(reg.n === c7.stepFree.n && ['pass', 'fail', 'inconclusive'].includes(reg.againstThresholds) && doc.reading.startsWith('report only'),
  `the registered cell, step-free at day 7: ${reg.n} windows, FFM worse ${reg.ffmWorseShare} [${reg.ffmWorseShareInterval?.join(', ')}], median FFM/AP ${reg.medianRatio} [${reg.medianRatioInterval?.join(', ')}]; against the thresholds ${reg.againstThresholds}; as registered, report only`);
// 5. The holds.
check(rows.every((r) => WINDOWS.norads.includes(r.norad) && !HELD_NORADS.has(r.norad) && r.cutoff < '2026-06-01'), 'held objects never read: only Sentinel-1A and 1C, no cutoff from 2026-06-01, no C2 object');
console.log(failures ? `S1 STEP-FREE E2E FAIL: ${failures}` : 'S1 STEP-FREE E2E PASS');
process.exit(failures ? 1 : 0);
