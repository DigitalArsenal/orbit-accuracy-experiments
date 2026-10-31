// C3-small's runner (PLAN.md sections 1, 2). One window at cutoff E of object o, through the arc-disjoint chain (lib/chain.mjs): C2's maneuver screen on the truth (reported stratum), the four reference
// fits to the allowed arcs (lead groups 1-12, 24, 48, 72 h), the class fit on the last 24 h of the latest arc ending by E, and one FFM run from the fit that gives every lead's terms, its error against
// truth, and its difference from the reference (lib/terms.mjs). R2 fits twice, under M and O (lib/weather-o.mjs); the reference fits are one set. FFM: RK78, relative tolerance 1e-10, steps up to 120 s;
// fit tracks at 600 s, outputs at the six leads and the 600 s noise grid. Rows: <store>/rows/<set>.s<k>.jsonl. Statistics live in score.mjs.
//   node experiments/ffm-covariance-adaptive/run.mjs --phase window --set calibration|validation --shard k/n [--limit m]
//   node experiments/ffm-covariance-adaptive/run.mjs --launch --set calibration,validation [--workers 12]   detached, PID file under <store>/logs
//   node experiments/ffm-covariance-adaptive/run.mjs --check                                                 the E2E: a stored window per class replayed bit for bit, with d2, g and u
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config, store, args, registered, Opened, grid, root, dir, readJsonl, c2Results, DAY, HOUR, iso, sha256, build, gitHead } from './common.mjs';
import { arcsOf, windowOf, referenceTrack, screenTrack, familyOf, msOf } from './lib/chain.mjs';
import { openChain, settingsFor } from './lib/open.mjs';
import { openSeeds } from './lib/seeds.mjs';
import { openWeatherO } from './lib/weather-o.mjs';
import { carry, windowTermsRef } from './lib/terms.mjs';
import { openGfz } from './lib/gfz.mjs';

const rowsDir = path.join(store, 'rows');
const fitInput = (lines) => ({ points: lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference: { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) } });
const NAMES = Object.fromEntries([...Object.entries(config.population.judged.ilrsa), ...Object.entries(config.population.judged.nsgf), ...Object.entries(config.population.reported.nsgf)].map(([k, v]) => [v, k]));
const CAL = new Set(config.population.calVal.R2);
const classOf = (norad) => (CAL.has(norad) || Object.values(config.population.reported.nsgf).includes(norad) ? 'R2' : 'R3');
/** The cutoffs of a set for an object: ilrsa on Sundays, everything else on the 3-day grid. */
export function cutoffsOf(norad, setName) {
  const s = config.sets[setName];
  if (familyOf(norad) !== 'ilrsa') return grid(s.from, s.to, s.everyDays);
  const out = [];
  for (let t = Date.parse(`${s.from}T00:00:00Z`); t <= Date.parse(`${s.to}T00:00:00Z`); t += DAY) if (new Date(t).getUTCDay() === 0) out.push(t);
  return out;
}
const GROUPS = [{ center: 12, leads: [1, 6, 12] }, { center: 24, leads: [24] }, { center: 48, leads: [48] }, { center: 72, leads: [72] }];
const fitRecord = (f) => ({ ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, epoch: f.epoch, state: f.state, parameters: f.parameters, reducedChiSquare: f.reducedChiSquare, weightedRms: f.weightedRms, iterations: f.iterations, rejectedTrials: f.rejectedTrials, refusedTrials: f.refusedTrials, covariance: f.covariance });

/** One object's window: the rows of its classes (R3, or R2-M and R2-O). */
export async function runWindow(S, norad, E, setName) {
  const { chain, WO, seedOf, B2C, fitV3 } = S;
  const cls = classOf(norad), family = familyOf(norad);
  const arcs = S.arcsFor(norad);
  const win = windowOf(norad, arcs, E, { leadToleranceSeconds: B2C.a5.ca.leadToleranceSeconds.laser });
  const head = { norad, name: NAMES[norad] ?? seedOf(norad).name, family, set: setName, E: iso(E), tIn: win.tIn ?? null, product: win.product ?? null, coverage: win.coverage ?? null };
  const classes = cls === 'R3' ? [{ cls: 'R3', weather: 'M' }] : [{ cls: 'R2-M', weather: 'M' }, { cls: 'R2-O', weather: 'O' }];
  if (win.excluded) return classes.map((c) => ({ ...head, cls: c.cls, excluded: win.excluded }));
  const tIn = win.tInMs, seconds = {};
  const seed = seedOf(norad), settings = settingsFor(cls, seed, cls !== 'R3', B2C), settingsB = settingsFor(cls, seed, true, B2C);
  // C2's screen (C2-A4 point 4): reported stratum
  let screen = null;
  let t0 = Date.now();
  try {
    const track = screenTrack(norad, win);
    const f = await fitV3(chain.ctxFor(tIn - 24 * HOUR, tIn + 72 * HOUR), fitInput(track).points, fitInput(track).reference, settingsB);
    const rms = f.weightedRms != null ? Math.sqrt(3) * 10 * f.weightedRms : null;
    screen = { ok: f.ok, termination: f.termination ?? null, points: track.length, rms3dM: rms, flagged: f.ok && rms > 5, failed: !f.ok };
  } catch (error) { screen = { ok: false, failed: true, refusal: String(error.message).slice(0, 200) }; }
  seconds.screen = (Date.now() - t0) / 1000;
  // the reference fits
  t0 = Date.now();
  const refByLead = new Map(), refGroups = [];
  const epochOf = (l) => (l.line ? msOf(l.line.epoch) : l.epochMs);
  for (const g of GROUPS) {
    const tr = referenceTrack(win, g.center);
    const record = { center: g.center, start: tr.start ?? null };
    if (tr.excluded) { refGroups.push({ ...record, excluded: tr.excluded }); continue; }
    const leads = win.leads.filter((l) => g.leads.includes(l.L) && epochOf(l) >= msOf(tr.track[0].epoch));
    if (!leads.length) { refGroups.push({ ...record, excluded: 'no lead at or after the reference track start' }); continue; }
    try {
      const ctx = chain.ctxFor(msOf(tr.track[0].epoch), msOf(tr.track.at(-1).epoch));
      const fi = fitInput(tr.track);
      const f = await fitV3(ctx, fi.points, fi.reference, settings);
      // each file's own last epoch: what availability is measured from (PLAN.md section 2)
      Object.assign(record, { products: tr.products, productStops: tr.products.map((p) => iso(arcs.find((a) => a.product === p).stop)), coverage: tr.coverage, ok: f.ok, termination: f.termination ?? null, reducedChiSquare: f.reducedChiSquare, iterations: f.iterations, rejectedTrials: f.rejectedTrials });
      if (f.ok) for (const x of await carry(ctx, f, leads.map(epochOf), settings)) { const l = leads.find((y) => epochOf(y) === x.epochMs); refByLead.set(l.L, { state: x.state, covariance: x.covariance, group: g.center }); }
    } catch (error) { record.refusal = String(error.message).slice(0, 200); }
    refGroups.push(record);
  }
  seconds.references = (Date.now() - t0) / 1000;
  const rows = [];
  for (const c of classes) {
    const row = { ...head, cls: c.cls, weather: c.weather, screen, refGroups, seconds: { ...seconds } };
    t0 = Date.now();
    try {
      let ctx = chain.ctxFor(tIn - 24 * HOUR, tIn + 72 * HOUR);
      if (c.weather === 'O') { const o2 = WO.inputsO(ctx.inputs, E, tIn + 72 * HOUR); if (o2.excluded) { row.excluded = `condition O: ${o2.excluded}`; rows.push(row); continue; } ctx = { ...ctx, inputs: o2.inputs }; row.rsga = o2.rsga; }
      const { points, reference } = fitInput(win.track);
      const f = await fitV3(ctx, points, reference, settings);
      row.fit = fitRecord(f);
      row.trackMaxSigmaM = Math.max(...win.track.map((l) => l.sigma ?? 0));
      row.seconds.fit = (Date.now() - t0) / 1000;
      if (f.ok) {
        t0 = Date.now();
        // the forecast minus GFZ at each GNSS lead's epoch, from the same FFM run (C3-A5); no extra fit
        const leads = win.leads.map((l) => ({ ...l, ref: refByLead.get(l.L) ?? null, gfz: family === 'gnss' && l.line ? S.gfzAt(norad, l.line.epoch) : null }));
        const t = await windowTermsRef(ctx, S.pairs, f, tIn, leads, settings);
        row.leads = t.leads; row.cov0Scale = t.cov0Scale;
        row.seconds.terms = (Date.now() - t0) / 1000;
      }
    } catch (error) { row.refused = String(error.message).slice(0, 240); }
    rows.push(row);
  }
  return rows;
}

export async function openSession(opened, { fromMs, toMs, allowedToMs }) {
  const { b2 } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/precise.mjs'));
  const { fitV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
  const B2C = JSON.parse(fs.readFileSync(b2('config.json')));
  const chain = await openChain('pin', { opened });
  const arcsCache = new Map();
  return { chain, pairs: chain.pairs, B2C, fitV3, WO: await openWeatherO(), seedOf: openSeeds(opened), gfzAt: openGfz(opened),
    arcsFor: (norad) => { if (!arcsCache.has(norad)) { if (arcsCache.size > 8) arcsCache.delete(arcsCache.keys().next().value); arcsCache.set(norad, arcsOf(norad, { fromMs, toMs, allowedToMs, opened })); } return arcsCache.get(norad); } };
}

const SPANS = { calibration: { fromMs: Date.parse('2025-09-20T00:00:00Z'), toMs: Date.parse('2026-04-15T00:00:00Z') }, validation: { fromMs: Date.parse('2026-03-20T00:00:00Z'), toMs: Date.parse('2026-06-15T00:00:00Z') } };
const ALLOWED = Date.parse('2026-06-15T00:00:00Z'); // before the freeze nothing later is opened (P10)

if (import.meta.url === `file://${process.argv[1]}`) {
  registered();
  if (args.launch) {
    const workers = Number(args.workers ?? config.workers), sets = String(args.set ?? 'calibration,validation').split(',');
    fs.mkdirSync(path.join(store, 'logs'), { recursive: true });
    const pids = [];
    for (const set of sets) {
      const share = sets.length > 1 ? Math.max(1, Math.round(workers * (set === 'calibration' ? 0.75 : 0.25))) : workers;
      for (let k = 0; k < share; k += 1) {
        const log = fs.openSync(path.join(store, 'logs', `${set}.s${k}.log`), 'a');
        const p = spawn('nice', ['-n', '5', process.execPath, '--max-old-space-size=4096', path.join(dir, 'run.mjs'), '--phase', 'window', '--set', set, '--shard', `${k}/${share}`], { cwd: root, detached: true, stdio: ['ignore', log, log] });
        p.unref();
        pids.push({ pid: p.pid, set, shard: `${k}/${share}` });
      }
    }
    fs.writeFileSync(path.join(store, 'logs', 'run.pids.json'), JSON.stringify({ started: new Date().toISOString(), commit: gitHead(), pids }, null, 1));
    console.log(JSON.stringify(pids));
    process.exit(0);
  }
  if (args.phase === 'window') {
    const opened = new Opened();
    const setName = args.set;
    if (!['calibration', 'validation'].includes(setName)) throw new Error('--set calibration|validation (history and fresh run sealed after the freeze)');
    const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
    fs.mkdirSync(rowsDir, { recursive: true });
    const out = path.join(rowsDir, `${setName}.s${k}.jsonl`);
    const done = new Set(readJsonl(out).map((r) => `${r.cls}|${r.norad}|${r.E}`));
    const S = await openSession(opened, { ...SPANS[setName], allowedToMs: ALLOWED });
    const list = config.population.calVal;
    const tasks = [...list.R3, ...list.R2].flatMap((norad) => cutoffsOf(norad, setName).map((E) => [norad, E]));
    const lastTIn = new Map();
    let count = 0;
    for (let i = 0; i < tasks.length; i += 1) {
      const [norad, E] = tasks[i];
      if (i % n !== k) continue;
      if (args.limit && count >= Number(args.limit)) break;
      const firstClass = classOf(norad) === 'R3' ? 'R3' : 'R2-M';
      if (done.has(`${firstClass}|${norad}|${iso(E)}`)) continue;
      const t0 = Date.now();
      for (const row of await runWindow(S, norad, E, setName)) { row.secondsTotal = (Date.now() - t0) / 1000; fs.appendFileSync(out, `${JSON.stringify(row)}\n`); }
      count += 1;
      if (count % 5 === 0) console.error(`${setName} shard ${k}/${n}: ${count} windows, last ${norad} ${iso(E).slice(0, 10)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    fs.mkdirSync(path.join(store, 'opened'), { recursive: true });
    fs.writeFileSync(path.join(store, 'opened', `${setName}.s${k}.json`), JSON.stringify(opened.list()));
    console.error(`${setName} shard ${k}/${n}: finished, ${count} windows`);
    process.exit(0);
  }
  if (args.check) {
    const { check } = await import('./check.mjs');
    await check();
    process.exit(0);
  }
  console.error('--launch | --phase window | --check');
  process.exit(2);
}
