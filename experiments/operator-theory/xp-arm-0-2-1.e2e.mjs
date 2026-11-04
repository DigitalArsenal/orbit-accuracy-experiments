// XP-ARM-0-2-1.md and the compare cells, end to end, from the stored rows: the cells and tables reproduce; every cell neither AP nor Space Force XP is byte-identical
// to the previous cells.json; AP cells equal the 0.5.1 rows on precise orbits, the Space Force XP cells the 0.2.1 rows; each row names input and build; the
// registration precedes every fit; GE and IG day 1 within 0.02 km of the 2x2's prediction; the holds.
//   node experiments/operator-theory/xp-arm-0-2-1.e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { binOf, pct, asc } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';
import { BUILD, AP_ARM, COLUMN_BUILDS } from './lib/build.mjs';
import { HELD_ROW, HELD_NORADS } from './lib/pairs.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const CELLS = path.join(repo, 'results/ap-truth/compare/cells.json'), RESULTS = path.join(repo, 'results/operator-theory/xp-arm-0-2-1');
const BASE = '71b27aa50112ec0533359572597eb408491cdb2f', EXAMPLES = '/opt/data/sdn-archive/operator-theory/ap/b0411/compare-examples-full';
const A = '/opt/data/sdn-archive/operator-theory/ap', OLD = path.join(A, BUILD), B051 = path.join(A, 'b051'), XPARM = path.join(A, 'xp-arm-0-2-1');
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { maxBuffer: 1 << 27 });
let failures = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
const now = JSON.parse(fs.readFileSync(CELLS, 'utf8')), base = JSON.parse(git('show', `${BASE}:results/ap-truth/compare/cells.json`).toString('utf8'));
const doc = JSON.parse(fs.readFileSync(path.join(RESULTS, 'results.json'), 'utf8'));

// 1. The cells and the tables reproduce from the stored rows.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xp-arm-'));
execFileSync(process.execPath, [path.join(here, 'compare-cells.mjs'), '--out', path.join(tmp, 'cells.json'), '--examples', EXAMPLES], { stdio: ['ignore', 'ignore', 'inherit'] });
check(fs.readFileSync(path.join(tmp, 'cells.json')).equals(fs.readFileSync(CELLS)), `results/ap-truth/compare/cells.json reproduces from the stored rows (${now.rows.length} rows)`);
execFileSync(process.execPath, [path.join(here, 'xp-arm-0-2-1.mjs'), '--out', path.join(tmp, 'xparm')], { stdio: ['ignore', 'ignore', 'inherit'] });
for (const f of ['results.json', 'README.md']) check(fs.readFileSync(path.join(tmp, 'xparm', f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/operator-theory/xp-arm-0-2-1/${f} reproduces from the stored rows (${Object.keys(doc.storedHashes).length} row files)`);
fs.rmSync(tmp, { recursive: true, force: true });

// 2. Every cell neither AP nor Space Force XP is byte-identical to the previous cells.json; the held SpaceX rows are carried whole.
const id = (r) => [r.reference, r.level, r.regime, r.provider, r.satellite, r.fit, r.lead].join('|');
const before = new Map(base.rows.map((r) => [id(r), r])), HELD_REGIME = 'Low orbit, maneuvering';
const same = now.rows.length === base.rows.length && now.rows.every((r) => before.has(id(r)) && before.get(id(r)).n === r.n && before.get(id(r)).example === r.example);
check(same, `the same ${base.rows.length} rows as ${BASE.slice(0, 7)}, each with its count and worked example`);
const tally = { other: [0, 0], apNext: [0, 0], held: [0, 0] };
for (const r of now.rows) {
  const o = before.get(id(r));
  if (!o) continue;
  for (const c of new Set([...Object.keys(o.arms), ...Object.keys(r.arms)])) {
    const eq = JSON.stringify(o.arms[c]) === JSON.stringify(r.arms[c]);
    const t = r.regime === HELD_REGIME ? tally.held : c === 'AP' ? (r.reference === 'next' ? tally.apNext : null) : c === 'XPU' ? null : tally.other;
    if (t) t[eq ? 0 : 1] += 1;
  }
}
check(tally.other[1] === 0 && tally.other[0] > 0, `every SGP4, whiteroom XP, FFM and center cell is byte-identical to ${BASE.slice(0, 7)} (${tally.other[0]} cells, ${tally.other[1]} differ)`);
check(tally.apNext[1] === 0, `every next-file AP cell is 0.4.11's as before (${tally.apNext[0]} cells, ${tally.apNext[1]} differ)`);
check(tally.held[1] === 0 && tally.held[0] > 0, `the held SpaceX rows carry every cell as before (${now.rows.filter((r) => r.regime === HELD_REGIME).length} rows, ${tally.held[0]} cells, ${tally.held[1]} differ)`);
check(JSON.stringify(now.leftOut) === JSON.stringify(base.leftOut), `left out as before (${JSON.stringify(now.leftOut)})`);

// 3. AP and the Space Force XP cells equal their rows, recomputed here at the regime level from the stores alone.
const round = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
const cellOf = (v) => { const s = v.filter(Number.isFinite).sort(asc); return s.length ? [round(pct(s, 0.5)), round(pct(s, 0.95)), s.length] : undefined; };
const rowsIn = (dir, re = /^rows-\d+\.jsonl$/) => fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l)));
const byKey = (...dirs) => new Map(dirs.flatMap((d) => rowsIn(d)).map((r) => [r.key, r]));
const day = (r, arm, d) => r?.arms?.[arm]?.days?.[d]?.e;
const cellAt = (reference, regime, fit, lead) => now.rows.find((r) => r.reference === reference && r.level === 'regime' && r.regime === regime && r.fit === fit && r.lead === lead);
const recomputed = { AP: [0, 0], XPU: [0, 0] };
const tallyCell = (column, want, row) => { if (!row || want === undefined) return; recomputed[column][JSON.stringify(row.arms[column]) === JSON.stringify(want) ? 0 : 1] += 1; };
const aSix = byKey(path.join(B051, 'regimes'), path.join(B051, 'regimes-hx')), uSix = byKey(path.join(B051, 'ussf-regimes'), path.join(B051, 'ussf-regimes-hx'));
const live = rowsIn(path.join(OLD, 'regimes')).filter((r) => !r.error);
for (const [group, g] of Object.entries(GROUPS)) for (const fit of [24, 72, 168, 336]) for (const d of ['1', '2', '3', '7']) {
  const list = live.filter((r) => r.group === group), row = cellAt('truth', g.label, fit, Number(d) * 24);
  tallyCell('AP', cellOf(list.map((r) => day(aSix.get(r.key), `AP${fit}`, d))), row);
  tallyCell('XPU', cellOf(list.map((r) => day(uSix.get(r.key), `U${fit}`, d))), row);
}
const a1 = byKey(path.join(B051, 'truth')), a2 = byKey(path.join(B051, 'truth2')), u1 = byKey(path.join(B051, 'ussf-truth')), u2 = byKey(path.join(B051, 'ussf-truth2'));
for (const [regime, rows, apNew, uNew, keep, arcs] of [['Strong drag, 2025', rowsIn(path.join(OLD, 'truth')), a1, u1, () => true, [24]], ...[['Strong drag, 2026', 'P'], ['Near 700 km', 'S1'], ['Medium Earth orbit', 'GN']].map(([label, grp]) => [label, rowsIn(path.join(OLD, 'truth2')), a2, u2, (r) => r.group === grp, [24, 72]])]) {
  const list = rows.filter((r) => keep(r) && !r.error);
  for (const fit of arcs) for (const d of ['1', '2', '3', '7']) {
    const row = cellAt('truth', regime, fit, Number(d) * 24);
    tallyCell('AP', cellOf(list.map((r) => day(apNew.get(r.key), `AP${fit}`, d))), row);
    tallyCell('XPU', cellOf(list.map((r) => day(uNew.get(r.key), `U${fit}`, d))), row);
  }
}
const pk = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
const laserU = new Map(rowsIn(path.join(XPARM, 'ussf-laser')).map((r) => [pk(r), r])), NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const laser = rowsIn(path.join(OLD, 'laser', 'forward'));
for (const regime of ['Low orbit', 'Navigation', 'Geodetic']) for (const lead of [24, 48, 72, 96, 120, 144, 168]) for (const fit of [48, 72]) {
  const list = laser.filter((r) => binOf(r.leadHours) === lead && (r.source.endsWith('-leo') ? 'Low orbit' : NAV.test(r.object) ? 'Navigation' : 'Geodetic') === regime);
  tallyCell('XPU', cellOf(list.map((r) => laserU.get(pk(r))?.arms[`U-XP@${fit}`]?.km)), cellAt('next', regime, fit, lead));
}
const PROVIDER_ROWS = /^rows(-iss)?-\d+\.jsonl$/, REGIME = { iss: 'Low orbit, crewed', css: 'Low orbit, crewed', planet: 'Low orbit, imaging fleet', gps: 'Navigation, ultra-rapid', glonass: 'Navigation, ultra-rapid', intelsat: 'Geostationary, station-kept', ses: 'Geostationary, station-kept' };
const providersU = new Map(rowsIn(path.join(XPARM, 'ussf-providers'), PROVIDER_ROWS).map((r) => [pk(r), r]));
const providers = rowsIn(path.join(OLD, 'providers'), PROVIDER_ROWS).filter((r) => !r.error && REGIME[r.source] && (r.source !== 'planet' || r.norad));
for (const regime of new Set(Object.values(REGIME))) for (const lead of [12, 24, 36, 48, 60, 72, 96, 120, 144, 168]) for (const fit of [24, 48]) {
  const list = providers.filter((r) => REGIME[r.source] === regime && binOf(r.leadHours) === lead);
  tallyCell('XPU', cellOf(list.map((r) => providersU.get(pk(r))?.arms[`U-XP@${fit}`]?.km)), cellAt('next', regime, fit, lead));
}
check(recomputed.AP[1] === 0 && recomputed.AP[0] > 0, `AP regime cells on precise orbits equal the 0.5.1 rows of ap/b051 (${recomputed.AP[0]} recomputed, ${recomputed.AP[1]} differ)`);
check(recomputed.XPU[1] === 0 && recomputed.XPU[0] > 0, `Space Force XP regime cells equal the 0.2.1 rows of ap/b051 and ap/xp-arm-0-2-1 (${recomputed.XPU[0]} recomputed, ${recomputed.XPU[1]} differ)`);
const moved = { AP: 0, XPU: 0 };
for (const r of now.rows) for (const c of ['AP', 'XPU']) if (r.regime !== HELD_REGIME && c in r.arms && JSON.stringify(r.arms[c]) !== JSON.stringify(before.get(id(r))?.arms[c])) moved[c] += 1;
console.log(`     moved from ${BASE.slice(0, 7)}: AP ${moved.AP} cells (precise orbits only), Space Force XP ${moved.XPU} cells`);

// 4. Each row names its input and its builds; AP and the Space Force XP name the build their rows came from.
const keyOf = (set, column) => JSON.stringify(COLUMN_BUILDS[set][column].map((b) => b.key));
const named = now.rows.every((r) => r.input === (r.reference === 'next' ? 'operator-file' : 'precise-orbit') && Object.keys(r.arms).every((c) => Array.isArray(r.build?.[c]) && r.build[c].every((k) => now.builds[k]?.sha256?.length === 64)));
check(named, `all ${now.rows.length} rows name input (operator-file or precise-orbit) and, for each column, builds by SHA-256`);
const setOf = (r) => (r.regime === HELD_REGIME ? 'held' : r.reference);
const right = now.rows.every((r) => ['AP', 'XPU'].every((c) => !(c in r.arms) || JSON.stringify(r.build[c]) === keyOf(setOf(r), c)));
check(right, `AP names sdn-ap 0.5.1 on precise orbits and 0.4.11 on next files; the Space Force XP names sgp4-xp 0.2.1, the held SpaceX rows 0.1.1`);

// 5. The registration precedes every fit, and the pairs flown are the registered ones.
const registered = Date.parse(git('show', '-s', '--format=%cI', doc.runs.registration).toString().trim());
const starts = doc.runs.log.filter((l) => /^(start|resume|balanced|pool|attribution) /.test(l)).map((l) => Date.parse(l.split(' ').at(-2)));
check(registered < Date.parse(doc.runs.firstRowFile) && starts.every((t) => registered < t), `registration ${doc.runs.registration.slice(0, 7)} at ${new Date(registered).toISOString()} precedes the first of ${doc.runs.rowFiles} row files (${doc.runs.firstRowFile}) and every run start`);
let ancestor = true;
try { git('merge-base', '--is-ancestor', doc.runs.registration, 'HEAD'); } catch { ancestor = false; }
const registeredText = git('show', `${doc.runs.registration}:experiments/operator-theory/XP-ARM-0-2-1.md`), currentText = fs.readFileSync(path.join(here, 'XP-ARM-0-2-1.md'));
check(ancestor && currentText.subarray(0, registeredText.length).equals(registeredText) && git('show', `${doc.runs.amendment}:experiments/operator-theory/XP-ARM-0-2-1.md`).equals(currentText), `XP-ARM-0-2-1.md is its registration with amendments 1 and 2 appended, unchanged since ${doc.runs.amendment.slice(0, 7)}`);
for (const s of doc.next) check(s.run === s.registered && s.notRegistered === 0 && s.flownTwice === 0, `${s.set}: ${s.run} of ${s.registered} registered pairs flown on 0.2.1 once each, none other (${Object.entries(s.failed).map(([a, f]) => `${a} without a figure ${f['0.2.1']}`).join(', ')})`);

// 6. GE and IG day 1: the Space Force XP on 0.2.1 within 0.02 km of its sets flown on the whiteroom propagator (the 2x2's prediction).
for (const p of doc.prediction) check(p.within && p.flown === p.windows, `${p.group} day 1 on the 2x2's ${p.windows} windows: Space Force XP ${p.spaceForce021} km (0.1.1: ${p.spaceForce011}), its sets on the whiteroom propagator ${p.spaceForceSetsOnWhiteroom}, ${p.lessSW >= 0 ? '+' : ''}${p.lessSW} km`);

// 6b. The two cells worse on 0.2.1, per window: every window flown on all four arms, the refits reproducing the stored figures, amendment 2 before the first row.
const amended = Date.parse(git('show', '-s', '--format=%cI', doc.runs.amendment).toString().trim());
check(amended < Date.parse(doc.runs.firstAttributionFile), `amendment 2 ${doc.runs.amendment.slice(0, 7)} at ${new Date(amended).toISOString()} precedes the first of ${doc.runs.attributionFiles} attribution row files (${doc.runs.firstAttributionFile})`);
for (const x of doc.attribution) {
  const store = x.group === 'HX' ? 'ussf-regimes-hx' : 'ussf-regimes', oldU = byKey(path.join(OLD, store)), newU = byKey(path.join(B051, store));
  const expected = [...newU.values()].filter((r) => r.group === x.group && [r, oldU.get(r.key)].every((q) => Number.isFinite(q?.arms?.[x.arm]?.days?.[String(x.day)]?.e))).length;
  const full = x.windows - x.missing;
  console.log(`     ${x.label} ${x.arm} day ${x.day}: medians a ${x.medianKm.a}, b ${x.medianKm.b}, 0.1.1's set on 0.2.1 ${x.medianKm.u11}, 0.2.1's set on the whiteroom propagator ${x.medianKm.uw} km; flight side ${x.flightSide}, fit side ${x.fitSide}`);
  check(full === expected && x.reproducesB === full && x.reproducesA === full, `${x.label} ${x.arm} day ${x.day}: all ${expected} windows with a figure flown on four arms; the 0.2.1 refit reproduces b on ${x.reproducesB}, the 0.1.1 refit on 0.1.1 reproduces a on ${x.reproducesA}`);
}
for (const g of doc.againstSgp4) console.log(`     ${g.group} against SGP4, median of each window's ratio, 0.1.1 / 0.2.1: ${['1', '2', '3', '7'].map((d) => `day ${d} ${g.days[d]['0.1.1']} / ${g.days[d]['0.2.1']} (${g.days[d].windows})`).join(', ')}`);
check(doc.againstSgp4.length === 2 && doc.againstSgp4.every((g) => Object.values(g.days).every((d) => d.windows > 0)), 'the geosynchronous ratio against SGP4 is written from paired windows for GE and IG at days 1, 2, 3 and 7');

// 7. The holds: no Starlink row and no held satellite in the new store; Swarm and GRACE-FO truth ends before 2026-10-31.
const storeFiles = ['ussf-laser', 'ussf-providers'].flatMap((s) => fs.readdirSync(path.join(XPARM, s)).filter((f) => PROVIDER_ROWS.test(f)).map((f) => path.join(XPARM, s, f)));
const heldLines = storeFiles.reduce((n, f) => n + fs.readFileSync(f, 'utf8').split('\n').filter((l) => HELD_ROW.test(l)).length, 0);
const heldNorads = [...laserU.values(), ...providersU.values()].filter((r) => HELD_NORADS.has(Number(r.norad))).length;
check(heldLines === 0 && heldNorads === 0 && doc.next.every((s) => s.held === 0), `the 0.2.1 store holds no Starlink row and no held satellite (${storeFiles.length} files: ${heldLines} Starlink lines, ${heldNorads} held NORADs)`);
const SWARM_GRACE = new Set([39451, 39452, 39453, 43476, 43477]), noradOf = (r) => Number(r.key.split('|')[1]);
const fifth = [...a1.values(), ...a2.values()], swarmGrace = fifth.filter((r) => SWARM_GRACE.has(noradOf(r)));
const lastTruth = Math.max(...swarmGrace.map((r) => Date.parse(`${r.key.split('|')[2]}T00:00:00Z`) + 8 * 86400000));
const galileo = fifth.filter((r) => HELD_NORADS.has(noradOf(r)) && !SWARM_GRACE.has(noradOf(r))).length;
check(swarmGrace.length > 0 && lastTruth < Date.parse('2026-10-31T00:00:00Z') && galileo === 0, `AP5's windows: Swarm and GRACE-FO truth (${swarmGrace.length} windows) ends by ${new Date(lastTruth).toISOString().slice(0, 10)}, before 2026-10-31; none of C2's six Galileo (${galileo})`);

console.log(failures ? `${failures} checks failed` : 'all checks pass');
process.exit(failures ? 1 : 0);
