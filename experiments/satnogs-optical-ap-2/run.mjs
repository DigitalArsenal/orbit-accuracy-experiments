#!/usr/bin/env node
// The registered run (PLAN.md): every scorable arc through fit.mjs (one process per arc, at most 8 under nice; a worker
// starts only with the 1-minute load under 45 and more than 20 GiB free), then score.mjs and readme.mjs.
//   node experiments/satnogs-optical-ap-2/run.mjs [--fits-only]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { REG, OUT, HERE } from './lib.mjs';

const WORKERS = 8;
const freeGiB = () => Number(execFileSync('df', ['-k', OUT]).toString().trim().split('\n').at(-1).split(/\s+/)[3]) / 1048576;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const queue = REG.arcs.filter((a) => a.scorable && !fs.existsSync(path.join(OUT, a.id, 'fit.json'))).map((a) => a.id);
// Longest arcs first.
queue.sort((a, b) => REG.arcs.find((x) => x.id === b).hours - REG.arcs.find((x) => x.id === a).hours);
console.log(`${queue.length} arcs to fit: ${queue.join(' ')}`);
const running = new Set();
while (queue.length || running.size) {
  if (queue.length && running.size < WORKERS && os.loadavg()[0] < 45 && freeGiB() > 20) {
    const id = queue.shift();
    fs.rmSync(path.join(OUT, id), { recursive: true, force: true });
    const child = spawn('nice', ['-n', '10', process.execPath, path.join(HERE, 'fit.mjs'), id], { stdio: ['ignore', 'inherit', 'inherit'] });
    running.add(child.pid);
    console.log(`start ${id} pid ${child.pid} (load ${os.loadavg()[0].toFixed(1)})`);
    child.on('exit', (code) => { running.delete(child.pid); console.log(`exit ${id} code ${code}`); });
    await wait(2000);
  } else await wait(5000);
}
if (!process.argv.includes('--fits-only')) for (const step of ['score.mjs', 'readme.mjs']) execFileSync(process.execPath, [path.join(HERE, step)], { stdio: 'inherit' });
