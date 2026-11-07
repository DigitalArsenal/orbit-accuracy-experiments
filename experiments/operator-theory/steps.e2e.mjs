// PER-REV-FLAG.md end to end, report only: each registration precedes its rows; the re-flag (a), separating-test, rule (b) and rule (c) tables reproduce from
// their stored rows with the outcomes the record states ((b) and (c) failed as registered); the near-700 km Sentinel-1 split reproduces from the stored rows and
// the SHA-256-pinned catalog, its eight three-way readings exactly as registered (72b4ae23). The per-revolution flag is parked; nothing here asserts it or any
// split of cells.json.
//   node experiments/operator-theory/steps.e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FFM_220 } from './lib/build.mjs';
import { STORE as FLIGHTS, EXCLUDE, heldWindow } from './per-rev-flag.mjs';
import { STORE as SEPARATE } from './per-rev-flag-separate.mjs';
import { STORE as VALIDATE } from './per-rev-flag-validate.mjs';
import { STORE as RULE_C_STORE } from './per-rev-flag-c.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..'), R = path.join(repo, 'results/operator-theory/per-rev-flag');
const git = (...a) => execFileSync('git', ['-C', repo, ...a]).toString('utf8').trim();
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
const read = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const rowsUnder = (store) => (fs.existsSync(store) ? fs.readdirSync(store).flatMap((g) => read(path.join(store, g))) : []);
const committed = (sha) => Date.parse(git('show', '-s', '--format=%cI', sha));
const json = (rel) => JSON.parse(fs.readFileSync(path.join(R, rel), 'utf8'));

// 1. Each registration's commit precedes the first row it governs (commits are never rebased on this chain).
const stores = [['re-flag (a)', '2b32350c', rowsUnder(FLIGHTS)], ['separating tests', 'c0a790a3', rowsUnder(SEPARATE)], ['rule (b)', 'e533fca3', rowsUnder(VALIDATE)], ['rule (c)', '84960759', rowsUnder(RULE_C_STORE)]];
for (const [name, sha, rows] of stores) {
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && committed(sha) < Date.parse(first), `${name}: registration ${sha} (${git('show', '-s', '--format=%cI', sha)}) precedes the first of ${rows.length} rows (${first})`);
}
const splitFirst = git('log', '--reverse', '--format=%H', '--', 'results/operator-theory/per-rev-flag/split').split('\n')[0];
let ancestor = true;
try { execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', '72b4ae23', splitFirst]); } catch { ancestor = false; }
check(Boolean(splitFirst) && ancestor && !splitFirst.startsWith('72b4ae23'), `Sentinel-1 split: its reading rule (72b4ae23) precedes the first commit of its results (${splitFirst.slice(0, 8)})`);

// 2. Every re-flag row is the committed runner's on propagator/ffm 2.2.0; no held window.
const runner = crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'per-rev-flag.mjs'))).digest('hex'), flights = rowsUnder(FLIGHTS);
check(flights.every((r) => r.runner === runner && r.ffm?.wasmSha256 === FFM_220.wasmSha256) && flights.every((r) => !heldWindow(r) && !EXCLUDE.norads.has(Number(r.norad))),
  `${flights.length} re-flag rows, each by the committed per-rev-flag.mjs (${runner.slice(0, 12)}) on propagator/ffm ${FFM_220.version}; no held object, no Sentinel-1 cutoff from ${EXCLUDE.s1CutoffBefore}`);

// 3. Every result table reproduces from its stored rows.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'per-rev-flag-'));
for (const [script, rel] of [['per-rev-flag-table.mjs', '.'], ['per-rev-flag-separate-table.mjs', 'separate'], ['per-rev-flag-validate-table.mjs', 'validate'], ['per-rev-flag-c-table.mjs', 'c'], ['s1-burn-split.mjs', 'split']]) {
  const out = path.join(tmp, rel === '.' ? 'a' : rel);
  execFileSync(process.execPath, [path.join(here, script), '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
  check(['table.json', 'README.md'].every((f) => fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(R, rel, f)))), `results/operator-theory/per-rev-flag/${rel === '.' ? '' : `${rel}/`}table.json and README.md reproduce (${script})`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// 4. The outcomes the record states.
const b = json('validate/table.json'), c = json('c/table.json'), sep = json('separate/table.json');
const low = sep.sets.find((s) => s.set === 'low');
check(low.control.realFlagged === 37 && low.control.modelFlagged === 0 && low.control.reading === 'the truth product is the cause', `separating tests: the low passive spheres flag ${low.control.realFlagged} of ${low.control.windows} windows on the real truth, ${low.control.modelFlagged} on the model truth (the truth product is the cause)`);
check(b.pass === false && b.known.detected === 11 && b.known.registered === 26 && b.quiet.flagged === 0 && b.quiet.eligible === 79, `rule (b) failed as registered: known burns ${b.known.detected} of ${b.known.registered}; false alarms ${b.quiet.flagged} of ${b.quiet.eligible}`);
check(c.pass === false && c.known.detected === 41 && c.known.windows === 84 && [2, 3, 4, 8].every((s) => c.injected.bySize[s].detected === 54 && c.injected.bySize[s].windows === 57) && c.quiet.flagged === 6 && c.quiet.eligible === 68 && c.quiet.allowed === 3,
  `rule (c) failed as registered: known burns ${c.known.detected} of ${c.known.windows}; injected 54 of 57 at 2, 3, 4 and 8 m; false alarms ${c.quiet.flagged} of ${c.quiet.eligible} (${c.quiet.allowed} allowed)`);

// 5. The split: the pinned catalog and the eight three-way readings.
const CAT = '/opt/data/sdn-archive/operator-theory/covariance-model/steps', CATALOG = json('split/table.json').catalog.files;
check(Object.entries(CATALOG).every(([f, sha]) => crypto.createHash('sha256').update(fs.readFileSync(path.join(CAT, f))).digest('hex') === sha), `the split's catalog files equal their pinned SHA-256 (${Object.keys(CATALOG).join(', ')})`);
const split = json('split/table.json').cells, at = (fit, lead) => split.find((x) => x.fit === fit && x.lead === lead);
const expected = [[24, 24, 'explained', 151], [24, 48, 'explained', 99], [24, 72, 'explained', 63], [24, 168, 'undecided', 10], [72, 24, 'explained', 65], [72, 48, 'explained', 45], [72, 72, 'undecided', 29], [72, 168, 'no reading', 2]];
check(split.length === 8 && expected.every(([fit, lead, word, n]) => at(fit, lead).burnFree === n && at(fit, lead).reading.startsWith(word)) && !split.some((x) => x.reading.startsWith('candidate')),
  `Sentinel-1 split, near 700 km: ${expected.map(([fit, lead, word, n]) => `${fit}/${lead} ${word} (${n} burn-free${at(fit, lead).intervalFree ? `, [${at(fit, lead).intervalFree.join(', ')}]` : ''})`).join('; ')}; no candidate FFM defect`);
console.log(failures ? `PER REV FLAG E2E FAIL: ${failures}` : 'PER REV FLAG E2E PASS');
process.exit(failures ? 1 : 0);
