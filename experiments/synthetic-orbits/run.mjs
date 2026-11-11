// Synthetic orbits over the whole orbit regime, each scored against the numerical propagator (stack #498). For every case of cases.mjs
// (seeded): the module makes the state at D0 - 72 h from the case's mean elements; the numerical propagator (FFM 2.2.0) flies it through
// the 72 h fit arc and 7 days past it on a 300 s grid, and that flight is the truth; AP and our SGP4-XP (the same module) are fitted to
// the truth before the cutoff D0 and flown; both see the same space weather (the weather known at the cutoff, on the truth too). Scored:
// the distance to the truth at 1 to 7 days (the root mean square of the 3D distance over the 24 h ending at the day), the pass at 100 m
// at day 5, AP against SGP4-XP, and each one's cost per state (a warm set flown 7 days at 300 s, the median of three timed flights).
// Nothing here is any real satellite's data.
//
//   node experiments/synthetic-orbits/run.mjs --modules-commit <sha> --modules-root <modules checkout> [--seed 498] [--grid-step 1]
//     [--jobs 8] [--only <id,id,...>] [--scratch]          rows to <store>/synthetic/<wasm sha12>/rows.jsonl (a row there is not flown again)
//   node experiments/synthetic-orbits/run.mjs --report --modules-commit <sha> --modules-root <modules checkout> [--seed 498] [--grid-step 1]
//     --out <dir>                                           the result file and the maps (report.mjs)
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
import { cases as makeCases, termsOf } from './cases.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const HOUR = 3600e3, DAY = 864e5, STEP = 300e3, ARC_H = 72, LEAD_DAYS = 7, COST_STATES = (7 * DAY) / STEP, MIN_FREE_GIB = 35;
const RE = 6378.137;
// the truth's settings (lib/settings.mjs): drag where the perigee is under 2,500 km
const DRAG_BELOW_KM = 2500;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const caseHash = (c) => sha256(JSON.stringify(c)).slice(0, 16);

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
  return { commit, version, wasmSha, dir, file, rowsFile: path.join(dir, 'rows.jsonl'), seed, gridStep, all, A };
}

async function main() {
  const t0 = Date.now();
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments/synthetic-orbits', 'experiments/headline-loop').toString().trim();
  if (dirty && !args.scratch) throw new Error(`refused: the harness's working tree differs from its commit (the rows name the commit):\n${dirty}`);
  const harness = git(REPO, 'rev-parse', 'HEAD').toString().trim() + (dirty ? '+scratch' : '');
  const { commit, version, wasmSha, file, rowsFile, all } = await setup();
  const only = args.only ? new Set(args.only.split(',')) : null;
  const read = () => (fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
  const done = new Set(read().filter((r) => r.wasmSha256 === wasmSha).map((r) => r.caseHash));
  const todo = all.cases.filter((c) => (!only || only.has(c.id)) && !done.has(caseHash(c)));
  const jobs = Math.min(Number(args.jobs ?? 8), todo.length);
  console.error(`synthetic: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${all.cases.length} cases (seed ${all.seed}, grid step ${all.gridStep}), ${todo.length} to fly on ${jobs} jobs`);
  const freeGiB = () => { const s = fs.statfsSync(path.dirname(rowsFile)); return (s.bavail * s.bsize) / 2 ** 30; };
  let next = 0, flown = 0, stopped = null;
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => {
      if (!stopped && freeGiB() < MIN_FREE_GIB) stopped = `free disk under ${MIN_FREE_GIB} GiB`;
      if (!stopped && next < todo.length) child.send({ c: todo[next++] }); else child.send({ stop: true });
    };
    child.on('message', (m) => {
      if (m.row) {
        fs.appendFileSync(rowsFile, `${JSON.stringify({ ...m.row, caseHash: caseHash(m.c), version, modulesCommit: commit, wasmSha256: wasmSha, harness })}\n`);
        flown += 1;
        console.error(`  ${flown}/${todo.length} ${m.c.id}: AP ${m.row.ap?.days?.[5] ?? m.row.ap?.error ?? m.row.error} m, XP ${m.row.xp?.days?.[5] ?? m.row.xp?.error ?? '-'} m at day 5; ${m.row.wallS} s`);
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
  const flyCase = async (c) => {
    const t1 = performance.now(), D0 = Date.parse(`${c.cutoff}T00:00:00Z`), tStart = D0 - ARC_H * HOUR, epoch = iso(tStart);
    const terms = termsOf(c.am), row = { id: c.id, kind: c.kind, name: c.name ?? null, am: c.am, elements: { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, hpKm: c.hpKm, haKm: c.haKm, cutoff: c.cutoff }, env };
    try {
      // the state at D0 - 72 h, made by the module from the case's mean elements
      const seed = seedOcm({ epoch: epoch.replace('Z', ''), n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, norad: 99498, tesseral: 31, zonal: 20 });
      const [s0] = await fly(seed, [epoch]);
      // the truth: FFM from that state, drag (NRLMSISE-00 on the weather known at the cutoff) where the perigee is under 2,500 km
      const drag = c.hpKm < DRAG_BELOW_KM, setting = drag ? 'L70S' : 'Ffull', wx = drag ? W.weatherAt(D0) : null;
      const epochs = Array.from({ length: ((ARC_H + LEAD_DAYS * 24) * HOUR) / STEP + 1 }, (_, k) => iso(tStart + k * STEP));
      const parameters = [...(drag ? [{ kind: 'DRAG_AREA_OVER_MASS', value: terms.dragAreaOverMass }] : []), { kind: 'SRP_AREA_OVER_MASS', value: terms.srpAreaOverMass }];
      row.truth = { setting, dragAreaOverMass: drag ? terms.dragAreaOverMass : 0, srpAreaOverMass: terms.srpAreaOverMass };
      // a truth that cannot be flown to day 7 (a decay) is flown to the last whole day it reaches, and scored to there
      let states;
      for (const days of [LEAD_DAYS, 5, 3, 2, 1, 0]) {
        const upTo = epochs.slice(0, epochs.length - ((LEAD_DAYS - days) * DAY) / STEP);
        try { states = await F.forecast({ epoch, state: [...s0.r, ...s0.v].map((x) => x * 1000), parameters }, upTo, SETTINGS[setting], wx?.ffm ?? null); if (days < LEAD_DAYS) row.truth.flownToDay = days; break; } catch (e) { row.truth.error = String(e?.message ?? e).slice(0, 200); }
      }
      if (!states || row.truth.flownToDay === 0) throw new Error('truth');
      delete row.truth.error;
      epochs.length = states.length;
      const lines = epochs.map((t, k) => ({ epoch: t, r: states[k].r, v: states[k].v }));
      const alt = lines.map((l) => Math.hypot(...l.r) - RE), low = alt.findIndex((x) => x < 100);
      row.truth.minAltitudeKm = r1(Math.min(...alt));
      if (low >= 0) { row.truth.decayedAtH = r1((Date.parse(lines[low].epoch) - D0) / HOUR); if (low <= (ARC_H * HOUR) / STEP) throw new Error('truth'); }
      if (states.length <= (ARC_H * HOUR) / STEP + DAY / STEP) throw new Error('truth');
      const fitLines = lines.filter((l) => Date.parse(l.epoch) <= D0), after = lines.filter((l) => Date.parse(l.epoch) > D0 && (low < 0 || Date.parse(l.epoch) < Date.parse(lines[low].epoch)));
      const sc = W.scoredOf(after, D0);
      const oem = S.oemBytes({ frame: 'GCRF', object: { name: 'SYNTHETIC', id: '', norad: 99498 }, lines: fitLines, useableStart: fitLines[0].epoch, useableStop: iso(D0) });
      const costEpochs = Array.from({ length: COST_STATES }, (_, k) => iso(D0 + (k + 1) * STEP));
      // AP (its forces as the truth's: drag and the weather where the truth has them; the solid tide) and our SGP4-XP, fitted the same way
      const theories = { ap: { label: drag ? 'AP_TIDES' : 'AP_VACUUM_TIDES', spw: wx?.spw }, xp: { label: 'XP', spw: undefined } };
      for (const [t, x] of Object.entries(theories)) {
        try {
          const ocm = await fit(oem, A.PCF[x.label], x.spw), info = APL.readOcm(ocm);
          const d = W.byDay(await m.rtn(await fly(ocm, sc.epochs), sc.truth), sc.entered, sc.sizes);
          x.ocm = ocm;
          row[t] = { pcf: x.label, fitRmsM: r1(info.fitRmsKm * 1000), bterm: info.bterm ?? null, agom: info.agom ?? null, days: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, r1(v.e * 1000)])) };
        } catch (e) { row[t] = { pcf: x.label, error: String(e?.message ?? e).slice(0, 200) }; }
      }
      // cost per state: each set warm (flown once), then three timed 7-day flights at 300 s, interleaved; the median
      if (theories.ap.ocm && theories.xp.ocm) {
        const times = { ap: [], xp: [] };
        for (const t of ['ap', 'xp']) await fly(theories[t].ocm, costEpochs);
        for (let k = 0; k < 3; k += 1) for (const t of ['ap', 'xp']) { const a = performance.now(); await fly(theories[t].ocm, costEpochs); times[t].push(performance.now() - a); }
        row.costUsPerState = { ap: r1((median(times.ap) * 1000) / COST_STATES), xp: r1((median(times.xp) * 1000) / COST_STATES), states: COST_STATES };
      }
    } catch (e) { if (String(e?.message) !== 'truth') row.error = String(e?.message ?? e).slice(0, 200); }
    row.wallS = r1((performance.now() - t1) / 1000);
    return row;
  };
  process.on('message', async (msg) => {
    if (msg.stop) { await F.close(); process.exit(0); }
    process.send({ c: msg.c, row: await flyCase(msg.c) });
  });
  process.send({ ready: true });
}
