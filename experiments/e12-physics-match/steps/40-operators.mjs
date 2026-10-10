// Step 40: the operator campaign (PLAN.md section 9), after the freeze. The
// main thread lists and fetches the operators' files one at a time (polite,
// in memory) and hands each parsed file to a pool of worker threads, each
// with its own modules. A worker screens the file for maneuvers, takes its
// clean chunk(s), and:
//   --phase dev:     fingerprint, classifier proposals and the tournament;
//   --phase heldout: the default and the consensus configuration (step 45).
// Only derived results reach disk (cases.jsonl): scores, parameters,
// fingerprints, configurations and the files' provenance.
//   node steps/40-operators.mjs --phase dev --model <train.json> [--workers 5]
//   node steps/40-operators.mjs --phase heldout --consensus <consensus.json>
import path from 'node:path';
import fs from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { config, cli, assertFrozen, jsonl, configPath } from '../common.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';

const operatorConfig = { ...config, inputs: { ...config.inputs, ...config.operators.inputs } };

if (isMainThread) {
  const args = cli({ phase: { type: 'string', default: 'dev' }, model: { type: 'string' }, consensus: { type: 'string' }, workers: { type: 'string', default: '5' }, only: { type: 'string' }, list: { type: 'boolean' } });
  if (args.values.list) { // the job list only (listings, no ephemeris fetched or scored)
    const { jobs } = await import('../operators.mjs');
    for (const j of await jobs(config, args.values.phase)) console.log(j.phase, j.group, j.key);
    process.exit(0);
  }
  const freeze = assertFrozen();
  const run = startRun({ experiment: 'e12-physics-match', step: `40-operators-${args.values.phase}`, configPath, modulesDir: args.modules, args: args.values, resume: args.values.resume });
  run.manifest.freezeCommit = freeze;
  const out = jsonl(run, 'cases.jsonl');
  const { jobs } = await import('../operators.mjs');
  let list = await jobs(config, args.values.phase);
  if (args.values.only) list = list.filter((j) => j.key.startsWith(args.values.only));
  list = list.filter((j) => !out.done.has(j.key));
  console.log(`${list.length} jobs`);
  const n = Math.min(Number(args.values.workers), list.length);
  const workers = Array.from({ length: n }, () => new Worker(new URL(import.meta.url), { workerData: { modules: args.modules, phase: args.values.phase, model: args.values.model, consensus: args.values.consensus } }));
  for (const w of workers) await new Promise((resolve, reject) => { w.once('message', (m) => (m.ready ? resolve() : reject(new Error(m.error)))); w.once('error', reject); });
  const provenance = await new Promise((resolve) => { workers[0].once('message', resolve); workers[0].postMessage({ provenance: true }); });
  for (const p of Object.values(provenance)) run.addModule(p);
  run.checkpoint();
  const idle = [...workers];
  const waiting = [];
  const free = () => (idle.length ? Promise.resolve(idle.pop()) : new Promise((resolve) => waiting.push(resolve)));
  const release = (w) => (waiting.length ? waiting.shift()(w) : idle.push(w));
  const pending = [];
  for (const job of list) {
    const w = await free();
    let segments;
    try { segments = await job.fetch(); } catch (error) {
      out.write({ id: job.key, provider: job.provider, group: job.group, phase: job.phase, error: `fetch: ${String(error.message).slice(0, 300)}` });
      console.log(`${job.key} fetch error ${error.message}`); release(w); continue;
    }
    console.log(`${job.key}: fetched ${segments.length} segment(s), ${segments.reduce((a, s) => a + s.points.length, 0)} points`);
    pending.push(new Promise((resolve) => {
      w.once('message', (row) => { out.write({ id: job.key, provider: job.provider, group: job.group, phase: job.phase, ...row }); run.checkpoint(); console.log(`${job.key}: ${row.error ?? row.summary}`); release(w); resolve(); });
      w.postMessage({ job: { key: job.key, provider: job.provider, group: job.group, singleObject: !!job.singleObject }, segments });
    }));
    segments = null;
  }
  await Promise.all(pending);
  for (const w of workers) await w.terminate();
  run.finish();
} else {
  // ── worker ──
  const { loadEnvironment } = await import('../environment.mjs');
  const { prepare, defaultOf, scoreWithFingerprint, screen, chunkOf } = await import('../segment.mjs');
  const { runGauntlet } = await import('../gauntlet.mjs');
  const { loadModels, propose } = await import('../proposals.mjs');
  const { label, validate } = await import('../hypothesis.mjs');
  const { attribute } = await import('../attribution.mjs');
  const settings = { ...config.fit, gauntlet: config.gauntlet };
  let env;
  try { env = await loadEnvironment({ modulesDir: workerData.modules, config: operatorConfig }); } catch (error) { parentPort.postMessage({ error: String(error.message) }); process.exit(1); }
  const models = workerData.model ? loadModels(path.resolve(repoRoot, workerData.model)) : null;
  const consensus = workerData.consensus ? JSON.parse(fs.readFileSync(path.resolve(repoRoot, workerData.consensus), 'utf8')) : null;
  const lastGfzMs = Math.max(...[...env.gfz.days.entries()].filter(([, d]) => d.f107obs > 0).map(([day]) => Date.parse(`${day}T00:00:00Z`)));
  parentPort.postMessage({ ready: true });
  parentPort.on('message', async (m) => {
    if (m.provenance) { parentPort.postMessage(env.provenance); return; }
    const { job, segments } = m;
    try {
      const file = segments[0];
      const createdMs = file.created ? Date.parse(file.created) : Date.parse(file.points[0].epoch);
      const base = prepare({ id: job.key, label: file.label, meta: file.meta, points: file.points, cutoffMs: createdMs }, settings);
      const limit = job.singleObject && workerData.phase === 'heldout' ? 1 + config.operators.providers[job.provider].heldoutChunks : 1;
      const scr = await screen(env, base, settings, config.operators, { limit });
      const chunks = job.singleObject && workerData.phase === 'heldout' ? scr.chunks.slice(1) : scr.chunks.slice(0, 1);
      const info = { source: file.source, objectId: file.objectId, name: file.name, norad: file.norad, created: file.created, label: file.label, stepSeconds: file.meta.stepSeconds,
        digits: file.meta.digits, interpolation: file.meta.interpolation ?? null, header: (file.meta.comments ?? []).filter((c) => /MASS|DRAG|SOLAR|ephemeris_source|AREA|COEFF/i.test(c)).slice(0, 12),
        span: [file.points[0].epoch, file.points.at(-1).epoch], screen: scr.windows };
      if (!chunks.length) { parentPort.postMessage({ ...info, error: 'no maneuver-free chunk of the minimum length', summary: null }); return; }
      const results = [];
      for (const chunk of chunks) {
        const segment = { ...chunkOf(base, chunk), observedWeather: chunk.toMs + 86400000 < lastGfzMs + 86400000 };
        const start = defaultOf(segment);
        const def = await scoreWithFingerprint(env, start, segment, settings);
        const r = { chunk: [new Date(chunk.fromMs).toISOString(), new Date(chunk.toMs).toISOString()], points: segment.points.length, default: { label: label(start), ...def.scores, start: undefined }, defaultFingerprint: def.fingerprint.vector };
        if (workerData.phase === 'dev') {
          const proposed = models ? propose(models, def.fingerprint.vector, segment) : null;
          const g = await runGauntlet(env, segment, start, settings, { proposals: proposed?.proposals, presets: config.presets });
          const fin = await scoreWithFingerprint(env, g.hypothesis, segment, settings, g.start);
          Object.assign(r, { proposals: proposed?.probabilities ?? null, identified: g.hypothesis, identifiedLabel: g.label, score: { ...fin.scores, start: undefined }, confidence: g.confidence, presets: g.presets, passes: g.passes, evaluations: g.evaluations,
            finalFingerprint: fin.fingerprint.vector, attribution: attribute(fin.fingerprint.named, fin.scores, file.meta.digits) });
        } else {
          const h = validate({ ...start, ...(consensus.groups[job.group]?.hypothesis ?? {}), frame: start.frame === 'ITRF' ? 'ITRF' : (consensus.groups[job.group]?.hypothesis?.frame ?? start.frame) });
          const m2 = await scoreWithFingerprint(env, h, segment, settings);
          Object.assign(r, { matched: { label: label(h), ...m2.scores, start: undefined }, matchedFingerprint: m2.fingerprint.vector, attribution: attribute(m2.fingerprint.named, m2.scores, file.meta.digits) });
        }
        results.push(r);
      }
      const f = (x) => x.toExponential(2);
      parentPort.postMessage({ ...info, chunks: results, summary: results.map((r) => `default ${f(r.default.closureRms)} m -> ${f((r.score ?? r.matched).closureRms)} m`).join('; ') });
    } catch (error) { parentPort.postMessage({ error: String(error.stack ?? error).slice(0, 600), summary: null }); }
  });
}
