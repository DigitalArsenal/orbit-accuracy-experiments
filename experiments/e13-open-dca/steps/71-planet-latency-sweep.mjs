// E13 step 71 (EXPLORATORY, PLAN.md Amendment S2; outside H1-H6): does a fresher Planet nowcast forecast better? The dev forecast has no skill (rms of the density
// change over the next 72 h that is left unpredicted: 0.1191 without a correction), and the newest daily arc is 21-25 h old at the issue time. Here the latency
// between the newest arc and the issue time is swept (0, 3, 6, 12, 24, 30 h), with the dev density of Swarm A, B, C and GRACE-FO 1 as truth: the same statistic as
// the dev selection (steps/40-select.mjs), the same solver. Planet's states arrive as one batch a day whose time of day changes between periods (the arcs end at
// 19-20 UTC in October, 00-01 UTC in November, 19-20 UTC in December), so the age of the newest batch at an issue time of 00:00 or 12:00 UTC (--issue-hours 0,12)
// ranges from 5 to 23 h at latency 0; each record carries the age it actually had, and the zero-latency records are also pooled by that age. A negative latency is a POSITIVE (look-ahead) CONTROL, not a
// forecast: it hands the solver arcs that end after the issue time (-1 h: the first of the batch; -12 h and -24 h: the whole batch), to show that the pipeline
// can score a gain when the correction sees the change it has to predict. The same sweep is scored a second time against the fleet's own non-causal hindcast as
// truth, which is the only truth the Starlink run (steps/70) can have; the difference between the two columns is the calibration of that version. Dev windows only.
//
//   node steps/71-planet-latency-sweep.mjs [--latencies=-24,-12,-1,0,3,6,12,24,30] [--issue-hours 0,12] [--out FILE]      (default out: results/e13/dev/exploratory-planet-latency.json)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { DAY, H, config, paths, readJson } from '../common.mjs';
import { arcCenterOffsetMs, arcsFromRows, forecastMean, nowcast, solveCommonMode, windowMean } from '../common-mode.mjs';
import { boot, latencyStatistic, loadDensityWindows } from '../score.mjs';

const { values } = parseArgs({ options: { latencies: { type: 'string', default: '-24,-12,-1,0,3,6,12,24,30' }, 'issue-hours': { type: 'string', default: '0,12' }, out: { type: 'string' } } });
const P = config.planet, S = config.analysis.solver;
const selection = readJson(path.join(repoRoot, 'results', 'e13', 'selection.json'));
const sample = readJson(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'planet-sample.json'));
const [devFrom, devTo] = P.split.dev, devStart = Date.parse(`${devFrom}T00:00:00Z`), devEnd = Date.parse(`${devTo}T00:00:00Z`) + DAY;
const rows = fs.readFileSync(path.join(paths.planetArcs, `dev-${P.arc.profile}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const arcs = arcsFromRows(rows, { hwids: sample.calibration, maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly }).filter((a) => a.endMs <= devEnd);
const windows = loadDensityWindows('dev');
const taus = config.analysis.forecast.tauHoursCandidates;
const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
const common = { nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, smoothSigma: selection.solver.smoothSigma ?? null, ...solverOptions };
const BLOCK = 6 * DAY;                                                                  // issue times 2 days apart share forecast windows: blocks of 6 days for the interval

// the fleet's own hindcast of the whole dev split: the truth of the second column
const hind = solveCommonMode(arcs, { anchorMs: devStart + arcCenterOffsetMs(arcs), ...common });
const results = [], zeroSwarm = [], zeroOwn = [];
for (const hour of values['issue-hours'].split(',').map(Number)) for (const L of values.latencies.split(',').map(Number)) {
  const swarm = [], own = [], ages = [];
  let issues = 0;
  for (let t0 = devStart + S.nowcast.historyDays * DAY + hour * H; t0 + 3 * DAY <= devEnd; t0 += 2 * DAY) {
    const sol = nowcast(arcs, t0, { latencyHours: L, historyDays: S.nowcast.historyDays, ...common });
    if (!sol) continue;
    ++issues; const age = (t0 - sol.latestArcEndMs) / H; ages.push(age);
    const block = Math.floor((t0 - devStart) / BLOCK), period = t0 < Date.parse('2025-12-01T00:00:00Z') ? 'Oct 31 - Nov' : 'Dec';
    const predicted = (t, tau) => { const sb = forecastMean(sol, t, t + 12 * H, tau), sFit = forecastMean(sol, t0 - DAY, t0, tau); return Number.isFinite(sb) && Number.isFinite(sFit) ? sb - sFit : NaN; };
    const errs = (d, t) => Object.fromEntries(taus.map((tau) => [String(tau), d - predicted(t, tau)]));
    // truth 1: the Swarm and GRACE-FO densities (x: 12 h window mean of ln(rho_observed / rho_JB2008)), relative to their mean over the 24 h before the issue time
    for (const list of Object.values(windows)) {
      const at = (t) => list.find((w) => w.startMs === t)?.x ?? null;
      const fit = [at(t0 - DAY), at(t0 - DAY + 12 * H)];
      if (fit.some((v) => v === null)) continue;
      const xFit = (fit[0] + fit[1]) / 2;
      for (const w of list) {
        if (w.x === null || w.startMs < t0 || w.startMs + 12 * H > t0 + 3 * DAY) continue;
        swarm.push({ block, t0, age, period, hour, lead: (w.startMs - t0) / DAY, ref: w.x - xFit, errs: errs(w.x - xFit, w.startMs) });
      }
    }
    // truth 2: the hindcast's own 12 h window means, relative to the same 24 h
    const hFit = [windowMean(hind, t0 - DAY, t0 - DAY + 12 * H), windowMean(hind, t0 - DAY + 12 * H, t0)];
    if (hFit.every(Number.isFinite)) {
      const hMean = (hFit[0] + hFit[1]) / 2;
      for (let t = t0; t < t0 + 3 * DAY; t += 12 * H) {
        const truth = windowMean(hind, t, t + 12 * H);
        if (Number.isFinite(truth)) own.push({ block, t0, age, period, hour, lead: (t - t0) / DAY, ref: truth - hMean, errs: errs(truth - hMean, t) });
      }
    }
  }
  ages.sort((a, b) => a - b);
  if (L === 0) { zeroSwarm.push(...swarm); zeroOwn.push(...own); }
  const entry = { issueHourUtc: hour, latencyHours: L, lookAheadControl: L < 0, newestArcAgeHours: { p10: ages[Math.floor(0.1 * (ages.length - 1))], median: ages[ages.length >> 1], p90: ages[Math.ceil(0.9 * (ages.length - 1))] }, issues, swarmTruth: latencyStatistic(swarm, taus), hindcastTruth: latencyStatistic(own, taus) };
  results.push(entry);
  const line = (name, st) => `${name}: ${st.windows} windows, no correction ${st.rmsNoCorrection.toFixed(4)}; ${taus.map((t) => { const b = st.byTau[String(t)]; return `tau ${t ?? 'held'} ${b.rmsUnpredicted.toFixed(4)} (${b.ratio.toFixed(3)}${b.lower === null ? '' : ` [${b.lower.toFixed(3)}, ${b.upper.toFixed(3)}]`})`; }).join('; ')}`;
  console.log(`issue ${String(hour).padStart(2, '0')}:00 UTC, latency ${String(L).padStart(3)} h${L < 0 ? ' (LOOK-AHEAD CONTROL)' : ''} (newest arc ${entry.newestArcAgeHours.p10.toFixed(1)} / ${entry.newestArcAgeHours.median.toFixed(1)} / ${entry.newestArcAgeHours.p90.toFixed(1)} h old at issue (p10 / median / p90), ${issues} issues)`);
  console.log(`   ${line('Swarm/GRACE-FO truth', entry.swarmTruth)}`);
  console.log(`   ${line('own hindcast truth ', entry.hindcastTruth)}`);
}

// Zero latency pooled by the age the newest batch actually had (the issue hours 0 and 12 are different times, so no window is counted twice).
const ageBins = [[0, 8], [8, 16], [16, 30]];
const byAge = ageBins.map(([lo, hi]) => ({ ageHours: `${lo}-${hi}`, swarmTruth: latencyStatistic(zeroSwarm.filter((r) => r.age >= lo && r.age < hi), taus), hindcastTruth: latencyStatistic(zeroOwn.filter((r) => r.age >= lo && r.age < hi), taus) }));
for (const b of byAge) {
  const f = (st) => st.windows ? `${st.windows} windows, no correction ${st.rmsNoCorrection.toFixed(4)}; ${taus.map((t) => `tau ${t ?? 'held'} ${st.byTau[String(t)].ratio.toFixed(3)}`).join('; ')}` : 'no windows';
  console.log(`zero latency, newest batch ${b.ageHours} h old: Swarm/GRACE-FO truth ${f(b.swarmTruth)} | hindcast truth ${f(b.hindcastTruth)}`);
}

// The same, by period and issue hour, which fixes the age of the newest batch within a period (the batch's time of day is the same all month): this separates age from the
// month's weather.
const regimes = [];
for (const period of ['Oct 31 - Nov', 'Dec']) for (const hour of [0, 12]) {
  const at = (r) => r.period === period && r.hour === hour;
  const fourDay = (r) => ({ ...r, block: Math.floor((r.t0 - devStart) / (4 * DAY)) });                  // a regime has 15 issues two days apart: blocks of 4 days
  const sw = zeroSwarm.filter(at).map(fourDay), ow = zeroOwn.filter(at).map(fourDay);
  if (!sw.length) continue;
  const ageH = sw.map((r) => r.age).sort((a, b) => a - b);
  const entry = { period, issueHourUtc: hour, medianNewestArcAgeHours: ageH[ageH.length >> 1], swarmTruth: latencyStatistic(sw, taus), hindcastTruth: latencyStatistic(ow, taus) };
  regimes.push(entry);
  console.log(`zero latency, ${period}, issue ${String(hour).padStart(2, '0')}:00 UTC (newest batch ${entry.medianNewestArcAgeHours.toFixed(1)} h old): Swarm/GRACE-FO truth ${entry.swarmTruth.windows} windows, no correction ${entry.swarmTruth.rmsNoCorrection.toFixed(4)}; ratios ${taus.map((t) => { const b = entry.swarmTruth.byTau[String(t)]; return `tau ${t ?? 'held'} ${b.ratio.toFixed(3)}${b.lower === null ? '' : ` [${b.lower.toFixed(3)}, ${b.upper.toFixed(3)}]`}`; }).join('; ')} | hindcast truth ${taus.map((t) => `${entry.hindcastTruth.byTau[String(t)].ratio.toFixed(3)}`).join(' / ')}`);
}

// The ceiling of any such forecast. The correction predicts the change of the density from the day before; with every latency at zero (the hindcast: the common
// mode of arcs on both sides of the window) it can remove at most the share r^2 of the variance of that change that the common mode's own change explains, so the
// unpredicted rms cannot go below sqrt(1 - r^2) of the rms without a correction. r is the Pearson correlation of the change of x (one satellite's 12 h window mean
// of ln(rho_observed / rho_JB2008)) over k windows with the change of the hindcast's window mean, pooled over Swarm A, B, C and GRACE-FO 1 on the dev split.
const changeCorrelation = [];
for (const k of [1, 2, 4]) {
  const cells = [];
  for (const [key, list] of Object.entries(windows)) {
    const byStart = new Map(list.filter((w) => w.x !== null).map((w) => [w.startMs, w.x]));
    for (const [startMs, x] of byStart) {
      const before = byStart.get(startMs - k * 12 * H);
      if (before === undefined) continue;
      const s1 = windowMean(hind, startMs, startMs + 12 * H), s0 = windowMean(hind, startMs - k * 12 * H, startMs - k * 12 * H + 12 * H);
      if (Number.isFinite(s1) && Number.isFinite(s0)) cells.push({ row: Math.floor((startMs - devStart) / BLOCK), col: key, dx: x - before, ds: s1 - s0 });
    }
  }
  const stat = (cs) => {
    let w = 0, mx = 0, ms = 0; for (const c of cs) { w += c.weight; mx += c.weight * c.dx; ms += c.weight * c.ds; } mx /= w; ms /= w;
    let sxx = 0, sss = 0, sxs = 0; for (const c of cs) { sxx += c.weight * (c.dx - mx) ** 2; sss += c.weight * (c.ds - ms) ** 2; sxs += c.weight * (c.dx - mx) * (c.ds - ms); }
    return sxs / Math.sqrt(sxx * sss);
  };
  const r = boot(cells, stat);
  const sx = Math.sqrt(cells.reduce((a, c) => a + c.dx ** 2, 0) / cells.length), ss = Math.sqrt(cells.reduce((a, c) => a + c.ds ** 2, 0) / cells.length);
  changeCorrelation.push({ hoursApart: k * 12, windows: cells.length, correlation: r.estimate, lower: r.lower, upper: r.upper, rmsChangeOfDensity: sx, rmsChangeOfCommonMode: ss, ceilingRatio: Math.sqrt(1 - Math.max(0, r.estimate) ** 2) });
  console.log(`change over ${k * 12} h: ${cells.length} windows, r(density change, common-mode change) = ${r.estimate.toFixed(3)} [${r.lower.toFixed(3)}, ${r.upper.toFixed(3)}]; rms change ${sx.toFixed(4)} (density), ${ss.toFixed(4)} (common mode); the unpredicted rms cannot go below ${(Math.sqrt(1 - Math.max(0, r.estimate) ** 2)).toFixed(3)} of the uncorrected one`);
}
const outFile = values.out ?? path.join(repoRoot, 'results', 'e13', 'dev', 'exploratory-planet-latency.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify({ exploratory: true, amendment: 'S2', split: 'dev', truths: ['Swarm A, B, C and GRACE-FO 1 densities (dev windows)', 'the fleet\'s own non-causal hindcast of the dev split (12 h windows)'], solver: selection.solver, taus, blockDays: BLOCK / DAY, byNewestBatchAgeAtZeroLatency: byAge, byPeriodAndIssueHourAtZeroLatency: regimes, changeCorrelation, results }, null, 1)}\n`);
console.log(`wrote ${outFile}`);
