// Operator ephemeris containers -> $OEM, by files/orbit-products read_container (WASM).
import { inflateRawSync } from 'node:zlib';
import { ncdContainerFormat } from 'spacedatastandards.org/lib/js/NCD/ncdContainerFormat.js';
import { containerFrame } from '../records.mjs';

const DATA_LINE = /^\s*(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{3})T/;

// The module's CCSDS KVN reader takes data lines between DATA_START and DATA_STOP and knows no
// COVARIANCE_START block. NASA's ISS file and Planet's per-satellite files (OEM version 2.0) put the
// data lines straight after META_STOP, so a "malformed" refusal follows; Planet's files also carry a
// covariance block after the states. This adds the two marker lines around each run of data lines and
// leaves out covariance blocks (COVARIANCE_START to COVARIANCE_STOP, or to the end of a prefix); it
// changes nothing else, and every number is still read by the module.
export function withDataMarkers(bytes) {
  const out = [];
  let inData = false;
  let inCovariance = false;
  for (const line of Buffer.from(bytes).toString('utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (inCovariance) { if (t.startsWith('COVARIANCE_STOP')) inCovariance = false; continue; }
    if (t.startsWith('COVARIANCE_START')) { if (inData) { out.push('DATA_STOP'); inData = false; } inCovariance = true; continue; }
    const isData = DATA_LINE.test(line);
    if (isData && !inData) { out.push('DATA_START'); inData = true; }
    if (!isData && inData && line.trim() !== '') { out.push('DATA_STOP'); inData = false; }
    out.push(line);
  }
  if (inData) out.push('DATA_STOP');
  return Buffer.from(out.join('\n'));
}

// -> {ephemeris: Buffer (size-prefixed $OEM), descriptor: Buffer ($NCD)}
export async function readContainer(reader, bytes, { kvn = false } = {}) {
  const frame = kvn ? containerFrame(withDataMarkers(bytes), ncdContainerFormat.CCSDS_OEM_KVN) : containerFrame(bytes);
  const out = await reader.invoke('read_container', [frame]);
  const port = (id) => Buffer.from(out.outputs.find((o) => o.portId === id).payload);
  return { ephemeris: port('ephemeris'), descriptor: port('descriptor') };
}

// The first stored or deflated member of a ZIP (central directory), in memory. Container expansion only:
// the member is then read by the module like any other container. Bounded, as the zip comes from a
// network host: at most `limit` bytes are inflated.
export function firstZipMember(zip, { limit = 128 * 1024 * 1024 } = {}) {
  const buf = Buffer.from(zip);
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) --end;
  if (end < 0) throw new Error('zip: no end-of-central-directory record');
  const at = buf.readUInt32LE(end + 16);
  if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('zip: bad central directory');
  const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), usize = buf.readUInt32LE(at + 24), n = buf.readUInt16LE(at + 28);
  const name = buf.toString('latin1', at + 46, at + 46 + n), local = buf.readUInt32LE(at + 42);
  if (usize > limit) throw new Error(`zip: member ${name} inflates to ${usize} bytes, over the ${limit} limit`);
  const data = buf.subarray(local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)).subarray(0, size);
  if (method === 0) return { name, bytes: Buffer.from(data) };
  if (method !== 8) throw new Error(`zip: compression method ${method}`);
  return { name, bytes: inflateRawSync(data, { maxOutputLength: limit }) };
}
