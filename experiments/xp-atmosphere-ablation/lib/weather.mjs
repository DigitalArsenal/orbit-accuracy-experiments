// The measured space weather of PLAN.md (Space weather): daily $SPW rows made from the GFZ file Kp_ap_Ap_SN_F107 of the
// local archive (CC BY 4.0, Matzka et al. 2021): the file since 1932 up to its last day, then the latest nowcast file,
// each day from the most recent file that holds a value for it. Per day: the daily Ap, the observed F10.7 (DRAO
// Penticton) and its 81-day centered mean over the days with a value. Condition O recomputes each row's mean over the
// days at or before the knowledge cutoff. Data preparation only: dates, values and means.
import fs from 'node:fs';
import path from 'node:path';
import { config, dateOf, DAY, sha256 } from '../common.mjs';

const W = config.spaceWeather;

function parseGfz(text, into) {
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const t = line.trim().split(/\s+/);
    if (t.length < 27) continue;
    const date = `${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`;
    const ap = Number(t[23]), f107 = Number(t[25]);
    const day = into.get(date) ?? {};
    if (Number.isFinite(ap) && ap >= 0) day.ap = ap;
    if (Number.isFinite(f107) && f107 > 0) day.f107 = f107;
    into.set(date, day);
  }
}

let cache = null;
/** The days (Map date -> { f107, ap }) and the files read, with their SHA-256. */
export function gfzDays() {
  if (cache) return cache;
  const files = [W.gfzHistory];
  const nowcasts = fs.readdirSync(W.gfzNowcastDir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.existsSync(path.join(W.gfzNowcastDir, d, W.gfzNowcastName))).sort();
  files.push(...nowcasts.map((d) => path.join(W.gfzNowcastDir, d, W.gfzNowcastName)));
  const days = new Map();
  const provenance = [];
  for (const f of files) { // later files win for the days they hold a value for
    const text = fs.readFileSync(f, 'utf8');
    parseGfz(text, days);
    provenance.push({ file: f, sha256: sha256(Buffer.from(text)) });
  }
  cache = { days, provenance };
  return cache;
}

/** The 81-day centered mean of the observed flux on `date`, over the days with a value at or before `lastDate` (null: all). */
function center81(days, t, lastDate) {
  let sum = 0, n = 0;
  for (let k = -W.center81Days; k <= W.center81Days; k += 1) {
    const d = dateOf(t + k * DAY);
    if (lastDate && d > lastDate) break;
    const v = days.get(d)?.f107;
    if (Number.isFinite(v)) { sum += v; n += 1; }
  }
  return n ? sum / n : null;
}

/** The rows of [fromMs, toMs] (UTC days) for a condition: M every day the file holds; O the days before the UTC day of
 *  `cutoffMs`, each F10.7a over the days at or before the last of them. A day without F10.7 or Ap is left out (the module
 *  holds the previous row). */
export function rowsFor(fromMs, toMs, condition, cutoffMs) {
  const { days } = gfzDays();
  const lastDate = condition === 'O' ? dateOf(Date.parse(`${dateOf(cutoffMs)}T00:00:00Z`) - DAY) : null;
  const rows = [];
  for (let t = Date.parse(`${dateOf(fromMs)}T00:00:00Z`); t <= toMs; t += DAY) {
    const date = dateOf(t);
    if (lastDate && date > lastDate) break;
    const d = days.get(date);
    if (!d || !Number.isFinite(d.f107) || !Number.isFinite(d.ap)) continue;
    const c81 = center81(days, t, lastDate);
    if (!(c81 > 0)) continue;
    rows.push({ date, f107: d.f107, c81, ap: Math.round(d.ap) });
  }
  return rows;
}

/** NOAA SWPC's daily solar data (DSD) F10.7 against the GFZ file, every day both hold: the largest and the median
 *  absolute difference (sfu) and the count. */
export function swpcCheck() {
  const { days } = gfzDays();
  const dir = W.swpcCheck;
  const diffs = [];
  const seen = new Set();
  const files = [];
  const read = (file) => {
    files.push({ file, sha256: sha256(fs.readFileSync(file)) });
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^(\d{4}) (\d{2}) (\d{2})\s+(\d+)\s/.exec(line);
      if (!m) continue;
      const date = `${m[1]}-${m[2]}-${m[3]}`, swpc = Number(m[4]), gfz = days.get(date)?.f107;
      if (seen.has(date) || !Number.isFinite(gfz) || !(swpc > 0)) continue;
      seen.add(date);
      diffs.push(Math.abs(swpc - gfz));
    }
  };
  for (const f of fs.readdirSync(dir).filter((n) => /_DSD\.txt$/.test(n)).sort()) read(path.join(dir, f));
  // the archive's daily fetches (the last 30 days each), newest first so that a day takes its latest issue
  const daily = path.join(path.dirname(dir), '2026');
  if (fs.existsSync(daily)) for (const d of fs.readdirSync(daily).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse()) {
    const f = path.join(daily, d, 'daily-solar-indices.txt');
    if (fs.existsSync(f)) read(f);
  }
  diffs.sort((a, b) => a - b);
  return { days: diffs.length, maxSfu: diffs.at(-1) ?? null, medianSfu: diffs.length ? diffs[Math.floor(diffs.length / 2)] : null, within1Sfu: diffs.filter((d) => d <= 1).length, files };
}
