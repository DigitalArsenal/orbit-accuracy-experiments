// Shared by E12's steps: configuration, the test-data lock, the modules and
// environment, run manifests, shards and JSONL output. Bookkeeping only.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { modulesRoot } from '../../harness/modules.mjs';
import { repoRoot, startRun } from '../../harness/provenance.mjs';
import { loadEnvironment } from './environment.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Real operator data is scored only after PLAN.md and config.json are frozen
// by a commit (README rule 2): `frozen` true, both committed and unchanged.
export function assertFrozen() {
  if (config.frozen !== true) throw new Error('operator data is locked until config.json is frozen (PLAN.md section 9)');
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error('operator data is locked: PLAN.md or config.json differs from its committed state');
  return git('log', '-1', '--format=%H', '--', path.relative(repoRoot, configPath));
}

export function cli(options = {}) {
  const { values } = parseArgs({ options: { modules: { type: 'string' }, shard: { type: 'string', default: '0/1' }, resume: { type: 'string' }, ...options } });
  const [index, count] = values.shard.split('/').map(Number);
  return { values, shard: { index, count }, modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }) };
}

export async function begin(step, args) {
  const { values, shard, modules } = args;
  const run = startRun({ experiment: 'e12-physics-match', step: `${step}-s${shard.index}of${shard.count}`, configPath, modulesDir: modules, args: values, resume: values.resume });
  const env = await loadEnvironment({ modulesDir: modules, config, run });
  run.checkpoint();
  return { run, env };
}

// Append-only JSONL in the run directory; returns the ids already written
// (so a resumed run skips them).
export function jsonl(run, name) {
  const file = path.join(run.dir, name);
  const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
  return { done, write: (row) => fs.appendFileSync(file, `${JSON.stringify(row)}\n`) };
}
