// EXPLORATORY, not a registered test (PLAN.md: a change after the first score is labeled exploratory and reported apart). What might beat XP on Starlink: the fits below, on the back-test's
// first satellites, whose results have been read. A candidate worth keeping is registered and confirmed on satellites nobody has read. Same reference, same pairs as backtest.mjs; rows join to
// its stored rows by satellite and file starts. Reads only the state vectors of the capture's $OCM sidecars and never prints one.
//   node experiments/operator-theory/explore.mjs --out <dir> --shard k/n [--count 100]
//   node experiments/operator-theory/explore.mjs --confirm --out <dir> --shard k/n     the registered test of CONFIRM.md: satellites 401 to 800, every finished capture, its arms and controls; rows table.mjs reads
//   X2flat   XP2 with no weather forecast: the last observed day held flat
//   X2seen   XP2 with the weather as later observed: the most a perfect forecast could give
//   X0s, X2s XP and XP2 with drag free to go negative (GAUSSIAN_SIGNED), since half of these files show no net decay
//   X0st, X2st  XP and XP2 fitted to more history: the first hours of the two files before, then this file
//   RFz      XP2's front-page recipe with no refusal: where FFM finds no drag, almost none is held
//   F-A      FFM with no atmosphere and one fitted signed along-track acceleration: all of drag and thrust as one number
//   F-lite   FFM at 20x20, no tides or relativity, tolerance 1e-8, steps to 300 s: how much of FFM's edge survives a much cheaper run
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as flatbuffers from 'flatbuffers';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';
import { openFfmHost, apriori, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const CAPTURE = '/opt/data/sdn-archive/operator-capture', OUT = args.out, COUNT = Number(args.count ?? 100);
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const HOUR = 3600000, DAY = 86400000, TRUTH_H = 3;
const FIRST = '2026-10-30T05-01-35-297Z';
const CONFIRM = args.confirm === 'true';
const LADDER = args.ladder === 'true';   // exploratory: how cheap FFM can go before its accuracy falls
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const short = (e) => String(e?.message ?? e).slice(0, 160);
const cycleMs = (id) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'));
const root = path.join(CAPTURE, 'cycles');
// The stored pass's pairs only: the cycles it read.
const stored = new Map();
for (const f of fs.readdirSync('/opt/data/sdn-archive/operator-theory/backtest').filter((n) => /^rows-pass1\.jsonl$/.test(n))) for (const l of fs.readFileSync(path.join('/opt/data/sdn-archive/operator-theory/backtest', f), 'utf8').split('\n')) if (l) { const r = JSON.parse(l); stored.set(`${r.norad}|${r.olderStart}|${r.newerStart}`, r.older); }
const cycles = fs.readdirSync(root).filter((d) => d >= FIRST && (CONFIRM || d <= '2026-11-01T13-01-35-305Z') && fs.existsSync(path.join(root, d, 'summary.json'))).sort();
const v2 = new Set(JSON.parse(/```json\n([\s\S]*?)```/.exec(fs.readFileSync(new URL('../operator-capture/SUBSETS.md', import.meta.url), 'utf8'))[1]).subsets.flatMap((s) => s.norads));
const forward = new Set(fs.readdirSync('/opt/data/sdn-archive/operator-theory/c20261101T0326/products').filter((n) => n.startsWith('starlink-')).map((n) => Number(n.split('-')[1])));
const held = (n) => parseInt(sha(`e13b-20261023:${n}`).slice(0, 8), 16) % 5 === 0;
const chosen = fs.readdirSync(path.join(root, FIRST)).filter((n) => /^\d+\.ocm$/.test(n)).map((n) => Number(n.split('.')[0])).filter((n) => !held(n) && !v2.has(n) && !forward.has(n)).sort((a, b) => sha(`operator-theory-backtest-20261101:${a}`).localeCompare(sha(`operator-theory-backtest-20261101:${b}`))).slice(CONFIRM ? 400 : 0, CONFIRM ? 800 : COUNT);
const mine = chosen.filter((n) => parseInt(sha(`shard:${n}`).slice(0, 8), 16) % SHARDS === SHARD);
function readHead(cycle, norad) {
  const file = path.join(root, cycle, `${norad}.ocm`);
  if (!fs.existsSync(file)) return null;
  const o = O.OCM.getSizePrefixedRootAsOCM(new flatbuffers.ByteBuffer(new Uint8Array(fs.readFileSync(file)))).unpack();
  const t0 = Date.parse(o.METADATA.START_TIME), step = o.STATE_STEP_SIZE * 1000, d = o.STATE_DATA, lines = [];
  for (let i = 0; i * 6 < d.length; i += 1) lines.push({ epoch: isoMs(t0 + i * step), r: [d[6 * i], d[6 * i + 1], d[6 * i + 2]], v: [d[6 * i + 3], d[6 * i + 4], d[6 * i + 5]] });
  return { cycle, norad, object: o.METADATA.OBJECT_NAME, start: isoMs(t0), t0, lines };
}
const FIT = { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior };
const SIGNED = { form: 'GAUSSIAN_SIGNED', mean: 0, sigma: 0.05 };
const PCF = { X0: S.pcfBytes({ forces: XMC.arms.X0.forces, fit: FIT }), X2: S.pcfBytes({ forces: XMC.arms.X2.forces, fit: FIT }), X0s: S.pcfBytes({ forces: XMC.arms.X0.forces, fit: { dragPrior: SIGNED, srpPrior: FIT.srpPrior } }), X2s: S.pcfBytes({ forces: XMC.arms.X2.forces, fit: { dragPrior: SIGNED, srpPrior: FIT.srpPrior } }) };
const pinned = (b) => S.pcfBytes({ forces: XMC.arms.X2.forces, fit: { dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, srpPrior: FIT.srpPrior } });
const spwOf = (rows) => S.spwBytes(rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG })));
const cache = new Map();
function weather(day) {
  if (!cache.has(day)) {
    const rows = weatherRows(day, '2026-07-15', '2026-12-14').rows;
    // Flat: the last day before the issue held for every later day.
    const last = isoMs(Date.parse(`${day}T00:00:00Z`) - DAY).slice(0, 10), base = rows.find((r) => r.DATE === last);
    const flat = rows.map((r) => (r.DATE > last ? { ...r, F107_OBS: base.F107_OBS, F107_OBS_CENTER81: base.F107_OBS_CENTER81, AP_AVG: base.AP_AVG } : r));
    cache.set(day, { rows, spw: spwOf(rows), flatSpw: spwOf(flat) });
  }
  return cache.get(day);
}
const seenRows = weatherRows('2026-11-01', '2026-07-15', '2026-12-14').rows, seenSpw = spwOf(seenRows);
const integrator = { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 };
const lite = { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 };
const agomOf = (n) => (n < 56000 ? 0.11 : 0.19);
const fullForces = (atmosphere) => ({ gravity: 'SPHERICAL_HARMONICS', degree: 70, order: 70, thirdBodies: [10, 301], srp: true, drag: true, atmosphere, solidTides: true, relativity: 'IERS_2010' });
const base = { sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01 };
const ladderArms = (norad, rows) => [
  ['L20', 20, true, 'NRLMSISE00', 1e-8], ['L12', 12, true, 'NRLMSISE00', 1e-8], ['L8', 8, true, 'NRLMSISE00', 1e-8], ['L4', 4, true, 'NRLMSISE00', 1e-8],
  ['L12-1e6', 12, true, 'NRLMSISE00', 1e-6], ['L8-1e6', 8, true, 'NRLMSISE00', 1e-6], ['L12-no-bodies', 12, false, 'NRLMSISE00', 1e-8], ['L12-exponential', 12, true, 'EXPONENTIAL', 1e-8],
].map(([name, degree, bodies, atmosphere, tolerance]) => [name, { ...base, forces: { gravity: 'SPHERICAL_HARMONICS', degree, order: degree, thirdBodies: bodies ? [10, 301] : [], srp: true, drag: true, atmosphere }, integrator: { tolerance, maxStep: 300, minStep: 1e-3 }, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.03 }], fixed: { agom: agomOf(norad) }, apriori: apriori([0.3]) }, rows]);
const M = await openModules();
const F = await openFfmHost();
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
fs.mkdirSync(OUT, { recursive: true });
const outRows = path.join(OUT, `rows-${SHARD}.jsonl`), outCost = path.join(OUT, `cost-${SHARD}.jsonl`);
const doneRows = new Set();
if (fs.existsSync(outRows)) for (const l of fs.readFileSync(outRows, 'utf8').split('\n')) if (l) { const r = JSON.parse(l); doneRows.add(`${r.norad}|${r.olderStart}|${r.newerStart}`); }
for (const norad of mine) {
  const heads = [];
  for (const cycle of cycles) { const h = readHead(cycle, norad); if (h && !heads.some((x) => x.start === h.start)) heads.push(h); }
  heads.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < heads.length; i += 1) {
    const older = heads[i];
    const done = CONFIRM ? doneRows : null;
    const refs = heads.slice(i + 1).filter((n) => { const h = (n.t0 - older.t0) / HOUR; return CONFIRM ? h > 6 && h <= 180 && !done.has(`${norad}|${older.start}|${n.start}`) : stored.has(`${norad}|${older.start}|${n.start}`); }).map((n) => { const truth = n.lines.filter((l) => Date.parse(l.epoch) <= n.t0 + TRUTH_H * HOUR); return { n, epochs: truth.map((l) => l.epoch), ms: truth.map((l) => Date.parse(l.epoch)), states: truth.map((l) => ({ r: l.r, v: l.v })) }; });
    if (!refs.length) continue;
    const day = isoMs(cycleMs(older.cycle) - 12 * HOUR).slice(0, 10), w = weather(day);
    const obj = { name: older.object, id: '', norad };
    const oem = (arc) => S.oemBytes({ frame: 'GCRF', object: obj, lines: arc, useableStart: arc[0].epoch, useableStop: arc.at(-1).epoch, originator: 'operator-theory' });
    const lines = older.lines, end = Date.parse(lines.at(-1).epoch);
    const stitched = i >= 2 ? [...heads[i - 2].lines.filter((l) => Date.parse(l.epoch) < heads[i - 1].t0), ...heads[i - 1].lines.filter((l) => Date.parse(l.epoch) < older.t0), ...lines] : null;
    const arms = {}, cost = { norad, start: older.start };
    const xp = async (name, arc, pcf, spw) => {
      const t = performance.now();
      try {
        const f = await M.fit(oem(arc), pcf, spw ? { rows: spw } : undefined);
        if (!f.ok) throw new Error(f.error);
        arms[name] = { omm: f.omm, pcf, extra: spw ? { rows: spw } : undefined };
        cost[name] = { fitMs: Math.round(performance.now() - t), bterm: S.readFitOmm(f.omm).bterm };
      } catch (error) { arms[name] = { error: short(error) }; }
    };
    if (!LADDER) await xp('X2flat', lines, PCF.X2, w.flatSpw);
    if (LADDER) { /* FFM only */ } else if (CONFIRM) { await xp('X0@16', lines, PCF.X0); await xp('X2@16', lines, PCF.X2, w.spw); }
    else { await xp('X2seen', lines, PCF.X2, seenSpw); await xp('X0s', lines, PCF.X0s); await xp('X2s', lines, PCF.X2s, w.spw); }
    if (stitched && !LADDER) { await xp('X0st', stitched, PCF.X0); await xp('X2st', stitched, PCF.X2, w.spw); }
    const ffmFit = async (name, arc, settings, rows) => {
      const t = performance.now();
      try {
        const f = await F.fit(arc, [...arc[0].r, ...arc[0].v], settings, rows, Date.parse(arc.at(-1).epoch));
        if (!f.state) throw new Error(f.error ?? f.termination);
        cost[name] = { fitMs: Math.round(performance.now() - t), termination: f.termination, value: f.parameters?.[0]?.value };
        return f;
      } catch (error) { cost[name] = { error: short(error) }; return { error }; }
    };
    // RFz: drag from FFM on the last 12 h, all 16 h for the elements, no refusal.
    if (!LADDER) {
      const drag = lines.filter((l) => Date.parse(l.epoch) >= end - 12 * HOUR);
      const settings = { ...base, forces: fullForces('NRLMSISE00'), integrator, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.03 }], fixed: { agom: agomOf(norad) }, apriori: apriori([0.3]) };
      const g = await ffmFit('RFz.drag', drag, settings, w.rows);
      if (g.error) arms.RFz = { error: short(g.error) };
      else { const b = Math.max(g.parameters[0].value, 1e-4); await xp('RFz', lines, pinned(b), w.spw); }
    }
    const flights = {};
    for (const [name, settings, rows] of LADDER ? ladderArms(norad, w.rows) : [
      CONFIRM
        ? ['F-NRLMSISE00@16', { ...base, forces: fullForces('NRLMSISE00'), integrator, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.03 }], fixed: { agom: agomOf(norad) }, apriori: apriori([0.3]) }, w.rows]
        : ['F-A', { ...base, forces: { ...fullForces('NRLMSISE00'), drag: false }, integrator, parameters: [{ kind: 'IN_TRACK_ACCELERATION', value: 0 }], fixed: { agom: agomOf(norad) }, apriori: apriori([1e-5]) }, w.rows],
      ['F-lite', { ...base, forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00' }, integrator: lite, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.03 }], fixed: { agom: agomOf(norad) }, apriori: apriori([0.3]) }, w.rows],
    ]) {
      const f = await ffmFit(name, lines, settings, rows);
      if (f.error) { flights[name] = { error: short(f.error) }; continue; }
      const all = [...new Set(refs.flatMap((r) => r.ms))].sort((a, b) => a - b).map(isoMs);
      const t = performance.now();
      try {
        const flown = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, all, { forces: settings.forces, fixed: settings.fixed, integrator: settings.integrator }, rows);
        cost[name].flyMs = Math.round(performance.now() - t); cost[name].flyHours = (Date.parse(all.at(-1)) - Date.parse(f.epoch)) / HOUR;
        flights[name] = new Map(all.map((e, k) => [e, flown[k]]));
      } catch (error) { flights[name] = { error: short(error) }; }
    }
    for (const ref of refs) {
      const row = { key: `starlink|${norad}`, source: 'starlink', norad, object: older.object, older: older.cycle, newer: ref.n.cycle, olderStart: older.start, newerStart: ref.n.start, leadHours: (ref.n.t0 - older.t0) / HOUR, truthStates: ref.epochs.length, weatherDay: day, arms: {} };
      const score = async (states) => { const e = await M.rtn(states, ref.states); return { km: Math.hypot(rmsOf(e.map((x) => x[0])), rmsOf(e.map((x) => x[1])), rmsOf(e.map((x) => x[2]))), r: rmsOf(e.map((x) => x[0])), t: rmsOf(e.map((x) => x[1])), n: rmsOf(e.map((x) => x[2])) }; };
      for (const [name, a] of Object.entries(arms)) {
        if (a.error) { row.arms[name] = { error: a.error }; continue; }
        try { row.arms[name] = await score(await M.toAxes(await M.propagate(a.omm, S.gridBytes(ref.epochs), a.pcf, a.extra, ref.epochs.length), ref.epochs, 'GCRF')); } catch (error) { row.arms[name] = { error: short(error) }; }
      }
      for (const [name, map] of Object.entries(flights)) {
        if (map.error) { row.arms[name] = { error: map.error }; continue; }
        try { row.arms[name] = await score(ref.epochs.map((e) => map.get(e))); } catch (error) { row.arms[name] = { error: short(error) }; }
      }
      fs.appendFileSync(outRows, `${JSON.stringify(row)}\n`);
    }
    fs.appendFileSync(outCost, `${JSON.stringify(cost)}\n`);
  }
}
await F.close(); await M.close();
process.exit(0);
