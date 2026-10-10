// Statistics on E7v2's per-sample errors (PLAN.md sections 9 and 11): rows
// of step-20 batches, paired samples with failures as unbounded errors,
// object-blocked (and E7's two-way) bootstrap of ratios of medians, Holm's
// procedure. No orbit computation here.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../harness/provenance.mjs';
import { bootstrap, ratioOf, medianOf } from '../e7-full-force-handoff/analysis.mjs';
import { config } from './common.mjs';

export const norm = (e) => Math.hypot(e[0], e[1], e[2]);

// Every finished shard of one step-20 batch: {rows, manifests, runs}.
export function loadBatch(window, batch) {
  const dir = path.join(repoRoot, 'runs');
  const runs = fs.readdirSync(dir).filter((n) => n.startsWith(`${config.experiment}-20-run-${window}-${batch}-s`)).sort();
  if (!runs.length) throw new Error(`no step-20 runs for ${window} batch ${batch}`);
  const rows = [], manifests = [];
  for (const id of runs) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, id, 'manifest.json'), 'utf8'));
    if (!m.finished) throw new Error(`${id} is not finished`);
    manifests.push(m);
    const file = path.join(dir, id, 'samples.jsonl');
    if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l) rows.push(JSON.parse(l));
  }
  const total = Number(manifests[0].step.replace(/.*-s\d+of(\d+)$/, '$1'));
  const shards = new Set(manifests.map((m) => m.step.replace(/.*-s(\d+)of\d+$/, '$1')));
  if (shards.size !== total) throw new Error(`batch ${batch}: ${shards.size} of ${total} shards`);
  return { rows, manifests, runs };
}

// The error lists of a row for a scoring: 'truth' (truth-rich primary) or
// 'pseudo' (pseudo-truth: an OMM-only row's primary, a truth-rich row's
// pseudoErrors), and the horizon index of h in that list.
export function scoring(row, kind) {
  const pseudoList = row.kind === 'omm' ? 'errors' : 'pseudoErrors';
  if (kind === 'truth') return row.kind === 'truth' ? { list: 'errors', hours: config.horizonsHours, targets: row.targets } : null;
  return { list: pseudoList, hours: config.pseudoTruth.horizonsHours, targets: row.kind === 'omm' ? row.targets : row.pseudoTargets };
}

// Paired samples at horizon h for variants (variants[0] is the comparator
// unless stated): [{norad, day, errors: [3-vector | null (unbounded)]}]. A row
// enters when the comparator has an error there; a variant that failed (or
// whose fit failed) on it counts as unbounded; a variant skipped (not
// applicable) or never run removes the row from this comparison.
export function paired(rows, filter, variants, kind, h) {
  const out = [];
  for (const r of rows) {
    if (!filter(r)) continue;
    const s = scoring(r, kind);
    if (!s) continue;
    const k = s.hours.indexOf(h);
    if (k < 0) continue;
    const comparator = r[s.list][variants[0]]?.[k];
    if (!comparator) continue;
    const errors = [];
    let keep = true;
    for (const v of variants) {
      if (r.skips?.[v] || (!r[s.list][v] && !r.failures?.[v])) { keep = false; break; }
      errors.push(r.failures?.[v] ? null : (r[s.list][v]?.[k] ?? null));
    }
    if (keep) out.push({ norad: r.norad, day: r.epoch.slice(0, 10), errors });
  }
  return out;
}

// bootstrap() takes errors as 3-vectors; an unbounded one becomes Infinity.
const asVectors = (samples) => samples.map((s) => ({ ...s, errors: s.errors.map((e) => e ?? [Infinity, 0, 0]) }));

// Ratio of medians (variant j over comparator c) with a bootstrap: objects
// only (primary) or E7's two-way object x day pigeonhole (sensitivity).
// Returns {estimate, lower, upper, p, se, n, objects, medianV, medianC}.
export function ratio(samples, j, c, { days = false, confidence = config.statistics.confidence } = {}) {
  const st = config.statistics;
  const vs = asVectors(samples);
  const b = bootstrap(vs, { ratio: ratioOf(j, c), mv: medianOf(j), mc: medianOf(c) }, { resamples: st.bootstrapResamples, seed: st.bootstrapSeed, confidence, days, keepDraws: true });
  const draws = b.ratio.draws.filter(Number.isFinite);
  const above = draws.filter((x) => x >= 1).length, below = draws.filter((x) => x <= 1).length;
  const p = Math.min(1, 2 * Math.min((1 + above) / (1 + draws.length), (1 + below) / (1 + draws.length)));
  const logs = draws.filter((x) => x > 0).map(Math.log).sort((a, b2) => a - b2);
  const qq = (q) => logs[Math.min(logs.length - 1, Math.floor(q * (logs.length - 1) + 0.5))];
  const se = logs.length ? (qq(0.975) - qq(0.025)) / (2 * 1.959964) : null;
  return { estimate: b.ratio.estimate, lower: b.ratio.lower, upper: b.ratio.upper, p, se, resamples: draws.length,
    n: samples.length, objects: new Set(samples.map((s) => s.norad)).size, medianV: b.mv.estimate, medianC: b.mc.estimate };
}

// The confidence interval at another level from the same resampling scheme.
export const ratioAt = (samples, j, c, confidence, days = false) => ratio(samples, j, c, { days, confidence });

// Holm's step-down adjustment of p-values (same order as given).
export function holm(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]);
  const adjusted = new Array(m);
  let running = 0;
  order.forEach((i, rank) => { running = Math.max(running, Math.min(1, (m - rank) * ps[i])); adjusted[i] = running; });
  return adjusted;
}

// The answer of one family member (PLAN.md section 9).
export function answerOf(r, adjustedP, bonferroni) {
  if (adjustedP < config.statistics.alpha && r.estimate < 1) return bonferroni.upper < config.decision.meaningfulRatioBelow ? 'meaningfully better' : 'better';
  if (adjustedP < config.statistics.alpha && r.estimate > 1) return 'worse';
  return 'undecided';
}

// Quantiles of 3D errors with unbounded failures (operational acceptance).
export function acceptance(values) {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  const all = [...values].sort((a, b) => a - b);
  const q = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1) + 0.5))] : null);
  return {
    attempted: values.length, scored: finite.length, unbounded: values.length - finite.length,
    median: q(all, 0.5), p95: q(all, 0.95), p99: q(all, 0.99), max: all.at(-1) ?? null,
    rmsScored: finite.length ? Math.sqrt(finite.reduce((a, x) => a + x * x, 0) / finite.length) : null,
  };
}
