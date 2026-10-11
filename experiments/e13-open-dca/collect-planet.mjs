// E13 Planet live collector (PLAN.md Amendment S3, item 4): Planet Labs' daily orbit-determination states, so that Planet's arcs and the Starlink pairs meet on the same days.
// ephemerides.planet-labs.com/planet_YYYYMMDD.states is published once a day, at about 22:50 UTC, and a day's file answers 403 until then; the SDN archive's copy of
// 2026-10-09 was retrieved at 17:59 UTC and is incomplete (19,689 bytes against 19,884). From the first day on, this fetches each day's FINAL file (last-modified at or after 22:00 UTC
// of the day) once, with a conditional GET, into the store: local only, CC BY-NC 4.0, never committed or published. Politeness: 3 s between requests, nothing before 22:55 UTC for the
// current day, one retry every 10 minutes until it is published, and a day that is final is never requested again.
//
//   nohup node experiments/e13-open-dca/collect-planet.mjs [--first 2026-10-09] [--until 2026-10-31T00:00:00Z] &      (store: <store>/planet-live; stop file: planet-live/collector.stop)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DAY, H, STORE, appendJsonl, isoZ, logger, readJson, sha256, sleep, writeJson } from './common.mjs';

const { values } = parseArgs({ options: { first: { type: 'string', default: '2026-10-09' }, until: { type: 'string', default: '2026-10-31T00:00:00Z' } } });
const DIR = path.join(STORE, 'planet-live');
const BASE = 'https://ephemerides.planet-labs.com/';
const TERMS = 'ephemerides.planet-labs.com: Copyright (c) Planet Labs PBC. Orbital ephemerides data provided hereunder is licensed under CC BY-NC 4.0. Commercial redistribution needs permission (orbital-neighbors at planet.com).';
const log = logger('[planet] ');
fs.mkdirSync(DIR, { recursive: true });
const files = { pid: path.join(DIR, 'collector.pid'), stop: path.join(DIR, 'collector.stop'), status: path.join(DIR, 'status.json'), fetches: path.join(DIR, 'fetch-log.jsonl') };
fs.writeFileSync(files.pid, `${process.pid}\n`);
fs.rmSync(files.stop, { force: true });
const untilMs = Date.parse(values.until);

const dayName = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');
const nameOf = (day) => `planet_${day}.states`;
const dayStartMs = (day) => Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`);

// A stored copy is final when the server last modified it at or after 22:00 UTC of its own day.
function stored(day) {
  const prov = path.join(DIR, `${nameOf(day)}.provenance.json`);
  if (!fs.existsSync(prov) || !fs.existsSync(path.join(DIR, nameOf(day)))) return null;
  const p = readJson(prov);
  return { ...p, final: Date.parse(p.last_modified) >= dayStartMs(day) + 22 * H };
}

async function fetchDay(day) {
  const have = stored(day);
  const headers = have?.etag ? { 'If-None-Match': have.etag } : {};
  const url = `${BASE}${nameOf(day)}`;
  const at = isoZ(Date.now());
  let response;
  try { response = await fetch(url, { headers, signal: AbortSignal.timeout(60e3) }); } catch (error) { appendJsonl(files.fetches, { at, url, error: String(error) }); log(`${day}: ${error}`); return 'error'; }
  appendJsonl(files.fetches, { at, url, status: response.status, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') });
  if (response.status === 304) return 'unchanged';
  if (response.status === 403 || response.status === 404) return 'unpublished';
  if (response.status !== 200) { log(`${day}: HTTP ${response.status}`); return 'error'; }
  const bytes = Buffer.from(await response.arrayBuffer());
  const file = path.join(DIR, nameOf(day));
  if (have && fs.existsSync(file)) fs.renameSync(file, path.join(DIR, `${nameOf(day)}.${have.sha256.slice(0, 12)}.superseded`));      // an earlier version of the same day is kept
  fs.writeFileSync(file, bytes);
  writeJson(`${file}.provenance.json`, { url, retrieved_utc: at, sha256: sha256(bytes), bytes: bytes.length, etag: response.headers.get('etag'), last_modified: response.headers.get('last-modified'), terms_url: BASE, terms: TERMS, retrieved_by: `E13 collect-planet.mjs (anonymous, no login; Amendment S3 item 4)` });
  log(`${day}: ${bytes.length} bytes, last-modified ${response.headers.get('last-modified')}`);
  return 'fetched';
}

let cycles = 0;
for (;;) {
  const now = Date.now();
  if (fs.existsSync(files.stop) || now > untilMs) { log(fs.existsSync(files.stop) ? 'stop file' : `past ${values.until}`); break; }
  const counters = { fetched: 0, unchanged: 0, unpublished: 0, error: 0, final: 0 };
  for (let t = dayStartMs(values.first.replaceAll('-', '')); t <= now; t += DAY) {
    const day = dayName(t), have = stored(day);
    if (have?.final) { counters.final++; continue; }
    const isToday = dayName(now) === day;
    if (isToday && now < t + 22 * H + 55 * 60e3) continue;                 // the current day's final file does not exist before about 22:50 UTC
    const outcome = await fetchDay(day);
    counters[outcome]++;
    await sleep(3e3);
  }
  ++cycles;
  writeJson(files.status, { pid: process.pid, updatedUtc: isoZ(Date.now()), first: values.first, until: values.until, cycles, counters, days: fs.readdirSync(DIR).filter((n) => /^planet_\d{8}\.states$/.test(n)).sort() });
  await sleep(10 * 60e3);
}
fs.rmSync(files.pid, { force: true });
