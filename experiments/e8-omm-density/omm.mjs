// Element sets for E8, read from the local SDN archive: Space-Track gp_history
// by creation day (2025-2026, every published version with its CREATION_DATE)
// and the 1959-2022 GP history zip (one CSV per object; no creation times).
// Reading, filtering and compact caching only (runs/cache, never committed):
// element sets stay on this machine (README rule 4).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { gunzipSync, gzipSync } from 'node:zlib';
import readline from 'node:readline';
import { sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { config, DAY_MS, isoDay } from './common.mjs';

const epochMs = (text) => (text ? Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`) : null);
export const cacheDir = path.join(repoRoot, 'runs', 'cache', 'e8-omm');

// A set as a compact row: [epochMs, creationMs|null, MEAN_MOTION, ECCENTRICITY,
// INCLINATION, RA_OF_ASC_NODE, ARG_OF_PERICENTER, MEAN_ANOMALY, BSTAR, SEMIMAJOR_AXIS km|null]
export const ROW = { epoch: 0, creation: 1, n: 2, e: 3, i: 4, raan: 5, argp: 6, ma: 7, bstar: 8, a: 9 };
export const asModuleSet = (r) => ({ mjd: r[0] / DAY_MS + 40587, MEAN_MOTION: r[2], ECCENTRICITY: r[3], INCLINATION: r[4], RA_OF_ASC_NODE: r[5],
  ARG_OF_PERICENTER: r[6], MEAN_ANOMALY: r[7], BSTAR: r[8] });
// ── 2025-2026: gp_history by creation day ──
// Every SGP4 set (ephemeris type 0) created on the days [fromDay, toDay] whose
// object passes keep(norad, record); all versions kept (GP_ID unique).
export function scanCreationDays(fromDay, toDay, keep, files = {}) {
  const objects = new Map();
  const seen = new Set();
  for (let t = Date.parse(`${fromDay}T00:00:00Z`); t <= Date.parse(`${toDay}T00:00:00Z`); t += DAY_MS) {
    const day = isoDay(t), dir = path.join(config.inputs.gpHistory, day.slice(0, 4));
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((n) => n.startsWith(day) && n.endsWith('.json.gz')).sort()) {
      const raw = fs.readFileSync(path.join(dir, name));
      files[`${day.slice(0, 4)}/${name}`] = sha256(raw);
      for (const g of JSON.parse(gunzipSync(raw))) {
        if (g.MEAN_ELEMENT_THEORY !== 'SGP4' || String(g.EPHEMERIS_TYPE) !== '0' || seen.has(g.GP_ID)) continue;
        const norad = Number(g.NORAD_CAT_ID);
        if (!keep(norad, g)) continue;
        seen.add(g.GP_ID);
        if (!objects.has(norad)) objects.set(norad, { norad, objectId: g.OBJECT_ID, name: g.OBJECT_NAME, type: g.OBJECT_TYPE, launch: g.LAUNCH_DATE, rows: [] });
        objects.get(norad).rows.push([epochMs(g.EPOCH), epochMs(g.CREATION_DATE), +g.MEAN_MOTION, +g.ECCENTRICITY, +g.INCLINATION, +g.RA_OF_ASC_NODE,
          +g.ARG_OF_PERICENTER, +g.MEAN_ANOMALY, +g.BSTAR, g.SEMIMAJOR_AXIS ? +g.SEMIMAJOR_AXIS : null]);
      }
    }
  }
  for (const o of objects.values()) o.rows.sort((a, b) => a[0] - b[0] || (a[1] ?? 0) - (b[1] ?? 0));
  return objects;
}

// ── 1959-2022: one CSV per object in the GP history zip ──
// The rows of the given objects with epochs in [fromMs, toMs), streamed by one
// unzip per batch; each member begins with its header line.
export async function scanHistorical(norads, fromMs, toMs, files = {}) {
  const zip = config.inputs.historicalZip;
  files[path.basename(zip)] = fs.readFileSync(`${zip}.sha256`, 'utf8').trim().split(/\s+/)[0];
  const objects = new Map();
  const members = norads.map((n) => `Archives2/sat${String(n).padStart(9, '0')}.csv`);
  for (let k = 0; k < members.length; k += 1500) {
    const child = spawn('unzip', ['-p', zip, ...members.slice(k, k + 1500)], { stdio: ['ignore', 'pipe', 'ignore'] });
    let cols = null;
    for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (line.startsWith('OBJECT_NAME,')) { cols = Object.fromEntries(line.split(',').map((c, i) => [c, i])); continue; }
      if (!cols || !line) continue;
      const v = line.split(',');
      if (String(v[cols.EPHEMERIS_TYPE]) !== '0') continue;
      const t = epochMs(v[cols.EPOCH]);
      if (!(t >= fromMs && t < toMs)) continue;
      const norad = Number(v[cols.NORAD_CAT_ID]);
      if (!objects.has(norad)) objects.set(norad, { norad, objectId: v[cols.OBJECT_ID], name: v[cols.OBJECT_NAME], rows: [] });
      objects.get(norad).rows.push([t, null, +v[cols.MEAN_MOTION], +v[cols.ECCENTRICITY], +v[cols.INCLINATION], +v[cols.RA_OF_ASC_NODE],
        +v[cols.ARG_OF_PERICENTER], +v[cols.MEAN_ANOMALY], +v[cols.BSTAR], null]);
    }
    await new Promise((resolve) => child.on('close', resolve));
  }
  for (const o of objects.values()) o.rows.sort((a, b) => a[0] - b[0]);
  return objects;
}

// The sets of one object as they stood at a cutoff: of the versions of one
// epoch (within 1 s), the latest created before cutoffMs (null: the latest of
// all), with epochs in [fromMs, toMs).
export function asOf(rows, fromMs, toMs, cutoffMs = null) {
  const out = [];
  for (const r of rows) {
    if (r[0] < fromMs || r[0] >= toMs) continue;
    if (cutoffMs !== null && !(r[1] !== null && r[1] < cutoffMs)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(r[0] - last[0]) <= 1000) { if ((r[1] ?? 0) >= (last[1] ?? 0)) out[out.length - 1] = r; continue; }
    out.push(r);
  }
  return out;
}

// Compact caches: {objects: [{norad, objectId, name, type, launch, rows}], files}.
export function writeCache(name, objects, files) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, `${name}.json.gz`);
  fs.writeFileSync(file, gzipSync(JSON.stringify({ objects: [...objects.values()], files })));
  return file;
}
export function readCache(name) {
  const file = path.join(cacheDir, `${name}.json.gz`);
  const raw = fs.readFileSync(file);
  const data = JSON.parse(gunzipSync(raw));
  return { objects: new Map(data.objects.map((o) => [o.norad, o])), files: data.files, sha256: sha256(raw) };
}

// The Space-Track SATCAT snapshot: norad -> {type, launch, decay, name, objectId}.
let satcatCache = null;
export function satcat() {
  if (satcatCache) return satcatCache;
  const raw = fs.readFileSync(config.inputs.satcat);
  const map = new Map(JSON.parse(gunzipSync(raw)).map((s) => [Number(s.NORAD_CAT_ID), { type: s.OBJECT_TYPE, launch: s.LAUNCH, decay: s.DECAY, name: s.SATNAME, objectId: s.INTLDES }]));
  satcatCache = { map, sha256: sha256(raw) };
  return satcatCache;
}

// GCAT satcat.tsv: norad -> {shape, mass, dryMass, length, diameter, span, type}.
let gcatCache = null;
export function gcat() {
  if (gcatCache) return gcatCache;
  const file = path.join(repoRoot, config.inputs.gcat.path);
  const raw = fs.readFileSync(file);
  const hash = sha256(raw);
  if (hash !== config.inputs.gcat.sha256) throw new Error(`GCAT ${file}: SHA-256 ${hash} is not the configured one`);
  const lines = raw.toString('utf8').split('\n');
  const head = lines[0].replace(/^#/, '').split('\t').map((s) => s.trim());
  const col = Object.fromEntries(head.map((c, i) => [c, i]));
  const num = (s) => { const x = Number(String(s ?? '').trim()); return Number.isFinite(x) && x > 0 ? x : null; };
  const map = new Map();
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith('#')) continue;
    const v = line.split('\t');
    const norad = Number(String(v[col.Satcat]).trim());
    if (!Number.isFinite(norad) || norad <= 0) continue;
    map.set(norad, { type: v[col.Type].trim(), shape: String(v[col.Shape] ?? '').trim(), mass: num(v[col.Mass]), dryMass: num(v[col.DryMass]),
      length: num(v[col.Length]), diameter: num(v[col.Diameter]), span: num(v[col.Span]) });
  }
  gcatCache = { map, sha256: hash };
  return gcatCache;
}

// The members of the zip, listed once (for objects whose CSV exists).
let membersCache = null;
export function historicalMembers() {
  if (!membersCache) {
    const names = execFileSync('unzip', ['-Z1', config.inputs.historicalZip], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n');
    membersCache = new Set(names.map((n) => /sat(\d+)\.csv$/.exec(n)?.[1]).filter(Boolean).map(Number));
  }
  return membersCache;
}
