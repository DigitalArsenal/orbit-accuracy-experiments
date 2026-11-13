// End-to-end check of the scoring and event-table scripts of experiments/conjunction-miss-from-public-sets on made-up tables (no real object, no archive
// data): one case per verdict word, the boundaries of the verdict logic, the tie, drop and validity rules, the row choice and the event grouping.
// Skipped, visibly, when python3 with numpy is absent; a skip is not a pass.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXP = path.join(HERE, '../experiments/conjunction-miss-from-public-sets');
const CONFIG_FILE = path.join(EXP, 'config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const CONFIG_SHA = crypto.createHash('sha256').update(fs.readFileSync(CONFIG_FILE)).digest('hex');
const py = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' });
const skip = py.status !== 0 && 'absent: python3 with numpy';
const BINS = CONFIG.leadBins.map((b) => b.label);
const ID0 = 9000000; // identifiers no catalog holds

const head = (what, over = {}) => JSON.stringify({ _header: { what, experiment: CONFIG.experiment, moduleWasmSha256: CONFIG.module.wasmSha256, configSha256: CONFIG_SHA, registered: true, shard: '0/1', ...over } });

/**
 * A made-up store of n events. spec(i) -> { strong, s, w, x, wState, sState, bins, type2 }: s, w, x are the arms' distances from the final miss (200 m);
 * wState 'nofit' | 'notrun' marks arm W's row, sState 'error' a refused S flight; bins is the number of lead bins an event has a chosen row in (default 1).
 */
function makeStore(n, spec, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-test-'));
  const events = [], rows = { sgp4: [head('rows-sgp4')], W: [head('rows-W', opts.headW)], X: [head('rows-X')] };
  for (let i = 0; i < n; i += 1) {
    const sp = spec(i);
    const tf = 1800000000 + i * 5000;
    const nb = sp.bins ?? 1;
    const msgs = [], picks = {};
    for (let b = 0; b < nb; b += 1) {
      const id = `m${i}_${b}`;
      msgs.push({ id, c: tf - (0.25 + 0.5 * b) * 86400, tca: tf, miss: 200 });
      picks[BINS[b]] = id;
      rows.sgp4.push(JSON.stringify({ ev: i, bin: BINS[b], id, c: msgs[b].c, gpA: `a${i}`, gpB: `b${i}`, epA: tf - 4 * 86400, epB: tf - 4 * 86400, ...(sp.sState === 'error' ? { error: 'sgp4-status' } : { miss: 200 + sp.s, tca: tf }) }));
      const failing = sp.wState && (sp.failBin === undefined || sp.failBin === b);
      const w = failing && sp.wState === 'notrun' ? { notrun: [true, false] } : failing ? { nofit: [true, false] } : { miss: 200 + sp.w, tca: tf };
      rows.W.push(JSON.stringify({ ev: i, bin: BINS[b], id, ...w }));
      rows.X.push(JSON.stringify({ ev: i, bin: BINS[b], id, miss: 200 + sp.x, tca: tf }));
    }
    msgs.push({ id: `r${i}`, c: tf - 3600, tca: tf, miss: 200 });
    events.push({ idx: i, pair: [ID0 + 2 * i, ID0 + 2 * i + 1], primary: ID0 + 2 * i, secondary: ID0 + 2 * i + 1, type1: 'DEBRIS', type2: sp.type2 ?? 'PAYLOAD', tca_f: tf, miss_f: 200,
      c_last: tf - 3600, strong: sp.strong, nMessages: msgs.length, msgs, picks });
  }
  const sets = {};
  for (const e of events) {
    sets[e.primary] = [{ gp: `a${e.idx}`, cr: '2026-11-01T00:00:00', ep: '2026-11-01T00:00:00', n: 15.1, e: 0.001 }];
    sets[e.secondary] = [{ gp: `b${e.idx}`, cr: '2026-11-01T00:00:00', ep: '2026-11-01T00:00:00', n: 15.1, e: 0.001 }];
  }
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));
  fs.writeFileSync(path.join(dir, 'sets_index.json'), JSON.stringify(sets));
  const files = opts.files ?? { sgp4: 'rows-sgp4.jsonl', W: 'rows-W.jsonl', X: 'rows-X.jsonl' };
  for (const [arm, f] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), rows[arm].join('\n') + '\n');
  for (const arm of ['W', 'X']) {
    fs.writeFileSync(path.join(dir, `fits-${arm}.jsonl`), [head(`fits-${arm}`, { limit: null, ...(arm === 'W' ? { forecasterSha256: CONFIG.weatherForecaster.sha256 } : {}), ...(opts.fitHeader ?? {}) })].join('\n') + '\n');
  }
  for (const f of opts.removeFiles ?? []) fs.rmSync(path.join(dir, f));
  return dir;
}

function run(dir) {
  return spawnSync('python3', [path.join(EXP, 'score.py'), '--config', CONFIG_FILE], { encoding: 'utf8', env: { ...process.env, CONJ_STORE: dir }, maxBuffer: 1 << 26 });
}
function score(dir) {
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout.slice(-300) + r.stderr);
  return { out: r.stdout, result: JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')) };
}
const win = (extra = {}) => ({ strong: true, s: 400, w: 100, x: 300, ...extra });

test('CONFIRMED: an arm that is nearer the final miss on every row of 120 primary events', { skip }, () => {
  const { result, out } = score(makeStore(120, () => win()));
  assert.equal(result['W-vs-S'].verdict, 'CONFIRMED');
  assert.equal(result['W-vs-X'].verdict, 'CONFIRMED');
  assert.equal(result['W-vs-S'].PRIMARY.cells.pooled.share, 1);
  assert.equal(result['X-vs-S'].verdict, undefined, 'a comparison without a verdict states none');
  assert.match(out, /VERDICT W-vs-S \(PRIMARY, 120 events with a scored row\): CONFIRMED/);
});

test('REFUTED: an arm that is farther from the final miss on every row', { skip }, () => {
  assert.equal(score(makeStore(120, () => win({ w: 700 }))).result['W-vs-S'].verdict, 'REFUTED');
});

test('INSUFFICIENT: 99 primary events override a clear win and a clear loss; exactly 100 events are enough', { skip }, () => {
  assert.equal(score(makeStore(99, () => win())).result['W-vs-S'].verdict, 'INSUFFICIENT');
  assert.equal(score(makeStore(99, () => win({ w: 700 }))).result['W-vs-S'].verdict, 'INSUFFICIENT', 'INSUFFICIENT overrides REFUTED');
  assert.equal(score(makeStore(100, () => win())).result['W-vs-S'].verdict, 'CONFIRMED');
});

test('INSUFFICIENT is counted after the drop: 100 primary events with 1 row that fails leave 99', { skip }, () => {
  const { result } = score(makeStore(100, (i) => win({ wState: i === 0 ? 'nofit' : undefined })));
  assert.equal(result['W-vs-S'].PRIMARY.events, 99);
  assert.equal(result['W-vs-S'].verdict, 'INSUFFICIENT');
});

test('NOT CONFIRMED: a small advantage whose interval reaches 50 %, reported as under the planned size', { skip }, () => {
  const { result } = score(makeStore(120, (i) => win({ s: 100, w: i % 25 < 13 ? 90 : 110, x: 100 })));
  const v = result['W-vs-S'];
  assert.equal(v.verdict, 'NOT CONFIRMED');
  assert.match(v.note, /under the planned size/);
  assert.ok(v.PRIMARY.cells.pooled.shareLo < 0.5);
});

test('ties: equal errors count as not smaller', { skip }, () => {
  const { result } = score(makeStore(120, (i) => win({ s: 100, w: i % 2 ? 100 : 50, x: 100 })));
  assert.equal(result['W-vs-S'].PRIMARY.cells.pooled.share, 0.5);
  assert.equal(result['W-vs-S'].verdict, 'NOT CONFIRMED');
});

test('the guard: 9 events against 2 are significant on the discordant events (p = 0.033) and refute; 8 against 2 (p = 0.055) do not', { skip }, () => {
  // the final miss is 200 m: an arm's miss of 2,600 m against 600 m is more than twice and above 1 km
  const make = (worseArm, worseBase) => makeStore(120, (i) => (i < worseArm ? win({ w: 2400 }) : i < worseArm + worseBase ? win({ s: 2400, w: 400 }) : win()));
  const a = score(make(9, 2));
  assert.equal(a.result['W-vs-S'].PRIMARY.cells.pooled.worseArm, 9);
  assert.equal(a.result['W-vs-S'].PRIMARY.cells.pooled.worseBase, 2);
  assert.ok(Math.abs(a.result['W-vs-S'].PRIMARY.cells.pooled.guardP - 0.0327) < 0.0005);
  assert.equal(a.result['W-vs-S'].verdict, 'REFUTED');
  const b = score(make(8, 2));
  assert.ok(Math.abs(b.result['W-vs-S'].PRIMARY.cells.pooled.guardP - 0.0547) < 0.0005);
  assert.equal(b.result['W-vs-S'].verdict, 'NOT CONFIRMED', 'H1 and H2 hold, the guard fails without significance');
});

test('drop rule: a row that fails in an arm is left out and counted; no other message is put in its place', { skip }, () => {
  const { result, out } = score(makeStore(120, (i) => win({ wState: i === 0 ? 'nofit' : undefined, failBin: 0, bins: i === 0 ? 2 : 1 })));
  assert.equal(result['W-vs-S'].PRIMARY.events, 120, 'the event keeps its other row');
  assert.equal(result['W-vs-S'].PRIMARY.rows, 120, 'event 0 has two chosen rows, one fails; 119 events have one: no other message takes the failed row\'s place');
  assert.match(out, /dropped from this comparison: 1 rows, W: record missing: the module refused the fit/);
});

test('a refused S flight drops a row only where S is the arm or the base', { skip }, () => {
  const { result } = score(makeStore(120, (i) => win({ sState: i === 0 ? 'error' : undefined })));
  assert.equal(result['W-vs-X'].PRIMARY.events, 120, 'W against X keeps the row');
  assert.equal(result['W-vs-S'].PRIMARY.events, 119);
  assert.equal(result['X-vs-S'].PRIMARY.events, 119);
});

test('rows in two to four lead bins: events and rows are counted separately; the multi-bin cells count events once', { skip }, () => {
  const { result } = score(makeStore(120, (i) => win({ bins: 1 + (i % 4) })));
  const p = result['W-vs-S'].PRIMARY;
  assert.equal(p.events, 120);
  assert.equal(p.rows, 30 * (1 + 2 + 3 + 4));
  assert.equal(p.cells.pooled.events, 120);
  assert.equal(p.cells.pooled.rows, 300);
  assert.equal(p.cells['lead 0-0.5 d'].events, 120);
  assert.equal(p.cells['lead 2-3 d'].events, 30, 'the last bin holds the 30 events that have four chosen rows');
});

test('populations: the secondary population holds the weak-reference events and the primary holds only the strong ones', { skip }, () => {
  const { result } = score(makeStore(130, (i) => win({ strong: i < 110 })));
  assert.equal(result['W-vs-S'].PRIMARY.events, 110);
  assert.equal(result['W-vs-S'].SECONDARY.events, 130);
});

test('FEW: a cell with 19 events prints FEW and no figure, a cell with 20 events prints its figures', { skip }, () => {
  const { out, result } = score(makeStore(120, (i) => win({ type2: i < 19 ? 'ROCKET BODY' : i < 39 ? 'DEBRIS' : 'PAYLOAD' })));
  assert.match(out, /debris-rocket body +FEW \(19 events\)/);
  assert.ok(result['W-vs-S'].PRIMARY.cells['debris-debris'], 'a cell with 20 events is published');
  assert.equal(result['W-vs-S'].PRIMARY.cells['debris-rocket body'], undefined);
});

test('INVALID: a store that cannot be the registered run is not scored (no verdict, exit 1)', { skip }, () => {
  const bad = (dir, text) => {
    const r = run(dir);
    assert.equal(r.status, 1, text);
    assert.match(r.stdout, new RegExp(`INVALID: .*${text}`));
    assert.doesNotMatch(r.stdout, /VERDICT/);
  };
  bad(makeStore(120, () => win(), { removeFiles: ['rows-W.jsonl'] }), 'no rows file for arm W');
  bad(makeStore(120, () => win(), { headW: { moduleWasmSha256: '0'.repeat(64) } }), 'another module SHA-256');
  bad(makeStore(120, () => win(), { headW: { configSha256: '0'.repeat(64) } }), 'another configuration');
  bad(makeStore(120, () => win(), { fitHeader: { moduleWasmSha256: '0'.repeat(64) } }), 'another module SHA-256');
  bad(makeStore(120, (i) => win({ wState: i === 5 ? 'notrun' : undefined })), '1 chosen rows were never run in arm W');
  const mixed = makeStore(120, () => win(), { files: { sgp4: 'rows-sgp4.jsonl', W: 'rows-W-0of2.jsonl', X: 'rows-X.jsonl' } });
  fs.writeFileSync(path.join(mixed, 'rows-W.jsonl'), fs.readFileSync(path.join(mixed, 'rows-W-0of2.jsonl')));
  bad(mixed, 'both sharded and unsharded');
  bad(makeStore(120, () => win(), { files: { sgp4: 'rows-sgp4.jsonl', W: 'rows-W-0of2.jsonl', X: 'rows-X.jsonl' } }), 'incomplete or mixed set of shards');
  const noHeader = makeStore(120, () => win());
  fs.writeFileSync(path.join(noHeader, 'rows-X.jsonl'), fs.readFileSync(path.join(noHeader, 'rows-X.jsonl'), 'utf8').split('\n').slice(1).join('\n'));
  bad(noHeader, 'has no header');
  assert.equal(run(makeStore(120, () => win())).status, 0, 'the same store, complete and consistent, is scored');
});

function eventsFor(messages, { early } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-test-'));
  const root = path.join(dir, 'archive/spacetrack/cdm_public/2026');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '2026-11-20.json.gz'), zlib.gzipSync(JSON.stringify(messages)));
  const config = { ...CONFIG, archive: { root: path.join(dir, 'archive') }, store: path.join(dir, 'store'), messages: { ...CONFIG.messages, from: '2026-11-20', ...(early ? { earlyExclusionCreatedBefore: early } : {}) } };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  const r = spawnSync('python3', [path.join(EXP, 'build-events.py'), '--config', path.join(dir, 'config.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { events: JSON.parse(fs.readFileSync(path.join(dir, 'store/events.json'), 'utf8')), stdout: r.stdout };
}
const TCA = Date.parse('2026-11-20T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);
const message = (id, leadDays, miss, a, b, tcaShift = 0) => ({ CDM_ID: String(id), CREATED: iso(TCA - leadDays * 86400000), TCA: new Date(TCA + tcaShift).toISOString().replace('Z', ''), MIN_RNG: String(miss), PC: '0.001',
  SAT_1_ID: String(a), SAT_2_ID: String(b), SAT1_OBJECT_TYPE: 'DEBRIS', SAT2_OBJECT_TYPE: 'PAYLOAD' });

test('build-events: events group by pair and 60 s, the reference is the last message, the row of a lead bin is the message nearest its middle', { skip }, () => {
  const rows = [message(1, 2.7, 500, ID0 + 1, ID0 + 2, 20000), message(2, 2.4, 450, ID0 + 1, ID0 + 2), message(3, 0.9, 300, ID0 + 1, ID0 + 2, 20000), message(4, 0.3, 250, ID0 + 1, ID0 + 2),
    message(5, 0.1, 220, ID0 + 1, ID0 + 2, 20000), message(6, 0.02, 210, ID0 + 1, ID0 + 2), { ...message(7, 1, 1, ID0 + 1, ID0 + 2), MIN_RNG: 'not a number' },
    message(8, 1, 1, ID0 + 3, ID0 + 4, 2 * 86400000)];
  const { events, stdout } = eventsFor([...rows, rows[0]]);
  const e = events.find((x) => x.pair[0] === ID0 + 1);
  assert.equal(e.msgs.length, 6, 'the two closest-approach times 20 s apart are one event; the unparseable message is dropped');
  assert.equal(e.msgs.at(-1).id, '6', 'the reference is the last message by creation time');
  assert.deepEqual(e.picks, { '0-0.5 d': '4', '0.5-1 d': '3', '2-3 d': '2' }, 'the message nearest each bin middle (0.25, 0.75, 1.5, 2.5 d); none in 1-2 d');
  assert.equal(e.strong, true);
  assert.match(stdout, /messages dropped: unparseable/);
});

test('build-events: a reference created 12 h before the final closest approach is a strong reference, one second earlier is not; a conjunction whose time moves by over 60 s is two events', { skip }, () => {
  const rows = [message(1, 1.2, 400, ID0 + 1, ID0 + 2), message(2, 0.5, 300, ID0 + 1, ID0 + 2),
    message(3, 1.2, 400, ID0 + 3, ID0 + 4), { ...message(4, 0.5, 300, ID0 + 3, ID0 + 4), CREATED: iso(TCA - 0.5 * 86400000 - 1000) },
    message(5, 1.2, 400, ID0 + 5, ID0 + 6), message(6, 0.9, 300, ID0 + 5, ID0 + 6, 120000)];
  const { events } = eventsFor(rows);
  assert.equal(events.find((x) => x.pair[0] === ID0 + 1).strong, true);
  assert.equal(events.find((x) => x.pair[0] === ID0 + 3).strong, false);
  assert.equal(events.filter((x) => x.pair[0] === ID0 + 5).length, 2);
});

test('build-events: an event with any message created before the early cutoff is excluded and counted', { skip }, () => {
  const rows = [message(1, 2.7, 500, ID0 + 1, ID0 + 2), message(2, 0.1, 300, ID0 + 1, ID0 + 2), message(3, 1.2, 400, ID0 + 3, ID0 + 4), message(4, 0.5, 300, ID0 + 3, ID0 + 4)];
  const { events, stdout } = eventsFor(rows, { early: iso(TCA - 2 * 86400000).replace(' ', 'T') + 'Z' });
  assert.equal(events.length, 1);
  assert.equal(events[0].pair[0], ID0 + 3);
  assert.match(stdout, /1 +events excluded: a message created before the early cutoff/);
});
