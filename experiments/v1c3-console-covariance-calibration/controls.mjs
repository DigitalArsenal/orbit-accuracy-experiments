// E2E numerical controls use actual archived training inputs and the exact experiment artifact.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { normalizeParityFixture, runParityHarness } from 'space-data-module-sdk/testing';
import { call, apply, pair, groups, stateRecord } from './calibration.mjs';
import { readArcs } from './evaluate.mjs';
import { validMatrix } from '../v1c2-console-covariance-realism/modules.mjs';
import { sha256 } from '../../harness/modules.mjs';

export async function controls({ runDir, modules, gp, codec, selection }) {
  const arcs = readArcs(path.join(runDir, 'train-ffm.jsonl'));
  const cases = [];
  let maxIdentityRelative = 0, maxSumScoreRelative = 0, maxZeroTimeRelative = 0;
  for (const a of arcs) {
    maxZeroTimeRelative = Math.max(maxZeroTimeRelative, a.zeroTimeCovarianceRelative ?? 0);
    for (const s of a.samples ?? []) for (const term of s.terms) validMatrix(term, 1e-10);
  }
  for (const group of groups) {
    const arc = arcs.find(a => a.group === group && a.samples?.some(s => s.terms.length)), sample = arc.samples.find(s => s.terms.length);
    const identity = { ...selection.models[selection.selected].model, strata: [{ regime: group, horizonDays: [0, 4], factor: 1 }] };
    const applied = await apply(gp, codec, identity, group, sample.hours, sample.state, sample.terms);
    for (let i = 0; i < applied.length; i++) maxIdentityRelative = Math.max(maxIdentityRelative,
      Math.max(...applied[i].map((v, k) => Math.abs(v - sample.terms[i][k]))) / Math.max(...sample.terms[i].map(Math.abs)));
    const pairs = { axesFrom: 'truth', pairs: [{ id: 'transported-sum',
      predicted: { ...stateRecord(sample.state), covarianceAxes: 'INERTIAL', covarianceTerms: [...sample.terms, ...sample.terms].reverse().map(covariance => ({ weight: .5, covariance })) },
      truth: stateRecord(sample.truth) }] };
    const response = await call(gp, codec, 'pair_statistics', [codec.frame('pairs', 'pairs', pairs)]);
    const score = response.pairs[0].d2Predicted;
    maxSumScoreRelative = Math.max(maxSumScoreRelative, Math.abs(score - sample.score.d2Predicted) / Math.max(1, Math.abs(sample.score.d2Predicted)));
    const request = { methodId: 'pair_statistics', inputs: [codec.frame('pairs', 'pairs', pairs)] };
    cases.push({ id: `transport-sum-${group}`, request });
    cases.push({ id: `identity-${group}`, request: { methodId: 'calibrate_covariance', inputs: [codec.frame('model', 'model', identity), codec.frame('objects', 'objects', {
      objects: sample.terms.map((covariance, i) => ({ id: String(i), regime: group, horizonDays: sample.hours / 24, covarianceAxes: 'INERTIAL', covariance, state: stateRecord(sample.state) })) })] } });
  }
  // Native/browser comparison includes the actual training-only scalar, coverage and axis fits.
  const train = readArcs(path.join(runDir, 'train-sgp.jsonl'));
  const rows = train.flatMap(a => (a.samples ?? []).filter(s => s.hours === 1 && s.bases.F.fit).map(s => ({ stratum: a.group, object: a.norad,
    error: s.bases.F.fit.errorRtn, covariance: s.bases.F.fit.predictedRtn })));
  for (const method of ['scalar-mle', 'coverage', 'axes-mle']) cases.push({ id: method, request: { methodId: 'fit_calibration', inputs: [codec.frame('samples', 'calibration', { samples: rows }),
    codec.frame('options', 'calibration', { method, coverage: .95, minimumSamples: 30, minimumObjects: 3 })] } });
  assert(maxIdentityRelative <= 1e-10); assert(maxSumScoreRelative <= 1e-8); assert(maxZeroTimeRelative <= 1e-8);
  const plan = await normalizeParityFixture({ name: 'V1c3 recorded-training covariance E2E', cases: cases.map(c => ({ ...c, request: { ...c.request,
    inputs: c.request.inputs.map(({ payload, ...f }) => ({ ...f, payloadHex: Buffer.from(payload).toString('hex') })) } })) });
  const parity = await runParityHarness({ wasmPath: path.join(modules, 'analysis/gp-error-model/dist/isomorphic/module.wasm'), plan,
    lanes: ['browser', 'wasmedge'], surface: 'direct', timeoutMs: 120000,
    chromeBinary: process.env.SDM_CHROME_BINARY ?? path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    wasmedgeBinary: path.join(os.homedir(), '.wasmedge/bin/wasmedge'), log: console.log });
  fs.writeFileSync(path.join(runDir, 'runtime-parity-local.json'), JSON.stringify(parity, null, 2) + '\n');
  assert(parity.ok, JSON.stringify(parity.failures));
  const result = { maxIdentityRelative, maxSumScoreRelative, maxZeroTimeRelative, gpErrorModel: { ok: parity.ok, sha256: parity.moduleSha256,
    cases: cases.map(c => c.id), lanes: parity.lanes, comparisons: parity.comparisons },
    rawParitySha256: sha256(fs.readFileSync(path.join(runDir, 'runtime-parity-local.json'))),
    docker: 'WAIVED by owner 2026-10-22', ffmNative: 'Known frozen artifact AOT defect; owned by ffm-memory-measured-sizing-20261022' };
  fs.writeFileSync(path.join(runDir, 'controls.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
