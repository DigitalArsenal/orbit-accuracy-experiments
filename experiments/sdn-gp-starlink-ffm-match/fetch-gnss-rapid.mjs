// Amendment A8/A8b: GFZ rapid GNSS orbits, one file a day, as current GNSS truth.
//   GFZ0OPSRAP  GFZ rapid orbits for the IGS (GPS, GLONASS, Galileo), 5 min. GFZ Data Services, doi:10.5880/GFZ.1.1.2020.003, CC BY 4.0.
//   GFZ0MGXRAP  GFZ rapid multi-GNSS (MGEX) orbits (adds BeiDou incl. GEO and IGSO, QZSS), 5 min; IGS MGEX product terms.
// Route: GFZ's own file server (isdc-data.gfz.de) is tried first, once per run with a short timeout; when it does not answer the same
// files are taken from NASA CDDIS (gnss/products/<GPS week>/) with the owner's Earthdata token, the route E14 uses for GFZ0MGXRAP. Either way
// the file is stored as served under <archive>/hac/gfz-gnss-rapid/cddis/gnss/products/<week>/ (the layout analysis/reference-states
// reads with --local-archive), with a provenance row naming the URL it really came from. One request at a time, paced; never republished.
//   node experiments/sdn-gp-starlink-ffm-match/fetch-gnss-rapid.mjs --from 2026-10-11 --to 2026-10-22 [--products GFZ0OPSRAP_,GFZ0MGXRAP_]
import fs from 'node:fs';
import path from 'node:path';
import { args } from './common.mjs';
import { pacedGet, storeWithProvenance, ARCHIVE_HAC, sha256 } from './lib/paced.mjs';
import { cddisGet, cddisList } from './lib/cddis.mjs';

const DAY = 86400000;
const DEST = path.join(ARCHIVE_HAC, 'gfz-gnss-rapid/cddis/gnss/products');
const GFZ = 'https://isdc-data.gfz.de/gnss/products/rapid';
const TERMS = {
  GFZ0OPSRAP_: 'Creative Commons Attribution 4.0 International (GFZ Data Services, DataCite record of doi:10.5880/GFZ.1.1.2020.003, fetched 2026-10-24); the IGS Data and Product Disclaimer and Terms of Use also apply',
  GFZ0MGXRAP_: 'IGS Multi-GNSS Experiment analysis-center product: open use, citation requested (IGS Data and Product Disclaimer and Terms of Use, 2020-08-05); NASA CDDIS copy under NASA open data policy',
};
const ATTRIBUTION = {
  GFZ0OPSRAP_: 'Maennel, B., Brandt, A., Nischan, T., Brack, A., Sakic, P., Bradke, M. (2020): GFZ rapid product series for the IGS. GFZ Data Services. https://doi.org/10.5880/GFZ.1.1.2020.003 (CC BY 4.0)',
  GFZ0MGXRAP_: 'GFZ rapid MGEX orbits (GFZ0MGXRAP) of the International GNSS Service Multi-GNSS Experiment: Montenbruck, O., et al. (2017), Adv. Space Res. 59, 1671-1697, doi:10.1016/j.asr.2017.01.011; GFZ Potsdam, Section 1.1 Space Geodetic Techniques',
};

const products = (args.products ?? 'GFZ0OPSRAP_,GFZ0MGXRAP_').split(',');
const from = Date.parse(`${args.from}T00:00:00Z`), to = Date.parse(`${args.to}T00:00:00Z`);
let gfzReachable = null;
async function gfz(url) { // one attempt per run to learn whether the file server answers
  if (gfzReachable === false) return null;
  try { const r = await pacedGet(url, { spacingMs: 3000, timeoutMs: 15000 }); gfzReachable = true; return r; } catch (error) {
    if (gfzReachable === null) console.error(`GFZ file server: ${String(error.cause?.code ?? error.message)}; using CDDIS for the same files`);
    if (!/HTTP 404/.test(error.message)) gfzReachable = false;
    return null;
  }
}
const listed = new Map();
for (let day = from; day <= to; day += DAY) {
  const d = new Date(day), doy = Math.round((day - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
  const week = Math.floor((day - Date.UTC(1980, 0, 6)) / (7 * DAY));
  for (const product of products) {
    const name = `${product}${d.getUTCFullYear()}${String(doy).padStart(3, '0')}0000_01D_05M_ORB.SP3.gz`;
    if (fs.existsSync(path.join(DEST, String(week), name))) continue;
    let bytes = null, url = null, headers = {}, route = null;
    const direct = await gfz(`${GFZ}/w${week}/${name}`);
    if (direct && direct.bytes[0] === 0x1f && direct.bytes[1] === 0x8b) { bytes = direct.bytes; url = `${GFZ}/w${week}/${name}`; headers = direct.headers; route = 'GFZ ISDC'; }
    if (!bytes) {
      if (!listed.has(week)) listed.set(week, new Set(await cddisList(`gnss/products/${week}`)));
      if (!listed.get(week).has(name)) { console.error(`not published yet: w${week}/${name}`); continue; }
      url = `https://cddis.nasa.gov/archive/gnss/products/${week}/${name}`;
      const r = await cddisGet(url);
      if (!r.bytes || !(r.bytes[0] === 0x1f && r.bytes[1] === 0x8b)) { console.error(`refused or not gzip: ${name} (HTTP ${r.status})`); continue; }
      bytes = r.bytes; headers = r.headers; route = 'NASA CDDIS';
    }
    storeWithProvenance({ dir: path.join(DEST, String(week)), name, bytes, url, terms: TERMS[product], attribution: ATTRIBUTION[product],
      extra: { size: bytes.length, route, lastModified: headers['last-modified'] ?? null, etag: headers.etag ?? null, kind: 'GNSS precise orbit (SP3-d, gzip)' } });
    console.error(`${name}: ${(bytes.length / 1e6).toFixed(2)} MB via ${route} sha256 ${sha256(bytes).slice(0, 12)}`);
  }
}
