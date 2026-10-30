// The public element set P (PLAN.md, Arms): the newest Space-Track set by EPOCH with EPOCH and CREATION_DATE at or before the
// cutoff (experiments/e4-operator-ephemeris-parity products.mjs setAt), from the local gp_history archive by creation day. The
// sets of the experiment's objects are extracted once per creation day of config.public.creationDays into <store>/public/days
// (local only: Space-Track data never leaves the store). After XA's lib/public.mjs. Reading and selection only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, store, root, sha256, write, daysOf, dateOf } from '../common.mjs';

const { setAt } = await import(path.join(root, 'experiments/e4-operator-ephemeris-parity/products.mjs'));
const DIR = config.public.gpHistory;
const OUT = path.join(store, 'public/days');
const FIELDS = ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];

/** The day files of the registered creation days, in date order. */
export function dayFiles() {
  const [from, to] = config.public.creationDays;
  return daysOf(from, to).map((t) => { const d = dateOf(t); return path.join(DIR, d.slice(0, 4), `${d}.json.gz`); });
}

/** Extracts the sets of `norads` from the day files k, k + n, ... (one shard of the days). */
export function extract(norads, k = 0, n = 1) {
  fs.mkdirSync(OUT, { recursive: true });
  const want = new Set(norads.map(Number));
  dayFiles().forEach((file, i) => {
    if (i % n !== k) return;
    const out = path.join(OUT, `${path.basename(file, '.json.gz')}.json`);
    if (fs.existsSync(out)) return;
    if (!fs.existsSync(file)) { write(out, { file: path.relative(DIR, file), missing: true, sets: [] }); return; }
    const raw = fs.readFileSync(file);
    const sets = [];
    for (const g of JSON.parse(zlib.gunzipSync(raw).toString('utf8'))) {
      const norad = Number(g.NORAD_CAT_ID);
      if (!want.has(norad) || g.MEAN_ELEMENT_THEORY !== 'SGP4' || String(g.EPHEMERIS_TYPE) !== '0') continue;
      sets.push({ norad, epoch: g.EPOCH, creationDate: g.CREATION_DATE, gpId: String(g.GP_ID), objectName: g.OBJECT_NAME ?? '', objectId: g.OBJECT_ID ?? '',
        elements: Object.fromEntries(FIELDS.map((f) => [f, Number(g[f])])) });
    }
    write(out, { file: path.relative(DIR, file), sha256: sha256(raw), sets });
  });
}

let byNorad = null;
function load() {
  if (byNorad) return byNorad;
  byNorad = new Map();
  if (!fs.existsSync(OUT)) return byNorad;
  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.json')).sort()) for (const s of JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).sets) {
    if (!byNorad.has(s.norad)) byNorad.set(s.norad, new Map());
    byNorad.get(s.norad).set(s.gpId, s);
  }
  byNorad = new Map([...byNorad].map(([k, m]) => [k, [...m.values()]]));
  return byNorad;
}

/** The newest public set of `norad` at or before the cutoff (ms): { epoch, creationDate, gpId, elements, ... } or null. */
export const publicSetAt = (norad, cutoffMs) => setAt(load().get(Number(norad)) ?? [], cutoffMs);
/** The extraction's state: the registered days and the days extracted. */
export function extraction() {
  const want = dayFiles().map((f) => `${path.basename(f, '.json.gz')}.json`);
  const have = new Set(fs.existsSync(OUT) ? fs.readdirSync(OUT) : []);
  return { days: want.length, extracted: want.filter((d) => have.has(d)).length, missing: want.filter((d) => !have.has(d)) };
}
