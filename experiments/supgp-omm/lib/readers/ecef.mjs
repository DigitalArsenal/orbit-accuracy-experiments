// An Earth-fixed $OEM -> GCRF/UTC, by analysis/reference-states (WASM). That module takes the shape
// files/orbit-products gives an SP3 product: per-epoch lines, an $NCD whose SP3 header names an ITRF
// realization, IERS EOP rows and the satellite identities. Operator products that are Earth-fixed but
// not SP3 (SES and Intelsat eleven-parameter and ECF files, ILRS CPF) are put in that shape here, as E4
// does (it writes them out as SP3-c text): labels and epochs are carried over, no number is changed,
// and the rotation, the time scales and the velocity are the module's.
import * as flatbuffers from 'flatbuffers';
import * as NCDs from 'spacedatastandards.org/lib/js/NCD/main.js';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/main.js';
import * as OEMs from 'spacedatastandards.org/lib/js/OEM/main.js';
import { json } from '../../../../harness/modules.mjs';
import { NCD_TYPE, OEM_TYPE, packOem, unpackOem } from '../records.mjs';

const EOP_TYPE = { schemaName: 'EOP.fbs', fileIdentifier: '$EOP', rootTypeName: 'EOP', wireFormat: 'flatbuffer' };
const DAY_MS = 86400000;
const isoMicro = (ms) => new Date(ms).toISOString().replace(/Z$/, '000');

// IERS EOP rows [{mjd, bytes}] from a finals2000A file, by data-source/eop-parser (WASM).
export async function eopRows(parser, finalsBytes) {
  const r = await parser.invoke('parse_finals2000a', [{ portId: 'body', payload: finalsBytes, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: finalsBytes.length } }]);
  const stream = Buffer.from(r.outputs.find((o) => o.portId === 'records').payload);
  const rows = [];
  for (let at = 0; at < stream.length;) {
    const n = stream.readUInt32LE(at);
    rows.push({ mjd: EOP.getRootAsEOP(new flatbuffers.ByteBuffer(new Uint8Array(stream.subarray(at + 4, at + 4 + n)))).MJD(), bytes: stream.subarray(at, at + 4 + n) });
    at += 4 + n;
  }
  return rows;
}

// The block as SP3-shaped lines under `key`, UTC epochs shifted by shiftMs (0 unless the file's clock is known to be offset).
function asLines(oemBytes, key, shiftMs) {
  const oem = unpackOem(oemBytes);
  const block = oem.EPHEMERIS_DATA_BLOCK[0];
  const parse = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);
  if (!block.EPHEMERIS_DATA_LINES?.length && block.STEP_SIZE > 0 && block.EPHEMERIS_DATA?.length) {
    const k = block.STATE_VECTOR_SIZE || 6;
    const start = parse(block.START_TIME);
    block.EPHEMERIS_DATA_LINES = [];
    for (let i = 0; i * k < block.EPHEMERIS_DATA.length; ++i) {
      const l = new OEMs.ephemerisDataLineT();
      l.EPOCH = isoMicro(start + i * block.STEP_SIZE * 1000);
      [l.X, l.Y, l.Z] = block.EPHEMERIS_DATA.slice(i * k, i * k + 3);
      if (k >= 6) [l.X_DOT, l.Y_DOT, l.Z_DOT] = block.EPHEMERIS_DATA.slice(i * k + 3, i * k + 6);
      block.EPHEMERIS_DATA_LINES.push(l);
    }
    block.EPHEMERIS_DATA = [];
    block.STEP_SIZE = 0;
  }
  if (shiftMs) for (const l of block.EPHEMERIS_DATA_LINES) l.EPOCH = isoMicro(parse(l.EPOCH) + shiftMs);
  block.OBJECT ??= new OEMs.CATT();
  block.OBJECT.OBJECT_ID = key;
  const lines = block.EPHEMERIS_DATA_LINES;
  const first = parse(lines[0].EPOCH), last = parse(lines.at(-1).EPOCH);
  return { bytes: packOem(oem), firstMs: first, lastMs: last, stepSeconds: lines.length > 1 ? (parse(lines[1].EPOCH) - first) / 1000 : 0, timeSystem: block.TIME_SYSTEM };
}

function sp3Descriptor({ key, stepSeconds, count, agency, frameLabel }) {
  const h = Object.assign(new NCDs.NCDSP3HeaderT(), {
    FILE_TYPE: 'P', SATELLITE_SYSTEM: 'M', ORBIT_TYPE: 'FIT', DATA_USED: 'operator ephemeris', COORDINATE_SYSTEM: frameLabel, AGENCY: agency,
    TIME_SYSTEM: 'UTC', EPOCH_INTERVAL_SECONDS: stepSeconds, NUMBER_OF_EPOCHS: count, SATELLITE_IDS: [key], SATELLITE_ACCURACY_EXPONENTS: [0],
    POSITION_VELOCITY_BASE: 0, CLOCK_RATE_BASE: 0, COMMENT: ['operator ephemeris carried in the SP3-shaped record reference_states reads; the frame is the operator\'s Earth-fixed frame'],
  });
  const t = Object.assign(new NCDs.NCDT(), { SP3_HEADER: h });
  const b = new flatbuffers.Builder(1024);
  NCDs.NCD.finishSizePrefixedNCDBuffer(b, t.pack(b));
  return Buffer.from(b.asUint8Array());
}

// -> {oem: Buffer (size-prefixed $OEM, GCRF, UTC)}. `rows`: eopRows output; the rows around the product are selected here.
export async function ecefToGcrf({ referenceStates, rows, oemBytes, key, norad, name, agency, frameLabel = 'ITRF', shiftMs = 0, statedSigmaM = 1 }) {
  const lines = asLines(oemBytes, key, shiftMs);
  const lo = Math.floor(lines.firstMs / DAY_MS) + 40587 - 1, hi = Math.ceil(lines.lastMs / DAY_MS) + 40587 + 1;
  const window = rows.filter((x) => x.mjd >= lo && x.mjd <= hi);
  if (!window.length || window[0].mjd > lo + 1 || window.at(-1).mjd < hi - 1) throw new Error(`no IERS EOP rows bracket ${new Date(lines.firstMs).toISOString()} .. ${new Date(lines.lastMs).toISOString()}`);
  const count = unpackOem(lines.bytes).EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.length;
  const out = await referenceStates.invoke('reference_states', [
    { portId: 'ephemeris', payload: lines.bytes, typeRef: OEM_TYPE },
    { portId: 'descriptor', payload: sp3Descriptor({ key, stepSeconds: lines.stepSeconds, count, agency, frameLabel }), typeRef: NCD_TYPE },
    { portId: 'earth_orientation', payload: Buffer.concat(window.map((x) => x.bytes)), typeRef: EOP_TYPE },
    json('identities', { product: agency, source: 'operator ephemeris, Earth-fixed', statedSigmaM, statedSigmaBasis: 'placeholder: the covariance is not used by this pass', satellites: { [key]: { norad, objectId: key, name } } }),
  ]);
  const frame = out.outputs.find((o) => o.portId === 'reference');
  if (!frame) throw new Error('reference_states returned no state');
  return { oem: Buffer.from(frame.payload) };
}
