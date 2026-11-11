// The factorial attribution (stack #505, Tier 3): for one case, every on/off combination of the listed force components, each set the
// same way on both sides (the numerical propagator's truth and AP), with AP's record fitted over the forecast span (the truth's own 0 to
// 120 h after the cutoff, the best record the theory can make) and, as one more factor, the drag and radiation terms held at the truth's
// values or solved. Switching forces off one at a time walks a single path through these combinations and credits an interaction to
// whichever force is removed first; the full table gives every main effect, every two-factor interaction and each component's Shapley
// share.
//
// The components, and how each is set on each side (as the elimination flights of stack #497 set them):
//   zonal     the zonal field above J2.  Truth: EGM96 to degree 20 (order 0), or J2 alone.  AP: MAXIMUM_DEGREE 20 and its J3 to J5, or a
//             build with J3, J4 and J5 zero and MAXIMUM_DEGREE 5 (no zonal tail).
//   tesseral  the tesseral and sectoral terms.  Truth: EGM96 70 x 70, or the zonals alone.  AP: MAXIMUM_TESSERAL_DEGREE 31, or 0 with a
//             build that flies no resonance-class terms (with the cap at 0, AP still flies the theory's resonance-class terms, which a
//             zonal truth lacks).  Nested in zonal: with the zonal field off both sides are J2 alone, so a combination with zonal off and
//             tesseral on is the same flight as zonal and tesseral off (the truth cannot fly J2 with tesserals).
//   moon, sun the Moon's and the Sun's attraction.  Truth: the body in its third-body list.  AP: a build with that body's mass zero.
//   radiation the truth's cannonball radiation pressure (C_R A/m = the case's term).  AP: its radiation term (held: at the truth's value,
//             or at 0 with the component off).
//   drag      only where the perigee is under 2,500 km.  Truth: drag on NRLMSISE-00 (C_D A/m = the case's term).  AP: its drag term
//             (held: at the truth's value, or at 0 off).  Both sides see constant weather (F10.7 150, Ap 15).
//   tide      the solid Earth tide.  Truth: IERS 2010 solid tides and the IERS 2010 relativity terms.  AP: SOLID_TIDES.
//   fit       held: the drag and radiation terms held at the values above (sigma 1e-10); solved: the call's default priors.
// The truth: FFM from the state at the cutoff - 72 h (the commit's own build flying the case's mean elements, as run.mjs makes it), on a
// 300 s grid to 120 h past the cutoff; DE440s, constant Earth orientation (TAI - UTC 37 s); RK78, tolerance 1e-11, steps 1e-3 to 120 s.
// AP's builds are built unsigned from the commit's sources, every arm alike, the full arm included (its sha is printed beside the
// committed dist's). D: the largest 3D distance to the truth over the 1,440 states after the cutoff; with it the signed radial,
// along-track and cross-track differences at that time.
//
//   node experiments/synthetic-orbits/factorial.mjs --case <id> --modules-commit <sha> --modules-root <modules checkout>
//     [--factors zonal,tesseral,moon,sun,radiation,drag,tide,fit] [--jobs 6] [--seed 498] [--out <dir>]
//   <id>: a case of cases.mjs (seed --seed), or of the claim set (claim-<seed>-b<band>-<k>)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cases as makeCases, termsOf } from './cases.mjs';
import { draw } from './claim.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = fileURLToPath(import.meta.url);
const ALL = ['zonal', 'tesseral', 'moon', 'sun', 'radiation', 'drag', 'tide', 'fit'];
const DAY = 864e5, STEP = 300e3, N = (8 * DAY) / STEP + 1, NA = (3 * DAY) / STEP, DRAG_BELOW_KM = 2500;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const jdUtc = (ms) => 2440587.5 + ms / DAY;
const PATCHES = {
  j2: [['xp_theory.inc', 'constexpr double kJ3 = -2.53265648533224e-6;', 'constexpr double kJ3 = 0.0;'], ['xp_theory.inc', 'constexpr double kJ4 = -1.619621591367e-6;', 'constexpr double kJ4 = 0.0;'], ['xp_theory.inc', 'constexpr double kJ5 = -2.27296082868698e-7;', 'constexpr double kJ5 = 0.0;']],
  nores: [['xp_theory.inc', 's.ctx.res_count = res::current_terms(res, e.eo, std::sin(e.xincl), std::cos(e.xincl), rc);', 's.ctx.res_count = res::current_terms(res, e.eo, std::sin(e.xincl), std::cos(e.xincl), rc); s.ctx.res_count = 0;']],
  nosun: [['xp_theory.inc', 'constexpr double kSunMass = 332946.038;', 'constexpr double kSunMass = 0.0;']],
  nomoon: [['xp_theory.inc', 'constexpr double kMoonMass = 0.012300034;', 'constexpr double kMoonMass = 0.0;']],
};

/** The case by id: cases.mjs's list, or a claim-set draw. */
function caseOf(id, seed) {
  const m = /^claim-(\d+)-b(\d+)-(\d+)$/.exec(id);
  if (m) return draw(Number(m[1]), Number(m[2]), Number(m[3]) + 1)[Number(m[3])];
  const c = makeCases(seed).cases.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id} (seed ${seed})`);
  return c;
}
/** The arm's on/off settings from a cell (factor -> 0/1), the nesting applied: zonal off means J2 alone on both sides. */
const armOf = (cell, dragApplies) => {
  const on = (f) => (cell[f] ?? 1) === 1;
  const grav = !on('zonal') ? 'j2' : on('tesseral') ? 'full' : 'zonal';
  return { grav, moon: on('moon'), sun: on('sun'), radiation: on('radiation'), drag: dragApplies && on('drag'), tide: on('tide'), fit: (cell.fit ?? 1) === 1 ? 'held' : 'solved' };
};
const buildName = (a) => [a.grav === 'j2' ? 'j2-nores' : a.grav === 'zonal' ? 'nores' : 'base', a.sun ? null : 'nosun', a.moon ? null : 'nomoon'].filter(Boolean).join('-');
const truthKey = (a) => JSON.stringify({ grav: a.grav, moon: a.moon, sun: a.sun, radiation: a.radiation, drag: a.drag, tide: a.tide });

async function libs(root) {
  const lib = (f) => import(pathToFileURL(path.join(root, 'propagator/sdn-ap/test/lib', f)).href);
  const req = createRequire(path.join(root, 'propagator/sdn-ap/package.json'));
  const imp = (s) => import(pathToFileURL(req.resolve(s)).href);
  return { O: await lib('ocm.mjs'), P: await lib('pcf.mjs'), Fr: await lib('frames.mjs'), Spw: await lib('spw-constant.mjs'), T: await lib('ffm-truth.mjs'),
    C: await import(pathToFileURL(path.join(root, 'propagator/ffm/tests/lib/prwCodec.mjs')).href), sdk: await imp('space-data-module-sdk/testing/isomorphic'),
    fb: await imp('flatbuffers'), OEM: await imp('spacedatastandards.org/lib/js/OEM/OEM.js'), CAT: await imp('spacedatastandards.org/lib/js/OEM/CAT.js'),
    Block: await imp('spacedatastandards.org/lib/js/OEM/ephemerisDataBlock.js'), Line: await imp('spacedatastandards.org/lib/js/OEM/ephemerisDataLine.js'),
    TS: await imp('spacedatastandards.org/lib/js/OEM/timingStandard.js'), Atm: await imp('spacedatastandards.org/lib/js/PCF/pcfAtmosphereFamily.js'),
    Wx: await imp('spacedatastandards.org/lib/js/PCF/pcfWeatherSource.js'), Out: await imp('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js') };
}
const harnessOf = async (L, wasm) => {
  const h = await L.sdk.createStandaloneHarness('browser', wasm, { surface: 'command' });
  return { h, call: async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode} ${String(r.errorMessage).slice(0, 200)}`); return r.outputs; } };
};
const linesOf = (L, out) => L.OEM.OEM.getRootAsOEM(new L.fb.ByteBuffer(out.find((v) => v.portId === 'ephemeris').payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;

/** An AP build of the commit's sources with the named patches, built unsigned once into <store>/factorial/builds. */
function build(root, commit, name, store) {
  const tree = path.join(store, 'builds', `${commit.slice(0, 12)}-${name}`), wasm = path.join(tree, 'dist/isomorphic/module.wasm');
  if (fs.existsSync(wasm)) return wasm;
  const pkg = path.join(root, 'propagator/sdn-ap'), copy = path.join(tree, 'propagator/sdn-ap');
  fs.rmSync(tree, { recursive: true, force: true });
  fs.cpSync(pkg, copy, { recursive: true, filter: (p) => { const rel = p.slice(pkg.length); return !/\/(node_modules|test|dist)(\/|$)/.test(rel) && !/^\/src(\/|$)/.test(rel); } });
  const files = execFileSync('git', ['-C', root, 'ls-tree', '-r', '--name-only', commit, 'propagator/sdn-ap/src'], { encoding: 'utf8' }).trim().split('\n');
  for (const f of files) { const o = path.join(tree, f); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, execFileSync('git', ['-C', root, 'show', `${commit}:${f}`], { maxBuffer: 1 << 28 })); }
  for (const part of name.split('-').filter((p) => p !== 'base')) for (const [file, a, b] of PATCHES[part === 'j2' ? 'j2' : part]) {
    const source = path.join(copy, 'src', file), text = fs.readFileSync(source, 'utf8');
    if (text.split(a).length !== 2) throw new Error(`${name}: ${a.slice(0, 60)} not found once`);
    fs.writeFileSync(source, text.replace(a, b));
  }
  fs.symlinkSync(path.join(pkg, 'node_modules'), path.join(copy, 'node_modules'));
  fs.symlinkSync(path.join(root, 'foundation'), path.join(tree, 'foundation'));
  const env = { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1', SPACE_DATA_NETWORK_MODULES_ROOT: root, SDNAP_DIST_DIR: path.join(tree, 'dist') };
  delete env.SDM_MODULE_SIGNING_KEYPAIR_PATH;
  try { execFileSync(process.execPath, ['build.mjs'], { cwd: copy, stdio: 'ignore', env }); } finally { fs.unlinkSync(path.join(copy, 'node_modules')); fs.unlinkSync(path.join(tree, 'foundation')); }
  return wasm;
}

async function main() {
  const root = args['modules-root'], want = args['modules-commit'];
  if (!root || !want || !args.case) throw new Error('usage: factorial.mjs --case <id> --modules-commit <sha> --modules-root <modules checkout> [...]');
  process.env.SDN_MODULES_ROOT ??= root;
  const A = await import('../headline-loop/lib/arms.mjs');
  const commit = execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${want}^{commit}`], { encoding: 'utf8' }).trim();
  const c = caseOf(args.case, Number(args.seed ?? 498)), dragApplies = c.hpKm < DRAG_BELOW_KM;
  const factors = (args.factors ? args.factors.split(',') : ALL).filter((f) => f !== 'drag' || dragApplies);
  for (const f of factors) if (!ALL.includes(f)) throw new Error(`--factors: ${f} is not one of ${ALL.join(', ')}`);
  const store = path.join(A.STORE_ROOT, 'factorial'), out = args.out ?? path.join(store, commit.slice(0, 12), c.id);
  fs.mkdirSync(out, { recursive: true });
  const cells = Array.from({ length: 2 ** factors.length }, (_, m) => Object.fromEntries(factors.map((f, j) => [f, (m >> j) & 1])));
  const arms = new Map();
  for (const cl of cells) { const a = armOf(cl, dragApplies), k = JSON.stringify(a); if (!arms.has(k)) arms.set(k, a); }
  // the builds every arm needs, then the seed state from the full arm's build
  const builds = Object.fromEntries([...new Set([...arms.values()].map(buildName))].map((n) => [n, null]));
  for (const n of Object.keys(builds)) { console.error(`factorial: build ${n}`); builds[n] = build(root, commit, n, store); }
  const committed = sha256(execFileSync('git', ['-C', root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`], { maxBuffer: 1 << 28 }));
  const L = await libs(root), D0 = Date.parse(`${c.cutoff}T00:00:00Z`), tStart = D0 - 3 * DAY;
  const base = await harnessOf(L, builds.base ?? build(root, commit, 'base', store));
  const seed = L.O.seedOcm({ epoch: iso(tStart), n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, norad: 99498, tesseral: 31, zonal: 20 });
  const [s0] = linesOf(L, await base.call('propagate', L.O.flight([seed], { output: { EPOCHS: [iso(tStart)], FRAME: L.Out.pcfOutputFrame.GCRF } })));
  await base.h.close?.();
  const job = { case: c, D0, tStart, s0: [s0.X, s0.Y, s0.Z, s0.X_DOT, s0.Y_DOT, s0.Z_DOT], root, store, terms: termsOf(c.am) };
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
  const jobs = Number(args.jobs ?? 6), truths = [...new Map([...arms.values()].map((a) => [truthKey(a), a])).values()];
  console.error(`factorial: ${c.id} (perigee ${c.hpKm} km, e ${c.e}, i ${c.i}), factors ${factors.join(', ')}: ${cells.length} cells, ${arms.size} distinct arms, ${truths.length} truths, ${Object.keys(builds).length} builds`);
  await runAll(truths.map((a) => ({ ...job, arm: a, truthOnly: true })), jobs);
  const results = await runAll([...arms.values()].map((a) => ({ ...job, arm: a, wasm: builds[buildName(a)] })), jobs);
  const byArm = new Map([...arms.keys()].map((k, j) => [k, results[j]]));
  const rows = cells.map((cl) => ({ cell: cl, arm: armOf(cl, dragApplies), ...byArm.get(JSON.stringify(armOf(cl, dragApplies))) }));
  const analysis = analyse(rows, factors);
  const record = { case: c, modulesCommit: commit, committedDistSha256: committed, builds: Object.fromEntries(Object.entries(builds).map(([n, w]) => [n, sha256(fs.readFileSync(w))])),
    ffmSha256: sha256(fs.readFileSync(L.T.ffmPath)), factors, dragApplies, rows, ...analysis };
  fs.writeFileSync(path.join(out, 'factorial.json'), JSON.stringify(record, null, 1));
  print(record);
  console.error(`factorial: ${path.join(out, 'factorial.json')}`);
}

/** Main effects and two-factor interactions of log10 D (+1/-1 contrasts over the full table), and each force component's Shapley share. */
function analyse(rows, factors) {
  const refused = rows.filter((r) => !Number.isFinite(r.D));
  if (refused.length) return { analysisRefused: `${refused.length} of ${rows.length} cells have no record (a refused fit): ${refused.slice(0, 3).map((r) => r.error).join('; ')}` };
  const y = rows.map((r) => Math.log10(r.D)), sgn = (r, f) => (r.cell[f] ? 1 : -1), half = rows.length / 2;
  const effect = (fs_) => rows.reduce((s, r, k) => s + fs_.reduce((p, f) => p * sgn(r, f), 1) * y[k], 0) / half;
  const main = Object.fromEntries(factors.map((f) => [f, effect([f])]));
  const pairs = {};
  for (let a = 0; a < factors.length; a += 1) for (let b = a + 1; b < factors.length; b += 1) pairs[`${factors[a]} x ${factors[b]}`] = effect([factors[a], factors[b]]);
  // Shapley over the force components (fit fixed at each of its levels): v(S) = D with exactly the components in S on
  const comps = factors.filter((f) => f !== 'fit'), n = comps.length, fact = (k) => (k <= 1 ? 1 : k * fact(k - 1));
  const shapley = {};
  for (const level of factors.includes('fit') ? [1, 0] : [null]) {
    const v = (S) => rows.find((r) => comps.every((f) => r.cell[f] === (S.has(f) ? 1 : 0)) && (level == null || r.cell.fit === level)).D;
    const out = {};
    for (const j of comps) {
      let s = 0;
      const others = comps.filter((f) => f !== j);
      for (let m = 0; m < 2 ** others.length; m += 1) {
        const S = new Set(others.filter((_, q) => (m >> q) & 1));
        const w = (fact(S.size) * fact(n - S.size - 1)) / fact(n);
        s += w * (v(new Set([...S, j])) - v(S));
      }
      out[j] = s;
    }
    const all = v(new Set(comps)), none = v(new Set());
    shapley[level == null ? 'any' : level ? 'held' : 'solved'] = { allOnM: all, allOffM: none, sharesM: out };
  }
  return { mainEffectsLog10D: main, interactionsLog10D: pairs, shapley };
}

function print(r) {
  const f = (x) => (x >= 1000 ? `${(x / 1000).toFixed(2)} km` : `${x.toFixed(1)} m`);
  console.log(`${r.case.id}: perigee ${r.case.hpKm} km, e ${r.case.e}, i ${r.case.i}, cutoff ${r.case.cutoff}; ${r.rows.length} cells (factors ${r.factors.join(', ')})`);
  const label = (row) => r.factors.map((x) => (x === 'fit' ? (row.cell.fit ? 'held' : 'solved') : row.cell[x] ? x : `-${x}`)).join(' ');
  for (const row of r.rows) console.log(`  ${label(row)}:${Number.isFinite(row.D) ? `D ${f(row.D)} at ${row.at.h} h (R ${row.at.r}, T ${row.at.t}, N ${row.at.n} m)` : `no record: ${row.error}`}`);
  if (r.analysisRefused) { console.log(`  ${r.analysisRefused}`); return; }
  console.log('  main effects, log10 D:', Object.entries(r.mainEffectsLog10D).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '));
  console.log('  interactions, log10 D:', Object.entries(r.interactionsLog10D).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', '));
  for (const [lvl, s] of Object.entries(r.shapley)) console.log(`  Shapley (fit ${lvl}): all on ${f(s.allOnM)}, all off ${f(s.allOffM)};`, Object.entries(s.sharesM).map(([k, v]) => `${k} ${v.toFixed(1)} m`).join(', '));
}

/** One child: a truth (cached by the hash of FFM's build and every byte of the request), or one AP arm against it. */
async function cell(job) {
  const L = await libs(job.root), a = job.arm, c = job.case, { D0, tStart } = job;
  const kernel = fs.readFileSync('/opt/data/sdn-archive/operator-ephemerides/_capture/de440s.bsp');
  const cd = job.terms.dragAreaOverMass, cr = job.terms.srpAreaOverMass;
  const FIELD = { zonal: [20, 0], full: [70, 70] };
  const grav = a.grav === 'j2' ? { gravityMode: 'J2' } : { gravityMode: 'EGM96', maxDegree: FIELD[a.grav][0], maxOrder: FIELD[a.grav][1] };
  const params = { epochJD: jdUtc(tStart), epochTimeScale: 'UTC', targetJD: jdUtc(tStart + (N - 1) * STEP), targetTimeScale: 'UTC',
    position: job.s0.slice(0, 3), velocity: job.s0.slice(3), frame: 'GCRF', sampleEpochsJD: Array.from({ length: N }, (_, k) => ({ jd: jdUtc(tStart + k * STEP), scale: 'UTC' })),
    forces: { ...grav, thirdBody: a.sun || a.moon, thirdBodySun: a.sun, thirdBodyMoon: a.moon, srp: a.radiation, drag: a.drag, massKg: 1, areaM2: 1, cr, cd },
    weather: { epochUTCJD: jdUtc(tStart), F107: 150, F107a: 150, Ap: 15, Kp: 3 }, integrator: { tolerance: 1e-11, minStep: 1e-3, maxStep: 120, maxSteps: 2000000 }, ephemerisSource: 'JPL_SPK' };
  const exec = L.C.execution(params, true);
  if (a.tide) { exec.FORCES.SOLID_TIDES = L.C.sds.pcfSolidTideModel.IERS_2010; exec.FORCES.RELATIVITY = L.C.sds.pcfRelativityTerms.IERS_2010; }
  const startMjd = Math.floor(jdUtc(tStart) - 2400000.5) - 2;
  const req = { methodId: 'invoke', inputs: [{ portId: 'request', typeRef: L.C.TYPE, payload: L.C.encodePrw('EXECUTION_REQUEST', exec) }, { portId: 'kernel', typeRef: L.C.TYPE, payload: L.C.nativeInput(kernel) },
    { portId: 'earth_orientation', typeRef: L.C.TYPE, payload: L.C.encodePrw('EARTH_ORIENTATION', L.C.makeTable('PRWEarthOrientation', { ROWS: Array.from({ length: 14 }, (_, k) => L.C.makeTable('EOP', { DATE: new Date((startMjd + k - 40587) * DAY).toISOString(), MJD: startMjd + k, TAI_MINUS_UTC_SECONDS: 37 })) })) }] };
  const hash = crypto.createHash('sha256').update(fs.readFileSync(L.T.ffmPath));
  for (const i of req.inputs) hash.update(i.portId).update(Buffer.from(i.payload));
  const dir = path.join(job.store, 'truth'), file = path.join(dir, `${hash.digest('hex')}.json`);
  fs.mkdirSync(dir, { recursive: true });
  let truth;
  if (fs.existsSync(file)) truth = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const hf = await L.sdk.createStandaloneHarness('browser', L.T.ffmPath, { surface: 'command' });
    const r = await hf.invoke(req);
    if (r.statusCode !== 0) throw new Error(`FFM ${r.errorCode}: ${r.errorMessage}`);
    truth = L.C.decodeResult(r).samples.map((s) => [...s.position, ...s.velocity]);
    const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(truth)); fs.renameSync(tmp, file);
    await hf.close?.();
  }
  if (truth.length !== N) throw new Error(`truth ${truth.length} samples against ${N}`);
  if (job.truthOnly) { process.send({ truth: path.basename(file) }); process.exit(0); }
  // AP: fitted over the forecast span (D0 to D0 + 120 h), flown over the same 1,440 states
  const lines = truth.slice(NA).map((s, k) => Object.assign(new L.Line.ephemerisDataLineT(), { EPOCH: iso(D0 + k * STEP), X: s[0], Y: s[1], Z: s[2], X_DOT: s[3], Y_DOT: s[4], Z_DOT: s[5] }));
  const blk = Object.assign(new L.Block.ephemerisDataBlockT(), { OBJECT: Object.assign(new L.CAT.CATT(), { NORAD_CAT_ID: 99498, OBJECT_NAME: 'SYNTHETIC' }), CENTER_NAME: 'EARTH', REFERENCE_FRAME: L.Fr.rfm('GCRF'),
    TIME_SYSTEM: L.TS.timingStandard.UTC, START_TIME: lines[0].EPOCH, STOP_TIME: lines.at(-1).EPOCH, EPHEMERIS_DATA_LINES: lines, USEABLE_START_TIME: lines[0].EPOCH, USEABLE_STOP_TIME: lines.at(-1).EPOCH });
  const oem = L.Fr.packOem(Object.assign(new L.OEM.OEMT(), { EPHEMERIS_DATA_BLOCK: [blk] }));
  const forces = { EPHEMERIS_SOURCE: '', HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: a.grav === 'full' ? 31 : 0, HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: a.grav === 'j2' ? 5 : 20,
    ATMOSPHERE_MODEL: L.Atm.pcfAtmosphereFamily.NRLMSISE00, WEATHER_SOURCE: L.Wx.pcfWeatherSource.RECORDS, ...(a.tide ? { SOLID_TIDES: 1 } : {}) };
  const cfg = L.P.configuration({ forces, ...(a.fit === 'held' ? { fit: { DRAG_PRIOR: L.P.prior(a.drag ? cd : 0, 1e-10), DRAG_PRIOR_FORM: L.P.pcfPriorForm.GAUSSIAN_SIGNED, SRP_PRIOR: L.P.prior(a.radiation ? cr : 0, 1e-10) } } : {}) });
  const rows = L.O.rowsThrough(JSON.parse(L.Spw.spwConstantText(c.cutoff, 45)));
  const ap = await harnessOf(L, job.wasm);
  const T2 = (n) => ({ schemaName: `${n}.fbs`, fileIdentifier: `$${n}`, rootTypeName: n });
  let omm;
  try { omm = (await ap.call('fit', [cfg, { portId: 'space_weather', typeRef: T2('SPW'), payload: L.O.spwStream(rows) }, { portId: 'ephemeris', typeRef: T2('OEM'), payload: oem }])).find((v) => v.portId === 'elements').payload; }
  catch (e) { process.send({ D: Infinity, at: { h: null, r: null, t: null, n: null }, error: String(e?.message ?? e).slice(0, 200) }); process.exit(0); }
  const flown = linesOf(L, await ap.call('propagate', L.O.flight([omm], { output: { EPOCHS: Array.from({ length: N - 1 - NA }, (_, k) => iso(D0 + (k + 1) * STEP)), FRAME: L.Out.pcfOutputFrame.GCRF } })));
  await ap.h.close?.();
  const unit = (v) => { const q = Math.hypot(...v); return v.map((x) => x / q); }, cross = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  let D = 0, at = null;
  flown.forEach((fl, k) => {
    const s = truth[NA + 1 + k], err = [fl.X - s[0], fl.Y - s[1], fl.Z - s[2]], d = 1000 * Math.hypot(...err);
    if (d > D) { const rh = unit(s.slice(0, 3)), ch = unit(cross(s.slice(0, 3), s.slice(3))), ih = cross(ch, rh), dot = (u) => +(1000 * err.reduce((t, x, i) => t + x * u[i], 0)).toFixed(1); D = d; at = { h: +(((k + 1) * STEP) / 36e5).toFixed(2), r: dot(rh), t: dot(ih), n: dot(ch) }; }
  });
  const fitted = L.O.fittedOf(omm);
  process.send({ D: +D.toFixed(2), at, fitWrmsM: +(fitted.wrms * 1000).toFixed(2), fitB: fitted.bterm, fitAgom: fitted.agom });
  process.exit(0);
}

if (args.cell) await cell(JSON.parse(args.cell));
else await main();
