// Earth-fixed products (SP3, and SP3-c transcribed from ECF and CPF files)
// to GCRF reference states: files/orbit-products `read_container`, then
// analysis/reference-states `reference_states` with IERS EOP rows from
// data-source/eop-parser. Framing only; the reading, time scales and the
// ITRS -> GCRS rotation are the modules'.
import fs from 'node:fs';
import * as fb from 'flatbuffers';
import { NCD } from 'spacedatastandards.org/lib/js/NCD/main.js';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/main.js';
import { OEM } from 'spacedatastandards.org/lib/js/OEM/main.js';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { DAY_MS } from './common.mjs';

const typeRef = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });

// [u32 n][$NCD][container], as read_container takes it.
function containerFrame(bytes) {
  const b = new fb.Builder(1024);
  const sha = b.createString(sha256(bytes));
  NCD.startNCD(b);
  NCD.addSourceByteLength(b, BigInt(bytes.length));
  NCD.addSourceSha256(b, sha);
  NCD.finishSizePrefixedNCDBuffer(b, NCD.endNCD(b));
  return { portId: 'container', payload: Buffer.concat([Buffer.from(b.asUint8Array()), bytes]), typeRef: typeRef('NCD') };
}

// PRN -> {norad, objectId, name} valid at midMs, from the IGS satellite metadata SINEX.
export function gnssIdentities(sinexText, midMs) {
  const block = (name) => sinexText.split(`+${name}`)[1].split(`-${name}`)[0].split('\n').filter((l) => l.startsWith(' '));
  const ids = new Map(block('SATELLITE/IDENTIFIER').map((l) => [l.slice(1, 5), { cospar: l.slice(6, 15).trim(), satcat: Number(l.slice(16, 22)), block: l.slice(23, 38).trim() }]));
  const time = (t) => (t.startsWith('0000') ? Infinity : Date.UTC(Number(t.slice(0, 4)), 0, 1) + (Number(t.slice(5, 8)) - 1) * DAY_MS + Number(t.slice(9, 14)) * 1000);
  const satellites = {};
  for (const l of block('SATELLITE/PRN')) {
    const svn = l.slice(1, 5), prn = l.slice(36, 39);
    if (time(l.slice(6, 20)) <= midMs && midMs < time(l.slice(21, 35)) && ids.get(svn)?.satcat)
      satellites[prn] = { norad: ids.get(svn).satcat, objectId: ids.get(svn).cospar, name: `${svn} ${ids.get(svn).block}` };
  }
  return satellites;
}

export async function sp3Context(modules, run, eopFile) {
  const reader = await loadModule(modules, 'files/orbit-products');
  const reference = await loadModule(modules, 'analysis/reference-states');
  const parser = await loadModule(modules, 'data-source/eop-parser');
  for (const m of [reader, reference, parser]) run.addModule(m.provenance);
  const body = fs.readFileSync(eopFile);
  run.addInputs('eop', { [eopFile]: sha256(body) });
  const r = await parser.invoke('parse_finals2000a', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const stream = Buffer.from(r.outputs.find((o) => o.portId === 'records').payload);
  const rows = [];
  for (let at = 0; at < stream.length;) {
    const n = stream.readUInt32LE(at);
    rows.push({ mjd: EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(stream.subarray(at + 4, at + 4 + n)))).MJD(), bytes: stream.subarray(at, at + 4 + n) });
    at += 4 + n;
  }
  return {
    // sp3: bytes; identities: {product, source, statedSigmaM?, statedSigmaBasis?, satellites}.
    // Returns [{norad, bytes ($OEM, size-prefixed), block (decoded)}].
    async convert(sp3, identities) {
      const read = await reader.invoke('read_container', [containerFrame(sp3)]);
      const port = (id, code) => ({ portId: id, payload: Buffer.from(read.outputs.find((o) => o.portId === id).payload), typeRef: typeRef(code) });
      const descriptor = NCD.getSizePrefixedRootAsNCD(new fb.ByteBuffer(new Uint8Array(port('descriptor', 'NCD').payload)));
      const start = Date.parse(`${descriptor.START_TIME().slice(0, 19)}Z`), stop = Date.parse(`${descriptor.STOP_TIME().slice(0, 19)}Z`);
      const lo = Math.floor(start / DAY_MS) + 40587 - 1, hi = Math.ceil(stop / DAY_MS) + 40587 + 1;
      const window = rows.filter((x) => x.mjd >= lo && x.mjd <= hi);
      if (!window.length || window[0].mjd > lo + 1 || window.at(-1).mjd < hi - 1) throw new Error(`no EOP rows bracket ${descriptor.START_TIME()} .. ${descriptor.STOP_TIME()}`);
      const out = await reference.invoke('reference_states', [port('ephemeris', 'OEM'), port('descriptor', 'NCD'),
        { portId: 'earth_orientation', payload: Buffer.concat(window.map((x) => x.bytes)), typeRef: typeRef('EOP') },
        { portId: 'identities', payload: Buffer.from(JSON.stringify(identities)), typeRef: { schemaName: 'application/json' } }]);
      return out.outputs.filter((o) => o.portId === 'reference').map((o) => {
        const bytes = Buffer.from(o.payload);
        const block = OEM.getSizePrefixedRootAsOEM(new fb.ByteBuffer(new Uint8Array(bytes))).unpack().EPHEMERIS_DATA_BLOCK[0];
        return { norad: block.OBJECT.NORAD_CAT_ID, bytes, block };
      });
    },
    async destroy() { for (const m of [reader, reference, parser]) await m.destroy(); },
  };
}

// The SP3 header's satellite ids ("+" lines).
export function sp3Satellites(text) {
  const ids = [];
  for (const l of text.split('\n', 40)) if (l.startsWith('+ ')) for (let k = 9; k + 3 <= l.length; k += 3) { const id = l.slice(k, k + 3).trim(); if (id && id !== '0' && !/^0+$/.test(id)) ids.push(id); }
  return ids;
}
