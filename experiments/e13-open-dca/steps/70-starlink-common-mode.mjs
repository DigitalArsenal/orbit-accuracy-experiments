// E13 step 70 (EXPLORATORY, PLAN.md Amendment S2; outside H1-H6): is latency, or the method, what limits the forecast? The Planet forecast has no skill (step 71): its
// newest daily node is 9-21 h old at the issue time and the node is the mean of a 24 h arc. The same common-mode solve, run on the Starlink version pairs (Method B:
// Cd*A/m from the energy that separates two consecutive versions' start states, one pair per satellite every ~7 h, available ~0.4 h after the new version's start), is
// nowcast with a latency L between the newest pair and the issue time and forecast over the next 72 h. Two scores, both causal, neither with an outside truth (Swarm and
// GRACE-FO densities arrive 49-92 days late and the splits end 2026-07-31):
//   hindcast   the truth is the same fleet's non-causal hindcast (all pairs): the statistic of step 71's second column, so the two can be read side by side; it is
//              smooth by construction and shares the fit window's pairs with the nowcast, which flatters the forecast (step 71 measures by how much).
//   held-out   the satellites are split in halves by NORAD parity; one half calibrates the nowcast, the other is never in a solve and is predicted: for each of its pairs in
//              the next 72 h, y_j = ln Cd*A/m (the observation itself, not a smoothed truth) is predicted by the satellite's own mean over the 24 h before the issue time
//              (what a propagation without a correction assumes) or by that mean plus the change of the nowcast + forecast s from those pairs to the pair. Both directions pooled.
// The statistic is the root-mean-square of what is left of the change against the root-mean-square of the change (the ratio is below 1 where the correction helps).
//
//   node steps/70-starlink-common-mode.mjs [--latencies 1,3,6,12,24,36] [--history 4] [--node-hours 6] [--prior-scales 1,0.5,2] [--bands all,0-350,350-450,450-700] [--through ISO] [--out DIR]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { DAY, H, config, paths, readJson } from '../common.mjs';
import { forecastMean, nowcast, solveCommonMode, windowMean } from '../common-mode.mjs';
import { latencyStatistic } from '../score.mjs';
import { heldOutRecords } from '../combined.mjs';

const { values } = parseArgs({ options: { latencies: { type: 'string', default: '1,3,6,12,24,36' }, history: { type: 'string', default: '4' }, 'node-hours': { type: 'string', default: '6' }, 'prior-scales': { type: 'string', default: '1,0.5,2' }, bands: { type: 'string', default: 'all,0-350,350-450,450-700' }, through: { type: 'string' }, out: { type: 'string' } } });
const S = config.analysis.solver;
const selection = readJson(path.join(repoRoot, 'results', 'e13', 'selection.json'));
const nodeHours = Number(values['node-hours']), historyDays = Number(values.history);
const latencies = values.latencies.split(',').map(Number), taus = config.analysis.forecast.tauHoursCandidates;
const sampleFile = readJson(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'sample.json'));
const through = values.through ? Date.parse(values.through) : Infinity;
const win = nodeHours * H, BLOCK = 2 * DAY, MINIMUM_PAIRS = 100;

// ── the pairs of the decaying strata that are a clean drag measurement (Amendment S2, item 3) ──
const all = [];
const seen = new Set();
if (fs.existsSync(paths.pairs)) for (const dir of fs.readdirSync(paths.pairs)) for (const f of fs.readdirSync(path.join(paths.pairs, dir))) {
  const p = readJson(path.join(paths.pairs, dir, f));
  const key = `${p.norad}|${p.t1}`;
  if (p.kind !== 'e13-pair' || seen.has(key) || !p.methodB || Date.parse(p.t1) > through) continue;
  seen.add(key);
  const B = p.methodB.cdAreaOverMass;
  if (!(p.hoursBetween >= 5 && p.hoursBetween <= 9) || !sampleFile.satellites[p.norad]?.startsWith('decay') || !(B > 0.002 && B < 0.5) || !(Math.abs(p.methodB.checkMismatchJkg ?? 1e9) < 1) || !(p.energyJkg.predictedChange <= -20)) continue;
  all.push({ dove: String(p.norad), startMs: Date.parse(p.t0), endMs: Date.parse(p.t1), y: Math.log(B), altKm: p.geodeticAltitudeKm?.oldT0 ?? NaN, availableMs: p.next?.createdMs ?? Date.parse(p.t1) });
}
console.log(`${all.length} clean decaying-stratum pairs of ${new Set(all.map((a) => a.dove)).size} satellites`);
const lags = all.map((a) => (a.availableMs - a.endMs) / H).sort((a, b) => a - b);
if (lags.length) console.log(`a new version is created ${lags[lags.length >> 1].toFixed(2)} h (median) after its start state, the end of its pair`);
if (all.length < MINIMUM_PAIRS) { console.log(`too few pairs for the exploratory analysis (${MINIMUM_PAIRS} needed)`); process.exit(0); }

const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
const bands = values.bands.split(',').map((b) => (b === 'all' ? { label: 'all', lo: -Infinity, hi: Infinity } : (([lo, hi]) => ({ label: b, lo, hi }))(b.split('-').map(Number))));
const rms = (xs) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
const results = [];

for (const band of bands) {
  const arcs = all.filter((a) => a.altKm >= band.lo && a.altKm < band.hi || band.label === 'all');
  if (arcs.length < MINIMUM_PAIRS) { console.log(`band ${band.label}: ${arcs.length} pairs, skipped (${MINIMUM_PAIRS} needed)`); continue; }
  const first = Math.min(...arcs.map((a) => a.startMs)), last = Math.max(...arcs.map((a) => a.endMs));
  const T0 = Math.floor(first / DAY) * DAY;                                      // nodes every nodeHours from 00:00 UTC of the first day
  const issues = [];
  for (let t0 = Math.ceil((first + historyDays * DAY) / (6 * H)) * 6 * H; t0 + 3 * DAY <= last; t0 += 6 * H) issues.push(t0);
  const sats = new Set(arcs.map((a) => a.dove));
  console.log(`band ${band.label} km: ${arcs.length} pairs of ${sats.size} satellites, ${new Date(first).toISOString()} to ${new Date(last).toISOString()}, ${issues.length} issue times`);
  if (!issues.length) continue;
  for (const scale of values['prior-scales'].split(',').map(Number)) {
    // the dev-selected prior (a step of selection.solver.smoothSigma per 24 h), rescaled to the node spacing as a random walk; scale 1 is the pre-specified one, 0.5 and 2 are sensitivity runs
    const smoothSigma = (selection.solver.smoothSigma ?? 0.05) * Math.sqrt(nodeHours / 24) * scale;
    const common = { nodeHours, baseline: selection.solver.baseline, smoothSigma, ...solverOptions };
    const hind = solveCommonMode(arcs, { anchorMs: T0, ...common });
    const head = { band: band.label, priorScale: scale, smoothSigma, pairs: arcs.length, satellites: sats.size, issues: issues.length, hindcast: { supportedNodes: hind.supported.filter(Boolean).length, nodes: hind.supported.length, pairScatter: hind.sigma, converged: hind.converged } };
    console.log(` prior scale ${scale} (step ${smoothSigma.toFixed(4)} per node): hindcast ${hind.supported.filter(Boolean).length} of ${hind.supported.length} nodes supported, robust pair scatter ${hind.sigma.toFixed(3)}${hind.converged ? '' : ' (not converged)'}`);
    for (const L of latencies) {
      const own = [], held = [];
      for (const t0 of issues) {
        const block = Math.floor((t0 - first) / BLOCK);
        // hindcast truth: the change of the fleet's window means from the 24 h before the issue time
        let sol = null;
        try { sol = nowcast(arcs, t0, { latencyHours: L, historyDays, anchorMs: T0, ...common }); } catch { /* too thin a window: no nowcast at this issue time */ }
        if (sol) {
          const fit = []; for (let t = t0 - DAY; t < t0; t += win) fit.push(windowMean(hind, t, t + win));
          if (fit.every(Number.isFinite)) {
            const truthFit = mean(fit);
            for (let t = t0; t < t0 + 3 * DAY; t += win) {
              const truth = windowMean(hind, t, t + win);
              if (!Number.isFinite(truth)) continue;
              const d = truth - truthFit;
              own.push({ block, lead: (t - t0) / DAY, ref: d, errs: Object.fromEntries(taus.map((tau) => { const sb = forecastMean(sol, t, t + win, tau), sf = forecastMean(sol, t0 - DAY, t0, tau); return [String(tau), Number.isFinite(sb) && Number.isFinite(sf) ? d - (sb - sf) : NaN]; })) });
            }
          }
        }
      }
      // held-out satellites: one parity of the NORAD number calibrates the nowcast, the other is predicted (combined.mjs)
      for (const parity of [0, 1]) held.push(...heldOutRecords({ calibration: arcs.filter((a) => Number(a.dove) % 2 === parity), target: arcs.filter((a) => Number(a.dove) % 2 !== parity), issues, latencyHours: L, historyDays, taus,
        anchorMs: T0, solver: common, fitHours: 24, minimumFitArcs: 2, blockMs: BLOCK, firstMs: first }));
      const entry = { ...head, latencyHours: L, hindcastTruth: latencyStatistic(own, taus), heldOutSatellites: latencyStatistic(held, taus) };
      results.push(entry);
      const line = (name, st) => st.windows ? `${name}: ${st.windows}, no correction ${st.rmsNoCorrection.toFixed(4)}; ${taus.map((t) => { const b = st.byTau[String(t)]; return `tau ${t ?? 'held'} ${b.rmsUnpredicted.toFixed(4)} (${b.ratio.toFixed(3)}${b.lower === null ? '' : ` [${b.lower.toFixed(3)}, ${b.upper.toFixed(3)}]`})`; }).join('; ')}` : `${name}: no windows`;
      console.log(`  latency ${String(L).padStart(2)} h   ${line('hindcast truth', entry.hindcastTruth)}`);
      console.log(`              ${line('held-out pairs ', entry.heldOutSatellites)}`);
    }
  }
}

const out = { exploratory: true, amendment: 'S2', nodeHours, historyDays, blockDays: BLOCK / DAY, baseline: selection.solver.baseline, taus, pairs: all.length, satellites: new Set(all.map((a) => a.dove)).size,
  span: [new Date(Math.min(...all.map((a) => a.startMs))).toISOString(), new Date(Math.max(...all.map((a) => a.endMs))).toISOString()], medianCreatedHoursAfterPairEnd: lags[lags.length >> 1],
  note: 'No density truth exists for these dates. hindcastTruth is the same fleet\'s non-causal solution (smooth, shares the fit window\'s pairs); heldOutSatellites predicts the pairs of satellites that are in no solve. The Planet dev reference with Swarm and GRACE-FO truth is in results/e13/dev/exploratory-planet-latency.json.', results };
const dir = values.out ?? path.join(repoRoot, 'results', 'e13', 'part-s');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'exploratory-latency.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${path.join(dir, 'exploratory-latency.json')}`);
