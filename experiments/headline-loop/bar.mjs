// The bar's table for a released sdn-ap version: the catalog's fit (stack #503, #504). For every window of every row that has a numerical arm, AP's record
// is fitted to the numerical propagator's forecast over 0 to 120 h after the cutoff (the module's fit, the row's $PCF, the weather known
// at the cutoff), and the window's figure is the largest 3D distance between that record and the forecast over 0 to 120 h on the
// forecast's 300 s grid (the bar: at most 100 m). Beside it, the error against the precise orbit at day 5 (the scoreboard's statistic:
// the RMS of the 3D error over the 24 h ending at 120 h, on the table's scored epochs) of AP's record and of the numerical forecast.
// The numerical trajectories are the stored ones (<store>/numerical-trajectories, its manifest's last line per window and fit arc): the
// row's numerical arm (the scoreboard's, by name) fitted to the precise orbit over the fit arc before the cutoff, and over the arc after
// the last burn known at the cutoff where that rule moved its arc, then flown 7 days past the cutoff. Writes one JSON
// (schema sdn-ap-catalog-fit/1) of aggregates only: per row and per group (the front page's four, and strong drag with its heights),
// nothing per window.
// Each row reads one tolerance (stack issue 520): a drag row whose every window with a numerical arm by the rule has its 1e-13 row
// (lib/arms.mjs NUMERICAL_TIGHT, table.mjs's rule) and its 1e-13 manifest line (setting NUMERICAL_TIGHT.to) reads those, the numerical
// day-5 figures with them; every other row the manifest's other lines and the stored rows, at their setting's tolerance. Each row and
// group states it. With --scoreboard, a row whose tolerance is not the scoreboard row's, or a store of refits after a burn other than the
// one it names, stops the run before anything is flown.
//
//   node experiments/headline-loop/bar.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 8]
//     [--groups LS,DO] [--arcs 72,24] [--scoreboard <the same build's table.mjs file>: each row's windows are the scoreboard row's]
//     [--burns <lists> [--after-burn-store <folder>]: the refits after a burn, read as table.mjs reads them with --burns; each refit's list
//      must be the one --burns gives for its satellite, or the run is refused; without --burns no refit is read]
//     [--caps T,Z: a study of the record's degrees, not the release's figure: every record fitted at tesseral degree T and zonal
//      degree Z (FORCES.MAXIMUM_TESSERAL_DEGREE, MAXIMUM_DEGREE), its other forces the row's own $PCF's; the file states the caps]
//   node experiments/headline-loop/bar.mjs --check   (on a store of its own made from the real store; see check())
//
// The build is read by git show at the commit, never from a working tree; this repository's working tree must be clean (the file names
// its commit). Each window's figures go to <store>/bar/<wasm sha12>/rows.jsonl (with --caps T,Z, rows-caps<T>-<Z>.jsonl beside it) and
// are flown again only when its manifest line changes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO, MODULES_ROOT, usePackages, envRecord } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
// --caps T,Z: the record's tesseral and zonal degrees for every fit (a study; the release's records are the row's $PCF as it is)
const CAPS = args.caps ? args.caps.split(',').map(Number) : null;
if (CAPS && !(CAPS.length === 2 && CAPS.every((x) => Number.isInteger(x) && x >= 2 && x <= 70))) throw new Error('--caps T,Z: two degrees, each 2 to 70');
const HOUR = 3600e3, DAY = 864e5, BAR_M = 100, BAR_H = 120, STEP_S = 300;
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE72', 'HE', 'HX'];
// the front page's four groups (the site's), and strong drag (both strong-drag rows) with the heights its windows' forecasts span
const GROUPS = [
  { key: 'leo', name: 'Low Earth orbit', regimes: ['LS', 'DO', 'S1', 'P', 'T'] },
  { key: 'meo', name: 'Medium Earth orbit', regimes: ['GD', 'GN', 'GN_GAL'] },
  { key: 'geo', name: 'Geosynchronous', regimes: ['IG', 'GE', 'WA'] },
  { key: 'heo', name: 'Highly elliptical', regimes: ['HE72', 'HE', 'HX'] },
  { key: 'drag', name: 'Strong drag', regimes: ['T', 'P'], heights: true },
];
// a state's height above the WGS-84 ellipsoid, km, to about 0.1 km (the ellipsoid's radius at the state's geocentric latitude in the
// GCRF; the frame's pole is within 0.3 deg of the Earth's)
const WGS84_A = 6378.137, WGS84_F = 1 / 298.257223563;
const heightKm = (r) => { const n = Math.hypot(r[0], r[1], r[2]), s = r[2] / n, c2 = 1 - s * s, b = WGS84_A * (1 - WGS84_F);
  return n - (WGS84_A * b) / Math.sqrt(b * b * c2 + WGS84_A * WGS84_A * s * s); };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
// a bar row is of a trajectory: its line's key, arc, source, first state and the file's sha256 (a file written again is another trajectory)
const doneKey = (r) => `${r.key}|${r.arcH}|${r.source}|${r.from}|${r.sha256 ?? ''}`;

if (args.check) await check(); else if (args.worker) await worker(); else await main();

async function main() {
  const t0 = Date.now(), root = args['modules-root'], want = args['modules-commit'], out = args.out;
  if (!root || !want || !out) throw new Error('usage: bar.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 8] [--groups LS,DO] [--arcs 72,24]');
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments').toString().trim();
  if (dirty) throw new Error(`refused: this repository's working tree differs from its commit (the file names the commit):\n${dirty}`);
  const harnessCommit = git(REPO, 'rev-parse', 'HEAD').toString().trim();
  const commit = git(root, 'rev-parse', '--verify', `${want}^{commit}`).toString().trim();
  const wasm = git(root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`);
  const version = JSON.parse(git(root, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  const wasmSha = sha256(wasm);
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const N = await import('./lib/numerical.mjs');
  const { SETTINGS } = await import('./lib/settings.mjs');
  const { FFM_220 } = await import(path.join(REPO, 'experiments/operator-theory/lib/build.mjs'));
  const dir = path.join(A.STORE_ROOT, 'bar', wasmSha.slice(0, 12)), file = path.join(dir, 'module.wasm'), rowsFile = path.join(dir, CAPS ? `rows-caps${CAPS[0]}-${CAPS[1]}.jsonl` : 'rows.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
  const groups = args.groups ? args.groups.split(',') : ALL, arcs = (args.arcs ?? '72,24').split(',').map(Number);
  // Each manifest line flies one fit, and a window's trajectory is the line of the fit whose figures the row reads, never the last line of
  // the window. A line's fit identity and a row's, and whether they are one fit, are lib/numerical.mjs's (lineFitOf, rowFitOf, sameFit),
  // as trajectories.mjs reads them: the same setting and process, and the same first state where the row names one, else the same arc
  // start to the millisecond.
  const traj = path.join(A.STORE_ROOT, 'numerical-trajectories');
  // (a line that does not parse is read as no line: it holds no fit)
  const allLines = fs.readFileSync(path.join(traj, 'manifest.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }), lastWriter = new Map();
  allLines.forEach((x, i) => { if (x.file) lastWriter.set(x.file, i); });
  const fitOfLine = (x, i) => N.lineFitOf(x, lastWriter.get(x.file) === i);
  const linesOf = new Map();
  allLines.forEach((x, i) => { const k = `${x.key}|${x.arcH}`; if (!linesOf.has(k)) linesOf.set(k, []); linesOf.get(k).push({ x, fit: fitOfLine(x, i) }); });
  const rowFitOf = N.rowFitOf, sameFit = N.sameFit;
  // the last line holding the row's fit for a window (the last of that fit with a trajectory), or why there is none: an attempt at that
  // fit that failed (failed, with its kind: lib/numerical.mjs failureOf), lines of other fits only, or lines whose fit is not known
  const lineFor = (key, a, rf) => {
    const ls = linesOf.get(`${key}|${a}`) ?? [], hit = ls.filter((l) => sameFit(l.fit, rf)).at(-1);
    if (hit) return { m: hit.x };
    if (!rf) return { m: null, why: null };
    const tried = ls.filter((l) => sameFit(N.triedOf(l.x), rf)).at(-1);
    return { m: null, why: tried ? 'failed' : ls.some((l) => l.fit) ? 'otherFitOnly' : ls.some((l) => l.x.file) ? 'fitUnknown' : 'noLine', ...(tried ? { failure: N.failureOf(tried.x) } : {}) };
  };
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);
  // The windows each row scores, as table.mjs scores them with --burns: its listing (the first pass, and a regime's second pass once its
  // numerical rows are all in the store), its numerical row (the refit after the burn where the rule moved the arc), its arm (the
  // fullest stored setting by name), and a window counted where AP's row of this build (the table's, <store>/table/<wasm sha12>) and that
  // arm both have a figure at one lead at least. The numerical day-5 figure is the same row's.
  const base = new Map();
  for (const f of fs.readdirSync(path.join(A.STORE_ROOT, A.NUMERICAL_STORE)).filter((x) => /^rows-truth-.*\.jsonl$/.test(x)))
    for (const r of readRows(path.join(A.STORE_ROOT, A.NUMERICAL_STORE, f))) { const k = `${r.key}|${r.arcH}`; if (A.laterWins(base.get(k), r, W.GROUPS[r.group]?.oneFile)) base.set(k, r); }
  // --burns <lists> [--after-burn-store <folder>]: the refits after a burn, read as trajectories.mjs reads them (lib/numerical.mjs
  // readAfterBurn): from the folder (lib/arms.mjs NUMERICAL_AFTER_BURN.store unless given), which must be in the store, each row's list
  // (burnList) the one --burns gives for its satellite, or the run is refused; without --burns no refit is read, and a folder named is
  // refused. The result names the lists' digest and the folder; with --scoreboard both must be the scoreboard's
  const { afterBurn, afterBurnGroups, abStore } = N.readAfterBurn({ burns: args.burns, store: args['after-burn-store'], readRows });
  const lists = args.burns ? { digest: A.listsDigest(args.burns).slice(0, 12), afterBurnStore: abStore } : null;
  // the drag setting fitted and flown again at 1e-13 (lib/arms.mjs NUMERICAL_TIGHT, stack issue 520), as table.mjs reads it: one row per
  // window and fit arc whatever the outcome; of two for one window, a fit over a failure over no truth
  const tight = new Map(), tightDir = path.join(A.STORE_ROOT, A.NUMERICAL_TIGHT.store), tightRank = (r) => (r.error ? 0 : r.arms?.FFMq?.ok ? 2 : 1);
  for (const r of fs.existsSync(tightDir) ? fs.readdirSync(tightDir).filter((f) => /^rows-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(tightDir, f))) : []) {
    if (!r.error && r.arms?.FFMq?.arm !== A.NUMERICAL_TIGHT.to) throw new Error(`${A.NUMERICAL_TIGHT.store}: ${r.key} ${r.arcH} h is not of ${A.NUMERICAL_TIGHT.to}`);
    const k = `${r.key}|${r.arcH}`;
    if (!tight.has(k) || tightRank(r) > tightRank(tight.get(k))) tight.set(k, r);
  }
  const REFIT = N.REFIT;
  // the window's numerical row and its reason, by the one function table.mjs reads, and the row's arm and its listed windows, by the ones
  // trajectories.mjs reads (lib/numerical.mjs)
  const numericalOf = (w, arc) => N.numericalOf({ w, arc, base, afterBurn, afterBurnGroups });
  const meters = (row, arm, day) => { const e = arm ? row?.arms?.[arm]?.ok && row.arms[arm].days?.[day]?.e : row?.days?.[day]?.e; return Number.isFinite(e) ? e * 1000 : null; };
  const listed = N.listedOf(groups, base);
  const apRows = new Map(readRows(path.join(A.STORE_ROOT, 'table', wasmSha.slice(0, 12), 'rows.jsonl')).filter((r) => (r.theory ?? 'AP') === 'AP' && r.ap?.sha256 === wasmSha).map((r) => [`${r.key}|${r.arcH}`, r]));
  // --scoreboard <the same build's scoreboard file>: each row's windows and satellites are the scoreboard row's own (the windows it scores),
  // so "flown on N of M" reads against the scoreboard; without it, the windows listed for the row. Before anything is flown: each row's
  // numerical tolerance here must be the scoreboard row's (its configuration sentence), and the store of refits after a burn the one the
  // scoreboard names, or nothing is flown or written
  const board = args.scoreboard ? JSON.parse(fs.readFileSync(args.scoreboard, 'utf8')) : null;
  if (board && board.module?.wasmSha256 !== wasmSha) throw new Error(`--scoreboard is of wasm ${board.module?.wasmSha256}, not ${wasmSha}`);
  const boardRow = (g, a) => board?.rows.find((r) => r.regime === W.GROUPS[g].label && r.fitHours === a) ?? null;
  // a scoreboard cut with --carry-from (table.mjs): on a row whose AP windows it carried from the earlier build (the row's carried.ap), a
  // window this build's table store has no AP row for counts that build's row, as the table counts it; the bar flies every window on this
  // build all the same
  // the build carried from is the scoreboard's own field (carriedFrom); a file written before table.mjs wrote the field names it in its command
  const carryFrom = board ? (board.carriedFrom?.wasmSha256?.slice(0, 12) ?? /--carry-from ([0-9a-f]{12})/.exec(board.harness?.command ?? '')?.[1] ?? null) : null;
  const carriedAp = carryFrom ? new Map(readRows(path.join(A.STORE_ROOT, 'table', carryFrom, 'rows.jsonl')).filter((r) => (r.theory ?? 'AP') === 'AP' && r.ap?.sha256?.startsWith(carryFrom)).map((r) => [`${r.key}|${r.arcH}`, r])) : new Map();
  if (carryFrom && !carriedAp.size) throw new Error(`the scoreboard carried rows from ${carryFrom}, and the store holds no AP row of that build`);
  if (board?.carriedFrom && [...carriedAp.values()].some((r) => r.ap?.version !== board.carriedFrom.version || r.ap?.sha256 !== board.carriedFrom.wasmSha256)) throw new Error(`the scoreboard carried rows from sdn-ap ${board.carriedFrom.version} (${carryFrom}), and the store's rows of that folder are of another build`);
  const apRowOf = (g, a, key) => apRows.get(`${key}|${a}`) ?? ((boardRow(g, a)?.carried?.ap?.carried ?? 0) > 0 ? carriedAp.get(`${key}|${a}`) : undefined);
  const rowArm = new Map(), numDay5 = new Map(), scoredKeys = new Set(), rowTight = new Set(), rowTolerance = new Map(), rowAp = new Map(), rowWithout = new Map(), rowFit = new Map();
  for (const g of groups) for (const a of arcs) {
    const ws = listed.filter((w) => w.group === g && w.arcs.includes(a));
    if (!ws.length) continue;
    let bs = ws.map((w) => numericalOf(w, a));
    const label = N.rowArmOf(g, bs, afterBurnGroups);
    // stack issue 520, table.mjs's rule: the row at 1e-13 where every stored arm is the full drag setting, every window the rule gives a
    // numerical arm has a 1e-13 row (its fit, its failed fit or its record of no truth or coverage), and no window is a refit on the arc
    // after a burn or, in a regime with after-burn rows, lacks its decision row; here also every such window's 1e-13 manifest line, with a
    // trajectory where its 1e-13 fit holds one. Then every such window takes its 1e-13 row and line. Else every window at its stored
    // setting, rows and trajectories both: no row mixes two tolerances.
    if (label) {
      const tightOf = (b) => tight.get(`${b.key}|${b.arcH}`), armed = bs.filter((b) => !b.burnInArc);
      // a 1e-13 fit's trajectory: a manifest line of that fit (a 1e-13 row recording a failed fit or no truth needs none)
      const line13 = (b) => !tightOf(b)?.arms?.FFMq?.ok || !!lineFor(b.key, a, rowFitOf({ arms: { [label]: tightOf(b).arms.FFMq } }, label, Date.parse(b.cutoff), a)).m;
      const decided = !afterBurnGroups.has(g) || armed.every((b) => b.fitProcess);
      if (armed.length && decided && bs.every((b) => b.fitProcess !== REFIT) && armed.every((b) => (b.error || b.arms?.[label]?.arm === A.NUMERICAL_TIGHT.from) && tightOf(b) && line13(b))) {
        const lift = (b) => { const t = tightOf(b), { error, ...rest } = b; return t.error ? { ...rest, env: t.env, arms: {}, error: t.error } : { ...rest, env: t.env, arms: { ...b.arms, [label]: t.arms.FFMq } }; };
        bs = bs.map((b) => (b.burnInArc ? b : lift(b)));
        rowTight.add(`${g}|${a}`);
      }
      // the row's numerical tolerance, as its configuration sentence states it (the setting of its arm)
      const setting = bs.find((b) => b.arms?.[label]?.ok)?.arms[label].arm;
      rowTolerance.set(`${g}|${a}`, setting ? String(SETTINGS[setting].integrator.tolerance) : null);
    }
    rowArm.set(`${g}|${a}`, label);
    // why each window has no numerical figure by the rule (lib/numerical.mjs noArmWhy, as table.mjs gives it): a window whose numerical arc
    // starts elsewhere than AP's, to the millisecond, is not flown here either
    const whys = ws.map((w, i) => (label ? N.noArmWhy({ w, arc: a, ap: apRowOf(g, a, w.key), nr: bs[i], lists: args.burns }) : null));
    bs = bs.map((b, i) => (whys[i] === 'armsOnDifferentArcs' ? { ...b, arms: {}, armsOnDifferentArcs: true } : b));
    // the row's windows as the scoreboard counts them (every window AP scored at one lead at least); of them, those with a numerical
    // figure are the ones the bar can fly (a forecast to fit AP's record to), and the others are counted by reason, as table.mjs does
    const apScored = ws.filter((w) => W.LEADS.some((d) => meters(apRowOf(g, a, w.key), null, d) != null)), why = { ruleLeavesNoArm: 0, fitFailed: 0, noTruthOrCoverage: 0, armsOnDifferentArcs: 0 }, none = [];
    rowAp.set(`${g}|${a}`, { windows: apScored.length, satellites: new Set(apScored.map((w) => w.name)).size });
    ws.forEach((w, i) => {
      if (!apScored.includes(w)) return;
      if (!label || W.LEADS.some((d) => meters(bs[i], label, d) != null)) scoredKeys.add(`${w.key}|${a}`);
      else { why[whys[i] ?? 'fitFailed'] += 1; none.push(w); }
      if (label) { numDay5.set(`${w.key}|${a}`, meters(bs[i], label, 5)); rowFit.set(`${w.key}|${a}`, rowFitOf(bs[i], label, w.cutoffMs, a)); }
    });
    const { armsOnDifferentArcs, ...reasons } = why;
    if (none.length) rowWithout.set(`${g}|${a}`, { windows: none.length, satellites: new Set(none.map((w) => w.name)).size, ...reasons, ...(armsOnDifferentArcs ? { armsOnDifferentArcs } : {}) });
  }
  if (board) {
    const byReason = (x) => JSON.stringify(x ? [x.windows, x.ruleLeavesNoArm, x.fitFailed, x.noTruthOrCoverage, x.armsOnDifferentArcs ?? 0] : null);
    const differ = [...new Set(listed.map((w) => w.group))].filter((g) => groups.includes(g)).flatMap((g) => arcs.map((a) => [g, a])).filter(([g, a]) => boardRow(g, a) && byReason(rowWithout.get(`${g}|${a}`)) !== byReason(boardRow(g, a).withoutNumericalFigure));
    if (differ.length) throw new Error(`refused: the windows without a numerical figure, by reason, are not the scoreboard's on ${differ.map(([g, a]) => `${W.GROUPS[g].label} (${a} h): here ${byReason(rowWithout.get(`${g}|${a}`))}, the scoreboard ${byReason(boardRow(g, a).withoutNumericalFigure)}`).join('; ')}`);
  }
  const toleranceOf = (c) => /at a tolerance of ([^ ]+)/.exec(String(c ?? ''))?.[1] ?? null;
  if (board) {
    // the scoreboard's burn lists and refit folder (its method line, with --burns) against this run's: both the same, or both none
    const named = board.burnLists ? board.burnLists.afterBurnStore : /read from the store folder ([^ ,]+)/.exec(board.statistic ?? '')?.[1] ?? null;
    const digest = board.burnLists ? board.burnLists.digest : /The burn lists read \(--burns\)[^:]*: ([0-9a-f]{12})\)/.exec(board.statistic ?? '')?.[1] ?? null;
    if ((digest ?? null) !== (lists?.digest ?? null)) throw new Error(`the scoreboard read the burn lists ${digest ?? 'none'}, this run ${lists?.digest ?? 'none'} (--burns)`);
    if ((named ?? null) !== (lists && afterBurnGroups.size ? abStore : null)) throw new Error(`the scoreboard read the refits after a burn from ${named ?? 'no folder'}, this run from ${lists && afterBurnGroups.size ? abStore : 'no folder'}`);
    for (const [k, label] of rowArm) {
      const [g, a] = k.split('|'), b = boardRow(g, Number(a));
      if (!b?.ffm || !label) continue;
      if (toleranceOf(b.ffm.configuration) !== rowTolerance.get(k)) throw new Error(`${W.GROUPS[g].label} ${a} h: the scoreboard's numerical arm is at ${toleranceOf(b.ffm.configuration)}, this store's at ${rowTolerance.get(k)}`);
    }
  }
  const stored = new Map();
  if (fs.existsSync(rowsFile)) for (const r of readRows(rowsFile)) if (r.wasmSha256 === wasmSha) stored.set(doneKey(r), r);
  // every window each row scores with a numerical figure (with --scoreboard; else every listed window) at its fit arcs; flown where its
  // manifest line holds a trajectory (a line of a failed fit or of no truth holds none)
  const exact = !!args.scoreboard, hasTrajectory = (m) => m && m.source !== 'none' && m.source !== 'failed' && m.file;
  // each window's line is the last line of the numerical row's own fit (lineFor); a window whose row has no fit, or whose lines are of
  // other fits or of no known fit, gets none and is counted by why
  const wanted = listed.flatMap((w) => w.arcs.filter((a) => arcs.includes(a) && (!exact || scoredKeys.has(`${w.key}|${a}`))).map((a) => ({ w, a, ...lineFor(w.key, a, rowFit.get(`${w.key}|${a}`) ?? null) })));
  const todo = wanted.filter((x) => hasTrajectory(x.m) && !stored.has(doneKey(x.m)));
  const jobs = Math.min(Number(args.jobs ?? 8), todo.length);
  console.error(`bar: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${wanted.length} window-arcs, ${wanted.filter((x) => hasTrajectory(x.m)).length} with a numerical trajectory, ${todo.length} to fly on ${jobs} jobs`);
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, '--version', version, '--groups', groups.join(','), ...(CAPS ? ['--caps', CAPS.join(',')] : [])], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => (next < todo.length ? child.send({ m: todo[next++].m }) : child.send({ stop: true }));
    child.on('message', (msg) => {
      if (msg.row) {
        const row = { ...msg.row, version, modulesCommit: commit, wasmSha256: wasmSha, harness: harnessCommit };
        fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`); stored.set(doneKey(row), row);
        flown += 1; if (flown % 25 === 0 || flown === todo.length) console.error(`  ${flown}/${todo.length}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));

  // the numerical arm's day-5 error against the precise orbit: the scoreboard's own figure for the window (its numerical row and arm)
  const ffmDay5 = (m) => numDay5.get(`${m.key}|${m.arcH}`) ?? null;
  const quantile = (v, p) => { const s = v.slice().sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  const cells = (xs) => {
    // a window whose fit is refused or whose flight fails counts against the share: the bar is met over every window attempted
    const ok = xs.filter((x) => x.r && !x.r.error), failed = xs.filter((x) => x.r?.error).length, D = ok.map((x) => x.r.maxDistanceM), met = D.filter((d) => d <= BAR_M).length;
    // the day-5 medians are paired: both over the windows where AP's figure and the numerical propagator's stored figure both exist;
    // unpaired counts the flown windows with AP's figure and no numerical figure in the store
    const pairs = ok.map((x) => [x.r.day5M, ffmDay5(x.m)]), paired = pairs.filter(([a, f]) => Number.isFinite(a) && Number.isFinite(f)), attempted = ok.length + failed;
    return { flown: ok.length, failed, withinBar: { windows: attempted, met, share: attempted ? Math.round((met / attempted) * 1000) / 1000 : null },
      maxDistanceM: { median: r1(quantile(D, 0.5)), worst: r1(D.length ? Math.max(...D) : null) },
      truthDay5: { windows: paired.length, unpaired: pairs.filter(([a, f]) => Number.isFinite(a) && !Number.isFinite(f)).length,
        ap: { medianM: r1(quantile(paired.map(([a]) => a), 0.5)) }, ffm: { medianM: r1(quantile(paired.map(([, f]) => f), 0.5)) } } };
  };
  const rows = [], byGroup = new Map(), manifestUsed = [];
  for (const g of ALL.filter((x) => groups.includes(x))) {
    for (const a of arcs) {
      const xs = wanted.filter((x) => x.w.group === g && x.a === a).map((x) => ({ ...x, r: hasTrajectory(x.m) ? stored.get(doneKey(x.m)) : null }));
      if (!xs.length) continue;
      const written = xs.filter((x) => hasTrajectory(x.m)).length, b = boardRow(g, a);
      if (board && !b) continue;
      // with --scoreboard the row's windows are the scoreboard row's (every window AP scored); of them the bar flies those with a numerical
      // figure, withoutNumericalFigure counts the others by reason, and a count that differs from the scoreboard's is a note
      const windows = b ? b.windows : xs.length, without = exact ? rowWithout.get(`${g}|${a}`) ?? null : null, mine = rowAp.get(`${g}|${a}`);
      const differs = b && mine && mine.windows !== b.windows;
      if (differs) console.error(`bar: ${W.GROUPS[g].label} ${a} h: ${mine.windows} windows AP scored here against the scoreboard's ${b.windows}`);
      const head = { regime: W.GROUPS[g].label, fitHours: a, numericalTolerance: rowTolerance.get(`${g}|${a}`) ?? null, satellites: b ? b.satellites : new Set(xs.map((x) => x.w.name)).size, windows, ...(without ? { withoutNumericalFigure: without } : {}), ...(differs ? { note: `${mine.windows} windows AP scored by this file's reading of the store against the scoreboard's ${b.windows}` } : {}) };
      if (!written) { rows.push({ ...head, noNumericalArm: true }); continue; }
      const c = cells(xs.filter((x) => hasTrajectory(x.m)));
      const refitAfterBurn = xs.filter((x) => x.m && (x.m.fit?.process === 'after burn' || /after the burn/.test(x.m.source ?? ''))).length;
      // of the windows without a trajectory, those whose lines are all of other fits, and those whose lines' fit is not known (a file
      // written again by a later line)
      const notOfThisFit = { otherFitOnly: xs.filter((x) => x.why === 'otherFitOnly').length, fitUnknown: xs.filter((x) => x.why === 'fitUnknown').length };
      // and those whose last attempt at the row's fit failed, by kind: a refit refused against the stored weighted RMS, no coverage, other
      const failedOf = xs.filter((x) => x.why === 'failed'), failed = failedOf.length ? Object.fromEntries([['windows', failedOf.length], ...['refitNotTheStoredFit', 'coverage', 'other'].map((k) => [k, failedOf.filter((x) => x.failure === k).length])]) : null;
      // the manifest lines the row read (each as stored, in window order): their count and the first 12 hex of their sha256, so a bar file
      // says what it was cut from and a re-run on a grown manifest can be compared
      const used = xs.filter((x) => x.m).sort((p, q) => p.w.key.localeCompare(q.w.key)).map((x) => `${JSON.stringify(x.m)}\n`);
      manifestUsed.push(...used);
      rows.push({ ...head, ...c, trajectories: { written, missing: Math.max(0, xs.length - written), ...(notOfThisFit.otherFitOnly || notOfThisFit.fitUnknown ? { notOfThisFit } : {}), ...(failed ? { failed } : {}), refitAfterBurn, manifestLines: { lines: used.length, sha256: sha256(used.join('')).slice(0, 12) } } });
      byGroup.set(`${g}|${a}`, xs.filter((x) => hasTrajectory(x.m)));
    }
  }
  // a front-page group pools each of its rows once, at the row's longest fit arc here (72 h where the row has one, else 24 h), so no
  // window counts under two arcs; groups[].rows names the arc each row contributes
  const pooledArc = (g) => [...arcs].sort((p, q) => q - p).find((a) => byGroup.has(`${g}|${a}`)) ?? null;
  // a group's heights (the drag group's): the lowest and highest height above the ellipsoid of the numerical forecast's states from the
  // cutoff to 120 h after it, over every window the group pools and flew, read from the trajectory files its windows were flown on
  const trajDir = path.join(A.STORE_ROOT, 'numerical-trajectories');
  const heightsOf = (xs) => {
    let lo = Infinity, hi = -Infinity;
    for (const x of xs) {
      // a window whose flight failed or was refused (its row records an error) adds nothing, nor a file whose sha256 is not its line's
      if (x.r?.error) continue;
      const buf = fs.readFileSync(path.join(trajDir, x.m.file));
      if (x.m.sha256 && sha256(buf) !== x.m.sha256) continue;
      if (buf.byteLength !== x.m.count * 48) throw new Error(`${x.m.file}: the trajectory file holds ${buf.byteLength / 48} states, the manifest ${x.m.count}`);
      const f = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8), from = Date.parse(x.m.from), step = x.m.stepS * 1000, D0 = x.w.cutoffMs;
      for (let k = 0; k < x.m.count; k += 1) {
        const t = from + k * step;
        if (t < D0 || t > D0 + BAR_H * HOUR) continue;
        const h = heightKm([f[6 * k], f[6 * k + 1], f[6 * k + 2]]);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    return Number.isFinite(lo) ? { lowestKm: Math.round(lo), highestKm: Math.round(hi) } : null;
  };
  const groupsOut = GROUPS.map((G) => {
    const parts = G.regimes.filter((g) => groups.includes(g)).map((g) => ({ g, a: pooledArc(g) })).filter((p) => p.a != null);
    const pooled = parts.flatMap((p) => byGroup.get(`${p.g}|${p.a}`)), c = cells(pooled);
    const tol = (p) => rowTolerance.get(`${p.g}|${p.a}`) ?? null, tols = [...new Set(parts.map(tol).filter((x) => x != null))];
    return { key: G.key, name: G.name, regimes: [...new Set(G.regimes.filter((g) => groups.includes(g)).map((g) => W.GROUPS[g].label))],
      rows: parts.map((p) => ({ regime: W.GROUPS[p.g].label, fitHours: p.a, numericalTolerance: tol(p) })), flown: c.flown, failed: c.failed, met: c.withinBar.met, truthDay5: c.truthDay5,
      ...(G.heights ? { heightsKm: heightsOf(pooled) } : {}),
      ...(tols.length > 1 ? { toleranceNote: `pools rows whose numerical arms are fitted and flown at different tolerances (${parts.map((p) => `${W.GROUPS[p.g].label} ${p.a} h ${tol(p) ? `at ${tol(p)}` : 'without a numerical arm'}`).join(', ')})` } : {}) };
  });
  const doc = {
    schema: 'sdn-ap-catalog-fit/1',
    measured: new Date().toISOString().slice(0, 10),
    module: { version, modulesCommit: commit, wasmSha256: wasmSha },
    harness: { repo: 'orbit-accuracy-experiments', commit: harnessCommit, command: ['node', 'experiments/headline-loop/bar.mjs', ...repositoryArgs(process.argv.slice(2))].join(' ') },
    ffm: { version: FFM_220.version, wasmSha256: FFM_220.wasmSha256, modulesCommit: FFM_220.modulesCommit },
    method: 'The numerical propagator (FFM, the row\'s numerical arm as the scoreboard names it) is fitted to the row\'s reference orbit (the scoreboard row\'s truth: a precise orbit, except the WAAS broadcast ephemeris on the commercial geostationary row; on the highly elliptical rows the reference each scoreboard row names in truthNote) over the fit arc before the cutoff, data before the cutoff only (where burn lists are read, on the arc after the last burn known at the cutoff where that rule moves the arc), and flown 7 days past the cutoff. AP\'s record is fitted, by the module\'s fit with the row\'s $PCF and the space weather known at the cutoff, to that forecast\'s states from the cutoff to 120 h after it, one every 300 s; the fit is one per window. A window\'s figure is the largest 3D distance between AP\'s record and the numerical forecast over 0 to 120 h on the forecast\'s 300 s grid (the bar: at most 100 m). The day-5 figures are the root mean square of the 3D error against the row\'s reference orbit over the 24 h ending at 120 h, for AP\'s record and for the numerical forecast; both medians are over the same windows, those where both figures exist (truthDay5.windows), and truthDay5.unpaired counts the flown windows with AP\'s figure and no numerical figure in the store. A window without a stored numerical trajectory is neither flown nor failed (trajectories.missing); a fit or flight that fails is counted in failed and against the share (withinBar.windows is every window attempted, flown and failed), never dropped. Each row states its numerical arm\'s integrator tolerance (numericalTolerance): with drag, 1e-13 on a row where every stored arm is that setting, every window with a numerical arm by the rule has a 1e-13 row (its fit, its failed fit, or its record of no truth or coverage) and its 1e-13 trajectory line (with a trajectory where the fit holds one), and no window is a refit on the arc after a burn or lacks the after-burn decision; every other row the tolerance of its stored setting. A row never mixes two, and a front-page group that pools rows of different tolerances says so (toleranceNote). Bound to a scoreboard, a row\'s windows are the scoreboard row\'s, every window AP scored (where the scoreboard carried a row\'s AP windows from an earlier build, those windows too, as the scoreboard counts them); the bar flies every window on this file\'s build, and flies those with a numerical figure (a forecast to fit AP\'s record to), and withoutNumericalFigure counts the others by reason as the scoreboard does (ruleLeavesNoArm, fitFailed, noTruthOrCoverage, and on a 72 h fit armsOnDifferentArcs: a window whose numerical arc starts elsewhere than AP\'s, which is not flown), apart from trajectories.missing (a window with a numerical figure and no stored trajectory; the windows without a numerical figure are counted in withoutNumericalFigure, not here). burnLists names the burn lists read for the refits after a burn (the first 12 hex digits of their digest, as the scoreboard states it) and the store folder of those refits, or is null where none was read. A window\'s trajectory is the manifest line of the fit whose figures the row reads (its setting, its process, the full arc or the arc after a burn, and the arc\'s start), never another fit\'s; trajectories.notOfThisFit counts the windows whose lines are all of other fits (otherFitOnly) or of no known fit (fitUnknown: a trajectory file written again by a later line, a refit whose weighted RMS is not the stored fit\'s, or a refit after a burn that records no arc start); trajectories.failed counts, of the missing, those whose last attempt at the row\'s fit failed, by kind (refitNotTheStoredFit: a refit refused against the stored weighted RMS; coverage; other): such a window has no trajectory, so it is neither flown nor counted in the row\'s failed, and the two failed counts do not add. trajectories.manifestLines gives, per row, the count of the trajectory manifest lines it read and the first 12 hex digits of their sha256 (each line as stored, in window order); manifestLines gives the same over every row. Two bar files cut from the same lines have the same digests. Each trajectory file is read only where its sha256 is the one its line names; a window whose file is not is refused. A group (groups) pools each of its rows once, at the row\'s longest fit arc in this file (groups[].rows names it), so no window counts twice: the front page\'s four, and strong drag (both strong-drag rows; also in low Earth orbit), whose heightsKm are the lowest and highest height above the WGS-84 ellipsoid of the numerical forecast\'s states from the cutoff to 120 h after it, over every window it pools whose flight holds no error, each file read at its line\'s sha256.',
    bar: { withinM: BAR_M, fromHours: 0, toHours: BAR_H, stepS: STEP_S },
    burnLists: lists ? { digest: lists.digest, afterBurnStore: afterBurnGroups.size ? lists.afterBurnStore : null } : null,
    // every manifest line the rows read, in row and window order (each row's own in trajectories.manifestLines)
    manifestLines: { lines: manifestUsed.length, sha256: sha256(manifestUsed.join('')).slice(0, 12) },
    ...(CAPS ? { caps: { tesseral: CAPS[0], zonal: CAPS[1], records: 'every record fitted at these degrees, its other forces the row\'s own $PCF\'s: a study of the record\'s degrees, not the release\'s figure' } } : {}),
    ...(board ? { scoreboard: { schema: board.schema, sha256: sha256(fs.readFileSync(args.scoreboard)), windows: 'each row\'s windows and satellites are the scoreboard row\'s' } } : {}),
    rows,
    groups: groupsOut,
  };
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.error(`bar: wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

async function worker() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const APL = await import(path.join(REPO, 'experiments/operator-theory/lib/ap.mjs'));
  const { openModules } = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/modules.mjs'));
  const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const S = A.S, arms = await A.openArms({}), m = await openModules(), env = envRecord();
  const h = await createStandaloneHarness('browser', args.wasm, { surface: 'direct' });
  const invoke = async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r; };
  // --caps: the row's $PCF (lib/arms.mjs PCF: AP, AP_VACUUM or AP_ECOM2, with _TIDES) with the record's degrees replaced
  const capsOf = (choice) => (CAPS ? { label: `${choice.label} at ${CAPS[0]}/${CAPS[1]}`, pcf: APL.fitPcf({ forces: {
    ...APL.apForces({ tesseral: CAPS[0], zonal: CAPS[1], atmosphere: !choice.label.startsWith('AP_VACUUM'), ecom2: choice.label.startsWith('AP_ECOM2') }),
    ...(choice.label.endsWith('_TIDES') ? { SOLID_TIDES: 1 } : {}) }, fit: null }) } : choice);
  const iso = (t) => new Date(t).toISOString();
  const flightPcf = (epochs) => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new S.flatbuffers.Builder(1 << 14); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
  const fly = async (ocm, epochs) => S.oemLines(new Uint8Array((await invoke('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(epochs) }])).outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v }));
  const fit = async (oem, pcf, spw) => new Uint8Array((await invoke('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])])).outputs.find((o) => o.portId === 'elements').payload);
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  const all = W.windowsOf(args.groups.split(',')), winOf = new Map([...all.windows, ...all.second].map((w) => [w.key, w]));
  const traj = path.join(A.STORE_ROOT, 'numerical-trajectories');
  // the last line of the same tolerance (a 1e-13 line beside a 1e-10 one is not a change of the 1e-10 trajectory)
  // the manifest's last line that wrote the trajectory file this line names: a later line writing the same file means the file is no
  // longer this line's fit
  const lastLine = (file) => { let last = null; for (const l of fs.readFileSync(path.join(traj, 'manifest.jsonl'), 'utf8').split('\n').filter(Boolean)) { let r = null; try { r = JSON.parse(l); } catch { continue; } if (r.file === file) last = r; } return last; };
  const flyOne = async (man) => {
    const t1 = performance.now(), row = { key: man.key, group: man.group, arcH: man.arcH, arm: man.arm, source: man.source, from: man.from, ...(man.sha256 ? { sha256: man.sha256 } : {}), env };
    try {
      const w = winOf.get(man.key);
      if (!w) throw new Error('not a listed window');
      const D0 = w.cutoffMs, G = W.GROUPS[w.group];
      // the file is still this line's: no later line wrote it again since the manifest was read
      const now = lastLine(man.file);
      if (!now || now.key !== man.key || now.arcH !== man.arcH || now.source !== man.source || now.from !== man.from || now.count !== man.count) throw new Error('trajectory changed since the manifest was read');
      const buf = fs.readFileSync(path.join(traj, man.file));
      if (man.sha256 && sha256(buf) !== man.sha256) throw new Error('the trajectory file is not the one its line names (sha256)');
      if (buf.byteLength !== man.count * 48) throw new Error(`trajectory file holds ${buf.byteLength / 48} states, the manifest ${man.count}`);
      const f64 = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8), from = Date.parse(man.from), step = man.stepS * 1000;
      const num = Array.from({ length: man.count }, (_, k) => ({ t: from + k * step, epoch: iso(from + k * step), r: [f64[6 * k], f64[6 * k + 1], f64[6 * k + 2]], v: [f64[6 * k + 3], f64[6 * k + 4], f64[6 * k + 5]] }));
      const span = num.filter((l) => l.t >= D0 && l.t <= D0 + BAR_H * HOUR);
      if (span.length < 2) throw new Error('no forecast span');
      const truth = await W.truthOf(w, D0 - man.arcH * HOUR - HOUR, D0 + 7 * DAY + HOUR, arms.axes);
      // a one-file window (windows.mjs oneFile): AP's record and the numerical trajectory read the same reference file, or the window is refused
      if (G.oneFile && (!man.truthFile || man.truthFile !== truth.file)) throw new Error(`the reference file differs: the trajectory's ${man.truthFile ?? 'names none'}, AP's ${truth.file}`);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      const wx = G.vacuum ? null : W.weatherAt(D0), object = { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 };
      const choice = capsOf(A.apPcfFor(w.group, args.version, G.vacuum, man.arcH));
      row.pcf = choice.label;
      const lines = span.map(({ epoch, r, v }) => ({ epoch, r, v }));
      const tf = performance.now();
      const ocm = await fit(S.oemBytes({ frame: 'GCRF', object, lines, useableStart: lines[0].epoch, useableStop: lines.at(-1).epoch }), choice.pcf, wx?.spw);
      row.fitS = r1((performance.now() - tf) / 1000);
      const info = APL.readOcm(ocm);
      const flown = await fly(ocm, span.map((l) => l.epoch));
      const d = flown.map((s, k) => Math.hypot(s.r[0] - span[k].r[0], s.r[1] - span[k].r[1], s.r[2] - span[k].r[2]) * 1000);
      const at = d.indexOf(Math.max(...d));
      Object.assign(row, { maxDistanceM: r1(d[at]), atH: r1((span[at].t - D0) / HOUR), fitRmsM: r1(info.fitRmsKm * 1000), bterm: info.bterm ?? null });
      if (sc.entered.includes(5)) { const days = W.byDay(await m.rtn(await fly(ocm, sc.epochs), sc.truth), sc.entered, sc.sizes); row.day5M = r1(days[5].e * 1000); }
    } catch (e) { row.error = String(e?.message ?? e).slice(0, 200); }
    row.wallS = r1((performance.now() - t1) / 1000);
    return row;
  };
  process.on('message', async (msg) => { if (msg.stop) process.exit(0); process.send({ row: await flyOne(msg.m) }); });
  process.send({ ready: true });
}

/** --check: on a store of its own, made from the real store: its numerical rows and fitted products linked (symbolic links; the check
 *  writes into neither), the 0.6.34 build's AP rows of the 72 h TESS row copied into the store's table folder for that build, a refit
 *  folder holding the cut's refit rows of that row (every window, so the row's arm is the cut's), and the cut's lists. Three of the row's
 *  windows, their trajectories made by trajectories.mjs: one whose refit after a burn is on an arc under 24 h (the short arc), one on its
 *  full arc, and one whose refit row's stored weighted RMS is not its fit's (the refit is refused). One byte of the full-arc window's
 *  trajectory file is changed before the bar reads it. The bar finds the short arc's line (its fit the row's, after a burn, its arc
 *  start the rule's, under 24 h) and flies it to a figure; refuses the changed file (counted in failed, against the share); counts the
 *  refused refit in trajectories.failed as refitNotTheStoredFit; and a second run flies nothing. Not covered here: the scoreboard
 *  binding (--scoreboard), the 1e-13 rows, --caps, more than one job. Without the cut's lists, refit folder or that build's AP rows in
 *  the store the check fails. */
async function check() {
  usePackages();
  const E2 = await import('./lib/e2e.mjs'), W = await import('./lib/windows.mjs'), A = await import('./lib/arms.mjs'), N = await import('./lib/numerical.mjs');
  const { check: ok, done } = E2.checker('BAR');
  const BUILD = { version: '0.6.34', commit: '1810ad02b9c4ebe4e272a232027fe034b99e175e', sha12: 'a18f12431804' }, modulesRoot = process.env.HEADLINE_LOOP_CHECK_MODULES_ROOT ?? MODULES_ROOT;
  const lists = path.join(A.STORE_ROOT, 'lists-9baa9131dcf8'), folder = `${A.NUMERICAL_STORE}-after-burn-9baa9131dcf8`, abReal = path.join(A.STORE_ROOT, folder), apReal = path.join(A.STORE_ROOT, 'table', BUILD.sha12, 'rows.jsonl');
  if (![lists, abReal, apReal].every((f) => fs.existsSync(f))) { ok(false, `the store holds no lists-9baa9131dcf8, ${folder} or the ${BUILD.version} build's table rows: nothing was checked`); done('nothing'); }
  const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const dir = E2.tmp('bar'), store = path.join(dir, 'store'), keys = path.join(dir, 'keys.txt'), out = path.join(dir, 'bar.json'), env = { HEADLINE_LOOP_STORE: store }, TRAJ = path.join(store, 'numerical-trajectories');
  fs.mkdirSync(path.join(store, folder), { recursive: true }); fs.mkdirSync(path.join(store, 'table', BUILD.sha12), { recursive: true });
  fs.symlinkSync(path.join(A.STORE_ROOT, A.NUMERICAL_STORE), path.join(store, A.NUMERICAL_STORE)); fs.symlinkSync(path.join(A.STORE_ROOT, 'ffm-cache'), path.join(store, 'ffm-cache'));
  // the cut's refit rows of the 72 h TESS row, as the tools read them (the first of a window-arc's)
  const sel = new Map();
  for (const r of fs.readdirSync(abReal).filter((f) => /^rows-after-burn-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(abReal, f))).filter((r) => r.group === 'HE72')) { const k = `${r.key}|${r.arcH}`; if (!sel.has(k) || (sel.get(k).error && !r.error)) sel.set(k, r); }
  const held = [...sel.values()], refits = held.filter((r) => r.arcH === 72 && r.fitProcess === N.REFIT && r.arms?.FFMq?.ok && !r.burnInArc);
  const short = refits.find((r) => r.fitArcHours < 24), refused = refits.find((r) => r !== short), full = held.find((r) => r.arcH === 72 && /^the full arc/.test(r.fitProcess ?? ''));
  const off = refused ? { ...refused, arms: { ...refused.arms, FFMq: { ...refused.arms.FFMq, weightedRms: refused.arms.FFMq.weightedRms * 1.5 } } } : null;
  fs.writeFileSync(path.join(store, folder, 'rows-after-burn-check.jsonl'), `${held.map((r) => JSON.stringify(r === refused ? off : r)).join('\n')}\n`);
  // the build's AP rows of the row, copied
  fs.writeFileSync(path.join(store, 'table', BUILD.sha12, 'rows.jsonl'), `${read(apReal).filter((r) => r.group === 'HE72' && (r.theory ?? 'AP') === 'AP').map((r) => JSON.stringify(r)).join('\n')}\n`);
  const picked = [short, full, refused].filter(Boolean);
  fs.writeFileSync(keys, `${picked.map((r) => r.key).join('\n')}\n`);
  const t1 = E2.run('trajectories.mjs', ['--keys-file', keys, '--groups', 'HE72', '--burns', lists, '--after-burn-store', folder, '--refit', '--jobs', '1'], env);
  const lines = fs.existsSync(path.join(TRAJ, 'manifest.jsonl')) ? read(path.join(TRAJ, 'manifest.jsonl')) : [], lineOf = (r) => lines.filter((x) => x.key === r?.key && x.arcH === 72).at(-1);
  ok(t1.code === 0 && picked.length === 3 && lineOf(short)?.fit?.process === 'after burn' && lineOf(full)?.fit?.process === 'full arc' && lineOf(refused)?.source === 'failed' && /the refit is not the stored fit/.test(lineOf(refused)?.error ?? ''),
    `the trajectories: ${t1.err.slice(-300)} ${JSON.stringify(picked.map((r) => [r.fitArcHours, lineOf(r)?.source?.slice(0, 30), lineOf(r)?.error?.slice(0, 40)]))}`);
  // one byte of the full-arc window's file changed
  const fullFile = lineOf(full)?.file ? path.join(TRAJ, lineOf(full).file) : null;
  if (fullFile) { const b = fs.readFileSync(fullFile); b[100] ^= 1; fs.writeFileSync(fullFile, b); }
  const bar = () => E2.run('bar.mjs', ['--modules-commit', BUILD.commit, '--modules-root', modulesRoot, '--out', out, '--groups', 'HE72', '--arcs', '72', '--burns', lists, '--after-burn-store', folder, '--jobs', '1'], env);
  const barRows = () => (fs.existsSync(path.join(store, 'bar', BUILD.sha12, 'rows.jsonl')) ? read(path.join(store, 'bar', BUILD.sha12, 'rows.jsonl')) : []);
  const b1 = bar(), doc1 = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { rows: [] }, row1 = doc1.rows.find((r) => r.regime === W.GROUPS.HE72.label && r.fitHours === 72), rows1 = barRows();
  const w = W.windowsOf(['HE72']).windows.find((x) => x.key === short?.key), barShort = rows1.find((r) => r.key === short?.key), barFull = rows1.find((r) => r.key === full?.key);
  // the short arc's start as the row gives it (lib/numerical.mjs rowFitOf: its recorded start, else the rule's from its last burn)
  const arcStart = short && w ? N.rowFitOf(short, 'FFMq', w.cutoffMs, 72)?.arcStart : null;
  ok(b1.code === 0 && barShort && !barShort.error && Number.isFinite(barShort.maxDistanceM) && barShort.sha256 === lineOf(short).sha256 && /after the burn/.test(barShort.source) && Date.parse(lineOf(short).fit.arcStart) === Date.parse(arcStart) && w.cutoffMs - Date.parse(arcStart) < 24 * 3600e3,
    `the short arc's line found and flown: ${b1.err.slice(-300)} ${JSON.stringify(barShort && { error: barShort.error, maxDistanceM: barShort.maxDistanceM, source: barShort.source?.slice(0, 30) })} ${arcStart}`);
  ok(/the trajectory file is not the one its line names \(sha256\)/.test(barFull?.error ?? '') && row1?.flown === 1 && row1?.failed === 1 && row1?.withinBar?.windows === 2,
    `the changed file refused: ${JSON.stringify(barFull && { error: barFull.error })} ${JSON.stringify(row1 && { flown: row1.flown, failed: row1.failed, withinBar: row1.withinBar })}`);
  ok(JSON.stringify(row1?.trajectories?.failed) === JSON.stringify({ windows: 1, refitNotTheStoredFit: 1, coverage: 0, other: 0 }) && row1.trajectories.written === 2 && row1.trajectories.refitAfterBurn === 1,
    `the refused refit counted: ${JSON.stringify(row1?.trajectories)}`);
  const b2 = bar(), rows2 = barRows();
  ok(b2.code === 0 && / 0 to fly/.test(b2.err) && rows2.length === rows1.length, `a second run flew again: ${b2.err.slice(-200)} ${rows2.length - rows1.length} rows`);
  fs.rmSync(dir, { recursive: true, force: true });
  done('bar.mjs, on the 72 h TESS row, finds the line of a refit after a burn on an arc under 24 h (the row\'s fit, its arc start the rule\'s) and flies it to a figure; refuses a trajectory file whose sha256 is not its line\'s, counting it in failed and against the share; counts a refit refused against the stored weighted RMS in trajectories.failed; and a second run flies nothing');
}

function repositoryArgs(argv) { const out = []; for (let i = 0; i < argv.length; i += 1) { if (['--modules-root', '--out', '--scoreboard', '--burns'].includes(argv[i])) { i += 1; continue; } out.push(argv[i]); } return out; }
