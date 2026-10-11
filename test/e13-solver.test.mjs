// Known-answer checks of E13's common-mode solver (experiments/e13-open-dca PLAN.md section 7 and Amendment R1): a synthetic fleet with a
// known common mode, baselines, baseline steps (attitude modes), outliers and daily arcs that all start within a few hours of one another
// (as Planet's do), solved with the production solver. Statistics only: no module is involved, so nothing is skipped.
//
// What the numbers show (recorded in PLAN.md Amendment R1): with the arcs' nodes at their centres the common mode is exact without noise;
// at the realised scatter (0.088 per arc) the rms error of 12 h window means is 0.019 (4.8 % of the 0.4 storm amplitude) for 36 satellites,
// 0.008 (2 %) at 0.04; baselines that are constant in blocks do not hold the levels of neighbouring blocks together when the arcs start
// within an hour of one another (rms error 0.4-1.6 on the same fleet), which is why the baselines are random walks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { arcCenterOffsetMs, nowcast, solveCommonMode, windowMean } from '../experiments/e13-open-dca/common-mode.mjs';
import { rng } from '../harness/stats.mjs';

const H = 3600e3, DAY = 86400e3;
const T0 = Date.parse('2025-10-01T00:00:00Z');
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// A common mode that is piecewise linear on a grid (so the model can represent it): an AR(1) series plus a storm.
function truthOf(gridHours, anchorMs, days, seed) {
  const r = rng(seed), n = Math.ceil(days * 24 / gridHours) + 4, v = new Float64Array(n);
  let x = 0;
  for (let i = 0; i < n; ++i) { x = 0.92 * x + 0.035 * gauss(r); v[i] = x; }
  const storm = Math.round(42 * 24 / gridHours); v[storm] += 0.4; v[storm + 1] += 0.2; v[storm - 1] += 0.1;
  return (t) => { const x2 = (t - anchorMs) / (gridHours * H), i = Math.floor(x2); return v[i] + (v[i + 1] - v[i]) * (x2 - i); };
}
const meanOver = (f, lo, hi) => { let a = 0, n = 0; for (let t = lo + 30e3; t < hi; t += 60e3) { a += f(t); ++n; } return a / n; };

// doves x days of 24 h arcs starting around startHour (+ up to staggerHours); noise sigma, outlier share, baseline steps
function fleet(f, { doves, days, noise, outliers, steps, startHour = 20.75, staggerHours = 2.5, seed, prefix }) {
  const r = rng(seed), arcs = [];
  for (let i = 0; i < doves; ++i) {
    let base = Math.log(0.02) + 0.2 * gauss(r);
    const stepDay = steps && r() < 0.5 ? Math.floor(10 + r() * 70) : -1, stepSize = (r() < 0.5 ? -1 : 1) * Math.log(1.5);
    for (let d = 0; d < days; ++d) {
      if (d === stepDay) base += stepSize;
      const startMs = T0 + d * DAY + (startHour + staggerHours * r()) * H, endMs = startMs + 24 * H;
      let e = noise * gauss(r);
      if (r() < outliers) e += (r() < 0.5 ? -1 : 1) * (0.3 + 0.5 * r());
      arcs.push({ dove: `${prefix}${i}`, startMs, endMs, y: base + meanOver(f, startMs, endMs) + e });
    }
  }
  return arcs;
}

// rms error of the 12 h window means, after removing each solution's mean over the compared windows (the level is not identified)
function windowError(sol, f, fromDay, toDay) {
  const est = [], tru = [];
  for (let t = T0 + fromDay * DAY; t + 12 * H <= T0 + toDay * DAY; t += 12 * H) {
    const e = windowMean(sol, t, t + 12 * H);
    if (Number.isFinite(e)) { est.push(e); tru.push(meanOver(f, t, t + 12 * H)); }
  }
  const me = est.reduce((a, b) => a + b, 0) / est.length, mt = tru.reduce((a, b) => a + b, 0) / tru.length;
  const err = est.map((e, i) => (e - me) - (tru[i] - mt));
  return { rms: Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length), n: err.length, max: Math.max(...err.map(Math.abs)) };
}

test('noise-free daily arcs: the common mode is recovered exactly (24 h nodes at the arcs\' centres; random-walk baselines and blocks of 10, 21 and 30 days)', () => {
  const probe = fleet(() => 0, { doves: 30, days: 92, noise: 0, outliers: 0, steps: false, seed: 1, prefix: 'p' });
  const anchorMs = T0 + arcCenterOffsetMs(probe);
  const f = truthOf(24, anchorMs, 92, 3);
  const arcs = fleet(f, { doves: 30, days: 92, noise: 0, outliers: 0, steps: false, seed: 7, prefix: 'a' });
  const forms = [{ label: 'random walk', baseline: { kind: 'randomWalk', stepSigma: 0.02 } }, ...[10, 21, 30].map((days) => ({ label: `blocks of ${days} d`, baseline: { kind: 'blocks', days } }))];
  for (const form of forms) {
    const sol = solveCommonMode(arcs, { anchorMs, nodeHours: 24, baseline: form.baseline });
    const e = windowError(sol, f, 3, 88);
    // the first and last nodes are unsupported (held at zero), so the arcs next to them are not exactly represented: a few 1e-4
    assert.ok(e.rms < 5e-4, `${form.label}: rms ${e.rms} over ${e.n} windows`);
  }
});

test('realistic scatter (0.088 and 0.04 per arc, 3 % outliers, baseline steps): the common mode is within its noise and held-out satellites gain from it', () => {
  const probe = fleet(() => 0, { doves: 30, days: 92, noise: 0, outliers: 0, steps: false, seed: 1, prefix: 'p' });
  const anchorMs = T0 + arcCenterOffsetMs(probe);
  const f = truthOf(24, anchorMs, 92, 3);
  const amplitude = 0.4;
  const mad = (a) => { const m = [...a].sort((x, y) => x - y)[a.length >> 1]; return 1.4826 * [...a.map((x) => Math.abs(x - m))].sort((x, y) => x - y)[a.length >> 1]; };
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  for (const [noise, staggerHours, limit] of [[0.04, 2.5, 0.03], [0.088, 2.5, 0.06], [0.088, 1, 0.06]]) {
    const calibration = fleet(f, { doves: 36, days: 92, noise, outliers: 0.03, steps: true, seed: 11, prefix: 'c', staggerHours });
    const heldOut = fleet(f, { doves: 12, days: 92, noise, outliers: 0.03, steps: true, seed: 12, prefix: 'h', staggerHours });
    const sol = solveCommonMode(calibration, { anchorMs, nodeHours: 24, baseline: { kind: 'randomWalk', stepSigma: 0.02 }, iterations: 60, tolerance: 1e-5 });
    assert.ok(sol.converged, `noise ${noise}: not converged (last change ${sol.lastChange})`);
    const e = windowError(sol, f, 3, 88);
    assert.ok(e.rms < limit * amplitude, `noise ${noise}, stagger ${staggerHours} h: rms error ${e.rms.toFixed(4)} (${(100 * e.rms / amplitude).toFixed(1)} % of the storm amplitude ${amplitude}; limit ${100 * limit} %)`);
    // held-out satellites: their arcs' log Cd*A/m, less a baseline from the previous 21 days' median with the common mode removed (D13) or not (D0)
    const u0 = [], u13 = [], byDove = new Map();
    heldOut.forEach((a) => byDove.set(a.dove, [...(byDove.get(a.dove) ?? []), a]));
    for (const list of byDove.values()) {
      list.sort((x, y) => x.startMs - y.startMs);
      for (let j = 25; j < list.length - 3; ++j) {
        const prev = list.slice(j - 21, j), sb = (a) => windowMean(sol, a.startMs, a.endMs);
        if (!Number.isFinite(sb(list[j])) || prev.some((a) => !Number.isFinite(sb(a)))) continue;
        u0.push(list[j].y - med(prev.map((a) => a.y)));
        u13.push(list[j].y - sb(list[j]) - med(prev.map((a) => a.y - sb(a))));
      }
    }
    const r3 = 1 - mad(u13) / mad(u0);
    assert.ok(r3 > 0.1, `noise ${noise}: held-out spread reduced by ${(100 * r3).toFixed(1)} % (MAD ${mad(u0).toFixed(4)} -> ${mad(u13).toFixed(4)}) over ${u0.length} arcs`);
  }
});

test('the nowcast uses no arc that ends after its cut-off, and its result does not move when later arcs change', () => {
  const probe = fleet(() => 0, { doves: 30, days: 92, noise: 0, outliers: 0, steps: false, seed: 1, prefix: 'p' });
  const f = truthOf(24, T0 + arcCenterOffsetMs(probe), 92, 3);
  const arcs = fleet(f, { doves: 30, days: 92, noise: 0.05, outliers: 0.03, steps: true, seed: 21, prefix: 'n' });
  const issueMs = T0 + 60 * DAY;                                   // 00:00 UTC; the cut-off is 6 h earlier
  const opts = { latencyHours: 6, historyDays: 30, nodeHours: 24, baseline: { kind: 'randomWalk', stepSigma: 0.02 }, iterations: 40, tolerance: 1e-5 };
  const a = nowcast(arcs, issueMs, opts);
  assert.ok(a.latestArcEndMs <= issueMs - 6 * H, `the latest arc ends ${new Date(a.latestArcEndMs).toISOString()}`);
  const moved = arcs.map((x) => (x.endMs > issueMs - 6 * H ? { ...x, y: x.y + 5 } : x));        // every later arc shifted by +5
  const b = nowcast(moved, issueMs, opts);
  assert.deepEqual(b.s, a.s);
  assert.equal(b.usedArcs, a.usedArcs);
  assert.ok(a.usedArcs > 0 && a.usedArcs < arcs.length);
});

test('a node that few satellites or little weight support is held at zero and the windows that touch it are not scored', () => {
  const probe = fleet(() => 0, { doves: 30, days: 40, noise: 0, outliers: 0, steps: false, seed: 1, prefix: 'p' });
  const anchorMs = T0 + arcCenterOffsetMs(probe);
  const f = truthOf(24, anchorMs, 40, 3);
  const arcs = fleet(f, { doves: 30, days: 40, noise: 0.088, outliers: 0, steps: false, seed: 5, prefix: 'e' });
  const sol = solveCommonMode(arcs, { anchorMs, nodeHours: 24, baseline: { kind: 'randomWalk', stepSigma: 0.02 } });
  assert.equal(sol.supported[0], false, 'the first node (centre of the day before the first arc) is supported');
  assert.equal(sol.s[0], 0);
  assert.ok(Number.isNaN(windowMean(sol, sol.nodeMs[0], sol.nodeMs[0] + 12 * H)));
  assert.ok(sol.supported.filter(Boolean).length >= 38);
  assert.ok(Math.max(...sol.s.map(Math.abs)) < 0.5, 'a node blew up');
});

test('a random-walk prior on the common mode lowers the error of a smooth common mode and keeps most of a storm', () => {
  const probe = fleet(() => 0, { doves: 30, days: 92, noise: 0, outliers: 0, steps: false, seed: 1, prefix: 'p' });
  const anchorMs = T0 + arcCenterOffsetMs(probe);
  // a smooth truth (AR(1) with a daily correlation of 0.97) and a storm of 0.4 over three nodes
  const r = rng(3), n = 92 + 4, v = new Float64Array(n);
  let x = 0;
  for (let i = 0; i < n; ++i) { x = 0.97 * x + 0.015 * gauss(r); v[i] = x; }
  v[41] += 0.1; v[42] += 0.4; v[43] += 0.2;
  const f = (t) => { const x2 = (t - anchorMs) / DAY, i = Math.floor(x2); return v[i] + (v[i + 1] - v[i]) * (x2 - i); };
  const calibration = fleet(f, { doves: 36, days: 92, noise: 0.088, outliers: 0.03, steps: true, seed: 11, prefix: 'c', staggerHours: 2.5 });
  const run = (smoothSigma) => {
    const sol = solveCommonMode(calibration, { anchorMs, nodeHours: 24, baseline: { kind: 'randomWalk', stepSigma: 0.02 }, smoothSigma, iterations: 60, tolerance: 1e-5 });
    assert.ok(sol.converged, `smoothSigma ${smoothSigma}: not converged`);
    const e = windowError(sol, f, 3, 88);
    // the storm: the largest true window mean against the recovered one, both less the mean of the compared windows
    let peakT = -Infinity, peakE = NaN, mt = 0, me = 0, k = 0;
    const wins = [];
    for (let t = T0 + 3 * DAY; t + 12 * H <= T0 + 88 * DAY; t += 12 * H) { const w = windowMean(sol, t, t + 12 * H); if (Number.isFinite(w)) { wins.push([meanOver(f, t, t + 12 * H), w]); mt += wins.at(-1)[0]; me += w; ++k; } }
    for (const [tru, est] of wins) if (tru - mt / k > peakT) { peakT = tru - mt / k; peakE = est - me / k; }
    return { rms: e.rms, keep: peakE / peakT };
  };
  const none = run(null), smooth = run(0.05), tight = run(0.02);
  assert.ok(smooth.rms < 0.97 * none.rms, `rms ${smooth.rms.toFixed(4)} with the prior against ${none.rms.toFixed(4)} without`);
  assert.ok(smooth.keep > 0.7 && none.keep > 0.9, `storm kept: ${smooth.keep.toFixed(2)} with the prior (0.05), ${none.keep.toFixed(2)} without`);
  assert.ok(tight.keep < smooth.keep, 'a tighter prior keeps less of the storm');
});

// Amendment S2 (exploratory): the same solver on 7 h pairs of staggered satellites, nodes every 6 h on a fixed anchor, and the latency statistic.
function pairFleet(f, { satellites, days, seed }) {
  const r = rng(seed), arcs = [];
  for (let i = 0; i < satellites; ++i) {
    const base = Math.log(0.03) + 0.3 * gauss(r), stagger = r() * 7.17 * H;
    for (let k = 0; T0 + stagger + (k + 1) * 7.17 * H < T0 + days * DAY; ++k) {
      const startMs = T0 + stagger + k * 7.17 * H, endMs = startMs + 7.17 * H;
      arcs.push({ dove: `s${i}`, startMs, endMs, y: base + meanOver(f, startMs, endMs) });
    }
  }
  return arcs;
}

test('7 h pairs on a fixed anchor: the 6 h common mode is recovered exactly without noise, and a nowcast uses no later pair', () => {
  const f = truthOf(6, T0, 9, 5);
  const arcs = pairFleet(f, { satellites: 60, days: 9, seed: 3 });
  const opts = { nodeHours: 6, baseline: { kind: 'randomWalk', stepSigma: 0.005 }, iterations: 60, tolerance: 1e-6 };
  const sol = solveCommonMode(arcs, { anchorMs: T0, ...opts });
  const e = windowError(sol, f, 1, 8);
  assert.ok(e.rms < 2e-3, `rms ${e.rms} over ${e.n} windows`);
  const issueMs = T0 + 6 * DAY, latencyHours = 3;
  const a = nowcast(arcs, issueMs, { latencyHours, historyDays: 4, anchorMs: T0, ...opts });
  assert.equal((a.nodeMs[0] - T0) % (6 * H), 0, 'the nodes lie on the fixed anchor\'s grid');
  assert.ok(a.latestArcEndMs <= issueMs - latencyHours * H && a.latestArcEndMs > issueMs - (latencyHours + 7.17) * H, `the newest pair ends ${new Date(a.latestArcEndMs).toISOString()}`);
  const b = nowcast(arcs.map((x) => (x.endMs > issueMs - latencyHours * H ? { ...x, y: x.y + 5 } : x)), issueMs, { latencyHours, historyDays: 4, anchorMs: T0, ...opts });
  assert.deepEqual(b.s, a.s);
});

test('the latency statistic is the rms of what is left against the rms of the change, with an interval only from six blocks', async () => {
  const { latencyStatistic } = await import('../experiments/e13-open-dca/score.mjs');
  const records = (blocks) => Array.from({ length: blocks * 10 }, (_, i) => { const ref = (i % 2 ? 1 : -1) * (1 + (i % 5) / 10); return { block: Math.floor(i / 10), lead: (i % 3) + 0.5, ref, errs: { 48: 0.5 * ref, null: ref } }; });
  const few = latencyStatistic(records(4), [48, null]);
  assert.equal(few.windows, 40);
  assert.ok(Math.abs(few.byTau['48'].ratio - 0.5) < 1e-12 && Math.abs(few.byTau['null'].ratio - 1) < 1e-12);
  assert.equal(few.byTau['48'].lower, null, 'four blocks give no interval');
  const many = latencyStatistic(records(8), [48, null]);
  assert.ok(Math.abs(many.byTau['48'].lower - 0.5) < 1e-9 && Math.abs(many.byTau['48'].upper - 0.5) < 1e-9, 'every block has the ratio 0.5, so the interval is the point');
  assert.deepEqual(many.byTau['48'].byLeadDays.map((l) => l.lead), ['0-1', '1-2', '2-3']);
});

test('a robust scale per fleet (Amendment S3): the precise fleet carries its precision, one group is the frozen solver, and a mixed solve beats the unweighted one', () => {
  const probe = fleet(() => 0, { doves: 30, days: 60, noise: 0, outliers: 0, steps: false, seed: 1, prefix: 'p' });
  const anchorMs = T0 + arcCenterOffsetMs(probe);
  const f = truthOf(24, anchorMs, 60, 3);
  const precise = fleet(f, { doves: 24, days: 60, noise: 0.03, outliers: 0.02, steps: false, seed: 11, prefix: 'a' });
  const noisy = fleet(f, { doves: 24, days: 60, noise: 0.2, outliers: 0.02, steps: false, seed: 12, prefix: 'b' });
  const opts = { anchorMs, nodeHours: 24, baseline: { kind: 'randomWalk', stepSigma: 0.005 }, smoothSigma: 0.05, iterations: 60, tolerance: 1e-6 };
  const plain = solveCommonMode([...precise, ...noisy], opts);
  const one = solveCommonMode([...precise, ...noisy].map((a) => ({ ...a, group: 'all' })), opts);
  assert.deepEqual(one.s, plain.s, 'one group is the solver of the frozen runs');
  const mixed = solveCommonMode([...precise.map((a) => ({ ...a, group: 'precise' })), ...noisy.map((a) => ({ ...a, group: 'noisy' }))], opts);
  assert.ok(mixed.groupSigma.precise < 0.06 && mixed.groupSigma.noisy > 0.15, `scales ${JSON.stringify(mixed.groupSigma)}`);
  assert.ok(mixed.groupPrecision.precise > 15 && mixed.groupPrecision.noisy === 1, `precisions ${JSON.stringify(mixed.groupPrecision)}`);
  const eGrouped = windowError(mixed, f, 3, 56), eUnweighted = windowError(plain, f, 3, 56);
  assert.ok(eGrouped.rms < 0.9 * eUnweighted.rms, `grouped rms ${eGrouped.rms}, unweighted ${eUnweighted.rms}`);
  assert.throws(() => solveCommonMode([...precise.map((a) => ({ ...a, group: 'p' })), ...noisy.map((a) => ({ ...a, group: 'n' }))], { anchorMs, nodeHours: 24, baseline: { kind: 'blocks', days: 21 } }), /random-walk/);
});

test('arcs with their own precision (Amendment S5): precise arcs carry their weight, and equal precisions are the unweighted solver', () => {
  const probe = fleet(() => 0, { doves: 30, days: 60, noise: 0, outliers: 0, steps: false, seed: 1, prefix: 'p' });
  const anchorMs = T0 + arcCenterOffsetMs(probe);
  const f = truthOf(24, anchorMs, 60, 3);
  // half of the satellites have arcs five times as noisy as the other half; the second half's arcs say so through their precision
  const sharp = fleet(f, { doves: 24, days: 60, noise: 0.03, outliers: 0.02, steps: false, seed: 11, prefix: 'a' });
  const blurred = fleet(f, { doves: 24, days: 60, noise: 0.15, outliers: 0.02, steps: false, seed: 12, prefix: 'b' });
  const opts = { anchorMs, nodeHours: 24, baseline: { kind: 'randomWalk', stepSigma: 0.005 }, smoothSigma: 0.05, iterations: 60, tolerance: 1e-6 };
  const plain = solveCommonMode([...sharp, ...blurred], opts);
  const ones = solveCommonMode([...sharp, ...blurred].map((a) => ({ ...a, precision: 1 })), opts);
  assert.deepEqual(ones.s, plain.s, 'precision 1 is the solver of the frozen runs');
  const told = solveCommonMode([...sharp.map((a) => ({ ...a, precision: 25 })), ...blurred.map((a) => ({ ...a, precision: 1 }))], opts);
  const eTold = windowError(told, f, 3, 56), ePlain = windowError(plain, f, 3, 56);
  assert.ok(eTold.rms < 0.85 * ePlain.rms, `with their precisions told: rms ${eTold.rms}; without ${ePlain.rms}`);
  assert.ok(Math.abs(told.sigma - 0.15) < 0.04, `the unit-weight scale is that of the blurred arcs in the units of the precision: ${told.sigma}`);
});
