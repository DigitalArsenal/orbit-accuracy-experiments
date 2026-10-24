// Amendment A8: TESS definitive spacecraft ephemeris (NAIF SPK) from STScI MAST, https://archive.stsci.edu/missions/tess/models/
// (linked from MAST's bulk-download page for the engineering and model files), one request at a time, 6 s apart. Files are
// stored as served under <archive>/hac/mast-tess/models/ with a provenance row beside each; nothing is committed or republished.
// archive.stsci.edu's certificate chain ends at the emSign Root CA G1, which Node's bundle lacks; that root is exported from the
// macOS system roots to <archive>/hac/.ca/emsign-root-ca-g1.pem and handed to Node as an extra trusted root (verification stays on):
//   NODE_EXTRA_CA_CERTS=/opt/data/sdn-archive/hac/.ca/emsign-root-ca-g1.pem node experiments/sdn-gp-starlink-ffm-match/fetch-mast-tess.mjs [--from 2026194] [--to 2026260]
import fs from 'node:fs';
import path from 'node:path';
import { args } from './common.mjs';
import { pacedGet, storeWithProvenance, ARCHIVE_HAC } from './lib/paced.mjs';

const ROOT = 'https://archive.stsci.edu/missions/tess/models/';
const DEST = path.join(ARCHIVE_HAC, 'mast-tess/models');
const TERMS = 'STScI MAST Data Use Policy (https://archive.stsci.edu/publishing/data-use, fetched 2026-10-24): most data hosted at MAST are in the public domain and carry no restriction on use; the originating mission and STScI are to be acknowledged in scholarly publications';
const ATTRIBUTION = 'This paper includes data collected with the TESS mission, obtained from the MAST data archive at the Space Telescope Science Institute (STScI). Funding for US Institutions for the TESS mission is provided by the NASA Explorer Program. STScI is operated by the Association of Universities for Research in Astronomy, Inc., under NASA contract NAS5-26555. (MAST mission acknowledgements, https://archive.stsci.edu/publishing/mission-acknowledgements)';

if (!/emsign-root-ca-g1\.pem$/.test(process.env.NODE_EXTRA_CA_CERTS ?? '')) { console.error('set NODE_EXTRA_CA_CERTS to the emSign root file (see the header)'); process.exit(2); }
const from = Number(args.from ?? 2026194), to = Number(args.to ?? 2026260);

const listing = await pacedGet(ROOT, { spacingMs: 6000, timeoutMs: 180000 });
storeWithProvenance({ dir: DEST, name: `models.listing.${new Date().toISOString().slice(0, 10)}.html`, bytes: listing.bytes, url: ROOT, terms: TERMS, attribution: ATTRIBUTION, extra: { kind: 'directory listing' } });
const names = [...listing.bytes.toString('utf8').matchAll(/<a href="(TESS_EPH_DEF_(\d{7})_\d+\.bsp)"/g)].map((m) => ({ name: m[1], day: Number(m[2]) })).filter((x) => x.day >= from && x.day <= to);
console.error(`${names.length} definitive ephemeris files from ${from} to ${to}`);
for (const { name } of names) {
  if (fs.existsSync(path.join(DEST, name))) continue;
  const { bytes, headers } = await pacedGet(`${ROOT}${name}`, { spacingMs: 6000, timeoutMs: 300000 });
  storeWithProvenance({ dir: DEST, name, bytes, url: `${ROOT}${name}`, terms: TERMS, attribution: ATTRIBUTION, extra: { kind: 'TESS definitive spacecraft ephemeris (SPK)', lastModified: headers['last-modified'] ?? null } });
  console.error(`${name}: ${(bytes.length / 1e6).toFixed(2)} MB`);
}
