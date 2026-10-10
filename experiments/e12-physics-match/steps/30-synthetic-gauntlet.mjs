// Step 30: the tournament on synthetic segments with known truth (PLAN.md
// sections 7 and 8). --set validate: HPOP truths from config.synthetic.sets
// .validate seeds. --set reference: Orekit and GMAT truths (config.synthetic
// .reference), including models HPOP lacks. The default fit's fingerprint
// gives the classifiers' proposals (--model, step 20's output); the
// tournament identifies the configuration; the truth is scored too.
//   node steps/30-synthetic-gauntlet.mjs --set validate --model runs/<train>.json --shard i/n
import path from 'node:path';
import { config, cli, begin, jsonl } from '../common.mjs';
import { syntheticCase, publishCase } from '../synthetic.mjs';
import { label } from '../hypothesis.mjs';
import { defaultOf, prepare, scoreWithFingerprint } from '../segment.mjs';
import { runGauntlet } from '../gauntlet.mjs';
import { loadModels, propose } from '../proposals.mjs';
import { scoreHypothesis } from '../fit.mjs';
import { referenceSegment } from '../reference/reference-cases.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';

const args = cli({ set: { type: 'string', default: 'validate' }, model: { type: 'string' } });
const { run, env } = await begin(`30-synthetic-gauntlet-${args.values.set}`, args);
const out = jsonl(run, 'cases.jsonl');
const settings = { ...config.fit, gauntlet: config.gauntlet };
const models = args.values.model ? loadModels(path.resolve(repoRoot, args.values.model)) : null;
if (models) run.addInputs('model', { [path.basename(models.file)]: models.sha256 ?? 'see file' });
const items = args.values.set === 'reference'
  ? config.synthetic.reference.cases.map((c) => ({ id: `ref-${c.id}`, ref: c }))
  : Array.from({ length: config.synthetic.sets[args.values.set].count }, (_, k) => ({ id: `syn-${config.synthetic.sets[args.values.set].from + k}`, seed: config.synthetic.sets[args.values.set].from + k }));
for (let k = args.shard.index; k < items.length; k += args.shard.count) {
  const item = items[k];
  if (out.done.has(item.id)) continue;
  const t = performance.now();
  try {
    let segment, truth, c = null;
    if (item.ref) ({ segment, truth } = await referenceSegment(env, item.ref, config, run));
    else { c = syntheticCase(config, item.seed); segment = await publishCase(env, c, config.fit); truth = c.truth; }
    segment = { ...prepare(segment, settings), observedWeather: true };
    const start = defaultOf(segment);
    const def = await scoreWithFingerprint(env, start, segment, settings);
    const proposed = models ? propose(models, def.fingerprint.vector, segment) : null;
    const lines = [];
    const g = await runGauntlet(env, segment, start, settings, { proposals: proposed?.proposals, presets: config.presets, log: (l) => lines.push(l) });
    let oracle = null;
    if (truth.inHpop !== false) {
      const points = await env.toGcrf(segment.points, segment.label, truth);
      const o = await scoreHypothesis(env, truth, segment, points, settings, { start: g.start });
      oracle = { closureRms: o.closureRms, closureMax: o.closureMax, fitRms: o.fitRms, bic: o.bic, parameters: o.parameters };
    }
    out.write({
      id: item.id, seed: item.seed ?? null, regime: c?.regime ?? item.ref.regime, truth, truthLabel: truth.inHpop === false ? truth.description : label(truth), publish: c?.publish ?? null,
      default: { label: label(start), closureRms: def.scores.closureRms, closureMax: def.scores.closureMax, fitRms: def.scores.fitRms }, fingerprint: def.fingerprint.vector,
      proposals: proposed?.proposals ?? null, identified: g.hypothesis, identifiedLabel: g.label, score: g.score, confidence: g.confidence, presets: g.presets,
      passes: g.passes, evaluations: g.evaluations, converged: g.converged, oracle, log: lines, seconds: (performance.now() - t) / 1000,
    });
    console.log(`${item.id} ${g.evaluations} evals: identified closure ${g.score.closureRms.toExponential(2)} m (default ${def.scores.closureRms.toExponential(2)}, truth ${oracle?.closureRms?.toExponential(2) ?? '-'}) ${((performance.now() - t) / 1000).toFixed(0)} s`);
  } catch (error) {
    out.write({ id: item.id, error: String(error.stack ?? error).slice(0, 500) });
    console.log(`${item.id} error ${error.message}`);
  }
  run.checkpoint();
}
run.finish();
await env.destroy();
