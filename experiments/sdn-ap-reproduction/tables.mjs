// What build.mjs writes into docs/sdn-ap-reproduction.md: each table of the SDN-AP paper's section 12 and its appendix (the commands, as the experiments'
// manifests record them, and the inputs each reads), every input (its local files, hashed when the archive is present, or the digest an experiment's
// manifest recorded), and the accounts the fetches need. Data only.
import fs from 'node:fs';
import path from 'node:path';

const ARCHIVE = process.env.SDN_ARCHIVE ?? '/opt/data/sdn-archive';
const G1_STORE = path.join(ARCHIVE, 'sdn-gp-starlink-ffm-match');
const REF = path.join(ARCHIVE, 'reference-states');
const E14 = path.join(ARCHIVE, 'e14-covariance-realism');
const ls = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
// the product file a reference-state directory was made from: <products>/<directory>.<sp3 extension>
const productsOf = (root, dirs) => { const products = ls(path.join(root, 'products')); return dirs.map((d) => products.find((p) => p.startsWith(`${d}.`))).filter(Boolean).map((p) => path.join(root, 'products', p)); };
const days = (prefix, year, first, n, suffix) => Array.from({ length: n }, (_, k) => `${prefix}${year}${String(first + k).padStart(3, '0')}${suffix}`);
const firstOf = (root, prefix, n) => ls(path.join(root, 'reference')).filter((d) => d.startsWith(prefix)).slice(0, n);
const G1 = 'experiments/sdn-gp-starlink-ffm-match';
const B1 = 'experiments/sdn-ap-baselines';
const cmd = (text, script, repo) => ({ text, script, repo }); // repo: 'modules' for a command run in the modules checkout

// Each input: name, terms (a data/licenses.json id, or { text, url, reproduce } where the registry has none), fetch, and either files() (hashed locally) or recorded().
export const SOURCES = {
  sgp4prop: { name: 'US Space Force Sgp4Prop 9.9 package (Sgp4Prop_v9.9.zip), the black-box reference', license: { text: 'US Space Force SGP4 Open License (Licenses/SGP4_Open_License.txt in the package); obtained under the Space-Track User Agreement', url: 'https://www.space-track.org/documentation#/sgp4', reproduce: 'no' },
    fetch: 'Space-Track.org, Documentation, SGP4 (login): Sgp4Prop_v9.9.zip', files: () => [path.join(ARCHIVE, 'spacetrack/documents/sgp4-49349150-Sgp4Prop_v9.9.zip')] },
  sdnapBuildData: { name: 'SDN-AP build data: GRGM660PRIM lunar gravity, the DE440 lunar orientation (moon_pa_de440_200625.bpc), DE440s', license: { text: 'NASA PDS public data; NAIF public data, unmodified kernels may be redistributed', url: 'https://naif.jpl.nasa.gov/naif/rules.html', reproduce: 'yes' },
    fetch: 'node tools/fetch-build-data.mjs in propagator/sdn-ap (PDS Geosciences Node, NAIF)', files: () => ['pds-grail-gravity/gggrx_0660pm_sha.tab', 'naif-kernels/pck/moon_pa_de440_200625.bpc', 'naif-kernels/spk/planets/de440s.bsp'].map((f) => path.join(ARCHIVE, 'hac', f)) },
  wasmedge: { name: 'WasmEdge 0.16.4 runtime', license: { text: 'Apache-2.0', url: 'https://github.com/WasmEdge/WasmEdge/blob/master/LICENSE', reproduce: 'yes' },
    fetch: 'curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash -s -- -v 0.16.4', recorded: () => null },
  starlink: { name: 'SpaceX Starlink ephemerides (MEME) of the 239 satellites, one file each from the 2026-10-23 operator-capture cycle; the FFM-1 truth is propagated from fits to them', license: 'spacex-starlink',
    fetch: 'https://api.starlink.com/public-files/ephemerides/MANIFEST.txt (SpaceX serves only each satellite\'s current file: the files of 2026-10-23 are no longer served; the experiment kept their SHA-256 and never wrote them)',
    recorded: () => { const dir = path.join(G1_STORE, 'truth'); const rows = ls(dir).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f)))).map((m) => ({ name: String(m.norad), sha256: m.memeSha256 })); return rows.length ? { files: rows.length, setSha256: null, list: rows } : null; } },
  issOem: { name: 'NASA ISS trajectory file of 2026-10-09 (ISS.OEM_J2K_EPH.txt)', license: 'nasa-iss-oem', fetch: 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt (the current file; earlier files: the archive of the same bucket)', files: () => [path.join(ARCHIVE, 'hac/nasa-iss-oem/20261009/ISS.OEM_J2K_EPH.txt')] },
  esaFinal: { name: 'ESA/ESOC final GNSS orbits ESA0OPSFIN, 2024 days 268 to 287', license: 'esa-navigation-office', fetch: 'https://navigation-office.esa.int/products/gnss-products/<GPS week>/<file>, by the modules\' analysis/reference-states fetch-reference-products.mjs --products gps', files: () => productsOf(REF, days('ESA0OPSFIN_', 2024, 268, 20, '0000_01D_05M_ORB')) },
  ilrsWeekly: { name: 'ILRS combined weekly orbits (ilrsa) of LAGEOS-1, LAGEOS-2, Etalon-1 and Etalon-2, the first four weeks of each', license: 'ilrs', fetch: 'https://edc.dgfi.tum.de/pub/slr/products/orbits/TRF/<satellite>/<yyyy>/<yymmdd>/, by fetch-reference-products.mjs --products slr', files: () => productsOf(REF, ['lageos1', 'lageos2', 'etalon1', 'etalon2'].flatMap((t) => firstOf(REF, `ilrsa.orb.${t}.`, 4))) },
  nsgf: { name: 'NERC Space Geodesy Facility 4-day orbits (nsgf.orb) of Ajisai, Starlette, Stella, LARETS, WESTPAC, LARES and LARES-2, the first eight arcs of each', license: 'ilrs-nsgf', fetch: 'https://edc.dgfi.tum.de/pub/slr/products/orbits/rapid/<satellite>/<yyyy>/<yymmdd>/, by fetch-reference-products.mjs --products slr-daily', files: () => productsOf(REF, ['ajisai', 'starlette', 'stella', 'larets', 'westpac', 'lares', 'lares2'].flatMap((t) => firstOf(REF, `nsgf.orb.${t}.`, 8))) },
  mgex: { name: 'GFZ MGEX rapid orbits GFZ0MGXRAP, 2025 days 274 to 293 (BeiDou and QZSS GEO and IGSO)', license: 'nasa-cddis', fetch: 'https://cddis.nasa.gov/archive/gnss/products/<GPS week>/<file> (Earthdata token; experiments/e14-covariance-realism\'s fetch, each file\'s URL in its .provenance.json)', files: () => { const root = path.join(E14, 'archive/cddis/gnss/products'); const weeks = ls(root); return days('GFZ0MGXRAP_', 2025, 274, 20, '0000_01D_05M_ORB').map((d) => weeks.map((w) => path.join(root, w, `${d}.SP3.gz`)).find((f) => fs.existsSync(f))).filter(Boolean); } },
  gfzRapid: { name: 'GFZ rapid orbits GFZ0OPSRAP and GFZ0MGXRAP, 2026-10-11 to 2026-10-22', license: 'gfz-rapid-gnss', fetch: 'node experiments/sdn-gp-starlink-ffm-match/fetch-gnss-rapid.mjs (GFZ, or CDDIS with the Earthdata token)', recorded: ({ g1 }) => ({ files: g1.a8Sources.gfzGnssRapid.files, setSha256: g1.a8Sources.gfzGnssRapid.setSha256 }) },
  ilrsCurrent: { name: 'ILRS orbits of 2026-09 and 2026-10 (NSGF rapid orbits, ILRS combined weekly orbits)', license: 'ilrs-cddis', fetch: 'node experiments/sdn-gp-starlink-ffm-match/fetch-slr.mjs (CDDIS, Earthdata token)', recorded: ({ g1 }) => ({ files: g1.a8Sources.ilrsCddis.files, setSha256: g1.a8Sources.ilrsCddis.setSha256 }) },
  naifKernels: { name: 'NAIF mission kernels (THEMIS, Chandra, Artemis II, LRO)', license: { text: 'NAIF public data; unmodified kernels may be redistributed', url: 'https://naif.jpl.nasa.gov/naif/rules.html', reproduce: 'yes' },
    fetch: 'node experiments/sdn-gp-starlink-ffm-match/fetch-kernels.mjs get <path> --dest spk/missions/<mission> (each file\'s URL is in G1\'s manifest)', recorded: ({ g1 }) => ({ files: g1.kernels.length, setSha256: null, list: g1.kernels.map((k) => ({ name: k.file, bytes: k.bytes, sha256: k.sha256, url: k.url })) }) },
  mastTess: { name: 'TESS definitive ephemeris files (TESS_EPH_DEF_*.bsp), STScI MAST', license: 'stsci-mast-tess', fetch: 'NODE_EXTRA_CA_CERTS=<archive>/hac/.ca/emsign-root-ca-g1.pem node experiments/sdn-gp-starlink-ffm-match/fetch-mast-tess.mjs', recorded: ({ g1 }) => ({ files: g1.a8Sources.mastTess.files, setSha256: g1.a8Sources.mastTess.setSha256 }) },
  horizons: { name: 'JPL Horizons vector tables (LRO, Danuri, CAPSTONE, Psyche, Lucy, Juno, Artemis I)', license: 'jpl-horizons', fetch: 'node experiments/sdn-gp-starlink-ffm-match/fetch-horizons.mjs (https://ssd.jpl.nasa.gov/api/horizons.api)', recorded: ({ g1 }) => ({ files: g1.a8Sources.jplHorizons.files, setSha256: g1.a8Sources.jplHorizons.setSha256 }) },
  weather: { name: 'Space weather: GFZ Kp, ap, Ap and F10.7 (since 1932, nowcast); NOAA SWPC 45-day and Kp forecasts', license: 'gfz-kp', fetch: 'https://kp.gfz.de/fileadmin/files_for_gfz_cms/Kp_ap_Ap_SN_F107_since_1932.txt; https://services.swpc.noaa.gov/text/45-day-forecast.txt',
    recorded: ({ g1 }) => ({ files: g1.environment.weatherSources.length, setSha256: null, list: g1.environment.weatherSources.map((w) => ({ name: w.url.split('/').pop(), sha256: w.sha256, url: w.url })) }) },
  eop: { name: 'IERS Earth orientation, finals.all (IAU 2000) and finals.daily', license: 'iers', fetch: 'https://maia.usno.navy.mil/ser7/finals.all.iau2000.txt; https://maia.usno.navy.mil/ser7/finals.daily.iau2000.txt', files: () => [path.join(ARCHIVE, 'hac/iers-eop/20261009/finals.all.iau2000.txt'), path.join(ARCHIVE, 'hac/iers-eop/2026/2026-10-13/finals.daily.iau2000.txt')] },
  de440s: { name: 'JPL DE440s planetary ephemeris', license: 'jpl-de440', fetch: 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp', files: () => [path.join(ARCHIVE, 'hac/naif-kernels/spk/planets/de440s.bsp')] },
  gpCatalog: { name: 'Space-Track GP catalog of 2026-10-23 (every object on orbit)', license: 'space-track', fetch: 'Space-Track query /basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-30/orderby/norad_cat_id/format/json (login)', files: () => [path.join(ARCHIVE, 'spacetrack/gp/2026/2026-10-23.json.gz')] },
  issArchive: { name: 'NASA ISS trajectory archive, 2020 to 2026 (the files with their planned burns)', license: 'nasa-iss-oem', fetch: 'node experiments/sdn-gp-starlink-ffm-match/fetch-iss-oem.mjs', recorded: ({ g1 }) => ({ files: g1.a11.issArchive.files, setSha256: g1.a11.issArchive.setSha256 }) },
  nanu: { name: 'GPS Notice Advisories to Navstar Users of 2026', license: 'navcen-gps-nanu', fetch: 'node experiments/sdn-gp-starlink-ffm-match/fetch-gnss-notices.mjs (navcen.uscg.gov)', recorded: ({ g1 }) => ({ files: g1.a11.notices.gpsNanu.files, setSha256: g1.a11.notices.gpsNanu.setSha256 }) },
  naqu: { name: 'QZSS Notice Advisories to QZSS Users of 2026', license: 'qzss-naqu', fetch: 'node experiments/sdn-gp-starlink-ffm-match/fetch-gnss-notices.mjs (qzss.go.jp)', recorded: ({ g1 }) => ({ files: g1.a11.notices.qzssNaqu.files, setSha256: g1.a11.notices.qzssNaqu.setSha256 }) },
  spacetrackHistory: { name: 'Space-Track GP history, decay and TIP messages of the reentry samples', license: 'space-track',
    fetch: 'Space-Track queries (login): /basicspacedata/query/class/gp_history/CREATION_DATE/<from>--<to>/orderby/GP_ID%20asc/format/json, /basicspacedata/query/class/decay/MSG_EPOCH/%3Enow-7/orderby/MSG_EPOCH%20desc/format/json, /basicspacedata/query/class/tip/MSG_EPOCH/%3Enow-7/orderby/MSG_EPOCH%20desc/format/json',
    recorded: ({ g1 }) => ({ files: g1.a11.m29.setCounts, setSha256: g1.a11.m29.setSha256, note: `${g1.a11.m29.objects} objects; the digest is of the element sets read` }) },
  cords: { name: 'Aerospace Corporation CORDS reentry history (Reentry_History_Spreadsheet_05-22-26.csv)', license: 'aerospace-cords', fetch: 'https://aerospace.org/sites/default/files/2026-05/Reentry_History_Spreadsheet_05-22-26.csv', recorded: ({ g1 }) => ({ files: 1, sha256: g1.a11.cords.sha256 }) },
  keeptrack: { name: 'JSC Vimpel element sets through KeepTrack (api.keeptrack.space/v4/r2/vimpel.json)', license: { text: 'CC BY-NC 4.0; credit: Orbit data: KeepTrack (keeptrack.space), CC BY-NC 4.0; originally JSC Vimpel', url: 'https://keeptrack.space', reproduce: 'non-commercial only' },
    fetch: 'one bulk request per refresh with the KeepTrack API key', recorded: () => null },
  b1Rows: { name: 'B1\'s window rows (statistics only, one line per window): the input of table.mjs', license: { text: 'derived; results only are committed', url: null, reproduce: 'results only' },
    fetch: 'made by node experiments/sdn-ap-baselines/run.mjs', files: () => ls(path.join(ARCHIVE, 'sdn-ap-baselines/rows')).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(ARCHIVE, 'sdn-ap-baselines/rows', f)) },
  g1Rows: { name: 'G1\'s rows read by table.mjs: the SDN-AP rows of build 9df647b08978, the window rows of every Earth-centered source and the Starlink window records', license: { text: 'derived; results only are committed', url: null, reproduce: 'results only' },
    fetch: 'made by the commands of the held-out table',
    files: () => [
      ...ls(path.join(G1_STORE, 'rows/sdngp/9df647b08978')).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(G1_STORE, 'rows/sdngp/9df647b08978', f)),
      ...['iss', 'gnss', 'slr-high', 'mgex-geo', 'mgex-igso', 'slr-low', 'slr-low-current', 'slr-high-current', 'heo-themis', 'heo-chandra', 'heo-tess', 'gnss-rapid', 'mgex-igso-rapid', 'mgex-geo-rapid'].map((s) => path.join(G1_STORE, 'rows', `${s}.jsonl`)),
      ...ls(path.join(G1_STORE, 'rows/starlink')).filter((f) => /^\d+\.json$/.test(f)).map((f) => path.join(G1_STORE, 'rows/starlink', f))] },
  b1Environment: { name: 'B1\'s FFM environment (Earth orientation and space weather, amendments A1 and A2), as its provenance records it', license: 'gfz-kp', fetch: 'made by run.mjs from the IERS finals.all and GFZ files of the inputs above', files: () => [path.join(ARCHIVE, 'sdn-ap-baselines/environment/environment.json')] },
  g1Store: { name: 'G1\'s windows, truth and SDN-AP rows (local store of experiments/sdn-gp-starlink-ffm-match)', license: { text: 'derived from the inputs above; results only are committed', url: null, reproduce: 'results only' },
    fetch: 'made by the commands of the held-out table', recorded: ({ g1 }) => ({ files: g1.truthSet.satellites, setSha256: g1.truthSet.setSha256, note: 'the Starlink FFM-1 truth set' }) },
};

export const KEYS = [
  { name: 'Space-Track', lines: [
    '- Who needs it: the conformance table (the Sgp4Prop 9.9 package), the cost table (the GP catalog) and the reentry table (GP history, decay and TIP messages).',
    '- How to get it: create a free account at https://www.space-track.org/auth/createAccount and accept the User Agreement.',
    '- Where it goes: `<archive>/.secrets/spacetrack.env`, mode 600, as `SPACETRACK_USER=` and `SPACETRACK_PASS=`. The fetcher sends it only in the login request and never logs it.',
    '- Limits: at most 30 requests a minute and 300 an hour; one failed login stops the fetcher until the file changes.',
    '- Redistribution: element sets, SATCAT and decay or reentry data with citation (USSPACECOM\'s blanket approval); nothing else. This repository commits results only.'] },
  { name: 'NASA Earthdata (CDDIS)', lines: [
    '- Who needs it: the ILRS and GNSS products fetched from CDDIS (the laser-ranged and GNSS rows of 2026-09 and 2026-10, and the MGEX orbits).',
    '- How to get it: register at https://urs.earthdata.nasa.gov/users/new, then on the Earthdata Login profile page generate a user token (it expires after 60 days).',
    '- Where it goes: `<archive>/.secrets/earthdata.env`, mode 600, as `EARTHDATA_TOKEN=`. The fetchers send it only to cddis.nasa.gov, as a bearer token, following redirects by hand.'] },
  { name: 'KeepTrack', lines: [
    '- Who needs it: the fetch of JSC Vimpel element sets through KeepTrack (api.keeptrack.space/v4/r2/vimpel.json). No table of section 12 reads it.',
    '- How to get it: create a free API key at https://keeptrack.space.',
    '- Where it goes: `~/.sdn-keys/keeptrack-api-key` (or the environment variable the fetch script names). One bulk request per refresh, no per-satellite loops.',
    '- Credit, verbatim: Orbit data: KeepTrack (keeptrack.space), CC BY-NC 4.0; originally JSC Vimpel.'] },
];

export const TABLES = [
  { id: '12.1', title: '12.1 Conformance of the SGP4XP mode', repo: 'modules', result: 'propagator/sdn-ap/test/results/conformance.json (`--reproduce` compares a new run with it statistic by statistic)',
    note: 'The corpus is generated from the seed the result records. The reference runs only as a black box: the harness that loads the library is not public, and any harness that takes the two-line sets of the corpus and returns TEME states at the requested minutes serves.',
    commands: [cmd('cd propagator/sdn-ap && npm ci'), cmd('SDN_AP_ORACLE_ROOT=<harness directory> node test/conformance.e2e.mjs --reproduce test/results/conformance.json', 'propagator/sdn-ap/test/conformance.e2e.mjs', 'modules')],
    inputs: ['sgp4prop'] },
  { id: '12.2', title: '12.2 Two-runtime parity and determinism', repo: 'modules', result: 'the parity report the command prints (identical bytes in both runtimes)',
    commands: [cmd('cd propagator/sdn-ap && npm ci && npm run fetch-build-data && npm run build', 'propagator/sdn-ap/build.mjs', 'modules'), cmd('PATH=$HOME/.wasmedge/bin:$PATH node test/wasmedge-parity.mjs', 'propagator/sdn-ap/test/wasmedge-parity.mjs', 'modules')],
    inputs: ['sdnapBuildData', 'wasmedge'] },
  { id: '12.3', title: '12.3 Held-out accuracy', repo: 'experiments', result: `results/sdn-gp-starlink-ffm-match/README.md, sections 1 and 2 (tables.json)`,
    commands: [
      cmd('node analysis/reference-states/scripts/fetch-reference-products.mjs --from <first day> --to <last day> --products gps,slr,slr-daily --out /opt/data/sdn-archive/reference-states   # the days of the files in inputs.json', 'analysis/reference-states/scripts/fetch-reference-products.mjs', 'modules'),
      cmd(`node ${G1}/population.mjs`, `${G1}/population.mjs`), cmd(`node ${G1}/truth.mjs --workers N`, `${G1}/truth.mjs`),
      cmd(`node ${G1}/baselines.mjs`, `${G1}/baselines.mjs`), cmd(`node ${G1}/fetch-kernels.mjs get <path> --dest spk/missions/<mission>`, `${G1}/fetch-kernels.mjs`), cmd(`node ${G1}/spk-windows.mjs`, `${G1}/spk-windows.mjs`),
      cmd(`node ${G1}/fetch-horizons.mjs && node ${G1}/horizons-packs.mjs`, `${G1}/horizons-packs.mjs`), cmd(`node ${G1}/fetch-mast-tess.mjs && node ${G1}/spk-windows.mjs --source heo-tess`, `${G1}/fetch-mast-tess.mjs`),
      cmd(`node ${G1}/fetch-gnss-rapid.mjs --from 2026-10-11 --to 2026-10-22 && node ${G1}/gnss-rapid-convert.mjs --from 2026-10-11 --to 2026-10-22`, `${G1}/gnss-rapid-convert.mjs`),
      cmd(`node ${G1}/fetch-slr.mjs --from 2026-10-08 --to 2026-10-24 --weeks 260912,260919,260926,261003 && node ${G1}/slr-convert.mjs`, `${G1}/slr-convert.mjs`),
      cmd(`node ${G1}/baselines.mjs --source gnss-rapid,mgex-geo-rapid,mgex-igso-rapid,slr-low-current,slr-high-current`, `${G1}/baselines.mjs`),
      cmd(`node ${G1}/sdngp-run.mjs --workers 8 --pin 9df647b08978`, `${G1}/sdngp-run.mjs`), cmd(`node ${G1}/tables.mjs`, `${G1}/tables.mjs`), cmd(`node ${G1}/run.mjs --check`, `${G1}/run.mjs`)],
    inputs: ['starlink', 'issOem', 'esaFinal', 'ilrsWeekly', 'nsgf', 'mgex', 'gfzRapid', 'ilrsCurrent', 'naifKernels', 'mastTess', 'horizons', 'weather', 'eop', 'de440s'] },
  { id: '12.4', title: '12.4 Cost', repo: 'both', result: 'propagator/sdn-ap/test/results/bench.json (modules) and results/sdn-gp-starlink-ffm-match/bench.json; fit times from the rows of the held-out table',
    commands: [cmd('node propagator/sdn-ap/test/bench.mjs --threads 0,4,8 --json propagator/sdn-ap/test/results/bench.json   # in the modules checkout', 'propagator/sdn-ap/test/bench.mjs', 'modules'), cmd(`node ${G1}/bench.mjs`, `${G1}/bench.mjs`)],
    inputs: ['gpCatalog'] },
  { id: '12.5a', title: '12.5 Operational records: the ISS trajectory archive', repo: 'experiments', result: 'results/sdn-gp-starlink-ffm-match/README.md, M24 (section 16b) and iss-burns.json',
    commands: [cmd(`node ${G1}/fetch-iss-oem.mjs && node ${G1}/iss-burns.mjs`, `${G1}/iss-burns.mjs`), cmd(`node ${G1}/sdngp-run.mjs --pin 9df647b08978 --only m24,m24a,m24b,m24c,m24p`, `${G1}/sdngp-run.mjs`), cmd(`node ${G1}/tables.mjs`, `${G1}/tables.mjs`)],
    inputs: ['issArchive', 'weather', 'eop'] },
  { id: '12.5b', title: '12.5 Operational records: GPS and QZSS maneuver notices, and the omitted days', repo: 'experiments', result: 'results/sdn-gp-starlink-ffm-match/README.md, M27 and M27b; gnss-notice-events.json',
    commands: [cmd(`node ${G1}/fetch-gnss-notices.mjs && node ${G1}/m27-events.mjs`, `${G1}/m27-events.mjs`), cmd(`node ${G1}/sdngp-run.mjs --pin 9df647b08978 --only m27,m27b,m27bp`, `${G1}/sdngp-run.mjs`), cmd(`node ${G1}/tables.mjs`, `${G1}/tables.mjs`)],
    inputs: ['nanu', 'naqu', 'esaFinal', 'gfzRapid'] },
  { id: '12.5c', title: '12.5 Operational records: real reentries and controlled deorbits', repo: 'experiments', result: 'results/sdn-gp-starlink-ffm-match/README.md, M29 and M30 (section 16c)',
    commands: [cmd(`node ${G1}/m29-extract.mjs && node ${G1}/m29-extract-cords.mjs`, `${G1}/m29-extract-cords.mjs`), cmd(`node ${G1}/m30-truth.mjs`, `${G1}/m30-truth.mjs`), cmd(`node ${G1}/sdngp-run.mjs --pin 9df647b08978 --only m29,m30`, `${G1}/sdngp-run.mjs`), cmd(`node ${G1}/tables.mjs`, `${G1}/tables.mjs`)],
    inputs: ['spacetrackHistory', 'cords', 'weather'] },
  { id: 'B1', title: 'Appendix: SGP4, SGP4-XP and FFM on the windows of 12.3 (B1)', repo: 'experiments', result: 'results/sdn-ap-baselines/table.json and README.md',
    note: '`node experiments/sdn-ap-baselines/table.mjs` regenerates results/sdn-ap-baselines/table.json and README.md from two inputs only: B1\'s window rows and G1\'s rows (the first two lines of the table below, every file of each listed with its SHA-256 in inputs.json); the bootstrap generators are seeded, so the same rows give the same bytes. `table.mjs --check` compares the regenerated table with the committed one.',
    commands: [cmd(`node ${B1}/run.mjs --shard k/n`, `${B1}/run.mjs`), cmd(`node ${B1}/table.mjs`, `${B1}/table.mjs`), cmd(`node ${B1}/table.mjs --check`, `${B1}/table.mjs`), cmd(`node ${B1}/run.mjs --check`, `${B1}/run.mjs`)],
    inputs: ['b1Rows', 'g1Rows', 'b1Environment', 'g1Store', 'eop', 'weather', 'de440s'] },
];
