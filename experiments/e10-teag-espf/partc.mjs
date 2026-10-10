// Part C (PLAN.md section 3): OMM-seeded admissible sets for GPS, updated by
// later element sets as RTN pseudo-observations, scored against precise
// orbits. Record routing and statistics only: SGP4 at each set's epoch
// (analysis/epoch-state), the precise states (analysis/reference-states'
// output), their short propagation (propagator/hpop), the RTN axes
// (foundation/frames) and the filters are the modules'. Element sets and
// everything derived from them stay under runs/ (ignored by git).
import fs from 'node:fs';
import { config, repoPath, iso, DAY_MS } from './common.mjs';
import { epochMs as setEpochMs } from '../../harness/gp-archive.mjs';
import { decodeOemStream, mpeFrame } from '../../harness/records.mjs';
import { rtnAxes } from '../../harness/frames.mjs';
import { propagate } from './hpop.mjs';

export const LINEAR = 23, POSITION_VECTOR = 7;

// E2's at-epoch statistic for GPS (train), the second moment about zero in
// the RTN axes of the precise state: 6 x 6, m and m/s.
export function e2SecondMoment() {
  const c1 = JSON.parse(fs.readFileSync(repoPath(config.partC.statistic.file), 'utf8'));
  const stratum = c1.regimes.GPS.epoch.strata[0];
  const full = new Array(36).fill(0);
  let k = 0;
  for (let i = 0; i < 6; ++i) for (let j = 0; j <= i; ++j) { full[i * 6 + j] = full[j * 6 + i] = stratum.covariance[k++]; }
  const mean = stratum.mean;
  return { n: stratum.n, secondMoment: full.map((v, idx) => (v + mean[Math.floor(idx / 6)] * mean[idx % 6]) * 1e6) };
}

// Space-Track epoch text (UTC, microseconds, no zone) -> Unix seconds, as E2's
// product.mjs (Date.parse drops the microseconds).
export function unixSeconds(text) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?/.exec(text);
  return Date.parse(`${m[1]}Z`) / 1000 + Number(`0.${m[2] ?? '0'}`);
}

// GCRF states of element sets at their epochs (analysis/epoch-state), as E2's
// product.mjs epochStates: [{state [m, m/s]} | null] in input order.
export async function epochStates(epochState, sets) {
  const records = sets.map((s) => ({ entityId: `NORAD:${s.norad}`, epochUnix: unixSeconds(s.epoch), ...s.elements }));
  const response = await epochState.invoke('derive', [mpeFrame(records)]);
  const report = JSON.parse(Buffer.from(response.outputs.find((f) => f.portId === 'report').payload).toString('utf8'));
  const refused = new Set((report.refused ?? report.failures ?? []).map((r) => r.index));
  const states = decodeOemStream(new Uint8Array(response.outputs.find((f) => f.portId === 'states').payload));
  const out = [];
  let k = 0;
  for (let i = 0; i < sets.length; ++i) {
    if (refused.has(i)) { out.push(null); continue; }
    const line = states[k++].EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
    out.push({ state: [line.X, line.Y, line.Z, line.X_DOT, line.Y_DOT, line.Z_DOT].map((v) => v * 1000) });
  }
  if (k !== states.length) throw new Error('analysis/epoch-state: state count does not match its report');
  return out;
}

// Whether the precise orbits of one object cover [fromMs, toMs] without a gap
// longer than 10 minutes between product days.
export function covered(index, norad, fromMs, toMs) {
  const spans = index.spans(norad, fromMs, toMs);
  if (!spans.length || spans[0].start > fromMs || spans.at(-1).stop < toMs) return false;
  for (let i = 1; i < spans.length; ++i) if (spans[i].start - spans[i - 1].stop > 600e3) return false;
  return true;
}

// The arcs of PLAN.md section 3: per start day and object, the seed (the
// first set with epoch at or after 00:00 UTC) and its updates (later sets
// within arcDays of the seed's epoch, at least minimumUpdates).
export function arcsFor(sets, objects, { startDays, arcDays, minimumUpdates }, index) {
  const byNorad = new Map();
  for (const s of sets) { if (!byNorad.has(s.norad)) byNorad.set(s.norad, []); byNorad.get(s.norad).push(s); }
  for (const list of byNorad.values()) list.sort((a, b) => setEpochMs(a.epoch) - setEpochMs(b.epoch));
  const arcs = [];
  for (const day of startDays) {
    const t0 = Date.parse(`${day}T00:00:00Z`);
    for (const norad of objects) {
      const list = byNorad.get(norad) ?? [];
      const seed = list.find((s) => setEpochMs(s.epoch) >= t0);
      if (!seed) continue;
      const s0 = setEpochMs(seed.epoch);
      const updates = list.filter((s) => { const t = setEpochMs(s.epoch); return t > s0 && t <= s0 + arcDays * DAY_MS; });
      if (updates.length < minimumUpdates) continue;
      if (!covered(index, norad, s0 - 600e3, setEpochMs(updates.at(-1).epoch) + 600e3)) continue;
      arcs.push({ norad, start: day, seed, updates });
    }
  }
  return arcs;
}

// Precise states of one object over [fromMs, toMs] (GCRF, m, m/s), by epoch.
export function referenceLines(index, norad, fromMs, toMs) {
  const lines = new Map();
  for (const f of index.frames(norad, fromMs - 600e3, toMs + 600e3))
    for (const record of decodeOemStream(new Uint8Array(f.payload)))
      for (const block of record.EPHEMERIS_DATA_BLOCK)
        for (const l of block.EPHEMERIS_DATA_LINES) {
          const ms = Date.parse(l.EPOCH);
          if (ms >= fromMs - 600e3 && ms <= toMs + 600e3) lines.set(ms, [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT].map((v) => v * 1000));
        }
  return [...lines].sort((a, b) => a[0] - b[0]);
}

// The truth at ms: the last precise state at or before it, propagated by HPOP
// (at most maxGapS); null when there is none.
export async function truthAt(hpop, env, model, lines, ms, maxGapS = 330) {
  let k = -1;
  for (let i = 0; i < lines.length && lines[i][0] <= ms; ++i) k = i;
  if (k < 0 || ms - lines[k][0] > maxGapS * 1000) return null;
  if (lines[k][0] === ms) return [...lines[k][1]];
  const [sample] = await propagate(hpop, env, model, { epochIso: iso(lines[k][0]), state: lines[k][1], sampleIsos: [iso(ms)] });
  return sample.state;
}

// One prepared arc: per epoch (seed first) the set's GCRF state, the truth,
// the GCRF -> RTN rotation of the set's own state, and the set's error.
export async function prepareArc(m, env, model, index, arc, states) {
  const sets = [arc.seed, ...arc.updates];
  const epochs = sets.map((s) => setEpochMs(s.epoch));
  const lines = referenceLines(index, arc.norad, epochs[0], epochs.at(-1));
  const rows = [];
  for (const [k, set] of sets.entries()) {
    const state = states.get(set.gpId);
    if (!state) { if (k === 0) return null; continue; }
    const truth = await truthAt(m.hpop, env, model, lines, epochs[k]);
    if (!truth) { if (k === 0) return null; continue; }
    const rotation = await rtnAxes(m.frames, iso(epochs[k]), state);
    rows.push({ ms: epochs[k], gpId: set.gpId, state, truth, rotation, setError: Math.hypot(state[0] - truth[0], state[1] - truth[1], state[2] - truth[2]) });
  }
  if (rows.length < 1 + config.partC.minimumUpdates) return null;
  return { norad: arc.norad, start: arc.start, rows };
}

// x_gcrf = M' x_rtn: P = B C B', B = blockdiag(M', M').
export function rotateToGcrf(rotation, c) {
  const b = new Array(36).fill(0);
  for (let i = 0; i < 3; ++i) for (let j = 0; j < 3; ++j) { b[i * 6 + j] = rotation[j * 3 + i]; b[(i + 3) * 6 + j + 3] = rotation[j * 3 + i]; }
  const bc = new Array(36).fill(0), out = new Array(36).fill(0);
  for (let a = 0; a < 6; ++a) for (let q = 0; q < 6; ++q) for (let k = 0; k < 6; ++k) bc[a * 6 + q] += b[a * 6 + k] * c[k * 6 + q];
  for (let a = 0; a < 6; ++a) for (let q = 0; q < 6; ++q) for (let k = 0; k < 6; ++k) out[a * 6 + q] += bc[a * 6 + k] * b[q * 6 + k];
  return out;
}

// The scenario the filters take (partb.mjs runAndScore): LINEAR RTN records
// for the sequential filters, POSITION_VECTOR records with their 3 x 3 GCRF
// covariances for the batch. sigmaScale [3] multiplies the RTN sigmas (the
// correlation sensitivity; 1 in the primary analysis).
export function arcScenario(prepared, secondMoment, { sigmaScale = [1, 1, 1] } = {}) {
  const [seed, ...updates] = prepared.rows;
  const sigma = [0, 1, 2].map((i) => Math.sqrt(secondMoment[i * 7]) * sigmaScale[i]);
  const zeros = [0, 0, 0, 0, 0, 0];
  const observations = updates.map((u) => {
    const r = u.state.slice(0, 3), M = u.rotation;
    const values = [0, 1, 2].map((i) => M[i * 3] * r[0] + M[i * 3 + 1] * r[1] + M[i * 3 + 2] * r[2]);
    const linearMatrix = [0, 1, 2].flatMap((i) => [M[i * 3], M[i * 3 + 1], M[i * 3 + 2], 0, 0, 0]);
    return { ms: u.ms, kind: LINEAR, values, sigmas: sigma, linearMatrix, linearOffset: [0, 0, 0], stationGcrf: zeros };
  });
  const batchObservations = updates.map((u) => ({ ms: u.ms, kind: POSITION_VECTOR, values: u.state.slice(0, 3), sigmas: [1, 1, 1], stationGcrf: zeros }));
  // M' diag(sigma^2) M per update, row-major 3 x 3.
  const batchCovariances = updates.flatMap((u) => {
    const M = u.rotation, out = [];
    for (let a = 0; a < 3; ++a) for (let b = 0; b < 3; ++b) { let s = 0; for (let k = 0; k < 3; ++k) s += M[k * 3 + a] * sigma[k] * sigma[k] * M[k * 3 + b]; out.push(s); }
    return out;
  });
  return {
    norad: prepared.norad, start: prepared.start, epochMs: seed.ms, filterModel: config.partC.forceModel,
    initial: { ms: seed.ms, state: seed.state, covariance: rotateToGcrf(seed.rotation, secondMoment) },
    observations, batchObservations, batchCovariances,
    truthAtObs: updates.map((u) => u.truth), rtn: updates.map((u) => u.rotation), setErrors: updates.map((u) => u.setError),
    seedError: seed.setError,
  };
}
