// End-to-end check of the all-SupGP OMM pass (experiments/supgp-omm): the pass's own known answers, through the
// real gp-error-model artifact, on python-sgp4 / pyerfa / scipy reference values. Skipped, visibly, when the
// fitter checkout (branch task/omm-fit-20261010) is absent; a skip is not a pass.
//
//   SDN_FIT_MODULES=<modules checkout with analysis/gp-error-model 0.2.0> npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PATHS } from '../experiments/supgp-omm/config.mjs';
import { loadFitter } from '../experiments/supgp-omm/lib/modules.mjs';
import { knownAnswers } from '../experiments/supgp-omm/known-answer.mjs';

const root = process.env.SDN_FIT_MODULES ?? PATHS.fitModules;
const fixture = path.join(root, 'analysis/gp-error-model/tests/fit-reference.json');

test('the pass recovers known elements, refuses the wrong set and scores NASA ISS / CelesTrak ISS-E as python-sgp4 does', { skip: !fs.existsSync(fixture) && `absent: ${fixture}` }, async (t) => {
  const fitter = await loadFitter(root);
  t.after(() => fitter.destroy());
  const report = await knownAnswers(fitter, { fitModules: root });
  assert.ok(report.length >= 16, `${report.length} known-answer checks`);
  assert.ok(report.every((r) => r.ok !== false), JSON.stringify(report.filter((r) => r.ok === false)));
});
