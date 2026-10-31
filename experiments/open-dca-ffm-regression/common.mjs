// XM4: configuration, the frozen-plan guard (PLAN.md, config.json and build.json committed unchanged; the run's own sources committed
// for a scored run), XM's and XM3's code unchanged at their commits, XM3's stored rows and committed table (read only, digests checked),
// the modules checkout with every wasm pinned to build.json, the store and helpers. XM3's common.mjs (22313bf) is the pattern; XM's own
// helpers (times, ISO weeks, RMS) are reused unchanged. Every git call here reads: GIT_OPTIONAL_LOCKS keeps them off the shared index.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

process.env.GIT_OPTIONAL_LOCKS = '0';
export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const build = JSON.parse(fs.readFileSync(path.join(root, config.build.file)));
export const store = process.env.XM4_STORE ?? config.store;
export const results = path.join(root, 'results/open-dca-ffm-regression');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const REL = 'experiments/open-dca-ffm-regression';
/** The commit the guards read: HEAD, or the commit named by XM4_GUARD_REF while this work stays on its wip branch. */
export const guardRef = process.env.XM4_GUARD_REF ?? 'HEAD';

/** XM's and XM3's code are imported unchanged: their directories equal the registered commits. */
function unchanged() {
  for (const { commit, dir: d } of [config.xm, config.xm3]) {
    try { git(root, 'diff', '--quiet', commit, '--', d); } catch { throw new Error(`${d} differs from its commit ${commit}`); }
  }
}
unchanged();
export const { DAY, HOUR, iso, ms, dateOf, daysOf, isoWeek, rms, median } = await import(path.join(root, config.xm.dir, 'common.mjs'));

const committedAt = (rel, ref = guardRef) => { try { return git(root, 'show', `${ref}:${rel}`); } catch { return null; } };

/** PLAN.md, config.json and build.json committed and unchanged: every step that reads registered data runs only then. */
export function frozen() {
  if (!config.frozen) throw new Error('the plan is not frozen');
  for (const rel of [`${REL}/PLAN.md`, `${REL}/config.json`, config.build.file]) {
    const committed = committedAt(rel);
    if (!committed?.equals(fs.readFileSync(path.join(root, rel)))) throw new Error(`commit the frozen ${rel} before data access (guard reads ${guardRef})`);
  }
}

/** The run's sources: a scored run and the check use committed sources only; their SHA-256 go in every row. */
export const SOURCES = ['run.mjs', 'table.mjs', 'common.mjs', 'lib/ffm1.mjs', 'lib/inputs.mjs', 'lib/smoke.mjs'];
export function sourcesCommitted() {
  const out = {};
  for (const file of SOURCES) {
    const rel = `${REL}/${file}`, bytes = fs.readFileSync(path.join(dir, file));
    const committed = committedAt(rel);
    if (!committed?.equals(bytes)) throw new Error(`${rel} differs from ${guardRef}; commit it before a scored run`);
    out[file] = sha256(bytes);
  }
  return out;
}

/** The modules checkout (SDN_MODULES_ROOT, else the stack's canonical one): it holds build.json's commit and its host files equal that
 *  commit and their registered SHA-256. Wasm never comes from its working tree (pinned()). */
let modulesCache = null;
export function modulesRoot() {
  if (modulesCache) return modulesCache;
  const candidate = path.resolve(process.env.SDN_MODULES_ROOT ?? path.join(root, '../../main-packages/space-data-network-modules'));
  try { git(candidate, 'cat-file', '-e', `${build.modulesCommit}^{commit}`); } catch { throw new Error(`modules checkout ${candidate} lacks the registered commit ${build.modulesCommit}`); }
  try { git(candidate, 'diff', '--quiet', build.modulesCommit, '--', ...build.hostFiles.paths); } catch { throw new Error(`${build.hostFiles.paths.join(', ')} in ${candidate} differ from ${build.modulesCommit}`); }
  for (const [rel, want] of Object.entries(build.hostFiles.sha256)) {
    const got = sha256(fs.readFileSync(path.join(candidate, rel)));
    if (got !== want) throw new Error(`${rel} is ${got}, registered ${want}`);
  }
  modulesCache = candidate;
  return candidate;
}

/** A module's wasm and manifest at a commit (git show), SHA-256 checked against `want`, in memory: { bytes, manifest }. */
export function pinned(modules, rel, commit = build.modulesCommit, want = build.wasmSha256[rel], artifact = 'dist/isomorphic/module.wasm') {
  if (!want) throw new Error(`${rel} is not in build.json`);
  const bytes = git(modules, 'show', `${commit}:${rel}/${artifact}`);
  if (sha256(bytes) !== want) throw new Error(`${rel} at ${commit} is ${sha256(bytes)}, registered ${want}`);
  return { bytes, manifest: JSON.parse(git(modules, 'show', `${commit}:${rel}/plugin-manifest.json`).toString('utf8')) };
}
export const showModules = (modules, commit, rel) => git(modules, 'show', `${commit}:${rel}`);

/** A row without its run-dependent fields (timing, sources, build): the form every digest and exact comparison uses (XM3's). */
export const comparable = (r) => JSON.stringify({ ...r, timing: undefined, sources: undefined, build: undefined });

/** XM3's stored rows, condition O (read only): the first unflagged row per key, their digest checked against config.xm3.rowsDigest, the
 *  digest of its committed table; a Map by key. */
export function xm3Rows() {
  const rowsDir = path.join(config.xm3.store, 'rows');
  const byKey = new Map();
  for (const f of fs.readdirSync(rowsDir).filter((x) => /^O\.s\d+\.jsonl$/.test(x)).sort()) for (const r of readJsonl(path.join(rowsDir, f))) if (!byKey.has(r.key) || byKey.get(r.key).defect) byKey.set(r.key, r);
  const rows = [...byKey.values()].sort((x, y) => (`${x.condition}|${x.key}` < `${y.condition}|${y.key}` ? -1 : 1));
  const digest = sha256(rows.map(comparable).join('\n'));
  if (digest !== config.xm3.rowsDigest) throw new Error(`XM3's stored rows digest ${digest.slice(0, 12)} is not the registered ${config.xm3.rowsDigest.slice(0, 12)}`);
  return byKey;
}

/** XM3's committed table (git show at config.xm3.commit), SHA-256 checked. */
export function xm3Table() {
  const bytes = git(root, 'show', `${config.xm3.commit}:${config.xm3.table.path}`);
  if (sha256(bytes) !== config.xm3.table.sha256) throw new Error(`XM3's ${config.xm3.table.path} at ${config.xm3.commit} is not the registered ${config.xm3.table.sha256}`);
  return JSON.parse(bytes.toString('utf8'));
}

export function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}
export function appendJsonl(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
}
export const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
