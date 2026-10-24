// Amendment A9: ILRS orbit products from CDDIS (fetch-slr.mjs) -> GCRF reference states ($OEM per satellite), under <store>/slr-ref/reference/<product>/.
//   node experiments/sdn-gp-starlink-ffm-match/slr-convert.mjs
// NSGF daily rapid orbits (4-day arcs; the arc of file F ends the day before F) take their stated sigma from the overlap with the neighboring
// day's arc, as the modules' converter does for its EDC copies; the ILRS combined weekly orbits state none, so a sigma of 0.02 m is assumed and
// said so in the record (G1 scores positions only). The Earth rotation is IERS finals2000A with the Bulletin A rows flagged observed up to MJD 61340
// (2026-10-27, A8c extended): under 0.1 m for these orbits. Epoch conversion, frames and velocities are the modules'. The recorded source of every
// product is the CDDIS URL it was fetched from.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store, sha256 } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openConverter, writeReference, sp3Positions, overlapRms } from './lib/refstates.mjs';

frozen();
const SRC = path.join(config.archive, 'hac/ilrs-cddis/cddis/slr/products/orbits');
const OUT = path.join(store, 'slr-ref');
const RAPID = {
  ajisai: { norad: 16908, objectId: '1986-061A', name: 'AJISAI' }, starlette: { norad: 7646, objectId: '1975-010A', name: 'STARLETTE' },
  stella: { norad: 22824, objectId: '1993-061B', name: 'STELLA' }, larets: { norad: 27944, objectId: '2003-042F', name: 'LARETS' },
  westpac: { norad: 25398, objectId: '1998-043E', name: 'WESTPAC' }, lares: { norad: 38077, objectId: '2012-006A', name: 'LARES' },
  lares2: { norad: 53105, objectId: '2022-080A', name: 'LARES-2' },
};
const WEEKLY = {
  lageos1: { norad: 8820, objectId: '1976-039A', name: 'LAGEOS 1' }, lageos2: { norad: 22195, objectId: '1992-070B', name: 'LAGEOS 2' },
  etalon1: { norad: 19751, objectId: '1989-001C', name: 'ETALON 1' }, etalon2: { norad: 20026, objectId: '1989-039C', name: 'ETALON 2' },
};
const ASSUMED_SIGMA_M = 0.02;
const URL_BASE = 'https://cddis.nasa.gov/archive/slr/products/orbits/';

// Earth orientation: the newest archived finals file, Bulletin A rows to MJD 61340 flagged observed (recorded)
fs.mkdirSync(path.join(OUT, 'products'), { recursive: true });
const eopDir = path.join(config.archive, 'hac/iers-eop/2026');
const newest = fs.readdirSync(eopDir).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort().at(-1);
const finalsSource = path.join(eopDir, newest, 'finals.daily.iau2000.txt');
const LAST_MJD = 61340;
let relabeled = 0;
const seeded = fs.readFileSync(finalsSource, 'latin1').split('\n').map((l) => {
  const mjd = Number(l.slice(7, 15));
  if (l.length > 58 && mjd > 61333 && mjd <= LAST_MJD && l[16] === 'P' && l[57] === 'P') { relabeled += 1; return `${l.slice(0, 16)}I${l.slice(17, 57)}I${l.slice(58)}`; }
  return l;
}).join('\n');
const finalsFile = path.join(OUT, 'products/finals2000A.all');
fs.writeFileSync(finalsFile, seeded, 'latin1');
fs.writeFileSync(`${finalsFile}.provenance.json`, JSON.stringify({ source: finalsSource, sourceSha256: sha256(fs.readFileSync(finalsSource)), change: `MJD 61334 to ${LAST_MJD}: polar motion and UT1-UTC flags P -> I (${relabeled} rows)`, reason: 'IERS data center refused requests from 2026-10-22; Bulletin A predictions stand in for the last days (A8c, extended to MJD 61340 by A9); under 0.1 m for these orbits', createdUtc: new Date().toISOString() }, null, 2) + '\n');

const conv = await openConverter(modulesRoot(), { finalsFile });
const readGz = (file) => zlib.gunzipSync(fs.readFileSync(file)).toString('latin1');
const provRow = (file) => JSON.parse(fs.readFileSync(`${file}.provenance.json`, 'utf8'));
let done = 0, failed = 0;
const record = (key, objects, provenance) => { writeReference(path.join(OUT, 'reference'), key, objects, provenance); done += 1; };

// NSGF daily rapid orbits
for (const [sat, identity] of Object.entries(RAPID)) {
  const dir = path.join(SRC, 'rapid', sat, '2026');
  if (!fs.existsSync(dir)) continue;
  const days = fs.readdirSync(dir).filter((d) => /^\d{6}$/.test(d)).sort();
  const fileOf = (d) => path.join(dir, d, `nsgf.orb.${sat}.${d}.v000.sp3.gz`);
  const dayMs = (d) => Date.UTC(2000 + Number(d.slice(0, 2)), Number(d.slice(2, 4)) - 1, Number(d.slice(4, 6)));
  for (const d of days) {
    const file = fileOf(d);
    if (!fs.existsSync(file)) continue;
    const gz = fs.readFileSync(file), text = zlib.gunzipSync(gz).toString('latin1');
    if (!text.startsWith('#cV')) { console.error(`${sat} ${d}: not SP3-c`); failed += 1; continue; }
    // sigma: the overlap with the next day's arc, else with the previous day's
    const neighbor = [days.find((x) => dayMs(x) === dayMs(d) + 86400000), days.find((x) => dayMs(x) === dayMs(d) - 86400000)].filter((x) => x && fs.existsSync(fileOf(x)))[0];
    if (!neighbor) { console.error(`${sat} ${d}: no neighboring arc to state a sigma`); failed += 1; continue; }
    const { sigma, epochs } = overlapRms(sp3Positions(text), sp3Positions(readGz(fileOf(neighbor))));
    if (epochs < 100) { console.error(`${sat} ${d}: overlap with ${neighbor} too short (${epochs} epochs)`); failed += 1; continue; }
    const id = text.match(/^\+\s+1\s+(\S{3})/m)?.[1];
    const name = path.basename(file);
    const url = `${URL_BASE}rapid/${sat}/2026/${d}/${name}`;
    const basis = `the per-axis RMS (${sigma.toFixed(4)} m) of this arc's overlap with the ${neighbor > d ? 'next' : 'previous'} day's arc (${epochs} epochs)`;
    const product = `${name} (SHA-256 ${sha256(zlib.gunzipSync(gz))}, coordinate system "ECF" read as ITRF per the file's comment)`;
    const out = await conv.convert(Buffer.from(text.replace(/^(#cV.{43})  ECF/, '$1ITRF ')), { product, source: url, statedSigmaM: sigma, statedSigmaBasis: basis, satellites: { [id]: identity } });
    if (out.error) { console.error(`${sat} ${d}: ${out.error}`); failed += 1; continue; }
    record(name.replace('.sp3.gz', ''), out, { product: name, url, sha256: sha256(gz), route: 'NASA CDDIS', statedSigmaM: sigma, statedSigmaBasis: basis, provenanceRow: provRow(file).retrieved_utc, eop: finalsFile });
  }
}
// ILRS combined weekly orbits
for (const [sat, identity] of Object.entries(WEEKLY)) {
  const dir = path.join(SRC, 'TRF', sat, '2026');
  if (!fs.existsSync(dir)) continue;
  for (const week of fs.readdirSync(dir).filter((d) => /^\d{6}$/.test(d)).sort()) {
    const file = path.join(dir, week, `ilrsa.orb.${sat}.${week}.v80.sp3.gz`);
    if (!fs.existsSync(file)) continue;
    const gz = fs.readFileSync(file), text = zlib.gunzipSync(gz).toString('latin1').replace(/^%\/\*/gm, '/* ');
    if (!sp3Positions(text).size) { console.error(`${sat} ${week}: the combined file has no positions`); failed += 1; continue; }
    const id = text.match(/^\+\s+1\s+(\S{3})/m)?.[1];
    const name = path.basename(file);
    const url = `${URL_BASE}TRF/${sat}/2026/${week}/${name}`;
    const basis = `assumed ${ASSUMED_SIGMA_M} m per axis: the combined weekly orbit states no uncertainty and no analysis-center spread was computed here; G1 scores positions only`;
    const product = `${name} (SHA-256 ${sha256(zlib.gunzipSync(gz))}, comment prefix "%/*" read as "/*")`;
    const out = await conv.convert(Buffer.from(text), { product, source: url, statedSigmaM: ASSUMED_SIGMA_M, statedSigmaBasis: basis, satellites: { [id]: identity } });
    if (out.error) { console.error(`${sat} ${week}: ${out.error}`); failed += 1; continue; }
    record(name.replace('.sp3.gz', ''), out, { product: name, url, sha256: sha256(gz), route: 'NASA CDDIS', statedSigmaM: ASSUMED_SIGMA_M, statedSigmaBasis: basis, eop: finalsFile });
  }
}
await conv.destroy();
console.error(`${done} products converted, ${failed} skipped`);
process.exit(0);
