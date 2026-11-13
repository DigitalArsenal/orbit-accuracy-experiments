#!/usr/bin/env node
// Converter: the synthetic set's truth flights from raw float64 files to $OEM records in a frame stream.
//
//   node experiments/synthetic-orbits/truth-to-oem.mjs <store>/synthetic [--out <stream file>] [--limit <n>]
//
// <store>/synthetic/truth/<hash>.bin holds one flight: Float64 x, y, z (km) and vx, vy, vz (km/s) per state, GCRF, on a 300 s grid, and
// <hash>.json beside it holds {v, count, flownToDay, error, flightS}. The flight's start epoch is in no truth file: it is the case's
// cutoff minus the truth's lead (elements.cutoff and truthStartH of any row that names the hash in its truth.hash), read here from the rows
// and written into the record. Each flight with states becomes one $OEM (the compact form: START_TIME, STEP_SIZE, EPHEMERIS_DATA) appended
// to <store>/synthetic/truth/truth-oem.fsdata as a [4-byte little-endian size][FlatBuffer] frame, through RecordStream. The .bin and .json
// files stay. Every record is then read back from the stream and its states compared with the .bin bit for bit.
//
// What the record takes from the files:
//   .bin states                 EPHEMERIS_DATA (row-major, STATE_VECTOR_SIZE 6)
//   .json count                 not stored: the length of EPHEMERIS_DATA over STATE_VECTOR_SIZE; STOP_TIME and USEABLE_STOP_TIME are START_TIME plus (count - 1) steps
//   .json flownToDay            not stored: a flight that stops before its last day has a STOP_TIME that says so
//   .json v                     (the cache's format number) no field
//   .json error                 no field: a flight with no states has no ephemeris to carry a reason (the entries with an error are counted and skipped)
//   .json flightS               no field (the wall time of the flight)
// and from the rows: the hash is MESSAGE_ID, the case id is OBJECT.OBJECT_NAME, the start epoch is START_TIME; the frame is GCRF, the center EARTH,
// the time system UTC, the step 300 s. The truth's settings (force terms, tolerance, areas over mass, builds of the numerical propagator, the
// state's origin) have no OEM field and stay in the rows.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RecordStream, frames } from './records.mjs';

const args = process.argv.slice(2), root = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args[i + 1]; };
if (!root) { console.error('usage: truth-to-oem.mjs <store>/synthetic [--out <stream file>] [--limit <n>]'); process.exit(2); }
const require = createRequire(import.meta.url), fbPath = (r) => require.resolve(r);
const fb = require('flatbuffers');
const { OEM, OEMT } = await import(fbPath('spacedatastandards.org/lib/js/OEM/OEM.js'));
const { ephemerisDataBlockT } = await import(fbPath('spacedatastandards.org/lib/js/OEM/ephemerisDataBlock.js'));
const { CATT } = await import(fbPath('spacedatastandards.org/lib/js/OEM/CAT.js'));
const { RFMT } = await import(fbPath('spacedatastandards.org/lib/js/OEM/RFM.js'));
const { RFMUnion } = await import(fbPath('spacedatastandards.org/lib/js/OEM/RFMUnion.js'));
const { CelestialFrameWrapperT } = await import(fbPath('spacedatastandards.org/lib/js/OEM/CelestialFrameWrapper.js'));
const { CelestialFrame } = await import(fbPath('spacedatastandards.org/lib/js/OEM/CelestialFrame.js'));
const { timingStandard } = await import(fbPath('spacedatastandards.org/lib/js/OEM/timingStandard.js'));
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const STEP_S = 300, DAY_MS = 86400000;
const truthDir = path.join(root, 'truth'), outFile = opt('out') ?? path.join(truthDir, 'truth-oem.fsdata'), limit = Number(opt('limit') ?? Infinity);

// 1. what the rows say about each truth hash: the cases that use it and the flight's start epoch
const startOf = new Map();
for (const d of fs.readdirSync(root)) {
  const dir = path.join(root, d);
  if (!fs.statSync(dir).isDirectory() || ['truth', 'reference'].includes(d)) continue;
  for (const n of fs.readdirSync(dir).filter((x) => /^rows.*\.jsonl$/.test(x))) {
    for (const line of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
      if (!line.includes('"hash"')) continue;
      const r = JSON.parse(line), h = r.truth?.hash;
      if (!h || !r.elements?.cutoff || !Number.isFinite(r.truthStartH)) continue;
      const start = Date.parse(`${r.elements.cutoff}T00:00:00Z`) - r.truthStartH * 3600e3, e = startOf.get(h) ?? { starts: new Set(), ids: new Set() };
      e.starts.add(start); e.ids.add(r.id); startOf.set(h, e);
    }
  }
}

// 2. the flights
const hashes = fs.readdirSync(truthDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const tally = { flights: hashes.length, withStates: 0, converted: 0, noStates: 0, noStatesWithError: 0, noRow: 0, startsDisagree: 0, bytesBin: 0, bytesStream: 0 };
const made = [];
fs.rmSync(outFile, { force: true });
const stream = new RecordStream(outFile);
for (const h of hashes) {
  if (made.length >= limit) break;
  const meta = JSON.parse(fs.readFileSync(path.join(truthDir, `${h}.json`), 'utf8'));
  if (!meta.count) { tally.noStates += 1; if (meta.error) tally.noStatesWithError += 1; continue; }
  tally.withStates += 1;
  const info = startOf.get(h);
  if (!info) { tally.noRow += 1; continue; }
  if (info.starts.size !== 1) { tally.startsDisagree += 1; continue; }
  const [start] = info.starts, bin = fs.readFileSync(path.join(truthDir, `${h}.bin`));
  if (bin.length !== meta.count * 48) throw new Error(`${h}: ${bin.length} bytes for ${meta.count} states`);
  const data = new Float64Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length));
  const stop = start + (meta.count - 1) * STEP_S * 1000;
  const block = Object.assign(new ephemerisDataBlockT(), {
    OBJECT: Object.assign(new CATT(), { OBJECT_NAME: [...info.ids].sort()[0] }), CENTER_NAME: 'EARTH',
    REFERENCE_FRAME: new RFMT(RFMUnion.CelestialFrameWrapper, new CelestialFrameWrapperT(CelestialFrame.GCRF), 0, 'GCRF'), TIME_SYSTEM: timingStandard.UTC,
    START_TIME: iso(start), USEABLE_START_TIME: iso(start), USEABLE_STOP_TIME: iso(stop), STOP_TIME: iso(stop), STEP_SIZE: STEP_S, STATE_VECTOR_SIZE: 6, EPHEMERIS_DATA: Array.from(data),
  });
  const oem = Object.assign(new OEMT(), { CCSDS_OEM_VERS: 3.0, CREATION_DATE: iso(fs.statSync(path.join(truthDir, `${h}.bin`)).mtimeMs), ORIGINATOR: 'orbit-accuracy-experiments synthetic-orbits', MESSAGE_ID: h, EPHEMERIS_DATA_BLOCK: [block] });
  const b = new fb.Builder(data.length * 8 + 4096);
  OEM.finishOEMBuffer(b, oem.pack(b));
  const ref = stream.append(b.asUint8Array());
  made.push({ hash: h, start, count: meta.count, ref }); tally.bytesBin += bin.length; tally.bytesStream += 4 + ref.size; tally.converted += 1;
}

// 3. read every record back from the stream and compare its states with the .bin bit for bit
let checked = 0; const problems = [];
const byHash = new Map(made.map((m) => [m.hash, m]));
for (const fr of frames(outFile)) {
  const o = OEM.getRootAsOEM(new fb.ByteBuffer(new Uint8Array(fr.bytes))).unpack(), h = o.MESSAGE_ID, m = byHash.get(h), blk = o.EPHEMERIS_DATA_BLOCK?.[0];
  if (!m || !blk) { problems.push(`${h}: a frame no flight made or a record without a block`); continue; }
  const bin = fs.readFileSync(path.join(truthDir, `${h}.bin`)), want = new Float64Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length)), got = Float64Array.from(blk.EPHEMERIS_DATA);
  const same = got.length === want.length && Buffer.from(got.buffer).equals(Buffer.from(want.buffer));
  if (!same) problems.push(`${h}: the states differ from the .bin`);
  if (blk.START_TIME !== iso(m.start) || blk.STEP_SIZE !== STEP_S || blk.STATE_VECTOR_SIZE !== 6 || blk.EPHEMERIS_DATA.length !== m.count * 6) problems.push(`${h}: start, step or size differ`);
  if (fr.offset !== m.ref.offset || fr.size !== m.ref.size) problems.push(`${h}: the frame is not where the append put it`);
  checked += 1;
}
if (checked !== made.length) problems.push(`${checked} frames for ${made.length} flights`);
console.log(JSON.stringify({ ...tally, stream: outFile, checked, problems: problems.length }));
for (const p of problems.slice(0, 20)) console.error(p);
process.exit(problems.length ? 1 : 0);
