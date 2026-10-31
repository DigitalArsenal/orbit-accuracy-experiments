// C3-small: configuration, the registered-plan guard, the integrity log (P10), receipts. Records and statistics only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json')));
export const store = process.env.C3_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-covariance-adaptive');
export const c2Results = path.join(root, 'results/ffm-covariance-calibration');
export const c2Store = '/opt/data/sdn-archive/ffm-covariance-calibration';
export const c2Rows = path.join(c2Store, 'rows');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const DAY = 86400e3, HOUR = 3600e3;
export const iso = (t) => new Date(Math.round(t)).toISOString();
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const gitHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();

/** A step reads data only when PLAN.md, config.json and build.json are committed unchanged. */
export function registered() {
  if (!config.registered) throw new Error('the plan is not registered');
  for (const name of ['PLAN.md', 'config.json', 'build.json']) {
    const rel = `experiments/ffm-covariance-adaptive/${name}`;
    let committed;
    try { committed = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: root, maxBuffer: 1 << 26 }); } catch { throw new Error(`commit ${rel} before data access`); }
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`commit ${rel} before data access`);
  }
}

// What this experiment must never open (P10). Fresh truth is refused by lib/chain.mjs through its allowed-span check.
const FORBIDDEN = [
  /\/ffm-covariance-calibration\/rows\/(heldout|R\d\.heldOut|S\.transfer)/, /\/ffm-covariance-calibration\/rows-(S-)?run1\//, /\/ffm-covariance-calibration\/rows-sgp4xp\//,
  /\/sdn-ap-mixed-screening\/rows\/starlink-/, /\/sdn-ap-mixed-screening\/.*part-?(1a|5)/, /\/operator-capture\/cycles\//, /propagator-catalog-census/,
  /\/dl\/ids-man/, /ids_cadence/, /\/hac\/ids-doris\//, /\/propagator\/sgp4-xp\/(third_party|src)\//,
];
/** The integrity log (P10): every path a step opens, refused when forbidden. */
export class Opened {
  constructor() { this.paths = new Map(); }
  add(file, label = '') {
    const abs = path.resolve(file);
    if (FORBIDDEN.some((re) => re.test(abs))) throw new Error(`P10: refusing to open ${abs}`);
    if (!this.paths.has(abs)) this.paths.set(abs, label);
    return abs;
  }
  read(file, label) { return fs.readFileSync(this.add(file, label)); }
  list() { return [...this.paths.entries()].map(([p, label]) => ({ path: p, label })).sort((a, b) => a.path.localeCompare(b.path)); }
  /** Per directory group the count and label, and the SHA-256 of the full sorted list, written in full to <store>/opened/<receipt>.json (local). */
  summary(name) {
    const list = this.list();
    const groups = new Map();
    for (const { path: p, label } of list) {
      const g = p.replace(/\/(?:[^/]*\d{4,}[^/]*)(?:\/.*)?$/, '/*').replace(/\/[^/]+\.(json|oem|gz|np2|txt|jsonl|html)$/, '/*');
      const e = groups.get(g) ?? { group: g, files: 0, labels: new Set() };
      e.files += 1; e.labels.add(label); groups.set(g, e);
    }
    const full = JSON.stringify(list);
    const file = path.join(store, 'opened', `${name}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, full);
    return { files: list.length, sha256: sha256(full), fullList: file, groups: [...groups.values()].map((e) => ({ group: e.group, files: e.files, labels: [...e.labels] })) };
  }
}

/** A receipt under results/ffm-covariance-adaptive/: the value, the experiments commit and the integrity log. */
export function writeReceipt(name, value, opened) {
  fs.mkdirSync(results, { recursive: true });
  const body = { receipt: name, createdUtc: new Date().toISOString(), experimentsCommit: gitHead(), ...value, opened: opened ? opened.summary(name) : null };
  const file = path.join(results, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(body, null, 1)}\n`);
  return file;
}

export const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
/** C2's calibration and validation rows of one class key (R3, R2, R2.O form), never a held-out file. */
export function c2RowsOf(prefix, opened) {
  if (/heldOut|heldout|S\.transfer/.test(prefix)) throw new Error(`P10: ${prefix} is held out`);
  return fs.readdirSync(c2Rows).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort().flatMap((f) => { const p = opened ? opened.add(path.join(c2Rows, f), 'C2 cal/val rows') : path.join(c2Rows, f); return readJsonl(p); });
}
/** The registered cutoffs of a span, every n days at 00:00 UTC. */
export function grid(from, to, everyDays) { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += everyDays * DAY) out.push(t); return out; }
