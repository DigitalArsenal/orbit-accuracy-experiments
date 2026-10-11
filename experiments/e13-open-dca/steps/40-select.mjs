// E13 step 40: the solver configuration and the forecast time constant, chosen on the development split only (PLAN.md section 4.3, Amendment R1).
//   1  solver: the candidate (24 h or 12 h nodes x baselines of 3 block lengths or 4 random-walk step sizes) with the smallest pooled standard
//      deviation of x' - s-bar over the dev split's 12 h windows of Swarm A, B, C and GRACE-FO 1 (hindcast: the whole dev split's calibration arcs);
//   2  tau: with that solver, the candidate in {12 h, 48 h, held} with the smallest pooled root-mean-square of the density change that the nowcast +
//      forecast leaves unpredicted: for issue times 00:00 UTC every second day once 30 days of arcs exist, each 12 h window of the next 72 h less the
//      windows of the 24 h before the issue time (in which a propagation fits Cd*A/m), against the same change of the forecast common mode.
// A candidate within `tieBand` (2 %) of the smallest sd is tied with it, and ties go to 24 h nodes, then the weaker smoothing, then the random walk over blocks, then
// the smaller q (or the longer block); tau is chosen by the smallest pooled root-mean-square of the unpredicted change (Amendment R2). Writes results/e13/selection.json.
//
//   node steps/40-select.mjs [--arcs FILE] [--out FILE] [--through YYYY-MM-DD]     (--through and a non-default --out are for development runs)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { DAY, H, config, configPath, modulesDir, paths, amendmentsSha256 } from '../common.mjs';
import { arcCenterOffsetMs, arcsFromRows, forecastMean, nowcast, solveCommonMode, windowMean, withLag } from '../common-mode.mjs';
import { devLevels, densityRows, loadDensityWindows, sd, spreadReduction } from '../score.mjs';

const { values } = parseArgs({ options: { arcs: { type: 'string' }, out: { type: 'string' }, through: { type: 'string' } } });
const P = config.planet, S = config.analysis.solver;
const sample = JSON.parse(fs.readFileSync(new URL('../planet-sample.json', import.meta.url), 'utf8'));
const arcsFile = values.arcs ?? path.join(paths.planetArcs, `dev-${P.arc.profile}.jsonl`);
const raw = fs.readFileSync(arcsFile, 'utf8');
const run = startRun({ experiment: config.experiment, step: '40-select', configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
run.addInputs('planet-arcs', { [path.basename(arcsFile)]: sha256(Buffer.from(raw)) });
const through = values.through ? Date.parse(`${values.through}T00:00:00Z`) + DAY : Date.parse(`${P.split.dev[1]}T00:00:00Z`) + DAY;
const rows = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const arcs = arcsFromRows(rows, { hwids: sample.calibration, maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly }).filter((a) => a.endMs <= through);
const devStart = Date.parse(`${P.split.dev[0]}T00:00:00Z`);
const log = (m) => console.log(`[${run.id}] ${m}`);
log(`${arcs.length} arcs of ${new Set(arcs.map((a) => a.dove)).size} calibration Doves through ${new Date(Math.max(...arcs.map((a) => a.endMs))).toISOString()}`);

const windows = loadDensityWindows('dev'), levels = devLevels();
const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
const candidates = [];
const smooths = S.smoothSigmaCandidates ?? [null];                                                // the prior on the common mode (Amendment R2); null: none
for (const nodeHours of S.nodeHoursCandidates.slice().sort((a, b) => b - a)) {                  // 24 h first: ties go to it
  for (const q of S.baselineStepSigmaCandidates.slice().sort((a, b) => a - b)) for (const smoothSigma of smooths) candidates.push({ nodeHours, baseline: { kind: 'randomWalk', stepSigma: q }, smoothSigma, label: `${nodeHours} h nodes, random walk q ${q}, smoothing ${smoothSigma ?? 'none'}` });
  for (const days of S.baselineBlockDaysCandidates.slice().sort((a, b) => b - a)) candidates.push({ nodeHours, baseline: { kind: 'blocks', days }, smoothSigma: null, label: `${nodeHours} h nodes, blocks of ${days} d` });
}

// 1. solver (and the lag with which the common mode is read: 0 unless Amendment R2 gives candidates)
const anchorMs = devStart + arcCenterOffsetMs(arcs);
const lags = (process.env.E13_LAGS ? process.env.E13_LAGS.split(',').map(Number) : S.lagHoursCandidates ?? [0]).slice().sort((a, b) => a - b);      // E13_LAGS: a development run only; the committed selection names the candidates it used
const hindcast = [];
for (const c of candidates) {
  let sol = null, failure = null;
  try { sol = solveCommonMode(arcs, { anchorMs, nodeHours: c.nodeHours, baseline: c.baseline, smoothSigma: c.smoothSigma, ...solverOptions }); } catch (e) { failure = String(e.message ?? e); }
  for (const lagHours of lags) {
    let entry;
    if (failure) entry = { ...c, lagHours, error: failure };
    else {
      const lagged = withLag(sol, lagHours);
      const raw0 = densityRows(windows, levels, (lo, hi) => windowMean(lagged, lo, hi));
      const devMeanS = raw0.reduce((a, r) => a + r.sbar, 0) / raw0.length;
      const r = densityRows(windows, levels, (lo, hi) => windowMean(lagged, lo, hi), devMeanS).filter((x) => x.startMs < through);
      const spread = spreadReduction(r);
      entry = { ...c, lagHours, windows: r.length, sdX: spread.sdX, sdResidual: spread.sdRes, R1: spread.R1, sigmaArc: sol.sigma, sweeps: sol.sweeps, converged: sol.converged };
    }
    hindcast.push(entry);
    log(`solver ${c.label}, lag ${lagHours} h: ${entry.error ? `ERROR ${entry.error}` : `sd(x'-s) ${entry.sdResidual.toFixed(4)} of sd(x') ${entry.sdX.toFixed(4)}, R1 ${entry.R1.toFixed(3)} (${entry.windows} windows, sigma_arc ${entry.sigmaArc.toFixed(3)}, ${entry.sweeps} sweeps${entry.converged ? '' : ', NOT converged'})`}`);
  }
}
const valid = hindcast.filter((h) => !h.error && Number.isFinite(h.sdResidual));
const smallest = Math.min(...valid.map((h) => h.sdResidual));
const tieBand = S.tieBand ?? 0.02;
const tied = valid.filter((h) => h.sdResidual <= smallest * (1 + tieBand));
const preference = (h) => [-h.nodeHours, -(h.smoothSigma ?? Infinity), h.baseline.kind === 'randomWalk' ? 0 : 1, h.baseline.kind === 'randomWalk' ? h.baseline.stepSigma : -h.baseline.days, h.lagHours];
const before = (a, b) => { const pa = preference(a), pb = preference(b); for (let i = 0; i < pa.length; ++i) { if (pa[i] !== pb[i]) return pa[i] < pb[i]; } return false; };
const chosen = tied.reduce((best, h) => (before(h, best) ? h : best));
log(`smallest sd ${smallest.toFixed(4)} (${valid.find((h) => h.sdResidual === smallest).label}); ${tied.length} candidates within ${100 * tieBand} %; chosen solver: ${chosen.label}, lag ${chosen.lagHours} h`);

// 2. tau
const nowOptions = { latencyHours: S.nowcast.latencyHours, historyDays: S.nowcast.historyDays, nodeHours: chosen.nodeHours, baseline: chosen.baseline, smoothSigma: chosen.smoothSigma, lagHours: chosen.lagHours, ...solverOptions };
const taus = config.analysis.forecast.tauHoursCandidates;
const issues = [];
for (let t = devStart + S.nowcast.historyDays * DAY; t + 3 * DAY <= through; t += 2 * DAY) issues.push(t);
const tauRows = Object.fromEntries(taus.map((tau) => [String(tau), []]));
for (const t0 of issues) {
  const sol = nowcast(arcs, t0, nowOptions);
  if (!sol) continue;
  // What a propagation sees: the change of the density from the window in which Cd*A/m is fitted (the 24 h before the issue time, known from the orbit) to
  // each window of the next 72 h, d = x_w - mean(x over the fit windows), against the change that the nowcast + forecast predicts, s_w - s over the fit window.
  for (const [key, list] of Object.entries(windows)) {
    const at = (t) => list.find((w) => w.startMs === t)?.x ?? null;
    const fit = [at(t0 - DAY), at(t0 - DAY + 12 * H)];
    if (fit.some((v) => v === null)) continue;
    const xFit = (fit[0] + fit[1]) / 2;
    for (const w of list) {
      if (w.x === null || w.startMs < t0 || w.startMs + 12 * H > t0 + 3 * DAY) continue;
      for (const tau of taus) {
        const sb = forecastMean(sol, w.startMs, w.startMs + 12 * H, tau), sFit = forecastMean(sol, t0 - DAY, t0, tau);
        if (Number.isFinite(sb) && Number.isFinite(sFit)) tauRows[String(tau)].push({ key, lead: (w.startMs - t0) / DAY, res: (w.x - xFit) - (sb - sFit), none: w.x - xFit });
      }
    }
  }
}
const tauTable = taus.map((tau) => {
  const r = tauRows[String(tau)];
  return { tauHours: tau, windows: r.length, sdResidual: sd(r.map((x) => x.res)), rmsResidual: Math.sqrt(r.reduce((a, x) => a + x.res * x.res, 0) / r.length), sdNoCorrection: sd(r.map((x) => x.none)), rmsNoCorrection: Math.sqrt(r.reduce((a, x) => a + x.none * x.none, 0) / r.length) };
});
tauTable.forEach((t) => log(`tau ${t.tauHours ?? 'held'}: ${t.windows} windows, rms of the unpredicted change ${t.rmsResidual.toFixed(4)} (no correction: ${t.rmsNoCorrection.toFixed(4)})`));
const order = (tau) => (tau === null ? Infinity : tau);
const tauValid = tauTable.filter((t) => Number.isFinite(t.rmsResidual));
const tauChosen = tauValid.length ? tauValid.reduce((best, t) => (t.rmsResidual < best.rmsResidual - 1e-12 || (Math.abs(t.rmsResidual - best.rmsResidual) <= 1e-12 && order(t.tauHours) < order(best.tauHours)) ? t : best)) : { tauHours: undefined };
log(`chosen tau: ${tauChosen.tauHours === undefined ? '(no issue day yet: development run)' : tauChosen.tauHours ?? 'held'}`);

const out = {
  experiment: config.experiment, run: run.id, decided: new Date().toISOString(), through: new Date(through - DAY).toISOString().slice(0, 10), arcsFile: path.basename(arcsFile), arcs: arcs.length,
  rule: 'PLAN.md 4.3 and Amendments R1, R2: among the solver candidates within 2 % of the smallest pooled standard deviation of x\' - s-bar over the dev windows, the first in the order 24 h nodes, weaker smoothing, random walk, smaller q; tau with the smallest pooled root-mean-square of the density change over the next 72 h, from the 24 h before the issue time, that the nowcast + forecast common mode leaves unpredicted',
  tieBand, tiedCandidates: tied.map((h) => h.label), solverCandidates: hindcast, solver: { nodeHours: chosen.nodeHours, baseline: chosen.baseline, smoothSigma: chosen.smoothSigma, label: chosen.label }, lagHours: chosen.lagHours,
  tauCandidates: tauTable, tauHours: tauChosen.tauHours, issues: issues.length,
};
const outFile = values.out ?? path.join(repoRoot, 'results', 'e13', 'selection.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);
run.finish({ selection: out.solver, tauHours: out.tauHours });
log(`wrote ${outFile}`);
