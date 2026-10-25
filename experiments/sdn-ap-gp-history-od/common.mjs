// Shared configuration of the GP-history OD experiment: the frozen-plan guard, paths and small helpers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
export const windows = JSON.parse(fs.readFileSync(path.join(dir, 'windows.json'), 'utf8')).windows;
export const results = path.join(root, 'results/sdn-ap-gp-history-od');
// local only: element-set histories and per-window rows stay on this machine (Space-Track data is results only)
export const store = process.env.GPH_STORE ?? path.join(config.archive, 'sdn-ap-gp-history-od');
export const DAY = 86400000;
export const FIT_MS = config.window.fitSeconds * 1000;
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const endOf = (w) => Date.parse(w.startUtc) + FIT_MS;
export const windowKey = (w) => `${w.regime}|${w.source}|${w.id}|${w.startUtc}`;

// A step reads data only when the plan is frozen and its files are committed unchanged.
export function frozen() {
  if (!config.frozen) throw new Error('plan is not frozen');
  for (const name of ['PLAN.md', 'config.json', 'windows.json']) {
    const committed = execFileSync('git', ['show', `HEAD:experiments/sdn-ap-gp-history-od/${name}`], { cwd: root, maxBuffer: 1 << 26 });
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`commit the frozen ${name} before data access`);
  }
}

export function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

/** --shard k/n: this process takes every n-th item. */
export function shardOf(spec = args.shard ?? '0/1') {
  const [k, n] = spec.split('/').map(Number);
  return { k, n, mine: (i) => i % n === k };
}
