// Shared configuration, the frozen-plan guard and small file helpers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.G1_STORE ?? config.store;
export const results = path.join(root, 'results/sdn-gp-starlink-ffm-match');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const iso = (ms) => new Date(ms).toISOString();
export const DAY = 86400000;
export const read = (file) => JSON.parse(fs.readFileSync(file));
export function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

// A step reads data only when the plan is frozen and its files are committed unchanged.
export function frozen() {
  if (!config.frozen) throw new Error('plan is not frozen');
  for (const name of ['PLAN.md', 'config.json']) {
    const committed = execFileSync('git', ['show', `HEAD:experiments/sdn-gp-starlink-ffm-match/${name}`], { cwd: root });
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`commit the frozen ${name} before data access`);
  }
}

export function freeGiB(where = store) {
  fs.mkdirSync(where, { recursive: true });
  const s = fs.statfsSync(where);
  return (s.bavail * s.bsize) / 2 ** 30;
}
