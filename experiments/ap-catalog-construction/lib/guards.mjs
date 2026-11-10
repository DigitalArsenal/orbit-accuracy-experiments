// The guards of a registered part (PLAN.md "What is fixed before the run"). Each is a function `run.mjs --check` trips on purpose.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** 1. Run once: a part's folder must hold no start record, rows or manifest; the start record is written before anything is read. */
export function claimStart(dir, tag, record) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /^(start|rows|manifest)-/.test(f))) throw new Error(`REFUSED: ${dir} already holds a run of this part (run once, PLAN.md)`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `start-${tag}.json`), JSON.stringify({ ...record, startedUtc: new Date().toISOString() }, null, 1), { flag: 'wx' });
}

/** 2. Every executed file at its registered SHA-256 (registration.json, made by `run.mjs --pin`). `seen` maps file -> SHA-256 of what
 *  was loaded; `registered` maps file -> SHA-256. */
export function verifyFiles(seen, registered) {
  for (const [file, got] of Object.entries(seen)) {
    if (!(file in registered)) throw new Error(`REFUSED: ${file} was executed and is not registered`);
    if (registered[file] !== got) throw new Error(`REFUSED: ${file} differs from its registered bytes`);
  }
}

/** 3. The truth gate's ledger at its registered SHA-256. */
export function verifyLedger(file, want) {
  const got = fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
  if (got !== want) throw new Error(`REFUSED: the truth gate's ledger ${file} is ${got ?? 'absent'}, the plan names ${want}`);
}

/** 4. Archive manifest: every archive file a part reads must be listed with its byte count; a file not listed, or of another size, is
 *  refused before it is opened. Returns the check and the list of files it passed. */
export function manifestGuard(manifest) {
  const listed = new Map((manifest?.files ?? []).map((f) => [f.path, f.bytes]));
  const passed = new Set();
  const check = (absPath, archiveRoot) => {
    if (!manifest) return; // development runs: no manifest
    const rel = path.relative(archiveRoot, absPath);
    if (!listed.has(rel)) throw new Error(`REFUSED: ${rel} is not in the part's archive manifest`);
    if (fs.statSync(absPath).size !== listed.get(rel)) throw new Error(`REFUSED: ${rel} has changed size since the manifest was committed`);
    passed.add(rel);
  };
  return { check, passed };
}

/** 5. A part with a fixed run date runs on that UTC day and no other. */
export function verifyRunDay(part, nowMs) {
  if (part.runOn && new Date(nowMs).toISOString().slice(0, 10) !== part.runOn) throw new Error(`REFUSED: this part runs on ${part.runOn} only (PLAN.md); today is ${new Date(nowMs).toISOString().slice(0, 10)}`);
}

/** 6. A clean repository: no tracked file differs from the commit. */
export function verifyClean(statusText) {
  if (statusText && statusText.trim()) throw new Error(`REFUSED: the repository has uncommitted changes to tracked files:\n${statusText.trim().split('\n').slice(0, 5).join('\n')}`);
}
