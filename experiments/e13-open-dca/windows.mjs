// The test splits stay locked until PLAN.md and config.json are frozen by a commit: `frozen` must be true and both files committed and
// unchanged here (the guard of E5 and E8, kept).
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../../harness/provenance.mjs';
import { config, experimentDir } from './common.mjs';

export function assertWindowReadable(name) {
  if (name === 'dev') return;
  if (config.frozen !== true) throw new Error(`the ${name} split is locked until config.json is frozen (PLAN.md)`);
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`the ${name} split is locked: PLAN.md or config.json differs from its frozen commit`);
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error(`the ${name} split is locked: PLAN.md and config.json are not committed`);
}
