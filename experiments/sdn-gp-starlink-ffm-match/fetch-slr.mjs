// Amendment A9: ILRS orbit products from NASA CDDIS (coordinator approval of 2026-10-24), with the owner's Earthdata token read at run time
// (lib/cddis.mjs: sent to cddis.nasa.gov only, never printed or stored), one request at a time, 3 s apart. Files are stored as served under
// <archive>/hac/ilrs-cddis/cddis/slr/products/orbits/ (the CDDIS path), each with a provenance row (url, sha256, terms, attribution).
//   rapid/<sat>/<yyyy>/<yymmdd>/nsgf.orb.<sat>.<yymmdd>.v000.sp3.gz   NERC Space Geodesy Facility daily rapid orbits (4-day arcs, the arc of file F ends F-1)
//   TRF/<sat>/<yyyy>/<yymmdd>/ilrsa.orb.<sat>.<yymmdd>.v80.sp3.gz     ILRS combined weekly orbits (LAGEOS-1/2, Etalon-1/2)
//   node experiments/sdn-gp-starlink-ffm-match/fetch-slr.mjs --from 2026-10-08 --to 2026-10-24 [--weeks 260912,260919,260926,261003]
import fs from 'node:fs';
import path from 'node:path';
import { args } from './common.mjs';
import { storeWithProvenance, ARCHIVE_HAC, sha256 } from './lib/paced.mjs';
import { cddisGet } from './lib/cddis.mjs';

const DEST = path.join(ARCHIVE_HAC, 'ilrs-cddis/cddis/slr/products/orbits');
const RAPID = ['ajisai', 'larets', 'lares', 'lares2', 'starlette', 'stella', 'westpac'];
const WEEKLY = ['lageos1', 'lageos2', 'etalon1', 'etalon2'];
const TERMS = 'ILRS: data and products not copyrighted, citation requested; NASA ESDIS Data Use and Citation Guidance (fetched 2026-10-24): observation data and products generally not copyrighted, NASA to be acknowledged, non-NASA data follow the sponsoring organization\'s license; CDDIS /pub/slr/products readme of October 2026';
const ATTRIBUTION = 'Pearlman, M.R., Noll, C.E., Pavlis, E.C. et al. The ILRS: approaching 20 years and planning for the future. J Geod 93, 2161-2180 (2019), doi:10.1007/s00190-019-01241-1; NASA CDDIS (Noll 2010, doi:10.1016/j.asr.2010.01.018); NSGF orbits contain British Geological Survey materials (c) UKRI 2026, Open Government License v3.0';

const DAY = 86400000;
const yymmdd = (ms) => new Date(ms).toISOString().slice(2, 10).replaceAll('-', '');
const jobs = [];
for (let t = Date.parse(`${args.from}T00:00:00Z`); t <= Date.parse(`${args.to}T00:00:00Z`); t += DAY) {
  for (const sat of RAPID) jobs.push({ rel: `rapid/${sat}/${new Date(t).getUTCFullYear()}/${yymmdd(t)}/nsgf.orb.${sat}.${yymmdd(t)}.v000.sp3.gz`, kind: 'NSGF daily rapid orbit (SP3-c, gzip)' });
}
for (const week of (args.weeks ?? '').split(',').filter(Boolean)) {
  for (const sat of WEEKLY) jobs.push({ rel: `TRF/${sat}/20${week.slice(0, 2)}/${week}/ilrsa.orb.${sat}.${week}.v80.sp3.gz`, kind: 'ILRS combined weekly orbit (SP3-c, gzip)' });
}
console.error(`${jobs.length} files`);
let n = 0;
for (const { rel, kind } of jobs) {
  const dir = path.join(DEST, path.dirname(rel)), name = path.basename(rel);
  if (fs.existsSync(path.join(dir, name))) continue;
  const url = `https://cddis.nasa.gov/archive/slr/products/orbits/${rel}`;
  const r = await cddisGet(url);
  if (!r.bytes || !(r.bytes[0] === 0x1f && r.bytes[1] === 0x8b)) { console.error(`not available: ${rel} (HTTP ${r.status})`); continue; }
  storeWithProvenance({ dir, name, bytes: r.bytes, url, terms: TERMS, attribution: ATTRIBUTION, extra: { size: r.bytes.length, route: 'NASA CDDIS', lastModified: r.headers['last-modified'] ?? null, etag: r.headers.etag ?? null, kind } });
  n += 1;
  if (n % 20 === 0) console.error(`${n} stored (${rel.split('/')[0]} ${name})`);
}
console.error(`${n} files stored`);
