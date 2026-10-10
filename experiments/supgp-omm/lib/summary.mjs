// The per-group table: objects, paired (gate pass), ours lower, median and maximum RMS difference,
// and the unpaired sets by reason. Statistics over the rows the pass wrote; nothing is recomputed.
import { median, quantile } from '../../../harness/stats.mjs';

const count = (rows, f) => rows.filter(f).length;
const spread = (xs) => (xs.length ? { n: xs.length, median: median(xs), p10: quantile(xs, 0.1), p90: quantile(xs, 0.9), min: Math.min(...xs), max: Math.max(...xs) } : { n: 0 });

// Pairs by what backs them: a version holding the whole window, or only part of it (it starts after
// the EPOCH); and a version that existed when the snapshot was fetched (causal), or one created later.
export function pairClass(row) {
  if (row.status !== 'paired') return null;
  return `${row.window.complete ? 'complete' : 'partial'}-${row.causal === true ? 'causal' : row.causal === false ? 'acausal' : 'undated'}`;
}

export function summarize(group, snapshot, rows) {
  const paired = rows.filter((r) => r.status === 'paired');
  const fitted = paired.filter((r) => r.ours?.converged && r.comparison);
  const diffsM = fitted.map((r) => r.comparison.supgpMinusOursM);
  const unpaired = {};
  for (const r of rows.filter((x) => x.status !== 'paired')) unpaired[r.reason.code] = (unpaired[r.reason.code] ?? 0) + 1;
  const classes = {};
  for (const r of paired) classes[pairClass(r)] = (classes[pairClass(r)] ?? 0) + 1;
  const strong = fitted.filter((r) => r.window.complete && r.causal !== false);
  const clean = strong.filter((r) => r.gate.clean);
  const sub = (list) => ({ pairs: list.length, oursLower: count(list, (r) => r.comparison.oursLower), diffM: spread(list.map((r) => r.comparison.supgpMinusOursM)) });
  // The window proof: on the sets paired with a version that holds the whole window, the chosen window reproduces
  // the published RMS better than a window half as long, three quarters, one and a half or twice as long.
  const proven = strong.filter((r) => r.windowProof);
  const factors = Object.keys(proven[0]?.windowProof ?? {});
  const miss = (r, f) => Math.abs((f === '1' ? r.supgp.rmsPerCoordinateKm : r.windowProof[f]?.rmsPerCoordinateKm) / r.publishedRmsKm - 1);
  const windowProof = proven.length ? {
    sets: proven.length,
    chosenBest: proven.filter((r) => factors.every((f) => !Number.isFinite(miss(r, f)) || miss(r, '1') <= miss(r, f))).length,
    medianAbsMissPercent: { chosen: 100 * median(proven.map((r) => miss(r, '1'))), ...Object.fromEntries(factors.map((f) => [`x${f}`, 100 * median(proven.map((r) => miss(r, f)).filter(Number.isFinite))])) },
  } : null;
  return {
    group,
    snapshot: snapshot && { stamp: snapshot.stamp, fetchedUtc: snapshot.fetchedUtc, sha256: snapshot.sha256, rows: snapshot.rows?.length },
    objects: rows.length,
    paired: paired.length,
    fitted: fitted.length,
    fitFailed: paired.length - fitted.length,
    oursLower: count(fitted, (r) => r.comparison.oursLower),
    oursNotLower: count(fitted, (r) => !r.comparison.oursLower),
    diffM: spread(diffsM),                         // CelesTrak's per-coordinate RMS minus ours, metres
    pairClasses: classes,
    completeWindow: sub(strong),                   // whole window in the version, version not newer than the snapshot
    cleanPairs: sub(clean),                        // of those, the recomputed RMS within 2 % of the published one (the version CelesTrak fitted, to all appearances)
    windowProof,
    supgpRmsKm: spread(fitted.map((r) => r.supgp.rmsPerCoordinateKm)),
    oursRmsKm: spread(fitted.map((r) => r.ours.rms.rmsPerCoordinateKm)),
    unpaired,
    guardViolations: count(rows, (r) => r.reason?.code === 'guard'),
  };
}
