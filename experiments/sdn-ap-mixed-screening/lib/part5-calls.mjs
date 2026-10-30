// Part 5's assessment of one encounter (A8, A9) as analysis/conjunction-assessment requests: the stored states and covariances it reads and
// the calls it makes (the truth's closest approach; each arm's TCA, miss and Pc), shared by part5-starlink.mjs (its phases) and
// part5-call-timing.mjs. Records only; screening, TCA, miss and Pc are the module's.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIN = 60e3;
export const SETS = ['truth', 'ffm', 'sgp4xp'];
/** A satellite's states file: per epoch ms, then truth, FFM and SGP4-XP position and velocity (km, km/s, GCRF), 19 float64. */
export const statesFile = (dir, norad) => path.join(dir, 'states', `${norad}.f64`);
/** A satellite's stored states: { ms: Float64Array, truth|ffm|sgp4xp: [{ r, v }] by epoch index }. */
export function readStates(dir, norad) {
  const a = new Float64Array(fs.readFileSync(statesFile(dir, norad)).buffer.slice(0));
  const count = a.length / 19, ms = new Float64Array(count), sets = { truth: [], ffm: [], sgp4xp: [] };
  for (let i = 0; i < count; i += 1) {
    const o = 19 * i; ms[i] = a[o];
    SETS.forEach((s, j) => sets[s].push({ r: [a[o + 1 + 6 * j], a[o + 2 + 6 * j], a[o + 3 + 6 * j]], v: [a[o + 4 + 6 * j], a[o + 5 + 6 * j], a[o + 6 + 6 * j]] }));
  }
  return { ms, ...sets };
}
/** A satellite's covariances: cov/<norad>.json, or the same bytes gzipped once the run is done (cov/<norad>.json.gz; the store's disk). */
export const covOf = (dir, norad) => { const f = path.join(dir, 'cov', `${norad}.json`); return JSON.parse(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : zlib.gunzipSync(fs.readFileSync(`${f}.gz`)).toString('utf8')); };
/** An encounter's 21 assessment epochs: 60 s steps over the 20 min about its time (A8 point 5). */
export const assessEpochs = (timeMs) => Array.from({ length: 21 }, (_, j) => Math.round(timeMs / 1000) * 1000 - 10 * MIN + j * MIN);
const controls = (algorithm, from, to) => ({ startMs: from, seconds: (to - from) / 1000, thresholdM: 1e6, algorithm, coarseStepSeconds: 10 });
/** A run's arms with the frames of their states and covariances: FFM (GCRF), SGP4-XP (TEME), and the calibrated covariances (`cal`:
 *  [[arm, state frame]]) in the object's RTN axes, which the module rotates itself (A13 part 5 point 3). */
export const armsOf = (cal) => [['ffm', 'GCRF', null], ['sgp4xp', 'TEME', null], ...cal.map(([arm, frame]) => [arm, frame, 'RTN'])];
/** The truth's closest-approach call of encounter e (the truth states within 30 min either side, no gap over 11 min), or null on a truth gap. */
export function truthCall(cqr, e, statesOf) {
  const source = (norad, h) => {
    const s = statesOf(norad), idx = [];
    for (let i = 0; i < s.ms.length; i += 1) if (Math.abs(s.ms[i] - e.timeMs) <= 30 * MIN) idx.push(i);
    const t = idx.map((i) => s.ms[i]);
    if (!t.length || t[0] > e.timeMs - 10 * MIN || t.at(-1) < e.timeMs + 10 * MIN || !t.slice(1).every((x, i) => x - t[i] <= 11 * MIN)) return null;
    return { source: cqr.source(h, norad, idx.map((i) => ({ ms: s.ms[i], ...s.truth[i] }))), from: t[0], to: t.at(-1) };
  };
  const ta = source(e.a, 1), tb = source(e.b, 2);
  return ta && tb ? () => cqr.closest(ta.source, tb.source, controls('ALFANO_MAXIMUM', Math.max(ta.from, tb.from), Math.min(ta.to, tb.to))) : null;
}
/** One arm's call of encounter e over its assessment epochs (Foster, from the arm's ephemeris and covariance at 60 s steps), from the two
 *  satellites' covariances ca and cb; { pcError } when either has none (the cov phase refused it). */
export function armCall(cqr, e, [arm, frame, covFrame], ca, cb) {
  if (!ca[arm] || !cb[arm]) return { pcError: ca[`${arm}Error`] ?? cb[`${arm}Error`] ?? 'no covariance' };
  const epochs = assessEpochs(e.timeMs);
  const pick = (c) => epochs.map((t) => { const j = c.epochs.indexOf(t); return { ms: t, ...c[arm][j] }; });
  return () => cqr.closest(cqr.source(1, e.a, pick(ca), frame, covFrame), cqr.source(2, e.b, pick(cb), frame, covFrame), controls('FOSTER', epochs[0], epochs.at(-1)), frame);
}
