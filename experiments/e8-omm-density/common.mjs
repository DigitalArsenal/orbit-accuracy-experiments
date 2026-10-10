// Shared by E8's steps: configuration, the test-window guard, the modules,
// and E5's readers of the drivers (SET JB2008 indices, GFZ daily space
// weather), whose inputs are the same files. Reading and re-framing only;
// every density and orbit is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitState, loadModule, modulesRoot } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export { setIndices, jb2008Rows, gfzDays, spwRows, maxKp } from '../e5-density-calibration/common.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const mjdOfMs = (ms) => ms / DAY_MS + 40587;
export const msOfMjd = (mjd) => (mjd - 40587) * DAY_MS;
export const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const isoUtc = (ms) => new Date(ms).toISOString().replace('Z', '');
export const inRepo = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
export const regimeOf = (kp) => config.regimes.bins.find(([, lo, hi]) => kp >= lo && kp < hi)[0];

// The test windows stay locked until PLAN.md and config.json are frozen by a
// commit: `frozen` must be true and both files committed and unchanged here.
export function assertWindowReadable(name) {
  if (name === 'validation') return;
  if (config.frozen !== true) throw new Error(`the ${name} window is locked until config.json is frozen (PLAN.md)`);
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`the ${name} window is locked: PLAN.md or config.json differs from its frozen commit`);
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error(`the ${name} window is locked: PLAN.md and config.json are not committed`);
}

// Issue-day spans of a named window: [{from, to}], each inclusive.
export function windowSpans(name) {
  assertWindowReadable(name);
  const w = config.windows[name];
  if (!w) throw new Error(`unknown window ${name}`);
  return (Array.isArray(w[0]) ? w : [w]).map(([from, to]) => ({ from, to }));
}
export function issueDays(spans) {
  const out = [];
  for (const s of spans) for (let t = dayMs(s.from); t <= dayMs(s.to); t += DAY_MS) out.push(t);
  return out;
}
export const isHistorical = (name) => name === 'historicalTest';

// Modules from one checkout (--modules, SDN_MODULES_ROOT, or the configured
// place in the stack), each recorded in the run manifest.
export const modulesDir = (flag) => modulesRoot({ flag, configured: config.inputs.modules, repoRoot });
export async function loadModules(run, names, { modules: flag } = {}) {
  const root = modulesDir(flag);
  const loaded = {};
  for (const name of names) {
    loaded[name] = await loadModule(root, name);
    run.addModule({ ...loaded[name].provenance, checkout: root, checkoutState: gitState(root) });
  }
  return { root, loaded };
}

// Calls a JSON method of a module and parses its single JSON output.
export async function callJson(module, method, port, value) {
  const response = await module.invoke(method, [{ portId: port, payload: Buffer.from(JSON.stringify(value)), typeRef: { schemaName: 'application/json' } }]);
  return JSON.parse(Buffer.from(response.outputs[0].payload).toString('utf8'));
}

// runs/<id>/<file> of an earlier run, with its manifest's config hash for provenance.
export function readRun(id, file) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', id, file), 'utf8'));
}
export function runConfigHash(id) {
  return readRun(id, 'manifest.json').config.sha256;
}
