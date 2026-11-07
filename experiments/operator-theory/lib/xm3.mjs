// XM3's build, environment and module pinning for this experiment's FFM arms (lib/host.mjs) and its driver rows. ffm-atmosphere-xm3/common.mjs refuses
// its import since XM's directory moved to the one-$OCM path on 2026-11-04 (its guard pins all of XM); XM3's own files are unchanged, and this reads
// them as committed: config.json, build.json, and the same pinning (git show at build.json's commit, SHA-256 checked) and hold-last rows.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../ffm-atmosphere-xm3');
export const root = path.resolve(dir, '../..');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
try { git(root, 'diff', '--quiet', 'HEAD', '--', 'experiments/ffm-atmosphere-xm3'); } catch { throw new Error('experiments/ffm-atmosphere-xm3 differs from HEAD'); }
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const build = JSON.parse(fs.readFileSync(path.join(root, config.build.file)));
export const store = process.env.XM3_STORE ?? config.store;
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const DAY = 86400000, dateOf = (t) => new Date(t).toISOString().slice(0, 10);

let modulesCache = null;
/** The modules checkout (SDN_MODULES_ROOT): it holds build.json's commit and its host files equal that commit and their registered SHA-256. */
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
/** A module's wasm and manifest at build.json's commit (git show), SHA-256 checked, kept under <store>/build/<commit>/<module>: { file, bytes, manifest }. */
export function pinned(modules, rel) {
  const want = build.wasmSha256[rel];
  if (!want) throw new Error(`${rel} is not in build.json`);
  const out = path.join(store, 'build', build.modulesCommit, rel);
  const file = path.join(out, 'module.wasm'), manifestFile = path.join(out, 'plugin-manifest.json');
  const atomic = (target, bytes) => { const temp = `${target}.${process.pid}.tmp`; fs.writeFileSync(temp, bytes); fs.renameSync(temp, target); };
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== want || !fs.existsSync(manifestFile)) {
    const bytes = git(modules, 'show', `${build.modulesCommit}:${rel}/dist/isomorphic/module.wasm`);
    if (sha256(bytes) !== want) throw new Error(`${rel} at ${build.modulesCommit} is ${sha256(bytes)}, registered ${want}`);
    fs.mkdirSync(out, { recursive: true });
    atomic(file, bytes);
    atomic(manifestFile, git(modules, 'show', `${build.modulesCommit}:${rel}/plugin-manifest.json`));
  }
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== want) throw new Error(`${file} is not the registered ${want}`);
  return { file, bytes, manifest: JSON.parse(fs.readFileSync(manifestFile, 'utf8')) };
}
/** XM3 lib/ffm.mjs driverRows: every day from the rows' first through D0 + 8 without a row takes the last row at or before it. */
export function driverRows(rows, cutoffMs) {
  const first = Date.parse(`${rows[0].date}T00:00:00Z`), lastRow = Date.parse(`${rows.at(-1).date}T00:00:00Z`);
  const end = Math.max(lastRow, Date.parse(`${dateOf(cutoffMs)}T00:00:00Z`) + 8 * DAY);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out = [], held = [], filled = [];
  let last = null;
  for (let t = first; t <= end; t += DAY) {
    const date = dateOf(t), r = byDate.get(date);
    if (r) { out.push(r); last = r; continue; }
    out.push({ ...last, date });
    (t > lastRow ? held : filled).push(date);
  }
  return { rows: out, held, filled };
}
