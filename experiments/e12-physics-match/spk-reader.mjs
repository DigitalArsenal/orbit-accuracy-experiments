// In-memory reader for NAIF SPK kernels (DAF, little- or big-endian IEEE) given
// as a Buffer: no file I/O, so an operator's kernel can come straight from
// `fetch` and never touch the disk. It lists segments (target, centre, frame
// id, type, ET span) and, for the discrete-state types 9 (Lagrange) and 13
// (Hermite), returns the states exactly as stored (no interpolation) with
// epochs as TDB seconds past J2000 and as ISO TDB text, km -> m. Types 2 and 3
// (Chebyshev) are listed, not evaluated. Parsing only: the format is NAIF's
// (DAF and SPK Required Reading); evaluation belongs to the modules.
//
//   const spk = parseSpk(buffer);          // { endian, nd, ni, name, segments }
//   spk.segments[i]                        // { target, center, frame, type, startEt, stopEt, startIso, stopIso, beginAddr, endAddr, name }
//   const s = storedStates(spk, segment);  // types 9, 13: { degree, count, samples: [{ et, epoch, position: [m], velocity: [m/s] }] }
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

// TDB seconds past J2000 -> 'YYYY-MM-DDTHH:MM:SS.ffffff' (TDB has no leap seconds).
export function etToIso(et) {
  let whole = Math.floor(et), micro = Math.round((et - whole) * 1e6);
  if (micro === 1e6) { whole += 1; micro = 0; }
  return `${new Date(J2000_MS + whole * 1000).toISOString().slice(0, 19)}.${String(micro).padStart(6, '0')}`;
}

export function parseSpk(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 1024 || !/^DAF\/SPK/.test(buf.toString('latin1', 0, 8))) throw new Error('not a DAF/SPK file');
  const tag = buf.toString('latin1', 88, 96);
  let little = tag === 'LTL-IEEE';
  if (!little && tag !== 'BIG-IEEE') { // pre-N0052 files carry no tag: ND is 2 in the file's own byte order
    if (buf.readInt32LE(8) === 2) little = true; else if (buf.readInt32BE(8) !== 2) throw new Error(`unknown DAF binary format "${tag}"`);
  }
  const i32 = (at) => (little ? buf.readInt32LE(at) : buf.readInt32BE(at));
  const f64 = (at) => (little ? buf.readDoubleLE(at) : buf.readDoubleBE(at));
  const nd = i32(8), ni = i32(12), forward = i32(76);
  if (nd !== 2 || ni !== 6) throw new Error(`not an SPK summary shape (ND ${nd}, NI ${ni})`);
  const ss = nd + Math.floor((ni + 1) / 2); // summary size in doubles
  const segments = [];
  for (let rec = forward, guard = 0; rec > 0; ++guard) {
    if (guard > buf.length / 1024) throw new Error('DAF summary chain does not end');
    const at = (rec - 1) * 1024;
    const next = f64(at), count = f64(at + 16);
    for (let k = 0; k < count; ++k) {
      const s = at + 24 + k * ss * 8;
      const ints = s + 16;
      const name = buf.toString('latin1', rec * 1024 + k * ss * 8, rec * 1024 + (k + 1) * ss * 8).replace(/[\s\0]+$/, '');
      const startEt = f64(s), stopEt = f64(s + 8);
      segments.push({ name, target: i32(ints), center: i32(ints + 4), frame: i32(ints + 8), type: i32(ints + 12), startEt, stopEt,
        startIso: etToIso(startEt), stopIso: etToIso(stopEt), beginAddr: i32(ints + 16), endAddr: i32(ints + 20) });
    }
    rec = Math.round(next);
  }
  return { endian: little ? 'LTL-IEEE' : 'BIG-IEEE', nd, ni, name: buf.toString('latin1', 16, 76).replace(/[\s\0]+$/, ''), segments, buffer: buf, little };
}

// Types 9 and 13 store n states (x y z vx vy vz, km and km/s), then n epochs, a
// directory of every 100th epoch, the polynomial degree and n. Returned as stored.
export function storedStates(spk, segment) {
  if (segment.type !== 9 && segment.type !== 13) throw new Error(`segment type ${segment.type} is not a discrete-state type (9, 13)`);
  const { buffer: buf, little } = spk;
  const word = (addr) => (little ? buf.readDoubleLE((addr - 1) * 8) : buf.readDoubleBE((addr - 1) * 8)); // 1-based double-word address
  const end = segment.endAddr, n = Math.round(word(end)), degree = Math.round(word(end - 1));
  const directory = Math.floor((n - 1) / 100);
  if (segment.endAddr - segment.beginAddr + 1 !== 7 * n + directory + 2) throw new Error('segment length does not match its state count');
  const samples = [];
  for (let i = 0; i < n; ++i) {
    const at = segment.beginAddr + 6 * i, et = word(segment.beginAddr + 6 * n + i);
    samples.push({ et, epoch: etToIso(et), position: [0, 1, 2].map((j) => word(at + j) * 1000), velocity: [3, 4, 5].map((j) => word(at + j) * 1000) });
  }
  return { degree, count: n, samples };
}
