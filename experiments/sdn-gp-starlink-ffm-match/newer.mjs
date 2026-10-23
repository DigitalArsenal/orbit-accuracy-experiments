// Held-out scoring against the first hours of NEWER SpaceX files (task: "truth is always the first hours of newer files").
// For each fitted Starlink, the head of the file SpaceX serves now is read into memory (a 256 KiB range, about nine hours; never
// written); if it was created after the file of the registered fit, its states in the first three hours, every ten minutes, are the
// truth, in EME2000. Scored against that truth: FFM-1 from the registered fit (a module call at those epochs), SGP4 and SGP4-XP
// fitted to the first 24 h of that FFM truth, SpaceX's own earlier forecast where the epochs coincide, and, for the same-day
// objects, COMSPOC's XP set (local scoring only). Output: <store>/rows/newer.jsonl, statistics only. Re-run as newer files arrive.
//   node experiments/sdn-gp-starlink-ffm-match/newer.mjs [--limit N] [--daily-only] [--after 2026-10-24T08:00:00Z]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store, args, read } from './common.mjs';
import { modulesRoot, openModule } from './lib/modules.mjs';
import { openBaselines, fitElementSets, propagateSet, compareStates } from './lib/baselines.mjs';
import { loadEnvironment, propagate } from './lib/ffm.mjs';
import { transformState } from './lib/frames.mjs';
import { polite, manifest, STARLINK_ROOT } from './lib/spacex.mjs';
import { parseMeme, memeHeader } from './lib/sources.mjs';
import { readSets, setOf } from './lib/tle.mjs';
import { ommBytes } from './lib/sds.mjs';
import { withT, ms, iso, DAY } from './lib/windows.mjs';

const HEAD_BYTES = 262144, STRIDE = 10, HOURS = 3;
const DAILY = path.join(config.archive, 'operator-ephemerides/daily/2026-10-23/starlink');
const rowsFile = path.join(store, 'rows/newer.jsonl');
const after = args.after ? Date.parse(args.after) : 0;

frozen();
const modules = modulesRoot();
const context = await loadEnvironment(modules, { archive: config.archive, store });
const b = await openBaselines(modules);
const frames = await openModule(modules, 'foundation/frames');
const comspoc = readSets(zlib.gunzipSync(fs.readFileSync(path.join(config.archive, 'hac/comspoc-spacebook/2026/2026-10-23/xp-tle.txt.gz'))).toString('utf8'));
const done = new Map((fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []).map((r) => [`${r.norad}|${r.newerCreatedUtc}`, r]));
const names = await manifest();
const metas = fs.readdirSync(path.join(store, 'truth')).filter((n) => /^\d+\.json$/.test(n)).map((n) => read(path.join(store, 'truth', n)))
  .sort((a, c) => (a.population === 'daily' ? 0 : 1) - (c.population === 'daily' ? 0 : 1) || a.norad - c.norad)
  .filter((m) => !args['daily-only'] || m.population === 'daily');
const toEme = async (iso8601, state) => transformState(frames, 'GCRF', 'EME2000', iso8601, state);
let scored = 0, none = 0, tried = 0;
const limit = args.limit ? Number(args.limit) : Infinity;
for (const meta of metas) {
  if (tried >= limit) break;
  tried += 1;
  const file = names.find((f) => f.startsWith(`MEME_${meta.norad}_`));
  if (!file) continue;
  const head = (await polite(`${STARLINK_ROOT}/${file}`, { range: `bytes=0-${HEAD_BYTES - 1}` })).toString('utf8');
  const h = memeHeader(head);
  const created = h.created ? `${h.created}Z` : null;
  if (!created || Date.parse(created) <= Date.parse(`${meta.memeCreatedUtc}Z`) || Date.parse(`${h.start}Z`) < after) { none += 1; continue; }
  if (done.has(`${meta.norad}|${created}`)) continue;
  const newer = parseMeme(head);
  const t0 = ms(h.start);
  const truth = newer.filter((s, i) => ms(s.epoch) <= t0 + HOURS * 3600e3 && i % STRIDE === 0);
  const truthStart = ms(meta.truth.epochUtc), horizonH = (t0 - truthStart) / 3600e3;
  if (truth.length < 10 || horizonH < 0 || horizonH + HOURS > meta.truth.hours) continue;
  const epochs = truth.map((s) => ms(s.epoch));
  const arms = {};
  // FFM-1 from the registered fit, at the newer file's epochs, taken to EME2000
  const ffm = await propagate(modules, context, { epoch: meta.truth.epochUtc, state: meta.truth.stateGcrfKm.map((x) => x * 1000), cdAm: meta.fit.bEffM2Kg, crAm: meta.fit.crAm, epochs, integrator: config.truth.integrator });
  const ffmEme = [];
  for (const s of ffm.samples) ffmEme.push(await toEme(iso(s.ms), s.state.map((x) => x / 1000)));
  arms.ffm = await compareStates(b, ffmEme.map((x) => ({ r: x.slice(0, 3), v: x.slice(3) })), truth);
  // SGP4 and SGP4-XP fitted to the first 24 h of the FFM truth
  const flat = new Float64Array(fs.readFileSync(path.join(store, 'truth', `${meta.norad}.f64`)).buffer.slice(0));
  const object = withT({ source: 'starlink-ffm', id: `STARLINK (${meta.norad})`, norad: meta.norad, name: `STARLINK-${meta.norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
    lines: Array.from({ length: 1441 }, (_, i) => ({ epoch: iso(truthStart + i * 60000), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
  const sets = await fitElementSets(b, object, truthStart, config.windows.fitHours * 3600);
  for (const [name, payload] of [['xp', sets.xp], ['sgp4', sets.sgp4]]) if (payload) arms[name] = await compareStates(b, await propagateSet(b, payload, epochs, 'EME2000'), truth);
  // SpaceX's own earlier forecast where the same epoch strings occur (local capture only)
  const original = path.join(DAILY, `${meta.norad}.txt.gz`);
  if (fs.existsSync(original)) {
    const old = new Map(parseMeme(zlib.gunzipSync(fs.readFileSync(original)).toString('utf8')).map((s) => [s.epoch, s]));
    const pairs = truth.map((s) => [old.get(s.epoch), s]).filter(([o]) => o);
    if (pairs.length >= 5) arms.spacexOld = await compareStates(b, pairs.map(([o]) => o), pairs.map(([, s]) => s));
  }
  // COMSPOC's XP set (same-day objects; local scoring only)
  if (meta.population === 'daily' && comspoc.has(meta.norad)) {
    const s = setOf(...comspoc.get(meta.norad));
    if (s.type === 4) arms.comspoc = { ...(await compareStates(b, await propagateSet(b, ommBytes({ theory: 'SGP4XP', ...s }), epochs, 'EME2000'), truth)), setAgeDays: (t0 - s.epochMs) / DAY };
  }
  const row = { norad: meta.norad, population: meta.population, stratum: meta.stratum, bEffAtZeroBound: meta.fit.bEffAtZeroBound, bEff: meta.fit.bEffM2Kg, converged: meta.fit.convergence === 'converged',
    newerStartUtc: `${h.start}Z`, newerCreatedUtc: created, horizonHours: horizonH, epochs: truth.length, arms };
  fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
  scored += 1;
  console.error(`${meta.norad}: horizon ${horizonH.toFixed(1)} h, ffm ${arms.ffm.rmsKm.toFixed(2)} km, xp ${arms.xp?.rmsKm?.toFixed(2)}, sgp4 ${arms.sgp4?.rmsKm?.toFixed(2)}${arms.comspoc ? `, comspoc ${arms.comspoc.rmsKm.toFixed(1)}` : ''}`);
}
console.log(`${scored} scored, ${none} with no newer file yet, ${tried} tried`);
await b.close();
process.exit(0);
