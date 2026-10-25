// Amendment A8: truth packs from the stored JPL Horizons vector tables (fetch-horizons.mjs): Danuri and CAPSTONE (Moon-centered),
// Artemis I (Earth- and Moon-centered). Text is parsed here (calendar strings and numbers only); TDB epochs become UTC through
// foundation/time `convert_time`, one module call per epoch. Output under <store>/pack/ (see lib/packs.mjs); nothing is committed.
//   node experiments/sdn-gp-starlink-ffm-match/horizons-packs.mjs [--pack danuri-lunar,capstone-nrho,artemis1-cislunar,artemis1-lunar]
import fs from 'node:fs';
import path from 'node:path';
import { args, frozen, sha256 } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openTime, convertAll } from './lib/timeconv.mjs';
import { writePack } from './lib/packs.mjs';
import { ROOT } from './fetch-horizons.mjs';

const PACKS = [
  { name: 'danuri-lunar', mission: 'danuri', center: 'moon', centerName: 'Moon', note: 'Danuri (KPLO), KARI trajectory solutions merged by JPL, Moon-centered, 1 min, 2026-08-15 to 2026-10-18' },
  { name: 'capstone-nrho', mission: 'capstone', center: 'moon', centerName: 'Moon', note: 'CAPSTONE, mission navigation merged by JPL, Moon-centered (the Gateway near rectilinear halo orbit), 5 min, 2025-07-15 to 2026-07-15' },
  { name: 'artemis1-cislunar', mission: 'artemis1', center: 'earth', centerName: 'Earth', note: 'Artemis I (Orion) as-flown post-TLI trajectory from NASA/JSC navigation, Earth-centered, 1 min, 2022-11-16 to 2022-12-11' },
  { name: 'artemis1-lunar', mission: 'artemis1', center: 'moon', centerName: 'Moon', note: 'Artemis I (Orion) as-flown post-TLI trajectory, Moon-centered (distant retrograde orbit), 1 min, 2022-11-16 to 2022-12-11' },
  { name: 'psyche-cruise', mission: 'psyche', center: 'sun', centerName: 'Sun', note: 'Psyche, JPL navigation reconstructions, Sun-centered, 60 min, 2025-08-13 to 2026-07-12 (solar-electric thrust arcs and the Mars gravity assist of May 2026 inside)' },
  { name: 'lucy-cruise-rec', mission: 'lucy-rec', center: 'sun', centerName: 'Sun', note: 'Lucy, navigation solution fitted through 2025-09-08, Sun-centered, 60 min, 2024-12-20 to 2025-09-07 (Donaldjohanson encounter of 2025-04-20 inside)' },
  { name: 'lucy-cruise-ref', mission: 'lucy-ref', center: 'sun', centerName: 'Sun', note: 'Lucy, flight-project reference trajectory (a planning prediction, not reconstructed data), Sun-centered, 60 min, 2025-09-09 to 2027-03-01' },
  { name: 'juno-cruise', mission: 'juno-cruise', center: 'sun', centerName: 'Sun', note: 'Juno, JPL navigation reconstruction, Sun-centered, 60 min, 2012-10-01 to 2013-09-30 (after the deep space maneuvers, before the Earth flyby)' },
  { name: 'juno-jupiter', mission: 'juno-jupiter', center: 'jupiter', centerName: 'Jupiter', note: 'Juno, JPL navigation reconstruction, Jupiter-centered, 30 min, 2024-09-01 to 2026-08-23 (33 day orbits)' },
];
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

function parse(text) { // $$SOE .. $$EOE rows: "JDTDB, A.D. 2026-Oct-10 00:00:00.0000, X, Y, Z, VX, VY, VZ,"
  const rows = [];
  for (const line of text.split('$$SOE')[1].split('$$EOE')[0].split('\n')) {
    const f = line.split(',').map((x) => x.trim());
    if (f.length < 8) continue;
    const m = /^A\.D\. (\d{4})-([A-Za-z]{3})-(\d\d) (\d\d:\d\d:\d\d)(?:\.(\d+))?/.exec(f[1]);
    if (!m) throw new Error(`unparsed epoch: ${f[1]}`);
    rows.push({ tdb: `${m[1]}-${MONTHS[m[2]]}-${m[3]}T${m[4]}.${(m[5] ?? '0').padEnd(6, '0')}`, jd: Number(f[0]), r: f.slice(2, 5).map(Number), v: f.slice(5, 8).map(Number) });
  }
  return rows;
}

frozen();
const wanted = args.pack ? new Set(args.pack.split(',')) : null;
const time = await openTime(modulesRoot());
for (const p of PACKS.filter((x) => !wanted || wanted.has(x.name))) {
  const dir = path.join(ROOT, p.mission, p.center);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  const byTdb = new Map();
  const sources = [];
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    sources.push({ file: f, sha256: sha256(bytes) });
    for (const row of parse(bytes.toString('utf8'))) byTdb.set(row.tdb, row);
  }
  const rows = [...byTdb.values()].sort((a, b) => a.jd - b.jd);
  const t0 = performance.now();
  const utc = await convertAll(time, rows.map((r) => r.tdb));
  const states = rows.map((r, i) => ({ ms: Date.parse(utc[i].endsWith('Z') ? utc[i] : `${utc[i]}Z`), r: r.r, v: r.v }));
  const meta = writePack(p.name, { states, description: { source: 'JPL Horizons API vector tables', mission: p.mission, center: p.centerName, axes: 'ICRF equatorial axes as served (taken as the J2000 axes of the NAIF packs; the 20 mas frame bias, 37 m at the Moon, is not applied)', note: p.note, sourceFiles: sources } });
  console.error(`${p.name}: ${meta.states} states ${meta.startUtc} to ${meta.stopUtc} (${((performance.now() - t0) / 1000).toFixed(0)} s of time conversions)`);
}
await time.destroy();
process.exit(0);
