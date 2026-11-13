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
// One process writes a stream (the parent of run.mjs, which already is the only writer of its rows file); the offset is the stream's
// size when the frame is appended.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const HASH_HEX = 16;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The stream beside a rows file: rows.jsonl -> records.fsdata, rows-fit-forecast-span-ts72.jsonl -> records-fit-forecast-span-ts72.fsdata. */
export const recordsFileOf = (rowsFile) => path.join(path.dirname(rowsFile), path.basename(rowsFile).replace(/^rows/, 'records').replace(/\.jsonl$/, '.fsdata'));

/** An append-only stream: append(bytes) writes one frame and returns the row's reference to it. */
export class RecordStream {
  constructor(file) { this.file = file; this.size = fs.existsSync(file) ? fs.statSync(file).size : 0; }
  append(ocm) {
    const bytes = Buffer.from(ocm), frame = Buffer.alloc(4 + bytes.length);
    frame.writeUInt32LE(bytes.length, 0); bytes.copy(frame, 4);
    const offset = this.size;
    fs.appendFileSync(this.file, frame);
    this.size += frame.length;
    return { file: path.basename(this.file), offset, size: bytes.length, sha256: sha256(bytes).slice(0, HASH_HEX) };
  }
}

/** A copy of a row whose AP and SGP4-XP records (a base64 string at row.ap.record, row.xp.record) are written to the stream and replaced by their references. */
export function withStreamedRecords(row, stream) {
  const out = { ...row };
  for (const t of ['ap', 'xp']) if (typeof row[t]?.record === 'string') out[t] = { ...row[t], record: stream.append(Buffer.from(row[t].record, 'base64')) };
  return out;
}

/** The $OCM bytes of a record as a row holds it: a reference {file, offset, size, sha256} (read from the stream in `dir`, checked against its size prefix and its hash) or an old base64 string. */
export function readRecord(dir, ref) {
  if (typeof ref === 'string') return new Uint8Array(Buffer.from(ref, 'base64'));
  if (!ref || typeof ref.file !== 'string' || !Number.isInteger(ref.offset) || !Number.isInteger(ref.size)) throw new Error('a record reference names {file, offset, size, sha256}');
  const fd = fs.openSync(path.join(dir, ref.file), 'r');
  try {
    const frame = Buffer.alloc(4 + ref.size);
    if (fs.readSync(fd, frame, 0, frame.length, ref.offset) !== frame.length) throw new Error(`${ref.file}: the stream ends before the frame at ${ref.offset}`);
    if (frame.readUInt32LE(0) !== ref.size) throw new Error(`${ref.file}: the frame at ${ref.offset} holds ${frame.readUInt32LE(0)} bytes, the row names ${ref.size}`);
    const bytes = frame.subarray(4);
    if (!sha256(bytes).startsWith(ref.sha256)) throw new Error(`${ref.file}: the frame at ${ref.offset} is not the record the row names (sha256)`);
    return new Uint8Array(bytes);
  } finally { fs.closeSync(fd); }
}

/** Every frame of a stream in order: { offset, size, bytes }. */
export function* frames(file) {
  const buf = fs.readFileSync(file);
  for (let at = 0; at < buf.length;) {
    if (at + 4 > buf.length) throw new Error(`${file}: a size prefix is cut off at ${at}`);
    const size = buf.readUInt32LE(at);
    if (at + 4 + size > buf.length) throw new Error(`${file}: the frame at ${at} runs past the end`);
    yield { offset: at, size, bytes: buf.subarray(at + 4, at + 4 + size) };
    at += 4 + size;
  }
}
