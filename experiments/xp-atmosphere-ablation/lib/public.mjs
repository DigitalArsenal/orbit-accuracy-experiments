// The public element set P (PLAN.md): the newest Space-Track set before E, as E6's baseline B picks it
// (experiments/e4-operator-ephemeris-parity products.mjs setAt), from the local gp_history archive (by creation day, 2022
// on). The sets of the experiment's objects are extracted once per creation day into <store>/public/days (local only:
// Space-Track data never leaves the store). Reading and selection only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, store, root, sha256, write } from '../common.mjs';

const { setAt } = await import(path.join(root, 'experiments/e4-operator-ephemeris-parity/products.mjs'));
const DIR = config.public.gpHistory;
const OUT = path.join(store, 'public/days');

/** The day files of the archive, in date order. */
export function dayFiles() {
  return fs.readdirSync(DIR).filter((y) => /^\d{4}$/.test(y)).sort().flatMap((y) => fs.readdirSync(path.join(DIR, y)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n)).sort().map((n) => path.join(DIR, y, n)));
}

/** Extracts the sets of `norads` from day files [k, n) of every n (a shard of the archive). */
export function extract(norads, k = 0, n = 1) {
  fs.mkdirSync(OUT, { recursive: true });
  const want = new Set(norads.map(Number));
  dayFiles().forEach((file, i) => {
    if (i % n !== k) return;
    const out = path.join(OUT, `${path.basename(file, '.json.gz')}.json`);
    if (fs.existsSync(out)) return;
    const raw = fs.readFileSync(file);
    const sets = [];
    for (const g of JSON.parse(zlib.gunzipSync(raw).toString('utf8'))) {
      const norad = Number(g.NORAD_CAT_ID);
      if (!want.has(norad) || g.MEAN_ELEMENT_THEORY !== 'SGP4' || String(g.EPHEMERIS_TYPE) !== '0') continue;
      sets.push({ norad, epoch: g.EPOCH, creationDate: g.CREATION_DATE, gpId: String(g.GP_ID), elements: Object.fromEntries(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'].map((f) => [f, Number(g[f])])) });
    }
    write(out, { file: path.relative(DIR, file), sha256: sha256(raw), sets });
  });
}

let byNorad = null;
function load() {
  if (byNorad) return byNorad;
  byNorad = new Map();
  if (!fs.existsSync(OUT)) return byNorad;
  for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.json'))) for (const s of JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).sets) {
    if (!byNorad.has(s.norad)) byNorad.set(s.norad, new Map());
    byNorad.get(s.norad).set(s.gpId, s);
  }
  byNorad = new Map([...byNorad].map(([k, m]) => [k, [...m.values()]]));
  return byNorad;
}

/** The newest public set of `norad` before E (ms): { epoch, creationDate, elements } or null. */
export const publicSetAt = (norad, E) => setAt(load().get(Number(norad)) ?? [], E);
export const extractedDays = () => (fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((x) => x.endsWith('.json')).length : 0);
