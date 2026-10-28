// C2 pre-check P12 (PLAN.md 3.3; C2-A3, C2-A4): the fit configuration of every class, declared once, with the SHA-256 of the driver and
// of the settings source, so that every window of a class is fitted identically. Records only.
//   node experiments/ffm-covariance-calibration/precheck-p12.mjs
import fs from 'node:fs';
import path from 'node:path';
import { frozen, writeReceipt, root, sha256 } from './common.mjs';
import { b2 } from './lib/precise.mjs';

frozen();
const B2C = JSON.parse(fs.readFileSync(b2('config.json')));
const F = B2C.part1.starlink.ffm, A = B2C.a12;
const file = (rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(root, rel))) });
const common = { driver: file('harness/ffm-fit-v3.mjs'), execution: file('harness/ffm-execution.mjs'), runner: file('experiments/ffm-covariance-calibration/run.mjs'), sigmaM: A.fit.sigmaM, rounds: 1, frame: 'GCRF', measurement: 'POSITION_VECTOR', track: '24 h at 10 min (precise) or the NASA file\'s 4-min states (ISS)', correctionTolerance: A.fit.correctionTolerance, sigmaEditThreshold: A.fit.sigmaEditThreshold, maximumIterations: A.fit.maximumIterations, forces: F.forces, integrator: F.integrator, modules: { estimation: A.estimation, ffm: A.ffm, domains: A.domains } };
console.log(writeReceipt('precheck-P12', {
  plan: '3.8 P12', common,
  classes: {
    I: { parameters: ['DRAG_AREA_OVER_MASS', 'SRP_AREA_OVER_MASS'], seeds: B2C.a5.issFfm.seeds, aprioriFraction: B2C.a5.issFfm.aprioriParameterFraction, apriori: { positionSigmaM: F.apriori.positionSigmaM, velocitySigmaMS: F.apriori.velocitySigmaMS }, contingency: 'C2-A3 point 3: the 9 failed fits once at 60 evaluations' },
    LP: { parameters: ['DRAG_AREA_OVER_MASS'], fixed: 'AGOM at E6\'s value', seeds: 'E6 slr.targets b', aprioriFraction: 0.3, apriori: { positionSigmaM: 1e5, velocitySigmaMS: 10 } },
    R3: { parameters: ['SRP_AREA_OVER_MASS'], seeds: 'seeds-R3.json (C2-A4 point 2)', aprioriFraction: 1, apriori: { positionSigmaM: F.apriori.positionSigmaM, velocitySigmaMS: F.apriori.velocitySigmaMS } },
    R1: { profile: 'P0 (A12 part 2, ac8971902)', parameters: A.candidates.P0.parameters, seeds: 'seeds-R1R2.json (C2-A4 point 3)', aprioriFraction: A.fit.apriori.parameterFraction, apriori: { positionSigmaM: A.fit.apriori.positionSigmaM, velocitySigmaMS: A.fit.apriori.velocitySigmaMS } },
    R2: { profile: 'P0 (A12 part 2, ac8971902)', parameters: A.candidates.P0.parameters, seeds: 'seeds-R1R2.json (C2-A4 point 3)', aprioriFraction: A.fit.apriori.parameterFraction, apriori: { positionSigmaM: A.fit.apriori.positionSigmaM, velocitySigmaMS: A.fit.apriori.velocitySigmaMS } },
    L: { driver: 'E6 R steps 12 and 40 unchanged (experiments/e6-public-observations)', label: 'bias-contaminated (C2-A3 point 1)' },
  },
  outcome: 'declared: every window of a class uses its row above',
}));
