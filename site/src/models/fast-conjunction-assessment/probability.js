// Section 7, covariance probability on screened events: a screen with the
// empirical prediction-error model (analysis/gp-error-model's scaled model,
// framed as analysis/conjunction-assessment's uncertainty_model) gives each
// event's objects the covariance of their stratum at the TCA's prediction age
// and Foster's probability. The page screens a synthetic catalog, takes the
// event with the highest probability, assesses it again (assess_conjunction)
// for both objects' states and sigmas at TCA, and sweeps the model's sigmas by
// a factor k: past the peak, a larger covariance lowers the probability.
import { formatMeters } from '../../chart.js';
import { covarianceCalibration, cqrCovarianceBasis, cqrUncertaintyOrigin } from 'spacedatastandards.org/lib/js/CQR/main.js';
import { decodeCqr, msOf, output, pairRequest } from '../codec/cqr.js';
import { START_MS, screenOnce } from '../codec/screen.js';
import { chart, credits, num, panel, table, tiles } from '../ui.js';
import { covarianceAxes, rtn, rtnCovariance, scene3d, toRtn, v3 } from '../scene.js';

const N = 300, HOURS = 6, RADIUS_M = 10;
const MODEL = (payload) => ({ portId: 'uncertainty_model', payload, typeRef: { wireFormat: 'flatbuffer', mediaType: 'application/vnd.sdn.ca-uncertainty-model' } });

// A synthetic catalog in the band where the model is calibrated (LEO
// 600–800 km): deterministic mean elements, epochs 1.2 to 1.6 days before the
// screen. Inputs only; nothing here propagates.
function catalog(n, seed = 20261011) {
  let s = seed;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, (_, i) => {
    const epoch = new Date(START_MS - (1.2 + 0.4 * r()) * 86400e3).toISOString().replace('Z', '000');
    return { name: `LEO-${String(i + 1).padStart(4, '0')}`, id: `SYN-${i + 1}`, norad: 910001 + i, epoch,
      n: 14.15 + 0.4 * r(), ecc: 0.0002 + 0.002 * r(), inc: 50 + 48 * r(), raan: 360 * r(), argp: 360 * r(), ma: 360 * r(), bstar: 0 };
  });
}

export default async function run(ctx) {
  const p = panel(ctx.root, 'The screened event');
  const view = scene3d(ctx, { title: 'The pair at TCA, with their covariances', caption: 'Radial, in-track and cross-track of the primary (m)' });
  const figure = chart(ctx.root, 'Probability against the size of the covariance', 'Foster, in the module, with every model sigma × k; the line is Alfano’s maximum for spherical covariance; a stretched covariance can give more');
  const strata = panel(ctx.root, 'Where the covariances came from');
  const index = await ctx.fetchJson('./data/ca/uncertainty-model.json');
  await credits(ctx, ctx.root, ['data/ca/uncertainty-model.json', ...index.files]);
  const ca = await ctx.module('analysis/conjunction-assessment');
  const frames = await Promise.all(index.files.map((f) => ctx.fetchBytes(`./${f}`)));
  const base = frames[index.scales.indexOf(1)];

  await ctx.run(`analysis/conjunction-assessment: ${N} objects, ${HOURS} h, Foster with the empirical model`, async () => {
    const objects = catalog(N);
    const screen = await screenOnce(ca, objects, { durationSeconds: HOURS * 3600, algorithm: 'FOSTER', combinedRadiusM: RADIUS_M }, [MODEL(base)]);
    const scored = screen.events.filter((e) => e.PROBABILITY?.UNCERTAINTY_SOURCE === cqrUncertaintyOrigin.SYNTHESIZED_COVARIANCE);
    if (!scored.length) throw new Error('No screened event took the model’s covariance.');
    const top = scored.reduce((a, b) => (b.PROBABILITY.PROBABILITY > a.PROBABILITY.PROBABILITY ? b : a));
    const a = objects.find((o) => o.id === top.PRIMARY_ID), b = objects.find((o) => o.id === top.SECONDARY_ID);
    // The same pair, assessed over an hour about the screened TCA, at each scale of the model.
    const assess = async (frame) => decodeCqr(output(await ca.invoke('assess_conjunction', [pairRequest(a, b, {
      startJd: top.TCA.JULIAN_DATE - 0.5 / 24, durationSeconds: 3600, coarseStepSec: 60, toleranceSec: 0.001, combinedRadiusM: RADIUS_M, algorithm: 'FOSTER' }), MODEL(frame)]), 'result')).EVENT_RESULT;
    const e = await assess(base);
    const sweep = [];
    for (const [i, k] of index.scales.entries()) sweep.push([k, (await assess(frames[i])).PROBABILITY.PROBABILITY]);
    const pr = e.PROBABILITY, tcaMs = msOf(e.TCA.JULIAN_DATE);
    tiles(p, [['Pair', `${a.name} · ${b.name}`], ['TCA (UTC)', new Date(tcaMs).toISOString().slice(11, 23)], ['Miss', formatMeters(e.MISS_DISTANCE_M)],
      ['Foster', num(pr.PROBABILITY, 3)], ['Alfano maximum (spherical)', pr.HAS_MAXIMUM_PROBABILITY ? num(pr.MAXIMUM_PROBABILITY, 3) : '—'], ['Calibration', covarianceCalibration[pr.CALIBRATION] ?? '—']]);
    const ageDays = (o) => (tcaMs - Date.parse(`${o.epoch.slice(0, 23)}Z`)) / 86400e3;
    const sig = (q) => ['X', 'Y', 'Z'].map((k) => formatMeters(q[k]));
    table(strata, ['', 'Prediction age', 'Radial σ', 'In-track σ', 'Cross-track σ', 'Basis'], [
      [a.name, `${num(ageDays(a), 3)} d`, ...sig(e.PRIMARY_SIGMA_RTN_M), cqrCovarianceBasis[e.PRIMARY_COVARIANCE_BASIS] ?? '—'],
      [b.name, `${num(ageDays(b), 3)} d`, ...sig(e.SECONDARY_SIGMA_RTN_M), cqrCovarianceBasis[e.SECONDARY_COVARIANCE_BASIS] ?? '—'],
    ]);
    figure.draw({ series: [
      { name: 'Alfano maximum (spherical)', color: 'var(--series-muted)', points: [[index.scales[0], pr.MAXIMUM_PROBABILITY], [index.scales.at(-1), pr.MAXIMUM_PROBABILITY]], dash: true },
      { name: 'Foster', color: 'var(--accent)', points: sweep.filter((q) => q[1] > 1e-14), markers: true, label: true },
      { name: 'The model as calibrated (k = 1)', color: 'var(--cyan)', points: [[1, Math.max(pr.PROBABILITY, 1e-14)]], markers: true },
    ], x: { min: index.scales[0], max: index.scales.at(-1), scale: 'log', ticks: [0.1, 1, 10, 100], format: (k) => `k ${k}` },
    y: { format: (v) => (v === 1 ? '1' : `1e${Math.round(Math.log10(v))}`), value: (v) => num(v, 3) } });

    // Both objects at TCA in the primary's radial, in-track and cross-track
    // axes (m): each one's 1σ (diagonal in its own axes), their sum about
    // the primary, the hard body, the miss and the relative velocity.
    const state = (s) => ({ r: ['X', 'Y', 'Z'].map((k) => s.STATE.POSITION[k]), v: ['X', 'Y', 'Z'].map((k) => s.STATE.VELOCITY[k]) });
    const pa = state(e.PRIMARY_STATE), pb = state(e.SECONDARY_STATE);
    const A = rtn(pa.r, pa.v), B = rtn(pb.r, pb.v);
    const diag = (q) => [q.X ** 2, 0, 0, 0, q.Y ** 2, 0, 0, 0, q.Z ** 2];
    // The secondary's covariance, diagonal in its own axes, in the primary's.
    const inPrimary = (P, basis) => { const M = basis.map((row) => A.map((col) => v3.dot(row, col))); return rtnCovariance([0, 1, 2].map((j) => M.map((row) => row[j])), P); };
    const Pa = diag(e.PRIMARY_SIGMA_RTN_M), Pb = inPrimary(diag(e.SECONDARY_SIGMA_RTN_M), B), Pc = Pa.map((x, i) => x + Pb[i]);
    const rel = toRtn(A, v3.sub(pb.r, pa.r));
    const vRel = v3.unit(toRtn(A, v3.sub(pb.v, pa.v)));
    const reach = Math.max(v3.norm(rel), ...covarianceAxes(Pc).map(v3.norm));
    await view.draw((g) => {
      g.ellipsoid([0, 0, 0], covarianceAxes(Pa), { color: 'accent', alpha: 0.25, outline: true });
      g.ellipsoid(rel, covarianceAxes(Pb), { color: 'cyan', alpha: 0.22, outline: true });
      g.ellipsoid([0, 0, 0], covarianceAxes(Pc), { color: 'text', alpha: 0.05, outline: true, outlineAlpha: 0.4 });
      g.sphere([0, 0, 0], e.COMBINED_RADIUS_M ?? RADIUS_M, { color: 'alert', alpha: 0.5, frame: false });
      g.line([v3.sub(rel, v3.scale(vRel, reach)), v3.add(rel, v3.scale(vRel, reach))], { color: 'cyan', width: 1.5, dash: true, frame: false });
      g.arrow([0, 0, 0], rel, { color: 'text', width: 8, frame: false });
      g.point([0, 0, 0], { color: 'accent', size: 8, label: a.name, labelColor: 'accent' });
      g.point(rel, { color: 'cyan', size: 8, label: `${b.name} · miss ${formatMeters(e.MISS_DISTANCE_M)}`, labelColor: 'cyan' });
      g.view({ preset: '3d' });
    }, { axes: ['Radial (m)', 'In-track (m)', 'Cross-track (m)'], aspect: 'equal',
      caption: `At TCA ${new Date(tcaMs).toISOString().slice(11, 23)} UTC, in ${a.name}’s radial, in-track and cross-track axes (m, true scale): each object’s 1σ from the model’s stratum at its prediction age, their sum about the primary, the ${formatMeters(e.COMBINED_RADIUS_M ?? RADIUS_M)} combined hard body, the miss and the relative velocity’s direction`,
      legend: [['accent', `${a.name} 1σ`, 'solid'], ['cyan', `${b.name} 1σ`, 'solid'], ['text', 'Combined 1σ (sum)', 'solid'], ['alert', 'Hard body', 'solid'], ['cyan', 'Relative velocity', 'dash']] });
    const peak = sweep.reduce((x, y) => (y[1] > x[1] ? y : x));
    return `The screen of ${N} synthetic objects gives ${num(scored.length)} events a covariance probability; the highest, ${a.name} with ${b.name}, is ${num(pr.PROBABILITY, 3)} (${(covarianceCalibration[pr.CALIBRATION] ?? '').toLowerCase()}) at a ${formatMeters(e.MISS_DISTANCE_M)} miss. With the sigmas × k it peaks at ${num(peak[1], 3)} near k = ${peak[0]}; past the peak a larger covariance lowers it: dilution.`;
  });
}
