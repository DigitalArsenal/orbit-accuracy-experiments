// XM: configuration, the frozen-plan guard (PLAN.md, config.json and build.json committed unchanged before any score),
// the modules checkout at the registered build, the store and small helpers.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const build = JSON.parse(fs.readFileSync(path.join(root, config.build.file)));
export const store = process.env.XM_STORE ?? config.store;
export const results = path.join(root, 'results/xp-atmosphere-merit');
export const g1Dir = path.join(root, 'experiments/sdn-gp-starlink-ffm-match');
export const b1Dir = path.join(root, 'experiments/sdn-ap-baselines');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const DAY = 86400000;
export const HOUR = 3600000;
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));

/** A scoring step runs only when the plan is frozen: PLAN.md, config.json and build.json committed and unchanged. */
export function frozen() {
  if (!config.frozen) throw new Error('the plan is not frozen: a scoring step waits for the freeze commit');
  for (const rel of ['experiments/xp-atmosphere-merit/PLAN.md', 'experiments/xp-atmosphere-merit/config.json', config.build.file]) {
    const committed = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root });
    if (!committed.equals(fs.readFileSync(path.join(root, rel)))) throw new Error(`commit the frozen ${rel} before any score`);
  }
}

/** The modules checkout at build.json's commit, every module the steps load at its registered SHA-256: SDN_MODULES_ROOT, else
 *  the sibling worktree space-data-network-modules--<this task>. */
export function modulesRoot() {
  const candidate = process.env.SDN_MODULES_ROOT ?? path.resolve(root, '..', `space-data-network-modules--${config.task}`);
  const head = execFileSync('git', ['-C', candidate, 'rev-parse', 'HEAD']).toString().trim();
  if (head !== build.modulesCommit) throw new Error(`modules checkout ${candidate} is at ${head}, not the registered ${build.modulesCommit}`);
  for (const [rel, want] of Object.entries(build.wasmSha256)) {
    const got = sha256(fs.readFileSync(path.join(candidate, rel, 'dist/isomorphic/module.wasm')));
    if (got !== want) throw new Error(`${rel}: wasm ${got} is not the registered ${want}`);
  }
  return candidate;
}

export function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}
export function appendJsonl(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}
export const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
export const iso = (t) => new Date(Math.round(t)).toISOString();
export const ms = (text) => Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
export const dateOf = (t) => new Date(t).toISOString().slice(0, 10);
export const dayStart = (t) => Date.parse(`${dateOf(t)}T00:00:00Z`);
/** The UTC days from `from` to `to` (YYYY-MM-DD, inclusive), as millisecond midnights. */
export function daysOf(from, to) {
  const out = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) out.push(t);
  return out;
}
export const median = (v) => { const a = v.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const k = Math.floor(a.length / 2); return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2; };
export const quantile = (v, q) => { const a = v.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const p = q * (a.length - 1), lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); };
export const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
