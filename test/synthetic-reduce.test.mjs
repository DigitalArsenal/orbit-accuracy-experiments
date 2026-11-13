// End-to-end check of the synthetic reducer (experiments/synthetic-orbits/reduce.mjs) on four made-up cases whose fitted record, truth flight and seed (each an $OCM)
// are committed under test/fixtures/synthetic-reduce/ as three [4-byte size][FlatBuffer] streams: the reducer reads only those streams and a named sdn-ap build, takes each
// record's truth flight from the record's PROVENANCE (SOURCE_ID, SOURCE_SHA256, SOURCE_BYTES), each case's group from the seed its flight started from, flies the record on the
// truth's epochs and differences. The largest distance of each case, flown on sdn-ap 0.6.57 (wasm 652fa229c89a) or 0.6.58 (a6095d2c6635), the unsigned builds, is the figure the
// case had when it was fitted on the 0.6.54 build: the builds give the record the same states to the bit.
// Skipped, by name, when neither build is on this machine (SDN_AP_WASM, or the dist of a modules checkout at SDN_MODULES_ROOT).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../harness/provenance.mjs';

const WASM_SHAS = ['652fa229c89a565d688e6cf2384a38fb9cc9aa12e5f8178900bda5bf189b797c', 'a6095d2c66356bc9eb8b3e928e9e6a2ae102b34f64abe1cf65d2ac9394c8ee7a'];
const candidates = [process.env.SDN_AP_WASM, process.env.SDN_MODULES_ROOT && path.join(process.env.SDN_MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm')].filter(Boolean);
const found = candidates.filter((f) => fs.existsSync(f)).map((f) => ({ f, sha: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') })).find((x) => WASM_SHAS.includes(x.sha));
const FIX = path.join(repoRoot, 'test/fixtures/synthetic-reduce');
const reduce = (extra) => execFileSync(process.execPath, [path.join(repoRoot, 'experiments/synthetic-orbits/reduce.mjs'), '--truth', path.join(FIX, 'truth-ocm.fsdata'), '--seeds', path.join(FIX, 'seed-ocm.fsdata'), '--records', path.join(FIX, 'records.fsdata'), '--wasm', found.f, ...extra], { encoding: 'utf8', env: { ...process.env, SDM_MODULE_UNSIGNED_BUILD: '1' }, maxBuffer: 1 << 24 });

test('four fitted records, their truth flights and seeds: the counts come out of the three streams and the module', { skip: found ? false : 'sdn-ap 0.6.57 (652fa229c89a) or 0.6.58 (a6095d2c6635) is not on this machine (SDN_AP_WASM)' }, () => {
  const out = JSON.parse(reduce(['--sha256', found.sha]));
  assert.equal(out.inputs.truthFlights, 4); assert.equal(out.inputs.records, 4); assert.equal(out.inputs.seeds, 4);
  assert.equal(out.counts.withApResult, 4);
  assert.equal(out.counts.recordsWithNoTruthFlight, 0); assert.equal(out.counts.recordsWithNoSeed, 0);
  assert.deepEqual(out.cases.map((c) => c.D).sort((a, b) => a - b), [2.9, 6.6, 47.8, 56.1]);
  assert.equal(out.counts.within100m, 4); assert.equal(out.counts.within200m, 4); assert.equal(out.counts.within500m, 4);
  assert.deepEqual(out.counts.outsideByGroup, {}); assert.equal(out.counts.outsideByGroupSum, 0);
  assert.ok(out.cases.every((c) => c.spanH === 120));
  // the group is the seed's: the nominal perigee of each grid case, whole km
  assert.deepEqual(out.cases.map((c) => c.perigeeKm).sort((a, b) => a - b), [500, 800, 20200, 35786]);
  assert.ok(Array.isArray(out.missing) && out.missing.length > 0, 'the reduction says what the standard records do not carry');
});

test('a build that is not the named one is refused', { skip: found ? false : 'the named build is not on this machine' }, () => {
  assert.throws(() => reduce(['--sha256', '0'.repeat(64)]));
});
