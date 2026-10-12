// Shared by E16's steps: the configuration (config.json, frozen, with amendments.json merged over it), the window
// locks, the pinned modules, the command line and the compute throttle. Bookkeeping only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { loadModule } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const amendmentsPath = path.join(experimentDir, 'amendments.json');
export const SELECTION_FILE = 'results/e16/selection.json';
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const utcMs = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);
export const isoUtc = (ms) => new Date(ms).toISOString().replace('Z', '');
export const isoZ = (ms) => new Date(ms).toISOString();
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// config.json is never edited after the freeze; an amendment's changed numbers live in amendments.json
// ({"A1": {"date", "reason", "overrides": {...}}, ...}) and are merged over it in key order (PLAN.md, Amendments).
const merge = (base, over) => {
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof base?.[k] === 'object' ? merge(base[k], v) : v;
  return out;
};
const amendments = fs.existsSync(amendmentsPath) ? JSON.parse(fs.readFileSync(amendmentsPath, 'utf8')) : {};
export const config = Object.keys(amendments).filter((k) => /^A\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  .reduce((c, k) => merge(c, amendments[k].overrides ?? {}), JSON.parse(fs.readFileSync(configPath, 'utf8')));
export const amendmentsSha256 = fs.existsSync(amendmentsPath) ? sha256(fs.readFileSync(amendmentsPath)) : null;

const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function assertCommittedAndUnchanged(files, what) {
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`${what}: ${files.join(', ')} differs from its committed version`);
  const commit = git('log', '-1', '--format=%H', '--', ...files);
  if (!commit) throw new Error(`${what}: ${files.join(', ')} not committed`);
  return commit;
}

// PLAN.md, first paragraph: the test window opens only when (1) config.json is frozen and it, PLAN.md and
// amendments.json (when present) are committed and unchanged, and (2) results/e16/selection.json is committed and
// unchanged. Returns {freezeCommit, selectionCommit} for a test window and null otherwise.
export function assertWindowReadable(name) {
  if (!config.windows[name]) throw new Error(`unknown window ${name}; one of ${Object.keys(config.windows).join(', ')}`);
  if (!config.testWindows.includes(name)) return null;
  if (config.frozen !== true) throw new Error(`the ${name} window is locked until config.json is frozen (PLAN.md)`);
  const frozen = ['config.json', 'PLAN.md', 'amendments.json'].filter((f) => f !== 'amendments.json' || fs.existsSync(amendmentsPath))
    .map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  assertCommittedAndUnchanged(frozen, `the ${name} window is locked`);
  const commits = git('log', '--format=%H', '--', path.relative(repoRoot, configPath)).split('\n').filter(Boolean).reverse();
  const freezeCommit = commits.find((c) => JSON.parse(git('show', `${c}:${path.relative(repoRoot, configPath)}`)).frozen === true);
  if (!fs.existsSync(path.join(repoRoot, SELECTION_FILE))) throw new Error(`the ${name} window is locked until ${SELECTION_FILE} exists (validation step)`);
  const selectionCommit = assertCommittedAndUnchanged([SELECTION_FILE], `the ${name} window is locked`);
  return { freezeCommit, selectionCommit };
}

// The epoch span of a window for a regime class: GNSS MEO trains on the longer span (PLAN.md 3.3).
export function windowSpan(name, regimeClass) {
  if (name === 'train' && regimeClass === 'GNSS') return config.windows.trainGnssMeo;
  return config.windows[name];
}

// The modules E16 loads, each checked against the WASM SHA-256 pinned at the freeze.
export const modulesRoot = () => config.inputs.modules;
export async function loadPinned(relative, run = null) {
  const m = await loadModule(modulesRoot(), relative);
  const want = config.modulesBinary.wasmSha256[relative];
  if (!want) throw new Error(`${relative} is not pinned in config.json modulesBinary`);
  if (m.provenance.wasmSha256 !== want) throw new Error(`${relative} WASM ${m.provenance.wasmSha256} is not the pinned ${want}`);
  run?.addModule(m.provenance);
  return m;
}

export function cli(extra = {}) {
  const { values } = parseArgs({ options: { window: { type: 'string', default: 'train' }, objects: { type: 'string' }, ...extra }, allowPositionals: false });
  const locks = assertWindowReadable(values.window);
  return { values, window: values.window, locks, objects: values.objects ? new Set(values.objects.split(',').map(Number)) : null };
}

// Operating limit (config.compute): no new work while the one-minute load is above the pause level.
export async function throttle(log = () => {}) {
  for (let warned = false; os.loadavg()[0] > config.compute.pauseAboveLoad1m;) {
    if (!warned) { log(`load ${os.loadavg()[0].toFixed(1)} above ${config.compute.pauseAboveLoad1m}: pausing`); warned = true; }
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const resultsDir = path.join(repoRoot, 'results', 'e16');
export const runsCache = path.join(repoRoot, 'runs', 'cache', 'e16');
export { repoRoot };
