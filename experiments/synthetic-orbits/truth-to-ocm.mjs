#!/usr/bin/env node
// Converter: the synthetic set's seeds and truth flights as $OCM records in two frame streams (identity.mjs says what each holds).
//
//   node experiments/synthetic-orbits/truth-to-ocm.mjs <store>/synthetic [--ref-wasm <reference build .wasm>] [--limit <n>]
//
// Requires the installed packages and SDM_MODULE_UNSIGNED_BUILD=1; module paths are arguments.
//
// Writes <store>/synthetic/truth/seed-ocm.fsdata (one $OCM per case and truth start epoch: every case the generator makes, at the default start, and every
// start epoch a stored row used) and <store>/synthetic/truth/truth-ocm.fsdata (one $OCM per flight with states). Both are written through StreamReplacement, new
// files each run (an existing one is removed first). The .bin and .json files stay.
//
// Checked here, and the exit code says so:
//   every seed: the reference build flies the stated seed to its epoch to the same state, bit for bit, as seedRecord's plain record (run.mjs flies the plain one);
//   every truth: its states read back from the stream equal the .bin bit for bit, its PROVENANCE names the seed frame (id, SHA-256, length), and its first
//   state is within a meter of the state the reference build gives for that seed (the truth was started from it).
// A flight with no states (a decay, no truth) has no record. A flight no stored row names (so no case) has none either; both are counted.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { StreamReplacement, frames } from './records.mjs';
import { seedRecord } from './seed.mjs';
import { cases as makeCases, termsOf } from './cases.mjs';
import { statedSeed, truthRecord, seedMessageId, sha256hex } from './identity.mjs';

const args = process.argv.slice(2), root = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args[i + 1]; };
if (!root) { console.error('usage: truth-to-ocm.mjs <store>/synthetic [--ref-wasm <file>] [--limit <n>]'); process.exit(2); }
const S = await import('./bindings.mjs'), O = S.OCM, fb = S.flatbuffers;
const { SETTINGS } = await import('../headline-loop/lib/settings.mjs');
const require = createRequire(import.meta.url);
const { createStandaloneHarness } = await import(require.resolve('space-data-module-sdk/testing/isomorphic'));
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const truthDir = path.join(root, 'truth'), seedFile = path.join(truthDir, 'seed-ocm.fsdata'), truthFile = path.join(truthDir, 'truth-ocm.fsdata'), limit = Number(opt('limit') ?? Infinity);
const refFile = opt('ref-wasm') ?? (() => { const d = path.join(root, 'reference'), w = fs.readdirSync(d).filter((f) => f.endsWith('.wasm')); if (w.length !== 1) throw new Error(`${d} holds ${w.length} builds: say which with --ref-wasm`); return path.join(d, w[0]); })();

// 1. what the rows say: per truth hash the case and its start epoch
const byHash = new Map(), startsOf = new Map();
for (const d of fs.readdirSync(root)) {
  const dir = path.join(root, d);
  if (!fs.statSync(dir).isDirectory() || ['truth', 'reference'].includes(d)) continue;
  for (const n of fs.readdirSync(dir).filter((x) => /^rows.*\.jsonl$/.test(x))) {
    for await (const line of createInterface({ input: fs.createReadStream(path.join(dir, n)), crlfDelay: Infinity })) {
      if (!line.includes('"hash"')) continue;
      const r = JSON.parse(line), h = r.truth?.hash;
      if (!h || !r.elements?.cutoff || !Number.isFinite(r.truthStartH)) continue;
      const start = Date.parse(`${r.elements.cutoff}T00:00:00Z`) - r.truthStartH * 3600e3, e = byHash.get(h) ?? { starts: new Set(), ids: new Set(), row: { truth: r.truth } };
      e.starts.add(start); e.ids.add(r.id); byHash.set(h, e);
      const k = seedMessageId(r.id, iso(start)); if (!startsOf.has(k)) startsOf.set(k, { id: r.id, start, el: r.elements, am: r.am });
    }
  }
}
// the generator's cases at the default start (72 h before the cutoff): the universe
const universe = makeCases(498, { gridStep: 1 }).cases;
for (const c of universe) { const start = Date.parse(`${c.cutoff}T00:00:00Z`) - 72 * 3600e3, k = seedMessageId(c.id, iso(start)); if (!startsOf.has(k)) startsOf.set(k, { id: c.id, start, el: c, am: c.am }); }

// 2. the seeds
const seedStream = new StreamReplacement(seedFile), seeds = new Map();
const refH = await createStandaloneHarness('browser', refFile, { surface: 'direct' });
const flightPcf = (epochs) => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new S.flatbuffers.Builder(1 << 14); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
const refFly = async (ocm, epoch) => { const r = await refH.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf([`${epoch}Z`]) }] }); if (r.statusCode !== 0) throw new Error(`reference: ${r.errorMessage}`); return S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload))[0]; };
const problems = [], refused = []; let seedsChecked = 0, seedOk = 0;
for (const [k, s] of [...startsOf].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const epoch = iso(s.start), el = { epoch, n: s.el.n, e: s.el.e, i: s.el.i, raan: s.el.raan, argp: s.el.argp, ma: s.el.ma }, t = termsOf(s.am);
  const plain = seedRecord(S, el), bytes = statedSeed(O, fb, plain, { caseId: s.id, epoch, terms: [{ kind: 'DRAG_AREA_OVER_MASS', value: t.dragAreaOverMass }, { kind: 'SRP_AREA_OVER_MASS', value: t.srpAreaOverMass }] });
  // a seed the reference build refuses ("describes no orbit": a case that has no truth) is refused, with the same message, stated or plain
  const tryFly = async (x) => { try { return await refFly(x, epoch); } catch (e) { return { refused: String(e.message) }; } };
  const a = await tryFly(plain), b = await tryFly(bytes);
  if (a.refused) refused.push(k);
  if (JSON.stringify(a.refused ? a : [a.r, a.v]) !== JSON.stringify(b.refused ? b : [b.r, b.v])) problems.push(`${k}: the stated seed flies to another state than the plain one`);
  const ref = seedStream.append(bytes, k); seeds.set(k, { id: k, sha256: sha256hex(bytes), bytes: bytes.length, epoch, ref, state: a }); seedsChecked += 1;
  if (!a.refused) seedOk += 1;
}

// 3. the truth flights
const hashes = fs.readdirSync(truthDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const tally = { flights: hashes.length, withStates: 0, converted: 0, noStates: 0, noRow: 0, startsDisagree: 0, sharedByCases: 0, bytesBin: 0, bytesStream: 0 };
const made = new Map();
const truthStream = new StreamReplacement(truthFile);
for (const h of hashes) {
  if (made.size >= limit) break;
  const meta = JSON.parse(fs.readFileSync(path.join(truthDir, `${h}.json`), 'utf8'));
  if (!meta.count) { tally.noStates += 1; continue; }
  tally.withStates += 1;
  const info = byHash.get(h);
  if (!info) { tally.noRow += 1; continue; }
  if (info.starts.size !== 1) { tally.startsDisagree += 1; continue; }
  if (info.ids.size > 1) tally.sharedByCases += 1;
  const [start] = info.starts, caseId = [...info.ids].sort()[0], seed = seeds.get(seedMessageId(caseId, iso(start))), r = info.row;
  const bin = fs.readFileSync(path.join(truthDir, `${h}.bin`));
  if (bin.length !== meta.count * 48) throw new Error(`${h}: ${bin.length} bytes for ${meta.count} states`);
  const states = new Float64Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length)), f = SETTINGS[String(r.truth.setting).split(' ')[0]]?.forces ?? {};
  const terms = [...(r.truth.dragAreaOverMass ? [{ kind: 'DRAG_AREA_OVER_MASS', value: r.truth.dragAreaOverMass }] : []), ...(r.truth.srpAreaOverMass ? [{ kind: 'SRP_AREA_OVER_MASS', value: r.truth.srpAreaOverMass }] : [])];
  const bytes = truthRecord(O, fb, { hash: h, caseId, startMs: start, states, seed, terms, tolerance: r.truth.tolerance, degree: f.degree ?? 0, order: f.order ?? 0 });
  const ref = truthStream.append(bytes, h);
  made.set(h, { start, count: meta.count, ref, seed, sha256: sha256hex(bytes) }); tally.bytesBin += bin.length; tally.bytesStream += 4 + ref.size; tally.converted += 1;
}

// 4. read every truth record back and compare it with the .bin; its provenance with the seed frame; its first state with the reference build's state for the seed
let checked = 0, firstStateWorstM = 0;
for (const fr of frames(truthStream.file)) {
  const o = O.OCM.getRootAsOCM(new fb.ByteBuffer(new Uint8Array(fr.bytes))).unpack(), h = o.HEADER.MESSAGE_ID, m = made.get(h);
  if (!m) { problems.push(`${h}: a frame no flight made`); continue; }
  const bin = fs.readFileSync(path.join(truthDir, `${h}.bin`)), want = new Float64Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length)), got = Float64Array.from(o.STATE_DATA);
  if (!(got.length === want.length && Buffer.from(got.buffer).equals(Buffer.from(want.buffer)))) problems.push(`${h}: the states differ from the .bin`);
  if (o.METADATA.START_TIME !== iso(m.start) || o.STATE_STEP_SIZE !== 300 || o.STATE_VECTOR_SIZE !== 6 || got.length !== m.count * 6) problems.push(`${h}: start, step or size differ`);
  if (o.PROVENANCE.SOURCE_ID !== m.seed.id || o.PROVENANCE.SOURCE_SHA256 !== m.seed.sha256 || Number(o.PROVENANCE.SOURCE_BYTES) !== m.seed.bytes || o.SEED_SETS[0].MESSAGE_ID !== m.seed.id) problems.push(`${h}: the provenance does not name its seed`);
  const s0 = m.seed.state;
  if (s0.refused) { problems.push(`${h}: its seed is refused by the reference build`); continue; }
  const d = Math.max(...[0, 1, 2].map((i) => Math.abs(got[i] - s0.r[i]))) * 1000; firstStateWorstM = Math.max(firstStateWorstM, d);
  if (d > 1) problems.push(`${h}: the first state is ${d.toFixed(3)} m from the seed's state`);
  if (fr.offset !== m.ref.offset || fr.size !== m.ref.size) problems.push(`${h}: the frame is not where the append put it`);
  checked += 1;
}
if (checked !== made.size) problems.push(`${checked} frames for ${made.size} flights`);
console.log(JSON.stringify({ ...tally, seeds: seeds.size, seedsFlownStatedEqualPlain: seedsChecked - problems.filter((p) => p.includes('stated seed')).length, seedsRefusedByReferenceBuild: refused.length, seedStream: seedFile, truthStream: truthFile, checked, firstStateWorstM: Math.round(firstStateWorstM * 1e6) / 1e6, problems: problems.length }));
for (const p of problems.slice(0, 20)) console.error(p);
if (!problems.length) {
  const identityOf = (bytes) => O.OCM.getRootAsOCM(new fb.ByteBuffer(bytes)).HEADER().MESSAGE_ID();
  seedStream.verify(identityOf); truthStream.verify(identityOf);
  seedStream.publish(); truthStream.publish();
}
process.exit(problems.length ? 1 : 0);
