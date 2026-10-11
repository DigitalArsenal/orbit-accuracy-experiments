// E15's configuration, issue and target days, and the test-window guard (PLAN.md section 4; E13's and E14's pattern).
//
// Two locks:
// - Residual rows of a test-window issue may be written (truth from operators is live and must be scored while it can be
//   read) only while config.json is frozen and config.json and PLAN.md are committed and unchanged.
// - No test-window metric is computed or read before the planned read: that needs, in addition, the train selection
//   (results/e15/selection.json) committed and unchanged, the clock past config.testRead.notBeforeUtc (truth for the 7-day
//   horizon of the last test issue), and the caller's explicit `plannedRead`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoRoot } from '../../../harness/provenance.mjs';

export const experimentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

export const DAY_MS = 86400000;
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
export const shiftDay = (day, n) => isoDay(dayMs(day) + n * DAY_MS);
// The issue time T of issue day D: D at config.issueTimeUtc.
export const issueMs = (day) => Date.parse(`${day}T${config.issueTimeUtc}Z`);

export function windowOfIssue(day) {
  for (const [name, [from, to]] of Object.entries(config.windows)) if (day >= from && day <= to) return name;
  return null;
}

export function issueDays(window) {
  const [from, to] = config.windows[window];
  const out = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d);
  return out;
}

// The issues a target day serves: target T + h falls on `targetDay` for issue day targetDay - h.
export function issuesForTarget(targetDay) {
  return config.horizonsDays.map((h) => ({ h, issue: shiftDay(targetDay, -h) })).map((x) => ({ ...x, window: windowOfIssue(x.issue) })).filter((x) => x.window);
}

// Every target day of the experiment, first to last.
export function targetDays() {
  const first = config.windows.train[0];
  const last = shiftDay(config.windows.test[1], Math.max(...config.horizonsDays));
  const out = [];
  for (let d = first; d <= last; d = shiftDay(d, 1)) out.push(d);
  return out;
}

function assertCommittedAndUnchanged(files, what, root = repoRoot) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const rel = files.map((f) => path.relative(root, f));
  if (git('status', '--porcelain', '--', ...rel)) throw new Error(`${what}: ${rel.join(', ')} differs from its committed version`);
  for (const f of rel) if (!git('log', '-1', '--format=%H', '--', f)) throw new Error(`${what}: ${f} is not committed`);
}

export function assertRowsWritable(window) {
  if (!config.testWindows.includes(window)) return;
  if (config.frozen !== true) throw new Error(`rows of the ${window} window are locked until config.json is frozen`);
  assertCommittedAndUnchanged([configPath, path.join(experimentDir, 'PLAN.md')], `rows of the ${window} window are locked`);
}

export const selectionPath = path.join(repoRoot, config.testRead.selection);

export function assertMetricsReadable(window, { plannedRead = false, now = Date.now() } = {}) {
  if (!config.testWindows.includes(window)) return;
  assertRowsWritable(window);
  if (!plannedRead) throw new Error(`the ${window} window is read once, at the planned read (--planned-read)`);
  if (now < Date.parse(config.testRead.notBeforeUtc)) throw new Error(`the ${window} window is locked until ${config.testRead.notBeforeUtc} (truth for the 7-day horizon of the last test issue)`);
  if (!fs.existsSync(selectionPath)) throw new Error(`the ${window} window is locked until ${config.testRead.selection} exists`);
  assertCommittedAndUnchanged([selectionPath], `the ${window} window is locked`);
}
