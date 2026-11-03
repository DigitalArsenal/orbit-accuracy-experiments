// Builds truth-objects.json: the dev truth objects of A2 section 3 on lawful spans (names, NORADs, clusters, spans; no values).
// GNSS NORADs: ESA0OPSFIN header PRN list of 2026-03-15 (G, R, BeiDou MEO) x the IGS metadata file (SVN -> NORAD). Run once; the output is committed.
import fs from 'node:fs'; import zlib from 'node:zlib'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const snxRaw = fs.readFileSync(path.join(root, 'data/e1/igs_satellite_metadata.snx.gz')), snx = zlib.gunzipSync(snxRaw).toString().split('\n');
const sp3Path = '/opt/data/sdn-archive/reference-states/products/ESA0OPSFIN_20260740000_01D_05M_ORB.SP3.gz';
const sp3Raw = fs.readFileSync(sp3Path), head = [];
for (const l of zlib.gunzipSync(sp3Raw).toString().split('\n')) { if (l.startsWith('*')) break; if (l.startsWith('+ ')) head.push(l); }
const prns = head.join('').replace(/\+ +\d*/g, ' ').match(/[A-Z]\d\d/g);
const block = (n) => { const a = snx.findIndex((l) => l.startsWith(`+${n}`)), b = snx.findIndex((l, i) => i > a && l.startsWith(`-${n}`)); return snx.slice(a + 1, b).filter((l) => l[0] === ' '); };
const ident = new Map(block('SATELLITE/IDENTIFIER').map((l) => [l.slice(1, 5).trim(), { norad: Number(l.slice(16, 22)), type: l.slice(23, 40).trim() }]));
const prnMap = new Map();
for (const l of block('SATELLITE/PRN')) { const [svn, from, to, prn] = l.trim().split(/\s+/); const key = (s) => { const [y, d] = s.split(':').map(Number); return y * 1000 + d; }; if (key(from) <= 2026074 && (key(to) >= 2026074 || to.startsWith('0000'))) prnMap.set(prn, svn); }
const gnss = { gps: [], glonass: [], bds: [] };
for (const p of new Set(prns)) {
  const svn = prnMap.get(p); const id = svn && ident.get(svn); if (!id) continue;
  if (p[0] === 'G') gnss.gps.push(id.norad); else if (p[0] === 'R') gnss.glonass.push(id.norad); else if (p[0] === 'C' && /^BDS-[23]M/.test(id.type)) gnss.bds.push(id.norad);
}
const O = (name, norad, cluster, from, to, o = {}) => ({ name, norad, cluster, from, to, ...o });
const ESA = ['2024-09-24', '2026-05-31'], L = ['2025-10-03', '2026-05-31'];
const objects = [
  O('Swarm A', 39452, 'swarm-ac', ...L, { c2cal: true }), O('Swarm C', 39453, 'swarm-ac', ...L, { c2cal: true }), O('Swarm B', 39451, 'swarm-b', ...L, { c2cal: true }),
  O('GRACE-FO 1', 43476, 'grace-fo', ...L, { c2cal: true }), O('GRACE-FO 2', 43477, 'grace-fo', ...L, { c2cal: true }),
  O('ISS', 25544, 'iss', '2022-11-20', '2024-12-31'),
  ...[44349, 44351, 44353, 44358].map((n, i) => O(`COSMIC-2 ${n}`, n, 'cosmic2', ...L, { c2cal: true })),
  O('CryoSat-2', 36508, 'cryosat2', '2025-09-26', '2026-09-12'), O('SARAL', 39086, 'saral', '2025-09-28', '2026-09-07'),
  O('Sentinel-1A', 39634, 's1a', ...L, { c2cal: true }), O('Sentinel-1C', 62261, 's1c', ...L, { c2cal: true }),
  O('Sentinel-3A', 41335, 's3ab', '2025-09-24', '2026-09-20'), O('Sentinel-3B', 43437, 's3ab', '2025-09-25', '2026-09-21'),
  O('HY-2C', 46469, 'hy2c', '2025-09-21', '2026-09-22'), O('HY-2D', 48621, 'hy2d', '2025-09-28', '2026-09-10'), O('SWOT', 54754, 'swot', '2025-09-25', '2026-09-11'),
  O('Jason-3', 41240, 'jason-s6', '2025-09-23', '2026-08-26'), O('Sentinel-6A', 46984, 'jason-s6', '2025-09-27', '2026-09-19'), O('Sentinel-6B', 66514, 'jason-s6', '2025-11-23', '2026-09-19'),
  O('LAGEOS-2', 22195, 'lageos2', ...L), O('Etalon-1', 19751, 'etalon', ...L), O('Etalon-2', 20026, 'etalon', ...L),
  O('QZS-3', 42917, 'qzs3', ...ESA, { c2cal: true }),
  O('WAAS PRN131 EUTE 117W B', 41589, 'waas', '2026-08-29', '2026-11-02'), O('WAAS PRN133 Galaxy 30', 46114, 'waas', '2026-08-29', '2026-11-02'), O('WAAS PRN135 SES-15', 42709, 'waas', '2026-08-29', '2026-11-02'),
  ...gnss.gps.map((n) => O(`GPS ${n}`, n, 'gps', ...ESA, { c2cal: true })), ...gnss.glonass.map((n) => O(`GLONASS ${n}`, n, 'glonass', ...ESA, { c2cal: true })), ...gnss.bds.map((n) => O(`BeiDou MEO ${n}`, n, 'beidou-meo', ...ESA, { c2cal: true })),
];
const out = { note: 'A2 section 3 minus NSGF (LARETS, Starlette, WESTPAC, Stella, LARES, LARES-2, Ajisai), minus Galileo, minus 44350/TerraSAR-X/Sentinel-1D/LAGEOS-1; TDRS unresolved (NAIF id to NORAD not read, V7 truth grade unverified) so excluded; TESS (HEO) not listed',
  gnssCounts: { gps: gnss.gps.length, glonass: gnss.glonass.length, bdsMeo: gnss.bds.length }, inputs: { igsMetadataSha256: sha(snxRaw), esaHeaderFile: path.basename(sp3Path), esaHeaderFileSha256: sha(sp3Raw) }, objects };
fs.writeFileSync(path.join(here, 'truth-objects.json'), JSON.stringify(out, null, 1) + '\n');
console.log(out.gnssCounts, objects.length);
