// E13 step 40: the solver configuration and the forecast time constant, chosen on the development split only (PLAN.md section 4.3, Amendment R1).
//   1  solver: the candidate (24 h or 12 h nodes x baselines of 3 block lengths or 4 random-walk step sizes) with the smallest pooled standard
//      deviation of x' - s-bar over the dev split's 12 h windows of Swarm A, B, C and GRACE-FO 1 (hindcast: the whole dev split's calibration arcs);
//   2  tau: with that solver, the candidate in {12 h, 48 h, held} with the smallest pooled standard deviation of the dev density residuals of the
//      nowcast + forecast, over the windows from the issue time to 72 h later, for issue times 00:00 UTC every second day once 30 days of arcs
//      exist (the density level of each issue is the mean of x over the nowcast's own span).
// Ties go to 24 h nodes, the random walk, the smaller q (or the longer block), the shorter tau. Writes results/e13/selection.json.
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
const chosen = valid.reduce((best, h) => (h.sdResidual < best.sdResidual - 1e-12 ? h : best));
log(`chosen solver: ${chosen.label}, lag ${chosen.lagHours} h`);

// 2. tau
const nowOptions = { latencyHours: S.nowcast.latencyHours, historyDays: S.nowcast.historyDays, nodeHours: chosen.nodeHours, baseline: chosen.baseline, smoothSigma: chosen.smoothSigma, lagHours: chosen.lagHours, ...solverOptions };
const taus = config.analysis.forecast.tauHoursCandidates;
const issues = [];
for (let t = devStart + S.nowcast.historyDays * DAY; t + 3 * DAY <= through; t += 2 * DAY) issues.push(t);
const tauRows = Object.fromEntries(taus.map((tau) => [String(tau), []]));
for (const t0 of issues) {
  const sol = nowcast(arcs, t0, nowOptions);
  if (!sol) continue;
  const first = sol.nodeMs[sol.supported.indexOf(true)], last = sol.nodeMs[sol.supported.lastIndexOf(true)];
  for (const [key, list] of Object.entries(windows)) {
    const inSpan = list.filter((w) => w.x !== null && w.startMs >= first && w.startMs + 12 * H <= last);
    if (inSpan.length < 20) continue;
    const level = inSpan.reduce((a, w) => a + w.x, 0) / inSpan.length;
    for (const w of list) {
      if (w.x === null || w.startMs < t0 || w.startMs + 12 * H > t0 + 3 * DAY) continue;
      for (const tau of taus) {
        const sb = forecastMean(sol, w.startMs, w.startMs + 12 * H, tau);
        if (Number.isFinite(sb)) tauRows[String(tau)].push({ key, lead: (w.startMs - t0) / DAY, res: (w.x - level) - sb, none: w.x - level });
      }
    }
  }
}
const tauTable = taus.map((tau) => {
  const r = tauRows[String(tau)];
  return { tauHours: tau, windows: r.length, sdResidual: sd(r.map((x) => x.res)), rmsResidual: Math.sqrt(r.reduce((a, x) => a + x.res * x.res, 0) / r.length), sdNoCorrection: sd(r.map((x) => x.none)) };
});
tauTable.forEach((t) => log(`tau ${t.tauHours ?? 'held'}: ${t.windows} windows, sd(residual) ${t.sdResidual.toFixed(4)} (no correction ${t.sdNoCorrection.toFixed(4)})`));
const order = (tau) => (tau === null ? Infinity : tau);
const tauValid = tauTable.filter((t) => Number.isFinite(t.sdResidual));
const tauChosen = tauValid.length ? tauValid.reduce((best, t) => (t.sdResidual < best.sdResidual - 1e-12 || (Math.abs(t.sdResidual - best.sdResidual) <= 1e-12 && order(t.tauHours) < order(best.tauHours)) ? t : best)) : { tauHours: undefined };
log(`chosen tau: ${tauChosen.tauHours === undefined ? '(no issue day yet: development run)' : tauChosen.tauHours ?? 'held'}`);

const out = {
  experiment: config.experiment, run: run.id, decided: new Date().toISOString(), through: new Date(through - DAY).toISOString().slice(0, 10), arcsFile: path.basename(arcsFile), arcs: arcs.length,
  rule: 'PLAN.md 4.3 and Amendment R1: the solver candidate with the smallest pooled standard deviation of x\' - s-bar over the dev windows; tau with the smallest pooled standard deviation of the nowcast+forecast residuals over 0-72 h',
  solverCandidates: hindcast, solver: { nodeHours: chosen.nodeHours, baseline: chosen.baseline, smoothSigma: chosen.smoothSigma, label: chosen.label }, lagHours: chosen.lagHours,
  tauCandidates: tauTable, tauHours: tauChosen.tauHours, issues: issues.length,
};
const outFile = values.out ?? path.join(repoRoot, 'results', 'e13', 'selection.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);
run.finish({ selection: out.solver, tauHours: out.tauHours });
log(`wrote ${outFile}`);
