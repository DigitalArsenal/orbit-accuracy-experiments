// Dev only (PLAN.md §4.2): the SatNOGS measurement model against ISS truth.
// For every dev pass inside the flown truth: the truth range rate at each
// measurement (analysis/association with the truth as the prediction), and
// the residual r = rr(lag 0) - rr_truth, modelled per segment as a bias
// (transmitter plus station oscillator), a drift and a timing lag times the
// set's range-rate rate (station tuning and clock); the whitened residuals
// give the measurement-noise scale, the per-segment terms their spreads.
// Writes results/e6/dev/calibration.json (aggregates only).
//   node experiments/e6-public-observations/steps/15-calibrate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { cli, config, windowOf, home } from '../common.mjs';
import { loadModule } from '../../../harness/modules.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { median, quantile } from '../../../harness/stats.mjs';
import { finalsRecords } from '../eop.mjs';
import { eopStream, predictionFrame } from '../records.mjs';
import { C, predictedRangeRates } from '../passes.mjs';
import { nuisanceFit } from '../fit.mjs';
import { IssTruth, issCaptures } from '../truth.mjs';

const { values, modules, nodes } = cli();
const modulesDir = modules();
const run = startRun({ experiment: 'e6', step: '15-calibrate', configPath: path.join(repoRoot, 'experiments/e6-public-observations/config.json'), modulesDir, args: values });
const m = {};
for (const name of ['analysis/association', 'data-source/eop-parser', 'foundation/frames']) { m[name] = await loadModule(modulesDir, name); run.addModule(m[name].provenance); }
const finals = await finalsRecords(m['data-source/eop-parser'], config.inputs.eopFinals);
const captures = issCaptures({ nodes, archive: home(config.inputs.issOemArchive) });
run.addInputs('truth', Object.fromEntries(captures.map((c) => [`${c.url}@${c.captured}`, c.sha256])));
const truth = new IssTruth(m['foundation/frames'], captures);
const dir = path.join(repoRoot, 'runs/cache/e6/passes');
const STEP = 240000;
const rows = [];
for (const f of fs.readdirSync(dir).sort()) {
  const p = JSON.parse(fs.readFileSync(path.join(dir, f)));
  if (!p.measurements || windowOf(Date.parse(p.start)) !== 'dev') continue;
  const times = p.measurements.map((x) => Date.parse(x.time));
  const lo = Math.min(...times) - 5 * STEP, hi = Math.max(...times) + 5 * STEP;
  if (windowOf(lo) !== 'dev' || windowOf(hi) !== 'dev') continue;
  const grid = truth.epochs(lo - STEP, hi + STEP);
  if (!truth.covers(lo, hi, STEP)) continue;
  const states = []; for (const t of grid) states.push({ epoch: new Date(t).toISOString(), state: await truth.gcrf(t) });
  const lower = []; for (let r = 0; r < 6; r++) for (let c = 0; c <= r; c++) lower.push(r === c ? (r < 3 ? 1 : 1e-6) : 0);
  const prediction = predictionFrame({ norad: 25544, frame: 'GCRF', states, covariances: [{ epoch: states[0].epoch, lower }, { epoch: states.at(-1).epoch, lower }], degree: 9 });
  const eop = eopStream(finals.records.filter((r) => r.mjd >= Math.floor(lo / 864e5 + 40587) - 1 && r.mjd <= Math.floor(hi / 864e5 + 40587) + 1).map((r) => r.row));
  const obs = { id: p.id, observation_frequency: p.f0, station_lat: p.lat, station_lng: p.lon, station_alt: p.altM, ground_station: p.station };
  const rr = await predictedRangeRates(m['analysis/association'], prediction, eop, obs, times, 25544);
  const points = p.measurements.map((x, k) => ({ segment: x.segment ?? 0, t: Date.parse(x.time) / 1000, r: x.rangeRate + (p.lagSeconds ?? 0) * x.rrSetRate - rr[k].rangeRate, rate: x.rrSetRate, sigma: x.sigma, sigmaHz: x.sigmaHz }));
  for (const segment of new Set(points.map((q) => q.segment))) {
    const seg = points.filter((q) => q.segment === segment);
    if (seg.length >= config.extraction.minPoints) rows.push({ id: `${p.id}:${segment}`, station: p.station, mode: p.mode, f0: p.f0, utc: !!p.scale.utcOfBottom, points: seg });
  }
}
// The residual model of a segment (PLAN.md §4.2): r = a + d (t - t_mid) +
// lag * rate, where rr(lag 0) = rr_truth + lag * rate - b c / f0 + drift;
// a = -b c / f0 (the frequency bias), d the drift (m/s per s), weights
// 1/sigma^2. M1: a and d per segment, one common lag (pooled). M2: a, d and
// lag per segment. Each segment's terms come from nuisanceFit (fit.mjs), the
// same solver the fits use.
for (const p of rows) { const tm = p.points.reduce((a, q) => a + q.t, 0) / p.points.length; for (const q of p.points) q.dt = q.t - tm; }
const rowsOf = (p, lag) => p.points.map((q) => ({ y: q.r - lag * q.rate, phi: [1, q.dt], w: 1 / q.sigma ** 2 }));
const free2 = [{ mean: 0, sigma: null }, { mean: 0, sigma: null }];
const ssr = (lag) => rows.reduce((acc, p) => { const th = nuisanceFit(rowsOf(p, lag), free2); return acc + p.points.reduce((a, q) => a + (q.r - lag * q.rate - th[0] - th[1] * q.dt) ** 2 / q.sigma ** 2, 0); }, 0);
// The pooled lag minimizes the sum of squares (it is linear: two evaluations fix the parabola).
const s0 = ssr(0), s1 = ssr(1), s2 = ssr(2);
const curvature = (s2 - 2 * s1 + s0) / 2, slope = s1 - s0 - curvature;
const lag = -slope / (2 * curvature);
const m1 = rows.map((p) => nuisanceFit(rowsOf(p, lag), free2));
const z1 = rows.flatMap((p, i) => p.points.map((q) => (q.r - lag * q.rate - m1[i][0] - m1[i][1] * q.dt) / q.sigma));
const dof1 = Math.max(1, z1.length - 2 * rows.length - 1);
const chi1 = z1.reduce((a, v) => a + v * v, 0) / dof1;
const free3 = [{ mean: 0, sigma: null }, { mean: 0, sigma: null }, { mean: 0, sigma: null }];
const m2 = rows.map((p) => nuisanceFit(p.points.map((q) => ({ y: q.r, phi: [1, q.dt, q.rate], w: 1 / q.sigma ** 2 })), free3));
const z2 = rows.flatMap((p, i) => p.points.map((q) => (q.r - m2[i][0] - m2[i][1] * q.dt - m2[i][2] * q.rate) / q.sigma));
const chi2 = z2.reduce((a, v) => a + v * v, 0) / Math.max(1, z2.length - 3 * rows.length);
const spread = (xs) => ({ median: median(xs), q05: quantile(xs, 0.05), q25: quantile(xs, 0.25), q75: quantile(xs, 0.75), q95: quantile(xs, 0.95), robustSigma: 1.4826 * median(xs.map((x) => Math.abs(x - median(xs)))) });
const biasHz = rows.map((p, i) => -m1[i][0] * p.f0 / C);
const result = {
  window: 'dev', segments: rows.length, passes: new Set(rows.map((p) => p.id.split(':')[0])).size, measurements: z1.length, stations: new Set(rows.map((p) => p.station)).size,
  lagSeconds: lag, lagSigmaSeconds: Math.sqrt(chi1 / (2 * curvature)),
  sigmaScaleCommonLag: Math.sqrt(chi1), whitenedMadCommonLag: 1.4826 * median(z1.map(Math.abs)),
  sigmaScaleSegmentLag: Math.sqrt(chi2), whitenedMadSegmentLag: 1.4826 * median(z2.map(Math.abs)),
  biasHz: { median: median(biasHz), q05: quantile(biasHz, 0.05), q95: quantile(biasHz, 0.95), absMedian: median(biasHz.map(Math.abs)) },
  segmentDriftMps2: spread(m2.map((x) => x[1])),
  segmentLagSeconds: spread(m2.map((x) => x[2] - lag)),
  byLayout: { utcAxis: rows.filter((p) => p.utc).length, secondsAxis: rows.filter((p) => !p.utc).length },
};
const outDir = path.join(repoRoot, 'results/e6/dev');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'calibration.json'), `${JSON.stringify({ ...result, run: run.id }, null, 1)}\n`);
console.log(JSON.stringify(result, null, 1));
if (process.env.E6_DEBUG) rows.forEach((p, i) => { const z = p.points.map((q) => (q.r - m2[i][0] - m2[i][1] * q.dt - m2[i][2] * q.rate) / q.sigma); console.log(p.id, p.station, p.mode, 'lag', m2[i][2].toFixed(2), 'drift', m2[i][1].toFixed(3), 'rms', Math.sqrt(z.reduce((a, v) => a + v * v, 0) / z.length).toFixed(1)); });
run.finish({ result });
