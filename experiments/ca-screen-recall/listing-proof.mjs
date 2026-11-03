#!/usr/bin/env node
// ca-screen-recall A2: proof by a fabricated listing that a reference event the screen drops is counted as a miss, not
// silently excluded. One object is listed `Screened until LAST_VALID` (CA 0.13.0 and later), and the screen drops its
// event before LAST_VALID. This harness's assessArm must count that event as a miss; the harness of baseline.commit,
// which read every listed object as excluded, must give the false pass, or this proof has no power.
// Also: an event after FIRST_REFUSAL and one of an object refused from the call's start leave the denominator, each
// counted by reason and listed; a listing of another call changes nothing; a COMMENT of no known form stops the run.
//   node experiments/ca-screen-recall/listing-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, a2, git, here, id, DAY_S } from './common.mjs';
import { assessArm } from './run.mjs';

const window = { startJd: config.window.startJd, durationSeconds: 172800 };
const at = (s) => window.startJd + s / DAY_S;
const utc = (s) => new Date((at(s) - 2440587.5) * DAY_S * 1000).toISOString();
const REFUSAL = 'SGP4: decayed (the radius is below one Earth radius)';
const partWay = (lastS) => `Screened until LAST_VALID; SGP4 refuses it from FIRST_REFUSAL. LAST_VALID=${utc(lastS)}; FIRST_REFUSAL=${utc(lastS + 0.002)}; REFUSAL=${REFUSAL}`;
const fromStart = (s) => `Excluded from conjunction screening; SGP4 refuses it from the window start. LAST_VALID=NONE; FIRST_REFUSAL=${utc(s)}; REFUSAL=${REFUSAL}`;
const event = (a, b, s, missM) => ({ primary: a, secondary: b, tcaJd: at(s), missM, relSpeedMS: 7000, pcMax: null, combinedRadiusM: 10, primaryState: null, secondaryState: null });

// Below 1 km, so each one bears on the pass rule's band. Objects are invented numbers; no element set is read.
const CONTROL = { a: 10, b: 11, tcaJd: at(1000), missM: 500 };                  // found by the screen
const DROPPED = { a: 20, b: 21, tcaJd: at(2000), missM: 600 };                  // object 20 is screened until 40,000 s, and the screen drops this
const AFTER_REFUSAL = { a: 20, b: 22, tcaJd: at(50000), missM: 700 };           // after object 20's refusal
const FROM_START = { a: 30, b: 31, tcaJd: at(3000), missM: 800 };               // object 30 refused from the call's start
const OTHER_CALL = { a: 40, b: 41, tcaJd: at(4000), missM: 900 };               // object 40 refused only in the next call, and the screen drops this
const reference = [CONTROL, DROPPED, AFTER_REFUSAL, FROM_START, OTHER_CALL];
const listed = (norad, comment, windowStartS = 0, windowSeconds = 86400) => ({ norad, comment, windowStartJd: at(windowStartS), windowSeconds });
const answer = {
  events: [event(10, 11, 1000, 500)],
  listings: [listed(20, partWay(40000)), listed(30, fromStart(0)), listed(40, fromStart(86400), 86400)],
  statistics: {}, elapsedMs: 0, chunks: 1, combinedRadiusM: 10,
};
const arm = { id: config.pass.arm, thresholdM: 5000 };
const screenModule = { alfano: async () => 0 };

const now = await assessArm({ arm, answer, reference, window, screenModule, sgp4: null, withParity: false });
assert.equal(now.gate.reference, 3, 'the dropped event and the other call\'s event stay in the denominator');
assert.equal(now.gate.found, 1);
assert.equal(now.gate.status, 'fail', 'a dropped reference event must fail the pass rule');
assert.deepEqual(now.misses.map((m) => m.pair).sort(), [[20, 21], [40, 41]], 'each dropped event is a miss, filed with its pair');
assert.equal(now.exclusions.events, 2, 'only the events the listings say were not screened leave the denominator');
assert.deepEqual(now.exclusions.rows.map((r) => r.pair).sort(), [[20, 22], [30, 31]]);
assert.deepEqual(now.exclusions.byReason, { [`refused-part-way: ${REFUSAL}`]: 1, [`refused-from-start: ${REFUSAL}`]: 1 });
await assert.rejects(assessArm({ arm, answer: { ...answer, listings: [listed(20, 'Excluded from conjunction screening: SGP4 cannot propagate this object.')] }, reference, window, screenModule, sgp4: null, withParity: false }),
  /no known form/, 'a COMMENT of no known form must stop the run');

// The same answer through the harness of baseline.commit: its assessArm as committed, with every listed number in `excluded`.
const old = git('show', `${a2.baseline.commit}:experiments/${id}/run.mjs`).toString();
const from = old.indexOf('async function assessArm('), to = old.indexOf('export async function execute(');
assert.ok(from > 0 && to > from, 'the baseline harness holds assessArm');
const file = path.join(here, `.listing-proof-baseline-${process.pid}.mjs`);
fs.writeFileSync(file, `import { config, DAY_S } from './common.mjs';
import { matchEvents, bandOf, placeInWindow, distribution, lowerBound, screenPair } from './compare.mjs';
const BANDS = ['below 1 km', '1 to 5 km'];
const iso = (jd) => new Date((jd - 2440587.5) * DAY_S * 1000).toISOString();
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
export ${old.slice(from, to)}`);
let before;
try {
  const { assessArm: baseline } = await import(pathToFileURL(file).href);
  before = await baseline({ arm, answer: { ...answer, excluded: [...new Set(answer.listings.map((l) => l.norad))] }, reference, window, screenModule, sgp4: null, withParity: false });
} finally { fs.rmSync(file, { force: true }); }
assert.equal(before.gate.reference, 1, 'the baseline harness drops every event of a listed object');
assert.equal(before.gate.found, 1);
assert.equal(before.gate.status, 'pass', 'the baseline harness gives the false pass this amendment removes');
assert.equal(before.misses.length, 0);

const summary = {
  fabricated: { referenceEventsBelow1Km: reference.length, droppedByTheScreenWhileScreened: 2, afterRefusal: 1, refusedFromCallStart: 1 },
  baselineHarness: { commit: a2.baseline.commit, reference: before.gate.reference, found: before.gate.found, status: before.gate.status, misses: 0 },
  thisHarness: { reference: now.gate.reference, found: now.gate.found, status: now.gate.status, misses: now.misses.length, excludedByReason: now.exclusions.byReason },
};
console.log(JSON.stringify(summary));
process.exit(0);
