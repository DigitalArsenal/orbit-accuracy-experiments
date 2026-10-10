// E13 step 05: choose the Starlink sample for the collector. The universe is the
// satellites SpaceX lists in its manifest; each is classed from 30 days of
// Space-Track mean semi-major axis (a decaying one falls steadily with no raise;
// a holding one stays within 15 m a day) and drawn by stratum with a salted hash.
//
//   node steps/05-sample.mjs [--manifest <file> | fetch] [--out <dir>]
//
// Writes sample.json beside this step (NORAD number -> stratum, committed) and the
// detailed table (altitude, slope, class) to the derived store (not committed:
// per-sample numbers from element sets stay on this machine).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { config, experimentDir, paths, writeJson, sha256 } from '../common.mjs';
import { Fetcher, manifestNames } from '../fleet.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const log = (m) => console.log(`[sample] ${m}`);

const MU_KM3_S2 = 398600.4418, RE_KM = 6378.137, DAY_MS = 86400000;
const smaKm = (revPerDay) => { const n = revPerDay * 2 * Math.PI / 86400; return (MU_KM3_S2 / (n * n)) ** (1 / 3); };
const hash = (norad) => crypto.createHash('sha256').update(`${config.sample.salt}:${norad}`).digest().readUInt32BE(0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

// Theil-Sen slope (m/day) over at most ~60 thinned points.
function theilSen(xs, ys) {
  const idx = xs.map((_, i) => i).filter((i) => i % Math.max(1, Math.floor(xs.length / 60)) === 0);
  const slopes = [];
  for (let a = 0; a < idx.length; ++a) for (let b = a + 1; b < idx.length; ++b) { const dx = xs[idx[b]] - xs[idx[a]]; if (dx > 0.5) slopes.push((ys[idx[b]] - ys[idx[a]]) / dx); }
  return median(slopes);
}

// Series of the universe's satellites from the Space-Track gp_history windows (creation-date files).
function readSeries(universe, fromIso) {
  const dir = config.inputs.spacetrack.gpHistory;
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json.gz') && n.slice(0, 10) >= fromIso).sort();
  const series = new Map();
  let k = 0;
  for (const name of files) {
    let rows;
    try { rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name)))); } catch (e) { log(`skip ${name}: ${e.message}`); continue; }
    for (const o of rows) {
      const norad = Number(o.NORAD_CAT_ID);
      if (!universe.has(norad)) continue;
      const list = series.get(norad) ?? new Map();
      list.set(o.GP_ID, { t: Date.parse(`${o.EPOCH}Z`) / DAY_MS, a: smaKm(Number(o.MEAN_MOTION)), e: Number(o.ECCENTRICITY), i: Number(o.INCLINATION), bstar: Number(o.BSTAR) });
      series.set(norad, list);
    }
    if (++k % 40 === 0) log(`${k}/${files.length} files, ${series.size} satellites`);
  }
  return new Map([...series].map(([norad, m]) => [norad, [...m.values()].sort((x, y) => x.t - y.t)]));
}

function classify(points, tEnd) {
  const recent = points.filter((p) => p.t >= tEnd - config.sample.decay.windowDays);
  if (recent.length < 6) return { cls: 'unknown', n: recent.length };
  const t = recent.map((p) => p.t), a = recent.map((p) => p.a * 1000);
  const slope = theilSen(t, a);
  const byDay = new Map();
  recent.forEach((p, i) => { const d = Math.floor(p.t); byDay.set(d, [...(byDay.get(d) ?? []), a[i]]); });
  const med = [...byDay.keys()].sort((x, y) => x - y).map((d) => median(byDay.get(d)));
  const raises = med.slice(1).filter((v, i) => v - med[i] > config.sample.decay.raiseStepMeters).length;
  const half = Math.floor(recent.length / 2);
  const early = theilSen(t.slice(0, half), a.slice(0, half)), late = theilSen(t.slice(half), a.slice(half));
  const last = recent.at(-1);
  const cls = slope <= config.sample.decay.slopeMetersPerDayAtMost ? (raises === 0 ? 'decay' : 'decay-with-raises')
    : slope >= -config.sample.decay.slopeMetersPerDayAtMost ? 'raising' : 'hold';
  return { cls, n: recent.length, slopeMPerDay: slope, raises, accelerating: late < early - 0.1 * Math.abs(early), altitudeKm: last.a - RE_KM, inclination: last.i, eccentricity: last.e, bstar: last.bstar };
}

const altBin = (km) => (km < 300 ? '<300' : km < 350 ? '300-350' : km < 400 ? '350-400' : km < 450 ? '400-450' : km < 500 ? '450-500' : '500+');
const holdAltBin = (km) => `${Math.floor(km / 25) * 25}`;
const incGroup = (deg) => (deg < 48 ? '43' : deg < 60 ? '53' : deg < 85 ? '70' : '97');

async function main() {
  let manifestText;
  const manifestFile = flag('--manifest');
  if (manifestFile && manifestFile !== 'fetch') manifestText = fs.readFileSync(manifestFile, 'utf8');
  else { const f = new Fetcher(log); const r = await f.get(`${config.starlink.baseUrl}MANIFEST.txt`); manifestText = r.bytes.toString('utf8'); }
  const names = manifestNames(manifestText);
  const universe = new Set(names.keys());
  log(`manifest: ${universe.size} satellites`);
  const series = readSeries(universe, '2026-08-01');
  const tEnd = Math.max(...[...series.values()].map((s) => s.at(-1).t));
  const table = new Map();
  for (const [norad, points] of series) table.set(norad, classify(points, tEnd));
  const [lo, hi] = config.sample.exclude.range;
  const eligible = [...table].filter(([norad]) => !(norad >= lo && norad <= hi));
  const counts = {};
  for (const [, c] of eligible) counts[c.cls] = (counts[c.cls] ?? 0) + 1;
  log(`classes: ${JSON.stringify(counts)}`);

  const sample = new Map();
  // Decaying: a quota per altitude bin, the accelerating (passive-like) ones first.
  const decays = eligible.filter(([, c]) => c.cls === 'decay');
  for (const [bin, quota] of Object.entries(config.sample.decay.quota)) {
    const pool = decays.filter(([, c]) => altBin(c.altitudeKm) === bin).sort((x, y) => (Number(y[1].accelerating) - Number(x[1].accelerating)) || (hash(x[0]) - hash(y[0])));
    for (const [norad] of pool.slice(0, quota)) sample.set(norad, `decay/${bin}`);
    log(`decay ${bin}: ${pool.length} identified, ${Math.min(quota, pool.length)} drawn`);
  }
  // Holding: strata of 25 km altitude x inclination group, square-root allocation of the target.
  const holds = eligible.filter(([, c]) => c.cls === 'hold');
  const strata = new Map();
  for (const [norad, c] of holds) { const key = `${holdAltBin(c.altitudeKm)}/${incGroup(c.inclination)}`; strata.set(key, [...(strata.get(key) ?? []), norad]); }
  const weights = [...strata].map(([key, list]) => [key, Math.sqrt(list.length)]);
  const total = weights.reduce((s, [, w]) => s + w, 0);
  for (const [key, w] of weights) {
    const list = strata.get(key).sort((x, y) => hash(x) - hash(y));
    const take = Math.min(list.length, Math.max(list.length >= config.sample.hold.minimumPerStratum ? config.sample.hold.minimumPerStratum : 0, Math.round(config.sample.hold.target * w / total)));
    for (const norad of list.slice(0, take)) sample.set(norad, `hold/${key}`);
  }
  log(`sample: ${sample.size} satellites (${[...sample.values()].filter((s) => s.startsWith('decay')).length} decaying, ${[...sample.values()].filter((s) => s.startsWith('hold')).length} holding)`);

  const byStratum = {};
  for (const s of sample.values()) byStratum[s] = (byStratum[s] ?? 0) + 1;
  const stratumCounts = Object.fromEntries(Object.entries(byStratum).sort());
  writeJson(path.join(experimentDir, 'sample.json'), {
    experiment: 'e13-open-dca', salt: config.sample.salt, manifest: { sha256: sha256(Buffer.from(manifestText)), satellites: universe.size, gpThrough: new Date(tEnd * DAY_MS).toISOString() },
    classes: counts, strata: stratumCounts, satellites: Object.fromEntries([...sample].sort((a, b) => a[0] - b[0])),
  });
  writeJson(paths.sample, { generated: new Date().toISOString(), table: Object.fromEntries([...sample].map(([norad]) => [norad, { stratum: sample.get(norad), ...table.get(norad) }])), allClasses: Object.fromEntries([...table].map(([n, c]) => [n, c.cls])) });
  log(`wrote ${path.join(experimentDir, 'sample.json')} and ${paths.sample}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
