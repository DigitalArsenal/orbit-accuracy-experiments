// B1: configuration, the frozen-plan guard, the store and small helpers. The SDN-AP snapshot is pinned before any G1 library loads.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.B1_STORE ?? config.store;
export const results = path.join(root, 'results/sdn-ap-baselines');
export const g1Dir = path.join(root, 'experiments/sdn-gp-starlink-ffm-match');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
process.env.SDNGP_SNAPSHOT = config.g1.sdnapBuild; // G1's openSdngp runs this snapshot of its store, nothing newer

export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));

/** A step reads data only when the plan is frozen and its files are committed unchanged. */
export function frozen() {
  if (!config.frozen) throw new Error('plan is not frozen');
  for (const name of ['PLAN.md', 'config.json']) {
    const committed = execFileSync('git', ['show', `HEAD:experiments/sdn-ap-baselines/${name}`], { cwd: root });
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`commit the frozen ${name} before data access`);
  }
}

export function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

export const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
