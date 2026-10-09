// Per-sample errors of element sets against reference states, computed by
// analysis/gp-error-model `accumulate`.
//
// `accumulate` is called once per element set, with narrow age bins
// [a, a + width] that hold at most one reference epoch each, and
// referenceStepSeconds 0. A bin with n = 1 then carries that sample's own
// prediction-minus-truth error in its sums (RTN, km and km/s), so every
// number here is the module's. A bin with n > 1 is reported, not used.
//
// The width is the configured binWidthDays (15 min, the IGS combined
// product's interval), or the sampling interval of the product that holds
// the object at that age when it is shorter (5 min for ESA's final orbit;
// PLAN.md amendment 3).
//
// With `covariance(set, ageDays) -> [σR², σT², σN²]` (km²), each set is also
// scored against that diagonal RTN position covariance by the module's
// coverage test: d² = eᵀC⁻¹e and the 1/2/3 σ ellipsoid flags per sample.
import { json } from '../../harness/modules.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { epochMs } from '../../harness/gp-archive.mjs';

const DAY_MS = 86400000;
// Strata indices the coverage model covers: every regime the module's
// default options define (ten) and room to spare; a stratum the module does
// not use is ignored.
const REGIME_INDICES = [...Array(16).keys()];

export const scoringOptions = (scoring) => ({
  ageBinsDays: scoring.ageBinsDays.map((a) => [a, a + scoring.binWidthDays]),
  referenceStepSeconds: scoring.referenceStepSeconds,
});

// Bin widths for one set: the configured width, or the product's interval
// where shorter.
function binsFor(reference, norad, t0, ages, scoring) {
  return ages.map((a) => {
    const step = reference.stepAt ? reference.stepAt(norad, t0 + a * DAY_MS) : null;
    const width = step ? Math.min(scoring.binWidthDays, step / 86400) : scoring.binWidthDays;
    return [a, a + width];
  });
}

function coverageModel(bins, set, covariance) {
  const strata = [];
  bins.forEach(([a], ageIndex) => {
    const [rr, tt, nn] = covariance(set, a);
    // Lower triangle of the 6×6 RTN covariance; the velocity block is unused
    // by the coverage test and set to the identity.
    const covarianceLower = [rr, 0, tt, 0, 0, nn, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
    for (const regimeIndex of REGIME_INDICES) strata.push({ regimeIndex, ageIndex, covariance: covarianceLower });
  });
  return { kind: 'gp-error-model', mode: 'e1-m4', ageBinsDays: bins, strata };
}

// sets: [{norad, epoch, elements, ...}] -> {samples, counts}
// samples: [{norad, epoch, creationDate, gpId, ageDays, error: [R, T, N, dR, dT, dN], coverage?: {d2, inside: [1σ, 2σ, 3σ]}}]
// options.ages: a subset of scoring.ageBinsDays (default all).
export async function scoreSets(gpModel, reference, sets, scoring, { ages = scoring.ageBinsDays, covariance, onProgress } = {}) {
  const horizon = (Math.max(...ages) + scoring.binWidthDays) * DAY_MS;
  const samples = [];
  const counts = { sets: sets.length, withoutReference: 0, propagationFailures: 0, refused: 0, multiSampleBins: 0, samples: 0 };
  let lastObject = null;
  for (let i = 0; i < sets.length; ++i) {
    const s = sets[i];
    if (s.norad !== lastObject && reference.dropCache) reference.dropCache();
    lastObject = s.norad;
    const t0 = epochMs(s.epoch);
    const frames = reference.frames(s.norad, t0, t0 + horizon);
    if (!frames.length) { ++counts.withoutReference; continue; }
    const bins = binsFor(reference, s.norad, t0, ages, scoring);
    const inputs = [ommFrame([s]), ...frames, json('options', { ageBinsDays: bins, referenceStepSeconds: scoring.referenceStepSeconds })];
    if (covariance) inputs.push(json('model', coverageModel(bins, s, covariance)));
    const acc = await gpModel.invokeJson('accumulate', inputs, 'accumulator');
    counts.propagationFailures += acc.counts.propagationFailures;
    counts.refused += acc.counts.refused;
    for (const stratum of acc.strata) {
      if (stratum.n === 0) continue;
      if (stratum.n !== 1) { ++counts.multiSampleBins; continue; }
      const sample = { norad: s.norad, epoch: s.epoch, creationDate: s.creationDate, gpId: s.gpId, ageDays: ages[stratum.age], regime: stratum.regime, error: stratum.sum };
      if (covariance) {
        const c = stratum.coverage;
        if (!c || c.n !== 1) throw new Error(`no coverage for ${s.gpId} at age ${ages[stratum.age]}`);
        sample.coverage = { d2: c.sumD2, inside: c.inside };
      }
      samples.push(sample);
      ++counts.samples;
    }
    if (onProgress && (i + 1) % 200 === 0) onProgress(i + 1, sets.length);
  }
  return { samples, counts };
}

// The same sets in one `accumulate` call: the A0 check that per-sample sums
// equal the batch's (the harness adds nothing).
export async function scoreBatch(gpModel, reference, sets, scoring) {
  const ages = scoring.ageBinsDays;
  const horizon = (Math.max(...ages) + scoring.binWidthDays) * DAY_MS;
  const frames = new Map();
  for (const s of sets) {
    const t0 = epochMs(s.epoch);
    for (const f of reference.frames(s.norad, t0, t0 + horizon)) frames.set(f.payload, f);
  }
  return gpModel.invokeJson('accumulate', [ommFrame(sets), ...frames.values(), json('options', scoringOptions(scoring))], 'accumulator');
}
