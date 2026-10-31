// XM5: configuration, the registration guard (PLAN.md and config.json as registered, amendments only at the plan's end), the run's own
// sources committed, XM3's code unchanged at its commit, XM3's stored rows (read only, digest checked) and committed table (git show,
// SHA-256 checked). Everything else comes from XM3's common.mjs: XM's helpers, the store helpers and the pinned wasm.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.XM5_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-tail-cause');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
const here = 'experiments/ffm-tail-cause';

/** The registration commit, pushed to origin wip/<task>/registration before any score. */
export const REGISTRATION = '6ce029557486cf135cad6339a3773b6c036c32f6';

try { git('diff', '--quiet', config.xm3.commit, '--', config.xm3.dir); } catch { throw new Error(`${config.xm3.dir} differs from XM3's commit ${config.xm3.commit}`); }
export const XM3 = await import(path.join(root, config.xm3.dir, 'common.mjs'));

/** PLAN.md and config.json as registered: every step that reads registered data runs only then. An amendment goes at the plan's end. */
export function frozen() {
  if (!config.frozen) throw new Error('the plan is not frozen');
  const plan = git('show', `${REGISTRATION}:${here}/PLAN.md`), now = fs.readFileSync(path.join(dir, 'PLAN.md'));
  if (now.length < plan.length || !now.subarray(0, plan.length).equals(plan)) throw new Error(`PLAN.md differs from the registration ${REGISTRATION}; an amendment goes at its end`);
  if (!git('show', `${REGISTRATION}:${here}/config.json`).equals(fs.readFileSync(path.join(dir, 'config.json')))) throw new Error(`config.json differs from the registration ${REGISTRATION}`);
}

/** A file as committed: at HEAD once the experiment is on main, until then at the runner's wip commit. null when neither holds it. */
export function committed(rel) {
  for (const ref of ['HEAD', `${config.wipRefPrefix}/runner`]) {
    try { return git('show', `${ref}:${rel}`); } catch { /* the next ref */ }
  }
  return null;
}

/** The run's sources: a scored run and the check use committed sources only; their SHA-256 go in every row. */
export const SOURCES = ['run.mjs', 'table.mjs', 'common.mjs'];
export function sourcesCommitted() {
  const out = {};
  for (const file of SOURCES) {
    const rel = `${here}/${file}`, bytes = fs.readFileSync(path.join(dir, file));
    const held = committed(rel);
    if (!held) throw new Error(`${rel} is not committed`);
    if (!held.equals(bytes)) throw new Error(`${rel} differs from its commit; commit it before a scored run`);
    out[file] = XM3.sha256(bytes);
  }
  return out;
}

/** XM3's stored rows under O (read only), a Map by key, their digest checked as XM3's table computes it. */
export async function xm3Rows() {
  const { storedRows } = await import(path.join(root, config.xm3.dir, 'table.mjs'));
  const rows = storedRows();
  const digest = XM3.sha256(rows.map(XM3.comparable).join('\n'));
  if (!digest.startsWith(config.xm3.rowsDigest)) throw new Error(`XM3's stored rows digest ${digest.slice(0, 12)} is not the registered ${config.xm3.rowsDigest}`);
  return new Map(rows.filter((r) => r.condition === 'O').map((r) => [r.key, r]));
}

/** XM3's committed table (git show at its commit), SHA-256 checked. */
export function xm3Table() {
  const bytes = git('show', `${config.xm3.commit}:${config.xm3.table.path}`);
  if (XM3.sha256(bytes) !== config.xm3.table.sha256) throw new Error(`XM3's ${config.xm3.table.path} is not the registered ${config.xm3.table.sha256}`);
  return JSON.parse(bytes.toString('utf8'));
}

/** The observed-weather file is the registered one (XM's gfzDays provenance). */
export function gfzChecked(W) {
  const [p] = W.gfzDays().provenance;
  if (p.file !== config.weather.gfz.file || p.sha256 !== config.weather.gfz.sha256) throw new Error(`the GFZ file ${p.file} ${p.sha256} is not the registered ${config.weather.gfz.sha256}`);
}
