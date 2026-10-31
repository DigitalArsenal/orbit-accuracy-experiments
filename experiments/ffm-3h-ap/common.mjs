// XM7: the plan guard (PLAN.md and config.json as committed before any cell, additions only at the plan's end), the run's own sources committed, the test
// wasm (git show from the modules repo, SHA-256 checked), GFZ's 3-hourly ap (data preparation only), XM5's rows and table, and what XM5's and XM3's code gives.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.XM7_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-3h-ap');
const gitIn = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
const git = (...a) => gitIn(root, ...a);
const here = 'experiments/ffm-3h-ap';

/** The plan commit, pushed to origin wip/<task>/plan before any cell. */
export const PLAN_COMMIT = 'c26f2e182630ab4242ba429fb4367759172d7b31';

try { git('diff', '--quiet', config.xm5.commit, '--', config.xm5.dir); } catch { throw new Error(`${config.xm5.dir} differs from XM5's commit ${config.xm5.commit}`); }
const XM5 = await import(path.join(root, config.xm5.dir, 'common.mjs'));
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

/** The test build's propagator/ffm: { bytes, manifest }, read from the modules repo at its wip commit, SHA-256 checked. */
export function testWasm() {
  const modules = XM3.modulesRoot(), { commit, wasmSha256 } = config.testBuild;
  const bytes = gitIn(modules, 'show', `${commit}:propagator/ffm/dist/isomorphic/module.wasm`);
  if (XM3.sha256(bytes) !== wasmSha256) throw new Error(`the test wasm at ${commit} is ${XM3.sha256(bytes)}, registered ${wasmSha256}`);
  return { bytes, manifest: JSON.parse(gitIn(modules, 'show', `${commit}:propagator/ffm/plugin-manifest.json`).toString('utf8')) };
}

/** GFZ's eight ap of a date, from the registered file (columns ap1 to ap8). */
let apCache = null;
export function ap3hOf(date) {
  if (!apCache) {
    const raw = fs.readFileSync(config.weather.gfz.file);
    if (XM3.sha256(raw) !== config.weather.gfz.sha256) throw new Error(`${config.weather.gfz.file} is not the registered ${config.weather.gfz.sha256}`);
    apCache = new Map();
    for (const line of raw.toString('utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const t = line.trim().split(/\s+/);
      if (t.length >= 28) apCache.set(`${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`, t.slice(15, 23).map(Number));
    }
  }
  return apCache.get(date);
}

/** XM5's stored M rows (read only), a Map by key, their digest checked; its committed table. */
export async function xm5Rows() {
  const { storedRows } = await import(path.join(root, config.xm5.dir, 'table.mjs'));
  const rows = storedRows();
  const digest = XM3.sha256(rows.map(XM3.comparable).join('\n'));
  if (!digest.startsWith(config.xm5.rowsDigest)) throw new Error(`XM5's stored rows digest ${digest.slice(0, 12)} is not the registered ${config.xm5.rowsDigest}`);
  return new Map(rows.map((r) => [r.key, r]));
}
export const xm5Table = () => JSON.parse(git('show', `${config.xm5.commit}:${config.xm5.table}`).toString('utf8'));
