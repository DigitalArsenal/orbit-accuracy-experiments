// Step 05, acceptance of the harness (PLAN.md 8), on train-window data only.
//   --part q1: A1 (per-set accumulate sums equal one batch call, E1 A0.2) and A1' (one-state frames give the bit-identical
//              errors of whole products), A2 (Planet: TT - UTC = 69.184 s; J2000 -> GCRF under 2 m), A3 (a 10 s mean-anomaly
//              shift moves T by |v| 10 s within 1 %), A6 (two step-20 runs of one object are byte-identical).
//   --part q2: A4 (known-answer arc: HPOP-made pseudo-observations with known B and B-dot, fitted back within 3 sigma),
//              A5 (A-JB-E13 with a00 = 0 equals A-JB to the last bit; A-GLS with zero correlation equals A).
// Writes results/e16/acceptance/<part>.json.
//
//   node experiments/e16-cross-regime-epoch/steps/05-acceptance.mjs --part q1|q2
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { startRun } from '../../../harness/provenance.mjs';
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { rng } from '../../../harness/stats.mjs';
import { rtnAxes } from '../../../harness/frames.mjs';
import { decodeSamples, executionFrame } from '../../../harness/full-force.mjs';
import { shiftAlongTrack } from '../../e1-gps-epoch/methods.mjs';
import { sgp4Errors, targetAxes } from '../../e7-full-force-handoff/methods.mjs';
import { DAY_MS, HOUR_MS, config, configPath, loadPinned, modulesRoot, readJson, repoRoot, resultsDir, runsCache, sha256, windowSpan } from '../common.mjs';
import { oneStateSource, truthFor } from '../truth.mjs';
import { windowSets } from '../sets.mjs';
import { loadSamples } from '../q1lib.mjs';
import { q2Context } from '../env.mjs';
import { Q2Object, arcProduct } from '../q2lib.mjs';

const { values } = parseArgs({ options: { part: { type: 'string' } } });
const run = startRun({ experiment: config.experiment, step: `05-acceptance-${values.part}`, configPath, modulesDir: modulesRoot(), args: values });
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} [A ${values.part}] ${m}`);
const A = config.acceptance;
const inventory = readJson(path.join(resultsDir, 'inventory.json'));
const norads = inventory.objects.map((o) => o.norad);
const out = { run: run.id, part: values.part, checks: {} };
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

if (values.part === 'q1') {
  const ctx = { 'gp-error-model': await loadPinned('analysis/gp-error-model', run), frames: await loadPinned('foundation/frames', run), time: await loadPinned('foundation/time', run) };
  const sets = new Map(windowSets('train', norads).sets.map((s) => [s.gpId, s]));
  const rows = loadSamples('train', Object.keys(config.regimes)).rows;

  // A1: one GNSS day, 20 sets: the sum over per-set accumulate calls equals one batch call (whole products, first hour).
  {
    const [from] = windowSpan('train', 'GNSS');
    const truth = await truthFor('GNSS', {});
    const day = Date.parse(`${from}T00:00:00Z`) + 30 * DAY_MS;
    const chosen = rows.filter((r) => r.cls === 'GNSS' && r.epochMs >= day && r.epochMs < day + DAY_MS).slice(0, 20).map((r) => sets.get(r.gpId));
    const options = json('options', { ageBinsDays: [[0, 1 / 24]], referenceStepSeconds: 0 });
    const framesOf = (s) => truth.entries(s.norad).filter((e) => e.stop >= s.epochMs && e.start <= s.epochMs + HOUR_MS).map((e) => truth.frame(e));
    const sum = Array(6).fill(0);
    let n = 0;
    for (const s of chosen) {
      const acc = await ctx['gp-error-model'].invokeJson('accumulate', [ommFrame([s]), ...framesOf(s), options], 'accumulator');
      for (const st of acc.strata) { n += st.n; st.sum.forEach((v, k) => { sum[k] += v; }); }
    }
    const batch = await ctx['gp-error-model'].invokeJson('accumulate', [ommFrame(chosen), ...[...new Map(chosen.flatMap(framesOf).map((f) => [sha256(Buffer.from(f.payload)), f])).values()], options], 'accumulator');
    const bsum = Array(6).fill(0);
    let bn = 0;
    for (const st of batch.strata) { bn += st.n; st.sum.forEach((v, k) => { bsum[k] += v; }); }
    const worst = Math.max(...sum.map((v, k) => rel(v, bsum[k])));
    out.checks.A1 = { sets: chosen.length, samples: n, batchSamples: bn, worstRelative: worst, pass: n === bn && worst <= A.sumRelative };
    log(`A1: ${n} = ${bn} samples, worst relative difference ${worst.toExponential(2)}`);
  }

  // A1': per class, 30 train samples scored again with whole-product frames: bit-identical to step 20's one-state errors.
  {
    const res = {};
    for (const cls of Object.keys(config.regimes)) {
      const truth = await truthFor(cls, { readers: { time: ctx.time, frames: ctx.frames }, fromDay: windowSpan('train', cls)[0], toDay: new Date(Date.parse(`${windowSpan('train', cls)[1]}T00:00:00Z`) + 5 * DAY_MS).toISOString().slice(0, 10) });
      const mine = rows.filter((r) => r.cls === cls).filter((_, i) => i % 97 === 0).slice(0, 30);
      let same = 0, diff = 0;
      for (const r of mine) {
        const targets = Object.entries(r.errors).filter(([, e]) => e).map(([age, e]) => ({ age, ms: e.targetMs, file: e.file }));
        const { errors } = await sgp4Errors(ctx, truth, sets.get(r.gpId), targets, { full: true });
        targets.forEach((t, j) => { if (JSON.stringify(errors[j]) === JSON.stringify(r.errors[t.age].e)) ++same; else ++diff; });
      }
      res[cls] = { samples: mine.length, identical: same, different: diff };
    }
    out.checks["A1'"] = { classes: res, pass: Object.values(res).every((x) => x.different === 0 && x.identical > 0) };
    log(`A1': ${JSON.stringify(res)}`);
  }

  // A2: the Planet conversion cache of the train window.
  {
    const file = fs.readdirSync(runsCache).find((n) => n.startsWith(`planet-gcrf-${windowSpan('train', 'LEO-PL')[0]}`));
    const { states } = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(runsCache, file))));
    const dt = states.map((s) => s.ttMs - s.ms);
    const shift = states.map((s) => Math.hypot(s.state[0] - s.j2000[0], s.state[1] - s.j2000[1], s.state[2] - s.j2000[2]));
    out.checks.A2 = { states: states.length, ttMinusUtcMs: [Math.min(...dt), Math.max(...dt)], frameBiasShiftM: [Math.min(...shift), Math.max(...shift)], pass: dt.every((x) => x === 69184) && shift.every((x) => x < 2) };
    log(`A2: ${states.length} states, TT-UTC ${out.checks.A2.ttMinusUtcMs} ms, shift ${out.checks.A2.frameBiasShiftM.map((x) => x.toFixed(3))} m`);
  }

  // A3: a 10 s shift of the mean anomaly moves the at-epoch T error by |v| 10 s (1 %), 40 samples per class.
  {
    const res = {};
    for (const cls of Object.keys(config.regimes)) {
      const truth = await truthFor(cls, { readers: { time: ctx.time, frames: ctx.frames }, fromDay: windowSpan('train', cls)[0], toDay: new Date(Date.parse(`${windowSpan('train', cls)[1]}T00:00:00Z`) + 5 * DAY_MS).toISOString().slice(0, 10) });
      const mine = rows.filter((r) => r.cls === cls).filter((_, i) => i % 53 === 0).slice(0, 40);
      const ratios = [];
      for (const r of mine) {
        const t = { age: 0, ms: r.errors[0].targetMs, file: r.errors[0].file };
        const state = truth.firstAtOrAfter(r.norad, t.ms, 0);
        const one = oneStateSource(truth, [{ ...t, state }]);
        const { errors } = await sgp4Errors(ctx, one.source, shiftAlongTrack(sets.get(r.gpId), A.shiftSeconds), one.targets, { full: true });
        ratios.push((errors[0][1] - r.errors[0].e[1]) / (r.speedKmS * A.shiftSeconds));
      }
      res[cls] = { samples: ratios.length, min: Math.min(...ratios), max: Math.max(...ratios) };
    }
    out.checks.A3 = { classes: res, pass: Object.values(res).every((x) => Math.abs(x.min - 1) <= A.shiftRelativeTolerance && Math.abs(x.max - 1) <= A.shiftRelativeTolerance) };
    log(`A3: ${JSON.stringify(res)}`);
  }

  // A6: every pair of finished step-20 runs that scored the same object in the same window gave identical rows.
  {
    const RUNS = path.join(repoRoot, 'runs');
    const byObj = new Map();
    for (const id of fs.readdirSync(RUNS).filter((n) => n.startsWith(`${config.experiment}-20-epoch-samples-`))) {
      const mf = path.join(RUNS, id, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      if (!m.finished) continue;
      for (const line of zlib.gunzipSync(fs.readFileSync(path.join(RUNS, id, 'samples.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean)) {
        const r = JSON.parse(line);
        const key = `${m.window}|${r.gpId}`;
        if (!byObj.has(key)) byObj.set(key, []);
        byObj.get(key).push(line);
      }
    }
    const repeated = [...byObj.values()].filter((v) => v.length > 1);
    const differing = repeated.filter((v) => v.some((x) => x !== v[0])).length;
    out.checks.A6 = { repeatedSamples: repeated.length, differing, pass: repeated.length > 0 && differing === 0 };
    log(`A6: ${repeated.length} samples scored twice, ${differing} differ`);
  }
  for (const m of Object.values(ctx)) await m.destroy();
}

if (values.part === 'q2') {
  const ctx = await q2Context(run);
  const q2train = readJson(path.join(resultsDir, 'selection', 'q2-train.json'));
  const sets = windowSets('train', norads).sets;
  const swarm = 39452;   // Swarm A: dense precise orbit, drag regime
  const mine = sets.filter((s) => s.norad === swarm).sort((a, b) => a.epochMs - b.epochMs);
  const truth = await truthFor('LEO-POD', {});
  const o = new Q2Object({ ctx, norad: swarm, cls: 'LEO-POD', sets: mine, truth });
  const W = q2train.classes['LEO-POD'].weights.secondMomentRtn;
  // The first set after day 40 of the train window with at least 5 sets in the 2 days before it (a normal arc).
  const k = mine.findIndex((s, i) => s.epochMs > Date.parse(`${config.windows.train[0]}T00:00:00Z`) + 40 * DAY_MS && mine.filter((x) => x.epochMs > s.epochMs - 2 * DAY_MS && x.epochMs <= s.epochMs && x.createdMs <= s.createdMs).length >= 5);
  const set = mine[k];
  const horizons = config.q2.horizonsHours;
  const targets = horizons.map((h) => { const s = truth.firstAtOrAfter(swarm, set.epochMs + h * HOUR_MS, 900e3); return s ? { h, ms: s.ms, epoch: s.epoch, r: s.r, v: s.v, file: s.entry.file } : { h, missing: true }; });
  await targetAxes(ctx, targets);
  const sample = { norad: swarm, cls: 'LEO-POD', gpId: set.gpId, index: k, epochMs: set.epochMs, cutoffMs: set.createdMs, targets };
  const agom = config.physical.crAreaOverMass[String(swarm)];
  const opts = { W, rhoOf: () => 0, agom, maxSpanDays: 4 };

  // A5: a00 = 0 against no a00 (JB2008), bit for bit; GLS with zero correlation against WLS.
  const jb = await arcProduct(o, sample, { spanDays: 2, bdot: false, weighting: 'diagonal', atmosphere: 'JB2008' }, opts);
  const jb0 = await arcProduct(o, sample, { spanDays: 2, bdot: false, weighting: 'diagonal', atmosphere: 'JB2008', a00: () => 0 }, opts);
  const wls = await arcProduct(o, sample, { spanDays: 2, bdot: false, weighting: 'diagonal', atmosphere: 'NRLMSISE00' }, opts);
  const gls0 = await arcProduct(o, sample, { spanDays: 2, bdot: false, weighting: 'gls', atmosphere: 'NRLMSISE00' }, opts);
  log(`A5 products: ${[jb, jb0, wls, gls0].map((x) => x.failure ?? 'ok').join(' | ')}`);
  if ([jb, jb0, wls, gls0].some((x) => !x.errors)) throw new Error('an A5 product failed');
  const same = JSON.stringify(jb.errors) === JSON.stringify(jb0.errors);
  const worstGls = Math.max(...wls.errors.flatMap((e, i) => (e && gls0.errors[i] ? e.map((x, a) => Math.abs(x - gls0.errors[i][a])) : [])));
  out.checks.A5 = { e13ZeroIdentical: same, glsZeroCorrelationWorstMetres: worstGls, failures: [jb.failure, jb0.failure, wls.failure, gls0.failure].filter(Boolean), pass: same && worstGls < 1e-3 && !jb.failure && !wls.failure };
  log(`A5: a00=0 identical ${same}; GLS(0) vs WLS worst ${worstGls.toExponential(2)} m`);

  // A4: known answer. Truth trajectory: HPOP from the precise state at the sample epoch with known B and B-dot, sampled at
  // the arc's OMM epochs; noise from the class weight in each state's RTN axes; fitted back by the A machinery.
  const random = rng(20261011);
  const gauss = () => { const u = Math.max(1e-12, random()), v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const t0 = truth.firstAtOrAfter(swarm, set.epochMs, 900e3);
  const bTrue = 0.012, bdotTrue = 0.004 / 86400;
  const arc = mine.filter((s) => s.epochMs > set.epochMs - 4 * DAY_MS && s.epochMs <= set.epochMs);
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
  const forces = { ...config.q2.forces, atmosphere: 'NRLMSISE00' };
  delete forces.operationalAtmosphere;
  const env = { drivers: 'released', cutoffMs: set.createdMs };
  const traj = decodeSamples(await ctx.hpop.invoke('invoke', [
    executionFrame({ epoch: t0.epoch.replace(/Z$/, ''), state: [...t0.r, ...t0.v].map((x) => x * 1000), samples: [...arc.map((s) => iso(s.epochMs)).reverse()], forces, coefficients: { b: bTrue, bdot: bdotTrue, agom }, integrator: config.q2.integrator }),
    ...ctx.inputsFor(arc[0].epochMs, t0.ms, forces, env)]));
  // Cholesky of W (RTN, 6x6) for correlated noise.
  const L = Array(36).fill(0);
  for (let i = 0; i < 6; ++i) for (let j = 0; j <= i; ++j) { let s = W[6 * i + j]; for (let m = 0; m < j; ++m) s -= L[6 * i + m] * L[6 * j + m]; L[6 * i + j] = i === j ? Math.sqrt(s) : s / L[6 * j + j]; }
  const noisy = [];
  for (const sample of traj.reverse()) {
    const z = Array.from({ length: 6 }, gauss), d = [0, 1, 2, 3, 4, 5].map((i) => [0, 1, 2, 3, 4, 5].reduce((s, j) => s + L[6 * i + j] * z[j], 0));
    const axes = await rtnAxes(ctx.frames, sample.epoch.replace(/Z$/, ''), sample.state);
    const toG = (v) => [0, 1, 2].map((c) => axes[c] * v[0] + axes[3 + c] * v[1] + axes[6 + c] * v[2]);
    noisy.push({ epoch: sample.epoch.replace(/Z$/, ''), state: [...toG(d.slice(0, 3)).map((x, i) => sample.state[i] + x), ...toG(d.slice(3)).map((x, i) => sample.state[3 + i] + x)] });
  }
  // The fit sees the synthetic states in place of the OMMs' epoch states (same epochs, same weights).
  const synthetic = { ...o, sets: arc, epochStates: async () => noisy, maneuversBefore: async () => [] };
  const fit = await arcProduct(synthetic, { ...sample, index: arc.length - 1 }, { spanDays: 4, bdot: true, weighting: 'diagonal', atmosphere: 'NRLMSISE00' }, { ...opts, maxSpanDays: 4 });
  const est = fit.info?.fit?.parameters ?? [], sig = fit.info?.fit?.parameterSigmas ?? [];
  const within = est.length === 2 && sig.length === 2 && Math.abs(est[0] - bTrue) <= A.knownAnswerSigma * sig[0] && Math.abs(est[1] - bdotTrue) <= A.knownAnswerSigma * sig[1];
  out.checks.A4 = { bTrue, bdotTruePerDay: bdotTrue * 86400, estimate: est, sigma: sig, failure: fit.failure ?? null, pass: !fit.failure && within };
  log(`A4: B ${est[0]} (true ${bTrue}), B-dot/day ${est[1] * 86400} (true ${bdotTrue * 86400}); ${fit.failure ?? 'converged'}`);
  await ctx.destroy();
}

fs.mkdirSync(path.join(resultsDir, 'acceptance'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'acceptance', `${values.part}.json`), `${JSON.stringify(out, null, 1)}\n`);
run.write('acceptance.json', out);
run.finish({ pass: Object.fromEntries(Object.entries(out.checks).map(([k, v]) => [k, v.pass ?? null])) });
