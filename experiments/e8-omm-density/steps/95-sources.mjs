#!/usr/bin/env node
// E8 step 95: E8's inputs under the owner's data policy (2026-10-10): the results
// use every input; only inputs whose terms allow redistribution are committed
// (GCAT, GFZ Kp/ap/F10.7, IERS EOP 20 C04, NOAA SWPC RSGA), each checked against
// the SHA-256 the runs recorded; every other input is cited by source and
// licence. Writes data/e8/MANIFEST.json (every input file of the runs in
// results/e8/manifests, by family, with its SHA-256 and the runs that read it),
// the committed files, and data/e8/SOURCES.md. Element sets and anything derived
// from them per object or per sample appear by name and hash only.
//
//   node .../95-sources.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';

const dir = path.join(repoRoot, 'results/e8/manifests');
const out = path.join(repoRoot, 'data/e8');
const inRepo = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));

// Every input of the published runs, by family.
const files = {};
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.manifest.json')).sort()) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  for (const [family, entries] of Object.entries(m.inputs ?? {})) {
    for (const [file, hash] of Object.entries(entries)) {
      const key = `${family}/${file}`;
      files[key] ??= { family, file, sha256: hash, runs: [] };
      if (files[key].sha256 !== hash) files[key].conflict = true;
      files[key].runs.push(m.run);
    }
  }
}
const recorded = (family, file) => files[`${family}/${file}`]?.sha256 ?? null;
const provenance = (p) => (fs.existsSync(`${p}.provenance.json`) ? JSON.parse(fs.readFileSync(`${p}.provenance.json`, 'utf8')) : null);
fs.mkdirSync(out, { recursive: true });

// ── Committed: redistributable inputs, byte for byte as the runs read them ──
const committed = [];
function commitFile(family, file, src, target, source, licence) {
  if (!recorded(family, file)) return;
  const bytes = fs.readFileSync(src);
  const hash = sha256(bytes);
  if (hash !== recorded(family, file)) throw new Error(`${src}: SHA-256 ${hash} is not the ${recorded(family, file)} the runs read`);
  const gz = zlib.gzipSync(bytes, { level: 9 });
  fs.writeFileSync(path.join(out, target), gz);
  const p = provenance(src);
  committed.push({ file: `data/e8/${target}`, contents: file, source: p?.url ?? source, retrieved: p?.retrieved_utc ?? null, sha256: hash, gzipSha256: sha256(gz), licence: p?.terms ?? licence });
}
commitFile('catalogs', 'gcat', inRepo(config.inputs.gcat.path), 'gcat-satcat-20261008.tsv.gz', config.inputs.gcat.url,
  `CC BY 4.0, J. C. McDowell, General Catalog of Artificial Space Objects (GCAT), updated ${config.inputs.gcat.updated}`);
commitFile('gfz', 'kp', config.inputs.kp, 'Kp_ap_Ap_SN_F107_since_1932.txt.gz', 'https://kp.gfz.de/app/files/Kp_ap_Ap_SN_F107_since_1932.txt',
  'CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001');
commitFile('eop', 'eopc04.1962-now', config.inputs.eopC04, 'eopc04.1962-now.gz', 'https://hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now',
  'IERS: free use with acknowledgement of the IERS Earth Orientation Centre (IERS EOP 20 C04)');
// RSGA: the reports the runs read, verified one by one, in one archive.
const rsgaNames = Object.values(files).filter((f) => f.family === 'rsga').map((f) => f.file).sort();
if (rsgaNames.length) {
  const where = new Map();
  for (const src of config.inputs.rsga) {
    if (src.endsWith('.tar.gz')) where.set(path.basename(src), path.dirname(src));
    else for (const n of fs.readdirSync(src)) where.set(n, src);
  }
  const args = ['-czf', path.join(out, 'swpc-rsga.tar.gz')];
  let lastDir = null;
  for (const n of rsgaNames) {
    const d = where.get(n);
    if (!d) throw new Error(`RSGA ${n}: not among config.inputs.rsga`);
    const hash = sha256(fs.readFileSync(path.join(d, n)));
    if (hash !== recorded('rsga', n)) throw new Error(`RSGA ${n}: SHA-256 differs from the runs'`);
    if (d !== lastDir) { args.push('-C', d); lastDir = d; }
    args.push(n);
  }
  execFileSync('tar', args);
  const p = provenance(path.join(where.get(rsgaNames.at(-1)), rsgaNames.at(-1)));
  committed.push({ file: 'data/e8/swpc-rsga.tar.gz', contents: `${rsgaNames.length} RSGA files (each SHA-256 in MANIFEST.json)`, source: 'ftp://ftp.swpc.noaa.gov/pub/warehouse/ (RSGA)',
    retrieved: p?.retrieved_utc ?? null, sha256: null, gzipSha256: sha256(fs.readFileSync(path.join(out, 'swpc-rsga.tar.gz'))),
    licence: p?.terms ?? 'NOAA/NWS: public domain (weather.gov/disclaimer)' });
}

// ── Cited: every other family, by source and licence ──
const CITED = {
  elementSetFiles: ['Space-Track `gp_history` by creation day (2026) and GP history 1959–2022-11-22 (`Archives2.zip`)', 'Space-Track user agreement: no redistribution', 'terms; element sets are listed by file name and SHA-256 only'],
  elementSetCache: ['E8 step 05 caches of those element sets (runs/cache, local)', 'as the element sets', 'derived from element sets'],
  catalogs: ['Space-Track SATCAT snapshot 2026-10-09 (`satcat`)', 'Space-Track user agreement: no redistribution', 'terms (GCAT, the other catalog, is committed above)'],
  set: ['Space Environment Technologies `SOLFSMY.TXT` and `DTCFILE.TXT` (sol.spacenvironment.net/JB2008/indices, 2026-10-09); Bowman et al. (2008)', 'SET: indices free with a 45-day lag; no licence for redistribution stated', 'terms'],
  densities: ['ESA Swarm `DNSxPOD` and GRACE-FO `DNS1ACC` (swarm-diss.eo.esa.int); CHAMP and GRACE-A densities with HASDM, Licata et al. (2021), Zenodo doi:10.5281/zenodo.4602380', 'ESA Earth Observation data terms (free, with attribution); the Zenodo dataset CC BY 4.0', 'ESA terms; the HASDM dataset (3 GB) is at its DOI'],
  reference: ['Precise orbits: ESA Swarm, Copernicus Sentinel-1 POEORB, ILRS NSGF arcs, IDS/CNES DORIS POE, GFZ ISDC RSO, UCAR COSMIC-2 (doi:10.5065/T353-C093), converted by `analysis/reference-states`', 'ESA EO terms; Copernicus data policy (EU 1159/2013); ILRS, IDS/CNES, GFZ ISDC and UCAR COSMIC terms (each with attribution)', 'terms and size; each file by name and SHA-256'],
  kernel: ['JPL DE440s (`de440s.bsp`, naif.jpl.nasa.gov)', 'JPL/NAIF public archive', '32 MB, at its URL with its SHA-256'],
  destopy: ['DESTOPy (Gondelach and Linares 2020; github.com/pengmun/DESTOPy, MIT) run locally on DESTOPy\'s own objects; its density at each held-out sample', 'code MIT; the densities are derived from element sets', 'per-sample tables derived from element sets'],
  e5: ['E5 calibration bins (`results/e5/calibration`, this repository)', 'MIT (this repository)', 'already in the repository'],
  estimates: ['E8 step 10 fits (by config hash)', 'MIT (this repository)', 'per-object fits from element sets stay local; the corrections and calibration sets are in results/e8'],
  pool: ['E8 step 08 calibration sets (by config hash)', 'MIT (this repository)', 'as results/e8/calibration-sets (NORAD, tier, bin, GCAT prior)'],
};
fs.writeFileSync(path.join(out, 'MANIFEST.json'), `${JSON.stringify({ generated: new Date().toISOString(), committed, files: Object.values(files) }, null, 1)}\n`);
const byFamily = Object.values(files).reduce((a, f) => { (a[f.family] ??= []).push(f); return a; }, {});
const tick = (x) => `\`${x}\``;
const lines = ['# E8 inputs', '',
  'Generated by `experiments/e8-omm-density/steps/95-sources.mjs` from the run manifests in `results/e8/manifests`. E8\'s results use every input below. Under the owner\'s data policy (2026-10-10) only inputs whose terms allow redistribution are committed here, each byte for byte as the runs read it; the rest are cited with their licence. Every input file, with its SHA-256 and the runs that read it, is in [MANIFEST.json](MANIFEST.json).', '',
  '## Committed here', '', '| File | Contents | Source | Retrieved | SHA-256 (uncompressed) | Licence |', '| --- | --- | --- | --- | --- | --- |'];
for (const c of committed) lines.push(`| ${tick(c.file)} | ${c.contents} | ${c.source} | ${c.retrieved ?? '—'} | ${c.sha256 ? tick(c.sha256) : 'per file in MANIFEST.json'} | ${c.licence} |`);
lines.push('', '## Cited, not committed', '', '| Family | Files | Source | Licence | Not committed because |', '| --- | ---: | --- | --- | --- |');
for (const [family, list] of Object.entries(byFamily).sort()) {
  const [source, licence, why] = CITED[family] ?? [family, '', ''];
  if (family === 'gfz' || family === 'eop' || family === 'rsga') continue;
  lines.push(`| ${family} | ${list.length} | ${source} | ${licence} | ${why} |`);
}
const conflicts = Object.values(files).filter((f) => f.conflict);
if (conflicts.length) lines.push('', `Inputs read with different SHA-256 by different runs: ${conflicts.map((f) => tick(`${f.family}/${f.file}`)).join(', ')}.`);
fs.writeFileSync(path.join(out, 'SOURCES.md'), `${lines.join('\n')}\n`);
console.log(`data/e8: ${Object.keys(files).length} input files in ${Object.keys(byFamily).length} families; ${committed.length} committed`);
