// The forward test (PLAN.md): each arm's fitted product, and the operator's own forecast, against the first hours of a NEWER file of the same object. Nothing is fetched:
// both sides are in the cycles arms.mjs stored. A row is one (older file, newer file, object) pair; lead is the newer file's start less the older file's start. A file
// is counted once, from the first cycle that held it. Rows already in --out are not run again, so a later cycle only adds pairs.
//   node experiments/operator-theory/score.mjs --root /opt/data/sdn-archive/operator-theory --out <file> [--shard k/n] [--truth-hours 3] [--max-lead 180]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openFfmHost, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import { openAp } from './lib/ap.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = args.root ?? '/opt/data/sdn-archive/operator-theory';
const TRUTH_H = Number(args['truth-hours'] ?? 3);
const MAX_LEAD_H = Number(args['max-lead'] ?? 180);
const MIN_GAP_H = 6;
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const OUT = args.out;
if (!OUT) throw new Error('--out <file>');
const HOUR = 3600000;
const FIT = { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior };
const PCF = { X0: S.pcfBytes({ forces: XMC.arms.X0.forces, fit: FIT }), X2: S.pcfBytes({ forces: XMC.arms.X2.forces, fit: FIT }) };
const pinned = (b) => S.pcfBytes({ forces: XMC.arms.X2.forces, fit: { dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, srpPrior: FIT.srpPrior } });
const integrator = { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 };

// The registered cycles are the 12-hourly ones, named c<date>T<time>; each holds the operator's forecast.
const cycles = fs.readdirSync(ROOT).filter((d) => /^c\d{8}T\d{4}$/.test(d) && fs.existsSync(path.join(ROOT, d, 'products'))).sort();
const read = (ref) => JSON.parse(fs.readFileSync(ref.file, 'utf8'));
const items = new Map();
for (const c of cycles) for (const f of fs.readdirSync(path.join(ROOT, c, 'products'))) {
  const file = path.join(ROOT, c, 'products', f);
  const p = read({ file });
  if (!p.start || !p.forecastOem) continue;
  const key = `${p.source}|${p.norad}`;
  const list = items.get(key) ?? items.set(key, []).get(key);
  if (!list.some((x) => x.start === p.start)) list.push({ start: p.start, cycle: c, file, object: p.object, source: p.source, norad: p.norad });
}
const done = new Set();
if (fs.existsSync(OUT)) for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) if (line) { const r = JSON.parse(line); done.add(`${r.key}|${r.olderStart}|${r.newerStart}`); }
const inShard = (id) => parseInt(crypto.createHash('sha256').update(id).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;

const forecastLines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
/** Lagrange interpolation of a 300 s table, degree 7, position and velocity: a data step; about 1 m in low orbit. */
function interpolate(lines, t) {
  const ts = lines.map((l) => Date.parse(l.epoch));
  const i = ts.findIndex((x) => x >= t);
  if (i < 0 || t < ts[0]) return null;
  const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
  const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : acc * (t - ts[b]) / (ts[a] - ts[b])), 1));
  const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(lines[a])[c], 0));
  return { r: mix((l) => l.r), v: mix((l) => l.v) };
}
const weatherOf = new Map();
function weather(day) {
  if (!weatherOf.has(day)) {
    const w = weatherRows(day, args['weather-from'] ?? '2026-07-15', '2026-12-14');
    weatherOf.set(day, { rows: w.rows, spw: S.spwBytes(w.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG }))) });
  }
  return weatherOf.get(day);
}
const M = await openModules();
const A = args['ap-wasm'] ? await openAp(args['ap-wasm']) : null;
const F = await openFfmHost();
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
let added = 0;
for (const [key, list] of items) {
  list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const olderRef = list[i], newerRef = list[j];
    const leadHours = (Date.parse(newerRef.start) - Date.parse(olderRef.start)) / HOUR;
    if (leadHours <= MIN_GAP_H || leadHours > MAX_LEAD_H) continue;
    const id = `${key}|${olderRef.start}|${newerRef.start}`;
    if (done.has(id) || !inShard(id)) continue;
    const older = read(olderRef), newer = read(newerRef);
    const t0 = Date.parse(newer.start);
    const truth = forecastLines(newer.forecastOem).filter((l) => Date.parse(l.epoch) <= t0 + TRUTH_H * HOUR);
    const epochs = truth.map((l) => l.epoch), epochsMs = epochs.map((e) => Date.parse(e));
    const truthStates = truth.map((l) => ({ r: l.r, v: l.v }));
    const row = { key, source: older.source, norad: older.norad, object: older.object, older: olderRef.cycle, newer: newerRef.cycle, olderStart: older.start, newerStart: newer.start, leadHours, truthStates: truth.length, weatherDay: older.weatherDay, arms: {} };
    const score = async (states) => {
      const e = await M.rtn(states, truthStates);
      return { km: Math.hypot(rmsOf(e.map((x) => x[0])), rmsOf(e.map((x) => x[1])), rmsOf(e.map((x) => x[2]))), r: rmsOf(e.map((x) => x[0])), t: rmsOf(e.map((x) => x[1])), n: rmsOf(e.map((x) => x[2])) };
    };
    const table = forecastLines(older.forecastOem);
    const states = epochsMs.map((t) => interpolate(table, t));
    if (states.every(Boolean)) row.arms.operator = await score(states);
    const w = weather(older.weatherDay);
    for (const [name, product] of Object.entries(older.products)) {
      try {
        if (name.startsWith('S')) {
          // An SGP4 set flies on SGP4, on a grid from the first truth epoch.
          const flown = await M.propagateSgp4(product, older.norad, epochsMs, (epochsMs[1] - epochsMs[0]) / 1000);
          if (flown.some((x) => !x)) throw new Error('SGP4 returned no state');
          row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
        } else if (name.startsWith('A-')) {
          const pcf = S.pcfBytes({ forces: product.forces, fit: FIT });
          const flown = await A.propagate(Buffer.from(product.omm, 'base64'), S.gridBytes(epochs), pcf, product.atmosphere ? { rows: w.spw } : undefined, epochs.length);
          row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
        } else if (name.startsWith('X')) {
          const kind = name.split('@')[0];
          const flown = await M.propagate(Buffer.from(product, 'base64'), S.gridBytes(epochs), PCF[kind], kind === 'X2' ? { rows: w.spw } : undefined, epochs.length);
          row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
        } else if (name.startsWith('RFa')) {
          const flown = await M.propagate(Buffer.from(product.omm, 'base64'), S.gridBytes(epochs), pinned(product.b), { rows: w.spw }, epochs.length);
          row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
        } else if (name.startsWith('F-')) {
          const settings = { forces: product.forces, fixed: product.fixed, integrator: product.integrator ?? integrator };
          const flown = await F.forecast({ epoch: product.epoch, state: product.state, parameters: product.parameters }, epochs, settings, w.rows);
          row.arms[name] = await score(flown);
        }
      } catch (error) { row.arms[name] = { error: String(error.message).slice(0, 160) }; }
    }
    fs.appendFileSync(OUT, `${JSON.stringify(row)}\n`);
    added += 1;
  }
}
console.error(`${added} pairs added, shard ${SHARD}/${SHARDS}, ${cycles.length} cycles`);
await F.close(); await M.close();
process.exit(0);
