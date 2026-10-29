// Amendment A12's shared pieces: the V2 exclusion, the selection sample, each candidate profile's fit settings, and the modules opened
// for the version 3 fits (config.a12; the links directory of estimation 0.6.0 with B2's propagator/ffm 2.0.0). Records and settings only.
import fs from 'node:fs';
import path from 'node:path';
import { config, root, g1Dir, sha256 } from '../common.mjs';

const A = config.a12, F = config.part1.starlink.ffm;

/** V2's 500 satellites (experiments/operator-capture/SUBSETS.md, the JSON fenced block). */
export function v2Norads() {
  const text = fs.readFileSync(path.join(root, 'experiments/operator-capture/SUBSETS.md'), 'utf8');
  const block = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)[1]);
  return new Set(block.subsets.find((s) => s.id === 'v2-operator-seeded-prediction').norads);
}
/** The selection sample: the sampleSize satellites with the lowest SHA-256 of `B2|A12|select|<norad>`, V2 excluded. */
export function selectionSample(norads) {
  const v2 = v2Norads();
  return norads.filter((n) => !v2.has(n)).map((n) => [sha256(Buffer.from(`B2|A12|select|${n}`)), n]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, A.selection.sampleSize).map(([, n]) => n).sort((a, b) => a - b);
}

const agomSeed = (norad) => (norad < 56000 ? A.fit.seeds.SRP_AREA_OVER_MASS.belowNorad56000 : A.fit.seeds.SRP_AREA_OVER_MASS.fromNorad56000);
/** Fit settings of a base profile (P0, P1, P3) for one satellite (harness/ffm-fit-v3.mjs fitV3). */
export function profileSettings(norad, profile, { maximumIterations = A.fit.maximumIterations } = {}) {
  const c = A.candidates[profile];
  if (!c?.parameters) throw new Error(`${profile} is not a base profile`);
  const seed = { DRAG_AREA_OVER_MASS: A.fit.seeds.DRAG_AREA_OVER_MASS, SRP_AREA_OVER_MASS: agomSeed(norad), IN_TRACK_ACCELERATION: A.fit.seeds.IN_TRACK_ACCELERATION };
  const sigma = (k) => (k === 'IN_TRACK_ACCELERATION' ? A.fit.apriori.inTrackSigmaMS2 : A.fit.apriori.parameterFraction * seed[k]);
  const diagonal = [...Array(3).fill(A.fit.apriori.positionSigmaM ** 2), ...Array(3).fill(A.fit.apriori.velocitySigmaMS ** 2), ...c.parameters.map((k) => sigma(k) ** 2)];
  const n = diagonal.length;
  return {
    profile, sigmaM: A.fit.sigmaM, parameters: c.parameters.map((kind) => ({ kind, value: seed[kind] })), fixed: c.fixedAgom ? { agom: agomSeed(norad) } : {},
    apriori: Array.from({ length: n * n }, (_, k) => (Math.floor(k / n) === k % n ? diagonal[k % n] : 0)),
    maximumIterations, correctionTolerance: A.fit.correctionTolerance, sigmaEditThreshold: A.fit.sigmaEditThreshold, forces: F.forces, integrator: F.integrator,
  };
}

/** The version 3 modules, opened once: { ctxFor(fromMs, toMs), provenance, close }; the pins are checked against config.a12. */
export async function openV3() {
  const { loadModule } = await import(path.join(root, 'harness/modules.mjs'));
  const { estimationCodecV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
  const FFM = await import(path.join(g1Dir, 'lib/ffm.mjs'));
  const { ffmEnvironment } = await import(path.join(root, 'experiments/sdn-ap-baselines/lib/environment.mjs'));
  const L = A.modulesLinks;
  const estimation = await loadModule(L, 'analysis/estimation'), ffm = await loadModule(L, 'propagator/ffm');
  if (estimation.provenance.wasmSha256 !== A.estimation.wasmSha256) throw new Error(`estimation ${estimation.provenance.wasmSha256} is not A12's`);
  if (ffm.provenance.wasmSha256 !== A.ffm.wasmSha256) throw new Error(`propagator/ffm ${ffm.provenance.wasmSha256} is not A12's`);
  const domainsPath = path.join(fs.realpathSync(path.join(L, 'analysis/estimation')), '../..', A.domains.file); // the estimation commit's checkout
  if (sha256(fs.readFileSync(domainsPath)) !== A.domains.sha256) throw new Error(`${domainsPath} is not A12's domain table`);
  const { FIT_PARAMETER_DOMAINS: domains } = await import(domainsPath);
  const codec = await estimationCodecV3(L, path.join(root, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const g1Context = await FFM.loadEnvironment(L, { archive: '/opt/data/sdn-archive', store: path.join('/opt/data/sdn-archive', 'sdn-gp-starlink-ffm-match') });
  const env = await ffmEnvironment(L, g1Context);
  return {
    provenance: { estimation: estimation.provenance, ffm: ffm.provenance, estimationCommit: A.estimation.modulesCommit, ffmCommit: A.ffm.modulesCommit, domains: A.domains },
    ctxFor: (fromMs, toMs) => ({ estimation, ffm, codec, domains, inputs: env.inputsFor(fromMs, toMs) }),
    async close() { for (const m of [estimation, ffm]) await m.destroy?.(); },
  };
}

/** Points and reference of a track ([{epoch, r, v}] km, km/s) for fitV3. */
export const fitInput = (lines) => ({ points: lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference: { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) } });
/** The 3D RMS (m) of predicted [{state}] against held-out lines (km). */
export const rms3dM = (predicted, held) => Math.sqrt(held.reduce((s, l, i) => s + l.r.reduce((a, x, k) => a + (x * 1000 - predicted[i].state[k]) ** 2, 0), 0) / held.length);
/** A fit's compact record (no covariance). */
export const brief = (f) => (f.ok !== undefined && f.termination === undefined && !f.ok ? { ok: false, error: f.error, refusedRounds: f.refusedRounds ?? 0 }
  : { ok: f.ok, termination: f.termination, error: f.error ?? null, parameters: f.parameters, boundStatus: f.boundStatus, reducedChiSquare: f.reducedChiSquare, rejectedTrials: f.rejectedTrials, refusedTrials: f.refusedTrials, refusal: f.refusal ?? null, ffmCalls: f.ffmCalls });

/** A13's ISS arm iss-ffm3 (part 1 point 2): A5's ISS seeds and priors (config.a5.issFfm; a priori 1e5 m, 10 m/s, the seed's fraction) for
 *  fit_batch version 3, one round at 10 m, A12's evaluation cap (or the contingency's) and tolerances. */
export function issSettingsV3(maximumIterations = A.fit.maximumIterations) {
  const seeds = config.a5.issFfm.seeds, frac = config.a5.issFfm.aprioriParameterFraction;
  const kinds = ['DRAG_AREA_OVER_MASS', 'SRP_AREA_OVER_MASS'];
  const diag = [...Array(3).fill(F.apriori.positionSigmaM ** 2), ...Array(3).fill(F.apriori.velocitySigmaMS ** 2), ...kinds.map((q) => (frac * seeds[q]) ** 2)];
  const m = diag.length;
  return { profile: 'iss-ffm3', sigmaM: A.fit.sigmaM, parameters: kinds.map((kind) => ({ kind, value: seeds[kind] })), fixed: {}, apriori: Array.from({ length: m * m }, (_, i) => (Math.floor(i / m) === i % m ? diag[i % m] : 0)),
    maximumIterations, correctionTolerance: A.fit.correctionTolerance, sigmaEditThreshold: A.fit.sigmaEditThreshold, forces: F.forces, integrator: F.integrator };
}
