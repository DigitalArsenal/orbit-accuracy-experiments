// The fitted $OCM records of the synthetic rows, as a stream of FlatBuffer frames beside the rows.
//
// A rows file (<store>/synthetic/<wasm sha12>/rows<suffix>.jsonl) holds the measurements of a case, one JSON line each. The fitted record of AP
// (and of SGP4-XP where it was flown) is a FlatBuffer ($OCM), and it is kept in <store>/synthetic/<wasm sha12>/records<suffix>.fsdata:
// nothing but [4-byte little-endian size][the $OCM bytes] back to back (no header, no padding, no trailer, the store's .fsdata layout), so
// a stock FlatBuffers reader walks it from byte 0, and a slice of it is a load_epochs payload as it stands. The row names its record by
// {file, offset, size, sha256}: file is the stream's name in the row's folder, offset the byte where the frame (its size prefix) starts,
// size the length of the $OCM bytes (the frame is 4 + size bytes), sha256 the first 16 hex digits of the SHA-256 of the $OCM bytes.
// Rows written before this change hold the record as a base64 string in the same place; readRecord reads both.
//
// A stream may be written by more than one process: append takes a short exclusive lock (a lock directory beside the file), takes the offset from the file's size at that moment and reads the frame back.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const HASH_HEX = 16;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The stream beside a rows file: rows.jsonl -> records.fsdata, rows-fit-forecast-span-ts72.jsonl -> records-fit-forecast-span-ts72.fsdata. */
export const recordsFileOf = (rowsFile) => path.join(path.dirname(rowsFile), path.basename(rowsFile).replace(/^rows/, 'records').replace(/\.jsonl$/, '.fsdata'));

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** A short exclusive lock on a stream: a lock directory beside it (mkdir is atomic) holding the holder's process id. A lock whose holder is gone, or that holds no id for a minute, is taken over. */
function withLock(file, fn) {
  const lock = `${file}.lock`, holder = path.join(lock, 'holder');
  for (let tries = 0; ; tries += 1) {
    try { fs.mkdirSync(lock); fs.writeFileSync(holder, String(process.pid)); break; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let gone = false;
    try {
      const pid = Number(fs.readFileSync(holder, 'utf8'));
      if (pid) { try { process.kill(pid, 0); } catch (e) { gone = e.code === 'ESRCH'; } } else gone = Date.now() - fs.statSync(lock).mtimeMs > 60e3;
    } catch { try { gone = Date.now() - fs.statSync(lock).mtimeMs > 60e3; } catch { continue; } }   // no holder file: the taker is between mkdir and its write
    if (gone) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
    if (tries > 12000) throw new Error(`${file}: the stream's lock is held by another process (${fs.readFileSync(holder, 'utf8')}) for over a minute`);
    sleepMs(5);
  }
  try { return fn(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

/** An append-only stream, safe whoever else writes it: append(bytes) takes the lock, takes the offset from the file's size at that moment, writes one frame, reads it back at that offset (its size prefix and its hash must be the frame just written, else it throws) and returns the row's reference to it. */
export class RecordStream {
  constructor(file) { this.file = file; }
  transaction(fn) { return withLock(this.file, () => fn((bytes) => this.appendLocked(bytes))); }
  append(ocm) { return this.transaction((append) => append(ocm)); }
  appendLocked(ocm) {
    const bytes = Buffer.from(ocm), frame = Buffer.alloc(4 + bytes.length), hash = sha256(bytes);
    frame.writeUInt32LE(bytes.length, 0); bytes.copy(frame, 4);
      const offset = fs.existsSync(this.file) ? fs.statSync(this.file).size : 0;
      fs.appendFileSync(this.file, frame);
      const ref = { file: path.basename(this.file), offset, size: bytes.length, sha256: hash.slice(0, HASH_HEX) };
      const back = readFrame(this.file, ref);   // throws if the frame at the offset is not the one just written
      if (sha256(back) !== hash) throw new Error(`${this.file}: the frame read back at ${offset} is not the record just written`);
      return ref;
  }
}

/** A copy of a row whose AP and SGP4-XP records (a base64 string at row.ap.record, row.xp.record) are written to the stream and replaced by their references. */
export function withStreamedRecords(row, stream) {
  const out = { ...row };
  for (const t of ['ap', 'xp']) if (typeof row[t]?.record === 'string') out[t] = { ...row[t], record: stream.append(Buffer.from(row[t].record, 'base64')) };
  return out;
}

/** The $OCM bytes of the frame a reference names in a stream file: the size prefix and the hash must be the reference's, else it throws and reads nothing else (no search, no guess). */
export function readFrame(file, ref) {
  const fd = fs.openSync(file, 'r');
  try {
    const frame = Buffer.alloc(4 + ref.size);
    if (fs.readSync(fd, frame, 0, frame.length, ref.offset) !== frame.length) throw new Error(`${file}: the stream ends before the frame the row names at ${ref.offset}; not reading another frame in its place`);
    if (frame.readUInt32LE(0) !== ref.size) throw new Error(`${file}: the frame at ${ref.offset} holds ${frame.readUInt32LE(0)} bytes, the row names ${ref.size}; not reading another frame in its place`);
    const bytes = frame.subarray(4);
    if (!sha256(bytes).startsWith(ref.sha256)) throw new Error(`${file}: the frame at ${ref.offset} is not the record the row names (sha256); not reading another frame in its place`);
    return new Uint8Array(bytes);
  } finally { fs.closeSync(fd); }
}

/** The $OCM bytes of a record as a row holds it: a reference {file, offset, size, sha256} (read from the stream in `dir` through readFrame) or an old base64 string. */
export function readRecord(dir, ref) {
  if (typeof ref === 'string') return new Uint8Array(Buffer.from(ref, 'base64'));
  if (!ref || typeof ref.file !== 'string' || !Number.isInteger(ref.offset) || !Number.isInteger(ref.size) || typeof ref.sha256 !== 'string') throw new Error('a record reference names {file, offset, size, sha256}');
  return readFrame(path.join(dir, ref.file), ref);
}

/** Every frame of a stream in order: { offset, size, bytes }. */
export function* frames(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const length = fs.fstatSync(fd).size, prefix = Buffer.alloc(4);
    for (let at = 0; at < length;) {
      if (fs.readSync(fd, prefix, 0, 4, at) !== 4) throw new Error(`${file}: a size prefix is cut off at ${at}`);
      const size = prefix.readUInt32LE(0);
      if (!size || at + 4 + size > length) throw new Error(`${file}: the frame at ${at} runs past the end or is empty`);
      const bytes = Buffer.alloc(size);
      if (fs.readSync(fd, bytes, 0, size, at + 4) !== size) throw new Error(`${file}: incomplete frame at ${at}`);
      yield { offset: at, size, bytes };
      at += 4 + size;
    }
  } finally { fs.closeSync(fd); }
}

// Only files created by this process belong to its cleanup set.
const replacements = new Set();
let cleanupInstalled = false;
function ownReplacement(file) {
  replacements.add(file);
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  const cleanup = () => {
    for (const file of replacements) {
      try { fs.rmSync(file, { force: true }); } catch (e) { console.error(`temporary stream cleanup failed: ${file}: ${e.message}`); }
    }
  };
  process.on('exit', cleanup);
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, () => { cleanup(); process.exit(code); });
}

/** A replacement is published only after its frames tile the file and every identity reads back. */
export class StreamReplacement {
  constructor(target, inputs = [], { allowEmpty = false } = {}) {
    this.allowEmpty = allowEmpty;
    const prefix = `${path.basename(target)}.`;
    for (const name of fs.readdirSync(path.dirname(target))) {
      if (name.startsWith(prefix) && /^\d+\.[0-9a-f-]+\.tmp$/.test(name.slice(prefix.length))) console.error(`leftover temporary stream: ${path.join(path.dirname(target), name)}`);
    }
    const canonical = (f) => fs.existsSync(f) ? fs.realpathSync(f) : path.resolve(f);
    if (inputs.some((f) => canonical(f) === canonical(target))) throw new Error(`output equals input: ${target}`);
    this.target = target;
    this.file = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.closeSync(fs.openSync(this.file, 'wx'));
    ownReplacement(this.file);
    this.stream = new RecordStream(this.file);
    this.expected = [];
  }
  append(bytes, identity) {
    const ref = this.stream.append(bytes);
    this.expected.push({ identity, sha: sha256(bytes) });
    return ref;
  }
  verify(identityOf) {
    let count = 0;
    for (const fr of frames(this.file)) {
      const want = this.expected[count++];
      if (!want || identityOf(fr.bytes) !== want.identity || sha256(fr.bytes) !== want.sha) throw new Error('replacement identity or bytes differ');
    }
    if (count !== this.expected.length) throw new Error('replacement frame count differs');
    this.checkEmpty();
    this.verified = true;
  }
  checkEmpty() {
    if (!this.allowEmpty && this.expected.length === 0 && fs.existsSync(this.target) && fs.statSync(this.target).size > 0)
      throw new Error('empty replacement of a non-empty stream requires --allow-empty');
  }
  publish() {
    if (!this.verified) throw new Error('replacement has not been verified');
    this.checkEmpty();
    fs.renameSync(this.file, this.target);
    replacements.delete(this.file);
  }
}

/** Attach a stable outcome to failed seed or truth stream writes. */
export function streamWrite(stream, write) {
  try { return write(); } catch (cause) {
    const error = new Error(`stream-write-failed: ${stream}: ${cause.message}`, { cause });
    error.outcome = { name: 'stream-write-failed', stream, code: cause.code ?? 'stream-error' };
    throw error;
  }
}

/** A failed persistence attempt cannot complete a case, even when its truth hash exists. */
export const hasPersistedTruth = (row) => Boolean(row.truth?.hash && !row.error && !row.streamWriteFailure);
