// Read-only access to an SDN ephemeris-provider node's captured files: the
// $NCD descriptors in its dataset publications (source URL, SHA-256, size,
// block-store CID) and the raw bytes in its IPFS block store (kubo flatfs,
// next-to-last/2 sharding, UnixFS dag-pb or raw leaves). Nothing is written
// to the node. Every file read is checked against its descriptor's SHA-256.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as fb from 'flatbuffers';
import { NCD } from 'spacedatastandards.org/lib/js/NCD/main.js';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base58(text) {
  let n = 0n;
  for (const c of text) n = n * 58n + BigInt(B58.indexOf(c));
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return Buffer.concat([Buffer.alloc(text.match(/^1*/)[0].length), Buffer.from(hex, 'hex')]);
}
function base32(bytes, alphabet = B32) {
  let bits = 0, value = 0, out = '';
  for (const x of bytes) {
    value = (value << 8) | x; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return bits ? out + alphabet[(value << (5 - bits)) & 31] : out;
}
function base32Decode(text) {
  const alphabet = B32.toLowerCase();
  let bits = 0, value = 0;
  const out = [];
  for (const c of text) {
    value = (value << 5) | alphabet.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function varint(buf, p) {
  let x = 0, s = 0, b;
  do { b = buf[p++]; x += (b & 127) * 2 ** s; s += 7; } while (b & 128);
  return [x, p];
}
// CID text or binary CID -> {codec, multihash}
function cidParts(cid) {
  if (typeof cid === 'string' && cid.startsWith('Qm')) return { codec: 0x70, multihash: base58(cid) };
  const raw = typeof cid === 'string' ? base32Decode(cid.slice(1)) : cid;
  if (raw[0] === 0x12) return { codec: 0x70, multihash: raw };  // binary CIDv0 link
  let p = 0, codec;
  [, p] = varint(raw, p);
  [codec, p] = varint(raw, p);
  return { codec, multihash: raw.subarray(p) };
}
// Protocol-buffer fields of one message: [[field, bytes | number]].
function fields(buf) {
  const out = [];
  for (let p = 0; p < buf.length;) {
    let key, n;
    [key, p] = varint(buf, p);
    if ((key & 7) === 2) { [n, p] = varint(buf, p); out.push([key >>> 3, buf.subarray(p, p + n)]); p += n; }
    else if ((key & 7) === 0) { [n, p] = varint(buf, p); out.push([key >>> 3, n]); }
    else throw new Error(`unsupported protobuf wire type ${key & 7}`);
  }
  return out;
}

export class ProviderNode {
  constructor(root, provider) {
    this.provider = provider;
    this.dir = path.join(root, provider);
    this.blocks = path.join(this.dir, 'kubo', 'blocks');
  }

  block(multihash) {
    const key = base32(multihash);
    const bytes = fs.readFileSync(path.join(this.blocks, key.slice(-3, -1), `${key}.data`));
    if (!crypto.createHash('sha256').update(bytes).digest().equals(multihash.subarray(2))) throw new Error(`${this.provider}: block ${key} fails its hash`);
    return bytes;
  }

  // UnixFS file bytes in link order.
  read(cid) {
    const chunks = [];
    const walk = ({ codec, multihash }) => {
      const bytes = this.block(multihash);
      if (codec === 0x55) { chunks.push(bytes); return; }
      const node = fields(bytes);
      const links = node.filter(([f]) => f === 2).map(([, link]) => fields(link).find(([f]) => f === 1)[1]);
      if (!links.length) {
        const data = node.find(([f]) => f === 1)?.[1];
        const content = data ? fields(data).find(([f]) => f === 2)?.[1] : null;
        if (content) chunks.push(content);
        return;
      }
      for (const link of links) walk(cidParts(link));
    };
    walk(cidParts(cid));
    return Buffer.concat(chunks);
  }

  // Every captured file: {url, cid, sha256, bytes, format, captured (ISO,
  // the first dataset index that lists it)}, one entry per descriptor.
  descriptors() {
    const base = path.join(this.dir, 'dataset-publications', 'NCD');
    const seen = new Map();
    const indexes = fs.readdirSync(path.join(base, 'indexes')).map((name) => {
      const file = path.join(base, 'indexes', name);
      return { file, mtime: fs.statSync(file).mtimeMs };
    }).sort((a, b) => a.mtime - b.mtime);
    for (const { file, mtime } of indexes) {
      const index = JSON.parse(fs.readFileSync(file, 'utf8'));
      const shardFile = path.join(base, 'shards', index.shardFile);
      if (!fs.existsSync(shardFile)) continue;
      const shard = fs.readFileSync(shardFile);
      for (const r of index.records) {
        if (seen.has(r.cid)) continue;
        const n = NCD.getSizePrefixedRootAsNCD(new fb.ByteBuffer(new Uint8Array(shard.subarray(r.offset, r.offset + r.length + 4))));
        seen.set(r.cid, {
          url: r.sourceTags?.SourceURL ?? null, cid: n.SOURCE_CID(), sha256: n.SOURCE_SHA256(), bytes: Number(n.SOURCE_BYTE_LENGTH()),
          format: n.PROVIDER_DEFINED_FORMAT_NAME(), captured: new Date(mtime).toISOString(), descriptorCid: r.cid,
        });
      }
    }
    return [...seen.values()];
  }

  // The file's bytes, checked against its descriptor.
  file(descriptor) {
    const bytes = this.read(descriptor.cid);
    if (bytes.length !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) throw new Error(`${this.provider}: ${descriptor.url} differs from its descriptor`);
    return bytes;
  }
}
