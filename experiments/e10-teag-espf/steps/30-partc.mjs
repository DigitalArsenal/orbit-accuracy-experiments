// Part C runs (PLAN.md section 3): GPS arcs seeded and updated by element
// sets, scored against ESA final orbits. The driver selects and prepares the
// arcs (runs/cache/e10/partC/<window>, ignored by git: element-set states stay
// local); each child runs every requested variant on one arc. Resumable.
//   node steps/30-partc.mjs --window dev|test --variants E26:k=1,UKF,... \
//        [--sensitivity primary,corr] [--workers 6] [--resume <run-id>] [--limit <arcs>] [--days d1,d2]
//   child: node steps/30-partc.mjs --job <job.json>
import fs from 'node:fs';
import path from 'node:path';
import { config, configPath, assertReadable, loadModules, modulesDir, repoPath, DAY_MS } from '../common.mjs';
import { arg, runPool } from '../jobs.mjs';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { readElementSets, shiftDay, epochMs as setEpochMs } from '../../../harness/gp-archive.mjs';

const MODULES = ['propagator/hpop', 'foundation/frames', 'analysis/estimation', 'analysis/epoch-state', 'data-source/eop-parser'];
const self = new URL(import.meta.url).pathname;
const kernelFor = (window) => (window === 'dev' ? repoPath(config.partC.devKernel ?? 'data/e10/de440-2024.bsp') : path.join(modulesDir(), config.inputs.kernel2026));

// The per-axis sigma scales of the correlation sensitivity (PLAN.md
// amendment 1): sqrt((1 + rho) / (1 - rho)), rho E2b's train correlation of
// consecutive element sets' errors (GPS, at the newer set's epoch).
export function correlationScales() {
  const c = config.partC.correlationSensitivity;
  const model = JSON.parse(fs.readFileSync(repoPath(c.file), 'utf8'));
  const rho = model.regimes[c.regime].pooledRho[c.key];
  return ['R', 'T', 'N'].map((a) => Math.sqrt((1 + rho[a].estimate) / (1 - rho[a].estimate)));
}

async function child(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const { environment } = await import('../hpop.mjs');
  const { arcScenario, e2SecondMoment } = await import('../partc.mjs');
  const { variantSpec, runAndScore } = await import('../partb.mjs');
  const { estimationCodec } = await import('../estimation-codec.mjs');
  const { loaded } = await loadModules(null, MODULES);
  const prepared = JSON.parse(fs.readFileSync(job.arc, 'utf8'));
  const { secondMoment } = e2SecondMoment();
  const first = prepared.rows[0].ms, last = prepared.rows.at(-1).ms;
  const env = await environment({ parser: loaded['data-source/eop-parser'], kernelPath: kernelFor(job.window), eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs: first - DAY_MS, toMs: last + DAY_MS });
  const codec = await estimationCodec(modulesDir());
  const ctx = { codec, est: loaded['analysis/estimation'], hpop: loaded['propagator/hpop'], env, filterModel: config.forceModels[config.partC.forceModel] };
  for (const sensitivity of job.sensitivities) {
    const sc = arcScenario(prepared, secondMoment, { sigmaScale: sensitivity === 'corr' ? correlationScales() : [1, 1, 1] });
    for (const v of job.variants) {
      const output = path.join(job.jobsDir, `${job.name}-${v.replace(/[:=]/g, '_')}-${sensitivity}.json`);
      if (fs.existsSync(output)) continue;
      const out = await runAndScore(ctx, sc, variantSpec(v));
      fs.writeFileSync(`${output}.tmp`, JSON.stringify({ norad: sc.norad, start: sc.start, epochMs: sc.epochMs, variant: v, sensitivity, setErrors: sc.setErrors, seedError: sc.seedError, ...out }));
      fs.renameSync(`${output}.tmp`, output);
      console.log(`${job.name} ${v} ${sensitivity}: ${out.rows.length} updates, ${out.calls?.hpop} HPOP calls, ${out.seconds?.toFixed(1)} s${out.failure ? ` FAILURE ${JSON.stringify(out.failure)}` : ''}`);
    }
  }
}

async function driver() {
  const window = arg('window');
  if (!['dev', 'test'].includes(window)) throw new Error('--window dev|test');
  assertReadable(window);
  const variants = (arg('variants') ?? '').split(',').filter(Boolean);
  const sensitivities = (arg('sensitivity') ?? 'primary').split(',');
  const workers = Math.min(6, Number(arg('workers', 6)));
  // --days: a subset of the window's start days (a window split across runs).
  const w0 = config.partC[`${window}Window`];
  const w = { ...w0, startDays: arg('days') ? arg('days').split(',') : w0.startDays };
  for (const d of w.startDays) if (!w0.startDays.includes(d)) throw new Error(`${d} is not a ${window} start day`);
  const run = startRun({ experiment: 'e10-teag-espf', step: `30-partc-${window}`, configPath, modulesDir: modulesDir(), args: { window, variants, sensitivities, workers, days: w.startDays }, resume: arg('resume') });
  const { loaded } = await loadModules(run, MODULES);
  const cacheDir = path.join(repoRoot, 'runs', 'cache', 'e10', 'partC', window), jobsDir = path.join(run.dir, 'jobs');
  for (const d of [cacheDir, jobsDir]) fs.mkdirSync(d, { recursive: true });
  const index = new ReferenceIndex(config.inputs.reference, config.partC.productPrefix, { system: config.partC.system });
  const objects = new Set(index.objects());
  const lastDay = shiftDay(w.startDays.at(-1), config.partC.arcDays + 2);
  const { sets, files } = readElementSets(config.inputs.gpHistory, w.startDays[0], lastDay, { keep: (norad) => objects.has(norad), lagDays: config.partC.lagDays });
  run.addInputs('elementSetFiles', files);
  const inputs = { kernel: kernelFor(window), eopC04: config.inputs.eopC04, statistic: repoPath(config.partC.statistic.file) };
  if (config.partC.correlationSensitivity) inputs.correlationModel = repoPath(config.partC.correlationSensitivity.file);
  run.addInputs('files', Object.fromEntries(Object.entries(inputs).map(([k, f]) => [k, sha256(fs.readFileSync(f))])));
  const { arcsFor, epochStates, prepareArc } = await import('../partc.mjs');
  const arcs = arcsFor(sets, [...objects].sort((a, b) => a - b), { startDays: w.startDays, arcDays: config.partC.arcDays, minimumUpdates: config.partC.minimumUpdates }, index);
  // Arcs not yet prepared: SGP4 states in one call, then truth and RTN axes.
  const pending = arcs.filter((a) => !fs.existsSync(path.join(cacheDir, `${a.norad}-${a.start}.json`)));
  if (pending.length) {
    const unique = new Map();
    for (const a of pending) for (const s of [a.seed, ...a.updates]) unique.set(s.gpId, s);
    const list = [...unique.values()];
    const states = new Map((await epochStates(loaded['analysis/epoch-state'], list)).map((s, i) => [list[i].gpId, s?.state ?? null]));
    const { environment } = await import('../hpop.mjs');
    const m = { hpop: loaded['propagator/hpop'], frames: loaded['foundation/frames'] };
    for (const a of pending) {
      const first = setEpochMs(a.seed.epoch), last = setEpochMs(a.updates.at(-1).epoch);
      const env = await environment({ parser: loaded['data-source/eop-parser'], kernelPath: kernelFor(window), eopPath: config.inputs.eopC04, setPaths: config.inputs, kpPath: config.inputs.kp, fromMs: first - DAY_MS, toMs: last + DAY_MS });
      const prepared = await prepareArc(m, env, config.forceModels[config.partC.forceModel], index, a, states);
      fs.writeFileSync(path.join(cacheDir, `${a.norad}-${a.start}.json`), JSON.stringify(prepared ?? { skipped: true, norad: a.norad, start: a.start }));
    }
  }
  run.addInputs('referenceFiles', index.read);
  const jobs = [];
  const limit = Number(arg('limit', Infinity));
  for (const a of arcs.slice(0, limit)) {
    const file = path.join(cacheDir, `${a.norad}-${a.start}.json`);
    if (JSON.parse(fs.readFileSync(file, 'utf8')).skipped) continue;
    jobs.push({ name: `${a.norad}-${a.start}`, window, arc: file, variants, sensitivities, jobsDir });
  }
  run.checkpoint();
  console.log(`${run.id}: ${arcs.length} arcs, ${jobs.length} prepared, ${workers} workers`);
  const failed = await runPool({ jobs, workers, script: self, dir: run.dir });
  run.finish({ arcs: arcs.length, jobs: jobs.length, failed });
  console.log(`${run.id}: finished, ${failed.length} failed`);
}

if (process.argv.includes('--job')) await child(arg('job'));
else await driver();
