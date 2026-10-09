// Shared by E4's steps: configuration, the freeze guard, arguments and paths.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { modulesRoot } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const HOUR_MS = 3600000;
export const DAY_MS = 86400000;
export const home = (p) => p.replace(/^~(?=\/)/, os.homedir());

// Operator files are E4's test data: no step reads them unless PLAN.md and
// config.json are frozen, committed and unchanged in this checkout.
export function assertFrozen() {
  if (config.frozen !== true) throw new Error('E4 reads operator files only after the freeze (config.json "frozen": true)');
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error('PLAN.md or config.json differs from its committed, frozen version');
}

export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      modules: { type: 'string' },
      nodes: { type: 'string' },
      archive: { type: 'string' },
      inputs: { type: 'string' },   // directory of extracted operator files (step 00 output)
      truth: { type: 'string' },    // directory of converted truth (step 05 output)
      provider: { type: 'string' },
      ...extra,
    },
  });
  return {
    values,
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    nodes: path.resolve(home(values.nodes ?? config.inputs.providerNodes)),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    inputs: path.resolve(values.inputs ?? path.join(repoRoot, 'runs', 'cache', 'e4-inputs')),
    truth: path.resolve(values.truth ?? path.join(repoRoot, 'runs', 'cache', 'e4-truth')),
  };
}

export const providers = (only) => Object.keys(config.providers).filter((p) => !only || only.split(',').includes(p));
