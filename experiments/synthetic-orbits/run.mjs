// Synthetic orbits over the whole orbit regime, each scored against the numerical propagator (stack #498). For every case of cases.mjs
// (seeded): the module makes the state at D0 - 72 h from the case's mean elements; the numerical propagator (FFM 2.2.0) flies it through
// the 72 h fit arc and 7 days past it on a 300 s grid, and that flight is the truth; AP and our SGP4-XP (the same module) are fitted to
// the truth before the cutoff D0 and flown; both see the same space weather (the weather known at the cutoff, on the truth too). Scored:
// D, the largest 3D distance to the truth over 0 to 120 h on the 300 s grid, with the hour it occurs and the first hour the distance
// passes 100 m (the owner's bar, 2026-11-11: "never more than 100m between 0-5 days"; pass: D <= 100 m); the same largest distance over
// 120 h to 7 days (pastBar: a record used past its 5 days, reported, not a criterion); the fit's and the truth's wall time; the root mean square of the 3D
// distance over the 24 h ending at each day 1 to 7; AP against SGP4-XP; and with --cost each one's cost per state (a warm set flown 7 days
// at 300 s, the median of three timed flights). Nothing here is any real satellite's data.
//
// Force switches, on both sides at once (the truth and AP; SGP4-XP is flown as it is), each stored apart from the full rows:
//   --no-drag                   the truth without drag; AP without its atmosphere
//   --no-drag --no-radiation    gravity, the solid tide, relativity and the Sun and Moon only; AP with its radiation term held at 0
// --guard flies a fixed subset that spans every band (every 8th grid and area-to-mass case and every named edge case), for pull requests.
//
//   node experiments/synthetic-orbits/run.mjs --modules-commit <sha> --modules-root <modules checkout> [--seed 498] [--grid-step 1]
//     [--jobs 8] [--only <id,id,...>] [--guard] [--no-drag [--no-radiation]] [--fit <way>[,<way>...]] [--truth-start-h <h>] [--scratch]
//                                         rows to <store>/synthetic/<wasm sha12>/rows[-<mode>].jsonl (a row there is not flown again)
//   node experiments/synthetic-orbits/run.mjs --report --modules-commit <sha> --modules-root <modules checkout> [--seed 498] [--grid-step 1]
//     [--guard] [--no-drag [--no-radiation]] --out <dir>       the result file and the maps (report.mjs)
//
// The build is read by git show at the commit (propagator/sdn-ap/dist/isomorphic/module.wasm), never from a working tree. Without
// --scratch the harness's working tree must be clean (the rows name its commit). Free disk under 35 GiB stops the run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fork, execFileSync } from 'node:child_process';
import { REPO, MODULES_ROOT, usePackages, envRecord } from '../headline-loop/lib/env.mjs';
import { cases as makeCases, termsOf, guardOf } from './cases.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const HOUR = 3600e3, DAY = 864e5, STEP = 300e3, ARC_H = 72, LEAD_DAYS = 7, COST_STATES = (7 * DAY) / STEP, MIN_FREE_GIB = 35;
const RE = 6378.137;
// the truth's settings (lib/settings.mjs): drag where the perigee is under 2,500 km
const DRAG_BELOW_KM = 2500;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const caseHash = (c) => sha256(JSON.stringify(c)).slice(0, 16);
// the force mode, both sides: full, no-drag, no-drag-no-radiation
const MODE = args['no-radiation'] ? (args['no-drag'] ? 'no-drag-no-radiation' : null) : args['no-drag'] ? 'no-drag' : 'full';
if (!MODE) throw new Error('--no-radiation goes with --no-drag');
const PASS_M = 100, BAR_H = 120;
// --fit <name>: a way of making AP's record (fits.mjs FITS[name]: { truthStartH, fit(ctx) -> { ocm, note } }); arc72, the default, is
// the 72 h fit of today. --truth-start-h <h>: the truth (and the module-made state) begins h hours before the cutoff (default 72; at least
// the way's own truthStartH), so ways can be scored against one truth. A way other than arc72, or another start, has its own rows file.
// --fit <name>,<name>,...: several ways (not arc72; cutoff72 is its fit) on one truth per case, each row to its way's own file.
const FIT_LIST = String(args.fit ?? 'arc72').split(',');
const FIT = FIT_LIST[0];
if (FIT_LIST.length > 1 && FIT_LIST.includes('arc72')) throw new Error('--fit: arc72 flies alone (fits.mjs cutoff72 is the same fit, without SGP4-XP)');
const FITS = FIT === 'arc72' ? null : (await import('./fits.mjs')).FITS;
for (const f of FITS ? FIT_LIST : []) if (!FITS[f]) throw new Error(`--fit ${f}: not a way fits.mjs names (${Object.keys(FITS).join(', ')})`);
const TRUTH_START_H = Math.max(Number(args['truth-start-h'] ?? ARC_H), ...FIT_LIST.map((f) => FITS?.[f]?.truthStartH ?? ARC_H));
const suffixOf = (f) => `${MODE === 'full' ? '' : `-${MODE}`}${f === 'arc72' && TRUTH_START_H === ARC_H ? '' : `-fit-${f}-ts${TRUTH_START_H}`}`;
const ROWS_SUFFIX = suffixOf(FIT);

if (args.worker) await worker();
else if (args.report) await (await import('./report.mjs')).report(await setup(), args);
else await main();

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
  const seed = Number(args.seed ?? 498), gridStep = Number(args['grid-step'] ?? 1);
  const all = makeCases(seed, { gridStep });
  if (args.guard) all.cases = guardOf(all.cases);
  return { commit, version, wasmSha, dir, file, rowsFile: path.join(dir, `rows${ROWS_SUFFIX}.jsonl`), rowsFiles: Object.fromEntries(FIT_LIST.map((f) => [f, path.join(dir, `rows${suffixOf(f)}.jsonl`)])), seed, gridStep, all, A, mode: MODE, guard: !!args.guard, fit: FIT, truthStartH: TRUTH_START_H };
}

async function main() {
  const t0 = Date.now();
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments/synthetic-orbits', 'experiments/headline-loop').toString().trim();
  if (dirty && !args.scratch) throw new Error(`refused: the harness's working tree differs from its commit (the rows name the commit):\n${dirty}`);
  const harness = git(REPO, 'rev-parse', 'HEAD').toString().trim() + (dirty ? '+scratch' : '');
  const { commit, version, wasmSha, file, rowsFile, rowsFiles, all } = await setup();
  const only = args.only ? new Set(args.only.split(',')) : null;
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
  // per way, the cases its file holds; a case flies the ways that lack it
  const doneOf = Object.fromEntries(FIT_LIST.map((f) => [f, new Set(read(rowsFiles[f]).filter((r) => r.wasmSha256 === wasmSha).map((r) => r.caseHash))]));
  const fitsOf = (c) => FIT_LIST.filter((f) => !doneOf[f].has(caseHash(c)));
  const todo = all.cases.filter((c) => (!only || only.has(c.id)) && fitsOf(c).length);
  const jobs = Math.min(Number(args.jobs ?? 8), todo.length);
  console.error(`synthetic: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${MODE}${args.guard ? ', guard set' : ''}; ${all.cases.length} cases (seed ${all.seed}, grid step ${all.gridStep}), ${todo.length} to fly on ${jobs} jobs`);
  const freeGiB = () => { const s = fs.statfsSync(path.dirname(rowsFile)); return (s.bavail * s.bsize) / 2 ** 30; };
  let next = 0, flown = 0, stopped = null;
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, ...(MODE === 'full' ? [] : MODE === 'no-drag' ? ['--no-drag'] : ['--no-drag', '--no-radiation']), ...(args.cost ? ['--cost'] : []), '--fit', FIT_LIST.join(','), '--truth-start-h', String(TRUTH_START_H)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => {
      if (!stopped && freeGiB() < MIN_FREE_GIB) stopped = `free disk under ${MIN_FREE_GIB} GiB`;
      if (!stopped && next < todo.length) { const c = todo[next++]; child.send({ c, fits: fitsOf(c) }); } else child.send({ stop: true });
    };
    child.on('message', (m) => {
      if (m.rows) {
        for (const [f, row] of Object.entries(m.rows)) fs.appendFileSync(rowsFiles[f], `${JSON.stringify({ ...row, caseHash: caseHash(m.c), version, modulesCommit: commit, wasmSha256: wasmSha, harness })}\n`);
        flown += 1;
        const D = (r) => r.ap?.maxDistance?.maxM ?? r.ap?.error ?? r.error;
        const rs = Object.entries(m.rows), one = rs.length === 1 ? rs[0][1] : null;
        console.error(`  ${flown}/${todo.length} ${m.c.id}: ${one ? `D AP ${D(one)} m, XP ${one.xp?.maxDistance?.maxM ?? one.xp?.error ?? '-'} m; ${one.wallS} s` : `D ${rs.map(([f, r]) => `${f} ${D(r)}`).join(', ')} m; ${rs[0][1].wallS} s`}`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));
  console.error(`synthetic: ${flown} flown in ${((Date.now() - t0) / 1000).toFixed(0)} s${stopped ? `; stopped: ${stopped}` : ''}`);
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
  const { seedOcm } = await import(pathToFileURL(path.join(MODULES_ROOT, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
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
  // one case on one truth: { [way]: row } for each way of `fits` (each row as a single --fit's)
  const flyCase = async (c, fits) => {
    const t1 = performance.now(), D0 = Date.parse(`${c.cutoff}T00:00:00Z`), tStart = D0 - TRUTH_START_H * HOUR, epoch = iso(tStart);
    const terms = termsOf(c.am), row = { id: c.id, kind: c.kind, name: c.name ?? null, am: c.am, elements: { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, hpKm: c.hpKm, haKm: c.haKm, cutoff: c.cutoff }, env };
    const out = {};
    try {
      // the state at the truth's start (D0 - 72 h, or --truth-start-h), made by the module from the case's mean elements
      const seed = seedOcm({ epoch: epoch.replace('Z', ''), n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, norad: 99498, tesseral: 31, zonal: 20 });
      const [s0] = await fly(seed, [epoch]);
      // the truth: FFM from that state, drag (NRLMSISE-00 on the weather known at the cutoff) where the perigee is under 2,500 km
      // (--no-drag: the full setting without drag on every orbit; --no-radiation as well: without radiation pressure either)
      const drag = MODE === 'full' && c.hpKm < DRAG_BELOW_KM, radiation = MODE !== 'no-drag-no-radiation', wx = drag ? W.weatherAt(D0, Math.max(ARC_H, TRUTH_START_H)) : null;
      const setting = drag ? 'L70S' : radiation ? 'Ffull' : 'Ffull without radiation pressure';
      const settings = radiation ? SETTINGS[setting] : { ...SETTINGS.Ffull, forces: { ...SETTINGS.Ffull.forces, srp: false }, parameters: [], apriori: [] };
      const epochs = Array.from({ length: ((TRUTH_START_H + LEAD_DAYS * 24) * HOUR) / STEP + 1 }, (_, k) => iso(tStart + k * STEP));
      const parameters = [...(drag ? [{ kind: 'DRAG_AREA_OVER_MASS', value: terms.dragAreaOverMass }] : []), ...(radiation ? [{ kind: 'SRP_AREA_OVER_MASS', value: terms.srpAreaOverMass }] : [])];
      row.mode = MODE;
      row.truth = { setting, dragAreaOverMass: drag ? terms.dragAreaOverMass : 0, srpAreaOverMass: radiation ? terms.srpAreaOverMass : 0 };
      // a truth that cannot be flown to day 7 (a decay) is flown to the last whole day it reaches, and scored to there
      let states;
      const tt = performance.now();
      for (const days of [LEAD_DAYS, 5, 3, 2, 1, 0]) {
        const upTo = epochs.slice(0, epochs.length - ((LEAD_DAYS - days) * DAY) / STEP);
        try { states = await F.forecast({ epoch, state: [...s0.r, ...s0.v].map((x) => x * 1000), parameters }, upTo, settings, wx?.ffm ?? null); if (days < LEAD_DAYS) row.truth.flownToDay = days; break; } catch (e) { row.truth.error = String(e?.message ?? e).slice(0, 200); }
      }
      if (!states || row.truth.flownToDay === 0) throw new Error('truth');
      delete row.truth.error;
      row.truth.flightS = r1((performance.now() - tt) / 1000);
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
      // AP (its forces as the truth's: drag and the weather where the truth has them; the solid tide; radiation held at 0 where the truth
      // has none) and our SGP4-XP, fitted the same way
      const apPcf = radiation ? A.PCF[drag ? 'AP_TIDES' : 'AP_VACUUM_TIDES'] : APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }), SOLID_TIDES: 1 }, fit: { srpPrior: { mean: 0, sigma: 1e-12, form: 'GAUSSIAN_SIGNED' } } });
      const apLabel = drag ? 'AP_TIDES' : radiation ? 'AP_VACUUM_TIDES' : 'AP_VACUUM_TIDES, radiation term held at 0';
      // another way of making AP's record (--fit, fits.mjs): its record is scored as AP's; SGP4-XP and the cost flights only on arc72
      const oemOf = (fromMs, toMs) => { const ls = lines.filter((l) => { const t = Date.parse(l.epoch); return t >= fromMs && t <= toMs && (low < 0 || t < Date.parse(lines[low].epoch)); }); return S.oemBytes({ frame: 'GCRF', object: { name: 'SYNTHETIC', id: '', norad: 99498 }, lines: ls, useableStart: ls[0].epoch, useableStop: ls.at(-1).epoch }); };
      const base = JSON.stringify(row);
      for (const FIT of fits) {
        const theories = FIT === 'arc72' ? { ap: { label: apLabel, pcf: apPcf, spw: wx?.spw }, xp: { label: 'XP', pcf: A.PCF.XP, spw: undefined } } : { ap: { label: `${apLabel}, fit ${FIT}`, pcf: apPcf, spw: wx?.spw, way: FITS[FIT] } };
        const row = out[FIT] = JSON.parse(base);
        row.fit = FIT; row.truthStartH = TRUTH_START_H;
        for (const [t, x] of Object.entries(theories)) {
          try {
            const tf = performance.now();
            const made = x.way ? await x.way.fit({ lines, D0, drag, wx, terms, label: apLabel, fitPcf: apPcf, oemOf, fitOf: fit, S, A, APL }) : null;
            if (made?.note) row.fitNote = made.note;
            const ocm = made ? made.ocm : await fit(oem, x.pcf, x.spw), info = APL.readOcm(ocm), fitS = r1((performance.now() - tf) / 1000);
            const d = W.byDay(await m.rtn(await fly(ocm, sc.epochs), sc.truth), sc.entered, sc.sizes);
            // D: the largest 3D distance to the truth over the span, its hour, and the first hour above 100 m
            const flown = await fly(ocm, span.map((l) => l.epoch));
            const dist = flown.map((s, k) => Math.hypot(s.r[0] - span[k].r[0], s.r[1] - span[k].r[1], s.r[2] - span[k].r[2]) * 1000);
            const at = dist.indexOf(Math.max(...dist)), over = dist.findIndex((x) => x > PASS_M), hourOf = (k) => r1((Date.parse(span[k].epoch) - D0) / HOUR);
            x.ocm = ocm;
            row[t] = { pcf: x.label, fitRmsM: r1(info.fitRmsKm * 1000), bterm: info.bterm ?? null, agom: info.agom ?? null, fitS, epoch: info.epoch ?? null, days: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, r1(v.e * 1000)])),
              maxDistance: { maxM: r1(dist[at]), atH: hourOf(at), firstOver100mH: over < 0 ? null : hourOf(over), spanH: hourOf(dist.length - 1), pass: dist[at] <= PASS_M } };
            if (late.length) {
              const dl = (await fly(ocm, late.map((l) => l.epoch))).map((s, k) => Math.hypot(s.r[0] - late[k].r[0], s.r[1] - late[k].r[1], s.r[2] - late[k].r[2]) * 1000);
              const k = dl.indexOf(Math.max(...dl));
              row[t].pastBar = { maxM: r1(dl[k]), atH: r1((Date.parse(late[k].epoch) - D0) / HOUR), spanH: r1((Date.parse(late.at(-1).epoch) - D0) / HOUR) };
            }
          } catch (e) { row[t] = { pcf: x.label, error: String(e?.message ?? e).slice(0, 200) }; }
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
  process.on('message', async (msg) => {
    if (msg.stop) { await F.close(); process.exit(0); }
    process.send({ c: msg.c, rows: await flyCase(msg.c, msg.fits) });
  });
  process.send({ ready: true });
}
