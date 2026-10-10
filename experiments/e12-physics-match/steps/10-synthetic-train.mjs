// Step 10: the synthetic training set (PLAN.md section 7). For each seed of
// config.synthetic.train: build the case, publish it, fit HPOP's default
// hypothesis (full force on the file's labels) and keep its residual
// fingerprint, and fit the generating hypothesis itself (the oracle): its
// half-split closure is the 1 cm acceptance test of section 8.
//   node steps/10-synthetic-train.mjs --shard i/n [--resume <run>]
import { config, cli, begin, jsonl } from '../common.mjs';
import { syntheticCase, publishCase } from '../synthetic.mjs';
import { label } from '../hypothesis.mjs';
import { defaultOf, prepare, scoreWithFingerprint } from '../segment.mjs';
import { scoreHypothesis } from '../fit.mjs';

const args = cli({ set: { type: 'string', default: 'train' } });
const { run, env } = await begin(`10-synthetic-${args.values.set}`, args);
const out = jsonl(run, 'cases.jsonl');
const { from, count } = config.synthetic.sets[args.values.set];
const settings = { ...config.fit, gauntlet: config.gauntlet };
for (let k = args.shard.index; k < count; k += args.shard.count) {
  const seed = from + k, id = `syn-${seed}`;
  if (out.done.has(id)) continue;
  const t = performance.now();
  const c = syntheticCase(config, seed);
  try {
    const segment = { ...prepare(await publishCase(env, c, config.fit), settings), observedWeather: true };
    const d = defaultOf(segment);
    const def = await scoreWithFingerprint(env, d, segment, settings);
    const points = await env.toGcrf(segment.points, segment.label, c.truth);
    const oracle = await scoreHypothesis(env, c.truth, segment, points, settings, { start: { b: c.coefficients.b || undefined, agom: c.coefficients.agom || undefined } });
    out.write({
      id, seed, regime: c.regime, truth: c.truth, truthLabel: label(c.truth), publish: c.publish, coefficients: c.coefficients, epoch: c.epoch,
      default: { label: label(d), ...def.scores, start: undefined }, fingerprint: def.fingerprint.vector,
      oracle: { ...oracle, start: undefined }, seconds: (performance.now() - t) / 1000,
    });
    console.log(`${id} ${c.regime} default closure ${def.scores.closureRms.toExponential(2)} m, oracle closure ${oracle.closureRms.toExponential(2)} m (max ${oracle.closureMax.toExponential(2)}) ${((performance.now() - t) / 1000).toFixed(0)} s`);
  } catch (error) {
    out.write({ id, seed, regime: c.regime, truthLabel: label(c.truth), error: String(error.message ?? error).slice(0, 300) });
    console.log(`${id} error ${error.message}`);
  }
  run.checkpoint();
}
run.finish();
await env.destroy();
