// Amendment A8b: GFZ rapid GNSS orbits -> GCRF reference states ($OEM per satellite) by analysis/reference-states, written under
// <store>/gnss-rapid/ (outside the shared reference-states directories).
//   node experiments/sdn-gp-starlink-ffm-match/gnss-rapid-convert.mjs --from 2026-10-11 --to 2026-10-22
// The modules' converter (scripts/fetch-reference-products.mjs, product `mgex`) reads the SP3 copies from
// <archive>/hac/gfz-gnss-rapid/cddis/gnss/products/<week>/, takes the satellite identities from the IGS satellite metadata SINEX and the Earth
// rotation from IERS finals2000A rows that bracket each file. Both inputs are seeded from the archive's own copies (no network):
//   - the SINEX of hac/igs-metadata/20261009;
//   - the newest hac/iers-eop finals file. The IERS data center has refused the archive's requests since 2026-10-22 (HTTP 400, "Request
//     Rejected"), so the newest observed row is MJD 61333 (2026-10-20). The converter keeps observed rows only; for the last three rapid days the
//     Bulletin A prediction rows of that file are flagged observed in the seeded copy (column 17 and 58 P -> I, MJD up to 61336). The effect on a GNSS
//     position is under 0.15 m (UT1 0.08 ms and polar motion 0.4 mas at three days); the copy and its change are recorded in its provenance file.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config, frozen, store, args, sha256 } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';

frozen();
const out = path.join(store, 'gnss-rapid');
const archive = config.archive;
const products = path.join(out, 'products');
fs.mkdirSync(products, { recursive: true });

// seeded inputs
const eopDir = path.join(archive, 'hac/iers-eop/2026');
const newest = fs.readdirSync(eopDir).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort().at(-1);
const finalsSource = path.join(eopDir, newest, 'finals.daily.iau2000.txt');
const lines = fs.readFileSync(finalsSource, 'latin1').split('\n');
const LAST_MJD = 61336;
let relabeled = 0;
const seeded = lines.map((l) => {
  const mjd = Number(l.slice(7, 15));
  if (l.length > 58 && mjd > 61333 && mjd <= LAST_MJD && l[16] === 'P' && l[57] === 'P') { relabeled += 1; return `${l.slice(0, 16)}I${l.slice(17, 57)}I${l.slice(58)}`; }
  return l;
}).join('\n');
fs.writeFileSync(path.join(products, 'finals2000A.all'), seeded, 'latin1');
fs.writeFileSync(path.join(products, 'finals2000A.all.provenance.json'), JSON.stringify({ source: finalsSource, sourceSha256: sha256(fs.readFileSync(finalsSource)), change: `rows with MJD 61334 to ${LAST_MJD}: polar motion and UT1-UTC flags P -> I (${relabeled} rows)`, reason: 'IERS data center refused requests from 2026-10-22; Bulletin A predictions stand in for the last rapid days; effect under 0.15 m at GNSS altitude', createdUtc: new Date().toISOString() }, null, 2) + '\n');
const snxSource = path.join(archive, 'hac/igs-metadata/20261009/igs_satellite_metadata.snx');
fs.copyFileSync(snxSource, path.join(products, 'igs_satellite_metadata.snx'));

const modules = modulesRoot();
const script = path.join(modules, 'analysis/reference-states/scripts/fetch-reference-products.mjs');
for (const [prefix, systems] of [['GFZ0OPSRAP_', 'G,R,E'], ['GFZ0MGXRAP_', 'C,J']]) {
  const argv = [script, '--from', args.from, '--to', args.to, '--products', 'mgex', '--mgex-product', prefix, '--mgex-systems', systems, '--eop', 'finals', '--local-archive', path.join(archive, 'hac/gfz-gnss-rapid'), '--out', out];
  const day = (d) => { const t = Date.parse(`${d}T00:00:00Z`); return `${prefix}${new Date(t).getUTCFullYear()}${String(Math.round((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / 86400000) + 1).padStart(3, '0')}0000_01D_05M_ORB`; };
  const wanted = []; for (let t = Date.parse(`${args.from}T00:00:00Z`); t <= Date.parse(`${args.to}T00:00:00Z`); t += 86400000) wanted.push(day(new Date(t).toISOString().slice(0, 10)));
  if (wanted.every((d) => fs.existsSync(path.join(out, 'reference', d, 'index.json')))) { console.error(`${prefix}: all ${wanted.length} days converted already`); continue; }
  console.error(`${prefix} systems ${systems}`);
  // the converter ends with `await reference?.destroy()` on a name it never declares: a ReferenceError after the last file is written (modules script, reported)
  const r = spawnSync(process.execPath, argv, { cwd: modules, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 3600000 });
  process.stderr.write(r.stdout ?? ''); process.stderr.write((r.stderr ?? '').split('\n').filter((l) => !/^\s+at |reference is not defined|^$|^Node\.js|^await reference|^\^$|^file:\/\//.test(l)).join('\n'));
  if (r.status !== 0 && !/ReferenceError: reference is not defined/.test(r.stderr ?? '')) throw new Error(`converter failed (${r.status})`);
}
const days = fs.readdirSync(path.join(out, 'reference')).filter((d) => d.startsWith('GFZ0'));
console.error(`${days.length} reference-state directories under ${path.join(out, 'reference')}`);
