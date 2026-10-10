// GLONASS: CelesTrak fits the constellation's rapid precise ephemerides (SP3, one file a day starting at
// 0h GPS time, which is the set's EPOCH 23:59:42 UTC the day before). The operator products reachable
// here are ESA's rapid files (ESA0OPSRAP, 5-minute states, IGS20, GPS time), anonymous HTTP; a
// day ESA has only finalised is read from ESA0OPSFIN. The window is the file's day: [EPOCH, EPOCH + 24 h].
//
// Readers (WASM): files/orbit-products read_container (SP3), then analysis/reference-states
// (ITRS to GCRS by IAU 2006/2000A with IERS EOP from data-source/eop-parser), as E4 does for SP3.
// Identity only is read in JS: the IGS satellite-metadata SINEX gives the NORAD number of each
// slot (PRN) on the file's day.
import { gunzipSync } from 'node:zlib';
import { gnssIdentities } from '../../e4-operator-ephemeris-parity/sp3.mjs';
import { sha256 } from '../lib/http.mjs';

export const id = 'glonass';
export const hours = 24;
export const hosts = ['navigation-office.esa.int', 'files.igs.org'];
export const SINEX_URL = 'https://files.igs.org/pub/station/general/igs_satellite_metadata.snx';
const ESA = 'http://navigation-office.esa.int/products/gnss-products';
const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
export const noCandidateCode = 'no-version';

const pad = (n, w) => String(n).padStart(w, '0');
// The file of the GPS day that starts at `ms` (GPS time is UTC + 18 s).
function dayFile(ms, product) {
  const gpsMs = ms + 18000;
  const day = new Date(Math.floor(gpsMs / 86400e3) * 86400e3);
  const doy = Math.floor((day.getTime() - Date.UTC(day.getUTCFullYear(), 0, 1)) / 86400e3) + 1;
  const week = Math.floor((day.getTime() - GPS_EPOCH_MS) / (7 * 86400e3));
  const name = `ESA0OPS${product}_${day.getUTCFullYear()}${pad(doy, 3)}0000_01D_05M_ORB.SP3.gz`;
  return { name, url: `${ESA}/${week}/${name}`, dayStartMs: day.getTime() };
}

export async function prepare({ http, log, snapshot }) {
  const snx = await http.get(SINEX_URL);
  if (snx.status !== 200 || !snx.body) throw new Error(`IGS satellite metadata: HTTP ${snx.status} ${snx.error ?? ''}`);
  const files = new Map();
  for (const row of snapshot.rows) {
    const epochMs = Math.round(Date.parse(`${row.epoch}Z`) / 1000) * 1000;
    for (const product of ['RAP', 'FIN']) {
      const f = dayFile(epochMs, product);
      if (files.has(f.name) || [...files.values()].some((x) => x.dayStartMs === f.dayStartMs && x.body)) continue;
      const res = await http.get(f.url);
      files.set(f.name, { ...f, status: res.status, body: res.status === 200 ? res.body : null,
        provenance: res.status === 200 ? { url: f.url, requestUtc: res.requestUtc, responseUtc: res.responseUtc, httpStatus: 200, etag: res.headers.etag, lastModified: res.headers.lastModified, contentRange: null, rangeRequested: null, bytes: res.body.length, totalBytes: res.body.length, sha256: sha256(res.body), attempts: res.attempts } : null });
    }
  }
  log(`glonass: ${[...files.values()].filter((f) => f.body).length} daily SP3 files; metadata SINEX ${snx.headers.lastModified}`);
  return { sinex: snx.body.toString('latin1'), sinexMeta: { url: SINEX_URL, lastModified: snx.headers.lastModified, etag: snx.headers.etag, sha256: sha256(snx.body) }, files };
}

export function candidates(ctx, row) {
  const epochMs = Math.round(Date.parse(`${row.epoch}Z`) / 1000) * 1000;
  const out = [];
  for (const product of ['RAP', 'FIN']) {
    const f = dayFile(epochMs, product);
    const have = ctx.files.get(f.name);
    if (have?.body) out.push({ id: f.name, url: f.url, startMs: have.dayStartMs - 18000 });
  }
  return out;   // rapid first: the product CelesTrak names; a finalised day only when ESA holds no rapid file
}
export const noCandidateReason = () => 'ESA holds neither a rapid nor a final SP3 for the file\'s day';
export const held = (ctx, cand) => ctx.files.get(cand.id);

// The slot (PRN) of the set's NORAD number on the file's day, from the IGS metadata.
export function contextFor(ctx, cand, row) {
  const midMs = Math.round(Date.parse(`${row.epoch}Z`) / 1000) * 1000 + 12 * 3600e3;
  const sats = gnssIdentities(ctx.sinex, midMs);
  const prn = Object.keys(sats).find((k) => k.startsWith('R') && sats[k].norad === row.norad);
  return { identities: prn ? { product: 'ESA0OPS rapid/final orbit', source: cand.url, statedSigmaM: 0.1, statedSigmaBasis: 'placeholder: the covariance is not used by this pass', satellites: { [prn]: sats[prn] } } : null, prn: prn ?? null };
}

export async function read({ readers, bytes, row, context }) {
  if (!context?.identities) throw Object.assign(new Error(`NORAD ${row.norad} has no GLONASS slot in the IGS metadata on the file's day`), { reasonCode: 'no-slot' });
  let converted;
  try { converted = await readers.sp3.convert(gunzipSync(bytes), context.identities); } catch (e) {
    if (/No SP3 satellite matched/.test(e.message)) throw Object.assign(new Error(`slot ${context.prn} is not in the ESA file`), { reasonCode: 'not-in-product' });
    throw e;
  }
  const mine = converted.find((c) => c.norad === row.norad);
  if (!mine) throw new Error(`reference_states returned no state for NORAD ${row.norad} (slot ${context.prn})`);
  return { oem: mine.bytes, objectName: row.name };
}
