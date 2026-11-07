// COMPARE.md, report only: AP, XP and SGP4 on every provider this work stores forecasts of, by the pair rule of score.mjs: fitted to the start of an older file, flown to the first
// 3 h of a newer file of the same object from the same provider. The stored rows of the forward test and the vendor test give FFM and the provider's own forecast. The ISS has its own
// archive here, read with NASA's stated drag and as-issued weather, and flies FFM in this file. A newer file is the provider's own later solution, not truth. Module calls only.
// Every Starlink group is held (XP-ARM-0-2-1.md): no Starlink file is opened.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/providers-run.mjs --out <dir> --shard k/n [--pairs <store>]            the stored forecasts
//   XP2F_CONTROL=1 SDN_MODULES_ROOT=<modules> node experiments/operator-theory/providers-run.mjs --out <dir> --iss --shard k/n [--pairs <store>]
// --pairs: only the pairs of that store's rows (a registered set, lib/pairs.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isoMs, openFfmHost, openAxes, apriori } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { apForces, openAp, fitPcf, fitWeather, rowsOfSpw, horizonOf } from './lib/ap.mjs';
import { openUssfXp } from './lib/ussf-xp.mjs';
import { openSgp4Fit } from './lib/xp2.mjs';
import { pairsOf } from './lib/pairs.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const OUT = args.out, ISS = args.iss === 'true';
// --arms U: the Space Force's SGP4-XP alone, in its own store, on the same files and pairs. --arms AP,XP (any of AP, XP, S, F): only those, in their
// own store, as for a later AP build (AP7.md); --ap-name names that build's AP arm (default APn, AP 0.4.0's).
const ARMS = (args.arms ?? 'AP,XP,S,F').split(','), ONLY_U = ARMS.includes('U'), has = (a) => !ONLY_U && ARMS.includes(a), AP_NAME = `A-${args['ap-name'] ?? 'APn'}`;
if (!OUT) throw new Error('--out');
const PAIRS = args.pairs ? pairsOf(args.pairs) : null;
const STORE = '/opt/data/sdn-archive/operator-theory', HOUR = 3600000, DAY = 86400000, TRUTH_H = 3, MAX_LEAD_H = 180, MIN_GAP_H = 6, ARCS = [24, 48];
const FROM_FORWARD = new Set(['iss', 'css']), FROM_VENDORS = new Set(['gps', 'glonass', 'planet', 'intelsat', 'ses']);
const ISS_ARCHIVE = '/opt/data/sdn-archive/hac/nasa-iss-oem-archive';
const lines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
function interpolate(table, t) {
  const ts = table.map((l) => Date.parse(l.epoch));
  const i = ts.findIndex((x) => x >= t);
  if (i < 0 || t < ts[0]) return null;
  const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
  const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
  const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(table[a])[c], 0));
  return { r: mix((l) => l.r), v: mix((l) => l.v) };
}

const M = await openModules(), A = has('AP') || has('XP') ? await openAp() : null, G = has('S') ? await openSgp4Fit() : null, U = ONLY_U ? await openUssfXp() : null;
const F = ISS && has('F') ? await openFfmHost() : null;
const axes = ISS ? await openAxes() : null;
const W = ISS ? await import('../xp-atmosphere-merit/lib/weather.mjs') : null;
const { driverRows } = ISS ? await import('./lib/xm3.mjs') : {};
const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null }), PCF_XP = fitPcf({ forces: {}, fit: null });

/** The forecasts of one object, oldest first: { source, norad, object, start, read() => { lines (GCRF), spw, rows, statedB } }. */
function items() {
  const out = new Map();
  const put = (key, item) => { if (!inShard(key)) return; const list = out.get(key) ?? out.set(key, []).get(key); if (!list.some((x) => x.start === item.start)) list.push(item); };
  if (ISS) {
    for (const d of fs.readdirSync(ISS_ARCHIVE).filter((n) => /^2026-0[1-5]-\d\d$/.test(n)).sort()) {
      const file = path.join(ISS_ARCHIVE, d, 'ISS.OEM_J2K_EPH.txt');
      if (!fs.existsSync(file)) continue;
      const first = /^(\d{4}-\d{2}-\d{2}T[\d:.]+)\s/m.exec(fs.readFileSync(file, 'utf8').slice(0, 20000))?.[1];
      if (first) put('iss|25544', { source: 'iss', norad: 25544, object: 'ISS', start: isoMs(Date.parse(`${first}Z`)), file });
    }
    return out;
  }
  for (const [root, keep] of [[STORE, FROM_FORWARD], [path.join(STORE, 'vendors'), FROM_VENDORS]]) {
    for (const c of fs.readdirSync(root).filter((d) => /^c\d{8}T\d{4}$/.test(d) && fs.existsSync(path.join(root, d, 'products'))).sort()) {
      for (const f of fs.readdirSync(path.join(root, c, 'products'))) {
        if (!keep.has(f.split('-')[0])) continue;
        const file = path.join(root, c, 'products', f);
        const p = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!p.start || !p.forecastOem) continue;
        put(`${p.source}|${p.norad ?? p.object}`, { source: p.source, norad: p.norad, object: p.object, start: p.start, file, weatherDay: p.weatherDay, stored: true });
      }
    }
  }
  return out;
}
const issCache = new Map();
async function linesOf(item) {
  if (item.stored) return lines(JSON.parse(fs.readFileSync(item.file, 'utf8')).forecastOem);
  if (issCache.has(item.file)) return issCache.get(item.file);
  const text = fs.readFileSync(item.file, 'utf8');
  const raw = [];
  for (const line of text.split('\n')) { const t = line.trim().split(/\s+/); if (t.length === 7 && /^\d{4}-\d\d-\d\dT/.test(t[0])) raw.push({ epoch: isoMs(Date.parse(`${t[0]}Z`)), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) }); }
  const num = (name) => Number(new RegExp(`COMMENT ${name}=([0-9.]+)`).exec(text)?.[1]);
  const gcrf = await axes.convert(raw, 'EME2000', 'GCRF');
  gcrf.statedB = (num('DRAG_COEFF') * num('DRAG_AREA')) / num('MASS');
  if (issCache.size > 12) issCache.delete(issCache.keys().next().value);
  issCache.set(item.file, gcrf);
  return gcrf;
}
const fitsCache = new Map();
async function fitsOf(item) {
  if (fitsCache.has(item.start)) return fitsCache.get(item.start);
  const all = await linesOf(item);
  const t0 = Date.parse(all[0].epoch), tEnd = Date.parse(all.at(-1).epoch);
  const object = { name: item.object, id: '', norad: item.norad };
  let rows, spw;
  if (ISS) {
    const O = W.rowsO(t0 - 72 * HOUR - XMC.conditions.rowsMarginDays * DAY, t0);
    if (O.excluded) throw new Error(O.excluded);
    rows = O.rows;
    spw = driverRows(O.rows, t0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
  } else rows = rowsOfSpw(weatherRows(item.weatherDay, '2026-07-15', '2026-12-14').rows);
  const out = { spw, arms: {} };
  for (const arc of ARCS) {
    if (tEnd - t0 < arc * HOUR) continue;
    const seg = all.filter((l) => Date.parse(l.epoch) <= t0 + arc * HOUR);
    if (seg.length < 5) continue;
    const oem = S.oemBytes({ frame: 'GCRF', object, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
    if (ONLY_U) { const u = await U.fit(oem); out.arms[`U-XP@${arc}`] = u.ok ? { ocm: u.ocm, ussf: true } : { error: u.error }; continue; }
    if (has('AP')) { const f = await A.fit(oem, PCF_AP, { spw: fitWeather(rows, horizonOf(t0 + arc * HOUR)) }); out.arms[`${AP_NAME}@${arc}`] = f.ok ? { ocm: f.ocm } : { error: f.error }; }
    if (has('XP')) { const x = await A.fit(oem, PCF_XP, undefined); out.arms[`A-XP@${arc}`] = x.ok ? { ocm: x.ocm } : { error: x.error }; }
    if (item.norad && has('S')) {
      try { out.arms[`S@${arc}`] = { el: (await G.fit(oem, { from: seg[0].epoch, to: seg.at(-1).epoch, epoch: 'first', fitBstar: true }, { name: item.object, objectId: '' })).el }; } catch (error) { out.arms[`S@${arc}`] = { error: String(error.message).slice(0, 120) }; }
    }
    if (ISS && has('F')) {
      const seed = all.statedB ?? 0.01;
      const settings = { forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: false, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined }, integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: seed }], fixed: { agom: 0 }, apriori: apriori([seed * 10]) };
      try {
        const ff = await F.fit(seg, [...seg[0].r, ...seg[0].v], settings, spw, Date.parse(seg.at(-1).epoch));
        out.arms[`F-M40@${arc}`] = ff.state ? { ffm: { epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, settings } : { error: String(ff.error ?? ff.termination).slice(0, 120) };
      } catch (error) { out.arms[`F-M40@${arc}`] = { error: String(error.message).slice(0, 120) }; }
    }
  }
  fitsCache.set(item.start, out);
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
// --part: the rows file's number in place of the shard's, so that pieces of a registered set (--pairs) write apart.
const outFile = path.join(OUT, `rows${ISS ? '-iss' : ''}-${args.part ?? SHARD}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.key}|${r.olderStart}|${r.newerStart}`; }) : []);
let added = 0;
for (const [key, list] of items()) {
  list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  fitsCache.clear();
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const older = list[i], newerRef = list[j];
    const leadHours = (Date.parse(newerRef.start) - Date.parse(older.start)) / HOUR;
    const pair = `${key}|${older.start}|${newerRef.start}`;
    if (leadHours <= MIN_GAP_H || leadHours > MAX_LEAD_H || done.has(pair) || (PAIRS && !PAIRS.has(pair))) continue;
    const row = { key, source: older.source, norad: older.norad, object: older.object, olderStart: older.start, newerStart: newerRef.start, leadHours, arms: {} };
    try {
      const nl = await linesOf(newerRef);
      const t0 = Date.parse(nl[0].epoch);
      const truth = nl.filter((l) => Date.parse(l.epoch) <= t0 + TRUTH_H * HOUR);
      const epochs = truth.map((l) => l.epoch), epochsMs = epochs.map((e) => Date.parse(e)), truthStates = truth.map((l) => ({ r: l.r, v: l.v }));
      const score = async (states) => { const e = await M.rtn(states, truthStates); const r = rmsOf(e.map((x) => x[0])), t = rmsOf(e.map((x) => x[1])), n = rmsOf(e.map((x) => x[2])); return { km: Math.hypot(r, t, n), r, t, n }; };
      const fits = await fitsOf(older);
      row.truthStates = truth.length;
      if (ISS && has('F')) { const table = await linesOf(older); const states = epochsMs.map((t) => interpolate(table, t)); if (states.every(Boolean)) row.arms.operator = await score(states); }
      for (const [name, f] of Object.entries(fits.arms)) {
        if (f.error) { row.arms[name] = { error: f.error }; continue; }
        try {
          if (f.ussf) {
            row.arms[name] = await score(await M.toAxes(await U.propagate(f.ocm, epochs, epochs.length), epochs, 'GCRF'));
          } else if (f.el) {
            const flown = await M.propagateSgp4(f.el, older.norad, epochsMs, (epochsMs[1] - epochsMs[0]) / 1000);
            if (flown.some((x) => !x)) throw new Error('SGP4 returned no state');
            row.arms[name] = await score(await M.toAxes(flown, epochs, 'GCRF'));
          } else if (f.ffm) {
            row.arms[name] = await score(await F.forecast(f.ffm, epochs, f.settings, fits.spw));
          } else {
            row.arms[name] = await score(await M.toAxes(await A.propagate(f.ocm, epochs, epochs.length), epochs, 'GCRF'));
          }
        } catch (error) { row.arms[name] = { error: String(error.message).slice(0, 120) }; }
      }
    } catch (error) { row.error = String(error.message).slice(0, 160); }
    fs.appendFileSync(outFile, `${JSON.stringify(F ? { ...row, ffm: F.provenance.ffm } : row)}\n`);
    added += 1;
  }
}
console.error(`${added} pairs added, shard ${SHARD}/${SHARDS}${ISS ? ', ISS' : ''}`);
await M.close();
process.exit(0);
