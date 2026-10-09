#!/usr/bin/env node
// E2 step 20: C2 products and their propagated covariance, scored against
// precise orbits (PLAN.md section 4).
//
// For each object and each product time (every strideDays from the window's
// start), the product epoch is the epoch of the object's last element set at
// or before that time. Its pseudo-observations are the full GCRF states of
// the sets in [epoch - span, epoch] (analysis/epoch-state), weighted by the
// regime's at-epoch error second moment from train (c1.json, 6x6 RTN). The
// fit (analysis/estimation fit_batch, propagator/hpop answering) gives the
// state and parameters at the epoch with the formal covariance scaled by the
// reduced chi-square. HPOP then propagates the product to the first precise-
// orbit epoch at or after each horizon twice: with that covariance and no
// noise (A), and with zero initial covariance and unit white-acceleration
// noise on the three RTN axes (U), so that any density q gives
// P(q) = A + q U (C4). Per-product rows go to runs/ (they derive from
// element sets).
//
//   node experiments/e2-catalog-covariance/steps/20-products.mjs --window train --c1 results/e2/train/c1.json \
//     [--spans 3,5,7] [--shard 0/4] [--resume RUN_ID] [--objects n,n] [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import { decodeOemStream } from '../../../harness/records.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { epochMs } from '../../../harness/gp-archive.mjs';
import { DAY_MS, cli, config, configPath, productContext, regimeObjects, windowSets } from '../common.mjs';
import { addMeanOuter, lowerToFull } from '../moments.mjs';
import { conditioned, epochStates, fitProduct, propagateProduct } from '../product.mjs';

const { values, window, modules, archive, reference: referenceDir, objects: only } = cli({
  c1: { type: 'string' }, spans: { type: 'string' }, shard: { type: 'string' }, resume: { type: 'string' }, limit: { type: 'string' },
});
if (!values.c1) throw new Error('--c1 (the train window c1.json) is required: the pseudo-observation weights come from train');
const c1 = JSON.parse(fs.readFileSync(path.resolve(values.c1), 'utf8'));
const spans = (values.spans ?? config.products.fitSpansDays.join(',')).split(',').map(Number);
const [shard, shards] = (values.shard ?? '0/1').split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `20-products-${window.name}${shards > 1 ? `-s${shard}of${shards}` : ''}`, configPath, modulesDir: modules, args: values, resume: values.resume });
run.addInputs('c1', { [path.basename(values.c1)]: (await import('../../../harness/modules.mjs')).sha256(fs.readFileSync(path.resolve(values.c1))) });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const ctx = await productContext(modules, run);
const rowsFile = path.join(run.dir, 'products.jsonl');
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.norad}|${r.scheduled}|${r.spanDays}`; }) : []);
const keep = (row) => fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
const lo = Date.parse(`${window.from}T00:00:00Z`), hi = Date.parse(`${window.to}T00:00:00Z`) + DAY_MS;
const horizonsMs = config.products.horizonsDays.map((d) => d * DAY_MS);
const unitQ = 1e-10;  // m^2/s^3 on each RTN axis for U; P(q) = A + (q / unitQ) U

let count = 0;
for (const [name, regime] of Object.entries(config.regimes)) {
  const c1Regime = c1.regimes[name];
  if (!c1Regime) { log(`${name}: no C1 weights in ${values.c1}; skipped`); continue; }
  const epochStratum = c1Regime.epoch.strata.find((s) => s.regime === regime.gpRegime && s.ageIndex === 0);
  // km, km/s -> m, m/s: every entry of the 6x6 times 1e6.
  const covarianceRtn = lowerToFull(addMeanOuter(epochStratum).covariance).map((v) => v * 1e6);
  const n = 6 + regime.parameters.length;
  const apriori = Array(n * n).fill(0);
  config.products.aprioriStateSigma.forEach((s, i) => { apriori[i * n + i] = s * s; });
  regime.parameters.forEach((p, i) => { apriori[(6 + i) * n + 6 + i] = p.sigma * p.sigma; });
  const settings = { parameters: regime.parameters.map(({ kind, value }) => ({ kind, value })), apriori, covarianceRtn, forces: regime.forces,
    integrator: config.products.integrator, ...config.products.fit };

  const reference = new ReferenceIndex(referenceDir, regime.productPrefix);
  const objects = [...regimeObjects(referenceDir, regime)].filter((x) => !only || only.has(x)).sort((a, b) => a - b).filter((_, i) => i % shards === shard);
  const { sets, files } = windowSets(archive, window, new Set(objects));
  run.addInputs('gpHistory', files);
  for (const norad of objects) {
    const mine = sets.filter((s) => s.norad === norad).sort((a, b) => epochMs(a.epoch) - epochMs(b.epoch));
    if (!mine.length) continue;
    const states = await epochStates(ctx.epochState, mine);
    // Truth for the object over the window plus the longest horizon.
    const truth = new Map();
    for (const f of reference.frames(norad, lo - DAY_MS, hi + Math.max(...horizonsMs) + DAY_MS))
      for (const o of decodeOemStream(new Uint8Array(f.payload)))
        for (const l of o.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES) truth.set(Date.parse(l.EPOCH.replace(/Z?$/, 'Z')), [l.X * 1000, l.Y * 1000, l.Z * 1000]);
    const truthTimes = [...truth.keys()].sort((a, b) => a - b);
    const firstAtOrAfter = (t) => { let a = 0, b = truthTimes.length; while (a < b) { const m = (a + b) >> 1; if (truthTimes[m] < t) a = m + 1; else b = m; } return truthTimes[a]; };
    for (let ts = lo; ts < hi; ts += config.products.strideDays * DAY_MS) {
      const last = mine.findLastIndex((s) => epochMs(s.epoch) <= ts);
      if (last < 0 || ts - epochMs(mine[last].epoch) > DAY_MS || !states[last]) continue;
      const tp = epochMs(mine[last].epoch);
      for (const spanDays of spans) {
        const key = `${norad}|${iso(ts)}|${spanDays}`;
        if (done.has(key)) continue;
        const row = { regime: name, norad, scheduled: iso(ts), spanDays, epoch: states[last].epoch, gpId: mine[last].gpId };
        const used = [];
        for (let i = 0; i <= last; ++i) if (states[i] && tp - epochMs(mine[i].epoch) <= spanDays * DAY_MS) used.push(states[i]);
        row.sets = used.length;
        if (used.length < config.products.minimumSets) { keep({ ...row, skipped: 'too few element sets' }); continue; }
        const scoring = horizonsMs.map((h) => firstAtOrAfter(tp + h)).map((t, k) => (t !== undefined && t - (tp + horizonsMs[k]) <= 15 * 60000 ? t : null));
        if (scoring.every((t) => t === null)) { keep({ ...row, skipped: 'no precise orbit at any horizon' }); continue; }
        try {
          const inputs = ctx.inputsFor(tp - (spanDays + 1) * DAY_MS, tp + Math.max(...horizonsMs) + DAY_MS);
          const reference0 = states[last];
          const r = await fitProduct({ estimation: ctx.estimation, hpop: ctx.hpop, codec: ctx.codec, inputs }, reference0, used, settings);
          Object.assign(row, { status: r.status, hpopCalls: r.hpopCalls, iterations: r.fit.iterations, converged: r.fit.converged,
            reducedChiSquare: r.fit.reducedChiSquare, weightedRms: r.fit.weightedRms, degreesOfFreedom: r.fit.degreesOfFreedom,
            parameters: r.fit.estimate.slice(6), parameterSigmas: regime.parameters.map((_, i) => Math.sqrt(r.fit.covariance[(6 + i) * n + 6 + i])) });
          const epochs = scoring.filter((t) => t !== null).map(iso);
          const product = { epoch: reference0.epoch, estimate: r.fit.estimate };
          const a = await propagateProduct({ hpop: ctx.hpop, inputs }, product, epochs, settings, { covariance: conditioned(r.fit.scaledCovariance), noise: null });
          const u = await propagateProduct({ hpop: ctx.hpop, inputs }, product, epochs, settings,
            { covariance: Array(n * n).fill(0), noise: { q: [unitQ, unitQ, unitQ], intervalSeconds: config.c4.discretizationSeconds } });
          let k = 0;
          row.horizons = scoring.map((t, h) => {
            if (t === null) return { days: config.products.horizonsDays[h], missing: true };
            const tr = truth.get(t), s = a[k], w = u[k];
            ++k;
            return { days: config.products.horizonsDays[h], truthEpoch: iso(t), error: s.position.map((v, i) => v - tr[i]), a: s.covariance3, u: w.covariance3.map((v) => v / unitQ) };
          });
        } catch (error) {
          row.error = String(error.message).slice(0, 300);
        }
        keep(row);
        if (++count % 20 === 0) { run.checkpoint(); log(`${count} products`); }
        if (values.limit && count >= Number(values.limit)) break;
      }
      if (values.limit && count >= Number(values.limit)) break;
    }
    run.addInputs('reference', reference.read);
    reference.dropCache();
    if (values.limit && count >= Number(values.limit)) break;
  }
}
run.finish({ products: count });
log(`${count} products written to ${path.relative(process.cwd(), rowsFile)}`);
await ctx.destroy();
