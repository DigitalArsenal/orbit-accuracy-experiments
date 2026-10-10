// E13 step 30: the density endpoints of a split (PLAN.md section 6): H1 spread reduction against Swarm A, B, C and GRACE-FO 1 densities, H2 storm
// capture, H6 the seven-day time-shift control, H3 held-out Doves, and the descriptive ratios (Planet's own ballistic coefficient column in place of
// ours, the correlation of the two common modes, R1 per satellite). The common mode is the hindcast solution of the split's calibration arcs with
// the solver of results/e13/selection.json (Amendment R1).
//
//   node steps/30-density-score.mjs --split dev|testA|testB [--selection FILE] [--out FILE]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pigeonholeBootstrap, quantile } from '../../../harness/stats.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { DAY, H, config, configPath, modulesDir, paths, readJson, amendmentsSha256 } from '../common.mjs';
import { arcCenterOffsetMs, arcsFromRows, solveCommonMode, windowMean } from '../common-mode.mjs';
import { cellsOf, densityRows, devLevels, loadDensityWindows, perSatellite, r1FromCells, spreadReduction, stormCapture, stormDays } from '../score.mjs';
import { assertDensityReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, selection: { type: 'string' }, out: { type: 'string' } } });
const P = config.planet, S = config.analysis.solver, HY = config.analysis.hypotheses, B = config.analysis.bootstrap;
const [from, to] = P.split[values.split] ?? (() => { throw new Error(`unknown split ${values.split}`); })();
assertDensityReadable(values.split);
const selection = readJson(values.selection ?? path.join(repoRoot, 'results', 'e13', 'selection.json'));
const run = startRun({ experiment: config.experiment, step: `30-density-score-${values.split}`, configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
const log = (m) => console.log(`[${run.id}] ${m}`);
const sample = readJson(path.join(path.dirname(configPath), 'planet-sample.json'));
const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);

const arcFile = (split) => path.join(paths.planetArcs, `${split}-${P.arc.profile}.jsonl`);
const readRows = (split) => { const f = arcFile(split); run.addInputs('planet-arcs', { [path.basename(f)]: sha256(fs.readFileSync(f)) }); return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
const arcOptions = { maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly };
const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
const solve = (arcs, splitStart) => solveCommonMode(arcs, { anchorMs: dayMs(splitStart) + arcCenterOffsetMs(arcs), nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, ...solverOptions });

// the solution of a split (calibration arcs) and the mean of its s-bar over the split's windows (removed as the dev level)
function hindcastOf(split, source = 'ours') {
  const rows = readRows(split);
  let arcs = arcsFromRows(rows, { ...arcOptions, hwids: sample.calibration });
  if (source === 'planet') arcs = rows.filter((r) => !r.error && sample.calibration.includes(r.hwid) && r.planetBallistic?.b > 0 && r.cdAreaOverMass > 0 && !r.nonPositive && r.sigmaB / r.cdAreaOverMass < arcOptions.maxRelativeSigma)
    .map((r) => ({ dove: r.hwid, startMs: Date.parse(r.utcA), endMs: Date.parse(r.utcB), y: -Math.log(r.planetBallistic.b), sigma: 0 }));
  const sol = solve(arcs, P.split[split][0]);
  const times = []; for (let t = dayMs(P.split[split][0]); t < dayMs(P.split[split][1]) + DAY; t += 12 * H) times.push(t);
  const vals = times.map((t) => windowMean(sol, t, t + 12 * H)).filter(Number.isFinite);
  return { sol, arcs, rows, devMeanS: vals.reduce((a, b) => a + b, 0) / vals.length };
}

const levels = devLevels();
const dev = hindcastOf('dev'), here = values.split === 'dev' ? dev : hindcastOf(values.split);
const windows = loadDensityWindows(values.split);
const sbarOf = (sol, shiftMs = 0) => (lo, hi) => windowMean(sol, lo - shiftMs, hi - shiftMs);
const rowsOf = (sol, shiftMs = 0) => densityRows(windows, levels, sbarOf(sol, shiftMs), dev.devMeanS);
const withInterval = (rows) => pigeonholeBootstrap(cellsOf(rows), r1FromCells, { resamples: B.resamples, seed: B.seed, confidence: B.confidence });

const h1rows = rowsOf(here.sol);
const h1 = spreadReduction(h1rows), h1ci = withInterval(h1rows);
const sat = perSatellite(h1rows);
const shifted = rowsOf(here.sol, HY.H6.shiftDays * DAY), h6 = spreadReduction(shifted);
const stormMap = stormDays(from, to);
const h2 = stormCapture(h1rows, new Set(stormMap.keys()));
log(`H1: R1 ${h1.R1.toFixed(3)} [${h1ci.lower.toFixed(3)}, ${h1ci.upper.toFixed(3)}] over ${h1.n} windows (sd x' ${h1.sdX.toFixed(4)} -> ${h1.sdRes.toFixed(4)}); per satellite ${Object.entries(sat).map(([k, v]) => `${k} ${v.R1.toFixed(2)} (slope ${v.slope.toFixed(2)}, r ${v.corr.toFixed(2)})`).join('; ')}`);
log(`H6 control (s-bar shifted ${HY.H6.shiftDays} d): R1 ${h6.R1.toFixed(3)} over ${h6.n} windows`);
log(`H2: ${stormMap.size} storm days (${[...stormMap].map(([d, ap]) => `${d} Ap ${ap}`).join(', ')}): ${h2.windows} windows, same sign ${(100 * h2.sameSignShare).toFixed(0)} %, median s/x' ${h2.medianCapture.toFixed(2)} over ${h2.nBig} windows with |x'| > 0.1`);

// descriptive: Planet's own ballistic coefficient column in place of ours, and the correlation of the two common modes
const planet = hindcastOf(values.split, 'planet');
const planetDev = values.split === 'dev' ? planet : hindcastOf('dev', 'planet');
const planetRows = densityRows(windows, levels, sbarOf(planet.sol), planetDev.devMeanS);
const planetR1 = spreadReduction(planetRows);
const common = h1rows.map((r) => [r.sbar, planetRows.find((q) => q.key === r.key && q.startMs === r.startMs)?.sbar]).filter(([, q]) => Number.isFinite(q));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const ma = mean(common.map((c) => c[0])), mb = mean(common.map((c) => c[1]));
const corrModes = common.reduce((s, [a, b]) => s + (a - ma) * (b - mb), 0) / Math.sqrt(common.reduce((s, [a]) => s + (a - ma) ** 2, 0) * common.reduce((s, [, b]) => s + (b - mb) ** 2, 0));
log(`descriptive: Planet's own column R1 ${planetR1.R1.toFixed(3)} over ${planetR1.n} windows; correlation of the two common modes ${corrModes.toFixed(3)}`);

// H3: held-out Doves' arcs (this split), baseline from the Dove's previous 21 days (at least 8 arcs) with s-bar removed (D13) or not (D0)
const held = arcsFromRows(here.rows, { ...arcOptions, hwids: sample.heldOut });
const byDove = new Map();
held.forEach((a) => byDove.set(a.dove, [...(byDove.get(a.dove) ?? []), a]));
const u = [];
for (const [dove, list] of byDove) {
  list.sort((x, y) => x.startMs - y.startMs);
  const sb = list.map((a) => windowMean(here.sol, a.startMs, a.endMs));
  list.forEach((a, j) => {
    const prev = list.map((q, k) => k).filter((k) => k < j && a.startMs - list[k].startMs <= S.h3BaselineDays * DAY && Number.isFinite(sb[k]));
    if (prev.length < 8 || !Number.isFinite(sb[j])) return;
    const med = (xs) => quantile(xs, 0.5);
    u.push({ dove, day: new Date(a.startMs).toISOString().slice(0, 10), u0: a.y - med(prev.map((k) => list[k].y)), u13: a.y - sb[j] - med(prev.map((k) => list[k].y - sb[k])) });
  });
}
const mad = (xs) => 1.4826 * quantile(xs.map((x) => Math.abs(x - quantile(xs, 0.5))), 0.5);
const h3cells = u.map((x) => ({ row: x.dove, col: x.day, u0: [x.u0], u13: [x.u13] }));
const expand = (cells, key) => cells.flatMap((c) => Array.from({ length: c.weight }, () => c[key][0]));
const h3stat = (cells) => 1 - mad(expand(cells, 'u13')) / mad(expand(cells, 'u0'));
const h3 = u.length ? pigeonholeBootstrap(h3cells, h3stat, { resamples: B.resamples, seed: B.seed, confidence: B.confidence }) : null;
log(`H3: held-out Doves ${u.length} arcs: R3 ${h3 ? `${h3.estimate.toFixed(3)} [${h3.lower.toFixed(3)}, ${h3.upper.toFixed(3)}]` : 'n/a'} (MAD ${u.length ? mad(u.map((x) => x.u0)).toFixed(4) : '-'} -> ${u.length ? mad(u.map((x) => x.u13)).toFixed(4) : '-'})`);

const out = {
  experiment: config.experiment, run: run.id, split: values.split, span: [from, to], solver: selection.solver, tauHours: selection.tauHours,
  arcs: { calibration: here.arcs.length, heldOut: held.length }, sigmaArc: here.sol.sigma, sweeps: here.sol.sweeps, converged: here.sol.converged,
  H1: { ...h1, interval: h1ci, perSatellite: sat, thresholdR1: HY.H1.threshold, supported: h1ci.lower > 0 && h1.R1 >= HY.H1.threshold },
  H6: { ...h6, shiftDays: HY.H6.shiftDays, passes: h6.R1 < HY.H6.maximumReduction },
  H2: { stormDays: Object.fromEntries(stormMap), windows: h2.windows, sameSignShare: h2.sameSignShare, medianCapture: h2.medianCapture, nBig: h2.nBig, list: h2.rows.map((r) => ({ key: r.key, start: new Date(r.startMs).toISOString(), xp: r.xp, sbar: r.sbar })) },
  H3: h3 ? { arcs: u.length, R3: h3.estimate, lower: h3.lower, upper: h3.upper, madD0: mad(u.map((x) => x.u0)), madD13: mad(u.map((x) => x.u13)), thresholdR3: HY.H3.threshold } : null,
  descriptive: { planetColumnR1: planetR1.R1, planetColumnWindows: planetR1.n, correlationOfCommonModes: corrModes },
};
const outFile = values.out ?? run.dir + '/density-score.json';
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);
run.finish({ H1: h1.R1, H6: h6.R1 });
log(`wrote ${outFile}`);
