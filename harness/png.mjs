// A PNG decoder for 8-bit grayscale, RGB and RGBA images without interlace
// (what matplotlib writes): {width, height, channels, pixel(x, y) -> [r, g, b]}.
// Decoding only.
import { inflateSync } from 'node:zlib';

export function decodePng(bytes) {
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let at = 8, width, height, depth, type, interlace;
  const idat = [];
  while (at < bytes.length) {
    const n = bytes.readUInt32BE(at), kind = bytes.toString('latin1', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + n);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + n;
  }
  const channels = { 0: 1, 2: 3, 6: 4, 4: 2 }[type];
  if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; ++y) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride), up = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; ++i) {
      const a = i >= channels ? row[i - channels] : 0, b = up ? up[i] : 0, c = up && i >= channels ? up[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[i] = v & 255;
    }
  }
  return {
    width, height, channels,
    pixel(x, y) {
      const o = y * stride + x * channels;
      return channels >= 3 ? [out[o], out[o + 1], out[o + 2]] : [out[o], out[o], out[o]];
    },
  };
}
