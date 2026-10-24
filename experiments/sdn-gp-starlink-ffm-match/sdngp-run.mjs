// Amendment A9b: the SDN-AP arm over every source of section 1, on ONE build of the module. The build is copied to <store>/sdngp-snapshot/ first (or named with --pin)
// and every job runs that copy (SDNGP_SNAPSHOT), because side B rebuilds dist/ in place. Jobs are the sharded runners of baselines.mjs, spk-windows.mjs and starlink-sdngp.mjs;
// their rows land in rows/sdngp/<build>/. When every job exits 0 the build gets complete.json, which the tables use to pick the headline build.
//   node experiments/sdn-gp-starlink-ffm-match/sdngp-run.mjs [--workers 8] [--pin 2eca1c8006a1] [--only starlink,gnss]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { args, frozen, store, freeGiB } from './common.mjs';
import { snapshot } from './lib/sdngp.mjs';

frozen();
const dir = path.dirname(new URL(import.meta.url).pathname);
const snap = snapshot(store, args.pin ?? null);
const build = snap.wasmSha256.slice(0, 12);
const logDir = path.join(store, 'sdngp-run', build);
fs.mkdirSync(logDir, { recursive: true });
const SOURCES = ['starlink', 'iss', 'iss-daily', 'gnss', 'mgex-geo', 'mgex-igso', 'gnss-rapid', 'mgex-geo-rapid', 'mgex-igso-rapid', 'slr-low', 'slr-high', 'slr-low-current', 'slr-high-current', 'heo-themis', 'heo-chandra', 'heo-tess', 'heo-artemis2', 'fitlength', 'lowering', 'span-slr', 'span-gnss', 'lunar', 'segment', 'default', 'm22', 'm23', 'm28', 'm24', 'm24c', 'm24a', 'm29', 'm30', 'm24p'];
const only = args.only ? new Set(args.only.split(',')) : null;
const wanted = (j) => !only || only.has(j.source) || [...only].some((o) => j.source.startsWith(`${o}:`)); // --only default selects every default-span job
const shards = (name, script, extra, n) => Array.from({ length: n }, (_, k) => ({ source: name, name: `${name}.s${k}of${n}`, script, argv: [...extra, ...(n > 1 ? ['--shard', `${k}/${n}`] : [])] }));
const baselines = (source, n = 1) => shards(source, 'baselines.mjs', ['--arm', 'sdngp', '--source', source], n);
const spk = (source) => shards(source, 'spk-windows.mjs', ['--arm', 'sdngp', '--source', source], 1);
const jobs = [
  ...shards('starlink', 'starlink-sdngp.mjs', [], 4),
  ...shards('fitlength', 'fitlength.mjs', ['--arm', 'sdngp'], 4), // amendment A9c
  ...shards('lowering', 'starlink-lowering.mjs', [], 1), // amendment A9d: the lowering Starlinks, rule and free B_eff
  // amendment A9f: the Moon-centered windows, and the default-span rows (the module chooses the fit span; sources with truth before the fit start)
  ...shards('lunar', 'lunar-windows.mjs', [], 8),
  ...shards('segment', 'segment-windows.mjs', [], 8), // amendment A9h: the cislunar and heliocentric packs through the segment fits
  // amendment A10: the maneuver, hand-off and detection measurements against the FFM-1 truths of events-truth.mjs (run it first: the truths are independent of the build)
  ...shards('m22', 'events-sdngp.mjs', ['--source', 'm22'], 4), ...shards('m23', 'events-sdngp.mjs', ['--source', 'm23'], 4), ...shards('m28', 'events-sdngp.mjs', ['--source', 'm28'], 6), ...shards('m24', 'events-sdngp.mjs', ['--source', 'm24'], 1), ...shards('m24c', 'events-sdngp.mjs', ['--source', 'm24c'], 4),
  // amendment A11: the ISS archive windows (M24) and the real reentries (M29); their inputs (the archive files, the extracted element-set histories) do not depend on the build
  ...shards('m24a', 'events-sdngp.mjs', ['--source', 'm24a'], 4), ...shards('m29', 'events-sdngp.mjs', ['--source', 'm29'], 6), ...shards('m30', 'events-sdngp.mjs', ['--source', 'm30'], 1), ...shards('m24p', 'events-sdngp.mjs', ['--source', 'm24p'], 4),
  ...['iss', 'iss-daily', 'gnss', 'mgex-geo', 'mgex-igso', 'gnss-rapid', 'mgex-geo-rapid', 'mgex-igso-rapid', 'slr-low', 'slr-high', 'slr-low-current', 'slr-high-current'].flatMap((src) => shards(`default:${src}`, 'baselines.mjs', ['--arm', 'sdngp', '--span', 'default', '--source', src], src === 'slr-low' || src === 'mgex-igso' ? 2 : 1)),
  ...shards('default:heo', 'spk-windows.mjs', ['--arm', 'sdngp', '--span', 'default', '--source', 'heo-themis,heo-chandra,heo-tess'], 1),
  ...shards('default:span-gnss', 'span-windows.mjs', ['--arm', 'sdngp', '--span', 'default', '--source', 'span-gnss'], 1), ...shards('default:span-slr', 'span-windows.mjs', ['--arm', 'sdngp', '--span', 'default', '--source', 'span-slr'], 1),
  ...shards('span-gnss', 'span-windows.mjs', ['--arm', 'sdngp', '--source', 'span-gnss'], 2), ...shards('span-slr', 'span-windows.mjs', ['--arm', 'sdngp', '--source', 'span-slr'], 1), // amendment A9e: the fit span against COMSPOC
  ...baselines('slr-low', 2), ...baselines('mgex-igso', 2), ...baselines('mgex-geo', 2), ...baselines('gnss', 2),
  ...spk('heo-tess'), ...spk('heo-chandra'), ...spk('heo-themis'),
  ...baselines('slr-low-current'), ...baselines('slr-high'), ...baselines('gnss-rapid'), ...baselines('slr-high-current'), ...baselines('mgex-igso-rapid'),
  ...baselines('iss'), ...baselines('mgex-geo-rapid'), ...baselines('iss-daily'), ...spk('heo-artemis2'),
].filter(wanted);

console.error(`SDN-AP arm on build ${build} (${snap.sourceCommit?.slice(0, 8)}, ${snap.sourceDirtyFiles} uncommitted files): ${jobs.length} jobs, ${args.workers ?? 8} at a time; logs ${logDir}`);
const queue = [...jobs], results = [];
const next = () => new Promise((resolve) => {
  const job = queue.shift();
  if (!job) return resolve(null);
  if (freeGiB() < 25) { console.error(`disk under 25 GiB free: ${job.name} not started`); results.push({ name: job.name, code: 'disk' }); return resolve(next()); }
  const log = fs.openSync(path.join(logDir, `${job.name}.log`), 'a');
  const child = spawn(process.execPath, [path.join(dir, job.script), ...job.argv], { stdio: ['ignore', log, log], env: { ...process.env, SDNGP_SNAPSHOT: build } });
  child.on('exit', (code) => { fs.closeSync(log); results.push({ name: job.name, source: job.source, code }); console.error(`${job.name}: exit ${code}`); resolve(next()); });
});
await Promise.all(Array.from({ length: Number(args.workers ?? 8) }, next));
const failed = results.filter((r) => r.code !== 0);
if (!failed.length && !only) {
  fs.writeFileSync(path.join(store, 'rows/sdngp', build, 'complete.json'), `${JSON.stringify({ build, sources: SOURCES, jobs: results.length, completedUtc: new Date().toISOString() }, null, 2)}\n`);
  console.error(`build ${build} complete`);
} else console.error(failed.length ? `${failed.length} job(s) failed: ${failed.map((r) => r.name).join(', ')}` : 'partial run (--only): not marked complete');
process.exit(failed.length ? 1 : 0);
