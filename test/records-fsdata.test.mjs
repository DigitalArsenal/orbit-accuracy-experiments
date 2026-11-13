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
import { RecordStream, frames, readRecord, recordsFileOf } from '../experiments/synthetic-orbits/records.mjs';

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

// Two writers on one stream (two run.mjs parents started on the same wasm folder and suffix): every reference reads back its own bytes, whoever appended it,
// and a reference whose offset or hash is wrong is refused, never guessed. The records are the first stored records of the archive sample when it is there (real $OCM bytes), else the bytes of any file.
test('two RecordStream objects on one stream: every reference reads back its own bytes; a wrong reference is refused', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'records-fsdata-two-'));
  try {
    const file = path.join(scratch, 'records.fsdata'), a = new RecordStream(file), b = new RecordStream(file), made = [];
    const real = sample ? fs.readFileSync(sample.path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => typeof r.ap?.record === 'string').map((r) => Buffer.from(r.ap.record, 'base64')) : [];
    const pool = real.length >= 6 ? real : Array.from({ length: 6 }, (_, i) => crypto.randomBytes(900 + 37 * i));
    for (let i = 0; i < 24; i += 1) { const bytes = pool[i % pool.length], writer = i % 3 === 0 ? a : b; made.push({ bytes, ref: writer.append(bytes) }); }
    for (const { bytes, ref } of made) assert.ok(Buffer.from(readRecord(scratch, ref)).equals(bytes));
    // the references tile the file: each offset is the end of the one before, and a walk from byte 0 ends at the end of the file
    made.reduce((end, { ref }) => { assert.equal(ref.offset, end); return end + 4 + ref.size; }, 0);
    assert.equal([...frames(file)].length, made.length);
    assert.equal(fs.existsSync(`${file}.lock`), false, 'the lock is released');
    // a wrong offset, size or hash is refused
    const good = made[3].ref;
    assert.throws(() => readRecord(scratch, { ...good, offset: good.offset + 1 }), /not reading another frame/);
    assert.throws(() => readRecord(scratch, { ...good, size: good.size + 1 }), /not reading another frame/);
    assert.throws(() => readRecord(scratch, { ...good, sha256: '0000000000000000' }), /not reading another frame/);
    // a stale lock (its holder's process is gone) is taken over
    fs.mkdirSync(`${file}.lock`); fs.writeFileSync(path.join(`${file}.lock`, 'holder'), '2147483646');
    const ref = a.append(pool[0]);
    assert.ok(Buffer.from(readRecord(scratch, ref)).equals(pool[0]));
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});

// Two processes appending at the same time (two run.mjs parents on one wasm folder and suffix): 150 records each, started together;
// every reference they return reads back its own bytes and the references tile the file.
test('two processes appending to one stream at once: no reference is wrong', async () => {
  const { spawn } = await import('node:child_process');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'records-fsdata-proc-'));
  try {
    const file = path.join(scratch, 'records.fsdata'), mod = path.join(repoRoot, 'experiments/synthetic-orbits/records.mjs');
    const code = `import { RecordStream } from ${JSON.stringify(mod)}; import crypto from 'node:crypto'; const s = new RecordStream(${JSON.stringify(file)}), seed = process.argv[1], out = []; for (let i = 0; i < 150; i += 1) { const b = crypto.createHash('sha512').update(seed + i).digest(); const bytes = Buffer.concat(Array.from({ length: 8 + (i % 40) }, () => b)); out.push({ i, ref: s.append(bytes), sha: crypto.createHash('sha256').update(bytes).digest('hex') }); } console.log(JSON.stringify(out));`;
    const run = (seed) => new Promise((resolve, reject) => { const c = spawn(process.execPath, ['--input-type=module', '-e', code, seed], { stdio: ['ignore', 'pipe', 'inherit'] }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('exit', (k) => (k === 0 ? resolve(JSON.parse(o)) : reject(new Error(`writer ${seed} exited ${k}`)))); });
    const [x, y] = await Promise.all([run('x'), run('y')]);
    const all = [...x, ...y];
    for (const { ref, sha } of all) assert.equal(sha256(readRecord(scratch, ref)), sha);
    all.sort((p, q) => p.ref.offset - q.ref.offset).reduce((end, { ref }) => { assert.equal(ref.offset, end); return end + 4 + ref.size; }, 0);
    assert.equal([...frames(file)].length, 300);
    assert.equal(fs.existsSync(`${file}.lock`), false);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});
