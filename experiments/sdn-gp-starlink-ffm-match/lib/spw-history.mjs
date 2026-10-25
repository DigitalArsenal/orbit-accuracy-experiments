// Daily space weather for the years of the ISS archive (amendment A11): the saved environment holds 51 daily rows (2026-09-13 to 2026-11-02), too few for files from 2020 on.
// The data-source/space-weather module parses one current batch (it refuses a past day: "Invalid or stale NOAA 45-day forecast"), so the rows for earlier days are made here from the
// GFZ file Kp_ap_Ap_SN_F107_since_1932.txt kept in the local archive (CC BY 4.0), with the module's row semantics read off its own rows: KP1..8 = Kp x 10 rounded, AP1..8 and AP_AVG as
// the file, F107_OBS and F107_ADJ the day's values, F107_OBS_CENTER81 the mean of the observed flux over the 40 days either side and the day, F107_OBS_LAST81 the mean over the 80 days
// before and the day (the module's rows satisfy LAST81(d) = CENTER81(d - 40)). The construction is checked against the saved environment's rows that the file covers (fields equal), and
// the rows from SAVED_FROM on are the saved environment's own. Data preparation only (counting and means); the table is a $PRW (SPACE_WEATHER), cached with a provenance record.
import fs from 'node:fs';
import path from 'node:path';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { config, store, sha256 } from '../common.mjs';

const GFZ_FILE = path.join(config.archive, 'hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt');
const SAVED_FROM = '2026-09-13';
const FIRST = '2019-06-01';
const FILE = path.join(store, 'environment/space-weather-history.prw');
const INFO = path.join(store, 'environment/space-weather-history.json');
const table = (name, fields = {}) => Object.assign(new P[`${name}T`](), fields);
const DAY = 86400000;
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** The GFZ file's days: Map date -> { kp[8], ap[8], Ap, f107obs, f107adj }. */
function parseGfz(text) {
  const days = new Map();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const t = line.trim().split(/\s+/);
    if (t.length < 27) continue;
    days.set(`${t[0]}-${t[1]}-${t[2]}`, { kp: t.slice(7, 15).map(Number), ap: t.slice(15, 23).map(Number), Ap: Number(t[23]), f107obs: Number(t[25]), f107adj: Number(t[26]) });
  }
  return days;
}

/** Mean of `field` over the days from d - before to d + after (the days the file has with a value above 0). */
function mean(days, ms, before, after, field) {
  let sum = 0, n = 0;
  for (let k = -before; k <= after; k += 1) {
    const v = days.get(dateOf(ms + k * DAY))?.[field];
    if (Number.isFinite(v) && v > 0) { sum += v; n += 1; }
  }
  return n ? sum / n : -1;
}

/** The $PRW payload (Uint8Array) of the daily rows from FIRST to the saved table's last day, and the info record (with the check against the saved rows). Cached. */
export function spaceWeatherHistory(savedPrw) {
  if (fs.existsSync(FILE) && fs.existsSync(INFO)) return { payload: new Uint8Array(fs.readFileSync(FILE)), info: JSON.parse(fs.readFileSync(INFO, 'utf8')) };
  const text = fs.readFileSync(GFZ_FILE, 'utf8');
  const days = parseGfz(text);
  const saved = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(savedPrw))).unpack().SPACE_WEATHER.ROWS;
  const template = saved[0];
  const make = (date) => {
    const d = days.get(date), ms = Date.parse(`${date}T00:00:00Z`);
    const kp = d.kp.map((x) => (x < 0 ? -1 : Math.round(x * 10)));
    return Object.assign(new template.constructor(), template, {
      DATE: date, KP1: kp[0], KP2: kp[1], KP3: kp[2], KP4: kp[3], KP5: kp[4], KP6: kp[5], KP7: kp[6], KP8: kp[7], KP_SUM: kp.reduce((s, x) => s + Math.max(0, x), 0),
      AP1: d.ap[0], AP2: d.ap[1], AP3: d.ap[2], AP4: d.ap[3], AP5: d.ap[4], AP6: d.ap[5], AP7: d.ap[6], AP8: d.ap[7], AP_AVG: d.Ap, CP: 0, C9: 0, ISN: 0,
      F107_OBS: d.f107obs, F107_ADJ: d.f107adj, F107_DATA_TYPE: 0, F107_OBS_CENTER81: mean(days, ms, 40, 40, 'f107obs'), F107_OBS_LAST81: mean(days, ms, 80, 0, 'f107obs'),
      F107_ADJ_CENTER81: -1, F107_ADJ_LAST81: mean(days, ms, 80, 0, 'f107adj'),
    });
  };
  // the check against the saved environment's rows that the file covers: every field the construction sets must equal the module's
  const fields = ['KP1', 'KP2', 'KP3', 'KP4', 'KP5', 'KP6', 'KP7', 'KP8', 'KP_SUM', 'AP1', 'AP2', 'AP3', 'AP4', 'AP5', 'AP6', 'AP7', 'AP8', 'AP_AVG', 'F107_OBS', 'F107_ADJ', 'F107_OBS_LAST81', 'F107_ADJ_LAST81'];
  const same = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));
  const check = { rows: 0, fieldsEqual: 0, fieldsCompared: 0, mismatches: [] };
  for (const r of saved) {
    const d = days.get(r.DATE);
    if (!d || !(d.f107obs > 0) || d.kp.some((x) => x < 0)) continue;
    const mine = make(r.DATE);
    check.rows += 1;
    for (const f of fields) { check.fieldsCompared += 1; if (same(mine[f], r[f])) check.fieldsEqual += 1; else check.mismatches.push(`${r.DATE} ${f}: ${mine[f]} vs ${r[f]}`); }
  }
  // the module refuses a row without a positive F10.7 or with a negative Ap; a day the file lacks (-1) is left out, and the module keeps the values in force for a day no row covers
  const history = [], dropped = [];
  for (let ms = Date.parse(`${FIRST}T00:00:00Z`); dateOf(ms) < SAVED_FROM; ms += DAY) {
    if (!days.has(dateOf(ms))) continue;
    const row = make(dateOf(ms));
    if (!(row.F107_OBS > 0) || row.AP_AVG < 0 || !(row.F107_OBS_CENTER81 > 0) || !(row.F107_OBS_LAST81 > 0) || row.KP1 < 0) dropped.push(row.DATE); else history.push(row);
  }
  const merged = [...history, ...saved.filter((r) => r.DATE >= SAVED_FROM)];
  const b = new fb.Builder(1 << 20);
  b.finishSizePrefixed(Object.assign(new P.PRWT(), { SPACE_WEATHER: table('PRWSpaceWeatherTable', { ROWS: merged }) }).pack(b), '$PRW');
  const payload = b.asUint8Array().slice();
  const info = { rows: merged.length, first: merged[0].DATE, last: merged.at(-1).DATE, gfzRows: history.length, droppedDays: dropped, savedRows: merged.length - history.length, gfzFileSha256: sha256(Buffer.from(text)), checkAgainstSavedRows: { ...check, mismatches: check.mismatches.slice(0, 20) }, createdUtc: new Date().toISOString() };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, payload); fs.writeFileSync(INFO, `${JSON.stringify(info, null, 1)}\n`);
  return { payload, info };
}
