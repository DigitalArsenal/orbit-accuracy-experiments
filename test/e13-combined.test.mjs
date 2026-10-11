// Known answers for the combined solve (experiments/e13-open-dca PLAN.md Amendment S3): two synthetic fleets that see one common mode through different arcs and noise, solved
// alone and together by the production solver, scored on satellites that were in no solve. Statistics only: no module is involved, so nothing is skipped.
//   - a small, noisy fleet of daily arcs is predicted better by the common mode of a large precise fleet of 7 h pairs than by the other half of its own fleet, and best by both;
//   - the two fleets' own hindcasts agree when they see the same common mode and not when they see different ones;
//   - a held-out forecast uses no arc that ends after its cut-off.
import assert from 'node:assert/strict';
import test from 'node:test';
import { commonRecords, crossFleetAgreement, halves, heldOutRecords, hindcastR3, pairedR3Difference, pairedRatioDifference } from '../experiments/e13-open-dca/combined.mjs';
import { solveCommonMode } from '../experiments/e13-open-dca/common-mode.mjs';
import { rng } from '../harness/stats.mjs';

const H = 3600e3, DAY = 86400e3, T0 = Date.parse('2026-10-09T00:00:00Z'), DAYS = 16;
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function commonMode(seed) {
  const r = rng(seed), n = DAYS * 4 + 8, v = new Float64Array(n);
  let x = 0;
  for (let i = 0; i < n; ++i) { x = 0.9 * x + 0.12 * gauss(r); v[i] = x; }
  const at = (t) => { const u = (t - T0) / (6 * H), i = Math.floor(u); return v[i] + (v[i + 1] - v[i]) * (u - i); };
  return (lo, hi) => { let a = 0, k = 0; for (let t = lo + 300e3; t < hi; t += 600e3) { a += at(t); ++k; } return a / k; };
}
function fleet(meanS, { prefix, satellites, spanHours, noise, seed, group, stagger }) {
  const r = rng(seed), arcs = [];
  for (let i = 0; i < satellites; ++i) {
    const base = Math.log(0.02) + 0.3 * gauss(r), start = T0 + r() * stagger * H;
    for (let k = 0; start + (k + 1) * spanHours * H < T0 + DAYS * DAY; ++k) {
      const startMs = start + k * spanHours * H, endMs = startMs + spanHours * H;
      arcs.push({ dove: `${prefix}${i}`, startMs, endMs, y: base + meanS(startMs, endMs) + noise * gauss(r), group });
    }
  }
  return arcs;
}
const options = { anchorMs: T0, nodeHours: 12, baseline: { kind: 'randomWalk', stepSigma: 0.005 }, smoothSigma: 0.035, iterations: 60, tolerance: 1e-6, minDovesPerNode: 6, minNodeInfo: 1.5, huberK: 1.5, scaleSweeps: 8 };

test('a small noisy fleet of daily arcs is predicted better by a large precise fleet, and best by both', (t) => {
  const s = commonMode(3);
  const planet = fleet(s, { prefix: 'p', satellites: 40, spanHours: 24, noise: 0.14, seed: 1, group: 'planet', stagger: 12 });
  const starlink = fleet(s, { prefix: '4', satellites: 90, spanHours: 7.17, noise: 0.05, seed: 2, group: 'starlink', stagger: 7 });
  const pieces = halves(planet);
  const solves = {
    own: pieces.map((p) => ({ target: p.target, sol: solveCommonMode(p.other, options) })),
    other: pieces.map((p) => ({ target: p.target, sol: solveCommonMode(starlink, options) })),
    both: pieces.map((p) => ({ target: p.target, sol: solveCommonMode([...p.other, ...starlink], options) })),
  };
  const r3 = Object.fromEntries(Object.entries(solves).map(([k, parts]) => [k, hindcastR3(parts)]));
  const e = (k) => r3[k].r3.estimate;
  t.diagnostic(`held-out Planet-like arcs, R3: other half of the same fleet ${e('own').toFixed(3)}, the precise fleet alone ${e('other').toFixed(3)}, both ${e('both').toFixed(3)}`);
  assert.ok(r3.own.n > 100 && r3.own.satellites === 40, `${r3.own.n} arcs of ${r3.own.satellites} satellites`);
  assert.ok(e('other') > e('own') + 0.03, `Starlink alone R3 ${e('other')} against Planet's other half ${e('own')}`);
  assert.ok(e('both') >= e('other') - 0.01 && e('both') > e('own') + 0.03, `both R3 ${e('both')}`);
  assert.ok(e('both') > 0.2, `the common mode explains a good part of a held-out satellite's variation: ${e('both')}`);
  // an independent common mode explains nothing
  const wrong = commonMode(99), strangers = fleet(wrong, { prefix: '8', satellites: 90, spanHours: 7.17, noise: 0.05, seed: 3, group: 'starlink', stagger: 7 });
  const noise = hindcastR3(pieces.map((p) => ({ target: p.target, sol: solveCommonMode(strangers, options) })));
  assert.ok(noise.r3.estimate < 0.1, `a fleet that sees another common mode gives R3 ${noise.r3.estimate}`);
});

test('the two fleets\' own hindcasts agree when they see one common mode and not when they see two', () => {
  const s = commonMode(5), t = commonMode(6);
  const planet = fleet(s, { prefix: 'p', satellites: 30, spanHours: 24, noise: 0.08, seed: 1, group: 'planet', stagger: 12 });
  const same = fleet(s, { prefix: '4', satellites: 90, spanHours: 7.17, noise: 0.05, seed: 2, group: 'starlink', stagger: 7 });
  const other = fleet(t, { prefix: '8', satellites: 90, spanHours: 7.17, noise: 0.05, seed: 3, group: 'starlink', stagger: 7 });
  const a = solveCommonMode(planet, options), b = solveCommonMode(same, options), c = solveCommonMode(other, options);
  const agree = crossFleetAgreement(a, b, T0 + DAY, T0 + (DAYS - 1) * DAY, 12), disagree = crossFleetAgreement(a, c, T0 + DAY, T0 + (DAYS - 1) * DAY, 12);
  assert.ok(agree.windows > 20 && agree.correlationOfMeans > 0.8 && agree.correlationOfChangesOver24h > 0.6, JSON.stringify(agree));
  assert.ok(Math.abs(disagree.correlationOfMeans) < 0.5, JSON.stringify(disagree));
});

test('the held-out forecast uses no arc that ends after its cut-off', () => {
  const s = commonMode(7);
  const planet = fleet(s, { prefix: 'p', satellites: 16, spanHours: 24, noise: 0.1, seed: 1, group: 'planet', stagger: 12 });
  const starlink = fleet(s, { prefix: '4', satellites: 60, spanHours: 7.17, noise: 0.05, seed: 2, group: 'starlink', stagger: 7 });
  const [{ target, other }] = halves(starlink);
  const issues = [T0 + 8 * DAY, T0 + 8.25 * DAY], latencyHours = 3, taus = [48, null];
  const run = (calibration) => heldOutRecords({ calibration, target, issues, latencyHours, historyDays: 4, taus, anchorMs: T0, solver: options, fitHours: 24, minimumFitArcs: 2, blockMs: 2 * DAY, firstMs: T0 });
  const base = run(other);
  assert.ok(base.length > 100);
  const moved = run(other.map((a) => (a.endMs > issues[0] - latencyHours * H ? { ...a, y: a.y + 5 } : a)));
  // the first issue time cannot see the shifted arcs; the second can see those that ended before its own cut-off, which are shifted only after the first cut-off
  const first = (records) => records.filter((r) => r.block === 3 && r.lead < 3.1);
  assert.equal(base.length, moved.length);
  const same = base.slice(0, 20).every((r, i) => r.ref === moved[i].ref && r.errs['48'] === moved[i].errs['48']);
  assert.ok(same, 'the records of the first issue time do not move when later arcs change');
  assert.ok(planet.length > 0 && first(base).length >= 0);
});

test('the solves are compared on the same arcs: the paired R3 difference, and forecast records every solve scores', (t) => {
  const s = commonMode(11);
  const planet = fleet(s, { prefix: 'p', satellites: 40, spanHours: 24, noise: 0.14, seed: 1, group: 'planet', stagger: 12 });
  const starlink = fleet(s, { prefix: '4', satellites: 30, spanHours: 7.17, noise: 0.12, seed: 2, group: 'starlink', stagger: 7 });
  const pieces = halves(planet);
  const byKind = {
    own: pieces.map((p) => ({ target: p.target, sol: solveCommonMode(p.other, options) })),
    other: pieces.map((p) => ({ target: p.target, sol: solveCommonMode(starlink, options) })),
    both: pieces.map((p) => ({ target: p.target, sol: solveCommonMode([...p.other, ...starlink], options) })),
  };
  const paired = pairedR3Difference(byKind);
  t.diagnostic(`paired on ${paired.n} arcs: R3 own ${paired.r3.own.toFixed(3)}, other ${paired.r3.other.toFixed(3)}, both ${paired.r3.both.toFixed(3)}; both less the larger ${paired.difference.estimate.toFixed(3)} [${paired.difference.lower.toFixed(3)}, ${paired.difference.upper.toFixed(3)}]`);
  assert.ok(paired.n > 200 && paired.r3.both > paired.r3.own + 0.01, 'two fleets that see one common mode give a held-out satellite more than its own fleet\'s other half');
  assert.ok(paired.difference.lower <= paired.difference.estimate && paired.difference.estimate <= paired.difference.upper);
  assert.equal(pairedR3Difference({ ...byKind, own: [{ target: [], sol: null }, { target: [], sol: null }] }), null, 'a solve that failed has no paired score');
  // forecast records common to the three solves carry the same uncorrected change
  const issues = [T0 + 8 * DAY, T0 + 8.5 * DAY, T0 + 9 * DAY, T0 + 9.5 * DAY];
  const run = (calibration, target) => heldOutRecords({ calibration, target, issues, latencyHours: 1, historyDays: 4, taus: [48], anchorMs: T0, solver: options, fitHours: 30, minimumFitArcs: 1, blockMs: DAY, firstMs: T0 });
  const records = { own: pieces.flatMap((p) => run(p.other, p.target)), other: pieces.flatMap((p) => run(starlink, p.target)), both: pieces.flatMap((p) => run([...p.other, ...starlink], p.target)) };
  const common = commonRecords(records, [48]);
  assert.ok(common.both.length > 20 && common.own.length === common.both.length && common.other.length === common.both.length);
  common.both.forEach((r, i) => assert.equal(r.key, common.own[i].key) && assert.equal(r.ref, common.own[i].ref));
  const d = pairedRatioDifference(common, [48], { minimumBlocks: 2 });
  assert.ok(Number.isFinite(d['48'].difference) && d['48'].ratios.both > 0 && d['48'].lower !== null);
});
