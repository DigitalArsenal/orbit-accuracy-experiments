// The enclosure test (PLAN.md section 3) on B1, test seeds t1-t3, for E26,
// E25T and SMF. At each tested step k -> j = k + 1 the variant's carried
// region after observation k is sampled densely (uniform inside and on its
// boundary, plus its own support points) and taken through step j:
//   E1: every point propagated by HPOP, against the published predicted bound;
//   E2 (E26): the step run with the dense cloud as support, its survivors
//       against the reference step's posterior set.
// The reference step is the variant's own step j, restarted exactly from its
// carried support; its HPOP answers give the predicted centre. Sampling and
// containment statistics only.
//   node steps/50-enclosure.mjs [--seeds t1,t2,t3] [--variants E26:k=..,E25T:l=..,SMF] [--workers 6] [--resume <run-id>]
//        (dev checks: --seeds d1 [--interior N --boundary N])
//   child: node steps/50-enclosure.mjs --job <job.json>
import fs from 'node:fs';
import path from 'node:path';
import { config, configPath, assertReadable, loadModules, modulesDir, repoPath, rng, cholesky, mahalanobis2, iso } from '../common.mjs';
import { arg, runPool } from '../jobs.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';

const MODULES = ['propagator/hpop', 'analysis/estimation', 'data-source/eop-parser'];
const self = new URL(import.meta.url).pathname;

// Passes: runs of at least `minimum` observations from one station less than
// `gapMinutes` apart, in time order (indices into the observations).
export function passes(observations, { gapMinutes, minimum }) {
  const out = [];
  let run = [];
  for (const [i, o] of observations.entries()) {
    const prev = observations[run.at(-1)];
    if (run.length && (o.station !== prev.station || o.ms - prev.ms >= gapMinutes * 60e3)) { if (run.length >= minimum) out.push(run); run = []; }
    run.push(i);
  }
  if (run.length >= minimum) out.push(run);
  return out;
}

// 6-D points uniform inside (r = U^(1/6)) and on the boundary of {d <= 1}.
function samples(center, shape, interior, boundary, g) {
  const l = cholesky(shape, 6);
  if (!l) throw new Error('carried shape is not positive definite');
  const point = (radius) => {
    const z = Array.from({ length: 6 }, () => g.normal());
    const n = Math.hypot(...z), r = radius === undefined ? Math.pow(g.next(), 1 / 6) : radius;
    const u = z.map((v) => (v / n) * r);
    return center.map((c, i) => c + u.reduce((s, v, k) => s + l[i * 6 + k] * v, 0));
  };
  return [...Array.from({ length: interior }, () => point()), ...Array.from({ length: boundary }, () => point(1))];
}

const radius = (bound, x) => Math.sqrt(mahalanobis2(bound.l, 6, x.map((v, i) => v - bound.center[i])));

async function child(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const { environment, propagate } = await import('../hpop.mjs');
  const { variantSpec } = await import('../partb.mjs');
  const { runSequential } = await import('../filters.mjs');
  const { mvee } = await import('../teag.mjs');
  const { estimationCodec } = await import('../estimation-codec.mjs');
  const { loaded } = await loadModules(null, MODULES);
  const sc = JSON.parse(fs.readFileSync(job.scenario, 'utf8'));
  const env = await environment({ parser: loaded['data-source/eop-parser'], kernelPath: path.join(modulesDir(), config.inputs.kernel2026), eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs: sc.epochMs, toMs: sc.endMs });
  const codec = await estimationCodec(modulesDir());
  const ctx = { codec, est: loaded['analysis/estimation'], hpop: loaded['propagator/hpop'], env, filterModel: config.forceModels[sc.filterModel] };
  const variant = variantSpec(job.variant), e = config.enclosure;
  const bound = variant.id === 'E25T' ? 3 : 1;
  const P = passes(sc.observations, { gapMinutes: e.passGapMinutes, minimum: e.minimumPassObservations });
  const steps = [];
  for (const p of e.passes) {
    if (!P[p - 1]) continue;
    steps.push({ kind: 'gap', pass: p, j: P[p - 1][0] }, { kind: 'within', pass: p, j: P[p - 1][e.withinPassObservation - 1] });
  }
  steps.sort((a, b) => a.j - b.j);
  const results = [];
  let cursor = { ...sc.initial }, support = null, done = 0;
  for (const step of steps) {
    const k = step.j - 1, o = sc.observations;
    if (k < 0) continue;
    // Advance to observation k, keeping its carried support.
    if (k >= done) {
      const r = await runSequential(ctx, variant, cursor, o.slice(done, k + 1), { keepSupportAt: new Set([k - done]), initialSupport: support });
      if (r.failure) throw new Error(`advance failed: ${JSON.stringify(r.failure)}`);
      const last = r.epochs.at(-1);
      cursor = { ms: o[k].ms, state: [...last.estimate], covariance: [...last.shape] };
      support = last.carried;
      done = k + 1;
    }
    const carried = support;
    // The reference step j from the carried support, its HPOP answers kept.
    ctx.answers = new Map();
    const ref = await runSequential(ctx, variant, cursor, [o[step.j]], { keepSupportAt: new Set([0]), initialSupport: carried });
    const refAnswers = ctx.answers;
    ctx.answers = null;
    const refEpoch = ref.epochs[0];
    const ordered = [...refAnswers.keys()].sort((a, b) => a - b).map((q) => refAnswers.get(q));
    let predictedCenter = ordered[0];
    if (variant.id === 'E26') predictedCenter = (await mvee(codec, ctx.est, ordered.flat(), 6)).center;
    const predicted = { center: predictedCenter, l: cholesky(refEpoch.support.predicted, 6) };
    // Dense samples of the carried region (centre and shape it carries), its
    // own support points included.
    const g = rng(e.seed + 1000 * Number(job.seed.slice(1)) + step.j);
    const dense = samples([...carried.estimate], [...carried.shape], job.interior ?? e.interior, job.boundary ?? e.boundary, g);
    for (let i = 0; i < (carried.points?.length ?? 0) / 6; ++i) dense.push(carried.points.slice(6 * i, 6 * i + 6));
    const fromIso = iso(o[k].ms), toIso = iso(o[step.j].ms);
    let propagated, e2 = null;
    if (variant.id === 'E26') {
      ctx.answers = new Map();
      const cloud = Object.assign(Object.create(Object.getPrototypeOf(carried)), carried, { points: dense.flat(), possibility: dense.map(() => 1) });
      const run = await runSequential(ctx, variant, cursor, [o[step.j]], { initialSupport: cloud });
      const answers = ctx.answers;
      ctx.answers = null;
      propagated = [...answers.keys()].sort((a, b) => a - b).map((q) => answers.get(q));
      const refSet = await mvee(codec, ctx.est, refEpoch.support.survivorPoints, 6);
      const denseSurvivors = run.epochs[0]?.support?.survivorPoints ?? [];
      const denseSet = await mvee(codec, ctx.est, denseSurvivors, 6);
      const refBound = { center: refSet.center, l: cholesky(refSet.shape, 6) };
      const radii = [];
      for (let i = 0; i < denseSurvivors.length / 6; ++i) radii.push(radius(refBound, denseSurvivors.slice(6 * i, 6 * i + 6)));
      e2 = { survivors: radii.length, outside: radii.filter((r) => r > 1 + e.tolerance).length, maxRadius: Math.max(...radii), logVolumeRatio: denseSet ? denseSet.logVolume - refSet.logVolume : null, referenceSurvivors: refEpoch.support.survivors };
    } else {
      propagated = [];
      for (const x of dense) propagated.push((await propagate(ctx.hpop, env, ctx.filterModel, { epochIso: fromIso, state: x, sampleIsos: [toIso] }))[0].state);
    }
    const radii = propagated.map((x) => radius(predicted, x) / bound);
    results.push({ ...step, k, dtSeconds: (o[step.j].ms - o[k].ms) / 1000, points: dense.length,
      e1: { outside: radii.filter((r) => r > 1 + e.tolerance).length, maxRadius: Math.max(...radii), quantile99: [...radii].sort((a, b) => a - b)[Math.floor(0.99 * (radii.length - 1))] }, e2 });
    console.log(`${job.seed} ${job.variant} ${step.kind} pass ${step.pass} (j ${step.j}, ${(o[step.j].ms - o[k].ms) / 1000} s): E1 ${results.at(-1).e1.outside}/${dense.length} outside, max ${results.at(-1).e1.maxRadius.toFixed(3)}${e2 ? `; E2 ${e2.outside}/${e2.survivors} outside, max ${e2.maxRadius.toFixed(3)}` : ''}`);
    // Continue from the reference step's carried support.
    cursor = { ms: o[step.j].ms, state: [...refEpoch.estimate], covariance: [...refEpoch.shape] };
    support = refEpoch.carried;
    done = step.j + 1;
  }
  fs.writeFileSync(`${job.output}.tmp`, JSON.stringify({ seed: job.seed, variant: job.variant, bound, steps: results }));
  fs.renameSync(`${job.output}.tmp`, job.output);
}

async function driver() {
  const e = config.enclosure;
  const seeds = (arg('seeds') ?? e.seeds.join(',')).split(',');
  assertReadable(seeds.every((s) => config.partB.devSeeds.some((d) => d.id === s)) ? 'dev' : 'test');
  const variants = (arg('variants') ?? '').split(',').filter(Boolean);
  const workers = Math.min(6, Number(arg('workers', 6)));
  const run = startRun({ experiment: 'e10-teag-espf', step: '50-enclosure', configPath, modulesDir: modulesDir(), args: { seeds, variants, workers }, resume: arg('resume') });
  await loadModules(run, MODULES);
  run.addInputs('files', { kernel2026: sha256(fs.readFileSync(path.join(modulesDir(), config.inputs.kernel2026))), eopC04: sha256(fs.readFileSync(config.inputs.eopC04)) });
  run.checkpoint();
  const jobsDir = path.join(run.dir, 'jobs');
  fs.mkdirSync(jobsDir, { recursive: true });
  const jobs = [];
  for (const seed of seeds) for (const v of variants) {
    const scenario = path.join(repoRoot, 'runs', 'cache', 'e10', 'partB', `${seed}-${e.case}.json`);
    if (!fs.existsSync(scenario)) throw new Error(`no scenario ${scenario}: run step 10 first`);
    const name = `${seed}-${v.replace(/[:=]/g, '_')}`, output = path.join(jobsDir, `${name}.json`);
    // --interior/--boundary: smaller clouds for dev checks only (test seeds use the plan's).
    const sizes = config.partB.devSeeds.some((s) => s.id === seed) ? { interior: arg('interior') && Number(arg('interior')), boundary: arg('boundary') && Number(arg('boundary')) } : {};
    if (!fs.existsSync(output)) jobs.push({ name, seed, variant: v, scenario, output, ...Object.fromEntries(Object.entries(sizes).filter(([, x]) => x)) });
  }
  const failed = await runPool({ jobs, workers, script: self, dir: run.dir });
  run.finish({ jobs: jobs.length, failed });
  console.log(`${run.id}: finished, ${failed.length} failed`);
}

if (process.argv.includes('--job')) await child(arg('job'));
else await driver();
