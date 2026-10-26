// A6 point 2: the Space-Track sets of B2's objects, copied from the local GP history (gp_history/by-creation) into a mini archive under the
// store with the same file names and records, so the archive readers (harness/gp-archive.mjs) run unchanged on it: the ISS and the five laser
// spheres from every file, the Starlinks of the forecast cycle from the files of 2026-09-01 on. Records stay on this machine (store only).
//   node experiments/sdn-ap-mixed-screening/gp-extract.mjs --year <yyyy>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, gpArchive as MINI, args, frozen } from './common.mjs';

frozen();
const SOURCE = '/opt/data/sdn-archive/spacetrack/gp_history/by-creation';
const year = String(args.year ?? '');
if (!/^\d{4}$/.test(year)) throw new Error('--year <yyyy>');
const always = new Set([25544, 7646, 22824, 27944, 25398, 38077]);
const { forecastCycle } = await import('./part1-starlink.mjs');
const starlinks = new Set(fs.readdirSync(path.join(config.part1.starlink.captureRoot, forecastCycle)).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => Number(f.split('.')[0])));
const dir = path.join(SOURCE, year), out = path.join(MINI, year);
fs.mkdirSync(out, { recursive: true });
let files = 0, kept = 0;
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json.gz')).sort()) {
  const target = path.join(out, name);
  if (fs.existsSync(target)) continue;
  const withStarlinks = name.slice(0, 10) >= '2026-09-01';
  let records;
  try { records = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name)))); } catch (error) { console.error(`gp-extract: ${name} unreadable: ${error.message}`); continue; }
  const keep = records.filter((g) => { const n = Number(g.NORAD_CAT_ID); return always.has(n) || (withStarlinks && starlinks.has(n)); });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, zlib.gzipSync(JSON.stringify(keep)));
  fs.renameSync(temp, target);
  files += 1; kept += keep.length;
  if (files % 50 === 0) console.error(`gp-extract ${year}: ${files} files, ${kept} records`);
}
console.error(`gp-extract ${year}: ${files} files, ${kept} records`);
