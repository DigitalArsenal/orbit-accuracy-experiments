// Shared by E6's steps: configuration, the freeze guard, arguments and paths.
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
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const home = (p) => p.replace(/^~(?=\/)/, os.homedir());
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
export function days(from, to) {
  const out = [];
  for (let t = dayMs(from); t <= dayMs(to); t += DAY_MS) out.push(isoDay(t));
  return out;
}

// The test window stays locked until PLAN.md and config.json are frozen:
// `frozen` true, both files committed and unchanged in this checkout.
export function assertFrozen(what) {
  if (config.frozen !== true) throw new Error(`${what}: the test window is locked until config.json is frozen (PLAN.md)`);
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`${what}: PLAN.md or config.json differs from its committed, frozen version`);
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error(`${what}: PLAN.md and config.json are not committed`);
}

// Which window of an arm (satnogs, slr) an instant (ms) belongs to: 'dev',
// 'test' or null. Reading a test-window instant asserts the freeze.
export function windowOf(ms, arm = 'satnogs') {
  for (const [name, spans] of Object.entries(config.windows?.[arm] ?? {})) {
    for (const [from, to] of spans) if (ms >= Date.parse(from) && ms < Date.parse(to)) return name;
  }
  return null;
}
export function guard(ms, what, arm = 'satnogs') {
  const w = windowOf(ms, arm);
  if (w === 'test') assertFrozen(what);
  return w;
}

export function cli(extra = {}) {
  const { values } = parseArgs({ options: { modules: { type: 'string' }, archive: { type: 'string' }, ...extra }, allowPositionals: true });
  return {
    values,
    modules: () => modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    satnogs: home(config.inputs.satnogs),
    seesat: home(config.inputs.seesat),
    nodes: home(config.inputs.providerNodes),
  };
}
