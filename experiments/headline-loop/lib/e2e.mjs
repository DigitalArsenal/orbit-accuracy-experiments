// The headline loop's end-to-end checks (owner 2026-11-10: end to end only): each tool's --check runs the whole tool, as a separate process,
// on a tiny real slice, and asserts on what it writes. This file holds the shared setup: temporary folders and running a tool.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const REPO = path.resolve(HERE, '../..');
export const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `headline-loop-${name}-`));
/** Run a tool of this folder as its own process: { code, out, err }. */
export function run(tool, args = [], env = {}) {
  const r = spawnSync(process.execPath, [path.join(HERE, tool), ...args], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const jsonl = (dir) => fs.readdirSync(dir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

/** Collect failures: check(cond, message). */
export function checker(name) {
  const faults = [];
  return { check: (ok, msg) => { if (!ok) faults.push(msg); }, done: (what) => { console.log(faults.length ? `${name} CHECK: FAIL\n${faults.join('\n')}` : `${name} CHECK: PASS (${what})`); process.exit(faults.length ? 1 : 0); } };
}
