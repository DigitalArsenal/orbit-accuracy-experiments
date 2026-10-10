// The per-group table: objects, paired (gate pass), ours lower, median and maximum RMS difference,
// and the unpaired sets by reason. Statistics over the rows the pass wrote; nothing is recomputed.
import { median, quantile } from '../../../harness/stats.mjs';
import { GATE } from '../config.mjs';

const count = (rows, f) => rows.filter(f).length;
const spread = (xs) => (xs.length ? { n: xs.length, median: median(xs), p10: quantile(xs, 0.1), p90: quantile(xs, 0.9), min: Math.min(...xs), max: Math.max(...xs) } : { n: 0 });

// Pairs by what backs them: a version holding the whole window, or only part of it (it starts after
// the EPOCH); and a version that existed when the snapshot was fetched (causal), or one created later.
export function pairClass(row) {
  if (row.status !== 'paired') return null;
  return `${row.window.complete ? 'complete' : 'partial'}-${row.causal === true ? 'causal' : row.causal === false ? 'acausal' : 'undated'}`;
}

// Evidence for the window. CelesTrak's set is scored on every version that holds the whole window (and existed at the
// snapshot) over the chosen window and over windows 0.5, 0.75, 1.5 and 2 times as long, from the same start. A window is
// the right one when the published RMS is reproduced on it. For each alternative: the versions on which it has other
// points than the chosen window (a window cut by the end of the file is not a test), and on those the share reproducing
// the published RMS within the gate (max(5 m, 10 %)) and within 2 %, and the median of recomputed / published, for the
// alternative and for the chosen window. Pairing is not a selection here: every such version counts, paired or not.
const WINDOW_FACTORS = ['0.5', '0.75', '1.5', '2'];
function windowEvidence(rows) {
  const versions = [];
  for (const r of rows) for (const c of r.candidates ?? []) if (c.windowComplete && c.causal !== false && c.windows) versions.push({ published: r.publishedRmsKm, w: c.windows });
  if (!versions.length) return null;
  const within = (v, f, relative) => Math.abs(v.w[f].rmsKm - v.published) <= Math.max(GATE.absoluteKm, relative * v.published);
  const describe = (list, f) => ({
    withinGate: list.filter((v) => within(v, f, GATE.relative)).length / list.length,
    within2pct: list.filter((v) => within(v, f, GATE.clean)).length / list.length,
    medianRatio: median(list.map((v) => v.w[f].rmsKm / v.published)),
  });
  const byFactor = {};
  for (const f of WINDOW_FACTORS) {
    const tested = versions.filter((v) => v.w[f]?.n > 0 && v.w[f].n !== v.w['1'].n);
    if (tested.length) byFactor[f] = { versions: tested.length, chosen: describe(tested, '1'), alternative: describe(tested, f) };
  }
  return { versions: versions.length, chosen: describe(versions, '1'), byFactor };
}

// The evidence that does not depend on the version. CelesTrak publishes the RMS of its own least-squares fit, which is the
// minimum the model reaches over the window it used; so our fitted minimum over each window, against the published RMS,
// identifies the window (a longer window than the ephemeris holds is not a test). On the sampled sets whose version holds
// the whole window and reproduces the published RMS within 2 %.
function windowFitEvidence(clean) {
  const sampled = clean.filter((r) => r.windowFits);
  if (!sampled.length) return null;
  const out = { sets: sampled.length };
  for (const f of ['1', ...WINDOW_FACTORS]) {
    const list = sampled.filter((r) => r.windowFits[f]?.n > 0 && (f === '1' || r.windowFits[f].n !== r.windowFits['1'].n));
    if (!list.length) continue;
    const ratios = list.map((r) => r.windowFits[f].rmsPerCoordinateKm / r.publishedRmsKm);
    const near = (relative) => list.filter((r) => Math.abs(r.windowFits[f].rmsPerCoordinateKm - r.publishedRmsKm) <= Math.max(GATE.absoluteKm, relative * r.publishedRmsKm)).length / list.length;
    out[f] = { sets: list.length, medianRatio: median(ratios), p10: quantile(ratios, 0.1), p90: quantile(ratios, 0.9), within2pct: near(GATE.clean), withinGate: near(GATE.relative) };
  }
  return out;
}

export function summarize(group, snapshot, rows) {
  const paired = rows.filter((r) => r.status === 'paired');
  const fitted = paired.filter((r) => r.ours?.converged && r.comparison);
  const diffsM = fitted.map((r) => r.comparison.supgpMinusOursM);
  const unpaired = {};
  for (const r of rows.filter((x) => x.status !== 'paired')) { const k = r.reason.kind ? `${r.reason.code} (${r.reason.kind})` : r.reason.code; unpaired[k] = (unpaired[k] ?? 0) + 1; }
  const classes = {};
  for (const r of paired) classes[pairClass(r)] = (classes[pairClass(r)] ?? 0) + 1;
  const strong = fitted.filter((r) => r.window.complete && r.causal !== false);
  const clean = strong.filter((r) => r.gate.clean);
  const sub = (list) => ({ pairs: list.length, oursLower: count(list, (r) => r.comparison.oursLower), diffM: spread(list.map((r) => r.comparison.supgpMinusOursM)) });
  return {
    group,
    snapshot: snapshot && { stamp: snapshot.stamp, fetchedUtc: snapshot.fetchedUtc, sha256: snapshot.sha256, rows: snapshot.rows?.length },
    objects: rows.length,
    paired: paired.length,
    fitted: fitted.length,
    fitFailed: paired.length - fitted.length,
    oursLower: count(fitted, (r) => r.comparison.oursLower),
    oursNotLower: count(fitted, (r) => !r.comparison.oursLower),
    // How much lower: the pairs where CelesTrak's RMS exceeds ours by more than 1 cm, 1 m and 10 m.
    oursLowerBy: { cm1: count(fitted, (r) => r.comparison.supgpMinusOursM > 0.01), m1: count(fitted, (r) => r.comparison.supgpMinusOursM > 1), m10: count(fitted, (r) => r.comparison.supgpMinusOursM > 10) },
    diffM: spread(diffsM),                         // CelesTrak's per-coordinate RMS minus ours, metres
    pairClasses: classes,
    completeWindow: sub(strong),                   // whole window in the version, version not newer than the snapshot
    cleanPairs: sub(clean),                        // of those, the recomputed RMS within 2 % of the published one (the version CelesTrak fitted, to all appearances)
    windowProof: windowEvidence(rows),
    windowFits: windowFitEvidence(clean),
    // The fitted minimum over the chosen window against the published RMS, on the sets that reproduce it within 2 %.
    oursOverPublished: { clean: spread(clean.map((r) => r.ours.rms.rmsPerCoordinateKm / r.publishedRmsKm)), wholeWindow: spread(strong.map((r) => r.ours.rms.rmsPerCoordinateKm / r.publishedRmsKm)) },
    supgpRmsKm: spread(fitted.map((r) => r.supgp.rmsPerCoordinateKm)),
    oursRmsKm: spread(fitted.map((r) => r.ours.rms.rmsPerCoordinateKm)),
    unpaired,
    guardViolations: count(rows, (r) => r.reason?.code === 'guard'),
  };
}
