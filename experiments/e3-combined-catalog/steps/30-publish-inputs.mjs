#!/usr/bin/env node
// E3 step 30: publish the exact non-Space-Track inputs E3's runs read, so
// others can check them. Small files are copied under data/e3/ (git); large
// ones, and ones whose redistribution terms need a check, go to a release
// directory for upload as release assets. data/e3/MANIFEST.json lists every
// file (name, size, SHA-256, source URL, retrieval time, terms, location) and
// data/e3/SOURCES.md is generated from it. Space-Track data is never copied.
//
//   node experiments/e3-combined-catalog/steps/30-publish-inputs.mjs --runs ID,ID,... --release DIR
//        [--products DIR] [--vimpel DIR]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { CITED_ONLY, licenseSection, mayPublishFile } from '../../../harness/data-licenses.mjs';

const { values } = parseArgs({ options: { runs: { type: 'string' }, release: { type: 'string' }, products: { type: 'string' }, vimpel: { type: 'string' } } });
const productsDir = path.resolve(values.products ?? path.join(path.dirname(config.inputs.reference), 'products'));
const releaseDir = path.resolve(values.release);
const dataDir = path.join(repoRoot, 'data', 'e3');
const GIT_BUDGET = 200e6;

const TERMS = {
  igs: 'IGS products: open, free of charge, attribution to the IGS and the analysis centre (IGS data policy, https://igs.org/data-policy/).',
  esa: 'ESA Navigation Office GNSS products: free of charge, attribution to ESA/ESOC (https://navigation-office.esa.int).',
  ilrs: 'ILRS/EDC SLR products: free of charge, attribution to the ILRS and the analysis centre (ILRS data policy, https://ilrs.gsfc.nasa.gov/data_and_products/data_policy/).',
  copernicus: 'Copernicus Sentinel data: free, full and open; "Contains modified Copernicus Sentinel data 2026" (Copernicus data regulation, EU 1159/2013).',
  swarm: 'ESA Swarm data: free under ESA\'s terms for data under its responsibility (https://earth.esa.int/eogateway/documents/20142/1560778/ESA-Data-Terms-and-Conditions.pdf); redistribution conditions to be confirmed before public release.',
  iers: 'IERS products: public, free, attribution to the IERS (https://www.iers.org).',
  vimpel: 'JSC Vimpel public orbit data (http://spacedata.vimpel.ru): no redistribution terms published; do not release before they are confirmed.',
};
const familyOf = (name) => {
  if (name.startsWith('ESA0OPS')) return ['esa', name.startsWith('ESA0OPSULT') ? 'gnss-ultra-rapid-esa' : 'gnss-final-esa'];
  if (name.startsWith('IGS0OPSULT')) return ['igs', 'gnss-ultra-rapid-igs-node'];
  if (/^S1[A-D]_/.test(name)) return ['copernicus', 'sentinel1-poeorb'];
  if (name.startsWith('SW_OPER')) return ['swarm', 'swarm'];
  if (name.startsWith('nsgf.') || name.startsWith('ilrsa.')) return ['ilrs', 'slr'];
  throw new Error(`no family for ${name}`);
};

// Products read by the runs, by their original file name.
const used = new Map();  // file name -> {url, product}
for (const id of values.runs.split(',')) {
  const m = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', id, 'manifest.json'), 'utf8'));
  const readDirs = new Set([...Object.keys(m.inputs.reference ?? {}), ...Object.keys(m.inputs.ultraRapid ?? {})].map((f) => f.split('/')[0]));
  for (const [product, p] of Object.entries(m.inputs.referenceProducts ?? {})) {
    if (!readDirs.has(product)) continue;
    used.set(path.basename(p.source.split(' ')[0]), { url: p.url, product });
  }
  // A0.1 compares the C04 and finals2000A conversions of the same products.
  for (const f of Object.keys(m.inputs.referenceC04 ?? {})) {
    const index = JSON.parse(fs.readFileSync(path.join(config.inputs.referenceC04, f.split('/')[0], 'index.json'), 'utf8'));
    used.set(path.basename(index.product), { url: index.url, product: f.split('/')[0] });
  }
}
// Node-kept IGS ultra-rapids: retrieval times from the node's provenance.
const nodeProvenance = new Map();
const provDir = path.join(process.env.HOME, '.local/share/spacedatanetwork/ephemeris-provider-nodes/gps-precise/raw/provenance/gps-precise');
if (fs.existsSync(provDir)) for (const f of fs.readdirSync(provDir)) {
  const p = JSON.parse(fs.readFileSync(path.join(provDir, f), 'utf8'));
  nodeProvenance.set(path.basename(p.source_url), p);
}

const entries = [];
const add = (file, name, family, termsKey, url, retrieved, forceRelease = false) => {
  const bytes = fs.readFileSync(file);
  entries.push({ name, family, size: bytes.length, sha256: sha256(bytes), url, retrieved, terms: TERMS[termsKey], termsKey, src: file, release: forceRelease });
};
for (const [name, u] of [...used].sort()) {
  const file = path.join(productsDir, name);
  if (!fs.existsSync(file)) throw new Error(`missing product ${file}`);
  const [termsKey, family] = familyOf(name);
  const node = nodeProvenance.get(name);
  add(file, name, family, termsKey, u.url, node ? `${node.retrieved_at} (SDN gps-precise node; CID ${node.source_cid})` : `${fs.statSync(file).mtime.toISOString()} (download time, file mtime)`,
    termsKey === 'swarm');
}
add(config.inputs.eopFinals, path.basename(config.inputs.eopFinals), 'eop', 'iers', 'https://datacenter.iers.org/data/9/finals2000A.all', `${fs.statSync(config.inputs.eopFinals).mtime.toISOString()} (download time)`);
if (values.vimpel) for (const name of Object.keys(config.inputs.vimpelEditions)) {
  add(path.join(values.vimpel, name), name, 'vimpel', 'vimpel', `http://spacedata.vimpel.ru/download.php?file=${name}&path=common`, 'SDN vimpel node retrievals 2026-09-21..2026-10-08 (two editions)', true);
}
const capture = fs.readdirSync(config.inputs.celestrakCaptures).filter((d) => fs.existsSync(path.join(config.inputs.celestrakCaptures, d, 'capture.json'))).sort();
for (const d of capture) add(path.join(config.inputs.celestrakCaptures, d, 'capture.json'), `celestrak-capture-${d}.json`, 'celestrak-capture', 'iers', 'https://celestrak.org (failed capture; request log only)', d);
for (const e of entries.filter((x) => x.family === 'celestrak-capture')) e.terms = 'Request log written by step 02; no CelesTrak data.';

// Git first, by family, while under the budget; the rest to the release directory.
let gitBytes = 0;
const familyBytes = new Map();
for (const e of entries) familyBytes.set(e.family, (familyBytes.get(e.family) ?? 0) + (e.release ? Infinity : e.size));
const order = [...familyBytes].sort((a, b) => a[1] - b[1]).map(([f]) => f);
const inGit = new Set();
for (const f of order) if (gitBytes + familyBytes.get(f) <= GIT_BUDGET) { inGit.add(f); gitBytes += familyBytes.get(f); }
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });
for (const e of entries) {
  if (!mayPublishFile(e.name)) { e.location = `not published: ${CITED_ONLY}`; continue; }
  e.location = inGit.has(e.family) ? `data/e3/${e.family}/${e.name}` : `release asset ${e.name}`;
  const dest = inGit.has(e.family) ? path.join(dataDir, e.family, e.name) : path.join(releaseDir, e.name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Plain-text inputs are gzipped; products are already compressed.
  if (/\.(txt|json)$/.test(e.name) || /finals2000A/.test(e.name)) {
    const { gzipSync } = await import('node:zlib');
    fs.writeFileSync(`${dest}.gz`, gzipSync(fs.readFileSync(e.src), { level: 9 }));
    e.location += '.gz';
    e.storedSha256 = sha256(fs.readFileSync(`${dest}.gz`));
  } else fs.copyFileSync(e.src, dest);
}
const manifest = {
  experiment: config.experiment,
  runs: values.runs.split(','),
  note: 'Every non-Space-Track input E3 read. sha256 is of the original bytes; storedSha256 of the gzip where the file was compressed for storage. Space-Track element sets are not redistributed (Space-Track terms); runs record their SHA-256 only.',
  files: entries.map(({ src, release, termsKey, ...e }) => e),
};
fs.writeFileSync(path.join(dataDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);
const L = ['# E3 inputs', '', 'Generated by `experiments/e3-combined-catalog/steps/30-publish-inputs.mjs` from the runs ' + manifest.runs.map((r) => `\`${r}\``).join(', ') + '. Do not edit by hand.', '',
  'Every non-Space-Track file E3 read, with its source, retrieval time and SHA-256. Files under `data/e3/` are in this repository; the others are release assets of the same name. [MANIFEST.json](MANIFEST.json) has one row per file. Space-Track element sets are not redistributed; the run manifests under `results/e3/` hold their SHA-256.', '',
  'Reference states were converted from these files by `experiments/e3-combined-catalog/truth/fetch-reference-products.mjs` with the modules recorded in each run manifest.', '',
  '| Family | Files | Size (MB) | Where | Terms |', '| --- | ---: | ---: | --- | --- |'];
for (const f of [...new Set(entries.map((e) => e.family))]) {
  const list = entries.filter((e) => e.family === f);
  L.push(`| ${f} | ${list.length} | ${(list.reduce((t, e) => t + e.size, 0) / 1e6).toFixed(1)} | ${inGit.has(f) ? `\`data/e3/${f}/\`` : 'release assets'} | ${list[0].terms} |`);
}
L.push('', ...licenseSection(['esa-navigation-office', 'igs', 'copernicus-sentinel', 'esa-earth-observation', 'ilrs', 'ilrs-nsgf', 'iers', 'vimpel', 'celestrak', 'space-track'], 'data/e3'));
L.push('', '## Files', '', '| File | SHA-256 | Source | Retrieved |', '| --- | --- | --- | --- |');
for (const e of entries) L.push(`| ${e.name} | \`${e.sha256}\` | ${e.url} | ${e.retrieved} |`);
fs.writeFileSync(path.join(dataDir, 'SOURCES.md'), `${L.join('\n')}\n`);
fs.copyFileSync(path.join(dataDir, 'MANIFEST.json'), path.join(releaseDir, 'MANIFEST.json'));
console.log(`git: ${(gitBytes / 1e6).toFixed(1)} MB in ${[...inGit].join(', ')}; release: ${entries.filter((e) => !inGit.has(e.family)).length} files, ${(entries.filter((e) => !inGit.has(e.family)).reduce((t, e) => t + e.size, 0) / 1e6).toFixed(1)} MB -> ${releaseDir}`);
