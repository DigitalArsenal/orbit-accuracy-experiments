// IERS finals2000A rows, read by data-source/eop-parser `parse_finals2000a`:
// observed (I) rows and, after them, the file's predicted (P) rows, which E6
// needs for the last days of its window (the file was captured on its last
// day). Reading and re-framing only.
import fs from 'node:fs';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { sha256 } from '../../harness/modules.mjs';

export async function finalsRecords(parser, file) {
  const body = fs.readFileSync(file);
  const response = await parser.invoke('parse_finals2000a', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = P.EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n)))).unpack();
    records.push({ mjd: row.MJD, row });
    at += 4 + n;
  }
  const lastObserved = body.toString('latin1').split('\n').filter((l) => l[16] === 'I' && l[57] === 'I').length;
  return { records, sha256: sha256(body), lastObservedRow: lastObserved };
}
