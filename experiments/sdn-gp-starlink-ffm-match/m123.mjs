// Step 8: M1 to M3 of DESIGN.md section 4 (amendments A7 and A7b): the LEO fit floor against zonal-only gravity.
//   node experiments/sdn-gp-starlink-ffm-match/m123.mjs [--workers N] [--family starlink,iss,lageos1,lageos2] [--limit N] [--only id,id]
// One window = one start state. FFM-1 (propagator/ffm) is run from it for 96 h at 60 s under each gravity variant (the
// module's own truncation options), each trajectory is fitted by SGP4 and SGP4-XP over 24 h, 21.7 h and 34.2 h and scored on the
// three held-out days (the registered `scoreWindow`), and the in-track difference series between variants are taken by
// gp-error-model `pair_statistics` and summarized by a least-squares sinusoid (lib/curve.mjs). Local output:
// <store>/m123/<family>/<id>.json (statistics only). Physics is the modules'; this file orchestrates and counts.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, frozen, store, write, read, freeGiB, args } from './common.mjs';
import { modulesRoot, openModule } from './lib/modules.mjs';
import { openBaselines, scoreWindow, rtnSeries } from './lib/baselines.mjs';
import { loadEnvironment, propagate } from './lib/ffm.mjs';
import { transformState } from './lib/frames.mjs';
import * as sources from './lib/sources.mjs';
import { quadraticPlusSinusoid } from './lib/curve.mjs';
import { DAY, iso, ms, withT, windowStarts } from './lib/windows.mjs';

const OUT = path.join(store, 'm123');
const claimDir = path.join(OUT, 'claims');
const MIN_FREE_GIB = 25;
const LEAD_DAYS = config.windows.leadDays;
const FITS = [['h24', 24 * 3600], ['h21_7', Math.round(21.7 * 3600)], ['h34_2', Math.round(34.2 * 3600)]]; // A7, A7c
const M_HOURS = 120; // A7c: the 34.2 h fit plus three held-out days

// FFM force-configuration overrides (propagator/ffm PRWForceConfiguration). MAXIMUM_ORDER truncates the order of the whole
// field; MAXIMUM_TESSERAL_DEGREE drops the tesseral and sectorial terms above that degree (the zonals run to degree 70).
const GRAVITY = {
  full: {},
  zonal: { MAXIMUM_ORDER: 0 },
  tess2: { MAXIMUM_TESSERAL_DEGREE: 2, HAS_MAXIMUM_TESSERAL_DEGREE: true },
  tess6: { MAXIMUM_TESSERAL_DEGREE: 6, HAS_MAXIMUM_TESSERAL_DEGREE: true },
  order14: { MAXIMUM_ORDER: 14 },
  order15: { MAXIMUM_ORDER: 15 },
};
const NODRAG = { ENABLE_DRAG: false };
const VARIANTS = { ...GRAVITY, 'full-nodrag': { ...NODRAG }, 'zonal-nodrag': { ...NODRAG, MAXIMUM_ORDER: 0 } };
const PAIRS = [['tess2', 'zonal'], ['tess6', 'zonal'], ['full', 'zonal'], ['full', 'tess6'], ['full', 'order14'], ['order15', 'order14'], ['full-nodrag', 'zonal-nodrag']];
const LONG_VARIANTS = ['full', 'order14', 'order15'];
const LONG_PAIRS = [['full', 'order14'], ['order15', 'order14']];
const LONG_DAYS = 10;
const ISS_CD_AM = (0.95 * 1273.21) / 470200; // header of hac/nasa-iss-oem/20261009: DRAG_COEFF x DRAG_AREA / MASS
const LAGEOS_CR_AM = 7.9e-4; // m2/kg, A7
const DRAG_VARIANTS = Object.keys(VARIANTS);
const FREE_VARIANTS = Object.keys(GRAVITY); // LAGEOS: drag is off in every variant

// ---- the windows ----
function starlinkWindows() {
  const dir = path.join(store, 'rows/starlink');
  return fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => read(path.join(dir, f)))
    .filter((r) => r.ffm && r.fit.convergence === 'converged' && !r.fit.bEffAtZeroBound && r.fit.bEffM2Kg <= 0.5)
    .sort((a, b) => a.norad - b.norad)
    .map((r) => {
      const meta = read(path.join(store, 'truth', `${r.norad}.json`));
      return { family: 'starlink', id: String(r.norad), norad: r.norad, name: `STARLINK-${r.norad}`, stratum: r.stratum, population: r.population, t0: ms(meta.truth.epochUtc), state: meta.truth.stateGcrfKm,
        cdAm: meta.fit.bEffM2Kg, crAm: meta.fit.crAm, bEff: meta.fit.bEffM2Kg, variants: DRAG_VARIANTS, baseForces: {}, long: true, registered: path.join(store, meta.truth.file) };
    });
}

async function issWindows(frames) {
  const [iss] = sources.iss(); // the registered file (A7b)
  const out = [];
  for (const nominal of windowStarts(iss, { fitSeconds: 86400, strideSeconds: 86400, minLeadDays: LEAD_DAYS.at(-1) })) {
    const index = iss.t.findIndex((t) => t >= nominal); // the first OEM state at or after the nominal start (the 2026-10-13 grid is off by 104 s)
    const line = iss.lines[index];
    const t0 = iss.t[index];
    const state = await transformState(frames, 'EME2000', 'GCRF', iso(t0), [...line.r, ...line.v]);
    out.push({ family: 'iss', id: iso(nominal).slice(0, 13), norad: 25544, name: 'ISS', t0, state, cdAm: ISS_CD_AM, crAm: 0, bEff: ISS_CD_AM, variants: DRAG_VARIANTS, baseForces: {}, long: false });
  }
  return out;
}

function lageosWindows() {
  const out = [];
  for (const target of ['lageos1', 'lageos2']) {
    for (const stamp of ['260725', '260801', '260808', '260815', '260822', '260829']) {
      const name = fs.readdirSync(sources.referenceRootDir).find((d) => d.startsWith(`ilrsa.orb.${target}.${stamp}.`));
      if (!name) continue;
      const dir = sources.referenceDir(name);
      const ref = sources.readReference(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.oem'))));
      out.push({ family: target, id: `${stamp}`, norad: ref.norad, name: ref.name || target, t0: ms(ref.lines[0].epoch), state: [...ref.lines[0].r, ...ref.lines[0].v], cdAm: 0, crAm: LAGEOS_CR_AM, bEff: 0, variants: FREE_VARIANTS, baseForces: { ...NODRAG }, long: false });
    }
  }
  return out;
}

// ---- one window ----
const kmLines = (samples) => samples.map((s) => ({ epoch: iso(s.ms), r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000) }));
const grid = (t0, seconds, step) => Array.from({ length: Math.round(seconds / step) + 1 }, (_, i) => t0 + i * step * 1000);
const thin = (lines, every) => lines.filter((_, i) => i % every === 0);

async function differences(baselines, a, b, every, period) {
  const series = await rtnSeries(baselines, thin(a, every), thin(b, every));
  const step = (ms(a[1].epoch) - ms(a[0].epoch)) * every;
  const t = series.map((_, i) => (i * step) / DAY);
  const inTrack = series.map((e) => e[1] * 1000);
  const rms = (c) => Math.sqrt(series.reduce((s, e) => s + (e[c] * 1000) ** 2, 0) / series.length);
  const fit = quadraticPlusSinusoid(t, inTrack, period);
  return { n: series.length, rtnRmsM: [rms(0), rms(1), rms(2)], inTrackEndM: inTrack.at(-1), inTrackMaxAbsM: Math.max(...inTrack.map(Math.abs)), sinusoid: fit ? { periodDays: fit.period, amplitudeM: fit.amplitude, rmsResidualM: fit.rmsResidual, rmsQuadraticResidualM: fit.rmsQuadraticResidual } : null };
}

async function processWindow(w, ctx) {
  const { modules, context, baselines } = ctx;
  const t0Iso = iso(w.t0);
  const epochs = grid(w.t0, M_HOURS * 3600, config.truth.cadenceSeconds);
  const state = w.state.map((x) => x * 1000);
  const row = { family: w.family, id: w.id, norad: w.norad, name: w.name, stratum: w.stratum ?? null, population: w.population ?? null, startUtc: t0Iso, startStateGcrfKm: w.state, cdAm: w.cdAm, crAm: w.crAm, bEff: w.bEff, baseForces: w.baseForces, variants: {}, pairs: {}, long: {} };
  const traj = {};
  for (const name of w.variants) {
    const forces = { ...VARIANTS[name], ...w.baseForces };
    try {
      const ffm = await propagate(modules, context, { epoch: t0Iso, state, cdAm: w.cdAm, crAm: w.crAm, epochs, integrator: config.truth.integrator, forces });
      row.ffmWasmSha256 = ffm.wasmSha256;
      const lines = kmLines(ffm.samples);
      traj[name] = lines;
      const object = withT({ source: `m123-${w.family}`, id: `${w.name} ${name}`, norad: w.norad, name: w.name, objectId: '', originator: 'G1 M1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC', lines });
      const entry = { ffmCpuSeconds: ffm.cpuSeconds };
      for (const [label, seconds] of FITS) {
        const scored = await scoreWindow(baselines, object, w.t0, { fitSeconds: seconds, leadDays: LEAD_DAYS, minCoverage: config.windows.minimumCoverage });
        entry[label] = scored ? { xp: scored.xp, sgp4: scored.sgp4 } : null;
      }
      if (name.endsWith('-nodrag') || w.baseForces.ENABLE_DRAG === false) { // B* fixed at its true value, 0 (A7b c)
        const fixed = await scoreWindow(baselines, object, w.t0, { fitSeconds: FITS[0][1], leadDays: LEAD_DAYS, minCoverage: config.windows.minimumCoverage, fixedBstar: 0, arms: 'sgp4' });
        entry.sgp4Fixed = fixed?.sgp4 ?? null;
      }
      row.variants[name] = entry;
    } catch (error) { row.variants[name] = { error: String(error.message).slice(0, 300) }; }
  }
  if (w.registered && traj.full) { // the full-gravity re-propagation reproduces the registered truth
    const f = new Float64Array(new Uint8Array(fs.readFileSync(w.registered)).buffer);
    let worst = 0;
    traj.full.forEach((l, i) => { [...l.r, ...l.v].forEach((x, j) => { worst = Math.max(worst, Math.abs(x - f[i * 6 + j])); }); });
    row.registeredMaxAbsKm = worst;
  }
  for (const [a, b] of PAIRS) {
    if (!traj[a] || !traj[b]) continue;
    try { row.pairs[`${a}-${b}`] = await differences(baselines, traj[a], traj[b], 5, { minPeriod: 8 / 24, maxPeriod: 16 / 24, steps: 160 }); } catch (error) { row.pairs[`${a}-${b}`] = { error: String(error.message).slice(0, 200) }; }
  }
  if (w.long) { // the 15:1 term over 10 days (A7b d)
    const longEpochs = grid(w.t0, LONG_DAYS * 86400, 300);
    const lt = {};
    for (const name of LONG_VARIANTS) {
      try { lt[name] = kmLines((await propagate(modules, context, { epoch: t0Iso, state, cdAm: w.cdAm, crAm: w.crAm, epochs: longEpochs, integrator: config.truth.integrator, forces: { ...VARIANTS[name], ...w.baseForces } })).samples); } catch (error) { row.long[name] = { error: String(error.message).slice(0, 200) }; }
    }
    for (const [a, b] of LONG_PAIRS) {
      if (!lt[a] || !lt[b]) continue;
      try { row.long[`${a}-${b}`] = await differences(baselines, lt[a], lt[b], 1, { minPeriod: 2, maxPeriod: 12, steps: 100 }); } catch (error) { row.long[`${a}-${b}`] = { error: String(error.message).slice(0, 200) }; }
    }
  }
  write(path.join(OUT, w.family, `${w.id}.json`), row);
}

async function worker(id) {
  frozen();
  const modules = modulesRoot();
  const context = await loadEnvironment(modules, { archive: config.archive, store });
  const baselines = await openBaselines(modules);
  const frames = await openModule(modules, 'foundation/frames');
  const wanted = args.family ? new Set(args.family.split(',')) : null;
  const only = args.only ? new Set(args.only.split(',')) : null;
  const tasks = [...lageosWindows(), ...(await issWindows(frames)), ...starlinkWindows()].filter((w) => (!wanted || wanted.has(w.family)) && (!only || only.has(w.id)));
  fs.mkdirSync(claimDir, { recursive: true });
  let limit = args.limit ? Number(args.limit) : Infinity;
  for (const w of tasks) {
    if (freeGiB() < MIN_FREE_GIB) { console.error(`worker ${id}: disk under ${MIN_FREE_GIB} GiB free, stopping`); break; }
    if (fs.existsSync(path.join(OUT, 'stop'))) break;
    if (fs.existsSync(path.join(OUT, w.family, `${w.id}.json`))) continue;
    const claim = path.join(claimDir, `${w.family}-${w.id}`);
    try { fs.mkdirSync(claim); } catch {
      if (Date.now() - fs.statSync(claim).mtimeMs < 30 * 60e3) continue;
      fs.utimesSync(claim, new Date(), new Date());
    }
    if (limit-- <= 0) break;
    const started = Date.now();
    try { await processWindow(w, { modules, context, baselines }); console.error(`worker ${id}: ${w.family} ${w.id} ok in ${((Date.now() - started) / 1000).toFixed(0)} s`); } catch (error) { console.error(`worker ${id}: ${w.family} ${w.id} FAILED ${String(error.message).slice(0, 300)}`); }
  }
  await baselines.close();
  await frames.destroy();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (args.worker !== undefined) { await worker(args.worker); process.exit(0); }
  frozen();
  const count = Number(args.workers ?? 1);
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(path.join(OUT, 'stop'), { force: true });
  const children = Array.from({ length: count }, (_, k) => {
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname, '--worker', String(k), ...process.argv.slice(2).filter((a, i, all) => a !== '--workers' && all[i - 1] !== '--workers')], { stdio: ['ignore', 'inherit', 'inherit'] });
    return new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  });
  console.error(`started ${count} workers (children of ${process.pid})`);
  await Promise.all(children);
}
