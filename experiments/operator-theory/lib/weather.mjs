// Daily $SPW rows for a live operator file: the weather as NOAA SWPC and GFZ published it by the given archive day. GFZ's history through its
// last day, then NOAA's observed daily F10.7 and planetary A and K, then NOAA's 45-day forecast. Forecast days have one Ap for the day, so the
// eight three-hour values repeat it and Kp comes from the published ap-to-Kp table. Data preparation only: dates, values and means.
import fs from 'node:fs';
import path from 'node:path';

const GFZ = '/opt/data/sdn-archive/hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt';
const NOAA = '/opt/data/sdn-archive/hac/noaa-swpc/2026';
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// The published 28-step ap value of each Kp third, Kp x 10 rounded to the nearest whole tenth.
const AP = [0, 2, 3, 4, 5, 6, 7, 9, 12, 15, 18, 22, 27, 32, 39, 48, 56, 67, 80, 94, 111, 132, 154, 179, 207, 236, 300, 400];
const KP10 = [0, 3, 7, 10, 13, 17, 20, 23, 27, 30, 33, 37, 40, 43, 47, 50, 53, 57, 60, 63, 67, 70, 73, 77, 80, 83, 87, 90];
const kpOf = (ap) => { let best = 0; for (let i = 0; i < AP.length; i += 1) if (Math.abs(AP[i] - ap) < Math.abs(AP[best] - ap)) best = i; return KP10[best]; };
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const DAY = 86400000;

/** GFZ's daily history from `since` on: [{ date, ap, kp (x 10), ap8, f107 }], a value GFZ has not given left out (ap and kp together, f107 alone). */
export function gfzDays(since) {
  const out = [];
  for (const line of fs.readFileSync(GFZ, 'latin1').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const t = line.trim().split(/\s+/);
    if (t.length < 28) continue;
    const date = `${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`;
    if (date < since) continue;
    const kp = t.slice(7, 15).map((k) => Math.round(Number(k) * 10)), ap8 = t.slice(15, 23).map(Number), ap = Number(t[23]), f = Number(t[25]);
    out.push({ date, ...(ap >= 0 && kp.every((k) => k >= 0) ? { ap, kp, ap8 } : {}), ...(f > 0 ? { f107: f } : {}) });
  }
  return out;
}

/** { rows: [SPW fields], through: { observed, forecast }, sources }: every day from `from` to `to`, ISO dates. */
export function weatherRows(archiveDay, from, to) {
  const days = new Map();
  const put = (date, patch) => days.set(date, { ...(days.get(date) ?? {}), ...patch });
  for (const { date, ap, kp, ap8, f107 } of gfzDays('2026-01-01')) {
    if (ap !== undefined) put(date, { ap, kp, ap8, src: 'gfz' });
    if (f107 !== undefined) put(date, { f107, f107Source: 'gfz' });
  }
  const folder = path.join(NOAA, archiveDay);
  for (const line of fs.readFileSync(path.join(folder, 'daily-solar-indices.txt'), 'latin1').split('\n')) {
    const t = line.trim().split(/\s+/);
    if (/^\d{4}$/.test(t[0]) && Number(t[3]) > 0) {
      const date = `${t[0]}-${t[1]}-${t[2]}`;
      if (!days.get(date)?.f107) put(date, { f107: Number(t[3]), f107Source: 'noaa' });
    }
  }
  for (const line of fs.readFileSync(path.join(folder, 'daily-geomagnetic-indices.txt'), 'latin1').split('\n')) {
    if (!/^\d{4} \d\d \d\d/.test(line)) continue;
    const date = line.slice(0, 10).replaceAll(' ', '-');
    if (days.get(date)?.src === 'gfz') continue;
    const ap = Number(line.slice(58, 63)), k = line.slice(63).trim().split(/\s+/).map(Number);
    if (!(ap >= 0)) continue;
    const kp = k.length === 8 && k.every((x) => x >= 0) ? k.map((x) => Math.round(x * 10)) : Array(8).fill(kpOf(ap));
    put(date, { ap, kp, ap8: Array(8).fill(ap), src: 'noaa' });
  }
  let observedThrough = [...days.keys()].sort().at(-1);
  const forecast = fs.readFileSync(path.join(folder, '45-day-forecast.txt'), 'latin1');
  let section = null;
  const forecasted = new Set();
  for (const line of forecast.split('\n')) {
    if (/AP FORECAST/.test(line)) { section = 'ap'; continue; }
    if (/F10\.7/.test(line) && /FORECAST/.test(line)) { section = 'f'; continue; }
    for (const m of line.matchAll(/(\d\d)([A-Z][a-z]{2})(\d\d) (\d{3})/g)) {
      const date = `20${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1]}`, v = Number(m[4]);
      if (section === 'ap' && !days.get(date)?.ap && days.get(date)?.ap !== 0) { put(date, { ap: v, kp: Array(8).fill(kpOf(v)), ap8: Array(8).fill(v), src: 'forecast' }); forecasted.add(date); }
      if (section === 'f' && !days.get(date)?.f107) { put(date, { f107: v, f107Source: 'forecast' }); forecasted.add(date); }
    }
  }
  observedThrough = [...days.entries()].filter(([, d]) => d.src && d.src !== 'forecast').map(([date]) => date).sort().at(-1);
  const center = (t) => {
    const v = [];
    for (let k = -40; k <= 40; k += 1) { const d = days.get(iso(t + k * DAY)); if (d?.f107) v.push(d.f107); }
    return v.length >= 40 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const rows = [];
  let last = null;
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const date = iso(t), d = days.get(date), c81 = center(t);
    if (d && d.f107 && d.kp && c81) last = { d, c81 };
    if (!last) throw new Error(`no weather for ${date}`);
    const { d: u, c81: c } = last;
    rows.push({
      DATE: date, KP1: u.kp[0], KP2: u.kp[1], KP3: u.kp[2], KP4: u.kp[3], KP5: u.kp[4], KP6: u.kp[5], KP7: u.kp[6], KP8: u.kp[7], KP_SUM: u.kp.reduce((a, b) => a + b, 0),
      AP1: u.ap8[0], AP2: u.ap8[1], AP3: u.ap8[2], AP4: u.ap8[3], AP5: u.ap8[4], AP6: u.ap8[5], AP7: u.ap8[6], AP8: u.ap8[7], AP_AVG: u.ap,
      F107_OBS: u.f107, F107_ADJ: u.f107, F107_DATA_TYPE: 0, F107_OBS_CENTER81: c,
    });
  }
  return { rows, observedThrough, sources: { gfz: GFZ, noaa: folder } };
}
