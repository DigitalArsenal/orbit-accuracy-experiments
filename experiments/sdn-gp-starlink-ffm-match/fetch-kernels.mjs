// Paced NAIF fetcher, following the archive's conventions (hac/naif-kernels/README.md): files stored as served,
// never overwritten, `<file>.provenance.json` beside each (url, retrieved_utc, sha256, bytes, terms), one request at a
// time, at least 5 s apart, a descriptive User-Agent, a size cap per file and a disk guard.
//   node experiments/sdn-gp-starlink-ffm-match/fetch-kernels.mjs list <dir under pub/naif/>
//   node experiments/sdn-gp-starlink-ffm-match/fetch-kernels.mjs get <path under pub/naif/> [--dest <subdir of hac/naif-kernels>] [--max-mb 400]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config, args, freeGiB } from './common.mjs';

const ROOT = 'https://naif.jpl.nasa.gov/pub/naif/';
const UA = 'sdn-orbit-accuracy-experiments/G1 (research; paced, one request at a time)';
const SPACING_MS = 5000;
const KERNELS = path.join(config.archive, 'hac/naif-kernels');
const TERMS = 'NAIF/JPL public data, no restrictions (naif.jpl.nasa.gov)';
const stamp = path.join(KERNELS, '.fetch-last');

async function pace() { // the last request of any run of this fetcher, so separate runs are paced too
  let last = 0;
  try { last = Number(fs.readFileSync(stamp, 'utf8')); } catch { /* first request */ }
  const wait = last + SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  fs.writeFileSync(stamp, String(Date.now()));
}

/** Entries of an Apache directory listing: name, bytes (null for a directory) and the listed date. */
export async function list(dir) {
  await pace();
  const response = await fetch(`${ROOT}${dir.replace(/^\/+/, '')}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120000) });
  if (response.status === 403 || response.status === 429) throw new Error(`HTTP ${response.status}: stop`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${dir}`);
  const html = await response.text();
  const out = [];
  for (const m of html.matchAll(/<a href="([^"?:\/][^"?:]*)">[^<]*<\/a>\s*(\d{4}-\d\d-\d\d \d\d:\d\d)?\s*([\d.]+[KMGT]?|-)?/g)) {
    const [, name, date, size] = m;
    if (name.startsWith('/') || name.startsWith('..')) continue;
    const factor = { K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[size?.slice(-1)] ?? 1;
    out.push({ name, modified: date ?? null, bytes: size && size !== '-' ? Math.round(parseFloat(size) * factor) : null, directory: name.endsWith('/') });
  }
  return out;
}

/** One file, as served, into hac/naif-kernels/<dest>/, with its provenance row. Never overwrites. */
export async function get(file, dest, maxMb = 400) {
  const target = path.join(KERNELS, dest, path.basename(file));
  if (fs.existsSync(target)) return { path: target, skipped: 'already stored' };
  if (freeGiB(KERNELS) < 25) throw new Error('disk under 25 GiB free');
  await pace();
  const url = `${ROOT}${file.replace(/^\/+/, '')}`;
  const response = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(900000) });
  if (response.status === 403 || response.status === 429) throw new Error(`HTTP ${response.status}: stop`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > maxMb * 1e6) throw new Error(`${path.basename(file)} is ${(length / 1e6).toFixed(0)} MB, over the ${maxMb} MB cap`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.part`;
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const tap = new (await import('node:stream')).Transform({ transform(chunk, _e, cb) { bytes += chunk.length; hash.update(chunk); cb(null, chunk); } });
  await pipeline(Readable.fromWeb(response.body), tap, fs.createWriteStream(temp));
  fs.renameSync(temp, target);
  const provenance = { url, retrieved_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), sha256: hash.digest('hex'), bytes, terms: TERMS };
  fs.writeFileSync(`${target}.provenance.json`, `${JSON.stringify(provenance, null, 1)}\n`);
  return { path: target, ...provenance };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [command, target] = process.argv.slice(2);
  if (command === 'list') for (const e of await list(target)) console.log(`${e.name}\t${e.modified ?? ''}\t${e.bytes ?? ''}`);
  else if (command === 'get') console.log(JSON.stringify(await get(target, args.dest ?? 'spk/missions', Number(args['max-mb'] ?? 400))));
  else { console.error('usage: list <dir> | get <path> [--dest subdir] [--max-mb N]'); process.exit(2); }
}
