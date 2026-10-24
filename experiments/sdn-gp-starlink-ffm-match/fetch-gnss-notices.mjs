// Amendment A14 (M27): the public GNSS notices the coordinator approved on 2026-10-24: the GPS NANUs of 2026 and the QZSS NAQU page. One request at a time, 5 s apart per host (lib/paced.mjs; it stops on HTTP 403/429),
// no credentials, a retry after a failed name lookup (the NAVCEN apex name resolved on some attempts only). Each file is stored as served under <archive>/hac/gnss-notices/<source>/ with a provenance row beside it
// (url, retrieved_utc, sha256, bytes, terms); nothing is committed or republished. The BeiDou notices of the CSNO test and assessment center (www.csno-tarc.cn) did not answer (see the attempts file); the BeiDou
// site en.beidou.gov.cn carries only upgrade and maintenance advisories, which are not orbit notices, and none is fetched.
//   node experiments/sdn-gp-starlink-ffm-match/fetch-gnss-notices.mjs [--year 2026] [--spacing 5000]      (stop: touch <archive>/hac/gnss-notices/stop)
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { args } from './common.mjs';
import { pacedGet, storeWithProvenance, ARCHIVE_HAC } from './lib/paced.mjs';
import { source as licenseSource } from '../../harness/data-licenses.mjs';

const DEST = path.join(ARCHIVE_HAC, 'gnss-notices');
const year = Number(args.year ?? 2026), spacingMs = Number(args.spacing ?? 5000);
const stopped = () => fs.existsSync(path.join(DEST, 'stop'));
const termsOf = (id) => { const s = licenseSource(id); return { terms: `${s.license}. ${s.redistribution} ${s.conditions}`, attribution: s.credit }; };
const NAV = termsOf('navcen-gps-nanu'), QZ = termsOf('qzss-naqu');

async function get(url, maxAttempts = 20) {
  for (let attempt = 1; ; attempt += 1) {
    if (stopped()) { console.error('stop file present'); process.exit(3); }
    try { return await pacedGet(url, { spacingMs, timeoutMs: 120000 }); } catch (error) {
      if (!/fetch failed/.test(error.message) || attempt >= maxAttempts) throw error; // a failed name lookup never reached the server
      if (attempt % 5 === 1) console.error(`${url}: ${error.cause?.code ?? error.message}, attempt ${attempt}; waiting`);
      await sleep(8000);
    }
  }
}
function keep(dir, name, bytes, url, t, extra = {}) { // returns true when stored now
  return Boolean(storeWithProvenance({ dir, name, bytes, url, terms: t.terms, attribution: t.attribution, extra }));
}
const have = (dir, name) => fs.existsSync(path.join(dir, name));

// ---- NAVCEN: the pages that describe the archive, then the NANUs of the year. The base is the one NAVCEN's instructions give (www.navcen.uscg.gov/sites/default/files/gps/); its pages redirect to the apex
// name, whose lookup fails on many attempts from this host, so a page that does not arrive after the retries is noted and the run goes on (the NANU files answer on the www name directly). ----
const NAV_DIR = path.join(DEST, 'navcen-gps-nanu');
const BASE = 'https://www.navcen.uscg.gov';
for (const [path_, name] of [['/robots.txt', 'robots.txt'], ['/sites/default/files/pdf/gps/Programmatically_Accessing_Archives.pdf', 'Programmatically_Accessing_Archives.pdf'],
  ['/gps-nanus-almanacs-opsadvisories-sof', 'gps-nanus-almanacs-opsadvisories-sof.html'], ['/nanu-abbreviations-and-descriptions', 'nanu-abbreviations-and-descriptions.html']]) {
  if (have(NAV_DIR, name)) continue;
  try { const r = await get(`${BASE}${path_}`, 3); keep(NAV_DIR, name, r.bytes, `${BASE}${path_}`, NAV, { kind: 'NAVCEN page' }); } catch (error) { console.error(`${path_}: not fetched (${error.cause?.code ?? error.message})`); }
}
let misses = 0, fetched = 0, last = 0;
for (let n = 1; n <= 999 && misses < 3; n += 1) {
  const id = `${year}${String(n).padStart(3, '0')}`, name = `${id}.nnu`, dir = path.join(NAV_DIR, String(year));
  if (have(dir, name)) { misses = 0; last = n; continue; }
  const url = `${BASE}/sites/default/files/gps/nanu/${year}/${name}`;
  try {
    const r = await get(url);
    misses = 0; last = n; fetched += 1;
    keep(dir, name, r.bytes, url, NAV, { kind: 'GPS NANU', nanu: id });
    if (fetched % 25 === 0) console.error(`${fetched} NANUs fetched (${id})`);
  } catch (error) {
    if (error.status === 404) { misses += 1; continue; }
    throw error;
  }
}
console.error(`NANUs of ${year}: ${fetched} fetched now, last number ${last}`);

// ---- QZSS: the NAQU page (the year's messages, each in a hidden field), its format page and the site's terms of use ----
const QZ_DIR = path.join(DEST, 'qzss-naqu');
for (const [url, name] of [['https://qzss.go.jp/en/policy/rule.html', 'rule.html'], ['https://sys.qzss.go.jp/dod/en/naqu.html', 'naqu.html'], ['https://sys.qzss.go.jp/dod/en/naqu/format.html', 'naqu-format.html']]) {
  if (have(QZ_DIR, name)) continue;
  const r = await get(url);
  keep(QZ_DIR, name, r.bytes, url, QZ, { kind: 'QZSS page' });
}

// ---- BeiDou: the attempts at the CSNO test and assessment center, recorded (no workaround) ----
const attemptsFile = path.join(DEST, 'beidou-attempts.json');
if (!fs.existsSync(attemptsFile)) {
  const attempts = [];
  for (const url of ['http://www.csno-tarc.cn/en/notice/index', 'https://www.csno-tarc.cn/en/notice/index']) {
    const t0 = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { 'user-agent': 'sdn-orbit-accuracy-experiments/G1 (research; paced, one request at a time)' } });
      attempts.push({ url, atUtc: new Date(t0).toISOString(), status: response.status, seconds: (Date.now() - t0) / 1000 });
    } catch (error) { attempts.push({ url, atUtc: new Date(t0).toISOString(), error: String(error.cause?.code ?? error.name ?? error.message), seconds: (Date.now() - t0) / 1000 }); }
    await sleep(spacingMs);
  }
  fs.mkdirSync(DEST, { recursive: true });
  fs.writeFileSync(attemptsFile, `${JSON.stringify({ note: 'www.csno-tarc.cn (the BeiDou test and assessment center, announcements) did not answer from this host in five earlier attempts on 2026-10-24 either; no workaround was tried', attempts }, null, 2)}\n`);
  console.error(JSON.stringify(attempts));
}
console.error('done');
