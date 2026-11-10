// The runner of experiments/ap-catalog-construction (PLAN.md, config.json), loaded by run.mjs after its file-registration hook. Modules
// compute: public sets fly on sdn-ap 0.6.5's own SGP4, AP records are fitted and flown by the same module, operator files are read and
// carried to GCRF by the reader modules, the provider's XP sets fly on propagator/sgp4-xp 0.2.1. This file moves records and counts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { CONFIG, HERE, REPO, MODULES, DAY, sha256, wasmSha, tleMs, grid, classifyOrbitRegime, fitAp, flyAp, flySgp4, score, spwFor, freshHost, setArchiveCheck, archiveRead } from './engine.mjs';
import { makeWindow, loadPublicSets, truthIndex, truthFor, truthCounts } from './sets.mjs';
import { armStates, afterLastJump } from './arms.mjs';
import { INPUTS, inputFiles, configureInputs, preloadReaders } from './inputs.mjs';
import { claimStart, verifyFiles, verifyLedger, manifestGuard, verifyRunDay, verifyClean } from './guards.mjs';
import '../table.mjs'; // loaded, not called: so the registration hook checks the table builder's bytes (and the statistic's) in every run

const HOOK = globalThis.__apcc;
const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
if (!CONFIG.frozen) throw new Error('config.json is not frozen: the plan is registered first (README rule 2)');
const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const isPublicArm = (n) => !CONFIG.arms[n].input;

/** One arm's AP record for one set, flown to `at`: { name, p, d, rms, states? } or { name, e } or null when the arm does not exist. */
async function armRecord(name, { norad, tle, prior, inputT0, at, truth, fromMs, perDay, guard, days }) {
  const a = CONFIG.arms[name];
  const states = a.input ? await INPUTS[name](norad, inputT0, guard) : armStates(name, tle, prior);
  if (!states) return null;
  const f = await fitAp({ norad, states, eccentricity: tle.e, spwBytes: spwFor(a.input ? inputT0 : tleMs(tle)), placement: a.recordEpoch === 'last' ? 2 : 0, sourceId: a.input ?? 'gp-own-epoch' });
  if (!f.ok) return { name, e: f.error };
  const ap = await flyAp(f.ocmBytes, at);
  if (ap.error) return { name, e: ap.error };
  const s = score(ap.r, truth, fromMs, perDay, days);
  return { name, p: s.primary, d: s.days, rms: Math.round(f.rmsM * 10) / 10, states: a.input ? states : undefined, lastH: Math.round((states.at(-1).ms - fromMs) / 36e5 * 10) / 10 };
}

/** Every record a row reports, sharing fits: the served record (the class's chain), the public-set record (the chain without operator
 *  inputs), the earlier construction's guarded record (amendment A3: D5 when its fit residual is at most 3 times B3's, else B3) and its
 *  unguarded record (D5, else B3). An arm that does not exist, or whose fit is refused, passes to the next. */
async function recordsFor(cls, ctx) {
  const done = new Map();
  const get = async (name) => { if (!done.has(name)) done.set(name, await armRecord(name, ctx)); return done.get(name); };
  const ok = (r) => r && !r.e;
  const first = async (chain) => { for (const n of chain) if (ok(await get(n))) return n; return 'A'; };
  const served = await first(CONFIG.servedRule[cls]);
  const pub = await first(CONFIG.servedRule[cls].filter(isPublicArm));
  const d5 = await get('D5'), b3 = await get('B3');
  const earlier = ok(d5) && ok(b3) && d5.rms <= CONFIG.earlierConstruction.guardRatio * b3.rms ? 'D5' : ok(b3) ? 'B3' : 'A';
  const earlier0 = await first(CONFIG.earlierConstruction.unguarded);
  const arms = Object.fromEntries([...done].filter(([, r]) => r).map(([n, r]) => [n, r.e ? { e: r.e.slice(0, 80) } : { p: r.p, d: r.d, rms: r.rms, lastH: r.lastH }]));
  return { served, public: pub, earlier, earlier0, arms, servedStates: done.get(served)?.states };
}

// ---- the end-to-end check: made-up sets and made-up files (no catalog data), every guard tripped on purpose ----
async function check() {
  const problems = [], say = (s) => console.log(s);
  const t0 = Date.parse('2026-06-15T00:00:00Z');
  const jd = { whole: Math.floor(t0 / DAY) + 2440587.5, frac: 0 };
  const guard = makeWindow({ from: t0 - 30 * DAY, to: t0 + 30 * DAY });
  try { spwFor(t0); } catch (error) { say(`SKIPPED, not a pass: the weather archive is not readable here (${String(error.message).slice(0, 120)})`); process.exit(1); }
  configureInputs({ allowed: ['P13'], fromMs: t0 - 30 * DAY, toMs: t0 + 30 * DAY });
  // A made-up set's own SGP4 flight stands in for truth. A history of made-up sets cannot be made without orbit mathematics in this
  // repository, so the history arms see copies of the current set with its own epoch: their flights agree, and every arm's path runs.
  const cases = [
    { label: 'MEO-like (K12)', copies: 2, set: { norad: 99901, ...jd, n: 2.0057, e: 0.005, inc: 55, raan: 120, argp: 30, ma: 10, bstar: 0, ndot: 0, nddot: 0 }, expect: 'K12' },
    { label: 'GEO-like (KG8c)', copies: 2, set: { norad: 99902, ...jd, n: 1.0027, e: 0.0002, inc: 40, raan: 80, argp: 270, ma: 50, bstar: 0, ndot: 0, nddot: 0 }, expect: 'KG8c' },
    { label: '690 km (KM5)', copies: 8, set: { norad: 99903, ...jd, n: 14.6, e: 0.001, inc: 98.2, raan: 120, argp: 90, ma: 10, bstar: 1e-5, ndot: 0, nddot: 0 }, expect: 'KM5' },
  ];
  for (const c of cases) {
    const cls = classifyOrbitRegime(c.set.n, c.set.e).regime;
    const at = grid(t0, 7).slice(1), flown = flySgp4(c.set, at);
    const truth = at.map((ms, i) => ({ ms, r: flown[i].r }));
    const prior = Array.from({ length: c.copies }, () => ({ ...c.set }));
    const out = await recordsFor(cls, { norad: c.set.norad, tle: c.set, prior, inputT0: t0, at, truth, fromMs: t0, perDay: DAY / (CONFIG.grid.stepSeconds * 1000), guard });
    const s = out.arms[out.served];
    say(`${c.label}: class ${cls}, served ${out.served} (72 h from the set's flight ${s?.p?.toFixed(3)} km, fit ${s?.rms} m), public ${out.public}, earlier ${out.earlier}`);
    if (out.served !== c.expect || out.public !== c.expect) problems.push(`${c.label}: served ${out.served}, public ${out.public}, expected ${c.expect}`);
    if (!(s?.p < 2)) problems.push(`${c.label}: the served record does not follow the flight it was fitted to within 2 km`);
    if (out.earlier !== 'B3' || out.earlier0 !== 'B3') problems.push(`${c.label}: the earlier construction is ${out.earlier}/${out.earlier0}; with no set before the epoch it is B3`);
  }
  const g = cases[1].set, moved = { ...g, ma: g.ma + 30 };
  if (afterLastJump([g, moved, g], CONFIG.arms.KG8c.history.cutKm).length !== 1) problems.push('the maneuver cut does not drop the sets before the last jump');
  if (afterLastJump([g, g, g], CONFIG.arms.KG8c.history.cutKm).length !== 3) problems.push('the maneuver cut drops sets with no jump');

  // Inputs a part does not list are never read, and a file named outside the window is never opened (made-up files in a scratch root).
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apcc-check-'));
  const ult = path.join(root, CONFIG.inputs.ultraRapid.root, 'ESA0OPSULT_20261650000_02D_05M_ORB.SP3.gz');
  const cpfDir = path.join(root, CONFIG.inputs.cpf.targetRoots[0], 'madeup');
  const cpfIn = path.join(cpfDir, 'madeup_cpf_260614_16501.xxx'), cpfOut = path.join(cpfDir, 'madeup_cpf_260101_00101.xxx');
  fs.mkdirSync(path.dirname(ult), { recursive: true }); fs.mkdirSync(cpfDir, { recursive: true });
  fs.writeFileSync(ult, 'not a product'); fs.writeFileSync(cpfIn, 'H1 CPF  2 XXX 2026  6 14  1 165  1 madeup\nH2  9999901 9999 99901 2026  6 14  0  0  0 2026  6 19  0  0  0   300 1 1  0 0 0 1\n');
  fs.writeFileSync(cpfOut, 'H1 CPF  2 XXX 2026  1  1  1   1  1 madeup\nH2  9999901 9999 99901 2026  1  1  0  0  0 2026  1  6  0  0  0   300 1 1  0 0 0 1\n');
  const opened = new Set();
  setArchiveCheck((p) => opened.add(p), root);
  configureInputs({ allowed: ['P13'], fromMs: t0 - 30 * DAY, toMs: t0 + 30 * DAY, root });
  await INPUTS.U2(99901, Date.parse('2026-06-15T04:00:00Z'), guard); await INPUTS.P13(99901, t0, guard);
  const ultOpenedByPart1 = opened.has(ult), cpfOutOpened = opened.has(cpfOut), cpfInOpened = opened.has(cpfIn);
  if (ultOpenedByPart1) problems.push('part 1 (inputs P13 only) opened an ultra-rapid file');
  if (cpfOutOpened) problems.push('a CPF file named outside the window was opened');
  if (!cpfInOpened) problems.push('the CPF file named inside the window was not read (the check proves nothing)');
  configureInputs({ allowed: ['P13', 'U2', 'R3'], fromMs: t0 - 30 * DAY, toMs: t0 + 30 * DAY, root });
  try { await INPUTS.U2(99901, Date.parse('2026-06-15T04:00:00Z'), guard); } catch { /* a made-up file is not an SP3 product */ }
  if (!opened.has(ult)) problems.push('with U2 listed, the ultra-rapid file was not even tried (the check proves nothing)');
  say(`inputs: made-up ultra-rapid file opened with part 1's list (P13): ${ultOpenedByPart1 ? 'yes' : 'no'}; with U2 listed: ${opened.has(ult) ? 'yes' : 'no'}; made-up CPF file named outside the window opened: ${cpfOutOpened ? 'yes' : 'no'}; inside: ${cpfInOpened ? 'yes' : 'no'}`);
  // What existed (guard 7): a snapshot row created after the cutoff is not read, and of two revisions of a set the first created is the set.
  const iso = (ms) => new Date(ms).toISOString().replace(/Z$/, '000'), row = (epochMs, createdMs, gpId) => ({ NORAD_CAT_ID: '99904', EPOCH: iso(epochMs),
    CREATION_DATE: new Date(createdMs).toISOString().slice(0, 19), MEAN_MOTION: '14.6', ECCENTRICITY: '0.001', INCLINATION: '98.2', RA_OF_ASC_NODE: '120',
    ARG_OF_PERICENTER: '90', MEAN_ANOMALY: '10', BSTAR: '0.00001', MEAN_MOTION_DOT: '0', MEAN_MOTION_DDOT: '0', GP_ID: String(gpId) });
  const snapDir = path.join(root, 'spacetrack/gp/2026');
  fs.mkdirSync(snapDir, { recursive: true });
  fs.writeFileSync(path.join(snapDir, '2026-06-14.json.gz'), zlib.gzipSync(JSON.stringify([
    row(t0 - 2 * DAY, t0 - 2 * DAY + 36e5, 2), row(t0 - 2 * DAY + 10e3, t0 - 2 * DAY + 3 * 36e5, 1), row(t0 - DAY, t0 + 36e5, 3)])));
  const read = loadPublicSets({ fromMs: t0 - 5 * DAY, cutoffMs: t0, norads: [99904], guard: () => {}, archive: root })[0]?.tles ?? [];
  const existed = read.length === 1 && read[0].gpId === 2;
  if (!existed) problems.push(`the creation check: ${read.length} sets read (expected 1, GP_ID 2), GP_IDs ${read.map((x) => x.gpId).join(' ')}`);
  say(`what existed: a snapshot row created after the cutoff read: ${read.some((x) => x.gpId === 3) ? 'yes' : 'no'}; of two revisions the set is the first created: ${read[0]?.gpId === 2 ? 'yes' : 'no'}`);
  setArchiveCheck(() => {});
  configureInputs({ allowed: [], fromMs: 0, toMs: 0 });

  // The seven guards of a registered part, each tripped.
  const trips = [];
  const trip = (label, fn) => { try { fn(); problems.push(`guard not tripped: ${label}`); } catch (e) { trips.push(`${label}: ${String(e.message).split('\n')[0].slice(0, 90)}`); } };
  const store = fs.mkdtempSync(path.join(os.tmpdir(), 'apcc-store-'));
  claimStart(store, 's0of1', { part: 'check' });
  trip('second run of a part', () => claimStart(store, 's0of1', { part: 'check' }));
  const tmpLib = path.join(root, 'lib-copy.mjs');
  fs.writeFileSync(tmpLib, 'export const x = 2; // edited\n');
  trip('an edited executed file', () => verifyFiles({ [tmpLib]: sha256(fs.readFileSync(tmpLib)) }, { [tmpLib]: sha256('export const x = 1;\n') }));
  trip('an executed file not registered', () => verifyFiles({ [tmpLib]: sha256(fs.readFileSync(tmpLib)) }, {}));
  const ledger = path.join(root, 'flags.json');
  fs.writeFileSync(ledger, '{"changed":true}');
  trip('a changed truth-gate ledger', () => verifyLedger(ledger, CONFIG.registration.truthGateLedger.sha256));
  const mg = manifestGuard({ files: [{ path: 'listed.txt', bytes: 3 }] });
  fs.writeFileSync(path.join(root, 'listed.txt'), 'abc'); fs.writeFileSync(path.join(root, 'unlisted.txt'), 'abc');
  mg.check(path.join(root, 'listed.txt'), root);
  trip('an archive file missing from the manifest', () => mg.check(path.join(root, 'unlisted.txt'), root));
  trip('a run before the fixed day', () => verifyRunDay(CONFIG.parts['2'], Date.parse(`${CONFIG.parts['2'].runOn}T00:00:00Z`) - 1));
  trip('a run after the fixed day', () => verifyRunDay(CONFIG.parts['2'], Date.parse(`${CONFIG.parts['2'].runOn}T00:00:00Z`) + DAY));
  verifyRunDay(CONFIG.parts['2'], Date.parse(`${CONFIG.parts['2'].runOn}T12:00:00Z`));
  trip('uncommitted changes to tracked files', () => verifyClean(' M experiments/ap-from-public-sets/lib.mjs'));
  let hooked = false;
  try { HOOK.expect(fs.realpathSync(tmpLib), sha256('export const x = 1;\n')); await import(`file://${fs.realpathSync(tmpLib)}?check`); } catch (e) { hooked = /REFUSED/.test(String(e.message)); }
  HOOK.expect(null);
  if (!hooked) problems.push('guard not tripped: the load hook ran an edited file'); else trips.push('an edited file at load time: refused by the registration hook');
  say(`guards tripped (${trips.length}):\n  ${trips.join('\n  ')}`);
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(store, { recursive: true, force: true });

  // The statistic, the verdicts, part 1's candidate and part 2's rule, end to end: made-up rows in a scratch store, the real table.mjs
  // run on them as a separate process, and every assertion made on the table.json it writes.
  const tdir = fs.mkdtempSync(path.join(os.tmpdir(), 'apcc-table-'));
  const writeStore = (dir, rows) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rows-s0of1.jsonl'), `${rows.map((x) => JSON.stringify(x)).join('\n')}\n`);
    fs.writeFileSync(path.join(dir, 'manifest-s0of1.json'), JSON.stringify({ executedFiles: {}, repositoryCommit: 'made-up', wasmSha256: 'made-up', counts: { noTruth: 0 }, truthStatesScreenedOut: 0 }));
  };
  // n satellites of m sets in a class: the set's 72 h error a(i, j), the public record's pub(i) times it, the earlier construction's ear(i)
  const made = (cls, n, m, pub, ear, a = (i, j) => 1 + 0.01 * j) => Array.from({ length: n * m }, (_, k) => {
    const i = Math.floor(k / m), j = k % m, x = a(i, j);
    return { norad: 90000 + 100 * CONFIG.classes.indexOf(cls) + i, cls, family: 'made-up', served: 'K12', public: 'K12', earlier: 'D5', earlier0: 'D5',
      A: { primary: x }, arms: { K12: { p: x * pub(i, j) }, D5: { p: x * ear(i, j) } } };
  });
  const table = (partId, rows, extra = []) => {
    const dir = fs.mkdtempSync(path.join(tdir, `${partId}-`));
    writeStore(path.join(dir, 'store'), rows);
    execFileSync(process.execPath, [path.join(HERE, 'table.mjs'), '--part', partId, '--store', path.join(dir, 'store'), '--out', path.join(dir, 'out'), ...extra], { stdio: 'ignore' });
    return { dir, t: JSON.parse(fs.readFileSync(path.join(dir, 'out', 'table.json'), 'utf8')) };
  };
  const spike = (p) => (i, j) => (j === 5 ? 1.6 : p(i, j)); // one set in six at 1.6 times the set: T95 above 1, the median untouched
  const p1 = table('1', [
    ...made('MEO', 8, 5, (i) => 0.8 + 0.01 * i, (i) => 0.95 + 0.005 * i), // beats the set and the earlier construction, tail within
    ...made('HIGH_LEO', 6, 6, spike((i) => 0.7 + 0.02 * i), () => 0.9), // the same, but its tail is over T95
    ...made('GEO', 8, 5, (i) => 0.8 + 0.01 * i, (i) => 0.95 - 0.02 * i), // its interval against the earlier construction spans 1
    ...made('MID_LEO', 8, 5, (i) => 0.9 + 0.03 * i, (i) => 0.92 + 0.03 * i), // public and earlier TIE against the set
    ...made('HEO', 5, 8, () => 0.5, () => 0.9), // 5 satellites: FEW, no ratio
  ]);
  const C = p1.t.classes, cand = Object.fromEntries(CONFIG.classes.map((c) => [c, C[c].catalog]));
  const want1 = { LOW_LEO: 'set', MID_LEO: 'set', HIGH_LEO: 'earlier construction', MEO: 'new construction', GEO: 'earlier construction', HEO: 'set' };
  say(`table.mjs on made-up rows, part 1 candidates: ${CONFIG.classes.map((c) => `${c} ${cand[c]}`).join('; ')}`);
  for (const c of CONFIG.classes) if (cand[c] !== want1[c]) problems.push(`part 1 candidate ${c}: ${cand[c]}, expected ${want1[c]}`);
  const m = C.MEO.records.public.vsSet, h = C.HIGH_LEO.records.public.vsSet, f = C.HEO.records.public.vsSet;
  say(`statistic in the written table: MEO ${m.ratio} (${m.lo} to ${m.hi}, coverage ${m.coverage}) ${m.verdict} on ${m.satellites} satellites; HIGH_LEO ${h.ratio} (${h.lo} to ${h.hi}, coverage ${h.coverage}) on ${h.satellites}; HEO ${f.verdict}, ratio ${f.ratio}`);
  if (!(m.ratio === 0.835 && m.lo === 0.8 && m.hi === 0.87 && m.coverage === 0.992 && m.verdict === 'BEATS')) problems.push('the statistic on 8 made-up satellites is off');
  if (!(h.ratio === 0.75 && h.lo === 0.7 && h.hi === 0.8 && h.coverage === 0.969)) problems.push('the order-statistic interval on 6 made-up satellites is off');
  if (!(f.verdict === 'FEW' && f.ratio == null)) problems.push('five satellites must read FEW with no ratio');
  // Part 2 on the public record, against a part 1 table that names every class but LOW_LEO for the new construction.
  const p1file = path.join(tdir, 'part1-table.json');
  fs.writeFileSync(p1file, JSON.stringify({ classes: Object.fromEntries(CONFIG.classes.map((c) => [c, { catalog: c === 'LOW_LEO' ? 'set' : 'new construction' }])) }));
  const p2 = table('2', [
    ...made('MEO', 8, 5, (i) => 0.8 + 0.01 * i, () => 0.9), // holds
    ...made('GEO', 8, 5, (i) => 0.8 + 0.01 * i, (i) => 0.95 - 0.02 * i), // upper end against the earlier construction 1.07
    ...made('HIGH_LEO', 6, 6, spike((i) => 0.7 + 0.02 * i), () => 0.9), // T95 over 1
    ...made('MID_LEO', 8, 5, (i) => 0.9 + 0.01 * i, () => 0.95), // beats the set, but its interval ends at 0.97: not below 0.95
    ...made('HEO', 4, 10, () => 0.5, () => 0.9), // 4 satellites: untested
  ], ['--part1', p1file]).t.classes;
  const tie = table('2', made('MID_LEO', 8, 5, (i) => 0.9 + 0.02 * i, () => 1, (i, j) => (i >= 5 ? 0.5 : 1 + 0.01 * j)), ['--part1', p1file]).t.classes.MID_LEO;
  const res = Object.fromEntries(CONFIG.classes.map((c) => [c, p2[c].part2?.result]));
  const want2 = { LOW_LEO: 'not applicable', MID_LEO: 'fails', HIGH_LEO: 'fails', MEO: 'holds', GEO: 'fails', HEO: 'untested' };
  say(`part 2 in the written table (public record): MEO ${res.MEO}; GEO ${res.GEO} (upper end against the earlier construction ${p2.GEO.publicVsEarlier.hi}); HIGH_LEO ${res.HIGH_LEO} (T95 ${p2.HIGH_LEO.records.public.tail.T95}); MID_LEO ${res.MID_LEO} (against the set ${p2.MID_LEO.records.public.vsSet.lo} to ${p2.MID_LEO.records.public.vsSet.hi}); MID_LEO with a TIE against the set ${tie.part2?.result} (${tie.records.public.vsSet.verdict}, tail ${tie.records.public.tail.T95} / ${tie.records.public.tail.Trms}, against the earlier construction to ${tie.publicVsEarlier.hi}); HEO ${res.HEO}; LOW_LEO ${res.LOW_LEO}`);
  for (const c of CONFIG.classes) if (res[c] !== want2[c]) problems.push(`part 2 ${c}: ${res[c]}, expected ${want2[c]}`);
  if (!(tie.part2?.result === 'fails' && tie.records.public.vsSet.verdict === 'TIE' && tie.publicVsEarlier.hi < 1.05 && tie.records.public.tail.T95 <= 1 && tie.records.public.tail.Trms <= 1)) problems.push('part 2 with a TIE against the set (margin and tail within) must fail');
  fs.rmSync(tdir, { recursive: true, force: true });
  say(problems.length ? `CHECK FAILED\n- ${problems.join('\n- ')}` : `CHECK PASSED (${CONFIG.build.module} ${CONFIG.build.version} ${wasmSha.slice(0, 12)})`);
  process.exit(problems.length ? 1 : 0);
}

// ---- --pin: every file a part can execute, by SHA-256, into registration.json (before the registration commit). The list is what this
// process loads plus every file the three dry runs (dev-A: CPF, ultra-rapid and rapid conversions; dev-B; dev-H: the XP module) recorded
// as executed; each is hashed now, and a dry-run file whose bytes changed since its run stops the pin (rerun the dry runs). ----
async function pin() {
  await import('./xp.mjs');
  await preloadReaders();
  await import('../../sdn-gp-starlink-ffm-match/lib/tle.mjs');
  const keyPath = HOOK.pathOf;
  const seen = new Map(HOOK.loaded);
  for (const dry of ['dev-A', 'dev-B', 'dev-H']) {
    const dir = path.join(REPO, 'runs/ap-catalog-construction', dry);
    const manifests = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^manifest-s\d+of\d+\.json$/.test(f)) : [];
    if (!manifests.length) throw new Error(`--pin needs the dry run ${dry} of this code first`);
    for (const f of manifests) for (const [key, sha] of Object.entries(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).executedFiles)) {
      if (sha256(fs.readFileSync(keyPath(key))) !== sha) throw new Error(`${key} changed since the dry run ${dry}: rerun the dry runs before pinning`);
      seen.set(key, sha);
    }
  }
  const files = Object.fromEntries([...seen].sort(([a], [b]) => a.localeCompare(b)));
  const hashOf = (rel) => sha256(fs.readFileSync(path.join(HERE, rel)));
  const out = { note: 'made by run.mjs --pin; every file a registered part executes, keyed as run.mjs keys them (node_modules/..., the path in this repository, or stack:repos/... for another repository of the stack)', files,
    configSha256: hashOf('config.json'), planSha256: hashOf('PLAN.md'), manifests: Object.fromEntries(['1', '2', 'H'].map((p) => [p, CONFIG.parts[p].manifest]).filter(([, m]) => fs.existsSync(path.join(HERE, m))).map(([p, m]) => [p, hashOf(m)])) };
  fs.writeFileSync(path.join(HERE, CONFIG.registration.file), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`registration.json: ${Object.keys(files).length} files`);
  process.exit(0);
}

// ---- --manifest <part>: the archive files a part may read (paths and byte counts by listing; nothing is opened) ----
function manifest(partId) {
  const part = CONFIG.parts[partId], A = CONFIG.archive, files = new Map();
  const add = (abs) => { if (fs.existsSync(abs) && fs.statSync(abs).isFile()) files.set(path.relative(A, abs), fs.statSync(abs).size); };
  const addDir = (dir, keep = () => true) => { if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (keep(f)) add(path.join(dir, f)); };
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  // a capture part's window comes from its capture time (made on its run day, when the folder may be opened)
  const T = part.capture ? Date.parse(JSON.parse(fs.readFileSync(path.join(A, part.capture, 'run.json'), 'utf8')).started_utc) : null;
  if (part.capture) { add(path.join(A, part.capture, 'run.json')); add(path.join(A, part.capture, CONFIG.xp.captureFile)); }
  const from = T ? T - (CONFIG.history.priorWindowDays + 1) * DAY : Date.parse(part.readFrom), to = T ? T + part.days * DAY : Date.parse(part.readTo);
  const setsTo = T ?? Date.parse(part.to);
  // public sets: the daily files the loader reads
  for (const dir of ['spacetrack/gp', 'spacetrack/gp_history/by-creation']) for (const y of new Set([day(from).slice(0, 4), day(to).slice(0, 4)])) addDir(path.join(A, dir, y), (f) => f.endsWith('.json.gz') && f.slice(0, 10) >= day(from) && f.slice(0, 10) <= day(setsTo));
  // truth: every index of the truth roots (the runner reads every index), and the object files its index dates inside the window
  for (const rel of CONFIG.truth.roots) {
    const root = path.join(A, rel);
    for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
      const idx = path.join(root, d, 'index.json');
      if (!fs.existsSync(idx)) continue;
      add(idx);
      for (const o of JSON.parse(fs.readFileSync(idx, 'utf8')).objects ?? []) if (Date.parse(`${o.stop.replace(/Z?$/, 'Z')}`) >= from && Date.parse(`${o.start.replace(/Z?$/, 'Z')}`) <= to) add(path.join(root, d, o.file));
    }
  }
  // inputs of the part, by name date; the Earth-orientation and identity files; the weather builder's sources
  const named = (f) => { const m = /_cpf_(\d\d)(\d\d)(\d\d)_/.exec(f); return m ? Date.UTC(2000 + +m[1], +m[2] - 1, +m[3]) : NaN; };
  if (part.inputs.includes('P13')) {
    for (const r of CONFIG.inputs.cpf.targetRoots) for (const t of fs.existsSync(path.join(A, r)) ? fs.readdirSync(path.join(A, r)) : []) addDir(path.join(A, r, t), (f) => named(f) >= from && named(f) <= to);
    for (const r of CONFIG.inputs.cpf.retrievedRoots) addDir(path.join(A, r), (f) => named(f) >= from && named(f) <= to);
  }
  if (part.inputs.includes('U2')) addDir(path.join(A, CONFIG.inputs.ultraRapid.root), (f) => { const m = new RegExp(CONFIG.inputs.ultraRapid.pattern).exec(f); return m && Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * DAY >= from && Date.UTC(+m[1], 0, 1) + (+m[2] + 1) * DAY <= to; });
  if (part.inputs.includes('R3')) for (const w of fs.existsSync(path.join(A, CONFIG.inputs.rapid.root)) ? fs.readdirSync(path.join(A, CONFIG.inputs.rapid.root)) : []) addDir(path.join(A, CONFIG.inputs.rapid.root, w), (f) => { const m = /_(\d{4})(\d{3})0000_/.exec(f); return m && Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * DAY >= from && Date.UTC(+m[1], 0, 1) + (+m[2]) * DAY <= to; });
  add(path.join(A, CONFIG.inputs.eop.snapshot));
  for (const d of fs.existsSync(path.join(A, CONFIG.inputs.eop.dailyRoot)) ? fs.readdirSync(path.join(A, CONFIG.inputs.eop.dailyRoot)) : []) if (d <= day(to)) add(path.join(A, CONFIG.inputs.eop.dailyRoot, d, CONFIG.inputs.eop.fileName));
  add(path.join(A, CONFIG.inputs.identities.snapshot));
  addDir(path.join(A, CONFIG.inputs.identities.stampedRoot), (f) => /^igs_satellite_metadata\.snx\.\d{8}T\d{4}Z$/.test(f) && f.slice(23, 31) <= day(to).replace(/-/g, ''));
  add(path.join(A, 'hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt'));
  for (const src of ['hac/gfz-kp/2026', 'hac/noaa-swpc/2026']) for (const d of fs.existsSync(path.join(A, src)) ? fs.readdirSync(path.join(A, src)) : []) if (d <= day(to)) addDir(path.join(A, src, d));
  const out = { part: partId, note: 'paths relative to the archive and byte counts, from directory listings and the truth indexes (object, start, stop, file name); no data file was opened to make this list', files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([p, bytes]) => ({ path: p, bytes })) };
  const file = part.manifest ? path.join(HERE, part.manifest) : path.join(REPO, 'runs/ap-catalog-construction', partId, 'archive-manifest.json');
  fs.writeFileSync(file, `${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{')}\n`);
  console.log(`${path.relative(REPO, file)}: ${out.files.length} files, ${(out.files.reduce((s, f) => s + f.bytes, 0) / 1e9).toFixed(2)} GB`);
  process.exit(0);
}

// ---- a part ----
async function runPart(partId) {
  const part = CONFIG.parts[partId];
  if (!part) throw new Error('usage: run.mjs --check | --pin | --manifest 1|2|H | --part 1|2|H|dev-A|dev-B|dev-H [--shard i/n]');
  const registered = ['1', '2', 'H'].includes(partId);
  const [shardI, shardN] = (arg('--shard') ?? '0/1').split('/').map(Number);
  const tag = `s${shardI}of${shardN}`;
  const outDir = registered ? path.join(CONFIG.store, `part${partId}`) : path.join(REPO, 'runs/ap-catalog-construction', partId);
  for (const [m, want] of Object.entries(CONFIG.readers)) { // the reader modules' bytes, as the plan names them
    const got = sha256(fs.readFileSync(path.join(MODULES, m, 'dist/isomorphic/module.wasm')));
    if (got !== want.wasmSha256) throw new Error(`REFUSED: ${m} is ${got}, the plan names ${want.wasmSha256}`);
  }
  let mg = manifestGuard(null);
  if (registered) {
    verifyRunDay(part, Date.now());
    verifyClean(git('status', '--porcelain', '--untracked-files=no'));
    const reg = JSON.parse(fs.readFileSync(path.join(HERE, CONFIG.registration.file), 'utf8'));
    verifyFiles(Object.fromEntries(HOOK.loaded), reg.files);
    if (sha256(fs.readFileSync(path.join(HERE, 'config.json'))) !== reg.configSha256 || sha256(fs.readFileSync(path.join(HERE, 'PLAN.md'))) !== reg.planSha256) throw new Error('REFUSED: config.json or PLAN.md differs from registration.json');
    verifyLedger(path.join(REPO, CONFIG.registration.truthGateLedger.file), CONFIG.registration.truthGateLedger.sha256);
    const manifestFile = path.join(HERE, part.manifest);
    if (!fs.existsSync(manifestFile) || sha256(fs.readFileSync(manifestFile)) !== reg.manifests[partId]) throw new Error(`REFUSED: ${part.manifest} is absent or differs from registration.json`);
    mg = manifestGuard(JSON.parse(fs.readFileSync(manifestFile, 'utf8')));
    claimStart(outDir, tag, { part: partId, command: `node experiments/ap-catalog-construction/run.mjs ${argv.join(' ')}`, repositoryCommit: git('rev-parse', 'HEAD') });
  } else fs.mkdirSync(outDir, { recursive: true });
  setArchiveCheck((p) => mg.check(p, CONFIG.archive));
  const t00 = Date.now(), counts = { sets: 0, noTruth: 0, errors: 0 }, rows = [];

  if (part.capture) {
    const { openXp, captureSets } = await import('./xp.mjs');
    const capDir = path.join(CONFIG.archive, part.capture);
    const T = Date.parse(JSON.parse(fs.readFileSync(path.join(capDir, 'run.json'), 'utf8')).started_utc);
    const days = part.days, guard = makeWindow({ from: T - (CONFIG.history.priorWindowDays + 1) * DAY, to: T + days * DAY, never: (part.never ?? []).map(([a, b]) => [Date.parse(a), Date.parse(b)]) });
    configureInputs({ allowed: part.inputs, fromMs: T - (CONFIG.history.priorWindowDays + 1) * DAY, toMs: T + days * DAY });
    const index = truthIndex(T, T + days * DAY);
    const norads = [...index.keys()].sort((a, b) => a - b).filter((_, i) => i % shardN === shardI);
    const sets = await captureSets(path.join(capDir, CONFIG.xp.captureFile));
    const objects = new Map(loadPublicSets({ fromMs: T - CONFIG.history.priorWindowDays * DAY, cutoffMs: T, norads, guard }).map((o) => [o.norad, o]));
    const xp = await openXp();
    Object.assign(counts, { noXpSet: 0, notXpType: 0, noPublicSet: 0, ingestChanged: 0 });
    for (const norad of norads) {
      const s = sets.get(norad);
      if (!s) { counts.noXpSet += 1; continue; }
      if (s.type !== CONFIG.xp.setType) { counts.notXpType += 1; continue; }
      const tles = objects.get(norad)?.tles ?? [];
      const tle = tles.at(-1);
      if (!tle || T - tleMs(tle) > CONFIG.xp.publicSetMaximumAgeDays * DAY) { counts.noPublicSet += 1; continue; }
      const { truth, perDay, firstDayCovered } = truthFor(index, norad, T, days, guard);
      if (!firstDayCovered) { counts.noTruth += 1; continue; }
      counts.sets += 1;
      const at = truth.map((x) => x.ms), cls = classifyOrbitRegime(tle.n, tle.e).regime;
      const row = { norad, family: index.get(norad)[0].family, cls, captureUtc: new Date(T).toISOString(), xpSetAgeH: Math.round((T - s.epochMs) / 36e5 * 10) / 10, publicSetAgeH: Math.round((T - tleMs(tle)) / 36e5 * 10) / 10 };
      try {
        const x = await xp.flyXp(s, at);
        if (!x.ingestKept) counts.ingestChanged += 1;
        row.XP = score(x.r, truth, T, perDay, days);
        const a = flySgp4(tle, at);
        row.A = a ? score(a.map((q) => q.r), truth, T, perDay, days) : null;
        const prior = tles.slice(0, -1).filter((y) => tleMs(y) >= tleMs(tle) - CONFIG.history.priorWindowDays * DAY && y.createdMs <= tle.createdMs);
        const rec = await recordsFor(cls, { norad, tle, prior, inputT0: T, at, truth, fromMs: T, perDay, guard, days });
        const { servedStates, ...kept } = rec;
        Object.assign(row, kept);
        if (servedStates) { // the provider's own theory fitted to the same input states, flown and scored the same way (secondary)
          const same = await xp.fitAndFly(norad, servedStates, at);
          row.XPsame = same.error ? { e: same.error } : score(same.r, truth, T, perDay, days);
        }
      } catch (error) { row.error = String(error?.message ?? error).slice(0, 160); counts.errors += 1; await freshHost(); }
      rows.push(row);
    }
    await xp.destroy();
  } else {
    const p0 = Date.parse(part.from), p1 = Date.parse(part.to);
    const guard = makeWindow({ from: Date.parse(part.readFrom), to: Date.parse(part.readTo), never: (part.never ?? []).map(([a, b]) => [Date.parse(a), Date.parse(b)]) });
    configureInputs({ allowed: part.inputs, fromMs: Date.parse(part.readFrom), toMs: Date.parse(part.readTo) });
    const index = truthIndex(p0, p1 + CONFIG.scoring.days * DAY);
    const norads = [...index.keys()].sort((a, b) => a - b).filter((_, i) => i % shardN === shardI);
    const objects = loadPublicSets({ fromMs: Date.parse(part.readFrom), cutoffMs: p1, norads, guard });
    console.log(`part ${partId} ${tag}: ${norads.length} truth objects of ${index.size}, ${objects.length} with sets (${((Date.now() - t00) / 1000).toFixed(0)} s)`);
    for (const obj of objects) {
      let last = -Infinity;
      for (const tle of obj.tles) {
        const t0 = tleMs(tle);
        if (t0 < p0 || t0 >= p1 || t0 - last < CONFIG.selection.spacingDays * DAY) continue;
        const { truth, perDay, firstDayCovered } = truthFor(index, obj.norad, t0, CONFIG.scoring.days, guard);
        if (!firstDayCovered) { counts.noTruth += 1; continue; }
        last = t0; counts.sets += 1;
        const c = classifyOrbitRegime(tle.n, tle.e);
        const row = { norad: obj.norad, family: index.get(obj.norad)[0].family, cls: c.regime, hpKm: Math.round(c.hpKm), ecc: tle.e, t0: new Date(t0).toISOString(), createdAfterH: Math.round((tle.createdMs - t0) / 36e5 * 10) / 10 };
        try {
          const at = truth.map((s) => s.ms), a = flySgp4(tle, at);
          if (!a) throw new Error('sgp4-status');
          row.A = score(a.map((s) => s.r), truth, t0, perDay);
          const prior = obj.tles.filter((x) => tleMs(x) < t0 && tleMs(x) >= t0 - CONFIG.history.priorWindowDays * DAY && x.createdMs <= tle.createdMs);
          const { servedStates, ...kept } = await recordsFor(c.regime, { norad: obj.norad, tle, prior, inputT0: t0, at, truth, fromMs: t0, perDay, guard });
          Object.assign(row, kept);
        } catch (error) { row.error = String(error?.message ?? error).slice(0, 160); counts.errors += 1; await freshHost(); }
        rows.push(row);
        if (counts.sets % 100 === 0) console.log(`  ${counts.sets} sets, ${((Date.now() - t00) / 1000).toFixed(0)} s`);
      }
    }
  }

  fs.writeFileSync(path.join(outDir, `rows-${tag}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), { flag: registered ? 'wx' : 'w' });
  fs.writeFileSync(path.join(outDir, `manifest-${tag}.json`), JSON.stringify({
    command: `node experiments/ap-catalog-construction/run.mjs ${argv.join(' ')}`, finishedUtc: new Date().toISOString(), node: process.version,
    executedFiles: Object.fromEntries([...HOOK.loaded].sort(([a], [b]) => a.localeCompare(b))),
    repositoryCommit: git('rev-parse', 'HEAD'), modulesCommit: execFileSync('git', ['-C', MODULES, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), wasmSha256: wasmSha,
    readerWasmSha256: Object.fromEntries(Object.keys(CONFIG.readers).map((m) => [m, sha256(fs.readFileSync(path.join(MODULES, m, 'dist/isomorphic/module.wasm')))])),
    counts, truthStatesScreenedOut: truthCounts.screenedStates, truthFiles: truthCounts.files.size,
    archiveFilesRead: [...archiveRead].sort(), inputFiles: Object.fromEntries([...inputFiles].sort()) }, null, 1), { flag: registered ? 'wx' : 'w' });
  console.log(`part ${partId} ${tag}: ${counts.sets} sets, ${counts.noTruth} without a scored first day, ${counts.errors} errors in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
  process.exit(0);
}

if (argv.includes('--check')) await check();
else if (argv.includes('--pin')) await pin();
else if (argv.includes('--manifest')) manifest(arg('--manifest'));
else await runPart(arg('--part'));
