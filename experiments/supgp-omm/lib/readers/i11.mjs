// IESS-412 eleven-parameter ephemeris files (SES, Intelsat) -> $OEM (Earth-fixed, UTC), by files/orbit-products
// normalize_ses_i11 (WASM). The module evaluates the model every 300 s over the file's validity and refuses a
// file whose elements do not reproduce the prediction printed in it.
import { Builder } from 'flatbuffers';
import { createHash } from 'node:crypto';
import { NCD } from 'spacedatastandards.org/lib/js/NCD/main.js';
import { ncdContainerFormat } from 'spacedatastandards.org/lib/js/NCD/ncdContainerFormat.js';

const TYPE = { schemaName: 'NCD.fbs', fileIdentifier: '$NCD', rootTypeName: 'NCD', wireFormat: 'aligned-binary', requiredAlignment: 8 };

// Intelsat sends the file as a telex: CRLF line ends, and every negative value is followed by the words
// " (MINUS)" after its sign. The module reads the layout SES publishes, so the redundant annotation and
// the carriage returns are dropped; no value changes.
export function withoutTelexAnnotations(bytes) {
  return Buffer.from(Buffer.from(bytes).toString('latin1').replace(/\r/g, '').replace(/ \(MINUS\)/g, ''), 'latin1');
}

function container(bytes) {
  const b = new Builder(1024);
  const kind = b.createString('ses-i11'), name = b.createString(''), sha = b.createString(createHash('sha256').update(bytes).digest('hex'));
  NCD.startNCD(b);
  NCD.addFormat(b, ncdContainerFormat.PROVIDER_DEFINED);
  NCD.addProviderDefinedFormatName(b, kind);
  NCD.addInternalFileName(b, name);
  NCD.addSourceSha256(b, sha);
  NCD.addSourceByteLength(b, BigInt(bytes.length));
  NCD.finishSizePrefixedNCDBuffer(b, NCD.endNCD(b));
  const payload = Buffer.concat([b.asUint8Array(), bytes]);
  return { portId: 'container', typeRef: { ...TYPE, byteLength: payload.length }, payload };
}

export async function readI11(orbitProducts, bytes) {
  const out = await orbitProducts.invoke('normalize_ses_i11', [container(bytes)]);
  return Buffer.from(out.outputs.find((o) => o.portId === 'ephemeris').payload);
}
