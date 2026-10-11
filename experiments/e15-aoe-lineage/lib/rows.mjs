// The residual-row store (runs/e15-rows, ignored by git; rows derive from Space-Track and operator data and never leave
// this machine):
//   <rows>/<window>/<issue day>/<target day>.<truth>.jsonl   one row per (object, horizon, method)
//   <rows>/coverage/<target day>.<truth>.json                what the truth source held for that target (counts only)
// A (target day, truth) pair is rewritten whole, so a rerun replaces it. Test-window files are written under the row lock
// and opened only under the metrics lock (lib/windows.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../settings.mjs';
import { assertMetricsReadable, assertRowsWritable } from './windows.mjs';

const atomicWrite = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
};

// rows: residual rows of one target day and one truth source (any issues, any windows).
export function writeRows(targetDay, truth, rows, root = PATHS.rows) {
  const byFile = new Map();
  for (const r of rows) {
    assertRowsWritable(r.window);
    const file = path.join(root, r.window, r.issue, `${targetDay}.${truth}.jsonl`);
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(JSON.stringify(r));
  }
  for (const [file, lines] of byFile) atomicWrite(file, `${lines.join('\n')}\n`);
  return [...byFile.keys()];
}

export function writeCoverage(targetDay, truth, coverage, root = PATHS.rows) {
  atomicWrite(path.join(root, 'coverage', `${targetDay}.${truth}.json`), `${JSON.stringify(coverage, null, 1)}\n`);
}

export function readCoverage(root = PATHS.rows) {
  const dir = path.join(root, 'coverage');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// Whether rows for (target day, truth) exist already, without opening them (the runner skips done work).
export function haveRows(targetDay, truth, root = PATHS.rows) {
  return fs.existsSync(path.join(root, 'coverage', `${targetDay}.${truth}.json`));
}
export function coverageOf(targetDay, truth, root = PATHS.rows) {
  const file = path.join(root, 'coverage', `${targetDay}.${truth}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// Every row of a window. A test window needs the metrics lock first.
export function readRows(window, { plannedRead = false, root = PATHS.rows } = {}) {
  assertMetricsReadable(window, { plannedRead });
  const dir = path.join(root, window);
  if (!fs.existsSync(dir)) return { rows: [], files: [] };
  const rows = [];
  const files = [];
  for (const issue of fs.readdirSync(dir).sort()) {
    for (const f of fs.readdirSync(path.join(dir, issue)).filter((n) => n.endsWith('.jsonl')).sort()) {
      const file = path.join(dir, issue, f);
      files.push(path.relative(root, file));
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line.trim()) rows.push(JSON.parse(line));
    }
  }
  return { rows, files };
}
