// End-to-end check of the scoring and event-table scripts of experiments/conjunction-miss-from-public-sets on made-up tables (no real object, no archive
// data): one case per verdict word, the tie rule, the drop rule (a row that fails in an arm is left out, never replaced by another message), and the row
// choice and event grouping of build-events.py. Skipped, visibly, when python3 with numpy is absent; a skip is not a pass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXP = path.join(HERE, '../experiments/conjunction-miss-from-public-sets');
const CONFIG = JSON.parse(fs.readFileSync(path.join(EXP, 'config.json'), 'utf8'));
const py = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' });
const skip = py.status !== 0 && 'absent: python3 with numpy';
const HEADER = (what) => JSON.stringify({ _header: { what, experiment: CONFIG.experiment, moduleWasmSha256: CONFIG.module.wasmSha256 } });
const BIN = CONFIG.leadBins[0].label;

/** A made-up store. spec(i) -> { strong, mf, s, w, x, wState } for event i; errors are the arms' distances from the final miss. */
function makeStore(n, spec, extra = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-test-'));
  const events = [], rowsS = [HEADER('rows-sgp4')], rowsW = [HEADER('rows-W')], rowsX = [HEADER('rows-X')];
  for (let i = 0; i < n; i += 1) {
    const sp = spec(i);
    const tf = 1800000000 + i * 5000;
    const id = `m${i}`;
    events.push({ idx: i, pair: [2 * i + 1, 2 * i + 2], primary: 2 * i + 1, secondary: 2 * i + 2, type1: 'DEBRIS', type2: 'PAYLOAD', tca_f: tf, miss_f: 200, c_last: tf - 3600, strong: sp.strong,
      nMessages: 2, msgs: [{ id, c: tf - 0.25 * 86400, tca: tf, miss: 200 }, { id: `r${i}`, c: tf - 3600, tca: tf, miss: 200 }], picks: { [BIN]: id } });
    rowsS.push(JSON.stringify({ ev: i, bin: BIN, id, c: tf - 0.25 * 86400, gpA: `a${i}`, gpB: `b${i}`, epA: tf - 86400, epB: tf - 86400, miss: 200 + sp.s, tca: tf }));
    rowsW.push(JSON.stringify(sp.wState ? { ev: i, bin: BIN, id, nofit: [true, false] } : { ev: i, bin: BIN, id, miss: 200 + sp.w, tca: tf }));
    rowsX.push(JSON.stringify({ ev: i, bin: BIN, id, miss: 200 + sp.x, tca: tf }));
  }
  extra({ events, rowsS, rowsW, rowsX });
  const sets = {};
  for (const e of events) sets[e.primary] = [{ gp: `a${e.idx}`, cr: '2026-11-01T00:00:00', ep: '2026-11-01T00:00:00', n: 15.1, e: 0.001 }], sets[e.secondary] = [{ gp: `b${e.idx}`, cr: '2026-11-01T00:00:00', ep: '2026-11-01T00:00:00', n: 15.1, e: 0.001 }];
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  fs.writeFileSync(path.join(dir, 'sets_index.json'), JSON.stringify(sets));
  fs.writeFileSync(path.join(dir, 'rows-sgp4.jsonl'), rowsS.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'rows-W.jsonl'), rowsW.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'rows-X.jsonl'), rowsX.join('\n') + '\n');
  return dir;
}

function score(dir) {
  const r = spawnSync('python3', [path.join(EXP, 'score.py'), '--config', path.join(EXP, 'config.json')], { encoding: 'utf8', env: { ...process.env, CONJ_STORE: dir }, maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  return { out: r.stdout, result: JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')) };
}

test('CONFIRMED: an arm that is nearer the final miss on every row of 120 primary events', { skip }, () => {
  const { result, out } = score(makeStore(120, () => ({ strong: true, s: 400, w: 100, x: 300 })));
  assert.equal(result['W-vs-S'].verdict, 'CONFIRMED');
  assert.equal(result['W-vs-X'].verdict, 'CONFIRMED');
  assert.equal(result['W-vs-S'].PRIMARY.cells.pooled.share, 1);
  assert.equal(result['X-vs-S'].verdict, undefined, 'a comparison without a verdict states none');
  assert.match(out, /VERDICT W-vs-S \(PRIMARY, 120 events with a scored row\): CONFIRMED/);
});

test('REFUTED: an arm that is farther from the final miss on every row', { skip }, () => {
  const { result } = score(makeStore(120, () => ({ strong: true, s: 400, w: 700, x: 300 })));
  assert.equal(result['W-vs-S'].verdict, 'REFUTED');
});

test('INSUFFICIENT: fewer than 100 primary events overrides a clear win', { skip }, () => {
  const { result } = score(makeStore(99, () => ({ strong: true, s: 400, w: 100, x: 300 })));
  assert.equal(result['W-vs-S'].verdict, 'INSUFFICIENT');
});

test('NOT CONFIRMED: a small advantage whose interval reaches 50 %, reported as under the planned size', { skip }, () => {
  const { result } = score(makeStore(120, (i) => ({ strong: true, s: 100, w: i % 25 < 13 ? 90 : 110, x: 100 })));
  const v = result['W-vs-S'];
  assert.equal(v.verdict, 'NOT CONFIRMED');
  assert.match(v.note, /under the planned size/);
  assert.ok(v.PRIMARY.cells.pooled.shareLo < 0.5);
});

test('ties: equal errors count as not smaller', { skip }, () => {
  const { result } = score(makeStore(120, (i) => ({ strong: true, s: 100, w: i % 2 ? 100 : 50, x: 100 })));
  assert.equal(result['W-vs-S'].PRIMARY.cells.pooled.share, 0.5);
  assert.equal(result['W-vs-S'].verdict, 'NOT CONFIRMED');
});

test('the guard: more events where the arm is worse than the base, significant on the discordant events, refutes; a plain count failure does not', { skip }, () => {
  // the final miss is 200 m: W's miss is 2,600 m against S's 600 m (more than twice, above 1 km) in 12 events and the reverse in 2 events
  // (exact one-sided p = 0.0065 on the 14 discordant events): REFUTED although H1 and H2 hold
  const a =score(makeStore(120, (i) => (i < 12 ? { strong: true, s: 400, w: 2400, x: 300 } : i < 14 ? { strong: true, s: 2400, w: 400, x: 300 } : { strong: true, s: 400, w: 100, x: 300 })));
  assert.equal(a.result['W-vs-S'].PRIMARY.cells.pooled.worseArm, 12);
  assert.equal(a.result['W-vs-S'].PRIMARY.cells.pooled.worseBase, 2);
  assert.equal(a.result['W-vs-S'].verdict, 'REFUTED');
  // 4 against 2 events (p = 0.34): H1 and H2 hold, the guard fails without significance: NOT CONFIRMED
  const b = score(makeStore(120, (i) => (i < 4 ? { strong: true, s: 400, w: 2400, x: 300 } : i < 6 ? { strong: true, s: 2400, w: 400, x: 300 } : { strong: true, s: 400, w: 100, x: 300 })));
  assert.equal(b.result['W-vs-S'].verdict, 'NOT CONFIRMED');
});

test('drop rule: a row that fails in an arm is left out and counted; no other message is put in its place', { skip }, () => {
  const dir = makeStore(120, (i) => ({ strong: true, s: 400, w: 100, x: 300, wState: i === 0 }));
  const { result, out } = score(dir);
  assert.equal(result['W-vs-S'].PRIMARY.events, 119);
  assert.match(out, /dropped from this comparison: 1 rows, W: record missing/);
  assert.equal(result['W-vs-S'].PRIMARY.rows, 119);
});

test('populations: the secondary population holds the weak-reference events and the primary holds only the strong ones', { skip }, () => {
  const { result } = score(makeStore(130, (i) => ({ strong: i < 110, s: 400, w: 100, x: 300 })));
  assert.equal(result['W-vs-S'].PRIMARY.events, 110);
  assert.equal(result['W-vs-S'].SECONDARY.events, 130);
});

test('FEW: a cell under 20 events prints FEW and no figures', { skip }, () => {
  const { out } = score(makeStore(120, () => ({ strong: true, s: 400, w: 100, x: 300 })));
  assert.match(out, /perigee >2000 +FEW \(0 events\)|perigee <600 +FEW \(0 events\)/);
});

test('build-events: events group by pair and 60 s, the reference is the last message, the row of a lead bin is the message nearest its middle', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-test-'));
  const root = path.join(dir, 'archive/spacetrack/cdm_public/2026');
  fs.mkdirSync(root, { recursive: true });
  const tca = Date.parse('2026-11-20T12:00:00Z');
  const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
  const msg = (id, leadDays, miss) => ({ CDM_ID: String(id), CREATED: iso(tca - leadDays * 86400000), TCA: new Date(tca + (id % 2) * 20000).toISOString().replace('Z', ''), MIN_RNG: String(miss), PC: '0.001',
    SAT_1_ID: '70001', SAT_2_ID: '70002', SAT1_OBJECT_TYPE: 'DEBRIS', SAT2_OBJECT_TYPE: 'PAYLOAD' });
  const rows = [msg(1, 2.7, 500), msg(2, 2.4, 450), msg(3, 0.9, 300), msg(4, 0.3, 250), msg(5, 0.1, 220), msg(6, 0.02, 210),
    { ...msg(7, 1, 1), MIN_RNG: 'not a number' }, { ...msg(8, 1, 1), SAT_1_ID: '70003', SAT_2_ID: '70004', TCA: '2026-11-22T00:00:00' }];
  fs.writeFileSync(path.join(root, '2026-11-20.json.gz'), zlib.gzipSync(JSON.stringify([...rows, rows[0]])));
  const config = { ...CONFIG, archive: { root: path.join(dir, 'archive') }, store: path.join(dir, 'store'), messages: { ...CONFIG.messages, from: '2026-11-20' } };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  const r = spawnSync('python3', [path.join(EXP, 'build-events.py'), '--config', path.join(dir, 'config.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const events = JSON.parse(fs.readFileSync(path.join(dir, 'store/events.json'), 'utf8'));
  const e = events.find((x) => x.pair[0] === 70001);
  assert.equal(e.msgs.length, 6, 'the two closest-approach times 20 s apart are one event; the unparseable message is dropped');
  assert.equal(e.msgs.at(-1).id, '6', 'the reference is the last message by creation time');
  assert.deepEqual(e.picks, { '0-0.5 d': '4', '0.5-1 d': '3', '2-3 d': '2' }, 'the message nearest each bin middle (0.25, 0.75, 1.5, 2.5 d); none in 1-2 d');
  assert.equal(e.strong, true);
  assert.match(r.stdout, /messages dropped: unparseable/);
});
