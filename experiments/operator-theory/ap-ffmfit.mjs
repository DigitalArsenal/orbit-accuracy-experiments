// AP fitted to FFM's forecast across the days it will fly. FFM's stored fit of the operator's states is carried over the window; the states it makes are AP's data. FFM is seeded
// from operator states, never from an SGP4 set. Scored as score.mjs: against the first hours of a newer file of the same object. Nothing raw is written. Rows already in --out are
// not run again.
//   node experiments/operator-theory/ap-ffmfit.mjs --root <store> --out <file> [--shard k/n]
//     exploratory (vendors' store, days already read): arms A-AP@48, APF-96, APF-180 and the stored FFM, [--windows 96,180] [--high-keep n]
//   node experiments/operator-theory/ap-ffmfit.mjs --registered --root <cheaper store> --ap-wasm <file> --out <file> --shard k/n --weather-from 2026-02-20
//     AP3.md: one arm, APF, fitted to the cheaper FFM's forecast from the file's start to 180 h; its controls are read from stored rows by pair.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openFfmHost, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { apForces, openAp, fitPcf, fitWeather, rowsOfSpw, horizonOf, readOcm } from './lib/ap.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = args.root, OUT = args.out;
if (!ROOT || !OUT) throw new Error('--root --out');
const REGISTERED = args.registered === 'true';
const ARC = Number(args.arc ?? 48);
const WINDOWS = REGISTERED ? [180] : (args.windows ?? '96,180').split(',').map(Number);
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const HOUR = 3600000, STEP_MS = 300000, TRUTH_H = 3, MIN_GAP_H = 6, MAX_LEAD_H = 180;
const integrator = { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 };
const short = (e) => String(e?.message ?? e).slice(0, 200);
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
const inShard = (id) => parseInt(crypto.createHash('sha256').update(id).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
const forecastLines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
const windowName = (hours) => (REGISTERED ? 'APF' : `APF-${hours}`);

const items = new Map();
for (const c of fs.readdirSync(ROOT).filter((d) => /^c\d{8}T\d{4}$/.test(d)).sort()) {
  const dir = path.join(ROOT, c, 'products');
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!p.start || !p.forecastOem) continue;
    const key = `${p.source}|${p.norad}`;
    const list = items.get(key) ?? items.set(key, []).get(key);
    if (!list.some((x) => x.start === p.start)) list.push({ start: p.start, cycle: c, file });
  }
}
const done = new Set();
if (fs.existsSync(OUT)) for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) if (line) done.add(JSON.parse(line).id);

const weatherOf = new Map();
function weather(day) {
  if (!weatherOf.has(day)) {
    const w = weatherRows(day, args['weather-from'] ?? '2026-07-15', '2026-12-14');
    weatherOf.set(day, { rows: w.rows, spw: fitWeather(rowsOfSpw(w.rows), horizonOf(Date.parse(`${day}T00:00:00Z`) + 2 * 86400000)) });
  }
  return weatherOf.get(day);
}

const M = await openModules();
const A = await openAp();
const F = await openFfmHost();
const forces = apForces({ tesseral: 31, zonal: 20 });
const pcf = fitPcf({ forces, fit: null });
let added = 0;
for (const [key, list] of items) {
  list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (let i = 0; i < list.length; i += 1) {
    const olderRef = list[i];
    const pairs = list.slice(i + 1).map((n) => ({ n, lead: (Date.parse(n.start) - Date.parse(olderRef.start)) / HOUR })).filter((x) => x.lead > MIN_GAP_H && x.lead <= MAX_LEAD_H && !done.has(`${key}|${olderRef.start}|${x.n.start}`) && inShard(`${key}|${olderRef.start}`));
    if (!pairs.length) continue;
    const older = JSON.parse(fs.readFileSync(olderRef.file, 'utf8'));
    const leo = older.source.endsWith('-leo');
    // --high-keep n: one file in n above the drag regime, by hash of object and start, so an exploratory run stays small.
    if (!leo && parseInt(crypto.createHash('sha256').update(`high|${key}|${olderRef.start}`).digest('hex').slice(0, 8), 16) % Number(args['high-keep'] ?? 1) !== 0) continue;
    const ffmName = REGISTERED ? `F-${leo ? 'M40' : 'H20'}@${ARC}` : `F-${leo ? 'NRLMSISE00' : 'NO-DRAG'}@${ARC}`;
    const product = older.products[ffmName];
    const lines = forecastLines(older.forecastOem);
    const t0 = Date.parse(older.start);
    if (!REGISTERED && (!product || Date.parse(lines.at(-1).epoch) - t0 < ARC * HOUR)) continue;
    const w = weather(older.weatherDay);
    const object = { name: older.object, id: '', norad: older.norad };
    const extra = { spw: w.spw };
    const oemOf = (arc) => S.oemBytes({ frame: 'GCRF', object, lines: arc, useableStart: arc[0].epoch, useableStop: arc.at(-1).epoch, originator: 'operator-theory' });
    const settings = product ? { forces: product.forces, fixed: product.fixed, integrator: product.integrator ?? integrator } : null;
    const fitted = {}, cost = {};
    const fitAp = async (name, data) => {
      const t = performance.now();
      const f = await A.fit(oemOf(data), pcf, extra);
      cost[name] = { fitMs: Math.round(performance.now() - t) };
      if (!f.ok) { cost[name].error = f.error; return; }
      const info = readOcm(f.ocm);
      Object.assign(cost[name], { rmsKm: info.fitRmsKm, bterm: info.bterm, agom: info.agom, states: data.length });
      fitted[name] = f.ocm;
    };
    // The exploratory arm everything is read against: AP on the operator's own arc.
    if (!REGISTERED) await fitAp(`A-AP@${ARC}`, lines.filter((l) => Date.parse(l.epoch) <= t0 + ARC * HOUR));
    // FFM over the longest window once, on the 300 s grid; each window is a cut of it.
    const longest = Math.max(...WINDOWS);
    const grid = Array.from({ length: Math.floor(longest * HOUR / STEP_MS) + 1 }, (_, k) => isoMs(t0 + k * STEP_MS));
    let ffmStates = null, ffmMs = null;
    if (product) {
      try {
        const t = performance.now();
        const flown = await F.forecast({ epoch: product.epoch, state: product.state, parameters: product.parameters }, grid, settings, w.rows);
        ffmMs = Math.round(performance.now() - t);
        ffmStates = grid.map((epoch, k) => ({ epoch, r: flown[k].r, v: flown[k].v }));
      } catch (error) { cost.ffm = { error: short(error) }; }
    } else cost.ffm = { error: `no ${ffmName}` };
    if (ffmStates) for (const hours of WINDOWS) await fitAp(windowName(hours), ffmStates.filter((l) => Date.parse(l.epoch) <= t0 + hours * HOUR));
    const newerCache = new Map();
    for (const { n, lead } of pairs) {
      const newer = newerCache.get(n.file) ?? JSON.parse(fs.readFileSync(n.file, 'utf8'));
      newerCache.set(n.file, newer);
      const n0 = Date.parse(newer.start);
      const truth = forecastLines(newer.forecastOem).filter((l) => Date.parse(l.epoch) <= n0 + TRUTH_H * HOUR);
      const epochs = truth.map((l) => l.epoch), truthStates = truth.map((l) => ({ r: l.r, v: l.v }));
      const score = async (states) => {
        const e = await M.rtn(states, truthStates);
        return { km: Math.hypot(rmsOf(e.map((x) => x[0])), rmsOf(e.map((x) => x[1])), rmsOf(e.map((x) => x[2]))), r: rmsOf(e.map((x) => x[0])), t: rmsOf(e.map((x) => x[1])), n: rmsOf(e.map((x) => x[2])) };
      };
      const row = { id: `${key}|${older.start}|${newer.start}`, key, source: older.source, norad: older.norad, object: older.object, olderStart: older.start, newerStart: newer.start, leadHours: lead, weatherDay: older.weatherDay, truthStates: truth.length, ffmName, ffmMs, cost, arms: {} };
      for (const [name, ocm] of Object.entries(fitted)) {
        try {
          const flown = await A.propagate(ocm, epochs, epochs.length);
          row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
        } catch (error) { row.arms[name] = { error: short(error) }; }
      }
      if (!REGISTERED) {
        try {
          row.arms[ffmName] = await score(await F.forecast({ epoch: product.epoch, state: product.state, parameters: product.parameters }, epochs, settings, w.rows));
        } catch (error) { row.arms[ffmName] = { error: short(error) }; }
      }
      fs.appendFileSync(OUT, `${JSON.stringify(row)}\n`);
      added += 1;
    }
  }
}
console.error(`${added} pairs added, shard ${SHARD}/${SHARDS}`);
await F.close(); await M.close();
process.exit(0);
