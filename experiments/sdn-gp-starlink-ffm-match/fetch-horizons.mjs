// Amendment A8: JPL Horizons state vectors for the spacecraft the NAIF archive lacks (Danuri, CAPSTONE, Artemis I), through the
// documented Horizons API (https://ssd-api.jpl.nasa.gov/doc/horizons.html), one request at a time, 6 s apart, a descriptive
// User-Agent. Each response is stored as served under <archive>/hac/jpl-horizons/<mission>/<center>/ with a provenance row beside
// it (url, retrieved_utc, sha256, bytes, terms, attribution); nothing is committed or republished.
//   node experiments/sdn-gp-starlink-ffm-match/fetch-horizons.mjs [--mission danuri,capstone,artemis1] [--dry-run]
// Vector tables: geometric states, ICRF axes (REF_PLANE FRAME), km and km/s, TDB epochs, the body-centre of the named centre.
import fs from 'node:fs';
import path from 'node:path';
import { config, args } from './common.mjs';
import { pacedGet, storeWithProvenance, ARCHIVE_HAC } from './lib/paced.mjs';

export const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
export const ROOT = path.join(ARCHIVE_HAC, 'jpl-horizons');
export const TERMS = 'JPL Solar System Dynamics Horizons system: public data, no access restriction; NASA/JPL content is not copyrighted unless noted (https://www.jpl.nasa.gov/copyrights); acknowledgment requested';
export const ATTRIBUTION = 'JPL Horizons On-Line Ephemeris System (Giorgini et al. 1996, BAAS 28, 1158), NASA/JPL Solar System Dynamics Group; spacecraft trajectories from the mission navigation teams as merged by JPL';
const DAY = 86400000;

// Spans lie inside the "data through" part of each trajectory (object notes of 2026-10-23): CAPSTONE data through 2026-07-15,
// Danuri through 2026-10-18, Artemis I as-flown 2022-11-16 08:46 to 2022-12-11 17:20 (TDB).
export const MISSIONS = [
  { id: 'danuri', command: '-155', name: 'Danuri (KPLO)', centers: [['moon', '500@301']], start: '2026-08-15T00:00:00', stop: '2026-10-18T00:00:00', stepMinutes: 1, chunkDays: 20 },
  { id: 'capstone', command: '-1176', name: 'CAPSTONE', centers: [['moon', '500@301']], start: '2025-07-15T00:00:00', stop: '2026-07-15T00:00:00', stepMinutes: 5, chunkDays: 60 },
  { id: 'artemis1', command: '-1023', name: 'Artemis I (Orion)', centers: [['earth', '500@399'], ['moon', '500@301']], start: '2022-11-16T08:50:00', stop: '2022-12-11T17:15:00', stepMinutes: 1, chunkDays: 30 },
];

const stamp = (ms) => new Date(ms).toISOString().slice(0, 19);
export function chunks(m) {
  const out = [];
  const stop = Date.parse(`${m.stop}Z`), step = m.stepMinutes * 60000;
  for (let from = Date.parse(`${m.start}Z`); from < stop; ) {
    const to = Math.min(stop, from + m.chunkDays * DAY);
    out.push({ from: stamp(from), to: stamp(to) });
    from = to + step; // the next chunk starts one step after this one ends: no shared state
  }
  return out;
}

export function requestUrl(m, center, c) {
  const q = new URLSearchParams({
    format: 'text', COMMAND: `'${m.command}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'", CENTER: `'${center}'`,
    REF_PLANE: "'FRAME'", REF_SYSTEM: "'ICRF'", START_TIME: `'${c.from.replace('T', ' ').slice(0, 16)}'`, STOP_TIME: `'${c.to.replace('T', ' ').slice(0, 16)}'`,
    STEP_SIZE: `'${m.stepMinutes}m'`, VEC_TABLE: "'2'", VEC_CORR: "'NONE'", OUT_UNITS: "'KM-S'", TIME_TYPE: "'TDB'", TIME_DIGITS: "'FRACSEC'",
    CAL_FORMAT: "'BOTH'", CSV_FORMAT: "'YES'", VEC_LABELS: "'NO'",
  });
  return `${API}?${q.toString()}`;
}

/** The object-data text of one target (one request): name, trajectory notes and revision date, kept beside the vectors. */
async function objectNotes(m) {
  const q = new URLSearchParams({ format: 'text', COMMAND: `'${m.command}'`, OBJ_DATA: "'YES'", MAKE_EPHEM: "'NO'" });
  return (await pacedGet(`${API}?${q.toString()}`, { spacingMs: 6000, timeoutMs: 120000 })).bytes;
}

async function main() {
  const wanted = args.mission ? new Set(args.mission.split(',')) : null;
  for (const m of MISSIONS.filter((x) => !wanted || wanted.has(x.id))) {
    const plan = m.centers.flatMap(([centerName, center]) => chunks(m).map((c) => ({ centerName, center, ...c })));
    console.error(`${m.id}: ${plan.length} requests (${m.start} to ${m.stop}, ${m.stepMinutes} min)`);
    if (args['dry-run']) continue;
    const notesName = `${m.id}.object-notes.txt`;
    if (!fs.existsSync(path.join(ROOT, m.id, notesName))) {
      const bytes = await objectNotes(m);
      storeWithProvenance({ dir: path.join(ROOT, m.id), name: notesName, bytes, url: `${API}?COMMAND='${m.command}'&OBJ_DATA='YES'&MAKE_EPHEM='NO'`, terms: TERMS, attribution: ATTRIBUTION, extra: { kind: 'object data and trajectory notes' } });
    }
    for (const p of plan) {
      const name = `${m.id}_${p.centerName}_${p.from.replace(/[-:]/g, '').slice(0, 13)}_${p.to.replace(/[-:]/g, '').slice(0, 13)}_${m.stepMinutes}m.txt`;
      const dir = path.join(ROOT, m.id, p.centerName);
      if (fs.existsSync(path.join(dir, name))) continue;
      const url = requestUrl(m, p.center, p);
      const { bytes } = await pacedGet(url, { spacingMs: 6000, timeoutMs: 600000 });
      const text = bytes.toString('utf8');
      if (!text.includes('$$SOE') || !text.includes('$$EOE')) throw new Error(`${m.id} ${p.from}: no vector table in the response: ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
      const rows = text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n').length;
      const source = /Target body name: [^\n]*\{source: ([^}]*)\}/.exec(text)?.[1] ?? null;
      storeWithProvenance({ dir, name, bytes, url, terms: TERMS, attribution: ATTRIBUTION, extra: { kind: 'vector table', mission: m.name, command: m.command, center: p.center, frame: 'ICRF (equatorial)', timeScale: 'TDB', units: 'km, km/s', rows, targetSource: source } });
      console.error(`${m.id} ${p.centerName} ${p.from} to ${p.to}: ${rows} rows, ${(bytes.length / 1e6).toFixed(1)} MB, source ${source}`);
    }
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) await main();
