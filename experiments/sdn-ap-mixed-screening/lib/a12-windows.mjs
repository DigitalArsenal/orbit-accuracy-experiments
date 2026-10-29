// Amendment A12's E' window (point 7), one copy for the selection and the E' export: the fit track over [E - 48 h, E - 24 h] from
// captured files that start before E' (cycles before the forecast cycle), its registered relaxed rule, and the truth over (E', E] from
// files that start after E' and before F, from the three registered cycles, each file's first 8 h. Reading through the fit-only reader.
import { config } from '../common.mjs';
import { track } from './capture.mjs';

const S = config.part1.starlink, D = config.a12.selection.datasets;
const H = 3600e3;

/** E' fit track rule: at least 60 % of 145 epochs, no gap over 8 h, states in the first and the last 2 h. Null when it holds, else the reason. */
export function eprimeOk(lines, from, to) {
  const t = lines.map((l) => Date.parse(l.epoch));
  if (t.length < D.eprime.minimumCoverage * (S.trackHours * 60 / S.stepMinutes + 1)) return `fit track ${t.length} epochs`;
  if (!(t[0] <= from + D.eprime.edgeHours * H) || !(t.at(-1) >= to - D.eprime.edgeHours * H)) return 'fit track misses its first or last 2 h';
  for (let i = 1; i < t.length; i += 1) if (t[i] - t[i - 1] > D.eprime.maximumGapHours * H) return 'fit track gap over 8 h';
  return null;
}

/** The E' window of an A3 fit row through the reader R (lib/prefit.mjs): { dataset: 'eprime', fit, held, E (= E'), skipped }. */
export function eprimeWindow(row, R) {
  const E = Date.parse(row.E), Ep = E - D.eprime.shiftHours * H, Fs = Date.parse(row.F.startUtc);
  const files = R.olderFiles(row.norad, Fs);
  const fit = track(files.filter((f) => f.start < Ep), Ep - S.trackHours * H, Ep, false).lines;
  const truthFiles = R.olderFiles(row.norad, Fs, D.eprime.truthCycles).filter((f) => f.start > Ep && f.start < Fs);
  const held = track(truthFiles, Ep, E, true).lines; // first 8 h of each file (config.part1.starlink.segmentHours), the newest file at each epoch
  const skipped = eprimeOk(fit, Ep - S.trackHours * H, Ep) ?? (held.length ? null : 'no truth epoch in (E\', E]');
  return { dataset: 'eprime', fit, held, E: Ep, skipped };
}
