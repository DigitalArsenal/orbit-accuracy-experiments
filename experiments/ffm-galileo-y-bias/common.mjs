// Y bias: configuration, the registered-plan guard, the pins, and SRP's session on this experiment's own store. Records and statistics only. The modules, C3's libraries and the harness are pinned through
// experiments/ffm-srp-seed-high-beta/common.mjs at import; this file pins SRP's own files and its stored rows, and a change refuses every step until the coordinator rules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json')));
export const store = process.env.Y_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-galileo-y-bias');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The commit that holds the registration: HEAD on main; the wip commit until the coordinator says XM5 has landed (coordinator's ruling, 2026-10-31). */
export const registeredRef = process.env.Y_REGISTERED_REF ?? 'HEAD';
const git = (...a) => execFileSync('git', a, { cwd: root, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
export const commitOf = () => git('rev-parse', registeredRef).toString().trim();
/** A step reads data only when these of this experiment's files equal their blobs at registeredRef. */
export function registered(names = ['PLAN.md', 'config.json', 'build.json']) {
  if (!config.registered) throw new Error('the plan is not registered');
  for (const name of names) {
    const rel = `experiments/ffm-galileo-y-bias/${name}`;
    let committed;
    try { committed = git('show', `${registeredRef}:${rel}`); } catch { throw new Error(`commit ${rel} at ${registeredRef} before data access`); }
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`${rel} differs from ${registeredRef}: commit it before data access`);
  }
}

for (const [rel, want] of Object.entries(build.sha256)) if (sha256(fs.readFileSync(path.join(root, rel))) !== want) throw new Error(`${rel} is not the pinned file: it changed after registration. Stop and ask the coordinator; do not edit around it.`);

process.env.SRP_STORE = store;
const SRP = path.join(root, 'experiments/ffm-srp-seed-high-beta');
export const srp = { common: await import(path.join(SRP, 'common.mjs')), run: await import(path.join(SRP, 'run.mjs')) };
if (srp.common.store !== store) throw new Error('SRP_STORE did not take: SRP\'s libraries would write to SRP\'s store');
export const { c3, Opened, DAY, HOUR, iso, readJsonl, args } = srp.common;

export const blockOf = (norad) => Object.keys(config.blocks).find((b) => config.blocks[b].includes(norad));
export const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
export const spanOf = (E) => (E <= dayMs(config.split.dev.to) ? 'dev' : 'test');
const days = (from, to, step) => { const out = []; for (let t = dayMs(from); t <= dayMs(to); t += step * DAY) out.push(t); return out; };
export const gridOf = (span) => days(config.split[span].from, config.split[span].to, config.split.everyDays);

/** Base: the stored SRP rows of each block's base arm on the grid, read-only, SHA-256 checked: Map norad|E -> row. */
export function baseRows(opened) {
  const out = new Map(), grid = new Set([...gridOf('dev'), ...gridOf('test')].map(iso));
  for (const [name, want] of Object.entries(build.baseRows)) {
    const f = path.join(config.base.rowsDir, name), bytes = opened.read(f, 'SRP rows, this program\'s own, base arms');
    if (sha256(bytes) !== want) throw new Error(`${f} is not the pinned file`);
    for (const line of bytes.toString().split('\n')) {
      if (!line) continue;
      const r = JSON.parse(line), b = blockOf(r.norad);
      if (b && r.arm === config.base.arms[b] && grid.has(r.E)) out.set(`${r.norad}|${r.E}`, { ...r, block: b, span: spanOf(Date.parse(r.E)) });
    }
  }
  return out;
}

/** Y2's values, frozen from dev: { FOC, IOV, GLONASS } in nm/s^2. A step that needs them refuses without the committed file. */
export function devValues() {
  const f = path.join(dir, 'dev-values.json');
  if (!fs.existsSync(f)) throw new Error('dev-values.json is not there: run dev.mjs and commit it before any Y1, Y2 or Yx row is run or read');
  registered(['dev-values.json']);
  return JSON.parse(fs.readFileSync(f)).valuesNmS2;
}
