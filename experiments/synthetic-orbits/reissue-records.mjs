#!/usr/bin/env node
// Duplicate MESSAGE_IDs are errors; --newest selects by CREATION_DATE, refusing missing dates or ties.
// One-time re-issue of a release's stored fitted records with their identity filled (identity.mjs completeFit), into a new stream.
//
//   node experiments/synthetic-orbits/reissue-records.mjs <store>/synthetic/<wasm sha12> --truth <store>/synthetic/truth/truth-ocm.fsdata --wasm <module.wasm> [--out <stream file>]
//
// Requires the installed packages and SDM_MODULE_UNSIGNED_BUILD=1; module paths are arguments.
//
// Every AP record the release's rows name (rows*.jsonl, through readRecord: a stream reference or an old string) is read, completed (the identity of its case from the
// row's id; HEADER.MESSAGE_ID; PROVENANCE naming the truth flight the row names, by its MESSAGE_ID, with the SHA-256 and length of that flight's $OCM in the truth stream)
// and appended to <dir>/records-identified.fsdata. The old streams and rows are not touched. Each new record is then checked against the old one:
//   - the module build flies both on the 5-minute grid from the fit start over 120 h (the records' own FIT_START) and every state (x, y, z, vx, vy, vz) is equal to the bit;
//   - the unpacked records are equal in every field the completion does not name;
//   - the frame read back from the stream is the record just made.
// A record whose row names no flight in the truth stream (a flight with no states) is counted and not re-issued.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { StreamReplacement, readRecord, readFrame, frames } from './records.mjs';
import { putUnique } from './duplicates.mjs';
import { completeFit } from './identity.mjs';

const args = process.argv.slice(2), dir = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args[i + 1]; };
const truthFile = opt('truth'), wasm = opt('wasm');
if (!dir || !truthFile || !wasm) { console.error('usage: reissue-records.mjs <store>/synthetic/<sha12> --truth <truth-ocm.fsdata> --wasm <module.wasm> [--out <file>]'); process.exit(2); }
const outFile = opt('out') ?? path.join(dir, 'records-identified.fsdata');
const inputs = [truthFile, wasm];
for (const n of fs.readdirSync(dir).filter((x) => /^rows.*\.jsonl$/.test(x))) {
  inputs.push(path.join(dir, n));
  for await (const line of createInterface({ input: fs.createReadStream(path.join(dir, n)), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const ref = JSON.parse(line).ap?.record;
    if (ref?.file) inputs.push(path.join(dir, ref.file));
  }
}
const stream = new StreamReplacement(outFile, inputs, { allowEmpty: args.includes('--allow-empty') });
const S = await import('./bindings.mjs'), O = S.OCM, fb = S.flatbuffers;
const require = createRequire(import.meta.url);
const { createStandaloneHarness } = await import(require.resolve('space-data-module-sdk/testing/isomorphic'));
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// the truth stream: MESSAGE_ID -> the frame's SHA-256 and length
const truths = new Map();
for (const fr of frames(truthFile)) {
  const header = O.OCM.getRootAsOCM(new fb.ByteBuffer(fr.bytes)).HEADER();
  putUnique(truths, header.MESSAGE_ID(), { sha256: sha(fr.bytes), bytes: fr.size }, header.CREATION_DATE(), args.includes('--newest'));
}

// Validate all referenced input streams, including frames no row selects.
const originals = new Map();
for (const file of new Set(inputs.filter((f) => f !== truthFile && f.endsWith('.fsdata')))) for (const fr of frames(file)) {
  const header = O.OCM.getRootAsOCM(new fb.ByteBuffer(fr.bytes)).HEADER();
  if (!header?.MESSAGE_ID()) continue; // Legacy fits receive their identity from the case row.
  putUnique(originals, header.MESSAGE_ID(), { file, offset: fr.offset, size: fr.size, sha256: sha(fr.bytes) }, header?.CREATION_DATE(), args.includes('--newest'));
}
const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
const flightPcf = (epochs) => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new S.flatbuffers.Builder(1 << 14); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
const fly = async (ocm, epochs) => { const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(epochs) }] }); if (r.statusCode !== 0) return `refused: ${r.errorCode}: ${String(r.errorMessage).slice(0, 100)}`; return S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => [...l.r, ...l.v]); };
const js = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
const named = (t) => { const c = JSON.parse(js(t)); for (const k of ['MESSAGE_ID', 'MESSAGE_STATUS', 'EXERCISE_NAME']) delete c.HEADER?.[k]; for (const k of ['NORAD_CAT_ID', 'CATALOG_NAME', 'OBJECT_DESIGNATOR', 'OBJECT_NAME']) delete c.METADATA?.[k]; delete c.PROVENANCE; return c; };

const wasm12 = path.basename(dir), selected = new Map();
const tally = { rows: 0, records: 0, noTruth: 0, bytesOld: 0, bytesNew: 0, statesCompared: 0, flownEqual: 0, otherFieldsEqual: 0 };
const problems = [];
for (const n of fs.readdirSync(dir).filter((x) => /^rows.*\.jsonl$/.test(x)).sort()) {
  const fitKey = n.replace(/^rows/, '').replace(/\.jsonl$/, '');   // the suffix run.mjs names its rows file by
  for await (const line of createInterface({ input: fs.createReadStream(path.join(dir, n)), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const row = JSON.parse(line); tally.rows += 1;
    if (!row.ap?.record) continue;
    let old = readRecord(dir, row.ap.record);
    const originalId = O.OCM.getRootAsOCM(new fb.ByteBuffer(old)).HEADER()?.MESSAGE_ID(), chosen = originals.get(originalId);
    if (chosen) old = readFrame(chosen.file, chosen);
    const truth = truths.get(row.truth?.hash);
    if (!truth) { tally.noTruth += 1; continue; }
    const messageId = `${row.id}:${wasm12}${fitKey}:ap`;
    const header = O.OCM.getRootAsOCM(new fb.ByteBuffer(old)).HEADER();
    putUnique(selected, messageId, { row: row.id, fitKey, original: chosen ?? row.ap.record, indexed: !!chosen, messageId, truth: row.truth.hash }, header?.CREATION_DATE(), args.includes('--newest'));
  }
}

// Append and verify one selected record at a time; retained selections contain references only.
for (const selection of selected.values()) {
  const m = { ...selection };
  m.old = m.indexed ? readFrame(m.original.file, m.original) : readRecord(dir, m.original);
  const produced = completeFit(O, fb, m.old, { caseId: m.row, messageId: m.messageId, truth: { id: m.truth, ...truths.get(m.truth) } });
  m.ref = stream.append(produced, m.messageId);
  tally.records += 1; tally.bytesOld += m.old.length; tally.bytesNew += 4 + m.ref.size;
  const bytes = readFrame(stream.file, m.ref);
  if (!bytes || bytes.length !== m.ref.size || sha(bytes).slice(0, 16) !== m.ref.sha256) { problems.push(`${m.row}: the frame read back is not the record made`); continue; }
  const nw = O.OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(bytes))).unpack(), od = O.OCM.getRootAsOCM(new fb.ByteBuffer(m.old)).unpack();
  if (js(named(nw)) === js(named(od))) tally.otherFieldsEqual += 1; else problems.push(`${m.row}: a field the completion does not name differs`);
  if (nw.HEADER.MESSAGE_ID !== m.messageId || nw.PROVENANCE.SOURCE_ID !== m.truth || nw.METADATA.OBJECT_NAME !== m.row || nw.METADATA.NORAD_CAT_ID !== 0) problems.push(`${m.row}: identity not as written`);
  const d0 = Date.parse(`${od.ORBIT_DETERMINATION.FIT_STATISTICS.FIT_START}Z`), epochs = Array.from({ length: 1441 }, (_, k) => `${iso(d0 + k * 300e3)}Z`);
  const [a, b] = [await fly(m.old, epochs), await fly(new Uint8Array(bytes), epochs)];
  if (typeof a === 'string' || typeof b === 'string') { if (a === b) tally.flownEqual += 1; else problems.push(`${m.row}: one is refused`); continue; }
  tally.statesCompared += a.length;
  const x = Float64Array.from(a.flat()), y = Float64Array.from(b.flat());
  if (x.length === y.length && Buffer.from(x.buffer).equals(Buffer.from(y.buffer))) tally.flownEqual += 1; else problems.push(`${m.row}: the states differ`);
}
console.log(JSON.stringify({ ...tally, out: outFile, problems: problems.length }));
for (const p of problems.slice(0, 20)) console.error(p);
if (!problems.length) {
  stream.verify((bytes) => O.OCM.getRootAsOCM(new fb.ByteBuffer(bytes)).HEADER().MESSAGE_ID());
  stream.publish();
}
process.exit(problems.length ? 1 : 0);
