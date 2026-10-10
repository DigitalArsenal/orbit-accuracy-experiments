// Planet Labs: ephemerides.planet-labs.com, one CCSDS OEM per satellite (<hwid>_oem.txt: EME2000, UTC,
// 60 s states over five days, a covariance block after the states), replaced in place every ~12 h, so a
// superseded version is gone. CelesTrak's window is [EPOCH, EPOCH + 24 h]: on files that start at
// the EPOCH the published RMS equals the 24-h optimum of the fit and CelesTrak's set reproduces it.
// planet_mc.tle crosswalks the hardware id to the NORAD number (identity only: no element is read).
// The reader is files/orbit-products read_container (WASM).
import { readContainer } from '../lib/readers/container.mjs';

export const id = 'planet';
export const hours = 24;
export const hosts = ['ephemerides.planet-labs.com'];
export const BASE = 'https://ephemerides.planet-labs.com/';
export const noCandidateCode = 'no-planet-id';
// 1441 states of about 106 bytes, the header, and room.
const PREFIX = 170000;

export async function prepare({ http, log }) {
  const res = await http.get(`${BASE}planet_mc.tle`);
  if (res.status !== 200 || !res.body) throw new Error(`planet_mc.tle: HTTP ${res.status} ${res.error ?? ''}`);
  const lines = res.body.toString('utf8').split(/\r?\n/);
  const hwid = new Map();
  for (let i = 0; i + 1 < lines.length; ++i) {
    if (lines[i].startsWith('0 ') && lines[i + 1].startsWith('1 ')) hwid.set(Number(lines[i + 1].slice(2, 7)), lines[i].trim().split(/\s+/).at(-1).toLowerCase());
  }
  log(`planet crosswalk: ${hwid.size} satellites (planet_mc.tle, ${res.headers.lastModified})`);
  return { hwid, crosswalk: { url: `${BASE}planet_mc.tle`, lastModified: res.headers.lastModified, etag: res.headers.etag } };
}

export const describe = (ctx) => ({ crosswalk: ctx.crosswalk, satellites: ctx.hwid.size });
export const noCandidateReason = () => 'the NORAD number is not in Planet\'s published catalog (planet_mc.tle), so no per-satellite ephemeris file can be named';
export function candidates(ctx, row) {
  const hw = ctx.hwid.get(row.norad);
  return hw ? [{ id: `${hw}_oem.txt`, url: `${BASE}${hw}_oem.txt`, hwid: hw }] : [];
}
export const rangeFor = () => [0, PREFIX - 1];

export async function read({ readers, bytes, row }) {
  // The prefix ends inside a line; keep whole lines.
  const cut = bytes.lastIndexOf(0x0a);
  const { ephemeris } = await readContainer(readers.orbitProducts, cut > 0 ? bytes.subarray(0, cut + 1) : bytes, { kvn: true });
  return { oem: ephemeris, objectName: row.name };
}
