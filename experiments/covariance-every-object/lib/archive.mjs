// by-creation reader: file list, decode with the S4 predicate, element-set records. Element sets stay under AR.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
import { rowHeld, pathHeld, PREDICATES } from './hold.mjs';
export const ARCHIVE = '/opt/data/sdn-archive/spacetrack/gp_history/by-creation';
export const OUT = '/opt/data/sdn-archive/covariance-every-object';
export const FIELDS = ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'];
export const epochMs = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);
export function listFiles(fromDay, toDay) {
  const out = [];
  for (const y of fs.readdirSync(ARCHIVE).sort()) for (const f of fs.readdirSync(path.join(ARCHIVE, y)).sort()) {
    const day = f.slice(0, 10); if (day >= fromDay && day <= toDay && f.endsWith('.json.gz')) out.push(path.join(ARCHIVE, y, f));
  }
  return out;
}
/** Decodes one file; keep(norad) selects NORADs after the predicate. Returns { sets, dropped: {predicate: n}, retainedHeld, sha256 }. */
export function readFile(file, keep) {
  if (pathHeld(file)) throw new Error(`held path ${file}`);
  const raw = fs.readFileSync(file), dropped = Object.fromEntries(PREDICATES.map((p) => [p, 0])), sets = [];
  for (const g of JSON.parse(zlib.gunzipSync(raw))) {
    if (g.MEAN_ELEMENT_THEORY !== 'SGP4' || String(g.EPHEMERIS_TYPE) !== '0') continue;
    const why = rowHeld(g); if (why) { dropped[why]++; continue; }
    const norad = Number(g.NORAD_CAT_ID); if (!keep(norad)) continue;
    sets.push({ norad, epoch: g.EPOCH, created: g.CREATION_DATE, gpId: String(g.GP_ID), el: FIELDS.map((f) => Number(g[f])) });
  }
  return { sets, dropped, sha256: crypto.createHash('sha256').update(raw).digest('hex') };
}
