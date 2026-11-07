// S1-24H-DAY7.md end to end: the design and its amendments precede every stored row; every row written by the committed runner on propagator/ffm 2.2.0; every cell of
// results/operator-theory/s1-24h-day7 reproduces from the stored rows; the classification counts are the per-window rows'; the re-flown baselines equal the stored rows;
// the holds; no registration was run, fewer than 30 unread windows existing.
//   node experiments/operator-theory/s1-24h-day7.e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FFM_220 } from './lib/build.mjs';
import { HELD_NORADS } from './lib/pairs.mjs';
import { STORES, EXCLUDE, NORADS, windowsOf } from './lib/day7.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const RESULTS = path.join(repo, 'results/operator-theory/s1-24h-day7'), PLAN = 'experiments/operator-theory/S1-24H-DAY7.md';
const git = (...a) => execFileSync('git', ['-C', repo, ...a]).toString('utf8');
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
const read = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const rows = ['windows-2025', 'windows-2026', 'history-2025', 'history-2026'].flatMap((d) => read(path.join(STORES.out, d)));
const windows = rows.filter((r) => r.phase === 'windows'), history = rows.filter((r) => r.phase === 'history');
const doc = JSON.parse(fs.readFileSync(path.join(RESULTS, 'table.json'), 'utf8'));

// 1. The design and its amendments (author dates hold through a rebase) precede the first stored row.
const plan = git('log', '--format=%H %aI', '--', PLAN).trim().split('\n').map((l) => { const [sha, at] = l.split(' '); return { sha, at }; });
const firstRow = rows.map((r) => r.createdUtc).sort()[0], design = plan.at(-1);
const runs = plan.filter((c) => Date.parse(c.at) < Date.parse(firstRow));
check(Date.parse(design.at) < Date.parse(firstRow) && runs.length >= 2, `the design (${design.sha.slice(0, 10)} at ${design.at}) and amendment 1 precede the first stored row (${firstRow}); ${plan.length - runs.length} later commit(s) of the design (amendment 2) precede the table`);
// 2. The rows: every window and history fit, written by the committed runner on propagator/ffm 2.2.0.
const runner = crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 's1-24h-day7.mjs'))).digest('hex');
const keys = ['2025', '2026'].flatMap((s) => windowsOf(s).windows.map((w) => w.key));
check(windows.length === 52 && keys.length === 52 && keys.every((k) => windows.some((r) => r.key === k)) && history.length === 428 && rows.every((r) => r.runner === runner && r.ffm?.wasmSha256 === FFM_220.wasmSha256),
  `${windows.length} window rows (the 26 of 2025 and the 26 of 2026's sample) and ${history.length} history fits, each written by the committed s1-24h-day7.mjs (${runner.slice(0, 12)}) on propagator/ffm ${FFM_220.version}`);
// 3. Every cell reproduces: the table script on the stored rows.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's1-24h-day7-'));
execFileSync(process.execPath, [path.join(here, 's1-24h-day7-table.mjs'), '--out', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
for (const f of ['table.json', 'README.md']) check(fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/operator-theory/s1-24h-day7/${f} reproduces from the stored rows`);
fs.rmSync(tmp, { recursive: true, force: true });
// 4. The classification counts are the per-window rows'.
const losses = doc.perWindow.filter((w) => w.loss), byClass = (c) => losses.filter((w) => w.class === c).length;
const c = doc.classes.both;
check(c.losses === losses.length && c['maneuver under the flag'] === byClass('maneuver under the flag') && c.density === byClass('density') && c['fitted B'] === byClass('fitted B') && c['something else'] === byClass('something else')
  && losses.every((w) => w.arms.F24.days['7'] > w.arms.AP24.days['7']) && c.losses === 35 && c['maneuver under the flag'] === 35,
  `classes from the per-window rows: ${c.losses} losses at day 7, maneuver under the flag ${c['maneuver under the flag']}, density ${c.density}, fitted B ${c['fitted B']}, something else ${c['something else']}`);
const clean = doc.hypotheses.find((h) => h.hypothesis === 'baseline' && h.set === 'both' && h.windows === 'no step under the flag').days['7'];
check(c.burnFreeWindows === 5 && clean.n === 5 && clean.ffmWorse === 0, `on the ${clean.n} windows with no step under the flag FFM is worse in ${clean.ffmWorse * 100} % at day 7 (median FFM/AP ${clean.medianRatio})`);
// 5. The re-flown baselines equal the stored rows.
const R = doc.reproduction;
check(R['2025'].F24 === 26 && R['2025'].AP24 === 26 && R['2026'].AP24 === 26, `re-flown day 7 equal to the stored rows: FFM24 ${R['2025'].F24} and AP24 ${R['2025'].AP24} of 26 (2025, s1-step-free), AP24 ${R['2026'].AP24} of 26 (2026, ap/b051)`);
// 6. The holds.
const cap = Date.parse(EXCLUDE.s1TruthTo);
const truthEnd = Math.max(...windows.flatMap((r) => [r.truth.revolutions.at(-1)[0], r.truth.fine.at(-1)[0]]));
check(rows.every((r) => NORADS.includes(r.norad) && !HELD_NORADS.has(r.norad) && !EXCLUDE.norads.has(r.norad) && String(r.cutoff).slice(0, 10) < EXCLUDE.s1CutoffBefore) && truthEnd <= cap
  && doc.holds.s1CutoffBefore === '2026-06-01' && doc.holds.s1TruthTo === '2026-06-08T00:00:00Z' && [66315, 31698, 22824, 8820].every((n) => doc.holds.norads.includes(n)),
  `holds: only Sentinel-1A and 1C, no cutoff from ${EXCLUDE.s1CutoffBefore}, the latest truth read ${new Date(truthEnd).toISOString().slice(0, 16)} (hold ${EXCLUDE.s1TruthTo.slice(0, 10)}), maneuver-flags.mjs's EXCLUDE`);
// 7. No registration: fewer than 30 unread windows, nothing run on them.
const reg = doc.registration;
check(reg.run === false && reg.candidates < reg.needed && reg.candidates === reg.candidateKeys.length && !fs.existsSync(path.join(STORES.out, 'registration')),
  `registration not run: ${reg.candidates} candidate window(s) outside every spent span and the hold (${reg.candidateKeys.map((k) => k.key).join(', ')}), under the ${reg.needed} needed; no registration rows`);
console.log(failures ? `S1 24H DAY7 E2E FAIL: ${failures}` : 'S1 24H DAY7 E2E PASS');
process.exit(failures ? 1 : 0);
