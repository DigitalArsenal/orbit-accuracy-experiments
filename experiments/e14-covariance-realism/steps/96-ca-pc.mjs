#!/usr/bin/env node
// E14 step 96: the frozen S3 model in the CA screen (PLAN.md section 11). analysis/conjunction-assessment
// assess_conjunction, FOSTER, with E14's uncertainty_model frame (results/e14/models/s3.cau1, step 95), on SOCRATES's
// three closest 2026-03 pairs (element sets from the modules' private fixtures: Space-Track data, read here, never
// committed). Per pair: the probability, its source and basis labels, each object's RTN sigma and the calibration
// label, against the event without the model (Alfano maximum). Writes results/e14/test/ca-pc.json (E14's own numbers
// only: no element set and no SOCRATES value).
//
//   SDN_MODULES_ROOT=<modules checkout> SDN_MODULES_PRIVATE_FIXTURES=<private root> node experiments/e14-covariance-realism/steps/96-ca-pc.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot } from '../../../harness/modules.mjs';
import { config, writeJson } from '../common.mjs';

const modules = modulesRoot({ flag: process.env.SDN_MODULES_ROOT, configured: config.inputs.modules, repoRoot });
const ca = path.join(modules, 'analysis/conjunction-assessment');
const lib = async (rel) => import(pathToFileURL(path.join(ca, rel)).href);
const { createConjunctionCommandHarness } = await lib('tests/lib/conjunctionCommandHarness.mjs');
const { decodeCqr, earthFrame, encodeCqr, initCqrFlatc, screeningControls, gpSource } = await lib('tests/lib/cqr.mjs');
const fixtures = path.join(process.env.SDN_MODULES_PRIVATE_FIXTURES ?? '/opt/data/sdn-archive/private-fixtures/space-data-network-modules', 'analysis/conjunction-assessment/tests/fixtures/socrates');
const reference = JSON.parse(fs.readFileSync(path.join(fixtures, 'reference.top3.json'), 'utf8'));
const frame = fs.readFileSync(path.join(repoRoot, 'results/e14/models/s3.cau1'));
const flatc = await initCqrFlatc();
const h = await createConjunctionCommandHarness({ runtimeKind: 'browser' });
const out = { model: 'results/e14/models/s3.cau1', algorithm: 'FOSTER', hardBodyRadiusM: [5, 5], pairs: [] };
try {
  for (const c of reference.conjunctions) {
    const gp = JSON.parse(fs.readFileSync(path.join(fixtures, c.gp_file.replace(/\.txt$/, '.json')), 'utf8'));
    const tca = Date.parse(c.tca) / 86400000 + 2440587.5;
    const request = (algorithm) => encodeCqr(flatc, { PAIR_REQUEST: { PRIMARY: gpSource(gp[0]), SECONDARY: gpSource(gp[1]),
      CONTROLS: { ...screeningControls({ startJd: tca - 60 / 86400, durationSeconds: 120, coarseStepSec: 5 }), ALGORITHM: algorithm },
      PRIMARY_RADIUS_M: 5, SECONDARY_RADIUS_M: 5, EVALUATION_FRAME: earthFrame('TEME') } });
    const assess = async (algorithm, withModel) => {
      const r = await h.invoke({ methodId: 'assess_conjunction', inputs: [{ portId: 'request', payload: request(algorithm) }, ...(withModel ? [{ portId: 'uncertainty_model', payload: frame }] : [])] });
      if (r.statusCode !== 0) throw new Error(r.errorMessage);
      return decodeCqr(flatc, r.outputs[0].payload).EVENT_RESULT;
    };
    const e = await assess('FOSTER', true), alfano = await assess('FOSTER', false);
    const sig = (s) => (s ? [s.X, s.Y, s.Z].map((x) => Math.round(x)) : null);
    out.pairs.push({ objects: [c.obj1_norad, c.obj2_norad], tca: e.TCA?.JULIAN_DATE ? new Date((e.TCA.JULIAN_DATE - 2440587.5) * 86400000).toISOString() : null,
      missDistanceM: e.MISS_DISTANCE_M ?? null, probability: e.PROBABILITY?.PROBABILITY ?? null, uncertaintySource: e.PROBABILITY?.UNCERTAINTY_SOURCE,
      calibration: e.PROBABILITY?.CALIBRATION, calibrationReference: e.PROBABILITY?.CALIBRATION_REFERENCE ?? '', basis: [e.PRIMARY_COVARIANCE_BASIS, e.SECONDARY_COVARIANCE_BASIS],
      sigmaRtnM: [sig(e.PRIMARY_SIGMA_RTN_M), sig(e.SECONDARY_SIGMA_RTN_M)],
      withoutModel: { probability: alfano.PROBABILITY?.PROBABILITY ?? null, uncertaintySource: alfano.PROBABILITY?.UNCERTAINTY_SOURCE } });
  }
} finally {
  await h.destroy?.();
}
writeJson(path.join(repoRoot, 'results/e14/test/ca-pc.json'), out);
console.log(JSON.stringify(out, null, 1));
