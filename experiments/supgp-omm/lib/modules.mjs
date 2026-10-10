// Module loading and provenance. The fitter comes from its own checkout (read-only);
// the readers come from the canonical modules checkout.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadModule } from '../../../harness/modules.mjs';
import { PATHS } from '../config.mjs';

export const FITTER = 'analysis/gp-error-model';

export const loadFitter = (root = PATHS.fitModules) => loadModule(root, FITTER);
export const loadReader = (relative, root = PATHS.readerModules) => loadModule(root, relative);

const git = (dir, args) => {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};

// {commit, dirty} of a checkout; the pass records which fitter build it ran.
export function checkout(dir) {
  return { dir, commit: git(dir, ['rev-parse', 'HEAD']), branch: git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']), dirty: (git(dir, ['status', '--porcelain', '--untracked-files=no', '--', FITTER]) ?? '').length > 0 };
}

export function artifactInfo(root, relative) {
  const file = path.join(root, relative, 'dist/isomorphic/module.wasm');
  return fs.existsSync(file) ? { path: relative, bytes: fs.statSync(file).size } : { path: relative, missing: true };
}
