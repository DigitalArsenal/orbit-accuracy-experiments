// Per-sample errors of element sets against reference states, computed by
// analysis/gp-error-model `accumulate`.
//
// `accumulate` is called once per element set, with narrow age bins
// [a, a + width] that hold at most one 15-min reference epoch each, and
// referenceStepSeconds 0. A bin with n = 1 then carries that sample's own
// prediction-minus-truth error in its sums (RTN, km and km/s), so every
// number here is the module's. A bin with n > 1 is reported, not used.
import { json } from '../../harness/modules.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { epochMs } from '../../harness/gp-archive.mjs';

const DAY_MS = 86400000;

export const scoringOptions = (scoring) => ({
  ageBinsDays: scoring.ageBinsDays.map((a) => [a, a + scoring.binWidthDays]),
  referenceStepSeconds: scoring.referenceStepSeconds,
});

// sets: [{norad, epoch, elements, ...}] -> {samples, counts}
// samples: [{norad, epoch, creationDate, ageDays, error: [R, T, N, dR, dT, dN]}]
export async function scoreSets(gpModel, reference, sets, scoring, { onProgress } = {}) {
  const options = json('options', scoringOptions(scoring));
  const ages = scoring.ageBinsDays;
  const horizon = (Math.max(...ages) + scoring.binWidthDays) * DAY_MS;
  const samples = [];
  const counts = { sets: sets.length, withoutReference: 0, propagationFailures: 0, refused: 0, multiSampleBins: 0, samples: 0 };
  for (let i = 0; i < sets.length; ++i) {
    const s = sets[i];
    const t0 = epochMs(s.epoch);
    const frames = reference.frames(s.norad, t0, t0 + horizon);
    if (!frames.length) { ++counts.withoutReference; continue; }
    const acc = await gpModel.invokeJson('accumulate', [ommFrame([s]), ...frames, options], 'accumulator');
    counts.propagationFailures += acc.counts.propagationFailures;
    counts.refused += acc.counts.refused;
    for (const stratum of acc.strata) {
      if (stratum.n !== 1) { ++counts.multiSampleBins; continue; }
      samples.push({ norad: s.norad, epoch: s.epoch, creationDate: s.creationDate, gpId: s.gpId, ageDays: ages[stratum.age], regime: stratum.regime, error: stratum.sum });
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
