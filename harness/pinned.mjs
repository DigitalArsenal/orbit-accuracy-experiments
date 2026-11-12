// The module builds an experiment pins, by their wasm's SHA-256, found in a modules checkout (its working tree, then the commits it
// names, then the history of each module's own path) and laid out on their own as a modules root. A test then runs on the builds its
// experiment was run with, whatever the checkout holds today, or is skipped with the reason when a build is not in the checkout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256 } from './modules.mjs';

const WASM = 'dist/isomorphic/module.wasm';
const git = (root, ...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 30 });
const gitText = (root, ...a) => { try { return git(root, ...a).toString().trim(); } catch { return null; } };

/**
 * pins: { '<module path>': '<wasm sha256>' }; hints: commits to look in first (a module may sit under another path there);
 * files: { '<module path>': ['<file under the module>', ...] } copied beside the build from the same commit.
 * Returns { dir, found: { path: { commit, from } }, missing: [path], reason } with dir a modules root holding each found build
 * (its wasm and plugin-manifest.json) and the files asked for; reason is null when every pin is found.
 */
export function pinnedModules(root, pins, { hints = [], files = {} } = {}) {
  const want = new Map(Object.entries(pins).map(([rel, sha]) => [sha, rel]));
  const found = {}, hashOf = new Map();
  const blobSha = (blob) => { if (!hashOf.has(blob)) hashOf.set(blob, sha256(git(root, 'cat-file', 'blob', blob))); return hashOf.get(blob); };
  const take = (sha, commit, from) => { const rel = want.get(sha); if (rel && !found[rel]) found[rel] = { commit, from }; };
  // 1. the working tree
  for (const rel of Object.keys(pins)) {
    const f = path.join(root, rel, WASM);
    if (fs.existsSync(f) && sha256(fs.readFileSync(f)) === pins[rel]) found[rel] = { commit: null, from: rel };
  }
  // 2. the named commits, every module's build in each (a module renamed since is found under its path there)
  for (const h of hints) {
    if (Object.keys(found).length === want.size) break;
    const commit = gitText(root, 'rev-parse', '--verify', '-q', `${h}^{commit}`);
    if (!commit) continue;
    for (const line of git(root, 'ls-tree', '-r', commit).toString().split('\n')) {
      const m = /^\d+ blob ([0-9a-f]+)\t(.+)\/dist\/isomorphic\/module\.wasm$/.exec(line);
      if (m) take(blobSha(m[1]), commit, m[2]);
    }
  }
  // 3. the history of each missing module's own path
  for (const [rel, sha] of Object.entries(pins)) {
    if (found[rel]) continue;
    const commits = (gitText(root, 'log', '--all', '--format=%H', '--', `${rel}/${WASM}`) ?? '').split('\n').filter(Boolean);
    for (const c of commits) {
      const blob = gitText(root, 'rev-parse', `${c}:${rel}/${WASM}`);
      if (blob && blobSha(blob) === sha) { found[rel] = { commit: c, from: rel }; break; }
    }
  }
  const missing = Object.keys(pins).filter((rel) => !found[rel]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinned-modules-'));
  for (const top of ['analysis', 'propagator']) fs.mkdirSync(path.join(dir, top), { recursive: true });
  const read = (commit, file) => (commit ? git(root, 'show', `${commit}:${file}`) : fs.readFileSync(path.join(root, file)));
  for (const [rel, { commit, from }] of Object.entries(found)) {
    for (const f of [WASM, 'plugin-manifest.json', ...(files[rel] ?? [])]) {
      const out = path.join(dir, rel, f);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, read(commit, `${from}/${f}`));
    }
  }
  const reason = missing.length ? `pinned builds not in the modules checkout ${root}: ${missing.map((rel) => `${rel} ${pins[rel].slice(0, 12)}`).join(', ')}` : null;
  return { dir, found, missing, reason, remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
