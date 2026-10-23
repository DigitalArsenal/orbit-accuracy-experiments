// COMSPOC Spacebook XP (local scoring only). The owner permits scoring COMSPOC's published SGP4-XP sets, never fitting to
// them: nothing here is an input or a prior of any fit, nothing from these files is copied into the repository, and only
// aggregate statistics leave this machine's store. Terms of use: no commercial use, no redistribution, no derivative works.
// Each set is propagated through the black-box module (propagator/sgp4-xp `propagate`) to the epochs of same-day truth
// and compared by gp-error-model `pair_statistics` (radial / in-track / cross-track).
//   truth: the FFM trajectories of this experiment, SpaceX's own states inside the forecast, NASA's ISS OEM of 2026-10-23.
// Output: <store>/rows/comspoc.jsonl (one line per object and truth, statistics only).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, PLACEHOLDER_COVARIANCE } from './lib/baselines.mjs';
import { frame, oemBytes, ommBytes, ommFrame, readOem, blockLines } from './lib/sds.mjs';
import { parseMeme, parseOemKvn } from './lib/sources.mjs';
import { DAY, ms, iso, withT } from './lib/windows.mjs';

const COMSPOC = path.join(config.archive, 'hac/comspoc-spacebook/2026/2026-10-23');
const DAILY = path.join(config.archive, 'operator-ephemerides/daily/2026-10-23');

const exponent = (f) => (f[0] === '-' ? -1 : 1) * (Number(f.slice(1, 6)) * 1e-5) * 10 ** ((f[6] === '-' ? -1 : 1) * Number(f[7]));
function setOf(l1, l2) { // a two-line set (type 4) as the fields of an $OMM; host-side text parsing only
  const year = Number(l1.slice(18, 20)), day = Number(l1.slice(20, 32));
  const epochMs = Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (day - 1) * 86400000;
  const seconds = (day - Math.floor(day)) * 86400;
  const base = new Date(Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (Math.floor(day) - 1) * 86400000).toISOString().slice(0, 10);
  const whole = Math.floor(seconds), micro = String(Math.round((seconds - whole) * 1e6)).padStart(6, '0');
  const hh = String(Math.floor(whole / 3600)).padStart(2, '0'), mm = String(Math.floor((whole % 3600) / 60)).padStart(2, '0'), ss = String(whole % 60).padStart(2, '0');
  return { type: Number(l1[62]), epochMs, epoch: `${base}T${hh}:${mm}:${ss}.${micro}`, norad: Number(l1.slice(2, 7)), inclination: Number(l2.slice(8, 16)), raan: Number(l2.slice(17, 25)),
    eccentricity: Number(`0.${l2.slice(26, 33)}`), argPerigee: Number(l2.slice(34, 42)), meanAnomaly: Number(l2.slice(43, 51)), meanMotion: Number(l2.slice(52, 63)), bstar: exponent(l1.slice(53, 61)), agom: exponent(l1.slice(44, 52)) };
}

frozen();
const modules = modulesRoot();
const b = await openBaselines(modules);
const lines = zlib.gunzipSync(fs.readFileSync(path.join(COMSPOC, 'xp-tle.txt.gz'))).toString('utf8').split('\n');
const sets = new Map();
for (let i = 0; i + 1 < lines.length; i += 1) if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) sets.set(Number(lines[i].slice(2, 7)), [lines[i], lines[i + 1]]);
const xpEpochs = [...sets.values()].filter(([l1]) => l1[62] === '4').map(([l1, l2]) => setOf(l1, l2).epochMs).sort((a, c) => a - c);
const catalog = { sets: sets.size, xp: xpEpochs.length, epochMin: iso(xpEpochs[0]), epochMedian: iso(xpEpochs[Math.floor(xpEpochs.length / 2)]), epochMax: iso(xpEpochs.at(-1)), syncopateObjects: fs.readdirSync(path.join(COMSPOC, 'syncopate')).length };

async function score({ regime, id, norad, frameName, truthLines, t0, spanDays }) {
  const set = sets.get(norad);
  if (!set) return null;
  const s = setOf(...set);
  if (s.type !== 4) return null;
  const chosen = [];
  const step = (ms(truthLines[1].epoch) - ms(truthLines[0].epoch)) / 1000;
  const thin = Math.max(1, Math.round(300 / step));
  truthLines.forEach((l, i) => { const t = ms(l.epoch); if (i % thin === 0 && t > t0 && t <= t0 + spanDays * DAY) chosen.push(l); });
  if (chosen.length < 50) return null;
  const grid = oemBytes({ block: { frame: frameName, object: { name: id, norad }, lines: chosen.map((l) => ({ epoch: l.epoch, r: [0, 0, 0], v: [0, 0, 0] })), start: chosen[0].epoch, stop: chosen.at(-1).epoch } });
  const prop = await b.xp.call('propagate', [ommFrame('omm', ommBytes({ theory: 'SGP4XP', ...s })), frame('grid', 'OEM', grid)]);
  const predicted = blockLines(readOem(prop.ephemeris).EPHEMERIS_DATA_BLOCK[0]);
  const pairs = predicted.map((p, i) => ({ id: String(i), predicted: { position: p.r, velocity: p.v, covariance: PLACEHOLDER_COVARIANCE, covarianceAxes: 'INERTIAL' }, truth: { position: chosen[i].r, velocity: chosen[i].v } }));
  const stats = b.erm.decode((await b.gem.call('pair_statistics', [b.erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs })])).statistics).pairs;
  const days = {};
  stats.forEach((st, i) => { const k = Math.floor((ms(chosen[i].epoch) - t0 - 1) / DAY); (days[k] ??= []).push(st.errorRtn); });
  const out = {};
  for (const [k, e] of Object.entries(days)) {
    const ric = [0, 1, 2].map((c) => Math.sqrt(e.reduce((sum, v) => sum + v[c] * v[c], 0) / e.length));
    if (e.length >= 0.9 * (86400 / (step * thin))) out[k] = { rmsKm: Math.hypot(...ric), ric, n: e.length };
  }
  return { regime, id, norad, label: 'COMSPOC Spacebook XP (local scoring only)', setEpochUtc: iso(s.epochMs), ageDays: (t0 - s.epochMs) / DAY, days: out };
}

const rows = [];
const dailyIds = fs.readdirSync(path.join(DAILY, 'starlink')).filter((f) => f.endsWith('.txt.gz')).map((f) => Number(f.replace('.txt.gz', ''))).sort((a, c) => a - c);
for (const norad of dailyIds) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(DAILY, 'starlink', `${norad}.txt.gz`))).toString('utf8');
  const states = parseMeme(text);
  const t0 = ms(states[0].epoch);
  const inSpan = states.filter((s) => ms(s.epoch) < t0 + 48 * 3600e3 - 1000);
  const a = await score({ regime: 'leo-starlink-spacex', id: `STARLINK (${norad})`, norad, frameName: 'EME2000', truthLines: inSpan, t0, spanDays: 2 });
  if (a) rows.push(a);
  const metaFile = path.join(store, 'truth', `${norad}.json`);
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile));
    const flat = new Float64Array(fs.readFileSync(path.join(store, 'truth', `${norad}.f64`)).buffer.slice(0));
    const tt0 = ms(meta.truth.epochUtc);
    const truthLines = Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: new Date(tt0 + i * config.truth.cadenceSeconds * 1000).toISOString(), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] }));
    const c = await score({ regime: 'leo-starlink-ffm', id: `STARLINK (${norad})`, norad, frameName: 'GCRF', truthLines, t0: tt0, spanDays: 4 });
    if (c) rows.push(c);
  }
}
const issText = zlib.gunzipSync(fs.readFileSync(path.join(DAILY, 'iss-oem.txt.gz'))).toString('utf8');
const iss = parseOemKvn(issText).blocks.flatMap((bl) => bl.lines);
const issRow = await score({ regime: 'leo-iss-daily', id: 'ISS', norad: 25544, frameName: 'EME2000', truthLines: iss, t0: ms(iss[0].epoch), spanDays: 4 });
if (issRow) rows.push(issRow);
fs.mkdirSync(path.join(store, 'rows'), { recursive: true });
fs.writeFileSync(path.join(store, 'rows/comspoc.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(store, 'rows/comspoc-catalog.json'), JSON.stringify({ ...catalog, scoredObjects: rows.length, capturedUtc: '2026-10-23T20:09Z' }));
console.log(`catalog sets ${catalog.sets} (type 4: ${catalog.xp}); scored ${rows.length} object-truths`);
await b.close();
process.exit(0);
