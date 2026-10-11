// The test splits stay locked until two things are committed and unchanged: the freeze (config.json with `frozen: true`, PLAN.md and amendments.json) and
// the solver configuration chosen on the development split (`results/e13/selection.json`, step 40). One guard serves every step that reads a test split:
// the Planet arcs (step 10), the Swarm and GRACE-FO densities and orbits (steps 20, 30, 35), the scoring. It follows PLAN.md sections 7 and 9 (Deviation D1:
// until this guard was closed the arcs needed the freeze only, and 176 testA arcs were computed before the selection existed).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot as defaultRoot } from '../../harness/provenance.mjs';
import { config as defaultConfig, experimentDir as defaultDir } from './common.mjs';

export const SELECTION_FILE = 'results/e13/selection.json';
const FROZEN_FILES = ['config.json', 'PLAN.md', 'amendments.json'];

function assertCommittedAndUnchanged(root, files, what) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`${what}: ${files.join(', ')} differs from its committed version`);
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error(`${what}: ${files.join(', ')} not committed`);
}

// `options` is for the test, which builds a repository of its own: {root, dir, cfg}.
export function assertWindowReadable(name, { root = defaultRoot, dir = defaultDir, cfg = defaultConfig } = {}) {
  if (name === 'dev') return;
  if (cfg.frozen !== true) throw new Error(`the ${name} split is locked until config.json is frozen (PLAN.md)`);
  const frozen = FROZEN_FILES.filter((f) => f !== 'amendments.json' || fs.existsSync(path.join(dir, f))).map((f) => path.relative(root, path.join(dir, f)));
  assertCommittedAndUnchanged(root, frozen, `the ${name} split is locked`);
  if (!fs.existsSync(path.join(root, SELECTION_FILE))) throw new Error(`the ${name} split is locked until ${SELECTION_FILE} (step 40) exists`);
  assertCommittedAndUnchanged(root, [SELECTION_FILE], `the ${name} split is locked`);
}
// The densities and orbits of a split: the same lock (kept as a name for the steps that read them).
export const assertDensityReadable = assertWindowReadable;

// The split a UTC day (YYYY-MM-DD) belongs to, or null.
export function splitOfDay(dayIso, cfg = defaultConfig) {
  for (const [name, [from, to]] of Object.entries(cfg.planet.split)) if (dayIso >= from && dayIso <= to) return name;
  return null;
}
export function assertDensityDayReadable(dayIso) {
  const name = splitOfDay(dayIso);
  if (!name) throw new Error(`${dayIso} is outside every split`);
  assertWindowReadable(name);
}
