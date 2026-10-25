// Amendment A9b: the SDN-AP fitter on the Starlink windows of truth.mjs, rows per build of the module (lib/sdngp-rows.mjs).
//   FFM-propagated truth: every fitted satellite, 24 h fit from the truth start, held-out days 1 to 3 (the window of the baselines).
//   SpaceX forecast: the satellite's own states inside the 48 h forecast, 24 h fit, day 1 before the join; the file is the local capture or, for the
//   registered seats, the file the server holds now when its SHA-256 is that of the file the truth was fitted to (a changed file is skipped and counted).
//   node experiments/sdn-gp-starlink-ffm-match/starlink-sdngp.mjs [--shard k/n] [--limit N] [--no-spacex]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store, read, sha256, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { parseMeme, memeHeader } from './lib/sources.mjs';
import { polite, manifest, STARLINK_ROOT } from './lib/spacex.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';
import { withT, ms, iso } from './lib/windows.mjs';

const DAILY = path.join(config.archive, 'operator-ephemerides/daily/2026-10-23/starlink');
const truthDir = path.join(store, 'truth');
const FIT = config.windows.fitHours * 3600;

frozen();
const b = await openBaselines(modulesRoot(), { sdngp: true });
const ffmSink = sdngpSink(b, 'starlink', args.shard);
const skippedFile = path.join(ffmSink.dir, `starlink-skipped.s${(args.shard ?? '0/1').split('/')[0]}.jsonl`);
const skip = (norad, reason) => fs.appendFileSync(skippedFile, `${JSON.stringify({ norad, reason })}\n`);
const metas = fs.readdirSync(truthDir).filter((n) => /^\d+\.json$/.test(n)).map((n) => read(path.join(truthDir, n))).sort((a, c) => a.norad - c.norad);
const limit = args.limit ? Number(args.limit) : Infinity;
// a file that had changed on the server in an earlier run stays changed (SpaceX only moves forward): no request for it again
const changedBefore = new Set(fs.readdirSync(path.dirname(ffmSink.dir)).flatMap((d) => fs.readdirSync(path.join(path.dirname(ffmSink.dir), d)).filter((f) => f.startsWith('starlink-skipped.')).flatMap((f) => fs.readFileSync(path.join(path.dirname(ffmSink.dir), d, f), 'utf8').split('\n').filter(Boolean).map(JSON.parse))).filter((x) => /changed on the server/.test(x.reason)).map((x) => x.norad));
let names = null, scored = 0;

for (const meta of metas) {
  if (!ffmSink.mine()) continue;
  if (scored >= limit) break;
  const { norad } = meta;
  // FFM-propagated truth
  const flat = new Float64Array(new Uint8Array(fs.readFileSync(path.join(truthDir, `${norad}.f64`))).buffer);
  const t0 = ms(meta.truth.epochUtc);
  const truth = withT({ source: 'starlink-ffm', id: `STARLINK (${norad})`, norad, name: `STARLINK-${norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
    lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: iso(t0 + i * config.truth.cadenceSeconds * 1000), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
  if (!ffmSink.has(rowKey({ source: truth.source, id: truth.id, startUtc: iso(t0), fitSeconds: FIT }))) {
    const row = await scoreWindow(b, truth, t0, { fitSeconds: FIT, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage, arms: 'sdngp' });
    if (row) { const { xp, sgp4, ...rest } = row; ffmSink.append({ ...rest, population: meta.population }); }
  }
  // SpaceX's forecast
  if (!args['no-spacex']) {
    let bytes = null;
    const local = path.join(DAILY, `${norad}.txt.gz`);
    try {
      if (meta.population === 'daily' && fs.existsSync(local)) bytes = zlib.gunzipSync(fs.readFileSync(local));
      else if (changedBefore.has(norad)) { skip(norad, 'the file changed on the server since the fit (found so in an earlier run)'); bytes = null; }
      else {
        names ??= await manifest();
        const file = names.find((f) => f.startsWith(`MEME_${norad}_`));
        bytes = file ? await polite(`${STARLINK_ROOT}/${file}`) : null;
        if (!bytes) skip(norad, 'not in the SpaceX manifest');
      }
    } catch (error) { skip(norad, `fetch: ${String(error.message).slice(0, 120)}`); if (/stop/.test(String(error.message))) break; }
    if (bytes && sha256(bytes) !== meta.memeSha256) { skip(norad, 'the file changed on the server since the fit'); bytes = null; }
    if (bytes) {
      const text = bytes.toString('utf8'), header = memeHeader(text), startMs = ms(header.start);
      const inSpan = parseMeme(text).filter((s) => ms(s.epoch) < startMs + 48 * 3600e3 - 1000);
      if (inSpan.length > 100) {
        const spacex = withT({ source: 'starlink-spacex', id: `STARLINK (${norad})`, norad, name: `STARLINK-${norad}`, objectId: '', originator: 'SpaceX', creation: header.created ?? '', frame: 'EME2000', timeSystem: 'UTC', lines: inSpan });
        if (!ffmSink.has(rowKey({ source: spacex.source, id: spacex.id, startUtc: iso(ms(inSpan[0].epoch)), fitSeconds: FIT }))) {
          const row = await scoreWindow(b, spacex, ms(inSpan[0].epoch), { fitSeconds: FIT, leadDays: config.windows.spacexInSpanLeadDays, minCoverage: config.windows.minimumCoverage, arms: 'sdngp' });
          if (row) { const { xp, sgp4, ...rest } = row; ffmSink.append({ ...rest, population: meta.population }); }
        }
      }
    }
  }
  scored += 1;
  if (scored % 10 === 0) console.error(`starlink: ${scored} satellites (build ${ffmSink.build})`);
}
console.error(`starlink: ${scored} satellites done (build ${ffmSink.build}, shard ${args.shard ?? '0/1'})`);
await b.close();
process.exit(0);
