#!/usr/bin/env node
// E8 step 95: E8's inputs under the owner's data policy (2026-10-10): the results
// use every input; only sources that data/licenses.json marks reproducible are
// copied into the repository. Writes data/e8/MANIFEST.json (every input file of
// the runs in results/e8/manifests, by family and licence source, with its
// SHA-256 and the runs that read it), data/e8/SOURCES.md, and the one copy E8
// adds: GCAT's catalogue, checked against the SHA-256 the runs recorded. The GFZ
// indices, IERS EOP 20 C04 and NOAA SWPC RSGA files E8 read are already
// reproduced under data/e7; this step checks they are the same bytes. Element
// sets and anything derived from them per object or per sample appear by name
// and hash only.
//
//   node .../95-sources.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { isReproducible, licenseSection, source } from '../../../harness/data-licenses.mjs';
import { config } from '../common.mjs';

const dir = path.join(repoRoot, 'results/e8/manifests');
const out = path.join(repoRoot, 'data/e8');
const inRepo = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));

// The licence source of each input file (data/licenses.json ids; `null`: this repository's own runs).
const UNREGISTERED = {
  'ids-doris': ['IDS/CNES DORIS precise orbits (SSALTO POE: CryoSat-2, SARAL, SWOT, Sentinel-3A)', 'No licence text found on ids-doris.org; citation of IDS and CNES requested', 'Cite the International DORIS Service and CNES.'],
  'gfz-isdc-rso': ['GFZ ISDC Rapid Science Orbits (GRACE-FO)', 'No licence text found on isdc.gfz.de; citation of GFZ ISDC requested', 'Cite the GFZ Information System and Data Center.'],
  'ucar-cosmic2': ['UCAR COSMIC-2 near-real-time LEO orbits (leoOrb)', '© UCAR; citation requested', 'UCAR COSMIC Program (2019) COSMIC-2 Data Products, doi:10.5065/T353-C093.'],
  destopy: ['DESTOPy (Gondelach and Linares 2020; github.com/pengmun/DESTOPy), run locally; its densities at the held-out samples', 'Code: MIT (Copyright (c) 2023 Peng Mun Siew); its densities derive from element sets', 'Gondelach, D.J. and Linares, R. (2020), Space Weather 18, e2019SW002356; DESTOPy, P. M. Siew, MIT.'],
};
function sourceOf(family, file) {
  switch (family) {
    case 'elementSetFiles': case 'elementSetCache': return 'space-track';
    case 'catalogs': return file === 'gcat' ? 'gcat' : 'space-track';
    case 'set': return 'set-jb2008';
    case 'gfz': return 'gfz-kp';
    case 'rsga': return 'noaa-swpc';
    case 'eop': return 'iers';
    case 'kernel': return 'jpl-de440';
    case 'densities': return /^(CHAMP|GRACE)/.test(file) ? 'zenodo-licata-hasdm' : 'esa-earth-observation';
    case 'reference': {
      const n = file.split('/')[0];
      if (/^nsgf\.orb\./.test(n)) return 'ilrs-nsgf';
      if (/^ilrsa\.orb\./.test(n)) return 'ilrs';
      if (/^(SW_OPER_|GF_OPER_)/.test(n)) return 'esa-earth-observation';
      if (/^S1[A-D]_OPER_AUX_POEORB/.test(n)) return 'copernicus-sentinel';
      if (/^leoOrb/.test(n)) return 'ucar-cosmic2';
      if (/^ssa/.test(n)) return 'ids-doris';
      if (/^GFZOP_RSO/.test(n)) return 'gfz-isdc-rso';
      throw new Error(`reference ${file}: no licence source`);
    }
    case 'destopy': return 'destopy';
    case 'e5': case 'estimates': case 'pool': return null;
    default: throw new Error(`input family ${family}: no licence source`);
  }
}

// Every input of the published runs.
const files = {};
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.manifest.json')).sort()) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  for (const [family, entries] of Object.entries(m.inputs ?? {})) {
    for (const [file, hash] of Object.entries(entries)) {
      const key = `${family}/${file}`;
      files[key] ??= { family, file, source: sourceOf(family, file), sha256: hash, runs: [] };
      if (files[key].sha256 !== hash) files[key].conflict = true;
      files[key].runs.push(m.run);
    }
  }
}
const recorded = (family, file) => files[`${family}/${file}`]?.sha256 ?? null;
fs.mkdirSync(out, { recursive: true });
const tick = (x) => `\`${x}\``;

// ── Copied here: GCAT, the one reproducible input not yet in the repository ──
const copies = [];
if (recorded('catalogs', 'gcat')) {
  if (!isReproducible('gcat')) throw new Error('data/licenses.json does not let GCAT be reproduced');
  const bytes = fs.readFileSync(inRepo(config.inputs.gcat.path));
  if (sha256(bytes) !== recorded('catalogs', 'gcat')) throw new Error('GCAT: not the bytes the runs read');
  const gz = zlib.gzipSync(bytes, { level: 9 });
  fs.writeFileSync(path.join(out, 'gcat-satcat-20261008.tsv.gz'), gz);
  copies.push({ file: 'data/e8/gcat-satcat-20261008.tsv.gz', source: 'gcat', contents: `GCAT \`satcat.tsv\` (updated ${config.inputs.gcat.updated})`,
    url: config.inputs.gcat.url, sha256: recorded('catalogs', 'gcat'), gzipSha256: sha256(gz) });
}
// ── Already reproduced under data/e7: the same bytes ──
const gunzipHash = (p) => sha256(zlib.gunzipSync(fs.readFileSync(path.join(repoRoot, p))));
const elsewhere = [];
for (const [family, file, at] of [['gfz', 'kp', 'data/e7/Kp_ap_Ap_SN_F107_since_1932.txt.gz'], ['eop', 'eopc04.1962-now', 'data/e7/eopc04.1962-now.gz']]) {
  if (!recorded(family, file)) continue;
  if (gunzipHash(at) !== recorded(family, file)) throw new Error(`${at}: not the bytes E8 read as ${family}/${file}`);
  elsewhere.push({ file: at, source: sourceOf(family, file), contents: file === 'kp' ? 'Kp_ap_Ap_SN_F107_since_1932.txt' : file, sha256: recorded(family, file) });
}
const rsgaNames = Object.values(files).filter((f) => f.family === 'rsga').map((f) => f.file).sort();
if (rsgaNames.length) {
  const bundle = path.join(repoRoot, 'data/e7/swpc-rsga.tar.gz');
  const members = execFileSync('tar', ['-tzf', bundle], { encoding: 'utf8' }).split('\n').filter((n) => n && !n.endsWith('/'));
  for (const n of rsgaNames) {
    const member = members.find((m) => path.basename(m) === n);
    if (!member) throw new Error(`RSGA ${n}: not in data/e7/swpc-rsga.tar.gz`);
    if (sha256(execFileSync('tar', ['-xzOf', bundle, member], { maxBuffer: 1 << 26 })) !== recorded('rsga', n)) throw new Error(`RSGA ${n}: not the bytes E8 read`);
  }
  elsewhere.push({ file: 'data/e7/swpc-rsga.tar.gz', source: 'noaa-swpc', contents: `${rsgaNames.length} RSGA files E8 read (each SHA-256 in MANIFEST.json)`, sha256: null });
}

// ── Manifest and SOURCES.md ──
fs.writeFileSync(path.join(out, 'MANIFEST.json'), `${JSON.stringify({ generated: new Date().toISOString(), copies, reproducedElsewhere: elsewhere, files: Object.values(files) }, null, 1)}\n`);
const bySource = Object.values(files).reduce((a, f) => { (a[f.source ?? 'this repository'] ??= []).push(f); return a; }, {});
const registered = Object.keys(bySource).filter((id) => id !== 'this repository' && !UNREGISTERED[id]).sort();
const lines = ['# E8 inputs', '',
  'Generated by `experiments/e8-omm-density/steps/95-sources.mjs` from the run manifests in `results/e8/manifests`. E8\'s results use every input below, whatever its licence. Files are copied into this repository only where [data/licenses.json](../licenses.json) marks the source reproducible; every input file, with its licence source, SHA-256 and the runs that read it, is in [MANIFEST.json](MANIFEST.json). Element sets and anything derived from them per object or per sample are listed by name and hash only.', '',
  '## In this repository', '', '| File | Contents | Source | SHA-256 (uncompressed) |', '| --- | --- | --- | --- |'];
for (const c of copies) lines.push(`| ${tick(c.file)} | ${c.contents}, from ${c.url} | ${source(c.source).name} | ${tick(c.sha256)} |`);
for (const c of elsewhere) lines.push(`| ${tick(c.file)} (E7's copy, the same bytes) | ${c.contents} | ${source(c.source).name} | ${c.sha256 ? tick(c.sha256) : 'per file in MANIFEST.json'} |`);
lines.push('', '## Every input, by source', '', '| Source | Files | Reproduced | Families |', '| --- | ---: | --- | --- |');
for (const [id, list] of Object.entries(bySource).sort()) {
  const fams = [...new Set(list.map((f) => f.family))].join(', ');
  let verdict;
  if (id === 'this repository') verdict = 'this repository (MIT): E5\'s calibration and E8\'s own runs; E8\'s per-object fits stay local';
  else if (UNREGISTERED[id]) verdict = `No: cited only (${UNREGISTERED[id][1]}; not yet assessed in data/licenses.json)`;
  else verdict = { yes: 'Yes, with attribution', 'non-commercial': 'Yes, with attribution, for non-commercial use only', 'share-alike': 'Yes, with attribution (share-alike)', no: 'No: cited only' }[source(id).reproduce];
  const where = id === 'gcat' || elsewhere.some((c) => c.source === id) ? '' : (id === 'this repository' || UNREGISTERED[id] || source(id).reproduce === 'no' ? '' : ' (cited by URL and SHA-256 here)');
  lines.push(`| ${UNREGISTERED[id]?.[0] ?? (id === 'this repository' ? 'This repository' : source(id).name)} | ${list.length} | ${verdict}${where} | ${fams} |`);
}
lines.push('', ...licenseSection(registered, 'data/e8'));
const unreg = Object.keys(bySource).filter((id) => UNREGISTERED[id]);
if (unreg.length) {
  lines.push('', '### Sources not yet in data/licenses.json', '', 'Cited only until the licence audit assesses them.', '', '| Source | Terms found | Attribution |', '| --- | --- | --- |');
  for (const id of unreg) lines.push(`| ${UNREGISTERED[id][0]} | ${UNREGISTERED[id][1]} | ${UNREGISTERED[id][2]} |`);
}
const conflicts = Object.values(files).filter((f) => f.conflict);
if (conflicts.length) lines.push('', `Inputs read with different SHA-256 by different runs: ${conflicts.map((f) => tick(`${f.family}/${f.file}`)).join(', ')}.`);
fs.writeFileSync(path.join(out, 'SOURCES.md'), `${lines.join('\n')}\n`);
console.log(`data/e8: ${Object.keys(files).length} input files from ${Object.keys(bySource).length} sources; ${copies.length} copied, ${elsewhere.length} already in data/e7`);
