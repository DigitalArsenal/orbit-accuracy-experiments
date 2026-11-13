// End-to-end check of the synthetic rows' record stream (experiments/synthetic-orbits/records.mjs and records-to-fsdata.mjs) on real stored
// rows: the smallest rows file of the archive's synthetic folders that holds base64 records is copied to a scratch store, converted, and every
// record read back through the stream must be the original's bytes (full SHA-256); the stream must be nothing but [4-byte size][bytes] frames
// that a walk from byte 0 finishes exactly at the end of the file; every other field of every row must be unchanged; replace must leave the
// stream and the rewritten rows under their names and no .new file; readRecord must still read an old base64 string. Skipped, visibly, when the
// archive is absent.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../harness/provenance.mjs';
import { frames, readRecord, recordsFileOf } from '../experiments/synthetic-orbits/records.mjs';

const STORE = process.env.HEADLINE_LOOP_STORE ?? '/opt/data/sdn-archive/headline-loop', SYN = path.join(STORE, 'synthetic');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sample = (() => {
  if (!fs.existsSync(SYN)) return null;
  let best = null;
  for (const d of fs.readdirSync(SYN)) {
    const dir = path.join(SYN, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const n of fs.readdirSync(dir).filter((x) => /^rows.*\.jsonl$/.test(x))) {
      const p = path.join(dir, n), size = fs.statSync(p).size;
      if (size > 8000 && size < 400000 && fs.readFileSync(p, 'utf8').includes('"record":"') && (!best || size < best.size)) best = { dir: d, name: n, path: p, size };
    }
  }
  return best;
})();

test('real stored rows: convert, read every record back, replace', { skip: sample ? false : 'the archive has no synthetic rows with records here' }, () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'records-fsdata-')), syn = path.join(scratch, 'synthetic'), dir = path.join(syn, sample.dir);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sample.path, path.join(dir, sample.name));
    const original = fs.readFileSync(path.join(dir, sample.name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const run = (mode) => JSON.parse(execFileSync(process.execPath, [path.join(repoRoot, 'experiments/synthetic-orbits/records-to-fsdata.mjs'), mode, syn], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    const want = { ap: original.filter((r) => typeof r.ap?.record === 'string').length, xp: original.filter((r) => typeof r.xp?.record === 'string').length };
    assert.ok(want.ap > 0, 'the sample holds AP records');
    // convert: nothing is replaced yet
    const c = run('convert');
    assert.equal(c.problems, 0); assert.equal(c.apRecords, want.ap); assert.equal(c.xpRecords, want.xp);
    assert.equal(fs.readFileSync(path.join(dir, sample.name), 'utf8').split('\n').filter(Boolean).length, original.length);
    assert.ok(fs.existsSync(`${recordsFileOf(path.join(dir, sample.name))}.new`) && fs.existsSync(path.join(dir, `${sample.name}.new`)));
    // replace
    const r = run('replace');
    assert.equal(r.problems, 0);
    const stream = recordsFileOf(path.join(dir, sample.name));
    assert.ok(fs.existsSync(stream) && !fs.existsSync(`${stream}.new`) && !fs.existsSync(path.join(dir, `${sample.name}.new`)));
    const rows = fs.readFileSync(path.join(dir, sample.name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(rows.length, original.length);
    let records = 0;
    rows.forEach((row, i) => {
      for (const t of ['ap', 'xp']) {
        const was = original[i][t]?.record;
        if (typeof was !== 'string') { assert.deepEqual(row[t], original[i][t]); continue; }
        const bytes = readRecord(dir, row[t].record), orig = Buffer.from(was, 'base64');
        assert.equal(sha256(bytes), sha256(orig)); assert.ok(Buffer.from(bytes).equals(orig));
        assert.deepEqual({ ...row[t], record: null }, { ...original[i][t], record: null });
        assert.equal(readRecord(dir, was).length, orig.length);   // the old base64 string still reads
        records += 1;
      }
      assert.deepEqual({ ...row, ap: null, xp: null }, { ...original[i], ap: null, xp: null });
    });
    assert.equal(records, want.ap + want.xp);
    // the stream is nothing but frames: a walk from byte 0 ends exactly at the end of the file, one frame a record
    const seen = [...frames(stream)];
    assert.equal(seen.length, records);
    assert.equal(seen.reduce((s, f) => s + 4 + f.size, 0), fs.statSync(stream).size);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});
