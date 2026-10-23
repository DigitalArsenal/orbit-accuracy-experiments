// The ephemerides of the experiment as objects { source, id, norad, name, objectId, originator, creation, frame,
// timeSystem, lines: [{epoch, r, v}], t } with positions in km and velocities in km/s. Precise orbits are read from the
// archive's reference states (GCRF $OEM made by analysis/reference-states from the products' SP3, Earth orientation
// applied); operator files are parsed in memory and never written. Source selection follows modules
// propagator/sgp4-xp tests/measure/lib/sources.mjs so windows compare with that measurement.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { OEM, flatbuffers, blockLines } from './sds.mjs';
import { ms, withT } from './windows.mjs';

export const ARCHIVE = process.env.SDN_ARCHIVE ?? '/opt/data/sdn-archive';
const referenceRoot = path.join(ARCHIVE, 'reference-states/reference');
const referenceDir = (name) => path.join(referenceRoot, name);

// ---- CCSDS OEM text (NASA ISS) ----
export function parseOemKvn(text) {
  const blocks = [];
  const header = {};
  let meta = null, current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('COMMENT')) continue;
    if (line === 'META_START') { meta = {}; continue; }
    if (line === 'META_STOP') {
      current = { frame: meta.REF_FRAME, timeSystem: meta.TIME_SYSTEM, name: meta.OBJECT_NAME, id: meta.OBJECT_ID, lines: [] };
      blocks.push(current); meta = null; continue;
    }
    const kv = /^([A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (kv) { (meta ?? header)[kv[1]] = kv[2].trim(); continue; }
    if (!current) continue;
    const f = line.split(/\s+/);
    if (f.length >= 7 && /^\d{4}-/.test(f[0])) current.lines.push({ epoch: f[0], r: f.slice(1, 4).map(Number), v: f.slice(4, 7).map(Number) });
  }
  return { header, blocks };
}
const readText = (file) => { const b = fs.readFileSync(file); return (file.endsWith('.gz') ? zlib.gunzipSync(b) : b).toString('utf8'); };

/** NASA JSC ISS OEM (EME2000, UTC, 4 min): the local copy named by `file`. */
export function iss({ file = path.join(ARCHIVE, 'hac/nasa-iss-oem/20261009/ISS.OEM_J2K_EPH.txt') } = {}) {
  const { header, blocks } = parseOemKvn(readText(file));
  const lines = blocks.flatMap((b) => b.lines);
  return [withT({ source: 'iss', id: 'ISS', norad: 25544, name: 'ISS', objectId: '1998-067A', originator: header.ORIGINATOR, creation: header.CREATION_DATE, frame: 'EME2000', timeSystem: 'UTC', lines })];
}

// ---- SpaceX MEME ----
const memeEpoch = (token) => {
  const m = /^(\d{4})(\d{3})(\d{2})(\d{2})(\d{2}\.\d+)$/.exec(token);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), 0, 1) + (Number(m[2]) - 1) * 86400000 + Number(m[3]) * 3600000 + Number(m[4]) * 60000 + Number(m[5]) * 1000).toISOString();
};
/** The state lines of a SpaceX MEME text (EME2000, km, km/s, UTC). */
export function parseMeme(text) {
  const lines = [];
  for (const raw of text.split('\n')) {
    const f = raw.trim().split(/\s+/);
    if (f.length !== 7) continue;
    const epoch = memeEpoch(f[0]);
    if (epoch) lines.push({ epoch, r: f.slice(1, 4).map(Number), v: f.slice(4, 7).map(Number) });
  }
  return lines;
}
export const memeHeader = (text) => ({
  start: /ephemeris_start:(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/.exec(text)?.slice(1).join('T') ?? null,
  stop: /ephemeris_stop:(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/.exec(text)?.slice(1).join('T') ?? null,
  created: /created:(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/.exec(text)?.slice(1).join('T') ?? null,
});

// ---- reference states ($OEM, size-prefixed, GCRF, UTC) ----
function readReference(file) {
  const oem = OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(fs.readFileSync(file)))).unpack();
  const block = oem.EPHEMERIS_DATA_BLOCK[0];
  return { norad: block.OBJECT.NORAD_CAT_ID, name: block.OBJECT.OBJECT_NAME, objectId: block.OBJECT.OBJECT_ID, lines: blockLines(block) };
}
function chain(files) { // consecutive files of one object as one series (they overlap at their ends)
  const byEpoch = new Map();
  let head = null;
  for (const file of files) {
    const ref = readReference(file);
    head ??= ref;
    for (const line of ref.lines) byEpoch.set(line.epoch, line);
  }
  return { ...head, lines: [...byEpoch.values()].sort((a, b) => ms(a.epoch) - ms(b.epoch)) };
}

/** ESA/ESOC final GNSS orbits (5 min): `perConstellation` satellites of each constellation, taken evenly from the first day's files. */
export function gnss({ perConstellation = 2, firstDay = 268, days = 20 } = {}) {
  const directories = Array.from({ length: days }, (_, k) => `ESA0OPSFIN_2024${String(firstDay + k).padStart(3, '0')}0000_01D_05M_ORB`).filter((d) => fs.existsSync(referenceDir(d)));
  if (!directories.length) return [];
  const first = referenceDir(directories[0]);
  const available = fs.readdirSync(first).filter((f) => f.endsWith('.oem')).map((f) => Number(f.replace('.oem', '')));
  const byConstellation = new Map();
  for (const norad of available) {
    const key = /^([A-Z])\d/.exec(readReference(path.join(first, `${norad}.oem`)).name)?.[1];
    if (key) byConstellation.set(key, [...(byConstellation.get(key) ?? []), norad]);
  }
  const chosen = [];
  for (const key of ['G', 'E', 'R', 'C']) {
    const list = byConstellation.get(key) ?? [];
    const take = Math.min(perConstellation, list.length);
    for (let k = 0; k < take; k += 1) chosen.push(list[Math.floor(((k + 0.5) * list.length) / take)]);
  }
  return chosen.map((norad) => {
    const series = chain(directories.map((d) => path.join(referenceDir(d), `${norad}.oem`)).filter((f) => fs.existsSync(f)));
    return withT({ source: 'gnss', id: `${series.name} (${norad})`, norad, name: series.name, objectId: series.objectId, originator: 'ESA/ESOC ESA0OPSFIN', creation: '', frame: 'GCRF', timeSystem: 'UTC', lines: series.lines });
  });
}

/** ILRS combined weekly laser-ranging orbits (2 or 15 min), consecutive weeks of one target. */
export function slrHigh({ target, weeks = 4, first = 0 }) {
  const prefix = `ilrsa.orb.${target}.`;
  const directories = fs.readdirSync(referenceRoot).filter((d) => d.startsWith(prefix)).sort().slice(first, first + weeks);
  const files = directories.map((d) => fs.readdirSync(referenceDir(d)).filter((f) => f.endsWith('.oem')).map((f) => path.join(referenceDir(d), f))[0]).filter(Boolean);
  if (!files.length) return [];
  const series = chain(files);
  return [withT({ source: 'slr-high', id: `${series.name || target} (${series.norad})`, norad: series.norad, name: series.name || target, objectId: series.objectId, originator: 'ILRS combination (ilrsa)', creation: '', frame: 'GCRF', timeSystem: 'UTC', lines: series.lines })];
}

/** ILRS analysis-centre 4-day arcs (NSGF) of the low laser-ranged satellites; each arc is its own object. */
export function slrLow({ target, arcs = 8, first = 0 }) {
  const prefix = `nsgf.orb.${target}.`;
  const directories = fs.readdirSync(referenceRoot).filter((d) => d.startsWith(prefix)).sort().slice(first, first + arcs);
  return directories.map((d) => {
    const ref = readReference(path.join(referenceDir(d), fs.readdirSync(referenceDir(d)).filter((f) => f.endsWith('.oem'))[0]));
    return withT({ source: 'slr-low', id: `${ref.name || target} arc ${d.split('.')[3]} (${ref.norad})`, norad: ref.norad, name: ref.name || target, objectId: ref.objectId, originator: 'ILRS NSGF analysis-centre arc', creation: '', frame: 'GCRF', timeSystem: 'UTC', lines: ref.lines });
  });
}

// ---- GFZ multi-GNSS rapid orbits in E14's reference set: GEO (names ending G) and IGSO (names ending I) satellites ----
// Amendment A4: 20 consecutive days from 2025-10-01, fit windows every 48 h.
export const MGEX_A4 = Object.freeze({ year: 2025, firstDay: 274, days: 20, strideSeconds: 172800 });
const mgexRoot = path.join(ARCHIVE, 'e14-covariance-realism/reference');
export function mgex({ klass, year = 2025, firstDay = 274, days = 20 }) {
  const directories = Array.from({ length: days }, (_, k) => `GFZ0MGXRAP_${year}${String(firstDay + k).padStart(3, '0')}0000_01D_05M_ORB`).filter((d) => fs.existsSync(path.join(mgexRoot, d)));
  if (!directories.length) return [];
  const first = path.join(mgexRoot, directories[0]);
  const wanted = klass === 'geo' ? /\dG$/ : /\dI$/;
  const chosen = fs.readdirSync(first).filter((f) => f.endsWith('.oem')).map((f) => ({ norad: Number(f.replace('.oem', '')), name: readReference(path.join(first, f)).name })).filter((o) => wanted.test(o.name));
  return chosen.map((o) => {
    const series = chain(directories.map((d) => path.join(mgexRoot, d, `${o.norad}.oem`)).filter((f) => fs.existsSync(f)));
    return withT({ source: `mgex-${klass}`, id: `${series.name} (${o.norad})`, norad: o.norad, name: series.name, objectId: series.objectId, originator: 'GFZ MGEX rapid orbits (GFZ0MGXRAP)', creation: '', frame: 'GCRF', timeSystem: 'UTC', lines: series.lines });
  });
}
