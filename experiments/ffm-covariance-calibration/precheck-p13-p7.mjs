// C2 pre-checks P13 and P7 (PLAN.md 3.8) on one type I calibration window (the first converged by file name):
//   P13: the composed covariance A(t) + q_R U_R + q_T U_T + q_N U_N (lib/products.mjs windowTerms, noise from E) against FFM's own
//        PROCESS_NOISE run from E (ffmNoiseCovariances), q = 1e-9 / 3e-9 / 1e-9 m^2/s^3, per lead: max relative difference of the RTN
//        position block (|a - b| / max |b|), 1e-6 needed;
//   P7:  CPU seconds per object-day of propagator/ffm (process.cpuUsage around each call; RK78, relative tolerance 1e-10, steps <= 120 s):
//        state only, STM + B (the parameter columns), STM + B + PROCESS_NOISE, each from E over 72 h with hourly output.
//   node experiments/ffm-covariance-calibration/precheck-p13-p7.mjs
import fs from 'node:fs';
import path from 'node:path';
import { frozen, Opened, writeReceipt, store, HOUR, iso, root, config } from './common.mjs';
import { b2 } from './lib/precise.mjs';

frozen();
const opened = new Opened();
const B2C = JSON.parse(opened.read(b2('config.json'), 'B2 config'));
const F = B2C.part1.starlink.ffm;
const { openV3 } = await import(b2('lib/a12.mjs'));
const { leadLines } = await import(b2('lib/leads.mjs'));
const { openPairs } = await import('./lib/pairs.mjs');
const { windowTerms, ffmNoiseCovariances } = await import('./lib/products.mjs');
const { executionFrame, decodeSamples } = await import(path.join(root, 'harness/ffm-execution.mjs'));
const G1M = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/modules.mjs'));
const FR = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/frames.mjs'));
const W = await import(b2('lib/iss-window.mjs'));
const v3 = await openV3();
const pairs = await openPairs(B2C.a12.modulesLinks);
const frames = await G1M.openModule(B2C.a12.modulesLinks, 'foundation/frames');
const rowsDir = path.join(store, 'rows');
const fit = fs.readdirSync(rowsDir).filter((f) => /^iss-fit\.s\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(opened.add(path.join(rowsDir, f), 'iss-fit rows'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  .filter((r) => r.fit?.ok && r.set === 'calibration').sort((a, b) => (a.file < b.file ? -1 : 1))[0];
const i = W.headers.findIndex((h) => h.date === fit.file);
const w = W.windowOf(i);
opened.add(W.headers[i].file, 'ISS OEM');
const leads = leadLines(w.truth, w.E, B2C.a5.ca.leadToleranceSeconds.iss);
const g = []; for (const x of leads) { const t = await FR.transformState(frames, 'EME2000', 'GCRF', x.line.epoch, [...x.line.r, ...x.line.v]); g.push({ L: x.L, line: { epoch: x.line.epoch, r: t.slice(0, 3), v: t.slice(3, 6) } }); }
const settings = { forces: F.forces, integrator: F.integrator, fixed: {} };
const ctx = v3.ctxFor(Date.parse(fit.fit.epoch), w.E + 72 * HOUR);
const terms = await windowTerms(ctx, pairs, fit.fit, w.E, g, settings);
const q = [1e-9, 3e-9, 1e-9];
const ffm = await ffmNoiseCovariances(ctx, pairs, fit.fit, w.E, g, settings, q);
const cells = terms.leads.map((t, j) => {
  const composed = t.terms.A.map((a, k) => a + q[0] * t.terms.UR[k] + q[1] * t.terms.UT[k] + q[2] * t.terms.UN[k]);
  const b = ffm[j].rtn, scale = Math.max(...b.map(Math.abs));
  return { L: t.L, composed, ffm: b, maxRelative: Math.max(...composed.map((x, k) => Math.abs(x - b[k]) / scale)) };
});
const p13 = Math.max(...cells.map((c) => c.maxRelative));
// P7 costs
const E = w.E, samples = Array.from({ length: 73 }, (_, h) => iso(E + h * HOUR));
const [atE] = decodeSamples(await ctx.ffm.invoke('invoke', [executionFrame({ epoch: fit.fit.epoch, state: fit.fit.state, samples: [iso(E)], forces: F.forces, parameters: fit.fit.parameters, fixed: {}, stm: false, covariance: fit.fit.covariance, noise: null, integrator: F.integrator }), ...ctx.inputs]));
const cpu = async (extra) => { const c0 = process.cpuUsage(); const t0 = Date.now(); await ctx.ffm.invoke('invoke', [executionFrame({ epoch: iso(E), state: atE.state, samples, forces: F.forces, parameters: fit.fit.parameters, fixed: {}, stm: false, covariance: null, noise: null, integrator: F.integrator, ...extra }), ...ctx.inputs]); const c = process.cpuUsage(c0); return { cpuSeconds: (c.user + c.system) / 1e6, wallSeconds: (Date.now() - t0) / 1000 }; };
const costs = {};
for (const [name, extra] of [['stateOnly', { parameters: [] , fixed: { b: fit.fit.parameters[0].value, agom: fit.fit.parameters[1].value } }], ['stmB', { stm: true }], ['stmBNoise', { stm: true, covariance: atE.covariance, noise: { q, intervalSeconds: 600 } }]]) {
  const runs = []; for (let r = 0; r < 3; r += 1) runs.push(await cpu(extra));
  const best = runs.sort((a, b) => a.cpuSeconds - b.cpuSeconds)[0];
  costs[name] = { cpuSecondsPerObjectDay: best.cpuSeconds / 3, wallSecondsPerObjectDay: best.wallSeconds / 3, runs };
}
console.log(writeReceipt('precheck-P13-P7', {
  plan: '3.8 P13 and P7', window: { file: fit.file, E: fit.E, set: 'calibration', labeled: 'in-sample-seen' }, q_m2s3: q,
  p13: { cells: cells.map(({ L, maxRelative }) => ({ L, maxRelative })), maxRelative: p13, threshold: config.precheckThresholds.P13.relative, outcome: p13 <= config.precheckThresholds.P13.relative ? 'pass' : 'FAIL', detail: cells },
  p7: { settings: { integrator: 'RK78', relativeTolerance: F.integrator.tolerance, maxStepSeconds: F.integrator.maxStep, output: 'hourly, E to E + 72 h (73 samples)', noiseStepSeconds: 600, parameters: 'B and AGOM columns for STM runs', note: 'best of 3 runs, in-process CPU (process.cpuUsage), host load about 30 of 28 cores' }, costs },
}, opened));
await v3.close(); await pairs.close(); await frames.destroy();
process.exit(0);
