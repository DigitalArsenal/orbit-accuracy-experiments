// Q2's products for one sample (PLAN.md 6): SGP4 from the latest OMM (S), from the corrected OMM (S-corr), and HPOP
// fitted to an arc of the object's OMMs (the A family) by analysis/estimation `fit_batch` answered by
// propagator/hpop (E7 methods.mjs fitArc, with fit_batch version 2: B bounded at 0, B-dot, covariance blocks).
// Every orbit computation is a module's; this file assembles inputs and the covariance blocks of GLS.
import { decodeOemStream } from '../../harness/records.mjs';
import { shiftAlongTrack } from '../e1-gps-epoch/methods.mjs';
import { conditioned, fitArc, hpopErrors, sgp4Errors, withParameters } from '../e7-full-force-handoff/methods.mjs';
import { epochStates } from '../e2-catalog-covariance/product.mjs';
import { ManeuverHistory } from '../e7-full-force-handoff/maneuvers.mjs';
import { COMPONENTS, rho } from '../e7-full-force-handoff/correlation.mjs';
import { unpackOem } from '../supgp-omm/lib/records.mjs';
import { DAY_MS, HOUR_MS, config } from './common.mjs';

const P = config.q2;

// The object's truth header for E7's maneuver detection (it frames carrier blocks with it).
function templateOf(truth, norad) {
  const e = truth.entries(norad)[0];
  if (e.inner) return decodeOemStream(new Uint8Array(e.part.load(e.inner).bytes))[0];
  return unpackOem(truth.frame(e).payload);
}

// E2b's correlation (near pairs at a common epoch, tau 0) by gap, per position axis, for A-GLS-E2b (PLAN.md 6.4).
export function e2bRho(model, cls) {
  const bins = model.regimes[P.correlation.e2bRegime[cls]].cross.near['0'];
  return (gapHours, axis) => {
    const g = gapHours / 24;
    const b = bins.find((x) => g >= x.gapDays[0] && g <= x.gapDays[1]) ?? (g > bins.at(-1).gapDays[1] ? null : bins[0]);
    return b ? b.R[4 * axis] : 0;
  };
}

// One covariance block over the arc's observations (covariance_axes 1: each observation's own RTN axes):
// C_ij[a][b] = sqrt(rho_a(dt) rho_b(dt)) W[a][b], W the 6x6 weight, rho_a component a's correlation at lag dt.
export function arcBlock(epochsMs, W, rhoOf) {
  const n = epochsMs.length, m = 6 * n;
  const C = new Array(m * m).fill(0);
  for (let i = 0; i < n; ++i) for (let j = 0; j < n; ++j) {
    const dtH = Math.abs(epochsMs[i] - epochsMs[j]) / HOUR_MS;
    const r = COMPONENTS.map((_, a) => (i === j ? 1 : Math.max(0, rhoOf(dtH, a))));
    for (let a = 0; a < 6; ++a) for (let b = 0; b < 6; ++b) C[(6 * i + a) * m + 6 * j + b] = Math.sqrt(r[a] * r[b]) * W[6 * a + b];
  }
  return [{ observations: epochsMs.map((_, i) => i), covariance: C }];
}

export class Q2Object {
  // sets: every set of the object (epoch order, epochMs, createdMs); truth: its class's truth source.
  constructor({ ctx, norad, cls, sets, truth }) {
    Object.assign(this, { ctx, norad, cls, sets, truth });
    this.states = null;
    this.maneuvers = null;
  }
  async epochStates() { this.states ??= await epochStates(this.ctx['epoch-state'], this.sets); return this.states; }
  // E7's detection (section 4 of E7's plan) with E7's LEO settings, which equal config.q2.maneuvers.
  maneuverHistory() { this.maneuvers ??= new ManeuverHistory(this.ctx, 'LEO-POD', this.sets, templateOf(this.truth, this.norad)); return this.maneuvers; }

  // Maneuvers detected before the cutoff (sets created by then) inside the longest span: event times (ms).
  async maneuversBefore(sample, maxSpanDays) {
    const m = P.maneuvers;
    const pre = this.sets.map((s, i) => i).filter((i) => this.sets[i].createdMs <= sample.cutoffMs && this.sets[i].epochMs >= sample.cutoffMs - (maxSpanDays + m.contextDays) * DAY_MS);
    const found = await this.maneuverHistory().detect(pre);
    return found.events.filter((e) => e.timeMs > sample.epochMs - maxSpanDays * DAY_MS && e.timeMs <= sample.cutoffMs).map((e) => e.timeMs);
  }
}

// S and S-corr: SGP4 errors (m) at the targets.
export async function sgp4Product(ctx, truth, set, targets, dtSeconds = null) {
  const s = dtSeconds === null ? set : shiftAlongTrack(set, dtSeconds);
  const r = await sgp4Errors(ctx, truth, s, targets);
  return { errors: r.errors, info: { correctionSeconds: dtSeconds ?? 0, counts: r.counts } };
}

// An A-family product. spec: {spanDays, bdot, weighting ('diagonal' | 'gls' | 'gls-e2b'), corrected (gpId -> dt s) | null,
// atmosphere ('NRLMSISE00' | 'JB2008'), a00 (K function) | null}. weights: {W: 6x6 RTN second moment (m, m/s)},
// rhoOf: (dtHours, axis) -> correlation for GLS. physical: {agom}.
export async function arcProduct(o, sample, spec, { W, rhoOf, agom, maxSpanDays }) {
  const ctx = o.ctx, info = {};
  const cpu0 = process.cpuUsage();
  let from = sample.epochMs - spec.spanDays * DAY_MS, split = false;
  try {
    const events = await o.maneuversBefore(sample, maxSpanDays);
    const inArc = events.filter((t) => t > from);
    if (inArc.length) { from = Math.max(...inArc); split = true; }
  } catch (error) { info.detection = String(error.message).slice(0, 160); }
  const idx = o.sets.map((s, i) => i).filter((i) => i === sample.index || (o.sets[i].createdMs <= sample.cutoffMs && o.sets[i].epochMs > from && o.sets[i].epochMs <= sample.epochMs));
  info.arc = { sets: idx.length, split, fromMs: from };
  if (!split && idx.length < P.arcMinimumSets) return { failure: `too few element sets (${idx.length})`, info };
  let arcSets = idx.map((i) => o.sets[i]), arcStates;
  if (spec.corrected) {
    arcSets = arcSets.map((s) => (spec.corrected.has(s.gpId) ? shiftAlongTrack(s, spec.corrected.get(s.gpId)) : s));
    info.arc.corrected = arcSets.filter((s) => s.correctionSeconds !== undefined).length;
    arcStates = await epochStates(ctx['epoch-state'], arcSets);
  } else {
    const all = await o.epochStates();
    arcStates = idx.map((i) => all[i]);
  }
  const k = arcSets.findIndex((s) => s.gpId === sample.gpId);
  const reference = arcStates[k];
  if (!reference) return { failure: 'analysis/epoch-state refused the set', info };
  const used = arcStates.map((s, i) => (s ? { ...s, epochMs: arcSets[i].epochMs } : null)).filter(Boolean);
  const set = o.sets[sample.index];
  const b0 = set.elements.BSTAR > 0 ? set.elements.BSTAR * P.prior.bstarToCdAreaOverMass : P.prior.bStartWhenNonPositive;
  const sigmaB = Math.max(P.prior.bSigmaFloor, b0);
  const parameters = [{ kind: 'DRAG_AREA_OVER_MASS', value: b0 }, ...(spec.bdot ? [{ kind: 'DRAG_AREA_OVER_MASS_RATE', value: 0 }] : [])];
  const sig = [sigmaB, ...(spec.bdot ? [P.prior.bdotSigmaPerDayOfBSigma * sigmaB / 86400] : [])];
  const n = 6 + parameters.length;
  const apriori = Array(n * n).fill(0);
  P.prior.stateSigma.forEach((x, i) => { apriori[i * n + i] = x * x; });
  sig.forEach((x, i) => { apriori[(6 + i) * n + 6 + i] = x * x; });
  const forces = { ...P.forces, atmosphere: spec.atmosphere };
  delete forces.operationalAtmosphere;
  const env = { drivers: spec.atmosphere === 'JB2008' ? 'published' : 'released', cutoffMs: sample.cutoffMs, a00: spec.a00 ?? null };
  const fixed = { agom, b: b0 };
  const observations = used.map((u) => ({ epoch: u.epoch, state: u.state, covariance: W }));
  const gls = spec.weighting !== 'diagonal';
  const settings = {
    parameters, apriori, forces, fixed, ...env,
    batch: { parameter_lower_bounds: parameters.map((p) => (p.kind === 'DRAG_AREA_OVER_MASS' ? 0 : -1e308)), ...(gls ? { covariance_regularization: 1, correlation_floor: P.fit.correlationFloor } : {}) },
    ...(gls ? { blocks: arcBlock(used.map((u) => u.epochMs), W, rhoOf) } : {}),
  };
  let r;
  try { r = await fitArc(ctx, reference, sample.epochMs, observations, settings); } catch (error) { info.cpuMs = cpuMs(cpu0); return { failure: `fit_batch: ${String(error.message).slice(0, 200)}`, info }; }
  info.fit = { status: r.status, rounds: r.rounds, hpopCalls: r.hpopCalls, iterations: r.fit?.iterations, converged: r.fit?.converged, reducedChiSquare: r.fit?.reducedChiSquare,
    parameters: r.fit?.estimate?.slice(6), boundStatus: r.fit?.boundStatus, regularizations: r.fit?.regularizations?.length ?? 0, observations: used.length,
    parameterSigmas: r.fit?.covariance?.length ? parameters.map((_, i) => Math.sqrt(r.fit.covariance[(6 + i) * n + 6 + i] * Math.max(1, r.fit.reducedChiSquare))) : null };
  if (!r.fit?.converged) { info.cpuMs = cpuMs(cpu0); return { failure: `fit not converged (status ${r.status})`, info }; }
  const fitted = withParameters(fixed, parameters, r.fit.estimate.slice(6));
  // A fitted B-dot that would take Cd*A/m below zero inside the 72 h prediction is held at zero for it (counted).
  if (spec.bdot && fitted.b + fitted.bdot * Math.max(...P.horizonsHours) * 3600 < 0) { info.bdotHeld = fitted.bdot; fitted.bdot = 0; }
  const covariance = conditioned(r.fit.covariance.map((v) => v * Math.max(1, r.fit.reducedChiSquare)));
  try {
    const out = await hpopErrors(ctx, { epoch: reference.epoch, state: r.fit.estimate.slice(0, 6) }, sample.epochMs, sample.targets,
      { forces, coefficients: fitted, parameters: info.bdotHeld !== undefined ? parameters.slice(0, 1) : parameters, covariance: info.bdotHeld !== undefined ? dropLast(covariance, n) : covariance, ...env });
    info.cpuMs = cpuMs(cpu0);
    return { ...out, info };
  } catch (error) {
    info.cpuMs = cpuMs(cpu0);
    return { failure: `prediction: ${String(error.message).slice(0, 200)}`, info };
  }
}
const cpuMs = (c0) => { const c = process.cpuUsage(c0); return (c.user + c.system) / 1000; };
// The covariance without its last parameter (B-dot held at zero for the prediction).
function dropLast(cov, n) { const out = []; for (let i = 0; i < n - 1; ++i) for (let j = 0; j < n - 1; ++j) out.push(cov[i * n + j]); return out; }

export { rho };
