// E13 step 47 (DESCRIPTIVE, post hoc; decides nothing): H1's spread reduction R1 on the windows of the storm days and of the other days separately. H1 pools every window; the daily common
// mode cannot follow a storm that rises and falls within a day (H2), and a split with more storm days has more such windows. Written after test A's H1 was read (R1 0.247 against 0.25),
// to say what the miss is made of; it is not part of the frozen analysis and no threshold applies to it.
//
//   node steps/47-storm-split.mjs --split dev|testA|testB [--margin 1]       (storm days = GFZ daily Ap >= 50, with `margin` days either side counted as storm)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pigeonholeBootstrap } from '../../../harness/stats.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { DAY, H, config, paths, readJson } from '../common.mjs';
import { arcCenterOffsetMs, arcsFromRows, solveCommonMode, windowMean } from '../common-mode.mjs';
import { cellsOf, densityRows, devLevels, loadDensityWindows, r1FromCells, spreadReduction, stormDays } from '../score.mjs';
import { assertDensityReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, margin: { type: 'string', default: '1' }, out: { type: 'string' } } });
const P = config.planet, S = config.analysis.solver, B = config.analysis.bootstrap;
const [from, to] = P.split[values.split] ?? (() => { throw new Error(`unknown split ${values.split}`); })();
assertDensityReadable(values.split);
const selection = readJson(path.join(repoRoot, 'results', 'e13', 'selection.json'));
const sample = readJson(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'planet-sample.json'));
const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
function hindcast(split) {
  const rows = fs.readFileSync(path.join(paths.planetArcs, `${split}-${P.arc.profile}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const arcs = arcsFromRows(rows, { hwids: sample.calibration, maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly });
  const sol = solveCommonMode(arcs, { anchorMs: dayMs(P.split[split][0]) + arcCenterOffsetMs(arcs), nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, smoothSigma: selection.solver.smoothSigma ?? null, ...solverOptions });
  const times = []; for (let t = dayMs(P.split[split][0]); t < dayMs(P.split[split][1]) + DAY; t += 12 * H) times.push(t);
  const v = times.map((t) => windowMean(sol, t, t + 12 * H)).filter(Number.isFinite);
  return { sol, devMeanS: v.reduce((a, b) => a + b, 0) / v.length };
}
const dev = hindcast('dev'), here = values.split === 'dev' ? dev : hindcast(values.split);
const rows = densityRows(loadDensityWindows(values.split), devLevels(), (lo, hi) => windowMean(here.sol, lo, hi), dev.devMeanS);
const storms = [...stormDays(from, to).keys()], margin = Number(values.margin);
const near = new Set(storms.flatMap((d) => Array.from({ length: 2 * margin + 1 }, (_, k) => new Date(dayMs(d) + (k - margin) * DAY).toISOString().slice(0, 10))));
const part = (list) => {
  const r1 = spreadReduction(list);
  const ci = list.length > 40 ? pigeonholeBootstrap(cellsOf(list), r1FromCells, { resamples: B.resamples, seed: B.seed, confidence: B.confidence }) : null;
  return { windows: r1.n, R1: r1.R1, sdX: r1.sdX, sdResidual: r1.sdRes, lower: ci?.lower ?? null, upper: ci?.upper ?? null };
};
const out = { descriptive: true, postHoc: true, split: values.split, stormDays: storms, marginDays: margin, all: part(rows), onStormDays: part(rows.filter((r) => near.has(r.day))), otherDays: part(rows.filter((r) => !near.has(r.day))) };
const f = (x) => (x === null || !Number.isFinite(x) ? 'n/a' : x.toFixed(3));
for (const k of ['all', 'onStormDays', 'otherDays']) console.log(`${values.split} ${k}: R1 ${f(out[k].R1)}${out[k].lower === null ? '' : ` [${f(out[k].lower)}, ${f(out[k].upper)}]`} over ${out[k].windows} windows (sd x' ${f(out[k].sdX)} -> ${f(out[k].sdResidual)})`);
const file = values.out ?? path.join(repoRoot, 'results', 'e13', values.split, 'storm-split.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
