// Part B runs (PLAN.md sections 3-5): each (seed, case) scenario is built once
// (runs/cache/e10/partB, ignored by git), then every (seed, case, variant) is
// run and scored in up to --workers child processes. Resumable: a job whose
// output exists is skipped.
//   node steps/10-partb.mjs --phase dev|test --variants E26:k=1,UKF,... \
//        [--cases B1-nominal,...] [--seeds d1,...] [--workers 6] [--resume <run-id>]
//   child: node steps/10-partb.mjs --job <job.json>
import fs from 'node:fs';
import path from 'node:path';
import { config, configPath, assertReadable, loadModules, modulesDir, repoPath } from '../common.mjs';
import { arg, runPool } from '../jobs.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';

const MODULES = ['propagator/hpop', 'foundation/frames', 'foundation/time', 'analysis/access', 'analysis/observation-simulator', 'analysis/estimation', 'data-source/eop-parser'];
const cacheDir = path.join(repoRoot, 'runs', 'cache', 'e10', 'partB');
const self = new URL(import.meta.url).pathname;

async function child(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const { environment } = await import('../hpop.mjs');
  const { eopRowStream } = await import('../scenario.mjs');
  const { buildCase, variantSpec, runAndScore } = await import('../partb.mjs');
  const { estimationCodec } = await import('../estimation-codec.mjs');
  const { loaded } = await loadModules(null, MODULES);
  const m = { hpop: loaded['propagator/hpop'], frames: loaded['foundation/frames'], time: loaded['foundation/time'], access: loaded['analysis/access'], simulator: loaded['analysis/observation-simulator'], est: loaded['analysis/estimation'], parser: loaded['data-source/eop-parser'] };
  const envFor = (fromMs, toMs) => environment({ parser: m.parser, kernelPath: path.join(modulesDir(), config.inputs.kernel2026), eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs, toMs });
  if (job.kind === 'scenario') {
    const { msOf } = await import('../common.mjs');
    const { seedSpec } = await import('../partb.mjs');
    const epochMs = msOf(seedSpec(job.seed).epoch), endMs = epochMs + config.partB.arcHours * 3600e3;
    const sc = await buildCase(m, await envFor(epochMs, endMs), await eopRowStream(m.parser, config.inputs.eopC04), job.seed, job.case);
    fs.writeFileSync(`${job.output}.tmp`, JSON.stringify(sc));
    fs.renameSync(`${job.output}.tmp`, job.output);
    console.log(`scenario ${job.seed} ${job.case}: ${sc.observations.length} observations, ${sc.windows} windows`);
    return;
  }
  const sc = JSON.parse(fs.readFileSync(job.scenario, 'utf8'));
  const codec = await estimationCodec(modulesDir());
  const ctx = { codec, est: m.est, hpop: m.hpop, env: await envFor(sc.epochMs, sc.endMs), filterModel: config.forceModels[sc.filterModel] };
  const out = await runAndScore(ctx, sc, variantSpec(job.variant));
  fs.writeFileSync(`${job.output}.tmp`, JSON.stringify({ seed: job.seed, case: job.case, variant: job.variant, ...out }));
  fs.renameSync(`${job.output}.tmp`, job.output);
  console.log(`run ${job.seed} ${job.case} ${job.variant}: ${out.rows.length} epochs, ${out.calls?.hpop} HPOP calls, ${out.seconds?.toFixed(0)} s${out.failure ? ` FAILURE ${JSON.stringify(out.failure)}` : ''}`);
}

async function driver() {
  const phase = arg('phase');
  if (!['dev', 'test'].includes(phase)) throw new Error('--phase dev|test');
  assertReadable(phase);
  const seeds = (arg('seeds') ?? (phase === 'dev' ? config.partB.devSeeds : config.partB.testSeeds).map((s) => s.id).join(',')).split(',');
  const allowed = new Set((phase === 'dev' ? config.partB.devSeeds : config.partB.testSeeds).map((s) => s.id));
  for (const s of seeds) if (!allowed.has(s)) throw new Error(`seed ${s} is not a ${phase} seed`);
  const cases = (arg('cases') ?? Object.keys(config.partB.cases).join(',')).split(',');
  const variants = (arg('variants') ?? '').split(',').filter(Boolean);
  const workers = Math.min(6, Number(arg('workers', 6)));
  const args = { phase, seeds, cases, variants, workers };
  const run = startRun({ experiment: 'e10-teag-espf', step: `10-partb-${phase}`, configPath, modulesDir: modulesDir(), args, resume: arg('resume') });
  await loadModules(run, MODULES);
  const inputs = { kernel2026: path.join(modulesDir(), config.inputs.kernel2026), eopC04: config.inputs.eopC04, solfsmy: config.inputs.solfsmy, dtcfile: config.inputs.dtcfile, kp: config.inputs.kp };
  run.addInputs('files', Object.fromEntries(Object.entries(inputs).map(([k, f]) => [k, sha256(fs.readFileSync(repoPath(f)))])));
  run.checkpoint();
  const jobsDir = path.join(run.dir, 'jobs');
  for (const d of [cacheDir, jobsDir]) fs.mkdirSync(d, { recursive: true });
  const scenarioJobs = [], runJobs = [];
  for (const seed of seeds) for (const c of cases) {
    const scenario = path.join(cacheDir, `${seed}-${c}.json`);
    if (!fs.existsSync(scenario)) scenarioJobs.push({ name: `scenario-${seed}-${c}`, kind: 'scenario', seed, case: c, output: scenario });
    for (const v of variants) {
      const name = `${seed}-${c}-${v.replace(/[:=]/g, '_')}`;
      const output = path.join(jobsDir, `${name}.json`);
      if (!fs.existsSync(output)) runJobs.push({ name, kind: 'run', seed, case: c, variant: v, scenario, output });
    }
  }
  const weight = (j) => (j.variant.startsWith('E26') ? 3 : j.variant === 'BLS' ? 2 : 1);
  runJobs.sort((a, b) => weight(b) - weight(a));
  console.log(`${run.id}: ${scenarioJobs.length} scenarios, ${runJobs.length} runs, ${workers} workers`);
  const failed = [
    ...await runPool({ jobs: scenarioJobs, workers, script: self, dir: run.dir }),
    ...await runPool({ jobs: runJobs.filter((j) => fs.existsSync(j.scenario)), workers, script: self, dir: run.dir }),
  ];
  run.finish({ jobs: runJobs.length, scenarios: scenarioJobs.length, failed });
  console.log(`${run.id}: finished, ${failed.length} failed`);
}

if (process.argv.includes('--job')) await child(arg('job'));
else await driver();
