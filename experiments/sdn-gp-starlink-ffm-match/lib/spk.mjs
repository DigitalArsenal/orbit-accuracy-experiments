// Metadata of a NAIF SPK (DAF) file: the segment descriptors (target, centre, frame, type, span). Reads the file record and
// the summary records only (NAIF DAF Required Reading); no state is evaluated here, the states come from
// files/orbit-products `read_container` (a module).
import fs from 'node:fs';

const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
// ET (TDB seconds past J2000) as an approximate UTC calendar string: ET - 64.184 s - leap seconds (37 from 2017-01-01, fewer before).
// Spans for the inventory only (within about 2 s); windows never use this.
const LEAP = [[2017, 37], [2015.5, 36], [2012.5, 35], [2009, 34], [2006, 33], [1999, 32]];
function approxUtc(et) {
  const rough = new Date(J2000_UNIX_MS + et * 1000);
  const year = rough.getUTCFullYear() + rough.getUTCMonth() / 12;
  const leap = (LEAP.find(([y]) => year >= y) ?? [0, 31])[1];
  return new Date(J2000_UNIX_MS + (et - 32.184 - leap) * 1000).toISOString().replace('.000Z', 'Z');
}
const NAME = { 0: 'SSB', 10: 'Sun', 399: 'Earth', 301: 'Moon', 3: 'EMB', 599: 'Jupiter', 499: 'Mars' };
const FRAME = { 1: 'J2000', 17: 'ECLIPJ2000', 2: 'B1950' };

export function spkSegments(file) {
  const buffer = fs.readFileSync(file);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const id = buffer.toString('latin1', 0, 7);
  if (id !== 'DAF/SPK') throw new Error(`${file}: not a DAF/SPK`);
  const little = buffer.toString('latin1', 88, 96) !== 'BIG-IEEE';
  const nd = view.getInt32(8, little), ni = view.getInt32(12, little), forward = view.getInt32(76, little);
  const sumSize = nd + Math.floor((ni + 1) / 2); // doubles per summary
  const segments = [];
  for (let record = forward; record > 0;) {
    const base = (record - 1) * 1024;
    const next = view.getFloat64(base, little), count = view.getFloat64(base + 16, little);
    for (let k = 0; k < count; k += 1) {
      const at = base + 24 + k * sumSize * 8;
      const start = view.getFloat64(at, little), stop = view.getFloat64(at + 8, little);
      const ints = Array.from({ length: ni }, (_, i) => view.getInt32(at + nd * 8 + i * 4, little));
      segments.push({ target: ints[0], center: ints[1], frame: ints[2], type: ints[3], etStart: start, etStop: stop, utcStart: approxUtc(start), utcStop: approxUtc(stop) });
    }
    record = Math.round(next);
  }
  return segments;
}
export const describeSegment = (s) => ({ target: s.target, center: NAME[s.center] ?? s.center, frame: FRAME[s.frame] ?? s.frame, type: s.type, start: s.utcStart, stop: s.utcStop });
