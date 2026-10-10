// E13 step 45: what the dev split shows about the Doves' arcs (PLAN.md section 8, threats): the scatter of the arcs about their baseline and the common
// mode (by altitude), how often a Dove's baseline steps and whether the steps are synchronous across the fleet (a fleet-wide attitude schedule would
// be absorbed by the common mode), and the correlation of the Doves' residuals with each other.
//
//   node steps/45-dev-diagnostics.mjs [--selection FILE] [--out FILE]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { quantile } from '../../../harness/stats.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config, paths, readJson } from '../common.mjs';
import { arcCenterOffsetMs, arcsFromRows, solveCommonMode } from '../common-mode.mjs';

const { values } = parseArgs({ options: { selection: { type: 'string' }, out: { type: 'string' } } });
const S = config.analysis.solver, P = config.planet;
const selection = readJson(values.selection ?? path.join(repoRoot, 'results', 'e13', 'selection.json'));
if (selection.solver.baseline.kind !== 'randomWalk') throw new Error('the baseline diagnostics need a random-walk solver');
const sample = readJson(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'planet-sample.json'));
const rows = fs.readFileSync(path.join(paths.planetArcs, `dev-${P.arc.profile}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const arcs = arcsFromRows(rows, { hwids: sample.calibration, maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly });
const sol = solveCommonMode(arcs, { anchorMs: Date.parse(`${P.split.dev[0]}T00:00:00Z`) + arcCenterOffsetMs(arcs), nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, smoothSigma: selection.solver.smoothSigma ?? null,
  huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo });
const q = selection.solver.baseline.stepSigma, DAY = 86400e3;
const out = { arcs: arcs.length, doves: new Set(arcs.map((a) => a.dove)).size, solver: selection.solver, sigmaArc: sol.sigma };

// arcs per Dove, in time order, with the solved baseline
const byDove = new Map();
arcs.forEach((a, j) => byDove.set(a.dove, [...(byDove.get(a.dove) ?? []), { ...a, res: sol.residuals[j] }]));
const steps = [];
for (const [dove, list] of byDove) {
  list.sort((x, y) => x.startMs - y.startMs);
  const beta = sol.baseline[dove];
  const ordered = [...arcs.keys()].filter((j) => arcs[j].dove === dove).sort((x, y) => (arcs[x].startMs + arcs[x].endMs) - (arcs[y].startMs + arcs[y].endMs));
  for (let k = 1; k < ordered.length; ++k) {
    const dt = Math.max(1e-3, ((arcs[ordered[k]].startMs + arcs[ordered[k]].endMs) - (arcs[ordered[k - 1]].startMs + arcs[ordered[k - 1]].endMs)) / 2 / DAY);
    const d = beta[k] - beta[k - 1];
    if (Math.abs(d) > 2.5 * q * Math.sqrt(dt)) steps.push({ dove, day: new Date((arcs[ordered[k]].startMs + arcs[ordered[k]].endMs) / 2).toISOString().slice(0, 10), step: d, lnFactor: d });
  }
}
// steps per day against a Poisson with the same mean (the dispersion index is about 1 when steps are independent across Doves)
const days = new Map();
for (let t = Date.parse(`${P.split.dev[0]}T00:00:00Z`); t <= Date.parse(`${P.split.dev[1]}T00:00:00Z`); t += DAY) days.set(new Date(t).toISOString().slice(0, 10), 0);
steps.forEach((s) => days.set(s.day, (days.get(s.day) ?? 0) + 1));
const counts = [...days.values()], mean = counts.reduce((a, b) => a + b, 0) / counts.length, variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / (counts.length - 1);
out.steps = { threshold: `|step| > 2.5 q sqrt(dt), q = ${q}`, count: steps.length, perDoveDay: steps.length / arcs.length, meanPerDay: mean, dispersionIndex: variance / mean, daysWithMoreThan3: counts.filter((c) => c > 3).length,
  largest: [...steps].sort((a, b) => Math.abs(b.step) - Math.abs(a.step)).slice(0, 10), sign: { up: steps.filter((s) => s.step > 0).length, down: steps.filter((s) => s.step < 0).length } };

// correlation of residuals between Doves (same arcs' day): the mean pairwise correlation over Doves with at least 40 common days
const resBy = new Map();
for (const [dove, list] of byDove) for (const a of list) resBy.set(`${dove}|${new Date(a.startMs).toISOString().slice(0, 10)}`, a.res);
const doves = [...byDove.keys()];
let sum = 0, n = 0;
for (let i = 0; i < doves.length; ++i) for (let k = i + 1; k < doves.length; ++k) {
  const pairs = [...days.keys()].map((d) => [resBy.get(`${doves[i]}|${d}`), resBy.get(`${doves[k]}|${d}`)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 40) continue;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length, my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
  const cxy = pairs.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), cxx = pairs.reduce((a, p) => a + (p[0] - mx) ** 2, 0), cyy = pairs.reduce((a, p) => a + (p[1] - my) ** 2, 0);
  sum += cxy / Math.sqrt(cxx * cyy); ++n;
}
out.residualCorrelation = { pairs: n, meanPairwise: n ? sum / n : null };

// scatter by altitude: the robust sigma of the residuals in five altitude bins
const alt = rows.filter((r) => !r.error && !r.nonPositive && sample.calibration.includes(r.hwid) && r.cdAreaOverMass > 0 && r.sigmaB / r.cdAreaOverMass < S.arcUse.maximumRelativeSigma).map((r) => r.altitudeKm);
const order = alt.map((_, i) => i).sort((a, b) => alt[a] - alt[b]);
const mad = (xs) => { const m = quantile(xs, 0.5); return 1.4826 * quantile(xs.map((x) => Math.abs(x - m)), 0.5); };
out.scatterByAltitude = Array.from({ length: 5 }, (_, b) => { const ix = order.slice(Math.floor(b * order.length / 5), Math.floor((b + 1) * order.length / 5)); return { fromKm: alt[ix[0]], toKm: alt[ix.at(-1)], robustSigma: mad(ix.map((i) => sol.residuals[i])), statedMedian: quantile(ix.map((i) => arcs[i].sigma), 0.5), n: ix.length }; });
out.statedVersusRealised = { statedMedianRelativeSigma: quantile(arcs.map((a) => a.sigma), 0.5), realisedRobustSigma: sol.sigma };

console.log(JSON.stringify(out, null, 1));
if (values.out) fs.writeFileSync(values.out, `${JSON.stringify(out, null, 1)}\n`);
