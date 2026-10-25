// B2: configuration, the frozen-plan guard, the store and small helpers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.B2_STORE ?? config.store;
export const results = path.join(root, 'results/sdn-ap-mixed-screening');
export const g1Dir = path.join(root, 'experiments/sdn-gp-starlink-ffm-match');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));

/** A step reads data only when the plan is frozen and its files are committed unchanged. */
export function frozen() {
  if (!config.frozen) throw new Error('plan is not frozen');
  for (const name of ['PLAN.md', 'config.json']) {
    const committed = execFileSync('git', ['show', `HEAD:experiments/sdn-ap-mixed-screening/${name}`], { cwd: root });
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`commit the frozen ${name} before data access`);
  }
}
/** The commit time of the plan's first commit: the registration. */
export function registeredMs() {
  const t = execFileSync('git', ['log', '--reverse', '--format=%cI', '--', 'experiments/sdn-ap-mixed-screening/PLAN.md'], { cwd: root }).toString().trim().split('\n')[0];
  return Date.parse(t);
}
export function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}
export const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
