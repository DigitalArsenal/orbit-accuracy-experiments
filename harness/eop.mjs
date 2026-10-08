// Earth orientation rows for propagator/hpop's earth_orientation input, as
// data-source/eop-parser publishes them from an IERS file. The parser module
// reads the file; this file only selects whole records by their MJD and
// concatenates them.
import fs from 'node:fs';
import * as fb from 'flatbuffers';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/main.js';
import { sha256 } from './modules.mjs';

export const EOP_TYPE = { schemaName: 'EOP.fbs', fileIdentifier: '$EOP', rootTypeName: 'EOP', wireFormat: 'flatbuffer' };

// parse_c04 over an IERS EOP C04 file: [{mjd, bytes}] with each record's
// 4-byte length prefix kept, plus the parser's metadata.
export async function c04Records(parser, file) {
  const body = fs.readFileSync(file);
  const response = await parser.invoke('parse_c04', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const meta = JSON.parse(Buffer.from(response.outputs.find((f) => f.portId === 'meta').payload));
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const bytes = out.subarray(at, at + 4 + n);
    records.push({ mjd: EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(bytes.subarray(4)))).MJD(), bytes });
    at += 4 + n;
  }
  return { records, meta, sha256: sha256(body) };
}

// The rows fromMjd..toMjd as one stream on the earth_orientation port.
export function eopFrame(records, fromMjd, toMjd) {
  const rows = records.filter((r) => r.mjd >= fromMjd && r.mjd <= toMjd);
  if (!rows.length) throw new Error(`no EOP rows for MJD ${fromMjd}..${toMjd}`);
  return { portId: 'earth_orientation', typeRef: EOP_TYPE, payload: Buffer.concat(rows.map((r) => r.bytes)), rows: rows.length };
}
