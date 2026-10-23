// Step 3: the per-regime truth inventory, from the local archive only (nothing is fetched). Counts and spans from names
// and headers. Output: results/sdn-gp-starlink-ffm-match/inventory.json and inventory.md.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, results, write } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';

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
const add = (regime, source, product, count, spanText, usable, note) => rows.push({ regime, source, product, count, span: spanText, usable, note });

const esa = group('ESA0OPSFIN_', (n) => { const m = /_(\d{4})(\d{3})0000_/.exec(n); return m && day(Number(m[1]), Number(m[2])); });
const firstEsa = names.find((n) => n.startsWith('ESA0OPSFIN_'));
const esaObjects = firstEsa ? fs.readdirSync(path.join(ref, firstEsa)).filter((f) => f.endsWith('.oem')).length : 0;
const igs = group('IGS0OPSFIN_', (n) => { const m = /_(\d{4})(\d{3})0000_/.exec(n); return m && day(Number(m[1]), Number(m[2])); });
add('MEO', 'ESA/ESOC final GNSS orbits (GPS, GLONASS, Galileo)', `daily SP3 as GCRF states, 5 min, ${esaObjects} satellites a day`, esa.count, esa.span, 'truth: arm 1-2 windows', 'No BeiDou in these products (no GEO or IGSO satellites).');
add('MEO', 'IGS final combination', 'daily SP3 as GCRF states, 15 min', igs.count, igs.span, 'truth', 'Spare; the ESA products cover the same constellations at 5 min.');
for (const t of ['lageos1', 'lageos2', 'etalon1', 'etalon2']) {
  const g = group(`ilrsa.orb.${t}.`, (n) => yymmdd(n.split('.')[3]));
  add('MEO (5,850-19,100 km)', `ILRS combined weekly orbit, ${t}`, 'weekly GCRF states, 2 or 15 min', g.count, g.span, 'truth: arm 1-2 windows', '');
}
for (const t of ['starlette', 'stella', 'ajisai', 'larets', 'westpac', 'lares', 'lares2']) {
  const g = group(`nsgf.orb.${t}.`, (n) => yymmdd(n.split('.')[3]));
  add(t === 'lares2' ? 'MEO (5,900 km)' : 'LEO', `ILRS NSGF analysis-centre arc, ${t}`, '4-day GCRF arcs, 3 min', g.count, g.span, 'truth: arm 1-2 windows', t === 'lares2' ? 'LARES-2 orbits near 5,900 km although the harness files it with the low targets.' : '');
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
add('LEO', 'SpaceX Starlink forecasts, sample of 2026-10-09', 'MEME, 60 s, 72 h', fs.readdirSync(sample).filter((n) => n.startsWith('MEME_')).length, '2026-10-09', 'start states (stale)', '');
const derived = path.join(A, 'operator-ephemerides/derived/index.jsonl');
if (fs.existsSync(derived)) add('LEO', 'Operator-derived OMM/OCM fits (E11)', 'derived records', fs.readFileSync(derived, 'utf8').split('\n').filter(Boolean).length, '2026-10-10 to 2026-10-12', 'derived element sets, not truth', '');

const comspoc = path.join(config.store, 'rows/comspoc-catalog.json');
if (fs.existsSync(comspoc)) {
  const c = JSON.parse(fs.readFileSync(comspoc, 'utf8'));
  add('All regimes (scoring only)', 'COMSPOC Spacebook XP sets and SynCoPate trajectories with covariance (local capture 2026-10-23 20:09Z)', `${c.xp} SGP4-XP sets (of ${c.sets}); ${c.syncopateObjects} SynCoPate objects, 12 days at 180 s with 6x6 covariance`, c.xp, `set epochs ${c.epochMin.slice(0, 10)} to ${c.epochMax.slice(0, 10)}, median ${c.epochMedian.slice(0, 10)}`, 'scoring only: never fitted to, never an input, aggregates only', 'Terms: no commercial use, no redistribution, no derivative works. GPS and laser-ranged objects wait for the products of 2026-10-23 and later.');
}

// what does not exist
add('GEO', 'operator ephemerides (SES, Intelsat)', 'none stored locally', 0, null, 'none', 'Space-Track-hosted operator files were fitted in memory by E4/E11 and not kept.');
add('GEO / IGSO', 'precise orbits (BeiDou, QZSS)', 'none', 0, null, 'none', 'The ESA and IGS finals here carry GPS, GLONASS and Galileo only.');
add('MEO', 'OneWeb, Kuiper operator ephemerides', 'none stored locally', 0, null, 'none', 'Same as GEO.');
add('HEO', 'operator or precise orbits (Molniya, Tundra, TESS, IBEX)', 'none', 0, null, 'none', '');

// NAIF
const naif = path.join(A, 'hac/naif-kernels/spk/planets');
for (const [file, spanText] of [['de440s.bsp', '1849-12-26 to 2150-01-22'], ['de430.bsp', '1549-12-31 to 2650-01-25'], ['de421.bsp', '1899-07-29 to 2053-10-09'], ['de405.bsp', '1950-01-01 to 2049-12-31']]) {
  if (fs.existsSync(path.join(naif, file))) add('Cislunar / lunar / interplanetary (bodies)', `NAIF planetary ephemeris ${file}`, 'SPK, planets and Moon', 1, spanText, 'truth for solar-system-bodies, not for SGP4', 'Spans from the archive README.');
}
add('Cislunar / lunar / interplanetary (spacecraft)', 'NAIF spacecraft SPK (LRO, CAPSTONE, Artemis, Danuri, cruise arcs)', 'none in the archive', 0, null, 'none', 'The archive holds planetary kernels only. To fetch next: LRO, CAPSTONE, Danuri and Artemis I kernels from NAIF, JPL Horizons vectors for cruise arcs.');
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
