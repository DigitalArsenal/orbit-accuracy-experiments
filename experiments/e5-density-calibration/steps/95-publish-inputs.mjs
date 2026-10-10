#!/usr/bin/env node
// E5 step 95: publish the inputs E5's runs read. Small files with open terms
// are copied (gzip) under data/e5/ (git); the rest go to a release directory
// for upload as release assets. data/e5/MANIFEST.json lists every file
// (name, size, SHA-256 of the original bytes, source URL, retrieval time,
// terms, location) and data/e5/SOURCES.md is generated from it. Third-party
// archives that are already public with a DOI (the Licata et al. HASDM files)
// are listed, not copied.
//
//   node .../95-publish-inputs.mjs --runs ID,ID,... --release DIR
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { CITED_ONLY, licenseSection, mayPublishFile } from '../../../harness/data-licenses.mjs';

const { values } = parseArgs({ options: { runs: { type: 'string' }, release: { type: 'string' } } });
const releaseDir = path.resolve(values.release);
const dataDir = path.join(repoRoot, 'data', 'e5');
const GIT_BUDGET = 150e6;
const TERMS = {
  esa: 'ESA Swarm / GRACE-FO (TOLEOS) data: free and open under the ESA Earth Observation data terms (https://earth.esa.int/eogateway/documents/20142/1560778/ESA-Data-Terms-and-Conditions.pdf); redistribution conditions to be confirmed before public release.',
  copernicus: 'Copernicus Sentinel data: free, full and open; "Contains modified Copernicus Sentinel data 2026" (EU 1159/2013).',
  ilrs: 'ILRS/EDC SLR products: free of charge, attribution to the ILRS and the analysis centre (https://ilrs.gsfc.nasa.gov/data_and_products/data_policy/).',
  iers: 'IERS products: public, free, attribution to the IERS (https://www.iers.org).',
  gfz: 'GFZ Kp index: CC BY 4.0 (Matzka et al. 2021, doi:10.5880/Kp.0001).',
  set: 'SET JB2008 indices: provided free with a 45-day lag; no license stated on https://spacewx.com/jb2008/; cite SET and Bowman et al. (2008). Not redistributed in git until terms are confirmed.',
  zenodo: 'Licata, Mehta, Tobiska and Bowman (2021), CC BY 4.0, doi:10.5281/zenodo.4602380. Listed, not copied (public with a DOI). HASDM itself: SET, research use (https://spacewx.com/hasdm/).',
};
const files = new Map();  // name -> row
const add = (row) => { if (!files.has(row.name)) files.set(row.name, row); };
const provenance = (file) => (fs.existsSync(`${file}.provenance.json`) ? JSON.parse(fs.readFileSync(`${file}.provenance.json`, 'utf8')) : null);
const local = (file, family, terms, where) => {
  const bytes = fs.readFileSync(file), p = provenance(file);
  add({ name: path.basename(file), family, size: bytes.length, sha256: sha256(bytes), url: p?.url ?? null, retrieved: p?.retrieved_utc ?? `${fs.statSync(file).mtime.toISOString()} (file mtime)`, terms, location: where, source: file });
};
const runs = values.runs.split(',');
for (const id of runs) {
  const m = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', id, 'manifest.json'), 'utf8'));
  for (const name of Object.keys(m.inputs.densities ?? {})) {
    if (name.includes('/')) {  // a member of the Zenodo archives
      const zip = name.startsWith('CHAMP') ? 'CHAMP_New.zip' : 'GRACE_A_New.zip';
      if (!files.has(zip)) add({ name: zip, family: 'hasdm-licata2021', size: fs.statSync(path.join(config.inputs.historical.zip, zip)).size, sha256: sha256(fs.readFileSync(path.join(config.inputs.historical.zip, zip))),
        url: `https://zenodo.org/records/4602380/files/${zip}`, retrieved: '2026-10-09', terms: TERMS.zenodo, location: 'Zenodo (not copied)', source: null });
      continue;
    }
    const spec = Object.values(config.inputs.densities).find((d) => name.startsWith(d.pattern));
    local(path.join(spec.dir, name), spec.kind === 'ACC' ? 'gracefo-dns' : 'swarm-dns', TERMS.esa, 'release');
  }
  for (const file of Object.keys(m.inputs.reference ?? {})) {
    const product = file.split('/')[0];
    const index = JSON.parse(fs.readFileSync(path.join(config.inputs.reference, product, 'index.json'), 'utf8'));
    const src = path.join(path.dirname(config.inputs.reference), 'products', path.basename(index.product));
    if (files.has(path.basename(src)) || !fs.existsSync(src)) continue;
    const family = product.startsWith('SW_') ? ['swarm-sp3', TERMS.esa, 'release'] : product.startsWith('S1') ? ['sentinel1-poeorb', TERMS.copernicus, 'release'] : ['slr', TERMS.ilrs, 'git'];
    const bytes = fs.readFileSync(src);
    add({ name: path.basename(src), family: family[0], size: bytes.length, sha256: sha256(bytes), url: index.url, retrieved: `${fs.statSync(src).mtime.toISOString()} (download time, file mtime)`, terms: family[1], location: family[2], source: src });
  }
}
local(config.inputs.solfsmy, 'set-jb2008', TERMS.set, 'release');
local(config.inputs.dtcfile, 'set-jb2008', TERMS.set, 'release');
local(config.inputs.kp, 'gfz-kp', TERMS.gfz, 'git');
local(config.inputs.eopC04, 'eop', TERMS.iers, 'git');
files.get(path.basename(config.inputs.eopC04)).url ??= 'https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now';

let gitBytes = 0;
fs.mkdirSync(releaseDir, { recursive: true });
for (const row of files.values()) {
  if (!row.source) continue;
  if (!mayPublishFile(row.name)) { row.location = `not published: ${CITED_ONLY}`; delete row.source; continue; }
  const bytes = fs.readFileSync(row.source);
  const already = /\.(gz|zip|ZIP)$/.test(row.name);
  const stored = already ? bytes : zlib.gzipSync(bytes, { level: 9 });
  const storedName = already ? row.name : `${row.name}.gz`;
  if (row.location === 'git' && gitBytes + stored.length > GIT_BUDGET) row.location = 'release';
  const dir = row.location === 'git' ? path.join(dataDir, row.family) : path.join(releaseDir, row.family);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, storedName), stored);
  if (row.location === 'git') gitBytes += stored.length;
  row.stored = storedName;
  if (!already) row.storedSha256 = sha256(stored);
  row.location = row.location === 'git' ? `data/e5/${row.family}/` : 'release assets';
  delete row.source;
}
const list = [...files.values()].sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'MANIFEST.json'), `${JSON.stringify({ experiment: config.experiment, runs,
  note: 'Every input E5 read. sha256 is of the original bytes; storedSha256 of the gzip where the file was compressed for storage. No Space-Track data is used.', files: list }, null, 1)}\n`);
const families = [...new Set(list.map((r) => r.family))];
const md = ['# E5 inputs', '', `Generated by \`experiments/e5-density-calibration/steps/95-publish-inputs.mjs\` from the runs ${runs.map((r) => `\`${r}\``).join(', ')}. Do not edit by hand.`, '',
  'Every file E5 read, with its source, retrieval time and SHA-256. [MANIFEST.json](MANIFEST.json) has one row per file. Precise orbits were converted to reference states by `analysis/reference-states` (`scripts/fetch-reference-products.mjs`, EOP 20 C04) with the modules recorded in each run manifest.', '',
  '| Family | Files | Size (MB) | Where | Terms |', '| --- | ---: | ---: | --- | --- |'];
for (const fam of families) {
  const rows = list.filter((r) => r.family === fam);
  md.push(`| ${fam} | ${rows.length} | ${(rows.reduce((a, r) => a + r.size, 0) / 1e6).toFixed(1)} | ${rows[0].location} | ${rows[0].terms} |`);
}
md.push('', ...licenseSection(['esa-earth-observation', 'copernicus-sentinel', 'ilrs-nsgf', 'set-jb2008', 'zenodo-licata-hasdm', 'iers', 'gfz-kp'], 'data/e5'));
md.push('', '## Files', '', '| File | SHA-256 | Source | Retrieved |', '| --- | --- | --- | --- |');
for (const r of list) md.push(`| ${r.name} | \`${r.sha256}\` | ${r.url ?? '—'} | ${r.retrieved} |`);
fs.writeFileSync(path.join(dataDir, 'SOURCES.md'), `${md.join('\n')}\n`);
console.log(`${list.length} files; ${(gitBytes / 1e6).toFixed(1)} MB in git; release assets in ${releaseDir}`);
