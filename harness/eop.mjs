// Earth orientation rows for propagator/hpop's earth_orientation input, as
// data-source/eop-parser publishes them from an IERS file, carried in the
// PRW EARTH_ORIENTATION arm (SDS 1.240.0). The parser module reads the file;
// this file only selects whole records by their MJD and re-frames them.
import fs from 'node:fs';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { sha256 } from './modules.mjs';
import { PRW_TYPE } from './prw.mjs';

// parse_c04 over an IERS EOP C04 file: [{mjd, row}] with each record decoded
// to its $EOP object, plus the parser's metadata.
export async function c04Records(parser, file) {
  const body = fs.readFileSync(file);
  const response = await parser.invoke('parse_c04', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const meta = JSON.parse(Buffer.from(response.outputs.find((f) => f.portId === 'meta').payload));
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = P.EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n)))).unpack();
    records.push({ mjd: row.MJD, row });
    at += 4 + n;
  }
  return { records, meta, sha256: sha256(body) };
}

// The rows fromMjd..toMjd as one PRW EARTH_ORIENTATION frame.
export function eopFrame(records, fromMjd, toMjd) {
  const rows = records.filter((r) => r.mjd >= fromMjd && r.mjd <= toMjd).map((r) => r.row);
  if (!rows.length) throw new Error(`no EOP rows for MJD ${fromMjd}..${toMjd}`);
  const b = new fb.Builder(65536);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EARTH_ORIENTATION: Object.assign(new P.PRWEarthOrientationT(), { ROWS: rows }) }).pack(b));
  return { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: b.asUint8Array().slice(), rows: rows.length };
}
