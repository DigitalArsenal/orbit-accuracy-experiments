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
import { pathToFileURL } from 'node:url';
import { repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
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
  // The CA screen's uncertainty_model frame (CAU1) from those two, by analysis/conjunction-assessment's own writer.
  const modules = modulesRoot({ flag: process.env.SDN_MODULES_ROOT, configured: config.inputs.modules, repoRoot });
  const { uncertaintyModelFrame } = await import(pathToFileURL(path.join(modules, 'analysis/conjunction-assessment/scripts/uncertainty-model.mjs')).href);
  const frame = uncertaintyModelFrame(model, calibration, `E14 ${selection.sources.S3.calibrationVersion}`);
  fs.writeFileSync(path.join(out, 's3.cau1'), frame);
  console.log(`wrote results/e14/models/s3.cau1 (${frame.length} bytes, SHA-256 ${sha256(frame)})`);

  // S2: the chosen candidate's terms (P0 by regime from s2-p0.json; q, consider and DCP as fitted), with test statuses.
  const s2sel = selection.sources.S2, s2models = read(s2sel.models.file), p0 = read(s2sel.p0.file);
  const s2test = test('results/e14/test/s2-realism.json')?.candidates?.[s2sel.candidate]?.primary ?? null;
  const status = (t, regime, h) => { const c = t?.[regime]?.[h]; return c ? { decision: c.decision, meanD2Over3: c.meanD2Over3?.estimate ?? null, coverage95: c.coverage95?.estimate ?? null, n: c.n, objects: c.objects } : null; };
  writeJson(path.join(out, 's2-terms.json'), { kind: 'e14-s2-terms', candidate: s2sel.candidate, calibrationVersion: s2sel.calibrationVersion,
    product: 'analysis/epoch-state GCRF state at an element set\'s epoch, propagated by propagator/ffm (config.s2.forces) with P0, the parameter\'s consider term and white-acceleration noise as the candidate names',
    p0: p0.candidates['S3-T'].strata.map((s) => ({ regime: s.regime, covarianceRtnKm: s.covariance, n: s.n })),
    processNoiseM2S3: s2models.candidates[s2sel.candidate]?.q ?? {},
    terms: { 'S2-P0': ['A0 = Phi P0 Phi^T'], 'S2-Q': ['A0', 'sum_k q_k U_k'], 'S2-QC': ['A0', 'consider (sigma ln parameter)', 'Q'], 'S2-QCD': ['S2-QC', 'DCP (S4)'] }[s2sel.candidate.split(':')[0]],
    test: Object.fromEntries(config.regimes.map((r) => [r.id, Object.fromEntries(config.horizonsDays.map((h) => [String(h), status(s2test, r.id, String(h))]))])) });
  // S4: the lead covariance with the chosen shrinkage applied, and the test summaries.
  const dcp = read(selection.sources.S4.models.file), shrink = selection.sources.S4.shrinkage;
  writeJson(path.join(out, 's4-dcp.json'), { kind: 'e14-open-dcp', calibrationVersion: selection.sources.S4.calibrationVersion, shrinkage: shrink, leadDays: dcp.leadDays,
    basis: dcp.basis, classes: dcp.classes, fittedOn: dcp.fittedOn,
    strata: dcp.strata.map((st) => ({ altitudeKm: st.altitudeKm, class: st.class, n: st.n, leadCovariance: st.secondMoment.map((row, i) => row.map((v, j) => (i === j ? v : (1 - shrink) * v))) })),
    test: { density: test('results/e14/test/s4-density.json')?.leads ?? null, leadCovariance: test('results/e14/test/s4-dcp-summary.json') ? 'results/e14/test/s4-dcp-summary.json' : null } });
  // S1: the factor tables, once S1 is chosen.
  if (selection.sources.S1) writeJson(path.join(out, 's1-factors.json'), { ...read(selection.sources.S1.models.file), choice: selection.sources.S1 });
  console.log('wrote results/e14/models/s2-terms.json, s4-dcp.json' + (selection.sources.S1 ? ', s1-factors.json' : ''));
}
