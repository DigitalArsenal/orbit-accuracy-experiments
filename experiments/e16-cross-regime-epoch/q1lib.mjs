// Q1's statistics on the epoch samples (PLAN.md 4, 5): loading step 20's samples, C0's clip, the response, the design
// rows of every candidate, the fleet nowcast, the fits (E1's REML and ridge code) and the corrections they predict.
// No orbit computation here: the corrected OMMs are scored by the modules (rescore.mjs).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { clipMask } from '../e1-gps-epoch/inference.mjs';
import { designs, scalesOf } from '../e1-gps-epoch/features.mjs';
import { fitReml, fitRidge, predict, standardize, standardizer } from '../e1-gps-epoch/models.mjs';
import { config, repoRoot } from './common.mjs';

const RUNS = path.join(repoRoot, 'runs');

// Step 20's latest finished run per (window, class, shard): {rows, runs: [id]}.
export function loadSamples(window, classes) {
  const latest = new Map();
  for (const id of fs.readdirSync(RUNS).filter((n) => n.startsWith(`${config.experiment}-20-epoch-samples-`)).sort()) {
    const mf = path.join(RUNS, id, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    if (!m.finished || m.window !== window || !classes.includes(m.class) || m.args?.objects) continue;   // runs restricted to some objects are checks
    latest.set(`${m.class}|${m.shard}`, id);
  }
  const rows = [];
  for (const id of latest.values()) {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(RUNS, id, 'samples.jsonl.gz'))).toString('utf8');
    for (const line of text.split('\n')) if (line) rows.push(JSON.parse(line));
  }
  return { rows, runs: [...latest.values()].sort() };
}

// E1 amendment 2 per regime class at one age: the gpIds inside C0's clip.
export function clipKept(rows, age = 0) {
  const kept = new Set();
  const detail = {};
  const byClass = new Map();
  for (const r of rows) { if (!r.errors[age]) continue; if (!byClass.has(r.cls)) byClass.set(r.cls, []); byClass.get(r.cls).push({ ageDays: age, gpId: r.gpId, error: r.errors[age].e.slice(0, 3) }); }
  for (const [cls, samples] of byClass) {
    const { mask, detail: d } = clipMask(samples, config.clip);
    for (const id of mask.get(age)) kept.add(id);
    detail[cls] = d[0];
  }
  return { kept, detail };
}

// The response: the along-track error at the target in seconds of flight (PLAN.md 5.1).
export const responseOf = (row) => row.errors[0].e[1] / row.speedKmS;

const O_KEYS = ['sinU', 'cosU', 'sin2U', 'cos2U', 'ecc', 'cosI', 'lnN', 'latencyHours', 'gapHours', 'dnPerDay', 'noPrevious'];
const W_KEYS = ['bstar', 'ap24', 'ap72', 'f107', 'f81', 'bAp24', 'bAp72', 'bF107', 'bF81'];

// The fleet nowcast (PLAN.md 5.2, group F): median response of fleet samples (other objects, inside their window's
// C0 clip) with mean motion within dn of the sample's, epochs in [cutoff - L, cutoff], truth released by the cutoff.
export class Fleet {
  // samples: [{norad, epochMs, meanMotion, y, releaseMs}] of the fleet objects, kept by the clip.
  constructor(samples) { this.list = [...samples].sort((a, b) => a.epochMs - b.epochMs); this.t = Float64Array.from(this.list, (s) => s.epochMs); }
  value(row, lookbackHours, dn, minimum) {
    const c = row.createdMs, lo = c - lookbackHours * 3600e3;
    let i = 0, j = this.t.length;
    while (i < j) { const m = (i + j) >> 1; if (this.t[m] < lo) i = m + 1; else j = m; }
    const ys = [];
    for (let k = i; k < this.list.length && this.t[k] <= c; ++k) {
      const s = this.list[k];
      if (s.norad === row.norad || s.releaseMs > c || Math.abs(s.meanMotion - row.meanMotion) > dn) continue;
      ys.push(s.y);
    }
    if (ys.length < minimum) return { f: 0, missing: 1, n: ys.length };
    ys.sort((a, b) => a - b);
    const n = ys.length;
    return { f: n % 2 ? ys[(n - 1) / 2] : (ys[n / 2 - 1] + ys[n / 2]) / 2, missing: 0, n };
  }
}
export const fleetSample = (row) => ({ norad: row.norad, epochMs: row.epochMs, meanMotion: row.meanMotion, y: responseOf(row), releaseMs: row.errors[0].releaseMs });

// Candidates of a group (config.q1.groups): [{id, family, K, lambda, L, dn}].
export function candidates(group, chosen = null) {
  const g = config.q1.groups[group].families;
  const out = [];
  if (group === 'LEO') {
    for (const K of g.C1.harmonicOrders) for (const lambda of g.C1.ridge) out.push({ id: `C1-K${K}-ridge${lambda}`, family: 'C1', K, lambda });
    for (const L of g.C2.lookbackHours) for (const dn of g.C2.meanMotionBandRevPerDay) out.push({ id: `C2-L${L}-dn${dn}`, family: 'C2', L, dn, lambda: 0 });
    if (chosen) out.push({ id: `C3-K${chosen.C1.K}-ridge${chosen.C1.lambda}-L${chosen.C2.L}-dn${chosen.C2.dn}`, family: 'C3', K: chosen.C1.K, lambda: chosen.C1.lambda, L: chosen.C2.L, dn: chosen.C2.dn });
  } else {
    for (const lambda of g.M3a.ridge) out.push({ id: `M3a-ridge${lambda}`, family: 'M3a', lambda });
    for (const lambda of g.M3b.ridge) out.push({ id: `M3b-ridge${lambda}`, family: 'M3b', lambda });
    for (const K of g.C1.harmonicOrders) for (const lambda of g.C1.ridge) out.push({ id: `C1-K${K}-ridge${lambda}`, family: 'C1', K, lambda });
  }
  return out.map((c) => ({ ...c, group }));
}

// The design row of a candidate for one sample (before standardization). fleet: {f, missing} or null.
export function designRow(c, row, scales, fleet) {
  if (c.family === 'M3a' || c.family === 'M3b') return designs[c.family](row.G, scales);
  const parts = [];
  if (c.family === 'C1' || c.family === 'C3') {
    parts.push(...designs.M3c(row.G, scales, c.K));
    if (c.group === 'LEO') parts.push(...O_KEYS.map((k) => row.O[k]), ...W_KEYS.map((k) => row.W[k]));
  }
  if (c.family === 'C2' || c.family === 'C3') parts.push(fleet.f, fleet.missing);
  return parts;
}

// Fit a candidate on training rows. Each training row carries .fleet when the family needs it.
export function fitCandidate(c, train, scales) {
  const X = train.map((r) => designRow(c, r, scales, r.fleet));
  const s = standardizer(X);
  const Z = X.map((x) => standardize(s, x));
  const y = train.map(responseOf);
  const groups = train.map((r) => r.norad);
  let fit;
  if (c.family === 'M3a') fit = fitRidge(Z, y, { groups, lambda: c.lambda });
  else if (c.family === 'M3b') fit = fitRidge(Z, y, { lambda: c.lambda });
  else fit = fitReml(Z, y, groups, { lambda: c.lambda });
  return { candidate: c, standardizer: s, fit, n: train.length, objects: new Set(groups).size };
}

// The correction Δt (s) a fitted candidate gives one sample: minus the predicted response (unseen objects: u = 0, or
// the pooled intercept for M3a).
export function correctionOf(model, row, scales) {
  const x = standardize(model.standardizer, designRow(model.candidate, row, scales, row.fleet));
  return -predict(model.fit, x, row.norad);
}

export { scalesOf };
