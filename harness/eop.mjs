// Earth orientation rows for propagator/ffm's earth_orientation input, as
// data-source/eop-parser publishes them from an IERS file, carried in the
// PRW EARTH_ORIENTATION arm (SDS 1.240.0). The parser module reads the file;
// this file only selects whole records by their MJD and re-frames them.
import fs from 'node:fs';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { decodeIngestRequest, encodeHttpResponse } from 'space-data-module-sdk/runtime-contracts';
import { sha256 } from './modules.mjs';
import { PRW_TYPE } from './prw.mjs';

// The parser accepts the SDK's typed HTTP response envelope. The original
// IERS bytes stay in BODY; the module owns all parsing and validation.
// A build whose response port does not name that envelope (eop-parser 0.1.0,
// whose response port took the host's response JSON) is sent the file's
// bytes on its body port instead.
function sourceResponse(body, parser, methodId) {
  const port = parser.manifest?.methods.find((m) => m.methodId === methodId)?.inputPorts.find((p) => p.portId === 'response');
  const typed = !parser.manifest || !!port?.acceptedTypeSets.some((s) => s.allowedTypes.some((t) => t.schemaName === 'HttpResponse.fbs'));
  if (!typed) return { portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } };
  return {
    portId: 'response',
    payload: encodeHttpResponse({ status: 200, body }),
    typeRef: { schemaName: 'HttpResponse.fbs', fileIdentifier: 'HRSP', rootTypeName: 'HttpResponse', wireFormat: 'flatbuffer' },
  };
}

// parse_c04 over an IERS EOP C04 file: [{mjd, row}] with each record decoded
// to its $EOP object, plus the parser's metadata.
export async function c04Records(parser, file) {
  const body = fs.readFileSync(file);
  const response = await parser.invoke('parse_c04', [sourceResponse(body, parser, 'parse_c04')]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  // the parser's metadata: an INGQ frame, or JSON from eop-parser 0.1.0
  const metaBytes = Buffer.from(response.outputs.find((f) => f.portId === 'meta').payload);
  const meta = metaBytes.subarray(4, 8).toString('latin1') === 'INGQ' ? decodeIngestRequest(metaBytes) : JSON.parse(metaBytes.toString('utf8'));
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = P.EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n)))).unpack();
    records.push({ mjd: row.MJD, row });
    at += 4 + n;
  }
  return { records, meta, sha256: sha256(body) };
}

// parse_finals2000a over an IERS finals2000A file (Rapid Service, with predictions; a path or its bytes): [{mjd, row}] as c04Records returns them. For dates after the C04 series ends.
export async function finalsRecords(parser, file) {
  const body = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const response = await parser.invoke('parse_finals2000a', [sourceResponse(body, parser, 'parse_finals2000a')]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = P.EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n)))).unpack();
    records.push({ mjd: row.MJD, row });
    at += 4 + n;
  }
  return { records, sha256: sha256(body) };
}

// The rows fromMjd..toMjd as one PRW EARTH_ORIENTATION frame.
export function eopFrame(records, fromMjd, toMjd) {
  const rows = records.filter((r) => r.mjd >= fromMjd && r.mjd <= toMjd).map((r) => r.row);
  if (!rows.length) throw new Error(`no EOP rows for MJD ${fromMjd}..${toMjd}`);
  const b = new fb.Builder(65536);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EARTH_ORIENTATION: Object.assign(new P.PRWEarthOrientationT(), { ROWS: rows }) }).pack(b));
  return { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: b.asUint8Array().slice(), rows: rows.length };
}
