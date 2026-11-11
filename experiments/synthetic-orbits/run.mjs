// Synthetic orbits over the whole orbit regime, each scored against the numerical propagator (stack #498). For every case of cases.mjs
// (seeded): the state at the truth's start (D0 - 72 h) is made from the case's mean elements (the record seed.mjs writes) by ONE named
// reference build, sdn-ap 0.6.26 (modules 7ed7cf88, wasm 9119284b8f97), whatever build is under test, so a case's starting state is a
// function of the case and that build alone; the numerical propagator (FFM 2.2.0, pinned by hash in headline-loop/lib/ffm.mjs) flies it
// through the fit arc and 7 days past it on a 300 s grid, and that flight is the truth. A drag case's truth is flown at tolerance 1e-13
// (headline-loop/lib/settings.mjs L70S13, DRAG_TRUTH below); the truth without drag at 1e-10. The truth is
// cached in <store>/synthetic/truth/ by the hash of everything it depends on (the starting state, FFM's, the kernel's and the Earth
// orientation's builds, the setting, the force terms, the weather rows and the span), shared by every clone and process: a run reads it
// when it is there and flies it once when it is not (a lock file; a second process waits for the first). Each row names its truth's hash
// and whether it was read or flown; a run prints its hit rate. AP and our SGP4-XP (the build under test) are fitted to
// the truth before the cutoff D0 and flown; both see the same space weather (the weather known at the cutoff, on the truth too). Scored:
// D, the largest 3D distance to the truth over 0 to 120 h on the 300 s grid, with the hour it occurs and the first hour the distance
// passes 100 m (the bar: AP's forecast never more than 100 m from the numerical propagator at any time from 0 to 5 days; pass: D <= 100 m
// over the whole 0 to 120 h, so a truth that ends before 120 h is never a pass); the same largest distance over
// 120 h to 7 days (pastBar: a record used past its 5 days, reported, not a criterion); the fit's and the truth's wall time; the root mean square of the 3D
// distance over the 24 h ending at each day 1 to 7; AP against SGP4-XP; and with --cost each one's cost per state (a warm set flown 7 days
// at 300 s, the median of three timed flights). Nothing here is any real satellite's data.
//
// Where the truth has no drag (the perigee at or above 2,500 km, or --no-drag), AP's settings (AP_VACUUM_TIDES) name its own Jacchia
// 1970 atmosphere and solve a drag term under the default prior; the truth has no drag there. Each row records the fitted term (bterm).
// Force switches, on both sides at once (the truth and AP; SGP4-XP is flown as it is), each stored apart from the full rows:
//   --no-drag                   the truth without drag; AP as above where the truth has no drag
//   --no-drag --no-radiation    gravity, the solid tide, relativity and the Sun and Moon only; AP as above, with its radiation term
//                               held at 0
// --guard flies a fixed subset that spans every band (every 8th grid and area-to-mass case and every named edge case), for pull requests.
// --perigee-scan (stack #550): for every case at e 0.3 and above and every named case at e 0.1 and above, each theory's record is also
// flown at 1 s for 120 s either side of each perigee passage over the scored span, and two distances off the record's own curve taken
// (fits.mjs SCAN): each state within 80 s of the passage from the 8-point curve through the states 90, 100, 110 and 120 s either side
// of the passage, and each state from the 8-point curve through its own neighbors 1 to 4 s either side, over the whole window. The
// 300 s grid catches such a block only when an epoch falls inside it; a case within the bar on the grid whose scan finds a state more
// than 100 m off by either measure, or whose scan failed, is reported as failing, with both figures (report.mjs). Those rows go to
// their own file, each with the digest of the scan's definition (scanDigest): a row of another definition is not read as done.
// Each theory's row also holds its record (base64), so a later pass can fly it again without fitting.
//
//   node experiments/synthetic-orbits/run.mjs --modules-commit <sha> --modules-root <modules checkout> [--seed 498] [--grid-step 1]
//     [--jobs 8] [--only <id,id,...>] [--guard] [--no-drag [--no-radiation]] [--fit <way>[,<way>...]] [--truth-start-h <h>] [--rung <name>]
//     [--xp] [--perigee-scan] [--scratch]
//                                         rows to <store>/synthetic/<wasm sha12>/rows[-<mode>].jsonl (a row there is not flown again)
//   node experiments/synthetic-orbits/run.mjs --report --modules-commit <sha> --modules-root <modules checkout> [--seed 498] [--grid-step 1]
//     [--guard] [--no-drag [--no-radiation]] [--fit <way>] [--truth-start-h <h>] [--rung <name>] [--xp] [--perigee-scan] --out <dir>
//     the result file and the maps (report.mjs)
//   node experiments/synthetic-orbits/dense.mjs ...   a record flown densely around an hour, pooled and fresh, or over its perigee
//     passages (dense.mjs)
//
// The build under test is read by git show at the commit (propagator/sdn-ap/dist/isomorphic/module.wasm), never from a working tree;
// so is the reference build. Without --scratch this repository's working tree (experiments/synthetic-orbits and
// experiments/headline-loop) must be clean, since the rows name its commit; with it a run goes ahead and its rows' harness ends in
// "+scratch". Free disk under 35 GiB stops the run.
//
// What a run needs:
// - SDN_MODULES_ROOT: a modules checkout with its packages installed (the SDS bindings, the module SDK's test harness, FFM 2.2.0 and
//   foundation/frames as headline-loop/lib/ffm.mjs and env.mjs require them); the module harness is loaded from it.
// - --modules-root: a modules clone that holds --modules-commit and the reference commit 7ed7cf88 (both read by git show).
// - The DE440s kernel and the Earth orientation file registered in headline-loop/lib/ffm.mjs, checked by hash.
// - The as-issued space weather for the cutoffs' span (2025-11-15 to 2026-09-25) in the archive headline-loop/lib/windows.mjs reads.
// - HEADLINE_LOOP_STORE (default /opt/data/sdn-archive/headline-loop): the rows, the truth cache and the reference build go under
//   <store>/synthetic/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fork, execFileSync } from 'node:child_process';
import { REPO, MODULES_ROOT, usePackages, envRecord } from '../headline-loop/lib/env.mjs';
import { cases as makeCases, termsOf, guardOf } from './cases.mjs';
import { seedRecord } from './seed.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const HOUR = 3600e3, DAY = 864e5, STEP = 300e3, ARC_H = 72, LEAD_DAYS = 7, COST_STATES = (7 * DAY) / STEP, MIN_FREE_GIB = 35;
const RE = 6378.137;
// the truth's settings (lib/settings.mjs): drag where the perigee is under 2,500 km
const DRAG_BELOW_KM = 2500;
// the truth's setting where it has drag (stack #520): the full drag setting at 1e-13 (lib/settings.mjs L70S13); at 1e-10 the integration
// after each change of the weather rows leaves the truth meters to hundreds of meters from the converged orbit (to 237 m over 0 to 120 h
// at perigee 200 km, e 0.9). At 1e-13 a tenfold tighter flight moves it under 4 m, except on the cases whose perigee falls under 150 km
// (15 to 34 m). Without drag the truth is the full setting at 1e-10, unchanged (exact there to the meter).
const DRAG_TRUTH = 'L70S13';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const caseHash = (c) => sha256(JSON.stringify(c)).slice(0, 16);
// the force mode, both sides: full, no-drag, no-drag-no-radiation
const MODE = args['no-radiation'] ? (args['no-drag'] ? 'no-drag-no-radiation' : null) : args['no-drag'] ? 'no-drag' : 'full';
if (!MODE) throw new Error('--no-radiation goes with --no-drag');
const PASS_M = 100, BAR_H = 120;
// --fit <name>: a way of making AP's record (fits.mjs FITS[name]: { truthStartH, after, text, fit(ctx) -> { ocm, note } }); arc72, the
// default, is AP's and SGP4-XP's 72 h fit before the cutoff. --truth-start-h <h>: the truth (and the reference-made state) begins h hours
// before the cutoff (default 72; at least the way's own truthStartH), so ways can be scored against one truth. A way other than arc72, or
// another start, has its own rows file.
// --fit <name>,<name>,...: several ways (not arc72; cutoff72 is its fit) on one truth per case, each row to its way's own file.
// --rung <name>: the slot flown at one of the rungs between SGP4-XP's record and AP's headline record (fits.mjs RUNGS): xp, SGP4-XP's
// own record with no space weather, or the settings at the rung's tesseral and zonal degrees; each rung's rows to their own file, so no
// rung is read back as another. Without it the slot is AP's headline settings (degrees 31 and 20), as before. Each theory's row records
// the THEORY field and the forces read from the $PCF actually sent (settings), and its label is built from them.
// --xp: on a way other than arc72, SGP4-XP is also fitted over the way's span (its own record, no space weather) and flown beside AP;
// those rows go to their own file. (arc72 flies SGP4-XP already.) A way that holds AP's terms at the truth's (held-terms) is refused
// with --xp and with --rung xp.
const FIT_LIST = String(args.fit ?? 'arc72').split(',');
const FIT = FIT_LIST[0];
if (FIT_LIST.length > 1 && FIT_LIST.includes('arc72')) throw new Error('--fit: arc72 flies alone (fits.mjs cutoff72 is the same fit, without SGP4-XP)');
const WAYS = await import('./fits.mjs');
const FITS = FIT === 'arc72' ? null : WAYS.FITS;
for (const f of FITS ? FIT_LIST : []) if (!FITS[f]) throw new Error(`--fit ${f}: not a way fits.mjs names (${Object.keys(FITS).join(', ')})`);
const RUNG = args.rung ?? null, WITH_XP = !!args.xp, PERIGEE_SCAN = !!args['perigee-scan'];
// the perigee scan's cases, spacing, window and curve (fits.mjs SCAN, scanned)
const { SCAN, scanned } = WAYS;
if (RUNG && !WAYS.RUNGS[RUNG]) throw new Error(`--rung ${RUNG}: not a rung fits.mjs names (${Object.keys(WAYS.RUNGS).join(', ')})`);
if (WITH_XP && FIT_LIST.includes('arc72')) throw new Error('--xp: arc72 flies SGP4-XP already');
for (const f of FITS ? FIT_LIST : []) if (FITS[f].apOnly && (WITH_XP || RUNG === 'xp')) throw new Error(`--fit ${f} holds AP's drag and radiation terms at the truth's values; it is not flown for SGP4-XP (${WITH_XP ? '--xp' : '--rung xp'})`);
// the scan's definition: its digest keys the -pscan rows (a row of another definition is neither read as done nor reported)
const SCAN_DIGEST = crypto.createHash('sha256').update(JSON.stringify({ ...SCAN, text: undefined })).digest('hex').slice(0, 12);
const TRUTH_START_H = Math.max(Number(args['truth-start-h'] ?? ARC_H), ...FIT_LIST.map((f) => FITS?.[f]?.truthStartH ?? ARC_H));
const suffixOf = (f) => `${MODE === 'full' ? '' : `-${MODE}`}${f === 'arc72' && TRUTH_START_H === ARC_H ? '' : `-fit-${f}-ts${TRUTH_START_H}`}${RUNG ? `-rung-${RUNG}` : ''}${WITH_XP ? '-xp' : ''}${PERIGEE_SCAN ? '-pscan' : ''}`;
// the reference build that makes every case's starting state; a row whose truth names a hash (truth.hash) was flown from that state,
// and the resume and the report read only such rows (and the rows of cases that failed before their truth existed)
const REFERENCE = { version: '0.6.26', modulesCommit: '7ed7cf887b37', wasmSha256: '9119284b8f972799' };
const TRUTH_CACHE_V = 1;
const ROWS_SUFFIX = suffixOf(FIT);

if (args.worker) await worker();
else if (args.report) await (await import('./report.mjs')).report(await setup(), args);
else await main();

function referenceWasmPath(A) { return path.join(A.STORE_ROOT, 'synthetic', 'reference', `${REFERENCE.wasmSha256}.wasm`); }

/** The build at the commit, its store folder and the cases. */
async function setup() {
  const root = args['modules-root'], want = args['modules-commit'];
  if (!root || !want) throw new Error('usage: run.mjs --modules-commit <sha> --modules-root <modules checkout> [...]');
  const commit = git(root, 'rev-parse', '--verify', `${want}^{commit}`).toString().trim();
  const wasm = git(root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`);
  const version = JSON.parse(git(root, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  usePackages();
  const A = await import(path.join(REPO, 'experiments/headline-loop/lib/arms.mjs'));
  const wasmSha = sha256(wasm), dir = path.join(A.STORE_ROOT, 'synthetic', wasmSha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
  // the reference build, placed once in the store for every worker (read by git show from the modules clone given)
  const refFile = referenceWasmPath(A);
  if (!fs.existsSync(refFile)) {
    let ref;
    try { ref = git(root, 'show', `${REFERENCE.modulesCommit}:propagator/sdn-ap/dist/isomorphic/module.wasm`); } catch { throw new Error(`the reference build (modules ${REFERENCE.modulesCommit}, sdn-ap ${REFERENCE.version}) is not in ${root}: fetch it, or run once from a clone that has it`); }
    if (!sha256(ref).startsWith(REFERENCE.wasmSha256)) throw new Error('the reference build\'s wasm is not the named one');
    fs.mkdirSync(path.dirname(refFile), { recursive: true });
    fs.writeFileSync(`${refFile}.${process.pid}`, ref); fs.renameSync(`${refFile}.${process.pid}`, refFile);
  }
  const seed = Number(args.seed ?? 498), gridStep = Number(args['grid-step'] ?? 1);
  const all = makeCases(seed, { gridStep });
  if (args.guard) all.cases = guardOf(all.cases);
  return { commit, version, wasmSha, dir, file, rowsFile: path.join(dir, `rows${ROWS_SUFFIX}.jsonl`), rowsFiles: Object.fromEntries(FIT_LIST.map((f) => [f, path.join(dir, `rows${suffixOf(f)}.jsonl`)])), seed, gridStep, all, A, mode: MODE, guard: !!args.guard, fit: FIT, truthStartH: TRUTH_START_H, rung: RUNG, withXp: WITH_XP, perigeeScan: PERIGEE_SCAN, scanDigest: PERIGEE_SCAN ? SCAN_DIGEST : null };
}

async function main() {
  const t0 = Date.now();
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments/synthetic-orbits', 'experiments/headline-loop').toString().trim();
  if (dirty && !args.scratch) throw new Error(`refused: this repository's working tree differs from its commit (the rows name the commit):\n${dirty}`);
  const harness = git(REPO, 'rev-parse', 'HEAD').toString().trim() + (dirty ? '+scratch' : '');
  const { commit, version, wasmSha, file, rowsFile, rowsFiles, all } = await setup();
  const only = args.only ? new Set(args.only.split(',')) : null;
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
  // per way, the cases its file holds; a case flies the ways that lack it
  // (a row counts only if it is of the shared truth, truth.hash; rows from before the reference state are flown again)
  // (with --perigee-scan, only rows of this scan definition, scanDigest)
  // (and, stack #520, a row whose truth has drag counts only on the drag truth at 1e-13, DRAG_TRUTH; rows on the 1e-10 drag truth are
  // flown again, the truth read from the cache once it is warm)
  const current = (r) => r.truth?.hash && (!r.truth.dragAreaOverMass || r.truth.setting === DRAG_TRUTH);
  const doneOf = Object.fromEntries(FIT_LIST.map((f) => [f, new Set(read(rowsFiles[f]).filter((r) => r.wasmSha256 === wasmSha && current(r) && (!PERIGEE_SCAN || r.scanDigest === SCAN_DIGEST)).map((r) => r.caseHash))]));
  const cache = { read: 0, flown: 0, waited: 0, none: 0 };
  // --truth-only: the truths of the cases with drag in this mode flown into the shared cache (or read from it), no fit, no row written
  const truthOnly = !!args['truth-only'];
  const fitsOf = (c) => (truthOnly ? (MODE === 'full' && c.hpKm < DRAG_BELOW_KM ? [FIT_LIST[0]] : []) : FIT_LIST.filter((f) => !doneOf[f].has(caseHash(c))));
  const todo = all.cases.filter((c) => (!only || only.has(c.id)) && fitsOf(c).length);
  const jobs = Math.min(Number(args.jobs ?? 8), todo.length);
  console.error(`synthetic: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${MODE}${args.guard ? ', guard set' : ''}; fit ${FIT_LIST.join(', ')}, truth from ${TRUTH_START_H} h before the cutoff${RUNG ? `, rung ${RUNG}` : ''}; SGP4-XP ${FIT === 'arc72' || WITH_XP ? 'flown' : 'not flown'}; perigee scan ${PERIGEE_SCAN ? `on (definition ${SCAN_DIGEST})` : 'off'}; ${all.cases.length} cases (seed ${all.seed}, grid step ${all.gridStep}), ${todo.length} to fly on ${jobs} jobs`);
  const freeGiB = () => { const s = fs.statfsSync(path.dirname(rowsFile)); return (s.bavail * s.bsize) / 2 ** 30; };
  let next = 0, flown = 0, stopped = null;
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, ...(MODE === 'full' ? [] : MODE === 'no-drag' ? ['--no-drag'] : ['--no-drag', '--no-radiation']), ...(args.cost ? ['--cost'] : []), ...(truthOnly ? ['--truth-only'] : []), '--fit', FIT_LIST.join(','), '--truth-start-h', String(TRUTH_START_H), ...(RUNG ? ['--rung', RUNG] : []), ...(WITH_XP ? ['--xp'] : []), ...(PERIGEE_SCAN ? ['--perigee-scan'] : [])], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => {
      if (!stopped && freeGiB() < MIN_FREE_GIB) stopped = `free disk under ${MIN_FREE_GIB} GiB`;
      if (!stopped && next < todo.length) { const c = todo[next++]; child.send({ c, fits: fitsOf(c) }); } else child.send({ stop: true });
    };
    child.on('message', (m) => {
      if (m.rows) {
        if (!truthOnly) for (const [f, row] of Object.entries(m.rows)) fs.appendFileSync(rowsFiles[f], `${JSON.stringify({ ...row, caseHash: caseHash(m.c), version, modulesCommit: commit, wasmSha256: wasmSha, harness, ...(PERIGEE_SCAN ? { scanDigest: SCAN_DIGEST } : {}) })}\n`);
        flown += 1;
        cache[Object.values(m.rows)[0]?.truth?.cache ?? 'none'] += 1;
        const D = (r) => r.ap?.maxDistance?.maxM ?? r.ap?.error ?? r.error;
        const rs = Object.entries(m.rows), one = rs.length === 1 ? rs[0][1] : null;
        if (truthOnly) { const t = rs[0]?.[1]?.truth; console.error(`  ${flown}/${todo.length} ${m.c.id}: truth ${t?.setting ?? '-'} ${t?.cache ?? 'none'}${t?.flightS != null ? ` in ${t.flightS} s` : ''}${t?.error ? ` (${t.error})` : ''}`); } else console.error(`  ${flown}/${todo.length} ${m.c.id}: ${one ? `D ${RUNG ? `slot (rung ${RUNG})` : 'AP'} ${D(one)} m, XP ${one.xp?.maxDistance?.maxM ?? one.xp?.error ?? '-'} m; ${one.wallS} s` : `D ${rs.map(([f, r]) => `${f} ${D(r)}`).join(', ')} m; ${rs[0][1].wallS} s`}`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));
  console.error(`synthetic: ${flown} flown in ${((Date.now() - t0) / 1000).toFixed(0)} s${stopped ? `; stopped: ${stopped}` : ''}; truths read from the cache ${cache.read}, flown ${cache.flown}, waited for another process ${cache.waited}${cache.none ? `, none (the case ended before its truth) ${cache.none}` : ''}; hit rate ${flown ? Math.round(((cache.read + cache.waited) / flown) * 1000) / 10 : 0} %`);
  process.exit(stopped ? 2 : 0);
}

/** A forked worker: opens the module, FFM and the frames once, then flies each case it is sent. */
async function worker() {
  usePackages();
  const W = await import(path.join(REPO, 'experiments/headline-loop/lib/windows.mjs'));
  const A = await import(path.join(REPO, 'experiments/headline-loop/lib/arms.mjs'));
  const APL = await import(path.join(REPO, 'experiments/operator-theory/lib/ap.mjs'));
  const { openFfm } = await import(path.join(REPO, 'experiments/headline-loop/lib/ffm.mjs'));
  const { SETTINGS } = await import(path.join(REPO, 'experiments/headline-loop/lib/settings.mjs'));
  const { openModules } = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/modules.mjs'));
  const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const S = A.S, F = await openFfm(), m = await openModules(), env = envRecord();
  const h = await createStandaloneHarness('browser', args.wasm, { surface: 'direct' });
  const invoke = async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r; };
  const iso = (t) => new Date(t).toISOString();
  const flightPcf = (epochs, frame = 'GCRF') => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame[frame], EPOCHS: epochs }); const b = new S.flatbuffers.Builder(1 << 14); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
  const fly = async (ocm, epochs, frame = 'GCRF') => S.oemLines(new Uint8Array((await invoke('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(epochs, frame) }])).outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v }));
  const fit = async (oem, pcf, spw) => new Uint8Array((await invoke('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])])).outputs.find((o) => o.portId === 'elements').payload);
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  const median = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
  // the reference build, which makes every case's starting state (never the build under test)
  const refFile = args['ref-wasm'] ?? referenceWasmPath(A);
  if (!fs.existsSync(refFile)) throw new Error(`the reference build ${refFile} is missing: run run.mjs once (it places it from a modules clone that has ${REFERENCE.modulesCommit})`);
  const refH = await createStandaloneHarness('browser', refFile, { surface: 'direct' });
  const refFly = async (ocm, epochs) => { const r = await refH.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(epochs) }] }); if (r.statusCode !== 0) throw new Error(`reference propagate: ${String(r.errorMessage).slice(0, 200)}`); return S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v })); };
  // the truth cache: <store>/synthetic/truth/<hash>.json (what it holds) and .bin (Float64 x, y, z km, vx, vy, vz km/s per state)
  const TRUTH_DIR = path.join(A.STORE_ROOT, 'synthetic', 'truth');
  fs.mkdirSync(TRUTH_DIR, { recursive: true });
  const ffmBuild = { ffm: F.provenance.ffm.sha256, kernel: F.provenance.kernelSha256, eop: F.provenance.eopSha256 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** The truth of a key: read when cached, else flown by `flyIt` (once across processes: a lock, the others wait). */
  const truthOf = async (hash, flyIt) => {
    const meta = path.join(TRUTH_DIR, `${hash}.json`), bin = path.join(TRUTH_DIR, `${hash}.bin`), lock = path.join(TRUTH_DIR, `${hash}.lock`);
    const load = () => { const j = JSON.parse(fs.readFileSync(meta, 'utf8')); if (!j.count) return { ...j, states: null }; const b = fs.readFileSync(bin), f = new Float64Array(b.buffer, b.byteOffset, b.length / 8); return { ...j, states: Array.from({ length: j.count }, (_, k) => ({ r: [f[6 * k], f[6 * k + 1], f[6 * k + 2]], v: [f[6 * k + 3], f[6 * k + 4], f[6 * k + 5]] })) }; };
    if (fs.existsSync(meta)) return { ...load(), cache: 'read' };
    let waited = false;
    for (;;) {
      let fd = null;
      try { fd = fs.openSync(lock, 'wx'); fs.writeSync(fd, String(process.pid)); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      if (fd != null) {
        try {
          if (fs.existsSync(meta)) return { ...load(), cache: 'read' };
          const t = await flyIt();
          if (t.states) { const tmp = `${bin}.${process.pid}`; fs.writeFileSync(tmp, Buffer.from(new Float64Array(t.states.flatMap((s) => [...s.r, ...s.v])).buffer)); fs.renameSync(tmp, bin); }
          const tmp = `${meta}.${process.pid}`; fs.writeFileSync(tmp, JSON.stringify({ v: TRUTH_CACHE_V, count: t.states?.length ?? 0, flownToDay: t.flownToDay ?? null, error: t.error ?? null, flightS: t.flightS })); fs.renameSync(tmp, meta);
          return { ...t, cache: 'flown' };
        } finally { fs.closeSync(fd); fs.rmSync(lock, { force: true }); }
      }
      // another process flies it: wait for its file. The lock holds the holder's process id: a lock whose holder is gone (stopped or
      // killed), or older than an hour, is taken over.
      waited = true;
      const holderGone = () => { try { const pid = Number(fs.readFileSync(lock, 'utf8')); if (!pid) return Date.now() - fs.statSync(lock).mtimeMs > 60e3; process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH' || e.code === 'ENOENT'; } };
      for (let k = 0; k < 1800 && !fs.existsSync(meta); k += 1) { await sleep(2000); try { if (holderGone() || Date.now() - fs.statSync(lock).mtimeMs > 3600e3) { fs.rmSync(lock, { force: true }); break; } } catch { break; } }
      if (fs.existsSync(meta)) return { ...load(), cache: waited ? 'waited' : 'read' };
    }
  };
  /**
   * The perigee scan of one record (fits.mjs SCAN): its perigee passages from D0 to D0 + spanH, each flown at 1 s for 120 s either
   * side, and two distances off the record's own curve: each state within 80 s of the passage from the curve through the states 90 to
   * 120 s from the passage, and each state from the curve through its own neighbors 1 to 4 s either side. Returns the passages with
   * each measure's largest value and its offset from the passage, and the largest over all; `states` keeps the 1 s states. A flight
   * that fails or comes back short throws (the caller records a failed scan).
   */
  const scanOf = async (ocm, D0, spanH, { flyWith = fly, states: keepStates = false } = {}) => {
    const n = APL.readOcm(ocm).o.MEAN_ELEMENTS.MEAN_MOTION, periodS = 86400 / n, endMs = D0 + spanH * HOUR;
    const coarse = Array.from({ length: Math.floor((spanH * 3600) / SCAN.coarseS) + 1 }, (_, k) => iso(D0 + k * SCAN.coarseS * 1000));
    const cs = await flyWith(ocm, coarse);
    if (cs.length !== coarse.length) throw new Error(`the ${SCAN.coarseS} s flight returned ${cs.length} of ${coarse.length} states`);
    const r = cs.map((s) => Math.hypot(...s.r)), w = Math.max(1, Math.floor(periodS / 4 / SCAN.coarseS));
    const passages = [];
    for (let k = 1; k + 1 < r.length; k += 1) {
      if (!(r[k] < r[k - 1] && r[k] <= r[k + 1])) continue;
      let least = true; for (let q = Math.max(0, k - w); q <= Math.min(r.length - 1, k + w); q += 1) if (r[q] < r[k]) { least = false; break; }
      if (!least) continue;
      const den = r[k - 1] - 2 * r[k] + r[k + 1], tp = Date.parse(coarse[k]) + (den > 0 ? (SCAN.coarseS * 1000 * (r[k - 1] - r[k + 1])) / (2 * den) : 0);
      if (tp >= D0 && tp <= endMs) passages.push(Math.round(tp / 1000) * 1000);
    }
    const per = 2 * SCAN.halfS / SCAN.stepS + 1, epochs = passages.flatMap((tp) => Array.from({ length: per }, (_, j) => iso(tp + (j * SCAN.stepS - SCAN.halfS) * 1000)));
    const fine = epochs.length ? await flyWith(ocm, epochs) : [];
    if (fine.length !== epochs.length) throw new Error(`the 1 s flight returned ${fine.length} of ${epochs.length} states`);
    const out = [];
    for (const [p, tp] of passages.entries()) {
      // both measures (fits.mjs measurePassage): the passage curve, and each state's own neighbors' curve over the whole window
      const st = fine.slice(p * per, (p + 1) * per), m = WAYS.measurePassage(st.map((s) => s.r));
      out.push({ atH: +((tp - D0) / HOUR).toFixed(4), ...m, largestM: Math.max(m.curveM, m.neighborsM), ...(keepStates ? { states: st.map((s, j) => ({ epoch: epochs[p * per + j], r: s.r })) } : {}) });
    }
    const worstBy = (k) => out.reduce((a, b) => (b[k] > a[k] ? b : a), { [k]: -1 });
    const wc = worstBy('curveM'), wn = worstBy('neighborsM');
    return { definition: SCAN_DIGEST, passages: out.length, noPassage: out.length === 0,
      curve: out.length ? { largestM: wc.curveM, atH: wc.atH, offsetS: wc.curveOffsetS, reliable: out.every((x) => x.curveReliable) } : null, neighbors: out.length ? { largestM: wn.neighborsM, atH: wn.atH, offsetS: wn.neighborsOffsetS } : null,
      largestM: out.length ? Math.max(wc.curveM, wn.neighborsM) : null, atH: out.length ? (wc.curveM >= wn.neighborsM ? wc.atH : wn.atH) : null, offsetS: out.length ? (wc.curveM >= wn.neighborsM ? wc.curveOffsetS : wn.neighborsOffsetS) : null,
      over: out.filter((x) => x.largestM > SCAN.failM).length, fails: out.length ? Math.max(wc.curveM, wn.neighborsM) > SCAN.failM : false, spanH, perPassage: out };
  };
  /** What a $PCF sent to the fit says: the THEORY field and the forces and priors it was written with, and whether weather went with it. */
  const settingsOf = (pcf, spw) => {
    const P = S.PCF, x = P.PCF.getRootAsPCF(new S.flatbuffers.ByteBuffer(pcf)).unpack(), f = x.FORCES ?? {}, fp = x.FIT ?? null;
    const name = (en, v) => (v == null ? null : en?.[v] ?? v);
    const prior = (p, form) => (p ? { mean: p.MEAN, sigma: p.SIGMA, form: name(P.pcfPriorForm, form) } : 'default');
    return { theory: name(P.pcfTheory, x.THEORY), tesseral: f.HAS_MAXIMUM_TESSERAL_DEGREE ? f.MAXIMUM_TESSERAL_DEGREE : null, zonal: f.HAS_MAXIMUM_DEGREE ? f.MAXIMUM_DEGREE : null,
      solidTides: !!f.SOLID_TIDES, atmosphere: name(P.pcfAtmosphereFamily, f.ATMOSPHERE_MODEL), weatherSource: name(P.pcfWeatherSource, f.WEATHER_SOURCE),
      dragPrior: prior(fp?.DRAG_PRIOR, fp?.DRAG_PRIOR_FORM), srpPrior: prior(fp?.SRP_PRIOR, fp?.SRP_PRIOR_FORM), spaceWeather: !!spw };
  };
  /** A row's label, from those settings. */
  const labelOf = (s) => [`THEORY ${s.theory}`, `tesseral ${s.tesseral ?? 'not stated'}`, `zonal ${s.zonal ?? 'not stated'}`, s.solidTides ? 'solid tide' : 'no solid tide',
    `${s.atmosphere ?? 'no atmosphere named'}${s.spaceWeather ? ' on the issued weather' : ''}`, s.dragPrior === 'default' ? 'drag term under the default prior' : `drag prior ${s.dragPrior.mean} (sigma ${s.dragPrior.sigma})`,
    s.srpPrior === 'default' ? 'radiation term under the default prior' : `radiation prior ${s.srpPrior.mean} (sigma ${s.srpPrior.sigma})`].join(', ');
  // one case on one truth: { [way]: row } for each way of `fits` (each row as a single --fit's)
  const flyCase = async (c, fits, keep = null) => {
    const t1 = performance.now(), D0 = Date.parse(`${c.cutoff}T00:00:00Z`), tStart = D0 - TRUTH_START_H * HOUR, epoch = iso(tStart);
    const terms = termsOf(c.am), row = { id: c.id, kind: c.kind, name: c.name ?? null, am: c.am, elements: { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, hpKm: c.hpKm, haKm: c.haKm, cutoff: c.cutoff }, env };
    const out = {};
    try {
      // the state at the truth's start (D0 - 72 h, or --truth-start-h), made from the case's mean elements (seed.mjs's record) by the
      // reference build
      const seed = seedRecord(S, { epoch: epoch.replace('Z', ''), n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma });
      const [s0] = await refFly(seed, [epoch]);
      // the truth: FFM from that state, drag (NRLMSISE-00 on the weather known at the cutoff) where the perigee is under 2,500 km
      // (--no-drag: the full setting without drag on every orbit; --no-radiation as well: without radiation pressure either)
      const drag = MODE === 'full' && c.hpKm < DRAG_BELOW_KM, radiation = MODE !== 'no-drag-no-radiation', wx = drag ? W.weatherAt(D0, Math.max(ARC_H, TRUTH_START_H)) : null;
      const setting = drag ? DRAG_TRUTH : radiation ? 'Ffull' : 'Ffull without radiation pressure';
      const settings = radiation ? SETTINGS[setting] : { ...SETTINGS.Ffull, forces: { ...SETTINGS.Ffull.forces, srp: false }, parameters: [], apriori: [] };
      const epochs = Array.from({ length: ((TRUTH_START_H + LEAD_DAYS * 24) * HOUR) / STEP + 1 }, (_, k) => iso(tStart + k * STEP));
      const parameters = [...(drag ? [{ kind: 'DRAG_AREA_OVER_MASS', value: terms.dragAreaOverMass }] : []), ...(radiation ? [{ kind: 'SRP_AREA_OVER_MASS', value: terms.srpAreaOverMass }] : [])];
      row.mode = MODE;
      row.truth = { setting, tolerance: settings.integrator.tolerance, dragAreaOverMass: drag ? terms.dragAreaOverMass : 0, srpAreaOverMass: radiation ? terms.srpAreaOverMass : 0 };
      // the truth's key: everything the flight depends on
      const start = { epoch, r: s0.r, v: s0.v };
      row.truth.stateFrom = `sdn-ap ${REFERENCE.version} (modules ${REFERENCE.modulesCommit}, wasm ${REFERENCE.wasmSha256})`;
      row.truth.stateHash = sha256(JSON.stringify(start)).slice(0, 16);
      row.truth.hash = sha256(JSON.stringify({ v: TRUTH_CACHE_V, start, ffmBuild, setting, forces: settings.forces, integrator: settings.integrator, fixed: settings.fixed ?? {}, parameters, weather: wx?.ffm ?? null, span: { from: epochs[0], stepS: STEP / 1000, count: epochs.length } })).slice(0, 32);
      // a truth that cannot be flown to day 7 (a decay) is flown to the last whole day it reaches, and scored to there
      const got = await truthOf(row.truth.hash, async () => {
        const tt = performance.now(), t = {};
        for (const days of [LEAD_DAYS, 5, 3, 2, 1, 0]) {
          const upTo = epochs.slice(0, epochs.length - ((LEAD_DAYS - days) * DAY) / STEP);
          try { t.states = await F.forecast({ epoch, state: [...s0.r, ...s0.v].map((x) => x * 1000), parameters }, upTo, settings, wx?.ffm ?? null); if (days < LEAD_DAYS) t.flownToDay = days; delete t.error; break; } catch (e) { t.error = String(e?.message ?? e).slice(0, 200); }
        }
        t.flightS = r1((performance.now() - tt) / 1000);
        return t;
      });
      row.truth.cache = got.cache;
      if (got.flownToDay != null) row.truth.flownToDay = got.flownToDay;
      if (got.cache === 'flown') row.truth.flightS = got.flightS;
      if (!got.states || got.flownToDay === 0) { row.truth.error = got.error ?? 'no state'; throw new Error('truth'); }
      // --truth-only: the truth is in the cache; no fit
      if (args['truth-only']) throw new Error('truth');
      const states = got.states;
      epochs.length = states.length;
      const lines = epochs.map((t, k) => ({ epoch: t, r: states[k].r, v: states[k].v }));
      const alt = lines.map((l) => Math.hypot(...l.r) - RE), low = alt.findIndex((x) => x < 100);
      row.truth.minAltitudeKm = r1(Math.min(...alt));
      if (low >= 0) { row.truth.decayedAtH = r1((Date.parse(lines[low].epoch) - D0) / HOUR); if (Date.parse(lines[low].epoch) <= D0) throw new Error('truth'); }
      if (Date.parse(lines.at(-1).epoch) <= D0 + DAY) throw new Error('truth');
      const fitLines = lines.filter((l) => { const t = Date.parse(l.epoch); return t >= D0 - ARC_H * HOUR && t <= D0; }), after = lines.filter((l) => Date.parse(l.epoch) > D0 && (low < 0 || Date.parse(l.epoch) < Date.parse(lines[low].epoch)));
      const sc = W.scoredOf(after, D0);
      const oem = S.oemBytes({ frame: 'GCRF', object: { name: 'SYNTHETIC', id: '', norad: 99498 }, lines: fitLines, useableStart: fitLines[0].epoch, useableStop: iso(D0) });
      const costEpochs = Array.from({ length: COST_STATES }, (_, k) => iso(D0 + (k + 1) * STEP));
      // the bar's span: the cutoff and every truth state to 120 h after it (as far as the truth reaches)
      const span = lines.filter((l) => { const t = Date.parse(l.epoch); return t >= D0 && t <= D0 + BAR_H * HOUR && (low < 0 || t < Date.parse(lines[low].epoch)); });
      // past the bar: the same distance over 120 h to 7 days (a record used past its 5 days; reported, not a criterion)
      const late = lines.filter((l) => { const t = Date.parse(l.epoch); return t > D0 + BAR_H * HOUR && t <= D0 + LEAD_DAYS * DAY && (low < 0 || t < Date.parse(lines[low].epoch)); });
      // AP (drag on NRLMSISE-00 and the weather where the truth has them; where it has no drag, AP_VACUUM_TIDES: its own Jacchia 1970
      // atmosphere named and a drag term solved under the default prior; the solid tide; radiation held at 0 where the truth has none)
      // and our SGP4-XP, fitted the same way
      const apPcf = radiation ? A.PCF[drag ? 'AP_TIDES' : 'AP_VACUUM_TIDES'] : APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }), SOLID_TIDES: 1 }, fit: { srpPrior: { mean: 0, sigma: 1e-12, form: 'GAUSSIAN_SIGNED' } } });
      // the slot: AP's headline settings, or one rung (--rung): SGP4-XP's own record, or the settings at the rung's degrees. Each row's
      // label is built from the $PCF actually sent (settingsOf), never from these names.
      const slotOf = () => {
        if (!RUNG) return { pcf: apPcf, spw: wx?.spw };
        if (RUNG === 'xp') return { pcf: A.PCF.XP, spw: undefined, noWeather: true };
        const [d, z] = WAYS.RUNGS[RUNG].degrees;
        // the module flies AP's solid tide only with its gravity terms (a degree above 0), and refuses it at degrees 0 and 0
        const forces = { ...APL.apForces({ tesseral: d, zonal: z, atmosphere: drag }), ...(d > 0 || z > 0 ? { SOLID_TIDES: 1 } : {}) };
        return { spw: wx?.spw, pcf: radiation ? APL.fitPcf({ forces, fit: null }) : APL.fitPcf({ forces, fit: { srpPrior: { mean: 0, sigma: 1e-12, form: 'GAUSSIAN_SIGNED' } } }) };
      };
      const slot = slotOf();
      // another way of making AP's record (--fit, fits.mjs): its record is scored as AP's; SGP4-XP beside it with --xp (its own record
      // fitted the same way, no space weather); the cost flights only where both are flown
      const oemOf = (fromMs, toMs) => { const ls = lines.filter((l) => { const t = Date.parse(l.epoch); return t >= fromMs && t <= toMs && (low < 0 || t < Date.parse(lines[low].epoch)); }); return S.oemBytes({ frame: 'GCRF', object: { name: 'SYNTHETIC', id: '', norad: 99498 }, lines: ls, useableStart: ls[0].epoch, useableStop: ls.at(-1).epoch }); };
      const base = JSON.stringify(row);
      for (const FIT of fits) {
        const theories = FIT === 'arc72' ? { ap: { ...slot }, xp: { pcf: A.PCF.XP, spw: undefined } }
          : { ap: { ...slot, way: FITS[FIT] }, ...(WITH_XP ? { xp: { pcf: A.PCF.XP, spw: undefined, noWeather: true, way: FITS[FIT] } } : {}) };
        const row = out[FIT] = JSON.parse(base);
        row.fit = FIT; row.truthStartH = TRUTH_START_H;
        for (const [t, x] of Object.entries(theories)) {
          // the $PCF and weather of the fit that made the record (a way may change the $PCF, held-terms, or try several spans)
          let sent = { pcf: x.pcf, spw: x.way ? (x.noWeather ? undefined : wx?.spw) : x.spw };
          const fitSent = async (o, p, s) => { const r = await fit(o, p, s); sent = { pcf: p, spw: s }; return r; };
          try {
            const tf = performance.now();
            const made = x.way ? await x.way.fit({ lines, D0, drag, radiation, wx: x.noWeather ? null : wx, terms, fitPcf: x.pcf, oemOf, fitOf: fitSent, S, A, APL }) : null;
            const ocm = made ? made.ocm : await fitSent(oem, x.pcf, x.spw), info = APL.readOcm(ocm), fitS = r1((performance.now() - tf) / 1000);
            const d = W.byDay(await m.rtn(await fly(ocm, sc.epochs), sc.truth), sc.entered, sc.sizes);
            // D: the largest 3D distance to the truth over the span, its hour, and the first hour above 100 m
            const flown = await fly(ocm, span.map((l) => l.epoch));
            const dist = flown.map((s, k) => Math.hypot(s.r[0] - span[k].r[0], s.r[1] - span[k].r[1], s.r[2] - span[k].r[2]) * 1000);
            const at = dist.indexOf(Math.max(...dist)), over = dist.findIndex((x) => x > PASS_M), hourOf = (k) => r1((Date.parse(span[k].epoch) - D0) / HOUR);
            x.ocm = ocm;
            if (keep) (keep[FIT] ??= {})[t] = ocm;
            const settings = settingsOf(sent.pcf, sent.spw);
            row[t] = { pcf: labelOf(settings), settings, ...(made?.note ? { fitNote: made.note } : {}), fitRmsM: r1(info.fitRmsKm * 1000), bterm: info.bterm ?? null, agom: info.agom ?? null, fitS, epoch: info.epoch ?? null, days: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, r1(v.e * 1000)])),
              maxDistance: { maxM: r1(dist[at]), atH: hourOf(at), firstOver100mH: over < 0 ? null : hourOf(over), spanH: hourOf(dist.length - 1), pass: dist[at] <= PASS_M },
              // the record itself (base64), so a later pass can fly it again without fitting
              record: Buffer.from(ocm).toString('base64') };
            if (late.length) {
              const dl = (await fly(ocm, late.map((l) => l.epoch))).map((s, k) => Math.hypot(s.r[0] - late[k].r[0], s.r[1] - late[k].r[1], s.r[2] - late[k].r[2]) * 1000);
              const k = dl.indexOf(Math.max(...dl));
              row[t].pastBar = { maxM: r1(dl[k]), atH: r1((Date.parse(late[k].epoch) - D0) / HOUR), spanH: r1((Date.parse(late.at(-1).epoch) - D0) / HOUR) };
            }
            // the perigee scan (--perigee-scan) over the scored span
            if (PERIGEE_SCAN && scanned(c)) {
              // a scan whose flight fails or comes back short is a failed scan (report.mjs: in n and not within)
              try { row[t].perigeeScan = await scanOf(ocm, D0, row[t].maxDistance.spanH); } catch (e) { row[t].perigeeScan = { definition: SCAN_DIGEST, error: String(e?.message ?? e).slice(0, 200) }; }
            }
          } catch (e) { const settings = settingsOf(sent.pcf, sent.spw); row[t] = { pcf: labelOf(settings), settings, error: String(e?.message ?? e).slice(0, 200) }; }
        }
        // cost per state (--cost only): each set warm (flown once), then three timed 7-day flights at 300 s, interleaved; the median
        if (args.cost && theories.ap?.ocm && theories.xp?.ocm) {
          const times = { ap: [], xp: [] };
          for (const t of ['ap', 'xp']) await fly(theories[t].ocm, costEpochs);
          for (let k = 0; k < 3; k += 1) for (const t of ['ap', 'xp']) { const a = performance.now(); await fly(theories[t].ocm, costEpochs); times[t].push(performance.now() - a); }
          row.costUsPerState = { ap: r1((median(times.ap) * 1000) / COST_STATES), xp: r1((median(times.xp) * 1000) / COST_STATES), states: COST_STATES };
        }
      }
    } catch (e) { if (String(e?.message) !== 'truth') row.error = String(e?.message ?? e).slice(0, 200); }
    // a case that ends before its ways (no truth, or an error) gives every way the case's row
    const wallS = r1((performance.now() - t1) / 1000);
    for (const f of fits) { out[f] ??= { ...JSON.parse(JSON.stringify(row)), fit: f, truthStartH: TRUTH_START_H }; if (row.error) out[f].error = row.error; out[f].wallS = wallS; }
    return out;
  };
  /**
   * The dense re-fly (dense.mjs): the case's record made as flyCase makes it (fit way FIT, the rung if any), then flown at stepS spacing
   * for halfMin minutes either side of the hour asked (default the hour of its D) on this worker's module instance, the one every case
   * of the run has gone through (pooled), twice, and twice more, each on a new instance of the same build. For each run: the largest
   * step between neighboring states, the largest second difference, and the largest distance of a state from the 8-point (degree-7) curve
   * through its four neighbors on each side (a state off its neighbors' curve); and whether the four runs agree bit for bit. No truth
   * is compared; the truth is read only to make the record.
   */
  const denseOf = async ({ c, hourH = null, halfMin = 30, stepS = 10, runs = 2, theory = 'ap', keepStates = false, perigees = false }) => {
    const keep = {};
    const row = (await flyCase(c, [FIT], keep))[FIT], ocm = keep[FIT]?.[theory] ?? null;
    const summary = { id: c.id, fit: FIT, rung: RUNG, theory, D: row[theory]?.maxDistance?.maxM ?? null, atH: row[theory]?.maxDistance?.atH ?? null, spanH: row[theory]?.maxDistance?.spanH ?? null };
    if (!ocm) return { ...summary, error: row[theory]?.error ?? row.error ?? row.truth?.error ?? 'no record' };
    // the record's own mean elements and epoch (the theory's clock starts there)
    const me = APL.readOcm(ocm).o.MEAN_ELEMENTS;
    summary.record = { epoch: me.EPOCH, n: me.MEAN_MOTION, e: me.ECCENTRICITY, i: me.INCLINATION, raan: me.RA_OF_ASC_NODE, argp: me.ARG_OF_PERICENTER, ma: me.MEAN_ANOMALY, bterm: me.BTERM, agom: me.AGOM };
    const D0 = Date.parse(`${c.cutoff}T00:00:00Z`), hour = Number.isFinite(hourH) ? hourH : summary.atH;
    // --perigees: the perigee scan over the scored span (fits.mjs SCAN), on this worker's instance and on a fresh one, compared bit for bit
    if (perigees) {
      const flyOn = (harness) => async (o, eps) => { const r = await harness.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: o }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(eps) }] }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return S.oemLines(new Uint8Array(r.outputs.find((x) => x.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v })); };
      const spanH = summary.spanH ?? BAR_H;
      try {
        const pooled = await scanOf(ocm, D0, spanH, { flyWith: flyOn(h), states: true });
        const hf = await createStandaloneHarness('browser', args.wasm, { surface: 'direct' });
        const fresh = await scanOf(ocm, D0, spanH, { flyWith: flyOn(hf), states: true });
        await hf.close?.();
        const bitForBit = pooled.perPassage.length === fresh.perPassage.length && pooled.perPassage.every((p, i) => p.states.length === fresh.perPassage[i].states.length && p.states.every((s, j) => [0, 1, 2].every((q) => Object.is(s.r[q], fresh.perPassage[i].states[j].r[q]))));
        if (!keepStates) for (const p of pooled.perPassage) delete p.states;
        return { ...summary, scan: { ...pooled, text: SCAN.text, freshLargestM: fresh.largestM, bitForBit } };
      } catch (e) { return { ...summary, scan: { error: String(e?.message ?? e).slice(0, 200) } }; }
    }
    const t0 = D0 + hour * HOUR - halfMin * 60e3, count = Math.round((2 * halfMin * 60) / stepS) + 1;
    const epochs = Array.from({ length: count }, (_, k) => iso(t0 + k * stepS * 1000));
    const on = async (harness) => {
      try {
        const r = await harness.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(epochs) }] });
        if (r.statusCode !== 0) return { error: `propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
        const states = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v }));
        return states.length === count ? { states } : { states, error: `propagate returned ${states.length} of ${count} states` };
      } catch (e) { return { error: String(e?.message ?? e).slice(0, 200) }; }
    };
    const flights = [];
    for (let k = 0; k < runs; k += 1) flights.push({ instance: 'pooled', run: k + 1, ...(await on(h)) });
    for (let k = 0; k < runs; k += 1) { const hf = await createStandaloneHarness('browser', args.wasm, { surface: 'direct' }); flights.push({ instance: 'fresh', run: k + 1, ...(await on(hf)) }); await hf.close?.(); }
    const lag = (ix, ps, at) => { const out = [0, 0, 0]; for (let i = 0; i < ix.length; i += 1) { let w = 1; for (let j = 0; j < ix.length; j += 1) if (j !== i) w *= (at - ix[j]) / (ix[i] - ix[j]); for (let q = 0; q < 3; q += 1) out[q] += w * ps[i][q]; } return out; };
    const hourAt = (k) => +((Date.parse(epochs[k]) - D0) / HOUR).toFixed(4);
    const measure = (st) => {
      let step = { m: -1, k: null }, second = { m: -1, k: null }, offCurve = { m: -1, k: null };
      for (let k = 1; k < st.length; k += 1) { const d = 1000 * Math.hypot(...[0, 1, 2].map((q) => st[k].r[q] - st[k - 1].r[q])); if (d > step.m) step = { m: d, k }; }
      for (let k = 1; k + 1 < st.length; k += 1) { const d = 1000 * Math.hypot(...[0, 1, 2].map((q) => st[k + 1].r[q] - 2 * st[k].r[q] + st[k - 1].r[q])); if (d > second.m) second = { m: d, k }; }
      for (let k = 4; k + 4 < st.length; k += 1) { const ix = [-4, -3, -2, -1, 1, 2, 3, 4].map((x) => k + x), p = lag(ix, ix.map((x) => st[x].r), k), d = 1000 * Math.hypot(...[0, 1, 2].map((q) => st[k].r[q] - p[q])); if (d > offCurve.m) offCurve = { m: d, k }; }
      const out = (x) => ({ meters: x.k == null ? null : +x.m.toPrecision(6), atH: x.k == null ? null : hourAt(x.k), epoch: x.k == null ? null : epochs[x.k] });
      return { largestStep: out(step), largestSecondDifference: out(second), largestOffNeighbors: out(offCurve) };
    };
    const ref = flights.find((x) => x.states && !x.error)?.states;
    const same = (st) => !!ref && !!st && st.length === ref.length && st.every((s, k) => [0, 1, 2].every((q) => Object.is(s.r[q], ref[k].r[q]) && Object.is(s.v[q], ref[k].v[q])));
    // with keepStates, the first run's states (GCRF km) and each state's distance off the 8-point curve through its neighbors (m)
    const kept = keepStates && ref ? ref.map((s, k) => {
      if (k < 4 || k + 4 >= ref.length) return { epoch: epochs[k], r: s.r, offM: null };
      const ix = [-4, -3, -2, -1, 1, 2, 3, 4].map((x) => k + x), p = lag(ix, ix.map((x) => ref[x].r), k);
      return { epoch: epochs[k], r: s.r, offM: 1000 * Math.hypot(...[0, 1, 2].map((q) => s.r[q] - p[q])) };
    }) : undefined;
    return { ...summary, hourH: hour, from: epochs[0], to: epochs.at(-1), stepS, count, ...(kept ? { states: kept } : {}),
      runs: flights.map((x) => ({ instance: x.instance, run: x.run, error: x.error ?? null, ...(x.states?.length ? measure(x.states) : {}) })),
      // a run that failed is 'failed', not a difference; failedAlike: every run failed with the same error
      bitForBit: flights.every((x) => !x.error && same(x.states)), agreeing: flights.map((x) => (x.error ? 'failed' : same(x.states))),
      failedAlike: flights.every((x) => x.error && x.error === flights[0].error) ? flights[0].error : null };
  };
  process.on('message', async (msg) => {
    if (msg.stop) { await F.close(); process.exit(0); }
    if (msg.dense) { process.send({ dense: await denseOf(msg.dense) }); return; }
    process.send({ c: msg.c, rows: await flyCase(msg.c, msg.fits) });
  });
  process.send({ ready: true });
}
