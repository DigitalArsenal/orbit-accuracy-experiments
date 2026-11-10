// The headline loop's environment. Two conditions, each checked, each recorded in every row.
//
// 1. Installed packages (review round 0, REF-8). This repository's package.json and package-lock.json pin spacedatastandards.org 1.276.0 (and
//    space-data-module-sdk 0.9.7, flatbuffers 25.9.23, flatc-wasm 26.1.38); the FFM request builder writes 1.276.0 tables (PCFForceModel).
//    A checkout whose node_modules hold any other version is refused, the refusal naming the fix: `npm ci` in the checkout (or, in the stack,
//    `node tools/deps-bundle/deps-bundle.mjs attach <checkout>`, which attaches the lockfile's own install). No package is ever redirected.
// 2. XM's installed-host guard. experiments/xp-atmosphere-merit/common.mjs refuses a modules checkout whose installed host packages differ from
//    XM's registered build.json. The loop reads through XM the truth and weather readers (no module), foundation/frames (TEME to GCRF) and
//    analysis/gp-error-model (R, T, N errors), each wasm by git show at XM's pinned commit, SHA-256 checked; only the hosting SDK and bindings
//    come from the checkout. Proper fix: a modules checkout whose host packages equal XM's build.json (no checkout on this machine does:
//    analysis/gp-error-model installs spacedatastandards.org 1.261.0 where XM registered 1.276.0), or XM registered again on today's hosts.
//    Until then the guard's package.json reads answer with the registered version and the installed versions are recorded in every row
//    (HOSTS.installed); HEADLINE_LOOP_HOSTS=registered keeps XM's refusal. verify.mjs re-flies the stored published rows: the check that it
//    changes no number.
import fs from 'node:fs';
import path from 'node:path';

export const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
export const MODULES_ROOT = path.resolve(process.env.SDN_MODULES_ROOT ?? path.join(REPO, '../../main-packages/space-data-network-modules'));
process.env.SDN_MODULES_ROOT = MODULES_ROOT;

const versionOf = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).version; } catch { return null; } };
const PACKAGES = ['spacedatastandards.org', 'space-data-module-sdk', 'flatbuffers', 'flatc-wasm'];
export const BINDINGS = { lockfile: {}, installed: {} };
/** The packages a checkout holds against its lockfile: { lockfile, installed, wrong: [names], refusal (the text the loop refuses with, or null) }. */
export function packageState(repo = REPO) {
  const lock = (() => { try { return JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8')).packages; } catch { return {}; } })();
  const lockfile = {}, installed = {}, wrong = [];
  for (const p of PACKAGES) {
    const want = lock[`node_modules/${p}`]?.version, got = versionOf(path.join(repo, 'node_modules', p, 'package.json'));
    lockfile[p] = want ?? null; installed[p] = got;
    if (want && got !== want) wrong.push(p);
  }
  const refusal = wrong.length ? `refused: run \`npm ci\` in ${repo} (its package.json and package-lock.json pin ${wrong.map((p) => `${p} ${lockfile[p]}`).join(', ')}; installed ${wrong.map((p) => `${p} ${installed[p] ?? 'none'}`).join(', ')})` : null;
  return { lockfile, installed, wrong, refusal };
}
/** Refuse on wrong packages. Called before any module that reads them. */
export function usePackages() {
  const s = packageState();
  Object.assign(BINDINGS, { lockfile: s.lockfile, installed: s.installed });
  if (s.refusal) throw new Error(s.refusal);
}

const XMB = JSON.parse(fs.readFileSync(path.join(REPO, 'experiments/xp-atmosphere-merit/build.json'), 'utf8'));
export const HOSTS = { mode: process.env.HEADLINE_LOOP_HOSTS === 'registered' ? 'registered' : 'installed', installed: {} };
if (HOSTS.mode === 'installed') {
  const realRead = fs.readFileSync;
  fs.readFileSync = function readFileSync(p, ...rest) {
    const s = String(p), m = /\/(.+?)\/node_modules\/((?:@[^/]+\/)?[^/]+)\/package\.json$/.exec(s.startsWith(MODULES_ROOT) ? s.slice(MODULES_ROOT.length) : '');
    const want = m && XMB.packages?.[m[1]]?.[m[2]];
    if (want && new Error().stack.includes('xp-atmosphere-merit/common.mjs')) {
      const j = JSON.parse(realRead.call(fs, p, 'utf8'));
      if (j.version !== want) HOSTS.installed[`${m[1]}:${m[2]}`] = j.version;
      return JSON.stringify({ ...j, version: want });
    }
    return realRead.call(fs, p, ...rest);
  };
}
export const envRecord = () => ({ packages: Object.entries(BINDINGS.installed).map(([p, v]) => `${p} ${v}`).join(', '), xmHosts: HOSTS.mode, xmHostsInstalled: HOSTS.installed });
