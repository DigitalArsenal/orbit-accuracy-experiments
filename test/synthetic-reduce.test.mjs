// End-to-end check of the synthetic reducer (experiments/synthetic-orbits/reduce.mjs) on four made-up cases whose truth flight ($OEM) and fitted
// record ($OCM) are committed under test/fixtures/synthetic-reduce/ as two [4-byte size][FlatBuffer] streams: the reducer reads only those two
// streams and a named sdn-ap build, pairs each record with its truth flight from the fit statistics the record states, flies the record on the
// truth's epochs and differences. The largest distance of each case, flown on sdn-ap 0.6.57 (wasm 652fa229c89a, the unsigned build), is
// the figure the case had when it was fitted on the 0.6.54 build: the two builds give the record the same states to the bit.
// Skipped, by name, when that build is not on this machine (SDN_AP_WASM, or the dist of a modules checkout at SDN_MODULES_ROOT).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../harness/provenance.mjs';

const WASM_SHA = '652fa229c89a565d688e6cf2384a38fb9cc9aa12e5f8178900bda5bf189b797c';
const candidates = [process.env.SDN_AP_WASM, process.env.SDN_MODULES_ROOT && path.join(process.env.SDN_MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm')].filter(Boolean);
const wasm = candidates.find((f) => fs.existsSync(f) && crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === WASM_SHA);
const FIX = path.join(repoRoot, 'test/fixtures/synthetic-reduce');

test('four fitted records and their truth flights: the counts come out of the two streams and the module', { skip: wasm ? false : `sdn-ap 0.6.57 (${WASM_SHA.slice(0, 12)}) is not on this machine (SDN_AP_WASM)` }, () => {
  const out = JSON.parse(execFileSync(process.execPath, [path.join(repoRoot, 'experiments/synthetic-orbits/reduce.mjs'), '--truth', path.join(FIX, 'truth-oem.fsdata'), '--records', path.join(FIX, 'records.fsdata'), '--wasm', wasm, '--sha256', WASM_SHA], { encoding: 'utf8', env: { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1' }, maxBuffer: 1 << 24 }));
  assert.equal(out.inputs.truthFlights, 4); assert.equal(out.inputs.records, 4);
  assert.equal(out.counts.withApResult, 4);
  assert.equal(out.counts.recordsWithNoTruthFlight, 0); assert.equal(out.counts.recordsWithAmbiguousTruth, 0);
  assert.deepEqual(out.cases.map((c) => c.D).sort((a, b) => a - b), [2.9, 6.6, 47.8, 56.1]);
  assert.equal(out.counts.within100m, 4); assert.equal(out.counts.within200m, 4); assert.equal(out.counts.within500m, 4);
  assert.deepEqual(out.counts.outsideByGroup, {}); assert.equal(out.counts.outsideByGroupSum, 0);
  assert.ok(out.cases.every((c) => c.spanH === 120));
  assert.ok(Array.isArray(out.missing) && out.missing.length > 0, 'the reduction says what the standard records do not carry');
});

test('a build that is not the named one is refused', { skip: wasm ? false : 'the named build is not on this machine' }, () => {
  assert.throws(() => execFileSync(process.execPath, [path.join(repoRoot, 'experiments/synthetic-orbits/reduce.mjs'), '--truth', path.join(FIX, 'truth-oem.fsdata'), '--records', path.join(FIX, 'records.fsdata'), '--wasm', wasm, '--sha256', '0'.repeat(64)], { stdio: 'ignore', env: { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1' } }));
});
