// Statistics on E7's per-sample errors (PLAN.md section 6). No orbit
// computation here.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../../harness/provenance.mjs';
import { rng } from '../../harness/stats.mjs';
import { config } from './common.mjs';

// Every shard of one step-20 batch: {rows, manifests}.
export function loadBatch(window, batch) {
  const dir = path.join(repoRoot, 'runs');
  const runs = fs.readdirSync(dir).filter((n) => n.includes(`-20-run-${window}-${batch}-s`)).sort();
  if (!runs.length) throw new Error(`no step-20 runs for ${window} batch ${batch}`);
  const rows = [], manifests = [];
  for (const id of runs) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, id, 'manifest.json'), 'utf8'));
    if (!m.finished) throw new Error(`${id} is not finished`);
    manifests.push(m);
    const file = path.join(dir, id, 'samples.jsonl');
    if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l) rows.push(JSON.parse(l));
  }
  const shards = new Set(manifests.map((m) => m.step.replace(/.*-s(\d+)of(\d+)$/, '$1/$2')));
  const total = Number([...shards][0].split('/')[1]);
  if (shards.size !== total) throw new Error(`batch ${batch}: ${shards.size} of ${total} shards`);
  return { rows, manifests, runs };
}

export const norm = (e) => Math.hypot(e[0], e[1], e[2]);
const dayOf = (row) => row.epoch.slice(0, 10);

// Paired samples at horizon index k: [{row, col, v: [errors per variant]}]
// for the rows of a regime where every listed variant has an error.
export function paired(rows, regime, variants, k) {
  const out = [];
  for (const r of rows) {
    if (r.regime !== regime) continue;
    const es = variants.map((v) => r.errors[v]?.[k] ?? null);
    if (es.some((e) => !e)) continue;
    out.push({ norad: r.norad, day: dayOf(r), errors: es });
  }
  return out;
}

// Weighted quantile of values sorted ascending (order: indices into values).
function wq(values, order, weights, q) {
  let total = 0;
  for (const i of order) total += weights[i];
  if (!total) return NaN;
  let acc = 0;
  const target = q * total;
  for (const i of order) { acc += weights[i]; if (acc >= target) return values[i]; }
  return values[order.at(-1)];
}

// Two-way (object x day) pigeonhole bootstrap of statistics of paired
// samples: stats is {name: (valuesByVariant, orders, weights) -> number}.
export function bootstrap(samples, stats, { resamples, seed, confidence }) {
  const rowsKeys = [...new Set(samples.map((s) => s.norad))], colsKeys = [...new Set(samples.map((s) => s.day))];
  const rowIndex = samples.map((s) => rowsKeys.indexOf(s.norad)), colIndex = samples.map((s) => colsKeys.indexOf(s.day));
  const nv = samples[0]?.errors.length ?? 0;
  const values = [...Array(nv).keys()].map((j) => samples.map((s) => norm(s.errors[j])));
  const orders = values.map((v) => [...v.keys()].sort((a, b) => v[a] - v[b]));
  const evaluate = (w) => Object.fromEntries(Object.entries(stats).map(([k, f]) => [k, f(values, orders, w)]));
  const estimate = evaluate(samples.map(() => 1));
  const random = rng(seed);
  const draws = Object.fromEntries(Object.keys(stats).map((k) => [k, []]));
  const rc = new Float64Array(rowsKeys.length), cc = new Float64Array(colsKeys.length), w = new Float64Array(samples.length);
  for (let b = 0; b < resamples; ++b) {
    rc.fill(0); cc.fill(0);
    for (let i = 0; i < rowsKeys.length; ++i) rc[Math.floor(random() * rowsKeys.length)] += 1;
    for (let i = 0; i < colsKeys.length; ++i) cc[Math.floor(random() * colsKeys.length)] += 1;
    for (let i = 0; i < samples.length; ++i) w[i] = rc[rowIndex[i]] * cc[colIndex[i]];
    const r = evaluate(w);
    for (const k of Object.keys(stats)) if (Number.isFinite(r[k])) draws[k].push(r[k]);
  }
  const a = (1 - confidence) / 2;
  const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
  return Object.fromEntries(Object.keys(stats).map((k) => [k, { estimate: estimate[k], lower: q(draws[k], a), upper: q(draws[k], 1 - a), resamples: draws[k].length }]));
}

export const medianOf = (j) => (values, orders, w) => wq(values[j], orders[j], w, 0.5);
export const p95Of = (j) => (values, orders, w) => wq(values[j], orders[j], w, 0.95);
export const ratioOf = (j, c, q = 0.5) => (values, orders, w) => wq(values[j], orders[j], w, q) / wq(values[c], orders[c], w, q);

// Per-axis description of one variant's samples: median |R|, |T|, |N| and
// each axis's share of the squared error after a 5 robust-sigma clip on 3D.
export function axes(errors) {
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const h = (s.length - 1) / 2; return (s[Math.floor(h)] + s[Math.ceil(h)]) / 2; };
  const d = errors.map(norm), m = med(d), mad = 1.4826 * med(d.map((x) => Math.abs(x - m)));
  const kept = errors.filter((e, i) => Math.abs(d[i] - m) <= config.statistics.clipRobustSigma * mad);
  const ss = [0, 1, 2].map((k) => kept.reduce((a, e) => a + e[k] * e[k], 0));
  const total = ss[0] + ss[1] + ss[2];
  return {
    medianAbs: [0, 1, 2].map((k) => med(errors.map((e) => Math.abs(e[k])))),
    medianSigned: [0, 1, 2].map((k) => med(errors.map((e) => e[k]))),
    share: ss.map((x) => x / total), kept: kept.length,
  };
}

// The class of a ratio interval (PLAN.md section 6).
export function classOf(ci) {
  if (ci.upper < config.decision.meaningfulRatioBelow) return 'meaningfully better';
  if (ci.upper < 1) return 'better';
  if (ci.lower > 1) return 'worse';
  return 'undecided';
}

// The owner's question for one variant: classes at the decision horizons.
export function answerOf(classes) {
  const cs = config.decision.horizonsHours.map((h) => classes[h]);
  if (cs.some((c) => c === undefined)) return 'not decided (a decision horizon has no samples)';
  if (cs.every((c) => c === 'meaningfully better')) return 'yes';
  if (cs.some((c) => c === 'meaningfully better') && !cs.some((c) => c === 'worse')) return 'partly';
  return 'no';
}
