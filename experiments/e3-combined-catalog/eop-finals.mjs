// IERS finals2000A rows for propagator/hpop, read by data-source/eop-parser
// `parse_finals2000a`, observed rows only: the file is cut after the last row
// whose polar motion (column 17) and UT1-UTC (column 58) are flagged I, the
// same cut E3's reference states were converted with (truth/finals2000a.patch).
import fs from 'node:fs';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { sha256 } from '../../harness/modules.mjs';

export function observedFinals(text) {
  const lines = text.split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (l[16] === 'I' && l[57] === 'I') last = i; });
  return Buffer.from(`${lines.slice(0, last + 1).join('\n')}\n`);
}

export async function finalsRecords(parser, file) {
  const raw = fs.readFileSync(file);
  const body = observedFinals(raw.toString('latin1'));
  const response = await parser.invoke('parse_finals2000a', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = P.EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n)))).unpack();
    records.push({ mjd: row.MJD, row });
    at += 4 + n;
  }
  return { records, sha256: sha256(raw), observedSha256: sha256(body) };
}
