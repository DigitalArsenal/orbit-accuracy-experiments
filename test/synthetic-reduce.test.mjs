// Real unsigned module, committed made-up orbits, and deterministic variants described in synthetic-fixtures.mjs.
// A missing pinned build FAILS with a prerequisite message; provide SDN_AP_WASM or SDN_MODULES_ROOT.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixtures, pack, unpack } from './synthetic-fixtures.mjs';
import { frames, RecordStream, StreamReplacement } from '../experiments/synthetic-orbits/records.mjs';
import { FrameIndex } from '../experiments/synthetic-orbits/identity.mjs';
import * as S from '../experiments/synthetic-orbits/bindings.mjs';
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const WASM_SHAS = ['652fa229c89a565d688e6cf2384a38fb9cc9aa12e5f8178900bda5bf189b797c', 'a6095d2c66356bc9eb8b3e928e9e6a2ae102b34f64abe1cf65d2ac9394c8ee7a'];
const candidates = [process.env.SDN_AP_WASM, process.env.SDN_MODULES_ROOT && path.join(process.env.SDN_MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm')].filter(Boolean);
const found = candidates.filter((f) => fs.existsSync(f)).map((f) => ({ f, sha: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') })).find((x) => WASM_SHAS.includes(x.sha));
assert.ok(found, 'Provide SDN_AP_WASM pointing to unsigned sdn-ap 0.6.57 (652fa229c89a) or 0.6.58 (a6095d2c6635); install locked dependencies before running this test.');
const FIX = path.join(repoRoot, 'test/fixtures/synthetic-reduce');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-reduce-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
makeFixtures(FIX, dir);
const reduce = (extra = [], input = dir) => spawnSync(process.execPath, [path.join(repoRoot, 'experiments/synthetic-orbits/reduce.mjs'), ...extra,
  '--truth', path.join(input, 'truth-ocm.fsdata'), '--seeds', path.join(input, 'seed-ocm.fsdata'), '--records', path.join(input, 'records.fsdata'),
  '--wasm', found.f], { encoding: 'utf8', env: { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1' }, maxBuffer: 1 << 24 });
const expected = JSON.parse(fs.readFileSync(path.join(FIX, 'expected.json'), 'utf8'));
const table = (o) => ({ counts: o.counts, cases: o.cases, missing: o.missing });

test('complete table includes every scored and unscored class; compare checks all fields', () => {
  const run = reduce(['--sha256', found.sha, '--compare', path.join(FIX, 'expected.json')]);
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.deepEqual(table(out), expected); assert.equal(out.comparison.equal, true);
  assert.equal(Object.values(out.counts.classes).reduce((a,b) => a+b), out.counts.recordsRead);
  assert.equal(out.cases.find((r) => r.caseId === 'fixture-refused').status, 'invalid-ocm');
  for (const mutate of [t => { t.counts.outsideByGroup.circHigh++; }, t => { t.cases[0].D++; }, t => { t.counts.classes['no-truth']++; }]) {
    const changed = structuredClone(expected); mutate(changed);
    const file = path.join(dir, 'wrong.json'); fs.writeFileSync(file, JSON.stringify(changed));
    const bad = reduce(['--compare', file]); assert.equal(bad.status, 1, bad.stderr); assert.equal(JSON.parse(bad.stdout).comparison.equal, false);
  }
});

test('each requested nonempty class produces failure status', () => {
  for (const c of Object.keys(expected.counts.classes)) {
    const run = reduce(['--fail-on', c]); assert.equal(run.status, 1, run.stderr); assert.deepEqual(table(JSON.parse(run.stdout)), expected);
  }
  const run = reduce(['--fail-on', 'misspelled']); assert.notEqual(run.status, 0); assert.match(run.stderr, /unknown --fail-on class/);
});

test('duplicate identity and repeated case/technique are refused; newest selects by creation time', () => {
  const file = path.join(dir, 'duplicates.fsdata'), first = [...frames(path.join(FIX, 'records.fsdata'))][0].bytes;
  const write = (a, b) => { fs.writeFileSync(file, ''); const st = new RecordStream(file); st.append(a); st.append(b); };
  write(first, first);
  let run = reduce(['--records', file], FIX); assert.notEqual(run.status, 0); assert.match(run.stderr, /duplicate record identity:/);
  const a = unpack(first), b = unpack(first); a.HEADER.CREATION_DATE = '2026-01-01T00:00:00'; b.HEADER.CREATION_DATE = '2026-01-02T00:00:00';
  write(pack(a), pack(b)); run = reduce(['--records', file, '--newest'], FIX);
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).counts.supersededRecords, 1);
  const idx = new FrameIndex(S.OCM, S.flatbuffers, file, { newest: true });
  assert.equal(idx.lookup(a.HEADER.MESSAGE_ID).sha256, crypto.createHash('sha256').update(pack(b)).digest('hex'));
  b.HEADER.MESSAGE_ID = b.HEADER.MESSAGE_ID.replace(/:[0-9a-f]{12}/, ':000000000000'); write(pack(a), pack(b));
  run = reduce(['--records', file], FIX); assert.notEqual(run.status, 0); assert.match(run.stderr, /duplicate record identity:/);
  run = reduce(['--records', file, '--newest'], FIX); assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).counts.selectedRecords, 1);
  write(first, first); run = reduce(['--records', file, '--newest'], FIX); assert.notEqual(run.status, 0); assert.match(run.stderr, /missing or tied creation time/);
  assert.throws(() => new FrameIndex(S.OCM, S.flatbuffers, file).scan(), /duplicate record identity:/);
});

test('identity fields are required and module hash refusal is specific', () => {
  const o = unpack([...frames(path.join(FIX, 'records.fsdata'))][0].bytes); o.METADATA.CATALOG_NAME = null;
  const file = path.join(dir, 'unnamed.fsdata'); new RecordStream(file).append(pack(o));
  let run = reduce(['--records', file]); assert.notEqual(run.status, 0); assert.match(run.stderr, /record lacks study identity/);
  run = reduce(['--sha256', '0'.repeat(64)]); assert.notEqual(run.status, 0); assert.match(run.stderr, /the module is .* not 000000/);
});

test('reissue verifies complete streams, refuses input aliases and repeated truth identities', () => {
  const local = path.join(dir, 'reissue'); fs.mkdirSync(local);
  for (const n of ['records.fsdata', 'truth-ocm.fsdata']) fs.copyFileSync(path.join(FIX, n), path.join(local, n));
  const source = path.join(local, 'records.fsdata'), truth = path.join(local, 'truth-ocm.fsdata'), output = path.join(local, 'out.fsdata');
  const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const rows = [...frames(source)].map((fr) => { const o = unpack(fr.bytes); return { id: o.METADATA.OBJECT_NAME,
    ap: { record: { file: 'records.fsdata', offset: fr.offset, size: fr.size, sha256: hash(fr.bytes).slice(0, 16) } }, truth: { hash: o.PROVENANCE.SOURCE_ID } }; });
  fs.writeFileSync(path.join(local, 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
  const run = (out) => spawnSync(process.execPath, [path.join(repoRoot, 'experiments/synthetic-orbits/reissue-records.mjs'), local,
    '--truth', truth, '--wasm', found.f, '--out', out], { encoding: 'utf8', env: { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1' } });
  const good = run(output); assert.equal(good.status, 0, good.stderr);
  const tally = JSON.parse(good.stdout); assert.equal(tally.records, 4); assert.equal(tally.flownEqual, 4); assert.equal(tally.otherFieldsEqual, 4); assert.equal(tally.problems, 0);
  const original = hash(fs.readFileSync(source)); const alias = run(source);
  assert.notEqual(alias.status, 0); assert.match(alias.stderr, /output equals input/); assert.equal(hash(fs.readFileSync(source)), original);
  const preserved = hash(fs.readFileSync(output)); new RecordStream(truth).append([...frames(truth)][0].bytes);
  const duplicate = run(output); assert.notEqual(duplicate.status, 0); assert.match(duplicate.stderr, /duplicate record identity:/); assert.equal(hash(fs.readFileSync(output)), preserved);
});


test('concurrent ensure appends each identity exactly once', async () => {
  const target = path.join(dir, 'concurrent.fsdata');
  const code = `
    import { FrameIndex } from './experiments/synthetic-orbits/identity.mjs';
    import { frames } from './experiments/synthetic-orbits/records.mjs';
    import * as S from './experiments/synthetic-orbits/bindings.mjs';
    const idx = new FrameIndex(S.OCM, S.flatbuffers, process.argv[1]);
    const records = [...frames(process.argv[2])];
    for (let round = 0; round < 20; round++) for (const {bytes} of records) {
      const id = S.OCM.OCM.getRootAsOCM(new S.flatbuffers.ByteBuffer(bytes)).HEADER().MESSAGE_ID();
      idx.ensure(id, () => bytes);
    }
  `;
  await Promise.all(Array.from({length: 4}, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, target, path.join(FIX, 'truth-ocm.fsdata')], {cwd: repoRoot});
    let stderr = ''; child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr)));
  })));
  const idx = new FrameIndex(S.OCM, S.flatbuffers, target); idx.scan();
  assert.equal(idx.map.size, 4); assert.equal([...frames(target)].length, 4);
});


test('a failed truth write is retried and completes its stream', () => {
  const target = path.join(dir, 'retry.fsdata'), rowFile = path.join(dir, 'retry-row.json');
  const code = `
    import fs from 'node:fs';
    import { FrameIndex } from './experiments/synthetic-orbits/identity.mjs';
    import { frames, streamWrite, hasPersistedTruth } from './experiments/synthetic-orbits/records.mjs';
    import * as S from './experiments/synthetic-orbits/bindings.mjs';
    const [target, rowFile, source] = process.argv.slice(1);
    const bytes = [...frames(source)][0].bytes;
    const id = S.OCM.OCM.getRootAsOCM(new S.flatbuffers.ByteBuffer(bytes)).HEADER().MESSAGE_ID();
    let row = fs.existsSync(rowFile) ? JSON.parse(fs.readFileSync(rowFile)) : {};
    if (!hasPersistedTruth(row)) {
      row = {truth: {hash: id}};
      try { streamWrite('truth', () => new FrameIndex(S.OCM, S.flatbuffers, target).ensure(id, () => bytes)); }
      catch (e) { row.error = e.message; row.streamWriteFailure = e.outcome; process.exitCode = 2; }
      fs.writeFileSync(rowFile, JSON.stringify(row));
    }
  `;
  const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', code, target, rowFile, path.join(FIX, 'truth-ocm.fsdata')], {cwd: repoRoot, encoding: 'utf8'});
  fs.mkdirSync(target); // A directory in place of the stream injects a real filesystem write failure.
  const failed = run(); assert.equal(failed.status, 2, failed.stderr);
  assert.equal(JSON.parse(fs.readFileSync(rowFile)).streamWriteFailure.name, 'stream-write-failed');
  fs.rmdirSync(target);
  const retried = run(); assert.equal(retried.status, 0, retried.stderr);
  assert.equal([...frames(target)].length, 1); assert.equal(JSON.parse(fs.readFileSync(rowFile)).error, undefined);
});


test('temporary streams are cleaned on controlled exits and leftovers are reported', async () => {
  const target = path.join(dir, 'cleanup.fsdata'), leftover = `${target}.123.abcdef.tmp`;
  fs.writeFileSync(leftover, 'preexisting');
  for (const mode of ['refuse', 'throw', 'SIGINT', 'SIGTERM']) {
    const code = `
      import { StreamReplacement } from './experiments/synthetic-orbits/records.mjs';
      new StreamReplacement(process.argv[1]);
      if (process.argv[2] === 'refuse') process.exit(1);
      if (process.argv[2] === 'throw') throw new Error('injected exception');
      console.log('ready'); setInterval(() => {}, 1000);
    `;
    let stderr = '';
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code, target, mode], {cwd: repoRoot});
      child.stderr.on('data', b => { stderr += b; });
      child.stdout.once('data', () => child.kill(mode));
      child.on('error', reject); child.on('exit', code => { assert.notEqual(code, 0); resolve(); });
    });
    assert.match(stderr, /leftover temporary stream:/);
    assert.deepEqual(fs.readdirSync(dir).filter(n => n.startsWith('cleanup.fsdata.')), [path.basename(leftover)]);
    assert.equal(fs.readFileSync(leftover, 'utf8'), 'preexisting');
  }
});


test('empty replacement preserves a nonempty stream unless explicitly allowed', () => {
  const target = path.join(dir, 'empty.fsdata');
  fs.copyFileSync(path.join(FIX, 'records.fsdata'), target);
  const before = fs.readFileSync(target);
  const empty = new StreamReplacement(target);
  assert.throws(() => empty.verify(() => null), /requires --allow-empty/);
  assert.deepEqual(fs.readFileSync(target), before);
  const allowed = new StreamReplacement(target, [], {allowEmpty: true});
  allowed.verify(() => null); allowed.publish(); assert.equal(fs.statSync(target).size, 0);
});


test('both replacements verify before publication and mismatched pairs name the cause', () => {
  const targets = ['pair-seeds.fsdata', 'pair-truth.fsdata'].map(n => path.join(dir, n));
  for (const target of targets) fs.copyFileSync(path.join(FIX, 'records.fsdata'), target);
  const before = targets.map(f => fs.readFileSync(f));
  const a = new StreamReplacement(targets[0]), b = new StreamReplacement(targets[1]);
  const bytes = [...frames(path.join(FIX, 'records.fsdata'))][0].bytes;
  a.append(bytes, 'a'); b.append(bytes, 'b');
  a.verify(() => 'a'); assert.throws(() => b.verify(() => 'wrong'), /identity or bytes differ/);
  targets.forEach((f, i) => assert.deepEqual(fs.readFileSync(f), before[i]));
  const run = reduce(); assert.equal(run.status, 0, run.stderr);
  assert.match(JSON.parse(run.stdout).cases.find(r => r.caseId === 'fixture-no-seed').reason, /mismatched seed\/truth pair.*separate renames/);
});


test('two fit ways of the same case and theory survive together', () => {
  const a = unpack([...frames(path.join(FIX, 'records.fsdata'))][0].bytes);
  // Keep FlatBuffer object prototypes while changing only the fit suffix of the second record.
  const second = unpack(pack(a));
  second.HEADER.MESSAGE_ID = a.HEADER.MESSAGE_ID.replace('-fit-forecast-span-ts72', '-fit-cutoff72');
  assert.notEqual(second.HEADER.MESSAGE_ID, a.HEADER.MESSAGE_ID);
  const file = path.join(dir, 'two-ways.fsdata'), stream = new RecordStream(file);
  stream.append(pack(a)); stream.append(pack(second));
  for (const flags of [[], ['--newest']]) {
    const run = reduce(['--records', file, ...flags], FIX); assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.counts.selectedRecords, 2); assert.equal(out.counts.supersededRecords, 0);
    assert.equal(out.counts.classes['within-bar'], 2); assert.equal(out.cases[0].D, out.cases[1].D);
  }
});
