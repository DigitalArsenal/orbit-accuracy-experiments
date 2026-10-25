// NASA's ISS ephemeris files (CCSDS OEM text, EME2000, UTC; JSC FOD TOPO) with the event table of their header comments (amendment A11, M24):
//   COMMENT  <event name>   <DDD:HH:MM:SS.sss>   [<orbit>]  <DV m/s>  <HA km>  <HP km>
// TIG is the day of the year in the file's year (GMT); DV, HA and HP are the planned values of the trajectory the file holds. Parsing only: counting and ordering.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../common.mjs';

export const ISS_ARCHIVE = path.join(config.archive, 'hac/nasa-iss-oem-archive');
const DAY = 86400000;
const toMs = (iso) => Date.parse(/Z$/.test(iso) ? iso : `${iso}Z`);

/** TIG (day of year, hh:mm:ss) in the year nearest to the file's span. */
function tigMs(doy, hh, mm, ss, startMs, stopMs) {
  const year = new Date(startMs).getUTCFullYear();
  const candidates = [year - 1, year, year + 1].map((y) => Date.UTC(y, 0, 1) + (Number(doy) - 1) * DAY + Number(hh) * 3600e3 + Number(mm) * 60e3 + Number(ss) * 1e3);
  const mid = (startMs + stopMs) / 2;
  return candidates.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
}

/** Header, events and states of one file's text. */
export function parseIssOem(text) {
  const lines = text.split(/\r?\n/);
  const kv = {};
  const comments = [];
  const states = [];
  for (const line of lines) {
    if (/^COMMENT/.test(line)) { comments.push(line.replace(/^COMMENT ?/, '')); continue; }
    const m = /^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (m && !states.length) { kv[m[1]] = m[2]; continue; }
    const s = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/.exec(line);
    if (s) states.push({ ms: toMs(s[1]), epoch: s[1], r: [Number(s[2]), Number(s[3]), Number(s[4])], v: [Number(s[5]), Number(s[6]), Number(s[7])] });
  }
  const startMs = toMs(kv.START_TIME), stopMs = toMs(kv.STOP_TIME);
  const events = [];
  for (const c of comments) {
    const m = /^\s*(\S.*?)\s+(\d{3}):(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)\s+(.*)$/.exec(c);
    if (!m || /^\s*\(/.test(c)) continue;
    const nums = [...m[6].matchAll(/-?\d+(?:\.\d+)?/g)].map((x) => Number(x[0]));
    if (nums.length < 3) continue;
    const [dv, ha, hp] = nums.slice(-3);
    events.push({ name: m[1].replace(/\s+/g, ' ').trim(), tigMs: tigMs(m[2], m[3], m[4], m[5], startMs, stopMs), tigDoy: `${m[2]}:${m[3]}:${m[4]}:${m[5]}`, orbit: nums.length > 3 ? nums[0] : null, dvMS: dv, haKm: ha, hpKm: hp });
  }
  const mass = /MASS=([\d.]+)/.exec(comments.join('\n')), area = /DRAG_AREA=([\d.]+)/.exec(comments.join('\n')), cd = /DRAG_COEFF=([\d.]+)/.exec(comments.join('\n'));
  return {
    header: { creationUtc: kv.CREATION_DATE ?? null, startMs, stopMs, usableStartMs: toMs(kv.USABLE_START_TIME ?? kv.USEABLE_START_TIME ?? kv.START_TIME), usableStopMs: toMs(kv.USABLE_STOP_TIME ?? kv.USEABLE_STOP_TIME ?? kv.STOP_TIME), frame: kv.REF_FRAME, timeSystem: kv.TIME_SYSTEM, massKg: mass ? Number(mass[1]) : null, dragAreaM2: area ? Number(area[1]) : null, dragCoeff: cd ? Number(cd[1]) : null },
    events, states, eventTableLines: comments.filter((c) => /\d{3}:\d{2}:\d{2}:\d{2}/.test(c) || /EVENT/.test(c)).length,
  };
}

/** The archive's files in date order: [{ date, file }]. */
export function issArchiveFiles() {
  if (!fs.existsSync(ISS_ARCHIVE)) return [];
  return fs.readdirSync(ISS_ARCHIVE).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.existsSync(path.join(ISS_ARCHIVE, d, 'ISS.OEM_J2K_EPH.txt'))).sort().map((date) => ({ date, file: path.join(ISS_ARCHIVE, date, 'ISS.OEM_J2K_EPH.txt') }));
}
