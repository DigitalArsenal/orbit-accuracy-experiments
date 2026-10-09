// Shared by E1's steps: configuration, arguments, paths and the test-window
// lock.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { modulesRoot } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { readElementSets } from '../../harness/gp-archive.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// PLAN.md §1 and rule 2: the test window is read only after the plan is
// frozen by a commit. Frozen means config.json says so, PLAN.md and
// config.json in the working tree are the committed ones, and HEAD's
// config.json says so too. Returns the freeze commit (the first commit whose
// config.json is frozen) for the manifest; throws otherwise.
export function freezeCommit() {
  if (!config.frozen) throw new Error('the test window is locked until config.json is frozen (PLAN.md §1)');
  const files = ['PLAN.md', 'config.json'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  try {
    git('diff', '--quiet', 'HEAD', '--', ...files);
  } catch {
    throw new Error(`the test window is locked: ${files.join(' and ')} differ from HEAD; the freeze must be a commit`);
  }
  const committed = JSON.parse(git('show', `HEAD:${files[1]}`));
  if (committed.frozen !== true) throw new Error('the test window is locked: HEAD\'s config.json is not frozen');
  const commits = git('log', '--format=%H', '--', files[1]).split('\n').reverse();
  const first = commits.find((c) => JSON.parse(git('show', `${c}:${files[1]}`)).frozen === true);
  return first;
}

// Throws unless `name` may be read now.
export function assertReadable(name) {
  if (!config.windows[name]) throw new Error(`unknown window ${name}; one of ${Object.keys(config.windows).join(', ')}`);
  if (name === 'test') freezeCommit();
}

// Common flags; a step adds its own in `extra`.
export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'a0' },
      modules: { type: 'string' },
      archive: { type: 'string' },
      reference: { type: 'string' },
      objects: { type: 'string' },  // comma-separated NORAD numbers, for smoke runs
      ...extra,
    },
  });
  assertReadable(values.window);
  const window = config.windows[values.window];
  return {
    values,
    window: { name: values.window, from: window[0], to: window[1] },
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    reference: path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference),
    objects: values.objects ? new Set(values.objects.split(',').map(Number)) : null,
  };
}

// Element sets of the satellites in `objects` whose epochs lie in a window
// (or [from, to] inside it), with the plan's selection (§3).
export function readWindow(archive, name, objects, range) {
  assertReadable(name);
  const [from, to] = range ?? config.windows[name];
  const [lo, hi] = config.windows[name];
  if (from < lo || to > hi) throw new Error(`${from}..${to} is outside the ${name} window`);
  return readElementSets(archive, from, to, {
    keep: (n) => objects.has(n),
    theory: config.elementSets.meanElementTheory,
    ephemerisType: config.elementSets.ephemerisType,
    duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds,
  });
}
