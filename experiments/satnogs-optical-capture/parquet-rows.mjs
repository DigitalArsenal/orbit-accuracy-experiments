// parquet-rows.mjs: the row count of a Parquet file, read from the footer (FileMetaData.num_rows).
// Reads only the last bytes of the file; no data page is decoded. The footer is Thrift compact protocol.
import fs from 'node:fs';

const MAGIC = 'PAR1';

class Reader {
  constructor(buf, pos = 0) { this.buf = buf; this.pos = pos; }
  byte() { if (this.pos >= this.buf.length) throw new Error('footer truncated'); return this.buf[this.pos++]; }
  varint() {
    let result = 0n, shift = 0n;
    for (;;) {
      const b = this.byte();
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
      shift += 7n;
    }
  }
  zigzag() { const v = this.varint(); return (v >> 1n) ^ -(v & 1n); }
  value(type) {
    switch (type) {
      case 1: return true;
      case 2: return false;
      case 3: return this.byte();
      case 4: case 5: case 6: return this.zigzag();
      case 7: this.pos += 8; return null;
      case 8: { const n = Number(this.varint()); this.pos += n; return null; }
      case 9: case 10: {
        const head = this.byte();
        const size = head >> 4 === 15 ? Number(this.varint()) : head >> 4;
        const elem = head & 15;
        const out = [];
        for (let i = 0; i < size; ++i) out.push(elem === 1 || elem === 2 ? this.byte() === 1 : this.value(elem));
        return out;
      }
      case 11: {
        const size = Number(this.varint());
        if (size > 0) {
          const kv = this.byte();
          for (let i = 0; i < size; ++i) { this.value(kv >> 4); this.value(kv & 15); }
        }
        return null;
      }
      case 12: return this.struct();
      default: throw new Error(`unknown thrift type ${type}`);
    }
  }
  struct() {
    const fields = new Map();
    let id = 0;
    for (;;) {
      const head = this.byte();
      if (head === 0) return fields;
      const type = head & 15, delta = head >> 4;
      id = delta ? id + delta : Number(this.zigzag());
      fields.set(id, this.value(type));
    }
  }
}

export function parquetRows(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 12) throw new Error('not a Parquet file');
    const tail = Buffer.alloc(8);
    fs.readSync(fd, tail, 0, 8, size - 8);
    if (tail.toString('latin1', 4) !== MAGIC) throw new Error('not a Parquet file: no PAR1 footer');
    const length = tail.readUInt32LE(0);
    if (length + 8 > size) throw new Error('footer length exceeds file');
    const footer = Buffer.alloc(length);
    fs.readSync(fd, footer, 0, length, size - 8 - length);
    const rows = new Reader(footer).struct().get(3);
    if (typeof rows !== 'bigint') throw new Error('footer has no num_rows');
    return Number(rows);
  } finally {
    fs.closeSync(fd);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(parquetRows(process.argv[2]));
