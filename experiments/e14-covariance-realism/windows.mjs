// E14's window guard (PLAN.md section 7; E13's windows.mjs pattern with its Deviation D1 closed from the start).
// A test window ('test' for the long windows of S2, S3 and S4; 's1:test' for the collected operator pairs) is
// readable only when config.json has "frozen": true and config.json, PLAN.md, amendments.json (when present) and
// results/e14/selection.json are committed and unchanged in the checkout. Development windows are always readable.
// Every step that reads truth, collected pairs or samples calls one of the asserts below with what it is about to read.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot as defaultRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const SELECTION_FILE = 'results/e14/selection.json';
const FROZEN_FILES = ['config.json', 'PLAN.md', 'amendments.json'];
const DAY_MS = 86400000;

function assertCommittedAndUnchanged(root, files, what) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`${what}: ${files.join(', ')} differs from its committed version`);
  for (const f of files) if (!git('log', '-1', '--format=%H', '--', f)) throw new Error(`${what}: ${f} not committed`);
}

// Every window name the configuration knows: the long windows by name, the S1 windows as 's1:<name>'.
export function windowNames(cfg = config) {
  return [...Object.keys(cfg.windows), ...Object.keys(cfg.s1Windows).map((n) => `s1:${n}`)];
}

// `options` is for the test, which builds a repository of its own: {root, dir, cfg}.
export function assertWindowReadable(name, { root = defaultRoot, dir = experimentDir, cfg = config } = {}) {
  if (!windowNames(cfg).includes(name)) throw new Error(`unknown window ${name}`);
  if (!cfg.testWindows.includes(name)) return;
  if (cfg.frozen !== true) throw new Error(`the ${name} window is locked until config.json is frozen (PLAN.md section 7)`);
  const frozen = FROZEN_FILES.filter((f) => f !== 'amendments.json' || fs.existsSync(path.join(dir, f))).map((f) => path.relative(root, path.join(dir, f)));
  assertCommittedAndUnchanged(root, frozen, `the ${name} window is locked`);
  if (!fs.existsSync(path.join(root, SELECTION_FILE))) throw new Error(`the ${name} window is locked until ${SELECTION_FILE} exists`);
  assertCommittedAndUnchanged(root, [SELECTION_FILE], `the ${name} window is locked`);
}

// [lo, hi) in ms of a long window (days inclusive).
export function windowSpanMs(name, cfg = config) {
  const w = cfg.windows[name];
  if (!w) throw new Error(`unknown window ${name}`);
  return [Date.parse(`${w[0]}T00:00:00Z`), Date.parse(`${w[1]}T00:00:00Z`) + DAY_MS];
}

// The long window that holds [fromMs, toMs] entirely, or null (PLAN.md section 7: a sample belongs to a window
// only if its reference time and its target time both lie in it).
export function windowOfSpan(fromMs, toMs, cfg = config) {
  for (const name of Object.keys(cfg.windows)) {
    const [lo, hi] = windowSpanMs(name, cfg);
    if (fromMs >= lo && toMs < hi) return name;
  }
  return null;
}

// Before reading truth or samples over [fromMs, toMs]: every long window the span touches must be readable.
// A span that reaches into a test window needs the guard, whatever window its caller works in.
export function assertSpanReadable(fromMs, toMs, options = {}) {
  const cfg = options.cfg ?? config;
  for (const name of Object.keys(cfg.windows)) {
    const [lo, hi] = windowSpanMs(name, cfg);
    if (toMs >= lo && fromMs < hi) assertWindowReadable(name, options);
  }
  // Truth after the last configured window is test-window truth too (the test window is the last one).
  const last = Math.max(...Object.keys(cfg.windows).map((n) => windowSpanMs(n, cfg)[1]));
  if (toMs >= last) assertWindowReadable('test', options);
}

// The S1 window of a pair: older version's first state at t0Ms, newer version's at t1Ms (PLAN.md section 7).
export function s1WindowOfPair(t0Ms, t1Ms, cfg = config) {
  const w = Object.fromEntries(Object.entries(cfg.s1Windows).map(([n, [a, b]]) => [n, [Date.parse(a), Date.parse(b)]]));
  if (t0Ms >= w.devFit[0] && t1Ms < w.devFit[1]) return 's1:devFit';
  if (t0Ms >= w.devFit[0] && t1Ms >= w.devSelect[0] && t1Ms < w.devSelect[1]) return 's1:devSelect';
  if (t0Ms >= w.test[0] && t1Ms < w.test[1]) return 's1:test';
  return null;
}
export function assertPairReadable(t0Ms, t1Ms, options = {}) {
  const name = s1WindowOfPair(t0Ms, t1Ms, options.cfg ?? config);
  if (name) assertWindowReadable(name, options);
  else if (t1Ms >= Date.parse((options.cfg ?? config).s1Windows.devSelect[1])) assertWindowReadable('s1:test', options);
  return name;
}
