// AP6.md: the satellites, their truth and their windows. Reading and selection only: each state is a product's, through the truth gate.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/data/sdn-archive/reference-states';
const REF = path.join(ROOT, 'reference'), POD = path.join(ROOT, 'reference-leo-pod-2');
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const every = (from, to, days) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += days * DAY) out.push(t); return out; };
const yymmdd = (s) => Date.UTC(2000 + Number(s.slice(0, 2)), Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)));
const yyddd = (s) => Date.UTC(2000 + Number(s.slice(0, 2)), 0, 1) + (Number(s.slice(2)) - 1) * DAY;

const LATE_2025 = { from: Date.parse('2025-09-25T00:00:00Z'), to: Date.parse('2026-01-05T00:00:00Z') };
const inPeriod = (t) => t >= LATE_2025.from && t <= LATE_2025.to;
const oemIn = (dir) => { const f = fs.readdirSync(dir).find((n) => n.endsWith('.oem')); return f ? path.join(dir, f) : null; };
const laserFiles = (kind, target) => fs.readdirSync(REF).filter((d) => d.startsWith(`${kind}.orb.${target}.`) && inPeriod(yymmdd(d.split('.')[3]))).sort().map((d) => oemIn(path.join(REF, d))).filter(Boolean);
const dorisFiles = (codes) => fs.readdirSync(POD).filter((d) => codes.some((c) => d.startsWith(`ssa${c}.`))).filter((d) => { const m = /\.b(\d{5})\.e(\d{5})/.exec(d); return m && inPeriod(yyddd(m[1])); }).sort().map((d) => oemIn(path.join(POD, d))).filter(Boolean);

const LOW = { group: 'LS', arcs: [24, 72], cutoffs: every('2025-10-10', '2025-12-21', 5) };
const ALT = { group: 'DO', arcs: [24, 72], cutoffs: every('2025-10-10', '2025-12-21', 5) };
const GEOD = { group: 'GD', arcs: [72], cutoffs: every('2025-10-11', '2025-12-21', 7) };
export const GROUPS = {
  LS: { label: 'Low orbit, laser spheres', provider: 'ILRS (NSGF)' },
  DO: { label: 'Low orbit, altimetry', provider: 'Data E' },
  GD: { label: 'Laser geodetic', provider: 'ILRS' },
  IG: { label: 'Inclined geosynchronous', provider: 'GFZ' },
  GE: { label: 'Geostationary', provider: 'GFZ' },
  HE: { label: 'Highly elliptical', provider: 'NASA TESS' },
};
export const STATIC = [
  ...['ajisai', 'starlette', 'stella', 'westpac', 'lares', 'larets'].map((t) => ({ ...LOW, name: t, files: () => laserFiles('nsgf', t) })),
  ...[['Jason-3', ['ja330']], ['Sentinel-3A', ['s3a30']], ['Sentinel-3B', ['s3b30']], ['Sentinel-6A', ['s6a30']], ['Sentinel-6B', ['s6b30']], ['SARAL', ['srl20']], ['SWOT', ['swo20', 'swo30']], ['CryoSat-2', ['cs220', 'cs230']], ['HY-2C', ['h2c20', 'h2c30']], ['HY-2D', ['h2d20', 'h2d30']]].map(([name, codes]) => ({ ...ALT, name, files: () => dorisFiles(codes) })),
  ...['lageos1', 'lageos2', 'etalon1', 'etalon2'].map((t) => ({ ...GEOD, name: t, files: () => laserFiles('ilrsa', t) })),
  { ...GEOD, name: 'lares2', files: () => laserFiles('nsgf', 'lares2') },
];
export const MGEX_CUTOFFS = every('2025-10-04', '2025-10-13', 2);
export const TESS = { group: 'HE', name: 'TESS', norad: 43435, objectId: '2018-038A', arcs: [72, 336], cutoffs: every('2026-07-27', '2026-09-10', 7), dir: '/opt/data/sdn-archive/hac/mast-tess/models', from: '2026-07-10T00:00:00Z', to: '2026-09-17T12:00:00Z' };
export const windowKey = (group, name, t) => `${group}|${name}|${iso(t)}`;
