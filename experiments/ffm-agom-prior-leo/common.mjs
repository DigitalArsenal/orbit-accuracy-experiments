// XM6: the plan guard (PLAN.md and config.json as committed before any cell, additions only at the plan's end), the run's own sources committed,
// and what XM5's and XM3's code gives: XM's helpers, the store helpers, the pinned wasm, XM3's rows and table. Everything numeric comes from those.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.XM6_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-agom-prior-leo');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
const here = 'experiments/ffm-agom-prior-leo';

/** The plan commit, pushed to origin wip/<task>/plan before any cell. */
export const PLAN_COMMIT = '2f9693c8c1892a2a79d5173cd13a87efe20cf3a1';
/** XM5's landed code (it imports XM3 unchanged at 22313bf and checks that). */
export const XM5_COMMIT = '732dd1e6386a6204a3f2ac8c948e6e560acc0cb6';

try { git('diff', '--quiet', XM5_COMMIT, '--', config.xm5Dir); } catch { throw new Error(`${config.xm5Dir} differs from XM5's commit ${XM5_COMMIT}`); }
const XM5 = await import(path.join(root, config.xm5Dir, 'common.mjs'));
export const { XM3, xm3Rows, xm3Table, gfzChecked } = XM5;
export const xm3Dir = XM5.config.xm3.dir;

/** PLAN.md and config.json as committed before any cell. An addition goes at the plan's end. */
export function frozen() {
  if (!config.frozen) throw new Error('the plan is not frozen');
  const plan = git('show', `${PLAN_COMMIT}:${here}/PLAN.md`), now = fs.readFileSync(path.join(dir, 'PLAN.md'));
  if (now.length < plan.length || !now.subarray(0, plan.length).equals(plan)) throw new Error(`PLAN.md differs from ${PLAN_COMMIT}; an addition goes at its end`);
  if (!git('show', `${PLAN_COMMIT}:${here}/config.json`).equals(fs.readFileSync(path.join(dir, 'config.json')))) throw new Error(`config.json differs from ${PLAN_COMMIT}`);
}

/** A file as committed: at HEAD once the experiment is on main, until then at the runner's wip commit. null when neither holds it. */
export function committed(rel) {
  for (const ref of ['HEAD', `${config.wipRefPrefix}/runner`]) {
    try { return git('show', `${ref}:${rel}`); } catch { /* the next ref */ }
  }
  return null;
}

/** The run's sources: a scored run and the check use committed sources only; their SHA-256 go in every row. */
export const SOURCES = ['run.mjs', 'table.mjs', 'common.mjs', 'lib/ffm.mjs'];
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
