#!/usr/bin/env node
// E7 step 95 (PLAN.md section 8): the inputs other than Space-Track element
// sets, for anyone to check. Small files (Earth orientation, SET JB2008
// drivers, GFZ space weather) go under data/e7/, gzipped; the precise-orbit
// products every scored target came from are packed as release assets (one
// .tar.gz per product family) into --assets, with every member's SHA-256 in
// data/e7/MANIFEST.json and the sources in data/e7/SOURCES.md. The DE440s
// kernel is listed by URL and SHA-256 (JPL's public archive).
//
//   node experiments/e7-full-force-handoff/steps/95-publish-data.mjs --batches test:ID,validation:ID[+PATCH]
//        --manifests results/e7/train/<run>.manifest.json,... --assets DIR
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { loadBatch } from '../analysis.mjs';

const { values } = parseArgs({ options: { batches: { type: 'string' }, manifests: { type: 'string' }, assets: { type: 'string' }, products: { type: 'string', default: '/opt/data/sdn-archive/reference-states/products' } } });
const out = path.join(repoRoot, 'data/e7');
fs.mkdirSync(out, { recursive: true });
const assets = path.resolve(values.assets);
fs.mkdirSync(assets, { recursive: true });
const provenanceOf = (file) => { try { return JSON.parse(fs.readFileSync(`${file}.provenance.json`, 'utf8')); } catch { return null; } };

const manifest = { experiment: config.experiment, generated: new Date().toISOString(), committed: [], releaseAssets: [], listed: [] };
// Small files: committed, except SET's JB2008 drivers, which state no
// license; like E5, they go with the release assets until SET's terms are
// confirmed.
for (const [key, terms, where] of [
  ['eopC04', 'IERS: free use with acknowledgement of the IERS Earth Orientation Centre', 'git'],
  ['solfsmy', null, 'asset'], ['dtcfile', null, 'asset'], ['gfzKp', 'GFZ Potsdam: CC BY 4.0 (Matzka et al. 2021)', 'git'],
  ['gnssMetadata', 'IGS: free use with acknowledgement of the IGS (IGS data and product disclaimer and terms of use)', 'git'],
]) {
  const file = config.inputs[key];
  const bytes = fs.readFileSync(file);
  const p = provenanceOf(file);
  const name = `${path.basename(file)}.gz`;
  const target = where === 'git' ? path.join(out, name) : path.join(assets, name);
  fs.writeFileSync(target, zlib.gzipSync(bytes, { level: 9 }));
  const entry = { file: where === 'git' ? `data/e7/${name}` : name, source: p?.url ?? (key === 'eopC04' ? 'https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now' : key === 'gnssMetadata' ? 'https://files.igs.org/pub/station/general/igs_satellite_metadata.snx' : null),
    retrieved: p?.retrieved_utc ?? fs.statSync(file).mtime.toISOString(), sha256: sha256(bytes), gzSha256: sha256(fs.readFileSync(target)), terms: p?.terms ?? terms };
  if (where === 'git') manifest.committed.push(entry);
  else manifest.releaseAssets.push({ asset: name, sha256: entry.gzSha256, bytes: fs.statSync(target).size, note: 'Not in git until SET confirms its terms (none stated on https://spacewx.com/jb2008/).', members: [entry] });
}
manifest.listed.push({ file: path.basename(config.inputs.kernel.path), source: config.inputs.kernel.url, sha256: config.inputs.kernel.sha256, terms: 'JPL/NAIF public archive' });

// NOAA SWPC RSGA reports (public domain), as the warehouse serves them: the
// yearly archive and the 2026 daily files, in one committed tar.gz.
{
  const sources = config.inputs.swpcRsga;
  const staging = path.join(assets, 'swpc-rsga');
  fs.mkdirSync(staging, { recursive: true });
  const members = [];
  for (const src of sources) {
    if (src.endsWith('.tar.gz')) { fs.copyFileSync(src, path.join(staging, path.basename(src))); members.push({ file: path.basename(src), sha256: sha256(fs.readFileSync(src)), provenance: provenanceOf(src) }); continue; }
    for (const f of fs.readdirSync(src).filter((n) => /RSGA\.txt$/.test(n)).sort()) {
      fs.mkdirSync(path.join(staging, '2026'), { recursive: true });
      fs.copyFileSync(path.join(src, f), path.join(staging, '2026', f));
      members.push({ file: `2026/${f}`, sha256: sha256(fs.readFileSync(path.join(src, f))), provenance: provenanceOf(path.join(src, f)) });
    }
  }
  const tarFile = path.join(out, 'swpc-rsga.tar.gz');
  execFileSync('tar', ['-czf', tarFile, '-C', staging, '.']);
  fs.rmSync(staging, { recursive: true });
  manifest.committed.push({ file: 'data/e7/swpc-rsga.tar.gz', source: 'ftp://ftp.swpc.noaa.gov/pub/warehouse/ (RSGA)', retrieved: members[0]?.provenance?.retrieved_utc ?? null,
    sha256: sha256(fs.readFileSync(tarFile)), terms: members[0]?.provenance?.terms ?? 'NOAA/NWS: public domain', members: members.map(({ file, sha256: h, provenance }) => ({ file, sha256: h, url: provenance?.url ?? null })) });
}

// Truth products behind every reference file a batch (and its patches) or a
// listed run manifest (step 10) read.
const products = new Map();
const manifests = [];
for (const spec of values.batches.split(',')) {
  const [window, batches] = spec.split(':');
  const [batch, ...patches] = batches.split('+');
  manifests.push(...loadBatch(window, batch, patches).manifests);
}
for (const f of (values.manifests ?? '').split(',').filter(Boolean)) manifests.push(JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')));
for (const m of manifests) {
  for (const f of Object.keys(m.inputs.reference ?? {})) {
    const dir = f.split('/')[0];
    if (products.has(dir)) continue;
    const index = JSON.parse(fs.readFileSync(path.join(config.inputs.reference, dir, 'index.json'), 'utf8'));
    products.set(dir, { product: index.product, url: index.url, sha256: index.sha256, statedSigmaM: index.statedSigmaM ?? null });
  }
}
const family = (name) => (/^(ESA0OPSFIN|IGS0OPSFIN)/.test(name) ? 'gnss-final' : /^S1[A-D]_/.test(name) ? 'sentinel1-poeorb' : /^SW_OPER/.test(name) ? 'swarm-sp3' : /^nsgf/.test(name) ? 'slr-nsgf' : /^ilrs/.test(name) ? 'slr-ilrs' : 'other');
const byFamily = new Map();
for (const p of products.values()) {
  const file = path.join(values.products, p.product);
  if (!fs.existsSync(file)) throw new Error(`raw product missing: ${file}`);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== p.sha256) throw new Error(`${p.product}: bytes differ from the SHA-256 the reference index records`);
  const f = family(p.product);
  if (!byFamily.has(f)) byFamily.set(f, []);
  byFamily.get(f).push({ ...p, bytes: bytes.length, retrieved: fs.statSync(file).mtime.toISOString() });
}
for (const [f, members] of byFamily) {
  const tar = path.join(assets, `e7-${f}.tar.gz`);
  const list = path.join(assets, `e7-${f}.files`);
  fs.writeFileSync(list, members.map((m) => m.product).sort().join('\n'));
  execFileSync('tar', ['-czf', tar, '-C', values.products, '-T', list]);
  fs.rmSync(list);
  manifest.releaseAssets.push({ asset: path.basename(tar), sha256: sha256(fs.readFileSync(tar)), bytes: fs.statSync(tar).size, members: members.sort((a, b) => a.product.localeCompare(b.product)) });
}
fs.writeFileSync(path.join(out, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);
fs.writeFileSync(path.join(assets, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);

const terms = {
  'gnss-final': 'ESA/ESOC navigation office GNSS products: free use with attribution to ESA/ESOC and the IGS',
  'sentinel1-poeorb': 'Copernicus Sentinel data: free, full and open (Copernicus data policy, Regulation (EU) No 1159/2013); "Contains modified Copernicus Sentinel data"',
  'swarm-sp3': 'ESA Swarm data: ESA Earth Observation data terms (free, attribution to ESA)',
  'slr-nsgf': 'ILRS/EDC (DGFI-TUM) SLR products: free use with acknowledgement of the ILRS and the analysis centre (NSGF)',
  'slr-ilrs': 'ILRS/EDC (DGFI-TUM) SLR products: free use with acknowledgement of the ILRS',
};
const L = ['# E7 inputs other than Space-Track', '', 'Generated by `experiments/e7-full-force-handoff/steps/95-publish-data.mjs`. Space-Track `gp_history` element sets are not published (Space-Track terms); their file SHA-256 are in each run manifest.', '',
  '## Committed here', '', '| File | Source | Retrieved | SHA-256 (uncompressed) | Terms |', '| --- | --- | --- | --- | --- |',
  ...manifest.committed.map((c) => `| \`${c.file}\` | ${c.source} | ${c.retrieved} | \`${c.sha256}\` | ${c.terms} |`), '',
  '## Release assets (the precise orbits behind every scored target, and SET\'s JB2008 drivers)', '', '| Asset | Members | Bytes | SHA-256 | Source | Terms |', '| --- | ---: | ---: | --- | --- | --- |',
  ...manifest.releaseAssets.map((a) => `| \`${a.asset}\` | ${a.members.length} | ${a.bytes} | \`${a.sha256}\` | ${a.members[0].url ? `${new URL(a.members[0].url).host} (each member's URL and SHA-256 in MANIFEST.json)` : a.members[0].source} | ${terms[a.asset.replace(/^e7-|\.tar\.gz$/g, '')] ?? `${a.members[0].terms ?? ''} ${a.note ?? ''}`} |`), '',
  '## Listed only', '', ...manifest.listed.map((l) => `- \`${l.file}\`: ${l.source}, SHA-256 \`${l.sha256}\` (${l.terms}).`), '',
  'Each product is converted to GCRF reference states by `analysis/reference-states` with IERS EOP 20 C04, as listed in the run manifests.', ''];
fs.writeFileSync(path.join(out, 'SOURCES.md'), L.join('\n'));
console.log(`data/e7: ${manifest.committed.length} files; ${manifest.releaseAssets.length} release assets in ${assets}`);
