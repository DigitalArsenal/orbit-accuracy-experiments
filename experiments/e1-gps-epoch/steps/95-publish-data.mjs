#!/usr/bin/env node
// Publishes every non-Space-Track input E1 reads, so others can check it:
//
// - data/e1/ (tracked): the IERS EOP 20 C04 series and the IGS satellite
//   metadata SINEX (gzipped), the reference-states index of every product
//   (one gzipped JSON; it lists each converted file's epochs and the product
//   hash), MANIFEST.json and SOURCES.md.
// - --assets DIR (release assets, not tracked): every precise-orbit product
//   file as the provider served it (already gzipped), so its SHA-256 can be
//   checked against the provider's own file.
//
// Space-Track element sets are never published: only the hashes in each
// run's manifest. Nothing here is typed by hand.
//
//   node experiments/e1-gps-epoch/steps/95-publish-data.mjs --assets DIR [--products DIR] [--reference DIR]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { licenseSection } from '../../../harness/data-licenses.mjs';

const { values } = parseArgs({ options: { assets: { type: 'string' }, products: { type: 'string' }, reference: { type: 'string' } } });
if (!values.assets) throw new Error('--assets DIR is required (release assets go outside the repository)');
const reference = path.resolve(values.reference ?? config.inputs.reference);
const productsDir = path.resolve(values.products ?? path.join(reference, '..', 'products'));
const out = path.join(repoRoot, 'data/e1');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(values.assets, { recursive: true });

const TERMS = {
  IGS0OPSFIN: 'IGS data policy: open, cite the International GNSS Service (IGS)',
  ESA0OPSFIN: 'ESA/ESOC Navigation Support Office final orbit (IGS analysis centre): open, cite ESA/ESOC and the IGS',
  eop: 'IERS data, free with attribution (IERS Earth Orientation Centre, EOP 20 C04)',
  finals: 'IERS data, free with attribution (IERS Rapid Service/Prediction Centre, finals2000A)',
  sinex: 'IGS data policy: open, cite the IGS',
};
const retrieved = (file) => fs.statSync(file).mtime.toISOString();

// The products the experiment can read: GPS final orbits from the day before
// the first window to the last window's end plus seven days.
const DAY = 86400000;
const starts = Object.values(config.windows).map(([from]) => Date.parse(`${from}T00:00:00Z`));
const ends = Object.values(config.windows).map(([, to]) => Date.parse(`${to}T00:00:00Z`));
const lo = Math.min(...starts) - DAY, hi = Math.max(...ends) + 8 * DAY;
const dayOfProduct = (name) => { const m = /_(\d{4})(\d{3})0000_/.exec(name); return m ? Date.UTC(Number(m[1]), 0, 1) + (Number(m[2]) - 1) * DAY : NaN; };
const products = fs.readdirSync(reference)
  .filter((n) => config.inputs.referenceProducts.some((p) => n.startsWith(p)))
  .filter((n) => dayOfProduct(n) >= lo && dayOfProduct(n) <= hi && fs.existsSync(path.join(reference, n, 'index.json')))
  .sort((a, b) => dayOfProduct(a) - dayOfProduct(b));

// Products downloaded for the range that analysis/reference-states refused
// to convert, on days no other product covers: days without truth.
const unconverted = fs.readdirSync(productsDir)
  .filter((n) => config.inputs.referenceProducts.some((p) => n.startsWith(p)) && dayOfProduct(n) >= lo && dayOfProduct(n) <= hi)
  .filter((n) => !products.some((p) => dayOfProduct(p) === dayOfProduct(n))).sort();

const manifest = { generatedBy: 'experiments/e1-gps-epoch/steps/95-publish-data.mjs', tracked: [], releaseAssets: [], notPublished: [] };
const sinexUrls = new Set(), eopUrls = new Set();
for (const name of products) {
  const index = JSON.parse(fs.readFileSync(path.join(reference, name, 'index.json'), 'utf8'));
  const file = path.join(productsDir, index.product);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== index.sha256) throw new Error(`${index.product}: bytes differ from the hash its reference states record`);
  fs.copyFileSync(file, path.join(values.assets, index.product));
  manifest.releaseAssets.push({
    name: index.product, bytes: bytes.length, sha256: index.sha256, url: index.url, retrieved: retrieved(file),
    terms: TERMS[name.slice(0, 10)], role: 'truth: GPS precise orbit, converted by analysis/reference-states',
    gpsSatellites: index.objects.filter((o) => /SP3 satellite G\d/.test(o.comment ?? '')).length,
  });
  sinexUrls.add(index.identities);
  eopUrls.add(index.eop);
}

// Indexes of the converted reference states, every product's index.json
// keyed by product, as one gzipped JSON.
const indexFile = path.join(out, 'reference-indexes.json.gz');
const indexes = Object.fromEntries(products.map((p) => [p, JSON.parse(fs.readFileSync(path.join(reference, p, 'index.json'), 'utf8'))]));
fs.writeFileSync(indexFile, zlib.gzipSync(JSON.stringify(indexes), { level: 9 }));

const track = (source, name, url, terms, role) => {
  const raw = fs.readFileSync(source);
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(path.join(out, name), gz);
  manifest.tracked.push({ name: `data/e1/${name}`, bytes: gz.length, sha256: sha256(gz), uncompressedSha256: sha256(raw), url, retrieved: retrieved(source), terms, role });
};
// Each Earth-orientation series a product's conversion names: IERS EOP 20
// C04, or IERS finals2000A where C04 does not reach the day yet.
for (const url of [...eopUrls].sort()) {
  const name = path.basename(new URL(url).pathname);
  const days = products.filter((p) => JSON.parse(fs.readFileSync(path.join(reference, p, 'index.json'), 'utf8')).eop === url).length;
  track(path.join(productsDir, name), `${name}.gz`, url, name.startsWith('finals') ? TERMS.finals : TERMS.eop,
    `Earth orientation for the IGS20 → GCRF conversion of the truth (${days} product days)`);
}
track(path.join(productsDir, 'igs_satellite_metadata.snx'), 'igs_satellite_metadata.snx.gz', [...sinexUrls].join(' '), TERMS.sinex, 'PRN → SVN → NORAD identities of the truth');
const indexBytes = fs.readFileSync(indexFile);
manifest.tracked.push({ name: 'data/e1/reference-indexes.json.gz', bytes: indexBytes.length, sha256: sha256(indexBytes), url: null, retrieved: null,
  terms: 'MIT (derived listing)', role: 'index.json of each converted product: epochs, object identities and the product hash; the per-object $OEM files are rebuilt by analysis/reference-states' });
manifest.withoutTruth = unconverted.map((n) => ({ product: n, reason: 'analysis/reference-states refused the conversion (see its log); no reference states for that day' }));
manifest.notPublished.push(
  { what: 'Space-Track gp_history element sets', why: 'Space-Track terms: element sets stay on this machine. Each run manifest lists the SHA-256 of every gp_history file read; a Space-Track account can retrieve the same records by CREATION_DATE.' },
  { what: 'Space weather', why: 'E1 does not read space weather (SGP4 element sets; no numerical propagation in H1–H3).' },
);
const total = (list) => list.reduce((s, x) => s + x.bytes, 0);
manifest.totals = { trackedBytes: total(manifest.tracked), releaseAssetBytes: total(manifest.releaseAssets), releaseAssets: manifest.releaseAssets.length,
  firstProduct: products[0], lastProduct: products[products.length - 1],
  byPrefix: Object.fromEntries(Object.keys(TERMS).filter((k) => k.endsWith('FIN')).map((k) => [k, products.filter((p) => p.startsWith(k)).length])) };
fs.writeFileSync(path.join(out, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);

// SOURCES.md from the manifest.
const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;
const lines = ['# E1 input data', '', 'Generated by `experiments/e1-gps-epoch/steps/95-publish-data.mjs` from `MANIFEST.json`. Do not edit by hand.', '',
  'Every input E1 reads except the Space-Track element sets. Files in this directory are tracked; the precise-orbit products are release assets, byte for byte as their providers serve them, so each SHA-256 below can be checked against the provider\'s file.', '',
  ...licenseSection(['esa-navigation-office', 'igs', 'iers', 'space-track'], 'data/e1'), '',
  '## Tracked here', '', '| File | Size | SHA-256 (gzip) | SHA-256 (content) | Source | Retrieved | Terms | Role |', '| --- | ---: | --- | --- | --- | --- | --- | --- |'];
for (const t of manifest.tracked) lines.push(`| \`${t.name}\` | ${mb(t.bytes)} | \`${t.sha256}\` | ${t.uncompressedSha256 ? `\`${t.uncompressedSha256}\`` : '—'} | ${t.url ?? 'derived'} | ${t.retrieved ?? '—'} | ${t.terms} | ${t.role} |`);
lines.push('', '## Release assets', '',
  `${manifest.releaseAssets.length} GPS final-orbit products, ${mb(manifest.totals.releaseAssetBytes)}, ${manifest.totals.firstProduct} to ${manifest.totals.lastProduct}: ` +
  `${Object.entries(manifest.totals.byPrefix).map(([k, v]) => `${v} × ${k}`).join(', ')}. IGS0OPSFIN is the IGS combination from BKG's mirror; ESA0OPSFIN is ESA's final orbit, used where BKG no longer holds the day (PLAN.md amendment 3).`, '',
  '| File | SHA-256 | Source | Retrieved | Terms |', '| --- | --- | --- | --- | --- |');
for (const a of manifest.releaseAssets) lines.push(`| \`${a.name}\` | \`${a.sha256}\` | ${a.url} | ${a.retrieved} | ${a.terms} |`);
if (manifest.withoutTruth.length) lines.push('', `Downloaded but not converted, so no truth for those days: ${manifest.withoutTruth.map((x) => `\`${x.product}\``).join(', ')}.`);
lines.push('', '## Not published', '');
for (const n of manifest.notPublished) lines.push(`- **${n.what}.** ${n.why}`);
lines.push('');
fs.writeFileSync(path.join(out, 'SOURCES.md'), lines.join('\n'));
console.log(`data/e1: ${mb(manifest.totals.trackedBytes)} tracked; ${manifest.releaseAssets.length} release assets, ${mb(manifest.totals.releaseAssetBytes)}, in ${values.assets}`);
