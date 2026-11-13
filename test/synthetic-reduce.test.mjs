// Real unsigned module, committed made-up orbits, and deterministic variants described in synthetic-fixtures.mjs.
// A missing pinned build FAILS with a prerequisite message; provide SDN_AP_WASM or SDN_MODULES_ROOT.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixtures, pack, unpack } from './synthetic-fixtures.mjs';
import { frames, RecordStream } from '../experiments/synthetic-orbits/records.mjs';
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
  b.HEADER.MESSAGE_ID += '-other-build'; write(pack(a), pack(b));
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
