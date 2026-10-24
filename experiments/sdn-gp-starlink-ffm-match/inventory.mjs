// Step 3: the per-regime truth inventory, from the local archive only (nothing is fetched). Counts and spans from names
// and headers. Output: results/sdn-gp-starlink-ffm-match/inventory.json and inventory.md.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, results, write } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { OEM, flatbuffers } from './lib/sds.mjs';

const A = config.archive;
const ref = path.join(A, 'reference-states/reference');
const names = fs.readdirSync(ref);
const day = (year, doy) => new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10);
const yymmdd = (s) => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
const span = (list) => { const s = list.filter(Boolean).sort(); return s.length ? `${s[0]} to ${s.at(-1)}` : null; };

function group(prefix, dateOf) {
  const list = names.filter((n) => n.startsWith(prefix));
  return { count: list.length, span: span(list.map(dateOf)) };
}
const rows = [];
const readName = (file) => OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(new Uint8Array(fs.readFileSync(file)))).unpack().EPHEMERIS_DATA_BLOCK[0].OBJECT.OBJECT_NAME;
const add = (regime, source, product, count, spanText, usable, note) => rows.push({ regime, source, product, count, span: spanText, usable, note });

const esa = group('ESA0OPSFIN_', (n) => { const m = /_(\d{4})(\d{3})0000_/.exec(n); return m && day(Number(m[1]), Number(m[2])); });
const firstEsa = names.find((n) => n.startsWith('ESA0OPSFIN_'));
const esaObjects = firstEsa ? fs.readdirSync(path.join(ref, firstEsa)).filter((f) => f.endsWith('.oem')).length : 0;
const igs = group('IGS0OPSFIN_', (n) => { const m = /_(\d{4})(\d{3})0000_/.exec(n); return m && day(Number(m[1]), Number(m[2])); });
add('MEO', 'ESA/ESOC final GNSS orbits (GPS, GLONASS, Galileo)', `daily SP3 as GCRF states, 5 min, ${esaObjects} satellites a day`, esa.count, esa.span, 'truth: arm 1-2 windows', 'No BeiDou or QZSS in these products; the GFZ MGEX set below carries them.');
add('MEO', 'IGS final combination', 'daily SP3 as GCRF states, 15 min', igs.count, igs.span, 'truth', 'Spare; the ESA products cover the same constellations at 5 min.');
for (const t of ['lageos1', 'lageos2', 'etalon1', 'etalon2']) {
  const g = group(`ilrsa.orb.${t}.`, (n) => yymmdd(n.split('.')[3]));
  add('MEO (5,850-19,100 km)', `ILRS combined weekly orbit, ${t}`, 'weekly GCRF states, 2 or 15 min', g.count, g.span, 'truth: arm 1-2 windows', '');
}
for (const t of ['starlette', 'stella', 'ajisai', 'larets', 'westpac', 'lares', 'lares2']) {
  const g = group(`nsgf.orb.${t}.`, (n) => yymmdd(n.split('.')[3]));
  add(t === 'lares2' ? 'MEO (5,900 km)' : 'LEO', `ILRS NSGF analysis-center arc, ${t}`, '4-day GCRF arcs, 3 min', g.count, g.span, 'truth: arm 1-2 windows', t === 'lares2' ? 'LARES-2 orbits near 5,900 km although the harness files it with the low targets.' : '');
}
for (const s of ['A', 'B', 'C']) {
  const g = group(`SW_OPER_SP3${s}COM_2__`, (n) => { const m = /_(\d{4})(\d\d)(\d\d)T/.exec(n); return m && `${m[1]}-${m[2]}-${m[3]}`; });
  add('LEO (about 450 km)', `Swarm ${s} precise orbit (ESA)`, 'daily SP3', g.count, g.span, 'truth, not yet scored here', '');
}
for (const s of ['A', 'C', 'D']) {
  const g = group(`S1${s}_OPER_AUX_POEORB_OPOD_`, (n) => { const m = /_V(\d{4})(\d\d)(\d\d)T/.exec(n); return m && `${m[1]}-${m[2]}-${m[3]}`; });
  add('LEO (about 700 km)', `Sentinel-1${s} precise orbit (Copernicus POD)`, 'POEORB files', g.count, g.span, 'truth, not yet scored here', '');
}
const cosmic = fs.readdirSync(path.join(A, 'reference-states/reference-leo-pod-2')).filter((n) => n.startsWith('leoOrb_'));
add('LEO', 'COSMIC-2 precise orbits (UCAR)', 'leoOrb files', cosmic.length, span(cosmic.map((n) => { const m = /_(\d{4})\.(\d{3})\./.exec(n); return m && day(Number(m[1]), Number(m[2])); })), 'truth, not yet scored here', '');

const issLocal = path.join(A, 'hac/nasa-iss-oem/20261009/ISS.OEM_J2K_EPH.txt');
const meta = (text) => ({ start: /START_TIME\s*=\s*(\S+)/.exec(text)?.[1], stop: /STOP_TIME\s*=\s*(\S+)/.exec(text)?.[1] });
const i1 = meta(fs.readFileSync(issLocal, 'utf8').slice(0, 2000));
add('LEO', 'NASA JSC ISS OEM (file of 2026-10-09)', 'EME2000, 4 min', 1, `${i1.start} to ${i1.stop}`, 'truth: arm 1-2 windows', 'U.S. Government work.');
const issDaily = path.join(A, 'operator-ephemerides/daily/2026-10-23/iss-oem.txt.gz');
if (fs.existsSync(issDaily)) { const i2 = meta(zlib.gunzipSync(fs.readFileSync(issDaily)).toString('utf8').slice(0, 2000)); add('LEO', 'NASA JSC ISS OEM (same-day capture 2026-10-23)', 'EME2000, 4 min', 1, `${i2.start} to ${i2.stop}`, 'truth for the COMSPOC scoring arm', ''); }

const cap = path.join(A, 'operator-capture');
const cycles = fs.readFileSync(path.join(cap, 'cycles.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const complete = cycles.filter((c) => c.status === 'complete' && c.event !== 'progress');
add('LEO', 'SpaceX Starlink forecasts, prospective capture (E13b collector)', 'derived products only: Brouwer mean elements, energy, drag work at 10 min over the first 8 h; no states, no raw files', complete.reduce((s, c) => s + (c.files ?? 0), 0),
  `${cycles.length} cycles logged, ${complete.length} complete: ${span(complete.map((c) => c.startedUtc))}`, 'selection of the population only', 'The truth states of V2 start 2026-10-24 08:00Z.');
const daily = path.join(A, 'operator-ephemerides/daily/2026-10-23/starlink');
if (fs.existsSync(daily)) add('LEO', 'SpaceX Starlink forecasts, same-day local capture 2026-10-23', 'MEME gz, 60 s, 48 h, EME2000', fs.readdirSync(daily).length, '2026-10-23 12:06Z start, 48 h', 'start states for the FFM truth and in-span scoring', 'Raw operator files: read in memory, never copied.');
const sample = path.join(A, 'hac/starlink-ephemerides/sample-20261009');
add('LEO', 'SpaceX Starlink forecasts, sample of 2026-10-09', 'MEME, 60 s, 72 h', fs.readdirSync(sample).filter((n) => n.startsWith('MEME_') && n.endsWith('.txt')).length, '2026-10-09', 'start states (stale)', '');
const derived = path.join(A, 'operator-ephemerides/derived/index.jsonl');
if (fs.existsSync(derived)) add('LEO', 'Operator-derived OMM/OCM fits (E11)', 'derived records', fs.readFileSync(derived, 'utf8').split('\n').filter(Boolean).length, '2026-10-10 to 2026-10-12', 'derived element sets, not truth', '');

const comspoc = path.join(config.store, 'rows/comspoc-catalog.json');
if (fs.existsSync(comspoc)) {
  const c = JSON.parse(fs.readFileSync(comspoc, 'utf8'));
  add('All regimes (scoring only)', 'COMSPOC Spacebook XP sets and SynCoPate trajectories with covariance (local capture 2026-10-23 20:09Z)', `${c.xp} SGP4-XP sets (of ${c.sets}); ${c.syncopateObjects} SynCoPate objects, 12 days at 180 s with 6x6 covariance`, c.xp, `set epochs ${c.epochMin.slice(0, 10)} to ${c.epochMax.slice(0, 10)}, median ${c.epochMedian.slice(0, 10)}`, 'scoring only: never fitted to, never an input, aggregates only', 'Terms: no commercial use, no redistribution, no derivative works. The GNSS and the six LEO-sphere laser-ranged sets are scored against the GFZ rapid and ILRS NSGF products; LAGEOS and Etalon sets wait for combined orbits after 2026-10-03.');
}

// E14's reference set: GFZ multi-GNSS rapid orbits (GEO, IGSO, MEO) and GFZ rapid science orbits of LEO satellites
const e14 = path.join(A, 'e14-covariance-realism/reference');
if (fs.existsSync(e14)) {
  const list = fs.readdirSync(e14);
  const mgexDays = list.filter((n) => n.startsWith('GFZ0MGXRAP_'));
  if (mgexDays.length) {
    const doy = (n) => { const m = /_(\d{4})(\d{3})0000_/.exec(n); return m && day(Number(m[1]), Number(m[2])); };
    const firstDir = path.join(e14, mgexDays[0]);
    const classes = { G: 0, I: 0, M: 0 };
    for (const f of fs.readdirSync(firstDir).filter((x) => x.endsWith('.oem'))) {
      const name = readName(path.join(firstDir, f));
      const c = /(\d)([GIM])$/.exec(name)?.[2];
      if (c && /^(C|J)/.test(name)) classes[c] += 1;
    }
    const total = fs.readdirSync(firstDir).filter((x) => x.endsWith('.oem')).length;
    add('GEO / IGSO / MEO', 'GFZ multi-GNSS rapid orbits GFZ0MGXRAP (MGEX), in the E14 reference set', `daily GCRF states, 5 min, ${total} satellites a day: BeiDou and QZSS satellites by name suffix: ${classes.G} GEO (G), ${classes.I} IGSO (I)`, mgexDays.length, span(mgexDays.map(doy)), 'truth: GEO and IGSO windows (amendment A4)', 'Found after registration; the first inventory looked under reference-states only.');
  }
  for (const id of ['L64', 'L65']) {
    const g = list.filter((n) => n.startsWith(`GFZOP_RSO_${id}_G_`));
    if (g.length) add('LEO (about 490 km)', `GFZ rapid science orbit ${id}`, '5-hour to 14-hour arcs', g.length, span(g.map((n) => { const m = /_(\d{4})(\d\d)(\d\d)_/.exec(n.replace(`GFZOP_RSO_${id}_G_`, '_')); return m && `${m[1]}-${m[2]}-${m[3]}`; })), 'truth, not yet scored here', '');
  }
}

// what does not exist
add('GEO', 'operator ephemerides (SES, Intelsat)', 'none stored locally', 0, null, 'none', 'operator-capture holds Starlink only. Space-Track-hosted operator files were fitted in memory by E4/E11 and not kept; SES, Intelsat, OneWeb and Kuiper exist locally only as CelesTrak SupGP element sets and our OMM fits of them (no ephemerides). Precise GEO truth exists (GFZ MGEX, above).');
add('MEO', 'OneWeb, Kuiper operator ephemerides', 'none stored locally', 0, null, 'none', 'Same as GEO.');

// NAIF spacecraft kernels fetched in the second box (amendment A5): metadata from the DAF summaries and the provenance rows
const missions = path.join(A, 'hac/naif-kernels/spk/missions');
const KERNEL_USE = {
  themis: ['HEO', 'Earth-centered, highly elliptical (THEMIS A, D, E)', 'scored: SGP4 and SGP4-XP, 24 h and 72 h fits'],
  chandra: ['HEO', 'Earth-centered, highly elliptical, 64 h period', 'scored: SGP4 and SGP4-XP, 24 h and 72 h fits'],
  artemis2: ['Cislunar and HEO', 'Orion, Earth-centered J2000 throughout', 'first segment (high-Earth-orbit checkout) scored as one short arc; after the translunar burn: scored as segment sets (section 15)'],
  lro: ['Lunar', 'lunar-centered (Moon), J2000', 'scored: the Moon-centered SDN-GP (section 14)'],
  psyche: ['Interplanetary', 'Sun-centered, SPK type 1 (modified difference arrays)', 'scored from the JPL Horizons vector tables (section 15); type 1 is not readable by files/orbit-products 0.1.4'],
  lucy: ['Interplanetary', 'Sun-centered, SPK type 1, predicted trajectory', 'scored from the JPL Horizons vector tables (section 15); type 1 not readable'],
  juno: ['Interplanetary', 'Jupiter system and cruise, SPK types 1, 2, 3', 'scored from the JPL Horizons vector tables (section 15); type 1 and 2 not readable'],
  tdrss: ['GEO', 'SPK type 10, generated from two-line elements', 'not truth: element-derived'],
};
const kernelRows = [];
if (fs.existsSync(missions)) {
  const { spkSegments, describeSegment } = await import('./lib/spk.mjs');
  for (const mission of fs.readdirSync(missions).sort()) {
    for (const f of fs.readdirSync(path.join(missions, mission)).filter((n) => n.endsWith('.bsp') || n.endsWith('.oem'))) {
      const file = path.join(missions, mission, f);
      const provenance = JSON.parse(fs.readFileSync(`${file}.provenance.json`, 'utf8'));
      const [regime, geometry, use] = KERNEL_USE[mission] ?? ['', '', ''];
      let segments = [], span = null;
      if (f.endsWith('.bsp')) {
        segments = spkSegments(file).map(describeSegment);
        const own = segments.filter((x) => x.target < 0 || mission === 'juno' && x.target === -61); // spacecraft targets (negative NAIF ids)
        const pool = own.length ? own : segments;
        span = `${pool.map((x) => x.start).sort()[0]} to ${pool.map((x) => x.stop).sort().at(-1)}`;
        kernelRows.push({ mission, file: f, url: provenance.url, retrievedUtc: provenance.retrieved_utc, bytes: provenance.bytes, sha256: provenance.sha256, regime, geometry, segments: segments.length,
          targets: [...new Set(pool.map((x) => x.target))], centers: [...new Set(pool.map((x) => x.center))], types: [...new Set(pool.map((x) => x.type))], span, use });
      } else {
        kernelRows.push({ mission, file: f, url: provenance.url, retrievedUtc: provenance.retrieved_utc, bytes: provenance.bytes, sha256: provenance.sha256, regime, geometry: 'CCSDS OEM of the same trajectory', segments: null, targets: [-24], centers: ['Earth'], types: [], span: 'same as the SPK', use: 'cross-check text of the SPK' });
      }
    }
  }
  for (const k of kernelRows) add(k.regime, `NAIF ${k.mission} ${k.file}`, `${k.geometry}; SPK type ${k.types.join('/') || 'n/a'}, ${k.segments ?? ''} segments, ${(k.bytes / 1e6).toFixed(1)} MB`, k.segments ?? 1, k.span, k.use, `Fetched ${k.retrievedUtc.slice(0, 10)} from ${k.url.replace('https://naif.jpl.nasa.gov/pub/naif/', '')}.`);
  write(path.join(results, 'kernels.json'), { note: 'metadata of the NAIF kernels fetched for amendment A5; the kernels stay in the archive', rows: kernelRows });
}

// NAIF
const naif = path.join(A, 'hac/naif-kernels/spk/planets');
for (const [file, spanText] of [['de440s.bsp', '1849-12-26 to 2150-01-22'], ['de430.bsp', '1549-12-31 to 2650-01-25'], ['de421.bsp', '1899-07-29 to 2053-10-09'], ['de405.bsp', '1950-01-01 to 2049-12-31']]) {
  if (fs.existsSync(path.join(naif, file))) add('Cislunar / lunar / interplanetary (bodies)', `NAIF planetary ephemeris ${file}`, 'SPK, planets and Moon', 1, spanText, 'truth for solar-system-bodies, not for SGP4', 'Spans from the archive README.');
}
// A8 (coordinator approvals of 2026-10-24): JPL Horizons vector tables, MAST TESS ephemeris, GFZ rapid GNSS orbits; files as served with provenance rows
const sizeOf = (dir, filter) => { let n = 0, bytes = 0; for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(filter) : []) { n += 1; bytes += fs.statSync(path.join(dir, f)).size; } return { n, bytes }; };
const hz = path.join(A, 'hac/jpl-horizons');
for (const [mission, name, regime, centers] of [['danuri', 'Danuri (KPLO)', 'Lunar', ['moon']], ['capstone', 'CAPSTONE', 'Cislunar (NRHO)', ['moon']], ['artemis1', 'Artemis I (Orion)', 'Cislunar and distant retrograde', ['earth', 'moon']],
  ['psyche', 'Psyche (cruise)', 'Interplanetary (Sun-centered)', ['sun']], ['lucy-rec', 'Lucy (reconstruction through 2025-09-08)', 'Interplanetary (Sun-centered)', ['sun']], ['lucy-ref', 'Lucy (flight project reference trajectory, a planning prediction)', 'Interplanetary (Sun-centered)', ['sun']],
  ['juno-cruise', 'Juno (cruise, 2012-10 to 2013-09)', 'Interplanetary (Sun-centered)', ['sun']], ['juno-jupiter', 'Juno (Jupiter orbits)', 'Interplanetary (Jupiter-centered)', ['jupiter']]]) {
  for (const center of centers) {
    const dir = path.join(hz, mission, center);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort() : [];
    if (!files.length) continue;
    const prov = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, `${f}.provenance.json`), 'utf8')));
    const stamp = (f) => { const m = /_(\d{8})T(\d{4})_(\d{8})T(\d{4})_/.exec(f); return m ? [`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`, `${m[3].slice(0, 4)}-${m[3].slice(4, 6)}-${m[3].slice(6, 8)}`] : [null, null]; };
    add(regime, `JPL Horizons API vector tables, ${name}, ${center}-centered`, `ICRF equatorial axes, TDB, km and km/s; ${prov[0].targetSource ?? ''}; ${files.length} responses`, prov.reduce((a, r) => a + (r.rows ?? 0), 0), `${stamp(files[0])[0]} to ${stamp(files.at(-1))[1]}`, 'truth for the windows prepared for SDN-GP', 'Public NASA/JPL data (registry id jpl-horizons); stored as served, results only.');
  }
}
const tess = sizeOf(path.join(A, 'hac/mast-tess/models'), (f) => f.endsWith('.bsp'));
if (tess.n) add('HEO (13.7 day)', 'STScI MAST: TESS definitive spacecraft ephemeris (TESS_EPH_DEF_*.bsp)', `SPK type 9 (Lagrange, degree 7), Earth-centered J2000, 60 s; ${(tess.bytes / 1e6).toFixed(0)} MB`, tess.n, '2026-06-29 to 2026-09-17 (doy 194 to 260 of 2026)', 'truth: SGP4 and SGP4-XP windows (24 h and 72 h fits)', 'Public NASA mission data (registry id stsci-mast-tess); MAST holds no definitive file after 2026-09-17.');
const gfzDir = path.join(A, 'hac/gfz-gnss-rapid/cddis/gnss/products');
if (fs.existsSync(gfzDir)) {
  const files = fs.readdirSync(gfzDir).flatMap((w) => fs.readdirSync(path.join(gfzDir, w)).filter((f) => f.endsWith('.SP3.gz')).map((f) => ({ f, w })));
  const dayOf = ({ f }) => { const m = /_(\d{4})(\d{3})0000_/.exec(f); return m && day(Number(m[1]), Number(m[2])); };
  for (const prefix of ['GFZ0OPSRAP_', 'GFZ0MGXRAP_']) {
    const list = files.filter((x) => x.f.startsWith(prefix));
    if (list.length) add('MEO / IGSO / GEO', `GFZ rapid GNSS orbits ${prefix.replace('_', '')} (${prefix === 'GFZ0OPSRAP_' ? 'GPS, GLONASS, Galileo; CC BY 4.0' : 'BeiDou, QZSS; IGS MGEX terms'})`, 'daily SP3, 5 min, from NASA CDDIS (GFZ file server unreachable 2026-10-24)', list.length, span(list.map(dayOf)), 'truth: arm 1-2 windows and the COMSPOC GNSS scoring', 'Reference states under <store>/gnss-rapid/; the last three days use Bulletin A predicted Earth orientation (amendment A8c).');
  }
}
// ILRS orbit products fetched from CDDIS (amendments A9 and A9b): NSGF rapid orbits of the LEO spheres, combined weekly orbits of LAGEOS and Etalon
const ilrs = path.join(A, 'hac/ilrs-cddis/cddis/slr/products/orbits');
if (fs.existsSync(ilrs)) {
  const dayDirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => /^\d{6}$/.test(d)).sort() : []);
  for (const sat of fs.existsSync(path.join(ilrs, 'rapid')) ? fs.readdirSync(path.join(ilrs, 'rapid')).sort() : []) {
    const days = dayDirs(path.join(ilrs, 'rapid', sat, '2026'));
    if (days.length) add(sat === 'lares2' ? 'MEO (5,900 km)' : 'LEO', `ILRS NSGF rapid orbit, ${sat}, via NASA CDDIS`, 'daily SP3-c, 4- to 7-day arcs, 3 min, ITRF', days.length, `${yymmdd(days[0])} to ${yymmdd(days.at(-1))} (file dates)`, 'truth: current SLR rows and the COMSPOC laser-ranged scoring', 'Reference states under <store>/slr-ref/ (slr-convert.mjs); registry id ilrs-cddis; stored as served with provenance rows.');
  }
  for (const sat of fs.existsSync(path.join(ilrs, 'TRF')) ? fs.readdirSync(path.join(ilrs, 'TRF')).sort() : []) {
    const weeks = dayDirs(path.join(ilrs, 'TRF', sat, '2026'));
    if (weeks.length) add('MEO (5,850-19,100 km)', `ILRS combined weekly orbit, ${sat}, via NASA CDDIS`, 'weekly SP3-c, 2 or 15 min', weeks.length, `${yymmdd(weeks[0])} to ${yymmdd(weeks.at(-1))} (file dates)`, 'truth: current MEO SLR rows (positions end 2026-10-03)', 'The files of week 260926 hold no positions and are skipped by the converter.');
  }
}
add('Cislunar / HEO', 'TESS, CAPSTONE, Artemis I, Danuri', 'not hosted by NAIF', 0, null, 'none', 'NAIF has no TESS, CAPSTONE, Artemis I or Danuri kernels (checked 2026-10-23); with the approvals of 2026-10-24 they come from STScI MAST (TESS) and JPL Horizons (the other three), listed above. Substituted: THEMIS and Chandra for TESS, Artemis II for Artemis I.');
let modules = null;
try { modules = modulesRoot(); } catch { /* checkout absent */ }
if (modules) {
  const horizons = path.join(modules, 'propagator/ffm/tests/evidence/horizons/raw');
  if (fs.existsSync(path.join(horizons, 'index.json'))) {
    const index = JSON.parse(fs.readFileSync(path.join(horizons, 'index.json'), 'utf8'));
    const epochs = index.epochsUtc ?? [];
    add('Cislunar / L2', 'JPL Horizons evidence in modules propagator/ffm (JWST, Moon, Sun, Venus, Jupiter)', 'geocentric ICRF vectors, hourly', epochs.length, span(epochs.map((e) => e.slice(0, 10))), 'fixture truth: 50 epochs in two 25-hour windows', 'Test evidence in the modules repository, not the archive.');
  }
  const fixtures = path.join(A, 'v2-operator-seeded/runtime');
  add('Lunar / Mars', 'SPK fixtures in the modules repository (LADEE segment, MSL and InSight landers)', 'type 13 and type 8 test kernels', 3, 'short test arcs', 'fixtures only', 'Not truth sets; they exercise the SPK reader.');
}
add('Interplanetary / small bodies', 'JPL SBDB, MPC element catalogs', 'none', 0, null, 'none', 'No small-body element catalog is archived.');

const out = { generatedFrom: 'local archive listing and headers; nothing fetched', archive: A, rows };
write(path.join(results, 'inventory.json'), out);
const md = ['| Regime | Source | Product | Count | Span | Use | Note |', '| --- | --- | --- | --: | --- | --- | --- |', ...rows.map((r) => `| ${r.regime} | ${r.source} | ${r.product} | ${r.count} | ${r.span ?? ''} | ${r.usable} | ${r.note} |`)].join('\n');
fs.writeFileSync(path.join(results, 'inventory.md'), `${md}\n`);
console.log(`${rows.length} rows`);
