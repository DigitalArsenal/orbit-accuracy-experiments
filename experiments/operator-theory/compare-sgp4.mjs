// COMPARE.md, report only: SGP4 on Part L's low-orbit pairs, beside AP, XP and FFM. The same stored files, fit arcs from each file's first state, reference (the first 3 h of a
// newer file) and pair rule as score.mjs. An SGP4 set flies on SGP4 and nothing else.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/compare-sgp4.mjs --root <store with cycles> --out <rows file> [--shard k/n] [--arcs 24,48] [--regime leo|high|all] [--arms U] [--pairs <store>]
// --pairs: only the pairs of that store's rows (a registered set, lib/pairs.mjs), and only the files of their satellites are opened.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isoMs } from './lib/host.mjs';
import { openSgp4Fit } from './lib/xp2.mjs';
import { pairsOf } from './lib/pairs.mjs';
import { openUssfXp } from './lib/ussf-xp.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = args.root, OUT = args.out;
if (!ROOT || !OUT) throw new Error('--root and --out');
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const ARCS = (args.arcs ?? "24,48").split(",").map(Number), REGIME = args.regime ?? "leo", HOUR = 3600000, TRUTH_H = 3, MAX_LEAD_H = 180, MIN_GAP_H = 6;

const PAIRS = args.pairs ? pairsOf(args.pairs) : null, NORADS = PAIRS && new Set([...PAIRS].map((k) => k.split('|')[1]));
const cycles = fs.readdirSync(ROOT).filter((d) => /^c\d{8}T\d{4}$/.test(d) && fs.existsSync(path.join(ROOT, d, 'products'))).sort();
const items = new Map();
for (const c of cycles) for (const f of fs.readdirSync(path.join(ROOT, c, 'products'))) {
  if (NORADS && !NORADS.has(/-(\d+)-\d+\.json$/.exec(f)?.[1])) continue;
  const file = path.join(ROOT, c, 'products', f);
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!p.start || !p.forecastOem || (REGIME !== 'all' && !String(p.source).endsWith(`-${REGIME}`))) continue;
  const key = `${p.source}|${p.norad}`;
  if (parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS !== SHARD) continue;
  const list = items.get(key) ?? items.set(key, []).get(key);
  if (!list.some((x) => x.start === p.start)) list.push({ start: p.start, file, object: p.object, source: p.source, norad: p.norad });
}

const done = new Set();
if (fs.existsSync(OUT)) for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) if (line) { const r = JSON.parse(line); done.add(`${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`); }

// --arms U: the Space Force's SGP4-XP on the same files and pairs, in place of SGP4.
const ONLY_U = args.arms === 'U';
const M = await openModules();
const G = ONLY_U ? null : await openSgp4Fit(), U = ONLY_U ? await openUssfXp() : null;
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
const lines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));

const fits = new Map();
async function fitsOf(ref) {
  if (fits.has(ref.start)) return fits.get(ref.start);
  const p = JSON.parse(fs.readFileSync(ref.file, 'utf8'));
  const all = lines(p.forecastOem);
  const t0 = Date.parse(all[0].epoch), tEnd = Date.parse(all.at(-1).epoch);
  const out = {};
  for (const arc of ARCS) {
    if (tEnd - t0 < arc * HOUR) continue;
    const seg = all.filter((l) => Date.parse(l.epoch) <= t0 + arc * HOUR);
    const oem = S.oemBytes({ frame: 'GCRF', object: { name: p.object, id: '', norad: p.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
    if (ONLY_U) { const f = await U.fit(oem); out[`U-XP@${arc}`] = f.ok ? { ocm: f.ocm } : { error: f.error }; continue; }
    try {
      const { el } = await G.fit(oem, { from: seg[0].epoch, to: isoMs(t0 + arc * HOUR), epoch: 'first', fitBstar: true }, { name: p.object, objectId: '' });
      out[`S@${arc}`] = { el };
    } catch (error) { out[`S@${arc}`] = { error: String(error.message).slice(0, 160) }; }
  }
  fits.set(ref.start, out);
  return out;
}

let added = 0;
for (const [, list] of items) {
  list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  fits.clear();
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const older = list[i], newerRef = list[j];
    const leadHours = (Date.parse(newerRef.start) - Date.parse(older.start)) / HOUR;
    if (leadHours <= MIN_GAP_H || leadHours > MAX_LEAD_H) continue;
    const pair = `${older.source}|${older.norad}|${older.start}|${newerRef.start}`;
    if (done.has(pair) || (PAIRS && !PAIRS.has(pair))) continue;
    const newer = JSON.parse(fs.readFileSync(newerRef.file, 'utf8'));
    const t0 = Date.parse(newer.start);
    const truth = lines(newer.forecastOem).filter((l) => Date.parse(l.epoch) <= t0 + TRUTH_H * HOUR);
    const epochs = truth.map((l) => l.epoch), epochsMs = epochs.map((e) => Date.parse(e)), truthStates = truth.map((l) => ({ r: l.r, v: l.v }));
    const row = { source: older.source, norad: older.norad, object: older.object, olderStart: older.start, newerStart: newer.start, leadHours, truthStates: truth.length, arms: {} };
    for (const [name, f] of Object.entries(await fitsOf(older))) {
      if (f.error) { row.arms[name] = { error: f.error }; continue; }
      try {
        const flown = f.ocm ? await U.propagate(f.ocm, epochs, epochs.length) : await M.propagateSgp4(f.el, older.norad, epochsMs, (epochsMs[1] - epochsMs[0]) / 1000);
        if (flown.some((x) => !x)) throw new Error('SGP4 returned no state');
        const e = await M.rtn(await M.toAxes(flown, epochs, 'GCRF'), truthStates);
        const r = rmsOf(e.map((x) => x[0])), t = rmsOf(e.map((x) => x[1])), n = rmsOf(e.map((x) => x[2]));
        row.arms[name] = { km: Math.hypot(r, t, n), r, t, n };
      } catch (error) { row.arms[name] = { error: String(error.message).slice(0, 160) }; }
    }
    fs.appendFileSync(OUT, `${JSON.stringify(row)}\n`);
    added += 1;
  }
}
console.error(`${added} pairs added, shard ${SHARD}/${SHARDS}`);
await M.close();
process.exit(0);
