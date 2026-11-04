// AP from ILRS normal points, second registration (PLAN.md), per cutoff: flows/observation-ap, then the four arms flown and scored against the NSGF
// anchor by analysis/reference-states compare_to_reference. One JSON line per cutoff under <store>/rows/w<k>.jsonl; the AP
// $OCM, the estimate and the NSGF-fit AP $OCM under <store>/products/<norad>-<T>/; each row holds the fits as analysis/estimation
// answered them. Then table.mjs.
//   node experiments/ap-observations-2/run.mjs [--workers 8] [--limit n]       (parent: spawns the workers once, then the table)
//   node experiments/ap-observations-2/run.mjs --worker k/n [--limit n]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import * as L from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
L.frozen();
const { config, DAY, H, iso } = L;
for (const c of config.cutoffs) if (config.EXCLUDE_NORADS.includes(c.norad)) throw new Error(`held object ${c.norad}`);
fs.mkdirSync(path.join(L.store, 'rows'), { recursive: true });
fs.mkdirSync(path.join(L.store, 'products'), { recursive: true });

if (!args.worker) {
  const n = Number(args.workers ?? 8);
  const kids = Array.from({ length: n }, (_, k) => new Promise((resolve) => {
    const p = spawn('nice', ['-n', '10', process.execPath, path.join(L.dir, 'run.mjs'), '--worker', `${k}/${n}`, ...(args.limit ? ['--limit', args.limit] : [])], { stdio: ['ignore', 'inherit', 'inherit'] });
    console.error(`worker ${k}/${n} pid ${p.pid}`);
    p.on('exit', (code) => resolve(code));
  }));
  const codes = await Promise.all(kids);
  console.error(`workers exited ${codes.join(' ')}`);
  if (codes.some((c) => c !== 0)) process.exit(1);
  execFileSync(process.execPath, [path.join(L.dir, 'table.mjs')], { stdio: 'inherit' });
  process.exit(0);
}

async function guard() { // 1-minute load under 45, disk above 20 GiB
  for (;;) {
    const load = os.loadavg()[0];
    const free = Number(execFileSync('df', ['-k', L.ARCHIVE]).toString().trim().split('\n').at(-1).split(/\s+/)[3]) / 1024 ** 2;
    if (load < 45 && free > 20) return;
    console.error(`waiting: load ${load.toFixed(1)}, disk ${free.toFixed(1)} GiB`);
    await sleep(30e3);
  }
}

const [k, n] = args.worker.split('/').map(Number);
const out = path.join(L.store, 'rows', `w${k}.jsonl`);
const done = new Set(fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => L.keyOf(JSON.parse(l))) : []);
const h = await L.openHosts();
const { readSets, setAt } = await import(path.join(L.root, 'experiments/e4-operator-ephemeris-parity/products.mjs'));
const sets = new Map();
const setsOf = (norad) => { if (!sets.has(norad)) sets.set(norad, readSets('/opt/data/sdn-archive/spacetrack/gp_history/by-creation', '2026-07-01', '2026-09-05', new Set([norad])).get(norad) ?? []); return sets.get(norad); };
const short = (e) => String(e?.message ?? e).slice(0, 300);
const ymd = (t) => new Date(t).toISOString().slice(0, 7).replace('-', '');

let count = 0;
for (let i = 0; i < config.cutoffs.length; i += 1) {
  const c = config.cutoffs[i];
  if (i % n !== k || done.has(L.keyOf(c))) continue;
  if (args.limit && count >= Number(args.limit)) break;
  await guard();
  const t0 = Date.now();
  const T = Date.parse(c.cutoff), target = config.targets[c.target], arcStart = T - config.arcHours * H;
  const truth = await L.truthOf(c.target);
  const { chosen, every, minPerDay } = thinned(truth, T);
  const row = { norad: c.norad, target: c.target, cutoff: c.cutoff, arms: {}, truth: { stepS: truth.stepS, every, minPerDay, epochs: chosen.length } };
  const prod = path.join(L.store, 'products', L.stampOf(c));
  fs.mkdirSync(prod, { recursive: true });
  const reference = L.linesOem('GCRF', chosen.map((x) => x.l));
  const score = async (eph) => L.dayValues(await L.compare(h, eph, reference), T, every, minPerDay);
  const startIso = iso(T), stopIso = iso(T + Math.max(...config.leadDays) * DAY);
  let eopPrw = null, execution = null, estimate = null;
  // inputs
  try {
    const g = truth.lines.find((x) => x.t === arcStart);
    if (!g) throw new Error(`no NSGF state at ${iso(arcStart)}`);
    const rp = config.guessRounding.positionM / 1000, rv = config.guessRounding.velocityMS / 1000;
    const guess = { epoch: iso(arcStart), state: [g.l.X, g.l.Y, g.l.Z].map((x) => Math.round(x / rp) * rp).concat([g.l.X_DOT, g.l.Y_DOT, g.l.Z_DOT].map((x) => Math.round(x / rv) * rv)) };
    const st = await L.stationsAt(h, T);
    const passes = (await L.passesOf(h, c.target, [...new Set([ymd(arcStart), ymd(T)])])).filter((p) => p.start >= arcStart && p.end <= T);
    const kept = passes.filter((p) => st.pads.has(p.pad));
    const eop = await L.eopRows(h, T - 4 * DAY, T + 5 * DAY);
    eopPrw = L.prw('EARTH_ORIENTATION', Object.assign(new L.P.PRWEarthOrientationT(), { ROWS: eop }));
    execution = L.executionRequest({ guess, target: iso(T), norad: c.norad, objectId: target.objectId, crAm: target.crAm });
    row.inputs = { sinex: st.file, passes: passes.length, passesKept: kept.length, padsDropped: [...new Set(passes.filter((p) => !st.pads.has(p.pad)).map((p) => p.pad))], normalPoints: kept.reduce((s, p) => s + p.points, 0), eopRows: eop.length, guessEpoch: guess.epoch };
    // arm ap: the flow
    const fits = [];
    const run = await L.observationAp({ ...L.flowHosts(h), estimation: L.watchedEstimation(h.estimation, fits) }, { observations: kept.map((p) => p.bytes), stations: st.gsts, earth_orientation: eopPrw, kernel: L.kernelPrw(), execution, configuration: L.fitPcf() });
    row.fits = fits;
    if (run.refused) row.arms.ap = { ok: false, refused: run.refused };
    else {
      const [ap] = run.egress.ap_ocm;
      [estimate] = run.egress.estimate;
      fs.writeFileSync(path.join(prod, 'ap.ocm'), ap);
      fs.writeFileSync(path.join(prod, 'estimate.ocm'), estimate);
      const est = L.OCMm.OCM.getRootAsOCM(new L.flatbuffers.ByteBuffer(estimate)).unpack(), od = est.ORBIT_DETERMINATION;
      const apu = L.OCMm.OCM.getRootAsOCM(new L.flatbuffers.ByteBuffer(ap)).unpack(), fs_ = apu.ORBIT_DETERMINATION.FIT_STATISTICS;
      row.estimate = { epoch: est.STATE_EPOCHS[0], normalPointsUsed: od.OD_OBSERVATIONS_USED, rangeRmsKm: od.FIT_STATISTICS?.FIT_RMS_KM, iterations: od.FIT_STATISTICS?.ITERATIONS, weightedRms: od.WEIGHTED_RMS,
        inTrackAccelerationMS2: od.OD_DYNAMIC_PARAMETERS.find((p) => p.PARAMETER === L.P.prwDynamicParameter.IN_TRACK_ACCELERATION)?.VALUE };
      row.apOcm = { epoch: apu.MEAN_ELEMENTS?.EPOCH, fitStart: fs_.FIT_START, fitStop: fs_.FIT_STOP, fitRmsKm: fs_.FIT_RMS_KM, fitStates: fs_.FIT_STATES, converged: fs_.CONVERGED, sha256: L.sha256(ap) };
      try { row.arms.ap = { ok: true, days: await score(await L.apPropagate(h, ap, startIso, stopIso, config.carryStepSeconds)) }; } catch (e) { row.arms.ap = { ok: false, refused: short(e), stage: 'flight' }; }
    }
  } catch (e) { row.arms.ap = { ok: false, refused: short(e), stage: 'inputs' }; }
  // arm ffm: the estimate flown alone
  if (estimate) {
    try { row.arms.ffm = { ok: true, days: await score(await L.ffmPropagate(h, L.flightRequest(execution, estimate), eopPrw, startIso, stopIso, config.carryStepSeconds)) }; } catch (e) { row.arms.ffm = { ok: false, refused: short(e) }; }
  } else row.arms.ffm = { ok: false, refused: 'no estimate (the flow refused)' };
  // arm apNsgf: sdn-ap 0.5.1 fit to the NSGF states of [T - 24 h, T]
  try {
    const own = L.slice(truth, T - config.carryHours * H, T, false);
    if (own.length <= 20) throw new Error(`${own.length} NSGF states in the 24 h before T`);
    const ocm = await L.apFit(h, L.linesOem('GCRF', own.map((x) => x.l), { template: truth.head, prefixed: false }));
    fs.writeFileSync(path.join(prod, 'ap-nsgf.ocm'), ocm);
    row.arms.apNsgf = { ok: true, fitStates: own.length, days: await score(await L.apPropagate(h, ocm, startIso, stopIso, config.carryStepSeconds)) };
  } catch (e) { row.arms.apNsgf = { ok: false, refused: short(e) }; }
  // arm sgp4: the public set as B2 had it, on propagator/sgp4
  const set = setAt(setsOf(c.norad), T);
  if (!set) row.arms.sgp4 = { ok: false, refused: 'no set before T' };
  else {
    try {
      const eph = await L.sgp4Ephemeris(h, set, c.norad, T, T + Math.max(...config.leadDays) * DAY, config.carryStepSeconds);
      row.arms.sgp4 = { ok: true, setEpoch: set.epoch, days: await score(L.linesOem('TEMEOFDATE', L.oemLines(eph))) };
    } catch (e) { row.arms.sgp4 = { ok: false, refused: short(e) }; }
  }
  row.seconds = (Date.now() - t0) / 1000;
  fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  count += 1;
  console.error(`w${k}: ${c.target} ${c.cutoff} ap ${row.arms.ap.ok ? JSON.stringify(Object.values(row.arms.ap.days).map((d) => +d.rmsKm.toFixed(3))) : row.arms.ap.refused} ${row.seconds.toFixed(0)} s`);
}
console.error(`w${k}/${n}: ${count} cutoffs`);
await h.close();
process.exit(0);

function thinned(truth, T) { return L.thinned(truth, T); }
