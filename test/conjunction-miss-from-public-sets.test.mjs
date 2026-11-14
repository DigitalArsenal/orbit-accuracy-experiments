// End-to-end check of the scoring and event-table scripts of experiments/conjunction-miss-from-public-sets on made-up tables (no real object, no archive
// data): one case per verdict word, the boundaries of the verdict logic, the tie, drop and validity rules, the row choice and the event grouping.
// Skipped, visibly, when python3 with numpy is absent; a skip is not a pass.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeWeatherManifest } from '../experiments/conjunction-miss-from-public-sets/lib/weather-manifest.mjs';
import { readConfig } from '../experiments/conjunction-miss-from-public-sets/lib/config.mjs';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXP = path.join(HERE, '../experiments/conjunction-miss-from-public-sets');
const CONFIG_FILE = path.join(EXP, 'config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const CONFIG_SHA = sha(fs.readFileSync(CONFIG_FILE));
const MANIFEST_SHA = sha(fs.readFileSync(path.join(EXP, 'MANIFEST.sha256')));
const py = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' });
const skip = py.status !== 0 && 'absent: python3 with numpy';
const BINS = CONFIG.leadBins.map((b) => b.label);
const MIDDLES = CONFIG.leadBins.map((b) => b.middle);
const ID0 = 9000000; // identifiers no catalog holds
const WINDOW_START = Date.parse(CONFIG.window.finalFrom) / 1000;

/**
 * A made-up store of n events, complete and consistent with the registered configuration. spec(i) -> { strong, s, w, x, wState, sState, bins, type2 }: s, w, x are
 * the arms' distances from the final miss (200 m); wState 'nofit' | 'notrun' marks arm W's row, sState 'error' a refused S flight; bins is the number of lead bins an
 * event has a chosen row in (default 1). opts: headW and fitHeader override header fields, files names the row files, removeFiles removes files, tfBase moves the events.
 */
function makeStore(n, spec, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-test-'));
  const events = [], rows = { sgp4: [], W: [], X: [] };
  for (let i = 0; i < n; i += 1) {
    const sp = spec(i);
    const tf = (opts.tfBase ?? WINDOW_START + 86400) + i * 1000;
    const nb = sp.bins ?? 1;
    const msgs = [], picks = {};
    for (let b = 0; b < nb; b += 1) {
      const id = `m${i}_${b}`;
      msgs.push({ id, c: tf - MIDDLES[b] * 86400, tca: tf, miss: 200 });
      picks[BINS[b]] = id;
      rows.sgp4.push(JSON.stringify({ ev: i, bin: BINS[b], id, c: msgs[b].c, tcaMsg: tf, missMsg: 200, gpA: `a${i}`, gpB: `b${i}`, epA: tf - 4 * 86400, epB: tf - 4 * 86400,
        ...(sp.sState === 'error' ? { error: 'sgp4-status' } : { miss: 200 + sp.s, tca: tf }) }));
      const failing = sp.wState && (sp.failBin === undefined || sp.failBin === b);
      const w = failing && sp.wState === 'notrun' ? { notrun: [true, false] } : failing ? { nofit: [true, false] } : { miss: 200 + sp.w, tca: tf };
      rows.W.push(JSON.stringify({ ev: i, bin: BINS[b], id, ...w }));
      rows.X.push(JSON.stringify({ ev: i, bin: BINS[b], id, miss: 200 + sp.x, tca: tf }));
    }
    const cLast = sp.strong ? tf - 3600 : tf - 50000; // the primary rule: the reference created not more than 12 h before the final closest approach
    msgs.push({ id: `r${i}`, c: cLast, tca: tf, miss: 200 });
    events.push({ idx: i, pair: [ID0 + 2 * i, ID0 + 2 * i + 1], primary: ID0 + 2 * i, secondary: ID0 + 2 * i + 1, type1: 'DEBRIS', type2: sp.type2 ?? 'PAYLOAD', tca_f: tf, miss_f: 200,
      c_last: cLast, strong: sp.strong, nMessages: msgs.length, msgs, picks });
  }
  const sets = {};
  for (const e of events) {
    sets[e.primary] = [{ gp: `a${e.idx}`, cr: '2026-11-01T00:00:00', ep: '2026-11-01T00:00:00', n: 15.1, e: 0.001 }];
    sets[e.secondary] = [{ gp: `b${e.idx}`, cr: '2026-11-01T00:00:00', ep: '2026-11-01T00:00:00', n: 15.1, e: 0.001 }];
  }
  const eventsJson = JSON.stringify(events), setsJson = JSON.stringify(sets);
  fs.writeFileSync(path.join(dir, 'events.json'), eventsJson);
  fs.writeFileSync(path.join(dir, 'sets_index.json'), setsJson);
  const ident = { look: opts.look ?? 3, configSha256: CONFIG_SHA, registered: true };
  fs.writeFileSync(path.join(dir, 'events-counts.json'), JSON.stringify({ counts: {}, inputAggregateSha256: 'x', ...ident, eventsSha256: sha(eventsJson) }));
  fs.writeFileSync(path.join(dir, 'sets-counts.json'), JSON.stringify({ counts: {}, inputAggregateSha256: 'x', ...ident, builtFromEventsSha256: sha(eventsJson), setsIndexSha256: sha(setsJson) }));
  for (const nm of ['inputs-messages.json', 'inputs-sets.json']) fs.writeFileSync(path.join(dir, nm), JSON.stringify({ kind: nm, ...ident, files: [], aggregateSha256: 'x' }));
  const head = (what, over = {}) => JSON.stringify({ _header: { what, experiment: CONFIG.experiment, moduleWasmSha256: CONFIG.module.wasmSha256, configSha256: CONFIG_SHA, configName: 'config.json',
    registered: true, look: opts.look ?? 3, shard: '0/1', node: `v${CONFIG.environment.node}`, manifestSha256: MANIFEST_SHA, eventsSha256: sha(eventsJson), setsIndexSha256: sha(setsJson), archiveRoot: path.join(dir, 'archive'), ...over } });
  const files = opts.files ?? { sgp4: 'rows-sgp4.jsonl', W: 'rows-W.jsonl', X: 'rows-X.jsonl' };
  const whats = { sgp4: 'rows-sgp4', W: 'rows-W', X: 'rows-X' };
  for (const [arm, f] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), [head(whats[arm], arm === 'W' ? opts.headW : undefined), ...rows[arm]].join('\n') + '\n');
  for (const arm of ['W', 'X']) {
    fs.writeFileSync(path.join(dir, `fits-${arm}.jsonl`), [head(`fits-${arm}`, { limit: null, ...(arm === 'W' ? { forecasterSha256: CONFIG.weatherForecaster.sha256 } : {}), ...(opts.fitHeader ?? {}) }),
      ...(opts.fitRows ?? [])].join('\n') + '\n');
  }
  for (const look of CONFIG.looks.slice(0, 2)) {
    fs.writeFileSync(path.join(dir, `earlier-look${look.number}.json`), JSON.stringify({ registered: true, configSha256: CONFIG_SHA,
      look: { ...look, seed: CONFIG.statistics.seed + look.seedOffset },
      'W-vs-S': { verdict: 'CONTINUE' }, 'W-vs-X': { verdict: 'CONTINUE' } }));
  }
  for (const f of opts.removeFiles ?? []) fs.rmSync(path.join(dir, f));
  return dir;
}

function run(dir, extraArgs = []) {
  const env = { ...process.env, CONJ_STORE: dir };
  env.SDN_ARCHIVE_ROOT = path.join(dir, 'archive');
  const countsFile = path.join(dir, 'events-counts.json');
  const look = fs.existsSync(countsFile) ? JSON.parse(fs.readFileSync(countsFile, 'utf8')).look : 3;
  if (!extraArgs.includes('--look')) extraArgs = ['--look', String(look), ...extraArgs];
  if (extraArgs[extraArgs.indexOf('--look') + 1] === '3' && !extraArgs.includes('--earlier')) {
    extraArgs = [...extraArgs, '--earlier', path.join(dir, 'earlier-look1.json'), '--earlier', path.join(dir, 'earlier-look2.json')];
  }
  return spawnSync('python3', [path.join(EXP, 'score.py'), '--config', CONFIG_FILE, ...extraArgs], { encoding: 'utf8', env, maxBuffer: 1 << 26 });
}
function score(dir) {
  const r = run(dir);
  assert.equal(r.status, 0, r.stdout.slice(-300) + r.stderr);
  const look = JSON.parse(fs.readFileSync(path.join(dir, 'events-counts.json'), 'utf8')).look;
  return { out: r.stdout, result: JSON.parse(fs.readFileSync(path.join(dir, `results-look${look}.json`), 'utf8')) };
}
const win = (extra = {}) => ({ strong: true, s: 400, w: 100, x: 300, ...extra });

test('CONFIRMED: an arm that is nearer the final miss on every row of 120 primary events', { skip }, () => {
  const { result, out } = score(makeStore(120, () => win()));
  assert.equal(result['W-vs-S'].verdict, 'CONFIRMED');
  assert.equal(result['W-vs-X'].verdict, 'CONFIRMED');
  assert.equal(result['W-vs-S'].PRIMARY.cells.pooled.share, 1);
  assert.equal(result['X-vs-S'].verdict, undefined, 'a comparison without a verdict states none');
  assert.equal(result.registered, true);
  assert.match(out, /VERDICT W-vs-S \(PRIMARY, 120 events with a scored row\): CONFIRMED$/m);
  assert.doesNotMatch(out, /\/tmp|\/var\/folders/, 'nothing printed holds an absolute path');
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

test('NOT CONFIRMED: a small advantage whose interval reaches 50 %, reported as under the expected size', { skip }, () => {
  const { result } = score(makeStore(120, (i) => win({ s: 100, w: i % 25 < 13 ? 90 : 110, x: 100 })));
  const v = result['W-vs-S'];
  assert.equal(v.verdict, 'NOT CONFIRMED');
  assert.match(v.note, /under the expected size/);
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

const bad = (dir, text, extraArgs = []) => {
  const r = run(dir, extraArgs);
  assert.equal(r.status, 1, `${text}: ${r.stdout.slice(-200)}${r.stderr.slice(-200)}`);
  assert.match(r.stdout, new RegExp(`INVALID: .*${text}`));
  assert.doesNotMatch(r.stdout, /VERDICT/);
  assert.equal(fs.existsSync(path.join(dir, 'results-look3.json')), false, 'an invalid run leaves no results.json');
};

test('INVALID: a store that cannot be the registered run is not scored (no verdict, exit 1)', { skip }, () => {
  bad(makeStore(120, () => win(), { removeFiles: ['rows-W.jsonl'] }), 'no rows file for arm W');
  bad(makeStore(120, () => win(), { headW: { moduleWasmSha256: '0'.repeat(64) } }), 'another module SHA-256');
  bad(makeStore(120, () => win(), { headW: { configSha256: '0'.repeat(64) } }), 'another configuration');
  bad(makeStore(120, () => win(), { fitHeader: { moduleWasmSha256: '0'.repeat(64) } }), 'another module SHA-256');
  bad(makeStore(120, () => win(), { fitHeader: { limit: 5 } }), 'was run with a limit');
  bad(makeStore(120, () => win(), { fitHeader: { forecasterSha256: '0'.repeat(64) } }), 'another weather forecaster SHA-256');
  bad(makeStore(120, () => win(), { headW: { node: 'v1.0.0' } }), 'another Node version');
  bad(makeStore(120, () => win(), { headW: { manifestSha256: '0'.repeat(64) } }), 'another manifest of frozen files');
  bad(makeStore(120, () => win(), { headW: { eventsSha256: '0'.repeat(64) } }), 'another event table or set index');
  bad(makeStore(120, () => win(), { headW: { archiveRoot: '/elsewhere' } }), 'more than one archive root');
  bad(makeStore(120, () => win(), { headW: { what: 'rows-X' } }), 'names another file or shard');
  bad(makeStore(120, (i) => win({ wState: i === 5 ? 'notrun' : undefined })), '1 chosen rows were never run in arm W');
  bad(makeStore(120, () => win(), { fitRows: [JSON.stringify({ key: 'W-a0', ok: false, status: { name: 'exception' } })] }), 'records an exception');
  const mixed = makeStore(120, () => win(), { files: { sgp4: 'rows-sgp4.jsonl', W: 'rows-W-0of2.jsonl', X: 'rows-X.jsonl' } });
  fs.writeFileSync(path.join(mixed, 'rows-W.jsonl'), fs.readFileSync(path.join(mixed, 'rows-W-0of2.jsonl')));
  bad(mixed, 'both sharded and unsharded');
  bad(makeStore(120, () => win(), { files: { sgp4: 'rows-sgp4.jsonl', W: 'rows-W-0of2.jsonl', X: 'rows-X.jsonl' } }), 'incomplete or mixed set of shards');
  const noHeader = makeStore(120, () => win());
  fs.writeFileSync(path.join(noHeader, 'rows-X.jsonl'), fs.readFileSync(path.join(noHeader, 'rows-X.jsonl'), 'utf8').split('\n').slice(1).join('\n'));
  bad(noHeader, 'has no header');
  assert.equal(run(makeStore(120, () => win())).status, 0, 'the same store, complete and consistent, is scored');
});

test('INVALID: a stale or foreign event table, a missing identity file, events outside the window, and rows that are not the chosen rows', { skip }, () => {
  const stale = makeStore(120, () => win());
  fs.appendFileSync(path.join(stale, 'events.json'), ' ');
  bad(stale, 'events.json is not the event table its counts file describes');
  bad(makeStore(120, () => win(), { removeFiles: ['sets-counts.json'] }), 'sets-counts.json is missing');
  bad(makeStore(120, () => win(), { tfBase: WINDOW_START - 40 * 86400 }), 'outside the registered window');
  const dup = makeStore(120, () => win());
  fs.appendFileSync(path.join(dup, 'rows-X.jsonl'), fs.readFileSync(path.join(dup, 'rows-X.jsonl'), 'utf8').split('\n')[1] + '\n');
  bad(dup, 'rows that appear twice');
  const extra = makeStore(120, () => win());
  fs.appendFileSync(path.join(extra, 'rows-X.jsonl'), JSON.stringify({ ev: 999, bin: BINS[0], id: 'zzz', miss: 1, tca: 1 }) + '\n');
  bad(extra, 'rows that are not chosen rows');
  const foreign = makeStore(120, () => win());
  const lines = fs.readFileSync(path.join(foreign, 'rows-sgp4.jsonl'), 'utf8').split('\n');
  lines[1] = lines[1].replace('"missMsg":200', '"missMsg":201');
  fs.writeFileSync(path.join(foreign, 'rows-sgp4.jsonl'), lines.join('\n'));
  bad(foreign, 'disagrees with the event table about its message');
});

test('the registered configuration refuses --rule-table, and the results of an earlier run are removed when a later run is invalid', { skip }, () => {
  const dir = makeStore(120, () => win());
  assert.equal(run(dir).status, 0);
  assert.equal(fs.existsSync(path.join(dir, 'results-look3.json')), true);
  const r = run(dir, ['--rule-table']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--rule-table is refused/);
  fs.appendFileSync(path.join(dir, 'events.json'), ' ');
  bad(dir, 'events.json is not the event table');
});

function eventsFor(messages, { early, registered } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-test-'));
  const root = path.join(dir, 'archive/spacetrack/cdm_public/2026');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '2026-11-20.json.gz'), zlib.gzipSync(JSON.stringify(messages)));
  const config = { ...CONFIG, archive: { root: path.join(dir, 'archive') }, store: path.join(dir, 'store'), messages: { ...CONFIG.messages, from: '2026-11-20', through: '2026-11-20', ...(early ? { earlyExclusionCreatedBefore: early } : {}) } };
  delete config.looks; // The grouping controls use their original single-window configuration.
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  const r = spawnSync('python3', [path.join(EXP, 'build-events.py'), '--config', path.join(dir, 'config.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { events: JSON.parse(fs.readFileSync(path.join(dir, 'store/events.json'), 'utf8')), stdout: r.stdout, dir };
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

test('build-events: messages without an identifier are counted; the identity files name the configuration and the event table', { skip }, () => {
  const rows = [message(1, 1.2, 400, ID0 + 1, ID0 + 2), message(2, 0.5, 300, ID0 + 1, ID0 + 2), { ...message(3, 0.7, 350, ID0 + 1, ID0 + 2), CDM_ID: undefined }];
  const { events, stdout, dir } = eventsFor(rows);
  assert.equal(events.length, 1);
  assert.match(stdout, /1 +messages without a message identifier/);
  const counts = JSON.parse(fs.readFileSync(path.join(dir, 'store/events-counts.json'), 'utf8'));
  assert.equal(counts.eventsSha256, sha(fs.readFileSync(path.join(dir, 'store/events.json'))));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'store/inputs-messages.json'), 'utf8')).configSha256.length, 64);
});


test('looks: Python and JavaScript agree on every selected configuration value', { skip }, () => {
  for (const look of CONFIG.looks) {
    const c = readConfig(['--look', String(look.number)]);
    assert.equal(c.runDateUtc, look.runDateUtc);
    assert.equal(c.window.finalTo, look.finalTo);
    assert.equal(c.messages.through, look.runDateUtc);
    assert.equal(c.messages.createdBefore, look.createdBefore);
    assert.equal(c.sets.createdBefore, look.createdBefore);
    assert.equal(c.statistics.interval, 1 - 0.05 / 3);
    assert.equal(c.statistics.seed, CONFIG.statistics.seed + 100000 * (look.number - 1));
    assert.equal(c.statistics.minimumPrimaryEvents, look.number < 3 ? 40 : 100);
    const selected = spawnSync('python3', ['-c',
      'import json,sys; sys.path.insert(0,sys.argv[1]); from look_config import select_look; c=json.load(open(sys.argv[2])); look=select_look(c,["--look",sys.argv[3]]); print(json.dumps(dict(config=c,look=look)))',
      EXP, CONFIG_FILE, String(look.number)], { encoding: 'utf8' });
    assert.equal(selected.status, 0, selected.stderr);
    const python = JSON.parse(selected.stdout);
    const { file, configSha256, archiveRoot, storeDir, registered, look: jsLook, ...jsConfig } = c;
    assert.deepEqual(python, { config: jsConfig, look: jsLook });
  }
  for (const args of [[], ['--look'], ['--look', '0'], ['--look', '4'], ['--look', '1', '--look', '2']]) {
    assert.throws(() => readConfig(args), /--look/);
  }
});

test('looks: early confirmation starts at 40 scored events; interim losses and uncertain results continue', { skip }, () => {
  for (const look of [1, 2]) {
    const early = score(makeStore(40, () => win(), { look }));
    assert.equal(early.result['W-vs-S'].verdict, 'CONFIRMED EARLY');
    assert.equal(early.result['W-vs-X'].verdict, 'CONFIRMED EARLY');
    assert.equal(early.result.look.interval, 1 - 0.05 / 3);
    assert.equal(early.result.look.seed, CONFIG.statistics.seed + 100000 * (look - 1));
    assert.match(early.out, new RegExp(`look ${look}; interval level 98.3333333333%`));
    const few = score(makeStore(40, (i) => win({ wState: i === 0 ? 'nofit' : undefined }), { look }));
    assert.equal(few.result['W-vs-S'].verdict, 'CONTINUE (too few events)');
    assert.equal(few.result['W-vs-X'].PRIMARY.events, 39);
    const loss = score(makeStore(40, () => win({ w: 700 }), { look }));
    assert.equal(loss.result['W-vs-S'].verdict, 'CONTINUE');
    assert.doesNotMatch(loss.out, /: (NOT CONFIRMED|REFUTED|INSUFFICIENT)/);
  }
});

test('looks: foreign stores and headers are invalid; a wrong look is refused', { skip }, () => {
  bad(makeStore(40, () => win(), { look: 1 }), 'names another look', ['--look', '3']);
  bad(makeStore(120, () => win(), { headW: { look: 1 } }), 'names another look');
  for (const args of [['--look', '0'], ['--look', '4'], ['--look']]) {
    const r = run(makeStore(1, () => win()), args);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--look/);
    assert.doesNotMatch(r.stdout, /VERDICT/);
  }
});

test('looks: each builder selects its exact half-open window and creation cutoff, and refuses incomplete starts', { skip }, () => {
  for (const look of CONFIG.looks) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-look-'));
    const archive = path.join(dir, 'archive');
    const root = path.join(archive, 'spacetrack/cdm_public/2026');
    fs.mkdirSync(root, { recursive: true });
    const store = path.join(dir, 'store');
    const execute = (args = ['--look', String(look.number)]) => spawnSync('python3', [path.join(EXP, 'build-events.py'), ...args], {
      encoding: 'utf8', env: { ...process.env, SDN_ARCHIVE_ROOT: archive, CONJ_STORE: store } });
    const day = path.join(root, `${look.runDateUtc}.json.gz`);
    const missing = execute();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, new RegExp(`day file of ${look.runDateUtc} does not exist`));
    // A malformed earlier snapshot proves that the required-day refusal precedes reads.
    fs.writeFileSync(path.join(root, '2026-11-16.json.gz'), 'not gzip');
    const lo = Date.parse(CONFIG.window.finalFrom), hi = Date.parse(look.finalTo), cut = Date.parse(look.createdBefore);
    const rows = [];
    const tc = [lo - 1000, lo, hi - 1000, hi];
    for (let i = 0; i < tc.length; i += 1) rows.push({ ...message(i, 0, 200, ID0 + 2*i, ID0 + 2*i + 1),
      CREATED: iso(lo + 3600000), TCA: iso(tc[i]) });
    rows.push({ ...message('at-cutoff', 0, 200, ID0 + 50, ID0 + 51), CREATED: iso(cut), TCA: iso(lo + 86400000) });
    rows.push({ ...message('after-cutoff', 0, 200, ID0 + 52, ID0 + 53), CREATED: iso(cut + 1000), TCA: iso(lo + 86400000) });
    rows.push({ ...message('before-cutoff', 0, 200, ID0 + 54, ID0 + 55), CREATED: iso(cut - 1000), TCA: iso(lo + 86400000) });
    fs.writeFileSync(day, zlib.gzipSync(JSON.stringify(rows)));
    const result = execute();
    assert.equal(result.status, 0, result.stderr);
    const events = JSON.parse(fs.readFileSync(path.join(store, 'events.json'), 'utf8'));
    assert.deepEqual(events.map((e) => e.tca_f).sort((a,b) => a-b), [lo/1000, (lo + 86400000)/1000, (hi - 1000)/1000]);
    assert.ok(events.every((e) => e.msgs.every((m) => m.c < cut/1000)));
    const counts = JSON.parse(fs.readFileSync(path.join(store, 'events-counts.json'), 'utf8'));
    assert.equal(counts.look, look.number);
    assert.equal(counts.counts['records created at or after the creation cutoff (not used)'], 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(store, 'inputs-messages.json'), 'utf8')).look, look.number);
    const repeat = execute();
    assert.notEqual(repeat.status, 0);
    assert.match(repeat.stderr, /store is not empty/);
    const invalidLook = execute(['--look', '4']);
    assert.notEqual(invalidLook.status, 0);
    assert.match(invalidLook.stderr, /--look/);
    const setsRoot = path.join(archive, 'spacetrack/gp_history/by-creation/2026');
    fs.mkdirSync(setsRoot, { recursive: true });
    const base = { NORAD_CAT_ID: String(ID0 + 2), MEAN_ELEMENT_THEORY: 'SGP4', EPHEMERIS_TYPE: 0,
      EPOCH: '2026-11-16T00:00:00', MEAN_MOTION: 15, ECCENTRICITY: .001, INCLINATION: 50, RA_OF_ASC_NODE: 0,
      ARG_OF_PERICENTER: 0, MEAN_ANOMALY: 0, BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0 };
    fs.writeFileSync(path.join(setsRoot, `${look.runDateUtc}.json.gz`), zlib.gzipSync(JSON.stringify([
      { ...base, GP_ID: 'before', CREATION_DATE: iso(cut - 1000) }, { ...base, GP_ID: 'at', CREATION_DATE: iso(cut) }
    ])));
    const index = spawnSync('python3', [path.join(EXP, 'build-set-index.py'), '--look', String(look.number)], {
      encoding: 'utf8', env: { ...process.env, SDN_ARCHIVE_ROOT: archive, CONJ_STORE: store } });
    assert.equal(index.status, 0, index.stderr);
    const sets = JSON.parse(fs.readFileSync(path.join(store, 'sets_index.json'), 'utf8'));
    assert.deepEqual(sets[String(ID0 + 2)].map((s) => s.gp), ['before']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(store, 'sets-counts.json'), 'utf8')).look, look.number);
  }
});


test('looks: the interval level changes confirmation and uses the registered percentile endpoints', { skip }, () => {
  const dir = makeStore(100, (i) => win({ s: 100, x: 100, w: i < 61 ? 90 : 110 }), { look: 1 });
  const amended = score(dir).result['W-vs-S'];
  const config = structuredClone(CONFIG);
  config.looks[0].interval = .95;
  const file = path.join(dir, 'level-control.json');
  fs.writeFileSync(file, JSON.stringify(config));
  const control = spawnSync('python3', [path.join(EXP, 'score.py'), '--config', file, '--look', '1'], {
    encoding: 'utf8', env: { ...process.env, CONJ_STORE: dir, SDN_ARCHIVE_ROOT: path.join(dir, 'archive') } });
  assert.equal(control.status, 0, control.stderr);
  const original = JSON.parse(fs.readFileSync(path.join(dir, 'results-look1.json'), 'utf8'))['W-vs-S'];
  assert.equal(original.verdict, 'CONFIRMED EARLY');
  assert.equal(amended.verdict, 'CONTINUE');
  // An independent one-row-per-event bootstrap checks both H1 and H2 percentile endpoints.
  const reference = spawnSync('python3', ['-c', `import json,numpy as np
rng=np.random.default_rng(${CONFIG.statistics.seed})
samples=rng.integers(0,100,size=(2000,100))
shares=(samples<61).mean(axis=1)
ratios=np.median(np.where(samples<61,90,110),axis=1)/100
print(json.dumps([[np.percentile(values,q,method='linear').tolist() for values in (shares,ratios)] for q in ([2.5,97.5],[0.8333333333,99.1666666667])]))`], { encoding: 'utf8' });
  assert.equal(reference.status, 0, reference.stderr);
  const expected = JSON.parse(reference.stdout);
  for (const [i, result] of [original, amended].entries()) {
    const c = result.PRIMARY.cells.pooled;
    assert.deepEqual([c.shareLo, c.shareHi], expected[i][0]);
    assert.deepEqual([c.ratioLo, c.ratioHi], expected[i][1]);
  }
});

test('looks: a failed guard or H2 at an eligible interim look yields CONTINUE', { skip }, () => {
  const guarded = score(makeStore(40, (i) => win({ w: i === 0 ? 2400 : 100 }), { look: 1 })).result['W-vs-S'];
  assert.equal(guarded.verdict, 'CONTINUE');
  assert.equal(guarded.PRIMARY.cells.pooled.h1, true);
  assert.equal(guarded.PRIMARY.cells.pooled.h2, true);
  assert.equal(guarded.PRIMARY.cells.pooled.guard, false);
  const h2 = score(makeStore(100, (i) => win(i < 40 ? { s: 400, w: 300 } : i < 80 ? { s: 100, w: 90 } : { s: 1, w: 500 }), { look: 2 })).result['W-vs-S'];
  assert.equal(h2.verdict, 'CONTINUE');
  assert.equal(h2.PRIMARY.cells.pooled.h1, true);
  assert.equal(h2.PRIMARY.cells.pooled.h2, false);
  assert.equal(h2.PRIMARY.cells.pooled.guard, true);
});

test('looks: the fit weather writer identifies its look and scoring rejects a foreign or absent look', { skip }, () => {
  const dir = makeStore(40, () => win(), { look: 1 });
  const config = { ...readConfig(['--look', '1']), storeDir: dir };
  const days = new Map([['2026-11-16', [{ file: 'synthetic-weather.txt', sha256: sha('made-up weather') }]]]);
  writeWeatherManifest(config, 'W', '0/1', CONFIG.weatherForecaster.sha256, days);
  const file = path.join(dir, 'inputs-weather-W.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(manifest.look, 1);
  assert.equal(score(dir).result['W-vs-S'].verdict, 'CONFIRMED EARLY');
  for (const look of [2, undefined]) {
    fs.writeFileSync(file, JSON.stringify({ ...manifest, look }));
    const invalid = run(dir);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stdout, /INVALID: inputs-weather-W.json names another look/);
    assert.doesNotMatch(invalid.stdout, /VERDICT/);
    assert.equal(fs.existsSync(path.join(dir, 'results-look1.json')), false);
  }
  fs.writeFileSync(file, JSON.stringify(manifest));
  writeWeatherManifest(config, 'W', '1/2', CONFIG.weatherForecaster.sha256, days);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'inputs-weather-W-1of2.json'), 'utf8')).look, 1);
});

test('looks: combine actual early results with final confirmation, uncertainty, refutation and insufficiency', { skip }, () => {
  const earlyDir = makeStore(40, () => win(), { look: 1 });
  score(earlyDir);
  const continueDir = makeStore(40, () => win({ w: 700 }), { look: 2 });
  score(continueDir);
  const cases = [
    ['CONFIRMED', 'CONFIRMED', 120, () => win()],
    ['NOT CONFIRMED', 'CONFIRMED', 120, (i) => win({ s: 100, w: i % 25 < 13 ? 90 : 110, x: 100 })],
    ['REFUTED', 'CONFLICTING', 120, () => win({ w: 700 })],
    ['INSUFFICIENT', 'CONFIRMED', 39, () => win()]
  ];
  for (const [final, combined, n, spec] of cases) {
    const dir = makeStore(n, spec);
    fs.copyFileSync(path.join(earlyDir, 'results-look1.json'), path.join(dir, 'earlier-look1.json'));
    fs.copyFileSync(path.join(continueDir, 'results-look2.json'), path.join(dir, 'earlier-look2.json'));
    const { result, out } = score(dir);
    assert.equal(result['W-vs-S'].verdict, final);
    assert.equal(result['W-vs-S'].combinedResult, combined);
    assert.match(out, new RegExp(`COMBINED RESULT W-vs-S: ${combined}`));
    assert.match(out, /Combined rule: confirmation at any look gives CONFIRMED/);
    assert.match(out, /Earlier verdicts: look 1 CONFIRMED EARLY; look 2 CONTINUE/);
    if (combined === 'CONFLICTING') assert.match(out, /claim is not made/);
    assert.deepEqual(result.earlierResults.map((r) => r.look), [1, 2]);
    assert.equal(result.earlierResults[0].sha256, sha(fs.readFileSync(path.join(dir, 'earlier-look1.json'))));
    assert.equal(result['X-vs-S'].combinedResult, undefined);
    // With no early confirmation, the final verdict itself is the combined result.
    const earlier = JSON.parse(fs.readFileSync(path.join(dir, 'earlier-look1.json'), 'utf8'));
    earlier['W-vs-S'].verdict = 'CONTINUE';
    fs.writeFileSync(path.join(dir, 'earlier-look1.json'), JSON.stringify(earlier));
    assert.equal(score(dir).result['W-vs-S'].combinedResult, final);
  }
});

test('looks: final scoring requires both valid interim results before any verdict', { skip }, () => {
  const dir = makeStore(120, () => win());
  const first = path.join(dir, 'earlier-look1.json'), second = path.join(dir, 'earlier-look2.json');
  const baseline = fs.readFileSync(first);
  bad(dir, 'requires both earlier results', ['--earlier', first]);
  const none = spawnSync('python3', [path.join(EXP, 'score.py'), '--look', '3'], {
    encoding: 'utf8', env: { ...process.env, CONJ_STORE: dir, SDN_ARCHIVE_ROOT: path.join(dir, 'archive') } });
  assert.equal(none.status, 1);
  assert.match(none.stdout, /requires both earlier results/);
  assert.doesNotMatch(none.stdout, /VERDICT/);
  bad(dir, 'distinct looks', ['--earlier', first, '--earlier', first]);
  for (const [change, reason] of [
    [(j) => { j.configSha256 = '0'.repeat(64); }, 'another configuration'],
    [(j) => { j.look.number = 3; }, 'distinct looks'],
    [(j) => { j.look.seed += 1; }, 'inconsistent look metadata'],
    [(j) => { j['W-vs-S'].verdict = 'REFUTED'; }, 'valid interim verdict']
  ]) {
    const altered = JSON.parse(baseline); change(altered);
    fs.writeFileSync(first, JSON.stringify(altered));
    bad(dir, reason);
  }
  fs.writeFileSync(first, baseline);
  assert.equal(run(dir, ['--earlier', second, '--earlier', first]).status, 0, 'input order does not matter');
  fs.writeFileSync(first, 'not JSON');
  bad(dir, 'missing or unreadable');
  fs.rmSync(first);
  bad(dir, 'missing or unreadable');
  const interim = makeStore(40, () => win(), { look: 1 });
  const invalid = run(interim, ['--earlier', second]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /only allowed at look 3/);
});

test('looks: later snapshots and a later-created duplicate do not change earlier event or set output hashes', { skip }, () => {
  for (const look of CONFIG.looks.slice(0, 2)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conj-isolation-'));
    const archive = path.join(dir, 'archive'), store = path.join(dir, 'store');
    const messages = path.join(archive, 'spacetrack/cdm_public/2026');
    const sets = path.join(archive, 'spacetrack/gp_history/by-creation/2026');
    fs.mkdirSync(messages, { recursive: true }); fs.mkdirSync(sets, { recursive: true });
    const rows = [message('chosen', .25, 400, ID0, ID0 + 1), message('reference', .02, 200, ID0, ID0 + 1)];
    const snapshot = path.join(messages, `${look.runDateUtc}.json.gz`);
    fs.writeFileSync(snapshot, zlib.gzipSync(JSON.stringify(rows)));
    const base = { NORAD_CAT_ID: String(ID0), MEAN_ELEMENT_THEORY: 'SGP4', EPHEMERIS_TYPE: 0,
      GP_ID: 'original', CREATION_DATE: '2026-11-16T00:00:00', EPOCH: '2026-11-16T00:00:00',
      MEAN_MOTION: 15, ECCENTRICITY: .001, INCLINATION: 50, RA_OF_ASC_NODE: 0, ARG_OF_PERICENTER: 0,
      MEAN_ANOMALY: 0, BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0 };
    fs.writeFileSync(path.join(sets, '2026-11-16.json.gz'), zlib.gzipSync(JSON.stringify([base])));
    const laterDay = look.number === 1 ? '2026-11-25' : '2026-12-02';
    const laterMessage = path.join(messages, `${laterDay}.json.gz`), laterSet = path.join(sets, `${laterDay}.json.gz`);
    // The audit hook fails even if a builder catches an ordinary read exception.
    const audit = `import os,runpy,sys
forbidden=set(sys.argv[2:4])
def check(event,args):
 if event=='open' and isinstance(args[0],str) and args[0] in forbidden: os._exit(91)
sys.addaudithook(check)
script=sys.argv[1]; sys.path.insert(0,os.path.dirname(script)); sys.argv=[script,'--look',sys.argv[4]]; runpy.run_path(script,run_name='__main__')`;
    const execute = () => {
      for (const name of ['build-events.py', 'build-set-index.py']) {
        const run = spawnSync('python3', ['-c', audit, path.join(EXP, name), laterMessage, laterSet, String(look.number)], {
          encoding: 'utf8', env: { ...process.env, SDN_ARCHIVE_ROOT: archive, CONJ_STORE: store } });
        assert.equal(run.status, 0, run.stderr);
      }
      return Object.fromEntries(['events.json', 'sets_index.json', 'inputs-messages.json', 'inputs-sets.json'].map((name) => [name, sha(fs.readFileSync(path.join(store, name)))]));
    };
    const clean = execute();
    fs.rmSync(store, { recursive: true });
    const duplicate = { ...rows[1], CREATED: `${laterDay} 00:00:00`, MIN_RNG: '9000' };
    fs.writeFileSync(laterMessage, zlib.gzipSync(JSON.stringify([duplicate])));
    fs.writeFileSync(laterSet, zlib.gzipSync(JSON.stringify([{ ...base, GP_ID: 'future', CREATION_DATE: `${laterDay}T00:00:00` }])));
    const later = execute();
    assert.deepEqual(later, clean, 'selected data and read-input manifest hashes are identical; later files are never opened');
    const counts = JSON.parse(fs.readFileSync(path.join(store, 'sets-counts.json'), 'utf8'));
    assert.equal(counts.counts['day files outside the read range (not read)'], 1);
    // Also place the later-created copy inside the required snapshot: it is counted and filtered before deduplication.
    fs.rmSync(store, { recursive: true });
    fs.writeFileSync(snapshot, zlib.gzipSync(JSON.stringify([...rows, duplicate])));
    const filtered = execute();
    assert.equal(filtered['events.json'], clean['events.json']);
    assert.equal(filtered['sets_index.json'], clean['sets_index.json']);
    assert.notEqual(filtered['inputs-messages.json'], clean['inputs-messages.json'], 'the manifest records the changed input bytes');
    const filteredCounts = JSON.parse(fs.readFileSync(path.join(store, 'events-counts.json'), 'utf8'));
    assert.equal(filteredCounts.counts['records created at or after the creation cutoff (not used)'], 1);
  }
});
