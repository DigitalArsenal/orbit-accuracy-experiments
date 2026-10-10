// China Space Station (Tiangong): China Manned Space Agency's weekly OEM archive (a ZIP of one CCSDS
// OEM, linked from the CMSE orbit-parameter page). CelesTrak cuts it into 6-hour segments like the ISS:
// the EPOCH is the segment start and the window [EPOCH, EPOCH + 6 h]. The ZIP is expanded in memory
// and read by files/orbit-products read_container (WASM).
import { firstZipMember, readContainer } from '../lib/readers/container.mjs';
import { sha256 } from '../lib/http.mjs';

export const id = 'css';
export const hours = 6;
export const hosts = ['www.cmse.gov.cn'];
export const INDEX = 'https://www.cmse.gov.cn/gfgg/zgkjzgdcs/';
export const NORAD = 48274;

export async function prepare({ http, log }) {
  const page = await http.get(INDEX);
  if (page.status !== 200 || !page.body) throw new Error(`CMSE index: HTTP ${page.status} ${page.error ?? ''}`);
  const links = [...page.body.toString('utf8').matchAll(/\.\/(\d{6}\/W\d+\.zip)/g)].map((m) => m[1]);
  if (!links.length) throw new Error('CMSE index: no ZIP link on the page');
  const url = new URL(links[0], INDEX).href;
  const zip = await http.get(url);
  if (zip.status !== 200 || !zip.body) throw new Error(`CMSE ZIP: HTTP ${zip.status} ${zip.error ?? ''}`);
  log(`css: ${url} (${zip.body.length} bytes)`);
  return {
    url, body: zip.body,
    provenance: { url, requestUtc: zip.requestUtc, responseUtc: zip.responseUtc, httpStatus: 200, etag: zip.headers.etag, lastModified: zip.headers.lastModified, contentRange: null, rangeRequested: null, bytes: zip.body.length, totalBytes: zip.body.length, sha256: sha256(zip.body), attempts: zip.attempts, index: INDEX },
  };
}

export const held = (ctx) => ({ body: ctx.body, provenance: ctx.provenance });
export const candidates = (ctx) => [{ id: ctx.url.split('/').at(-1), url: ctx.url }];

export async function read({ readers, bytes }) {
  const member = firstZipMember(bytes);
  const { ephemeris } = await readContainer(readers.orbitProducts, member.bytes, { kvn: true });
  return { oem: ephemeris, objectName: 'CSS' };
}
