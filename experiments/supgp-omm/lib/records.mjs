// FlatBuffer framing for the records the modules take and return. Encoding,
// decoding and labelling only: no orbit computation and no text parsing of
// operator files happens here.
import * as flatbuffers from 'flatbuffers';
import { NCD } from 'spacedatastandards.org/lib/js/NCD/main.js';
import { OEM } from 'spacedatastandards.org/lib/js/OEM/main.js';
import * as OMM from 'spacedatastandards.org/lib/js/OMM/main.js';
import { ELEMENT_FIELDS, OEM_TYPE, ommFrame } from '../../../harness/records.mjs';
import { sha256 } from './http.mjs';

export { ELEMENT_FIELDS, OEM_TYPE, ommFrame };
export const NCD_TYPE = { schemaName: 'NCD.fbs', fileIdentifier: '$NCD', rootTypeName: 'NCD', wireFormat: 'flatbuffer' };
export const OMM_TYPE = { schemaName: 'OMM.fbs', fileIdentifier: '$OMM', rootTypeName: 'OMM', wireFormat: 'flatbuffer' };

const bb = (bytes) => new flatbuffers.ByteBuffer(new Uint8Array(bytes));
// [u32 n][$NCD][exact container bytes]: the one-port frame files/orbit-products read_container takes.
// `format` is an NCD container-format enum value, or undefined to let the module identify the container.
export function containerFrame(bytes, format) {
  const b = new flatbuffers.Builder(1024);
  const sha = b.createString(sha256(bytes));
  NCD.startNCD(b);
  NCD.addSourceByteLength(b, BigInt(bytes.length));
  NCD.addSourceSha256(b, sha);
  if (format !== undefined) NCD.addFormat(b, format);
  NCD.finishSizePrefixedNCDBuffer(b, NCD.endNCD(b));
  return { portId: 'container', payload: Buffer.concat([Buffer.from(b.asUint8Array()), bytes]), typeRef: NCD_TYPE };
}

// A (size-prefixed or plain) $OEM as an unpacked object.
export function unpackOem(bytes) {
  const buf = Buffer.from(bytes);
  const sizePrefixed = buf.length >= 12 && buf.toString('latin1', 8, 12) === '$OEM';
  return (sizePrefixed ? OEM.getSizePrefixedRootAsOEM(bb(buf)) : OEM.getRootAsOEM(bb(buf))).unpack();
}

export function packOem(oemT) {
  const b = new flatbuffers.Builder(1 << 20);
  OEM.finishSizePrefixedOEMBuffer(b, oemT.pack(b));
  return Buffer.from(b.asUint8Array());
}

// The ephemeris port frame for fit_elements and element_residuals: a size-prefixed $OEM whose every block
// is labelled with the object's NORAD number (the module needs one; the operator files carry other ids).
export function labelledEphemeris(oemBytes, norad, objectName) {
  const oem = unpackOem(oemBytes);
  for (const block of oem.EPHEMERIS_DATA_BLOCK ?? []) {
    block.OBJECT ??= new OEM.CATT();
    block.OBJECT.NORAD_CAT_ID = norad;
    if (objectName && !block.OBJECT.OBJECT_NAME) block.OBJECT.OBJECT_NAME = objectName;
  }
  return { portId: 'ephemeris', payload: packOem(oem), typeRef: OEM_TYPE };
}

// What a block says about itself, for the window and the guards:
// {blocks, frame, timeSystem, firstMs, lastMs, states, stepSeconds | null}.
export function summarizeOem(oemBytes) {
  const oem = unpackOem(oemBytes);
  const out = { blocks: oem.EPHEMERIS_DATA_BLOCK?.length ?? 0, frame: null, timeSystem: null, firstMs: Infinity, lastMs: -Infinity, states: 0, stepSeconds: null };
  const parse = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);
  for (const b of oem.EPHEMERIS_DATA_BLOCK ?? []) {
    out.frame ??= b.REFERENCE_FRAME?.NAME ?? `celestial:${b.REFERENCE_FRAME?.REFERENCE_FRAME?.frame ?? '?'}`;
    out.timeSystem ??= b.TIME_SYSTEM;
    if (b.STEP_SIZE > 0 && b.EPHEMERIS_DATA?.length) {
      const k = b.STATE_VECTOR_SIZE || 6;
      const n = b.EPHEMERIS_DATA.length / k;
      const start = parse(b.START_TIME);
      out.firstMs = Math.min(out.firstMs, start);
      out.lastMs = Math.max(out.lastMs, start + (n - 1) * b.STEP_SIZE * 1000);
      out.states += n;
      out.stepSeconds = b.STEP_SIZE;
    } else {
      const lines = b.EPHEMERIS_DATA_LINES ?? [];
      if (lines.length) {
        out.firstMs = Math.min(out.firstMs, parse(lines[0].EPOCH));
        out.lastMs = Math.max(out.lastMs, parse(lines.at(-1).EPOCH));
        out.states += lines.length;
      }
    }
  }
  return out;
}

// Size-prefixed $OMM records -> [{EPOCH, NORAD_CAT_ID, MEAN_MOTION, ..., BSTAR}].
export function decodeOmmStream(bytes) {
  const buf = Buffer.from(bytes);
  const out = [];
  for (let p = 0; p + 4 <= buf.length;) {
    const n = buf.readUInt32LE(p);
    if (n === 0) { p += 4; continue; }
    const t = OMM.OMM.getSizePrefixedRootAsOMM(bb(buf.subarray(p, p + 4 + n))).unpack();
    out.push({ EPOCH: t.EPOCH, NORAD_CAT_ID: t.NORAD_CAT_ID, ...Object.fromEntries(ELEMENT_FIELDS.map((k) => [k, t[k]])), theory: t.MEAN_ELEMENT_THEORY });
    p += 4 + n;
  }
  return out;
}
