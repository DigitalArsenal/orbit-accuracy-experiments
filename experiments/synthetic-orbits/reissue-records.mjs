#!/usr/bin/env node
// One-time re-issue of a release's stored fitted records with their identity filled (identity.mjs completeFit), into a new stream.
//
//   node experiments/synthetic-orbits/reissue-records.mjs <store>/synthetic/<wasm sha12> --truth <store>/synthetic/truth/truth-ocm.fsdata --wasm <module.wasm> [--out <stream file>]
//
// Needs the headline-loop environment (SDN_MODULES_ROOT and SDM_MODULE_UNSIGNED_BUILD=1), as run.mjs does.
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
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { RecordStream, readRecord, frames } from './records.mjs';
import { completeFit } from './identity.mjs';

const args = process.argv.slice(2), dir = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args[i + 1]; };
const truthFile = opt('truth'), wasm = opt('wasm');
if (!dir || !truthFile || !wasm) { console.error('usage: reissue-records.mjs <store>/synthetic/<sha12> --truth <truth-ocm.fsdata> --wasm <module.wasm> [--out <file>]'); process.exit(2); }
const REPO = process.env.OAE_REPO ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { usePackages } = await import(`${REPO}/experiments/headline-loop/lib/env.mjs`); usePackages();
const A = await import(`${REPO}/experiments/headline-loop/lib/arms.mjs`), S = A.S, O = S.OCM, fb = S.flatbuffers;
const require = createRequire(`${REPO}/package.json`);
const { createStandaloneHarness } = await import(require.resolve('space-data-module-sdk/testing/isomorphic'));
const outFile = opt('out') ?? path.join(dir, 'records-identified.fsdata'), iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// the truth stream: MESSAGE_ID -> the frame's SHA-256 and length
const truths = new Map();
for (const fr of frames(truthFile)) truths.set(O.OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(fr.bytes))).HEADER().MESSAGE_ID(), { sha256: sha(fr.bytes), bytes: fr.size });

const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
const flightPcf = (epochs) => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new S.flatbuffers.Builder(1 << 14); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
const fly = async (ocm, epochs) => { const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(epochs) }] }); if (r.statusCode !== 0) return `refused: ${r.errorCode}: ${String(r.errorMessage).slice(0, 100)}`; return S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => [...l.r, ...l.v]); };
const js = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
const named = (t) => { const c = JSON.parse(js(t)); for (const k of ['MESSAGE_ID', 'MESSAGE_STATUS', 'EXERCISE_NAME']) delete c.HEADER?.[k]; for (const k of ['NORAD_CAT_ID', 'CATALOG_NAME', 'OBJECT_DESIGNATOR', 'OBJECT_NAME']) delete c.METADATA?.[k]; delete c.PROVENANCE; return c; };

fs.rmSync(outFile, { force: true });
const stream = new RecordStream(outFile), wasm12 = path.basename(dir), made = [];
const tally = { rows: 0, records: 0, noTruth: 0, bytesOld: 0, bytesNew: 0, statesCompared: 0, flownEqual: 0, otherFieldsEqual: 0 };
const problems = [];
for (const n of fs.readdirSync(dir).filter((x) => /^rows.*\.jsonl$/.test(x)).sort()) {
  const fitKey = n.replace(/^rows/, '').replace(/\.jsonl$/, '');   // the suffix run.mjs names its rows file by
  for (const line of fs.readFileSync(path.join(dir, n), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line); tally.rows += 1;
    if (!row.ap?.record) continue;
    const old = readRecord(dir, row.ap.record), truth = truths.get(row.truth?.hash);
    if (!truth) { tally.noTruth += 1; continue; }
    const messageId = `${row.id}:${wasm12}${fitKey}:ap`, bytes = completeFit(O, fb, old, { caseId: row.id, messageId, truth: { id: row.truth.hash, ...truth } });
    const ref = stream.append(bytes);
    made.push({ row: row.id, fitKey, old, ref, messageId, truth: row.truth.hash });
    tally.records += 1; tally.bytesOld += old.length; tally.bytesNew += 4 + ref.size;
  }
}

// the checks: read each new record back from the stream, fly old and new, compare
const byOffset = new Map(); for (const fr of frames(outFile)) byOffset.set(fr.offset, fr.bytes);
for (const m of made) {
  const bytes = byOffset.get(m.ref.offset);
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
process.exit(problems.length ? 1 : 0);
