// Paced requests for the public sources the coordinator approved (GFZ ISDC, JPL Horizons, STScI MAST): one request at a time per
// host across processes (a stamp file per host), a descriptive User-Agent, a timeout, a stop on HTTP 403/429, and files stored as
// served with a provenance row beside each (url, retrieved_utc, sha256, bytes, terms, attribution), never overwritten. The archive
// convention is hac/naif-kernels/README.md; nothing fetched here is committed or republished.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, freeGiB } from '../common.mjs';

export const UA = 'sdn-orbit-accuracy-experiments/G1 (research; paced, one request at a time)';
export const ARCHIVE_HAC = path.join(config.archive, 'hac');
const STAMPS = path.join(ARCHIVE_HAC, '.fetch-stamps');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function pace(host, spacingMs) {
  fs.mkdirSync(STAMPS, { recursive: true });
  const stamp = path.join(STAMPS, host);
  for (;;) {
    let last = 0;
    try { last = Number(fs.readFileSync(stamp, 'utf8')); } catch { /* first request to this host */ }
    const wait = last + spacingMs - Date.now();
    if (wait <= 0) break;
    await sleep(wait + Math.random() * 300);
  }
  fs.writeFileSync(stamp, String(Date.now()));
}

/** One GET, paced per host. Returns { bytes, status, headers, url }. A 403 or 429 throws a message that says stop. */
export async function pacedGet(url, { spacingMs = 6000, timeoutMs = 300000, headers = {}, minFreeGiB = 25 } = {}) {
  if (freeGiB(config.archive) < minFreeGiB) throw new Error(`disk under ${minFreeGiB} GiB free`);
  const host = new URL(url).host;
  await pace(host, spacingMs);
  const response = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  fs.writeFileSync(path.join(STAMPS, host), String(Date.now())); // the spacing runs from the end of the request too
  if (response.status === 403 || response.status === 429) throw new Error(`HTTP ${response.status} from ${host}: stop`);
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} for ${url}`), { status: response.status });
  return { bytes: Buffer.from(await response.arrayBuffer()), status: response.status, headers: Object.fromEntries(response.headers), url: response.url };
}

/** Store bytes as served, plus <file>.provenance.json; returns the path, or null when the file is already there. */
export function storeWithProvenance({ dir, name, bytes, url, terms, attribution, extra = {} }) {
  const target = path.join(dir, name);
  if (fs.existsSync(target)) return null;
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${target}.${process.pid}.part`;
  fs.writeFileSync(temp, bytes);
  fs.renameSync(temp, target);
  fs.writeFileSync(`${target}.provenance.json`, JSON.stringify({ file: name, url, retrieved_utc: new Date().toISOString(), sha256: sha256(bytes), bytes: bytes.length, terms, attribution, ...extra }, null, 2) + '\n');
  return target;
}
