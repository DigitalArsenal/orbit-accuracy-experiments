// The headline loop's end-to-end checks (owner 2026-11-10: end to end only): each tool's --check runs the whole tool, as a separate process,
// on a made-up store or a tiny real slice, and asserts on what it writes. This file holds the shared setup: temporary folders, running a
// tool, and made-up stores (rows shaped as refly.mjs writes them, with known answers).
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

/** A made-up store: <dir>/<sha12>/build.json and one rows file. */
export function writeStore(dir, { version = '9.9.9', sha256 = 'e2e0'.repeat(16), rows, file = 'rows-truth-0of1.jsonl', extra = {} }) {
  const d = path.join(dir, sha256.slice(0, 12));
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'build.json'), JSON.stringify({ module: 'propagator/sdn-ap', version, sha256, ...extra }));
  fs.appendFileSync(path.join(d, file), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return d;
}
const day = (e) => ({ e, r: e / 3, t: e / 2, n: e / 4 });
/** Made-up rows of one cell family: `sats` satellites x `blocks` weekly cutoffs, fit `fit` h; FFM errors (km) by satellite, AP = ratio x FFM;
 *  D = dM m at every lead. opts.period flags the rows as the 2026-03..05 pass. */
export function cellRows({ group = 'GD', regime = 'Laser geodetic', fit = 72, sats = 8, blocks = 4, ffmKm = (s) => 0.002 * (1 + s / 10), ratio = 1.5, dM = 2, start = '2025-10-01', period = null, prefix = 'S', arm = 'Ffull', apFit = null }) {
  const rows = [];
  for (let s = 0; s < sats; s += 1) for (let b = 0; b < blocks; b += 1) {
    const cutoff = new Date(Date.parse(`${start}T00:00:00Z`) + b * 7 * 86400000).toISOString(), f = ffmKm(s, b), a = f * (typeof ratio === 'function' ? ratio(s, b) : ratio);
    const days = (k) => Object.fromEntries(['1', '2', '3', '7'].map((d) => [d, day(k * Number(d))]));
    const ffm = { ok: true, arm, weightedRms: 0.001, days: days(f), parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.001 }] };
    rows.push({
      key: `${group}|${prefix}${s}|${cutoff.slice(0, 10)}`, part: 'truth', group, regime, name: `${prefix}${s}`, cutoff, arcH: fit, ...(period ? { period } : {}),
      arms: { AP: { ok: true, days: days(a), ...(apFit ? { fit: apFit(s, b) } : {}), dVsFFMq: Object.fromEntries(['1', '2', '3', '7'].map((d) => [d, dM / 1000])), dVsFFMc: Object.fromEntries(['1', '2', '3', '7'].map((d) => [d, dM / 1000])) },
        FFMq: ffm, FFMc: { ...ffm, sameAs: 'FFMc' }, FFMr: { ...ffm, arm: 'F20', days: days(2 * f) }, FFMqHalfTol: { ok: true, arm, days: days(f * 1.001) } },
    });
  }
  return rows;
}
/** Collect failures: check(cond, message). */
export function checker(name) {
  const faults = [];
  return { check: (ok, msg) => { if (!ok) faults.push(msg); }, done: (what) => { console.log(faults.length ? `${name} CHECK: FAIL\n${faults.join('\n')}` : `${name} CHECK: PASS (${what})`); process.exit(faults.length ? 1 : 0); } };
}
