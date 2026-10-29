// ca-screen-recall: the brute-force all-pairs reference (PLAN.md section 5). Not shipped code.
//
// Every position comes from the SGP4 module. This file differences two module-produced positions, compares the
// distance with its neighbours in time, and asks the module again at finer steps. It uses none of the screen's filters:
// no altitude (apogee/perigee) overlap, no orbit-path test, no time-window pruning, no motion bound, no spatial tree.
//
//   dense   every one of the N(N-1)/2 pairs at every sample (10 s), the sampled distance tested against one bound B.
//   bracket a pair whose sampled distance is a local minimum below B (its neighbours in time are no smaller).
//   s1..s3  the module's states at 1 s, 0.05 s and 0.001 s steps inside each bracket; the smallest sample is kept
//           while it is still compatible with a minimum below the retention distance.
import { config, DAY_S } from './common.mjs';

// All pairs of one sample whose squared distance is below B2, appended to `out` (growable typed arrays).
function scan(X, Y, Z, N, B2, out) {
  let n = 0, { i: oi, j: oj, d2: od } = out;
  for (let i = 0; i < N - 1; i++) {
    const xi = X[i], yi = Y[i], zi = Z[i];
    for (let j = i + 1; j < N; j++) {
      const dx = X[j] - xi, a = dx * dx;
      if (a >= B2) continue;
      const dy = Y[j] - yi, b = a + dy * dy;
      if (b >= B2) continue;
      const dz = Z[j] - zi, c = b + dz * dz;
      if (c >= B2) continue;
      if (n === oi.length) {
        const grow = (old, Type) => { const bigger = new Type(old.length * 2); bigger.set(old); return bigger; };
        oi = out.i = grow(oi, Int32Array); oj = out.j = grow(oj, Int32Array); od = out.d2 = grow(od, Float64Array);
      }
      oi[n] = i; oj[n] = j; od[n] = c; n++;
    }
  }
  out.n = n;
}

const d2At = (X, Y, Z, i, j) => { const dx = X[i] - X[j], dy = Y[i] - Y[j], dz = Z[i] - Z[j]; return dx * dx + dy * dy + dz * dz; };
const newFlags = () => ({ n: 0, i: new Int32Array(1 << 12), j: new Int32Array(1 << 12), d2: new Float64Array(1 << 12) });

export async function bruteForce({ sgp4, numbers, window, log = () => {} }) {
  const ref = config.reference, N = numbers.length, h = ref.sampleSeconds;
  const intervals = Math.round(window.durationSeconds / h);
  const first = -ref.marginSamples, last = intervals + ref.marginSamples;
  const index = new Map(numbers.map((n, i) => [n, i]));
  const vRel = 2 * ref.maxObjectSpeedKmS, retainKm = ref.retainBelowM / 1000, B = ref.candidateBoundKm, B2 = B * B;
  // Soundness of the bound: a pair whose true minimum is below the retention distance, sampled at +-h/2 of its time, is
  // seen at most hypot(retention, vRel * h / 2) apart; the margin covers the curvature of the relative path.
  if (Math.hypot(retainKm, vRel * h / 2) + ref.candidateMarginKm > B) throw new Error('candidate bound B is too small for the sample step');
  const stats = { objects: N, samples: 0, flaggedPairSamples: 0, maxObjectSpeedKmS: 0, maxDuplicateSampleDiffKm: 0, brackets: 0, kept: {}, moduleCalls: 0, denseMs: 0, refineMs: 0 };

  // ---- dense pass ----
  const t0 = performance.now(), brackets = [];
  let prev2 = null, prev1 = null, flagsPrev = newFlags(), flagsCur = newFlags(), lastEdge = null;
  for (let k0 = first; k0 < last; k0 += ref.chunkIntervals) {
    const lines = Math.min(ref.chunkIntervals, last - k0) + 1;
    const s = await sgp4.sample({ startJd: window.startJd + (k0 * h) / DAY_S, lines, stepSeconds: h });
    stats.moduleCalls++;
    if (s.norads.length !== N) throw new Error(`the SGP4 module answered ${s.norads.length} of ${N} objects`);
    const X = new Float64Array(lines * N), Y = new Float64Array(lines * N), Z = new Float64Array(lines * N);
    const seen = new Uint8Array(N);
    for (let b = 0; b < N; b++) {
      const i = index.get(s.norads[b]);
      if (i === undefined || seen[i]) throw new Error(`unexpected object ${s.norads[b]} in the SGP4 module's answer`);
      seen[i] = 1;
      for (let l = 0; l < lines; l++) {
        const at = (b * lines + l) * 3, to = l * N + i;
        X[to] = s.pos[at]; Y[to] = s.pos[at + 1]; Z[to] = s.pos[at + 2];
        const speed = Math.hypot(s.vel[at], s.vel[at + 1], s.vel[at + 2]);
        if (speed > stats.maxObjectSpeedKmS) stats.maxObjectSpeedKmS = speed;
      }
    }
    if (lastEdge) {   // line 0 repeats the previous chunk's last sample: the module's own two answers for one instant
      for (let i = 0; i < N; i++) stats.maxDuplicateSampleDiffKm = Math.max(stats.maxDuplicateSampleDiffKm, Math.hypot(X[i] - lastEdge.X[i], Y[i] - lastEdge.Y[i], Z[i] - lastEdge.Z[i]));
    }
    lastEdge = { X: X.subarray((lines - 1) * N, lines * N), Y: Y.subarray((lines - 1) * N, lines * N), Z: Z.subarray((lines - 1) * N, lines * N) };
    for (let l = k0 === first ? 0 : 1; l < lines; l++) {
      const k = k0 + l, cur = { X: X.subarray(l * N, (l + 1) * N), Y: Y.subarray(l * N, (l + 1) * N), Z: Z.subarray(l * N, (l + 1) * N) };
      if (prev2) {   // the previous sample's flagged pairs, now that both neighbours in time are known
        for (let n = 0; n < flagsPrev.n; n++) {
          const i = flagsPrev.i[n], j = flagsPrev.j[n], d = flagsPrev.d2[n];
          if (d < d2At(prev2.X, prev2.Y, prev2.Z, i, j) && d <= d2At(cur.X, cur.Y, cur.Z, i, j)) brackets.push([i, j, k - 1]);
        }
      }
      scan(cur.X, cur.Y, cur.Z, N, B2, flagsCur);
      stats.flaggedPairSamples += flagsCur.n; stats.samples++;
      [flagsPrev, flagsCur] = [flagsCur, flagsPrev];
      prev2 = prev1; prev1 = cur;
    }
    if ((k0 - first) % (ref.chunkIntervals * 40) === 0) log(`dense pass: sample ${k0 - first} of ${last - first}`);
  }
  if (stats.maxObjectSpeedKmS > ref.maxObjectSpeedKmS) throw new Error(`object speed ${stats.maxObjectSpeedKmS} km/s exceeds the registered ${ref.maxObjectSpeedKmS}`);
  stats.brackets = brackets.length; stats.denseMs = performance.now() - t0;
  log(`dense pass done: ${stats.samples} samples, ${brackets.length} brackets in ${(stats.denseMs / 1000).toFixed(0)} s`);

  // ---- refinement ----
  const t1 = performance.now(), found = [];
  for (const spec of ref.stages) stats.kept[spec.id] = 0;
  const distances = async (ni, nj, startJd, lines, stepSeconds) => {
    const s = await sgp4.sample({ startJd, lines, stepSeconds, numbers: [ni, nj] });
    stats.moduleCalls++;
    if (s.norads.length !== 2 || new Set(s.norads).size !== 2) throw new Error('the SGP4 module did not answer the pair');
    const d = new Float64Array(lines), len = lines * 3;
    for (let l = 0; l < lines; l++) {
      const a = l * 3, b = len + l * 3;
      d[l] = Math.hypot(s.pos[a] - s.pos[b], s.pos[a + 1] - s.pos[b + 1], s.pos[a + 2] - s.pos[b + 2]);
    }
    return d;
  };
  for (const [i, j, kc] of brackets) {
    const ni = numbers[i], nj = numbers[j];
    let startJd = window.startJd + ((kc - 1) * h) / DAY_S, centerJd = null, best = null;
    for (const [n, spec] of ref.stages.entries()) {
      if (n === 0) {
        if ((spec.lines - 1) * spec.stepSeconds !== 2 * h) throw new Error('stage s1 must span the bracket (two sample steps)');
      } else {
        startJd = centerJd - (((spec.lines - 1) / 2) * spec.stepSeconds) / DAY_S;
      }
      const d = await distances(ni, nj, startJd, spec.lines, spec.stepSeconds);
      let m = 0;
      for (let l = 1; l < spec.lines; l++) if (d[l] < d[m]) m = l;
      const keep = spec.id === ref.stages.at(-1).id ? retainKm : Math.hypot(retainKm, vRel * spec.stepSeconds / 2) + spec.marginKm;
      if (!(d[m] < keep)) { best = null; break; }
      stats.kept[spec.id]++;
      centerJd = startJd + (m * spec.stepSeconds) / DAY_S;
      best = { tcaJd: centerJd, missM: d[m] * 1000 };
    }
    if (best) found.push({ a: Math.min(ni, nj), b: Math.max(ni, nj), ...best });
  }
  // The same minimum cannot belong to two brackets; merge anything closer than half a second.
  found.sort((x, y) => x.a - y.a || x.b - y.b || x.tcaJd - y.tcaJd);
  const events = [];
  for (const e of found) {
    const p = events.at(-1);
    if (p && p.a === e.a && p.b === e.b && Math.abs(e.tcaJd - p.tcaJd) * DAY_S < 0.5) { if (e.missM < p.missM) events[events.length - 1] = e; } else events.push(e);
  }
  stats.refineMs = performance.now() - t1; stats.merged = found.length - events.length;
  log(`refinement done: ${events.length} events in ${(stats.refineMs / 1000).toFixed(0)} s`);
  return { events, stats };
}
