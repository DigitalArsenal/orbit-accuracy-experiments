// The CORDS reentry history spreadsheet of the local archive (hac/aerospace-cords/, fetched once on 2026-10-24; amendment A11, M29): one row per object, with the observed reentry
// (UTC, or N/A), the epoch of the element set Aerospace's prediction used, the prediction and its stated uncertainty (the 20 % rule, +- hours). Parsing only.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../common.mjs';

export const CORDS_FILE = path.join(config.archive, 'hac/aerospace-cords/Reentry_History_Spreadsheet_05-22-26.csv');

function csvRows(text) {
  const rows = []; let cur = [], f = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 1; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { cur.push(f); f = ''; }
    else if (c === '\n') { cur.push(f.replace(/\r$/, '')); rows.push(cur); cur = []; f = ''; }
    else f += c;
  }
  if (f || cur.length) { cur.push(f); rows.push(cur); }
  return rows;
}

export function readCords(file = CORDS_FILE) {
  const rows = csvRows(fs.readFileSync(file, 'utf8'));
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length >= head.length - 1).map((r) => {
    const x = Object.fromEntries(head.map((h, i) => [h, r[i]]));
    const obs = x['Observed Reentry Date (UTC)'];
    return {
      norad: x.SSN, name: x['Object Name'], designator: x['International Designator'], type: x.Type,
      observedUtc: obs && obs !== 'N/A' ? obs : null, tleEpochUtc: x['TLE Epoch (UTC)'], predictionUtc: x['Aerospace Reentry Prediction (UTC)'], uncertaintyHours: Number(x['Aerospace Stated Uncertainty 20% Rule (+/- hrs)']),
    };
  });
}

/** The observed reentries usable for M29: an observed time of day (not 00:00:00, which is a date), an element set after 2022-11-27 (the local GP history starts 2022-11-20), a clean time to go at that set. */
export function cordsObserved(rows = readCords()) {
  return rows.filter((r) => r.observedUtc && !/T00:00:00(\.0+)?Z$/.test(r.observedUtc) && Date.parse(r.tleEpochUtc) >= Date.parse('2022-11-27T00:00:00Z')
    && Date.parse(r.observedUtc) - Date.parse(r.tleEpochUtc) > -3 * 3600e3 && Date.parse(r.observedUtc) - Date.parse(r.tleEpochUtc) < 14 * 86400e3);
}
