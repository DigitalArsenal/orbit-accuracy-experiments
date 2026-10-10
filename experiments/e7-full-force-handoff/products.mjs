// The products E7 compares (PLAN.md section 2), driven by the variant table
// in config.json: each variant names a method (sgp4, epoch, truth, arc), the
// element sets it starts from (published, E1-corrected, debiased), the drag
// coefficient rule, the drivers (released at the cutoff, or observed), the
// arc span, the arc weighting and whether arcs split at maneuvers. Every
// orbit computation is a module's (methods.mjs); this file assembles inputs.
import { decodeOemStream } from '../../harness/records.mjs';
import { DAY_MS, config, coefficients, forcesOf } from './common.mjs';
import { conditioned, epochStates, fitArc, hpopErrors, sgp4Errors, withParameters } from './methods.mjs';
import { correctSets } from './e1.mjs';
import { ObjectHistory } from './debias.mjs';
import { ManeuverHistory } from './maneuvers.mjs';
import { COMPONENTS, inflate, inflation } from './correlation.mjs';

export class Engine {
  // truth: regimeTruth output; byObject: setsByObjectOf output; weights,
  // correlation: train (and validation) products; chosen: config.chosen or
  // null (validation: every candidate is a variant of its own).
  constructor({ ctx, truth, byObject, gnss, e1, weights, correlation, chosen }) {
    Object.assign(this, { ctx, truth, byObject, gnss, e1, weights, correlation, chosen });
    this.objects = new Map();
  }

  async object(norad, regimeName) {
    if (this.objects.has(norad)) return this.objects.get(norad);
    const sets = this.byObject.get(norad);
    const products = this.truth[regimeName].products;
    const template = decodeOemStream(new Uint8Array(products.load(products.entries(norad)[0]).bytes))[0];
    const o = {
      regimeName, sets, products,
      states: await epochStates(this.ctx['epoch-state'], sets),
      history: new ObjectHistory(this.ctx, products, sets, this.e1.candidate.scales),
      maneuvers: new ManeuverHistory(this.ctx, regimeName, sets, template),
      e1: null,
    };
    this.objects.set(norad, o);
    return o;
  }
  async e1Sets(o) {
    if (!o.e1) { const sets = await correctSets(this.ctx, this.e1, o.sets); o.e1 = { sets, states: await epochStates(this.ctx['epoch-state'], sets) }; }
    return o.e1;
  }

  // A variant's choices for a regime, with 'chosen' taken from config.chosen.
  resolve(spec, regimeName) {
    const pick = (value, key) => {
      if (value !== 'chosen') return value;
      const v = this.chosen ? this.chosen[key]?.[regimeName] : config.devChoices[key];
      if (v === undefined || v === null) throw new Error(`no chosen ${key} for ${regimeName}`);
      return v;
    };
    const bRule = () => (spec.bRule === 'other' ? config.bRules.find((r) => r !== pick('chosen', 'bRule')) : pick(spec.bRule ?? 'chosen', 'bRule'));
    return {
      ...spec,
      bRule: config.regimes[regimeName].forces.drag ? bRule() : 'bstar',
      spanDays: spec.method === 'arc' ? pick(spec.spanDays ?? 'chosen', 'spanDays') : null,
      windowDays: spec.sets === 'debiased' ? pick(spec.windowDays ?? 'chosen', 'debiasWindowDays') : null,
      form: spec.weighting === 'correlated' ? pick(spec.form ?? 'chosen', 'correlationForm') : null,
      drivers: spec.drivers ?? 'released',
    };
  }

  // Maneuvers detected before the sample's cutoff (sets created by then), and
  // for the report only, in the prediction span (every set): event times.
  async maneuversOf(sample) {
    if (sample.maneuvers) return sample.maneuvers;
    const o = await this.object(sample.norad, sample.regime);
    const m = config.maneuvers, maxSpan = Math.max(...config.regimes[sample.regime].arcSpansDays) * DAY_MS;
    const pre = o.sets.map((s, i) => i).filter((i) => o.sets[i].createdMs <= sample.cutoffMs && o.sets[i].epochMs >= sample.cutoffMs - maxSpan - m.contextDays * DAY_MS);
    const horizon = Math.max(...config.horizonsHours) * 3600000;
    const all = o.sets.map((s, i) => i).filter((i) => o.sets[i].epochMs >= sample.epochMs - m.contextDays * DAY_MS && o.sets[i].epochMs <= sample.epochMs + horizon + m.contextDays * DAY_MS);
    const before = await o.maneuvers.detect(pre);
    const after = await o.maneuvers.detect(all);
    sample.maneuvers = {
      beforeCutoff: before.events.filter((e) => e.timeMs > sample.epochMs - maxSpan && e.timeMs <= sample.cutoffMs),
      inSpan: after.events.filter((e) => e.timeMs > sample.epochMs && e.timeMs <= sample.epochMs + horizon),
      blocks: { beforeCutoff: before.blocks, all: after.blocks, searchedBeforeCutoff: before.searched, searchedAll: after.searched },
    };
    return sample.maneuvers;
  }

  // Runs one variant on one sample: {errors, d2, info} or {failure, info}.
  async run(sample, rawSpec) {
    const name = sample.regime, spec = this.resolve(rawSpec, name);
    const o = await this.object(sample.norad, name);
    const forces = forcesOf(name, spec);
    const info = {};
    const env = { drivers: spec.drivers, cutoffMs: sample.cutoffMs };
    const published = o.sets[sample.index];
    // The element sets the variant starts from, and their epoch states.
    let source = { sets: o.sets, states: o.states }, model = null;
    if (spec.sets === 'e1') source = await this.e1Sets(o);
    if (spec.sets === 'debiased') {
      model = await o.history.fit(sample.cutoffMs, spec.windowDays);
      info.debias = { kind: model.kind, n: model.n };
    }
    const setOf = async (i) => (spec.sets === 'debiased' ? (await o.history.apply(model, [o.sets[i]]))[0] : source.sets[i]);
    const coeffs = coefficients(name, sample.norad, published, spec.bRule, this.gnss);

    if (spec.method === 'sgp4') {
      const set = await setOf(sample.index);
      info.correctionSeconds = set.correctionSeconds ?? 0;
      const r = await sgp4Errors(this.ctx, o.products, set, sample.targets);
      info.sCounts = r.counts;
      return { errors: r.errors, info };
    }
    if (spec.method === 'epoch') {
      let state = source.states[sample.index];
      if (spec.sets === 'debiased') state = (await epochStates(this.ctx['epoch-state'], [await setOf(sample.index)]))[0];
      if (!state) return { failure: 'analysis/epoch-state refused the set', info };
      return { ...(await hpopErrors(this.ctx, state, sample.epochMs, sample.targets, { forces, coefficients: coeffs, ...env })), info };
    }
    if (spec.method === 'truth') {
      const t0 = sample.targets[0];
      if (t0.missing) return { failure: 'no truth state at 0 h', info };
      return { ...(await hpopErrors(this.ctx, { epoch: t0.epoch.replace(/Z$/, ''), state: [...t0.r, ...t0.v].map((x) => x * 1000) }, t0.ms, sample.targets, { forces, coefficients: coeffs, ...env })), info };
    }
    if (spec.method !== 'arc') throw new Error(`unknown method ${spec.method}`);

    // The arc: sets created by the cutoff with epochs in [epoch - span, epoch],
    // after the last maneuver detected before the cutoff when the variant splits.
    let from = sample.epochMs - spec.spanDays * DAY_MS;
    let split = false;
    if (spec.split) {
      // A detection the module refuses leaves the arc whole (counted).
      let m = null;
      try { m = await this.maneuversOf(sample); } catch (error) { info.detection = String(error.message).slice(0, 200); }
      const inArc = (m?.beforeCutoff ?? []).filter((e) => e.timeMs > from);
      if (inArc.length) { from = Math.max(...inArc.map((e) => e.timeMs)); split = true; }
    }
    const idx = o.sets.map((s, i) => i).filter((i) => i === sample.index || (o.sets[i].createdMs <= sample.cutoffMs && o.sets[i].epochMs > from && o.sets[i].epochMs <= sample.epochMs));
    info.arc = { sets: idx.length, split, fromMs: from };
    if (!split && idx.length < config.arcMinimumSets) return { failure: `too few element sets (${idx.length})`, info };
    let arcSets = idx.map((i) => source.sets[i]), arcStates = idx.map((i) => source.states[i]);
    if (spec.sets === 'debiased') { arcSets = await o.history.apply(model, idx.map((i) => o.sets[i])); arcStates = await epochStates(this.ctx['epoch-state'], arcSets); }
    const k = arcSets.findIndex((s) => s.gpId === published.gpId);
    const reference = arcStates[k];
    if (!reference) return { failure: 'analysis/epoch-state refused the set', info };
    const used = arcStates.map((s, i) => (s ? { ...s, epochMs: arcSets[i].epochMs } : null)).filter(Boolean);
    let covarianceRtn = this.weights.regimes[name][spec.sets === 'e1' ? 'S-E1' : 'S'].secondMomentRtn;
    if (spec.weighting === 'correlated') {
      const models = this.correlation.regimes[name].fits;
      const factors = COMPONENTS.map((c) => inflation(used.map((u) => u.epochMs), spec.form, models[c][spec.form]));
      covarianceRtn = inflate(covarianceRtn, factors);
      info.arc.inflation = factors;
    }
    const regime = config.regimes[name];
    const fixed = { agom: coeffs.agom, b: coeffs.bstarB, ...(coeffs.boxWing ? { boxWing: coeffs.boxWing } : {}) };
    const observations = used.map((u) => ({ epoch: u.epoch, state: u.state, covariance: covarianceRtn }));
    const fitWith = async (list) => {
      const parameters = list.map((p) => ({ kind: p.kind, value: p.kind === 'DRAG_AREA_OVER_MASS' ? coeffs.bstarB : p.kind === 'SRP_AREA_OVER_MASS' ? coeffs.agom : 0 }));
      const n = 6 + parameters.length;
      const apriori = Array(n * n).fill(0);
      config.fit.aprioriStateSigma.forEach((x, i) => { apriori[i * n + i] = x * x; });
      list.forEach((p, i) => { apriori[(6 + i) * n + 6 + i] = p.sigma * p.sigma; });
      return { parameters, r: await fitArc(this.ctx, reference, sample.epochMs, observations, { parameters, apriori, forces, fixed, ...env }) };
    };
    // HPOP refuses a negative Cd*A/m; when a B fit asks for one, the arc is
    // fitted again with the regime's fallback (an in-track acceleration, B
    // held at its starting value).
    let attempt;
    try {
      attempt = await fitWith(regime.arcParameters);
      const b = attempt.parameters.findIndex((p) => p.kind === 'DRAG_AREA_OVER_MASS');
      if (b >= 0 && attempt.r.fit?.converged && attempt.r.fit.estimate[6 + b] < 0) throw new Error('invalid-forces: the fit converged to a negative Cd*A/m');
    } catch (error) {
      if (!/invalid-forces/.test(error.message) || !regime.arcFallbackParameters) throw error;
      info.fallback = String(error.message).slice(0, 120);
      attempt = await fitWith(regime.arcFallbackParameters);
    }
    const { parameters, r } = attempt;
    info.fit = { status: r.status, hpopCalls: r.hpopCalls, iterations: r.fit?.iterations, converged: r.fit?.converged, reducedChiSquare: r.fit?.reducedChiSquare,
      parameterKinds: parameters.map((p) => p.kind), parameters: r.fit?.estimate?.slice(6) };
    if (!r.fit?.converged) return { failure: `fit not converged (status ${r.status})`, info };
    const fitted = withParameters(fixed, parameters, r.fit.estimate.slice(6));
    const covariance = spec.covariance ? conditioned(r.fit.covariance.map((v) => v * Math.max(1, r.fit.reducedChiSquare))) : null;
    return { ...(await hpopErrors(this.ctx, { epoch: reference.epoch, state: r.fit.estimate.slice(0, 6) }, sample.epochMs, sample.targets,
      { forces, coefficients: fitted, parameters, covariance, ...env })), info };
  }
}
