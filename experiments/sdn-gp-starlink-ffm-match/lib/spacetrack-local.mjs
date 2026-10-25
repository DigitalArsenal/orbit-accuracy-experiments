// Readers of the local Space-Track archive (amendment A11, M29): the TIP and decay snapshots and the GP history. The archive's own scripts fetched them (deployment/spacetrack-archive);
// nothing here talks to Space-Track, and no element set or message leaves the archive host: only results (per-object errors, coverage) are committed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from '../common.mjs';

export const SPACETRACK = path.join(config.archive, 'spacetrack');
const stMs = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`);
const readJsonGz = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));

/** All TIP messages of the daily snapshots, de-duplicated: Map NORAD -> [{ msgMs, decayMs, windowMin, lat, lon, nextReportH, revs }] by message epoch. */
export function readTip(year = 2026) {
  const dir = path.join(SPACETRACK, 'tip', String(year));
  const byObject = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json.gz')).sort()) {
    for (const r of readJsonGz(path.join(dir, f))) {
      const list = byObject.get(r.NORAD_CAT_ID) ?? new Map();
      list.set(`${r.MSG_EPOCH}|${r.DECAY_EPOCH}|${r.WINDOW}`, { msgMs: stMs(r.MSG_EPOCH), decayMs: stMs(r.DECAY_EPOCH), windowMin: Number(r.WINDOW), lat: Number(r.LAT), lon: Number(r.LON), nextReportH: Number(r.NEXT_REPORT), rev: Number(r.REV), direction: r.DIRECTION });
      byObject.set(r.NORAD_CAT_ID, list);
    }
  }
  return new Map([...byObject].map(([k, v]) => [k, [...v.values()].sort((a, b) => a.msgMs - b.msgMs)]));
}

/** The decay snapshots: Map NORAD -> { name, final: DECAY_EPOCH string of the Historical message | null }. */
export function readDecay(year = 2026) {
  const dir = path.join(SPACETRACK, 'decay', String(year));
  const out = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json.gz')).sort()) {
    for (const r of readJsonGz(path.join(dir, f))) {
      const e = out.get(r.NORAD_CAT_ID) ?? { name: r.OBJECT_NAME, final: null, rcs: r.RCS_SIZE };
      if (r.MSG_TYPE === 'Historical') e.final = r.DECAY_EPOCH;
      out.set(r.NORAD_CAT_ID, e);
    }
  }
  return out;
}

/** The gp_history files of a creation range, in order: daily files (YYYY-MM-DD.json.gz) and follow windows (<from>--<to>.json.gz). */
export function gpHistoryFiles(fromMs, toMs, year = 2026) {
  const dir = path.join(SPACETRACK, 'gp_history/by-creation', String(year));
  const stamp = (s) => Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1T$2:$3:$4Z'));
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json.gz')).sort()) {
    const m = /^(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(f), w = /^(.+Z)--(.+Z)\.json\.gz$/.exec(f);
    const a = m ? Date.parse(`${m[1]}T00:00:00Z`) : w ? stamp(w[1]) : null, b = m ? a + 86400000 : w ? stamp(w[2]) : null;
    if (a !== null && b > fromMs && a < toMs) out.push({ file: path.join(dir, f), fromMs: a, toMs: b });
  }
  return out;
}

/** The GP records of the wanted NORAD ids (a Set of strings) in the files of a creation range: [{ NORAD_CAT_ID, EPOCH, ... , CREATION_DATE }]. */
export function gpRecords(wanted, fromMs, toMs, onFile = () => {}) {
  const out = [];
  for (const f of gpHistoryFiles(fromMs, toMs)) {
    const size = fs.statSync(f.file).size;
    if (size < 100) continue;
    for (const r of readJsonGz(f.file)) if (wanted.has(r.NORAD_CAT_ID)) out.push(r);
    onFile(f);
  }
  return out;
}
