// FSA: the registration guard (PLAN.md, config.json and build.json as committed at REGISTRATION; additions only at the plan's end), the
// run's own sources committed, the store, and the redirection of XM's readers for the fresh 2025 windows (XP2's pattern): XM's store is
// this store (public-set extraction, pinned wasm, the GRACE-FO reference copies), the public sets' creation days are this experiment's,
// the RSGA bulletins are XP2's normalized 2025 bulletins. In proof mode (FSA_PROOF=1) nothing is redirected: XM's own store and XM's 2026
// bulletins, the environment XM3 and XM6 ran in, so F2, A12 and A24 can be compared with their stored rows byte for byte.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const here = 'experiments/ffm-short-arc';
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
config.xm = config.code.xm;   // lib/sgp4fit.mjs (XP2's) reads config.xm.dir; a runtime alias, the file stays as registered
export const build = JSON.parse(fs.readFileSync(path.join(root, config.build.file)));
/** The public sets' creation days extracted for the fresh windows: from 31 days before the first cutoff (XP2's margin: 2024-12-01 for 2025-01-01) to the last cutoff. */
const spanDates = Object.values(config.spans).flatMap((s) => [s.from, s.to]).sort();
const shiftDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const publicCreationDays = [shiftDays(spanDates[0], -31), spanDates.at(-1)];
export const proofMode = process.env.FSA_PROOF === '1';
export const store = process.env.FSA_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-short-arc');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });

/** The registration commit, pushed to origin wip/experiments-ffm-short-arc-fresh-20261031/claude-ffmshort-d9 before any fresh score. */
export const REGISTRATION = '69a1e1519eefcd69c23a10d1055027f1aee91546';

// XM's store: this store for fresh windows, XM's own for the proof (XP2 common.mjs:24, the same rule)
if (proofMode) delete process.env.XM_STORE; else process.env.XM_STORE = store;
export const XM3 = await import(path.join(root, config.code.xm3.dir, 'common.mjs'));
export const XM = await import(path.join(root, config.code.xm.dir, 'common.mjs'));
export const { DAY, HOUR, iso, ms, dateOf, daysOf, isoWeek, rms, median, sha256, write, appendJsonl, readJsonl, args } = XM3;
/** XP2's normalized 2025 bulletins (its store, read only), the first token of config.weather.rsgaNormalized. */
export const rsgaNormalizedDir = config.weather.rsgaNormalized.split(' ')[0];
if (!proofMode) {
  XM.config.public.creationDays = publicCreationDays;
  XM.config.spaceWeather.rsgaDirs = [rsgaNormalizedDir];
}

/** The pinned code of XM, XM3 and XP2 unchanged in this checkout (git diff --quiet against the registered commits). */
export function pinnedCodeUnchanged() {
  for (const k of ['xm', 'xm3', 'xp2']) {
    const c = config.code[k];
    try { git('diff', '--quiet', c.commit, 'HEAD', '--', c.dir); } catch { throw new Error(`${c.dir} differs from its registered commit ${c.commit}`); }
    try { git('diff', '--quiet', 'HEAD', '--', c.dir); } catch { throw new Error(`${c.dir} has uncommitted changes`); }
  }
  const got = sha256(fs.readFileSync(path.join(dir, 'lib/ffm.mjs')));
  if (got !== config.code.xm6.sha256) throw new Error(`lib/ffm.mjs is ${got}, registered ${config.code.xm6.sha256} (XM6's)`);
  const reader = sha256(git('show', `${config.code.xp2.commit}:experiments/xp2-fit-design/lib/rsga.mjs`));
  if (reader !== build.experimentsCode.xp2.rsgaReaderSha256) throw new Error(`XP2's lib/rsga.mjs at ${config.code.xp2.commit} is ${reader}, registered ${build.experimentsCode.xp2.rsgaReaderSha256}`);
}

/** PLAN.md and config.json and build.json as registered: config and build equal, PLAN.md equal with additions only at its end. */
export function frozen() {
  if (!config.frozen) throw new Error('the plan is not frozen');
  const plan = git('show', `${REGISTRATION}:${here}/PLAN.md`), now = fs.readFileSync(path.join(dir, 'PLAN.md'));
  if (now.length < plan.length || !now.subarray(0, plan.length).equals(plan)) throw new Error(`PLAN.md differs from ${REGISTRATION}; an addition goes at its end`);
  for (const f of ['config.json', 'build.json']) if (!git('show', `${REGISTRATION}:${here}/${f}`).equals(fs.readFileSync(path.join(dir, f)))) throw new Error(`${f} differs from ${REGISTRATION}`);
}

/** The run's sources: a scored run and the check use committed sources only; their SHA-256 go in every row. */
export const SOURCES = ['run.mjs', 'common.mjs', 'lib/ffm.mjs', 'lib/sgp4fit.mjs'];   // table.mjs joins when written; it computes no row
export function sourcesCommitted() {
  const out = {};
  for (const file of SOURCES) {
    const rel = `${here}/${file}`, bytes = fs.readFileSync(path.join(dir, file));
    let committed;
    try { committed = git('show', `HEAD:${rel}`); } catch { throw new Error(`${rel} is not committed`); }
    if (!committed.equals(bytes)) throw new Error(`${rel} differs from HEAD; commit it before a scored run`);
    out[file] = sha256(bytes);
  }
  return out;
}

/** XM3's stored rows (condition O) by key, digest checked (XM5's rule). */
export async function xm3Rows() {
  const { storedRows } = await import(path.join(root, config.code.xm3.dir, 'table.mjs'));
  const rows = storedRows();
  const digest = sha256(rows.map(XM3.comparable).join('\n'));
  if (!digest.startsWith(build.inputs.storedRows.xm3)) throw new Error(`XM3's stored rows digest ${digest.slice(0, 12)} is not the registered ${build.inputs.storedRows.xm3}`);
  return new Map(rows.filter((r) => r.condition === 'O').map((r) => [r.key, r]));
}

/** XM6's stored rows by key (its store, read only), digest checked as XM6's table computes it (comparable rows joined by newline). */
export function xm6Rows() {
  const d = '/opt/data/sdn-archive/ffm-agom-prior-leo/rows';
  const rows = fs.readdirSync(d).filter((f) => /^O\.s\d+\.jsonl$/.test(f)).sort().flatMap((f) => readJsonl(path.join(d, f))).filter((r) => !r.defect);
  const digest = sha256(rows.map(XM3.comparable).join('\n'));
  if (!digest.startsWith(build.inputs.storedRows.xm6)) throw new Error(`XM6's stored rows digest ${digest.slice(0, 12)} is not the registered ${build.inputs.storedRows.xm6}`);
  return new Map(rows.map((r) => [r.key, r]));
}

/** XP2's stored rows by key (its store, read only), deduplicated, sorted and digested as XP2's table.mjs does (lines 133-138). */
export async function xp2Rows() {
  const d = '/opt/data/sdn-archive/xp2-fit-design/rows';
  const all = fs.readdirSync(d).filter((n) => n.endsWith('.jsonl')).sort().flatMap((n) => readJsonl(path.join(d, n)));
  const byKey = new Map(); for (const r of all) byKey.set(r.key, r);
  const rows = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const digest = sha256(Buffer.from(rows.map((r) => { const { timing, ...rest } = r; return JSON.stringify(rest); }).join('\n')));
  if (!digest.startsWith(build.inputs.storedRows.xp2)) throw new Error(`XP2's stored rows digest ${digest.slice(0, 12)} is not the registered ${build.inputs.storedRows.xp2}`);
  return byKey;
}

/** The GFZ file is the registered one (XM's gfzDays provenance). */
export function gfzChecked(W) {
  const [p] = W.gfzDays().provenance;
  if (p.file !== build.inputs.gfz.path) throw new Error(`the GFZ file ${p.file} is not the registered ${build.inputs.gfz.path}`);
  return p.sha256;
}
