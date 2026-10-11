#!/usr/bin/env node
// E14 step 95: the frozen models in the forms the catalog and the CA screen read (PLAN.md section 11).
// - S3: a gp-error-model model (regimes, age bins, per-stratum 6x6 RTN covariance = factor x S3's second moment, km)
//   and its calibration labels (CALIBRATED only where the test cell was REALISTIC, with the reference), the files
//   analysis/conjunction-assessment's scripts/uncertainty-model.mjs turns into the CAU1 frame.
// - S1, S2, S4: the factor and term tables with their calibration versions and test statuses.
// - ocmWithCovariance(): an $OCM with COVARIANCE_DATA in RSW at its state epochs, COV_CALIBRATION and its reference,
//   and the DCP's sigma and sensitivity as user-defined parameters (encoding only; units km, km/s).
//
//   node experiments/e14-covariance-realism/steps/95-export.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as flatbuffers from 'flatbuffers';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config, writeJson } from '../common.mjs';

const read = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));

// $OCM bytes for one object: states [{epoch ISO UTC, state [m, m/s] EME2000/GCRF}], covariances [21 lower RTN, SI] per
// state, calibration {status: 'Calibrated' | 'Uncalibrated', reference}, extra [{name, value}].
export function ocmWithCovariance({ objectName, objectId, frame = 'GCRF', states, covariances, calibration, extra = [] }) {
  const ocm = new O.OCMT();
  ocm.HEADER = Object.assign(new O.HeaderT(), { CCSDS_OCM_VERS: '3.0', CREATION_DATE: new Date().toISOString(), ORIGINATOR: 'orbit-accuracy-experiments E14' });
  ocm.METADATA = Object.assign(new O.MetadataT(), { OBJECT_NAME: objectName, INTERNATIONAL_DESIGNATOR: objectId, TIME_SYSTEM: 'UTC', START_TIME: states[0].epoch, STOP_TIME: states.at(-1).epoch });
  ocm.STATE_VECTOR_SIZE = 6;
  ocm.STATE_DATA = states.flatMap((s) => s.state.map((x) => x / 1000));
  ocm.STATE_EPOCHS = states.map((s) => s.epoch);
  ocm.COVARIANCE_DATA = covariances.flatMap((c) => c.map((x) => x / 1e6));
  ocm.CENTER_NAME = 'EARTH';
  ocm.TRAJ_REF_FRAME = Object.assign(new O.RFMT(), { NAME: frame });
  const rsw = new O.OrbitFrameWrapperT();
  rsw.frame = O.OrbitFrame.RSW_INERTIAL;
  ocm.COV_REF_FRAME = Object.assign(new O.RFMT(), { NAME: 'RSW', REFERENCE_FRAME_TYPE: O.RFMUnion.OrbitFrameWrapper, REFERENCE_FRAME: rsw });
  ocm.COV_CALIBRATION = calibration.status === 'Calibrated' ? O.covarianceCalibration.Calibrated : O.covarianceCalibration.Uncalibrated;
  ocm.COV_CALIBRATION_REFERENCE = calibration.reference ?? '';
  ocm.USER_DEFINED_PARAMETERS = extra.map((x) => Object.assign(new O.UserDefinedParametersT(), { PARAM_NAME: x.name, PARAM_VALUE: String(x.value) }));
  const b = new flatbuffers.Builder(1 << 16);
  O.OCM.finishSizePrefixedOCMBuffer(b, ocm.pack(b));
  return Buffer.from(b.asUint8Array());
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const selection = read('results/e14/selection.json');
  const test = (rel) => (fs.existsSync(path.join(repoRoot, rel)) ? read(rel) : null);
  const out = path.join(repoRoot, 'results/e14/models');
  // S3 in gp-error-model's form, factors folded in; labels from the test window.
  const s3 = read(selection.sources.S3.models.file).candidates[selection.sources.S3.candidate];
  const s3test = test('results/e14/test/s3-realism.json')?.candidates?.[selection.sources.S3.candidate]?.primary ?? null;
  const factor = (g, a) => s3.factors?.find((f) => f.regimeIndex === g && f.ageIndex === a)?.factor ?? 1;
  const horizonOfAge = (a) => String(config.horizonsDays[a]);
  const model = { kind: 'gp-error-model', version: 1, mode: 'reference', calibrationVersion: selection.sources.S3.calibrationVersion,
    regimes: config.regimes, ageBinsDays: config.s3AgeBinsDays,
    basis: `${s3.basis}; E14 ${selection.sources.S3.candidate}, frozen ${selection.sources.S3.calibrationVersion}`,
    strata: s3.strata.filter((s) => s.n >= config.s3.minimumBinSamples).map((s) => ({ regimeIndex: s.regimeIndex, regime: s.regime, ageIndex: s.ageIndex, n: s.n,
      covariance: s.covariance.map((x) => x * factor(s.regimeIndex, s.ageIndex)) })) };
  const calibration = { kind: 'gp-error-model-calibration', version: 1, calibrationVersion: selection.sources.S3.calibrationVersion,
    rule: 'CALIBRATED only where the E14 test cell (regime x horizon) was REALISTIC: mean d^2/3 in [0.8, 1.25] and 95 % coverage in [0.93, 0.97] with at least 30 samples from 3 objects',
    strata: model.strata.map((s) => {
      const cell = s3test?.[s.regime]?.[horizonOfAge(s.ageIndex)];
      const ok = cell?.decision === 'REALISTIC';
      return { regimeIndex: s.regimeIndex, ageIndex: s.ageIndex, label: ok ? 'CALIBRATED' : 'UNCALIBRATED',
        reference: ok ? `orbit-accuracy-experiments E14 test ${config.windows.test.join('..')}: ${s.regime} ${horizonOfAge(s.ageIndex)} d, mean d2/3 ${cell.meanD2Over3.estimate.toFixed(3)}, 95 % coverage ${cell.coverage95.estimate.toFixed(3)} (${cell.n} samples, ${cell.objects} objects)` : (cell ? `test cell ${cell.decision}` : 'no test cell') };
    }) };
  writeJson(path.join(out, 's3-gp-error-model.json'), model);
  writeJson(path.join(out, 's3-calibration.json'), calibration);
  console.log(`wrote results/e14/models/s3-gp-error-model.json and s3-calibration.json (${calibration.strata.filter((s) => s.label === 'CALIBRATED').length} of ${calibration.strata.length} strata CALIBRATED)`);
}
