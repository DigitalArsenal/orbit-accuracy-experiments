// GEO-SGP4.md, end to end, from the stored rows: the tables reproduce; SGP4 moves only on windows whose node condition holds; the AP, whiteroom XP, Space Force XP
// and FFM figures and stores are untouched; the 2x2 holds four cells on equal windows for GE and IG (or an empty cell with its reason); the registration precedes every fit.
//   node experiments/operator-theory/geo-sgp4-one-mode.e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const RESULTS = path.join(repo, 'results/operator-theory/geo-sgp4-one-mode'), COMPARE = path.join(repo, 'results/ap-truth/compare');
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 1 << 27 });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const doc = JSON.parse(fs.readFileSync(path.join(RESULTS, 'results.json'), 'utf8'));
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };

// 1. The tables reproduce from the stored rows.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-sgp4-'));
fs.mkdirSync(path.join(tmp, 'compare'));
for (const f of fs.readdirSync(COMPARE)) fs.copyFileSync(path.join(COMPARE, f), path.join(tmp, 'compare', f));
execFileSync(process.execPath, [path.join(here, 'geo-sgp4-table.mjs'), '--out', path.join(tmp, 'out'), '--compare', path.join(tmp, 'compare')], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 26 });
for (const [dir, f] of [[RESULTS, 'results.json'], [RESULTS, 'README.md'], [COMPARE, 'regimes.json'], [COMPARE, 'regimes.md']]) {
  const again = fs.readFileSync(path.join(tmp, dir === RESULTS ? 'out' : 'compare', f));
  check(again.equals(fs.readFileSync(path.join(dir, f))), `${path.relative(repo, path.join(dir, f))} reproduces from the stored rows (${again.length} bytes)`);
}
fs.rmSync(tmp, { recursive: true, force: true });

// 2. SGP4 moves only where the node condition holds.
for (const c of doc.armA) {
  console.log(`     ${c.group}: ${c.windows} windows; node crosses ${c.node.crosses} (down ${c.node.down}, up ${c.node.up}), near ${c.node.near}, neither ${c.node.neither}, below 0.2 rad ${c.node.belowLyddane}; moved with the condition ${c.moved.withCondition}, without ${c.moved.withoutCondition}; failed S ${c.failed.S}, S1 ${c.failed.S1}`);
  check(c.node.counted === c.windows, `${c.group}: the node condition is counted on all ${c.windows} windows`);
  check(c.moved.withoutCondition === 0, `${c.group}: SGP4 moves by more than 1 m only on windows whose node condition holds (${c.moved.withoutCondition} without${c.moved.keysWithout.length ? `: ${c.moved.keysWithout.join(', ')}` : ''})`);
}
for (const c of doc.nodesOnly.filter((x) => x.satellite === 'all')) console.log(`     ${c.group} ${c.arc}: ${c.counted} windows (count only), node condition ${c.holds}, inclination median ${c.incMedianDeg.toFixed(2)} deg, below 0.2 rad ${c.belowLyddane}`);

// 3. The AP, whiteroom XP, Space Force XP and FFM figures and stores are untouched.
const moved = Object.entries(doc.storedHashes).filter(([f, h]) => sha(fs.readFileSync(f)) !== h);
check(moved.length === 0, `${Object.keys(doc.storedHashes).length} stored row files have the SHA-256 recorded in results.json (${moved.length} differ)`);
const base = JSON.parse(git('show', `${doc.compare.base}:results/ap-truth/compare/regimes.json`).toString('utf8')), now = JSON.parse(fs.readFileSync(path.join(COMPARE, 'regimes.json'), 'utf8'));
const strip = (d) => ({ ...d, cells: d.cells.map((c) => (c.group === 'GE' || c.group === 'IG' ? { ...c, arms: { ...c.arms, SGP4: null } } : c)) });
check(JSON.stringify(strip(base)) === JSON.stringify(strip(now)), `regimes.json: every figure but the GE and IG SGP4 cells is identical to ${doc.compare.base.slice(0, 7)} (${now.cells.length} cells; AP, XP and FFM of GE and IG included)`);
for (const u of doc.compare.unchanged) check(sha(fs.readFileSync(path.join(COMPARE, u.file))) === sha(git('show', `${doc.compare.base}:results/ap-truth/compare/${u.file}`)), `${u.file} is byte-identical to ${doc.compare.base.slice(0, 7)}`);

// 4. The 2x2: four cells on equal windows for GE and IG, or an empty cell with its reason.
for (const c of doc.armB) {
  for (const k of ['1', '2', '3', '7']) {
    const l = c.leads[k], ns = ['WW', 'SS', 'WS', 'SW'].map((x) => l.cells[x].n);
    const empty = ['WS', 'SW'].filter((x) => c.failed[x] === c.windows);
    console.log(`     ${c.group} day ${k}: ${l.paired} windows, ${l.satellites} satellites; WW ${l.cells.WW.median?.toFixed(4)}, SS ${l.cells.SS.median?.toFixed(4)}, WS ${l.cells.WS.median?.toFixed(4)}, SW ${l.cells.SW.median?.toFixed(4)} km`);
    check((l.paired > 0 && ns.every((x) => x === l.paired)) || (empty.length > 0 && empty.every((x) => c.errors[x].length > 0)), `${c.group} day ${k}: four cells over the same ${l.paired} windows`);
  }
  console.log(`     ${c.group}: refits identical to the stored cells, whiteroom ${c.reproduction.WWr.identical}/${c.reproduction.WWr.windows}, Space Force ${c.reproduction.SSr.identical}/${c.reproduction.SSr.windows}; day-1 rule: library cleared ${c.decision.libraryCleared}, fit confirmed ${c.decision.fitConfirmed}`);
}

// 5. The registration precedes every fit.
const registered = git('show', '-s', '--format=%cI', doc.registration).toString().trim();
check(Date.parse(registered) < Date.parse(doc.runs.first), `registration ${doc.registration.slice(0, 7)} at ${new Date(registered).toISOString()} precedes the first of ${doc.runs.rows} run rows at ${doc.runs.first}`);
let ancestor = true;
try { git('merge-base', '--is-ancestor', doc.registration, 'HEAD'); } catch { ancestor = false; }
check(ancestor, `the registration ${doc.registration.slice(0, 7)} is an ancestor of HEAD`);
check(git('show', `${doc.registration}:experiments/operator-theory/GEO-SGP4.md`).equals(fs.readFileSync(path.join(here, 'GEO-SGP4.md'))), 'GEO-SGP4.md is unchanged since its registration');

console.log(failures ? `${failures} checks failed` : 'all checks pass');
process.exit(failures ? 1 : 0);
