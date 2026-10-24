// Amendment A11 (M24): NASA's public ISS trajectory archive, https://nasa-public-data.s3.amazonaws.com/iss-coords/<date>/.../ISS.OEM_J2K_EPH.txt, one
// file per dated folder from 2020 to 2026 (the coordinator approved the fetch on 2026-10-24: NASA public data, a U.S. Government work, used for local results).
// One request at a time, 2 s apart (lib/paced.mjs; it stops on HTTP 403 or 429), no credentials. The bucket's listing is read first (ListObjectsV2, pages of
// 1,000 keys) and the OEM .txt keys are taken from it; the sightings files of the same folders are not fetched. Each file is stored as served under
// <archive>/hac/nasa-iss-oem-archive/<date>/ with a provenance row beside it (url, retrieved_utc, sha256, bytes, terms); nothing is committed or republished.
//   node experiments/sdn-gp-starlink-ffm-match/fetch-iss-oem.mjs [--limit N] [--spacing 2000]      (stop: touch <archive>/hac/nasa-iss-oem-archive/stop)
import fs from 'node:fs';
import path from 'node:path';
import { args } from './common.mjs';
import { pacedGet, storeWithProvenance, ARCHIVE_HAC, sha256 } from './lib/paced.mjs';
import { source as licenseSource } from '../../harness/data-licenses.mjs';

const ROOT = 'https://nasa-public-data.s3.amazonaws.com';
const DEST = path.join(ARCHIVE_HAC, 'nasa-iss-oem-archive');
const spacingMs = Number(args.spacing ?? 2000), limit = args.limit ? Number(args.limit) : Infinity;
const lic = licenseSource('nasa-iss-oem');
const TERMS = `${lic.license}. ${lic.redistribution} ${lic.conditions}`;
const ATTRIBUTION = lic.credit;
fs.mkdirSync(DEST, { recursive: true });
const stopped = () => fs.existsSync(path.join(DEST, 'stop'));

// 1. the listing of iss-coords/ (pages of 1,000 keys), kept as served
const keys = [];
let token = null;
for (let page = 1; page <= 80; page += 1) {
  if (stopped()) { console.error('stop file present'); process.exit(3); }
  const url = `${ROOT}/?list-type=2&prefix=iss-coords/&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
  const name = `listing.page${String(page).padStart(2, '0')}.xml`;
  let text;
  if (fs.existsSync(path.join(DEST, name))) text = fs.readFileSync(path.join(DEST, name), 'utf8');
  else {
    const { bytes } = await pacedGet(url, { spacingMs, timeoutMs: 120000 });
    storeWithProvenance({ dir: DEST, name, bytes, url, terms: TERMS, attribution: ATTRIBUTION, extra: { kind: 'S3 ListObjectsV2 page of the iss-coords/ prefix' } });
    text = bytes.toString('utf8');
  }
  for (const block of text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) { // later entries carry extra elements (checksums) between ETag and Size, so each block is read field by field
    const field = (name) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(block[1])?.[1];
    keys.push({ key: field('Key'), lastModified: field('LastModified'), size: Number(field('Size')) });
  }
  const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(text);
  console.error(`listing page ${page}: ${keys.length} keys so far`);
  if (!next || !/<IsTruncated>true<\/IsTruncated>/.test(text)) break;
  token = next[1].replace(/&amp;/g, '&');
}
const oem = keys.filter((k) => /\/ISS\.OEM_J2K_EPH\.txt$/.test(k.key) && /^iss-coords\/\d{4}-\d{2}-\d{2}\//.test(k.key)).sort((a, b) => a.key.localeCompare(b.key));
fs.writeFileSync(path.join(DEST, 'oem-keys.json'), `${JSON.stringify({ listedKeys: keys.length, oemTxtKeys: oem.length, keys: oem }, null, 1)}\n`);
console.error(`${keys.length} keys listed, ${oem.length} OEM .txt files, ${(oem.reduce((s, k) => s + k.size, 0) / 1e6).toFixed(0)} MB`);

// 2. the files, one at a time
let done = 0, fetched = 0;
for (const k of oem) {
  if (done >= limit) break;
  if (stopped()) { console.error('stop file present'); process.exit(3); }
  const date = k.key.split('/')[1];
  done += 1;
  if (fs.existsSync(path.join(DEST, date, 'ISS.OEM_J2K_EPH.txt'))) continue;
  const url = `${ROOT}/${k.key}`;
  const { bytes, headers } = await pacedGet(url, { spacingMs, timeoutMs: 180000 });
  if (bytes.length !== k.size) throw new Error(`${url}: ${bytes.length} bytes against ${k.size} listed`);
  storeWithProvenance({ dir: path.join(DEST, date), name: 'ISS.OEM_J2K_EPH.txt', bytes, url, terms: TERMS, attribution: ATTRIBUTION, extra: { kind: 'NASA ISS trajectory, CCSDS OEM text (EME2000, UTC)', listedLastModified: k.lastModified, etag: headers.etag ?? null, key: k.key } });
  fetched += 1;
  if (fetched % 25 === 0) console.error(`${fetched} files fetched (${date})`);
}
console.error(`done: ${fetched} fetched, ${oem.length} listed`);
