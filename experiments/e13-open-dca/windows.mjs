// The test splits stay locked until PLAN.md and config.json are frozen by a commit: `frozen` must be true and both files committed and
// unchanged here (the guard of E5 and E8, kept). The Swarm and GRACE-FO densities and orbits of a test split need one thing more: the
// solver configuration chosen on the development split (`results/e13/selection.json`, step 40) is committed and unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../../harness/provenance.mjs';
import { config, experimentDir } from './common.mjs';

export const SELECTION_FILE = 'results/e13/selection.json';
const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();

function assertCommittedAndUnchanged(files, what) {
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`${what}: ${files.join(', ')} differs from its committed version`);
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error(`${what}: ${files.join(', ')} not committed`);
}

// Arcs of the Planet states (no Swarm or GRACE-FO datum is involved): the freeze commit.
export function assertWindowReadable(name) {
  if (name === 'dev') return;
  if (config.frozen !== true) throw new Error(`the ${name} split is locked until config.json is frozen (PLAN.md)`);
  assertCommittedAndUnchanged(['config.json', 'PLAN.md', 'amendments.json'].map((f) => path.relative(repoRoot, path.join(experimentDir, f))), `the ${name} split is locked`);
}

// Swarm and GRACE-FO densities and orbits of a split: the freeze commit, and for a test split the committed selection.
export function assertDensityReadable(name) {
  assertWindowReadable(name);
  if (name === 'dev') return;
  if (!fs.existsSync(path.join(repoRoot, SELECTION_FILE))) throw new Error(`the ${name} densities are locked until ${SELECTION_FILE} (step 40) exists`);
  assertCommittedAndUnchanged([SELECTION_FILE], `the ${name} densities are locked`);
}

// The split a UTC day (YYYY-MM-DD) belongs to, or null.
export function splitOfDay(dayIso) {
  for (const [name, [from, to]] of Object.entries(config.planet.split)) if (dayIso >= from && dayIso <= to) return name;
  return null;
}
export function assertDensityDayReadable(dayIso) {
  const name = splitOfDay(dayIso);
  if (!name) throw new Error(`${dayIso} is outside every split`);
  assertDensityReadable(name);
}
