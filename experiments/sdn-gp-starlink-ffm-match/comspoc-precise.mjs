// COMSPOC Spacebook XP sets of the GPS, GLONASS, Galileo and laser-ranged objects, scored against the precise-orbit products that
// start after the set's epoch (local scoring only; the sets are never fitted to or used as inputs). The ESA and ILRS products lag
// by days to weeks, so this reports which objects still wait for truth and the newest product date, and scores the rest.
//   node experiments/sdn-gp-starlink-ffm-match/comspoc-precise.mjs
// Output: <store>/rows/comspoc-precise.jsonl (statistics only) and <store>/rows/comspoc-precise-status.json.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store, write } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, propagateSet, compareStates } from './lib/baselines.mjs';
import { readSets, setOf } from './lib/tle.mjs';
import { ommBytes } from './lib/sds.mjs';
import { readReference, chain, referenceDir, referenceRootDir, rapidRoot, rapidDirs, GNSS_RAPID, gnssClass, slrRefRoot, slrLowSeries } from './lib/sources.mjs';
import { ms, iso, DAY, quantile } from './lib/windows.mjs';

frozen();
const COMSPOC = path.join(config.archive, 'hac/comspoc-spacebook/2026/2026-10-23');
const sets = readSets(zlib.gunzipSync(fs.readFileSync(path.join(COMSPOC, 'xp-tle.txt.gz'))).toString('utf8'));
const objects = fs.readdirSync(path.join(COMSPOC, 'syncopate')).map((f) => Number(f.replace('.e.gz', ''))).filter((n) => sets.has(n) && setOf(...sets.get(n)).type === 4);
const dirs = fs.readdirSync(referenceRootDir);
// the product families and the date in a directory name
const family = {
  esa: { match: /^ESA0OPSFIN_(\d{4})(\d{3})/, date: (m) => Date.UTC(Number(m[1]), 0, Number(m[2])) },
  ilrsa: { match: /^ilrsa\.orb\.[a-z0-9]+\.(\d{2})(\d{2})(\d{2})/, date: (m) => Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3])) },
  nsgf: { match: /^nsgf\.orb\.[a-z0-9]+\.(\d{2})(\d{2})(\d{2})/, date: (m) => Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3])) },
};
const newest = Object.fromEntries(Object.entries(family).map(([k, f]) => [k, dirs.map((d) => f.match.exec(d)).filter(Boolean).map(f.date).sort().at(-1)]));
const status = { capturedUtc: '2026-10-23T20:09Z', xpSets: objects.length, newestProductDay: Object.fromEntries(Object.entries(newest).map(([k, v]) => [k, v ? new Date(v).toISOString().slice(0, 10) : null])) };
// objects with precise products at all: the NORAD ids of the newest ESA day and of the ILRS arcs
const esaNewest = dirs.filter((d) => family.esa.match.test(d)).sort().at(-1);
const esaObjects = new Set(fs.readdirSync(referenceDir(esaNewest)).filter((f) => f.endsWith('.oem')).map((f) => Number(f.replace('.oem', ''))));
const slrObjects = new Set();
for (const d of dirs.filter((x) => family.ilrsa.match.test(x) || family.nsgf.match.test(x))) { const f = fs.readdirSync(referenceDir(d)).find((x) => x.endsWith('.oem')); if (f) slrObjects.add(readReference(path.join(referenceDir(d), f)).norad); }
// ILRS NSGF rapid orbits fetched from CDDIS (amendments A9 and A9b, current laser-ranging truth of the LEO spheres): one reference-state directory per daily file
const nsgfNow = fs.existsSync(slrRefRoot()) ? fs.readdirSync(slrRefRoot()).filter((d) => d.startsWith('nsgf.orb.')).sort() : [];
const nsgfNowObjects = new Set(nsgfNow.flatMap((d) => fs.readdirSync(path.join(slrRefRoot(), d)).filter((f) => f.endsWith('.oem')).map((f) => Number(f.replace('.oem', '')))));
const nsgfNowDay = (d) => { const m = /\.(\d{2})(\d{2})(\d{2})\.v000/.exec(d); return Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3])); };
status.newestProductDay.nsgfCurrent = nsgfNow.length ? new Date(Math.max(...nsgfNow.map(nsgfNowDay))).toISOString().slice(0, 10) : null;
// GFZ rapid orbits (amendment A8b, current GNSS truth): one reference-state directory per product and day
const rapid = [...rapidDirs('GFZ0OPSRAP_'), ...rapidDirs('GFZ0MGXRAP_')];
const rapidDay = (d) => { const m = /_(\d{4})(\d{3})0000/.exec(d); return Date.UTC(Number(m[1]), 0, Number(m[2])); };
const rapidObjects = new Set(rapid.flatMap((d) => fs.readdirSync(path.join(rapidRoot(), d)).filter((f) => f.endsWith('.oem')).map((f) => Number(f.replace('.oem', '')))));
status.newestProductDay.gfzRapid = rapid.length ? new Date(Math.max(...rapid.map(rapidDay))).toISOString().slice(0, 10) : null;
status.eopPredictedFromUtc = GNSS_RAPID.predictedEopFromUtc;
const isGnss = (n) => esaObjects.has(n) || rapidObjects.has(n);
const candidates = objects.filter((n) => isGnss(n) || slrObjects.has(n) || nsgfNowObjects.has(n));
status.objectsWithPreciseProducts = candidates.length;
status.gnss = candidates.filter(isGnss).length;
status.laserRanged = candidates.filter((n) => slrObjects.has(n) || nsgfNowObjects.has(n)).length;
const b = await openBaselines(modulesRoot());
const rows = [];
for (const norad of candidates) {
  const s = setOf(...sets.get(norad));
  const files = [];
  if (nsgfNowObjects.has(norad) && !isGnss(norad)) { /* laser-ranged LEO spheres: every NSGF daily file chained, the latest file winning (A9b) */ }
  else if (rapidObjects.has(norad)) { // GNSS objects: the rapid orbits of the days that follow the set's epoch
    for (const d of rapid) if (rapidDay(d) + 2 * DAY >= s.epochMs && fs.existsSync(path.join(rapidRoot(), d, `${norad}.oem`))) files.push(path.join(rapidRoot(), d, `${norad}.oem`));
  } else for (const d of dirs) {
    const f = Object.values(family).find((x) => x.match.test(d)); if (!f) continue;
    const day = f.date(f.match.exec(d));
    if (day + 8 * DAY < s.epochMs) continue; // products that end before the set's epoch cannot be after it
    const file = esaObjects.has(norad) ? path.join(referenceDir(d), `${norad}.oem`) : (fs.readdirSync(referenceDir(d)).filter((x) => x.endsWith('.oem')).map((x) => path.join(referenceDir(d), x))[0]);
    if (file && fs.existsSync(file)) files.push(file);
  }
  const series = nsgfNowObjects.has(norad) && !isGnss(norad) ? slrLowSeries({ norad }) : files.length ? chain(files) : null;
  const after = series ? series.lines.filter((l) => ms(l.epoch) > s.epochMs && (isGnss(norad) || series.norad === norad)) : [];
  if (!series || after.length < 100 || series.norad !== norad && !isGnss(norad)) { rows.push({ norad, pending: 'no precise product after the set epoch', setEpochUtc: iso(s.epochMs) }); continue; }
  const stepSeconds = (ms(after[1].epoch) - ms(after[0].epoch)) / 1000, thin = Math.max(1, Math.round(300 / stepSeconds));
  const chosen = after.filter((_, i) => i % thin === 0);
  const predicted = await propagateSet(b, ommBytes({ theory: 'SGP4XP', ...s }), chosen.map((l) => ms(l.epoch)), 'GCRF');
  const days = {};
  for (let k = 0; k <= 3; k += 1) {
    const idx = chosen.map((l, i) => i).filter((i) => ms(chosen[i].epoch) > s.epochMs + k * DAY && ms(chosen[i].epoch) <= s.epochMs + (k + 1) * DAY);
    if (idx.length >= 0.5 * (86400 / (stepSeconds * thin))) days[k] = await compareStates(b, idx.map((i) => predicted[i]), idx.map((i) => chosen[i]));
  }
  rows.push({ norad, setEpochUtc: iso(s.epochMs), kind: isGnss(norad) ? 'gnss' : 'laser-ranged', ...(rapidObjects.has(norad) ? { gnssClass: gnssClass(series.name) } : {}), ...(isGnss(norad) ? {} : { slrClass: s.meanMotion < 10 ? 'meo' : 'leo' }), days });
}
fs.writeFileSync(path.join(store, 'rows/comspoc-precise.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
status.scored = rows.filter((r) => r.days && Object.keys(r.days).length).length;
status.pending = rows.length - status.scored;
status.pendingGnss = rows.filter((r) => r.pending && isGnss(r.norad)).map((r) => ({ norad: r.norad, setEpochUtc: r.setEpochUtc, inRapidProducts: rapidObjects.has(r.norad) }));
status.pendingLaserRanged = rows.filter((r) => r.pending && !isGnss(r.norad)).map((r) => ({ norad: r.norad, setEpochUtc: r.setEpochUtc }));
status.laserRangedScored = rows.filter((r) => r.days && Object.keys(r.days).length && !isGnss(r.norad)).length;
write(path.join(store, 'rows/comspoc-precise-status.json'), status);
console.log(JSON.stringify(status));
await b.close();
process.exit(0);
