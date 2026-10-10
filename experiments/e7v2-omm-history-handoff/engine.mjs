// The products E7v2 compares (PLAN.md section 2), driven by config.json's
// variant table: method (sgp4, epoch, truth, arc), the sets it starts from
// (published or debiased), the debiasing, the arc span and the atmosphere.
// Every orbit computation is a module's (E7's methods.mjs, fit.mjs); this file
// assembles inputs and scores each product against the sample's targets.
import { decodeOemStream } from '../../harness/records.mjs';
import { hpopErrors, sgp4Errors, withParameters, conditioned } from '../e7-full-force-handoff/methods.mjs';
import { epochStates } from '../e2-catalog-covariance/product.mjs';
import { ObjectHistory } from '../e7-full-force-handoff/debias.mjs';
import { ManeuverHistory } from '../e7-full-force-handoff/maneuvers.mjs';
import { DAY_MS, classOf, coefficients, config, forcesOf } from './common.mjs';
import { covarianceBlock, fitArcV2 } from './fit.mjs';
import { debiaser } from './debias.mjs';
import { dcaFor } from './dca.mjs';

export class Engine {
  // truth: {cls: MultiProducts} (truth-rich classes); pseudo: PseudoTruth;
  // weights / correlation: step 10's per-class products; classModels: step
  // 10's debiasing models; calibration: dca.mjs loadCalibration (or null);
  // chosen: config.chosen, or null before the freeze.
  constructor({ ctx, truth, pseudo, byObject, gnss, e1, weights, correlation, classModels, calibration, chosen }) {
    Object.assign(this, { ctx, truth, pseudo, byObject, gnss, e1, weights, correlation, classModels, calibration, chosen });
    this.objects = new Map();
  }

  async object(norad, cls) {
    const key = `${cls}/${norad}`;
    if (this.objects.has(key)) return this.objects.get(key);
    const c = classOf(cls);
    const sets = this.byObject.get(norad);
    const p = await this.pseudo.prepare(norad, sets);
    const states = new Map(p.gpIds.map((g, i) => [g, { epoch: p.lines[i].EPOCH.replace(/Z$/, ''), state: [p.lines[i].X, p.lines[i].Y, p.lines[i].Z, p.lines[i].X_DOT, p.lines[i].Y_DOT, p.lines[i].Z_DOT].map((v) => v * 1000) }]));
    const truth = c.kind === 'truth' ? this.truth[cls].products : null;
    const template = truth ? decodeOemStream(new Uint8Array(truth.load(truth.entries(norad)[0]).bytes))[0] : this.pseudo.template(norad);
    const o = {
      cls, sets, truth, states,
      history: truth ? new ObjectHistory(this.ctx, truth, sets, this.e1.candidate.scales) : null,
      maneuvers: new ManeuverHistory(this.ctx, c.maneuverKey, sets, template),
    };
    this.objects.set(key, o);
    return o;
  }

  // A variant's choices for a class: 'chosen' from config.chosen (or the dev
  // stand-ins before the freeze).
  resolve(spec, cls) {
    const pick = (value, key) => {
      if (value !== 'chosen') return value;
      const v = this.chosen ? this.chosen[key]?.[cls] : config.devChoices[key];
      if (v === undefined || v === null) throw new Error(`no chosen ${key} for ${cls}`);
      return v;
    };
    const c = classOf(cls);
    let debias = spec.sets === 'debiased' ? pick(spec.debias ?? 'chosen', 'debias') : null;
    if (debias && !(c.debias ?? ['class']).includes(debias)) debias = c.kind === 'truth' ? c.debias[0] : 'class';
    if (c.kind === 'omm' && debias) debias = 'class';
    return {
      ...spec,
      debias,
      windowDays: debias === 'history' ? pick(spec.windowDays ?? 'chosen', 'debiasWindowDays') : null,
      spanDays: spec.method === 'arc' ? pick(spec.spanDays ?? 'chosen', 'spanDays') : null,
      form: pick('chosen', 'correlationForm'),
    };
  }

  // Maneuvers detected before the cutoff (sets created by then) and, for the
  // report, in the prediction span (every set): event times (E7).
  async maneuversOf(sample) {
    if (sample.maneuvers) return sample.maneuvers;
    const o = await this.object(sample.norad, sample.cls);
    const m = config.maneuvers, maxSpan = Math.max(...classOf(sample.cls).arcSpansDays) * DAY_MS;
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

  // The scoring lists of a sample: primary targets and (truth-rich) the
  // pseudo-truth targets.
  #lists(sample) { return sample.kind === 'truth' ? { targets: sample.targets, pseudo: sample.pseudoTargets } : { targets: sample.targets, pseudo: null }; }

  // SGP4 from a set against both lists (gp-error-model per truth file).
  async #sgp4(o, sample, set) {
    const { targets, pseudo } = this.#lists(sample);
    const main = await sgp4Errors(this.ctx, o.truth ?? this.pseudo, set, targets);
    const out = { errors: main.errors, info: { sCounts: main.counts } };
    if (pseudo) out.pseudoErrors = (await sgp4Errors(this.ctx, this.pseudo, set, pseudo)).errors;
    return out;
  }

  // HPOP from an initial state to every target of both lists in one
  // propagation (targets in epoch order), split back per list.
  async #hpop(sample, initial, initialMs, request) {
    const { targets, pseudo } = this.#lists(sample);
    const all = [...targets, ...(pseudo ?? [])];
    const order = all.map((t, i) => i).sort((a, b) => (all[a].ms ?? Infinity) - (all[b].ms ?? Infinity));
    const r = await hpopErrors(this.ctx, initial, initialMs, order.map((i) => all[i]), request);
    const errorsOf = new Array(all.length), d2Of = new Array(all.length);
    order.forEach((i, k) => { errorsOf[i] = r.errors[k]; d2Of[i] = r.d2 ? r.d2[k] : null; });
    const out = { errors: errorsOf.slice(0, targets.length), d2: r.d2 ? d2Of.slice(0, targets.length) : null };
    if (pseudo) out.pseudoErrors = errorsOf.slice(targets.length);
    return out;
  }

  // The arc fit's parameters [{kind, value, sigma, lower, upper}] and fixed
  // coefficients for a class (PLAN.md section 6).
  #parameters(cls, coeffs) {
    return classOf(cls).arcParameters.map((p) => {
      const value = p.kind === 'DRAG_AREA_OVER_MASS' ? coeffs.b : p.kind === 'SRP_AREA_OVER_MASS' ? coeffs.agom : 0;
      const sigma = typeof p.sigma === 'object' ? Math.max(p.sigma.relative * value, p.sigma.floor) : p.sigma;
      return { kind: p.kind, value, sigma, lower: p.lower ?? null, upper: p.upper ?? null };
    });
  }

  // Runs one variant on one sample: {errors, pseudoErrors?, d2?, info},
  // {failure, info}, or {skip, info} (not applicable: counted, not a failure).
  async run(sample, rawSpec) {
    const cls = sample.cls, spec = this.resolve(rawSpec, cls);
    const o = await this.object(sample.norad, cls);
    const forces = forcesOf(cls, spec);
    const info = {};
    const env = { drivers: 'released', cutoffMs: sample.cutoffMs, integrator: { ...config.integrator, tolerance: classOf(cls).integratorTolerance } };
    if (spec.atmosphere === 'JB2008-DCA') {
      const dca = this.calibration ? dcaFor(this.calibration, sample.norad, sample.cutoffMs) : null;
      if (!dca) return { skip: 'no DCA stand-in inputs at the cutoff', info };
      env.dca = dca;
      info.dca = { set: dca.set, nowcastBins: dca.nowcastBins, levelBins: dca.levelBins, nowcastK: dca.nowcastK, levelK: dca.levelK };
    }
    const published = o.sets[sample.index];
    const coeffs = coefficients(cls, sample.norad, published, this.gnss);
    let fix = null;
    if (spec.debias) {
      fix = await debiaser(this.ctx, spec.debias, o, sample, { windowDays: spec.windowDays, classModels: this.classModels, e1: this.e1 });
      info.debias = { method: spec.debias, ...fix.info };
    }

    if (spec.method === 'sgp4') {
      const set = fix ? (await fix.apply([published]))[0] : published;
      info.correctionSeconds = set.correctionSeconds ?? 0;
      const r = await this.#sgp4(o, sample, set);
      return { ...r, info: { ...info, ...r.info } };
    }
    if (spec.method === 'epoch') {
      const state = fix ? (await epochStates(this.ctx['epoch-state'], await fix.apply([published])))[0] : o.states.get(published.gpId);
      if (!state) return { failure: 'analysis/epoch-state refused the set', info };
      return { ...(await this.#hpop(sample, state, sample.epochMs, { forces, coefficients: { agom: coeffs.agom, b: coeffs.b, ...(coeffs.boxWing ? { boxWing: coeffs.boxWing } : {}) }, ...env })), info };
    }
    if (spec.method === 'truth') {
      const t0 = sample.targets[0];
      if (sample.kind !== 'truth' || t0.missing) return { skip: 'no truth state at 0 h', info };
      return { ...(await this.#hpop(sample, { epoch: t0.epoch.replace(/Z$/, ''), state: [...t0.r, ...t0.v].map((x) => x * 1000) }, t0.ms,
        { forces, coefficients: { agom: coeffs.agom, b: coeffs.b, ...(coeffs.boxWing ? { boxWing: coeffs.boxWing } : {}) }, ...env })), info };
    }
    if (spec.method !== 'arc') throw new Error(`unknown method ${spec.method}`);
    if (rawSpec.onlyIfCandidate && !classOf(cls).arcSpansDays.includes(spec.spanDays)) return { skip: 'span not a candidate for the class', info };

    // The arc: sets created by the cutoff with epochs in (epoch - span,
    // epoch], after the last maneuver detected before the cutoff.
    let from = sample.epochMs - spec.spanDays * DAY_MS;
    let split = false;
    let m = null;
    try { m = await this.maneuversOf(sample); } catch (error) { info.detection = String(error.message).slice(0, 200); }
    const inArc = (m?.beforeCutoff ?? []).filter((e) => e.timeMs > from);
    if (inArc.length) { from = Math.max(...inArc.map((e) => e.timeMs)); split = true; }
    const idx = o.sets.map((s, i) => i).filter((i) => i === sample.index || (o.sets[i].createdMs <= sample.cutoffMs && o.sets[i].epochMs > from && o.sets[i].epochMs <= sample.epochMs));
    info.arc = { sets: idx.length, split, fromMs: from };
    if (idx.length < config.arcMinimumSets) return { failure: `too few element sets (${idx.length})`, info };
    let arcSets = idx.map((i) => o.sets[i]);
    let arcStates;
    if (fix) { arcSets = await fix.apply(arcSets); arcStates = await epochStates(this.ctx['epoch-state'], arcSets); }
    else arcStates = arcSets.map((s) => o.states.get(s.gpId) ?? null);
    const k = arcSets.findIndex((s) => s.gpId === published.gpId);
    let reference = arcStates[k];
    if (!reference) return { failure: 'analysis/epoch-state refused the set', info };
    // A later arc product of the sample with the same span starts from the
    // state an earlier one converged to (fewer iterations; the a priori on
    // the state, 100 km and 10 m/s, is negligible). Parameters start at their
    // a priori values, unchanged.
    const warm = sample.warm?.[spec.spanDays];
    if (warm) { reference = { epoch: reference.epoch, state: warm }; info.warmStart = true; }
    const used = arcStates.map((s, i) => (s ? { ...s, epochMs: arcSets[i].epochMs } : null)).filter(Boolean);
    const S = this.weights.classes[cls].secondMomentRtn;
    const models = this.correlation.classes[cls].fits;
    const block = covarianceBlock(used.map((u) => u.epochMs), S, models, spec.form);
    const parameters = this.#parameters(cls, coeffs);
    const n = 6 + parameters.length;
    const apriori = Array(n * n).fill(0);
    config.fit.aprioriStateSigma.forEach((x, i) => { apriori[i * n + i] = x * x; });
    parameters.forEach((p, i) => { apriori[(6 + i) * n + 6 + i] = p.sigma * p.sigma; });
    const fixed = { agom: coeffs.agom, b: coeffs.b, ...(coeffs.boxWing ? { boxWing: coeffs.boxWing } : {}) };
    const r = await fitArcV2(this.ctx, reference, sample.epochMs, used.map((u) => ({ epoch: u.epoch, state: u.state })), { parameters, apriori, block, forces, fixed, ...env });
    const f = r.fit;
    info.fit = { status: r.status, hpopCalls: r.hpopCalls, iterations: f?.iterations, converged: f?.converged, reducedChiSquare: f?.reducedChiSquare,
      parameterKinds: parameters.map((p) => p.kind), parameters: f?.estimate?.slice(6), boundStatus: f?.boundStatus, regularizations: f?.regularizations?.map((x) => ({ raised: x.raised, minimumEigenvalue: x.minimumEigenvalue, frobeniusChange: x.frobeniusChange })) };
    if (!f?.converged) return { failure: `fit not converged (status ${r.status})`, info };
    sample.warm = { ...(sample.warm ?? {}), [spec.spanDays]: f.estimate.slice(0, 6) };
    const fitted = withParameters(fixed, parameters, f.estimate.slice(6));
    const covariance = spec.covariance && sample.kind === 'truth' ? conditioned(f.covariance.map((v) => v * Math.max(1, f.reducedChiSquare))) : null;
    const product = { epoch: reference.epoch, state: f.estimate.slice(0, 6), parameters: f.estimate.slice(6), covariance: f.covariance, covarianceRtn: f.covarianceRtn, reducedChiSquare: f.reducedChiSquare };
    return { ...(await this.#hpop(sample, { epoch: reference.epoch, state: f.estimate.slice(0, 6) }, sample.epochMs, { forces, coefficients: fitted, parameters, covariance, ...env })), info, product };
  }
}
