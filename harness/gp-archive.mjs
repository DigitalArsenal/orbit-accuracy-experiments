// Reads Space-Track gp_history from the local SDN archive (one file per
// creation day, raw JSON as served, gzipped). Element sets stay on this
// machine: callers commit only aggregates and the file hashes recorded here.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { sha256 } from './modules.mjs';
import { ELEMENT_FIELDS } from './records.mjs';

const DAY_MS = 86400000;
export const dayList = (from, to) => {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};
export const shiftDay = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// Space-Track epochs are UTC without a zone ("2026-08-05T10:50:50.111232").
export const epochMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);

// Every element set created on the days [from, to] (whole-day files only), in
// file order, without de-duplication: the selection analysis/gp-error-model's
// own scripts make (scripts/archive.mjs `readSets`). The module merges
// republished duplicates itself.
export function readCreationDays(archive, from, to, { keep = () => true, theory = 'SGP4', ephemerisType = '0' } = {}) {
  const files = {};
  const sets = [];
  for (const day of dayList(from, to)) {
    const file = path.join(archive, day.slice(0, 4), `${day}.json.gz`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file);
    files[path.relative(archive, file)] = sha256(raw);
    for (const g of JSON.parse(gunzipSync(raw))) {
      const norad = Number(g.NORAD_CAT_ID);
      if (g.MEAN_ELEMENT_THEORY !== theory || String(g.EPHEMERIS_TYPE) !== ephemerisType || !keep(norad, g)) continue;
      sets.push({ norad, epoch: g.EPOCH, creationDate: g.CREATION_DATE, gpId: String(g.GP_ID), elements: Object.fromEntries(ELEMENT_FIELDS.map((f) => [f, Number(g[f])])) });
    }
  }
  return { sets, files };
}

// Element sets whose EPOCH lies in [from, to] (days, inclusive), read from the
// creation-day files [from, to + lagDays]. `keep(norad, record)` filters early.
// Returns {sets, files}; files maps each file read to its SHA-256.
export function readElementSets(archive, from, to, { keep = () => true, lagDays = 3, theory = 'SGP4', ephemerisType = '0', duplicateEpochSeconds = 1 } = {}) {
  const lo = Date.parse(`${from}T00:00:00Z`), hi = Date.parse(`${to}T00:00:00Z`) + DAY_MS;
  const files = {};
  const byId = new Map();
  for (const day of dayList(from, shiftDay(to, lagDays))) {
    const dir = path.join(archive, day.slice(0, 4));
    if (!fs.existsSync(dir)) continue;
    // A day's file, and any partial windows that start on that day.
    for (const name of fs.readdirSync(dir).filter((n) => n.startsWith(day) && n.endsWith('.json.gz')).sort()) {
      const file = path.join(dir, name);
      const raw = fs.readFileSync(file);
      files[path.relative(archive, file)] = sha256(raw);
      for (const g of JSON.parse(gunzipSync(raw))) {
        if (g.MEAN_ELEMENT_THEORY !== theory || String(g.EPHEMERIS_TYPE) !== ephemerisType) continue;
        const norad = Number(g.NORAD_CAT_ID);
        if (!keep(norad, g)) continue;
        const t = epochMs(g.EPOCH);
        if (!(t >= lo && t < hi)) continue;
        // Windows overlap by one boundary second: GP_ID identifies a record.
        byId.set(String(g.GP_ID), g);
      }
    }
  }
  // An element set republished with an epoch within duplicateEpochSeconds is
  // one set: keep the later creation, as analysis/gp-error-model does.
  const byObject = new Map();
  for (const g of byId.values()) {
    const norad = Number(g.NORAD_CAT_ID);
    if (!byObject.has(norad)) byObject.set(norad, []);
    byObject.get(norad).push(g);
  }
  const sets = [];
  let duplicates = 0;
  for (const [norad, list] of [...byObject].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => epochMs(a.EPOCH) - epochMs(b.EPOCH) || String(a.CREATION_DATE).localeCompare(String(b.CREATION_DATE)));
    const kept = [];
    for (const g of list) {
      const last = kept[kept.length - 1];
      if (last && Math.abs(epochMs(g.EPOCH) - epochMs(last.EPOCH)) <= duplicateEpochSeconds * 1000) {
        ++duplicates;
        if (String(g.CREATION_DATE) >= String(last.CREATION_DATE)) kept[kept.length - 1] = g;
        continue;
      }
      kept.push(g);
    }
    for (const g of kept) {
      sets.push({
        norad,
        objectId: g.OBJECT_ID,
        gpId: String(g.GP_ID),
        epoch: g.EPOCH,
        creationDate: g.CREATION_DATE,
        elements: Object.fromEntries(ELEMENT_FIELDS.map((f) => [f, Number(g[f])])),
      });
    }
  }
  return { sets, files, duplicates };
}
