// Part A runs (PLAN.md section 3): the paper's three cases, every variant,
// in up to --workers child processes; resumable. The paper's epochs are not
// test seeds of Part B, but the cases run after the freeze like the tests.
//   node steps/40-parta.mjs --variants E26:k=1,UKF,... [--cases A1-leo-nominal,...] [--workers 6] [--resume <run-id>]
//   child: node steps/40-parta.mjs --job <job.json>
import fs from 'node:fs';
import path from 'node:path';
import { config, configPath, assertReadable, loadModules, modulesDir, repoPath } from '../common.mjs';
import { arg, runPool } from '../jobs.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';

const MODULES = ['propagator/hpop', 'foundation/frames', 'foundation/time', 'analysis/access', 'analysis/observation-simulator', 'analysis/estimation', 'data-source/eop-parser'];
const cacheDir = path.join(repoRoot, 'runs', 'cache', 'e10', 'partA');
const self = new URL(import.meta.url).pathname;

async function child(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const { environment } = await import('../hpop.mjs');
  const { eopRowStream } = await import('../scenario.mjs');
  const { buildPaperCase, paperSpan } = await import('../parta.mjs');
  const { variantSpec, runAndScore } = await import('../partb.mjs');
  const { estimationCodec } = await import('../estimation-codec.mjs');
  const { loaded } = await loadModules(null, MODULES);
  const m = { hpop: loaded['propagator/hpop'], frames: loaded['foundation/frames'], time: loaded['foundation/time'], access: loaded['analysis/access'], simulator: loaded['analysis/observation-simulator'], est: loaded['analysis/estimation'], parser: loaded['data-source/eop-parser'] };
  const { epochMs, endMs } = paperSpan(job.case);
  const env = await environment({ parser: m.parser, kernelPath: repoPath(config.inputs.kernel2018), eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs: epochMs, toMs: endMs });
  if (job.kind === 'scenario') {
    const sc = await buildPaperCase(m, env, await eopRowStream(m.parser, config.inputs.eopC04), job.case);
    fs.writeFileSync(`${job.output}.tmp`, JSON.stringify(sc));
    fs.renameSync(`${job.output}.tmp`, job.output);
    console.log(`scenario ${job.case}: ${sc.observations.length} observations, ${sc.windows} windows`);
    return;
  }
  const sc = JSON.parse(fs.readFileSync(job.scenario, 'utf8'));
  const codec = await estimationCodec(modulesDir());
  const ctx = { codec, est: m.est, hpop: m.hpop, env, filterModel: config.forceModels[sc.filterModel] };
  const out = await runAndScore(ctx, sc, variantSpec(job.variant));
  fs.writeFileSync(`${job.output}.tmp`, JSON.stringify({ case: job.case, variant: job.variant, epochMs: sc.epochMs, ...out }));
  fs.renameSync(`${job.output}.tmp`, job.output);
  console.log(`run ${job.case} ${job.variant}: ${out.rows.length} epochs, ${out.calls?.hpop} HPOP calls, ${out.seconds?.toFixed(0)} s${out.failure ? ` FAILURE ${JSON.stringify(out.failure)}` : ''}`);
}

async function driver() {
  assertReadable('test');
  const { PAPER_CASES } = await import('../parta.mjs');
  const cases = (arg('cases') ?? PAPER_CASES.join(',')).split(',');
  const variants = (arg('variants') ?? '').split(',').filter(Boolean);
  const workers = Math.min(6, Number(arg('workers', 6)));
  const run = startRun({ experiment: 'e10-teag-espf', step: '40-parta', configPath, modulesDir: modulesDir(), args: { cases, variants, workers }, resume: arg('resume') });
  await loadModules(run, MODULES);
  const inputs = { kernel2018: repoPath(config.inputs.kernel2018), eopC04: config.inputs.eopC04, solfsmy: config.inputs.solfsmy, dtcfile: config.inputs.dtcfile, kp: config.inputs.kp };
  run.addInputs('files', Object.fromEntries(Object.entries(inputs).map(([k, f]) => [k, sha256(fs.readFileSync(f))])));
  run.checkpoint();
  const jobsDir = path.join(run.dir, 'jobs');
  for (const d of [cacheDir, jobsDir]) fs.mkdirSync(d, { recursive: true });
  const scenarioJobs = [], runJobs = [];
  for (const c of cases) {
    const scenario = path.join(cacheDir, `${c}.json`);
    if (!fs.existsSync(scenario)) scenarioJobs.push({ name: `scenario-${c}`, kind: 'scenario', case: c, output: scenario });
    for (const v of variants) {
      const name = `${c}-${v.replace(/[:=]/g, '_')}`;
      const output = path.join(jobsDir, `${name}.json`);
      if (!fs.existsSync(output)) runJobs.push({ name, kind: 'run', case: c, variant: v, scenario, output });
    }
  }
  const weight = (j) => (j.variant.startsWith('E26') ? 3 : 1) * (j.case.startsWith('A3') ? 1 : 4);
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
