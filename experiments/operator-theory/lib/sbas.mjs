// Truth for three commercial geostationary satellites: the positions WAAS broadcasts for its own geostationary payloads (message type 9), as recorded in the IGS merged
// broadcast navigation files on NASA CDDIS. PRN 131 Eutelsat 117 West B, PRN 133 SES-15, PRN 135 Galaxy 30 (Intelsat). WAAS states a range accuracy (URA) of 2 m for each; a record
// with any other URA is not read. Earth-fixed (WGS 84), km, every 256 s, epochs in GPS time; analysis/reference-states turns them to GCRF with IERS Earth orientation, as for the
// operators' own Earth-fixed files. Fetching and decoding only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { cddisGet } from '../../sdn-gp-starlink-ffm-match/lib/cddis.mjs';
import { earthFixedToGcrf } from './vendors.mjs';
import { oemBytes, oemLines } from '../../xp-atmosphere-merit/lib/sds.mjs';

export const STORE = '/opt/data/sdn-archive/hac/cddis-sbas';
export const SBAS = {
  131: { name: 'EUTELSAT 117 WEST B', norad: 41589, operator: 'Eutelsat' },
  133: { name: 'SES-15', norad: 42709, operator: 'SES' },
  135: { name: 'GALAXY 30 (G-30)', norad: 46114, operator: 'Intelsat' },
};
const GPS_MINUS_UTC_MS = 18000, DAY = 86400000;
const doy = (ms) => { const d = new Date(ms); return Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1; };
const num = (s) => (s.trim() ? Number(s.replace(/[dD]/, 'E')) : 0);

/** One UTC day's records of the three PRNs: fetched once from CDDIS and kept, with the source file's hash. */
export async function dayRecords(dayMs) {
  const y = new Date(dayMs).getUTCFullYear(), d = String(doy(dayMs)).padStart(3, '0');
  const file = path.join(STORE, String(y), `${d}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const name = `BRDM00DLR_S_${y}${d}0000_01D_MN.rnx.gz`, url = `https://cddis.nasa.gov/archive/gnss/data/daily/${y}/${d}/${String(y).slice(2)}p/${name}`;
  const r = await cddisGet(url);
  if (!r.bytes) return { url, status: r.status, records: [] };
  const text = zlib.gunzipSync(r.bytes).toString('latin1').split('\n');
  const records = [];
  for (let i = 0; i + 3 < text.length; i += 1) {
    const l = text[i];
    if (!/^S\d\d /.test(l)) continue;
    const prn = 100 + Number(l.slice(1, 3));
    if (!SBAS[prn]) continue;
    const row = (k) => [0, 1, 2, 3].map((j) => num(text[i + k].slice(4 + 19 * j, 4 + 19 * (j + 1))));
    const [x, y2, z] = [row(1), row(2), row(3)];
    const [Y, M, D, h, m, s] = l.slice(4, 23).trim().split(/\s+/).map(Number);
    records.push({ prn, gpsMs: Date.UTC(Y, M - 1, D, h, m, s), r: [x[0], y2[0], z[0]], v: [x[1], y2[1], z[1]], ura: y2[3], health: x[3] });
  }
  const out = { url, sha256: crypto.createHash('sha256').update(r.bytes).digest('hex'), retrieved: new Date().toISOString(), terms: 'IGS data, CDDIS (NASA): open use, citation requested; WAAS broadcast is a U.S. Government signal', records };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

/** A PRN's truth from fromMs to toMs: [{epoch ISO UTC, r km, v km/s}] in GCRF, one run of regular records per day, records with URA other than 2 m left out. */
export async function series(prn, fromMs, toMs) {
  const sat = SBAS[prn], lines = [];
  for (let day = Math.floor(fromMs / DAY) * DAY; day <= toMs; day += DAY) {
    const recs = (await dayRecords(day)).records.filter((x) => x.prn === prn && x.ura === 2).sort((a, b) => a.gpsMs - b.gpsMs);
    // Runs of 256 s; a run of fewer than 8 records is left out.
    const runs = [];
    for (const x of recs) { const last = runs.at(-1); if (last && x.gpsMs - last.at(-1).gpsMs === 256000) last.push(x); else runs.push([x]); }
    for (const run of runs.filter((x) => x.length >= 8)) {
      const fixed = oemBytes({ frame: 'GCRF', object: { name: sat.name, id: '', norad: sat.norad }, lines: run.map((x) => ({ epoch: new Date(x.gpsMs - GPS_MINUS_UTC_MS).toISOString(), r: x.r, v: x.v })) });
      const gcrf = oemLines(await earthFixedToGcrf(fixed, `S${prn - 100}`, sat.norad, sat.name, 'WAAS')).map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
      lines.push(...gcrf.filter((l) => Date.parse(l.epoch) >= fromMs && Date.parse(l.epoch) <= toMs));
    }
  }
  return lines;
}
