// E15 (experiments/e15-aoe-lineage): the test window stays locked before the planned read, and AOE's two-line element sets
// decode to the OMM fields of the published two-line element set example (the ISS set of 2008-09-20 printed in the TLE
// format's documentation, whose OMM form is in CelesTrak's GP format documentation).
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMetricsReadable, config } from '../experiments/e15-aoe-lineage/lib/windows.mjs';
import { readRows } from '../experiments/e15-aoe-lineage/lib/rows.mjs';
import { decodeTle } from '../experiments/e15-aoe-lineage/lib/aoe.mjs';

test('the E15 test window is refused before the planned read', () => {
  assert.throws(() => assertMetricsReadable('test'), /planned read/);
  assert.throws(() => readRows('test'), /planned read/);
  assert.throws(() => assertMetricsReadable('test', { plannedRead: true, now: Date.parse(config.testRead.notBeforeUtc) - 1 }), /locked until/);
  assert.doesNotThrow(() => assertMetricsReadable('train'));
});

test('a two-line element set decodes to its OMM fields', () => {
  const d = decodeTle('1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927', '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537');
  assert.equal(d.norad, '25544');
  assert.equal(new Date(d.epochMs).toISOString(), '2008-09-20T12:25:40.104Z');
  assert.deepEqual(d.elements, { MEAN_MOTION: 15.72125391, ECCENTRICITY: 0.0006703, INCLINATION: 51.6416, RA_OF_ASC_NODE: 247.4627, ARG_OF_PERICENTER: 130.536, MEAN_ANOMALY: 325.0288, BSTAR: -0.11606e-4 });
  assert.equal(d.checksums, true);
});
