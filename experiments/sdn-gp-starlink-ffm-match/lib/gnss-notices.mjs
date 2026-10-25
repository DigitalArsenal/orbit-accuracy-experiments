// The public GNSS notices of amendment A14 (M27), read from the local archive (<archive>/hac/gnss-notices/): the GPS NANUs of the year (one text file each) and the QZSS NAQU page (the year's messages, each in a hidden
// field of the page). Parsing only: the type, the satellite (SVN and PRN), the stated start and stop of an outage, the reference to an earlier notice. Nothing here is committed: m27-events.mjs writes the outage windows
// (satellite, type, number, times) to the results; no notice text leaves the archive.
import fs from 'node:fs';
import path from 'node:path';
import { ARCHIVE_HAC } from './paced.mjs';

export const NOTICES = path.join(ARCHIVE_HAC, 'gnss-notices');
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const entities = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const field = (text, label) => new RegExp(`^\\s*(?:\\d+\\.\\s+)?${label}:\\s*(.*?)\\s*$`, 'mi').exec(text)?.[1] ?? null;
const calendarMs = (date, zulu) => {
  const m = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/.exec(String(date ?? '').trim()), z = /^(\d{2})(\d{2})$/.exec(String(zulu ?? '').trim());
  return m && z ? Date.UTC(Number(m[3]), MONTHS[m[2]], Number(m[1]), Number(z[1]), Number(z[2])) : null;
};
const numberOf = (s) => { const m = /(\d{4})-?(\d{3})/.exec(String(s ?? '')); return m ? `${m[1]}${m[2]}` : null; };

/** One notice's text (NANU or NAQU): { type, number, reference, svn, prn, startMs, stopMs } (nulls where the notice does not state them). */
export function parseNotice(text, label) {
  const type = field(text, `${label} TYPE`), start = calendarMs(field(text, 'START CALENDAR DATE'), field(text, 'START TIME ZULU')), stop = calendarMs(field(text, 'STOP CALENDAR DATE'), field(text, 'STOP TIME ZULU'));
  return { type: type?.replace(/^[A-Z0-9]+_(?=[A-Z]+$)/, '') ?? null, signal: /^([A-Z0-9]+)_/.exec(type ?? '')?.[1] ?? null, number: numberOf(field(text, `${label} NUMBER`)), reference: numberOf(field(text, `REFERENCE ${label}`)),
    svn: field(text, 'SVN')?.replace(/\D/g, '') ?? null, prn: field(text, 'PRN')?.replace(/\D/g, '') ?? null, startMs: start, stopMs: stop };
}

/** The GPS NANUs of a year in number order: [{ ...parseNotice, file }]. */
export function readNanus(year = 2026) {
  const dir = path.join(NOTICES, 'navcen-gps-nanu', String(year));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{7}\.nnu$/.test(f)).sort().map((f) => ({ ...parseNotice(fs.readFileSync(path.join(dir, f), 'utf8'), 'NANU'), file: f }));
}

/** The QZSS NAQU page: [{ ...parseNotice, signal, title }] for every message of the page. */
export function readNaqu(file = path.join(NOTICES, 'qzss-naqu', 'naqu.html')) {
  if (!fs.existsSync(file)) return [];
  const html = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /id="NAQ_TYPE_(\d+)"[^>]*value="([A-Z_]*)">\s*<input[^>]*id="NAQ_SS_SIGNAL_\d+"[^>]*value="([^"]*)">\s*<input[^>]*id="NAQ_NAQU_NUMBER_\d+"[^>]*value="(\d+)">\s*<input[^>]*id="D_MODAL_TITLE_\d+"[^>]*value="([^"]*)">\s*<input[^>]*id="D_MODAL_TEXT_\d+"[^>]*value="([^"]*)"/g;
  for (const m of html.matchAll(re)) {
    const text = entities(m[6]);
    out.push({ ...parseNotice(text, 'NAQU'), type: m[2].replace(/^[A-Z0-9]+_(?=[A-Z]+$)/, ''), signal: m[3], number: m[4], title: entities(m[5]) });
  }
  return out;
}

/**
 * The delta-V outages of one system: each forecast delta-V notice (FCSTDV) that is not cancelled, as { number, svn, prn, forecast: { startMs, stopMs }, actual: { startMs, stopMs } | null }. A later reschedule notice
 * (FCSTRESCD) that references it replaces the forecast times; the actual outage is the interval the summary notice (FCSTSUMM) that references it states (the maneuver and its settling inside the forecast window).
 */
export function deltaVOutages(notices) {
  const byRef = (type, ref) => notices.filter((n) => n.type === type && n.reference === ref);
  const out = [];
  for (const n of notices.filter((x) => x.type === 'FCSTDV' && x.startMs !== null)) {
    if (byRef('FCSTCANC', n.number).length) continue;
    const resc = byRef('FCSTRESCD', n.number).at(-1);
    const forecast = resc && resc.startMs !== null ? { startMs: resc.startMs, stopMs: resc.stopMs } : { startMs: n.startMs, stopMs: n.stopMs };
    const summary = [...byRef('FCSTSUMM', n.number), ...(resc ? byRef('FCSTSUMM', resc.number) : [])].filter((u) => u.startMs !== null).at(-1);
    out.push({ number: n.number, svn: n.svn, prn: n.prn, signal: n.signal ?? null, forecast, actual: summary ? { startMs: summary.startMs, stopMs: summary.stopMs ?? summary.startMs } : null, rescheduled: Boolean(resc) });
  }
  return out;
}
