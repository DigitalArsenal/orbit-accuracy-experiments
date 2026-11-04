// Five-day CA forecast (FIVE-DAY.md): the re-measure on one $OCM and its E2E. Every state, covariance and Pc is a module's.
//   node experiments/five-day-ca/run.mjs fits         AP, XP and S fitted and flown on the archived inputs at the pinned build, with their
//                                                     endpoints, fitted $OCM and signed errors, in 60 hash partitions per label over 12 workers
//   node experiments/five-day-ca/run.mjs ussf         the Space Force XP (U) likewise, in its own rows (no covariance product is U's)
//   node experiments/five-day-ca/run.mjs covariance   the carried-covariance products of every window (covariance-products.mjs), likewise
//   node experiments/five-day-ca/run.mjs --check      the E2E: pinned windows re-fitted and re-flown exactly; every published number rebuilt
//                                                     from the stored products equals the committed results
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { config, registration, dir, modules, store } from './guard.mjs';
import { readRows } from './statistics.mjs';
registration();
const LABELS = ['regimes', 'truth2', 'truth'], PARTITIONS = 60, WORKERS = 12;
/** Each label's runner and its registered window selection (the original five-day.mjs jobs). */
const FIT_JOBS = {
  regimes: ['regimes.mjs', ['--groups', 'LS,DO,GD,IG,GE,HE,HX']],
  truth2: ['truth.mjs', ['--xm', '--from', '2026-01-01', '--to', '2026-05-31'], { XP2F_CONTROL: '1' }],
  truth: ['truth.mjs', ['--from', '2025-04-01', '--to', '2025-12-21']],
};
const partition = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % PARTITIONS;
/** Run jobs [{label, script, args, env, out}] over WORKERS processes; each job is one partition. */
async function pool(jobs) {
  let next = 0;
  const statuses = await Promise.allSettled(Array.from({ length: WORKERS }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      fs.mkdirSync(job.out, { recursive: true });
      const fd = fs.openSync(`${job.out}/worker-${job.shard}.log`, 'a');
      const child = spawn(process.execPath, ['--max-old-space-size=3072', `experiments/five-day-ca/${job.script}`, ...job.args, '--shard', `${job.shard}/${PARTITIONS}`], { env: { ...process.env, SDN_MODULES_ROOT: modules(), ...job.env }, stdio: ['ignore', fd, fd] });
      fs.closeSync(fd);
      fs.appendFileSync(`${store}/processes.jsonl`, `${JSON.stringify({ pid: child.pid, script: job.script, label: job.label, shard: job.shard, partitions: PARTITIONS, started: new Date().toISOString() })}\n`);
      const [code] = await once(child, 'exit');
      console.log(JSON.stringify({ script: job.script, label: job.label, shard: job.shard, code }));
      if (code !== 0) throw new Error(`${job.script} ${job.label} ${job.shard}/${PARTITIONS} exited ${code}`);
    }
  }));
  const failed = statuses.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
}
const phase = process.argv[2];
if (phase === 'fits' || phase === 'ussf') {
  fs.mkdirSync(store, { recursive: true });
  const jobs = [];
  for (const shard of Array.from({ length: PARTITIONS }, (_, k) => k)) for (const label of LABELS) {
    const [script, args, env = {}] = FIT_JOBS[label], out = dir(phase, label);
    jobs.push({ label, shard, script, env, out, args: ['--out', out, ...(phase === 'fits' ? ['--arms', 'AP,XP,S', '--products', 'true'] : ['--arms', 'U']), ...args] });
  }
  await pool(jobs);
} else if (phase === 'covariance') {
  const jobs = [];
  for (const label of LABELS) {
    const done = new Set(readRows(dir('covariance', label)).map((r) => r.key));
    const pending = new Set(readRows(dir('fits', label)).filter((r) => !done.has(r.key)).map((r) => partition(r.key)));
    for (const shard of [...pending].sort((a, b) => a - b)) jobs.push({ label, shard, script: 'covariance-products.mjs', env: {}, out: dir('covariance', label), args: ['--label', label] });
  }
  await pool(jobs);
} else if (process.argv.includes('--check')) {
  await import('./check.mjs');
} else {
  throw new Error('run.mjs fits | ussf | covariance | --check');
}
