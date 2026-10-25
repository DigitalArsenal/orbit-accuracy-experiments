// Waits for SpaceX to serve files newer than the ones scored so far (the registered prospective files start 2026-10-24 08:00Z), then runs
// the held-out pass (newer.mjs in three shards, the paced fetcher spacing their requests) and regenerates the tables. It commits and
// pushes nothing. Every 15 minutes it asks for the head (4 KiB) of three satellites' files, 3.2 s apart from any other request; it ends
// after the pass or after --hours (default 14).
//   node experiments/sdn-gp-starlink-ffm-match/watch-newer.mjs [--after 2026-10-24T05:00:00] [--hours 14]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { args, store } from './common.mjs';
import { polite, STARLINK_ROOT } from './lib/spacex.mjs';
import { memeHeader } from './lib/sources.mjs';

const after = args.after ?? '2026-10-24T05:00:00';
const until = Date.now() + Number(args.hours ?? 14) * 3600e3;
const SAMPLE = [45419, 100011, 48127];
const log = (m) => fs.appendFileSync(path.join(store, 'watch-newer.log'), `${new Date().toISOString()} ${m}\n`);
const dir = path.dirname(new URL(import.meta.url).pathname);
const run = (file, argv) => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(dir, file), ...argv], { stdio: ['ignore', 'ignore', fs.openSync(path.join(store, 'watch-newer.log'), 'a')] }); c.on('exit', resolve); });

log(`watching for files that start after ${after}Z until ${new Date(until).toISOString()}`);
for (;;) {
  try {
    const names = (await polite(`${STARLINK_ROOT}/MANIFEST.txt`)).toString('utf8').split('\n').filter(Boolean); // a file's name changes with each version, so the manifest is read afresh
    for (const norad of SAMPLE) {
      const file = names.find((x) => x.startsWith(`MEME_${norad}_`));
      if (!file) continue;
      const header = memeHeader((await polite(`${STARLINK_ROOT}/${file}`, { range: 'bytes=0-4095' })).toString('utf8'));
      if (header.start && header.start > after) {
        log(`${norad}: a file created ${header.created}Z starts ${header.start}Z: running the pass`);
        await Promise.all([0, 1, 2].map((k) => run('newer.mjs', ['--shard', `${k}/3`, '--after', `${after}Z`])));
        await run('tables.mjs', []);
        log('pass done; tables regenerated (nothing committed)');
        process.exit(0);
      }
    }
    log(`no newer file yet (sample starts: checked ${SAMPLE.length} satellites)`);
  } catch (error) { log(`check failed: ${String(error.message).slice(0, 200)}`); }
  if (Date.now() > until) { log('time limit reached without a newer file'); process.exit(0); }
  await sleep(15 * 60e3);
}
