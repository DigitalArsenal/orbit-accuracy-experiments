// Shared by E10's steps: configuration, the test guard, module loading and
// small framing helpers. Reading and re-framing only; every orbit, frame,
// time-scale, filter and screening computation is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitState, loadModule } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const DAY_MS = 86400000;

// Test seeds and test windows stay locked until PLAN.md and config.json are
// frozen by a commit: `frozen` true, both committed and unchanged here.
export function assertReadable(kind) {
  if (kind === 'dev') return;
  if (config.frozen !== true) throw new Error(`${kind} is locked until config.json is frozen (PLAN.md)`);
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`${kind} is locked: PLAN.md or config.json differs from its frozen commit`);
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error(`${kind} is locked: PLAN.md and config.json are not committed`);
}

// The modules checkout E10 runs (the TEAG/ESPF lane until it lands) and the
// modules each step needs, recorded in the run manifest.
export const modulesDir = (flag) => path.resolve(flag ?? process.env.SDN_MODULES_ROOT ?? config.inputs.modules);
export async function loadModules(run, names, { modules: flag } = {}) {
  const root = modulesDir(flag);
  const loaded = {};
  for (const name of names) {
    loaded[name] = await loadModule(root, name);
    run?.addModule({ ...loaded[name].provenance, checkout: root, checkoutState: gitState(root) });
  }
  return { root, loaded };
}

export const repoPath = (p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p));
export const iso = (ms) => new Date(ms).toISOString();
export const msOf = (text) => Date.parse(/[zZ]$/.test(text) ? text : `${text}Z`);

// A seeded generator (mulberry32) and Gaussian draws for scenario inputs:
// initial errors, outlier contamination and sample points. Statistics only.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    let u = 0;
    while (u === 0) u = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal };
}

// Lower-triangular Cholesky factor of a symmetric positive-definite n x n
// matrix (row-major), for drawing correlated scenario errors and for
// containment statistics. Returns null when not positive definite.
export function cholesky(a, n) {
  const l = new Array(n * n).fill(0);
  for (let i = 0; i < n; ++i)
    for (let j = 0; j <= i; ++j) {
      let v = 0.5 * (a[i * n + j] + a[j * n + i]);
      for (let k = 0; k < j; ++k) v -= l[i * n + k] * l[j * n + k];
      if (i === j) { if (!(v > 0)) return null; l[i * n + i] = Math.sqrt(v); }
      else l[i * n + j] = v / l[j * n + j];
    }
  return l;
}
// d' S^-1 d through the Cholesky factor of S.
export function mahalanobis2(l, n, d) {
  const z = new Array(n);
  let s = 0;
  for (let i = 0; i < n; ++i) {
    let v = d[i];
    for (let k = 0; k < i; ++k) v -= l[i * n + k] * z[k];
    z[i] = v / l[i * n + i];
    s += z[i] * z[i];
  }
  return s;
}
// log det of S from its Cholesky factor.
export const logDetOf = (l, n) => { let s = 0; for (let i = 0; i < n; ++i) s += 2 * Math.log(l[i * n + i]); return s; };
// Quantile of chi-square with 6 degrees of freedom, P(X <= x) =
// 1 - e^{-x/2} (1 + x/2 + x^2/8), by bisection. Statistics only.
export function chi2Quantile6(p) {
  const cdf = (x) => 1 - Math.exp(-x / 2) * (1 + x / 2 + (x * x) / 8);
  let lo = 0, hi = 200;
  for (let i = 0; i < 200; ++i) { const mid = 0.5 * (lo + hi); if (cdf(mid) < p) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}
// Half-width along unit vector u (3) of the position projection of the
// ellipsoid {d <= c} with 6 x 6 shape S: c sqrt(u' S_pp u).
export function halfWidth(shape, u, c = 1) {
  let s = 0;
  for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) s += u[i] * shape[i * 6 + j] * u[j];
  return c * Math.sqrt(Math.max(0, s));
}
