// C2: configuration, the frozen-plan guard, the integrity log (P10), receipts, and the object table. Records and statistics only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.C2_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-covariance-calibration');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const DAY = 86400e3, HOUR = 3600e3;
export const iso = (t) => new Date(Math.round(t)).toISOString();
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));

/** A step reads data only when the plan is frozen and PLAN.md and config.json are committed unchanged. */
export function frozen() {
  if (!config.frozen) throw new Error('plan is not frozen');
  for (const name of ['PLAN.md', 'config.json']) {
    const committed = execFileSync('git', ['show', `HEAD:experiments/ffm-covariance-calibration/${name}`], { cwd: root });
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`commit the frozen ${name} before data access`);
  }
}

// Paths this experiment must never open (P10): B2 part 1a truth, score and fit rows of Starlink, capture-cycle content, census results.
const FORBIDDEN = [/\/sdn-ap-mixed-screening\/rows\/starlink-/, /\/operator-capture\/cycles\/[^/]+\/./, /propagator-catalog-census/];

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
}

export function gitHead() { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(); }

/** A receipt under results/ffm-covariance-calibration/: the value, the experiments commit and the integrity log. */
export function writeReceipt(name, value, opened) {
  fs.mkdirSync(results, { recursive: true });
  const body = { receipt: name, createdUtc: new Date().toISOString(), experimentsCommit: gitHead(), ...value, opened: opened ? opened.list() : [] };
  const file = path.join(results, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(body, null, 1)}\n`);
  return file;
}

/** The reference roots C2 reads (converted precise orbits, analysis/reference-states format). */
export const REFERENCE_ROOTS = [
  '/opt/data/sdn-archive/reference-states/reference',
  '/opt/data/sdn-archive/reference-states/reference-leo-pod-2',
  '/opt/data/sdn-archive/e14-covariance-realism/reference',
];

/** The named objects of section 3.4 (NORAD numbers as the archive identifies them). GNSS and COSMIC-2 come from P9's selection. */
export const NAMED = {
  'Swarm A': 39452, 'Swarm B': 39451, 'Swarm C': 39453, 'GRACE-FO 1': 43476, 'GRACE-FO 2': 43477, 'TerraSAR-X': 31698,
  'Sentinel-1A': 39634, 'Sentinel-1C': 62261, 'Sentinel-1D': 66315,
  Ajisai: 16908, LARES: 38077, LARETS: 27944, Starlette: 7646, WESTPAC: 25398, Stella: 22824,
  'LAGEOS-1': 8820, 'LAGEOS-2': 22195, 'LARES-2': 53105, 'Etalon-1': 19751, 'Etalon-2': 20026,
};
/** Clusters (independent orbits): Swarm A+C and GRACE-FO 1+2 count as one each. */
export const clusterOf = (norad) => ({ 39453: 39452, 43477: 43476 }[norad] ?? norad);
