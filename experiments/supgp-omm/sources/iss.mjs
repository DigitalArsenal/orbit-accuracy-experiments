// ISS: NASA's public CCSDS OEM (JSC FOD/TOPO), EME2000, 4-minute states over 15 days, one file.
// CelesTrak cuts it into 6-hour segments (E11): the set's EPOCH is the segment start and the window
// [EPOCH, EPOCH + 6 h]. The reader is files/orbit-products read_container (WASM).
import { readContainer } from '../lib/readers/container.mjs';
import { sha256 } from '../lib/http.mjs';

export const id = 'iss';
export const hours = 6;
export const hosts = ['nasa-public-data.s3.amazonaws.com'];
export const URL_OEM = 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
export const NORAD = 25544;

export async function prepare({ http }) {
  const res = await http.get(URL_OEM);
  if (res.status !== 200 || !res.body) throw new Error(`ISS OEM: HTTP ${res.status} ${res.error ?? ''}`);
  return {
    body: res.body,
    provenance: { url: URL_OEM, requestUtc: res.requestUtc, responseUtc: res.responseUtc, httpStatus: 200, etag: res.headers.etag, lastModified: res.headers.lastModified, contentRange: null, rangeRequested: null, bytes: res.body.length, totalBytes: res.body.length, sha256: sha256(res.body), attempts: res.attempts },
  };
}

// One file serves every segment; the pass reuses its bytes.
export const held = (ctx) => ({ body: ctx.body, provenance: ctx.provenance });
export const candidates = () => [{ id: 'ISS.OEM_J2K_EPH.txt', url: URL_OEM }];

export async function read({ readers, bytes }) {
  const { ephemeris } = await readContainer(readers.orbitProducts, bytes, { kvn: true });
  return { oem: ephemeris, objectName: 'ISS' };
}
