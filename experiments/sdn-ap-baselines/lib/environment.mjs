// FFM's environment for every window (amendments A1 and A2): G1's saved Earth orientation, space weather and kernel where they reach, extended to the years of
// the older windows. Earth orientation: the IERS finals.all (IAU 2000) file of the local archive parsed by data-source/eop-parser for an arc outside the saved
// rows' span, the saved rows for an arc inside it (one series per arc). Space weather: G1's construction (its lib/spw-history.mjs, amendment A11 of G1) from the GFZ file
// Kp_ap_Ap_SN_F107_since_1932.txt of the local archive, started at FIRST instead of 2019-06-01, the saved rows from 2026-09-13 on, checked against the saved
// rows the file covers and against G1's own cached history over the days both hold. Data preparation only; cached in the B1 store with a provenance record.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, store, sha256 } from '../common.mjs';

const ARCHIVE = '/opt/data/sdn-archive';
const GFZ_FILE = path.join(ARCHIVE, 'hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt');
const FINALS_FILE = path.join(ARCHIVE, 'hac/iers-eop/20261009/finals.all.iau2000.txt');
const SAVED_FROM = '2026-09-13';
const FIRST = '2012-06-01';
const DAY = 86400000;
const dateOf = (t) => new Date(t).toISOString().slice(0, 10);
const FILE = path.join(store, 'environment/environment.json');

function parseGfz(text) { // G1 lib/spw-history.mjs parseGfz
  const days = new Map();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const t = line.trim().split(/\s+/);
    if (t.length < 27) continue;
    days.set(`${t[0]}-${t[1]}-${t[2]}`, { kp: t.slice(7, 15).map(Number), ap: t.slice(15, 23).map(Number), Ap: Number(t[23]), f107obs: Number(t[25]), f107adj: Number(t[26]) });
  }
  return days;
}
function mean(days, t, before, after, field) { // G1 lib/spw-history.mjs mean
  let sum = 0, n = 0;
  for (let k = -before; k <= after; k += 1) {
    const v = days.get(dateOf(t + k * DAY))?.[field];
    if (Number.isFinite(v) && v > 0) { sum += v; n += 1; }
  }
  return n ? sum / n : -1;
}
function records(bytes, Type) { // a stream of size-prefixed records
  const out = [];
  for (let at = 0; at < bytes.length;) { const n = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, true); out.push(Type[`getSizePrefixedRootAs${Type.name}`](new (Type.fb.ByteBuffer)(bytes.subarray(at, at + n + 4))).unpack()); at += n + 4; }
  return out;
}

/** inputsFor(fromMs, toMs): the FFM inputs (kernel, earth_orientation, space_weather) of one arc; and their provenance. */
export async function ffmEnvironment(modules, g1Context) {
  const env = await import(pathToFileURL(path.join(modules, 'analysis/od/scripts/operator-environment.mjs')));
  const odRequire = (await import('node:module')).createRequire(path.join(modules, 'analysis/od/package.json'));
  const sds = path.dirname(odRequire.resolve('spacedatastandards.org/package.json'));
  const P = await import(pathToFileURL(path.join(sds, 'lib/js/PRW/main.js')));
  const { EOP } = await import(pathToFileURL(path.join(sds, 'lib/js/EOP/EOP.js')));
  const fb = await import(pathToFileURL(odRequire.resolve('flatbuffers')));
  EOP.fb = fb;
  const savedOf = (port) => P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(g1Context.inputs.find((i) => i.portId === port).payload))).unpack();
  const encode = (arm, value) => { const b = new fb.Builder(1 << 20); b.finishSizePrefixed(Object.assign(new P.PRWT(), { [arm]: value }).pack(b), '$PRW'); return b.asUint8Array().slice(); };
  const kernel = g1Context.inputs.find((i) => i.portId === 'kernel');
  // FFM takes at most a year of rows per table: each window gets the rows of its own arc, two days either side
  // and one Earth-orientation series (FFM refuses a table that mixes series, amendment A2): G1's saved rows when the arc lies within their span, else the finals.all rows
  const savedEop = savedOf('earth_orientation').EARTH_ORIENTATION.ROWS;
  const forArc = (finalsRows, weatherRows) => (fromMs, toMs) => {
    const mjd = (t) => t / DAY + 40587, lo = fromMs - 2 * DAY, hi = toMs + 2 * DAY;
    const inSaved = mjd(lo) - 1 >= savedEop[0].MJD && mjd(hi) + 1 <= savedEop.at(-1).MJD;
    const e = (inSaved ? savedEop : finalsRows).filter((r) => r.MJD >= mjd(lo) - 1 && r.MJD <= mjd(hi) + 1);
    const w = weatherRows.filter((r) => r.DATE >= dateOf(lo) && r.DATE <= dateOf(hi));
    return [kernel, env.input('earth_orientation', 'PRW', encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: e }))), env.input('space_weather', 'PRW', encode('SPACE_WEATHER', Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: w })))];
  };
  if (fs.existsSync(FILE)) {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const rows = (port, arm) => P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(Buffer.from(saved.inputs[port], 'base64')))).unpack()[arm].ROWS;
    return { inputsFor: forArc(rows('earth_orientation_finals', 'EARTH_ORIENTATION'), rows('space_weather', 'SPACE_WEATHER')), provenance: saved.provenance };
  }
  // Earth orientation
  const { createBrowserModuleHarness } = await import(pathToFileURL(odRequire.resolve('space-data-module-sdk/host/browser-module')).href);
  const dir = path.join(modules, 'data-source/eop-parser');
  const parser = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm')), manifest: JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'))), surface: 'direct' });
  let finals;
  try {
    const r = await parser.invoke({ methodId: 'parse_finals2000a', inputs: [env.fil(fs.readFileSync(FINALS_FILE), 'eop.txt', 'body')] });
    if (r.statusCode !== 0) throw new Error(`eop-parser: ${r.errorMessage}`);
    finals = records(new Uint8Array(r.outputs.find((o) => o.portId === 'records').payload), EOP);
  } finally { await parser.destroy(); }
  // Space weather
  const text = fs.readFileSync(GFZ_FILE, 'utf8');
  const days = parseGfz(text);
  const saved = savedOf('space_weather').SPACE_WEATHER.ROWS;
  const template = saved[0];
  const make = (date) => {
    const d = days.get(date), t = Date.parse(`${date}T00:00:00Z`);
    const kp = d.kp.map((x) => (x < 0 ? -1 : Math.round(x * 10)));
    return Object.assign(new template.constructor(), template, {
      DATE: date, KP1: kp[0], KP2: kp[1], KP3: kp[2], KP4: kp[3], KP5: kp[4], KP6: kp[5], KP7: kp[6], KP8: kp[7], KP_SUM: kp.reduce((s, x) => s + Math.max(0, x), 0),
      AP1: d.ap[0], AP2: d.ap[1], AP3: d.ap[2], AP4: d.ap[3], AP5: d.ap[4], AP6: d.ap[5], AP7: d.ap[6], AP8: d.ap[7], AP_AVG: d.Ap, CP: 0, C9: 0, ISN: 0,
      F107_OBS: d.f107obs, F107_ADJ: d.f107adj, F107_DATA_TYPE: 0, F107_OBS_CENTER81: mean(days, t, 40, 40, 'f107obs'), F107_OBS_LAST81: mean(days, t, 80, 0, 'f107obs'),
      F107_ADJ_CENTER81: -1, F107_ADJ_LAST81: mean(days, t, 80, 0, 'f107adj'),
    });
  };
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
  const history = [], dropped = [];
  for (let t = Date.parse(`${FIRST}T00:00:00Z`); dateOf(t) < SAVED_FROM; t += DAY) {
    if (!days.has(dateOf(t))) continue;
    const row = make(dateOf(t));
    if (!(row.F107_OBS > 0) || row.AP_AVG < 0 || !(row.F107_OBS_CENTER81 > 0) || !(row.F107_OBS_LAST81 > 0) || row.KP1 < 0) dropped.push(row.DATE); else history.push(row);
  }
  const weatherRows = [...history, ...saved.filter((r) => r.DATE >= SAVED_FROM)];
  // the same days in G1's cached history (2019-06-01 on): equal by construction, compared field by field
  const g1Cache = path.join(config.g1.store, 'environment/space-weather-history.prw');
  const g1Check = { rows: 0, fieldsEqual: 0, fieldsCompared: 0 };
  if (fs.existsSync(g1Cache)) {
    const g1Rows = new Map(P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(fs.readFileSync(g1Cache)))).unpack().SPACE_WEATHER.ROWS.map((r) => [r.DATE, r]));
    for (const r of weatherRows) { const g = g1Rows.get(r.DATE); if (!g) continue; g1Check.rows += 1; for (const f of fields) { g1Check.fieldsCompared += 1; if (same(r[f], g[f])) g1Check.fieldsEqual += 1; } }
  }
  const eopPayload = encode('EARTH_ORIENTATION', Object.assign(new P.PRWEarthOrientationT(), { ROWS: finals }));
  const swPayload = encode('SPACE_WEATHER', Object.assign(new P.PRWSpaceWeatherTableT(), { ROWS: weatherRows }));
  const provenance = {
    createdUtc: new Date().toISOString(), kernel: g1Context.provenance.kernel,
    earthOrientation: { finalsFile: FINALS_FILE, finalsSha256: sha256(fs.readFileSync(FINALS_FILE)), finalsRows: finals.length, firstMjd: finals[0].MJD, lastMjd: finals.at(-1).MJD, savedRows: savedEop.length, savedFirstMjd: savedEop[0].MJD, savedLastMjd: savedEop.at(-1).MJD, rule: 'an arc within the saved span takes the saved rows, any other arc the finals.all rows' },
    spaceWeather: { gfzFile: GFZ_FILE, gfzSha256: sha256(Buffer.from(text)), first: weatherRows[0].DATE, last: weatherRows.at(-1).DATE, gfzRows: history.length, savedRows: weatherRows.length - history.length, droppedDays: dropped, checkAgainstSavedRows: { ...check, mismatches: check.mismatches.slice(0, 20) }, checkAgainstG1History: g1Check },
    g1EnvironmentSha256: g1Context.provenance.environmentSha256,
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify({ provenance, inputs: { earth_orientation_finals: Buffer.from(eopPayload).toString('base64'), space_weather: Buffer.from(swPayload).toString('base64') } })}\n`);
  return { inputsFor: forArc(finals, weatherRows), provenance };
}
