// A pool of child processes for E10's steps: each job is a JSON spec run by
// `node <script> --job <spec>`, logged to its own file. Process control only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };

// jobs: [{name, ...spec}]; runs at most `workers` at once; resolves with the
// names of the jobs that exited non-zero.
export async function runPool({ jobs, workers, script, dir }) {
  const specDir = path.join(dir, 'specs'), logsDir = path.join(dir, 'logs');
  for (const d of [specDir, logsDir]) fs.mkdirSync(d, { recursive: true });
  const failed = [];
  const launch = (job) => new Promise((resolve) => {
    const spec = path.join(specDir, `${job.name}.json`), logFile = path.join(logsDir, `${job.name}.log`);
    fs.writeFileSync(spec, JSON.stringify(job));
    const log = fs.openSync(logFile, 'a');
    const p = spawn(process.execPath, [script, '--job', spec], { stdio: ['ignore', log, log] });
    p.on('exit', (code) => {
      fs.closeSync(log);
      const tail = fs.readFileSync(logFile, 'utf8').trim().split('\n').at(-1);
      console.log(`${new Date().toISOString()} ${code === 0 ? 'done' : `FAILED (${code})`} ${job.name}: ${tail}`);
      if (code !== 0) failed.push(job.name);
      resolve();
    });
  });
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.max(1, workers) }, async () => { while (queue.length) await launch(queue.shift()); }));
  return failed;
}
