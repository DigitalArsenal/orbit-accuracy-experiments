// The factorial attribution (stack #505): for one made-up case, every combination of the listed force components, each set the
// same way on both sides (the numerical propagator's truth and AP), with AP's record fitted over the forecast span (the truth's own 0
// to 120 h after the cutoff, as fits.mjs forecast-span) and, as one more factor, the drag and radiation terms held at the truth's
// values or solved. The fit reads the same numerical flight it is then scored on, so D is how well one record can follow that flight
// over the span, not a forecast from data before the cutoff. Every orbit is made up, and the truth is a model's flight, not any
// satellite's data.
//
// The factors, and each level on each side:
//   field      one factor at three levels, every level of one field model, EGM2008 (the model AP's table carries from sdn-ap 0.6.36):
//              - J2 alone. Truth: EGM2008 to degree 2, order 0. AP: a build with J3, J4 and J5 zero, MAXIMUM_DEGREE 5 (no zonal tail)
//                and MAXIMUM_TESSERAL_DEGREE 0, flying no resonance-class terms; AP's J2 is its own constant (SPEC 1.3), not
//                EGM2008's C20.
//              - the zonal tail. Truth: EGM2008 to degree 20, order 0. AP: MAXIMUM_DEGREE 20 with its J3 to J5, MAXIMUM_TESSERAL_DEGREE
//                0, the build that flies no resonance-class terms.
//              - the full field. Truth: EGM2008 to degree and order 70. AP: MAXIMUM_DEGREE 20, MAXIMUM_TESSERAL_DEGREE 31, the build
//                as committed. The degrees differ: the truth carries degrees 21 to 70 and the tesserals above 31 that AP does not.
//   moon, sun  each body's attraction. Truth: the body in the third-body list. AP: a build with that body's mass zero in the attraction
//              only; AP's solid tide keeps both bodies, as the truth's does whatever its third-body list says.
//   radiation  cannonball radiation pressure, C_R A/m = the case's term. Truth: on or off. AP: its radiation term at the truth's value
//              (held) or solved where on; held at 0 where off, in both halves.
//   drag       only where the perigee is under 2,500 km. Truth: NRLMSISE-00 drag, C_D A/m = the case's term. AP: NRLMSISE-00 on the
//              same weather with its drag term at the truth's value (held) or solved where on; where off, AP's settings name its own
//              Jacchia 1970 atmosphere on its own flux model, with the drag term held at 0, in both halves. With the perigee at or
//              above 2,500 km the truth has no drag in any cell, and every cell is AP's drag off.
//   tide       the solid Earth tide, IERS 2010, on both sides (AP: SOLID_TIDES).
//   fit        + held: the drag and radiation terms held at the values above (sigma 1e-10); - solved: AP's default priors where
//              the component is on. A term whose component the truth does not have is held at 0 at both levels.
// A binary factor left out of --factors is on in every cell (the fit held where it is the one left out), J2 alone and the all-off
// cell included; the printed labels and the result file (onInEveryCell) name it.
// In every truth cell: the IERS 2010 relativity terms (AP carries no relativity), DE440s, the Earth orientation, the numerical
// propagator FFM 2.2.0 (each pinned and checked by hash in headline-loop/lib/ffm.mjs, as run.mjs flies them), constant space weather
// (F10.7 150, its 81-day mean 150, Ap 15, every day, on both sides), RK78 at tolerance 1e-11 with steps of 1e-3 to 120 s, from the
// state at the cutoff - 72 h made as run.mjs makes it (seed.mjs's record of the case's mean elements flown by the reference build,
// sdn-ap 0.6.26 at modules 7ed7cf88, whatever commit is under test), on a 300 s grid to 120 h past the cutoff.
// AP's builds are built unsigned from the commit's sources with the named patches, every arm alike, the full arm included; each build
// is keyed by the hash of its patches' text, and its sha256 is printed beside the committed dist's.
// D: the largest 3D distance to the truth over 0 to 120 h after the cutoff inclusive (1,441 states at the truth's own epochs); with it
// the signed radial, along-track and cross-track differences at that time. A cell has no D, with its reason, when its fit is refused,
// AP's flight fails or returns fewer states than asked, a distance is not finite, the numerical flight fails, or the truth ends before
// 120 h; the analysis is then refused, since main effects and Shapley shares need every cell.
// The analysis, on log10 D:
// - each binary factor's main effect: the mean of log10 D with the factor on less the mean with it off, over every other cell;
// - the field's two steps: the mean at the zonal tail less the mean at J2 alone, and the mean at the full field less the mean at the
//   zonal tail;
// - two-factor interactions: of two binary factors, and of a field step with a binary factor, each half the change of one's effect
//   between the other's levels;
// - Shapley shares of D for each fit level, over the players field (off: J2 alone; on: the full field), moon, sun, radiation, drag
//   and tide; the field's own split (D at its three levels with every other component on) apart;
// - the one-at-a-time path: J2 alone with every other component off, then the zonal tail, the full field, the Moon, the Sun,
//   radiation, drag and the tide added in that order.
// The main effects, the field's steps and the interactions are in log10 D (D in meters); the Shapley shares, the field's split and
// the one-at-a-time path are in meters. The printout shows the eight largest interactions by size; the result file holds all of them.
//
//   node experiments/synthetic-orbits/factorial.mjs --case <id> --modules-commit <sha> --modules-root <modules checkout>
//     [--factors moon,sun,radiation,drag,tide,fit] [--jobs 2] [--seed 498] [--out <dir>] [--scratch]
//   <id>: a case of cases.mjs (seed --seed), or of the claim set (claim-<seed>-b<band>-<k>); the field is always a factor
// A modules commit whose sdn-ap is older than 0.6.36 is refused: AP's field there is not EGM2008, the truth's. Without --scratch this
// repository's working tree (experiments/synthetic-orbits, experiments/headline-loop) must be clean, since the result file names its
// commit (as claim.mjs and run.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cases as makeCases, termsOf, labelOf } from './cases.mjs';
import { draw } from './claim.mjs';
import { seedRecord } from './seed.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = fileURLToPath(import.meta.url), REPO = path.resolve(path.dirname(SELF), '../..');
const FIRST_VERSION = '0.6.36';
const FIELD = ['j2', 'zonal', 'full'];
const BINARY = ['moon', 'sun', 'radiation', 'drag', 'tide', 'fit'];
const FIELD_TEXT = { j2: 'J2 alone', zonal: 'the zonal tail', full: 'the full field' };
const DAY = 864e5, HOUR = 36e5, STEP = 300e3, N = (8 * DAY) / STEP + 1, NA = (3 * DAY) / STEP, NB = (120 * HOUR) / STEP, DRAG_BELOW_KM = 2500;
const TOLERANCE = 1e-11, WEATHER = { f107: 150, c81: 150, ap: 15 };
const TRUTH_V = 2;
// the reference build that makes every case's starting state (as run.mjs REFERENCE), read by git show and checked by its sha256
const REFERENCE = { version: '0.6.26', modulesCommit: '7ed7cf887b37', wasmSha256: '9119284b8f972799' };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const iso = (ms) => new Date(ms).toISOString();

// the diagnostic builds' patches (propagator/sdn-ap/src/xp_theory.inc), each an exact text found once
const X = 'xp_theory.inc';
const TIDE_LINE = 'inline void rates_eq(const double k1[2], const Bodies& b, const double* y, const Frame& fr, double* out) {\n  double txx = 0.0, tyy = 0.0, tzz = 0.0, txy = 0.0, txz = k1[0], tyz = k1[1];\n  const Vec3 us[2] = {b.sun_u, b.moon_u};\n  const double rs[2] = {b.sun_r, b.moon_r}, ms[2] = {kSunMass, kMoonMass};';
const PATCH = {
  // J3 to J5 zero
  j2: [[X, 'constexpr double kJ3 = -2.53265648533224e-6;', 'constexpr double kJ3 = 0.0;'], [X, 'constexpr double kJ4 = -1.619621591367e-6;', 'constexpr double kJ4 = 0.0;'],
    [X, 'constexpr double kJ5 = -2.27296082868698e-7;', 'constexpr double kJ5 = 0.0;']],
  // no resonance-class terms
  nores: [[X, 's.ctx.res_count = res::current_terms(res, e.eo, std::sin(e.xincl), std::cos(e.xincl), rc);', 's.ctx.res_count = res::current_terms(res, e.eo, std::sin(e.xincl), std::cos(e.xincl), rc); s.ctx.res_count = 0;']],
  // the solid tide's own body masses, so that a body's attraction can be zeroed alone
  tidemass: [[X, TIDE_LINE, TIDE_LINE.replace('ms[2] = {kSunMass, kMoonMass}', 'ms[2] = {kSunMassTide, kMoonMassTide}')],
    [X, 'constexpr double kFlattening = 3.3528197529902951e-3;', 'constexpr double kSunMassTide = 332946.038;\nconstexpr double kMoonMassTide = 0.012300034;\nconstexpr double kFlattening = 3.3528197529902951e-3;']],
  nosun: [[X, 'constexpr double kSunMass = 332946.038;', 'constexpr double kSunMass = 0.0;']],
  nomoon: [[X, 'constexpr double kMoonMass = 0.012300034;', 'constexpr double kMoonMass = 0.0;']],
};
const buildName = (a) => [a.field === 'j2' ? 'j2-nores' : a.field === 'zonal' ? 'nores' : 'base', a.sun ? null : 'nosun', a.moon ? null : 'nomoon'].filter(Boolean).join('-');
const patchesOf = (name) => {
  const parts = name.split('-').filter((p) => p !== 'base');
  const bodies = parts.includes('nosun') || parts.includes('nomoon');
  return [...(parts.includes('j2') ? PATCH.j2 : []), ...(parts.includes('nores') ? PATCH.nores : []), ...(bodies ? PATCH.tidemass : []),
    ...(parts.includes('nosun') ? PATCH.nosun : []), ...(parts.includes('nomoon') ? PATCH.nomoon : [])];
};

/** The case by id: cases.mjs's list, or a claim-set draw. */
function caseOf(id, seed) {
  const m = /^claim-(\d+)-b(\d+)-(\d+)$/.exec(id);
  if (m) return draw(Number(m[1]), Number(m[2]), Number(m[3]) + 1)[Number(m[3])];
  const c = makeCases(seed).cases.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id} (seed ${seed})`);
  return c;
}
/** A cell's arm: the field level and each binary component on or off (drag off where it does not apply). */
const armOf = (cell, dragApplies) => ({ field: cell.field, moon: cell.moon === 1, sun: cell.sun === 1, radiation: cell.radiation === 1, drag: dragApplies && cell.drag === 1, tide: cell.tide === 1, fit: cell.fit === 1 ? 'held' : 'solved' });
const truthKeyOf = (a) => JSON.stringify({ field: a.field, moon: a.moon, sun: a.sun, radiation: a.radiation, drag: a.drag, tide: a.tide });

/** The modules root's harness, the SDS bindings and AP's fit settings (headline-loop and operator-theory, as run.mjs reads them). */
async function libs(root) {
  process.env.SDN_MODULES_ROOT ??= root;
  const { usePackages, MODULES_ROOT } = await import('../headline-loop/lib/env.mjs');
  usePackages();
  const A = await import('../headline-loop/lib/arms.mjs');
  const APL = await import('../operator-theory/lib/ap.mjs');
  const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  return { A, S: A.S, APL, createStandaloneHarness };
}
const flightPcf = (S, epochs) => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new S.flatbuffers.Builder(1 << 16); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
const statesOf = (S, r) => S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v }));

/** The case's state at tStart (GCRF, km and km/s): seed.mjs's record flown by the reference build, as run.mjs's worker makes it. The
 *  reference wasm is the one run.mjs places in <store>/synthetic/reference, or read by git show from the modules clone. */
async function startState(L, root, c, tStart) {
  const S = L.S, file = path.join(L.A.STORE_ROOT, 'synthetic', 'reference', `${REFERENCE.wasmSha256}.wasm`);
  if (!fs.existsSync(file)) {
    const ref = execFileSync('git', ['-C', root, 'show', `${REFERENCE.modulesCommit}:propagator/sdn-ap/dist/isomorphic/module.wasm`], { maxBuffer: 1 << 28 });
    if (!sha256(ref).startsWith(REFERENCE.wasmSha256)) throw new Error('the reference build\'s wasm is not the named one');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.${process.pid}`, ref); fs.renameSync(`${file}.${process.pid}`, file);
  }
  if (!sha256(fs.readFileSync(file)).startsWith(REFERENCE.wasmSha256)) throw new Error(`${file} is not the reference build`);
  const epoch = iso(tStart);
  const h = await L.createStandaloneHarness('browser', file, { surface: 'direct' });
  const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: seedRecord(S, { epoch: epoch.replace('Z', ''), n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma }) },
    { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(S, [epoch]) }] });
  if (r.statusCode !== 0) throw new Error(`reference propagate: ${String(r.errorMessage).slice(0, 200)}`);
  const [p] = statesOf(S, r);
  await h.close?.();
  return [...p.r, ...p.v];
}

/** An AP build of the commit's sources with the named build's patches, built unsigned once into <store>/factorial/builds, keyed by the
 *  hash of the patches' text. */
function build(root, commit, name, store) {
  const patches = patchesOf(name), key = sha256(JSON.stringify(patches)).slice(0, 12);
  const tree = path.join(store, 'builds', `${commit.slice(0, 12)}-${name}-${key}`), wasm = path.join(tree, 'dist/isomorphic/module.wasm');
  if (fs.existsSync(wasm)) return { wasm, key };
  const pkg = path.join(root, 'propagator/sdn-ap'), copy = path.join(tree, 'propagator/sdn-ap');
  fs.rmSync(tree, { recursive: true, force: true });
  fs.cpSync(pkg, copy, { recursive: true, filter: (p) => { const rel = p.slice(pkg.length); return !/\/(node_modules|test|dist)(\/|$)/.test(rel) && !/^\/src(\/|$)/.test(rel); } });
  const files = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', commit, 'propagator/sdn-ap/src'], { encoding: 'utf8' }).trim().split('\n');
  for (const f of files) { const o = path.join(tree, f); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, execFileSync('git', ['-C', root, 'show', `${commit}:${f}`], { maxBuffer: 1 << 28 })); }
  for (const [file, a, b] of patches) {
    const source = path.join(copy, 'src', file), text = fs.readFileSync(source, 'utf8');
    if (text.split(a).length !== 2) throw new Error(`${name}: ${a.slice(0, 60)} not found once`);
    fs.writeFileSync(source, text.replace(a, b));
  }
  fs.symlinkSync(path.join(pkg, 'node_modules'), path.join(copy, 'node_modules'));
  fs.symlinkSync(path.join(root, 'foundation'), path.join(tree, 'foundation'));
  const env = { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1', SPACE_DATA_NETWORK_MODULES_ROOT: root, SDNAP_DIST_DIR: path.join(tree, 'dist') };
  delete env.SDM_MODULE_SIGNING_KEYPAIR_PATH;
  try { execFileSync(process.execPath, ['build.mjs'], { cwd: copy, stdio: 'ignore', env }); } finally { fs.unlinkSync(path.join(copy, 'node_modules')); fs.unlinkSync(path.join(tree, 'foundation')); }
  return { wasm, key };
}

async function main() {
  const root = args['modules-root'], want = args['modules-commit'];
  if (!root || !want || !args.case) throw new Error('usage: factorial.mjs --case <id> --modules-commit <sha> --modules-root <modules checkout> [...]');
  // the result file names this repository's commit: its working tree must be clean (as claim.mjs and run.mjs), or the run says --scratch
  const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', 'experiments/synthetic-orbits', 'experiments/headline-loop'], { encoding: 'utf8' }).trim();
  if (dirty && !args.scratch) throw new Error(`refused: this repository's working tree differs from its commit (the result file names the commit):\n${dirty}`);
  const harness = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() + (dirty ? '+scratch' : '');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${want}^{commit}`], { encoding: 'utf8' }).trim();
  const version = JSON.parse(execFileSync('git', ['-C', root, 'show', `${commit}:propagator/sdn-ap/package.json`], { encoding: 'utf8' })).version;
  const older = (a, b) => { const p = a.split('.').map((x) => parseInt(x, 10)), q = b.split('.').map((x) => parseInt(x, 10)); for (let k = 0; k < 3; k += 1) if (p[k] !== q[k]) return p[k] < q[k]; return false; };
  if (older(version, FIRST_VERSION)) throw new Error(`refused: modules ${commit.slice(0, 12)} carries sdn-ap ${version}; before ${FIRST_VERSION} AP's field is not EGM2008, the truth's`);
  const L = await libs(root);
  const c = caseOf(args.case, Number(args.seed ?? 498)), dragApplies = c.hpKm < DRAG_BELOW_KM;
  const binary = (args.factors ? args.factors.split(',') : BINARY).filter((f) => f !== 'drag' || dragApplies);
  for (const f of binary) if (!BINARY.includes(f)) throw new Error(`--factors: ${f} is not one of ${BINARY.join(', ')} (the field is always a factor)`);
  const store = path.join(L.A.STORE_ROOT, 'factorial'), out = args.out ?? path.join(store, commit.slice(0, 12), c.id);
  fs.mkdirSync(out, { recursive: true });
  // every cell: the field's three levels by every combination of the binary factors; a factor not listed is on in every cell (the
  // fit held), J2 alone and the all-off cell included, and drag where the perigee is at or above 2,500 km is off in every cell
  const fixed = Object.fromEntries(BINARY.filter((f) => !binary.includes(f)).map((f) => [f, f === 'drag' && !dragApplies ? 0 : 1]));
  const onInEveryCell = Object.entries(fixed).filter(([, v]) => v === 1).map(([f]) => (f === 'fit' ? 'the fit held' : f));
  const cells = FIELD.flatMap((field) => Array.from({ length: 2 ** binary.length }, (_, m) => ({ field, ...fixed, ...Object.fromEntries(binary.map((f, j) => [f, (m >> j) & 1])) })));
  const arms = new Map();
  for (const cl of cells) { const a = armOf(cl, dragApplies), k = JSON.stringify(a); if (!arms.has(k)) arms.set(k, a); }
  const names = [...new Set([...arms.values()].map(buildName))];
  const builds = {};
  for (const n of names) { console.error(`factorial: build ${n}`); builds[n] = build(root, commit, n, store); }
  const committed = sha256(execFileSync('git', ['-C', root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`], { maxBuffer: 1 << 28 }));
  const buildShas = Object.fromEntries(Object.entries(builds).map(([n, b]) => [n, { sha256: sha256(fs.readFileSync(b.wasm)), patchKey: b.key }]));
  const D0 = Date.parse(`${c.cutoff}T00:00:00Z`), tStart = D0 - 3 * DAY;
  const s0 = await startState(L, root, c, tStart);
  const job = { case: c, D0, tStart, s0, root, store, terms: termsOf(c.am), dragApplies };
  // phase 1 the truths (one per truth-side combination), phase 2 AP's arms; each a child process, --jobs at a time
  const runAll = async (items, jobs) => {
    let next = 0; const res = new Array(items.length);
    await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        res[k] = await new Promise((resolve, reject) => {
          const ch = fork(SELF, ['--cell', JSON.stringify(items[k])], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
          let got = null; ch.on('message', (m) => { got = m; }); ch.on('exit', (code) => (code === 0 && got ? resolve(got) : reject(new Error(`cell exited ${code}: ${JSON.stringify(items[k]).slice(0, 200)}`))));
        });
      }
    }));
    return res;
  };
  const jobs = Number(args.jobs ?? 2), truths = [...new Map([...arms.values()].map((a) => [truthKeyOf(a), a])).values()];
  console.error(`factorial: ${c.id} (perigee ${c.hpKm} km, e ${c.e}, i ${c.i}), the field at three levels and ${binary.join(', ')}: ${cells.length} cells, ${arms.size} distinct arms, ${truths.length} truths, ${names.length} builds`);
  const truthResults = await runAll(truths.map((a) => ({ ...job, arm: a, truthOnly: true })), jobs);
  const results = await runAll([...arms.values()].map((a) => ({ ...job, arm: a, wasm: builds[buildName(a)].wasm })), jobs);
  const byArm = new Map([...arms.keys()].map((k, j) => [k, results[j]]));
  const rows = cells.map((cl) => ({ cell: cl, arm: armOf(cl, dragApplies), ...byArm.get(JSON.stringify(armOf(cl, dragApplies))) }));
  const analysis = analyze(rows, binary);
  const record = { case: c, label: labelOf(c), harness, version, modulesCommit: commit, committedDistSha256: committed, builds: buildShas, ffm: truthResults.find((t) => t.ffm)?.ffm ?? null,
    truthSettings: { field: 'EGM2008', tolerance: TOLERANCE, maxStepS: 120, minStepS: 1e-3, weather: WEATHER, relativity: 'IERS_2010 in every cell', stepS: STEP / 1000, from: iso(tStart), states: N },
    fitFactor: '+ held (drag and radiation terms at the truth\'s values, sigma 1e-10), - solved; a term whose component the truth does not have is held at 0 at both levels', field: FIELD_TEXT, factors: ['field', ...binary],
    onInEveryCell, onInEveryCellText: onInEveryCell.length ? `left out of --factors and on in every cell, J2 alone and the all-off cell included: ${onInEveryCell.join(', ')}` : 'every binary factor is a factor',
    dragApplies, dragText: dragApplies ? 'drag a factor (the perigee is under 2,500 km)' : 'no drag in any cell: the perigee is at or above 2,500 km, the truth has no drag, and AP\'s settings name its own Jacchia 1970 atmosphere with the drag term held at 0',
    units: 'main effects, the field\'s steps and the interactions in log10 D (D in m); the Shapley shares, the field\'s split and the one-at-a-time path in m', rows, ...analysis };
  fs.writeFileSync(path.join(out, 'factorial.json'), JSON.stringify(record, null, 1));
  print(record);
  console.error(`factorial: ${path.join(out, 'factorial.json')}`);
}

/** The analysis of log10 D over the table (see the header), refused when a cell has no D. */
function analyze(rows, binary) {
  const failed = rows.filter((r) => !Number.isFinite(r.D));
  if (failed.length) return { analysisRefused: `${failed.length} of ${rows.length} cells have no D: ${[...new Set(failed.map((r) => r.error))].slice(0, 3).join('; ')}` };
  const y = (r) => Math.log10(r.D), mean = (xs) => xs.reduce((s, r) => s + y(r), 0) / xs.length;
  const where = (f) => rows.filter(f), at = (field) => (r) => r.cell.field === field, on = (f, v) => (r) => r.cell[f] === v;
  const main = Object.fromEntries(binary.map((f) => [f, mean(where(on(f, 1))) - mean(where(on(f, 0)))]));
  const STEPS = [['j2', 'zonal'], ['zonal', 'full']], stepName = ([a, b]) => `${FIELD_TEXT[a]} to ${FIELD_TEXT[b]}`;
  const fieldSteps = Object.fromEntries(STEPS.map((s) => [stepName(s), mean(where(at(s[1]))) - mean(where(at(s[0])))]));
  const interactions = {};
  for (let a = 0; a < binary.length; a += 1) for (let b = a + 1; b < binary.length; b += 1) {
    const [p, q] = [binary[a], binary[b]], m = (u, v) => mean(where((r) => r.cell[p] === u && r.cell[q] === v));
    interactions[`${p} x ${q}`] = (m(1, 1) - m(0, 1) - (m(1, 0) - m(0, 0))) / 2;
  }
  for (const s of STEPS) for (const f of binary) {
    const m = (lvl, v) => mean(where((r) => r.cell.field === lvl && r.cell[f] === v));
    interactions[`(${stepName(s)}) x ${f}`] = (m(s[1], 1) - m(s[0], 1) - (m(s[1], 0) - m(s[0], 0))) / 2;
  }
  // Shapley over the players field (off: J2 alone, on: the full field) and the binary components but the fit, at each fit level
  const players = ['field', ...binary.filter((f) => f !== 'fit')], n = players.length, fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
  const levels = binary.includes('fit') ? [1, 0] : [null];
  const cellD = (field, S, level) => rows.find((r) => r.cell.field === field && players.every((p) => p === 'field' || r.cell[p] === (S.has(p) ? 1 : 0)) && (level == null || r.cell.fit === level)).D;
  const shapley = {}, fieldSplit = {}, onePath = {};
  for (const level of levels) {
    const v = (S) => cellD(S.has('field') ? 'full' : 'j2', S, level), key = level == null ? 'any' : level ? 'held' : 'solved';
    const shares = {};
    for (const j of players) {
      let s = 0;
      const others = players.filter((f) => f !== j);
      for (let m = 0; m < 2 ** others.length; m += 1) {
        const S = new Set(others.filter((_, q) => (m >> q) & 1));
        s += ((fact(S.size) * fact(n - S.size - 1)) / fact(n)) * (v(new Set([...S, j])) - v(S));
      }
      shares[j] = s;
    }
    shapley[key] = { allOnM: v(new Set(players)), allOffM: v(new Set()), sharesM: shares };
    const rest = new Set(players.filter((p) => p !== 'field'));
    fieldSplit[key] = Object.fromEntries(FIELD.map((f) => [FIELD_TEXT[f], cellD(f, rest, level)]));
    // the one-at-a-time path: J2 alone with every other component off, then each added in turn
    const path_ = [['J2 alone', cellD('j2', new Set(), level)], ['+ the zonal tail', cellD('zonal', new Set(), level)], ['+ the full field', cellD('full', new Set(), level)]];
    const S = new Set();
    for (const p of ['moon', 'sun', 'radiation', 'drag', 'tide'].filter((x) => players.includes(x))) { S.add(p); path_.push([`+ ${p}`, cellD('full', S, level)]); }
    onePath[key] = path_;
  }
  return { mainEffectsLog10D: main, fieldStepsLog10D: fieldSteps, interactionsLog10D: interactions, shapley, fieldSplitM: fieldSplit, onePathM: onePath };
}

function print(r) {
  const f = (x) => (!Number.isFinite(x) ? 'no D' : x >= 1000 ? `${(x / 1000).toFixed(2)} km` : `${x.toFixed(1)} m`);
  console.log(`${r.case.id}${r.case.name ? ` (${r.label})` : ''}: perigee ${r.case.hpKm} km, e ${r.case.e}, i ${r.case.i}, cutoff ${r.case.cutoff}; ${r.rows.length} cells (factors ${r.factors.join(', ')}; ${r.onInEveryCellText}; ${r.dragText})`);
  console.log(`  sdn-ap ${r.version} at modules ${r.modulesCommit.slice(0, 12)}; this repository at ${r.harness}`);
  console.log(`  builds: ${Object.entries(r.builds).map(([n, b]) => `${n} ${b.sha256.slice(0, 12)}`).join(', ')}; the committed dist ${r.committedDistSha256.slice(0, 12)}${r.builds.base ? (r.builds.base.sha256 === r.committedDistSha256 ? ' (the base build is the committed dist)' : ' (the base build differs from the committed dist)') : ''}`);
  console.log(`  truth: FFM ${r.ffm?.ffm?.version ?? '?'} (${r.ffm?.ffm?.sha256?.slice(0, 12) ?? '?'}), EGM2008, tolerance ${r.truthSettings.tolerance}, constant weather F10.7 ${WEATHER.f107} Ap ${WEATHER.ap}, relativity in every cell; fit factor: ${r.fitFactor}`);
  // a cell's label: its field level, each listed factor's level, and what is on in every cell
  const every = r.onInEveryCell.length ? ` (in every cell: ${r.onInEveryCell.join(', ')})` : '';
  const label = (row) => [FIELD_TEXT[row.cell.field], ...r.factors.filter((x) => x !== 'field').map((x) => (x === 'fit' ? (row.cell.fit ? 'held' : 'solved') : row.cell[x] ? x : `-${x}`))].join(' ') + every;
  for (const row of r.rows) console.log(`  ${label(row)}: ${Number.isFinite(row.D) ? `D ${f(row.D)} at ${row.at.h} h (R ${row.at.r}, T ${row.at.t}, N ${row.at.n} m)` : `no D: ${row.error}`}`);
  if (r.analysisRefused) { console.log(`  ${r.analysisRefused}`); return; }
  console.log('  main effects, log10 D:', Object.entries(r.mainEffectsLog10D).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '));
  console.log('  the field\'s steps, log10 D:', Object.entries(r.fieldStepsLog10D).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '));
  console.log(`  interactions, log10 D (the eight largest of ${Object.keys(r.interactionsLog10D).length}; all in the result file):`, Object.entries(r.interactionsLog10D).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '));
  for (const [lvl, s] of Object.entries(r.shapley)) {
    console.log(`  Shapley (fit ${lvl}), in m: all on ${f(s.allOnM)}, all off${every} ${f(s.allOffM)};`, Object.entries(s.sharesM).map(([k, v]) => `${k} ${v.toFixed(1)} m`).join(', '));
    console.log(`    the field's split, every other component on: ${Object.entries(r.fieldSplitM[lvl]).map(([k, v]) => `${k} ${f(v)}`).join(', ')}`);
    console.log(`    the one-at-a-time path${every}: ${r.onePathM[lvl].map(([k, v]) => `${k} ${f(v)}`).join(', ')}`);
  }
}

/** One child: a truth (cached by the hash of the numerical propagator's build and everything the flight depends on), or one AP arm
 *  against it. */
async function cell(job) {
  const L = await libs(job.root), S = L.S, a = job.arm, c = job.case, { D0, tStart } = job;
  const cd = job.terms.dragAreaOverMass, cr = job.terms.srpAreaOverMass;
  const noD = (error) => { process.send({ D: Infinity, at: { h: null, r: null, t: null, n: null }, error }); process.exit(0); };
  const days = (from, to) => Array.from({ length: Math.round((to - from) / DAY) + 1 }, (_, k) => iso(from + k * DAY).slice(0, 10));
  // the truth: FFM 2.2.0 (headline-loop/lib/ffm.mjs, pinned with its kernel and Earth orientation, as run.mjs flies it)
  const { openFfm } = await import('../headline-loop/lib/ffm.mjs');
  const F = await openFfm();
  const LEVEL = { j2: [2, 0], zonal: [20, 0], full: [70, 70] }[a.field];
  const settings = { forces: { degree: LEVEL[0], order: LEVEL[1], thirdBodies: [...(a.sun ? [10] : []), ...(a.moon ? [301] : [])], srp: a.radiation, drag: a.drag, atmosphere: 'NRLMSISE00', solidTides: a.tide, relativity: 'IERS_2010' },
    integrator: { tolerance: TOLERANCE, maxStep: 120, minStep: 1e-3 }, fixed: {} };
  const parameters = [...(a.drag ? [{ kind: 'DRAG_AREA_OVER_MASS', value: cd }] : []), ...(a.radiation ? [{ kind: 'SRP_AREA_OVER_MASS', value: cr }] : [])];
  const weather = days(tStart - 3 * DAY, D0 + 9 * DAY).map((d) => ({ DATE: d, F107_OBS: WEATHER.f107, F107_OBS_CENTER81: WEATHER.c81, AP_AVG: WEATHER.ap }));
  const epochs = Array.from({ length: N }, (_, k) => iso(tStart + k * STEP));
  const key = sha256(JSON.stringify({ v: TRUTH_V, ffm: F.provenance, start: job.s0, from: epochs[0], stepS: STEP / 1000, count: N, settings, parameters, weather: a.drag ? weather : null }));
  const dir = path.join(job.store, 'truth'), file = path.join(dir, `${key}.json`);
  fs.mkdirSync(dir, { recursive: true });
  let truth;
  if (fs.existsSync(file)) truth = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    try { truth = (await F.forecast({ epoch: epochs[0], state: job.s0.map((x) => x * 1000), parameters }, epochs, settings, a.drag ? weather : null)).map((s) => [...s.r, ...s.v]); }
    catch (e) { await F.close(); noD(`the numerical flight failed: ${String(e?.message ?? e).slice(0, 200)}`); }
    if (truth.length === N) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(truth)); fs.renameSync(tmp, file); }
  }
  const ffm = F.provenance;
  await F.close();
  if (truth.length !== N) noD(`the truth ends at ${(((truth.length - 1 - NA) * STEP) / HOUR).toFixed(2)} h after the cutoff (${truth.length} of ${N} states)`);
  if (job.truthOnly) { process.send({ truth: path.basename(file), ffm }); process.exit(0); }
  // AP: fitted over the forecast span (D0 to D0 + 120 h, 1,441 states), flown over the same states
  const span = truth.slice(NA, NA + NB + 1).map((s, k) => ({ epoch: iso(D0 + k * STEP), r: s.slice(0, 3), v: s.slice(3) }));
  const oem = S.oemBytes({ frame: 'GCRF', object: { name: 'SYNTHETIC', id: '', norad: 99498 }, lines: span, useableStart: span[0].epoch, useableStop: span.at(-1).epoch });
  const forces = { ...L.APL.apForces({ tesseral: a.field === 'full' ? 31 : 0, zonal: a.field === 'j2' ? 5 : 20, atmosphere: a.drag }), ...(a.tide ? { SOLID_TIDES: 1 } : {}) };
  const held = (mean) => ({ mean, sigma: 1e-10, form: 'GAUSSIAN_SIGNED' });
  // a term whose component the truth does not have is held at 0 at both fit levels: the drag term wherever drag is off, the
  // perigee at or above 2,500 km included (AP's settings name its Jacchia 1970 atmosphere there), and the radiation term
  const fit = {
    ...(a.drag ? (a.fit === 'held' ? { dragPrior: held(cd) } : {}) : { dragPrior: held(0) }),
    ...(a.radiation ? (a.fit === 'held' ? { srpPrior: held(cr) } : {}) : { srpPrior: held(0) }),
  };
  const pcf = L.APL.fitPcf({ forces, fit: Object.keys(fit).length ? fit : null });
  // AP's weather: the same constant rows, through the record's horizon (31 days past the arc's end)
  const spw = a.drag ? L.APL.fitWeather(days(tStart - 3 * DAY, L.APL.horizonOf(D0 + 120 * HOUR)).map((d) => ({ date: d, f107: WEATHER.f107, c81: WEATHER.c81, ap: WEATHER.ap })), L.APL.horizonOf(D0 + 120 * HOUR)) : null;
  const h = await L.createStandaloneHarness('browser', job.wasm, { surface: 'direct' });
  const call = async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r; };
  let ocm;
  try { ocm = new Uint8Array((await call('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])])).outputs.find((o) => o.portId === 'elements').payload); }
  catch (e) { noD(`AP's fit refused: ${String(e?.message ?? e).slice(0, 200)}`); }
  let flown;
  try { flown = statesOf(S, await call('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(S, span.map((l) => l.epoch)) }])); }
  catch (e) { noD(`AP's flight failed: ${String(e?.message ?? e).slice(0, 200)}`); }
  await h.close?.();
  if (flown.length !== span.length) noD(`AP's flight returned ${flown.length} of ${span.length} states`);
  const unit = (v) => { const q = Math.hypot(...v); return v.map((x) => x / q); }, cross = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  let D = -1, at = null;
  for (let k = 0; k < span.length; k += 1) {
    const s = span[k], fl = flown[k], err = [fl.r[0] - s.r[0], fl.r[1] - s.r[1], fl.r[2] - s.r[2]], d = 1000 * Math.hypot(...err);
    if (!Number.isFinite(d)) noD(`a distance is not finite at ${((k * STEP) / HOUR).toFixed(2)} h`);
    if (d > D) { const rh = unit(s.r), ch = unit(cross(s.r, s.v)), ih = cross(ch, rh), dot = (u) => +(1000 * err.reduce((t, x, i) => t + x * u[i], 0)).toFixed(1); D = d; at = { h: +((k * STEP) / HOUR).toFixed(2), r: dot(rh), t: dot(ih), n: dot(ch) }; }
  }
  const fitted = L.APL.readOcm(ocm);
  process.send({ D: +D.toFixed(2), at, fitRmsM: Number.isFinite(fitted.fitRmsKm) ? +(fitted.fitRmsKm * 1000).toFixed(2) : null, fitB: fitted.bterm ?? null, fitAgom: fitted.agom ?? null });
  process.exit(0);
}

if (args.cell) await cell(JSON.parse(args.cell));
else await main();
